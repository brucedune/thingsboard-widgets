# TI v382 — one raw qualifier, one ring, one decision (Bruce 9/10 16:30)

Status: SPEC for approval. Replaces the per-aggregate ladder entry (v373 32-aggregate err_cross ring), the separate lobe-fault detector (v379) and the mean-based still-water test as ladder inputs. Billing-side deglitch (DTHRES hold, pair hold, v374 MAD aggregate) is unchanged.

## 1. The three tests, per RAW (200 ms, 5 per aggregate)

A raw is GOOD when all three hold, otherwise it is an ERROR:

1. **Range:** `min <= tofUPS <= max` and `min <= tofDNS <= max`, with min = the TOF floor (min_tof_for_blank, 25 us clamp) and max = 4 x floor — the v376/v377 qualifier, already computed per raw (`np` in dune/measure.c).
2. **Split:** `|tofDNS - tofUPS| < 100 ns`. RULING NEEDED (see §4): as written this includes the flow delta itself; proposed form is `| |tofDNS - tofUPS| - |dtof_corr| | < 100 ns` (v373's split term), which is the one-channel lobe test independent of flow.
3. **Error rate:** ring of the last 15 raws (3 s). ENTER the ladder when >= 5 of 15 are errors (33%). Hysteresis: the episode is RECOVERED when <= 2 of 15 are errors (13%) for one full window (15 raws); between 3 and 4 nothing changes state.

Nothing else feeds the ladder. DTHRES cycle-skip on the delta is no longer an entry input: per the 9/10 model a one-channel lobe pick is what produces the cycle skip, and test 2 catches the lobe pick directly; the DTHRES hold stays as the billing deglitch only.

## 2. What changes in cal.c / measure.c

- New per-raw feed: `cal_feed_raw()` already receives (d, ups, dns); add the ring update there (`g_raw_ring` 16-bit, 15 used) and `raw_err_count()`.
- Ladder entry (`reacq_tick`): replace `err_ring_count(g_err_ring) < REACQ_RATE_ENTER_N` (32-agg, 11) with `raw_err_count() >= 5` evaluated per aggregate on the raw ring; remove the per-aggregate `err_cross` feed to the ring.
- Recovery acceptance (self, re-park, cluster try): replace "2 clean of 3 aggregates" with `raw_err_count() <= 2` sustained over one 15-raw window (3 s) — same wall time as today's attempt window.
- Lobe fault (v379/v380/v381 g_split_run path): REMOVED as a separate detector — a persistent one-channel split fails test 2 on every raw and enters the ladder within 3 s by test 3; the cluster-first re-derive (v380 D) then moves the lock. `g_recal_force` and the forced-recal condition go away entirely (v381 already parks it under flow).
- Still-water test for the pending recal (v375 `dune_meas_noflow_aggs`): keep the 60-aggregate requirement but define "still" by SPREAD, not mean: the MAD of the last 16 shipped deltas < 600 ps. A quiet phantom (steady offset, quiet noise) is still; turbulent flow is not. Threshold to be confirmed against today's records (see §5).
- Telemetry: reuse reacqCnt/SelfOk/SpiralOk/Fail; add RAM counters gRawErrEnter, gRawErrRecover (bench only).

## 3. Behaviour after v382 (event in progress, aerated flow)
- One-channel lobe pick -> raws fail test 2 -> >= 5/15 within 1-3 s -> ladder: self 3 s -> in-place kick -> cluster try (~4 s) -> commit on the other lobe or spend it -> recovered when <= 2/15 errors. Aggregates keep shipping; billing runs on the held/deglitched delta meanwhile (conservative).
- Coherent lobe switch (both channels): tests 1-3 all pass, nothing happens. Correct — the delta is unaffected.
- Turbulence noise alone (delta spread, no split, in range): nothing happens. Today's 98-131 err_cross per run were mostly split trips on aerated water; under the RULING in §4 form (b) they only count when the split exceeds the correlation delta by 100 ns.
- Recal: pending only after 3 failed episodes; fires only when still by spread AND quiet. Never under flow. A quiet phantom recals within ~1 min.

## 4. RULING NEEDED — the split test at full flow
`|tofDNS - tofUPS|` includes the flow delta. At 12 gpm on 1" Cu today the delta is ~35 ns; on 3/4" PVC at 30 gpm (maxFlowRate) it approaches ~100 ns, so form (a) `|dns - ups| < 100 ns` would fail every raw at high flow and walk a healthy lock. Form (b) `| |dns-ups| - |dtof_corr| | < 100 ns` compares the envelope split to the correlation delta and is flow-independent; it is what v373 uses. Recommendation: (b). If you meant (a) deliberately (e.g. the envelope-derived delta should agree with the correlation delta), it is the same test — say which.

## 5. Numbers to confirm before build (from today's records, '3063 and the six PVC units)
- Raw error rate on still water (should be << 13%) and under 11 gpm aerated flow with a good lock (should stay < 33% or we walk on noise).
- Shipped-delta MAD: still water vs 2 gpm (lowest billed flow on the bench) vs 5 and 11 gpm — sets the 600 ps still-by-spread threshold so 2 gpm is never "still".

## 6. Verification ('3063 rig, then the six PVC units on a 5 gpm run)
1. No ladder entry on a clean still-water hour; no entry on a clean flow run with no split.
2. Induced one-channel lobe error (or the rig's natural ones): entry within 3 s, recovered or re-committed within 15 s, no silence > 24 s, event stays open, register within 0.5% of the integrated records.
3. Quiet phantom (steady offset, still water): pending recal fires within 2 min without any forced path.
4. reacqCnt per hour on the rig < today's; errCrossCnt stops counting split trips that do not move the delta.
