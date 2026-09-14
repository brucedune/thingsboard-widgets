# Shady Lane — manual device review log (2026-08-29)

Bruce's manual per-device confirmation pass, logged alongside the automated 8/27
shutoff analysis. **Bruce's observations are field/dashboard reads and are treated as
authoritative**; my measured values are from the 1 Hz continuous samples captured during
the confirmed water-off block (8/27 16:00–20:00 UTC = 12:00–16:00 EDT).

Companion artifacts: `shady-lane-tofnorm-shutoff-analysis.xlsx` (8 sheets, repo root),
memory `shady-lane-underreg-2026-08-26`, session f39664e0 scratchpad.

**Status: review IN PROGRESS — Bruce still working through the remaining lots.**
**Cross-check against live TB COMPLETED 8/30 — see the section at the end.**

---

## Bruce's per-device findings (verbatim, 12 of 36 devices)

| Device | Lot | Bruce's read |
|---|---|---|
| 79459895 | 83 Shady | data prior to 8/7 — flipped — **data wedged** |
| 70269798 | 40 Maple #3 | data prior to 8/5 — not flipped — **data wedged** |
| 75369486 | 63 Shady | visible tnorm quiet period 8/27 11:50AM–4:09PM; **jump in tnorm** 8/27 4:09PM → 8/28 1:20AM; **composite usage** over this period |
| 79461768 | 21 Maple | noisy — no change in tnorm — **large ADC ppk — gain 44** — was metering with usage **up to 7/31** — flipped |
| 75367100 | 5033 Spruce | noisy — no change in tnorm — **large ADC ppk — gain 41** — was metering with usage **up to 7/31** — not flipped |
| 70267966 | 40 Maple #5 | good data — no change in tnorm during water-off — not flipped — **bad offset — tnorm steady-state high by 840 ps** |
| 79454037 | 58 Shady | no data 7/20–8/28, **wedged — FW 17040/354 CORRECTED IT** — metering — good data — flipped |
| 75368439 | 44 Shady | metering, good data / offset — no tnorm change with water off — not flipped |
| 79466304 | 5027 Spruce | metering, good data / offset — no tnorm change with water off — not flipped |
| 79466452 | 144 Test | metering — flipped — no tnorm change with water off — **noisy / high gain / ADC ppk high** |
| 75368777 | 144 Old | no usage — **gets wedged** — same pipe as 79466452 — was metering well through 8/22 — **gain / env increased** — no usage now — no tnorm change with water off |
| 75365302 | 33 Maple | flipped |

---

## Cross-check against the automated analysis

### Agreements (independent methods, same conclusion)

- **40 Maple #5 — bad offset.** Bruce: "steady-state high by 840 ps." Measured: tofNorm
  median **+906 counts**, sd only 100, hourly volume 11.7 / 12.0 / 12.2 / 12.3 gal with
  the water off. Same fault, same magnitude, arrived at two ways. Stuck offset confirmed.
- **21 Maple and 5033 Spruce — "no change in tnorm" with water off.** Measured: both
  never settle to a zero baseline (median −1967 / −1786, sd 1765 / 1648) and are the
  **only two meters of 29 that logged significant tofNorm transitions during the water-off
  block** (22 each; the other 27 logged zero).
- **83 Shady (8/7) and 40 Maple #3 (8/5) data cutoffs** — exactly the dates the automated
  pull found for last tofNorm.
- **44 Shady, 5027 Spruce clean** — measured tofNorm −14 / +13, sd 48 / 68, 0.0 gal
  fabricated. Agree.
- **63 Shady quiet period 11:50AM–4:09PM EDT = 15:50–20:09 UTC** — this independently
  confirms the water-off window I derived from the data (16:00–20:00 UTC). Two
  independent derivations of the same block.

### New from Bruce — not previously flagged

1. **"WEDGED" IS A DISTINCT FAILURE CLASS, AND 17040/354 APPEARS TO FIX IT.**
   Wedged: 83 Shady (since 8/7), 40 Maple #3 (since 8/5), 58 Shady (7/20–8/28),
   144 Old (intermittent). **58 Shady was un-wedged by the FW 17040/354 update** and now
   reports good data daily. This is the first evidence that the new firmware remedies the
   wedge class — it materially changes the FOTA calculus, which until now was gated purely
   on the forward-billing question. **Follow-up: confirm 58 Shady's fwVer/fwVerTi actually
   reads 17040/354 (cross-check aborted on an expired token).**
   My earlier note called 58 Shady "recovered"; Bruce supplies the *reason*.

2. **21 Maple and 5033 Spruce share a 7/31 onset.** Both "were metering with usage up to
   7/31," then both went noisy with **railed gain (44 and 41)** and large ADC ppk. Both are
   also the two Shady Lane entries in `fleet-cal-flags-0825.csv` flagged NOISY-COMMIT.
   7/31 is the date ~20 Shady devices show flowDirection transitions (FOTA reboots).
   **Working hypothesis: a 7/31 FOTA/recal event caused both to commit a bad calibration
   point with the gain railed, and they have been fabricating/rejecting ever since.**
   This is a common-cause story for the site's two worst meters and should be checked
   against the fleet's other NOISY-COMMIT devices.

3. **63 Shady (75369486) — composite usage lump.** Not previously on the concern list.
   Bruce sees a tnorm jump from 4:09PM 8/27 through 1:20AM 8/28 with composite usage.
   Corroborated by the register: **+204 gal on 8/27 then +951 gal on 8/28**, against a
   ~100–200 gal/day norm. The automated screen scored 63 Shady CLEAN during the water-off
   block (median +16, sd 37, 0.0 gal fabricated) — and that is not a contradiction: the
   meter is healthy, but the water-off period produced a **carry-forward lump** that lands
   in a single billing day. Same class as the meterValUpdated lump pattern.
   **Billing action: the 8/28 lump on 63 Shady is real water spread over the outage, not
   one day's consumption — it should be smoothed if it lands in a billing boundary.**

4. **The lot-144 pair share a pipe.** 144 Old (75368777) and 144 Test (79466452) are on the
   **same pipe** — so they are a true A/B pair, which makes 144 Old's degradation
   measurable against a reference. 144 Old was metering well through 8/22, then gain/env
   increased and usage went to zero. Bruce flags BOTH as noisy / high gain / high ADC ppk.

### Refinement to my thresholds

Bruce flags **144 Test (79466452) as noisy / high gain / ADC ppk high**. My automated screen
put it in the CLEAN bucket — but it is the *worst* member of that bucket: sd **199** (healthy
meters run 22–92) and **1.3 gal** fabricated during the water-off block (the highest of any
clean meter; twenty of the 23 are at 0.0–0.1 gal). My sd>800 anomaly threshold is too loose
to catch early degradation. **Suggested revision: flag sd > 150 as "degrading" between the
clean band and the anomaly band.** 144 Old and 40 Maple APT #4 (sd 188) would also land there.

### Direction inventory so far

- **FLIPPED**: 83 Shady, 21 Maple, 58 Shady, 144 Test, 33 Maple
- **NOT FLIPPED**: 40 Maple #3, 5033 Spruce, 40 Maple #5, 44 Shady, 5027 Spruce

All consistent with the 8/26 audit. No direction conflicts found in this pass.

---

## Open follow-ups

1. **Confirm 58 Shady is on 17040/354** — the single highest-value open item, because it
   converts the FOTA from "risky" to "the remedy for the wedge class." Then check whether
   the other wedged devices (83 Shady, 40 Maple #3, 144 Old) are candidates for the same fix.
2. **Cross-check gain/env/ADC-ppk history around 7/31** on 21 Maple and 5033 Spruce to
   confirm the common-cause hypothesis (script `confirm_manual.py` is written and ready —
   it aborted on an expired token, just needs a fresh JWT).
3. **Cross-reference `adc-ppk-fleet-0825.csv`** for the large-ADC-ppk devices Bruce flagged,
   to see whether railed gain + high ppk predicts the NOISY-COMMIT population fleet-wide.
4. **Smooth the 63 Shady 8/28 composite lump** for billing.
5. Bruce still reviewing the remaining ~24 lots.

---

## Standing state

- `recordNoneventFlow` is **still ON** at the Shady Lane MHP-Cust group level. Revert when
  collection is complete (the attribute that filled 75368777's flow ring and caused the
  session storm).
- Confirmed clear-cut faults (unchanged by this pass): **21 Maple** phantom ~677 gal/d
  (4,257 gal since 8/24, still accruing), **40 Maple #5** phantom floor ~289 gal/d,
  **5033 Spruce** dual fault (rejPct 85% under-read + ~34 gal/d fabricated).

---

# CROSS-CHECK COMPLETED (live TB pull, 2026-08-30)

`confirm_manual.py` re-run on a fresh token. Bruce's manual read is **confirmed on every
point**, and the pull adds a firmware correlation plus one finding that revises a
characterization.

## Live state of the 12 reviewed devices

| Device | Lot | FW / TI | gain | env | offset | direction | **rejPct** | tnormSd | ADC ppk (upamp) |
|---|---|---|---|---|---|---|---|---|---|
| 79459895 | 83 Shady | **17040/354** | 29 | 35 | -5975 | FLIPPED | **0** | 33 | 657 |
| 79454037 | 58 Shady | **17040/354** | 27 | 35 | -1248 | FLIPPED | **0** | 94 | 938 |
| 70269798 | 40 Maple #3 | **17040/354** | 55 | 30 | 0 | NOT FLIPPED | 0 | 0 | 233 |
| 75369486 | 63 Shady | 17037/344 | 26 | 43 | 1356 | NOT FLIPPED | 11 | 170 | 1205 |
| 75367100 | 5033 Spruce | 17037/344 | 41 | 44 | 2557 | NOT FLIPPED | **83** | 957 | **2770** |
| 79466304 | 5027 Spruce | 17037/344 | 35 | 44 | -5713 | NOT FLIPPED | 0 | 69 | 737 |
| 75368777 | 144 Old | 17037/344 | 29 | 40 | -7700 | NOT FLIPPED | 4 | 186 | 974 |
| 79461768 | 21 Maple | 17028/341 | 44 | 33 | -1967 | FLIPPED | **74** | 1868 | **2482** |
| 70267966 | 40 Maple #5 | 17028/341 | 26 | 35 | 735 | NOT FLIPPED | **99** | 25 | 1092 |
| 75368439 | 44 Shady | 17028/341 | 41 | 43 | 303 | NOT FLIPPED | 2 | 45 | 1496 |
| 79466452 | 144 Test | 17028/341 | 44 | 49 | 153 | FLIPPED | 4 | 243 | 1648 |
| 75365302 | 33 Maple | 17028/341 | 44 | 43 | 786 | FLIPPED | 0 | 99 | 935 |

**All 12 flowDirection values match Bruce's manual read exactly.**

## 1. The wedge fix is CONFIRMED — and it has already reached three devices

All three devices Bruce called wedged that now report are on **17040/354**, and two of them
are fully healthy:

- **83 Shady (79459895)**: was frozen since 8/7. Now on 17040/354, **reporting again as of
  8/30 16:01**, with gain 29 / env 35 / rejPct 0 / tnormSd 33 — textbook healthy numbers.
  Caveat: the register still reads 6645, unchanged from the frozen value, so it is
  *reporting* but has not accumulated. Either the lot genuinely has no water, or the
  register is still stuck behind a healthy front end. **Needs a field draw test to settle.**
- **58 Shady (79454037)**: was dead 7/20-8/28. Now on 17040/354, rejPct 0, tnormSd 94,
  register advancing (17155 on 8/30). Fully recovered — this is Bruce's original catch.
- **40 Maple #3 (70269798)**: on 17040/354 and reporting daily, rejPct 0, but **offset 0,
  gain 55, tnormSd 0** — the FOTA restored communications but did NOT clear the failedCal.
  It still needs a forced recal.

**Implication for the FOTA plan:** 17040/354 demonstrably rescues wedged devices in the
field. That is a benefit the earlier gate analysis did not have. It does not retire the
forward-billing question, but it means the wedge class is an argument *for* the rollout,
not neutral to it.

## 2. rejPct is the cleanest single discriminator found so far

The split is absolute, with no overlap:

- **Faulty**: 40 Maple #5 **99**, 5033 Spruce **83**, 21 Maple **74**
- **Everything else**: 0, 0, 0, 0, 0, 2, 4, 4, 11

It beats tnormSd (which misses 40 Maple #5 entirely at sd 25) and it is a single scalar
already in telemetry. **Recommend rejPct > 50 as the primary fleet screen**, with tnormSd
and quiet-baseline offset as secondary confirmations.

## 3. REVISION — 40 Maple #5 is not a "clean" stuck offset

I previously characterized it as a clean stuck offset because sd was only 100. **Its rejPct
is 99** — it is discarding virtually every measurement. The low sd is not health; it is the
signature of a handful of surviving samples all carrying the same wrong value. Correct
characterization: **near-total measurement rejection combined with a parked offset (+735 to
+906 counts)**, which together manufacture a metronomic 0.2 gpm. The remedy is unchanged
(recal on verified no-flow) but the fault is more severe than stated.

## 4. The 7/31 event is confirmed on both noisy lots

Both show a recal at 7/31 with gain dropping to 0 then re-committing, and env jumping to 50:

- **21 Maple**: gain 17 (7/25) -> 0 -> 25 at 7/31 10:39-10:42; env 37 -> 0 -> **50**.
  Then repeated cal cycles with gain scanning to 55 on 8/5 and 8/6, settling at **44 on 8/22**.
- **5033 Spruce**: gain 17 (7/25) -> 0 -> 20 at 7/31 09:54-09:56; env 33 -> 0 -> **50**.
  Cal cycles 8/4, 8/5, 8/6, 8/13, settling at **41 on 8/14**.

Both were healthy before 7/31 and neither has recovered since. Bruce's "was metering with
usage up to 7/31" is exactly right, and the mechanism is visible: a 7/31 recal pushed both
into a high-gain / high-env regime they never walked back out of.

## 5. rejPct onset dates the phantom precisely

- **21 Maple**: rejPct 0-3% through 8/17, then **79% on 8/24** — the *same day* the phantom
  register jump begins (+549 gal on 8/24). Rejection storm and fabricated consumption start
  together, which ties the mechanism to the symptom.
- **5033 Spruce**: 0-24% through 8/13, then **59% on 8/17, 67% on 8/18** — matching its
  slide from 380-535 gal/day down to 45-140.

## 6. ADC ppk confirmed quantitatively

Bruce's "large ADC ppk" call on the two worst meters holds: **5033 Spruce upamp 2770** and
**21 Maple 2482** are the two highest of the twelve, roughly 2-4x the healthy band
(657-1092). 40 Maple #3, the failedCal device, sits at the opposite extreme (**233**) —
too little signal rather than too much.

## 7. 63 Shady detail

Register across Bruce's flagged window: 15618.5 (8/27 14:11) -> 15690.0 (21:21) ->
15852.4 (8/28 00:21) -> 16000.6 (03:00) -> 16641.1 (13:49) — it accumulated steadily
overnight rather than dumping a single lump, ending at **+951 gal on 8/28** against a
100-200 gal/day norm. Large events on 8/28 evening (23.6 gal over 380 s, 15.2 gal over
578 s at 1.6-3.7 gpm). Meter health is middling (rejPct 11, tnormSd 170, env 43, offset
1356). Not a fabrication signature - the flow rates and durations look like real draws.
**Most likely real catch-up demand after the outage, but the size warrants a look at
whether a leak started; it should not be billed as a single day's consumption.**

## Revised follow-ups

1. **83 Shady: field draw test.** Front end is healthy on 17040/354 but the register has not
   moved off 6645. Determine whether the lot has water at all.
2. **40 Maple #3: force a recal** — the FOTA fixed comms but left failedCal / offset 0.
3. **Adopt rejPct > 50 as the primary fleet screen** and re-run it across all 36 Shady lots
   and then the 122 fleet NOISY-COMMIT devices.
4. **Check whether the 7/31 recal signature (env -> 50, gain -> 55 scan) appears on the other
   fleet NOISY-COMMIT devices** — if so, one dated event explains the whole population.
5. 63 Shady: confirm the 8/28 volume is real demand, not a new leak.
6. Bruce still reviewing the remaining ~24 lots.

---

# BATCH 2 — 3 more lots (2026-08-30), all confirmed

| Device | Lot | Bruce's read | Live cross-check |
|---|---|---|---|
| 75362887 | 66 Shady | Metering — good data — no tnorm jump with no water — **a little noisy** — flipped | fw 17037/344, gain 26, env 39, offset 2836, **FLIPPED**, rejPct 10, tnormSd 173, upamp 718 |
| 75364586 | 103 Shady | Metering — good data — **tnorm jump unconfirmed** with no water — clean — not flipped | fw 17028/341, gain 32, env 40, offset 5230, **NOT FLIPPED**, rejPct 1, tnormSd 49, upamp 499 |
| 79466007 | 126 Shady | Metering — good data — no tnorm jump with no water — clean — flipped | fw 17037/344, gain 29, env 44, offset 5495, **FLIPPED (as of 8/30 14:19)**, rejPct 0, tnormSd 34, upamp 930 |

## 66 Shady is now screened — the "UNMEASURED" row closes

It has records again. 48-hour quiet screen: **48,177 quiet samples, median −9 counts,
sd 152, p5/p95 −114/+155 → offset CLEAN (−0.002 gpm)**. The sd of 152 against a healthy
band of 22–92 is exactly Bruce's "a little noisy," and it lands in the *degrading* band
proposed earlier (sd > 150). rejPct 10 and upamp 718 are both benign.
**Verdict: no offset fault, mild noise, monitor only.** Remove from the concern list's
UNMEASURED group.

## 103 Shady — "unconfirmed" is the correct verdict, and it matches Widget 31

Bruce could not confirm a tnorm jump with no water because **103 Shady had no usable
water-off data** (it reported noneventMode=FALSE on 8/27 and only produced 5 quiet cells).
Widget 31 independently withholds on this device as INSUFFICIENT for the same reason.
Its own health is clean (rejPct 1, tnormSd 49) and the 8/29 48-hour screen cleared it
(46,624 samples, median −25, sd 74). **Clean on its own merits; simply never tested during
the outage.**

## 126 Shady — two new findings on an otherwise pristine meter

**(a) The firmware's own leak detector called the leak correctly, and I under-used it.**

    leakSus:              false -> TRUE @ 08-12 15:57 -> false @ 08-23 13:48
    flowDirectionAlarm:   false -> TRUE @ 08-12 15:57 -> false @ 08-23 13:48 -> TRUE @ 08-30 14:19
    meterVal daily:       +882 +950 +822 +723 +855 +899 +1062 +771 +790 (8/15-8/23)
                          then +0 every day 8/24-8/29, +13 on 8/30

`leakSus` was TRUE for **exactly the duration of the leak** and cleared the day it stopped.
In the 8/26 audit I read leakSus=false as evidence against a leak — that was a point-in-time
read taken *after* it had already cleared. The conclusion (real leak) was right, but the
reasoning was wrong, and **leakSus is a working detector that should be part of the screen.**

**(b) Its flowDirection is unstable — four changes since 8/2, one of them today.**

    UNKNOWN (8/02) -> FLIPPED (8/08) -> NOT FLIPPED (8/12) -> FLIPPED (8/30 14:19)

The 8/30 re-latch arrived with `flowDirectionAlarm` going true again. This is the same
direction-instability class as rig '549 and 5033 Spruce. The meter is otherwise pristine
(rejPct 0, tnormSd 34), so this is a *direction machinery* fault, not a signal-quality one.

**Reverse-banking ruled out.** I checked whether the 8/24 stop could be water being banked
as reverse while the direction was latched NOT FLIPPED. It is not: `revGal` is not a
populated key on these devices, and **a scan of all 36 lots found no device banking reverse
water**. The leak genuinely stopped on 8/24.

---

# DTHRES LATCH TEST — NEGATIVE for every Shady device

The 8/29 root-cause work ([[ti-dthres-latch-2026-08-29]]) names our two phantom lots as
suspected latched fossils: *"constant-rate phantom floors (40 Maple#5 289 gal/d, 21 Maple
677 gal/d class) ... = possible latched fossils"*. Its own test is bit-identical flowRate
runs in telemetry. I ran that test over the saved water-off corpus.

**Result: no fossils. The longest run of bit-identical non-zero values anywhere on site is
3 samples.**

| Device | Non-zero samples | Distinct values | Longest identical run | Verdict |
|---|---|---|---|---|
| 40 Maple #5 | 14,371 | **300** | **3** | NOT frozen — varies |
| 21 Maple | 12,446 | **4,796** | 2 | NOT frozen — genuinely noisy |
| 5033 Spruce | 1,090 | 764 | 2 | NOT frozen — varies |

40 Maple #5 is the closest thing to a candidate (300 distinct values inside a tight band
around 0.2035 gpm, tofNorm clustered at +913..+922) but it is **sampling noise around a
parked offset, not a frozen packet** — a fossil would repeat one value indefinitely.

**Conclusion: the Shady phantoms are offset / rejection faults, not DTHRES latched fossils.**
That is a useful negative — the fleet fossil scan (task_ae15a462) can drop these two and
look elsewhere. It does not change any remedy here: recal on verified no-flow still applies.

**But it does sharpen the FOTA picture.** The DTHRES fix is **TI v357 + ST 17043**, not
17040/354. So:
- 17040/354 = confirmed remedy for the **wedge** class (83 Shady, 58 Shady both recovered).
- v357+ = the fix for the **latch** class — which Shady does not appear to have.
- Standing constraint from that work: **fleet TI rolls must reach >= v357 before any build
  that calms the reacq ladder**, because ladder churn is what has been accidentally curing
  the latch for eight months.

---

# METHOD NOTE — Widget 31 supersedes my raw-sd screen

Widget 31 ([[w31-recapture-analysis]]) was calibrated against **this corpus** and corrects
two things in my approach:

1. **Use 5-minute quiet CELLS and take the median across cells, not a raw window sd.**
   A raw sd false-positives eight healthy meters on this very dataset (raw sd 1319-1916 on
   44 / 148 / 63 Shady and 5027 Spruce, whose cell-median sd is 38-67). My numbers happened
   to be safe because I restricted to the confirmed water-off block, but the method does not
   generalize to spans containing real usage. **Adopt the cell-median method.**
2. **Never project a current rate flat across a billing period.** Doing that charged 21 Maple
   16,723 gal for a fault that began 8/24. The register must arbitrate: charge only the
   trailing run of hot days, take the lesser of rate x days and register-excess-over-baseline,
   and hard-cap at the period register delta. For 40 Maple #5 that yields **0 gal attributed
   and 276 gal/day of forward exposure** — not a retrospective charge.

Combined with the rejPct finding, the screening stack is now:
**rejPct > 50 (primary) -> cell-median quiet tofNorm (sizing) -> leakSus / flowDirectionAlarm
(context) -> register arbitration (attribution).**

---

# Running tally: 15 of 36 lots reviewed

| Status | Lots |
|---|---|
| Confirmed faulty | 21 Maple, 40 Maple #5, 5033 Spruce |
| Wedged, FOTA-recovered | 58 Shady (healthy), 83 Shady (front end healthy, register not moving), 40 Maple #3 (comms back, failedCal remains) |
| Clean | 44 Shady, 5027 Spruce, 103 Shady, 126 Shady*, 33 Maple, 66 Shady* |
| Degrading / watch | 144 Test (sd 243), 144 Old (sd 186), 63 Shady (rejPct 11, sd 170) |

\* 126 Shady clean on signal quality but direction-unstable; 66 Shady clean on offset,
mildly noisy.

Remaining ~21 lots still to review.

---

# 5013 Spruce (75369098) — DOWNGRADE from CRITICAL. The gaps are not losing water.

Bruce: *"Metering - good data - no tnorm jump with no water - clean - not flipped -
multiple days no data - seems worse lately post 17028/344 - could be real gaps don't know"*

## Current health — confirms Bruce's read completely

    fwVer 17037 / fwVerTi 344      gain 26      env 38       offset 2607
    flowDirection NOT FLIPPED      rejPct 0     tnormStddev 22     upamp 793
    meterFlashFull false           meterFlashErased false          sfBufferDrops 0
    missedConnectCnt 0             missedUploadCnt 3               noneventMode TRUE
    meterVal 1598.9 @ 08-30 14:14  rsrp -116    rssi -87

**tnormStddev 22 is the lowest on the entire site** (healthy band 22-92). rejPct 0.
The meter is in excellent shape.

## THE GAP TEST — every recent gap CARRIES

Median single-day delta on no-gap days: **82.2 gal/day** (n=22). For each gap, does the
register advance by roughly (missing days x rate)?

| Gap | Missing days | Actual delta | Expected | Verdict |
|---|---|---|---|---|
| 7/27 -> 7/31 | 3 | +361.0 | 329.0 | **CARRIED** |
| 7/31 -> 8/05 | 4 | **-6601.0** | 411.2 | the flash WIPE |
| 8/06 -> 8/13 | 6 | -0.1 | 575.7 | **FLAT — real loss** |
| 8/18 -> 8/20 | 1 | +261.5 | 164.5 | **CARRIED** |
| 8/22 -> 8/24 | 1 | +165.0 | 164.5 | **CARRIED** (near exact) |
| 8/24 -> 8/26 | 1 | +135.7 | 164.5 | **CARRIED** |
| 8/27 -> 8/29 | 1 | +269.8 | 164.5 | **CARRIED** |

**Answer to Bruce's open question: they are reporting gaps, not real gaps.** The register
keeps counting through every one of them and settles up on the next upload. No water is
being lost today. The only two flat spans are the known 8/5 wipe and the 8/6-8/14 dead
period that followed it.

## "Seems worse lately post 17028/344" — the data says the opposite

Two corrections, gently offered:

1. **The pairing 17028/344 never existed on this device.** Actual sequence:
   `16022/260 -> 16193/320 (7/31) -> 17023/328 (8/05) -> 17028/341 (8/06) -> 17037/344 (8/13)`.
   It ran 17028 only between 8/06 and 8/13 — which is precisely the dead window — so
   17028 is easy to associate with the bad behaviour. It has been on **17037/344 since 8/13**.

2. **Reporting cadence IMPROVED after the firmware settled**, it did not degrade:

   | Window | Days reported | Rate |
   |---|---|---|
   | before 8/05 | 14 / 17 | 82% |
   | after 8/05 (includes the dead period) | 16 / 26 | 62% |
   | **after 8/14 (on 17037/344)** | **13 / 17** | **76%** |
   | after 8/20 | 8 / 11 | 73% |

   The 62% figure is dragged down entirely by the 8/6-8/14 outage. Since 17037/344 landed,
   it reports about three days in four. Still imperfect, but better than before the wipe
   once the dead period is excluded.

**Most likely cause of the residual gaps: signal, not firmware.** rsrp **-116** is weak
(for reference, 83 Shady sits at -125 and is the site's worst). missedConnectCnt is 0 and
missedUploadCnt only 3, which fits a device that misses whole check-in windows rather than
failing mid-session.

## Revised classification

**CRITICAL -> WATCH.** The meter is healthy, direction is stable, the offset is clean, and
gaps carry. Two corrections to my earlier CRITICAL entry, both now wrong:

- *"noneventMode STILL reports FALSE on 8/29"* — it reads **TRUE** as of 8/30 14:14. It
  accepted the group attribute, just late. It is no longer refusing anything.
- *"register accumulating from a zeroed base ~130 gal/day"* — the rate is **82 gal/day**
  median and the base is fine going forward.

## What remains, and it is only historical

- **~740 gal unrecorded during 8/6-8/14** (9 days at the 82 gal/day median) — the dead
  window after the wipe. This is genuine lost billing volume.
- **The pre-wipe 6,601 gal baseline is gone.** Any billing that differences the register
  across 8/5 will be badly wrong (it would show -6,601). Period billing that starts on or
  after 8/15 is unaffected.
- Cadence of ~75% means a billing snapshot may land on a non-reporting day; use the
  nearest available reading rather than assuming a missed day is zero usage.

---

# 154 Shady (79466858) — CONFIRMED CLEAN

Bruce: *"Metering - good data - no tnorm jump with no water - clean - not flipped"*

Live: `fw 17028/341, gain 26, env 41, offset -5302, NOT FLIPPED, fdAlarm false,
leakSus false, rejPct 3, tnormStddev 41, upamp 739, rsrp -113, meterVal 4959.2 @ 08-30 16:08`

Water-off block measurement agrees: tofNorm median **+8**, sd **54**, **0.0 gal** fabricated,
zero significant transitions. Clean on every axis — signal quality, offset, direction,
alarms. **No action.**

---

---

# 84 Shady (75363992) — CONFIRMED CLEAN

Bruce: *"Metering - good data - no tnorm jump with no water - clean - not flipped"*

Live: `fw 17028/341, gain 29, env 48, offset 2408, NOT FLIPPED, fdAlarm false,
offsetAlarm false, leakSus false, rejPct 0, tnormStddev 93, upamp 649, rsrp -112,
meterVal 9056.4 @ 08-30 13:59`

Water-off block agrees: tofNorm median **+29**, sd **52**, **0.0 gal** fabricated, zero
significant transitions. rejPct 0 and no alarms of any kind. **No action.**

Minor note: `env 48` is on the high side (site mode is 35-44) and tnormStddev 93 sits at
the top of the healthy band, but with rejPct 0 and a clean water-off baseline there is no
fault here — worth nothing more than a glance on the next pass.


---

---

# 40 Maple APT #4 (65828520) — clean on the fault axes, but it belongs in WATCH

Bruce: *"Metering - good data - no tnorm jump with no water - clean - not flipped"*

Live: `fw 17028/341, gain 26, env 39, offset -1850, NOT FLIPPED, fdAlarm false,
offsetAlarm false, leakSus false, rejPct 0, tnormStddev 167, upamp 1747, rsrp -107,
meterVal 1282.8 @ 08-30 14:44`

**Agreed on everything Bruce checked**: rejPct 0, no alarms, direction stable, offset
stable, no tnorm jump when the water went off. There is no fault here.

**One refinement, offered as a flag rather than a disagreement.** Two numbers sit outside
the clean band:

| Metric | This device | Clean band (8 confirmed lots) |
|---|---|---|
| tnormStddev | **167** | 34-93 |
| upamp (ADC ppk) | **1747** | 499-930 |
| Water-off fabricated volume | **1.2 gal / 4 h** | 0.0-0.1 gal |

1.2 gal in four confirmed no-water hours is about **7 gal/day** of fabrication — small
enough to be invisible against a real usage figure, but it is not zero, and the profile is
the same as 144 Test (sd 243, 1.3 gal). Its upamp of 1,747 is the **third highest measured
on site**, behind only 5033 Spruce (2,770) and 21 Maple (2,482) — the two confirmed faulty
lots.

Not frozen (969 non-zero samples, 242 distinct values, longest identical run 1), rejPct 0,
so the front end is accepting measurements — it is simply a noisy install. **Classification:
WATCH, alongside 144 Test and 144 Old.** No action beyond including it in the next recal
wave and re-checking whether upamp is trending.


---

---

# 152 Shady (75366953) — clean on the fault axes, and it CORRECTS my upamp claim

Bruce: *"Metering - good data - no tnorm jump with no water - clean - not flipped"*

Live: `fw 17037/344, gain 38, env 37, offset 652, NOT FLIPPED, fdAlarm false,
offsetAlarm false, leakSus false, rejPct 0, tnormStddev 159, upamp 280, rsrp -108,
meterVal 3418.8 @ 08-30 15:00`

**Agreed on the fault axes**: rejPct 0, no alarms, direction stable, no tnorm jump with the
water off.

## This device breaks the ranking I proposed one entry ago — and the correction matters

I claimed high upamp predicts degradation. **152 Shady has the second-LOWEST upamp on site
(280) and is still noisy**: tnormStddev 159, and 1.1 gal fabricated during the four
confirmed no-water hours — essentially the same output as 40 Maple APT #4, which sits at
the opposite extreme (upamp 1,747).

The difference is visible in the gain: **152 Shady runs gain 38** against the healthy mode
of 26-32. Weak acoustic coupling, gain cranked up to compensate, noise amplified with it.
The relationship is **U-shaped, not monotonic** — my previous framing was wrong:

| Regime | upamp | Typical gain | Examples |
|---|---|---|---|
| **Too much signal** | > 1,600 | 41-44 | 5033 Spruce 2770, 21 Maple 2482 (both FAULTY); 40 Maple #4 1747, 144 Test 1648 (watch) |
| **Healthy middle** | ~500-1,500 | 26-35 | 84 Shady 649, 154 Shady 739, 66 Shady 718, 5027 Spruce 737, 126 Shady 930 |
| **Too little signal** | < 500 | 38-55 | 152 Shady 280 @ gain 38 (noisy); 40 Maple #3 233 @ gain 55 (FAULTY, failedCal) |

**Corrected rule: read upamp together with gain, and treat both tails as suspect.** A device
needing gain above ~36 to reach a usable amplitude is working at the edge, and one whose
amplitude exceeds ~1,600 is over-driven. 44 Shady (upamp 1,496 at gain 41) remains the
honest counter-example on the high side — high amplitude alone is not disqualifying.

**Classification for 152 Shady: clean, low-signal variant. Monitor.** rejPct 0 means the
front end is still accepting measurements, so there is no billing impact today; the concern
is headroom. If coupling degrades further the gain has little room left before it reaches
the 40 Maple #3 condition.


---

---

# 148 Shady (75366029) — clean, and its rejPct led to two bigger findings

Bruce: *"Metering - good data - no tnorm jump with no water - clean - flipped"*

Live: `fw 17037/344, gain 26, env 35, offset -1774, FLIPPED, fdAlarm false, offsetAlarm
false, leakSus false, rejPct 26, tnormStddev 70, upamp 967, meterVal 7390.8 @ 08-30 14:49`

Water-off block: tofNorm median **+14**, sd **44**, **0.0 gal** fabricated, zero
transitions. Gain 26, env 35, upamp 967 — dead centre of the healthy band. **Confirmed
clean.**

Its rejPct of 26 was the highest of any non-faulty device so far, so I pulled the history.
It is **episodic, not chronic**: median 0 across 30 days, spiking to 28 / 32 / 18 / 47 / 31 /
29 / 26 on scattered days and sitting at 0 in between. That is a different animal from the
faulty devices, and it prompted a proper look at rejPct as a time series.

## FINDING 1 — rejPct separates CHRONIC from EPISODIC, and only chronic means a broken meter

| Device | Median | Max | Pattern |
|---|---|---|---|
| 40 Maple #5 | **98** | 99 | **chronic** — 97+ every single day since 8/12 |
| 21 Maple | 0 | 81 | **chronic since 8/24** — 0 before, 73-81 every day after |
| 5033 Spruce | — | 83 | chronic |
| 63 Shady | 2 | **98** | **episodic but severe** — see Finding 2 |
| 148 Shady | 0 | 47 | episodic, mild |
| 66 Shady | 1 | 17 | episodic, benign |

**Screening rule refined: use the MEDIAN over a window for chronic faults, and the DAILY MAX
to decide whether a given day's volume can be trusted.** A single high reading is not a
broken meter; a sustained one is.

## FINDING 2 — 63 Shady's +951 gal day happened during 96-98% rejection. Do not bill it.

This overturns what I said earlier. Its rejPct by day:

    8/23:18  8/24:0  8/25:68  8/26:3  8/27:96  8/28:98  8/29:31  8/30:11

**8/27 and 8/28 are the exact days of Bruce's flagged tnorm jump and the +951 gal register
lump.** The meter was discarding 96-98% of its measurements while banking that volume.

I previously wrote that the lump was "most likely real catch-up demand" because the event
flow rates and durations looked plausible. That reasoning does not survive this: with 96-98%
of measurements rejected, the surviving few drove the total, which is precisely the
mechanism behind 40 Maple #5's phantom floor. **Revised: the 63 Shady 8/28 volume is NOT
trustworthy and should be held out of billing pending review** — treat it like a fault-day,
not a catch-up day. Note its rejPct has since fallen back to 11, so the meter is not
chronically broken; it had a bad two days.

## FINDING 3 — 40 Maple #5's rejection storm began 8/12, two weeks before the over-billing

    8/08:55  8/09:0  8/10:0  8/11:8  8/12:97  then 97-99 EVERY day through 8/30

I had dated its onset to ~8/26-8/27 from the register. **The register is a lagging
indicator.** Rejection went chronic on **8/12**; the visible over-billing only began around
8/27 when the offset parked. The chronic rejection created the vulnerability; the offset
drift then turned it into fabricated volume.

**Consequence for the fleet screen: rejPct would have flagged this device two weeks before
any billing anomaly was visible.** That is the argument for making it the primary monitor
rather than a diagnostic.


---

---

# 5019 Spruce (75364883) — and the wedge story now resolves properly

Bruce: *"Metering - good data - unconfirmed tnorm jump with no water - clean - not flipped -
data wedged FW 17021/TI 0 > 17037/344"*

FW history confirms it exactly:

    fwVer  : 16148@07-10 | 17021@08-06 15:14 | 17028@08-10 13:44 | 17037@08-23 15:02
    fwVerTi:  296@07-10  |     0@08-06 15:14 |   341@08-10 13:48 |   344@08-23 15:05

It sat at **17021 with fwVerTi = 0 from 8/6 to 8/10** — four days. "Unconfirmed tnorm jump"
is also correct: it produced no records during the 8/27 water-off block, so there was
nothing to judge.

## FINDING — `fwVerTi = 0` is the wedge signature, and it is trivially monitorable

TI version 0 shows up at *every* TIFOTA, but normally for **2-5 minutes** while the TI is
reflashed:

    83 Shady    296 -> 0 @ 08-07 13:49 -> 341 @ 08-07 13:52     3 min   normal
    144 Old     260 -> 0 @ 07-31 11:41 -> 320 @ 07-31 11:44     3 min   normal
    40 Maple#3    0 @ 07-15 02:52 -> 314 @ 07-15 02:55          3 min   normal

When it **persists**, that is the wedge:

    5019 Spruce 296 -> 0 @ 08-06 15:14 -> 341 @ 08-10 13:48   **4 DAYS**  WEDGED
    58 Shady    320 -> 0 @ 08-02 14:22 -> 325 @ 08-04 13:38   **2 DAYS**  WEDGED

**`fwVerTi == 0` for more than ~10 minutes is a clean, unambiguous, fleet-wide wedge alarm.**
No inference required, no flow records needed — it works on exactly the devices that have
gone silent.

## Which firmware actually cures the wedge

Record coverage re-pulled day-by-day (the first attempt was truncated by the 50,000-row cap
— 40 Maple #3 alone logged 40,080 records in a single day, so its earlier "gaps" were
artifacts and are withdrawn):

| Device | Cured by | Evidence | Result |
|---|---|---|---|
| **144 Old** | **17037/344** (8/13) | records **every day** 8/15-8/30 | fully cured |
| **5019 Spruce** | 17037/344 (8/23) | records 8/23, 8/24, 8/29 only | **partial** — sporadic |
| **58 Shady** | **17040/354** (8/28) | records 8/28, 8/29, 8/30 | fully cured |
| **83 Shady** | **17040/354** (8/30 15:58) | first records 8/30 16:01 | cured today |
| **40 Maple #3** | 17040/354 (8/26) | **no records any day 8/15-8/30** | **NOT cured** |

Three conclusions:

1. **The wedge remedy arrives at 17037/344, not only 17040/354.** 144 Old has been producing
   records every single day since 17037/344 landed on 8/13. My earlier note credited the fix
   solely to 17040/354 — that was too narrow.
2. **17040/354 looks more reliable at it.** 5019 Spruce on 17037/344 is only sporadic
   (3 days of records in the last 16), while 58 Shady and 83 Shady both resumed immediately
   on 17040/354.
3. **Neither version helps a device whose calibration has failed.** 40 Maple #3 has been on
   17040/354 since 8/26 and has produced **zero** flow records since. Its `offset 0 /
   failedCal / gain 55` state is the blocker. **It needs a forced recal, not another FOTA** —
   worth stating plainly before anyone assumes the rollout will sweep it up.

Also worth separating: Bruce noted 144 Old "gets wedged / no usage now". The wedge is
**cured** — it records daily. The absence of usage is the separate, already-established lot
144 finding (verified against the witness meter back on 8/8): that lateral genuinely carries
no water.

## 5019 Spruce classification

**WATCH.** Meter reads clean when it reports (rejPct 10, no alarms, NOT FLIPPED), but on
17037/344 it is only producing records 3 days in 16. It is a candidate for the 17040/354
push, which has a better record on this exact fault.


---

---

# 136 Shady (75365898) — CONFIRMED CLEAN (textbook)

Bruce: *"Metering - good data - no tnorm jump with no water - clean - flipped"*

Live: `fw 17028/341, gain 29, env 42, offset 2115, FLIPPED, fdAlarm false, offsetAlarm
false, leakSus false, rejPct 1, tnormStddev 48, upamp 530, rsrp -104, meterVal 3613.1`

Water-off block: tofNorm median **-6**, sd **44**, **0.0 gal** fabricated, zero transitions.

**rejPct over 30 days: median 0, max 13** — the cleanest rejection profile measured so far.
Every metric sits mid-band. **No action.**

## Consolidated clean-lot reference table

Eleven lots now confirmed clean. Their spread defines the healthy envelope:

| Lot | Device | rejPct (now / med / max) | tnormSd | upamp | gain | env | Water-off tofNorm / sd / gal |
|---|---|---|---|---|---|---|---|
| 136 Shady | 75365898 | 1 / 0 / 13 | 48 | 530 | 29 | 42 | -6 / 44 / 0.0 |
| 148 Shady | 75366029 | 26 / 0 / 47 | 70 | 967 | 26 | 35 | +14 / 44 / 0.0 |
| 154 Shady | 79466858 | 3 / - / - | 41 | 739 | 26 | 41 | +8 / 54 / 0.0 |
| 84 Shady | 75363992 | 0 / - / - | 93 | 649 | 29 | 48 | +29 / 52 / 0.0 |
| 44 Shady | 75368439 | 2 / - / - | 45 | 1496 | 41 | 43 | -14 / 48 / 0.0 |
| 5027 Spruce | 79466304 | 0 / - / - | 69 | 737 | 35 | 44 | +13 / 68 / 0.0 |
| 103 Shady | 75364586 | 1 / - / - | 49 | 499 | 32 | 40 | insufficient (5 cells) |
| 126 Shady | 79466007 | 0 / - / - | 34 | 930 | 29 | 44 | -21 / 39 / 0.0 |
| 33 Maple | 75365302 | 0 / - / - | 99 | 935 | 44 | 43 | +87 / 140 / 0.1 |
| 66 Shady | 75362887 | 10 / 1 / 17 | 173 | 718 | 26 | 39 | (no records that day) |
| 152 Shady | 75366953 | 0 / - / - | 159 | 280 | 38 | 37 | +36 / 164 / 1.1 |

**Healthy envelope:** rejPct median 0-1 (transient spikes to ~47 are tolerable),
tnormStddev 34-173, upamp 280-1496, gain 26-44, env 35-48, water-off tofNorm within
+-90 counts, fabricated volume <= 1.1 gal / 4 h.

The envelope is wide on every axis **except rejPct median** — which is 0 or 1 for all
eleven. That is the whole argument for making it the primary screen: it is the only metric
where healthy devices agree with each other.


---

---

# 40 Maple APT #0 (65824917) — clean meter, and it triggers a BUILDING-level finding

Bruce: *"Metering - good data - no tnorm jump with no water - clean - not flipped - low usage"*

Live: `fw 17028/341, gain 26, env 35, offset -807, NOT FLIPPED, no alarms, rejPct 0
(median 0, max 1 over 32 days), tnormStddev 43, upamp 2038, rsrp -96, meterVal 108.0`

Water-off block: tofNorm **+37**, sd **116**, 0.4 gal. **Meter confirmed clean.**

## CORRECTION — upamp is NOT predictive on its own. Retracting my earlier rule.

APT #0 carries **upamp 2038, the third highest on site**, with rejPct 0 and tnormSd 43. It is
entirely healthy. I previously wrote that "every device above 1,600 is at least degrading" —
**that is wrong and is withdrawn.**

What actually separates the faulty devices is amplitude *together with* a railed gain:

| Device | upamp | gain | rejPct | Verdict |
|---|---|---|---|---|
| 5033 Spruce | 2770 | **41** | **83** | FAULTY |
| 21 Maple | 2482 | **44** | **74** | FAULTY |
| **APT #0** | **2038** | **26** | **0** | **CLEAN** |
| APT #4 | 1747 | 26 | 0 | watch (sd 167) |
| 44 Shady | 1496 | 41 | 2 | clean |

**A strong signal is not a problem. A strong signal that still needs gain 41-44 is** — that
combination means the front end is fighting something. Amplitude alone tells you nothing;
`rejPct` remains the only metric on which healthy devices agree.

## THE BUILDING FINDING — 3 of 6 units at 40 Maple record essentially zero

Bruce's "low usage" note prompted a look at all six units. 21 days of register deltas:

| Unit | Device | 21-day total | Pattern |
|---|---|---|---|
| APT #0 | 65824917 | **39.5 gal** | trickle 8/13-8/21, then **zero for 9 straight days** |
| APT #1 | 77041962 | 782.6 gal | 20-84/day, steady — normal |
| APT #2 | 77054957 | **0.2 gal** | zero every single day |
| APT #3 | 70269798 | **0.0 gal** | zero every single day (failedCal, no records since 8/5) |
| APT #4 | 65828520 | 890.2 gal | 18-106/day, steady — normal |
| APT #5 | 70267966 | 3,029.7 gal | 59-355/day and **climbing** — the phantom |

**All six are `Billable=True`, `No Water=False`, `Vacant` unset.** (The Move Dates all cluster
7/30-7/31, which looks like a bulk data-entry artifact rather than six real move events.)

So the building runs: **1 unit over-billing (APT #5 phantom), 3 units billing nothing, 2 normal.**
Four of six anomalous.

The three zero units are three *different* situations, which matters for the fix:

- **APT #3** — `failedCal`, offset 0, zero flow records since 8/5. Genuinely cannot measure.
  Needs a forced recal. Its zero is a meter fault.
- **APT #2** — meter screens **clean** (tofNorm -1, sd 37, rejPct 0) yet reads 0.2 gal in 21
  days. A healthy meter seeing no water = wrong lateral, or an unoccupied unit.
- **APT #0** — meter clean, and it **did** record 39.5 gal between 8/13 and 8/21, then went to
  exact zero for nine days. That recorded usage rules out a wrong-lateral install (it has
  seen that unit's water). Either the unit emptied around 8/21, or its supply was shut.

**This is the one question on the whole site that only the customer can answer: are APT #0,
#2 and #3 occupied?** If they are, that is unbilled water on three units and a plumbing
investigation. If they are vacant, the TB attributes are wrong and should be corrected so
billing stops treating them as active. Either way it is a single site visit to one building
that also covers the APT #5 phantom recal — **the highest-value field trip available.**


---

---

# 40 Maple APT #2 (77054957) — Bruce's flipped-tnorm event cracks it open

Bruce: *"Metering - good data - no tnorm jump with no water - clean - flipped - no usage -
found one event flipped tnorm"*

Live: `fw 17028/341, gain 26, env 35, offset 2425, flowDirection **UNKNOWN**, no alarms,
rejPct 0, tnormStddev 21, upamp 1288, meterVal 1.727`

At rest it is one of the healthiest meters on site — **tnormStddev 21, rejPct 0, median
tofNorm -4**. Direction reads UNKNOWN now; it was briefly FLIPPED 7/20 12:55 -> 7/22 09:18
(the only window where `flowDirPeak` and `flowDirSkew` were non-zero, both 2).

## FINDING 1 — it is CYCLE-SKIPPING, and the tofNorm values prove it

Every non-zero sample lands on an exact multiple of **2024**:

    tofNorm  +2024 -> flowRate +0.5527      tofNorm  -2024 -> flowRate +0.5527
    tofNorm  +4048 -> flowRate +1.1054      tofNorm  -4048 -> flowRate +1.1054
    tofNorm  +6072 -> flowRate +1.6581      tofNorm  -6073 -> flowRate +1.6584
    tofNorm -41666 -> flowRate +11.3780

2024, 4048 (2x), 6072 (3x) — quantised steps, which is the signature of the correlator
locking one acoustic lobe over. The -41666 excursion is a very large skip. **These are not
measurements of water; they are lock errors quantised by the ultrasonic period.**

## FINDING 2 — negative tofNorm is being RECTIFIED into positive flow, observed directly

Of 777 non-zero flowRate samples, **zero are negative** — while 654 tofNorm samples are
below -100. The matched pairs above make it unambiguous: `tofNorm -6073` produces
`flowRate +1.6584`, the same positive value as `tofNorm +6072`.

**This is the measure.c:359 rectify-under-UNKNOWN phantom path, caught in the field with
matched sample pairs.** It has been an open item in [[copper-m-2026-08-16]]; this is direct
field evidence rather than inference. Worth handing to the firmware thread: a sign-flipped
skip is silently converted into forward, billable flow.

Here it costs almost nothing because the meter so rarely triggers — but on a device that
skips often, this is exactly how a phantom is manufactured.

## FINDING 3 — the recorded "usage" is fabricated, so the unit really has seen no water

Events exist on only three days in 40:

    07-20:  46 events,  8.725 gal      <- all quantised skips, 3-6 s each, mostly 0.1896 gal
    07-30:   2 events,  0.555 gal
    08-06:   1 event,   1.499 gal

The 7/20 burst is 46 events of 3-6 seconds, repeatedly landing on exactly 0.1896 gal at
3.793 gpm — a fixed quantum, not plumbing. **So APT #2's lifetime 1.7 gal is not "a little
water", it is essentially all artefact.** The unit has recorded no real consumption at all.

That strengthens the building conclusion rather than weakening it: a healthy meter
(tnormStddev 21) that has seen zero real water in 40 days is either **on the wrong lateral
or serving an empty unit** — and the register wipe from 30,206 is a separate, earlier fault.

**Field test when someone visits 40 Maple: run water inside APT #2 and watch this meter.**
If it does not respond, the lateral is wrong. That single test settles it, and the building
visit is already justified by APT #5.

## Note on direction

Bruce read "flipped"; the live value is **UNKNOWN**, with a brief FLIPPED spell 7/20-7/22.
Both are consistent — the flipped-sign tnorm he spotted is the skip artefact, not a
direction latch. Worth keeping the distinction: **a sign-flipped sample is not the same as a
flipped install**, and under UNKNOWN the firmware rectifies the former into forward flow.


---

---

# 116 Shady (70268832) — CONFIRMED CLEAN, and its "low usage" is a different animal

Bruce: *"Metering - good data - no tnorm jump with no water - clean - flipped - low usage"*

Live: `fw 17028/341, gain 26, env 35, offset -3140, FLIPPED, no alarms, rejPct 9
(median 0, max 9 over 30 days), tnormStddev 45, upamp 1840, meterVal 41106.7`

Water-off block: tofNorm **-57**, sd **92**, 0.1 gal fabricated. **Clean.**

## Low usage here is real consumption, not a zero-usage fault

    register 40,892.0 (7/25) -> 41,106.7 (8/30) = 214.7 gal over 36 days = ~6 gal/day
    daily: +7 +4 +16 +15 +15 +2 +15 +15 +3 +16 +13 +7 +2 +3 +6 +9 +2 +21 +12 +6 +11 +7

**It records water every single day, 2-21 gal.** That is the crucial difference from the
40 Maple zero-usage units: APT #0 went to exact zero for nine consecutive days and APT #2
has never recorded real water at all. 116 Shady is simply a low-consumption household —
one or two people, no leaks, no irrigation. **No occupancy question here.**

## No cycle-skip signature

Checked against the APT #2 pattern: its large tofNorm excursions are all *distinct* values
(-2727, -4265, -4255, -4671, -5052, -5465, -6627, -11090), not multiples of a fixed quantum,
and 239 distinct values across 280 non-zero flowRate samples. Varied, not quantised —
**this is measurement noise, not lock error.**

Its negative tofNorm producing positive flowRate is *correct* here and not the rectification
fault: the device is latched **FLIPPED**, where forward flow legitimately yields negative
tofNorm. The APT #2 tell was that **both** signs (+6072 and -6073) mapped to the same
positive flow under **UNKNOWN**. Sign convention alone is not evidence of a fault — the
direction state has to be read with it.

## upamp 1840 with gain 26 — another clean high-amplitude device

Third confirmation that amplitude alone means nothing (after APT #0 at 2038 and 44 Shady at
1496). Strong signal, low gain, rejPct 0 — healthy.

*Method note: a 50,000-row DESC query over a 6-day window returns only the most recent ~14
hours at 1 Hz. The sample-level figures above cover that window, not six days.*


---

---

# Lot 138 (65823489) — CONFIRMED CLEAN, and it sets the site benchmark

Bruce: *"Metering - good data - no tnorm jump with no water - clean - not flipped"*

Live: `fw 17028/341, gain 26, env 35, offset -734, NOT FLIPPED, no alarms, rejPct 0
(median 0, max 5 over 30 days), tnormStddev 20, upamp 1343, rsrp -93, meterVal 2005.1`

Water-off block: tofNorm **-33**, sd **27**, **0.0 gal** fabricated, zero transitions.

**This is the healthiest meter on the site.** tnormStddev **20** is the lowest of all 36,
sd 27 during the water-off block is the tightest measured, rejPct sits at 0 with a 30-day
max of only 5, and rsrp -93 is the strongest signal seen here.

Usage is unremarkable and healthy — 25-99 gal/day every day, averaging about 60:

    +99 +98 +64 +81 +54 +63 +42 +47 +76 +39 +26 +74 +53 +93 +52 +38 +40 +78 +79 +25 +32 +78

**No action. Use this device as the reference when judging borderline cases** — it defines
what "good" looks like on this hardware at this site.


---

---

# 75 Shady (75363901) and 96 Shady (75366011) — both CONFIRMED CLEAN

Bruce, both: *"Metering - good data - no tnorm jump with no water - clean"* (75 flipped,
96 not flipped).

| | 75 Shady | 96 Shady |
|---|---|---|
| FW | 17037/344 | 17037/344 |
| gain / env | 26 / 37 | 26 / 37 |
| offset | 3152 | -2452 |
| direction | **FLIPPED** | **NOT FLIPPED** |
| rejPct (now / med / max) | 0 / 0 / 31 | 0 / 0 / 5 |
| tnormStddev | **28** | **27** |
| upamp | 836 | 991 |
| rsrp | **-123** | -108 |
| Water-off tofNorm / sd / gal | -9 / 31 / 0.0 | +10 / 22 / 0.0 |

Both are excellent — tnormStddev 27-28 and water-off sd 22-31 put them just behind lot 138
(20 / 27) as the tightest meters on site. No alarms, no fabricated volume, direction stable
and matching Bruce on both. Usage is normal and daily (75 Shady ~23 gal/d, 96 Shady ~25 gal/d).

## 75 Shady had a 26-hour TI-0 episode and recovered on its own

    fwVerTi: 260@07-25 | 0@07-31 12:05 | 320@08-01 14:06 | 325@08-04 | 328@08-05 | 341@08-06 | 344@08-13

**`fwVerTi = 0` from 7/31 12:05 to 8/01 14:06 — about 26 hours**, well past the 10-minute
normal reflash window, so by the wedge criterion this counts. It cleared when TI v320 landed
on 8/1 and has been healthy since; records are daily from 8/12 onward (a 3-day record gap
8/9-8/11 also closed).

**This extends the TI-0 duration ladder usefully:**

| Duration | Devices | Outcome |
|---|---|---|
| 2-5 min | 83 Shady, 144 Old, 40 Maple #3 | normal reflash |
| **26 hours** | **75 Shady** | **recovered at the next TI push** |
| 2 days | 58 Shady | needed 17040/354 |
| 4 days | 5019 Spruce | 17037/344, still only sporadic |

So a TI-0 alarm should not fire instantly at 10 minutes — but anything past roughly an hour
is real, and the longer it persists the less likely it clears without intervention. **A
sensible fleet rule: warn at 1 hour, escalate at 24 hours.**

## A caution on reading register gaps

Both devices show `+0` register deltas on scattered early-August days (75 Shady on 8/6 and
8/13; 96 Shady on 8/5, 8/7, 8/13, 8/15). Those are **not** wedges or lost water — the meters
have flow records on those days, they simply reported the register on a day with no usage.
The gap-carry test from 5013 Spruce is the right tool here, and it clears both.

**rsrp -123 on 75 Shady is worth a note**: that is the second-weakest signal on site after
83 Shady (-125), yet it reports daily with perfect health. **Weak signal alone does not cause
the wedge** — useful for ruling out an easy but wrong hypothesis.


---

---

# 40 Maple APT #1 (77041962) — CONFIRMED CLEAN, and it completes the building

Bruce: *"Metering - good data - no tnorm jump with no water - clean - flipped"*

Live: `fw 17028/341, gain 26, env 35, offset 789, FLIPPED, no alarms, rejPct 0
(median 0, max 34 over 30 days), tnormStddev 20, upamp 1394, meterVal 1300.1`

Water-off block: tofNorm **-6**, sd **40**, **0.0 gal** fabricated. Usage normal and daily,
19-100 gal/day (~45 average).

**tnormStddev 20 ties lot 138 for the lowest on the entire site.**

## All six units at 40 Maple are now reviewed — and the faults are NOT environmental

| Unit | tnormSd | rejPct | upamp | 21-day usage | Verdict |
|---|---|---|---|---|---|
| APT #0 | 43 | 0 | 2038 | 39.5 gal | clean meter, **zero for 9 days** — occupancy |
| **APT #1** | **20** | **0** | 1394 | 782.6 gal | **CLEAN — best-tied on site** |
| APT #2 | 21 | 0 | 1288 | 0.2 gal | **cycle-skipping**, no real water |
| APT #3 | 0 | 0 | 233 | 0.0 gal | **failedCal**, cannot measure |
| APT #4 | 167 | 0 | 1747 | 890.2 gal | watch — noisy |
| APT #5 | 25 | **99** | 1092 | 3,029.7 gal | **PHANTOM** ~289 gal/day |

**This is the important conclusion for the field visit: the 40 Maple problems are four
independent device faults, not one building-wide cause.** APT #1 sits in the same building,
on the same plumbing, on the same firmware — with the joint-best signal quality on site. So
the working hypotheses that would have been natural (bad acoustics in that building, a
shared plumbing anomaly, an install batch defect) are all ruled out by APT #1 and APT #4
metering normally beside them.

Each unit needs its own remedy:

- **APT #5** — recal on verified no-flow (phantom, over-billing).
- **APT #3** — forced recal (failedCal; the FOTA already reached it and did not help).
- **APT #2** — run water inside the unit and watch the meter (lateral test).
- **APT #0** — occupancy confirmation from the customer.

One visit covers all four, but they are four different jobs, not one fix.

Note APT #1's rejPct max of 34 and APT #4's noise sit alongside spotless medians — more
support for **median, not max**, as the chronic-fault discriminator.


---

---

# 168 Shady (75368397) — clean on the test, but ACTIVELY DEGRADING. Two alarms fired today.

Bruce: *"Metering - good data - no tnorm jump with no water - clean - flipped - a little noisy"*

Live: `fw 17028/341, gain 38, env 44, offset 385, FLIPPED, rejPct 5 (median 0, max 53),
tnormStddev 158 (median 88, max 440), upamp 834, L_FACTOR 2.22, meterVal 5314.6`

Water-off block (8/27): tofNorm **+43**, sd **85**, **0.0 gal** fabricated. Clean that day,
and Bruce's "a little noisy" is confirmed — tnormStddev median 88 against a site median
nearer 40.

## Two alarms went true TODAY — and both are new since 8/1

    leakSus     : false @ 08-01 ... -> TRUE @ 08-30 13:45
    offsetAlarm : false @ 08-01 ... -> TRUE @ 08-30 13:45

Neither had fired at any point in the previous 29 days. Given `leakSus` proved exactly right
on 126 Shady (true for precisely the duration of that 10,698 gal leak), it deserved checking
rather than dismissing.

## The leak alarm looks like a FALSE POSITIVE — the flow pattern is diurnal, not continuous

Last 12 hours of 1 Hz samples:

    hour   %nonzero    gal    med flow
    01:00     1.8%     0.08    0.062
    02:00     6.8%     2.93    0.813
    03:00     4.3%     1.70    0.850
    04:00     0.2%     0.01    0.092     <-- six consecutive hours
    05:00     0.4%     0.02    0.069         essentially idle
    06:00     0.6%     0.03    0.067
    07:00     0.2%     0.01    0.071
    08:00     0.6%     0.03    0.074
    09:00     0.5%     0.02    0.060
    10:00     6.2%     2.25    0.790
    12:00     9.1%     3.35    0.787
    13:00     9.2%     1.68    0.903

Total 12.18 gal over 12 hours (~24 gal/day), only **3.0% of samples non-zero**, and the
**longest fully-idle run is 46 minutes**. A real leak cannot do that — 126 Shady's ran at
700-1,000 gal/day with no idle periods at all. This is ordinary household usage: quiet
overnight, active morning and midday.

**Recommend not escalating this to the customer as a leak.** Worth noting as a
false-positive data point for the `leakSus` detector, which otherwise has a perfect record
here.

## The real finding — the env walker has been RATCHETING for 25 days

    env : 33 (8/05) -> 36 (8/07) -> 38 (8/12) -> 39 (8/13) -> 41 (8/16)
          -> 42 (8/19) -> 43 (8/29) -> 44 (8/30)
    gain: 35 -> 55 (scan) -> 35 -> 55 -> 35 -> 55 -> 38 (8/07, and held since)
    offset: 238 (8/09) -> 336 (8/12) -> 385 (8/21)

**Monotonic climb, never once stepping back down.** This device is on **17028/341 — pre-v349**,
which is exactly the firmware whose envTest walker ratchets with no decay path (the v349
notes record walkers sitting at 41-45 for hours on the bench, which is why decay-after-60-
clean-aggs was added).

So the picture is coherent: env ratchets up, measurement quality degrades, tnormStddev
climbs (median 88, max 440), the offset drifts 238 -> 385, and today both the offset and
leak alarms trip. **This is not a broken meter yet — it is a meter on a trajectory**, and it
is the clearest in-field example of the degradation v349 was written to stop.

**Classification: WATCH, and the best FOTA candidate on the site.** Unlike the wedged
devices (where the FOTA restores comms) or 40 Maple #3 (where it cannot help), here the
v349 walker-decay fix addresses the actual mechanism. Re-check env and tnormStddev in a
week; if env is still climbing, prioritise it.


---

---

# 29 Maple (75366938) — CONFIRMED CLEAN, and it takes the site record

Bruce: *"Metering - good data - no confirmation tnorm jump with no water - clean - not
flipped - low offset mostly no constant flow"*

Live: `fw 17037/344, gain 26, env 42, offset -661, NOT FLIPPED, offsetStable true, all
alarms false, rejPct 0 (median 0, max 5 over 29 days), tnormStddev 17, upamp 1223,
meterVal 1014.8`

**tnormStddev 17 is the lowest on the entire site**, ahead of lot 138 and APT #1 (both 20).

Every one of Bruce's observations checks out:

- **"no confirmation ... with no water"** — correct, and for a good reason: it produced only
  **132 samples** during the 8/27 water-off block, far below the threshold to judge. There
  was nothing to confirm.
- **"mostly no constant flow"** — confirmed decisively: over the last ~12 hours only
  **0.5% of samples are non-zero** (205 of 44,772), totalling 6.73 gal, and the **longest
  fully-idle run is 390 minutes — 6.5 hours**. This device is genuinely at rest most of the
  time. Usage is low and normal (3-17 gal/day, with occasional 55-61 gal days).
- **"low offset"** — confirmed, -661 is among the smallest magnitudes on site.

## Note on offset magnitude: it is an install property, not a health metric

Since "low offset" came up, worth recording that it does not predict anything:

| Low magnitude | Health | High magnitude | Health |
|---|---|---|---|
| 168 Shady 385 | **degrading** (env ratchet) | 144 Old -7700 | cured, healthy |
| 152 Shady 652 | clean (low signal) | 83 Shady -5975 | recovered, healthy |
| **29 Maple -661** | **best on site** | 126 Shady 5495 | clean |
| 138 -734 | site benchmark | 5027 Spruce -5713 | clean |
| 40 Maple #5 735 | **PHANTOM** | 5033 Spruce 2557 | **FAULTY** |

Both extremes contain healthy and faulty devices. Offset records how far the acoustic path
sits from nominal at commit time — **what matters is whether it is STABLE and whether the
quiet baseline sits near zero**, not its magnitude. 29 Maple has `offsetStable true` and a
history that has held at -626 to -675 since 8/7; 168 Shady has a small offset that has
drifted 238 -> 385. The second is the concerning one.


---

---

# 15 Maple (79461115), 76 Shady (79455422), 106 Shady (79466379) — all CONFIRMED CLEAN

| | 15 Maple | 76 Shady | 106 Shady |
|---|---|---|---|
| FW | 17037/344 | 17028/341 | 17028/341 |
| gain / env | 35 / 39 | 26 / 47 | 26 / - |
| offset | -1844 | **158** | 756 |
| direction | NOT FLIPPED | NOT FLIPPED | NOT FLIPPED |
| rejPct now / med / max | 3 / 0 / 34 | 0 / - / - | 0 / - / - |
| tnormStddev | 66 | 37 | - |
| upamp | 1200 | 1000 | - |
| Water-off tofNorm / sd / gal | (132 samples only) | (no records) | **-39 / 46 / 0.0** |

All three clean. 106 Shady was in fact **one of the two healthy controls** the whole
water-off analysis was calibrated against. Bruce's "low offset" holds for 76 Shady (**158**,
the smallest magnitude on site) and "mostly no constant flow" is confirmed on both 15 Maple
(0.8% non-zero, 209-min idle runs) and 29 Maple.

## 15 Maple: the L-factor concern is RESOLVED — my 2.255 flag was a 23-hour transient

    L_FACTOR: 2.22 (7/25) | 2.13 (7/31) | 2.22 | 2.13 (8/07) | 2.255 (8/25 16:11) | 2.22 (8/26 15:36)

It reads **2.22 today**, matching the site standard for 1/2 inch PEX (pipesize U+00BD,
pipeType X, dia 0.485). The 2.255 I flagged in the 8/26 audit existed for about
**23 hours** and self-corrected. **Withdraw the "~7.5% under-read" item — there is nothing
to fix here.** (The 2.13 values are the transient fallback seen during recal, the same value
40 Maple #3 is stuck at.)

## 15 Maple was WEDGED for 18 days — a fifth case

    meterVal  3089 @ 08-07 15:45  ->  3089 @ 08-25 16:11   (identical, 18 days)
    fwVer     17028/341 @ 08-07 15:45  ->  17037/344 @ 08-24 16:31
    tofNorm   sparse 8/8-8/23 (only 8/9, 8/17) -> DAILY from 8/24

The freeze began at the moment the 17028/341 FOTA landed and ended when 17037/344 arrived.
Register resumed 8/26. **Roughly 18 days of usage went unrecorded** — add to the billing
list alongside 5013 Spruce.

---

# FIRMWARE vs WEDGE — I tested my own hypothesis across all 36 and it FAILED

The 15 Maple case made "17028/341 is the wedging version" look compelling. It is **wrong**,
and the full-site data says so plainly. Current tofNorm coverage over the last 5 days:

| Firmware | Devices | Avg coverage | Silent (0/5) |
|---|---|---|---|
| **17028/341** | **19** | **4.74 / 5** | **0** |
| 17037/344 | 14 | 4.57 / 5 | 0 |
| 17040/354 | 3 | 1.33 / 5 | 1 |

**Nineteen devices are sitting on 17028/341 right now and every one of them is reporting**,
averaging 4.74 of the last 5 days. If that version wedged devices, they would be silent.
The 17040/354 group only looks bad through selection bias — those three devices *received*
17040/354 precisely because they were already wedged (40 Maple #3 is still silent from
failedCal; 83 Shady recovered only today).

**Corrected conclusion: the wedge is a FOTA-TRANSITION failure, not a property of any
destination version.** The TI sometimes fails to come back after a TIFOTA — that is what
`fwVerTi = 0` persisting records — and the cure is simply another FOTA attempt, whichever
version it happens to carry. Every wedge here began at a FOTA and ended at the next one.

**Observed wedge rate: 8 of 36 devices = 22%** (5013 Spruce, 5019 Spruce, 15 Maple, 83 Shady,
58 Shady, 144 Old, 75 Shady, 40 Maple #3), nearly all onset in the 7/31-8/07 FOTA wave.

### What this means for the fleet rollout

1. **Budget for roughly a 20% wedge rate on any FOTA wave**, and plan a second push. This is
   the number to carry into the rollout plan, not an assumption of clean uptake.
2. **Monitor `fwVerTi == 0` during and after every wave** — warn at 1 hour, escalate at 24.
3. **Wedged devices lose real billing volume while silent** (15 Maple ~18 days, 5013 Spruce
   ~9 days). The cost of a wedge is not just visibility.
4. **Do not defer the rollout on wedge risk alone** — the risk lives in the transition and
   is the same whichever version is the target. It is a reason to stage and monitor, not to
   hold.


---

---

# 132 Shady (75365427) — CONFIRMED CLEAN. **Review complete: 36 of 36.**

Bruce: *"Metering - good data - no tnorm jump with no water - clean - not flipped"*

Live: `fw 17028/341, gain 38, env 41, offset -168, NOT FLIPPED, offsetStable true, all
alarms false, rejPct 0, tnormStddev 221, upamp 1187, meterVal 3744.9`

Water-off block: tofNorm **-44**, sd **43**, **0.0 gal** fabricated, zero transitions.

One note: `tnormStddev 221` is the highest current reading among the clean lots, and gain 38
is elevated — the same low-headroom shape as 152 Shady. But rejPct 0, offsetStable true, a
clean water-off baseline (sd 43) and no alarms mean there is no fault. **Clean, worth a
glance next pass** for the gain/noise combination.

---

# ============ REVIEW COMPLETE — ALL 36 LOTS ============

## Final classification

| Status | Count | Lots |
|---|---|---|
| **Confirmed faulty** | **3** | 21 Maple (phantom ~677 gal/d), 40 Maple APT #5 (phantom floor ~289 gal/d), 5033 Spruce (deaf, rejPct 83) |
| **Cycle-skipping** | **1** | 40 Maple APT #2 (healthy at rest; its recorded volume is artefact) |
| **Wedge — cured** | **5** | 144 Old, 58 Shady, 83 Shady, 75 Shady, 15 Maple |
| **Wedge — NOT cured** | **1** | 40 Maple APT #3 (failedCal; needs a forced recal, not a FOTA) |
| **Watch** | **6** | 5013 Spruce, 5019 Spruce, 144 Test, 40 Maple APT #4, 63 Shady, 168 Shady |
| **Clean** | **22** | 44, 5027 Spruce, 103, 126*, 33 Maple, 66*, 154, 84, 152, 148, 136, APT #0, 116, 138, 75, 96, APT #1, 29 Maple, 15 Maple, 76, 106, 132 |

\* 126 Shady direction-unstable (4 changes since 8/2); 66 Shady mildly noisy.

## The customer's under-registration claim — final answer

**The claim was correct, but the cause was not what anyone expected.** The site's biggest
billing error runs the *other* way:

| Effect | Lots | Magnitude |
|---|---|---|
| **OVER-billing (phantom)** | 21 Maple, 40 Maple #5 | **~966 gal/day combined**, 21 Maple alone has banked 4,257 gal since 8/24 and is still accruing |
| **UNDER-billing (lost)** | 15 Maple (18 d), 5013 Spruce (~740 gal), 83 Shady (23 d), 58 Shady, 5033 Spruce | wedge outages plus one deaf meter |
| **Customer-side, not a meter fault** | 126 Shady | 10,698 gal real leak 8/11-8/23, stopped 8/24 |

## Actions

**Field — one visit to 40 Maple covers four jobs:**
1. APT #5 — recal on verified no-flow (phantom, over-billing the tenant).
2. APT #3 — forced recal (failedCal; the FOTA reached it and did not help).
3. APT #2 — run water inside the unit, watch the meter (lateral test).
4. APT #0 — occupancy confirmation.

**Field — elsewhere:**
5. 21 Maple — highest priority overall; the error grows ~690 gal every day it stays live.
6. 5033 Spruce — recal or replace; this is the meter actually behind the complaint.

**Remote:**
7. FOTA 168 Shady (env ratchet; v349 walker-decay addresses the mechanism).
8. 5019 Spruce — push 17040/354; still only sporadic on 17037/344.
9. Watch 76 Shady (31 h since last report).

**Billing:**
10. 21 Maple credit; 40 Maple #5 forward exposure only (register-arbitrated).
11. Hold 63 Shady's 8/28 +951 gal (banked during 96-98% rejection).
12. Recover the wedge outages; **never difference 5013 Spruce's register across 8/5**.

**Customer:**
13. Are 40 Maple APT #0, #2 and #3 occupied? Three billable units recording ~zero.

## What this site taught us, for the fleet

1. **`rejPct` MEDIAN is the only reliable primary screen.** It caught all 3 faulty lots and
   is 0-1 on all 22 clean ones. Daily max false-flags healthy meters (148 Shady 47, APT #1
   34, 168 Shady 53). It would have flagged 40 Maple #5 **two weeks** before any billing
   anomaly appeared.
2. **Every other metric fails**: upamp (clean at 2038, faulty at 233), tnormStddev (40 Maple
   #5 sits at 25, beside the best meters), offset magnitude, gain, rsrp.
3. **`fwVerTi == 0` persisting = wedged.** Warn at 1 h, escalate at 24 h. Works on silent
   devices. Normal reflash is 2-5 minutes.
4. **The wedge is a FOTA-transition failure, not a bad version — expect ~20% per wave** and
   plan a second push. Wedged devices lose real billing volume, not just visibility.
5. **Negative tofNorm is rectified into positive flow under UNKNOWN direction** — confirmed
   in the field with matched sample pairs (APT #2). measure.c:359.
6. **Cycle-skip signature = tofNorm quantised at fixed multiples** (2024 on APT #2).
7. **`leakSus` works but needs confirming** — right on 126 Shady, false on 168 Shady. Always
   check flow continuity (idle runs, %non-zero) before telling a customer.
8. **The Shady phantoms are NOT DTHRES latched fossils** — longest bit-identical non-zero run
   on site is 3 samples. They can come off that fleet scan.
9. **Use the gap-carry test** to tell a reporting gap from lost water, with no field visit.
10. **Faults are per-device, not environmental** — APT #1 has the joint-best signal quality
    on site while sharing a building with four broken meters.

**Standing item: `recordNoneventFlow` is still ON at the Shady Lane group level. Revert it
now that collection is complete** (this is the attribute that filled 75368777's flow ring and
caused the 8/8 session storm).
