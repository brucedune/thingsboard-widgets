# TI v380 (+ ST 17073 hold rule) — ladder walks that are fast, tolerant, and never silent

Status: BOOKED (Bruce 9/10 13:45 "book it"); spec for approval before build. Author: Claude. Evidence: fw-17047-bugfix-handoff.md §1g and the 9/10 rig runs on '3063 (TI 379 / ST 17072).

## 1. Problem

Three times on 9/10 (10:47, 10:49, 11:49) the TI left its lock while the pump ran on aerated water, shipped NOTHING for 65-150 s (no aggregates, no INFO), the ST killed the event at 40 s and opened a session, and the flow during the walk was never billed. Measured walk costs: re-derive (full sweep) 65 s; v379 forced recal ~120 s. The ladder's entry tolerates 25% cross errors but its recovery test demands 3 clean in a row (a 0% test): at a steady 25% error rate that test passes only 42% of the time, so a healthy lock is pushed into re-parks and exhaustion (the 11:49 case moved the commit to the other lobe).

## 2. Changes (TI v380)

### A. Entry threshold 25% -> 33%
`REACQ_RATE_ENTER_N 8u` -> `11u` (11 of the 32-aggregate deglitched window). cal.c:458.

### B. Recovery acceptance: 2 of 3 clean instead of 3 consecutive
Applies to self-recovery (state 1) and every re-park attempt (state 2). Today `gReacqCleanRun` counts consecutive cleans and `>= REACQ_CLEAN_OK (3)` accepts (cal.c:2973-2975). v380: count cleans within the attempt's `REACQ_ATTEMPT_AGGS (3)` window and accept when `>= 2`; the window length and the 3 s per attempt are unchanged. Pass probability at a steady error rate: 25% -> 84% (was 42%), 33% -> 74% (was 30%).

### C. Never silent: heartbeat during any sweep
During `cal_resweep_gain` / forced recal / re-derive the USS is driven by the scoring loop and no aggregates are produced (REQ flat, INFO age 82 s at 11:49). v380 emits one aggregate-format frame per second from the sweep loop using the existing natural -1 marker (valid == 0 path in dune/measure.c) so the ST's `measHandleUSSResults` runs: `lastAggEpoch` refreshes (hold never enters), the 1 us pair filter rejects the marker (register untouched, tofMarkerRejCnt counts it), records carry flow 0. INFO/EOT ride the same cadence so `lastInfoTime` stays fresh. Cost: ~25 B/s on the wire during a sweep; the 17072 ST drains it in any radio state.

### D. Cluster-first re-derive (the speed fix)
At re-park exhaustion (cal.c ~3094, where the committed lobe is marked spent) the walker today hands off to `gRecalPending` -> full sweep (60-150 s). v380 inserts a step: while an unspent cluster remains in `g_clu_*` (v378 clustering from the last sweep), apply that cluster's best cell with `sc_apply_cell`, treat it as one more re-park attempt under rule B (3 aggregates, accept on 2 clean, continuity check vs `dune_meas_last_pair` waived because a lobe move is the intent), and on acceptance COMMIT there (g_best_gain/env, g_sc_commit_idx, cluster bookkeeping, spent list kept). Failure marks that cluster spent and tries the next-largest. Only when every cluster is spent does the path fall through to the pending recal as today. Bound: `SC_LOBE_SPENT_MAX (3)` clusters x ~4 s = <= 12 s before any sweep. The lobe-fault forced recal (v379) keeps its behaviour but goes through D first: the split points at the wrong lobe on one channel, so the cluster whose pair matches the OTHER channel's current arrival is tried before the sweep.

### E. Telemetry
INFO already carries reacqCnt/reacqSpiralOk/reacqSelfOk/reacqFail and calFlags2. Add nothing to INFO (size); keep gLobeFaultCnt/gCalClusterN as RAM counters for the bench. `reacqSpiralOk` counts D acceptances (a re-park that moved cluster).

## 3. ST side (Rev 17073, small)
- measure.c: when `!InfoMetering && (duneInfo.calFlags2 & CalF2_Unstable)` (= sweep in progress; gCalUnstable is true from sweep start to metering entry) the event is HELD open with flow 0 instead of closed by `NOT_METERING_CLOSE_RUN (10)`, bounded at 180 s (sweep cap), then closed as today. Heartbeat frames from C make the hold clock tick.
- Also folds in the 17072 batch-timestamp tweak (queue back-dated from the first-enqueue tiTime, handoff 9/10 13:28).

## 4. Success criteria ('3063 rig, aerated 1" Cu, ~11 gpm cycles)
1. A walk under flow (reacqCnt +1 in the post) ends with the SAME commit or a cluster move within <= 15 s; no full sweep (gain/env unchanged, no "sweep active" in the log) unless every cluster failed.
2. No hold ENTER/KILL during a walk or a sweep; INFO age never > 20 s while the TI is alive; link `agg` keeps advancing (markers count as frames, `rej` climbs during a sweep).
3. Event stays open across a sweep <= 180 s; register unchanged during the sweep (flow 0 recorded); no phantom after re-commit (still water reads < 500 ps within one blob).
4. errCrossCnt rate under flow unchanged (this is a tolerance change, not a signal change); reacqCnt per hour <= today's; reacqFail 0 on a run that contains a walk.
5. Still water: no ladder entries at all over a 1 h idle (33% threshold cannot be crossed by quiet noise).
6. Lobe: commit pair stays on one lobe across >= 3 runs unless a cluster move was accepted, and then the new pair reads still water correctly.

## 5. Risks
- B loosens acceptance: a genuinely marginal cell can pass 2 of 3. Mitigation: the 33% entry re-arms the ladder quickly if it keeps erring, and the lobe fault (unchanged) catches the split class regardless.
- C adds wire traffic during sweeps (~25 B/s, ~4 KB per sweep) — trivial; the ST's ring is drained in all states since 17072.
- D commits without a full re-score: the cluster data is from the last sweep (minutes to hours old). Mitigation: the accepted cell must pass B live; a wrong pick is caught by the next ladder entry and the spent list prevents ping-pong (max 3 moves before a sweep).
- ST 17073 hold rule keeps an event open on a TI that is sweeping for 3 min; if the TI dies mid-sweep the 180 s bound and the existing ti_monitor path close it.

## 6. Build/verify plan
patch_v380.py (constants A, acceptance B, heartbeat C in the sweep loop, cluster-first D at the exhaustion site) -> make -k -j8 all (LPM) -> pack -> s3 msp380.bin -> '3063 allowTiFotaVer 379 -> 380 (TB write, preview + go) -> pump cycles for 1-2 h -> criteria §4 from the link line + posts. ST 17073 built in parallel, flashed to '3063 with the pump UNPLUGGED. Bench pair excluded until Bruce says otherwise.
