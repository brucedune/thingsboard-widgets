# TODO — Transducer Fo Optimization, Phase 2 (parked 8/10)

Status: WORKS on bench (board2, 3 consistent ceremonies -> Fo*=1950kHz,
+8% pair amp, commit g35/ua715 vs g44/ua340 at 2000; steady sd 52-66).
Shipped: TI v345 (F1F2 apply), v346 (ladder emits), v347 (CAL_FO_OPT:
macro 1800-2200/100 + fine ±50/25 between pipe-sense and ladder), v348
(quiet-link report replay in METERING); ST 17033 (transFreq attr),
17034 (transFo status key + reboot re-push, gated InfoMetering).
Six flow meters deployed 17034/348; ceremonies triggered via pipeScan.

DEPLOYMENT RULE (Bruce, 8/10): PRODUCTION RELEASE derives from
ST 17032 / TI v344 (pulse-13 + PVC cal fixes, zero Fo code).
TI >= v345 and ST >= 17033 are test-pool only until item 0 ships.
v347+ runs FO on EVERY fresh ceremony — including field recovery
recals (OFF_PIPE, wrap-recal, TIFOTA-blank) — so fleet exposure
requires the explicit gate first. Bench/flow-test devices (board2 +
the six) stay on v348: Fo is inert during metering there.

Phase-2 items (consider a dedicated branch off uart-only):
0. GATE (fleet-blocking): FO compiled default-OFF; enabled by attr
   (e.g. foOpt:true pushed via overrides, calMinBlank pattern). Until
   this ships, no v347+ in any fleet lever.
1. Fine-window edge extension: when fine winner == window edge, run one
   more pass centered on it (board2's true peak may be 1925-1940 —
   fine floor WAS the winner).
2. Fo persistence TI-side (FRAM, joins committed cal) — today it's RAM
   + ST re-push heal (one-session gap after TI reboot).
3. Install-record integration: Fo curve + chosen value into the install
   record (today: console replay + transFo status only).
4. Rigorous A/B: settled sd + offset temp-stability at Fo* vs 2000
   (overnight drift compare). Today's sd numbers are indicative only.
5. Retrofit strategy for deployed fleets (auto-FO-once on first v347+
   boot with retained cal?) — decide when a fleet is on this stack.
6. Harvest + analyze the six PVC transFo values (per-unit resonance
   spread — feeds mfg tolerance discussion + piezo pair 45° question).
7. Ceremony budget check on weak-signal units (FO adds ~15s + ladder
   rerun; CAL_HOLD caps).
8. pipeScan loop hazard: while true, scan->ceremony->transition-radio->
   session->scan cycles indefinitely. Debug lever only. Consider a
   one-shot semantics (auto-clear after N) if it keeps biting.

Instrument notes: SCAN_RESULT b-field carries kHz (FO points/chosen) or
gain (ladder, v346); chosen = cap#99; Release fleet visibility = transFo
status key only. UART loses most live emissions during CAL_HOLD radio —
trust the v348 replay, not the live stream.
