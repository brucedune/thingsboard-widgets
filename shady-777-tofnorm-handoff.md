# Session prompt — Shady 777 / post-TIFOTA flow-record blackout

Continuing from 8/8 (session fc6c8bfe). Read memory pvc-accuracy-2026-08-07
first — its SHADY LANE 144 block is the authoritative state (it supersedes
the earlier RSRP/eviction theory from the same evening).

## Solved — don't re-derive

Device 75368777 (Shady Lane MHP-Cust, d036f1e0-5498-11f1-b1bb-f3574cce671d)
session storm root cause, proven via radioStartFile telemetry (EVERY
session = connmgr.c:423 = the flash_full() trigger):
recordNoneventFlow filled the ~120k flow ring by Aug 7 eve -> flash_full
connects every evaluation -> each session COMPLETES, drains one chunk,
production refills in ~60s -> 60-75s loop. Unlimited because the GROUP
attrs on Shady Lane MHP-Cust carry radioOnEventEnd=true = the overuse
limiter's ONLY escape (connmgr.c:402; also suppresses cnt increment so
STATUS_HIGH_CONNECTIONS never fired). checkInPeriod is NOT set; the
checkInPeriod path has no failure backoff by design. Sessions never hit
TIMEOUT/FAIL, so the Rev 16040 wipe-all eviction (bg95.c ~3084) never ran.
RSRP is -117..-119 / SINR ~2dB (rssi -93 is misleading) but did NOT kill
the data legs. Verification meter 79466452 (external antenna = why it's
reliable) showed zero water 14h eve+overnight -> lot 144 low bills are
correct; if a tenant exists, water bypasses this lateral.

## THE OPEN MYSTERY — this session's focus, and a fleet-roll gate

Since the 8/6 FOTA (16193/320 -> 17028/341), 777's flow records upload
and drain successfully (~190 sessions) but NEVER appear in TB. Latest
tofNorm ts == exactly the FOTA session ts (1786025278000). Leading
hypothesis: flow-record embedded tiTime froze or never re-synced after
the TIFOTA reboot -> all records stamped identically (TB overwrites one
row forever) or device-epoch (TB rejects/buries). Supporting evidence:
FOTA Test-Cust units on 17028/341 show tofA/tofB at 91.8e12 device-epoch
ts in TB — the class is real. If post-TIFOTA records are unbillable until
time re-sync, that gates gen2fw=17028+allowTiFotaVer=341 fleet rollout.

Investigate:
1. ST code path: where tiTime is set/re-pushed to TI after TIFOTA and
   after network time sync (hci/ti_hci_impl/time.c); whether 17028's
   session restructuring (17025-17028) broke the re-push ordering.
2. What ts the flow_tof records carry (header timeLS/timeMS from tiTime,
   measure.c measHandleStartEvent) and what the AWS integration does with
   identical/ancient/far-future stamps.
3. Bench repro: TIFOTA a bench unit (board 2 or Wyse), watch the next
   sessions' flow records' embedded ts. Board 2 = Device 79454912,
   35ea96e0-8eb4-11f1-a1a6-391af391818e — NOTE it reports fwVer 17029 +
   TI 340 (rev unknown to this repo, ask Bruce what 17029 is) and is
   SILENT on COM4 (Release?). Trap capture + uart-echo scripts live in
   session fc6c8bfe scratchpad — copy to the NEW session scratchpad,
   update .claude/launch.json uart-console path, kill any orphaned
   python trap/echo processes holding COM4/port 8765 first (recurring
   trap: they survive session death; also the trap has died silently
   twice — verify log mtime advances before trusting it).

## Attr state / fixes (Bruce may have applied some already — verify first)

Wanted end state: GROUP Shady Lane MHP-Cust radioOnEventEnd=false +
recordNoneventFlow=false; DEVICE-scope recordNoneventFlow=true only on
79466452 (external antenna). Verify 777's storm ended (sessions/day back
toward daily; radioStartFile no longer connmgr.c:423 every minute) and
whether its ring drains (tofNorm ts advancing past Aug 6 = mystery
partially self-resolves; still explain the 2-day blackout).

## Firmware follow-up queue (from the post-mortem, build when Bruce says)

(a) tiTime-after-TIFOTA verification = TOP (the gate);
(b) checkInPeriod-path failure backoff: effective period x 2^consecutive_
    failures capped ~hours, reset in connmgr_data_report_sent_successfully;
(c) limiter escape should still COUNT activations so HIGH CONNECTIONS
    surfaces in test mode;
(d) Rev 16040 wipe-all eviction -> cap/keep-newest; also failed_to_
    complete_network_task's flash_full->sf_init erase = second shredder;
(e) fleet sweep for radioOnEventEnd=true groups/devices (all unbraked);
(f) playbook: RSRP (not rssi) go/no-go before field instrumentation;
    external-antenna units are the designated witnesses.

## Lot 144 loose ends (secondary)

Morning-hours window from 79466452 (uploads daily ~15:18Z; extend the
zero-water analysis to full days); hose-bib/toilet field test at lot 144
watching both meters; lateral-mapping question for the customer
conversation.

## Tools / env

TB MCP (mcp__095ccaad...) is READ-ONLY: attrs tool returns SERVER scope
only — shared attrs are invisible, ask Bruce to paste them (group JSON
pasted 8/8 is in this session's transcript). tb_get_timeseries_range
cannot retrieve device-epoch (9e13) or ~1970 partitions even when
latest-values proves they exist — don't trust empty {} there. TB
latest-values fabricates {ts, value:null} for keys that never existed
(upldErr/upldOk/ramOnly/bootCount are NOT telemetry keys). bufSamples =
cumulative buffered-sample ATTEMPTS since boot, not ring occupancy.
Flow analysis scripts + persisted 50k-sample pulls from tonight are in
session fc6c8bfe tool-results/scratchpad. Repos: DuneFW_L5_2 (ST,
uart-only @ efe997a 17028) + Dune_FW_TI (uart-only @ 3c393bb v343).
Do NOT touch the PVC/L-factor thread here (separate session; volumetrics
8/8: fit pending, Lf~2.135 estimate stands).
