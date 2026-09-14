# Session prompt — L-Factor Table Optimization (flow testing campaign)

Continuing from 8/8 (session fc6c8bfe). Read memory pvc-accuracy-2026-08-07
first — it has the full transfer-function math, the v342/v343 PVC cal fixes,
the 8/7 4.22gpm fit, and the campaign tooling state. This session = run the
volumetric campaign: ingest check-sheet runs, fit L-factors, maintain the
workbook, and (if granted) apply attr changes between runs.

## THE ITERATIVE LOOP (Bruce-defined, 8/8 — this is the process)

1. USER runs a measured water volume at a steady rate, prompts Claude.
2. CLAUDE reads each device's meterVal/eventMeterDelta for the usage
   event (the BILLING path — includes totalizer effects), analyzes tnorm
   for statistical variation BETWEEN devices (CoV, outliers), gives the
   L-factor change recommendation. Update rule (closed form, also lives
   as a formula in the check sheet): Lf' = SQRT(4 + (AppliedLf^2 - 4) *
   (MeterVol/TrueVol)^2). Sanity-check vs the tnorm-based K fit.
3. USER applies the new lFactor (attr = value*1000), runs next iteration.
4. Repeat until Vol Err inside ~+/-1%; converged value -> Optimized Lf
   table; per-device residuals -> flowRateCoefficient trims.

## The workbook (the campaign's single surface)

"C:\Users\Bruce\Documents\GitHub\L-Factor Optimization Check Sheet v2.xlsx"
(v2 supersedes v1: adds Applied Lf yellow input, Meter Vol/tnorm CoV gray
columns, live Vol Err % + Recommended Lf formulas; times are hh:mm:ss —
minute resolution can't express short high-rate runs)
- Check Sheet: 990 rows (6 sizes x 11 types x 5 rates x 3 iterations).
  Bruce fills YELLOW only (Date, Start, End local hh:mm, True Vol gal,
  Temp F). Claude fills GRAY (Devices n, Mean tnorm, Meter GPM, Err vs
  Ref %, Fitted Lf, Ingested, Status=DONE). Row 2 = worked example (real
  8/7 run). Ref GPM column is a formula — don't overwrite.
- Lf Tables: CURRENT lFactorsM + pipeDiameters (transcribed from
  DuneFW_L5_2 measure.c @ efe997a — verify unchanged before first use),
  OPTIMIZED Lf (P40-3/4 = 2.135 provisional single-point, has cell note),
  DELTA (live formulas). Update Optimized as fits land; Delta sheet IS the
  eventual firmware change order.
- Rigs: combo -> TB device names. PVC-3/4 = 70273063/72714423/70268147/
  72718549/72722129/75372175 — now in dedicated tenant-owner group
  "Flow Testing" (79b9d5f0-9343-11f1-a1a6-391af391818e), 6-meter series
  manifold, all on 17028/v343. Campaign attrs (lFactor/frc/piezo) scope
  to Flow Testing, NOT FOTA Test-Cust. Board2 79454912 = Cu-M-3/4 (VERIFY: TB
  says fwVer 17029 + TI 340, rev unknown, silent on COM4 — ask Bruce
  before using). Wyse trio = PEX-3/4 ('055 = acoustic outlier, EXCLUDE
  from fits; pipetype attr X-vs-x unverified, 4% if wrong).
- Editing: openpyxl; workbook uses fullCalcOnLoad; NO LibreOffice on this
  box (xlsx-skill recalc.py fails AF_UNIX on Windows) — verify formulas
  by openpyxl spot-checks; never overwrite formula columns M or Delta.

## Fit math (derived+validated this week — don't re-derive)

flow = K * tnorm(ps);  K = C * D^2 / sqrt(Lf^2 - 4);  C = 3.50729e-4
(from vtot 58639.8242 in/s = ~23.5C water; flow ~ c(T)^2 — record temp,
~1%/4F). Sensitivity dQ/Q = -[Lf^2/(Lf^2-4)] * dLf/Lf (= -4.8x at 2.25,
-8.4x at 2.13) — use for error bars. Fit Lf per (size,type) on 3/5/10gpm
plateaus ONLY (Re ~ 3900*Q(gpm) in 3/4" — 0.5gpm laminar, 1gpm
transitional): the 0.5/1 rows measure the profile deviation k(Re)
(prediction: they read HIGH vs turbulent fit, up to +15-25% at 0.5) and
are excluded from Lf. Per-device residual spread -> flowRateCoefficient
trims (8/7: 72718549/72722129 read ~-3% vs siblings). The fit uses RAW
tnorm vs reference — on-device Lf/frc during the run cannot contaminate
it. OPEN: confirm the group's current flowRateCoefficient (the 8/7 run
implied an effective 1.0955 trim on M constants — origin unconfirmed);
end state should be table-Lf + frc=1.0 + per-device trims.
Volume cross-check per run: meterVal/eventMeterDelta vs true volume
includes the +6.7% totalizer cadence bug (real ~64 samples/min vs
hardcoded rate/60-per-sample) — report it separately, don't fold into Lf.

## Ingestion mechanics (hard-won)

TB MCP (mcp__095ccaad...) read tools; local time = UTC-7 (PDT). Flow
records = 1/s tofNorm+flowRate, buffered on-device, land at next check-in
(~10min on the bench group) with UNIX ts. TB dedups same-ms ts (dup
"pre-event pair" rows hide samples). Pull windows with
tb_get_timeseries_range; >50k-sample pulls get persisted to a file —
analyze with python (NEVER paste big dumps into context). Plateau
selection: drop ramp/tail samples (first/last below-plateau values);
detect exact edges from tnorm. Latest-values endpoint fabricates
{ts,value:null} for keys that never existed. Epoch anchor: 2026-08-07
00:00Z = 1786060800000 ms.

## TB writes (if Bruce provides the scoped JWT this session)

Scoped user plan: PE Generic Role = DEVICE ATTRIBUTES read+write only,
Group Roles = engineering groups only. Write via REST:
POST /api/plugins/telemetry/DEVICE/{deviceId}/SHARED_SCOPE with
X-Authorization: Bearer <jwt from tb_token.txt>. ETIQUETTE (org policy,
non-negotiable): preview every write as explicit device/key old->new and
wait for Bruce's yes; batch = one preview table; keep a write log file
(device, key, old->new, timestamp) in the session scratchpad and echo it
at session end. Campaign writes are bench-group only: lFactor,
flowRateCoefficient, piezo (the PVC 45-deg pair A/B is still pending —
pair change invalidates Lf fits on that rig, they must land together),
pipesize/pipeType (single-char values only: "P" not "PVC" — parser drops
multi-char silently, bg95.c:3996).

## Guardrails

- v343 = bench stack; fleet levers stay untouched. msp335/342 never
  target. No firmware builds unless Bruce asks (table changes ship as
  attrs first, compiled table later).
- Series manifold = all devices see identical water; device deltas within
  a run are real meter differences.
- The Shady 777 / post-TIFOTA-records-vanish investigation is a SEPARATE
  session (shady-777-tofnorm-handoff.md) — don't pull that thread here,
  BUT its outcome gates trusting flow-record timestamps; if ingested
  windows come back empty on a unit that check-in'd, suspect that bug
  before suspecting the run.

First actions: verify workbook opens clean (Ref GPM example computes),
ask Bruce for any filled rows + the flowRateCoefficient value (+ scoped
JWT if ready), then ingest and fit whatever's ready.
