# Copper M flow campaign — handoff (2026-08-30, end of session 4)

Supersedes all earlier versions. All timestamps UTC. Three sessions: 08-16 eve → 08-17 03:40Z,
08-17 19:20Z → 22:40Z, 08-26 03:15Z → 04:30Z (new firmware), and 08-30 (ST 17044 / TI v361,
post-surface-cal — see SESSION 4 above, which supersedes session-3 numbers where they differ).

**Companion doc: `cal-spec-v349-354-handoff.md`** — the TI cal-function / ST metering rebuild
(v349-354, ST 17038-17040) done on the 8/25-26 bench session. Read it alongside this.

---

## SESSION 4 (2026-08-30) — ST 17044 / TI v361, post-surface-cal

**THE LOW-FLOW OVER-READ IS CONFIRMED AS PROFILE PHYSICS.** Repeat of the 0.5 gpm point on
firmware two cal generations newer reproduces the 8/26 trio mean to 0.10 pp.

### 0.5 gpm — true 20.0 gal, water 22.0 C (wetted reference), 19:15-19:58Z
Reference coverage CONFIRMED by Bruce: the 20.0 gal covers the main run ONLY. The 18-gal
6.5 gpm event at 19:01-19:10Z was line priming, drawn and excluded before the tank was set,
and was not measured against a reference.

| meter | eventMeterDelta | vs 20.0 | rate | duration |
|---|---|---|---|---|
| '3063 | 20.460 | **+2.30%** | 0.473 gpm | 2595 s |
| '4423 | 23.162 | **+15.81%** | 0.535 gpm | 2600 s |
| '8549 | 23.017 | **+15.08%** | 0.534 gpm | 2587 s |
| **trio** | **22.213** | **+11.06%** | true 0.4626 gpm | sd 7.60 pp, spread 13.51 pp |

**Data integrity: CLEAN.** `stuckFlowCnt` / `forcedEndCnt` / `procStallCnt` / `tofMarkerRejCnt` /
`tofRejectCnt` all 0; `envWalk` 0 and `calFlags2` 0 on all three (walker quiet); `tiBootCnt` = 1
stable (no mid-series reboot); durations within 13 s of each other on one valve; `qual` 100 at
end on all three. Trapezoidal integration of the `flowRate` stream reproduces `eventMeterDelta`
to 0.1% on both units with full sample coverage ('3063 20.438 vs 20.460, '4423 23.136 vs 23.162).

### 1.0 gpm — true 20.0 gal, water 22.5 C (wetted reference), 20:09-20:29Z
Reference confirmed by Bruce. Fills the last unsampled interior point on this firmware.

| meter | eventMeterDelta | vs 20.0 | per-device k | duration |
|---|---|---|---|---|
| '3063 | 20.275 | **+1.37%** | 0.9776 | 1207 s |
| '4423 | 21.013 | **+5.07%** | 0.9432 | 1204 s |
| '8549 | 21.144 | **+5.72%** | 0.9374 | 1206 s |
| **trio** | **20.811** | **+4.05%** | **0.9524** | sd 2.34 pp, spread 4.35 pp |

True flow 0.9950 gpm, **Re 4102** (nu = 9.4587e-7 at 22.5 C). Integrity CLEAN: all five counters 0,
`envWalk` 0, `calFlags2` 0, `tiBootCnt` 1, `qual` 100, durations within **3 s** on one valve.
Trapz of `flowRate` matches `eventMeterDelta` to 0.15-0.3%. Per-minute profile flat across all
20 min on all three.

### THE k(Re) CURVE — COMPLETE on 17044 / v361

| Re | flow | trio error | measured k | turbulent model | gap |
|---|---|---|---|---|---|
| 1886 | 0.463 gpm @ 22.0 C | **+11.06%** | **0.8923** | 0.9652 | **-7.55%** |
| 4102 | 0.995 gpm @ 22.5 C | **+4.05%** | **0.9524** | 0.9732 | **-2.14%** |
| 20613 | 5 gpm | +0.067% | 0.9904 | 0.9904 | anchor (by construction) |

Smooth and monotonic — **no knee.** The 1 gpm point lands on the old ~+3.7% estimate from the
superseded cal, an independent confirmation that the profile factor is firmware-invariant.

**THE STANDARD TURBULENT k(Re) RELATION DOES NOT DESCRIBE THIS METER AT LOW Re.** Re 4102 is well
past the 2300 transition, where `k = 1/(1.119 - 0.011 ln Re)` should fit, and it is still 2.14%
low — widening to 7.55% by Re 1886. **Any firmware correction must be fitted to THIS measured
curve, not lifted from the textbook relation.** Anchor temperature was not recorded; 22.5 C assumed
(a 0.5 C error moves Re ~1.1% and k by <0.02%, so the conclusion is insensitive to it).

### SPREAD COLLAPSES WITH Re — this reframes the NTEP problem
Inter-device spread **13.51 pp at Re 1886 -> 4.35 pp at Re 4102**: 3x narrower for a 2x flow
increase. Device ordering is preserved at both points ('3063 lowest, '8549 highest), so the units
are internally consistent — they fan out only as the profile fails to develop. **The scatter is a
low-Re phenomenon, not fixed per-device character, so per-device characterisation is likely needed
only near Q1 rather than across the range.** Where that becomes acceptable depends on the target
accuracy class at the low end.

### '8549 operating point is wandering
Re-cal'd TWICE in ~90 min: bestEnv 40 -> 30, gain 29 -> 36 -> 24, upamp 560 -> 1156 -> 317. Both
landed POST-event in quiet water (per-minute profiles flat throughout both runs), so v349 is
working and no run is contaminated — but '8549 is moving materially more than '3063 or '4423 and
is worth watching.

### The invariance result — this is the session's finding

| date | firmware | trio @ 0.5 gpm |
|---|---|---|
| 2026-08-26 | 17040 / v354 | +10.96% |
| 2026-08-30 | 17044 / v361 | **+11.06%** |

**0.10 pp apart across two complete calibration rebuilds** — the v349-354 cal rebuild AND the
v359-361 surface cal — with commit points that visibly moved ('3063 bestEnv 50->30, '8549 gain
29->36, upamp 560->1156). A calibration artifact cannot survive that. **The low-flow over-read is
the velocity-profile factor.** A real correction needs a Re-dependent hook in firmware; none exists
(only `lFactor` and a flat `flowRateCoefficient`).

### k(Re) on 17044/v361
High-flow anchor (5 gpm x 50 gal, from `ntep-accuracy-handoff.md`): -1.0 / +0.8 / +0.4, trio
**+0.067%** at Re 20384, model k_turb = 0.9902.
Low end: trio +11.06% at **Re 1886** (0.4626 gpm, nu = 9.565e-7 at the wetted 22.0 C).

**k(Re 1886) = 0.8922** — against 0.8874 measured 8/26 on 17040/v354, i.e. **0.5% apart**.
Per-device: '3063 **0.9686**, '4423 **0.8556**, '8549 **0.8610**. Parabolic laminar limit 0.75 —
still well clear of it, so the profile is not fully developed at the transducer.

### The NTEP-binding problem is SPREAD, not mean
Inter-device spread widened 7.8 -> **13.51 pp** between 8/26 and 8/30. '3063 moved -3.9 pp while
'4423 moved +4.0 pp; '8549 held (+0.2 pp). '3063's flow profile is flat and ~11% below the pair
from the FIRST minute of the run (per-2-min buckets checked) — this is stable device variation,
not a mid-run recal. **A single fleet-wide k(Re) curve corrects the mean and leaves roughly
+/-6.8 pp of device scatter at 0.5 gpm.** For NTEP that scatter, not the mean, is the constraint.

### Retro-resolves the 8/29 reference ambiguity
The 8/29 evening 0.5 gpm run swung between **+2.84%** (tank = main run only) and **+9.22%** (tank
also covered the ~1.75 gal pre-squirt) — a 6.4 pp swing. The clean +11.06% picks the second
branch: **that tank included the squirt.**

### Recals fired POST-event, in quiet water — v349 working as designed
'3063 bestEnv/env 50 -> 30, qual 66 -> 100; '8549 gain 29 -> 36, upamp 560 -> 1156. Both changed
between the 19:13Z and 20:00Z status reports, but the per-2-minute flow profiles are flat across
the whole run for all three, so neither recal landed mid-flow. '4423 unchanged.

### Thermistor bias re-measured
Clamp-on vs wetted 22.0 C: '3063 24.534 (**+2.53**), '8549 24.268 (**+2.27**). Compare 8/26:
+3.47 / +3.00. Bias is real and repeatable but **not a fixed constant** — it moved ~0.8 C between
sessions. Any bias correction must be characterised, not a single offset.
**'4423's external probe is STILL DEAD (flat 0.0).**

### Next
Three-point k(Re) is COMPLETE (Re 1886 / 4102 / 20613). Open options: a 2 gpm point to pin the
transition shape between Re 4102 and 20613, and a repeat near Q1 to size the low-Re device
scatter properly (n=1 per device there today).

---

## TL;DR

1. **Lf 2.239 is validated. Ship the table change.** 5-7 gpm, 4 clean runs on 17037/v344: trio
   **-0.310%** (sd 0.282 pp, 95% CI includes zero). NOT yet re-verified on 17040/v354.
2. **'549's low-flow failure is FIXED** by the cal rebuild. At 0.5 gpm it went from 6.835 gal in
   ~45 fragments (SNR ~1, gain railed to 44) to **22.970 gal in one clean event** (SNR 20, gain
   held 28-29).
3. **The low-flow over-read is real and is PROFILE PHYSICS — now proven by invariance.** Trio
   **+10.96%** on 17040/v354 (8/26) vs **+11.06%** on 17044/v361 (8/30): 0.10 pp apart across two
   complete cal rebuilds. ~+3.7% at 1 gpm (old FW). Billing-relevant. **The NTEP-binding problem is
   the SPREAD (13.5 pp at 0.5 gpm), not the mean** — one fleet k(Re) curve leaves ~±6.8 pp scatter.
4. **Thermistor bias now MEASURED: clamp-on reads +3.2 C high** vs a wetted reference. At
   0.32 %/C that is ~1.0% of flow error — so naive temp comp off the raw reading would inject about
   as much error as it removes. Bias correction is a precondition, not a refinement.
5. **My 8/17 "unbounded AGC" diagnosis was WRONG.** There is no runtime AGC; the runaway was
   autonomous envTest recals firing MID-FLOW and committing flow-contaminated points. Corrected by
   the cal session and confirmed by the 8/26 data.
6. **The 50-gal forward-billing regression PASSED on 17040/v354** (trio ≈ −0.63%), so both ends of
   the k(Re) curve now exist on matched firmware. **8/30: the curve is COMPLETE on 17044/v361 —
   k = 0.8923 @ Re 1886, 0.9524 @ Re 4102, 0.9904 @ Re 20613, smooth and monotonic, no knee.**
   **The textbook turbulent k(Re) relation does NOT fit it** (-7.6% at Re 1886, still -2.1% at
   Re 4102, well past transition) — any correction must be fitted to the measured curve.
7. **The 10-gal short-event shortfall is probably NOT capture loss.** A fixed boundary-loss model
   cannot fit both runs; '549 is consistent at ~3 s, '063/'423 are 5–15 pp off. Real residual loss
   ≈ 3 s ≈ 0.25 gal — negligible on rig volumes, **material on tenant-scale draws.**
8. **Live device state to revert: `recordNoneventFlow: true` on all three.**

**Parallel-session note:** this campaign now spans three docs — this file (campaign source of truth),
`cal-spec-v349-354-handoff.md` (FW/cal rebuild), and `rig-flowtest-0826-notes.md` (8/26 rig runs).
Sessions blend by design; when they disagree, **the newest dated result wins and gets folded in here.**

---

## Devices — Wyse lab trio, tenant-owner group "Flow Testing"

| Meter | TB device id | FW | Notes |
|---|---|---|---|
| 70273063 | d08d4e60-db7a-11f0-b691-d965a62fa4fa | **ST 17040 / TI v354** | healthy |
| 72714423 | 737b0320-db7a-11f0-b691-d965a62fa4fa | **ST 17040 / TI v354** | **ext temp sensor STILL DEAD (flat 0.0)** |
| 72718549 | 5f18a040-dc4c-11f0-b691-d965a62fa4fa | **ST 17040 / TI v354** | 0.5 gpm failure FIXED by the cal rebuild; still `flowDirection = FLIPPED` |

Device-scope pins now `gen2fw=17040`, `allowTiFotaVer=354`. **Fleet is still on 17037/344.**
Flow Testing GROUP lever still broken (`gen2fw:362 / allowTiFotaVer:209`).
Offsets re-baselined by the new cal: **5174 / −2676 / −492** (were 5360 / −2703 / −601).
`stOffsetLocked` true, env 35 all three, pipe M 3/4" (table Lf 2.255, dia 0.811).
`flowDirection`: UNKNOWN / UNKNOWN / **FLIPPED**. `waterFlowDir = 1` set on '549 only —
apparent contradiction with the documented 1 = NOT FLIPPED mapping, UNRESOLVED.

**End-of-session meterVal: 371.24 / 367.78 / 356.966.** `revGal` 0 / 0 / 7.096.
Test gallons NOT reset.

---

## Lf 2.239 — CONFIRMED APPLIED and VALIDATED

`lFactor: 2239` SHARED_SCOPE written 08-16 21:15:43Z; `L_FACTOR` telemetry read 2.239 from 23:40Z
onward and held through every check-in since, including overnight.

Applying it took **two flow events** — expected, not a fault: `L_FACTOR` is recomputed only inside
`flowOfTof()` (measure.c:341-352) and the status report emits that global (status_report.c:359), so
the check-in that *pulls* the attribute still reports the old value. `setCalStates()` is an empty stub
(main.c:150), so an lFactor change causes no cal disturbance.

The 2.255 → 2.239 step validated the correction rule: predicted lift **+3.489%**, actual **+3.496%**.
`R ∝ 1/√(Lf²−4)` holds.

---

## Complete run log at Lf 2.239

All figures are `eventMeterDelta` (authoritative). `meterVal` deltas agreed to <0.04 gal on every run
where both were captured — that cross-check never disagreed.

| run | flow | true gal | '063 | '423 | '549 | trio | status |
|---|---|---|---|---|---|---|---|
| iter 2 | 5.15 | 50.0 | +0.801% | −0.118% | −0.596% | **+0.029%** | clean |
| iter 3 | 5.32 | 52.5 | +0.175% | −0.344% | −1.421% | **−0.530%** | clean |
| iter 4 | 5.15 | 51.5 | −1.235% | −1.345% | −2.029% | −1.536% | **EXCLUDED** |
| point A | 7.15 | 50.0 | −1.272% | −0.687% | −5.821% | −2.593% | **EXCLUDED** |
| ptA retest | 7.05 | 50.0 | +0.133% | −0.770% | −1.027% | **−0.555%** | clean |
| run 3 | 7.30 | 50.0 | +0.046% | +0.378% | −0.983% | **−0.186%** | clean |
| B1 | 1.06 | 21.0 | +1.326% | +3.644% | +0.272% | +1.747% | clean |
| B2 | 1.04 | 20.0 | +5.160% | +4.861% | +2.992% | +4.338% | clean |
| C | 0.51 | 20.0 | +8.910% | +17.340% | **−65.8%** | — | **'549 hard fail** |

Raw readings ('063/'423/'549): iter2 50.400/49.941/49.702 · iter3 52.592/52.319/51.754 ·
iter4 50.864/50.808/50.455 · ptA 49.364/49.657/47.089 · ptA-r 50.067/49.615/49.486 ·
run3 50.023/50.189/49.509 · B1 21.278/21.765/21.057 · B2 21.032/20.972/20.598 ·
C 21.782/23.468/6.835.

### Exclusions — both on telemetry-visible physical criteria, not on inconvenient error values
- **iter 4** — sampling cadence 6.51 samples/s against 1.15–1.51 on every other run, AND the only run
  where Σtnorm-per-gallon itself scatters (1.9% vs ~0.15%). Two independent tells.
- **point A** — '549's acoustic integral collapsed to 199867 per true gallon vs its usual ~210000;
  a matched retest did not reproduce it. *Weaker criterion:* it identifies '549 specifically, yet the
  whole run was dropped. '063 (−1.272%) and '423 (−0.687%) were not obviously anomalous. **If a
  reviewer challenges one exclusion, it will be this one.**

### Headline accuracy — high flow (5–7 gpm, 4 clean runs)

| population | mean | sd | note |
|---|---|---|---|
| **trio** | **−0.310%** | 0.282 pp | 95% CI −0.759…+0.138, includes zero. **The honest fleet number.** |
| pair (excl '549) | +0.038% | 0.297 pp | what a *good* unit does; the achievable ceiling |

Per-device over the 4 clean runs: '063 +0.289% (sd 0.346), '423 −0.213% (sd 0.478),
'549 −1.007% (sd 0.337 — the *tightest*, i.e. a stable calibratable bias).

**Use −0.310% as the quoted figure.** Excluding '549 at high flow is a different judgment from
excluding it at 0.5 gpm: at 5–7 gpm it *worked*, it was merely biased low. Dropping a
functioning-but-biased unit flatters the fleet.

**Flow dependence 5 → 7 gpm: −0.120 pp** against a k(Re) prediction of +0.39 pp. No meaningful
dependence across Re 21400–30500, exactly as theory says. Point A was never going to show a signal.

---

## SESSION 3 (2026-08-26) — new firmware ST 17040 / TI v354

Confirmed on all three: `fwVer` 17040, `fwVerTi` 354, deviceState Metering, `L_FACTOR` **2.239**
still applying (the `lFactor: 2239` SHARED_SCOPE attr survived the FW update), env **35** on all
three, gain uniform at **29** pre-run. Offsets re-baselined by the new cal: **5174 / -2676 / -492**
(were 5360 / -2703 / -601). `flowDirection`: UNKNOWN on '063 and '423, **FLIPPED on '549** with
`waterFlowDir = 1` set — note the apparent contradiction with the documented 1 = NOT FLIPPED mapping,
unresolved. '549 carries `revGal` 7.096 from the earlier deliberate reverse test.

### 0.5 gpm result — true 20.0 gal, water 22.7 C (wetted reference)

| meter | gal | gpm | error | tnormAvg | sd | SNR | gain |
|---|---|---|---|---|---|---|---|
| '063 | 21.233 | 0.489 | **+6.17%** | 1591 | 69 | 23.1 | 29 |
| '423 | 22.372 | 0.515 | **+11.86%** | 1692 | 103 | 16.4 | 28 |
| '549 | 22.970 | 0.526 | **+14.85%** | 1740 | 87 | 20.0 | 28 |
| **trio** | **22.192** | | **+10.96%** | | | | spread 7.82% |

`meterVal` deltas cross-check all three exactly. `revGal` unchanged (0/0/7.096) — **'549 banked this
run FORWARD despite reading FLIPPED**, so its number is directly comparable. `tofRejectCnt` 0
throughout. All three produced a SINGLE event. First time all three yielded valid data at 0.5 gpm.

### '549 before and after the cal rebuild (both true 20.0 gal at 0.5 gpm)

| | 8/17 (17037/v344) | 8/26 (17040/v354) |
|---|---|---|
| volume | 6.835 gal (-65.8%) | **22.970 gal** |
| events | **~45 fragments** | **one clean event** |
| tnormStddev vs signal | 700-1700 vs +/-800 | **87 vs 1740** |
| SNR | **~1** | **20.0** |
| gain | railed to **44** | held **28** |

### Thermistor bias — measured for the first time
The wetted reference probe makes this quantifiable:

| meter | clamp-on (end of run) | true water | bias |
|---|---|---|---|
| '063 | 26.171 C | 22.7 C | **+3.47 C** |
| '549 | 25.695 C | 22.7 C | **+3.00 C** |
| '423 | dead (flat 0.0) | — | still broken |

Mean bias **+3.23 C** = **~1.03% of flow error** at 0.32 %/C. **Compensating from the raw clamp-on
reading would inject roughly as much error as the compensation removes.** Confirms the 8/17
rubber-coupling prediction with a number. Also **moves Reynolds**: at the true 22.7 C, Re = **2070**,
not the 2229 the biased sensor implied — an 8% overstatement, and more solidly laminar.
**All future k(Re) fitting must use wetted-reference temperature.**

### Noise gate (17038) — my warning was WRONG, retracted
Pre-run `tnormMasd` read 1157-3086 ps, implying deadbands of 2314-6172 ps against a ~1800 ps signal;
I warned the gate would zero the run. It did not. **MASD settled to 244-312 ps once clean flow
started**, giving gates of 488-624 ps against ~1650 ps of signal — about 3x headroom. The high
pre-run MASD was a transient from prior disturbances, not the units' noise floor. `gatedAggs` rose
only ~190-200 during the run.

### Contamination of the 8/17 point C numbers
All three units re-cal'd mid-flow at 21:20-21:44 on 8/17, immediately before point C ran
(21:44-22:27), so **'063 and '423's point C figures are compromised too, not just '549's** — their
operating points moved (gain 32 -> 26, upamp ~1100-1400 -> 597-724). The working pair went
+13.12% (8/17) -> **+9.01%** (8/26), consistent with that. **The 0.5 gpm anchor of the k(Re) curve
below should be taken from session 3, not from point C.** The 1 gpm points (B1/B2) predate the recal
window and remain sound.

### RESOLVED 2026-08-26 afternoon — the high-flow baseline now exists
The 50-gal forward-billing regression ran 15:21–15:31Z (true 51.25 gal @ ~5.2 gpm) in the parallel
Shady Lane session. **See `rig-flowtest-0826-notes.md` for the full write-up.** ALL THREE PASS:
'063 −0.91%, '423 −0.47%, '549 ≈ −0.5% (its leg was valved closed 2.4 min early, so its true is
prorated to ~39.15 — a DERIVED reference, softer than the other two). Trio **≈ −0.63%**.

**Lf 2.239 survives the FW update:** −0.310% (4 runs, 17037/v344) vs −0.63% (1 run, 17040/v354) —
~1.1σ apart, not significant. Still not a formal re-verification (n=1), which stays on the list.

### k(Re) CURVE ON MATCHED FIRMWARE (both ends now 17040/v354)

| meter | 5.2 gpm (Re 21533) | 0.5 gpm (Re 2070) | k_assumed | **k @ Re 2070** |
|---|---|---|---|---|
| '063 | −0.91% | +6.17% | 0.9818 | **0.9248** |
| '423 | −0.47% | +11.86% | 0.9862 | **0.8816** |
| '549 | −0.50% | +14.85% | 0.9859 | **0.8584** |
| **trio** | **−0.63%** | **+10.96%** | 0.9846 | **0.8874** |

k = **0.887** at Re 2070 — mid-transition, still well clear of the 0.75 parabolic limit despite Re
being nominally laminar. Per-device k spans 0.858–0.925 (the 7.8% low-flow spread as a profile
factor), and note it is ordered OPPOSITE to the high-flow bias: '063 reads lowest at high flow but
has the highest k. Devices diverge as flow drops rather than carrying a fixed offset.
Assumption: 22.7 °C water for the 5.2 gpm leg (its reference temp was not recorded).

**CURVE GAP — the middle is unsampled on current firmware.** Re 2070 → 21533 is a 10× span with one
interior point (1 gpm, Re 4141) and that point is on the superseded 17037/v344 cal. Re-running
**1 gpm × 20 gal on 17040/v354 (~25 min)** makes it a fittable curve; 2 gpm (Re 8282) would add a
fourth and resolve the bend.

### Short-event capture (Gate A OPEN) — the 50-gal data constrains it
The 10-gal quick test read −9.6 / −17.4 / −3.8%. Testing a fixed boundary-loss model against BOTH
runs (a shared mechanism must give one T for both):

| meter | T implied by 10-gal | T implied by 50-gal | 10-gal predicted from the 50-gal T | actual |
|---|---|---|---|---|
| '063 | 11.5 s | 5.6 s | −4.67% | −9.6% |
| '423 | 20.9 s | 2.9 s | −2.42% | −17.4% |
| '549 | 4.5 s | 2.5 s | −2.10% | −3.8% |

**'549's quick test is consistent with a ~3 s boundary loss; '063 and '423 are 5–15 pp off.**
All three legs share one manifold, one firmware and one event layer, so a universal capture defect
cannot produce −3.8 / −9.6 / −17.4% at identical rate. **This points at per-leg reference/valving
ambiguity on '063 and '423 specifically — the same mechanism that produced the false −24% verdict
that day — not at short-event capture loss.** Resolving it needs the valving/measurement method for
those two legs, not more runs.

Residual REAL boundary loss is therefore ~3 s ≈ 0.25 gal at 5 gpm: −2.5% on a 10-gal draw, −1.25% on
20 gal, −0.5% on 50. **Negligible at rig volumes, material at tenant-scale draws** — worth carrying
into the billing-accuracy picture independent of this campaign.

### OUTSTANDING DEVICE STATE — must be reverted
**`recordNoneventFlow: true` was written to all three trio devices** (DEVICE shared scope,
8/26 ~15:45Z, verified by readback; previously unset) to get continuous tofNorm/flowRate sampling for
the short-event test. **REVERT to false when the campaign wraps** (777 ring-fill lesson). Verify via
`noneventMode` telemetry after a priming draw before trusting the sampling.

**End-of-session meterVal: 371.24 / 367.78 / 356.966.** `revGal` 0 / 0 / 7.096.
Test gallons NOT reset.

---

## Lf 2.239 — CONFIRMED APPLIED and VALIDATED

`lFactor: 2239` SHARED_SCOPE written 08-16 21:15:43Z; `L_FACTOR` telemetry read 2.239 from 23:40Z
onward and held through every check-in since, including overnight.

Applying it took **two flow events** — expected, not a fault: `L_FACTOR` is recomputed only inside
`flowOfTof()` (measure.c:341-352) and the status report emits that global (status_report.c:359), so
the check-in that *pulls* the attribute still reports the old value. `setCalStates()` is an empty stub
(main.c:150), so an lFactor change causes no cal disturbance.

The 2.255 → 2.239 step validated the correction rule: predicted lift **+3.489%**, actual **+3.496%**.
`R ∝ 1/√(Lf²−4)` holds.

---

## Complete run log at Lf 2.239

All figures are `eventMeterDelta` (authoritative). `meterVal` deltas agreed to <0.04 gal on every run
where both were captured — that cross-check never disagreed.

| run | flow | true gal | '063 | '423 | '549 | trio | status |
|---|---|---|---|---|---|---|---|
| iter 2 | 5.15 | 50.0 | +0.801% | −0.118% | −0.596% | **+0.029%** | clean |
| iter 3 | 5.32 | 52.5 | +0.175% | −0.344% | −1.421% | **−0.530%** | clean |
| iter 4 | 5.15 | 51.5 | −1.235% | −1.345% | −2.029% | −1.536% | **EXCLUDED** |
| point A | 7.15 | 50.0 | −1.272% | −0.687% | −5.821% | −2.593% | **EXCLUDED** |
| ptA retest | 7.05 | 50.0 | +0.133% | −0.770% | −1.027% | **−0.555%** | clean |
| run 3 | 7.30 | 50.0 | +0.046% | +0.378% | −0.983% | **−0.186%** | clean |
| B1 | 1.06 | 21.0 | +1.326% | +3.644% | +0.272% | +1.747% | clean |
| B2 | 1.04 | 20.0 | +5.160% | +4.861% | +2.992% | +4.338% | clean |
| C | 0.51 | 20.0 | +8.910% | +17.340% | **−65.8%** | — | **'549 hard fail** |

Raw readings ('063/'423/'549): iter2 50.400/49.941/49.702 · iter3 52.592/52.319/51.754 ·
iter4 50.864/50.808/50.455 · ptA 49.364/49.657/47.089 · ptA-r 50.067/49.615/49.486 ·
run3 50.023/50.189/49.509 · B1 21.278/21.765/21.057 · B2 21.032/20.972/20.598 ·
C 21.782/23.468/6.835.

### Exclusions — both on telemetry-visible physical criteria, not on inconvenient error values
- **iter 4** — sampling cadence 6.51 samples/s against 1.15–1.51 on every other run, AND the only run
  where Σtnorm-per-gallon itself scatters (1.9% vs ~0.15%). Two independent tells.
- **point A** — '549's acoustic integral collapsed to 199867 per true gallon vs its usual ~210000;
  a matched retest did not reproduce it. *Weaker criterion:* it identifies '549 specifically, yet the
  whole run was dropped. '063 (−1.272%) and '423 (−0.687%) were not obviously anomalous. **If a
  reviewer challenges one exclusion, it will be this one.**

### Headline accuracy — high flow (5–7 gpm, 4 clean runs)

| population | mean | sd | note |
|---|---|---|---|
| **trio** | **−0.310%** | 0.282 pp | 95% CI −0.759…+0.138, includes zero. **The honest fleet number.** |
| pair (excl '549) | +0.038% | 0.297 pp | what a *good* unit does; the achievable ceiling |

Per-device over the 4 clean runs: '063 +0.289% (sd 0.346), '423 −0.213% (sd 0.478),
'549 −1.007% (sd 0.337 — the *tightest*, i.e. a stable calibratable bias).

**Use −0.310% as the quoted figure.** Excluding '549 at high flow is a different judgment from
excluding it at 0.5 gpm: at 5–7 gpm it *worked*, it was merely biased low. Dropping a
functioning-but-biased unit flatters the fleet.

**Flow dependence 5 → 7 gpm: −0.120 pp** against a k(Re) prediction of +0.39 pp. No meaningful
dependence across Re 21400–30500, exactly as theory says. Point A was never going to show a signal.

---

## SESSION 3 (2026-08-26) — new firmware ST 17040 / TI v354

Confirmed on all three: `fwVer` 17040, `fwVerTi` 354, deviceState Metering, `L_FACTOR` **2.239**
still applying (the `lFactor: 2239` SHARED_SCOPE attr survived the FW update), env **35** on all
three, gain uniform at **29** pre-run. Offsets re-baselined by the new cal: **5174 / -2676 / -492**
(were 5360 / -2703 / -601). `flowDirection`: UNKNOWN on '063 and '423, **FLIPPED on '549** with
`waterFlowDir = 1` set — note the apparent contradiction with the documented 1 = NOT FLIPPED mapping,
unresolved. '549 carries `revGal` 7.096 from the earlier deliberate reverse test.

### 0.5 gpm result — true 20.0 gal, water 22.7 C (wetted reference)

| meter | gal | gpm | error | tnormAvg | sd | SNR | gain |
|---|---|---|---|---|---|---|---|
| '063 | 21.233 | 0.489 | **+6.17%** | 1591 | 69 | 23.1 | 29 |
| '423 | 22.372 | 0.515 | **+11.86%** | 1692 | 103 | 16.4 | 28 |
| '549 | 22.970 | 0.526 | **+14.85%** | 1740 | 87 | 20.0 | 28 |
| **trio** | **22.192** | | **+10.96%** | | | | spread 7.82% |

`meterVal` deltas cross-check all three exactly. `revGal` unchanged (0/0/7.096) — **'549 banked this
run FORWARD despite reading FLIPPED**, so its number is directly comparable. `tofRejectCnt` 0
throughout. All three produced a SINGLE event. First time all three yielded valid data at 0.5 gpm.

### '549 before and after the cal rebuild (both true 20.0 gal at 0.5 gpm)

| | 8/17 (17037/v344) | 8/26 (17040/v354) |
|---|---|---|
| volume | 6.835 gal (-65.8%) | **22.970 gal** |
| events | **~45 fragments** | **one clean event** |
| tnormStddev vs signal | 700-1700 vs +/-800 | **87 vs 1740** |
| SNR | **~1** | **20.0** |
| gain | railed to **44** | held **28** |

### Thermistor bias — measured for the first time
The wetted reference probe makes this quantifiable:

| meter | clamp-on (end of run) | true water | bias |
|---|---|---|---|
| '063 | 26.171 C | 22.7 C | **+3.47 C** |
| '549 | 25.695 C | 22.7 C | **+3.00 C** |
| '423 | dead (flat 0.0) | — | still broken |

Mean bias **+3.23 C** = **~1.03% of flow error** at 0.32 %/C. **Compensating from the raw clamp-on
reading would inject roughly as much error as the compensation removes.** Confirms the 8/17
rubber-coupling prediction with a number. Also **moves Reynolds**: at the true 22.7 C, Re = **2070**,
not the 2229 the biased sensor implied — an 8% overstatement, and more solidly laminar.
**All future k(Re) fitting must use wetted-reference temperature.**

### Noise gate (17038) — my warning was WRONG, retracted
Pre-run `tnormMasd` read 1157-3086 ps, implying deadbands of 2314-6172 ps against a ~1800 ps signal;
I warned the gate would zero the run. It did not. **MASD settled to 244-312 ps once clean flow
started**, giving gates of 488-624 ps against ~1650 ps of signal — about 3x headroom. The high
pre-run MASD was a transient from prior disturbances, not the units' noise floor. `gatedAggs` rose
only ~190-200 during the run.

### Contamination of the 8/17 point C numbers
All three units re-cal'd mid-flow at 21:20-21:44 on 8/17, immediately before point C ran
(21:44-22:27), so **'063 and '423's point C figures are compromised too, not just '549's** — their
operating points moved (gain 32 -> 26, upamp ~1100-1400 -> 597-724). The working pair went
+13.12% (8/17) -> **+9.01%** (8/26), consistent with that. **The 0.5 gpm anchor of the k(Re) curve
below should be taken from session 3, not from point C.** The 1 gpm points (B1/B2) predate the recal
window and remain sound.

### BLOCKING for any new campaign numbers
`Q_meter/Q_true` = 1.1096 at 0.5 gpm. Converting that to a k value requires the **high-flow baseline
on 17040/v354, which does not exist yet.** Carrying the old 17037/v344 k_assumed 0.9911 forward gives
k = 0.8932, but that assumes unchanged high-flow behaviour — exactly what the pending **50-gal
forward-billing regression at 5 gpm (~10 min)** is meant to establish. **Treat all session-3 k values
as provisional until that run exists.** This is the single highest-value next action.

**End-of-session meterVal: 371.24 / 367.78 / 356.966.** revGal 0 / 0 / 7.096. Test gallons NOT reset.

## k(Re) / laminar characterisation — the main new result

For a diametral ultrasonic path the meter reads a path-average velocity; the area-average/path-average
ratio k is ~0.75 for fully-developed laminar and ~0.99 for turbulent. `L_FACTOR` was fitted in
turbulent flow, so **the meter over-reads as flow drops.** Confirmed and quantified:

| flow | Re | pair mean error | measured k | textbook k |
|---|---|---|---|---|
| 5–7 gpm | 21400 | +0.038% | 0.9908 | 0.9908 |
| 1 gpm | 4266 | **+3.748%** | **0.9553** | 0.9737 |
| 0.5 gpm | ~2200 | **+13.125%** | **0.8761** | 0.75 (laminar) |

k baked into `L_FACTOR` = 0.9911. The curve is coherent and monotonic. Real profile runs slightly
*more* laminar than textbook at 1 gpm and has **not** reached the parabolic limit at 0.5 gpm —
mid-transition, consistent with Re ~2200 straddling the 2300 boundary.

**Commercial significance:** +3.7% at 1 gpm and +13% at 0.5 gpm are squarely in the range of real
tenant usage — a running fixture, a trickle, a small leak. Not an edge case.

**There is NO Re-dependent correction hook in firmware.** The only levers are `lFactor` (via L) and
`dynamicConfig.flowRateCoefficient` (a flat multiplier at measure.c:389) — both constants. A real
k(Re) correction requires new firmware: a flow- or Re-indexed curve applied after `velocity()`.

### Precision caveat — the curve's SHAPE is solid, its low-end VALUES are not
Run-to-run repeatability degrades badly with flow:

| band | run-to-run scatter |
|---|---|
| 5–7 gpm (4 runs) | **0.28 pp** |
| 1 gpm (2 runs) | **2.53 pp** (~9× worse) |
| 0.5 gpm (1 run) | inter-device spread **8.43 pp** |

Physically expected — Δt shrinks with velocity so differential SNR degrades. **Consequence: low-flow
points need replicates; n=1 is only adequate at high flow.** Pinning the low end to useful precision
needs ~3 replicates each at 1 and 0.5 gpm, roughly 3 hours of water. Decide whether the curve is
needed to that precision or whether "over-reads ~4% at 1 gpm, ~13% at 0.5" is enough to act on.

Also: at 0.5 gpm Re is temperature-sensitive (2038 @22 °C → 2326 @28 °C, crossing 2300), so the
regime at that flow depends on water temperature. If a guaranteed-laminar point is wanted, use
**0.3 gpm** — Re 1166 @20 °C to 1613 @35 °C, safely laminar at any lab temperature.

---

## '549 AGC RUNAWAY at 0.5 gpm — and phantom consumption

At 0.5 gpm '549 fragmented into **~45 separate micro-events** instead of one, counted **6.835 gal
against 20.0 true (−65.8%)**, and its `tnormAvg` swung negative repeatedly (−260 to −1327) with
`tnormStddev` 700–1700. SNR ≈ 1.

**Bruce identified the mechanism: gain / ADC capture amplitude.**

| | 1 gpm (all healthy) | 0.5 gpm |
|---|---|---|
| '063 | gain 32, upamp 1436, qual 100 | gain **26**, upamp **724**, qual 66–100 |
| '423 | gain 32, upamp 1118, qual 100 | gain **26**, upamp **597**, qual 66–100 |
| '549 | gain 32, upamp 1162, qual 100 | gain **44**, upamp **2703**, qual **100** |

At 1 gpm all three sat on the same operating point. At 0.5 gpm the healthy pair **backed gain down to
26** (~600–720 amplitude); '549 **drove gain up to 44** and railed to **2703, ~4× the others**. For
comparison of signal quality: '549 σ 700–1700 against ±800 signal; '063/'423 σ 80–88 against ~1800.

### Phantom consumption at rest
In the ~32 idle minutes between B2 and point C, when the only real flow was the tank reset:

| meter | counted | reset event | **unexplained** |
|---|---|---|---|
| '063 | 1.798 | 1.747 | +0.051 |
| '423 | 1.837 | 1.786 | +0.051 |
| '549 | 7.093 | 2.343 | **+4.750** |

**'549 fabricated ~4.75 gal in half an hour at rest ≈ 10 gal/hr ≈ 240 gal/day.**

### Mechanism — identified in source
All three units have `flowDirection = UNKNOWN`. At **measure.c:359-365**:

```c
if (flowDirection == FLOW_DIRECTION_UNKNOWN) {
    if (tofNorm < 0) { tofNorm *= -1; }   // RECTIFIES
} else {
    if (flowDirection == FLOW_DIRECTION_FLIP) { tofNorm *= -1; }
    if (tofNorm < 0) { tofNorm = 0; }     // clamps
}
```

With direction UNKNOWN, negative `tofNorm` is **rectified into positive flow** rather than zeroed.
When SNR degrades to ~1, symmetric noise is full-wave rectified into a steady stream of phantom
gallons. With `flowDirection` set, the same noise clamps to zero and produces nothing.

**This elevates `waterFlowDir` from a tidiness item to a priority fix.** Any fielded meter with
UNKNOWN direction and degraded signal will invent consumption. **Recommend auditing the fleet's
`flowDirection` distribution.**

*Confidence note:* the phantom attribution rests on assigning '549's extra 4.75 gal to noise
rectification. It fits the negative `tnormAvg`, the code path, and the two-orders-of-magnitude
disagreement with the other two meters on the same pipe — but no independent proof that zero water
moved.

### MONITORING GAP — nothing detected any of this
Across the entire failure: `errSigWeakCtr`, `errNoSigCtr`, `errSigHighCtr` all **0**;
`adcCapInvalid` **0**; `adcCapOk` incrementing normally; **`qual` = 100 on '549 throughout** while
*dropping* to 66–83 on the two correctly-working meters.

**The health telemetry inverted — a monitor built on `qual` or the error counters would have passed
the broken meter and flagged the healthy pair.**

Two distinct defects:
1. **AGC has no sanity bound at low signal.** It ran away upward instead of settling; 4× amplitude
   divergence between identical units on one pipe is not a tolerance issue.
2. **No detector catches it.** The one telemetry signal that distinguishes the cases is
   **`tnormStddev` relative to `tnormAvg`** — an SNR ratio nothing currently computes or alarms on.
   Cheap to add; would catch both the AGC runaway and the phantom-consumption mode.

---

## Temperature — PARKED at Bruce's request, model is more complex than water physics

### Verified: no temperature compensation exists in the flow path
- `vtot` is hardcoded — `volatile float vtot = 58639.8242f` (measure.c:302), never reassigned.
- `velocity()` gives `V ∝ dTof / TL²` with `TL = L/vtot` (measure.c:289) → **V scales with the square
  of the assumed speed of sound.**
- Temperature appears in measure.c only as telemetry (measure.c:128-129); it never enters the calc.
- Confirmed the dependence acts **through the differential**: `Δt = 2·L·v·cosθ/(c² − v²cos²θ) ≈
  2·L·v·cosθ/c²`. It is **one** c² sensitivity, not two — the c² in Δt and the vtot² in the
  reconstruction are the same effect and would cancel if vtot tracked actual c. Net **≈0.32 %/°C**.

### The 0.010" rubber coupling strip changes the model
The piezo/thermistor assembly does not touch the pipe; a rubber strip spans the gap, carrying both
the acoustic and thermal paths.

1. **Bulk delay CANCELS** — added equally to `t_up` and `t_dn`, drops out of Δt. It does not cancel in
   absolute ToF, so absolute ToF cannot serve as a thermometer for c.
2. **Refraction angle does NOT cancel.** `sin θ_water = sin θ_rubber·(c_water/c_rubber)`, and
   `Δt ∝ cos θ`. Elastomer sound speed has a tempco **opposite in sign to water's and comparable in
   magnitude** (−0.07…−0.2 %/°C vs +0.16), so the ratio can move ~0.25 %/°C — rivalling the direct
   term. Magnitude UNQUANTIFIED (needs compound and wedge angle); mechanism certain.
3. **Explains the anchor discrepancy.** `vtot` = 58639.8242 implies ~22.4 °C pure water, not the
   23.5 °C previously assumed. `L_FACTOR`/`vtot` were fitted empirically with the coupling in the
   loop, so neither is a clean water property.
4. **Temp comp must be EMPIRICALLY FITTED, not derived.** Keep the ratio form `c(T)/c(T_anchor)` so
   the anchor cancels, but take the coefficient from measured dReading/dT, not from Marczak.
5. **The thermistor does not read water temperature.** Behind 0.010" of rubber it reads a lagged,
   ambient-weighted mix. This predicts what was observed — temp fell 26 → 23.7 °C during *every* run,
   both sensors, every time: a pipe at ambient being pulled toward water temperature once flow starts.
   **Use END-OF-RUN temperature**, and make any comp use a settled/end-of-event value.

### Temperature prediction test — RETRACTED
An 08-17 test predicted +0.50 pp from a 1.4 °C cooler run and observed +0.37 pp (±0.39 pp 1σ) —
inconclusive at the time. Now superseded: the ΔT used was ambient-contaminated per item 5, so the true
water ΔT is unknown. **Discount that test entirely.**

### Sensor failsafe design (spec stage, parked)
Path: `lib/src/hci.c:1040` computes `temp_ext_c` from `duneInfo.temp_ext` (raw ADC from the TI over
HCI) via `temp_adc_to_celsius()` (misc.c:387, NTC Steinhart-Hart with a B-param pre-estimate).

**The hole:** hci.c:1043's range gate `> −40 °C && < 125 °C` **accepts 0.0**, which is exactly what
'423's dead sensor reports. The `|ΔT| ≤ 5 °C` rate gate at hci.c:1063 only guards `tempMin`/`tempMax`,
not `meas.temp_ext_c` itself.

Requirements gathered: reject stuck/dead sensors (not just out-of-range), reject implausible
rate-of-change, clamp the correction factor to a sane band, fall back to the anchor (factor = 1.0 ≡
today's behaviour) on any rejection, surface validity state in telemetry, and use a settled
end-of-event temperature. **Note Lf values would need re-deriving after comp lands** — they currently
absorb whatever temperature bias was present when fitted.

**Rig constraint: tank temperature cannot be varied.** A wide-ΔT test (10–15 °C → −3.1…−4.3%, 8–11×
the noise floor) would settle this in ~20 min but needs heating/chilling the lab can't do today.

---

## Start/stop hypothesis (Bruce) — LIVE, cheapest remaining test

Hypothesis: a fixed per-event start/stop transient is a constant absolute error, so % error should
shrink as volume grows.

Device-to-device spread scales **proportionally** with volume (slope +0.0123 gal/gal across events
from 1.6 to 50 gal; a fixed-offset model predicts ~0), ruling out start/stop error that **differs
between devices**. It does NOT rule out a **common-mode** one — invisible in spread, and exactly what
three meters on one pipe would share.

**Direct test — 5 gpm, vary volume:**

| volume | if fixed −0.155 gal offset | if proportional | duration |
|---|---|---|---|
| 12.5 gal | **−1.24%** | −0.31% | 2.5 min |
| 100 gal | **−0.155%** | −0.31% | 20 min |

1.08 pp separation against 0.28 pp noise. ~25 min of water, no hardware, temperature-independent.

**Related unresolved observation:** on B1 the meter event window was 20.12 min against a 19.40 min
valve-open time — a **43 s excess**. A 43 s volume-carrying tail would be +1.86% at 1 gpm, almost
exactly B1's over-read, so the two explanations are confounded at low flow. Argued against by the
high-flow runs (the same tail would add +3.7…+5.2% there; they show ~0%), so it is probably a
**no-flow hold-off before event close** that extends the window without counting water.
**Still needed: is the reference volume read at valve close, or after the system fully settles?**

---

## Other findings

**Σtnorm-per-gallon is pinned at 212,200 ±0.15%** across every normal run and device. The firmware's
Σtnorm → gallons conversion is rock solid, so **all error lives in the acoustic integral** — upstream
of `lFactor`, `vtot`, `flowRateCoefficient`. Computational and calibration-constant hypotheses are
eliminated.

**Unexplained sampling-cadence swing:** 1.15 → 6.51 → 1.25 → 1.51 samples/s across runs with no known
trigger. At 6.5/s it measurably degraded integration self-consistency (that is the iter 4 exclusion).
Proposed **run-validity gate**: flag runs with samples/s outside ~1.1–1.6, computable today from
`tnormCount` ÷ (`eventMeterDelta`/`eventAverageFlow`×60). Would have caught iter 4 automatically.

**ThingsBoard data-integrity bug:** `latest`-value queries for `eventMeterDelta` and `temp_ext_c` are
pinned to junk points with far-future timestamps (observed years 2061, 2069, 2084, 4776). Real points
are correctly server-stamped and reachable by time-range query. **Always ingest run data by time
window, never by latest.** Possibly related to the QLTS ×1000 tiTime bug from Little Acres — common
cause NOT confirmed. Also means TB dashboards showing "current temperature" for these devices display
garbage.

---

## Open threads, priority order

1. **Audit fleet `flowDirection`** — any UNKNOWN unit with degraded signal can invent consumption.
   Highest business impact of anything here.
2. **Add an SNR detector** (`tnormStddev` vs `tnormAvg`) — the only telemetry that distinguishes a
   working meter from a broken one at low flow. `qual` and the error counters do not.
3. **AGC sanity bound** — '549 ran to gain 44 / upamp 2703 while identical units settled at 26 / ~650.
4. **Volume test** (12.5 vs 100 gal at 5 gpm) — settles start/stop, ~25 min.
5. **Low-flow replicates** if the k(Re) curve is needed to precision — 3× each at 1 and 0.5 gpm.
6. **Empirical dReading/dT** — must be measured, not derived. Blocked on rig temperature control.
7. **What drives sampling cadence.**
8. **'549's point-A one-run integral collapse** at 7 gpm, which never recurred.

## Pre-Wyse-ship list

1. **Fix '423 external temp sensor** (dead, flat 0.0).
2. **Set `waterFlowDir`** on all three — now a correctness fix, not cosmetic.
3. **'549 decision** — biased −1.0% at high flow and hard-fails at 0.5 gpm. Does it ship?
4. `resetMeterVal` — clear accrued test gallons (currently 453 / 453 / 435).
5. Strip test attributes (`lFactor`, `attrKey`, `pipeScan`).
6. Fix the Flow Testing GROUP FW lever.

## Mechanics

- TB REST `https://thingsboard.dunelabs.ai`, header `X-Authorization: Bearer …`. Tokens last 2.5 h.
  **Getting a fresh one requires an explicit TB logout or an incognito window** — closing Chrome does
  not clear localStorage, so the app silently re-auths with the stored token and re-copying yields the
  same value. Verify with
  `JSON.parse(atob(localStorage.getItem('jwt_token').split('.')[1])).sessionId`.
- Write etiquette: preview → Bruce's OK → write → verify → log to `tb_write_log.txt`.
- Bench check-ins are event-driven (`radioOnEventEnd`); a short flow blip forces one.
- Iteration loop: measured volume → `eventMeterDelta` + tnorm → `Lf' = √(4+(Lf²−4)·(Meter/True)²)`
  → write attr (×1000, exactly 4 digits, must be > 2000 per bg95.c:4067-4084).
- **The parser sets `dynamicConfig.lFactor = lFactor` at bg95.c:4593 from a local initialised to 0
  (bg95.c:3896), so a downlink omitting `lFactor` reverts the device to the table value.** Removing
  the shared attr is a clean revert.
- `eventTimeout` defaults to 1 hour (bg95.c:92) — keep runs under 60 min to avoid chunking.
- No low-flow cutoff in ST math (`fmaxf(0.f, …)`, measure.c:389); TI owns per-sample filtering
  (measure.c:393) and TI source is not in this repo.
- **Always ask for true volume AND valve-open time.** Assuming either has produced wrong conclusions
  twice this campaign.
- Fo optimization stays PARKED (`fo-optimization-todo.md`). Production baseline = ST 17032 / TI v344.
- Memory: `project_copper_m_2026_08_16.md`, plus `project_pvc_accuracy_2026_08_07.md` (read its 8/8
  CORRECTION block before any K math).
