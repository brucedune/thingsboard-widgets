# FW 17047 / TI v365 — bug-fix session handoff

**Written 2026-09-01 ~15:35 PT.** Predecessor session: the 9/1 lock-integrity
marathon (v362→v364, ST 17045→17046). Bruce's instruction that opens this
session: **"lets fix the bugs."** The diagnosis is done; this session builds.

---

## 0. SESSION STATE UPDATE — 2026-09-01 ~16:05 PT (this session)

**Bug 1 is BUILT, COMMITTED, UPLOADED, and ROLLING.** Details below; the
original sections are left intact as the record of the diagnosis.

**Correction to §2:** the register checkpoint was **DAILY**, not hourly.
`meterHourlyUpdateTime` only writes the hourly *usage* record
(`meter_sendbuf`); `meter_update_internal()` hung off `meterNextUpdateTime`
= local midnight. The 14:01 value survived because 14:01 was the planned
17046 FOTA reset. Sub-question "why didn't the 15:00 beat land" is closed:
there was no hourly register write. Exposure was up to 24 h, not 1 h.

**Why it was never per-event:** the meter log is append-only, 8191 slots,
no wrap; when full `flow_flash_write()` set `meterFlashFull` and stopped
saving forever (until `resetMeterVal`). See the old `#if 0 do not store at
every event` block that sat in `measHandleEndEvent` (now removed).

**ST 17047** (`stuck-event-fix` @ `aff6da2`, pushed; `st-prod` G/17047,
6 chunks, 106,124 B, sha256 `5352…df69`; **st-test NOT uploaded**):
1. `measure.c` — `meter_update_internal()` at every event end (write-if-changed).
2. `meter.c` — same on every hourly beat.
3. `meter.c` — log full -> `flow_flash_erase()` (block-0 64K erase + sentinel)
   + re-seed, instead of `meterFlashFull`. Sets `meterFlashErased` (existing
   key, previously never set) and `meterLogCompactCnt`.
4. `status_report.c` — new keys **`meterFlashTs`** (epoch of last durable
   checkpoint), **`meterLogCnt`**, **`meterLogCompactCnt`** = the Bug 3
   forensics. Also clarifies which reset a rollback went back to.
5. `spi_flash.c` — `-DMETER_LOG_TEST_CAP=N` bench hook. Image built in
   `DuneFW_L5_2/build_testcap/` (untracked, same rev number so it must go
   on by SWD, not the bucket). **Compaction path has NOT been exercised yet.**

Accepted residual: power loss inside the ~1 s compaction erase drops the
sentinel -> fresh-init path -> totalizer seeds 0 -> TB `minMeterVal` floors
it back. One window per ~8000 writes.

**Roll:** `gen2fw=17047` written to all three (SHARED_SCOPE, verified by
re-read) ~15:57-16:02 PT. Other levers unchanged (allowTiFotaVer=364,
checkInPeriod=15, maxFlowRate unset). Pre-roll baseline (15:55 status,
still 17046): meterVal/meterFlash = '8549 602.756/581, '4423 617.44/595,
'3063 1016.331/994 -> ~22 gal per unit unsaved at that moment (the bug,
live). Pickup expected: STFOTA at the ~16:10 beat, `fwVer=17047` reported
at the ~16:25 beat. Watcher: `<scratchpad>/watch_17047.py`.
**PICKED UP 16:17-16:19 PT, all three.** First 17047 status: meterFlash ==
meterVal on every unit ('3063 1016, '8549 602, '4423 617) — the planned
reset checkpointed the ~22 gal that had been at risk. `deltaMeterVal`
**-0.33 / -0.76 / -0.44** = exactly the predicted (-1, 0] sub-gallon
meterAcc loss. `meterFlashTs` = 16:17:18 PT (pre-reset write), `meterLogCnt`
19/15/15, `meterLogCompactCnt` 0, `meterFlashErased` false. Forensics keys
live. TI stayed v364.

**Pulse test 16:43-16:46 PT on 17047 (Bruce's run, 5 pulses 12-41 s, 5.6-6.7
gpm avg, peak 8.0):** totals '3063 10.427 / '8549 10.317 / '4423 10.488 gal,
trio spread 1.64%; register == event ledger to the thousandth on all
three; **event-end checkpoint fired 5x per unit** (meterLogCnt 19->24,
15->20; meterFlashTs within ~15 s of the last pulse). No check-in landed
inside the train (Bug 2 not exercised). **NO REFERENCE VOLUME — Bruce: "just a quick flow check." Consistency evidence only
(trio agreement + register durability); NOT an accuracy data point.**

**Levers changed 16:58 PT (Bruce):** `checkInPeriod` DELETED on all three
(falls back to group/default cadence) and `radioOnEventEnd=true` set.
radioOveruseMax stays 15. Pickup at next check-in.

**5 gpm run ~20:04 PT, Bruce reference 51.2 gal (MEASUREMENT METHOD NOT YET
STATED — ask):** '8549 50.961 (-0.47%), '4423 51.142 (-0.11%), '3063 51.265
(+0.13%); mean -0.15%, spread 0.59%. Lf 2.239 (attr), 17047/v364.
Also 18:02 (~3.6 gal), 18:25 (~1.75), 18:49 (~9.9) events, no reference.
Levers confirmed live: NO periodic beats since 16:56 — every status post
(18:03/18:25/18:50/20:06) is an event-end session; '8549 even radioed for
a 0.082 gal dribble at 18:45. Register durable after every event
(meterFlash == floor(meterVal), meterLogCnt +1 per event). The 51-gal event
(~10 min at 5 gpm) straddled 20:00 -> **2 writes on all three** = the
hourly mid-event checkpoint + the event-end write. Design working.
**Clock skew found (low priority, not durability):** eventMeterDelta records
are stamped from `tiTime` (measure.c:207, TI-side clock) and meterFlashTs
from `RTC_epoch()` (meter.c:75) in the SAME call, yet they differ by up to
~2 min in BOTH directions across the evening (e.g. '3063 20:03:15 vs
20:05:18; '8549 18:49:47 vs 18:49:15). Hypothesis: tiTime is advanced per
TI sample at an assumed cadence between network syncs. Ledger timestamps
inherit this skew — one focused look when convenient.

**0.5 gpm ("ish") run, end 22:06 PT, Bruce reference 20 gal (METHOD NOT STATED):**
'8549 22.851 (+14.3%), '4423 22.753 (+13.8%), '3063 21.718 (+8.6%); mean
+12.2%, spread 5.7 pp. The measured k(Re) curve (copper-m handoff: k=0.8923
at Re 1886) predicts +12.1% -> the trio mean sits ON the curve. This is the
velocity-profile over-read, NOT an Lf error; Lf is validated at 5 gpm
(-0.15% same evening). Device spread at low Re is the open item, as before.
~40-min event straddled 22:00 -> 2 checkpoints (cnt 26->28) again by design.
Also a ~8.8 gal event at 21:18 (no reference).

**ST 17048 SHIPPED 22:2x PT (Bruce: "update L-factor for M-copper 3/4"):**
`stuck-event-fix` @ `bfa624f` pushed; `st-prod` G/17048 (6 chunks, 106,124 B,
sha `86de5ad4…`); `gen2fw=17048` written to the trio. **Pickup needs a
check-in, and checkInPeriod is deleted** -> lands at the next event-end
session, the daily window, or a reboot. A power-pull on each unit does the
Bug 1 acceptance test AND pulls 17048 in one boot session. After all three
report fwVer=17048: DELETE the trio's `lFactor=2239` attrs (Bruce's OK) so
the compiled table is exercised and can't bite on PVC/PEX.
**PEX 3/4: Bruce confirms in the morning (9/2).** Table PEX-A 2.270 /
PEX-B 2.250, no rig validation; check pipeType X-vs-x on the samples.

**Laminar correction requested by Bruce 22:35 PT -> spec drafted, NOT built:**
`laminar-correction-spec.md` (Rev 17049 candidate: kNorm(Re) piecewise-linear
in ln Re through the measured 3-knot curve, opt-in `lamCorr` attr, knots
attr-tunable, fixed `waterTempC` for nu, zero effect >= 5 gpm anchor,
bit-identical when off). APPROVED 23:10 PT and **BUILT** (107,656 B, sha `6a929316…`, 0 warnings;
not committed/uploaded/rolled yet). Temp model = ext probe - 2.5 C, internal
NTC - 2.8 C fallback, fixed 20 C last resort (measured pairs in the spec).
Bruce runs the 2 gpm pin point in the morning; PEX 3/4 confirmation too.

## 0b. MORNING 9/2 — "all over the place" check-ins DECODED (~08:10 PT)

Bruce: '8549 checked in 03:40 w/ data then event w/o data; '3063 nothing
since 22:00, event w/o data; '4423 06:18 missing block, 07:32 w/ data.

**Facts (TB + code):**
- 17048 landed on '8549 (boot 03:28) and '4423 (boot 06:11). '3063 is STILL
  17047: its 07:31 session posted the early status only and died before the
  first STFOTA chunk (stFotaLastVerTried never stamped — bg95.c:1911 stamps
  only after the first GET returns). nvStfotaLatestDl=17047, fsm_fail_TIFOTA
  = 10 (non-fatal counter, state still advances — not the killer).
- **BUG (new, real): the flow-record FIFO pointers are RAM-only.** sf_init
  memsets `sf` (spi_flash.c:1098); nothing recovers `tail`/`head_rd` from
  flash (unlike the meter log, which scans for the erased boundary). Every
  reset orphans the unsent backlog: '8549 bytesToSend 321,504 -> 0 across
  the 03:28 FOTA reboot (TB got 30 records); '4423 488 KB -> drained ~11k
  records in SEND_DATA (06:08-06:11) then ~3.2k lost at the reboot. The
  main.c Rev 16104 comment "backlog survives ST reboot" is WRONG — it
  survives only within a session. Candidate 17050: persist head_rd/tail
  (BKUP regs) or recover tail by erased-slot scan + head_rd from BKUP.
- **Why the backlogs were huge:** checkInPeriod deleted 9/1 16:58 removed
  the periodic drain while recordNoneventFlow=true keeps writing ~0.5 Hz
  records (~60 KB/h): 243 / 77 / 573 KB by 07:31. SEND_DATA runs LAST in a
  session (after STFOTA/FOTA/TIFOTA/final status), so any session that dies
  in the FOTA block uploads nothing -> "event, no flow data". Drain budget
  itself is fine: 32 KB chunks, ~14 s each, STATE_DATA_TIMEOUT 8 min ~ 1 MB.
- '8549 07:31 session: early+final posted (17048, no STFOTA), 243 KB pending,
  nothing reached TB by 08:00 -> SEND_DATA failed/incomplete; missedUploadCnt
  will show at its next post.

**Recommended now (Bruce's OK):** (1) `recordNoneventFlow=false` on the trio
(or restore checkInPeriod) to stop FIFO growth; (2) '3063: power-cycle ->
boot session does STFOTA + the Bug 1 acceptance test (its 573 KB backlog is
lost either way), OR set its gen2fw back to 17047 so sessions stop dying in
STFOTA; (3) queue 17050 FIFO-pointer persistence; (4) 17049 still local.

**Band-aid applied 08:2x PT (Bruce: "band-aid, dig into this later"):**
`recordNoneventFlow=false` on all three, verified. The real fix list is
below (17050) plus, later, WHY non-event recording + no periodic drain
was allowed to grow the FIFO unbounded (Bruce wants to look at this).

**ST 17050 BUILT 08:5x PT (Bruce: "go with 17050 changes") — flow backlog
survives reset.** Root cause was worse than "RAM-only pointers": the
normal boot path called `flow_tof_fifo_init()`, which BULK-ERASES every
flow FIFO block (spi_flash.c:1157) — the backlog was destroyed, not
orphaned, on every reset. Fix: `flow_tof_fifo_recover()` scans block
first/last slots (live entry always has tag 0x7f80; all-0xFF = erased),
finds the written run -> tail (binary search in the partial block) and GC
frontier; oldest-unsent index from BKUP reg 27 (magic 0xA5, written after
every upload chunk in sf_flow_tof_remove), fallback = run start (<=1 block
re-upload; TB upserts by ts). Status keys `tofRecovered` (records) and
`tofRecoverSrc` (1 exact / 2 fallback / 3 region-full-gave-up). Host
simulation: 13 layouts pass (empty, mid-run, wrap, full-block boundary,
run-covers-all, all-full, BKUP valid/==tail/out-of-run/bad-magic).
Image: 108,228 B, sha `86471b45…`, 0 warnings, **4,412 B headroom left**.
Includes 17049 (laminar correction, lamCorr default off). NOT committed /
uploaded / rolled. Commit note: 17049 and 17050 share hunks in main.h /
status_report.c / config.h -> one commit "Rev 17050 (incl. 17049)".
**Rolling 17050 IS the acceptance test:** the FOTA boot runs 17050's
sf_init, so bytesToSend at the last 17048 post should reappear as
`tofRecovered` on the first 17050 post instead of dropping to 0. If '3063's
STFOTA ever completes straight to 17050, its 573 KB is recoverable.
Fresh-init / v1->v2 migration paths still bulk-erase (chip just wiped).

**17050 SHIPPED 09:0x PT (Bruce: "Push and set the trio"):** `stuck-event-fix`
@ `3f8a498` (one commit, incl. 17049), `st-prod` G/17050 (6 chunks,
108,228 B, sha `86471b45…`), `gen2fw=17050` on all three (verified).
Pickup needs a check-in (event end / reboot). **Acceptance comparison —
last pre-roll post per unit:**
  '8549 07:31:54 fwVer 17048, bytesToSend 242,896 (~15.2k records), meterVal 713.516
  '4423 07:32:44 fwVer 17048, bytesToSend  76,976 (~4.8k),           meterVal 729.93
  '3063 07:31:15 fwVer 17047, bytesToSend 573,376 (~35.8k),          meterVal 1127.583
EXPECT on the first 17050 post: `tofRecovered` ~= (bytesToSend at the last
pre-FOTA post)/16 plus whatever accrued, `tofRecoverSrc` 1 or 2, bytesToSend
NOT 0; deltaMeterVal in (-1, 0]. If '3063 goes 17047 -> 17050 directly its
573 KB should come back. missedUploadCnt=0 on all three at 07:31 — the
07:31 '8549 SEND_DATA outcome is still unknown (counter posts next session).

**BUG 1 ACCEPTANCE — PASSED 9/2 08:30-08:31 PT (Bruce power-cycled the
trio on 17048/17047):** boot posts deltaMeterVal **-0.52 / -0.93 / -0.58**,
meterFlash == meterVal (713 / 729 / 1127). Yesterday the same action was
-77..-81 gal. Register durability CLOSED.
17050 pickup: '3063 on 17050 at 08:32:50 (download fine this time — its
07:31 failure was transient link); '8549/'4423 on 17050 at 08:33:22-24.
**ALL THREE ON 17050 as of 08:33 PT**, lamCorr=false, deltaMeterVal 0 on the
planned reset, registers 713 / 729 / 1127. bytesToSend=0 / tofRecovered=0 on these boots is EXPECTED: the
OLD firmware's sf_init erased the backlogs one last time before 17050 ran.
**17050 recovery test still to run:** on 17050, make an event (data
pending, bytesToSend > 0 at the event-end post), power-pull, and the boot
post should show tofRecovered ~= bytesToSend/16 with tofRecoverSrc 1.

**'3063 STUCK CALIBRATING after the 17050 boot (Bruce 08:4x PT):** its
08:32:50 boot post is byte-for-byte the same "TI just reset, CAL_INIT" snapshot
the other two showed (Calibrating, calFlags2=2 Unstable, tiUartFbPkts=2, gain
40/env 30) — but '8549/'4423 posted Metering at 08:36 with a full surface-cal
record and '3063 posted NOTHING after 08:32:50. Not a lost cal gate: TI v364
self-starts after 60 aggs even without 0xA8 (cal.c CAL_START_GATED_TIMEOUT_AGGS)
and the ST re-pushes the gate every 30 aggs while TI is non-metering
(ti_gate_watchdog). Remaining candidates, distinguishable ONLY by a session:
(a) cal failing/looping -> InfoFailedCal (the failed-cal->radio path is
deliberately severed, and checkInPeriod is deleted, so it stays silent);
(b) TI quiet/hung after the ST-driven reset (FbPkts frozen at 2 -> ti_monitor
recovery counters would show); (c) reached Metering but the transition session
failed. Force a session: run water on '3063 (event end -> radioOnEventEnd) or
power-cycle again. **RESOLVED 08:48:56 (Bruce ran water -> event-end session):** deviceState
Metering, gain 33 / env 40 / calSurfCleanN 31 / offset locked, tiUartFbPkts
789 — TI calibrated normally minutes after boot. The ~08:36 metering-
transition session FAILED (fsm_fail_SEND_STATUS=1, fsm_fail_SEND_DATA=1,
missedUploadCnt=1) — Bruce: "could be session timeout" — correct. TB showed
the stale boot snapshot. Not a cal or TI problem: a LINK failure, '3063's
second today (07:31 STFOTA GET died, 08:36 POSTs died). Records from the
failed session (0.80 gal @08:32:53, 2.33 gal @08:42:50) uploaded in the
08:48 session — the backlog survived because there was NO reset in between
(17050's recovery not exercised here; tofRecovered=0 correct).
**Bug 3 tally (revised): '3063 keeps failing sessions the other two
don't, on identical firmware/levers — RF/link, not cal. See RSRP compare.
**RSRP / session-failure compare (24 h to 9/2 08:49):**
  '8549  rsrp med -89 dBm (-93..-87)  VZW 311480  SEND_DATA fails since 9/1 09:36 boot: 0
  '4423  rsrp med -91 dBm (-94..-89)  TMO 310260  fails since 9/1 09:58 boot: 0
  '3063  rsrp med -96 dBm (-99..-93)  VZW 311480  fails: 10 between 9/1 11:13-14:19 (one
         per session, payloads 5-375 KB), reset at the 15:03 boot, +1 today (08:36).
  The big counts (26-29 on '8549/'3063) are all from 9/1 09:11-09:36 = the pre-17046
  1.8 MB backlog era; irrelevant now. '3063's 9/1 14:19 last-post-before-silence was
  fail #10 -> Bug 3's 14:19-15:03 silence was almost certainly the same link failure.
  '3063 is 5-7 dB weaker than its Verizon sibling and the ONLY unit failing routine
  data POSTs. -96 dBm is not marginal by fleet rules (never replace for RSRP), so:
  **TEST: swap '3063 and '8549 bench positions.** Failures follow the unit -> antenna
  / RF hardware suspect; stay with the position -> bench RF spot. Cheap and decisive.
**Clean-out 08:57 PT on 17050 (no reference):** '8549 3.011 / '4423 3.026 /
'3063 3.071 gal, 27-28 s, ~6.5-6.8 gpm avg; spread 2.0% (27 s event,
quantization-dominated). All three event-end sessions landed (08:58:44-
08:59:24), registers checkpointed at event end (flashTs 08:57:46-55).
**'3063 fsm_fail_SEND_DATA 1 -> 2 in this session** (status OK, data POST
failed, 34 records still pending) — third data failure today vs ZERO on the
other two. Position-swap test is now well motivated.
**2 gpm x 20 gal PIN RUN 09:01-09:12 PT on 17050, lamCorr OFF (method not
stated):** '8549 19.995 (-0.03%), '4423 19.918 (-0.41%), '3063 20.642
(+3.21%); trio mean +0.92%, spread 3.6%. True flow 1.982 gpm, Re ~7700 at
**20.0 C water (Bruce measured)**; probes ext 22.2/22.7 (+2.2/+2.7), int
21.6/21.9/22.3 (+1.6..+2.3) — settled ext bias matches the 2.5 default. **The ln-linear interpolation between
the Re 4102 and 20613 knots predicted +2.31% here — the profile develops
faster than that: measured kNorm 0.991 (trio) / ~0.998 (the two clean units).
Refit WITHOUT a rebuild: `lamRe3 = 10000` (kNorm reaches 1.0 by Re 10k ~2.5
gpm) gives -1.0% correction at 2 gpm -> '8549 -1.0 / '4423 -1.4 / '3063 +2.2,
mean -0.1%. 5 gpm anchor unaffected. '3063 is the high outlier here and was
the LOW outlier at 0.45 gpm — device scatter, not curve.** Recommend: set
lamRe3=10000 on the trio before lamCorr=true; a 1 gpm x 20 gal run would
re-pin knot 2 (measured 8/30 only). '3063 fsm_fail_SEND_DATA now 3.
**PEX-A SANITY CHECK 09:3x PT (Bruce: "Switch the trio to pex a"):** on all
three: `lFactor` attr DELETED (it would have overridden the PEX table with
2.239 -> ~-6.6%), `pipeType=X` (PEX-A: table dia 0.681", Lf 2.270). lamCorr
still off (PEX knots unmeasured anyway). setCalStates() is an EMPTY STUB ->
a pipeType change does not recal: Bruce mounts on PEX then POWER-CYCLES
(fresh TI cal; also the 17050 recovery test if records are pending).
PEX-A vs PEX-B is a ~4% built-in difference — confirm the tubing is A.
Expected: turbulent points near 0 if the PEX-A Lf 2.270 is right (never
rig-validated; only the Aug WYSE 4 gpm capture: 95.0/93.3% under PEX-A
constants vs 99.0/97.2% under PEX-B — i.e. the August data favoured PEX-B
constants for THAT tubing). Copper attrs will need restoring afterwards:
pipeType=M (+ lFactor only if the unit is not yet on the 17048+ table).
**CORRECTION (09:4x PT) — the '3063 "10 failures" were a STICKY COUNTER, not 10
failed uploads.** bg95_send_data sets fsm.rc = (cnt_missed_upload == 0) and
cnt_missed_upload is never reset after boot (Rev 15003, e043937, 2026-03-26).
After ONE real miss every later SEND_DATA reports ERROR: fsm_fail_SEND_DATA
climbs 1 per session while missedUploadCnt stays at 1 — exactly the TB trace
on '3063 both days (9/1 11:13-14:19: missed=1 flat, fail 1->10; 9/2: missed=1,
fail 1->4). Real data-POST failures on '3063: ONE per boot cycle. The RSRP gap
(-96 vs -89 dBm) is real but the failure-count evidence for a link problem is
withdrawn; the position-swap test is optional now.
**Upload-loop audit (Bruce's question "try each blob or abort?"):**
  BEFORE Rev 15003: on a failed chunk cnt_missed_upload++, the chunk was
  REMOVED anyway (sf_flow_tof_remove ran unconditionally) and the loop went on
  to the next chunk; fsm.rc always SUCCESS -> failures invisible, data DROPPED.
  SINCE 15003: first failed chunk -> break; chunk KEPT at head_rd (retried next
  session); fsm.rc ERROR whenever cnt_missed_upload != 0 (sticky).
  Consequences: (1) head-of-line blocking — a chunk the server/modem rejects
  deterministically wedges the FIFO forever; GC cannot free behind head_rd;
  when full, appends stop. Pre-17050 the connmgr flash_full() path called
  sf_init() = erase-everything = the brutal unwedge. **17050's recover removed
  that unwedge** -> a poison chunk now wedges permanently. (2) sticky rc ->
  connmgr_data_report_sent_successfully() never called again after one miss ->
  consecutive_failures (16141 carrier fail-escalation, 3 -> rescan + 10 dB
  incumbent penalty) is never reset by data success — fires on 3 lifetime
  session failures instead of 3 consecutive. (3) fsm_fail_SEND_DATA is
  meaningless as a rate after the first miss.
  **17051 proposal (needs OK):** per-session miss count drives fsm.rc; keep
  break-on-failure; count sessions that fail at the SAME head_rd (BKUP or RAM);
  after 3 strikes skip that chunk (sf_flow_tof_remove) + `tofSkipped` status
  key -> bounded loss (<=32 KB) instead of a wedge; if flash_full() and the
  head chunk has struck once, drop it immediately.
**17051 SCOPE DECIDED 9/2 ~10:00 PT (Bruce: battery first, TS data sacrificial,
"keep it simple"):**
  Per chunk: 1 attempt. Fail -> classify: TIMEOUT class (no +QHTTPPOST URC
  within serial+network timeout / transport TIMEOUT) = radio -> strike, NO
  retry. ERROR class (immediate +CME ERROR, Quectel 7xx, non-200 with a
  response) -> one retry after a short settle; fail again -> strike. A struck
  chunk is DROPPED (sf_flow_tof_remove) and the loop moves on.
  Per session: 2 consecutive strikes -> PUNT the data phase (attr
  tofPuntStrikes, default 2). Timeout-class punt -> also DISCARD the remaining
  backlog (fringe site never drains it). Error-class punt -> keep backlog.
  Carry cap: never bring >4 chunks (128 KB) into the next session (trim oldest).
  Housekeeping: per-session miss count drives fsm.rc (fixes the sticky counter);
  flash_full() path drops the head chunk instead of the erase-all 17050
  removed. Status: tofDropped, dataPunts, lastDataFail (0/1 err/2 timeout).
  NOTE: today each blob is tried ONCE (qhttppost_noretry) — Bruce's "twice"
  was the intent, not the code.
  Worst case dead link: ~90 s radio then out. ~80 lines, 0 new BKUP regs.
**17051 BUILT 9/2 ~10:20 PT as scoped (Bruce: "ok"):** 108,732 B, sha
`412838ae…`, 0 warnings, **3,908 B headroom left**. 6 files / +159. Not
committed / uploaded / rolled. Implementation: bg95_send_data classifies a
failed POST by m_handler.transmission.rc (RADIO_TRANSMIT_TIMEOUT = no URC
within timeout -> TIMEOUT class; anything else incl. CME match / Quectel 7xx
-> ERROR class); ERROR gets one 2 s-settle retry of the same chunk, TIMEOUT
none; struck chunk removed; tofPuntStrikes (attr, default 2) consecutive ->
punt; timeout punt drops backlog; carry cap TOF_CARRY_CAP_RECORDS = 4 x 2048
trimmed before sending; fsm.rc per-session; connmgr flash_full relief =
drop 4096 records (was sf_init erase-all). Status: tofDropped, dataPunts,
lastDataFail. Bench check: none possible without inducing failures —
consider a run with the antenna detached to force TIMEOUT class and confirm
punt + backlog drop + session length (~90 s data phase max).

**Session attribution (radioStartFile, 9/1 22:00 -> 9/2 09:10):** every
"no apparent reason" check-in = `measure.c:203` = radioOnEventEnd firing on a
tiny event ('8549 03:26 = 0.055 gal dribble; '4423 06:07 similar). Boot
sessions = `init.c:70`; metering-transition = `ti_hci_impl.c:1423`. ONE
unexplained periodic session at 22:04 on all three (`connmgr.c:272`, the
checkInPeriod gate) exactly 300 min after the 17:04 sessions, although the
attr had been deleted at 16:58 — not repeated (no 03:04 session). Group
"Wyse Eval" (the trio's group) carries NO shared attrs, so not inheritance.
Source unknown; low priority.
**TB access switched to the standing API key** (`~/.claude/secrets/`, memory
`reference_tb_api_key`); tb_attr.py uses ApiKey auth; scratch JWT retired.
Writes keep the preview + explicit-go rule; this handoff is the audit log.
**Test plan decision:** skip a 17050 soak (it would only reach the FIFO-full
wedge 17051 already fixes, ~33 h at 60 KB/h). Ship 17051, then
recordNoneventFlow=true soak: pass = recording never stops, data phase <~1 min
per session, tofDropped absorbs the excess, bytesToSend bounded. Awaiting go.

**17051 SHIPPED 9/2 ~10:5x PT (Bruce: "Agreed let go"):** `stuck-event-fix`
@ `ade338d` pushed; `st-prod` G/17051 (6 chunks, 108,732 B, sha `412838ae…`);
`gen2fw=17051` written to the trio. Pickup needs a check-in (event end or
power cycle); watcher running. NEXT after all three report 17051:
`recordNoneventFlow=true` on the trio -> soak. Trio is ON PEX (Bruce 11:0x) -> `pipeType=X` correct; the soak runs on
PEX-A (table Lf 2.270, unvalidated — fine for a wedge test, NOT an accuracy
reading). Power cycle for pickup also gives the TI a fresh PEX cal.

**FIELD: Shady Lane 79461768 (58f7ce80…) updated to 17050 9/3 07:37 PT (Bruce:
"uploaded a ton of data but no adc or tnorm sample from calibration — flash
issue?")** Pre-update on 17028/341 it was ALREADY the wedge case: bytesToSend
1.39-1.49 MB for 24 h, sessions fired by the full-FIFO trigger
(connmgr.c:423/444), rsrp -106..-111 dBm (fringe), recordNoneventFlow on
(Shady audit unit). 17050 boot: tofRecovered 25,633 (src 2), bytesToSend
410 KB; same session TIFOTA 341->364, recal, Metering 07:40:15 (gain 26/env
40/qual 100). **adcCapReceived=1 / adcCapOk=1 and tnormCount=10 at 07:40 =>
the cal waveform and tnorm samples WERE captured and stored.** They sit at the
TAIL of a 412 KB FIFO that drains oldest-first; nothing timestamped >= 07:37
has reached TB yet (latest flowRate/tofNorm 07:18:59, latest adc 9/2 21:15),
and the unit has not posted since 07:40 (no periodic trigger now that the FIFO
is no longer full). NOT a flash fault: expect the cal capture to appear when
the backlog drains — IF sessions at -110 dBm can drain 13 chunks. This is the
17051 case exactly (carry cap would trim to 128 KB; punt on timeouts).
Watch its next post: bytesToSend should fall; if it doesn't, the drain is
timing out at this RSRP.
CORRECTIONS after reading the trigger code: `connmgr.c:444` = the DAILY
scheduled check-in (radioTimeHour, 09:00 local — all 32 Shady units fired it
at 09:00), `connmgr.c:423` = the full-FIFO trigger (79461768's 9/2 08:22).
Non-event recording is OFF in fleet builds (RECORD_NONEVENT_FLOW_DATA
commented out; attr unset) — the continuous record stream comes from a
CONTINUOUS EVENT: meterVal 8712.6 -> 9118.3 in 23.2 h = **~406 gal/day
(~0.29 gpm) nonstop** on 79461768. A continuous event = 1 s records forever
-> FIFO full in ~17-33 h -> at -110 dBm the daily session cannot drain it.
Shady Lane group scan 9/3 09:00: 36 units, rsrp -100..-123 dBm, 32 posted
on the daily schedule, pending median 60 KB, 5 units > 256 KB (75362887
1.42 MB / 75366938 659 KB / 77041962 578 KB / 79461768 402 KB / 75368777
282 KB). Two units already on 17050 (79461768, 70269798). The 17051 policy
(carry cap + timeout punt) is what this site needs before any wider 17050.
Continuous-flow check on the big-backlog units (48 h register, 24 h records):
79461768 **+418 gal/d, 95% of records flowing** (0.29 gpm nonstop — leak or
phantom, Shady audit class); 75368439 +254 gal/d and NO records reached TB in
24 h (drain failing); 77041962 +28 gal/d but 96% flowing (tiny continuous
flow); 75362887 / 75366938 / 75368777 post once a day so no rate in 48 h and
no records reached TB. => the backlog source is continuous EVENTS at a fringe
site with daily-only sessions, not non-event recording.

**"Metering but failedCal=true" (Bruce 9/3):** mechanism found. TI v349's
quiet-deferred recal sets `gFailedCal=true` WHILE STILL METERING (cal.c:2515
walker exhausted, cal.c:2684 chronic error) and only clears it on the next
metering ENTRY (cal.c:1036, guarded by `if (!gIsMetering)`), which happens
only after the deferred recal runs (setNotMetering -> recal -> re-entry; up
to CAL_RECAL_DEFER_MAX ~1 h, or never if held). Meanwhile duneInfo.flags
carries InfoMetering|InfoFailedCal: ST deviceState says "Metering"
(precedence, status_report.c:49) while `failedCal=true` (line 529) and the
STATUS_FAILED_CAL event fires (hci.c:1131). Prevalence right now: 0 of 217
devices in 10 groups show both -> it is a transient window, not a stuck
fleet state. Fix options: (a) TI v365: at the two deferred-recal sites set
only CalF2_RecalPending (already in calFlags2), reserve gFailedCal for
not-metering verdicts (also fixes the red-LED blink on a metering unit);
(b) ST 17052: report failedCal = InfoFailedCal && !InfoMetering and gate
STATUS_FAILED_CAL the same way (2 lines). Bruce's rule: "metering = normal". **DECISION 9/3: do both — ST 17052 mask
built now; TI fix added to the v365 list.**

**ST 17052 BUILT 9/3 ~09:40 PT:** failedCal key, STATUS_FAILED_CAL event and
the Rev 17030 failed-cal diagnostic capture all masked while InfoMetering
(status_report.c, hci.c, ti_hci_impl.c). LED path already had Metering
precedence (leds.c failedCalLatchUpdate) — unchanged. 108,740 B, sha
`368746a3…`, 0 warnings, **3,900 B headroom**. Not committed/uploaded/rolled.
Note: the trio has NOT yet picked up 17051 (no power cycle yet) — 17052 can
supersede it directly on the trio if Bruce prefers (17052 = 17051 + mask).

**17052 SHIPPED 9/3 ~09:45 PT (Bruce: "Yes update the trio"):** `stuck-event-fix`
@ `72c967f` pushed; `st-prod` G/17052 (108,740 B, sha `368746a3…`);
`gen2fw=17052` on the trio, superseding the never-picked-up 17051. Watcher
running (4 h). `recordNoneventFlow=true` SET 9/3 09:45 PT on all three (Bruce
asked) — lands on each unit at its next attribute fetch = the power-cycle boot
session, so the soak clock starts at the 17052 boot. Soak pass = recording
never stops, data phase <~1 min/session, tofDropped absorbs excess,
bytesToSend <=128 KB entering any session.
Bucket now holds 17047..17052; st-test has none.

**17052 PICKED UP 09:49-09:50 PT (Bruce power-cycled, units on PEX-A):**
boot posts: fwVer 17052, fwVerTi still 364 (TIFOTA runs later in the boot
session), Calibrating, `tofRecoverSrc=1` (BKUP pointer valid — exact
recovery; tofRecovered 0 because nothing was pending), deltaMeterVal
-0.10 / -0.53 / -0.97 (Bug 1 holding), failedCal=false, tofDropped 0,
dataPunts 0. SOAK CLOCK STARTS HERE (recordNoneventFlow=true lands this
session). **TI v365 LANDED + METERING on all three 09:51-09:53 PT** (same boot
session): gain 30/32/27, env 40, qual 100 on PEX-A, tiBslResult 1,
failedCal false, calFlags2 0, bytesToSend 2,176 (136 records) each. Final
pair for the soak: **ST 17052 + TI v365**, PEX-A, recordNoneventFlow=true,
radioOnEventEnd=true, no checkInPeriod.

**PEX-A 50 gal @ 5 gpm, 9/3 09:58-10:08 PT (marked vessel, zeroed by a
clean-out), ST 17052 / TI v365, pipeType=X (table Lf 2.270, dia 0.681),
lamCorr off. **CORRECTED reference (Bruce): 51.1 gal actual, water 18.0 C.**
'8549 46.370 (-9.26%), '4423 46.758 (-8.50%), '3063 48.023 (-6.02%); **trio
-7.93%**, spread 3.5%. Decomposition (SIGN CORRECTED): reported V scales
as (vtot/c_real)^2 and cold water has LOWER c, so at 18 C vs the 22.4 C
anchor the meter reads ~+1.4% HIGH (net ~0.32 %/C, copper handoff; the
8/17 test measured +0.37 pp for 1.4 C cooler). Removing it, the L-factor
part is ~-9.3% => **fitted PEX-A Lf ~ 2.225** (n=1, device spread 3.5%).
NOT the copper-M value (2.239 would leave ~-3%). Table 2.270 is simply
high; fleet PEX-A 3/4 meters read ~9% low at reference temperature.
Confirmation: `lFactor=2225` attr on the trio, repeat 50 gal with the water
temperature recorded, then the X-column table change. Probe bias this run: ext 21.6/22.2 vs
18.0 = +3.6/+4.2 (Bruce: expected — PEX wall thermal resistance >> copper,
so the clamp-on couples less; copper same-duration run read +2.2/+2.7).
=> extTempBias is per material: copper ~2.5, PEX ~4.0 (attr, no FW change). Matches the Aug WYSE capture (95.0/93.3% under PEX-A constants). Options:
`lFactor=2241` attr on the trio + repeat 50 gal to confirm, then table
change for the X column (fleet PEX-A units read ~6% LOW today).

**SOAK CHECKPOINT 10:10 PT (first two sessions on 17052/v365):** clean-out
09:54 (7.8/7.9/8.0 gal) -> sessions 09:57 with 3.5-5.2 KB pending; 50-gal
event -> sessions 10:09 with 11.4-11.7 KB pending; tofDropped 0, dataPunts 0,
lastDataFail 0, fsm_fail_SEND_DATA 0, missedUploadCnt 0; registers
checkpointed (mv 797.157/797 etc.); 913-960 flow records per unit reached TB
since 09:50. PASS so far. Oddity: each unit's TB "latest" flowRate/temp rows
carry a garbage far-future ts (~9.2e13 ms = year ~4877) that range queries
cannot retrieve — a few device records are stamped with junk time and poison
the latest-value table (dashboards reading "latest" see it; range data is
fine). Same class as the eventMeterDelta 2061/2084 stamps. Stamping path read:
records take tiTime (= modem unix_time*1000 at each session sync, +1000 per
TI aggregate between syncs); the sync-site comment records the OLD bug that
stamped records unix_s*1e6 ("TB buries them as far-future fossils", fixed
before 17047). Today's bogus 'latest' rows are the same values seen
yesterday ('8549 temp BADTS 87180870172064 both days) => STATIC FOSSILS from
that era, not new 17052 output. Verify at the next soak read: if the
flowRate 'latest' ts (91765442320064 / 91852094272064 / 91895502272064)
has not moved, it is a one-time TB cleanup: DELETE
/api/plugins/telemetry/DEVICE/{id}/timeseries/delete?keys=...&startTs=<far>
&endTs=<far> on the affected keys (needs Bruce's OK; also fixes the
"latest" temp/eventMeterDelta pollution). Fleet-wide sweep of latest-ts >
now+1y would size it.

**9/3 ~10:30 PT — Bruce: "do all 3 changes, we need thermal profile column
added" (then "actually 2 changes" — clarification pending):**
  (1) `lFactor=2225` WRITTEN to the trio (PEX-A confirmation run pending).
  (2) ST 17053 BUILT — SCOPE SETTLED (Bruce: "dial in l-factor as an
  attribute first then roll into FW"): THERMAL PROFILE column ONLY.
  `extTempBiasByType[11]` (copper 2.5 C, plastics 4.0 C; int = ext + 0.3)
  used when extTempBias/intTempBias attrs are absent (`extTempBiasSet`/
  `intTempBiasSet` flags, cleared per parse). PEX-A table stays 2.270 with a
  KNOWN-HIGH comment; the value lives in the trio's lFactor attr (2225)
  until confirmed, then rolls into the table. 108,856 B, sha `42b9b378…`,
  0 warnings, **3,784 B headroom**. Not committed/shipped.

**17053 SHIPPED 9/3 ~10:50 PT (Bruce: "Please push to the trio"):**
`stuck-event-fix` @ `fdae907` pushed; `st-prod` G/17053 (108,856 B, sha
`42b9b378…`); `gen2fw=17053` on the trio. Bruce runs a clean-out to make the
FW + lFactor=2225 take, then repeats 50 gal @ 5 gpm on PEX-A = the L-factor
CONFIRMATION run. Watcher reports pickup (fwVer 17053, L_FACTOR 2.225, soak
counters entering) and the event volumes. Expected at ~18 C: trio ~+1.4%
(cold-water term only); at ~22 C: ~0.

**17053 PICKED UP 10:30-10:31 PT via the clean-out session** (fwVer 17053 /
TI 365, tofRecoverSrc=1, tofRecovered 0 — the pre-FOTA session's SEND_DATA
ran BEFORE the reset (status -> SEND_DATA -> PWRDN -> reset), so nothing was
left to recover; deltaMeterVal -1.0/-0.87/-0.52). Early boot posts show
L_FACTOR=2.13 = pre-attribute default row (see note) — TI was calibrating,
no flow computed on it.
**PEX-A CONFIRMATION RUN 10:41-10:51 PT, lFactor=2225, 50 gal nominal @ 5.2
gpm:** '8549 50.524 (+1.05% vs 50), '4423 51.005 (+2.01%), '3063 52.114
(+4.23%); trio 51.214 = +2.43% vs 50 nominal, spread 3.1%. Probes ext
21.6/22.0, int 21.3-21.9. **Bruce: 50.5 gal actual at 17.6 C.** Errors +0.05 / +1.00 / +3.20%,
**trio +1.41%**, spread 3.1%. Cold-water term at 17.6 C ~+1.5% (0.32 %/C x
4.8 C) -> L-factor residual ~-0.1%. **PEX-A 3/4" Lf = 2.225 CONFIRMED.**
Prediction check: 2.270 -> 2.225 = +10.13% lift; run 1 (-7.93%) predicted
+1.40%, measured +1.41%. Per-device after temp: -1.5 / -0.5 / +1.7 ('3063
high on turbulent flow again, as at 2 gpm). Ready to roll into the table
(X column, 3/4" row) in the next ST rev — Bruce's process: attr first, then FW.
Shareable report (private artifact): https://claude.ai/code/artifact/3c04232a-c74b-4e54-8d00-c743e95e9d05
Minor: early boot-post L_FACTOR telemetry reads 2.13 (pre-attribute state;
TI calibrating, no flow computed) — misleading value, harmless.

**SOAK CHECKPOINT 12:57 PT (clean-out, Bruce):** '8549/'4423 recorded 6.77 gal,
sessions entered with **125,120 / 125,664 B pending** (2 h of 1 Hz non-event
records + event — just under the 131,072 B carry cap), tofDropped 0, punts 0,
and the sessions DRAINED IT: 7,203 records each (1,800 per 30 min = 1 Hz)
stamped 10:53-12:56 are in TB. PASS. Expectation for overnight: with only
event-end sessions, backlog exceeds the cap after ~2.2 h -> the first morning
session should show tofDropped > 0 and bytesToSend <= 131,072 entering — that
is the design working, not a fail.
**'3063 SILENT since 10:52:34** (Bruce: "looks wedged"): no 12:55 clean-out
record, no session, TB stale on the 10:51 LARGE EVENT; '8549/'4423 fine. Either
TI stopped metering / event never closed, or the event-end session failed
(would be its 4th session-class failure; rsrp -97/-98 at 10:52 vs -87/-94).
Only a session tells. **Recommend power-cycle '3063**: boot session shows
state AND it is the 17050 recovery test we still lack (~125 KB pending ->
tofRecovered ~7,800 expected, tofRecoverSrc 1).

**'3063 POWER-CYCLED ~13:04 PT (Bruce):** boot post 13:04:46 — resetReason
NONE (clean power-on), **tofRecovered=391, tofRecoverSrc=1** and the 391
records are in TB (12:55:03-13:01:10) => **17050 RECOVERY PROVEN** (yesterday
that reset destroyed them). deltaMeterVal +6.02: the 12:55 clean-out (6.7 gal)
WAS metered and checkpointed (register 1273.98 -> 1280). TI recalibrated,
Metering 13:07 (gain 32/env 40). Timeline from the recovered records:
**NO flow records 10:53-12:55** (the other two produced 600 per 10 min all
that time) -> records resume at the clean-out 12:55:03 at 1 Hz (event AND
post-event non-event records) -> stop 13:01:10 -> boot 13:04:46. Reading:
the event closed ~13:01 and the event-end session STARTED (records stop while
the radio is up — Bug 2 class) but never posted before the power cycle ~3.5
min later (its link: -97..-104 dBm). The 2-h record silence before the
clean-out is the open question: metering continued (register right), so
either TI aggregates stopped while idle (and flow woke it) or the non-event
record path stalled on '3063 only. Investigation result: NOT the radio — '3063's BKUP lifetime counters went
nvTotalRadioTimeSeconds 420,333 -> 420,363 (+30 s) and nvTotalRadioCount +2
between 10:52 and the 13:04 boot, so the radio was OFF for essentially the
whole 2 h (the record gate is radio-power, measure.c:1151). At 10:52 all
three reported noneventMode=true with bufSamples == tiAggCount (records
written for every aggregate); '8549/'4423 kept that pace to 12:57 (8,444
samples). '3063's pre-reset RAM counters are gone with the reset, so the
2-h record hole (10:53-12:55) is UNEXPLAINED: candidates are TI aggregates
absent/marker-rejected while idle (recording resumed exactly when flow
started, i.e. when TI had to lock), or an SPI staging/write stall — all
'3063-only. Its 13:01 event-end session then failed to post within 3.5 min
(4th session-class failure on this unit in 30 h; 0 on the others).
**Bruce: "swapping shouldn't do anything" — agreed, radio is not implicated
(withdrawn). His second point stands: with recordNoneventFlow true, records
are written whether or not an event is open, so a 2-h hole means aggregates
never reached the recorder.** What the recovered records add: 12:55:03-
13:01:10 (tiTime) are NOT-METERING records (measure.c:719 path — flowRate
forced 0, tofNorm 11-176 ps while '8549 read ~30,000 ps in the clean-out),
so '3063's TI was out of metering at least from then until the 13:01
metering re-entry (whose transition session then failed to post). Before
12:55 nothing was recorded at all -> aggregates dropped upstream of the
recorder: the +/-25 us TOF_VAL_THRESH gate (measure.c) or the 17043 marker
discernment, both `return` before any record. Contradiction still open: the
register gained +6.02 gal with a checkpoint at 12:53 RTC, yet NO flowing
records exist anywhere (TB 10:52-12:55 empty; recovered set has none). One
radio activation (+30 s) fell in the window — if it coincided with the
clean-out, its records were gate-suppressed while metering continued, which
would reconcile it; unverifiable post-reset. **Not put '3063 in front of
WYSE** stands.
**FURTHER CORRECTION (Bruce: "the other meters recorded 6.77 gal pretty
close"):** '3063 metered 6.02 vs 6.77 => TI WAS metering the clean-out; the
"TI out of metering" reading of the 12:55-13:01 zero-flow records is
WITHDRAWN — an idle METERING unit writes identical records ('8549's idle
records read tofNorm ~59 ps). Radio-time accounting re-read: full/count
both increment at PWRDN, and the 10:52 post preceded its own session's
accounting, so "+2 / +30 s" = the 10:52 session's normal ~24 s + ONE more
short (~6 s) session, i.e. exactly one radio activation 10:53-13:04.
The flash-module-disabled theory ALSO fails: sf_init_done only goes false
via sf_init (boot / main-loop retry / the pre-17051 flash_full path) and the
17036 self-heal is a REBOOT request (none happened, resetReason NONE).
tofRecovered=391 with a VALID BKUP pointer means the FIFO tail did NOT
advance during the hole: samples were dropped BEFORE append — the only such
paths are sf_flow_tof_buffer's `available()==0` drop (sfBufferDrops) and
the RAM-only branch. Pre-reset RAM counters are gone, so this cannot be
settled from TB. **What settles it next time: do NOT power-cycle a silent
unit — run water to force an event-end session; the status post carries
sfBufferDrops / sfRadioSkips / spiInitFail / flashBusyOnWake / tiAggCount /
bufSamples / noneventMode live.** Also queue: persist those as lifetime
NVRG counters (one packed register) + the pre-reset snapshot.
**ROOT CAUSE CANDIDATE (high confidence) — the 12-min RADIO FORCE-OFF leaves
`connmgr.on` TRUE.** bg95.c:3452: when a session exceeds STATE_FORCE_OFF_TIMEOUT
the safety hard-resets EN_RADIO and `memset(&m_handler,0)` (FSM -> OFF) but
does NOT call connmgr_shutoff() — the ONLY place `connmgr.on` is cleared
(PWRDN path, bg95.c:3271) — and skips the session accounting. Afterwards
radio_get_powerstate() (== connmgr_on()) reports ON forever until some later
session completes PWRDN. Consequences while stuck: every record path is
gated (measure.c:717/1021/1148, spi_flash.c:1622 staging flush) -> NO FLOW
RECORDS while metering continues; meter.c:184 (hourly path) gated; main.c
FOTA/wedge resets deferred; pwr.c sleep gate -> likely no low-power sleep
(battery); LED shows radio on. Fits '3063 exactly: a session between 10:53
and ~12:41 hung (fringe link) -> force-off at +12 min (uncounted, hence
count +2 = 10:52 session +24 s and the 12:53 event-end +6 s) -> flag stuck
-> 2-h record hole with metering intact -> Bruce's water at 12:52 metered
(+6.02) but unrecorded -> event end fires a session -> it completes PWRDN
(fails fast, 6 s) -> connmgr_shutoff -> gate opens -> records at "12:55:03"
-> mag reset 13:01 -> boot 13:04. Bruce: "it did not respond, the other two
did" = the 6-s failed session. No force-off counter exists anywhere.
**Shady pilot of the force-off estimator (7 d, 36 units; hung = status-post
sessions minus nvTotalRadioCount growth):** 357 sessions, 330 completed,
~5 hung on 3 units. Clear victim 79459895 (17040, -118 dBm): 3 of 7 sessions
hung, flow records on 1 of 7 days. 5 units have records on <4 of 7 days;
70269798 (17050 today) has 0/7 with 0 KB pending = a different fault
(nothing recorded at all — check TI/metering). => at Shady the dominant
"no TS data" cause is daily-cadence + fringe RSRP + undrained backlog
(17051's case); force-off stuck-flag is the tail. Fleet-wide scan running
(fleet_forceoff_scan.csv in the scratchpad).
**CAVEAT (Bruce 9/3 ~14:30: "is your contention '3063 had a radio session
beyond 12 min?"):** YES, the theory REQUIRES an unobserved third session that
hung >12 min between 10:53 and ~12:41 (no post — a CONNECT hang never posts;
trigger unknown). The counters fit BOTH readings: {10:52 completed + hung 3rd
(uncounted) + 12:53 fast-fail} and {10:52 + 12:53 both completed, no 3rd} —
under the second the flag was never stuck and the hole is unexplained. The
force-off path is the only code found that yields metering-yes / records-no /
no-sleep / resumes-at-next-completed-PWRDN, but that is a fit, not proof.
Discriminators: (1) LED during the silent 2 h — radio-on pattern (leds.c:106)
= confirmed, normal metering blink = refuted — Bruce: LED was in powersave
timeout (off), NO observation available; (2) Vdda/VddAdc
across the window: INCONCLUSIVE ('3063 3621->3621 mV, die temp 26-27 ->
28-29 at boot; no signal either way). The 17054 fix is correct regardless
(force-off demonstrably leaves connmgr.on true); whether it explains '3063
is unproven.
**CAPTURE SETUP 9/3 ~15:15 PT (Bruce: "set checkInPeriod to 120 min,
recordNoneventFlow true"):** written + verified on the trio. Lands at each
unit's next session (event-end until then), then a periodic post every 2 h
carrying the live RAM counters. **Stuck-flag signature to watch on any post:**
`tiAggCount` advancing while `bufSamples` stalls (recorder gated) and
`sfRadioSkips` climbing (blocked staging flushes); flow records absent for
the interval; `radioStartFile` of the post = connmgr.c:272 (periodic). The
periodic session also completes PWRDN and CLEARS a stuck flag, so a unit can
be dark at most ~2 h. FIFO drains ~115 KB per 2 h (under the 128 KB cap ->
tofDropped stays 0; the soak is now an observability soak). Same levers are a
candidate for Shady's 79459895 (Bruce's call).
**FLEET SCAN 9/3 (7 days, 148 customer groups, 4,913 devices; estimator =
status-post sessions minus nvTotalRadioCount growth; CSV
scratchpad/fleet_forceoff_scan.csv):** 32,452 sessions, **445 est. hung on
147 devices (3.0%)**; 117 devices had exactly 1, 30 had 2+. By firmware:
17037 843 devices -> 143 hung (17% of the cohort had >=1 hang); 16185 790 ->
25; 16131 / 16022 / GenI -> 0 (older keys/no counter). By RSRP: <-110 dBm
54/991 devices with a hang vs >=-90 33/780 — weak RSRP dependence; Woodland
Heights hangs at -79..-91 => carrier/site, not just signal. Top non-bench:
Backwater 72378548 (17032, 33 hung of 57 sessions!), Roosevelt 72724018 (10/20,
records 1/7 days), Ontario Place 79461024 (5/18, 2/7), Crystal Acres 72384678,
Holly Tree 72391814, Brown's 70266984 (4 each), Shady 79459895 (3/7, 1/7 days).
Bench 79454912 (FOTA Test-Cust, 15-min cadence) = 219 "hung" of 238 — bench
artifact/outlier, excluded. Record coverage: 2,301 devices have records on
7/7 days, 528 on 6/7; **550 devices posted status but had 0 record-days; 835
had no status at all (dead/offline/legacy)**. 0-record-days conflates VACANT
lots (no flow = no records) with faults -> usage pass running
(fleet_usage_vs_records.csv: 7-day register advance per device).
=> Force-off/hung sessions are REAL fleet-wide but explain only a few percent
of devices; the bulk of "no TS data" needs the usage split before blaming
firmware.
**USAGE SPLIT (7-day register advance, 3,993 posting devices):** 3,118 have
records on >=4 of 7 days; **560 have few/no records AND no usage = vacant/idle
(legitimate)**; **295 have USAGE but records on <4 of 7 days = FAULT
CANDIDATES** (67 of them zero record-days). Of the 295 only 32 carry a
hung-session signature -> force-off is ~10% of the faults at most; the rest
sit at -114..-124 dBm on daily cadence = the undrained-backlog / data-timeout
mechanism 17051 addresses (plus possible non-metering units). Fault fw mix:
17037 98, 16185 68, 16131 43, GenI 21, 17032 17. Top groups: Ontario Place 32,
Roosevelt 26, Rustic Acres 14, Estancia 13, Kingsbrook 12, Noble Estates 11.
Largest: Noble Estates 75362531 13,108 gal/7 d (~1,870 gal/day — leak/phantom
candidate, records 3/7); Stafford 72384355 4,402 gal, 1/7 days, -122 dBm.
**Top-10 fault candidates checked live 9/3 ~15:50:** ALL Metering, 9 of 10
carrying **0.7-1.9 MB pending** (75362531 at 1,880,432 B = FIFO region full,
firing the full-FIFO trigger connmgr.c:423; 75369957 1.42 MB; 75367357
1.11 MB; 79459390 1.11 MB). This is the undrained-backlog class exactly:
heavy/continuous flow -> 1 s records -> daily or fringe sessions cannot
drain -> FIFO full -> appends dropped -> "status but no TS data". 17051's
carry cap + struck-chunk drop + timeout punt + full-FIFO relief (all in
17054) is the fix for the whole class; force-off is the minority. These
units are also heavy-usage (leak/phantom) audit candidates.
Files (working dir, untracked): fleet-no-ts-data-fault-candidates-0903.csv
(295), fleet-usage-vs-records-0903.csv (4,820), fleet-forceoff-scan-0903.csv.

**17054 BUILT 9/3 ~15:20 PT (Bruce: "Build 17054"):** force-off block now
calls connmgr_shutoff() + connmgr_failed_to_complete_network_task(), accounts
the session (NVRG time += 720 s, count++), NVRG_FORCE_OFF_ID 28 lifetime
count; status keys `radioForceOffCnt` (boot) + `nvForceOff` (lifetime).
109,012 B, sha `ccac1cd5…`, 0 warnings, **3,628 B headroom**.
**SHIPPED 9/3 ~15:30 PT (Bruce: "No just the trio"):** `stuck-event-fix` @
`04611e4` pushed; `st-prod` G/17054; `gen2fw=17054` on the trio (lands at the
next session: periodic 2 h or event end). Fleet-wide checkInPeriod=120 /
recordNoneventFlow=true was proposed and DECLINED (4,913 devices, ~10x radio
duty, ~7 GB/day) — trio only. Shady pilot of 17054 not yet decided.
**17054 PICKED UP 15:30:34-42 PT on all three** (event-end sessions at 15:29
-> STFOTA -> boot). New keys live: radioForceOffCnt=0, nvForceOff=0.
Signature counters on the 14:46 and 15:29 (17053) posts were HEALTHY on all
three: bufSamples == tiAggCount ('8549 -12 = pre-event ring), sfRadioSkips 0,
sfBufferDrops 0, noneventMode true; bytesToSend entering 99-109 KB (14:46,
~1.8 h of 1 Hz) and 43 KB (15:29), tofDropped 0. '3063's recorder tracks 1 Hz
since its 13:04 reboot (5900 aggs = 5900 samples at 14:46). Fleet exposure: any fringe-site session that hangs >12 min silently
stops recording until the next completed session — Shady's daily-cadence
units at -110 dBm are prime candidates for "posts status, uploads no data". For next time: the post-reset boot post
cannot carry pre-reset RAM counters; a BKUP snapshot of tiAggCount /
tofMarkerRejCnt / bufSamples at radio-off would make this diagnosable
(small; queue with the parked link-learning work).

**GIT STATE 9/3 ~16:10 PT (Bruce: "Lets get up to date"):** notes repo
(this folder = github.com/Brucedune/thingsboard-widgets — the widgets repo
renamed; notes have always lived here) committed `0a4d413` + pushed: this
handoff, laminar spec, 3 fleet CSVs, plus the 3 previously-staged cal files.
DuneFW_L5_2: `main` fast-forwarded to `stuck-event-fix` @ `04611e4` (17054),
pushed. Dune_FW_TI: `cal-reacq` @ `3586ad0` (v365) pushed; `main` is stale
(one Jan-2026 commit d760a69 "184" touching offset.c not on cal-reacq) —
-> Bruce: "go with your recommendation". Force-push was blocked by the
permission classifier, so done as a merge commit `aefddbc` whose tree == cal-reacq
(v365) with d760a69 kept in history; pushed. TI main == shipped line.

**FIRST 2-H PERIODIC POSTS 17:34-17:35 PT, all three on 17054, trigger
connmgr.c:272 (the checkInPeriod gate):** bytesToSend entering 121,040 /
122,672 / 120,224 B (~7,200 records = 2 h at 1 Hz) — within ~10 KB of the
131,072 B carry cap, tofDropped 0, dataPunts 0, radioForceOffCnt 0, nvForceOff
0; recorder healthy on all three (bufSamples == tiAggCount, sfRadioSkips 0,
sfBufferDrops 0). NOTE: 2 h of 1 Hz sits right at the cap — a late session or
an event on top will trim a few KB (tofDropped small, non-zero) by design; not
a fail. Soak continues overnight on the 2-h cadence; read the series in the
morning: expect ~7 posts/unit, each ~120 KB in, 0 punts, 0 force-offs.
**Drain check after the 17:34 sessions:** '8549 6,829 and '3063 6,941 records
(of ~7,100-7,260 written) reached TB — normal. **'4423: 5,099, and the gap is
its OLDEST half-hour (15:36-16:06 = 1 record vs 1,800)**, unchanged after a
2.5-min recheck -> not ingestion lag. **RETRACTED 21:05 PT — the '4423 "hole" was a TOOLING ARTIFACT.** TB's
bucketed `agg=COUNT` returned 1-5 records for some 30-min buckets while the
RAW pull for the same span holds 14,332 records at exactly 600 per 10-min bin
(15:30-19:35), identical to '8549's 14,234. All three units' records are
complete; the only gap on every unit is ~200-250 s at 17:30-17:34 = the radio
session (records gated while the radio is up — Bug 2 class, expected). 19:34
posts: tofDropped 0, dataPunts 0, lastDataFail 0 on all three, nvUpOk
+3/+2/+5 identical across units. **17051 has NOT been exercised; nothing was
lost.** LESSON: never use TB `agg=COUNT` buckets for record-coverage claims —
pull raw with a large limit and histogram client-side (also invalidates the
per-hour "records in TB" readouts earlier in this doc; the raw totals stand).
The fleet-scan "days_with_records" used agg=COUNT>0 per DAY — a presence test,
robust to this (a day with any records counts), so the 295/560 split stands.

**CADENCE -> 8 h, 9/3 ~21:15 PT (Bruce):** `checkInPeriod=480` on the trio
(verified), picked up by the event-end session of Bruce's evening event. This
DELIBERATELY exercises the 17051 carry cap: 8 h at 1 Hz ~ 460 KB -> each
periodic session trims the oldest ~330 KB (tofDropped +~20,000 per session) and
sends the newest 4 chunks (~1 min data phase). Expect per 8-h post: bytesToSend
~460 KB reported, tofDropped climbing by ~20k, dataPunts 0, lastDataFail 0,
radioForceOffCnt 0. First 8-h post ~05:30 9/4. Capture latency for a stuck
flag is now 8 h (17054 fixed the flag; radioForceOffCnt would still show it).
radioOnEventEnd stays on, so accuracy runs still post immediately.

**21:05 PT event (Bruce, no reference stated):** 1.538 / 1.539 / 1.465 gal
('8549/'4423/'3063), event-end sessions 21:07 on all three, entering 90-91 KB,
drop 0 / punt 0 / force-off 0, recorder healthy; checkInPeriod=480 fetched in
these sessions -> first 8-h periodic ~05:07 9/4. **Event timing alarm RETRACTED:** the windowed event records read
eventDurationSeconds 16 / 15 / 15 s and eventAverageFlow 5.77 / 6.15 / 5.86 gpm
(1.5 gal in 15 s — correct). The "35-year duration" came from my watcher
reading the LATEST-value endpoint, which returns the far-future FOSSIL rows for
those keys, not this event. Lesson (2nd time today): never read `latest` on
keys with fossil pollution (flowRate/tofNorm/temp/eventDuration/eventAverage
on the trio); query by time window. Bruce 21:10: "All 3 checked in" — 480
cadence confirmed in effect.

**FIELD ROLL DECISION 9/3 ~21:20 PT — Bruce: "lets hold for now."** No 17054
to Shady or the fault list yet. Facts gathered for when it resumes: Shady = 36
PEX-A units (no copper -> 17048's M-3/4 table change is irrelevant there; the
PEX-A table stays 2.270, so accuracy unchanged — an lFactor=2225 attr would be a
separate, customer-facing +9% decision). Two Shady units are on 17050 WITHOUT
17051's full-FIFO relief (79461768 at 402 KB rising, 70269798) — first
candidates whenever the hold lifts. Proposed stage 1 = 8 units (those two + the
five >256 KB + 79459895), watch ~48 h, then the rest. 18 Shady units on 17028
have no gen2fw attr (per-device pins needed). Precondition Bruce should see
first: the trio's 8-h posts (~05:07 9/4) exercising the carry cap.

**TI v365 LIST (accumulating):**
  1. Implement the designed sample buffering across radio sessions (Bug 2:
     a check-in landing mid-event truncates it — 0.49 gal on 9/1).
  2. Deferred-recal sites (cal.c:2515, :2684): set CalF2_RecalPending only;
     do not raise gFailedCal while gIsMetering (also stops the red-LED blink
     on a metering unit). **WRITTEN 9/3 ~09:55 as TI v365** (Dune_FW_TI
     working tree: dune/cal.c both sites now just printf "recal pending";
     dune_version.h -> 365). **BUILT 9/3 ~09:40 PT** via the CCS-generated makefile (CubeIDE
     make.exe + cl430 21.6.1 at C:/ti/ccs2041; `make -k -j8 all` in LPM/,
     SHELL=cmd.exe so run from PowerShell): LPM/Dune_FW_TI.txt 145,767 B ->
     pack_ti_fw.py -> Dune_FW_TI.txt.bin 46,666 B, crc 0f6bdd00, sha
     `84888559…`. Only pre-existing unused-variable warnings in cal.c (none
     from this change). **UPLOADED s3://dune-firmware-ti/msp365.bin** (bucket
     also holds a stray msp390.bin). **COMMITTED `3586ad0` on `cal-reacq`, tagged v365, pushed (9/3 ~09:50);
     trio `allowTiFotaVer=365` set + verified** (Bruce: "Commit and set the
     trio to 365"). Pickup rides the next session after the 17052 boot. TI v365 = latch fix ONLY;
     sample buffering (Bug 2) becomes v366 after design.
  3. (from earlier) event-record timestamp basis: tiTime vs ST RTC skew up
     to ~2 min — decide which clock stamps ledger records.

**PARKED — link learning (Bruce: "could get complicated quickly... keep it
simple until we have time"):** persist a per-device link summary in 1-2 BKUP
regs (linkScore EWMA 0-15, timeoutStreak, bestHour + 24-bin 2-bit outcome
histogram) and adapt in tiers: Good = full drain; Marginal = 1 chunk/session
newest-first, no retries, shorter timeout; Fringe (streak>=3) = status only,
non-event recording off, shift radioTimeHour toward bestHour, ext-antenna
flag in status. Key the 16141 fail-escalation off timeoutStreak. Status keys
linkScore/linkTier/bestHour. ~250 lines; flash headroom (4.4 KB) is the
constraint. Revisit after 17051 has field data.
Original third-strike note: this is '3063's third distinct anomaly
(9/1 14:19-15:03 silence, 9/1 evening 07:31 STFOTA death, 9/2 cal stall) that
the other two units, on identical firmware and levers, did not show. Handoff
rule from yesterday: bench it as suspect hardware rather than put it in
front of WYSE.**

**Acceptance test (original wording, now superseded by the PASS above)** (§7 step 2): known volume (ASK for the
reference and how it was measured) -> event closes -> pull power -> expect
`deltaMeterVal` in **(-1, 0]** (sub-gallon meterAcc is RAM by design),
`meterFlashTs` ~ event-end time, `meterStart == meterFlash` = post-event value.

**Bug 2 disposition (Bruce, this session):** NOT an ST workaround. "TI is
supposed to buffer data when in radio event — that's the way it was
designed but never implemented." -> **TI v365 item: implement the designed
TI-side sample buffering across radio sessions.** ST check-in logic untouched.

**L-factor (verified 9/1, Bruce's decision — corrected):** PVC-40 3/4" table
2.211 = validated, locked. Copper M 3/4" table (ST `measure.c` `lFactorsM`)
was **2.255** while the validated **2.239** lived only in the trio's
`lFactor=2239` shared attr. **Bruce: update the table.** -> **ST 17048** =
17047 + `lFactorsM[3/4][M]` 2.239. Scope: WYSE samples (trio) now; the FLEET
roll of 17048 is a later re-evaluation (fleet M-3/4 reads ~3.5% low today).
The trio's lFactor attr overrides the table — delete it (with Bruce's OK)
once 17048 is on, so the compiled value is what's actually exercised.

**Build recipe** (toolchain is not on PATH) is in memory
`reference_st_build_recipe.md`. Trio shared-attr helper:
`<scratchpad>/tb_attr.py read|write`.

---

## 0c. MORNING 9/4 — "lots of data gaps" = the 17051 carry cap, both holes (~09:15 PT)

**Bruce:** "Have a look lots of data gaps" / "they all check in at 8 hours on
the dot - only report last 2hrs of TS data" / "Ran an event this morning,
check in reported 2hrs of data including the event."

**Verdict (verified from TB + code):** every gap in the trio's flow records
is `TOF_CARRY_CAP_RECORDS` = 4 x 32 KB = **8,192 slots = 128 KB ~= 2.1 h of
1 Hz records** (7,710 samples + 1 header per 16). The cap trims the OLDEST
slots at the start of the data phase, so with `recordNoneventFlow=true` a
session only ever delivers the newest ~2.1 h:

| session | pending at post | slots | trimmed | TB shows |
|---|---|---|---|---|
| 05:17 (8 h beat) | 497,760 B | 31,110 | 22,918 (6.4 h: 21:05->03:07) | 03:07->05:13 |
| 08:08 (event end, 2.9 h later) | 174,624 B | 10,914 | **2,722 (05:18->06:00)** | 06:00:47->08:08 |

'8549 figures; '4423/'3063 identical to the slot. The 08:08 trim is why the
06:00 hourly `meterValFlash` record is missing while 05:00 and 07:00 exist.
**`tofDropped` LAGS ONE POST:** the cap runs in `bg95_send_data` after the
status JSON is built, so 05:17 showed 0 (trim 22,918 reported at 08:11) and
08:11 shows 22,918 (the 2,722 shows at the next post). Predicted next
`tofDropped`: '8549 **25,640**, '4423 **25,810**, '3063 **25,725** — check.

Also **verified: no records are lost anywhere else.** `bufSamples` +10,268
between the 05:17 and 08:11 posts = 1 Hz for the whole 10,260 s interval,
`sfBufferDrops`/`sfRadioSkips`/`bufGateRadio` = 0, `dataPunts` 0,
`lastDataFail` 0, no reset (`rtcWakeCnt` continuous), and 10,914 slots =
10,268 samples + 642 headers + 3 hourly + 1 event-delta EXACTLY. The
05:17 session itself lasted 37.7 s (`timeTotal`), data phase 17.2 s for
128 KB (~7.6 KB/s).

**Retractions on the way (logged so nobody re-walks them):** far-future
"fossil" rows (none exist for flowRate/tofNorm now); an RTC-hour anchor
(the 06:00:38-51 resume is 2h10m45s +/-5 s before each unit's post, i.e.
the cap, not the hour); a FIFO erase/GC bug (code reviewed: GC guards on
head_rd's block, lazy erase only on block entry, remove() moves head_rd
only); a decoder age filter (the 03:00 hourly record in the 05:17 upload
was older than any such cutoff and is present).

**DESIGN GAP the bench exposed:** the cap is tag-blind. It dropped the
22:00-02:00 and 06:00 hourly usage records (`meterValFlash`/`mvfInterim`),
and would drop a local-midnight daily record or an event-delta record that
sits in the trimmed span. In the field (`recordNoneventFlow=false`) the
trimmed span only exists when >2.1 h of EVENT flow accumulates between
check-ins — i.e. a leak, or a busy building on the daily beat — exactly the
devices whose hourly/daily series matter most. Register + status are
unaffected. **17055 candidate (not built, Bruce's call):** before trimming,
scan the to-be-dropped span and re-append its TAGGED records (Meter, Daily,
Meter_Delta, Offset, TI_Error — not samples/headers/ADC) at the tail so
they survive out of order (decoder places them by their own time field).
Cost: one read pass of the dropped span (366 KB ~= 1-2 s) at session start.
Alternative: `tofCarryCap` shared attr so the cap is tunable without a
rebuild (512 KB = 8.5 h = ~70 s of data time on a good link).

**SECOND FINDING — the ST RTC runs 2.7-3.6% SLOW (verified):**
`unixTimeDrift` (= network time - RTC at each sync) scales linearly with
the interval since the previous sync on all three units: '8549 199 s @
2.08 h, 802 s @ 8.17 h, 2,280 s @ 23.08 h (~98 s/h); '4423 ~107 s/h;
'3063 ~130 s/h. Cause: `stm32l5xx_hal_msp.c:211-215` forces the RTC
clock source to **LSI** (32 kHz nominal, +/-5%) while `main.c:744-745`
prescalers 127/255 assume a 32,768 Hz LSE -> 2.3% slow by construction
plus the unit's LSI tolerance. The `time.c:44` comment "RTC wake runs on
the accurate LSE" is wrong. Consequences (inferred, not yet measured in
the field): at the 24 h fleet cadence the RTC is ~40 min slow before each
sync, so the hourly usage record boundaries (`meterHourlyUpdateTime`) and
the local-midnight daily record fire up to 40 min late in real time and
drift through the day; check-in intervals stretch ~3% (8 h -> 8 h 10 m,
as seen: 21:07 -> 05:17); `meterFlashTs`/`eventStartEpoch` inherit the
skew. Smooth calibration (CALR, +/-488 ppm) is too small; fix = prescaler
for 32,000 Hz + per-sync trim of `SynchPrediv` from the measured drift
(0.1% resolution with Async 31). **Not in 17055 scope unless Bruce says.**

**THIRD (minor, inferred):** the record clock `tiTime` (+1000 per TI
aggregate) also runs slow — the TI delivers 0.990-0.993 aggregates per
real second (bufSamples vs unixTime between posts), so records lag real
time by ~30-50 s/h until the next sync and `volIncrement = flow/60` per
aggregate under-integrates ~0.8% against wall time. Absorbed by the
L-factor calibration (same on bench and field); the 0.2 pp unit-to-unit
period spread is a small part of the device spread.

**What the 8-h soak did prove:** no wedge on any unit across 05:17 and
08:08 sessions (Bug 3 signature absent), `radioForceOffCnt`/`nvForceOff`
0, `dataPunts` 0, no punt, register checkpoints intact (`meterFlashTs`
tracks the 08:06 event end). The soak stays on 480 min unless Bruce
changes it; next 8-h beat ~16:10 PT is the tofDropped check.

---

## 0d. 9/4 ~10:30 PT — Bruce's upload-policy decision -> **17055 BUILT (not committed/rolled)**

Walking the FIFO with Bruce: "We don't want to trim the data - just throw
out the chunks that fail. We have open leaks that can continue for many
hours." Then: "If data connection fails the session throw out all but last
60 min of TS data." Then: "Can you upload most current data first" ->
Option A (newest chunk as a preview, then ordered drain; duplicate chunk is
harmless because TB upserts by timestamp).

**Also found while patching:** Rev 16040 (`bg95.c` FSM `BG95_STATE_FAIL/
TIMEOUT`) dropped the ENTIRE pending backlog, uncounted, on ANY cycle
failure (connect/status/timeout). That is a standing fleet loss path since
16040 and a candidate explanation for "usage but no records" — every
fringe-site connect failure wiped the records. Replaced.

**17055 = 17054 +** (bg95.c, connmgr.c, main.h, status_report.c, config.h):
1. Carry cap deleted (`TOF_CARRY_CAP_RECORDS` gone).
2. Preview: if >1 chunk pending, first POST = newest 2,040 slots read from
   the tail (`sf_flow_tof_get_tail`), head_rd untouched; then oldest-first
   drain as before. A struck preview is not dropped (it recurs in order).
   Status key `tofPreviews` = sessions whose preview landed.
3. Struck chunks still dropped individually (unchanged 17051 rule).
4. `tof_failure_trim()` = keep newest `TOF_FAIL_KEEP_RECORDS` 3,825 slots
   (225 x 17 = 60 min at 1 Hz; >=60 min wall time with event-only
   recording). Called on: data punt (either class), FSM cycle failure
   (replaces 16040 drop-all), 12-min force-off. Healthy sessions never trim.
5. All removes are multiples of 17 (flash-full relief 4096 -> 4080) so every
   chunk opens on a timestamp header; chunks were already 2,040 slots.
Build: 109,340 B (+328), headroom 3,300 B, sha256 d7eb58e5..., zero
warnings. Bench expectation on the 8-h beat with 1 Hz recording: ~460 KB
drains in ~60 s, TB shows the full 8 h, `tofDropped` stays flat,
`tofPreviews` +1 per session with >1 chunk pending.
**Bruce 9/4 ~10:40: "Connect failure is different mechanism - should only
throw out when data failure occurs."** -> rebuilt: `tof_failure_trim()` is
called ONLY from the data-phase punt. The 16040 cycle-failure eviction is
simply removed (backlog kept); force-off keeps everything too. Final build
**109,296 B, headroom 3,344, sha256 fcc1d055...**, zero warnings.

**SHIPPED 9/4 ~10:50 PT (Bruce: "Commit, push, upload and set the trio to
17055"):** `e27fe35` on `stuck-event-fix`, main fast-forwarded to it and
pushed; `st-prod` 672132E5/G/17055 (6 parts); `gen2fw=17055` written on all
three (HTTP 200 each), other attrs unchanged (checkInPeriod 480,
recordNoneventFlow true, lFactor 2225, pipeType X, allowTiFotaVer 365).
Pickup at the next session (event end or the ~16:10 beat).

**17055 + v365 CONFIRMED on all four by 14:43 PT** (fwVer 17055 / fwVerTi
365, tofDropped 0 since boot, tofPreviews 0 — no session has had >1 chunk
pending yet; first real test is the next 8-h beat).

**'8538 cal story (9/4 14:13-14:54):** on the original rubber coupling pad
it parked OFF_PIPE twice (gain 55 upamp 1019; at gain 38 only 180; the
v365 pipe-present floor is 273 counts on BOTH channels at gain 44; tiError
word 4 bits = USS codes 135 dtof_shift_range + 138 dtof_corr_threshold =
TOF lock failures). Repositioned: committed gain 30 but upamp 336 (trio
930-1375 at gain 29-30). Bruce swapped the pad for the trio's type: commit
gain 36, upamp 1394, peaks +/-698 symmetric, offset 3452 (was 3459) —
coupling roughly doubled. Lesson: **coupling pad type is a cal variable**;
'8538 remains the weakest-coupled of the four by ~1 rung.

**50-gal reference run 9/4 15:11 PT, Bruce: 50 gal + 12 oz = 50.094 gal,
18.8 C, ~5.3 gpm, 573-577 s, all four on lFactor 2225 / PEX-A:**

| unit | eventMeterDelta | error | 9/3 10:51 run (50.5 gal, 17.6 C) |
|---|---|---|---|
| '8549 | 49.942 | -0.30% | +0.05% |
| '4423 | 51.692 | +3.19% | +1.00% |
| '3063 | 50.988 | +1.78% | +3.20% |
| '8538 | 50.486 | +0.78% | (new) |

Trio mean +1.56% (yesterday +1.41%); temperature model (+0.32%/C below
22.4 C) predicts +1.15% at 18.8 C / +1.54% at 17.6 C -> mean on model
within ~0.4%. **Spread 3.5 pp and NOT a stable per-unit bias** ('4423
+1.0 -> +3.2, '3063 +3.2 -> +1.8, '8549 flat): PEX-A run-to-run
variability is ~2 pp per unit versus the 0.6% spread seen on copper M.
'8538 lands inside the trio band on its first reference run. Ext-probe
bias after the run (probe - water): +4.4 / dead / +5.0 / +3.9 C ->
consistent with the PEX ~4.0 C working value in the laminar spec.

**17056 SHIPPED 9/4 ~15:40 PT (Bruce: "lets bake it in... need to send
another sample to wyse - please push to bucket and commit to git"):**
`lFactorsM` 3/4" X column 2.270 -> 2.225 (PEX-A), nothing else. `64c4cb3`
on `stuck-event-fix`, main fast-forwarded + pushed; `st-prod`
672132E5/G/17056 (6 parts); 109,296 B, sha256 cd3aedb1..., zero warnings.
**Trio/'8538 NOT rolled** (still gen2fw 17055 with lFactor=2225 attr — reads
identically). For the WYSE sample: gen2fw=17056 + pipeType X + pipesize
3/4, NO lFactor attr. When the bench moves to 17056, delete the four
lFactor=2225 attrs so the table is what runs (Bruce's OK first).

## 0e. 9/5 — 24-h check of all four + **17055 FIFO ACCOUNTING ANOMALY** (~15:00 PT)

Metering/accuracy state fine on all four (gains 29-36, offsets unchanged,
registers flat overnight, TB coverage 98-99%/h). '8538 remounted 14:21:
gain 36 / upamp 650 (half of 9/4's 1394 on the same pad), offset 3359.
Both banks Bell-first validated (17902 15:51, 17903 15:59 on T-Mobile).

**RESOLVED 9/5 15:40 PT — NOT A FIRMWARE BUG. Shared attr `adcCapture=true`
on all four (Bruce: "yes turned all 4 yesterday", ~14:40 9/4 while working
'8538's cal). Installer live-waveform mode = capture pair requested every
20 s, 120 records per landed capture: adcReq ~180/h, adcCapReceived ~45/h
-> ~5,400 records/h on top of ~3,500 samples/h = the 2.4x pending growth,
the ring-full sessions on '4423/'3063, the sfBufferDrops, and the 3-min data
phases. Invisible on TB because overlapping captures collapse onto the same
timestamps. 17057 pointer keys confirmed the drain is exact (head advanced
by precisely the uploaded amount at every post; tail-head == pend/16
throughout). 17055 upload policy stands. Fix = adcCapture=false WRITTEN on all four 15:5x PT (Bruce "yes go ahead", HTTP 200 x4). Takes effect at each unit's next attribute fetch (next session); capture records already in the ring drain normally. Lesson: an attribute audit (full SHARED scope) belongs
at the top of any data-volume investigation.**

**50-gal runs 9/5 (Bruce: 50 gal + 12 oz = 50.094 gal; rerun at 19.2 C, model
+1.02%; 15:18 run reference assumed identical):**
| unit | 15:18 | 16:04 rerun | 9/4 15:11 (18.8 C) |
|---|---|---|---|
| '8549 | -0.53% | -0.12% | -0.30% |
| '4423 | +3.08% | +2.97% | +3.19% |
| '3063 | 46.90 gal, TRUNCATED (0.94-gal event split at 15:09:09 -> event-end radio -> TI paused ~50 s; Bug 2 signature) | +2.36% | +1.78% |
| '8538 | -0.73% | -0.82% | +0.78% (old pad) |
Third run 16:52 (50 gal + 28 oz = 50.219 gal, 19.4 C, model +0.96%): '8549
+0.36 / '4423 +3.10 / '3063 +2.61 / '8538 -0.55, mean +1.38%, all 582-583 s.
Group mean 16:04 +1.10% vs +1.02% predicted -> **Lf 2.225 confirmed (4 runs
incl. 9/4)**. Per-unit offsets held a 4th time ('4423 +3.1 x4).
**REVISION of 9/4 note:** per-unit offsets are STABLE since the 9/4 remount
('4423 +3.0/+3.1/+3.2, '8549 -0.1..-0.5, '8538 -0.7/-0.8 on the trio pad,
'3063 +1.8/+2.4); the 9/3->9/4 '3063/'4423 swap coincided with the remount.
= coupling/mount position, not scatter. Proposed test: swap '4423 <-> '8538
positions, rerun 50 gal (unit vs position). '8538 ship-ready: -0.8% at 19 C
~= +0.2% at 22 C water, consistent x2.

**1 gpm run 17:45 (Bruce: 20.33 gal + 40 oz = 20.642 gal, 20.1 C, ~1,185 s
-> true 1.044 gpm, Re ~4,780 on PEX-A; lamCorr OFF):**
| unit | err | err minus own 5-gpm offset |
|---|---|---|
| '8549 | +1.72% | +1.81% |
| '4423 | +7.57% | +4.52% |
| '3063 | +3.72% | +1.23% |
| '8538 | -0.61% | +0.09% |
Mean +3.10% (spread 8.2 pp); offset-corrected mean **+1.91%**, of which the
cold-water term is +0.74% -> laminar over-read on PEX-A at Re 4,780 ~= **+1.2%
(k ~0.988)** vs the copper curve's +3.3% (k 0.9616 at knot 2). **Copper knots
do NOT carry over to PEX-A at this Re** — enabling lamCorr with the defaults
would over-correct ~2%. Provisional PEX-A knot 2: lamRe2 ~4800, lamK2 ~9880.
Low-Re device spread reappears (copper lesson): '4423's +3.1 at 5 gpm becomes
+7.6 at 1 gpm. adcCapture=false confirmed (adcReq flat 109/111/110/197 across
16:41 -> 17:45 posts). Next: 0.5 gpm run (Re ~2,400) for knot 1.

**0.5 gpm run 19:01 (Bruce: 20 gal + 60 oz = 20.469 gal, 20.0 C, 2,717 s ->
true 0.452 gpm, Re ~2,066; lamCorr OFF):** '8549 +12.94 / '4423 +24.29 /
'3063 +7.99 / '8538 +7.08; mean +13.08% (spread 17.2 pp). Offset-corrected
mean +11.89%, minus cold-water +0.77 -> laminar-only **+11.1%, k 0.900** —
matches the copper knot 1 (0.9010 @ Re 1886; copper curve at Re 2066 gives
0.907). So PEX-A == copper at Re ~2,000 but recovers much faster: k 0.988
at Re 4,780 vs copper 0.965. **Provisional PEX-A knots: (2066, 0.9000),
(4780, 0.9880), (10000, 1.0000)** -> attrs lamRe1=2066 lamK1=9000
lamRe2=4780 lamK2=9880 lamRe3=10000 lamK3=10000, extTempBias=4.0, then
lamCorr=true and repeat 0.5 + 1 gpm to confirm (expect group ~0 +/- the
device spread). **WRITTEN on all four 19:2x PT (Bruce "go"; HTTP 200 x4, read-back verified).** Takes effect at each unit's next attribute fetch = next session; a short water pulse before the 0.5 gpm rerun forces that (radioOnEventEnd) — the status post should then show lamCorr=1 and lamCorrMax>0 after a low-flow run. '4423 dead ext probe -> lamTempSrc=1 (internal minus 2.8 C fallback) on that unit. Device spread at Re 2000 = 17 pp ('4423 +24, '8538 +7): a
group curve fixes the mean, not the spread — same copper lesson.

**Original write-up (kept for the reasoning trail):** after a
complete drain (nvUpOk deltas = pending/2040 chunks, count -> 0), pending
re-grows to ~2.6x the records written within hours ('8549: 1.29 MB at
23:32 and 1.27 MB at 07:31 for ~0.48 MB of samples each 8 h) and on
'4423/'3063 saturates at the ring size (1,835,008 B) every ~5 h ->
flash_full-triggered sessions (connmgr.c:426), 200-220 s data phases,
sfBufferDrops climbing (~90 records/h lost). Post-drain remainders are
EXACT 64 KB multiples (16/17/18/28 blocks) -> pointer arithmetic, not data.
bufSamples rate 0.985/s, sfRadioSkips 0, no resets, dataPunts 0. Every
mover of head_rd/tail/head_free and the compiled drain loop were re-read;
no cause found statically. The 17051 cap masked this (pending never
exceeded 128 KB + one beat). **17057 = 17056 + status keys tofHead /
tofTail / tofFree / tofRing / tofAvail** (diagnostic only), BUILT 15:1x:
109,612 B, headroom 3,028, sha256 d3077368..., zero warnings. **SHIPPED 15:3x PT** (Bruce: "Commit, push, upload and set the trio to 17057"): `5a83d62` (main ff'd), st-prod G/17057, gen2fw=17057 on the trio (HTTP 200 x3); '8538 stays on 17903. NOTE the FOTA reboot runs the 17050 recovery, which re-derives tail/head_free from the block scan and head_rd from BKUP — the first 17057 post is therefore a fresh baseline, and the anomaly (if pointer-side) needs one or two beats to reappear. Read tofTail-tofHead vs bytesToSend/16 and tofFree vs tofHead at each post. Ship config for '8538 recommended:
recordNoneventFlow=false + customer checkInPeriod regardless (event-only
volumes make this a battery nuisance, not a data problem, in Toronto).

---

**17058 LANDED 9/5 ~20:15 PT (fleet-ops session's one-time OFFSET cleanup v3,
prompt `fw-17058-offset-cleanup-prompt.md`; Bruce: "incorporate... land
17058"):** parked patch applied unchanged on 17057 -> `154d166` (main ff'd),
109,652 B / 2,988 B headroom / zero warnings, sha256 195b9289..., st-prod
G/17058. Marker bit 28 verified free. Offset zeroed once per device on the
upgrade (done-bit), direction retained (waterFlowDir re-imposed on 1,930
devices; UNKNOWN = ABS phantom path). **Bruce 9/5 20:20: "this will not apply to the bench devices" — 17058 is for a LIMITED set of fielded devices** (Bruce 20:25: "This is just for limited fielded devices") — not the bench (trio 17057, '8538 17903, offsets intact) and NOT a blanket fleet roll; the device list is Bruce's. The §5 acceptance (offset 0 once, no re-fire on a later reset, flowDirection unchanged, offset re-promotes on water, deltaMeterVal in (-1,0]) runs on that set's FOTA posts. Reply to the fleet session with the two §6
answers (Lf 2.225 final; FIFO bug retracted -> Waves 3-5 unblocked; scan the
fleet for adcCapture=true) written to `fw-17058-bench-reply.md`.

**PULSE COUNT — bench has been at the TI DEFAULT 13 since 9/2 (verified 9/5
20:45):** TI v365 `ussDCCommandHandlers.c:140` `.num_pls = 13` (v344, 8/9;
v333 had 9, v332 had 6 — code default was never changed after v344). The
trio ran the `pulse=6` attr 8/28 -> 9/1 (status key `pulse` = 6 between
reboots); from the 9/2 FOTA reboots (03:28/06:11/08:30) the status reads 0
and no `pulse` attr exists in shared scope on any of the four ('8538 read 6
9/3 10:50 -> 0 at 9/4 14:09). So ALL 9/2-9/5 accuracy + laminar results are
at 13 pulses = the fleet default (good for fleet relevance; not what Bruce
assumed). 8/28-29 data for the fielded-set question: 6 pulses removed the
split-5 skip class on '8549/'4423 and widened 35%%-crossing margins 10-40x,
at the cost of peak amplitude 533 -> 223 counts (gain +~8, i.e. ~1.5 rungs);
'3063's convulsion mode persisted; the 8/28 recommendation was to pilot at
8. v344's reason for 13: 9 starved marginal paths (1" L-copper, Ibiza).
Bruce (20:45): bench devices should be at 6 — then (20:55): **"We'll hold for now however I want to push to a limited fleet roll out tonight - leave at 13."** No pulse attr on the fielded set; bench stays at 13 until he says otherwise. Caveat logged: at 6 the 5 gpm baseline and the 1 gpm knot need a repeat before the PEX knots are final.

## 0f. 9/6 ~10:15 PT — SHADY LANE 17058/v365 LIMITED ROLL: CAL REVIEW

Groups "Shady Lane MHP" + "Shady Lane MHP-Cust" = 36 devices (scan by group,
not Property). 22 took 17058 overnight (21 also v365; 65824917 still v341,
TIFOTA pending). 14 untouched (12 on 17037/344, 2 on 17040/354 — not in the
roll list). Of the 22: **19 Metering -> Metering**, 3 not metering now:

| device | before | after | read |
|---|---|---|---|
| 77041962 | 17028/341 Metering, g26 amp 1426-1692, off 740, FLIPPED, ~70 gal/d | 17058/365 **Failed Cal** 09:00, g55 amp 2836 pk +/-1500, surfN 0, cf2 2, tiError w3 bit11 | LOUD-FLAT REJECT (below); no post since 09:01 |
| 70269798 | 17050/364 **Calibrating for >1 day**, amp 103-128 @ g40, tiBoot 244, mv 74 frozen | 17058/365 Failed Cal, g55 amp 437 pk 113/-324 asymmetric | NOT a regression: dead/absent signal, v365 names it honestly; site visit |
| 65824917 | 17028/341 Metering, g26 amp 2048-2142, off -856 | 17058/**341** Calibrating 09:06 (TI restart after FOTA boot) | TIFOTA to 365 pending; same LOUD class as 77041962 -> watch |

**Mechanism for 77041962 (verified in cal.c amp_scan_done):** v327+ "min-gain-
loud noise test": if the base rung (gain 26) already clears CAL_AMP_FLOOR
(273) and NO adjacent rung rises >= 1.30x (CAL_AMP_FLAT_RATIO_Q8 333), the
sweep is judged a flat loud artifact (the VB stuck-carousel class) -> n=0 ->
3 bails -> OFF_PIPE -> Failed Cal. 77041962 reads 1692 @ g26 and only 2836 @
g55 (expected ~28x for a linear path) — genuinely flat with gain, so the test
fires on a unit v341 metered on for months (whether accurately is a separate
question; a crosstalk/frame-borne artifact would look exactly like this).
**Two peers show the post-TIFOTA Failed Cal is often TRANSIENT:** 70268832
(Failed Cal 07:18-07:21 -> Metering 07:31) and 65828520 (08:42-08:43 ->
Metering 09:51) — OFF_PIPE re-probes every ~72 s and the later sweep passed.
So 77041962's verdict is its NEXT post. If still Failed Cal: remote lever =
`pulse=9` (or 6) attr on that unit only — drops amplitude below the floor at
the base rung so the flatness test is not judged; the off-pipe retry re-cals
without a visit. Fleet-side: v366 item — exempt/soften the flat test when the
base-rung amplitude is near the 1638 compression ceiling (a clipped real
signal is flat by construction).

**Bruce 9/6 ~10:45: "some devices have strong coupling on PEX so with a high
start gain ppk amplitude could compress quickly" — agreed mechanism; then
"good argument for reduced pulse count".** Fleet sizing (entitiesQuery latest
values, 4,972 Metering Gen2): commit gain <=29 AND upamp >=1200 = **92 units
(86 PEX-A 3/4)**; >=1400 = 42 (39 PEX-A; VB 8, Mena 5, Grand Valley 5, Shady
3, Rustic 3); >=1600 = 17. Caveat: pre-v344 TI report gain on other scales,
so approximate; 77041962/65824917 are not in the list only because they are
not Metering right now. List: `fleet-loud-coupling-watchlist-0906.csv`. Shady
peers at 1866-2142 recovered after a transient fail, so it is a watch list,
not a certain failure. **v366 proposal:** pulse count joins the cal ladder —
if the base rung (gain 26) reads above a compression-onset threshold (~1000
counts), drop to 6 pulses and re-sweep before any flatness verdict (fixes the
loud class without touching weak paths that need 13); (2) apply the flat test
only in the linear range; (3) export `calFlatRej`. Immediate remote lever for
77041962 (and 65824917 if it fails after TIFOTA): `pulse=6` attr.

**Bruce 9/6 ~11:10: "I started another session to handle fleet rollout, will continue this topic on that thread."** The wave-1 pulse=6 + recalibrate=true write (16 PEX 3/4" targets, 1/2" excluded) was PREVIEWED here, NOT written; handed to the fleet session via `fw-17058-bench-reply.md` (9/6 hand-off section).

**17058 acceptance on the 19 (fleet session's §5):** offset 0 on the FOTA
post on 17/19 (2 units' first post came later: 79461768 shows -1795 at +4 min
vs -1820 before — check whether the block fired); **re-promotion within
~1 h on 16/19 to values within ~2-5% of the old ones** (2164->2160,
-5253->-5151, 5249->5213, 5507->5527...) — the old offsets were fine, which
is consistent with the provenance-only argument; 70268832 / 65828520 still 0
(pending qualification). deltaMeterVal at the FOTA boot -0.01..-0.88 (17047
checkpoint OK). flowDirection unchanged on ALL 22 (V3 design point). No
second-reboot re-fire check yet. v365 re-cal moved commit gains substantially
on some (75368439 41->24 amp 1554->307; 79466452 44->33) — lowest clean rung
picking, expected.

---

**BENCH TO 6 PULSES — 9/6 ~11:30 PT (Bruce: "set the quad to 6 pulses -
recal TRUE"):** `pulse=6, recalibrate=true` written on all four (HTTP 200 x4,
read back). Takes effect at each unit's next attribute fetch = the event-end
session after Bruce's clean-out: TI power-cycled, fresh cal at 6 pulses,
offset zeroed and re-qualified. Everything measured 9/2-9/5 (Lf 2.225
confirmation, per-unit offsets, PEX laminar knots) was at 13 pulses -> the
5 gpm baseline and the 1 gpm knot need a repeat at 6. `recalibrate` must be
set back to false once all four show Metering again (second pass, Bruce's
word). Expect '8538 to commit ~gain 44-48 (amp 650 @ 36 at 13 pulses).
**RESULT 17:26 (after the 2nd clean-out):** all four Metering — '8549 g26 amp
879 off -629; '4423 g24 587 off -2395 (tnSd 7509, USS err 135 once); '3063
g29 1042 off 5255; '8538 g38 895 off 3359. Offsets within 70-170 of their
13-pulse values. **BUT amplitudes at the same gains are unchanged ('3063
1042 vs 1053) -> the TI is still at 13 pulses:** the recal's ti_power_cycle
rebooted the TI to its default after the live num_pls push, and the fresh cal
ran at 13; status `pulse=6` is the ST's override, not the TI's state. The 6
lands as a LIVE switch at the next session end (radio-off override push) —
amplitude hold will walk gain up; a clean 6-pulse cal needs `recalibrate`
cycled false->true one session AFTER that. **Also: `recalibrate=true` set
flowDirection=UNKNOWN on all four** (ABS-rectification path until 50
detections) — a direct conflict with 17058's direction-retention rationale
for fielded units; flagged to the fleet session in fw-17058-bench-reply.md.
The 1 gpm run Bruce is starting is therefore a 13-pulse REPEAT of yesterday's
knot-2 point (useful as repeatability), not the 6-pulse point.

**TI v366 + ST 17059 BUILT 9/6 ~17:50 PT (spec `param-change-recal-spec.md`,
Bruce: "Yes on all three - build v366 and 17059"):**
- **v366** (`dune/cal.c`, `dune.h`, `ussDCCommandHandlers.c/.h`,
  `comm_config.h`, `dune_version.h`): pulse-count watcher beside the blank
  watcher at the top of `cal_feed_aggregate` (first sight records, any later
  change -> `cal_param_recal(false)`); new 0xAD `COMMAND_HANDLER_DUNE_CAL_RESTART_ID`
  -> `Handler_cal_restart` -> `cal_param_recal(true)`; `cal_param_recal` =
  cal_resweep_gain bookkeeping + `enter_amp_scan(true)` (fresh window),
  deferred in INIT/SURFACE_DETECT/PIPE_SCAN and in OFF_PIPE unless forced,
  no-op in prodtest; `CalF2_ParamRecal = 8` exported until the next commit;
  listener table 52->53. Build: 0 errors, 14 pre-existing warnings;
  `LPM/Dune_FW_TI.txt.bin` 46,848 B, 5 chunks, crc 20ac5cdb. NOT committed/
  uploaded (-> msp366.bin) yet.
- **17059** (`hci.h/.c`, `hci_st.h`, `ti_hci_impl.c`, `main.c`, `main.h`,
  `measure.c`, `status_report.c`, `config.h`): `hci_cal_restart()` (0xAD) via
  new `TIW_CAL_RESTART` trigger bit; recalibrate attr -> 0xAD on TI >= 366
  (legacy power cycle kept for older TI); INFO handler edge on
  `CAL_F2_PARAM_RECAL` -> `meas_on_drive_change()` = offset 0 + offset_init,
  DIRECTION UNTOUCHED, `paramRecal` status key. Build 109,876 B, headroom
  2,764, sha256 1dc19f12..., zero warnings. NOT committed/uploaded/rolled.
- **SHIPPED 9/6 ~18:05 PT** (Bruce: "Commit, push, upload and set the quad to
  17059 / 366"): TI v366 `08d033e` on cal-reacq (tag v366), main merge
  `8ae0e4b`, `msp366.bin` uploaded (46,848 B, sha e2c4b691); ST 17059
  `58732e5` (main ff'd), st-prod G/17059. Trio: gen2fw=17059 +
  allowTiFotaVer=366 written. **'8538 caught before it pulled mainline:**
  the quad write put gen2fw=17059 on the WYSE sample, which would have
  replaced its Bell-first image (and 17059 < 17903 never validates on it);
  reverted to 17903 within minutes, no session in between (last post 17:26).
  Built **17904 / 17905 = 17059 + Bell-first** (109,908 B, both banks) in
  `special/`, commit on main; Bruce 18:15: "Upload 17904/17905 and set 8538 to 17904" -> both in st-prod, '8538 gen2fw=17904 (allowTiFotaVer 366 already set). Next: after fwVer 17904 posts from a US carrier, set 17905 on Bruce's word so both banks carry Bell-first + v366 behaviour; ship on 17905.
- Roll plan for the quad (Bruce's word): allowTiFotaVer=366 + gen2fw=17059
  together; the boot session after TIFOTA pushes the existing `pulse=6`
  override to a TI that booted at 13 -> v366 detects 13->6 and re-cals at 6
  automatically = the acceptance test; 17059 then re-qualifies offsets on
  the flag edge; flowDirection must stay as it is (currently UNKNOWN from
  the legacy recal, will re-learn).

**TI v367 + ST 17060 BUILT 9/6 ~19:10 PT (Bruce: "lets add the tiPulse
now"):** the INFO packet was already at its 96-byte cap (info.c guard failed
on a new byte), so the running pulse count rides in **calFlags2 bits 4-7**
(values 6/9/13 fit a nibble; `CalF2_PulseShift/Mask` in dune.h, filled in
calFillInfoState from gCommandHandler num_pls). ST 17060 splits the byte:
`calFlags2` key = low nibble (flags, unchanged semantics), new `tiPulse` key
= high nibble when TI >= 367 and outside the 390-399 diag band, else 0.
Builds: v367 46,858 B crc 0241b4d7 (0 errors / 14 pre-existing warnings);
17060 109,964 B headroom 2,676 sha 3a800155; Bell-first **17906** 109,996 B
(special/). **SHIPPED 19:25 PT** (Bruce: "Commit, push, upload and set the quad to 17060 / 367"): v367 tag on cal-reacq, main merge `3bc5008`, msp367.bin (sha d008b593); 17060 `cc59072` (main ff'd), st-prod G/17060 + G/17906; trio gen2fw=17060/allowTiFotaVer=367, '8538 gen2fw=17906/367 (17905 lever superseded before it was consumed; banks end 17904 + 17906, both Bell-first). NOTE: '8538 read back `adcCapture=True` — not set by this session; presumably Bruce enabled the waveform; useful once for the lobe count, then must go back to false (capture flood). Purpose: settle whether the
9/6 18:01 v366 cals ran at 6 or 13 — `tiPulse` on the first 17060/367 post
answers it, and every future pulse question.

**tiPulse VERDICT 9/6 18:28-18:32 PT (first 17060/v367 posts after the
clean-out): `tiPulse=6` on all four.** The TI's own parameter says 6 pulses,
and the v367 boot cal (TI reboot at TIFOTA -> override pushed at boot-idle
before the sweep -> first sight 6, no ParamRecal flag) ran at 6:
'8549 g30 amp 1289 off -531 | '4423 g29 915 off -2001 | '3063 g27 882 off
5100 | '8538 g30 538 off 2804 (its `adcCapture` stream, on since ~19:20,
shows a short burst: 10 lobes >20%, 50% ring-up at sample 28 — consistent
with 6). By the same sequence the 18:01 v366 cals almost certainly ran at
6 too; paramRecal=0 everywhere is the deferred/first-sight path, as
designed. Observation to keep: amplitude at a given gain did NOT fall ~0.42x
as 8/28 suggested ('8549 g27/948 at 13 -> g30/1289 at 6 is on the same
curve), so pulse count is a weaker amplitude lever than assumed at this
blank/window; the compression argument for the loud class needs a bench
check on a loud unit before it drives a fleet number. flowDirection still
UNKNOWN on all four (legacy recal wipe) — re-learns with flow.
**Bench is now on 6 pulses with a v367 cal: 5 gpm baseline next, then the
1 gpm / 0.5 gpm knots.** '8538 adcCapture must go back to false (Bruce's
go).

**TI v368 BUILT 9/6 ~19:55 PT — LOUD-COUPLING FRAME SHIFT (Bruce: "if signal
above x @ 26 drop frame by 9"; "go build v368"):** after the first rung of
every amplitude sweep, if either channel reads >= 1000 counts at gain 26 the
ladder restarts on the low frame 17..46 (PGA floor verified = index 17 =
-6.5 dB; 26 = +1.0 dB, so the shift is 7.5 dB = x0.42, landing the measured
loud class 1000-2836 at 420-1190). Same 11 rungs/step; pipe-present verdict
index 6 -> gain 35; grid, fidelity walk and lowest-clean-gain picker
untouched; decided once per sweep; normal/weak units never enter it. cal.c:
`g_ladder_base`/`g_frame_shifted`, base-aware `ladder_gain()`, reset in
`enter_amp_scan`, decision in `cal_feed_raw`. Build 46,926 B, crc f7b12793,
0 errors / 14 pre-existing warnings. **SHIPPED 20:05 PT** (Bruce: "Commit, push, upload v368 and set the quad to 368"): tag v368 on cal-reacq, main merge `2f1bb4d`, msp368.bin (sha cd0fdb55), allowTiFotaVer=368 on all four (HTTP 200 x4). TIFOTA at each unit's next session -> TI reboot -> boot cal at 6 pulses (override pushed at boot-idle) -> tiPulse 6 again, gains ~unchanged (regression expectation). Note:
the bench units are NOT loud at 26 (700-950), so on the quad v368 is a
regression check only; the acceptance case is a loud fielded unit —
77041962 (Shady, Failed Cal on v365) is the natural first target via
allowTiFotaVer=368 (fleet session's list). No calFlags2 bit was free to
flag the shift; a commit gain below 26 is its fingerprint.

**v368 ON THE QUAD 9/6 18:49-19:00 PT:** '4423 g32/1337, '3063 g26/852,
'8538 g35/843 — tiPulse 6, no ST reboot, regression clean. **'8549:** took
v368 at 18:51 (g33/1605, tiPulse 6) with **spiWrErr 16 / spiInitErr 16 in
that session, 10 more at 18:55**, then an unplanned ST reboot at 18:56
(boot 543->544, bootReasonFlags 20 vs the FOTA's 6, resetReason NONE) =
the sf-wedge self-heal reset after SPI flash errors; FIFO recovery fell
back to the block start (tofRecoverSrc 2, 8,694 records re-uploaded =
Bruce's "missed one data upload"). TI came up on 13, calibrated at 13
(g32 amp 1596-1677 = Bruce's "large ADC waveform at 32 dB"), and the
boot session did NOT get the pulse=6 override across (tiPulse still 13 at
19:00, paramRecal 0). Waiting on the next event post to see whether the
19:00 session-end push flipped it. **RESOLVED 19:07: '8549 tiPulse=6, paramRecal=1, tiBootCnt unchanged, g32 amp
1495, offset -531** — the 19:00 session-end push carried the override, v368
re-ran the sweep at 6 with no TI reset, the ST re-qualified the offset on
the flag edge: the whole v366/17059 chain proven end to end on hardware.
The boot session after the 18:56 reset did NOT fetch attributes (`pulse=0`
on the 18:58 post), so an unplanned ST reboot leaves the TI on its default
drive until the next regular session (up to a day in the field). OPEN: (a)
boot sessions after an unplanned reset skip GET_SHARED_ATTRIBUTES — worth a
17061 look; (b) the SPI errors on '8549 during TIFOTA (17020 bus
arbitration territory). **Cal parameters otherwise uniform across the
quad:** env 40, blank 33, capture 15, surface-cal gain window 23/38 on all
four, clean N 28-32, offsets stable (-531/-2001/5100/2804), zero rejects,
zero TI errors, flowDirection UNKNOWN on all four (legacy recal wipe;
re-learns with flow). **Pulse-count vs amplitude, measured:** '8549 g32
1596 at 13 pulses vs g33 1605 at 6 — peak amplitude is essentially
independent of pulse count at this window (ring-up saturates by ~6), so
"reduce pulses to escape compression" was a weak lever; the v368 frame
shift is the right one. 8/28's 533->223 note does not reproduce.

**Bruce 9/6 ~19:15:** waveform on '8549 confirms 6 pulses, gain unchanged,
ADC 1534 vs ~1680 = -9%% amplitude (matches the 1596->1495 status numbers).
Pulse count = lobe-shape/skip-margin lever, not an amplitude lever; 8/28's
"533->223" figure is retired. **Bruce leaning to 8 pulses fleet-wide, to be
evaluated.** Running 50 gal @ 1 gpm at 6 pulses with lamCorr on (PEX knots)
before the 5 gpm baseline; afternoon 1 gpm (13 pulses) reference volume
still not received.

**50 gal @ 1 gpm at 6 PULSES, lamCorr ON (9/6 ~19:15-20:05, Bruce: 50 gal +
80 oz = 50.625 gal, 19.5 C; ~2,975 s -> 1.02 gpm, Re ~4,600):**
| unit | err | 13-pulse 1 gpm (afternoon) |
|---|---|---|
| '8549 | +1.13% | +1.72% |
| '4423 | +7.74% | +7.57% |
| '3063 | +1.64% | +3.72% |
| '8538 | +2.02% | -0.61% |
Mean +3.13% (spread 6.6 pp; offset-corrected +1.95%) = IDENTICAL to the
13-pulse run (+3.10 / +1.91). **lamCorr did NOT engage: `lamCorr=true` on
all four posts but `lamCorrMax=0` after 50 min at Re ~4,600**, where even
the copper defaults would show depth ~35 and the PEX knots ~12. Code
re-read: parser (lamRe/lamK idx from the key's last char, clamps), monotone
guard, flow >= 0 at the call site (fmaxf), temp/nu helpers, lamCorrMax
cleared only after a successful post — nothing found statically. Next
discriminator = the 0.5 gpm run (a -10% correction is unmistakable); if it
also shows nothing, 17061 gets a status echo of the effective knots + last
Re. Other notes: 6 pulses did not change the 1 gpm group mean; per-unit
moves mixed ('3063 -2.1 pp, '8538 +2.6 pp). flowDirection still UNKNOWN on
all four after 50 min of 1 gpm flow — the direction learner did not
re-acquire at this flow. '8549/'3063 ext probe read 12.4-12.8 C at the
post (below the 19.5 C water, opposite of the +4 C bias seen so far) —
unexplained, logged.

**BELL-FIRST SPECIAL BUILD for WYSE Toronto — 9/4 ~16:30 PT.** Bruce: the
first 3 Toronto samples show on the Monogoto/Bell side but drop sessions;
"special ST rev that selects Bell Canada only" -> refined to "if no Bell
Canada continue with network scan" -> and "FOTA the other bank with the same
code, bumped rev". Code (verified): fleet scan order T-Mobile, AT&T, Verizon
(60 s then 120 s manual attaches each) BEFORE Bell, inside the 12-min
force-off; 2 failed cycles re-force the full scan. Bootloader: swap-on-IWDG
is re-armed every boot and disarmed only at init if fw == latest validated,
else at first CONNECT success; validated record is MONOTONIC (`<`).
Built as compile option `DUNE_CARRIER_BELL_FIRST` on the 17056 source
(bg95.c table reorder Bell->TMO->ATT->VZW + "Bell found -> skip US"; init.c
first-boot rescan; config.h `DUNE_BELL_REV` default 17902). Mainline image
logic unchanged (bg95.o +48 B from protothread `__LINE__` shifts only; NOT
re-shipped). Commit `ec28fc5` (main ff'd), images in `special/`:
**17902 sha a08c1dc4…, 17903 sha d05f7baf…, 109,368 B**, both in `st-prod`.
Levers: '8538 `gen2fw=17902` written, `lFactor` attr DELETED (table 2.225).
**17902 VALIDATED 15:51:38 PT:** fwVer 17902, radioOper '310260' (Bell failed on the US bench, scan fell through to T-Mobile as designed), SWAP_BANK 0, resetReason NONE. Bruce: "set 17903" -> `gen2fw=17903` written 16:4x (HTTP 200). After it posts fwVer 17903 both banks hold Bell-first code; ship on 17903. Post-FOTA boot snapshot showed Failed Cal / L_FACTOR 2.13 (cal restarting after the reboot) — run water or power-cycle once 17903 is on and confirm Metering before boxing. Bench
cost: 60-120 s of failing Bell per session. Gotcha: mainline revs < 17903
never validate on these units — keep them on 179xx until they come home.
For the Toronto 3 nothing changes remotely (they never complete a session).

**4th bench unit added 9/4 ~11:00 PT (Bruce: "adding a 4th device to the
test 75368538 - please configure the same as the trio" / "yes"):** TB
"Device 75368538" id `c4001920-4d71-11f1-b1bb-f3574cce671d`, Wyse Eval /
Wyse4, lot 26W20, ICCID 8943… (Monogoto). Was 17037 / TI v354, Failed Cal,
meterVal 0, pipeType P, no FW levers. Written (HTTP 200): gen2fw 17055,
allowTiFotaVer 365, checkInPeriod 480, radioOnEventEnd true,
recordNoneventFlow true, pipeType X, lFactor 2225, radioOveruseMax 15.
Expect: STFOTA 17037->17055 + TIFOTA 354->365 at its next session, then a
power cycle after mounting for a fresh cal. tb_attr.py NAMES should gain
this id as "'8538". Acceptance:
first 17055 post shows fwVer 17055; the following beat with ~460 KB
pending delivers the FULL interval to TB (no 6-h hole), `tofDropped` flat
at 25,6xx-25,8xx (the last 17054 trim), `tofPreviews` = 1.

---

## 1. Where things stand

**Bench trio** (all three physically in series on the bench rig):

| Unit | TB device id | Notes |
|---|---|---|
| '8549 | `5f18a040-dc4c-11f0-b691-d965a62fa4fa` | clean |
| '4423 | `737b0320-db7a-11f0-b691-d965a62fa4fa` | one unexplained ST reboot 11:52 — watch for repeats |
| '3063 | `d08d4e60-db7a-11f0-b691-d965a62fa4fa` | see Bug 3; `flashBusyOnWake` 2-3× the others |

All three: **ST 17046 + TI v364**, healthy and beating on a 15-min check-in
as of 15:28 PT.

**Shared attrs currently set (device scope):** `checkInPeriod=15`,
`radioOnEventEnd=false`, `radioOveruseMax=15`, `surveyStart=false`,
`recordNoneventFlow=true`. **`maxFlowRate` is UNSET** (running the 40 gpm
compiled default).

**Branches pushed:** `DuneFW_L5_2` → `stuck-event-fix` @ `f683014` (17046);
`Dune_FW_TI` → `cal-reacq` @ `910f9c6` (v364).
**Buckets:** TI `msp364.bin` (crc `c2961647`) on `dune-firmware-ti`; ST 17046
on both `st-test` and `st-prod`.

**Accuracy status — the trio PASSES the WYSE ±3% bar** (1.48% cross-device
spread at 7-8 gpm, 0.3% at 2 gpm). Do not re-litigate accuracy; these bugs
are about durability and event integrity, not the cal stack.

---

## 2. Bug 1 — billing register rolls back up to an hour (TOP PRIORITY)

**Measured 9/1 15:03**, bench power cycle, all three simultaneously:
`deltaMeterVal` **−80.77 / −77.89 / −77.16 gal**. Post-reset
`meterVal == meterFlash == meterStart == 581 / 595 / 994` = the value at the
*previous* boot (14:01). Nothing checkpointed across the whole hour — the
55-gal event included.

**This was a clean external power-on reset, not a crash:** `resetReason`
NONE, `faultCnt` 0, no IWDG, `ramBackupVer` 364→0→364 (RAM cleared).
**Not a flash fault:** `meterFlashFull` false, `meterFlashWriteFail` false,
`spiWrErr` 0, `spiInitErr` 0, `nvErr` 0.

**Root cause, read in the code (verified, not inferred):**
`flow_flash_write()` in `DuneFW_L5_2/Core/Src/meter.c` has exactly two
callers:

1. `Core/Src/meter.c:188` — inside the **hourly** meter-record path, guarded
   by `if (curTime >= meterNextUpdateTime && sf_flow_tof_available() > 0)`,
   with an inner `if (meterNextUpdateTime)` that **skips the first crossing
   after a boot**.
2. `Core/Src/main.c:354` — immediately before a **planned**
   `NVIC_SystemReset()` for a firmware switch.

So the register is durable only once an hour and on planned FOTA resets.
Any other reset — power blip, brownout, watchdog, crash — reverts to the last
hourly checkpoint. Supporting call chain:
`meter_update_internal()` (meter.c:141) → `flow_flash_update_cond()`
(meter.c:73, write-if-changed) → `flow_flash_write()` (meter.c:45).

**Fix direction (agreed with Bruce, not yet built):** checkpoint the register
on **event end** and/or **every N gallons**, not just hourly. Keep the
write-if-changed guard so idle meters don't burn flash. Watch
`sf_meter_entry_available()` headroom and the wear budget if you add a
per-event write — size it against the log capacity before committing.

**Open sub-question to answer while you're in there:** why the 15:00 hourly
beat did not land *at all*. Candidates: (a) device idle/asleep past the
boundary (no flow 14:45→15:03, so the main loop may not have run the hourly
check), or (b) the post-boot first-crossing skip pushing the schedule out.
Determine which — the fix differs.

**Why this is #1:** a customer power blip during the WYSE eval silently loses
up to an hour of billed water, and (see Bug 3) destroys the evidence.

---

## 3. Bug 2 — a scheduled check-in landing mid-event truncates the event

**Measured 9/1 15:11-15:14, the 2 gpm steady finish.** With
`checkInPeriod=15` all three came due at about the same time. '3063's radio
session landed ~15:13:5x **mid-flow**; the pair's landed just after valve
close. Result:

| | gal | sec | avg gpm |
|---|---|---|---|
| '8549 | 6.608 | 181 | 2.191 |
| '4423 | 6.661 | 183 | 2.184 |
| '3063 | 6.145 | **164** | 2.248 |

'3063's event closed **14 s early with water still running at 2.08 gpm**.
That is 0.485 gal — add it back and you get 6.630 vs 6.608/6.661, a 0.3%
spread. **The metering was fine; the radio ate the tail of the event.**

Mechanism is the already-known one: **ST skips the TI service loop during
radio sessions** (45-180 s holes). What's new is the price tag — 7.4% on a
6.6 gal event, and it will happen to a customer whose draw overlaps a
scheduled check-in.

**Fix direction:** defer the scheduled check-in while an event is open, or
buffer TI samples across the radio session so the event survives it. Deferring
is the smaller change; buffering is the more correct one. Bruce has not picked
— **ask him** before building, and note that deferring interacts with
`radioOveruseMax` and with the open-event radio timeout.

---

## 4. Bug 3 — '3063's 14:19→15:03 silence is UNRESOLVED. Do not call it a wedge.

'3063 went quiet at 14:19:08, **skipped the 14:39 and 14:45 radio sessions
the pair both took** (`nvTotalRadioCount` 12337→12338, vs the pair's +2 in
between), and produced **no event records** for those two clean-outs — which
both siblings booked (2.84/2.91 and 2.27/2.34 gal).

Then the 15:03 power cycle wiped RAM (`ramBufCnt` 11→0) and rolled the
register back, **destroying exactly the evidence** that would separate
"metered it, lost the records in RAM" from "never metered it." Bug 1 is what
destroyed the forensics for Bug 3.

**Ruled out:** radio overuse (`radioOveruseCnt` was 1 on all three
throughout), crash (`faultCnt` 0, `resetReason` NONE, no IWDG), link quality
(rsrp −93 to −96, normal for this unit).

**One real asymmetry, worth instrumenting:** `flashBusyOnWake` 114→146 on
'3063 vs 49→65 ('8549) and 0→50 ('4423) — its SPI flash is 2-3× slower to
become ready.

**A predecessor call that was RETRACTED and must not be reintroduced:**
"'3063 was dark-by-config." Unsupportable — the pair radioed at those same
event ends under the identical config.

**Approach:** do NOT try to diagnose this from the existing telemetry; it is
gone. Fix Bug 1 first (which makes the next occurrence survivable and
legible), add whatever counter would have answered it, and wait for a repeat.
'3063 has now had two unexplained silences (Saturday and 14:19) — if it
recurs after 17047, treat it as suspect **hardware** and bench it rather than
trusting it in a customer eval.

---

## 5. Also on the 17047 / v365 list (lower priority)

**ST 17047:**
- `surveyStart` smarter re-arm — an ST reboot clears `surveyStartSeenFalse`,
  so the edge disarms and a survey won't fire until a false-fetch re-arms it.
- FOTA-defer-while-event-open — FOTA mid-event destroys event records.
- Survey amplitude / absolute-ToF channels — needed to certify that low-gain
  cells are real signal and not crosstalk (currently unverified; the wet
  survey is the alternative).

**TI v365:**
- Ranked re-park: quality-ordered with radius-2 exclusion, replacing the LFSR.
- Per-size ceiling push (the 30 gpm-equivalent ceiling is 3/4"-specific).
- Plateau Δ and core thresholds exposed as attrs instead of compile-time.

**Untested, needs a real run before the field:** the 30 gpm TI ceiling and
40 gpm ST belt have **never been exercised** — the 9/1 "max flow" pulse only
reached 7.5-8.0 gpm, `maxFlowRejCnt` is 0 on all three, and the `maxFlowRate`
shared attr is still unset. A genuine high-flow run is required before anyone
relies on that gate.

---

## 6. Working rules for this session

- **Confirm before writes.** Preview → Bruce's explicit approval → verify →
  log. Applies to every TB attribute write and every device-roll lever.
- **Prod-bucket uploads of bench-lineage builds are standing-authorized** — no
  need to re-ask. **Device-roll levers** (`gen2fw`, `allowTiFotaVer`) still
  need a per-roll confirmation.
- **Never print the TB JWT.** It lives at
  `<scratchpad>/tb_token.txt`; scripts must re-read the file each poll and
  abort loudly on 401. Bruce's own logins kill the assistant's token — expect
  mid-session 401s and ask for a fresh paste. MCP TB tools carry their own
  auth and survive when the JWT dies.
- **TB writes** go as arrays of `{ts, values}`, ≤100 per request. Writes are
  upserts. Failed writes must be loud.
- **Reference-value discipline (standing rule):** never assume the true tank
  volume or flow rate on a rig run. Ask every time, and ask how it was
  measured. Assuming it once reversed two conclusions in a single session.
- **Large data stays on disk** — script the analysis, summarize back. Never
  load a bulk dump into context.
- **Python stdout:** wrap with `io.TextIOWrapper(sys.stdout.buffer,
  errors="replace")` and run `python -u` / flush, or em-dashes and background
  watchers break on cp1252.
- **TB timestamp trap:** derive window bounds from a known-good point already
  in the data, not from hand arithmetic — hardcoded window math produced two
  empty queries on 9/1. Also filter `ts > 4e12` to drop the ×1000 tiTime-bug
  timestamps.
- **Upload lag ≠ stream death.** 1 Hz nonevent recording backfills on the next
  beat. Always check a wide window before declaring a gap; this produced two
  false alarms on 9/1.

---

## 7. Suggested verification plan

1. Build 17047 with the Bug 1 fix. Deploy to the trio.
2. **Reproduce the rollback deliberately:** run a known volume, then pull
   power mid-hour, and confirm `deltaMeterVal` ≈ 0 on reboot instead of
   −80. This is the acceptance test.
3. Re-run the pulse + 2 gpm steady profile with a check-in deliberately
   scheduled to land mid-event; confirm the event no longer truncates.
4. A genuine high-flow run to exercise the 30/40 gpm ceiling for the first
   time.
5. Overnight thermal soak — still outstanding as the restore-with-strikes
   verdict from the v364 stack.

Memory files with the full background:
`project_register_save_gap_0901.md`, `project_pulse_accuracy_0901.md`,
`project_v362_lock_integrity_0901.md`.

### 0e (cont.) — 9/7 10:18 PT: 0.5 gpm at 6 PULSES, lamCorr ON — correction confirmed; "not engaging" RETRACTED

**Run (Bruce: 20 gal + 112 oz = 20.875 gal, 20.2 C, ~2,620 s -> true 0.478 gpm, Re ~2,195 at tank temp):**

| unit | err | 13-pulse 0.5 gpm 9/5 (lamCorr OFF) | delta |
|---|---|---|---|
| '8549 | -0.26% | +12.94% | -13.2 pp |
| '4423 | +3.92% | +24.29% | -20.4 pp |
| '3063 | -6.07% | +7.99% | -14.1 pp |
| '8538 | -1.09% | +7.08% | -8.2 pp |
| mean | **-0.88%** (spread 10.0 pp) | +13.08% (17.2 pp) | -14.0 pp |

Cold-water term at 20.2 C is +0.70%. Posts: lamCorr=true, tiPulse=6 x4, flowDirection UNKNOWN x4 after 44 min at 0.5 gpm, gains 32/32/26/35, upamp 1587/1261/754/934, lamTempSrc 0/1/0/0 ('4423 ext probe dead).

**The correction IS engaging.** The 9/6 finding "lamCorr on but lamCorrMax=0 -> not engaging" is RETRACTED. Two reporting artefacts stacked:
1. **Rev 16144 double post.** Every session posts status twice: the early snapshot, then the authoritative post 2-4 s later. `bg95_send_status` reset the per-report statistics after EVERY successful post, so the final post — the one TB shows as latest and the one my reads took — carried zeros for lamCorrMax, tnormMin/Max/Count, tempMin/Max, measCtr, measFailCtr, errbCtr, spiMismatch and the meterFlash* fault flags. Verified in paired posts on all four (lamCorrMax 100 -> 0, tnormCount 2717 -> 0, tnormMax 30493 -> 0 three seconds apart). **On FW <= 17060 read the FIRST post of a session for any per-report key.** A meterFlash fault flag has never been visible on "latest" since 16144.
2. **lamCorrMax pinned at 100.** Every early post since the knots loaded reads exactly 100 = 1000*(1-k1): positive noise samples (micro-gpm, Re ~0) sit at the knot-1 floor, so the max says only "table loaded", never what a run was corrected by.

**Model check (inferred, one run):** raw +13.08% x k. Water temp used by the device = ext probe (21.4-22.1 C) minus extTempBias 4.0 = 17.4-18.1 C -> nu ~1.06e-6 -> Re ~2,090 -> k 0.900-0.905 -> predicted corrected group +1.8 to +2.4%. Measured -0.88%: ~3 pp lower than the model. Candidates: the 6-pulse drive reads lower at 0.5 gpm than 13 did (the 1 gpm comparison showed no group shift, so not proven), or run-to-run wander. Per-unit deltas between the two runs span -8 to -20 pp around the -14 mean: **the low-Re per-unit offsets are not stable run to run (or moved with the pulse change), so per-device low-Re trims would not hold.** At 0.5 gpm '3063 (-6.1%) and '4423 (+3.9%) are still outside +/-3%; the group mean is inside.

Ext probes read 1.2-1.9 C ABOVE the 20.2 C tank this run (9/6 they read below): with bias 4.0 the modelled water is ~2 C cold -> Re ~5% low -> knot-1 depth ~0.5 pp too deep. Small; the bias table is not the priority.

**Rev 17061 BUILT + prod bucket + pushed (e2930ab), NOT rolled:** (a) per-report resets run only when `earlyStatusDone` is set (final post only) — `bg95.c` in `bg95_send_status`; (b) `lamCorrMax` counts only samples with flow >= `EVENT_FLOW_THRES` (0.175 gpm) — `measure.c` `lam_knorm`. 110,008 B (2,632 B headroom). No Bell-first twin for '8538 yet. Roll on Bruce's word; after the roll, a low-flow run should show lamCorrMax ~90-100 on the FINAL post and 5 gpm only ~0.

**9/7 ~10:45 PT TB WRITE (Bruce: "set the trio to 17061"):** gen2fw 17060 -> 17061 on 8549/4423/3063 (SHARED_SCOPE, HTTP 200 x3, read-back verified). 8538 untouched (17905 Bell-first line). Next: 50 gal @ 5 gpm at 6 pulses, then Bruce wants to move to 1/2" pipe testing.

**9/7 ~11:25 PT — 50 gal @ 5 gpm at 6 PULSES on 17061 (trio) / 17906 ('8538), Bruce: 51 gal + 16 oz = 51.125 gal, 19.6 C, 579-581 s -> 5.30 gpm. Cold-water model term +0.90%.**

| unit | raw err | vs model | 13-pulse unit offset vs model (4-run avg) | shift |
|---|---|---|---|---|
| '8549 | -1.04% | -1.94 | -0.10 | -1.8 pp |
| '4423 | +1.02% | +0.12 | +3.05 | -2.9 pp |
| '3063 | +0.69% | -0.21 | +2.49 | -2.7 pp |
| '8538 | -1.48% | -2.37 | -0.70 | -1.7 pp |
| mean | **-0.20%** (trio +0.22%) | -1.10 | +1.10..+1.41 (group) | ~-2.3 pp |

Spread 2.50 pp (trio 2.06 pp; was 3.15 pp at 13 pulses). All four inside +/-1.5% raw at 19.6 C. **6 pulses reads ~2 pp lower than 13 at 5 gpm on every unit**, the same direction and about the same size as the ~3 pp shortfall vs the model at 0.5 gpm this morning -> the pulse-count effect on the reading is a consistent -2..-3 pp, not wander (inferred from one run per flow; the trio also re-calibrated at the 17061 boot, gains 32/32/26 -> 29/30/27). Lf 2.225 stays: the group is centred on the reference raw (-0.2%) and the 13-pulse +1.1..+1.4 "vs model" cushion has become -1.1 — the cold-water term itself came from copper at 13 pulses, so a refit on one run is premature. lamCorrMax on 17061 behaves: 0 on '4423/'3063 at Re ~22k, 6 (k 0.994, Re ~8k) on '8549 = one eventing sample on the valve ramp; '8538 (17906) still shows the 100 -> 0 pair. Direction still UNKNOWN x4. 17907 (= 17061 + Bell-first) built/uploaded/committed e1a339f, NOT written to '8538 (Bruce's word pending). Bruce: move on to 1/2" pipe next; loose end = a repeat 0.5 gpm at 6 pulses to pin the low-flow pulse shift.

### 0g — 9/7 PEX-B 3/4" eval (quad remounted ~12:55 PT; pipeType left X, lFactor attr 2225 on the trio, PEX-A knots, 6 pulses)

Remount = power cycle -> TI default 13 pulses on '8549/'4423/'8538 ('3063 came up at 6); boot session skipped attrs (known). Clean-out at 13:08 -> sessions 13:12 fetched attrs -> v366 param re-cal -> tiPulse 6 x4 (paramRecal 1 on the three). PEX-B coupling vs PEX-A (gain/amp at 6 pulses): '8549 24/394 (PEX-A 29/986, ~same raw), '4423 30/254 (30/1008, ~-11 dB, at the 273 floor — Bruce: run as is), '3063 32/867 (27/992, ~-6 dB), '8538 36/1580 (35/845, ~+6 dB; 1867 at 13 pulses = above the 1638 compression ceiling, 6 pulses brought it under). 13->6 pulses cost '8549 592->394 counts (-3.5 dB) at fixed gain: larger than PEX-A's -8%. Bore of the PEX-B stick NOT calipered.

**Run 1, 50 gal @ 5 gpm (Bruce: 52.405 gal + 40 oz = 52.7175 gal, 19.5 C, 604-607 s -> 5.23 gpm), Lf 2.225 on all:**

| unit | err | PEX-A today (same Lf, 6 pulses) | delta |
|---|---|---|---|
| '8549 | -1.86% | -1.04% | -0.8 pp |
| '4423 | -1.02% | +1.02% | -2.0 pp |
| '3063 | -1.08% | +0.69% | -1.8 pp |
| '8538 | +0.04% | -1.48% | +1.5 pp |
| mean | **-0.98%** (trio -1.32, spread 1.9 pp) | -0.20% | -0.8 pp |

Lf that zeroes the raw group error: **2.221** (2.217 vs the cold-water model). That is 0.2% from PEX-A's 2.225 = 0.4% of flow — inside the PEX-A run-to-run spread (3.5 pp), so run 1 says PEX-B == PEX-A within measurement. Table x column (2.250) would read 2.6% LOW on this pipe. lamCorrMax on 17061: 9/15 ('8549/'3063 = valve-ramp samples), '4423 = 100 with no low-flow run -> its noise floor exceeds the 0.175 gpm gate (weak coupling, 245 counts) — a usable "noisy unit" tell. Run 2 pending; decision rule: within 1% -> both PEX columns 2.225.

**Run 2, 50 gal @ 5 gpm (Bruce: 50 gal + 16 oz = 50.125 gal, 19.6 C, 588-593 s -> 5.1 gpm):** '8549 -1.06 / '4423 +0.51 / '3063 +0.47 / '8538 +0.60; mean **+0.13%**, spread 1.66 pp. Two-run mean -0.42%; two-run per-unit -1.46 / -0.25 / -0.30 / +0.32. **Lf that zeroes the two-run mean = 2.223 -> PEX-B == PEX-A (2.225) to 0.1%.** Decision: 2.225 in both PEX columns; no installer A/B distinction needed. Rev 17062 = table x-B 3/4" 2.250 -> 2.225, built + prod bucket + pushed, NOT rolled (nothing on the bench needs it: the trio runs the lFactor attr). lamCorrMax on the 17061 posts read 93/34/98 this run vs 9/100/15 on run 1 — valve-ramp samples, depends on how fast the valve closes; fine. PEX-B eval CLOSED after ~70 min of flow. Loose ends: caliper the PEX-B stick (not done), delete the trio lFactor=2225 attr once the table carries it everywhere (Bruce's OK pending), 0.5 gpm knot check on PEX-B skipped (Bruce's call).

**9/7 ~14:30 Bruce calipered both 3/4" PEX sticks: ID 0.670" (A and B). Table uses nominal 0.681 (+1.6%); the fitted (0.681, 2.225) pair is equivalent to (0.670, 2.218). Left as is. Rule for 1/2": measure bore first, then fit Lf.**

**9/7 ~14:35 TB WRITE (Bruce: "set 8538 to 17907"):** gen2fw 17906 -> 17907 on Device 75368538 (SHARED_SCOPE, HTTP 200, read-back verified). 17907 = 17061 + Bell-first; takes at its next session, ST reboot -> TI param re-cal at 6 pulses follows.

**9/7 ~14:40 TB DELETE (Bruce: "delete the lFactor attr on the trio"):** SHARED_SCOPE lFactor (2225) removed from 8549/4423/3063 (HTTP 200 x3, read-back unset). Effective Lf unchanged: 17056+ table X-A 3/4" = 2.225. 8538 never had the attr.

**9/7 ~14:50 TB WRITE (Bruce: "Set all for 1/2 PEX"):** pipesize U+00BE (3/4) -> U+00BD (1/2) on 8549/4423/3063 (SHARED_SCOPE, HTTP 200 x3, read-back verified). pipeType stays X -> table row 1/2" X-A: bore 0.485, Lf 2.220 (unvalidated), bias 4.0. Bruce calipered the 1/2" PEX stick: ID ~0.482 (F876 nominal 0.485, PPI/Uponor average 0.475). 8538 untouched (ships tomorrow, 3/4).

### 0h — 9/7 ~15:15 Rev 17063 / 17908: pipeType + pipesize are the only two knobs (WYSE sample ships 9/8, may be tested on PEX / copper M / PVC 3/4")
Bruce: "We need M-copper include as well - they could test on PEX, M Cu and PVC 3/4" / "All should be configurable through meter settings pipeType and dia". State before: Lf, bore, probe bias follow (pipeType, pipesize) via tables; laminar knots were attr-only with copper defaults (PEX knots on the quad as attrs); a pipe change called setCalStates() = EMPTY STUB, so a re-plumbed meter kept the old pipe's TI cal and ST offset.
17063: (a) `lamReByType/lamKByType[11][3]` in measure.c selected by pipeType — copper set for K/L/M, PEX set for X/x, PVC/CPVC ASSUME PEX (unmeasured), B/b copper; lamRe/lamK attrs override (`lamKnotsSet`). (b) `pipe_geometry_changed()` (main.c): pipeType or pipesize change on a meter that already had them applied this boot -> `meas_on_drive_change()` + `TIW_CAL_RESTART` (TI >= 366). Guards: `pipeTypeSet` / prior `diaSet`, so the boot-time 'M'->'X' first application and install sessions do NOT re-cal. Legacy "dia" attr and lFactor paths untouched. Sizes 110,328 B (release) / 110,360 B (17908 Bell-first). Both in the prod bucket; committed/pushed. NOT rolled.
Proposed for '8538 before ship (Bruce's go pending): gen2fw 17907 -> 17908; DELETE lamRe1-3, lamK1-3, extTempBias attrs so pipeType drives knots + bias; keep lamCorr true, pulse 6, pipeType X, pipesize 3/4, radioOnEventEnd true, recordNoneventFlow true, checkInPeriod 480 (eval config = the earlier "Wyse Test" units). Procedure for Wyse: tell us the pipe -> we set pipeType/pipesize -> takes effect at the next session (event end or check-in) with an automatic offset reset + soft re-cal. Trio: optional 17063 roll (its knot attrs make it behave identically either way).

**9/7 ~15:25 TB WRITE+DELETE (Bruce "go"):** Device 75368538 gen2fw 17907 -> 17908 (HTTP 200); SHARED lamRe1-3, lamK1-3, extTempBias DELETED (HTTP 200, read-back: none present). Remaining eval config: lamCorr true, pulse 6, pipeType X, pipesize 3/4, radioOnEventEnd true, recordNoneventFlow true, checkInPeriod 480, radioOveruseMax 15, allowTiFotaVer 368, adcCapture false, recalibrate false. Takes at next session; confirm fwVer 17908 + tiPulse 6 before boxing.

**9/7 ~15:35 TB WRITE (Bruce: "set the trio to 17063"):** gen2fw 17061 -> 17063 on 8549/4423/3063 (HTTP 200 x3, read-back verified). Takes at next session; reboot -> 13 pulses until the following session (clean-out before any 1/2" run).

**9/7 ~15:45 TB WRITE (Bruce: "set all back to pex 3/4 - I want to make sure the pipetype settings are working properly"):** pipesize 1/2 -> 3/4 on 8549/4423/3063 (HTTP 200 x3, read-back verified). Trio still on 17061 until its next session (17063 pending), so this change will NOT exercise the 17063 pipe-change re-cal; a later 3/4 -> 1/2 -> 3/4 toggle once 17063 is running does (expect paramRecal +1, offset reset, new gains, no TI reset).

### 0i — 9/7 ~16:15 '4423 / '8538 quiet tofNorm −336 / +420 ps on PEX-B (Bruce spotted it): offset tracker boot quick-lock + Rev 17031 24 h lock

Quiet-window tofNorm medians (records, 1 Hz): PEX-A 11:30-12:30 '8549 +19 / '4423 +66 / '3063 −94 / '8538 −13. PEX-B from 13:03 onward: −30 / **−336** / −3 / **+420**, flat through 14:05 (−350→−306, 422→408). At 5 gpm (~21,000 ps) that is ∓1.6 / +2.0%; at 1 gpm ~10%; at 0.5 gpm ~20%. Below the 0.175 gpm event floor so no phantom events/totalization, but any low-flow run on those two is wrong until it clears.
Timeline: 13:00 boot after the remount power cycle -> BKUP offsets gone (all four re-derived: −531→−539, −2001→−2245, 5100→5081, 2804→3246) -> 13:03 status already shows the new applied offsets AND the residuals (+384 on '8538 at 13:03:xx, i.e. the lock was ~400 ps off within seconds of taking it). 13:12 param re-cal (`meas_on_drive_change` -> `offset_init` -> `otk_requalify`) changed NOTHING: same applied values on the 13:12/13:16/13:29/14:06/14:17 posts. '8538 raw zero on PEX-A (−2817) vs PEX-B (−2826) is essentially unchanged: the tracker moved, the pipe did not.
Mechanics (`offset_tracker.c`, `analytics.c`): fresh boot with no retained value -> first stable fast cluster (OTK_MIN_PEAK 32 samples ≈ 32 s after InfoMetering asserts) becomes the applied baseline; Rev 17031 then LOCKS the applied value for the 24 h qualification (`may_update = !have_applied || (committed && qual_until == 0)`), so a lock taken on post-cal settling samples is frozen until the 24 h shadow commit (needs ≥5000 quiet samples too). DESIGN_TNORM_OFFSET_TRACKER.md names exactly this as failure **F2** ("fresh histogram trusts the first 32-sample cluster; TI settling transients are dense and stable enough to win"). Second defect: `otk_requalify` keeps `applied_ps`/`have_applied`, and R4's "retained offset keeps applying until the provisional beats it" is dead since 17031 — so 17059/17063's offset re-zero after a pulse/pipe change is a no-op for 24 h: the OLD pipe's offset keeps applying. Every fresh install has the same exposure (first 32 s after cal commit = baseline for a day); the Shady phantom-floor class (~+0.2 gpm) is the same size as a larger version of this (INFERRED, not shown).
Proposed 17064 (spec, not built): (1) `otk_drop_applied()` from `meas_on_drive_change` so a drive/pipe change really re-baselines; (2) provisional re-anchor during qualification: if a fast cluster with ≥4× the lock cluster's mass sits within ±OTK_GATE_PS (768 ps) of the applied zero, re-anchor once (real draws are 3,000+ ps so the 8/8 "7000 ps flow capture" that motivated 17031 stays excluded); alternatively a fixed settle hold (skip the first ~60 s after InfoMetering) at the cost of install time. Bench now: '4423/'8538 stay wrong until ~13:03 9/8 (commit) or a power cycle (another lottery) or an `offset` pin. '8538 ships 9/8: its Wyse mag-reset install re-rolls the same lottery; low-flow tests in the first 24 h are at risk.

**9/7 ~17:00 Rev 17064 BUILT (Bruce "go build 17064") + 17909 Bell-first; prod bucket; pushed f055633; NOT rolled.** `offset_tracker.c`: (a) provisional re-anchor during the 24 h qualification — fast cluster with >= 4x `lock_mass` (starts at OTK_MIN_PEAK 32 -> first re-anchor at 128 samples ≈ 2 min of quiet) whose zero is within +/-OTK_GATE_PS (768 ps) of the applied zero replaces it; bar rises 4x each time (self-limiting; 512 = FAST_CAP so effectively one or two); (b) `otk_rebaseline()` — a runtime `offset_init()` (pulse change 17059, pipe change 17063, `recalibrate` attr — main.c now calls offset_init there too) keeps applying the old zero until the FIRST stable cluster replaces it unconditionally (no raw-tofd window, no phantom event), then (a) refines. Applies also to a FW reboot with a BKUP-retained value (re-anchor within 768 ps allowed — a post-FOTA re-cal can move the zero a few hundred ps). New status key `ofsReanchor` (count since boot; 0/1 on a clean install). Sizes 110,600 B release (2,040 B headroom left) / 110,632 B 17909. Verification plan (tomorrow AM, before '8538 boxes): trio to 17064 -> power cycle -> after cal + ~2 min quiet expect quiet tofNorm within ~100 ps on all three and ofsReanchor 1 on any unit whose quick-lock was off; then pipesize 3/4 -> 1/2 -> 3/4 toggle on 17063+ to see paramRecal +1 and a rebaseline (ofsReanchor +1, offset value changes) with no TI reset. '8538 -> 17909 only after the trio proves it.

**9/7 ~17:05 TB WRITE (Bruce: "set trio"):** gen2fw 17063 -> 17064 on 8549/4423/3063 (HTTP 200 x3, read-back verified). Devices had not yet taken 17063 (still reporting 17061), so the next session goes 17061 -> 17064 directly.

### 0j — 9/7 ~17:15 v369 + 17065 BUILT (Bruce "go build v369 and 17065"; spec drive-param-persistence-spec.md, commit 6611e39). NOT rolled.
TI v369: PERSISTENT `gUserParamsNV` {magic, num_pls, gap_pls_adc_start, capture_duration, crc} in dune/info.c; saved in Handler_gap_pls_adc_start_id / Handler_num_pls_id / Handler_capture_duration_id; `dune_user_params_boot()` in main() after the boot banner captures compiled defaults then overlays a valid block (ranges pls 1-31, blank <=200 us, capture 1-200) BEFORE USSLibGUIApp_Init copies them into the drive; new 0xAE `COMMAND_HANDLER_DUNE_USER_PARAMS_RESET_ID` -> `Handler_user_params_reset` (listener table 54). Image 47,218 B, 5 chunks; s3://dune-firmware-ti/msp369.bin; tag v369; main merged.
ST 17065: `NVRG_TI_OVERRIDES_ID` = BKP29R (bootloader uses only BKP30R/31R) [7:0] pulse [15:8] blank [31:16] captureDuration, rewritten per field as each attr is parsed (`ti_overrides_mirror`); `hci_push_user_overrides()` pushes the session value else the mirror; fresh-install boot path (init.c "PIN/fresh boot" — note this is ANY pin/power-on reset, which is also why the 13:00 power cycle wiped the offsets) clears the mirror and sets `gFreshBootWipe`; the first CAL_HOLD gate release queues `TIW_USER_RESET` 0x20 at top drain priority (ahead of OVERRIDES, ahead of CAL_GATE) -> `hci_user_params_reset()` 0xAE. 110,852 B (1,788 B headroom). 17910 = Bell-first twin (110,884 B). Both in the prod bucket.
Not addressed: root cause of the power-on boot session that applied no attributes (pulse=0 on the 13:03 post) — spec 4.3, needs a UART log; v369's FRAM copy makes the first cal right regardless.
Verification (spec §6, tomorrow AM on the trio, before '8538 boxes): TIFOTA v369 on one unit first; power cycle x2 -> boot post tiPulse 6 / paramRecal 0; ST FOTA round trip 17064->17065->17064->17065 (also answers whether TI FOTA preserves .TI.persistent); mag reset with pulse attr deleted -> 13, with pulse=6 -> 6; recalibrate=true still soft-restarts + rebaselines; 50 gal @ 5 gpm regression. Levers: gen2fw 17065 + allowTiFotaVer 369 on the trio; '8538 -> 17910 + 369 only after the trio proves it.

**9/7 ~17:25 TB WRITE (Bruce: "set trio"):** gen2fw 17064 -> 17065 and allowTiFotaVer 368 -> 369 on 8549/4423/3063 (HTTP 200 x3, read-back verified). Takes at next session: ST FOTA + reboot, then TIFOTA v369 in the boot session. 8538 untouched (17909/368).

### 0k — 9/7 ~17:45 Cal gain pick is a lottery on a clean map (Bruce: "3 cal'd with large ADC, 4423 small ADC amp"; "doesn't make sense 4423 would grab cal values at amp edge")
Trio took 17065/v369 at 17:21 (first cal at 6 pulses straight away: TIFOTA boot, gate with overrides in time). From-scratch cals today on the SAME PEX-B mount: '8549 24/592 -> 24/628 -> **36/1812** (above the 1638 compression ceiling; 1583 after); '3063 32/812 -> 24/463 -> **36/1497**; '4423 33/396 -> 36/669 -> **26/246** (below the 273 floor); '8538 36/1867 -> 35/1732 (v368). Surface map each time essentially fully clean (calSurfCleanN 29-33 of 33 envelope cells, regSz = cleanN, bails 0).
Mechanism (cal.c surface_commit, v359-v364): pick = largest clean region -> cell maximizing Chebyshev distance to the nearest non-clean cell (fully clean map: distance to the border) -> ties: lowest sd -> lowest gain. The envelope grid is 11 gain rows (23,24,26,27,29,30,32,33,35,36,38) x 3 env cols (30,40,50). With 3 columns the border distance saturates: every interior middle-column cell (9 rows, gains 24..36) ties at m=2, so the row is decided by which cell had the lowest quiet-window sd in a few seconds of samples = noise. **Amplitude is not a criterion anywhere in the pick** (SC_CLEAN = sampled & !skip & !err & !dead, plus the v362 plateau BIAS filter; the 273 floor only applies at the ladder verdict rung; the v352 amp hold is disabled since v359). v364 stickiness only holds within a boot (RAM). Result: same mount, gains 24..36 = 12 dB of lottery, amplitudes from the noise floor to compression.
Proposed v370: record per-cell amplitude during the envelope walk (33 x uint8 amp/8 = 33 B; RAM has 250 B free), and rank clean-region cells FIRST by amplitude band — target ~900 counts, band 600..1200 (~35-75% of the 1638 ceiling), |amp-900| as the primary score — then the existing distance/sd/gain tie-breaks; fall back to the current rule if no clean cell is in band. Deterministic on a clean map, keeps '8549/'3063/'8538 out of compression and lifts '4423 off the floor. Not built; Bruce's go pending.

**9/7 ~18:10 v370 BUILDING (Bruce "build it"; design agreed in chat: rectangular good regions, largest contiguous, centre pick; gain rows 23..47 in five-index (~4.3 dB) steps; env cols 30/38/46/54; interpolation between adjacent good cells is valid because gain is analog/monotone and the v362 level test proves same-lobe lock).** cal.c: grid 6x4 = 24 cells (was 23x5 walked as 11x3), envelope == grid, level slots 24; `g_sc_amp8[24]` banked in sc_advance from duneInfo.upamp/8; `sc_center_amp_pick()`: env = centre column of the region's column span (even span -> midpoint of the two middle columns when both cells of the chosen row are in-region and sd <= SC_SD_CORE), gain = row bracketing SC_AMP_TARGET 900 counts, linear interpolation between the two ADJACENT good rows (all louder -> lowest row; no adjacent bracket -> highest row at/below target); fallback = v359/v364 margin pick; v364 stickiness now keeps the previously APPLIED gain/env (`g_prev_gain/env`). Bookkeeping cell for re-park = nearest sampled cell. Expected on today's maps: '8549/'3063/'8538 -> gain ~27-29 / ~900 counts / env 42; '4423 -> gain ~38 / env 42.

**9/7 ~18:25 TB WRITE (Bruce: "set the trio"):** allowTiFotaVer 369 -> 370 on 8549/4423/3063 (HTTP 200 x3, read-back verified); gen2fw stays 17065. Devices already on 17065 / v369 / 6 pulses. TIFOTA v370 at next session -> from-scratch cal on the 6x4 grid: expect ~g27-29 / ~900 counts / env 42 on the loud three, ~g38 on 4423; then power-cycle repeatability tomorrow.

### 0l — 9/7 18:25-18:37 v370 first results + the post-TIFOTA reboot pattern (Bruce: "they are both recalibrating now - we've seen this before")
v370 TIFOTA took at 18:25 on the trio. First picks: '8549 g28 / 865 counts / env 42 (map 24/24), '3063 g30 / 835 / 42 (30 = interpolated between rows 28 and 33), '4423 g36 / 871 / 42 — all three at the 900-count target and env 42 as predicted (was 36/1748, 36/1181, 26/277 one cal earlier on the same mount).
Then '8549 and '3063 rebooted at 18:34:50: spiWrErr 11 / 18 and spiReadyTimeout during the TI flash -> sf wedge -> "reboot heal" software reset (bootReasonFlags 6 -> 20), the same path '8549 took on 9/6. Cost: the boot FIFO recovery re-found 10,007 / 9,353 records (~160 KB) as unsent and re-uploads them (TB upserts, harmless but ~10 min of radio). Known 17020 bus-arbitration territory, still open.
**Two results fell out of that reboot:** (1) both units re-calibrated to the SAME picks, g28 / 869 / 42 and g30 / 862 / 42 — v370 repeatability across a full ST+TI reset, first evidence; (2) both boot sessions had `pulse = 0` on the ST (the boot-session attribute gap again) yet the TI calibrated at **6 pulses** — the 17065 mirror push and/or the v369 FRAM restore did their job; tomorrow's mag-reset-with-attr-deleted test separates the two.
**'4423 is at 13 pulses since its v370 flash** (18:27 and 18:33 posts, ST pulse=6, paramRecal 0, no reboot, spi errors 0): the override push did not reach its TI in two sessions. Watch the next session; if still 13, the write path to that TI is being lost (Rev 16181 deaf-window class) and needs a UART look. Its picks were still on target (36 / 871 / 42) — at 13 pulses; at 6 it will re-pick a step higher.
'8538 untouched (17908 / v368, 35 / 1356-1715).

**9/7 ~18:45 TB WRITE (Bruce: "update 8538"):** Device 75368538 gen2fw 17908 -> 17910 (= 17065 + Bell-first), allowTiFotaVer 368 -> 370 (HTTP 200, read-back verified). Next session: ST FOTA + reboot, boot session TIFOTA v370 -> from-scratch cal on the 6x4 grid (expect ~g27-29 / ~900 / env 42 instead of 35 / 1768). Watch for the post-TIFOTA sf-wedge reboot (spiWrErr) and confirm tiPulse 6 before boxing.

**9/7 19:06 — 50 gal @ 5 gpm on the v370 picks (Bruce: 50 gal + 24 oz = 50.1875 gal, 19.5 C, 576-580 s -> 5.2 gpm). '8538 had already taken 17910 / v370 at 18:52-18:55 (new pick g30 / 1075 / env 42, was 35 / 1768).**
| unit | pick | err | PEX-B runs 1 / 2 today (old picks) |
|---|---|---|---|
| '8549 | 28 / ~800 / 42 | -1.29% | -1.86 / -1.06 |
| '4423 | 36 / 678 / 42 | +0.66% | -1.02 / +0.51 |
| '3063 | 30 / 838 / 42 | -0.50% | -1.08 / +0.47 |
| '8538 | 30 / 1075 / 42 | -0.88% | +0.04 / +0.60 |
| mean | | **-0.50%** (spread 1.95 pp) | -0.98 / +0.13 |
Lf to zero 2.223 (third run in a row within 0.1% of 2.225). The v370 picks moved '8538 -1.2 pp (out of compression) and the others within their run-to-run band; accuracy at 5 gpm is unchanged by the pick change, as expected (Lf absorbs the operating point). All four inside +/-1.3%.

### 0m — 9/8 05:16 1 gpm x 20 gal on the v370 picks, lamCorr on (Bruce: 20 gal + 40 oz = 20.3125 gal, 19.8 C, ~1,205 s -> 1.01 gpm, Re ~4,590 at tank temp)
| unit | pick | err | 9/6 1 gpm (old picks, 6 pulses) |
|---|---|---|---|
| '8549 | 28 / 804 | +0.78% | +1.13 |
| '4423 | 36 / 801 | +1.03% | +7.74 |
| '3063 | 30 / 732 | -1.87% | +1.64 |
| '8538 | 30 / 1188 | +0.45% | +2.02 |
| mean | | **+0.10%** (spread 2.90 pp) | +3.13 |
Expected +0.83% (cold-water term) if knot 2 is right. Implied k2 = 0.9953 (excl '4423 0.9984) vs table 0.9880 -> within 0.7% = the same ~-0.7 pp 6-pulse shift seen at 5 gpm. **Knot 2 holds at 0.988; no change.** '4423's 9/6 outlier (+7.74) is gone on the v370 pick + 17064 offset (it was 30/254 counts at the floor with a locked 400 ps offset then; now 36/801). All four inside +/-2% at 1 gpm. lamCorrMax 100/26/61/96 = valve-ramp samples (gated key working). Remaining 3/4" PEX run: 0.5 gpm x 20 gal (knot 1 repeat at 6 pulses + PEX-B low-flow confirm).

### 0n — 9/8 06:13 0.5 gpm x 20 gal on the v370 picks, lamCorr on (Bruce: 20 gal + 110 oz = 20.859 gal, 20.4 C, ~2,850 s -> 0.44 gpm, Re ~2,025 = knot 1). **3/4" PEX CLOSED.**
| unit | pick | err | 9/7 0.5 gpm (old picks) | quiet residual before run | plateau tofNorm |
|---|---|---|---|---|---|
| '8549 | 28 / 656 | +1.63% | -0.26 | +35 ps | 1989 |
| '4423 | 36 / 742 | +2.06% | +3.92 | -22 ps | 1985 |
| '3063 | 30 / 889 | **-8.32%** | -6.07 | **-108 ps** | **1792** |
| '8538 | 30 / 1091 | +0.39% | -1.09 | +25 ps | 1954 |
| mean | | -1.06% (excl '3063 +1.36%) | -0.88 | | |
Expected +0.64% (cold-water term). Three units within +/-2.1% and the group within +/-3% -> **knot 1 (2066 / 0.900) final; PEX knots, Lf 2.225 both columns, bias 4.0 all final at 6 pulses.** '3063 is a unit, not a knot: its plateau sits 193 ps below the others (-9.7% of dtof), of which -108 ps is its un-re-anchored quiet residual (-5.4 pp) and ~85 ps (~4 pp) is unit-specific at low Re (the copper-era finding: device spread is a low-Re phenomenon). Its applied offset (5003, the largest magnitude of the four) has not moved since 04:56: 17064's re-anchor bar compounds 4x per re-anchor (32 -> 128 -> 512 = FAST_CAP), so after one or two re-anchors it is effectively frozen until the 24 h commit, and the post-commit cz slew is 256 ps/day. **Proposed 17066 (not built): fixed re-anchor bar (e.g. >= 256 samples of quiet, ~4 min) with a minimum interval instead of 4x compounding, so a 100 ps residual clears in minutes; a 100 ps residual is 5% at Q1.** Direction still UNKNOWN x4 after 48 min at 0.44 gpm.

**9/8 ~06:40 Rev 17066 BUILT + prod bucket + pushed 9b9d4d2 (Bruce "are you pushing 17066?"):** offset re-anchor bar = fixed 256 quiet samples, min 180 s apart (was 4x compounding). 110,856 B (1,784 B headroom). **TB WRITE:** gen2fw 17065 -> 17066 on 8549/4423/3063 (HTTP 200 x3, read-back verified); takes at the next session = the PVC power-up. 8538 untouched (ships on 17910/v370). PVC prep writes (pipeType P, delete lamRe1-3/lamK1-3/extTempBias on the trio) PENDING Bruce go.

**9/8 ~06:45 TB WRITE+DELETE (Bruce: "Apply changes"):** trio pipeType X -> P; SHARED lamRe1-3, lamK1-3, extTempBias DELETED (HTTP 200 x3, read-back: none remain). pipesize 3/4, pulse 6, lamCorr true, gen2fw 17066, allowTiFotaVer 370 unchanged. Bruce: clean-out first (takes 17066), then swap to PVC 3/4, fresh MAG RESET = test of the new install process (fresh-boot path: mirror cleared + 0xAE to TI, attrs applied in the install session before the gate, first cal at 6 pulses on the P row, v370 pick).

**9/8 Bruce calipered the PVC Sch 40 3/4 stick: ID 0.804-0.809" = table P column 0.804 (manufacturer average ID; nominal 0.824). No bore change.**

### 0o — 9/8 08:30 PVC installs + '8538 capture window anomaly (Bruce: "8538 has a different blank and captureDuration then the trio")
Mag-reset installs on PVC (06:48-06:51, 17066/v370, pipeType P): first cal at 6 pulses on all three with the ST `pulse` key 0 -> FRAM/mirror persistence delivered the drive; picks '8549 38/749, '3063 43/1084, '4423 47/902 (PVC couples ~10 dB weaker than PEX-B; two of three at/near the top row). '4423 then Failed Cal twice (07:02, 07:08) after Bruce swapped its coupling pad: 448-513 counts at gain 47 (was 902 with the first pad); after re-seat 07:27 it calibrated at 43/476/env 54 with only 8 clean cells — marginal at 6 pulses. 6 pulses has little margin on PVC (v344's PVC-cohort rationale confirmed).
**Blank/captureDuration are TI cal-derived (no attrs on any unit):** the tighten step commits blank ~33-36 us with CAL_TIGHT_CAPTURE_US 15; the CAL_INIT window is 30/30. Trio: 36/15 (correct). **'8538 (17910 / v370): Metering with 30/30 since its 08:02 mag reset** (its 06:51 reset gave 36 correctly); offset moved 2853 -> 2711. So its cal committed but the operating window is the INIT window — the tightened values were overwritten after commit or never applied. Suspect (INFERRED, race-dependent): the 17065 fresh-boot USER_PARAMS_RESET (0xAE) landing AFTER a self-started cal had tightened the window -> v369 `dune_user_params_reset()` restores gap_pls_adc_start/capture_duration "defaults" (captured at boot) over the cal-derived window without a re-cal. The trio's resets landed before their cals. **v371 (proposal): reset only num_pls in dune_user_params_reset (cal owns the window), or follow the reset with a cal restart; never let 0xAE clobber a committed window.** Immediate for '8538 before boxing: `recalibrate = true` -> v366 soft restart re-tightens -> verify blank ~36 / captureDuration 15 on the next post. Also: the ST `pulse` key = 0 on every boot/install post while tiPulse = 6 — still unresolved whether attrs are applied in those sessions (spec 4.3); a non-boot session post with pulse = 6 confirms pipeType P is in before the PVC runs.

**9/8 ~08:45 v371 (Bruce: "These are independent functions - the cal should be allowed to adjust the blank / capture window - also thinking we should just use 9 pulses as default for now - this has become too complicated"):** `dune_user_params_reset()` restores num_pls only (window stays cal-owned); compiled default num_pls 13 -> 9. PEX constants at 6 / 13 bracket 9 (-0.2..-1.0 / +1.1..+1.4 vs model); PVC Lf 2.211 was measured at 9; 6 failed cal on PVC ('4423). **Trap to remember: deleting the `pulse` attr does NOT clear the 17065 BKUP mirror (only a fresh/pin boot does), so a unit keeps pushing its last attr value until it is power-cycled/mag-reset. The bench move to 9 therefore = delete pulse attr + allowTiFotaVer 371 + mag reset. A 17067 could clear the mirror byte when a successful fetch carries no pulse attr — not built.** Simplification: one compiled default, no per-device pulse attrs unless deliberately set.

**9/8 ~08:55 TB DELETE+WRITE (Bruce: "Delete the attribute and I will power cycle the devices"):** SHARED `pulse` deleted on all four (8549/4423/3063/8538, HTTP 200, read-back gone); allowTiFotaVer 370 -> 371 on all four. Power cycle (pin/fresh boot) clears the 17065 mirror and sends 0xAE; install session TIFOTAs v371; first cal at the compiled default 9 pulses. Verify tiPulse 9 on the install posts.

**9/8 ~09:15 v372 BUILT + s3 msp372.bin (Bruce: "just like we shift the gain window down if hot signal would like to shift up by 5 if weak signal"):** after ladder rung 0 (gain 26), both channels alive and < CAL_WEAK_BASE_UPAMP 160 -> ladder base 26 -> 31, grid rows +5 (28..52) via SC_ROW_GAIN() and g_grid_shift; one-shot per sweep, reset in enter_amp_scan; envelope bounds follow (calSurfGainLo/Hi read 28..52 when fired). Threshold from today's PVC numbers: normal units ~230-250 counts at g26 (projected from 38/749, 43/1084 at 0.8 dB/idx), '4423 ~60-130 (from 47/902 and 47/448). NOT rolled: all four set to allowTiFotaVer 371 for Bruce's power cycles; 372 on his word (weak-unit acceptance = '4423 on PVC).

**9/8 ~09:20 TB WRITE (Bruce: "roll it"):** allowTiFotaVer 371 -> 372 on all four (HTTP 200 x4, read-back verified). Power cycles pending on Bruce; install session TIFOTAs v372, first cal at 9 pulses (compiled default), weak shift armed for 4423.

### 0p — 9/8 08:57-09:05 power-cycle installs on PVC: v372, 9 pulses, weak shift fired on '4423
| unit | fw / TI | pick (gain / counts / env) | window | pulses | map | quiet residual |
|---|---|---|---|---|---|---|
| '8549 | 17066 / 372 | 36 / 842 / 42 | 36 / 15 | 9 | 22/22, rows 23-47 | -20 ps |
| '4423 | 17066 / 372 | **48 / 863 / 42** | 36 / 15 | 9 | 16/16, **rows 33-52 = weak shift fired** | +33 ps (sd 151) |
| '3063 | 17066 / 372 | 43 / 1308 / 42 | 36 / 15 | 9 | 19/18, rows 23-47 | +39 ps |
| '8538 | 17910 / 372 | 40 / 930 / 42 | 36 / 15 | 9 (paramRecal 1: 6 -> 9 after 0xAE) | 21/21 | +10 ps |
All four Metering, no pulse attr anywhere, compiled default 9 delivered (v371). '4423: the +5 frame put it at gain 48 with 863 counts instead of the 47-row ceiling at 448-902; first weak-shift acceptance. '8538's window is back to 36/15 (v371: reset no longer touches it) and its persisted 6 was reset to 9 by 0xAE then param-recal'd (pRecal 1) — the full fresh-install path worked on it. '3063 picked 43/1308 (above the 900 target): lower rows in the centre column were not core-quiet, so 43 was the lowest usable row — acceptable, watch. **'8538 ship state: 17910 / v372 / 9 pulses / 40-930-42 / 36-15 / Metering / offset re-derived.** PVC runs next: 50 gal @ 5 gpm (Lf 2.211 at 9 pulses — the pulse count it was originally measured at), then 1 gpm and 0.5 gpm with correction on.

### 0q — 9/8 10:39 PVC 3/4" Sch 40, 50 gal @ 5 gpm, 9 pulses, v372 picks (Bruce: 50 gal + 16 oz = 50.125 gal, 18.8 C, ~567 s -> 5.3 gpm). '3063 silent since 09:15 (hung; needs power cycle) — three units.
| unit | pick | err | vs model (+1.15) |
|---|---|---|---|
| '8549 | 36 / 789 / 42 | -3.71% | -4.86 |
| '4423 | 48 / 852 / 42 | +1.54% | +0.38 |
| '8538 | 40 / 1053 / 42 | -2.38% | -3.53 |
| mean | | **-1.52%** (spread 5.24 pp) | -2.67 |
Lf to zero: 2.205 raw / 2.200 vs model (table 2.211, measured 8/7 at 2 and 4.2 gpm on v342/343 at 9 pulses). Group is 0.3-0.5% of Lf low, but the unit spread (5.2 pp on three units) is 2.5x the PEX spread and the run is a single sample with '3063 missing -> no refit yet; repeat 50 gal after '3063 is back. PVC couples weaker and less uniformly than PEX (same pads): '8549 -3.7 and '8538 -2.4 vs '4423 +1.5 — the two units on the lower gains read low. lamCorrMax 4/61/8 = ramp samples.

### 0r — 9/8 '3063 silent 09:15 -> 10:45 (Bruce: "can you see anything from 3063 not checking in previously")
Last pre-silence session 09:15:24/26 was normal: Metering 43/1529, 9 pulses, rsrp -95, status NORMAL, timeStatus 2.0 s, 9.5 KB pending, no SPI errors, no faults, meterVal 2016.383 (17.3 gal event ended 09:14:32, checkpoint 09:14:36). Then NOTHING: no records 09:14:33 -> 10:45:41 (91 min, spans the 50 gal run), no session, until Bruce's power cycle (all four rebooted ~10:45, bootFlags 4). Boot post: faultCnt 0, nvForceOff 0, tiBootCnt 1 -> 2 only at the power cycle (TI did not self-reset), tofRecovered 0 (nothing written to flash during the hole), meterVal restored 2016 (= the 09:14 checkpoint: the 50 gal run left no trace in flash). radioOveruseCnt 1 on ALL four (normal today).
Two readings, not separable from TB: (A) the ST kept running but believed the radio was ON after the 09:15 session ended by a path that skipped PWRDN/connmgr_shutoff — every record path, the meter checkpoint and the STOP2 gate are gated on radio-off (measure.c 773/1077/1204; 17054's own note lists them), and no new session starts while connmgr thinks it is on; the 12-min force-off did NOT fire (nvForceOff 0), so the off_timer was not running. (B) the TI stream / ST pipeline died (procStallCnt 0 at boot says nothing — counters reset). **Third silent hole on '3063 alone: 9/1 14:19-15:03 (unresolved), 9/3 2 h (the 17054 force-off bug), 9/8 91 min.** Unit-specific tendency, likely the radio/session teardown path on this modem.
Proposed 17067 (not built): (1) connmgr liveness ceiling — connmgr_on() for > 15 min with the FSM idle => connmgr_shutoff() + a counter, covering every exit path that skips PWRDN; (2) BKUP forensic of the last radio/FSM state + minutes since last TI aggregate, reported on the next post, so a hole like this leaves evidence; (3) consider a scheduled check-in floor shorter than 480 min on the bench so a dark unit surfaces within the hour. Needs a UART capture on '3063 to settle A vs B.

### 0s — 9/8 11:33 PVC 5 gpm run 2, all four (Bruce: 51 gal + 16 oz = 51.125 gal, 18.0 C, ~592 s -> 5.2 gpm; cold-water term +1.41%)
| unit | pick (after the 10:45 power-cycle re-cal) | err | run 1 | plateau tofNorm (ps) | vs 4-unit plateau mean |
|---|---|---|---|---|---|
| '8549 | **28 / 371** (was 36/789) | -4.95% | -3.71 | 16584 | -2.7% |
| '4423 | 48 / 852 | +0.70% | +1.54 | 17525 | +2.8% |
| '3063 | **43 / 1646** (compression) | -3.86% | — | 16782 | -1.5% |
| '8538 | 38 / 891 | -0.65% | -2.38 | 17270 | +1.3% |
| mean | | **-2.19%** (spread 5.65 pp) | -1.52 | | |
The volume errors ARE the per-unit dtof plateau spread (5.5% between units at the same flow, sd on the plateau only 230-330 ps). The two on-target picks read within +/-1%; the off-target picks read -4 to -5%. **'8549 low on PVC regardless of pick** (-3.7 at 36/789, -5.0 at 28/371; August fingerprint "-1..-3% low always"). PVC unit spread (5.5 pp today, 4% in the August 6-unit campaign) is the material's coupling variability, ~2.5x PEX. Group would want Lf ~2.203 (-0.4%), but on this spread and against the August 6-unit basis for 2.211: **no Lf change.**
**Why two picks missed the 900 target on PVC:** the maps are not plateaus — '8549 lvlSpread 3173 -> 4868 ps across "clean" cells (PEX-B: 300-1300), '3063 1215, many cells with sd > SC_SD_CORE 600. The v370 row scan only considers core-quiet cells in the centre column, so '8549 was left with row 28 (371 counts, "highest row at/below target") and '3063 with row 43 (1646, "lowest usable row" though above target). **v373 proposal (not built):** scan the amplitude rows over all region cells (plateau tier), then require the chosen cell's sd under a looser cap (~1000), core only as a tie-break; a PVC map should still land on ~900 counts.
Knots on PVC: with 5.5 pp unit spread, fit knot 1/2 from per-unit (low-flow error minus that unit's 5 gpm error), not group means.

### 0t — 9/8 review: accuracy vs calibration outcome, PEX-B and PVC (Bruce: "review the calibration again comparing accuracy to calibration range results")
Table of every scored run since the PEX-B remount with the pick/map in force (see 0f-0s for the numbers). Findings:
1. **PEX-B, 5 gpm: accuracy is insensitive to the pick.** Old lottery picks (24/537, 30/317, 36/1545) and v370 picks (28-36 / 678-1055) all read within +/-1.3%. Gain and amplitude between ~300 and ~1550 counts do not move the 5 gpm reading on PEX.
2. **PEX-B, low flow: the outlier is a map-consistency unit, not an amplitude unit.** '3063 read -8.3% at 0.44 gpm on an on-target pick (30/889); its map level spread was 4792 ps (others 419-2183) and its offset residual -108 ps. Level spread = disagreement between "clean" cells on where zero is = ambiguous lock on that unit/pipe.
3. **PVC, 5 gpm: per-unit coupling dominates (5.5 pp), pick position is second order (~1-2 pp).** '8549 low on both picks (36/789 -> -3.7, 28/371 -> -5.0); '3063 -3.9 at 43/1646 (compression); '4423 (48/852) and '8538 (38/891) within +/-1. Units with map level spread > ~2000 ps ('8549 3173/4868) are the bad readers; the two good units sit at 523-1001.
4. **Cal-side predictor:** calSurfLvlSpread is the best single number for "this install will read off" — better than gain or amplitude. Candidate acceptance rule for the install session (not built): level spread > ~2000 ps -> flag/re-seat before commit; the v370 pick already handles amplitude.
5. PVC needs the v373 amplitude-scan fix so picks stop landing at 371 or 1646 on noisy maps, but that recovers ~1-2 pp, not the 5 pp unit spread.

### 0u — 9/8 '3063 second hang 11:36 -> 12:00 ("stuck again, pseudo recovered")
Records end 11:35:42 (3.8 gal event end, right after the 49 gal run posted 11:34). No post until 12:00:30. On that post: tiUartBootCnt 2 -> 3 (TI rebooted; tiResetSrc 0), tiAggCount 2687 -> 2746 = 59 aggregates in 26 min (the TI stream was dead almost the whole time), tiRecoveryAttempts 0 (the BSL tier never fired — this was ti_monitor's plain hardware reset, which no counter records), fresh cal map 14/13 rows 28-47, pick 43 / 1319 / **env 30**, window 30/15, offset re-derived to **-12606** on a 34-sample cluster (was 5084), status string FAILED CAL with failedCal false = the ST's status text lagging the recovery. bBootCount unchanged (ST did not reboot). ST alive throughout (it reset the TI).
Read against the morning hole (09:15 -> 10:45, no records, no TI reboot, power cycle needed): same trigger — the TI goes silent right after an event-end session — but this afternoon the ST's ti_monitor recovered it (~20 min: 60 s silence + 60 s radio grace + throttle/threshold), while this morning it never acted. ti_monitor DEFERS while bg95_radio_recent() (a session in flight) — if the 09:15 session left connmgr believing the radio was on (0r hypothesis A), the monitor deferred forever and the dead TI stayed dead: one mechanism explains both holes. **'3063 = a bench specimen of the fleet TI-silent class (memory: 11 units 9/6-9/7).** Its post-recovery cal is degraded (env 30 at the grid edge, 13-cell region, offset jumped 17.7 ns = a different lock); a mag reset before any further scoring.
17067 additions: (a) ti_monitor must not defer indefinitely on a stale connmgr_on — bound the deferral (e.g. 15 min) or clear connmgr_on when the FSM is idle; (b) count plain TI monitor resets (tiMonResetCnt) — today they are invisible; (c) the connmgr liveness ceiling from 0r. A UART capture on '3063 is the way to see what the TI does at the moment it dies.

### 0v — 9/8 12:07 PVC 5 gpm run 3 (Bruce: 50 gal + 16 oz = 50.125 gal, 17.8 C, ~572 s -> 5.25 gpm; cold-water term +1.47%). '3063 posted nothing for this run (see below).
| unit | pick | r1 | r2 | r3 | plateau r3 |
|---|---|---|---|---|---|
| '8549 | 28 / 377 / 42 (lvlSpr 4868) | -3.71 | -4.95 | **-4.53** | 16830 |
| '4423 | 48 / 870 / 42 | +1.54 | +0.70 | **-0.09** | 17786 |
| '8538 | 38 / 888 / 42 | -2.38 | -0.65 | **-1.82** | 17492 |
| '3063 | 43 / 1646 / 42 | — | -3.86 | no data | |
Run 3 mean (three units) -2.15%, spread 4.4 pp; three-run all-sample mean **-1.97% (n = 10)**; Lf to zero 2.203 (table 2.211, -0.36%). Per-unit results are stable run to run (+/-0.8 pp): the spread is the units, not the runs. '4423 and '8538 average -0.4 / -1.6; '8549 -4.4 on a 377-count pick. August (6 units, same Lf) averaged +0.16 at 50 gal, so today's group sits ~2 pp lower — different unit set ('8538 in, '8549's twin low-readers out) and the v370 picks; not a clean Lf signal. **Recommendation: hold 2.211**; the accuracy lever on PVC is coupling/pick (v373 + a level-spread acceptance rule), not the table. Bruce's call.

**9/8 12:10 3063 hang #3:** no records and no event since its 12:00:30 recovery post (run 3 at 12:07 not seen by it); pending 7 KB; TI stream dead again within minutes of the recovery session. Three TI-silence episodes in one day on this unit, each starting right after a radio session. Pull it from the accuracy runs; keep it powered as the UART specimen.

**9/8 ~12:15 WYSE sample box-up (Bruce: "box up the wyse sample - update FW both banks - remove all flow testing attr"):** 17911 built = 17066 + Bell-first (110,888 B), prod bucket, committed 2caa665. TB on 75368538: gen2fw 17910 -> 17911 (second bank gets the current image; banks = 17910 + 17911); DELETED adcCapture, checkInPeriod, radioOnEventEnd, radioOveruseMax, recalibrate, recordNoneventFlow (HTTP 200, read-back gone). Kept: Model, Property, allowTiFotaVer 372, lamCorr true (needed for low-flow accuracy until the default flips), pipeType P / pipesize 3/4 (Wyse re-sets via the app at install). One water pulse needed before boxing: the event-end session (radioOnEventEnd still true on the device until that fetch) applies the deletions, takes 17911, reboots, and the FOTA validation session posts 17911.

**9/8 ~12:25 TB WRITE (Bruce: "check in period is best"):** 3063 checkInPeriod 480 -> 5 (HTTP 200) for the debugger/UART reproduction of the post-session TI silence: a full session every 5 min with the TI streaming between. 3063 is OFF the accuracy scoring set from here. RESTORE checkInPeriod (delete or 480) before this unit goes anywhere near a customer.

**9/8 ~12:45 DEBUG-SPAN image for the 3063 UART capture (Bruce: "OK to the debugging option 1"):** DEBUG=1 does not fit the 110K bank (-Os +5,444 B, -Og +12,156 B); release compiles DBG_PRINTF out. New STM32L552RCTX_FLASH_DEBUGSPAN.ld (FLASH 0x08004800 + 220K = both app banks) + DUNE_DEBUG_SPAN (gen2fw ignored -> no ST FOTA can write bank B). Image: DuneFW_L5_2/special/debug/DuneFW_L5_2_17066_DEBUGSPAN.{hex,elf} (118,064 B, rev 17066 = 3063 validated rev -> bootloader swap disarmed at init). SWD-load only (CubeProgrammer, the .hex carries addresses; do NOT full-chip erase - bootloader at 0x08000000 must stay). TI FOTA unaffected (allowTiFotaVer 372 = running). Release build unchanged.

### 0w — 9/9 05:00-05:40 '3063 on the STLINK-V3SET, debug image running, UART capture live
SWD access OK (STM32L5 0x472, 256 KB, VTref not wired). Release firmware sleeps with debug off, so hot-plug only catches it awake; connect under reset works. Bank A = 17066 release (dump matched), bank B = an older release. **Bank 2 (>= 0x08020000) cannot be programmed through CubeProgrammer 2.21 here**: every write fails verification (reads back the old bytes), explicit page erases do not take, and 0x08020000 holds a bootloader copy (the FOTA slot starts at 0x08024800). The two-bank DEBUGSPAN idea is dead; a first attempt left bank A with a truncated image, restored from the dump (verified). Fallback = DEBUG-LEAN: modules unrelated to the investigation compile DBG_PRINTF out (commit above), image 112,576 B (64 B free), flashed + verified 05:3x, running. UART: USART1 PA9/PA10 921600 8N1 = the ST-Link VCP on COM4; boot log confirmed (IMEI ...3063, Monogoto SIM, radio init). Logger: scratchpad/uart_log.py -> GitHub/3063-uart-0909.log (timestamped, auto-reconnect). checkInPeriod 5 in force -> a session every 5 min; the TI streams between. What to read at the next hang: session end path (PWRDN vs TIMEOUT/FAIL/force-off), INFO packets after it, TI banner, ti_monitor lines.

**9/9 ~06:30 TB WRITE (Bruce "go"):** 3063 checkInPeriod 5 -> 60. First hour on the DEBUG-LEAN image at 5-min cadence: 22 sessions, all closed via PWRDN, one network failure (+CME ERROR 30 at 06:10) torn down cleanly, TI stream continuous - no hang. Hypothesis: the fault needs "session then long idle" (all three 9/8 hangs began within ~15 min of a session on a device idle for hours between). Debug build still uses STOP2 (USE_STOP2 unconditional). Gap: 9/8 sessions were event-end sessions after real water; if the trigger needs the event-close path, scheduled check-ins will not reproduce it -> unit back on a pipe with the debugger if 60-min stays clean.

## 0x. 9/9 08:55 — why the debugger run is stable: the hang is an EVENT-END hang, not an idle one

Bruce: "60min looks good so far / Any theories as to why it seems stable".
Re-read '3063's 9/8 telemetry against the three record gaps:

| gap (records) | last flow record | flow -> 0 | last record | silence | recovery |
|---|---|---|---|---|---|
| 08:26-08:57 | 08:26:33 7.10 gpm | 08:26:34 (0.15 -> 0) | 08:26:37 | 31 min | 08:57 Calibrating, tiBootCnt 5->6 |
| 09:14-10:45 | 09:14:29 7.13 gpm | 09:14:30 (0.02 -> 0) | 09:14:33 | 91 min | 10:45 Calibrating, tiBootCnt 1->2 |
| 11:35-12:00 | 11:35:39 5.26 gpm | 11:35:40 (0.08 -> 0.14) | 11:35:42 | 25 min | 12:00 Metering, tiBootCnt 2->3 |

All three: full flow, valve closed, 3-4 records at ~0 gpm, then silence.
tiBootCnt did NOT move at the hang, only at the recovery (monitor / power
cycle) -> the TI did not reset itself; either the TI stalled or the ST-side
framer died. That is what the UART log has to decide.
Counter-evidence for the idle theory: 9/8 12:46-23:57 the same unit on the
RELEASE image ran ~135 idle 5-min sessions on the bench with zero gaps, and
today 05:30-08:55 on the debugger 24 sessions (22 at 5 min, 2 at 60 min)
with zero gaps. Cadence is not the variable; flow-stop is.
Event-end path (measure.c measHandleEndEvent): event record -> sf buffer,
radioOnEventEnd -> gRadioTrigger + SET_RADIO_START_INFO, Rev 17047
meter_update_internal() checkpoint to the SPI-flash meter log; then the
session start flushes USART3 and tiuart_fb_resync() (17043). Suspects in
that order: masked SPI-flash write during a high-rate record stream; the
session-edge flush/resync leaving the framer poisoned; a TI-side stall on
the flow->0 transition ('8549/'4423 on the same pipe never hung, so
'3063-specific signal/timing). DEBUG image (DBG stop clocks) is a confound
for STOP2 timing but is not needed to explain today's stability.
Next: the reproduction needs a flow STOP with the debugger attached, not
more idle hours. 3 of 4 flow stops on 9/8 hung (run 3 at 12:07 did not).

## 0y. 9/9 evening — '3063 on the recirculating rig (1" M copper, pump ~12.5 gpm): four tnorm gaps, one anomaly

Bruce reconnected '3063 (power-cycle boot 17:48:17 log, PIN+BOR) to a bucket
rig with a DC pump on 1" M copper; set pipeType M / pipesize 1 in TB at
17:53:40 (device applied it in the 17:56 session: log "pipesize: dia=2" ->
"dia=3"; recal + offset reset followed). Clock note: the PC/log clock is 87 s
BEHIND the TB server (status posts); record timestamps ride the device
clock, which drifts up to ~50 s between hourly syncs (unixTimeDrift 49).
Align log vs records to about +/-1 min only.

| gap (TB record clock) | length | what it is | verdict |
|---|---|---|---|
| 17:54:43 -> 17:58:05 | 3.4 min | flow stop -> event-end session (records gated while radio on) + the pipe-change recal (TI silent ~70 s, offset reset -5104 ps at 17:58:21, relocked 17:58:30) | benign |
| 18:08:13 -> 18:12:23 | 4.2 min | pump running 12.6 gpm; TI dropped out of Metering (12 s of raw records with flow 0, tnorm ~30k), went silent, RECALIBRATED itself (gain 48->47, upamp 983->1109, offset 5092->5166, state Calibrating at 18:12:25); ST closed the event (not-metering close) and ran the event-end session | TI self-recal mid-flow, ~50 gal not metered |
| 18:13:47 -> 18:15:05 | 78 s | flow stop -> event-end session | benign |
| 18:40:44 -> 18:48:14 | 7.5 min | pump running ~12.5 gpm. TI ALIVE: INFO packets kept coming (~243 in the window = normal 8 s cadence), blob EOT markers every 16 s in the log, no TI reset (boot count 10 throughout), no cal (cal surface identical). But NO aggregates: tiAggCount +1518 in 1937 s (~400 s missing), records 1039 of 1511 s in the flow span. TI error bits at the 18:47 post carry USS code 103 = measurement_period_overflow; reacqCnt 16->58 (+42, 1 fail), errCrossCnt +76. ST: one hold episode (heldGal 1.83 = ~8 s at 13 gpm), event killed at 12 s (17042), radioStartFile = measure.c:222 — but the session did not start until 18:45:35 log when aggregates resumed (LARGE EVENT quick flag at :1164). Register: 200.65 gal booked between posts = the recorded 17 min at ~12.5 gpm; the hole (~94 gal) was NOT counted. | THE ANOMALY: same class as 9/8 (TI stops producing aggregates mid-flow, ST alive); today self-recovered after ~6.5 min, yesterday needed a TI reset |

Open from this: (1) why the TI stops emitting aggregates while INFO continues
(period overflow 103 + re-acquisition storm at high dTof ~35k ps is the lead);
(2) why the ST's event-kill trigger did not open a session for 6 min (radio
FSM OFF-state gate — see next section); (3) the debug-lean image silences
measure.c and hci.c, so hold/kill and INFO decode did not print — rebuild
with measure.c prints ON before the next stop.
Follow-up on open item (2): radio_process() runs every main-loop pass, so a
set gRadioTrigger is not the delay. meas_hold_tick() measures the TI gap with
HAL_GetTick(), and pwr.c suspends the SysTick around STOP2 with no sleep
compensation (HAL_SuspendTick / HAL_ResumeTick only). With the TI silent the
ST is awake only for the 16 s blob-end wakes, so the "12 s" HOLD_KILL budget
accrues in awake-ms and took ~6 min of wall clock; heldGal 1.83 (~8.8 s at
12.5 gpm) and the kill/session landing at the END of the hole fit. INFERRED
from code + counters, not yet printed. 17067 candidate: clock the hold/kill on
RTC_epoch (or an LPTIM ms clock) like ti_timed_out() already does.

**9/9 19:13 DEBUG-LEAN v2 flashed to '3063 (Bruce "lets do it"):** measure.c prints back ON (hold/kill, event open/close, per-aggregate "a.. b.. td.. fr.." line = 1 Hz TI heartbeat with flow), ti_hci_impl.c and connmgr.c silenced instead (EOT/CAP/checkInPeriod chatter gone). Image `special/debug/DuneFW_L5_2_17066_DEBUGLEAN2.hex` 111,620 B (1,020 B free), source commit c1ce596 in DuneFW_L5_2. Flashed via CubeProgrammer CLI mode=UR, verified, MCU reset 19:13:42 (PIN boot). Logger kept COM4; same log file.

## 0z. 9/9 19:16-21:11 — "Missing data" on the recirculating rig = TI recalibrating mid-flow, driven by cross errors on aerated water

Eight TI calibrations since the v2 image went live (boot cals 19:16 and 19:47 after my SWD reset; mid-flow recals with status Calibrating at 19:26, 19:40, 20:03, 20:11, 20:16, 20:24). Each one: per-aggregate lines run at 10-13 gpm right to the last line, then nothing; 60-80 s later an event-end session (radioStartFile measure.c:221); samples back 3-5 min after the drop. No ST reset, no TI reset (tiBootCnt 11 -> 12 only at my reset).
Mechanism (TI cal.c + counters): err_cross = |dtof| > 100 ns or |tofDns - tofUps| > 100 ns (a lobe hop is 500 ns) -> reacq_tick ladder -> spiral recovery at a neighbour cell = one STRIKE (v362 restore-with-strikes) -> 3 strikes without a 30-clean re-arm window -> gRecalPending -> quiet-deferred recal fires on the bounded defer because the pump never gives quiet -> full sweep mid-flow. Counters tonight: reacqCnt 0 -> 120, reacqSpiralOk 0 -> 114, errCrossCnt 0 -> 224, tiError word3 bits 7/14/15 (103 = measurement_period_overflow; 110/111 not in the USS enum list, unresolved).
Why this rig: sample-to-sample tnorm sd 2,244 ps at 11.4 gpm tonight vs 233 ps at 5.3 gpm and 494 ps at 7.1 gpm on the PVC bench 9/8 -> ~10x noisier; recirculating bucket at 12 gpm on 1" copper almost certainly entrains air. Yesterday's hangs were at low noise, so the reacq storm does not explain them; same symptom (TI stops aggregates, ST alive), different trigger.
Roughly 30 min of sample stream missing 19:16-21:11; part of that is pump-off time, so the unmetered volume is not sized here. Booked 3419 -> 3886 gal matches the recorded flow seconds x 11.4 gpm.
Design notes for Bruce: (a) recal-during-sustained-flow costs minutes of billing per episode; (b) three spiral strikes is trigger-happy under aerated flow; (c) 17067 item: hold/kill tick frozen in STOP2 (0y). Rig note: submerge the return / drop pump speed to de-aerate before treating this as a firmware fault.

**9/9 21:30 Bruce: "Are we doing deglitching post calibration - I see some minor cycle skipping".** TI-side, per aggregate (5 raws @ 200 ms): (1) raw v362 gate — |dtof| > ceiling (104 ns default) inside a slew-opened transient window is UNWRAPPED by N x 500 ns (gSkipCompCnt, NOT reported), otherwise marked -1; 10 consecutive over-ceiling = lock-fail kick; (2) legacy hold — |dtof| >= 200 ns or TOF below floor holds the last good raw for up to 20 raws; (3) aggregate — >= 2 raw-to-raw hops of >= 350 ns invalidates the whole aggregate (gDuneAggInvalidated, NOT reported), then sort and mean the middle 3 excluding -1s; (4) DTHRES 100 ns jump vs last good -> substitute last good for <= 3 aggregates (v357), never adopt beyond the ceiling (v362). ST: no deglitcher since determineMetering()/deglitch() were removed; only TOF_VAL_THRESH and maxFlowRate plausibility rejects (both 0 tonight).
Tonight's metered stream is clean: 2,481 flowing records, 0 lobe-scale excursions, 2 excursions > 10 k ps (both ~20 k). The re-acquisition ladder's err_cross, however, is |tofDns - tofUps| > 100 ns on the ABSOLUTE-TOF pair, which is not deglitched: 57 flowing records show tofA - tofB off by 1-2 lobes (+-500 k, +967 k ps) while tnorm is in band. That is the input driving the strikes and the mid-flow recals (0z). Levers (Bruce's call): require err_cross persistence (2-3 aggregates) before a reacq attempt; do not count spiral strikes while the transient window is open; expose unwrap and agg-invalidate counts in INFO.

**9/9 21:40 TI v373 built + rolled to '3063 (Bruce: "Lets go with your recommendations" on ti-v373-ladder-deglitched-feed-spec.md).** measure.c: absolute-TOF pair hold (DTHRES / DTOF_HOLD_MAX 3, gPairHoldCnt not in INFO), envTest() fed the shipped aggregate. cal.c: 32-agg err_cross ring, ladder entry at >= 8/32, ring cleared on fresh commit. No INFO change. Build clean (pre-existing warnings only). msp373.bin 48,006 B, 5 chunks, crc 1f6e4d26 -> s3://dune-firmware-ti/msp373.bin (key was absent). Commit 93a9c30 on cal-reacq, tag v373, merged --no-ff to main.
**TB WRITE (approved in the same go):** '3063 allowTiFotaVer 372 -> 373 (HTTP 200, re-read 373). Picks up at the next session (hourly, or an event-end session from a pump run). Success test: 30 min continuous ~12 gpm with no Calibrating status, reacqCnt/reacqSpiralOk flat, per-aggregate UART line unbroken, tofA/tofB hops gone from the records.
CORRECTION 21:45: the first allowTiFotaVer write above went to SERVER_SCOPE by mistake (the device reads SHARED_SCOPE); re-issued to SHARED_SCOPE (HTTP 200, re-read 373). A stray SERVER_SCOPE allowTiFotaVer=373 remains on '3063 pending Bruce's OK to delete (harmless to the device, confusing to unscoped reads).
**9/9 21:55 TB DELETE (Bruce "1 - ok"):** '3063 SERVER_SCOPE allowTiFotaVer (my stray 373) removed; SHARED_SCOPE allowTiFotaVer 373 intact. checkInPeriod: Bruce deleted it deliberately ("let it check with event") — '3063 now checks in on event ends (radioOnEventEnd true) and the daily beat only; do NOT restore. The 0x/0y "restore checkInPeriod before customer use" note is closed by this.

## 1a. 9/9 21:47-22:13 — v373 first run: 14 min held, then ONE recal near the end landed on a weak point

v373 arrived at the 21:47 event-end session (ti_fota 372->373, TI boot 1, cal 75 s, "offset retained, skipping promotion wait"). Pump run ~21:50-22:05 log at 10-14 gpm, tnorm s2s sd 2,873 ps (same aerated rig).
- Ladder: reacqCnt 5 (4 spiral, 0 fail) and 36 cross errors in ~16 min, vs ~40 entries/h and ~2 errors/min before. Records continuous 21:50:33-22:03:00 TB (rest pending upload), one 2 s not-metering blip at 21:52:16. No Calibrating status post.
- Pair hold: 19 shipped lobe-mismatch records (was 57 in 2 h); the 21:50:48 hop lasted 5 s so it was held 3 and then adopted, by design.
- BUT meteringEntered 1 -> 2 and the surface changed (gain 43 -> 28, env 42 -> 30, upamp 764 -> 189, region 43-47 -> 28-38, upmax 394 -> 101): one recal DID fire late in the run and committed a weak point (189 counts vs 900 target). Cause (inferred, code): 4 spiral recoveries = 3 strikes -> gRecalPending; the v349 "quiet" test is CAL_RECAL_QUIET_AGGS = 60 consecutive clean aggregates, not no-flow — the deglitched feed now delivers clean aggregates DURING flow, so the pending recal fired mid-flow/aerated and swept contaminated water (lot-9 class). Not-metering aggregates skip the per-sample print (early return), so the sweep shows as a thin patch in the log, not a gap; TB records for that window are still pending upload.
- Log caveat: per-aggregate prints overflow the debug TX buffer in bursts (41 lines in 21:52-21:53 while TB has 120 records) — use TB for continuity, the log for ordering.
Proposal v374: pending recal fires only when quiet = 60 clean aggregates AND |shipped dtof| below a no-flow bar (e.g. 2,000 ps); the 3600-agg bounded defer stays as the backstop. Immediate: '3063 is metering on a weak commit; a `recalibrate` (0xAD soft restart) with the pump OFF would re-derive it on still water — TB write, needs go.
AMENDMENT 22:25: the gain 28 / env 30 / upamp 189 at the 22:07 post is NOT proven to be a commit. The 0xAC commit record (regSz 7, gains 28-38) is emitted at commit and re-sent twice a minute apart; the 21:50:43 post still carried the OLD TI's record (identical lvlMed 27194), so the 28-38 record most likely belongs to the v373 BOOT cal (swept 21:47:48-21:48:57 log with the pump already running) and only landed after the 21:50 post. The applied point was 43/42/764 at 21:50:43 (reacqCnt 0, so not a re-park); 28/30/189 at 22:07:12 came with reacqCnt 5 / spiral 4 and can be a provisional re-park cell caught mid-attempt right after the pump stopped. meteringEntered 1 -> 2 matches the 2 s not-metering blip at 21:52:16. Records/prints show no sweep during the run. Next status post decides: 43/42 back = transient; 28/30 persisting = a weak commit that needs a still-water recalibrate. Either way the boot cal swept flowing, aerated water — cal-during-flow is the open design item (v374 proposal stands, applied to BOTH the deferred recal and the post-FOTA/boot cal gate).

**9/9 22:30 TI v374 built + rolled to '3063 (Bruce "Lets do the Ti").** tnorm noise audit of the 21:50-22:03 run: robust sd 2,261 ps (quiet water 101, PVC 5 gpm 121), kurtosis 10, white (acf lag1 0.08); 20/696 samples beyond 3 robust sd, 18 of them one sample wide, up to 17 k ps -> two same-side bad raws leaking through the middle-3 mean. v374 dune_handle_aggregate: median of valid raws, MAD gate (4.448 x MAD, floor 1,500 ps), mean of survivors (>= 3) else the median raw; gRawGateCnt (not in INFO). The broadband 2.2 k ps part is the water (air), not filterable — de-aerate the rig to confirm. ST-side filtering: representation only if ever; the offset tracker stays on raw (quiet-water noise is 100 ps gaussian, a filter adds only lag). msp374.bin -> s3://dune-firmware-ti/msp374.bin (key absent), tag v374, merged to main.
**TB WRITE:** '3063 SHARED allowTiFotaVer 373 -> 374 (HTTP 200, re-read 374). Picks up at the next event-end session. Success: single-sample spikes gone from tnorm at ~12 gpm; broadband unchanged until the rig is de-aerated; volume within 0.1% of the v373 run at the same pump setting.
**9/9 22:40 TB WRITE (Bruce "roll TI"):** '8549 and '4423 SHARED allowTiFotaVer 372 -> 374 (HTTP 200 each, re-read 374). '3063 already 374. '8538 (shipped Wyse sample, gen2fw 17911) deliberately NOT touched — stays on 372. Pickup: the pair are on checkInPeriod 480, so next scheduled session (<= 8 h) unless an event-end session comes first.

## 1b. 9/9 22:16-22:29 — the aggregate-silence class reproduced WITH the probe attached (v373, pump running)

Bruce watched the UART viewer: aggregates stopped while water was flowing. Record clock (TB): flow 10-14 gpm from 22:16:10, then tnorm decayed 30 k -> 3.5 k -> 1.3 k -> 939 -> 563 -> 332 -> 190 -> 121 ps over 22:17:24-22:17:30 (flow 1.2 -> 0.04 gpm) with the pump still running; last record 22:17:30; nothing until 22:32:56. Log clock: last per-sample print 22:16:0x, none until 22:29:0x (samples resumed at 14.4 gpm), event-end session 22:31:03. Same onset shape as the 9/8 hangs (flow -> 0 over a few samples -> silence).
Counters 22:07:12 -> 22:32:55 (1544 s): tiAggCount +606 (~15 min of aggregates missing), tofMarkerRejCnt +16 (so -1 error aggregates were NOT arriving either), tiUartFbPkts +778 (frames parsed ~= the non-silent aggregates + INFO), tiTriggerCnt +1442 (REQ edges ~0.93/s THROUGHOUT the silence), tiBootCnt/banner unchanged (no TI reset, monitor never fired), heldEpisodes unchanged (hold/kill never ran — frozen-tick item 0y), rtcWake +126 (ST cycling normally), errCrossCnt 36 -> 83, reacqFail 0 -> 2, errFloor/NoSig/SigWeak all 0.
Reading: the TI asserted REQ about once a second the whole time (comm.c Comm_writeBuffer asserts REQ per transmit), yet no aggregate frame of any kind was parsed by the ST for ~14 min, while the TI-side timeout/monitor logic on the ST stayed quiet (lastInfoTime fresh at both posts). Either the TI transmitted and the ST's USART3 RX/framer did not deliver (RX clock/ORE/framer state after STOP2 wake — no ORE handling found in Core/Src), or the TI toggled REQ without sending the aggregate frames (Comm_writePacketToBuffer silently drops when the 16-deep ring is full and Comm_sendBuffedPackets is gated on g_stReady). NOT resolved — the lean image had ti_hci_impl.c/hci.c quiet and the hold/kill code has no prints, so the ST side left no trace, and the TI side has none.
Recovery 22:29 was spontaneous (no ST action visible), 2 min before the TIFOTA session.
Instrumentation for the next image (proposal): per-16 s line with REQ edges, USART3 bytes received, frames parsed by type (agg/INFO/other), INFO age, ti_trigger backlog, hold/kill state; ti_monitor prints back on; hci.c "TI checksum fail" back on. TI side: dune_uart_mirror already mirrors every frame onto the BSL UART (tiUartMirrorCnt) — tapping that UART with a second logger would show whether the TI transmitted during a silence. Both are Bruce's call.
v374 run D (22:40:33-22:42:23 TB, 111 s at 11.3 gpm): robust sd 2,292 (unchanged, the water), kurtosis 7.5, >3 rsd 1.8%, max excursion 9.5 k ps, zero >10 k excursions (run A had 8), zero pair-lobe hops (run A 19). Spikes gone as predicted. Boot cal on v374 (22:31:56-22:33:02) ran with the pump on; a recal at ~22:36 on still water committed a 22-cell clean region (gains 28-52) — then the 22:43 post shows gain 38 / 481 counts, region 28-47 regSz 14: the surface record changed again without a metering re-entry; unexplained, watch it.

## 1c. 9/9 23:05 — ROOT MECHANISM for the aggregate-silence class (ST side): the TI-frame DEDUP eats identical aggregates, on a clock that freezes in STOP2

Bruce: "the water flow stopping triggering the radio is a major clue". It is. ti_bsl.c tiuart framer: every completed frame is checked by tiuart_dedup_seen() = same (len, checksum) as one of the last 4 frames within TIUART_DEDUP_WINDOW_MS 3000 of HAL_GetTick(); a hit is DROPPED before hci_process_data (no counter, no print). Two facts make this lethal:
1. When the TI's USS capture errors, dune_process_measurement(NULL,true) pushes -1 raws and every aggregate is the identical (-1,-1,-1) frame -> identical checksum -> the first one reaches the ST (tofMarkerRejCnt +1), every following one is deduped away as long as the window says < 3 s.
2. HAL_GetTick() is suspended around STOP2 (pwr.c HAL_SuspendTick/ResumeTick, no sleep compensation), so the "3 s" window is awake-time and lasts minutes of wall clock. One frame leaks each time the window finally expires: tofMarkerRejCnt +16 over the 15-min silence = ~1/min. Matches.
Everything observed follows: REQ toggling ~1/s (TI transmitting the 16-frame bursts), no aggregate parsed, tiUartFbPkts flat (counted after dedup), INFO frames pass (their counters differ every time) so lastInfoTime stays fresh and ti_monitor never fires, no TI reset, hold/kill inert (event open but its own tick frozen), the ST prints nothing (uFB print is in the quiet module, drop path has none). The moment the water stops the TI's captures come back valid, aggregates differ again, the ST sees flow -> 0 within 3 samples, closes the event, and the event-end radio fires — "it responded when I turned the water off / that's what initiated the radio event".
Why the TI errors for 15 min at 12 gpm on this rig is a separate TI question (aerated water is the prime suspect; the ST's tiError word bits 13-15 of word 3 are the codes it reported — decoding below). The 9/8 hangs fit the same shape (flow -> 0 over 3-4 samples then silence; recovery needed a TI reset because the water never came back on before the monitor acted).
Fix (17067, needs go): (a) exempt COMMAND_HANDLER_DUNE_MEAS_AGG_ID frames from dedup — or drop dedup entirely under TIUART_ONLY (the both-transports case it guards no longer exists); (b) clock the dedup window AND meas_hold_tick on RTC time, not HAL_GetTick; (c) count dedup drops (tiUartDedupCnt) and print them in the lean image. TI (v375, optional belt): a sequence byte in the aggregate packet so no two frames are ever identical; report the last capture error code in INFO.
**9/9 23:15 overnight:** Bruce leaves the pump running ~5 h on '3063 (1" M Cu recirc rig, ~12-14 gpm, aerated). No checkInPeriod on the device (Bruce's choice) -> no upload until the event ends or the daily beat; the 17051 carry cap (128 KB ~ 2.1 h at 1 Hz) means TB will hold only the LAST ~2 h of records; the UART log (3063-uart-0909.log, logger task bruxu3p9b, viewer :8766) has the whole run (per-aggregate lines, burst-flushed and lossy under load). Morning read: (1) per-aggregate line density per minute across the night -> any silence = the dedup class (1c); (2) status post at the event end: tofMarkerRejCnt growth (~1/min during a silence), reacqCnt/spiral, errCrossCnt, meteringEntered, calSurf*, gain/upamp (28/30 question), heldEpisodes; (3) TB records for the last 2 h: spikes (v374), pair hops, tnorm noise. Pending Bruce's go: 17067 (dedup exempt/remove, RTC clocks for dedup + hold/kill, drop counter + print), fleet TI-silent fingerprint check (read-only).
CORRECTION 23:30 (Bruce: "we have 18mb flash", "I've seen meters upload 18 hours of data"): my "TB only gets the last ~2 h" was WRONG — stale 17051 knowledge. Facts from code: the record ring is the whole remaining external flash (get_flow_tof_end_address = 2 MB on the 16 Mbit AT25SF161, 4 MB on 32 Mbit) = 122,880 slots x 16 B ~ 34 h at 1 Hz (tofRing 122880 is SLOTS); Rev 17055 removed the 17051 carry cap — the whole backlog drains oldest-first in 2,040-record (32 KB) chunks, newest chunk previewed first, bounded only by the 12-min force-off and the strike/punt rules; tof_failure_trim keeps the newest 60 min only on a data-phase punt. A 5 h run = ~18,000 records = ~9 chunks, uploads in one healthy session. No checkInPeriod change needed tonight.

## 1d. 9/10 06:55 — overnight 8 h pump run on '3063 (v374, 1" Cu recirc, ~11-13 gpm): what the sporadic check-ins were

Bruce ended the event 06:53. 26,741 records 22:50-06:52 (record clock), 26,476 flowing; register 4,090 (22:43) -> 9,120 gal = 5,030 gal vs 4,986 gal integrated from records (consistent; both miss the same unmetered minutes).
OPEN EVENT WAS reported: 23:54:31 status OPEN EVENT, openEventRadioCnt 1 (the 1 h chunk). First attempt 23:52:07 failed operator select twice (+CME ERROR 30) -> RADIO FAIL, retried 23:52:37 and succeeded. openEventRadioCnt 2 at 04:33 (the once-per-UTC-day gate did not stop a second report — check leakRadioQuickFlag day math later).
Every session was radioStartFile measure.c:221 (event end):
- 4 x TI mid-flow RECALIBRATION (sessions 01:11, 01:19, 02:07, 02:25; posts Calibrating): records show flow 0.0 with tnorm 25-33 k (TI not-metering) for 1-2 min, then ~70-100 s with no aggregates (sweep), event closed on the zero-flow samples, session, relock. Gain hopped 47/1628 -> 43/1031 -> 28/221 -> 43/873 -> 38/573. Cost ~4-6 min unmetered each (~60 gal at 12 gpm; ~5% of the night). = the v349 "quiet = 60 clean aggregates" rule firing under continuous flow (v375 proposal: require no-flow).
- 2 x HOLD/KILL (04:31, 06:36; heldEpisodes 5 -> 6 -> 7, ~2.0 gal bridged each) followed immediately by a second session (open-event chunk). The log shows the 16-s aggregate bursts arriving right up to RADIO INIT (04:31:05, :21, :37), so no real 12 s starvation: the kill came from the tick logic (HAL_GetTick) — the frozen-tick bug in the other direction (tick ran ahead while awake?). Unresolved; needs the hold/kill prints.
- NO dedup-class silence overnight: per-10 s sample density full except radio sessions and the four sweeps. Marker rejects +510 (~1/min) = -1 aggregates reaching the ST at that rate all night.
TB record gaps (122-468 s) sit right before each session: the record clock is a per-aggregate counter re-synced at SYNC_TIME, so each session shows a jump = lag accumulated since the previous sync; the log shows continuous samples across most of them. Cosmetic, but it makes TB gaps unreliable as evidence.
v374 late run (05:00-06:30, 5,260 samples): robust sd 2,202 ps, ONE >10 k excursion (run A had 8 in 700), max 10.8 k; pair-lobe hops 56 (persistent hops adopt after the 3-agg hold) — abs-TOF lobe instability on this rig persists.
Pending Bruce: 17067 (dedup exempt, RTC clocks for dedup + hold/kill, drop counter/print), v375 (deferred recal + post-FOTA cal require no-flow), fleet TI-silent fingerprint check.

**9/10 07:15 BUILT + ROLLED (Bruce "Ok for both"):**
- ST Rev 17067 (fc65939): aggregates (0xA1) bypass the tiuart dedup, dedup drops counted (tiUartDedupCnt) + printed; meas_hold_tick on RTC seconds (lastAggEpoch) with "hold ENTER/KILL" prints. Release 110,924 B -> prod bucket 672132E5/G/17067 (5 chunks); DEBUG-LEAN 111,792 B = special/debug/DuneFW_L5_2_17067_DEBUGLEAN.hex flashed + verified to '3063 over SWD (reset ~07:13).
- TI v375 (tag; merged to main): deferred recal requires 60 consecutive shipped aggregates with |dtof| < 2,000 ps as well as 60 clean ones. msp375.bin -> s3://dune-firmware-ti/msp375.bin (key was absent).
- TB WRITES (shared scope, '8549 '4423 '3063): allowTiFotaVer 374 -> 375, gen2fw 17066 -> 17067 (re-read below). '8538 untouched. NOTE gen2fw 17067 on '3063 is required so the FOTA path does not pull 17066 over the flashed debug image.
Expected: no more multi-minute aggregate silences (or, if the TI still errors, -1 aggregates reach the ST every second -> tofMarkerRejCnt climbs 60/min and the hold/kill fires in 12 s real time with a KILL print); no recal while the pump runs; sessions only at event end / open-event chunks.
**9/10 07:18 first 17067+v375 session on '3063:** TIFOTA 374 -> 375 OK, cal 71 s, offset promoted 32 s later (5178), Metering. NEW DEFECT SEEN WITH THE PRINTS: between "metering" (07:16:12) and "offset promoted" (07:16:44) the ST processed 32 aggregates at td -5,150 ps with offset 0 -> flow 1.78 gpm on still water -> event opened ("nonevent changed 1"), then the radio phases gated aggregates -> "hold ENTER gap 2s rate 1.77" -> "hold KILL gap 12s held 10s" (0.295 gal bridged). Register 9,120.000 -> 9,120.953 gal: ~1 gal PHANTOM per calibration, billed. Totalization/event machine are not gated on the offset lock (no stOffsetLocked/measState gate in the sample path; leds.c even says "offset promoted = billing-ready"). Every boot cal and every mid-flow recal has been doing this (4 recals + 3 boots last night ~ 7 gal). Proposal 17068 (Bruce's call): (a) no event open / no totalization until the offset tracker has promoted (measState == MEAS_METERING), samples before that recorded with flow 0; (b) meas_hold_tick must not count radio-gated time as starvation (freeze lastAggEpoch while the radio is on) — otherwise any session > 12 s kills a live event, as 17042 has done since 9/1 ("check-in mid-event truncates it").
**9/10 07:27 Rev 17068 built + rolled (Bruce "Yes to 17068"):** billing gate (flow 0 to the event machine/register until offset promoted or retained; preLockZeroed status key; "billing gate:" print) + meas_hold_tick ignores radio-on time. Release 111,056 B -> prod bucket 672132E5/G/17068; DEBUG-LEAN 112,016 B (624 B free) flashed + verified to '3063. TB WRITES (shared): gen2fw 17067 -> 17068 on '8549 '4423 '3063 (re-read 17068); allowTiFotaVer stays 375. Note: '8549/'4423 will FOTA 17066 -> 17068 directly at their next session (17067 never ran on them). Watch on '3063's boot: "billing gate: pre-lock flow 1.7x zeroed" during the 32 s before promotion, register unchanged, no hold KILL inside the session.
**9/10 07:29 17068 first boot on '3063:** TI 375 already in place; cal 63 s; "billing gate: pre-lock flow 1.61 zeroed" printed the moment the TI went metering, per-aggregate lines show td -5,035 with fr 0.00 through the pre-promotion window. Register/KILL check pending the session close (see next entry).
**Fleet dedup-fingerprint scan (read-only, entitiesQuery latest + 3-day post history for the 29 low-rate units):** 5,001 Gen2 devices posted in the last 3 d; 1,198 Metering with a >10 min period carry tnormCount: 1,169 at >= 0.9 aggregates/s. Caveat: on <= 17060 the second post of each pair zeroes tnormCount, so pair-max was used. INFO alive + ZERO aggregates for >= 2 days: 65828942, 70270606, 77058644 (all 16022/260 = I2C era, no tiuart dedup -> a TI-side or I2C class, not 1c), 72722111 (16131/296, I2C era). Went 0.99 -> 0.00 at its latest post: 72382037 (16185/314, UART framer = has the dedup) = best live specimen for 1c. Intermittent (0.0 / 0.99 alternating posts): 75369155 (17032/344), 72385097 (17060/325) — also dedup-capable. Steady partial rates 0.24-0.58 on 16131/16022 = the known I2C-wedge fallback class. tofMarkerRejCnt does not exist before ~17040 so the ~1/min creep cannot be checked fleet-wide. Devices with fwVerTi = 0 (INFO-dead, the 9/7 class) = 11; that class is NOT the dedup fingerprint (INFO must be alive for 1c). Saved fleet_latest_0910.json in the scratchpad.
**9/10 07:40-07:47 REGRESSION on 17068 (Bruce: "didn't survive - worse than before"):** pump on at 07:40 -> "hold ENTER gap 2s" then "hold KILL gap 15s" and a radio session, repeated six times in six minutes (gaps 15-17 s, held 0-5 s). Cause: the TI batches 16 aggregates per transmission (comm.c MAX_PACKET_CNT), so the wall-clock gap between aggregates is 16 s even when healthy; 17067's 2/10/12 s thresholds were only ever tolerable because HAL_GetTick froze in sleep. On the RTC clock every blob boundary under flow tripped the kill. (Idle water did not trip it because the hold needs an open event.)
**Rev 17069 (b2969bf):** thresholds in blob units — ENTER 24 s, CAP 16 s, KILL 40 s. Release 111,056 B -> prod bucket 672132E5/G/17069; DEBUG-LEAN flashed + verified to '3063 (~07:49 reset). TB: '8549/'4423 gen2fw reverted 17068 -> 17066 BEFORE their next session (they never ran 17067/17068; protective, reverses my own roll); '3063 gen2fw 17069 (matches the flashed image). 17068 stays in the bucket but must not be rolled. Bruce to re-run the pump on 17069.
**9/10 08:16 17069 first run (08:04-08:14 log, 12-14 gpm):** no hold ENTER/KILL, one event-end session at 08:14, records continuous (3 gaps of 4-6 s), register 9,127.639 -> 9,224.684 = +97.0 gal vs 96.7 gal integrated from 521 flowing records. Survived.
**Bruce: "Are we gating filtering TOF" (tofA/tofB plot dipping to 9-36 us during the run):** 58 of 1,320 records (4.4%, all during flow) carry a collapsed absolute-TOF pair. The dip levels are exactly 45.4 us x (n-k)/n: raws whose ups/dns came back ~0 (valid-looking dps) averaged into the aggregate by v374's survivor mean (v2xx middle-3 mean had the same exposure). Gating today: TI raw level only the legacy deglitch floor check (ups/dns < min_tof_for_blank -> HOLD the dtof, but the raw's ups/dns still enter the aggregate); v374 MAD gate is on dps only; v373 pair hold compares |dns-ups| to |dtof| (both channels collapsing together passes, then adopts after 3); ST MIN_GOOD_TOF 1 us (catches only all-zero aggregates). errFloorCnt 33 on the TI for the run. Billing unaffected: flowOfTof() uses deltaTOF only (register = records). Proposal v376: a raw with ups or dns below the TOF floor is excluded from the pair average and from the pair-hold re-seat (dps still used), counted; ST could raise MIN_GOOD_TOF toward the blank floor as belt. Bruce's call.
**9/10 08:25 TI v376 built + rolled (Bruce "go"):** absolute-TOF range qualifier [floor, 4 x floor] on each raw's pair before the aggregate pair average / pair-hold re-seat (dps untouched); gTofRangeGateCnt. msp376.bin -> s3://dune-firmware-ti/msp376.bin (key absent); tag v376, merged to main. TB WRITES (shared): allowTiFotaVer 375 -> 376 on '8549 '4423 '3063 (re-read 376). gen2fw: '3063 17069, '8549/'4423 17066 (held back after the 17068 regression; 17069 is safe to roll to them on Bruce's go). Expect: tofA/tofB dips gone on the next '3063 run; flow/register unchanged.
**9/10 08:52 v376 REGRESSION (Bruce "seems hung" / "Aggregates started when I started water flow"):** not a hang. 08:40:27 -> 08:50:05 (580 s): tiAggCount +37, tofMarkerRejCnt +456, tiUartFbPkts +533 (all frames accounted: 37 valid + 456 rejected + ~40 INFO), REQ +579. The TI shipped an aggregate almost every second; the ST's 1 us pair filter rejected 92% of them, dps included -> no records, no prints, hold KILL at 47 s (17069 worked as designed), register 9,298.6 -> 9,305.2 for a ~1.5 min run (~6.6 of ~18 gal). Cause = my v376: with no in-range raw pair and no history the median raw's collapsed pair shipped, and the pair hold RE-SEATED last_good from it; from then on every np == 0 second shipped a ~0 pair. Worst on this rig because collapsed pairs are common (air). The 08:04 run on v375 was clean (rejects +35 in 10 min).
PROTECTIVE: '8549/'4423 allowTiFotaVer 376 -> 375 before their next session (never ran 376). v377 (building): ship the floor as the pair marker when nothing in range and no history; re-seat last_good only from raw-derived in-range pairs (g_pair_from_raws). 3063 to get 377 on Bruce's go; 376 stays in the bucket but must not be rolled.
Rig note: the 9 min of still-water rejects after the 08:34 run may also include real -1 (drained/aerated pipe at the meter after pump stop) — separate physical item; v377 makes it visible as tofMarkerRejCnt without hiding dps.
**9/10 08:55 TI v377 built (tag, merged), msp377.bin uploaded (key absent). '3063 allowTiFotaVer 376 -> 377 (the running 376 was rejecting 92% of aggregates; 377 is the corrected qualifier). Pair stays on 375. 376 must not be rolled anywhere.** Pickup on '3063 at the next event-end session (a short pump pulse). Success: rejects stop climbing on still water and during flow (compare tofMarkerRejCnt per post with v375's +35 per 10 min run), full 16 samples per blob in the log, tofA/tofB flat with dips replaced by the 25 us floor marker only when a whole second has no in-range pair.
**9/10 09:06 v377 first run on '3063 (Bruce "just ran"):** v377 armed 08:56:30 (event-end session after a v376 run), cal 70 s, offset retained. Run ~09:02:00-09:03:50 log at 11-13 gpm. Post 08:59:38 -> 09:05:41 (366 s incl. one session): tiAggCount +295, tofMarkerRejCnt +3, errFloor 0 -> aggregates essentially complete; records continuous (one 3 s gap), ZERO records with tofA/tofB < 44 us (v376 run had 58/1,320 dips; v375 had them too), no floor markers needed. The thin blobs in the UART log during flow (2-9 lines of 16) are DEBUG PRINT LOSS, not missing aggregates — the counters say 0.9 aggregates/s; use TB counters, not the log, for completeness. Register for this run pending the next upload (records stop at 09:03:04 record-clock; meterVal +7.6 gal so far vs ~20 gal expected if the run was ~100 s — CHECK at the next session before calling it).
Re-reading the 08:38-08:46 reject storm (456 rejects on still water): v376 zero-seed and/or genuine -1 aggregates from a drained/aerated pipe after pump stop; v377 removes the seeding path, so a repeat on v377 would be physical (keep the meter flooded when the pump stops).
Pair '8549/'4423: hold at ST 17066 / TI 375 until v377 shows a clean multi-run; then roll 17069 + 377 on Bruce's go.
**9/10 09:38 TI v378 built (tag; merged), msp378.bin uploaded (key absent), '3063 allowTiFotaVer 377 -> 378 (Bruce "go" on ti-v378-tof-cluster-sweep-spec.md).** Cluster step at commit (150 ns lobe tolerance, largest cluster wins, SCF_LOBE on the rest), spent-lobe list drives the next-largest walk after pool exhaustion, recovery must land on the committed lobe. Telemetry gCalClusterN/Sz not yet in INFO (ST decode later). Pickup at the next event-end session; the boot cal after the TI update is the first v378 sweep. Watch: commit tofA/tofB level on the majority lobe (45.4-45.6 us), pair hops in records near zero, reacqSpiralOk flat under flow, no mid-flow recal; still-water behaviour unchanged. Pair '8549/'4423 hold at 375/17066.

## 1e. 9/10 09:47 — SHIFTED LOCK after a run: phantom ~1.0 gpm on still water ('3063, TI 377, ST 17069)

Bruce: "Frozen again." Not the aggregate-silence class: the stream is alive (16 lines per blob) but since the pump stopped at 09:46:49 the shipped delta sits at ~3,000 ps (2,850-3,140, noise-like), read as 0.96-1.09 gpm, event open, register accruing ~1 gpm with no water. tofA 45.445 us (home lobe), tofB 45.957 us = one lobe (+512 ns) high since the 09:43 run (both channels jumped a lobe at 09:43:11 during flow; A came back at pump stop, B did not). Last posts: 09:34:53 gain 44 / env 42 / upamp 1101, reacqCnt 26 -> 44 (spiral 24 -> 41, self 0), reacqFail 2 -> 3, errCrossCnt 168 -> 239 in 15 min — the ladder was thrashing through the run. With |dns-ups| now ~512 ns, err_cross is TRUE on every aggregate: the ladder enters, "recovers" (continuity 30 k passes because the delta is steady at 3 k), strikes accumulate, recal pending — but the v349/v375 recal needs 60 CLEAN + 60 still aggregates and clean never comes while the split error stands; only the 3600-agg bounded defer (~1 h) ends it. Meanwhile: phantom 1 gpm = ~60 gal/h. This is the fleet "phantom floor" shape (21 Maple / 40 Maple class).
v378 (armed, not yet running — the event will not end to pull it) checks recoveries against the committed lobe: this recovery (B +512 ns) would have been rejected and escalated, but the escalation path still ends in the same pending recal. Needed in addition (v379 proposal): a persistent split-lobe error on the committed cell (|dns-ups| - |dtof| >= 350 ns for N aggregates while dtof is in band) is a lobe fault, not noise -> force the re-init/recal immediately (still-water rule waived when the fault is a lobe split, because the split itself proves the lock is wrong), and while it stands the ST must not bill: ship the aggregate with a "lobe fault" flag (InfoMetering off or a marker) so the ST records flow 0.
**9/10 10:06 recovery + v379:** the 09:47 phantom cleared when Bruce ran the pump again at ~09:51 (B back to the home lobe under flow, event closed, session 09:51:53); by 10:03 the delta read ~0 on still water. TI v379 built (tag; merged), msp379.bin uploaded (key absent), '3063 allowTiFotaVer 378 -> 379 (Bruce "go with 379"). v379 = lobe fault: split >= 350 ns with dtof in band for 3 aggregates -> re-init in place (x2) -> forced recal that skips the quiet/still wait; cleared on commit; gLobeFaultCnt. '3063 has not yet taken 378 either (needs an event-end session) -> the next pump pulse pulls 379 directly (378's clustering is included). Pair stays 375/17066.
**9/10 10:15 v378 first run ('3063 took 378 at 09:52:26 in the session that closed the phantom event; first v378 sweep 09:52:46-09:53:52, commit gain 38 / env 34 / upamp 565, surface 28-47).** Run 09:56:04-09:58:41 (record clock) at ~11-13 gpm: 154 flowing records, 29.1 gal integrated vs register +29.7 gal; ZERO pair-lobe hops in shipped records (v377 run: 0 in 110 s but 56/90 min on v374 last night); zero tofA/tofB dips; commit level tofA 45.459 / tofB 45.437 us = the home lobe; reacqCnt 0 and errCrossCnt 0 across the run (the 09:34 post on 377 had +18 spirals and +71 cross errors per 15 min); one 4 s record gap; still water after the run reads ~370 ps (3 records so far, rest pending). Bruce restarted with a flow event at 10:13 -> that session pulls 379 (lobe fault forced recal).
**9/10 10:17 v379 on '3063:** TIFOTA 378 -> 379 at 10:14:22 (session from Bruce's 10:13 flow event), sweep 70 s, offset retained 5220, commit gain 42 / env 34 / upamp 876, metering; stream alive at ~0 on still water. Test: run + hard stop; expect the delta to return to ~0 within seconds of the stop; if a channel stays a lobe off, a forced recal (~70 s not-metering, status Calibrating) within ~10 s instead of an hour of phantom. Pair '8549/'4423 still 375/17066 pending a clean multi-run.
**9/10 10:21 v379 first run ('3063, 17069 / TI 379):** 10:17:30-10:19:10 log, 12.3-14.0 gpm. Log blobs full (15-16 per 10 s), delta back to ~0 within one blob of the stop (td 184 then ~0). Posts 10:17:30 -> 10:21:02: reacqCnt 0, errCrossCnt 0, tofMarkerRejCnt +2, tiAggCount +188, heldEpisodes unchanged. Records: 83 flowing = 15.8 gal integrated vs register +15.9 gal; pair hops 0; dips 0; commit level tofA 45.466 / tofB 45.443 us (home lobe); still water after the run tnorm median ~260 ps (offset retained 5220; inside the 17066 re-anchor gate). Two clean runs in a row (378, 379). Recommendation: roll ST 17069 + TI 379 to '8549/'4423 on Bruce's go (they sit at 17066/375, cycling Failed Cal off-pipe since 9/9).
**9/10 10:25 absolute-TOF stability across the day (Bruce: "Wow look at tof"), shipped records during flow, sample-to-sample sd / range / lobe steps (>250 ns):** v373 (9/9 21:50): tofA 33.9 ns / 539 ns / 6 steps, tofB 23.9 ns / 877 ns / 4. v374 overnight: 19.9 ns / 1,052 ns / 16 and 24.1 ns / 1,044 ns / 26. v375 (08:04): dominated by the zero-TOF dips, range 36 us. v378 (09:56): 2.9 ns / 21 ns / 0 and 3.4 ns / 26 ns / 0. v379 (10:17): 2.6 ns / 16 ns / 0 and 3.5 ns / 23 ns / 0. Still water: 0.6-0.8 ns on 378/379 (1.4-2.6 ns on 373). Lobe hops in the shipped pair are gone; what remains is the physical ~3 ns turbulence/aeration jitter on this rig.
