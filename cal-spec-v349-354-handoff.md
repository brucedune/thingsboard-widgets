# Cal-spec build session summary — for the calibration-function session

Created 2026-08-26 from the bench session (253a7f06). Copy the fence into the cal-function
session. This is the cal/metering work done SINCE cal-function-session-prompt.md (8/17) —
it changes some of that prompt's premises; corrections are flagged.

---

```
CONTEXT: 8/25-26 bench session rebuilt the TI cal function and the ST metering path per
Bruce's "calibration elements" spec (best tnorm noise + TOF stability / no cycle skipping;
dials = PGA gain, env threshold, data filter). Everything below is BUILT, COMMITTED, PUSHED,
and bench-validated to first order on the Flow Testing trio (72718549/72714423/70273063).

BRANCHES/TAGS (both pushed to origin):
  Dune_FW_TI  branch cal-spec, tags v349..v354 (branched from v344; v345-348 are the
              parked Fo-experiment revs on another branch - do not merge those)
  DuneFW_L5_2 branch sf-migration-fix, Rev 17035..17040
  Buckets: msp349-354.bin in dune-firmware-ti; G/17035-17040 in both ST buckets.
  WORKING PAIR (bench-validated): ST 17040 + TI v354. Fleet still on 17037/344.

TI CAL FUNCTION (dune/cal.c), one line per rev:
  v349  env is a SEARCHED dial again: grid = gain rows x env columns {30,35,40,45}, the
        committed OPERATING point is fidelity-measured (v332-v344 tested only the env-30
        anchor and blind-committed 35). Cycle-skip VETO in the commit picker (skips were
        recorded but NEVER used in the pick - a skip-prone condition could win with its
        skip-excluded sd). dns-path skip detection added (was ups-only). envTest walker
        reworked: steps only on crossing-class errors (below-floor/air no longer move env),
        DECAYS back to committed env after 60 clean aggs (was a ratchet - 8/17 walkers sat
        at 41-45 for hours), exhaustion -> gFailedCal + PENDING recal that fires after 60
        quiet aggs or ~1h bounded defer (NEVER mid-flow by default).
  v350  fidelity statistic = successive diffs of DTOF (bills what it measures). The v337
        ups-only proxy mis-ranked anti-correlated crossing errors (double in dtof) and
        over-weighted correlated wander (cancels in dtof). NOTE: committed sd values read
        ~1.4x higher than v344-era numbers on the same pipe - not a regression.
  v351  grid truncation: LOWEST-gain-first walk (prune reference exists before the
        expensive rows) + early conclusion (>=2 complete rows + a skip-free unclipped
        in-band condition <=800ps -> commit). Bad rows die on their anchor column (>2x
        best skip-free sd -> remaining columns punt in 1 raw). Typical quiet cal ~55-70s.
  v352  post-commit AMPLITUDE HOLD: env is a RATIO of envelope peak so uniform scale drift
        self-compensates EXCEPT against the absolute noise floor / DC pedestal. Gain now
        holds the committed amplitude: +-25% hysteresis deadband, ONE code per ADC capture
        (step << band = oscillation-proof), bounds = the amp scan's measured healthy range
        [floor..compression ceiling, BOTH paths] intersect commit+-3, clip guard, railed
        3 captures -> queue quiet-deferred recal. Ordering: amp hold = scale, walker = shape.
  v353  env pick = CENTER of the longest contiguous run of good columns (max margin to
        failure both directions; old knee-backoff was upper-edge-biased). Lower-middle on
        even runs (v331 low-side preference).
  v354  TI-side AGGREGATE VALIDITY: >=2 skip-quantum raw deltas inside one 5-raw trimmed-
        mean window (either path) = mean corrupted -> aggregate emitted as -1. (One skip
        raw is absorbed by trimming; two+ used to ship as valid data.)

ST METERING PATH (Core/Src/measure.c + bg95.c):
  17038 TNORM NOISE GATE: totalization deadband = max(256ps, noiseGateK x MASD) where
        MASD = EMA of |successive tnorm diff|, frozen during events. Gates only when BOTH
        the instant sample and the EMA mean are inside. Kills rectified-noise phantom flow
        (ABS under UNKNOWN direction / negative-clamp under known both give E[flow]>0 on
        zero-mean noise - the '549 240gal/day class). noiseGateK attr: default 2, 0=legacy.
        Telemetry: tnormMasd (live noise floor, ps), gatedAggs.
  17039 SIGNED FLOW: flowOfTof keeps the sign when direction is known (UNKNOWN = legacy
        ABS). Event machine runs on |flow| so reverse draws latch RECORDED events (negative
        flowRate in TB = reversed-install signature). Billing accumulates FORWARD only;
        reverse volume -> new revGal status key.
  17040 the 17039 end-of-event gate still keyed on BILLED volume -> reverse events (billed
        0 < minEventVolume 0.05) produced no summary and no radioOnEventEnd session.
        Gate moved to eventTotalVol (observed |flow|). VALIDATED: '8549 FD-flipped run ->
        revGal 3.779 recorded, meterVal flat, event reported.

CORRECTIONS TO YOUR 8/17 PROMPT'S PREMISES:
  - "unbounded AGC" (your calibration problem #4): there is NO runtime AGC - USS lib AGC
    is compiled out; gain was FROZEN at commit (hmi.c:927 manual PGA). What looked like
    AGC runaway was autonomous envTest setNotMetering recals executing MID-FLOW and
    committing flow-contaminated points (proven 8/17: all three rig units re-cal'd at
    21:20-21:44 with boot counters flat; '8549 committed g44/ua2700 that way). v349's
    quiet-deferred recal removes the mechanism; v352 adds the DISCIPLINED bounded amp hold.
  - '8549's 0.5gpm hard-fail is characterized: at 0.5gpm its tnorm bounces +-4-6k ps
    around a corrupted median with sustained ~26k runs, while manifold-mates read a steady
    ~1900 - device-specific crossing bistability, INVISIBLE to envTest (under its 100ns
    threshold). Your exclusion of '8549 from the k(Re) fit was correct. Data: session
    253a7f06 scratchpad 8549_0817_tnorm.json (full 8/17 day, 9846 pts).
  - The 8/17 0.5gpm run's negative tnorm median on '8549 = its offset re-anchored DURING
    campaign flow after the 21:20 recal (offset stole ~1900ps of flow signal).

INTERACTIONS WITH YOUR ACCURACY WORK (important):
  1. RE-BASELINE before comparing: the rig now runs 17040/354. Your 8/17 numbers were a
     different cal (fixed env 35, ups fidelity) AND a different metering path. Lf slope
     math is unaffected by env choice, but per-device offsets/commits all moved.
  2. The noise gate can zero low-flow readings on noisy units. Clean rig units (MASD
     50-90ps -> gate ~180ps ~ 0.05gpm) are unaffected at your test rates, but for any
     low-flow campaign on a marginal unit set noiseGateK=0 (device attr) for the run.
     tnorm RECORDS are never gated - only totalization - so Sum(tnorm)/gallon analyses
     still work from records regardless.
  3. Committed env now varies per device (30..45, run-center rule). If you model the
     crossing point, read the env telemetry key per device instead of assuming 35.
  4. sd numbers are now dtof-native (~sqrt(2) x old single-path scale) - do not mix eras
     in one fit without the correction.
  5. eventMeterDelta semantics: forward-only since 17039. Reverse/backflow volume is in
     revGal. Your billing-path volume reads are unaffected for normal forward tests.

STILL PENDING ON THE BENCH (not blocking you, but know the state):
  - Forward-billing regression (50-gal truth run on '4423/'3063 at 17040/354) - REQUIRED
    before 17040 becomes fleet target and before any new accuracy campaign numbers count.
  - Overnight soak: walker decay, amp-hold cadence, deferred-recal timing.
  - The '8549 crossing-bistability ROOT remains open (envelope shoulder feature ~25ns
    away captures the crossing intermittently at low flow). Candidate work: crossing
    hysteresis / lobe-lock, per-device envelope-shape-derived env anchor. This is the
    natural intersection point with your k(Re)/low-flow thread.

WORKING RULES THAT COST TIME (inherited + new):
  - Range-query TB, never trust latest (fossil timestamps pin latest forever).
  - TB tokens: Bruce pastes short-lived JWTs (~2.5h, no refresh) - request via HIS
    PowerShell login one-liner; never handle passwords.
  - Always ask for true volume and flow on rig runs.
  - Fleet rev ledger: v345-348 = Fo experiments (test pool only); v349-354 = cal-spec
    branch; ST 17033/17034 = Fo; 17035-17040 = sf-migration-fix branch. Check tags before
    taking a rev number.
```
