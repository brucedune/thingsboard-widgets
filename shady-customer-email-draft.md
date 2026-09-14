# DRAFT — customer email, Shady Lane MHP (for Bruce's review; NOT sent)

**Subject:** Shady Lane — meter review complete, findings and plan

---

Hi [Name],

Following our discussion about under-registration at Shady Lane — our meters totalling
roughly **2,000 gallons a day** against your **4,000** — we have completed a full review of
all 36 meters.

You ran a per-lot downstream shutoff across the park and found no systemic leakage, so the
question sits with our equipment. We looked there, and **we have identified a number of
meters that need attention — including several where we suspect steady underlying flow is
not being captured.**

**Any one of these could account for a difference of the size you are seeing.** A single home
with a running line or a failed valve can easily use a thousand gallons a day or more. If
that flow is not being captured, it shows on your main meter and not on ours — and the gap
looks like a site-wide problem when it is one or two homes.

**The two meters at 144 Shady Lane**

Thank you for adding the second meter there. Since both sit on the same line, the chart below
shows what each recorded during the same 14-minute draw on August 25 — the flow they measured
minute by minute on top, and the running total underneath.

[CHART: shady-144-comparison.png]

The two finished at **21.51 and 21.85 gallons** — a difference of 0.33 gallons. Across every
draw that day they totalled 26.27 and 26.72 gallons.

**Please do run your own test.** You mentioned filling a vessel from a garden hose — we'd
rather you satisfy yourself directly. Send us the date, time and volume and we'll send back
what that meter recorded for the same window. Worth noting the reading appears the following
day, as these meters report once daily.

**Property usage**

August total across all 36 homes: **58,804 gallons**.

---

## The plan — three steps

### 1. Firmware update — all 36 meters

We push this remotely tonight. Nothing needed from you, and no disruption to residents. We
do this first so we are not chasing anything that clears on its own.

### 2. Water test on 5 homes — you run it, we check the data

Close the valve at the home, wait a few minutes, then run water and shut it off again. Note
the times and send them over; we'll pull each meter's record for that window and tell you
what it captured.

| Home | Reason |
|---|---|
| **40 Maple Lane Apt 2** | Confirm flow is reaching the meter |
| **40 Maple Lane Apt 0** | Occupancy unclear |
| **126 Shady Lane** | Occupancy unclear |
| **33 Maple Lane** | Occupancy unclear |
| **83 Shady Lane** | Needs verification |

Run them whenever it suits — one at a time is fine. Let us know the day beforehand and we'll
watch the data as it comes in.

### 3. One meter to replace

**40 Maple Lane Apt 3.** We'll ship you a replacement to install.

We may follow with a small number more after the firmware update, once we can see where
things stand. We'd rather confirm that than send you meters you don't need.

---

## Two things we need from you

**1. Your main and downstream meter reads.** Baseline reads on the main and both downstream
meters, then daily reads for five days. **We also need to know which lots feed from which
downstream meter** — a list or a marked-up map is fine. Without that we can only compare
against the main; with it we can compare each section against the homes inside it and narrow
the difference to a section, a stretch of line, or a single home.

**2. Occupancy on five homes.** Each has recorded little or no water recently:

- 40 Maple Lane Apt 0, Apt 2 and Apt 3
- 126 Shady Lane
- 33 Maple Lane

Send the test times and the meter reads across as you go and we'll turn them around quickly.
Happy to get on a call at any point.

Best regards,
[Name]
Dune Labs

---

## Notes for Bruce (not part of the email)

### Why the list went from 21 homes to 5

Two corrections, both mine:

1. **My first list used automated thresholds, not your assessment** — and two of those
   thresholds (`tnormSd > 150`, `gain >= 40`) are ones I had already shown do not predict
   faults. 40 Maple #5 sits at tnormSd 25 while fabricating 289 gal/day; 33 Maple runs gain
   44 and you read it clean. That is how 44 Shady, 132 Shady and 29 Maple reached a
   customer-facing list on the strength of a retracted metric. Dropped.
2. **Noise and wedge are firmware-remediable, so testing them first is wasted effort** —
   your point, and the evidence is direct: 126 Shady's noise stopped the exact day 17037/344
   landed (8/23 13:48), and five wedges have already been cured by firmware (144 Old,
   58 Shady, 83 Shady, 75 Shady, 15 Maple).

**The 5 that remain are the ones firmware cannot answer** — three occupancy questions, one
lateral/plumbing question, and 83 Shady where the update was already applied 8/30 and the
register still has not moved.

### Deferred to post-FW re-assessment (9)

5033 Spruce, 5019 Spruce, 5013 Spruce, 144 Test, 168 Shady, 15 Maple, 63 Shady, plus
21 Maple and 40 Maple Apt 5 after your cal/offset work.

- **168 Shady** is the strongest deferral — its env has ratcheted 33 -> 44 over 25 days on
  the pre-v349 build, and the walker-decay fix targets exactly that.
- **5033 Spruce is the weakest** — already on 17037/344 with rejPct still 83, so 17037 did
  not fix it. Tonight's push to 17040/354 plus a recal is the next attempt. **If that does
  not take, this is the meter behind the complaint and it goes straight to replace.** Worth
  checking within a day or two of the push rather than waiting.

### Kept out of the email deliberately

Firmware version numbers; rejPct/tofNorm; the wedge mechanism; per-device diagnostics; the
MVU estimate exposure (58 Shady carries ~1,503 gal of estimated volume — internal unless
they ask how the gaps were filled).

**One item that may need a decision before the next invoice:** 40 Maple Apt 3 is currently
being billed ~135 gal over 15 days from a pure estimate, on a meter that has recorded
nothing since 8/5. If that unit is vacant, we are billing a tenant for water nobody used.

### Numbers

Usage cites the actual August MVU total (58,804 gal / 79 CCF). My independent reconstruction
came to 57,913 — within 1.5% — so the figure holds either way.

The 126 Shady "10,700 gallon leak" claim from the earlier draft is **removed**. Your
correction: that volume was firmware-induced noise, not a leak. tofNorm sd 1,966-2,100 with
an IQR spread of ~2,500 counts, against ~400 on a genuine flow event — six times wider, and
MVU showed only 9-24 gal/day throughout.

### Lot 144 A/B comparison — the numbers behind the email

The 14-minute event, 8/25 (all times UTC; the pair are ~3.8 min apart on their own clocks,
which is device clock skew, not a measurement difference):

| | 144 Old (75368777) | 144 Test (79466452) | diff |
|---|---|---|---|
| eventMeterDelta | 21.5102 gal | 21.8451 gal | **+1.56%** |
| sample-integrated | 21.390 gal | 21.770 gal | +1.78% |
| duration | 846 s (14:01) | 839 s (13:54) | 7 s |
| flowing samples | 827 | 824 | 3 |
| tofNorm median | **+4,712** | **-4,946** | opposite sign, magnitude within 5% |

The opposite tofNorm signs are correct and worth noting: 144 Old reads NOT FLIPPED and
144 Test reads FLIPPED, so identical flow legitimately produces opposite-signed tofNorm.
Same magnitude, opposite sign = both measuring the same water correctly.

All four paired events 8/25: 0.8479/0.8713 (+2.76%), 1.1657/1.1378 (-2.39%),
21.5102/21.8451 (+1.56%), 2.7492/2.8700 (+4.39%). **Day total 26.2730 vs 26.7242 = +1.72%.**
The larger percentage spreads are on the sub-3-gallon events, which is expected — event
boundary effects are a bigger fraction of a small draw.

**IMPORTANT — this proves PRECISION, not ACCURACY.** Both meters share the same L-factor,
firmware and conversion constants, so if the underlying calibration is wrong they agree
beautifully while both reading low. I earlier called this "the best accuracy evidence for the
site" — that was wrong and is retracted. It rules out one meter having drifted relative to
the other; it cannot rule out a systematic under-read affecting both.

Still worth keeping the pair installed and worth showing the customer — just do not let it
stand in for a measured-volume test against a known reference, which is the only thing that
settles accuracy.

### Main / downstream meter request

Those are customer-side meters, not ours — nothing in ThingsBoard for them, so the reads
have to come from the owner. He is doing all the physical work himself (self-install), so
there is no Dune visit in this plan at all: FW is remote, he runs the water tests, and we
ship him the replacement meter for 40 Maple Apt 3.

The lot-to-downstream-meter mapping is the high-value item. With it, a 5-day comparison
becomes a per-section reconciliation and any gap narrows to one half of the park; without
it, a main-meter comparison only tells us a discrepancy exists. It would also settle two
open questions directly: whether the 40 Maple building is on its own feed, and whether any
occupied lots are unmetered.
