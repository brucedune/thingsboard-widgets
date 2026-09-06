# Laminar (low-Re) flow correction — spec for ST Rev 17049

Status: APPROVED by Bruce 2026-09-01 ~23:10 PT ("Approved - build 17049,
will do 2 gpm run in the morning"). **BUILT** 23:2x PT: 107,656 B (+1,532 B
over 17048; 4,984 B headroom), sha `6a929316…`, zero warnings. NOT yet
committed / uploaded / rolled — Bruce's call. Implementation notes:
- Status key is `lamCorrMax` (permille of flow removed since last report,
  0 = never engaged) rather than the spec's `lamKMin` — same information,
  zero-init-friendly. Expected ~99 after a 0.45 gpm run, 22 at 2 gpm, 0 at 5.
- lamCorr=0 short-circuits before any float work and multiplies by exactly
  1.0f -> bit-identical to 17048 by construction.
- Non-monotone knot set (attrs land one at a time) -> kNorm 1.0, not garbage.
- Host replica of the arithmetic: Re 1868/4065/20427 at the three knot
  flows (1% low vs 1886/4102/20613 because the 5-point nu table reads
  9.668e-7 at 22 C vs the handoff's 9.565e-7 — Re 1%, flow <0.1%).
  Tonight's 0.445 gpm/20 gal run replayed: +12.2% -> **+1.49%**.
- Decision 3 (thresholds see corrected flow): implemented as spec'd; Bruce
  did not object.
- **2 gpm pin run 9/2 09:12 (20 gal ref, method unstated):** trio +0.92%
  (clean pair ~-0.2%, '3063 +3.2%) vs +2.31% predicted by ln-linear between
  knots 2-3. Profile develops faster: kNorm ~0.99-1.0 by Re 8000. **Set
  `lamRe3=10000` via attr** (no rebuild) -> 2 gpm correction -1.0%, 5 gpm
  untouched. Knot 2 (Re 4102 / 0.9616, from 8/30) still to be re-pinned
  with a 1 gpm run on this firmware.

**PEX-A 3/4" (dia 0.681) 1 gpm run 9/5 17:45 (20.642 gal, 20.1 C, Re ~4,780,
lamCorr off, Lf 2.225):** four-unit mean +3.10%; after removing each unit's
stable 5-gpm offset, +1.91% incl. +0.74% cold-water -> laminar-only ~+1.2%,
k ~0.988. Copper knot 2 (Re 4102, 0.9616) would over-correct PEX-A by ~2%:
**the k(Re) knots are material-specific** (mechanism via d is not enough).
Provisional PEX-A knot 2: Re 4800 / 0.988. **0.5 gpm run 9/5 19:01 (20.469
gal, 20.0 C, Re ~2,066): offset-corrected mean +11.89%, laminar-only +11.1%
-> k 0.900 = copper knot 1.** PEX-A curve: (2066, 0.900), (4780, 0.988),
(10000, 1.0) — same floor as copper at Re 2k, much faster recovery. Attr
set to trial: lamRe1=2066 lamK1=9000 lamRe2=4780 lamK2=9880 lamRe3=10000
lamK3=10000 extTempBias=4.0 lamCorr=true.

## Objective
Remove the velocity-profile over-read at low Reynolds number on the ST
flow computation, fitted to the curve measured on the bench trio, with
**zero effect at and above the 5 gpm anchor** and **zero effect on any
device that does not opt in**.

Measured (copper-m-flow-handoff.md, 17044/v361, 3/4" M, wetted 22 C):

| Re | true flow | over-read | k = true/metered | k normalised to anchor |
|---|---|---|---|---|
| 1886 | 0.463 gpm | +11.06% | 0.8923 | **0.9010** |
| 4102 | 0.995 gpm | +4.05% | 0.9524 | **0.9616** |
| 20613 | 5 gpm | +0.07% | 0.9904 | **1.0000** (anchor; Lf absorbs it) |

Cross-checks: 9/1 22:06 run, 0.445 gpm (Re ~1700), trio mean +12.2% ->
k_norm 0.891 (curve extrapolates ~0.895). 8/26 0.5 gpm +10.96%. Invariant
across two cal rebuilds -> physics, not calibration. The textbook turbulent
relation does NOT fit (-7.6% at Re 1886), so the table IS the model.

## Design
`flow_out = flow_raw * kNorm(Re) * flowRateCoefficient` in `flowOfTof()`
(measure.c), applied to the magnitude before the sign is restored.

- **Re** = 4Q / (pi d nu), Q = `flow_raw` (uncorrected metered flow — a
  stable monotone proxy; kNorm is smooth so the error from not iterating
  is <0.1%), d = `pipeDiameters[DIA_IDX][type]` (inner, inches -> m),
  nu = nu(T) kinematic viscosity of water.
  Sanity: 0.463 gpm, 0.811", 22 C (nu 9.57e-7) -> Re 1886. Matches.
- **kNorm(Re)**: piecewise-linear in ln(Re) through 3 knots
  (default = the measured curve above). Below the lowest knot: HOLD
  kNorm(Re_min) — do not extrapolate toward the parabolic 0.75 limit,
  which was never measured. At/above the anchor knot: exactly 1.0.
- **Temperature** for nu(T) — Bruce's decision 9/1 22:50: use the
  EXTERNAL clamp-on probe minus its bias to true water temp; if the probe
  is dead, fall back to the INTERNAL NTC minus the typical internal-vs-
  external gap. Measured basis —
  EVERY recorded water-temperature note vs probe reads at that time (TB
  flow-record temps; ext probe on '3063/'8549, '4423 dead):

  | run | measured water | ext probe ('3063 / '8549) | ext bias | int bias |
  |---|---|---|---|---|
  | 8/7 16:20 PT, PVC rig, 72 F=22.2 C, hot afternoon | 22.2 | 30.7 / 30.2 | **+8.5 / +8.0** | +8.8 / +8.1 |
  | 8/26 0.5 gpm end-of-run (handoff) | 22.7 | 26.17 / 25.70 | **+3.5 / +3.0** | — |
  | 8/27 T1, 50 gal in 9.7 min | 19.4 | 25.2 / 24.7 | **+5.8 / +5.3** | +8.2 / +7.6 |
  | 8/30 0.5 gpm, 43-min run | 22.0 | 24.9 / — | **+2.9** | +4.7 |
  | 8/30 1.0 gpm, 20-min run | 22.5 | 25.0 / 24.7 | **+2.5 / +2.2** | +3.5 / +3.1 |
  | 9/2 2.0 gpm, 10-min run, Bruce 20.0 C | 20.0 | 22.7 / 22.2 | **+2.7 / +2.2** | +2.3 / +1.6 ('4423 int +1.9) |
  | 9/3 5.0 gpm PEX-A, 10-min run, Bruce 18.0 C | 18.0 | 22.2 / 21.6 | **+4.2 / +3.6** | +4.6 / +3.7 ('4423 int +4.0) |
  | 9/4 5.3 gpm PEX-A, 9.6-min run, Bruce 18.8 C | 18.8 | 23.8 / 23.2 ('8538 22.7) | **+5.0 / +4.4** ('8538 +3.9) | +6.3 / +5.6 ('4423 int +5.9, '8538 +5.3) |

  Reading: the clamp-on sits behind rubber and starts at pipe/ambient
  temperature; flowing water pulls it toward water temp with a settling
  time of order 10 min (copper handoff L648: "temp fell 26 -> 23.7 C
  during EVERY run"). Settled bias = **+2.2..+3.5 C** (Bruce's 2-3 C).
  Unsettled (short run, hot bench) = +5..+8.5 C. The INTERNAL NTC does
  not settle (it never touches water): +3..+9 C above water under flow,
  even though it tracks the external within 0.2 C when everything is at
  ambient (5-day bench medians).

  Consequence for the correction: low-Re events are LONG by nature
  (20 gal at 0.45 gpm = 40 min), so by the time the correction matters
  the probe has settled and ext - 2.5 is good to ~+/-1 C (~0.2% flow).
  Short events are turbulent and the correction is ~0 there regardless.
  Fallback int - 2.8 is only right at ambient; under flow it can be 5 C
  off -> Re 12% -> ~1% flow at Re 1886. Acceptable versus the 12% being
  removed, but '4423-class devices should be flagged, not trusted.
    * `extTempBias` attr, default **2.5 C** (settled value ON COPPER).
      **Material-dependent (Bruce 9/3): PEX's wall has far higher thermal
      resistance than copper, so the clamp-on probe couples less to the
      water — 9/3 PEX-A 10-min run at 18.0 C read +3.6/+4.2 vs +2.2/+2.7 on
      copper for the same duration. Working values: copper ~2.5, PEX ~4.0
      (n=1; refine with more PEX runs). No firmware change needed — set the
      attr per pipe material with pipeType; a later rev could take the
      default from the pipe table.**
    * `intTempBias` attr, default **2.8 C** (ambient gap + ext bias) —
      known-weak under flow; v2 could use a slow ext-tracking model.
    * validity: probe "dead" = raw ADC 0 or converted < 1.0 C or > 60 C
      ('4423 reports exactly 0.0); internal same band; if both invalid
      use `waterTempC` attr (default 20).
  T_water = ext_c - extTempBias  |  int_c - intTempBias  |  waterTempC.
  Sensitivity: 1 C -> Re ~2.4% -> flow ~0.2% at Re 1886. A wrong 2.8 C
  fallback is therefore <0.6% flow. Status key `lamTempSrc` (0 ext /
  1 int / 2 fixed) so the source is visible per report.
  nu(T): 5-point table 5/15/25/35/45 C (1.519/1.139/0.893/0.724/0.603
  e-6 m2/s), linear between.
  NOTE: TB "latest" temp values carry a bogus far-future timestamp
  (BADTS ~year 4700) on all three units — same bad-tiTime class as the
  eventMeterDelta skew; the hourly aggregates are fine. Logged, not chased.
- **Opt-in**: `lamCorr` attr (0/1, default 0). With 0 the code path
  returns kNorm = 1.0 and flow is bit-identical to 17048. Enable only on
  the WYSE M-3/4 samples until PEX/PVC curves are measured (mechanism is
  material-agnostic via d; the knots are not).
- **Tunable knots** (so PEX/PVC/2-gpm refits need no rebuild):
  `lamRe1,lamRe2,lamRe3` (Re) and `lamK1,lamK2,lamK3` (kNorm x 10000).
  Parser clamps: Re monotone increasing 500..50000, k 0.7000..1.0000,
  k3 forced 1.0000. Defaults = measured curve.
- **Status keys**: `lamCorr` (echo), `lamKMin` (smallest kNorm applied
  since last report x 1000; 1000 = never engaged) — makes "was it on and
  did it bite" visible per report.
- **Order of operations** unchanged otherwise: kNorm then
  flowRateCoefficient then event/threshold logic sees the corrected flow.

## Scope
ST only (`DuneFW_L5_2`, Rev 17049): measure.c (~60 lines: nu table,
Re, kNorm, hook), bg95.c (10 attr parsers, pattern = `flowRateCoefficient`
at bg95.c:4315), bg95.h (dynamicConfig fields + defaults), status_report.c
(3 keys). No TI change. Flash headroom 6.5 KB — fits. Not in scope:
per-device spread correction, probe-temperature Re, PEX/PVC knots.

## Constraints / decisions for Bruce
1. Temperature source: DECIDED (Bruce) — external probe minus bias,
   internal NTC fallback, fixed attr as last resort. See Design.
2. The curve has NO point between Re 4102 and 20613 (1 -> 5 gpm). The
   interpolation there is unpinned; a **2 gpm x 20 gal reference run**
   before enabling on WYSE samples would close it. Recommend doing it.
3. Event thresholds (`minEventVolume`, `eventLowFlowThres`) will see
   ~10% lower flow at Q1 with correction on. Probably desired (they were
   tuned against over-read flow), but it is a behaviour change to note.

## Success criteria (bench trio, references WITH measurement method)
- lamCorr=0: flow, events, meterVal bit-identical to 17048 on the same
  water (regression on one unit, A/B).
- lamCorr=1 @ 5 gpm x 50 gal: trio mean within 0.3 pp of today's -0.15%.
- lamCorr=1 @ ~1 gpm x 20 gal: trio mean within +/-1.5%.
- lamCorr=1 @ ~0.45 gpm x 20 gal: trio mean within +/-2%. Spread will
  REMAIN ~5-13 pp — the correction fixes the mean, not the scatter; the
  scatter is the open NTEP constraint and is out of scope here.
- `lamKMin` reports ~900 after the 0.45 gpm run, 1000 after 5 gpm only.

## Risks
- Device spread at low Re is untouched (13.5 pp on 8/30, 5.7 pp today).
- Fixed 20 C: a 10 C cold-water site shifts Re -25% -> at Re 1886 that
  is ~-2% flow correction error. Acceptable for WYSE; revisit for fleet
  with probe T.
- Knot attrs are per-device/group shared attrs: a wrong paste corrupts
  billing on that device. Clamps limit the blast radius to 30%.
- Re uses uncorrected flow: at Re 1886 the true Re is 10% lower than
  computed; the slope there makes that ~0.8% flow. Could iterate once
  if the 0.45 gpm result asks for it.

## Verification plan
1. Build 17049, A/B one unit lamCorr=0 vs 17048 on the same event: identical.
2. Enable on trio; runs at 5 / 2 / 1 / 0.45 gpm with stated references.
3. Compare against this spec's criteria; log in the copper handoff.
4. Fleet stays off (`lamCorr` unset). WYSE PEX/PVC need their own knots.
