# Surface Cal Results Summary — through 9/1/26 AM
*(bench trio: '8549, '4423, '3063 — 3/4" copper M, ST 17044 + TI v361; supplement to ntep-accuracy-handoff.md)*

## 1. Initial calibration (8/29, walk commits — all OTA, no mags)
| Meter | Committed cell (gain/env) | Walk time |
|---|---|---|
| '8549 | g29 / e30 | ~3 min |
| '4423 | g24 / e50 | ~3 min |
| '3063 | g33 / e40 | 2m38s |

All three self-parked inside the selection envelope (g23–38 × e30–50).

## 2. Accuracy on committed cals
- **5.0 gpm, 50.0 gal marked tank (8/29):** −1.0% / +0.8% / +0.4%. Spread 1.8 pp. Zero data defects.
- **0.5 gpm, ~64 min, 30.0 gal tank (8/29 eve):** main-run totals 31.14 / 31.82 / 29.60 gal → +3.8% / +6.1% / −1.3% (reference-coverage caveat: a ~1.6–1.9 gal pre-squirt may or may not be inside the tank mark). NOTE: '3063 ran this test on a re-parked cell (g26/e40), not its committed g33/e40.
- **Sunday 8/30 runs (4 events, ~64 gal):** '8549 and '4423 registers agree to 0.02 gal. '3063 read −11% on the 12:56 event (20.46 vs 23.0/23.2) — while in its churn state.

## 3. Stability audit (Sat 8/29 eve → Tue 9/1 08:00)
- **'4423: rock solid.** g24/e50 unchanged, reacqCnt = 1 the whole weekend.
- **'8549: ~21 re-parks** (reacqCnt 18→39), cell wandering the whole envelope (g23–g38, e30–e50).
- **'3063: ~2 re-parks Sat + storm Monday** (reacqCnt →39), same wandering.
- Re-parks cluster at night/early morning → thermally-driven map breathing. The re-park mechanism "succeeds" each time (finds a quiet cell), so no failedCal, no chronic re-walk — the units just wander indefinitely.
- **Verdict: the NTEP session's instability claim is CONFIRMED for 2 of 3 units.** Accuracy spread grows in the churn state (see the −11% event above).

## 4. The Monday phantom — new failure mode (CRITICAL)
- **'3063 booked 213.6 gal in ~87 s at a median 143.98 gpm** (Mon 8/31 ~13:16, mid re-park storm). Register now carries that fiction (bench unit, non-truth register).
- Mechanism: re-park hop → correlator re-locked **one lobe over** (500 ns ≈ 144 gpm-equivalent on this tube). Values were live and varying — not frozen — so every 17043 defense correctly stayed silent (they hunt bit-identical fossils, stalls, and stale markers; nothing checks physical possibility).
- The v357 DTHRES fix held the jump for 3 aggregates then adopted it, per its design ("a sustained shift is reality"). Root gap: persistence cannot distinguish a new lobe from a new flow — only **magnitude** can (144 gpm is impossible through 3/4").
- A wrong-lobe lock is **stable-wrong**: low errors, low sd, elevated tofNorm indefinitely. Error-rate-based acceptance cannot see it.
- Fleet exposure: **zero** (nothing below v359 re-parks), but this is a hard **blocker on any surface-cal fleet roll**.

## 5. Design gaps identified (all confirmed in source)
1. Walk magnitude gate is 100 ns (~29 gpm) — a +10 ns biased lock scores as clean.
2. No cross-cell level comparison — selection rewards quiet, not true.
3. Re-park acceptance ("STAY on success") judges by error rate only — never looks at tofNorm level, continuity, or sd.
4. No physical-plausibility ceiling anywhere on either processor.

## 6. Fix plan (TI v362 + ST 17046 — spec in progress, not yet built)
- **Selection (walk/survey):** record per-cell tofNorm LEVEL (currently discarded); commit only inside the largest clean **plateau** — cells within ±Δ of region median level (Δ to be read off the next survey; level uniformity is flow-proof since real dtof is gain/env-invariant). Absolute level bound (~±10 ns) at no-flow boot/mag cal.
- **Acceptance (any lock change):** post-change tofNorm must pass level plausibility (< ~70 k ps ≈ 20 gpm), continuity vs pre-change (within ~28 ns/s slew physics), and sd-in-spec before a cell earns STAY. Fail → dirty the cell, retry/re-init.
- **Adoption:** DTHRES 3-agg adoption restricted to the physically possible band; out-of-band sustained shifts NEVER adopt — they trigger USS re-init (the known cure), escalating to re-park; counted as lobeFailCnt.
- **ST belt (17046):** maxFlowRate attr (~30 gpm for 3/4"), ingress samples above it rejected + counted, independent of TI version.
- **Policy:** no re-park while an event is open; consider restore-commit over STAY to end indefinite wandering.

## 7. Immediate cautions for accuracy testing
- Before ANY accuracy run, read gain/env and confirm the unit is on its committed cell and hasn't re-parked mid-series; log gain/env with every run.
- Treat any single-event total implying > ~20 gpm as instrument failure, not water.
- Do not use '3063's register for cumulative reconciliation (carries +213.6 gal phantom).
- Do not roll surface cal (v359+) beyond the bench trio until v362 acceptance criteria are in and validated.
