# TI v373 — feed the re-acquisition ladder deglitched data (spec, 2026-09-09 21:45)

Bruce: "The ladder walk determination / test should be deglitched data not raw."

## Objective
The re-acquisition ladder (`envTest()` -> `reacq_tick()` in dune/cal.c) must judge the
same deglitched aggregate the meter bills, not the pre-hold trimmed mean with an
un-deglitched absolute-TOF pair. Tonight ('3063, 1" M Cu, ~12 gpm, aerated): 224 cross
errors, errClassBits = 2 (split class only), errSplitX 1-7 lobes, 57 shipped records with
tofA - tofB off by 1-2 lobes while tnorm was in band -> 114 spiral recoveries -> strikes
-> six mid-flow recalibrations, 3-5 min unmetered each.

## Today (dune/measure.c dune_handle_aggregate)
1. raws -> v362 ceiling/unwrap, legacy hold, hop-invalidate -> sort, mean of middle 3.
2. `envTest(avg_d, avg_ups, avg_dns)` <- RAW trimmed mean, BEFORE the DTHRES hold.
3. `cal_feed_aggregate(avg_d, ...)` (cal walk; must keep seeing skips — unchanged).
4. DTHRES hold on dtof only: |avg_d - last_good_d| > 100 ns -> ship last_good_d for <= 3 aggs;
   never adopt beyond the v362 ceiling. The pair (ups, dns) is shipped raw.
err_cross = |dtof| > 100 ns OR |dns - ups| > 100 ns. The second term is the one firing.

## Change (v373)
A. Pair deglitch, mirroring the dtof hold: keep `last_good_ups/dns`. If
   |(avg_dns - avg_ups) - agg.tofDps| > DTHRES (an absolute-TOF lobe hop on one channel while
   the correlation delta is in band) and `pair_hold_run < DTOF_HOLD_MAX (3)`, ship the last
   good pair and count `gPairHoldCnt`; otherwise adopt and re-seat. Never re-seat from an
   aggregate whose dtof is -1 or over the ceiling.
B. Move `envTest()` after the hold block and call it with the SHIPPED values
   (`agg.tofDps, agg.tofUPSps, agg.tofDNSps`). err_cross is then a per-aggregate FLAG only.
B2. Ladder entry becomes ERROR-RATE based (Bruce 21:50: "should be signal to noise based
   (error rate)"). Keep a 32-aggregate ring of the deglitched err_cross flags; rate = errors/32.
   - ENTER the ladder when rate >= REACQ_RATE_ENTER (proposed 25% = 8 of 32). A broken lock
     errors on nearly every aggregate (8/27 finding: a wrong-lobe lock is persistent); noise
     gives isolated flags. Tonight's aerated run was ~9% raw / ~2% shipped -> would not enter.
   - Attempt phases unchanged (self, env+5, env-5; 3 aggs each; success = 3 clean).
   - A spiral recovery counts a STRIKE only when entry was rate-based (always, now) — the
     isolated-hop strikes disappear with the isolated entries.
   - Re-arm unchanged (30 clean aggs clear strikes). Ring cleared on cal restart / re-init.
   - Report the rate: reuse errBurstMax's slot or add `errRate32` to INFO (needs ST decode;
     optional, see E).
   Thresholds are proposals for Bruce to set; 25%/32 is the starting point.
C. `err_floor` keeps the raw pair (a real signal dropout must not be hidden for 3 s).
D. `cal_feed_aggregate()` unchanged (raw). `-1` (no valid raws) path unchanged.
E. Telemetry (optional, needs an INFO field + ST 17067 decode): gSkipCompCnt,
   gDuneAggInvalidated, gPairHoldCnt. Default OUT of v373 to avoid ST coupling; counters
   exist for a later rev.
Out of scope: strike counting while the transient window is open; the 3-strike rule;
the deferred-recal cap. Listed as levers in the handoff, not touched here.

## Success criteria (bench, '3063 on the pump rig, 30 min continuous ~12 gpm)
- errCrossCnt may still count isolated flags; reacqCnt/reacqSpiralOk FLAT (no ladder entry below 25%).
- No status = Calibrating during the run; per-aggregate UART line continuous.
- Records: tnorm identical in behaviour; tofA/tofB no longer show +-500 k ps hops (<= 3 held).
- Quiet-water behaviour unchanged (offset lock, cal). Regression later on '4423/'8549 at 5 gpm.

## Risks
- A genuine lock break is judged 3 s later than today (same bound v357 accepted for dtof).
- A permanent abs-TOF lobe error still reaches the ladder after 3 aggregates (by design).
- Code size: small (two int32 + one counter + moved call).

## Roll (each step confirmed): patch on cal-reacq, build `make -k -j8 all` (LPM), pack,
upload s3://dune-firmware-ti/msp373.bin, tag v373, merge; allowTiFotaVer 373 on '3063 only.
