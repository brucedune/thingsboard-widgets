# TI v382 — one raw qualifier, one ring, one decision (Bruce 9/10 16:30)

Status: APPROVED (Bruce 9/10 16:50 "try b": split form (b); 5/15 enter, 2/15 exit, trend gates as written). Building. Replaces the per-aggregate ladder entry (v373 32-aggregate err_cross ring) and the separate lobe-fault detector (v379). The v375 still-water test for the recal is unchanged. Billing-side deglitch (DTHRES hold, pair hold, v374 MAD aggregate) is unchanged.

## 1. The three tests, per RAW (200 ms, 5 per aggregate)

A raw is GOOD when all three hold, otherwise it is an ERROR:

1. **Range:** `min <= tofUPS <= max` and `min <= tofDNS <= max`, with min = the TOF floor (min_tof_for_blank, 25 us clamp) and max = 4 x floor — the v376/v377 qualifier, already computed per raw (`np` in dune/measure.c).
2. **Split (form (b), ruled 9/10):** `| |tofDNS - tofUPS| - |dtof_corr| | < 100 ns` — the envelope split must agree with the correlation delta; flow-independent.
3. **Error rate:** ring of the last 15 raws (3 s). ENTER the ladder when >= 5 of 15 are errors (33%). Hysteresis: the episode is RECOVERED when <= 2 of 15 are errors (13%) for one full window (15 raws); between 3 and 4 nothing changes state.
   **3b. Trend gate (Bruce 9/10 16:45):** at a breach, compare the newest 5 raws with the oldest 5 in the ring. Newest >= oldest (rising or flat) -> walk now. Newest < oldest (the burst is already fading) -> no walk, re-evaluate on the next raw; a burst that clears by itself never costs a walk. Implementation: two 5-bit popcounts on the 15-bit ring.
   **3c. Trend as the step verdict (Bruce 9/10 16:47):** once a walk has started, each step (kick, re-park, cluster try) is judged 1 s (5 raws) after it is applied: error count FALLING vs the count at the step -> the step is working, hold it, recovered at <= 2/15; FLAT or RISING -> escalate to the next step immediately. Cap 3 s per step (a step stuck at 3-4 errors escalates). Episode kill points unchanged (pool spent, cluster try failed). Typical lobe move completes in ~5 s.

Nothing else feeds the ladder. DTHRES cycle-skip on the delta is no longer an entry input: per the 9/10 model a one-channel lobe pick is what produces the cycle skip, and test 2 catches the lobe pick directly; the DTHRES hold stays as the billing deglitch only.

## 2. What changes in cal.c / measure.c

- New per-raw feed: `cal_feed_raw()` already receives (d, ups, dns); add the ring update there (`g_raw_ring` 16-bit, 15 used) and `raw_err_count()`.
- Ladder entry (`reacq_tick`): replace `err_ring_count(g_err_ring) < REACQ_RATE_ENTER_N` (32-agg, 11) with `raw_err_count() >= 5 && raw_err_newest5() >= raw_err_oldest5()` evaluated per raw (from cal_feed_raw) so the decision lands within 200 ms of the breach; remove the per-aggregate `err_cross` feed to the ring.
- Recovery acceptance (self, re-park, cluster try): replace "2 clean of 3 aggregates" with the 3c verdict — falling error count at +1 s keeps the step, `raw_err_count() <= 2` recovers, flat/rising at +1 s escalates, 3 s cap per step.
- Lobe fault (v379/v380/v381 g_split_run path): REMOVED as a separate detector — a persistent one-channel split fails test 2 on every raw and enters the ladder within 3 s by test 3; the cluster-first re-derive (v380 D) then moves the lock. `g_recal_force` and the forced-recal condition go away entirely (v381 already parks it under flow).
- Still-water test for the pending recal: UNCHANGED (v375, mean-based, 60 quiet AND 60 still aggregates). A spread-based test was considered and REJECTED on 9/10 data: 16-sample MAD of the shipped delta is 49 ps (p50) on still water, 140 ps at 5 gpm on clean PVC 3/4, 1,398 ps at 11 gpm aerated — clean low flow is not separable from still by spread, so it would recal under flow on the bench. The quiet-phantom case (steady offset, one-channel split) is handled by tests 1-3 + the cluster try, not by the recal.
- Telemetry: reuse reacqCnt/SelfOk/SpiralOk/Fail; add RAM counters gRawErrEnter, gRawErrRecover (bench only).

## 3. Behaviour after v382 (event in progress, aerated flow)
- One-channel lobe pick -> raws fail test 2 -> >= 5/15 within 1-3 s -> ladder: self 3 s -> in-place kick -> cluster try (~4 s) -> commit on the other lobe or spend it -> recovered when <= 2/15 errors. Aggregates keep shipping; billing runs on the held/deglitched delta meanwhile (conservative).
- Coherent lobe switch (both channels): tests 1-3 all pass, nothing happens. Correct — the delta is unaffected.
- Turbulence noise alone (delta spread, no split, in range): nothing happens. Today's 98-131 err_cross per run were mostly split trips on aerated water; under the RULING in §4 form (b) they only count when the split exceeds the correlation delta by 100 ns.
- Recal: pending only after 3 failed episodes; fires only when still (mean) AND quiet (v375). Never under flow. A quiet phantom is fixed by the ladder/cluster try, not the recal.

## 4. Split test form — RULED: (b)
`|tofDNS - tofUPS|` includes the flow delta. At 12 gpm on 1" Cu today the delta is ~35 ns; on 3/4" PVC at 30 gpm (maxFlowRate) it approaches ~100 ns, so form (a) `|dns - ups| < 100 ns` would fail every raw at high flow and walk a healthy lock. Form (b) `| |dns-ups| - |dtof_corr| | < 100 ns` compares the envelope split to the correlation delta and is flow-independent; it is what v373 uses. Recommendation: (b). If you meant (a) deliberately (e.g. the envelope-derived delta should agree with the correlation delta), it is the same test — say which.

## 5. Numbers to confirm before build (from today's records, '3063 and the six PVC units)
- Raw error rate on still water (should be << 13%) and under 11 gpm aerated flow with a good lock (should stay < 33% or we walk on noise).
- (done) Shipped-delta MAD measured 9/10: still 49 ps, PVC 5 gpm 140 ps, aerated 11 gpm 1,398 ps -> spread test rejected (see §2).

## 6. Verification ('3063 rig, then the six PVC units on a 5 gpm run)
1. No ladder entry on a clean still-water hour; no entry on a clean flow run with no split.
2. Induced one-channel lobe error (or the rig's natural ones): entry within 3 s, recovered or re-committed within 15 s, no silence > 24 s, event stays open, register within 0.5% of the integrated records.
3. Quiet phantom (steady offset, one-channel split, still water): ladder entry within 3 s by test 2, lock moved by the cluster try within 15 s; no recal needed.
4. reacqCnt per hour on the rig < today's; errCrossCnt stops counting split trips that do not move the delta.

## 7. Implementation note (v382 as built)
The raw ring updates on every raw (cal_feed_raw -> cal_raw_qualify, metering only). Ladder decisions still run once per aggregate in reacq_tick, so entry latency is <= 1 s (not 200 ms) and the per-step verdict lands at the first aggregate after the step; a fully raw-driven state machine was judged too large a blind rewrite for today. v379 lobe-fault block removed; v373 err_cross ring kept only as telemetry.
