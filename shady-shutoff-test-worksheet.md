# Shady Lane MHP — site inspect / individual shutoff test worksheet

Customer has agreed to shut lots down **individually**. Each test proves both directions:

1. **Close the lot valve** → wait ~10 min → meter must read **exactly 0.000** flow.
   Catches phantom flow and bad offset.
2. **Reopen and run water** (bucket a known volume if practical, e.g. 5 gal at a hose bib)
   → meter must register it. Catches deaf meters, wrong lateral, frozen register.
3. **Record the register before closing and after the line settles.** Do not bill the
   difference across the test window.

20 of 36 lots flag on at least one criterion. 21 Maple and 40 Maple Apt 5 are excluded —
Bruce is fixing those via FW/cal/offset. 14 lots need no test.

---

## TIER 1 — test these first; each one will change a decision (7 lots)

| # | Lot | Device | Why | What the test settles |
|---|---|---|---|---|
| 1 | **40 Maple Apt 3** | 70269798 | failedCal, zero flow records since 8/5, register flat, **billing 135 gal from an estimate** | Confirm dead → **replace**. Already on current FW and unhelped. |
| 2 | **40 Maple Apt 2** | 77054957 | 0.2 gal in 15 days, **0 days with any usage** | Run water inside the unit — if the meter never responds, **wrong lateral** |
| 3 | **83 Shady** | 79459895 | register frozen at 6645 since 8/7 despite clean cal (rejPct 0, sd 33) | Does the register advance? If yes, no replacement needed |
| 4 | **5033 Spruce** | 75367100 | rejPct 83, gain railed 41, offsetAlarm + fdAlarm, 5.7 gal with water OFF | **This is the meter behind the under-registration complaint.** Recal or replace |
| 5 | **126 Shady** | 79466007 | usage stopped 8/9, **down 91%**, fdAlarm | Occupancy + does it catch real flow now |
| 6 | **33 Maple** | 75365302 | usage **down 87%** from 8/19, gain railed 44 | Occupancy + low-flow sensitivity |
| 7 | **40 Maple Apt 0** | 65824917 | register flat since 8/24, usage down 100% | Occupancy + does water reach it |

**Tiers 1 covers all four site-confirm lots and the one certain replacement.**

---

## TIER 2 — verify; material billing exposure (6 lots)

| # | Lot | Device | Why |
|---|---|---|---|
| 8 | **58 Shady** | 79454037 | usage down 51%, **MVU carrying +1,503 gal of estimate** — the largest estimated component on site, on the highest-usage lot |
| 9 | 5019 Spruce | 75364883 | never verified at no-flow; MVU estimate +360 gal |
| 10 | **15 Maple** | 79461115 | **rejPct 60 — newly elevated** (was 3 on 8/30); MVU estimate +351 gal |
| 11 | 5013 Spruce | 75369098 | tnormSd 167; never verified at no-flow |
| 12 | 152 Shady | 75366953 | usage down 46%; 1.1 gal with water OFF; tnormSd 155 |
| 13 | 76 Shady | 79455422 | usage down 46% |

---

## TIER 3 — degrading; test if time allows (7 lots)

| # | Lot | Device | Why |
|---|---|---|---|
| 14 | 144 Shady Test | 79466452 | 1.3 gal with water OFF; tnormSd 228; gain railed 44 |
| 15 | 40 Maple Apt 4 | 65828520 | 1.2 gal with water OFF |
| 16 | 168 Shady | 75368397 | offsetAlarm; env ratcheted 33→44 over 25 days |
| 17 | 63 Shady | 75369486 | tnormSd 244; now the site's highest-usage lot (327 gal/day) |
| 18 | 132 Shady | 75365427 | tnormSd 221 |
| 19 | 44 Shady | 75368439 | gain railed 41 |
| 20 | 29 Maple | 75366938 | never verified at no-flow |

---

## NO TEST NEEDED — 14 lots

66 Shady · 75 Shady · 144 Shady-Old · 136 Shady · 154 Shady · 103 Shady · 148 Shady ·
84 Shady · 5027 Spruce · 106 Shady · 96 Shady · 116 Shady · 138 · 40 Maple Apt 1

All clean on rejPct median, no alarms, verified at no-flow (or cleared by the quiet-period
screen), and no unexplained usage change.

---

## Notes for the technician

- **Tier 1 items 1, 2, 6, 7 are all in the 40 Maple building** plus 33 Maple — so one visit
  to 40 Maple covers four of the seven Tier 1 tests.
- **The four occupancy questions** (40 Maple Apt 0, Apt 2, Apt 3, 126 Shady, 33 Maple) need
  an answer from the property manager, not just a meter reading. Ask before or during.
- **Do not trust `leakSus`** — it has been wrong twice on this site (126 Shady's "leak" was
  firmware noise; 168 Shady's was normal diurnal use).
- **A single high rejPct reading is not a fault** — it also rises during genuine sustained
  flow. Only a sustained median above ~50 indicates a broken meter.
- Bring a spare meter for 40 Maple Apt 3 (certain replacement) and possibly 40 Maple Apt 2
  and 5033 Spruce.
