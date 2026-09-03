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
