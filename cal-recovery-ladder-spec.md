# Spec — post-cal signal-loss recovery ladder (v355+)

Draft 2026-08-26. **Awaiting Bruce's approval before any code is written.**
Origin: root cause found on the 8/26 17:31 priming draw — see `copper-m-flow-handoff.md`.

## Problem (measured, not theorised)

Three meters on one bench, one valve, one flow, started together at 7.3 gpm. They stopped at
three different times, **ordered by how far `env` had walked above committed**:

| meter | env | committed | clean flow before dropout | gal captured |
|---|---|---|---|---|
| '549 | 35 | 35 | 42 s | 5.766 |
| '063 | 37 | 35 | 33 s | 4.722 |
| '423 | 42 | 35 | **9 s** | **1.694** |

Identical dropout signature on all three (dip → partial recovery → collapse), at three different
times ⇒ meter-internal, not hydraulic. Water kept flowing; the meters stopped counting.
**This is silent under-registration with no alarm** — `qual` read 100 on '063 and 0 on '423 while
both dropped out; `tofRejectCnt` stayed 0 throughout.

Mechanism (cal.c): the walker steps env **up** after 4 crossing errors (cal.c:2345-2354), decays
**one step per 60 clean aggregates** (`CAL_WALK_DECAY_AGGS`), and **any** error resets the streak —
including `err_floor`, which cannot push env up. env is a ratio of envelope peak (v352), so higher
env = threshold nearer the peak = more fragile. Net: walked-up env → dropouts → errors → streak
reset → env stays up. Positive feedback with a 15× asymmetric escape, and **the walker is not gated
on flow** — v349 deferred *recals* to quiet water but left the walker free-running.

## Objective

Eliminate silent under-registration from post-cal signal loss by (a) bounding and observing the
walker, (b) holding a bounded, separately-accounted estimate while the signal is bad, and
(c) recovering the operating point by directed search — amplitude (scale) before env (shape).

## Scope

**IN**
- `Dune_FW_TI/dune/cal.c` — walker bounds/gating, recovery ladder
- `Dune_FW_TI/dune/info.c`, `dune/dune.h` — cal-state telemetry block
- `DuneFW_L5_2-eprod-led` — surface new TI fields; a `heldGal` key if Phase 2 lands

**OUT** — Lf / k(Re) correction; flowDirection hardening; the ST event machine; anything touching
`meterVal` accumulation semantics beyond adding a separate held-volume counter.

## Phased build — each phase independently testable and shippable

### Phase 1 — observability + bound the walker  (LOW RISK, would alone have prevented 8/26)
1. **Export the cal-state block.** Highest value: `g_best_env` (cal.c:378) is a static and never
   leaves the device, so `env − g_best_env` — the quantity that predicts under-registration —
   cannot be computed fleet-wide. Add: `g_best_env`, `envLo`/`envHi` (see 2), `tofFailCnt`,
   `gCleanStreak`, `measSinceError`, **`err_cross` and `err_floor` counters separately** (currently
   indistinguishable), `gEnvCycleCount`, `gRecalPending`, `gCalUnstable`.
2. **Retain the measured good-env run.** v353 (cal.c:1660-1704) computes the longest contiguous run
   of good env columns and keeps only its centre; the extent is discarded. Keep `envLo`/`envHi`.
3. **Clamp the walker to [envLo, envHi]** instead of the absolute ceiling of 50. Per-device and
   evidence-based rather than a guessed constant.
4. **`err_floor` must not reset `gCleanStreak`** (cal.c:2332). An error class that cannot push env
   up must not block it coming down.
5. **Freeze env stepping while flow is present.** Same discipline v349 gave recals. `dtof_ps` is
   already an argument, so the test is local.

### Phase 2 — bounded hold  (MEDIUM RISK — this rung can fabricate water)
Hold the last good tnorm as an estimate when the signal is lost, so a dropout becomes a bounded
estimate instead of zero.

**Entry gate — must distinguish signal loss from a real valve close.** 8/26 gives the discriminator:
```
real closure   18553 → 6366 → −33                       MONOTONIC ramp
signal loss     7.28 → 4.93 → 3.84 → 3.74 → 6.46 → 6.42 → 0.13 → 0    NON-monotonic, partial recovery
```
Require **non-monotonic collapse AND envelope still present** (`upamp` healthy = water still in the
pipe). Monotonic decay with a collapsing envelope must NOT hold.

**Guards (all mandatory):**
- Cap by time AND volume: hold ≤ T s and ≤ V gal.
- **Held volume accounted separately** (`heldGal`, alongside `revGal`) — never silently folded into
  `meterVal`. Billing must see estimated vs measured; NTEP will ask. (Precedent: w30 dark-span fills
  had to be capped at register delta to stop billing fabricated water.)
- Decay the held rate rather than holding flat — confidence at 10 s is far below 1 s.

### Phase 3 — directed recovery search  (amplitude first, then env)
- **Gain spiral ±1, ±2, ±3 … to the measured healthy bound**, target within **±20% of committed
  amplitude**. Distinct from v352's steady-state hold (±25% deadband, one code per capture): that
  slow behaviour is right for drift, too slow for recovery. Same mechanism, two modes.
- **Then env spiral ±1, ±2, ±3 … bounded by [envLo, envHi].** A spiral is *directed by measurement*
  — which is exactly what the current blind ratchet lacks.
- Exhaustion → `gFailedCal` + pending recal, deferred to quiet water per v349; the Phase-2 hold
  covers the gap.
- **Ordering is load-bearing:** env is a ratio of envelope peak, so fixing shape before scale
  evaluates the ratio against a wrong peak.

## Constraints
- **Spiral results are PROVISIONAL, never committed.** Revert to `g_best_env` / `g_best_gain` at
  event end unless a quiet-water recal confirms. Without this a mid-flow spiral becomes the new
  commit — re-entering the flow-contaminated-commit bug v349 just fixed.
- No new magic constants where a measured bound exists.
- Must not regress v352 steady-state amp hold.
- MSP430 — memory and cycles are tight; telemetry block should be a handful of u8/u16.
- Recovery exit criterion: N consecutive clean aggregates, N small (3–5) — deliberately unlike the
  60 used for decay.

## Success criteria
1. **Primary:** with env deliberately walked high, a 50-gal run at 5 gpm shows all three units
   capturing the same duration within ±2 s on one valve. Today: 9 s vs 33 s vs 42 s.
2. `env` never leaves `[envLo, envHi]`.
3. `g_best_env` unchanged across any event (no mid-flow commits).
4. Phase 2: `heldGal` non-zero only on genuine signal loss; zero on a normal valve close.
5. Regression: a clean run on unwalked units is unchanged vs v354 (trio ≈ −0.6% at 5 gpm).

## Risks
| risk | mitigation |
|---|---|
| **Fabricating water** (Phase 2) | non-monotonic + envelope gate; time AND volume caps; separate accounting; rate decay |
| Spiral oscillation | hysteresis; provisional-only; bounded step count |
| Recovery search perturbs the measurement it is fixing | Phase-2 hold covers the search window |
| Mid-flow commit regression | provisional-only rule, verified by success criterion 3 |
| **Two sessions editing `cal.c`** | cal-function session owns the file — coordinate before writing |

## Open questions for the grid data
- When a unit fails at env 42, **would stepping down have worked?** (Exporting `envLo`/`envHi`
  answers whether down is even an option.)
- **How often is the fault scale vs shape?** If amp-first resolves most cases, Phase 3's env spiral
  rarely runs and can stay conservative.

## Verification plan
1. Bench, unwalked baseline: 50 gal @ 5 gpm on all three → confirm ≈ −0.6% trio (no regression).
2. Force env high on one unit, repeat → Phase 1 should prevent the walk; without Phase 2 expect
   a dropout still, but now visible in telemetry.
3. Phase 2: repeat forced-walk run → dropout covered, `heldGal` non-zero and bounded.
4. Control: normal valve close → `heldGal` must be **zero** (proves the entry gate).
5. Re-run 0.5 gpm to confirm no low-flow regression.

## Repo state at spec time
`Dune_FW_TI` on branch `cal-spec`, tag `v354`, working tree clean.
