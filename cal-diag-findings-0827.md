# Cal-diag findings — 8/27 rig day (v355/17041 baseline + 17900/390 frozen instruments)

Bench session, 2026-08-27. For the cal-function session. Spec: `cal-diag-v356-spec.md`.
Procedure + run log: `rig-phase1-baseline-procedure.md`. All raw pulls in bench-session
scratchpad (`ef11c2cb.../scratchpad/`: t1_run_*.json, diag_run1_*.json, profile_run_*.json,
4423_healthy_baseline_adccap_0827.json = 489-sample adcCapture envelope pair).

## HEADLINE: the failure family is CYCLE SKIPPING — measured, not inferred
'3063, 19:39-19:43, FROZEN build, STILL WATER, fresh commit: 122-agg continuous error
burst with **errDtofX = errSplitX = 5 = exactly ONE carrier period (Tx f0 = 2 MHz,
500 ns)**. Envelope healthy throughout (errUpamp 74 = ~1184 counts), qual read 100 while
122 errors banked, both dtof and up/dn split displaced together (one stream skipping).
Self-cleared in ~2 min with ALL adaptation frozen. GEN1 déjà vu confirmed by measurement
— GEN1 shipped tnorm glitch filters (hold prior value until waveform stabilizes, toggle
cal states if stuck; always recovers eventually). A ±half-cycle rejection band on dtof
would have eaten this entire burst: one-cycle outliers are perfectly identifiable
(±500 ns quantization).

Second error class also present: scattered sub-cycle jitter singles (errDtofX=1,
100-200 ns, barely over dthres — dthres 100 ns = only 1/5 cycle at 2 MHz). '3063 had a
24-agg jitter burst at 18:58 (recovered unaided, frozen).

## Findings ledger (all 8/27)
1. **T1 terminal collapse ('4423, v355)**: clean 428 s @ 5.2 gpm -> dead in 1 s
   (tnorm 18638 -> 321 -> silence), blind through final 142 s of flow, recovered ~35 s
   after shutoff. ONLY err_cross fired (36; noSig/sigWeak/sigHigh/tofReject all 0),
   upamp ROSE 824->1044. Walker walked env just 35->37 (clamp fine, collapse anyway).
   NOT reproduced on T2. Pre-snapshot, so unclassified — but cycle-skip is now the
   prime suspect (matches signature: signal present, crossing wrong).
2. **Onset blindness reproduces UNDER FREEZE** -> environmental, not adaptation.
   T1: 8/15/28 s of clean ZEROS (no error counters at all) during proven full flow.
   Evening run: '8549+'4423 blind ~13 s at draw start (clock skew initially disguised
   it as a tail difference — use edge-to-edge SAMPLE COUNTS, never cross-device ts).
   Volumes reconcile exactly (1.5 gal gap = 13-14 s x 7 gpm). NO error signature ever.
   Distinct from the burst class?? Open: is onset blindness cycle-skip too (skip ->
   err -> no record) or measured-as-zero? (Verbose round / UART answers.)
3. **Freeze experiment verdicts so far**: bursts + onset blindness both occur frozen
   (environmental); recovery happens unaided (walker not needed for recovery); the
   walker was only ever REACTING to skips. v349-355's walking = symptom management.
4. **Varied-profile tracking (7.5->0.25 gpm, frozen, '8549/'4423)**: totals agree
   +0.6%; registers to 0.28 gpm; ZERO noise-gated samples; ZERO errors through all
   transitions. Low band 0.4-1 gpm: '4423 reads ~7% above '8549 (known Copper M
   low-flow over-read family, profile physics).
5. **'3063 38-min hang (19:00-19:38)**: after a healthy session, NO records, NO radio,
   NO watchdog rescue (fed-WD hang), no crash/fault counters. Cleared by PIN reset
   (bootReasonFlags=4) at ~19:38 — all three units PIN-reset within a minute (Bruce
   at bench; physical action unconfirmed — ASK). Open anomaly; 10-min heartbeat now
   makes recurrence visible within minutes.
6. **FLEET BUG (task chip filed): wedge-heal reboot loses since-midnight register.**
   meterVal flash-saves ONLY at local midnight (meter.c:185) + before ST-FOTA reset
   (main.c:353). The 17036 wedge-heal reboot (main.c:451) does NOT save first ->
   every self-heal reboot erases up to 24 h of billed water; sick-flash units
   (meterFlash already stale) lose multi-day. Bench proof: all three lost 13-18 gal
   today (flash held pre-FOTA values). Fix is cheap (best-effort save; read-path
   wedge means append likely lands even if verify fails).
7. Cal commit repeatability: FIVE consecutive identical commits across all three
   units today (bestEnv 35, bounds 30-45, gain 29-30). The operating point is not
   the variable; the acoustic environment is.
8. TI agg rate may exceed 1 Hz record rate ('3063's 18:58 burst hid between recorded
   seconds) — verbose-round question.

## Current bench state (end of 8/27)
- Trio on 17900/390 (frozen + snapshot), config: checkInPeriod=10 min,
  radioOnEventEnd=FALSE (decoupled — Bruce's call after the hang), recordNoneventFlow
  true. All healthy, env 35, 10-min heartbeat confirmed.
- Registers rebased by the reboots: 365.944 / 374.391 / 381.736 (~19:50). Historic
  loss noted in ledger; bench-irrelevant, fleet lesson in finding 6.
- adcCapture healthy-baseline pair banked for '4423; re-arm = false->true toggle.
- Rev ledger: 17900/390 = quarantine diag (never fleet); branches cal-diag in both
  repos; fleet ST recipe = make DEBUG=0 OPT=-Os (Debug no longer fits 110K).

## What the cal session should do with this
- Design the v356+ fix as a three-rung dtof-domain ladder (Bruce 8/27: hold must be
  bounded to a FEW SECONDS — anything longer is fabricating water):
  1. SKIP CLASSIFICATION as the hold's ENTRY GATE (NOT a corrector — Bruce 8/27
     killed correction: actual received period is transducer resonance, 1-2% off
     the nominal 500 ns -> 5-10 ns residual per sample vs 18.5 ns full signal at
     5 gpm; at low flow the residual swamps true tnorm entirely. Corrected samples
     would bill fiction; rejected zeros under-bill honestly). A sample displaced by
     ~N x period = high-confidence "water present, measurement aliased" — cleaner
     hold justification than the non-monotonic heuristic alone. Count it visibly
     (skipClassCnt).
  2. HOLD on skip-classified / non-monotonic-with-envelope samples, last-good rate,
     <= a few seconds (HARD budget), separate accounting (heldGal — NTEP).
  3. FORCE RE-ACQUISITION — Bruce's timing spec (8/27), the core of v356:
     - THREE ATTEMPTS TOTAL, 3 s each (self-heal IS attempt 1 — Bruce 8/27):
       - Attempt 1 (t=0-3 s): SELF re-acquisition — do nothing, many glitches
         self-clear; hold covers.
       - Attempts 2-3 (t=3-9 s): env spiral, +-5 LOBE-SCALE steps (not the old
         +-1 fine steps — lobe mis-selection needs a lobe-scale move; direction
         pattern e.g. +5 then -5, cal session's call), amp-good gate per the
         Phase 3 ordering (amp bad -> fix scale first).
     - Total re-acquisition = 9 s (3 x 3 s), hold hard-capped at 10 s.
     - 3 failures -> KILL THE EVENT: close it, stop holding, register honest
       zeros, revert env to committed (spiral results PROVISIONAL, never become
       the commit — the v349 flow-contaminated-commit rule), set a visible
       reacqFail flag / counter.
     - Success criterion per attempt: 3 consecutive clean aggs (same constant as
       the existing metering-confirm, CAL_METERING_CONFIRM_AGGS).
     Long bursts (the 122 s class) cost at most ~10 s of held water + honest
     zeros after the kill — bounded, accounted, visible.
  Walker demoted behind all of this to slow envelope-drift duty only.
- Explain onset blindness (UART/board-2 or verbose build): skip-with-no-error vs
  measured-zero.
- '4423 remains the reproducible collapse article; '3063 now the reproducible
  burst article. Both frozen and instrumented.

## v356/17042 DEPLOYED + FIRST VALIDATION (8/27 ~23:00, random-flow test)
Ladder live on the trio (branches cal-reacq: TI 8a580c6, ST dab248e; buckets
verified; 6 FOTA chunks now). Results of the first random-flow exam (~122 s
varied event @ ~2.9 gpm avg):
- 4 reacq episodes across '8549/'3063, ALL spiralOk, reacqFail 0, envWalk 0
  after (provisional reverts hold), blindness per episode = seconds (vs the
  122 s frozen-build hole from the same class yesterday).
- FULL WORST-CASE CHAIN on '3063: bursts -> 2 spiral recoveries -> total agg
  outage mid-flow -> ST hold bridged exactly its 10 s cap (heldGal 0.528,
  never meterVal) -> 12 s kill closed the event (113 s vs siblings 122-124).
  Shortfall now ACCOUNTED instead of silent.
- '4423 clean run: heldGal unchanged (false-hold acceptance PASSES on clean
  water; the boot-era 0.134 false hold remains the known patch item).
- NEW ERROR SUB-CLASS: split-only one-cycle skip with dtof CLEAN
  (errClassBits=2, errSplitX=5, errDtofX=0) — dominant signature tonight on
  both erroring units. The absolute-TOF cross-check rejects samples whose
  correlation dtof was valid -> these rejects may be BILLABLE. Cheap
  registration win candidate: accept (or separately classify) dtof-clean/
  split-tripped samples. CAL SESSION QUESTION.
- DESIGN NOTE: TI ladder is aggregate-driven — a total-silence outage
  freezes it mid-episode; the ST hold+kill owns that face (proven tonight).
  Division of labor: erroring stream -> TI ladder; dead stream -> ST hold.
- WATCH: '3063 is 2-for-2 on stream stoppages (38-min hang; tonight's 12 s+
  outage) — outage-prone unit, debugger candidate.
- Patch-rev (17043/v357) list: false-hold suppression after boot/TI-restart;
  attr-tunable ladder (reacqEnvStep/attempt timing/holdCap + enable kill-
  switches — REQUIRED before any fleet consideration); dtof-clean/split-
  tripped sample disposition per cal session's verdict.

## Second random-flow set (~23:15) + END OF NIGHT STATE
- '8549/'3063: 7.94 vs 7.99 gal (0.6%%), 150/149 s, +2 spiral recoveries each
  (now 4/4 spiralOk apiece, 0 fails), heldGal unchanged. Second consecutive
  tight-parity run on the reacq stack.
- '4423: event SHORT 132 s / 6.17 gal (-1.8 gal vs siblings), 2 episodes
  entered / 1 resolved at report (ep2 in-flight at 23:16), errBurstMax 6,
  qual read 0 mid-burst (first honest qual flag ever). All errors split-only
  one-cycle class. Ep2 resolution readable in morning reports (counters are
  cumulative; no watcher needed overnight).
- STRUCTURAL GAP NOW VISIBLE: the ERRORING-stream face gets NO hold (stream
  alive -> lastAggMs updates -> no starvation). Dead stream -> hold+kill
  (proven); erroring stream -> bounded only by ladder landing speed. THE
  split-tripped/dtof-clean billability verdict closes this whole loss class
  at the source if it lands YES — highest-leverage open question.
- Night scorecard: 10 episodes entered trio-wide, 9 spiral-resolved, 0
  failures, every loss bounded and accounted.

## MORNING PICKUP (8/28)
1. Read '4423's overnight reports: ep2 outcome (SpiralOk 2? Fail 1?), any
   overnight episodes/holds on still water, heldGal values unchanged?
2. 50-gal truth regression on 17042/356 (marked vessel + stopwatch, ask
   Bruce truth per standing rule) — the billing acceptance gate.
3. Decide patch-rev 17043/v357 scope: false-hold boot suppression, attr-
   tunable ladder + enable switches, split-tripped sample disposition.
4. Seed the cal session with THIS FILE for: split-tripped/dtof-clean
   billability verdict (TI internals), onset blindness mechanism, '3063
   outage pattern (2-for-2), '4423 on debugger candidacy.
5. Fleet items pending elsewhere: wedge-heal register bug (task chip),
   cohort 3 / split-lever decision still gated on ST17040+TIv344 rig test.
Trio config: 17042/356, checkInPeriod=10, radioOnEventEnd=false,
recordNoneventFlow=true, adcCapture consumed on '4423 (re-arm false->true).
Registers (23:15-ish): 375.862 / 382.637 / 390.546.

## 8/28 MORNING — THREE SEPARATED ISSUES (Bruce: keep separated; config UNCHANGED:
## checkInPeriod=10, radioOnEventEnd=FALSE)

ISSUE 1 — REACQ LADDER (v356/17042, bench validation): WORKING. Lifetime: ~13
episodes today, all but one spiral-resolved, reverts clean, heldGal stable.
Open: (a) '3063 long-burst class still costs water (22-agg DOUBLE cycle skip,
errSplitX=10 — first 2-cycle observed — cost ~0.9 gal of a ~1 gal run; erroring-
stream face has no hold by design, ladder-speed-bounded); (b) FAIL-COUNT PUZZLE:
22 consecutive errors should exhaust 3 attempts by agg 9 and book reacqFail —
'3063 shows 0 fails (agg-stream pause mid-episode suspected — the known freeze
case); (c) patch-rev items: false-hold boot suppression, attr-tunable ladder +
enable switches, split-tripped/dtof-clean billability verdict (cal session).

ISSUE 2 — AWS INGEST (task chip filed): batches from backlog drains arrive LATE
(tens of minutes) and UNEVENLY, some possibly lost. Per-device asymmetry: '8549
0-for-3 batches landed; '4423/'3063 arriving late. NOT a hard size cap (06:33
full-size batch landed). Evidence ledger: scratchpad batch_ledger.txt. Next:
CloudWatch on telemetry2 rule, diff a LANDED vs VANISHED timestamp. Likely the
'2490-class fleet mystery.

ISSUE 3 — RADIO CADENCE/LIMITER (connmgr): overnight 23:15->06:32 silence =
SOLVED: RADIO_OVERUSE_CNT_THRES=10/UTC-day hard cap (connmgr.c:373,402);
radioOnEventEnd=true is the ONLY exemption (gate bypass AND no counting). Our
19:28 flip to false re-armed counting -> budget burned by 23:15. Also explains
'3063's 8/27 38-min "hang" (hit cap early after busy morning) — that mystery
likely CLOSED. Still open: daytime gaps at cnt=3 (sessions 16-19 min apart then
30+ min stall on a 10-min period) = second gate unpinned, wake-scheduling
suspect; clean 10-min beats yesterday all ran under radioOnEventEnd=true.
FLEET NOTE: limiter + exemption interplay explains historical device-silence
patterns read as failures — ops doc line warranted.

## 8/28 ~11:48 — ROLLBACK TO 17041/355 (Bruce: 'very unstable'; A/B in progress)
During late-morning 17042 testing: '4423 MISSED an entire test run (no
registration; RAM state lost to the subsequent mag, flash-buffered records may
still surface via the drain queue); Bruce observed general instability; magged
all three ~11:48 (forensics: zero crashes/faults — behavioral, not a FW crash)
and rolled back. All three on 17041/355 by 11:56, fresh identical commits.
HYPOTHESIS (the spec's own risk row: 'recovery search perturbs the measurement
it is fixing'): 17042's mid-flow +-5 env spirals perturb capture (env 40/30 !=
35 quality), episodes re-arm after 30 cleans -> burst->spiral->perturb->burst
CHURN on long noisy runs = observed instability; possibly '4423's missed run.
A/B DECIDES: instability persists on 17041/355 -> environmental; disappears ->
ladder implicated -> patch direction: NO mid-flow spiraling (spiral only at
no-flow / after longer self-heal; longer re-arm; or hold-and-wait per GEN1).
Registers rebased by mags: 362 / 370.403 / 377.793.

## 8/28 ~13:18 — TRIO ON FLEET PAIR 17037/344 (triangulation baseline set)
Down-rev clean; all three committed identically AGAIN (gain 29, env 35) — 3rd
firmware generation, same operating point. CORRECTIONS from the afternoon chase:
- '4423 "stuck Calibrating" on the down-rev = REPORTING ARTIFACT (Bruce's call):
  boot session closes before the commit lands; TB wears stale state until the
  next contact. Wake event proved it (registered 1.696 gal, Metering, gain 29).
  FLEET NOTE: transient "Calibrating" states in ops are partly this artifact.
- "Rig-wide noise floor jump" WITHDRAWN: elevated tnormMasd/tnormStddev at
  post-event report instants = the known 17038 post-event EMA contamination;
  '3063 quiet-water stddev read 24 (pristine) minutes later.
- "v344 can't cal marginal units" RETRACTED (was the mixed-pair transition).
- Wake-event parity on fleet pair: '4423 1.696 vs '3063 1.693 (0.2%); '8549
  (still on 17041 at that moment) 1.80 (+6%, short-draw edges).
REMAINING GENUINE ANOMALY of 8/28: '4423 MISSED TWO ENTIRE RUNS (~11:3x-12:45
era) while nominally Metering, across 17042 AND 17041. Time-correlated, not
firmware-correlated. Next: triangulation run on 17037/344 — if '4423 meters it,
the anomaly is pinned to the late-morning window -> what changed at the bench
11:30-12:30? ('4423<->'8549 position swap remains the decisive unit-vs-position
discriminator if it recurs.)

## 8/28 pm — QLTS x1000 CONNECTION TO ISSUE 2 (Bruce's notes; chip filed)
The QLTS/NTP-fallback bug (300a8225) stamps records at unix-seconds x 1e6 on
UNFIXED lineages -> ingest layers reject absurd-epoch payloads -> "records
uploaded but missing." Unfixed tips: main, next, e-prod-17003, uart-only —
uart-only = the 17028-era fleet firmware = the '2490-class devices. LIKELY THE
FLEET MYSTERY'S ROOT CAUSE (device-side). Trio firmware (17037+ lineage) has
Fix 2 (84a4e8a8, Rev 17035) — trio stamps are sane — so bench batch-vanishing
needs the POISON-PILL variant: a fleet device's garbage batch erroring the
shared telemetry2 lambda/integration, collateral-dropping concurrent good
batches (explains intermittency + per-device randomness). CloudWatch check now
has a specific target: timestamp-validation rejects / lambda errors from
absurd-epoch payloads at a VANISHED timestamp. Fix cherry-pick to main = chip
task_8b2dbb64 (d7d77fdc = clean single line). Fleet scan signature: devices
with ms-scale unixTimeDrift or ~1e15 tiTime are actively poisoned.

## 8/28 afternoon — MATCHED 4-RUN A/B PROTOCOL (Bruce's parity metric)
A = 17037/344: spreads 2.0 / 10 / 5.2 / 3.5%%; no missed runs; wobbler = '4423
(dev +2/+10/-5/+2.3%%). B = 17042/356: spreads 1.2 / 32 / MISS / 6.8%%; wobbler
= '3063 in an ACUTE phase (15 episodes, 38 errCross in ~30 min; run-3 captured
0.121 of ~2.05 gal while thrashing 6 episodes booked spiralOk — success
criterion passes between bursts while capture never resumes = demonstrated
weakness); run-4 '8549 dipped -6%% (rove continues).
VERDICT: firmware comparison UNDERDETERMINED — acute phases not randomized
across series ('4423's acute hour fell on 17041/17042 this morning, '3063's on
series B). PROVEN: a roving hours-long acute acoustic state visits one unit at
a time, costs edge water / whole runs on EVERY firmware generation; 17042 is
the only build that can SEE it (episode/error counters).
BANKED: '3063 boot-era envelope (120-sample pair, 3063_acute_burst_adccap_0828
.json); armed ACUTE-window capture consumed ~14:33, waveform arrives next beat.
NEXT: (1) pull acute envelope + compare vs '4423 healthy baseline; (2) SWAP
TEST on the sick unit (unit vs position); (3) patch spec v357: false-hold
boot suppression (4 instances, 2 units, all transitions), success criterion
hardening (episode success must require capture resumption, not just 3 clean
aggs), mid-flow spiral on merit, attr-tunable ladder + kill switches;
(3b) IMPLEMENTATION DEFECT FOUND BY BRUCE (8/28): v356 reverts env to commit
at EPISODE end (on success!) — the spec said revert at EVENT end. If env+5 is
what fixed the skip, the immediate revert RE-ENTERS the glitch -> re-episode
-> the fix-unfix CHURN LOOP ('3063's 6-episodes-per-run acute signature, and
inflated spiralOk stats — the loop credits itself each lap). v357: hold the
WINNING spiral value until event close (still provisional, bestEnv untouched,
quiet-recal remains the only commit path) + export reacqOkEnv (which value
won — if successes cluster at +5, the envelope genuinely shifts up during
acute windows = mechanism data);
(4) the split-tripped/dtof-clean billability verdict remains the biggest
single lever (would eliminate the episode class at the source).

## 8/28 EVE — PULSE EXPERIMENT: THE CHEAP FIX WORKS + SURVEY INSTRUMENT SHIPPED
numberOfPulse 13 -> 6 (attr only, whole trio, Bruce): measured ring-up went
~20 gentle lobes -> ~8 steep lobes; adjacent-lobe steps 4.3%% -> 8.5%% mean
(max 23%%); 35%%-crossing margins 0.2-2.2%% -> 14.7%%/8.1%% = 10-40x WIDER.
4-run series result: '8549 (the chronic split-5 burster) + '4423 = ZERO
crossing errors the entire series; parity 1.4%%/3.9%% once settled (runs 3-4).
COST: peak amplitude 533 -> 223 counts (gain compensates 28-30), stddev/qual
elevated — production point likely 8 pulses (margin/SNR compromise, TBD).
'3063 still threw split-5 skips at 6 pulses (15 errs, runs 1-2 only, all
spiral-resolved, full captures by run 3) -> its acute mode = envelope
CONVULSION (>8-15%% of peak), not drift — margins can't fix it; the survey
map during an acute phase is the probe. WATCH: '4423 heldGal +0.5 gal mid-
series with zero errors = pure agg-starvation hold (dead-stream face, live).
RECOMMENDATION SET: (1) pulse-reduction attr campaign as the fleet skip
mitigation (pilot at 8; margins vs SNR); (2) survey '3063-class units
(ST 17901 SHIPPED: cal-survey branch 42121b2, G/17901 both buckets — pairs
with frozen v390; surveyStart attr; 23x5 grid; map = sv0..sv22 keys;
clustering host-side); (3) v357 runtime items for what tuning can't fix.

## 8/29 morning — FIRST SURVEY MAP CAPTURED ('3063, still water, 6 pulses)

Map shipped 08:03:34 session (walked overnight from 22:58 rerun; surveyStart=false held, no wipe).
Saved: scratchpad/3063_survey_map.json (+_flat), chart 3063_survey_map_flat_surface.png.

Results (115 cells, 23 gains x 5 envs):
- Dead cliff: gain 17-18 dead all envs; gain 20 dead at env 20/30, alive env 40+.
  => empirical valid-gain floor ~20-21 at 6 pulses (cal-sweep-v2 step 1 answered).
- All 103 live cells SPOTLESS: 0 skips, 0 errs, 5/5 aggs; dtof sd 24-136 ps, no trend
  vs gain or env (no compression degradation up to gain 50).
- Committed point (g29/e35) sits ~8 gain steps (~16 dB) above the cliff. Healthy.
- Clustering nominated g47/e40 — weakly determined on a uniform surface; ignore.

KEY: '3063 convulsion mode does NOT exist at still water. Skip-storms need moving
water to express. Wet-edition map (steady 2-3 gpm held for full walk) is the next probe.
Options: full grid ~30 min steady flow, or 3-env subset (~18 min). Awaiting Bruce's call
+ explicit OK before writing surveyStart=true.

## 8/29 — LARGE-PAYLOAD INGEST EXONERATED (overnight continuous-sample drain)

Trio sampled 1 Hz continuously 22:00->07:57 (continuous-sample left on). Full backlog
drained at 08:03 session and ingested COMPLETE: 8549=35,669 / 4423=35,135 / 3063=35,172
records, zero gaps >30s, every hour ~3600 full. ~570 KB/device in one drain.
=> "full-size batches die" theory DEAD; 8/27 losses were intermittent AWS-side hiccups
(CloudWatch look demoted from fleet-roll gate to characterization item).
Side finding: sample-tick rates measured — 8549 exactly 3600/h; 4423 & 3063 ~3555/h
(~1.25% slow) = the clock slippage Bruce called; use for sample-count->seconds conversion.
Housekeeping: turn continuous-sample off when not in use (35k flash writes/night).

## 8/29 — WET SURVEY MAP ('3063, 2 gpm steady, 6 pulses) — THE CLIFF MOVES

Walk armed 08:19 (trigger draw), ran during 2gpm/60gal run, delivered 08:51:52.
Saved: 3063_survey_map_wet.json / chart 3063_survey_map_wet_flat_surface.png.
- 114/115 cells CLEAN (0 skips, 0 errs). Only dead cell: g17/e20.
- DRY vs WET: dry had 12 dead (g17-18 all envs + g20 e20/30); wet g17-18 ALIVE.
  => dead wall is condition-dependent (signal stronger during flow / fresh tank water);
  operating margin breathes -> argues for periodic re-survey, not one-shot cal.
- One noise outlier g20/e40 sd=3072ps (~30x) exactly at the old cliff = marginal cell.
- '3063 convulsion mode DID NOT EXPRESS at 6 pulses across 2 full surveys (wet+dry),
  115 operating points each. Strongest evidence yet that pulse 13->6 removes skip
  vulnerability surface-wide.
- 60-gal run registers (08:14->08:51, incl ~1gal trigger): 8549 +63.08, 4423 +62.98,
  3063 +61.77 vs Bruce ref "61.5" (source + trigger-inclusion TBD — asked).
- Ops note: '3063 delivered map via 08:51 event-end session; surveyStart=false held.
  3d plot gain axis now reversed (dead wall front-facing) in survey_plot.py.

## 8/29 — 62.5-gal run SCORED (marked tank, incl 30s prime; Bruce subtracted prime -> ~61.5 run-only)

Reference = marked tank, 62.5 gal total draw incl prime. Register deltas 08:14->08:51
(also incl prime): 8549 +63.08 (+0.9%), 4423 +62.98 (+0.8%), 3063 +61.77 (-1.2%).
'3063 deficit ~1.2-1.3 gal vs siblings ≈ 36 s of missed flow @ 2gpm = survey-walk tax
(1 dead cell x 8s + settle transitions across 115 hops). CONCLUSION: wet survey costs
~1% register accuracy on the run it rides — bounded, documented; run fleet surveys in
no-flow windows or accept the gallon. Non-walking units within +1% of tank.

## 8/29 ~10:30 — '3063 STUCK-EVENT AUTOPSY (the bench phantom, caught with exact numbers)

Freeze at 09:36:40 (radio session boundary): flowRate latched 4.233 gpm, tofNorm
latched -14978 ps, BOTH sd=0.000 for 47 min, while raw tofA/tofB kept updating live
(processing-stage freeze, NOT measurement loss). Event never closed (frozen rate > 0)
=> no event-end radio = the "wedge". Register accumulated frozen rate: 4.233x47.3min
= +200.14 gal phantom (486.10->686.24 EXACT). 21-Maple mechanism reproduced on bench.
Post-mag register restored 414 = ~72 gal BELOW true (~486-498): register-save-gap bug
live (mag doesn't save; last save ancient). '3063 register needs correction (true ~498).
PRIME SUSPECT: 17901 survey hooks (survey_on_agg at head of measHandleUSSResults) —
freeze started exactly at a session; '8549/'4423 (no hooks) clean on identical edges.
Test: 10-min beats now on; recurrence at a session boundary = confirmed; then 17901
comes off. AUDIT survey hook path for agg-swallow/early-return.

A-MAX RESULTS (3x sharp 0.25<->7.5 gpm snaps): '8549 ZERO errors/reacq (unit that
reacq'd 4x on 2gpm edges this morning!), '4423 zero. '3063 raw tofA/tofB: ZERO
skip-band steps entire series; max step ~135ns common-mode. VERDICT: sharp max edges
benign at 6 pulses. Trio on checkInPeriod=10/radioOnEventEnd=false (logged write).

## 8/29 ~12:15 — STUCK-EVENT ROOT CAUSE CONFIRMED (code analysis, Explore agent)

Mechanism #1 confirmed by all 3 freezes (nonzero frozen rate + live billing):
degenerate TI aggregates (frozen/zero tofDps, live tofUp/tofDn) pass hci.c:1348
(only checks tofUPSps!=-1); offset tracker ignores them -> corrected tnorm ==
current_offset() constant -> flowRate nonzero constant -> event can never close
(measure.c:715/723, no wall-clock cap) -> meter_accumulate bills phantom 1/s.
Trigger: session-end ring drain flushes USART3 MID-FRAME w/o framer reset +
override push. RETRACTIONS: "dispatch starved" wrong (tiAggCount proves dispatch
alive); gatedAggs freeze = !event guard consequence; noneventMode red herring
(= recordNoneventFlow attr, Bruce's setting). Dead code found: endEvent attr parsed
but never read (no remote escape exists); not-metering close unreachable below
early return; MIN_GOOD_TOF designed but never implemented. Full 17043 fix list
(8 items) in cal-v357-transient-gate-spec.md. Fleet relevance: this is the 21
Maple phantom class — items 1-3 make it structurally impossible.
Ops 8/29 midday: trio radioOnEventEnd=true (limiter bypass, checkInPeriod stays
10) — REVISIT before leaving bench config; '3063 revert to 17042/356 in flight;
adcCapture stale-true on 4423/3063 pending Bruce OK to clear.

## 8/29 ~12:4x — BRUCE FIELD NOTE: 17042/356 boot-cal instability

Observed across today's mags: some devices loop recal while others finish; a SECOND
mag makes the loopers cal normally. Workaround known (re-mag); root cause unknown.
ADD to v357 cal work: boot-cal convergence audit (why does first-boot cal sometimes
not settle; is it the recovery-ladder v349 quiet-deferred recal re-triggering?).
Phase 0 sanity run: 3x 7.5 gpm cycles on all-17042/356 trio, baseline snapped
(phase0_sanity_baseline.json).

## 8/29 ~13:00 — PHASE 0 CLOSED: register spread EXPLAINED, two under-reg mechanisms quantified

Sanity run (3x 7.5gpm sharp): clean opens/closes, 0 errors, 0 reacq, NO stuck events
on 17042/356. Registers +11.94/+10.34/+6.27 — integrals of each unit's own stream
match registers EXACTLY, so divergence = measurement, and it decomposes fully:
1) RADIO-SESSION BLACKOUT: ~3 min metering hole per session (TI loop skipped during
   radio; session-end drain DISCARDS ring contents by policy). One hole per unit
   (181/175/219 s), staggered by beat schedule; 3063's swallowed a full 7.5 cycle
   (~5.4 gal). Explains morning 62-gal run agreeing 0.9% (no mid-flow beats) vs this
   run. PROTOCOL RULE: accuracy runs = NO periodic check-ins during flow.
   FLEET: open-event radio mid-event eats ~3 min water per session on every meter —
   systematic under-reg, 17044 candidate (buffer during radio instead of discard).
2) ONSET BLINDNESS OBSERVED DIRECTLY: 3063 12:32:02-08 — 7 samples flowRate=0 with
   tofNorm ~+20,500 ps (≈6 gpm) = !InfoMetering zeroing (TI dropped Metering flag at
   onset; noise gate exonerated — masd ~96, gatedAggs equal across trio, and those
   zeroings don't bump gatedAggs). ~0.7 gal eaten. TI-side v357 agenda item.
PHASE 1: 17043 BUILT (branch stuck-event-fix @ 48e2de4, 102,156B text, all 8
defenses; test bucket dune-firmware-st-test G/17043 verified; prod upload pending
Bruce). Validation plan: v390 bounded session on one unit, 17043 must self-heal
<2 min, zero phantom.

## 8/29 ~13:50 — STAGE 2 CLOSED: endEvent hatch "unreachable by design" on 17042+

Live-fire endEvent test could not fire (forcedEndCnt stayed 0 through 3 armed beats,
water continuous, fetches clean): 17042's meas_hold_tick kills any open event ~12 s
into EVERY radio session (agg starvation), so the flag — consumed on first post-
session aggregate — always finds the event already dead; trickle re-opens seconds
later. Evidence: heldGal crumbs each session (10-s bridges), events split at every
mid-flow beat, missedTbAttrCnt=0. VERDICT: hatch kept as belt/correct-in-review;
redundant wherever hold-kill exists. COROLLARY: on 17042+ even a 17041-class frozen
phantom dies at each beat and re-opens between them (~10-min leak chunks) — 17043's
stuck-flow suppressor closes that remaining gap = Stage 3's target.
Stage 1 PASS (boot clean, cal settled 90 s, counters quiet; one spontaneous recal
@13:06 with ZERO justifying counters = cal-loop bug documented under instrumentation).
radioOveruseMax=15 written (behavioral verify deferred). Blackout note: at 10-min
beats the radio blackout eats 20-30% of ALL 1 Hz samples ('4423 13:07-13:09 hole =
its beat); accuracy runs need beats off; 17044 buffer-during-radio.

## 8/29 ~14:00 — BLACKOUT CENSUS (Bruce spotted tnorm gaps on all 3)

13:00-13:45, 10-min beats: one gap per beat per unit, 45-181 s each.
8549: 480s/18% blind; 4423: 420s/16%; 3063: 526s/20%. Cadence-locked (gaps at
13:10/13:20/13:30/13:41 on all three). Billing impact per beat during flow:
hold bridges 10s -> event killed -> remainder unmetered till requalify (~0.8 gal
per beat at 0.5 gpm trickle). 17044 ladder: (a) stop discarding ring (+30s free),
(b) RAM buffer ~3KB covers full session, (c) revisit process-during-radio policy.

## 8/29 afternoon — STAGE 3 PASS + ROOT CAUSE FOUND + v357 SOURCE FIX SHIPPED

STAGE 3 (wedge vs 17043): freeze reproduced at 14:53:46 (fossil 4.0350 gpm,
bit-identical). Detector fired at sample ~120 (14:55:4x): stuckFlowCnt=1, event
closed, fossil suppressed. Phantom billed ~0.13 gal vs morning's 200.14 —
containment ~1500:1, no human. Register frozen at 589.639 across 3 subsequent
beats while TI stayed latched; sessions did NOT heal it (escalation ladder case
proven live). tofMarkerRej/procStall = 0 (mode-4 anatomy: fossil, not markers).

ROOT CAUSE (TI code, VERIFIED): dune/measure.c v180 (2025-12-24) DTHRES gate =
unbounded latch by construction: if |avg_d - last_good_d| > 100ns, packet ships
stored last_good_d and the ONLY refresh path (else-if) can never run. One cycle
skip (500ns = 5x gate) locks it permanently. Rails ungated -> live. Frozen value
= real historical dtof (plausible by definition). Config re-init (gain/env push,
hmi.c -> USSLibGUIApp_ReInitialize) can re-lock correlator one lobe over =
trigger; a later push cures only if it re-locks the original lobe = dice.
FLEET EXPOSURE: measure.c identical on v356 — fleet protected ONLY by reacq_tick's
incidental env-poke re-inits (~3s cadence during error bursts). Deglitcher
(MAXGLITCHCNT 20) seeds the frozen value then hands off to the latch.
TODO fleet-scan: historical telemetry for bit-identical flowRate runs (phantom-
floor cases, e.g. 40 Maple#5 289 gal/d?) — this bug is 8 months old.

v357 SHIPPED (cal-reacq 18b27ad, msp357.bin 44710B crc e50e1e8d, bucket verified):
(1) DTHRES substitution bounded at 3 consecutive aggs then live value re-seats;
(2) dune_meas_invalidate() on every HMI_updateUSSParameters (clears deglitch seed,
latch, in-flight window — no config blending). No wire changes. '3063
allowTiFotaVer 390->357 (reflash clears live latch). Validation: stop-start
barrage, expect stuckFlowCnt stays at 1 (no new), zero fossils in stream.
Unbuilt candidates logged: USSLibGUIApp.c:400-414 error propagation (alg error
codes feed stale stack local as valid — mechanism #3, unconfirmed, lib binary);
INFO-tail dtofHeldAggs diag counter; u16 counters (wire change).

## 8/29 ~16:00 — v357 KILL-CONFIRMATION PASS. DAY CLOSED.

Redo barrage 15:28-15:53 (0-7.7gpm bursts + event-end sessions as extra config
pokes): ZERO fossils on all three; '3063 (17043+v357) stuckFlowCnt stayed 1 (no
new detections) through 97 burst samples; controls '8549/'4423 (v356) logged real
skip-class errors (reacq 4 and 1) proving triggers were present — disease did not
latch on v357. Trap dead at source, 8 months after v180 shipped it.

DAY SUMMARY: dry+wet survey maps captured/rendered; large-payload ingest exonerated
(35k rec/device clean); faux-stuck-event mechanism reproduced 4x, root-caused to
TI v180 DTHRES unbounded latch (VERIFIED in source), ST 17043 defenses built+
validated live (1500:1 phantom containment), TI v357 source fix built+deployed+
kill-confirmed; radio blackout quantified (~17% at 10-min beats, widens with
payload); reacqSelfOk=0 mystery SOLVED (spiral wins were latch cures via re-init,
not signal reacquisition — Bruce's "always returns 35" explained); edge slew map
banked (3.4-3.6 ns/gpm, 28 ns/s max legit slew, 18-20x skip separation).

OPEN FOR NEXT SESSION (Stage 4+): roll '8549/'4423 to 17043 + allowTiFotaVer 357;
4-run stability series + 50-gal accuracy regression (beats OFF during flow);
end-of-bench config decision (currently checkInPeriod=10 + radioOnEventEnd=true +
radioOveruseMax=15 on 3063 only; adcCapture stale-true on 4423/3063 pending clear);
register corrections (all three fiction); fleet items: v357 fleet-roll candidacy,
fleet fossil scan (chip task_ae15a462), w30 bit-stable rule, 17044 (blackout
buffer + TI recovery escalation + register-save + endEvent semantics), 17902
survey productization; transient-gate spec (cal-v357-transient-gate-spec.md)
ready for cal session — NOTE: with the latch root-caused, re-derive which parts
of the reacq ladder are still needed (spiral's value was partly accidental cures).

## 8/29 evening — CATEGORY 2 FIRMWARE BUILT (survey productization)

ST 17044 (stuck-event-fix c274653 + 05911be, both buckets): survey instrument
ported from quarantine 17901 onto the 17043 fleet lineage. vs 17901: surveyStart
genuinely edge-detected + seen-false-since-boot hardening (no reboot re-fire);
TI pairing gate = diag band [390-399] OR fleet >=358; asserts/releases TI
surveyHold around the walk (+ one-shot boot clear so an ST reboot can't strand
the hold); RTC SCHEDULER: surveyAtHour (UTC, -1 off) + surveyEveryNDays
((epoch_day % N)==0 — stateless, reboot-proof) -> fleet quiet-window surveys +
automated longitudinal campaign.
TI v358 (cal-reacq d857c03, msp358.bin 44748B crc 9078952e): surveyHold via
spare user_param10 (HCI 0x94) — reacq ladder idles, walk decay pauses, deferred
recal stays deferred while held; inert for STs that never write param10.
'3063 levers -> 17044/358 (validation deploy). Validation: (1) manual edge
trigger -> still-water walk on LIVE fleet TI, map vs 8/29 v390 dry edition,
reacq counters flat during walk, point restored + hold released; (2) scheduler
rehearsal via surveyAtHour at an upcoming UTC hour.
Survey ops impact (Bruce Q): ~1-2% of concurrent flow mis-measured during a
walk (measured 8/29 wet walk: 1.2-1.3 gal on 62-gal run), no phantom risk, no
stuck events, events may split; run in quiet windows -> free.
Deferred: g_grid boot-cal-matrix export (chunked HCI, v359/17045); 17045 nits: none open.

## 8/29 evening — v359 SURFACE CAL SPEC LOCKED (Bruce design decisions)

No quick cal — the walk IS the cal, TI-local, single-phase. 3x200ms samples per
cell (native cadence = map measured under metering conditions; Bruce's call over
burst mode) + adaptive dwell to 7 on any anomaly; dead cell = 3 no-results (~0.6s).
Walk ~100-110s; cluster = largest clean 4-connected region (min 6 cells) ->
interior max-margin cell, sd then lower-gain tie-breaks -> commit -> map+point+
margin export. Chronic-error escalation re-walks instead of blind recal. Spec:
cal-v359-surface-cal-spec.md. ST 17044 instrument stays as observability +
validation harness. 16:35:48: first fleet-TI walk armed (17044/358, surveyHold);
delivery pending — this map is v359's acceptance reference.

## 8/29 late evening — v359 SURFACE CAL BUILT + SHIPPED; 17044/358 instrument VALIDATED on fleet TI

INSTRUMENT VALIDATION (walk 16:35-16:52, map @16:56, live v358 TI): 23 rows complete
in ~20 min; plateau consistent; committed point restored; nvRecal=0; no stuck flow.
CLIFF BREATHED AGAIN (3rd observation): 11 cells g17-20 dead overnight -> clean this
evening. One isolated dead cell (g39/e50) = mid-walk radio-blackout clip (16:45 beat),
known artifact. Footnotes: post-walk reacqCnt=2 (spiral ok) + gain 29->28 = post-
restore ladder + v352 amp-hold nudge (cumulative counters can't split during/after;
both subsystems change under v359 anyway).

v359 (Dune_FW_TI cal-reacq a09b437, msp359.bin 44244B crc 25a9eb20, bucket verified):
THE WALK IS THE CAL. Gain-opt peak-seeker deleted (g_grid + prune/early-exit/plateau
machinery, ~19KB of source); full fixed 23x5 surface @ native 200ms, 3 samples/cell
adaptive to 7, dead=3 no-results; cluster = largest 4-connected clean region (min 6)
-> interior max-Chebyshev-margin cell, sd then lower-gain ties; commit + region flags
kept as runtime RE-PARK pool: error pressure -> flee to RANDOM measured-clean cell
(2-D), STAY on success (kills the "always returns 35" revert), fled cells dirtied,
region spent -> re-walk, then failedCal. cal_feed_raw moved pre-deglitcher (held dtof
zeroed the differential on anti-correlated errors). v352 amp hold DISABLED
(g_commit_upamp=0). RAM: 386B free (surface arrays paid by deleted grid).
'3063 allowTiFotaVer 358->359 @16:57 — first hardware surface cal in flight.
Acceptance: cal <=~3min to Metering, point interior vs tonight's maps, repeatable
across mags (spec: cal-v359-surface-cal-spec.md).

## 8/29 ~17:42 — SURFACE CAL LANDS: v361 commits g33/e40, in-envelope, 2m38s OTA

v359 first-run postmortem: 1 settle raw insufficient post-re-init -> transitional
samples dirtied the honest plateau -> picker (mathematically correct on the poisoned
map) committed the corner g17/e20 — the EXACT fair-weather-cliff failure Bruce's
envelope predicts. v360 = selection envelope (commits+re-parks in g23-38 x e30-50,
Bruce's union-of-cliffs box; full grid still walked; fallback ladder). v361 = settle
3 raws + SC_WALK_RAW_CAP 1800 watchdog (commit-best-available, never loop) +
empty-map bail telemetry (gain=0 sentinel cal-step). Commits: v360 cda1c68,
v361 9ea6283; msp361.bin 44510B crc 68096c82.
'3063 OTA acceptance @17:42:26: flash 17:39:48 -> Metering 17:42:26 (2m38s incl
boot/amp-scan/walk), committed g33/e40 = mid-envelope, clean in all three 8/29
maps, failedCal=false, zero bails. Bench debugger unit running same build in
parallel (Bruce). PENDING acceptance: repeatability (3 mags -> same region +-1
cell); regression runs (accuracy at committed point vs pair); pulse note: v359+
cal walks at current group numberOfPulse (6). DESIGN NOTE for v362+: picker is
"evidence-weighted dead center" (deepest interior of clean∩envelope); glitch ->
random re-park within clean∩envelope, stay on success, dirty on fail, re-walk
when spent. Categories: 1 CLOSED, 2 firmware COMPLETE (instrument + scheduler +
TI-local surface cal all validated same-day), 3 mostly absorbed by re-park
(remaining: don't-relocate-for-water classifier, thresholds banked).

## 8/29 18:26 — CERTIFICATION: 50 GAL @ 5 GPM vs MARKED TANK — TRIO PASSES ±1%

Tank = 50.0 (Bruce, marked tank). Run 18:13-18:24, steady ~5.16 gpm, checkInPeriod=60
protocol -> ZERO gaps/blackout collisions, zero fossils, all defenses silent.
Stream-integral run volumes (registers cross-checked): 8549 49.48 (-1.0%),
4423 50.38 (+0.8%), 3063 50.18 (+0.4%). Each unit on its own surface-cal'd point:
8549 g29/e30, 4423 g24/e50, 3063 g33/e40 (all OTA, all in-envelope, no mags, no
failed cals; pair committed 18:07-18:08). Earlier sanity: 7.2gpm burst, sample
coverage +-1s, rates within 0.86%, all values distinct.
TRIO END STATE (weekend): ST 17044 + TI v361 all three, checkInPeriod=10,
radioOnEventEnd=true, radioOveruseMax=15 on 3063/default 10 on pair, registers
non-truth (bench). NEXT SESSION: repeatability mags (3x, +-1 cell); v361 behavioral
verify of radioOveruseMax (needs radioOnEventEnd=false day); fleet items per earlier
entries (v357+ fleet roll, fossil scan chip, 17044-class blackout buffer, w30 rule);
category 3 remainder = don't-relocate-for-water classifier (thresholds banked).
DAY CLOSED: 6 firmware releases (ST 17043/17044; TI v357/358/359->361), one
8-month-old fleet billing bug killed at source, and a self-mapping, self-parking,
self-healing cal architecture designed, built, broken, fixed, and CERTIFIED
against reference water — in one session.
