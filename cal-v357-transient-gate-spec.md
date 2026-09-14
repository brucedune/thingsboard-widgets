# v358 Transient Gate + Patch Spec (TI runtime) — DRAFT for cal session

NOTE 8/29 EOD: v357 number was consumed by the DTHRES latch fix (shipped, kill-
confirmed). The transient gate is now v358. RE-DERIVE before building: spiral
successes pre-v357 were partly accidental latch cures (see ledger 8/29) — measure
edge-error behavior on v357 first; self-heal may deserve reinstating now that
waiting can work.

Date: 2026-08-29. Owner: Bruce + cal session. Source data: cal-diag-findings-0827.md
(8/29 edge-experiment sections). Status: SPEC — not built. Trio validation protocol:
matched 4-run A/B series vs 17042/356 per established bench procedure.

## The three-category program (agreed 8/29)

1. **Faux stuck events** — ST-side state-machine hole, fleet-critical → ST 17043 (separate spec section below).
2. **3-D surface-mapping cal** — survey-based region selection → 17902 instrument productization, then selection algo (separate track).
3. **Lead-edge transient filter (this spec)** — TI v357 runtime gate ahead of the reacq ladder.

## Measured constants (8/29 bench, '3063, 6 pulses, 3/4" M)

| Quantity | Value |
|---|---|
| dtof vs flow scaling | 3.4–3.6 ns per gpm, linear 0→7.5 gpm |
| Max legitimate flow slew (full-scale valve snap) | ~28 ns/s (23.3 and 27.6 ns/s observed) |
| Hydraulic settling after snap | 2–4 s |
| Steady dtof noise (sd) | 37 ps @ 0 gpm → 538 ps @ 7.5 gpm |
| Cycle-skip signature | single-side step, 350–650 ns (1 cycle) or 850–1150 ns (2 cycles), instantaneous |
| Separation margin (max flow slew vs min skip) | 18–20× |

Note: thresholds MUST be defined on per-side raw TOF deltas (tofUp/tofDn), NOT on
tofNorm — tofNorm normalization proved cal-generation-dependent (pre/post-mag scale
mismatch observed 8/29).

## Channel decomposition (per aggregate, ~1 Hz)

- dUp = tofUp[n] − tofUp[n−1]; dDn = tofDn[n] − tofDn[n−1]
- Differential f = dUp − dDn (flow moves sides oppositely, symmetric)
- Common c = (dUp + dDn)/2 (temperature moves sides together, slow)
- Median-of-3 filter on f and c for TRANSIENT classification (sustained motion);
  skip classification allowed to fire on a single delta.

## Classifier (priority order, at err_cross / on every agg while armed)

1. **SKIP**: one side steps in a skip band, other side quiet → acquisition problem.
   Reject sample. Ladder-eligible, but SKIP SELF-HEAL (see below).
2. **FLOW TRANSIENT**: anti-symmetric motion, |f| ≤ FLOW_SLEW_MAX (default 50 ns/s
   ≈ 2× worst measured legitimate edge) sustained ≥2 aggs → water accelerating.
   BLANK all adjustments (no walker, no spiral, no recal): hold ≤ TRANSIENT_PATIENCE
   (default 10 s), bridge rate via existing ST hold. This is billable water.
3. **THERMAL**: tandem slow drift → normal tnorm tracking, no action.
4. **CHAOS**: both sides noisy + upamp sag → aeration/turbulence. Hold with patience;
   escalate to ladder only if persists past TRANSIENT_PATIENCE.

Escalation: patience expired + errors persist → not a transient → ladder.

## Ladder changes (evidence-driven)

- **Delete self-heal as attempt 1** for ACQUISITION LOSS class: reacqSelfOk = 0 across
  every episode ever recorded; go straight to spiral. (Transient class gets its own
  patience instead — that's where "waiting" actually works.)
- Spurious-spiral-credit hypothesis on record: spiral "wins" may be transient decay
  (2–4 s settling matches attempt-2 timing). The gate removes transients from the
  ladder's diet, so post-v357 reacqSpiralOk counts become interpretable.
- Carry the existing v357 patch list from cal-diag-findings-0827.md: event-end (not
  episode-end) revert + reacqOkEnv export; rate-based success criterion; rate-triggered
  widest-gap recentering to replace ±5 ladder (candidate); attr-tunable knobs + kill
  switch.

## Counter fixes

- errCrossCnt, errBurstMax → u16 (saturated at 255 on 8/29 within one error storm).

## Attributes (tunable, SERVER_SCOPE→shared per convention)

- transGateEnable (default on), transFlowSlewMaxNs (50), transPatienceSec (10),
  skipBandLoNs/HiNs pairs, medianWin (3).

## Validation plan

1. Bench trio A/B (4-run matched series, HIS metric) vs 17042/356.
2. Edge series replay: sharp/soft × {7.5, 2.5} gpm — expect zero adjustments during
   edges, unchanged registers vs reference, reacq counters quiet except true skips.
3. Air-purge test (next tank reset): edge series immediately after refill vs 1 h
   later — morning-8/29 error storms are hypothesized entrained-air events; the gate
   should hold through them without env churn.
4. Regression: 50-gal @ 5 gpm accuracy run, all three within ±1%.

## ST 17043 companion (category 1 — faux stuck events; fleet-critical)

ROOT CAUSE (code analysis 8/29, CONFIRMED by all 3 bench freezes — nonzero frozen
rate + live billing = mechanism #1): TI emits degenerate aggregates (frozen/zero
tofDps, live tofUp/tofDn — "TI sends all-zero frames on error" documented in
analytics.c) and ST has NO tofDps sentinel (hci.c:1348 checks only tofUPSps != -1).
Offset tracker ignores zero-dtof (analytics.c:108) so current_offset() pins;
corrected tnorm == offset constant -> flowRate = nonzero constant, bit-identical;
event-close test (measure.c:715, EVENT_FLOW_THRES 0.175) fails every sample, close
counter resets at :723, NO wall-clock cap; meter_accumulate(:721) bills phantom
every second. Session-boundary trigger: TI loop skipped during radio (main.c:242),
TI transmits into 512B ring; session-end drain flushes ring MID-FRAME without
resetting tiuartFbState (ti_hci_impl.c:325-339 / ti_bsl.c framer) + override push
perturbs TI dtof pipeline. Later session repeats perturbation -> sometimes heals.
CORRECTIONS to earlier session claims: dispatch never starved (tiAggCount increments
after measHandleUSSResults call, hci.c:1354); gatedAggs freeze = consequence of open
event (measure.c:630 !event guard), not a severed stage; noneventMode=true = just
recordNoneventFlow attr (red herring).

Fix list (order = payoff/cost):
1. Ingress sentinel at hci.c:1348: reject degenerate tofDps (implement the
   MIN_GOOD_TOF / is_marker() discernment specified in DESIGN_TI_SOURCE_OF_TRUTH.md
   §4.6, never written). Count separately from tofRejectCnt.
2. Impossible-water check in event branch (measure.c:715 block): raw float bits of
   volumeFlowRate identical for ~120 consecutive in-event samples -> force close
   (event=0 + measHandleEndEvent), stuckFlowCnt counter + DeviceStatus flag.
3. Wall-clock event cap using RTC_epoch (NOT tiTime — agg-derived, stalls through
   sessions, hci.c:1345), e.g. 2x dynamicConfig.eventTimeout.
4. Wire up dynamicConfig.endEvent (parsed bg95.c:3918, read NOWHERE) as remote
   force-close escape hatch; self-clearing.
5. Move measState==MEAS_NOT_METERING && event close (measure.c:775-780) ABOVE the
   !tiMetering early return at :502 (currently unreachable by construction).
6. procAggs heartbeat: meas.procAggs++ at BOTTOM of measHandleUSSResults; watchdog
   modeled on ti_gate_watchdog (ti_hci_impl.c:665) fires when tiAggCount advances
   >=60 while procAggs doesn't -> force close + TIW_OVERRIDES|TIW_CAL_GATE re-push;
   export procAggs beside tiAggCount in status_report.
7. Session-end drain: reset tiuartFbState when flushing USART3 ring (mid-frame
   truncation bug — likely the physical trigger).
8. radioOveruseMax shared attr, clamped 1-15 (4-bit BKUP field), default 10 —
   pending Bruce decision (fleet-safety argument for keeping it hard-coded).
Also carries: false-hold-at-boot suppression (6 instances), register-save-gap fix
candidate (task_3c22ec55; mag-reset regression demonstrated 3-for-3 on 8/29:
-74/-74/-72 gal).
Bench validation: reproduce wedge (v390 bounded session on one unit) -> 17043 must
self-heal within ~2 min and bill zero phantom; then standard 4-run series.

## 17044 addition (Bruce 8/29 Stage-3 question: "if this trips, TI is still stuck")

Stuck-flow detector = containment only (register protected; meter deaf while fossil
persists — deliberate under-reg-and-flag failure direction). ADD active TI recovery
escalation when fossil confirmed: (1) ti_write_at_trigger(TIW_OVERRIDES|TIW_CAL_GATE)
re-push immediately (free; the 11:08 spontaneous cure was this perturbation);
(2) fossil still bit-frozen ~2 min later -> TI soft reset (existing BSL machinery);
(3) -> hard reset; (4) -> recal request. Counters per rung. Converts "contained
until mag" into "self-healed <5 min". Fleet motivation: '4423 T1 terminal collapse
proves fossil-forever exists on production TI lineage.
