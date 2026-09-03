# TI v362 + ST 17046 — Lock Integrity Spec
*(9/1/26 — designed with Bruce from the weekend churn audit + '3063 213-gal phantom. Decisions locked: restore-with-strikes; TI ceiling 30 gpm-eq / ST belt 40 gpm; plateau Δ ±3 ns default, test-tuned.)*

## Problem statement
The surface cal (v359–v361) selects and re-parks by error-rate quietness. A wrong-lobe
lock is quiet — stable-wrong: low errors, low sd, tofNorm elevated by an exact lobe
quantum. Weekend evidence: 2 of 3 bench units re-parked ~39 times in 3 days
(thermally-driven), drifting to the envelope wall; '3063 booked 213.6 gal in ~87 s at
143.98 gpm (= one 500 ns lobe) mid re-park storm. Every 17043 defense correctly
stayed silent (they hunt frozen values; these were live). The v357 DTHRES fix adopted
the shift after 3 aggs by design ("a sustained shift is reality") — persistence
cannot distinguish a new lobe from a new flow; only MAGNITUDE and CONTINUITY can.

## Physics constants (all bench-measured 8/29)
- dtof slope ~3.47 ns/gpm (3/4" M); max legit slew ~28 ns/s; hydraulic settle 2–4 s
- max inter-raw (200 ms) real change ≤ ~5.6 ns
- lobe quanta: half 250 ns / full 500 ns / double 1000 ns (bands 350–650 k, 850–1150 k ps)
- correct-lock cell agreement ≲1 ns; Gen1-class bias locks ~10 ns
- steady single-cell sd 37–538 ps

## TI v362 (cal-reacq)

### A. Physics ceiling — TNORM_FAIL
- Ceiling in ps, default ~104 k (30 gpm-eq 3/4"); ST-pushable via user param
  (u8, units of 1024 ps; 0 = default).
- |dtof| > ceiling ⇒ classified ERROR: excluded from aggregates/metering, never
  adopted into last_good_d, feeds reacq error budget.
- ~10 consecutive over-ceiling ⇒ failed lock: forced USS re-init at current cell
  (the known cure). 2 failed re-inits ⇒ re-park path. Cap the escalation (no
  infinite re-init loop): after cap, set InfoFailedCal-style alarm state rather
  than silence. Counter: lobeFailCnt.

### B. Never-adopt out-of-band
- DTHRES 3-agg adoption (v357) applies ONLY to values under the ceiling.
  Out-of-band sustained shifts never re-seat last_good_d.

### C. Lead-edge transient handling (category 3, minimal + unwrap)
- Slew gate: |dtof slew| > ~40 ns/s opens a ~4 s transient window.
- In-window: errors quarantined from the reacq flee budget (metering continues).
- Skip unwrap (in-window only): inter-raw jump ≥ ~150 ns ⇒ physically impossible
  ⇒ subtract N × 500 ns to land within continuity budget of predicted trajectory;
  corrected sample is metered. skipCompCnt counter. Offset persisting past the
  window ⇒ NOT compensation — failed lock ⇒ re-init escalation (A).

### D. Lock-change acceptance (any hop: re-park, re-init, restore, commit apply)
Post-change settle, then all three must pass before the cell earns STAY/commit:
1. Level: |tofNorm| under ceiling
2. Continuity: within slew budget of pre-change tofNorm (real dtof is
   gain/env-invariant; water doesn't teleport)
3. Stability: sd in spec over the settle window
Fail ⇒ cell dirtied with SCF_BIAS (new flag, distinct from SCF_ERR), try next.

### E. Restore-with-strikes (replaces STAY)
- After a re-park episode resolves, hop back to the committed home cell
  (acceptance-gated per D).
- Same home fails 3 restores within a rolling window ⇒ home is dead ⇒ trigger
  re-walk via existing chronic path (gRecalPending) — re-derive commit through
  full selection, never adopt a random cell as home.
- No re-park while flow is active (|tofNorm| above event-level threshold):
  defer the hop until flow stops; re-init (in-place cure) still allowed.

### F. Level channel + plateau selection
- Per-cell mean tofNorm recorded during walk for ENVELOPE cells (55 × int16,
  ~110 B RAM — full-grid level lives in the ST survey instead).
- Valid region = clean ∧ within ±Δ of region median level. Δ default 3000 ps
  (attr/param-overridable). Walk-time flow drift widening: if levels trend
  monotonically in scan order (real flow change), widen Δ rather than shred
  the region.
- Commit = interior max-margin of the plateau; re-park pool = plateau only.

### G. Commit record
At commit, emit one packet: clean_n, winning region size, region gain min/max,
region env min/max, committed sd, calLvlMed (median level), calLvlSpread
(max−min after plateau exclusion), bails. ST → status keys.

## ST 17046 (stuck-event-fix)
1. maxFlowRate attr (default 40 gpm, clamp 1–100): computed flow above it ⇒
   sample rejected from register/event accumulation, still visible in telemetry;
   maxFlowRejCnt (status). Independent belt — protects any TI version.
2. Survey level channel: per-cell mean tofNorm added to sv map export.
3. Commit-record consumption ⇒ status keys (calCleanN, calRegSz, calGainLo/Hi,
   calEnvLo/Hi, calLvlMed, calLvlSpread, calBails).
4. Push TI ceiling param derived from maxFlowRate × meter-type slope ÷ (4/3)
   (TI ceiling = 30 when ST belt = 40), with the user-override params.

## Acceptance tests (bench trio)
1. Mag → walk commits with level channel; commit record lands in TB; plateau
   spread ≲ few hundred ps at no-flow.
2. Repeatability: 3 mags/unit, cell within ±1, calLvlMed/Spread consistent.
3. Churn watch ≥24 h: re-parks now restore home (reacqCnt may advance; gain/env
   returns to committed cell); no envelope-wall drift.
4. Phantom regression: no event may register implied flow > 30 gpm; deliberate
   config-push storm on one unit while watching for over-ceiling adoption.
5. Valve-edge runs (0→5 gpm steps): skipCompCnt > 0 allowed in-window,
   register accuracy at edges same-or-better vs 8/29 baselines, no reacq flees
   triggered by edges.
6. Accuracy re-cert: 50 gal @ 5 gpm and 20 gal @ 0.5 gpm within 8/29 bands.

## Non-goals this push
Save-gap register fix, radio blackout buffering, fleet rolls (blocked until this
validates), full-grid TI map export (survey covers it).
