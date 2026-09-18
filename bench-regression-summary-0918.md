# Bench regression summary, five water-bench units, 2026-09-13 to 2026-09-18 16:48

Written by the fleet-ops session for hand-off to another session. Every number below was read from
ThingsBoard telemetry or from the FW session's own watch logs on 9/18 at 16:48; nothing is estimated.
Where a claim is inferred rather than measured it says so.

## Units

| serial | TB label | pipe | role |
|---|---|---|---|
| 70262090 | TI Fota Failure TEST1 | P | bench, water |
| 72390592 | TI Fota Failure TEST2 | P | bench, water |
| 77058339 | TI Fota Failure TEST3 | P | bench, water |
| 72714092 | TI Fota Failure TEST5 | P | bench, water |
| 72378456 | TI Fota Failure TEST6 | P | bench, water |
| 79454912 | Engineering Test Desktop Debug | M | sixth bench unit, now the control on 17091/393, no water |
| 70273063 | Wyse Eval Wyse2 | M | rig (aerated 1" Cu recirc), probe attached, UART log |

The five water units share one supply, so a water event hits all five at once. Bruce ran events on
9/17 (about 12:40) and 9/18 (about 14:53 and 16:40).

## Firmware ladder and dwell

Windows are from the first post on a pair to the last post on it. "M/C/F" is the count of status posts in
Metering / Calibrating / Failed Cal. Boot count is `bBootCount` first to last inside the window; a +2 at a
pair change is the expected ST FOTA reboot pair.

| pair | landed | dwell on the five | posts M/C/F (sum of five) | wd resets | boots inside window | outcome |
|---|---|---|---|---|---|---|
| 17085/391 | before 9/13 | 2.6 to 2.9 h (tail only) | 16/4/0 | not reported | +0 to +2 | starting point |
| 17087/391 | 9/13 11:07 | 0.2 h, three units | 9/3/0 | 0 | 0 | stepping stone |
| 17088/391 | 9/13 11:18 to 11:26 | 94.4 to 94.5 h | 78/10/0 | 0 on four units, **0 to 88 on 77058339** | +0 to +2 | cleared for the fleet 9/14; wd defect visible on one unit, see below |
| 17091/391 | 9/17 09:50 to 09:53 | 2.8 to 2.9 h | 10/5/0 | 0 | 0 | one re-cal each, then Metering |
| 17091/393 | 9/17 12:45 to 12:48 | **26.1 to 26.2 h** | **63/0/0** | **0** | **0** | clean soak, see table below |
| 17096/393 | 9/18 14:55 to 14:57 | minutes | 0/6/0 | 0 | +2 | transit, TI FOTA to 395 followed |
| 17096/395 | 9/18 14:58 to 14:59 | 0.4 h, four units | 12/0/0 | 0 | 0 | first ack counters |
| 17097/393 | 9/18 14:58 | one post, 77058339 only | 0/1/0 | 0 | +2 | transit |
| 17097/395 | 9/18 15:01 to 15:24 | 1.3 to 1.7 h so far | 17/4/0 | 0 | 0 | current build; the four Calibrating posts are the first post after each unit's reboot |

The control 79454912 has been on 17091/393 since 9/17 19:42 (16.1 h of posts, 5 Metering / 1 Calibrating,
wd 0, boot count flat at 4). Its earlier bounces to 17058 on 9/13 and 9/17 were Bruce's power cycles
landing in the 17058 bank, not firmware faults.

## 17091/393 soak, per unit (9/17 12:45 to 9/18 14:55)

| serial | posts | Metering | tiWdReset | boots | quiet sd, median (ps) | register delta (gal) | gain / blank at end |
|---|---|---|---|---|---|---|---|
| 70262090 | 13 | 13 | 0 | 120 to 120 | 59 | +8.77 | 39 / 36 |
| 72390592 | 11 | 11 | 0 | 121 to 121 | 67 | +8.99 | 39 / 36 |
| 77058339 | 13 | 13 | 0 | 120 to 120 | 73 | +8.85 | 28 / 37 |
| 72714092 | 13 | 13 | 0 | 154 to 154 | 80 | +8.86 | 41 / 36 |
| 72378456 | 13 | 13 | 0 | 169 to 169 | 63 | +8.71 | 37 / 36 |

The five registers moved within 0.28 gal of each other over the same water. No watchdog resets, no
unplanned boots, no cal restarts. This is the cleanest window in the ladder and it exceeds 24 h.

## What each step showed

**17088/391 (9/13 to 9/17).** Rig gate closed 9/13 17:16 (20 of 20 sessions, 0 reboots, wd, parks).
Bench held Metering through 94 h and Bruce cleared the fleet on 9/14. One bench unit, 77058339, ran its
`tiWdReset` counter from 0 to 88 during the window while still posting Metering on 11 of 14 posts. That is
the same 20-minute watchdog the field later showed as the gate-loop defect (watchdog reset does not
re-send the cal gate, TI parks at CAL_INIT with gain 40 / env 30). On the bench the unit kept metering
because its cal completed inside the window; in the field 32 devices on 17088/391 are parked right now
(30 installed). The bench did not catch this because Metering state was the pass criterion and the wd
counter was not a gate. Recommendation: any future soak gates on `tiWdReset` and `tiWdKick` staying flat,
not on state alone.

**17091/391 then 17091/393 (9/17).** 17091 = send the gate after a wd reset, time-paced gate re-push,
hold the wd timer while a cal is in progress. All five re-calibrated once on landing and were Metering
within 4 to 7 minutes. TI v393 (commit noise gate 300 ps, persistent blank lock) landed about 3 h later
and again re-calibrated once. 77058339's wd counter went 88 to 0 across the crossing and stayed 0.
26 h clean as tabulated above.

**recalibrate attribute test on 17091/393 (9/18 09:33).** Bruce ordered `recalibrate=true` on all five to
prove the v393 blank lock across a 0xAD re-cal. Result: **0 of 5 fired.** Post 2 at 09:59 was identical to
the fetch post at 09:38 on every unit (`paramRecal` unchanged, blank unchanged, gain unchanged). The
watcher's first read of 72390592 as "recal evidence, lock held" was a baseline error and was retracted in
the log at 09:42. Combined with 0 of 2 on the rig the evening before, that made 0 of 7. Attributes were
deleted on all five at 10:00.

**Root cause (rig, 9/18 12:15).** The ST wrote the 0xAD frame into the TI's ready window and dropped
ATTN in the same pass; nothing acknowledged anything, so a lost frame was silent. The cal gate had only
ever worked because CAL_HOLD re-sends it every 5 s. Fix chain, all built and rig-tested the same day:

| rev | change | rig evidence |
|---|---|---|
| TI v394 | INFO carries cmdSeq / lastCmd, ATTN armed at boot, RX re-arm in PORT4 ISR | ack record flaw found before any bench pickup, superseded |
| TI v395 | housekeeping 0x96 / 0xA3 not recorded, INFO right after a recorded command | ack match works |
| ST 17092 | one frame in flight, ATTN held until INFO acks, retry, `tiCmdTx/Ack/Retry/Lost` keys; release 103,332 B | first release build that fits |
| ST 17093 | 8 s timeout plus INFO_REQ nudge | first-try acks in CAL_HOLD |
| ST 17094 | arm only on recordable frames, loud-lean diagnostics | fixed the 0x96 flush arming bug |
| ST 17095 | attn_enable first in the override batch (experiment) | last frame of a multi-frame burst still dropped |
| ST 17096 | TC wait plus 5 ms gap after every frame | **burst-tail loss gone; A9 acked first try** |
| ST 17097 | one acked gate per ceremony, no post-session gate to a metering TI, recalibrate latch re-arms on absent key | gate acked once, zero post-session 0xA8 |

Finding on the TI side, inferred not proven: the TI drops the last frame of any multi-frame burst,
consistent with RX being blind while it transmits. Pacing on the ST side removed the symptom.

**Lock proof (rig, 9/18 14:22, 17096/395).** `recalibrate` false to true dance: 0xAD acked on the first
try, in-place re-cal, back to Metering at gain 37 / env 34, **blank 40 before and 40 after = v393 lock
held**. This is the first positive lock result; every earlier "lock held" line in the 9/17 rig log was a
comparison across PIN resets caused by PC Modern Standby, which is the fresh-install path and not a lock
test.

**17096/395 and 17097/395 on the five (9/18 14:55 onward).** Both picked up after Bruce's 14:53 water
event. Every unit re-calibrated once per ST build (17096 and again 17097) and returned to Metering within
one or two posts. Ack counters at 16:41, cumulative since the 17097 boot:

| serial | tiCmdTx | tiCmdAck | tiCmdRetry | tiCmdLost |
|---|---|---|---|---|
| 70262090 | 6 | 6 | 0 | 0 |
| 72714092 | 6 | 6 | 0 | 0 |
| 72390592 | 7 | 6 | 1 | 0 |
| 77058339 | 10 | 8 | 2 | 0 |
| 72378456 | 7 | 4 | 3 | 0 |
| rig 70273063 | 17 | 11 | 6 | 0 |

Zero lost frames anywhere. Retries are concentrated in single frames sent to a metering TI (A9 / A8),
which need one retry about half the time on the rig UART log; the handshake absorbs it. Why a metering TI
receives A8 gate sends at all is still open (17097 drops the retry as moot, the first send remains).

**17097 recalibrate round 1 on the five (9/18 16:36).** `recalibrate=true` written to all five, control
untouched. Stage 1 posts at 16:41 to 16:42 show the attribute fetched (`paramRecal` still 0, blank
unchanged) and the sequencer deleted the attribute after the fetch. The 0xAD is due after that session.
**No verdict as of 16:48.** Round 2 (latch re-arm on absent key) follows. Treat the lock as proven on the
rig only until this lands.

## Verified / inferred / open

Verified from telemetry:
- 17091/393: 26 h, five units, 63 of 63 posts Metering, wd 0, boots flat, quiet sd 59 to 80 ps, registers agree within 0.28 gal.
- 17088/391: one bench unit accumulated 88 wd resets in 94 h while Metering; the field defect was reproducible on the bench and was not gated.
- recalibrate on 17091/393: 0 of 5 fired; on 17096/395 rig: acked first try, blank 40 retained.
- 17097/395: 0 lost frames on six devices, 17 of 21 posts Metering (the 4 are post-reboot first posts).

Inferred:
- TI drops the tail frame of a burst because RX is blind while it transmits (fixed by pacing, mechanism not read from TI code).
- Single-frame retry rate about one in two while the TI is metering (rig UART count, not a fleet number).

Open:
- 17097 recalibrate round 1 and round 2 verdicts on the five.
- Why a metering TI is sent A8 at all.
- 24 h soak on 17097/395 has 1.3 h so far; nothing on 17097 should move to the field before it, and the fleet's 11 pinned gate-loop units are on 17091 with TI held at 391, not 393 or 395.
- Pedro's adc/gpio/rcc size drop (about 2.7 KB) unverified; 17092 left 9.3 KB free after his timegm_utc + scan_ints cherry-pick.
- Routine 4-frame override re-push after every session is a candidate to skip when unchanged since the last acked push.

## Field context on 9/18 16:48

- 988 devices on ST 17088, 982 with TI 391. 32 are parked in the gate loop (30 installed, 2 inventory). 11 of the installed ones were pinned gen2fw 17091 at 09:28 today on Bruce's go (TI stays 391); the other 19 are not yet pinned.
- Installed devices that were Metering before the roll: 264 of 294 Metering now (90%).
- The roll agent is still targeting 17088/391 with the loop-fix option; retarget to 17091 has not been done.

## Sources

- Bench pickup logs: `Claude Data/bench_pickup_0913.log`, `Claude Data/bench_17091_pickup_0917.log`, `Claude Data/bench_17092_pickup_0918.log`
- Recal / lock logs: `Claude Data/rig_recal_lock_0917.log`, `Claude Data/bench_recal_lock_0918.log`, `Claude Data/rig_17092_0918.log`
- Gate-loop pins: `Claude Data/pin_gateloop_17091_0917.log`
- Telemetry pull behind the tables: scratchpad `bench_regress_0918.py` and `bench_regress_0918.json` (fleet-ops session)
- Rev-by-rev notes: memory `project_st_ti_handshake_0918.md`, `project_ti_flash_isolation_0912.md`; repo commits `11fd92b` (17091), `1c274dc` (v393), `a977499` through `e4c3cf1` (17092 to 17097), `6045fcd` (round 1 armed)
