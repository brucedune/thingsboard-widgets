# Bench prompt: Wave 2 crossing regression (upgrade behavior from real field revs)

**From:** fleet-ops session, 2026-09-09. **For:** bench/FW session. **Owner:** Bruce.
**Status:** DRAFT — Bruce to approve target rev and device assignment before starting.

## Objective

Before Wave 2 rolls, reproduce on bench units the exact upgrade each Wave 2 group will
perform, starting from the firmware pair those field devices are actually running, and
record what the device does during the crossing. The open questions are:

1. **Is the 362/363 two-step necessary?** v363 code skips TI FOTA in any session where
   the ST image flashed (`case BG95_STATE_STFOTA` -> `SEND_STATUS` on success). Holly
   Tree crossed 69 devices 362->16185 with both attributes set 0-16 s apart, 52/52
   ST-first, zero permanent TI loss. But the fall-through path (ST download FAILS ->
   old ST proceeds to TI FOTA -> flashes a TI that cannot boot under ST 362) has never
   been exercised deliberately. Test both.
2. **Wedge + self-heal on the pre-v304 class** (The Oaks: 16131/296): confirm the
   signature and that it heals on the current target.
3. **TI-silent exposure on every crossing:** how long fwVerTi reads 0, and that it never
   persists past the second session.

## Target revision — PARAMETER, set on the day (Bruce 9/9: "FW rev could change again by the end of the day")

Write the target as `TARGET_ST / TARGET_TI` throughout and fill it in when the matrix
starts. Wave 1 is on 17060/368; the pulse-persistence fix is in 17065/v369+; the trio
is on 17065/v370. Whatever ships to Wave 2 is what gets tested. One target for all runs,
and the field ramp below uses the same one.

## Sample size (Bruce 9/9): **6 devices minimum per starting pair** = 24 unit-runs

Run each of the four starting pairs on 6 units. If bench stock is short of 24, the same
6 units are re-reverted through the pairs sequentially (A, then B, C, D); reverting is
~30 min/unit plus one metering session. Run A additionally gets the fault-injection case
on at least 2 of its 6 units.

## Starting pairs = the four Wave 2 groups

| Run | Field group | Start pair | Class | Source of the old images |
|---|---|---|---|---|
| A | Sara Drive (2d) | **362 / 209** | two-step estate | ST: git tag `v362` (ST-Link). TI: tag `v209` or bucket `msp209.bin` via `allowTiFotaVer=209` |
| B | The Oaks (2c) | **16131 / 296** | pre-v304 wedge + self-heal | ST: prod bucket image (no git tag located). TI: bucket `msp296.bin` |
| C | Holly Tree (2b) | **16185 / 314** | clean | ST: commit `f8051bd` or bucket. TI: bucket `msp314.bin` |
| D | Shady Lane (2a) | **17037 / 344** | clean | ST: tag `v17037`. TI: tag `v344` |

Reverting order matters: flash the OLD TI first (new ST will happily FOTA a lower TI
version — `bg95_stfota`/`bg95_tifota` only check `!=`), then ST-Link the old ST.
Then make the unit era-authentic before the test:

- **Pull power** (battery + USB) long enough to clear RTC backup registers — the
  NVRG settings word carries the offset-cleanup done-bits (V1/V2/V3) and the TI
  override mirror (17065), none of which a field unit on 362 has.
- **Erase SPI flash storage** — a unit that has run 17028+ carries the v2 storage
  marker; 362/16131 field units do not. (Little Acres SF-migration bug lives here.)
- Mag reset, let it calibrate and meter on 3/4" PEX-B for at least one session on the
  old pair before touching levers. Confirm `fwVer`/`fwVerTi` in TB match the row.
- Group-level levers only, no device pins, per the rig pairing rule.

## Procedure per unit-run (6 units per pair; see Sample size)

1. Baseline: one full session on the old pair, UART logger attached, `checkInPeriod`
   short enough to observe (5-15 min), note `meterVal`, `offset`, `flowDirection`.
2. Set the group lever **both attributes together** (`gen2fw` + `allowTiFotaVer`,
   same write). Record wall-clock.
3. Observe through at least three sessions. Capture UART for the whole crossing.
4. Restore trio state afterwards (17065/v370 or current) and note it in the handoff.

## What to record (per run)

| Observable | Where | Pass |
|---|---|---|
| Order: ST image lands before any TI flash attempt | UART + TB `fwVer` ts vs `fwVerTi` ts | ST-first, every run |
| Old ST never runs its TI FOTA when both attrs set | UART: no `ti_fota` fetch on the old rev | none |
| TI-zero window (fwVerTi 0 / TI Silent) | TB `fwVerTi`, `deviceState` | < 10 min; never persists past 2nd session |
| Wedge/self-heal signature (run B) | `bootReasonFlags` 20, 2 wedged statuses, one self-reboot | heals; TI on target ver |
| Register continuity | `deltaMeterVal` | in (-1, 0]; no salvage zero |
| Offset cleanup V3 | `offset` 0 exactly once, re-promotes on water | yes |
| Direction retained | `flowDirection` | unchanged |
| Crash counters | `bCrashCount`, `tiUartFbPkts` | no increment |
| Pulse setting survives the crossing (if target >= 17065/v369) | `tiPulse` after power cycle | stays at attr value |
| Post-TIFOTA sf-wedge reboot (open item from 9/7) | UART | note if seen |

## Fault injection (run A only, the two-step's actual justification)

Set `gen2fw` to a revision that does NOT exist in the bucket (so the ST download fails
with a 404) together with `allowTiFotaVer=<target TI>`. Question: does v362 fall through
`STFOTA fail -> FOTA -> TIFOTA` and flash the new TI under the old ST? If yes, does that
TI boot under ST 362 (plan says v288+ is gated on ST 16104+)? Record the recovery path
(set `gen2fw` to the real target afterwards and see whether the unit comes back).
Result decides: **both-at-once for the whole 362/363 estate (898 devices), or keep
two-step with a same-session gap.**

## Deliverable back to fleet-ops

One table: run, start pair, target, ST-first Y/N, TI-zero minutes, wedge Y/N and healed
Y/N, deltaMeterVal, offset/direction result, crash delta, fault-injection outcome,
UART log path. Plus a one-line verdict per Wave 2 group: go by group lever / go by
sample first / hold.

## Notes for the bench session

- v362 vs v363: fleet-ops verified the FSM skip logic on tag `v363`; Sara Drive is on
  362. Diff `Core/Src/bg95.c` between the two tags before assuming they match.
- `Rev 16131` build commit was not located by grep in DuneFW_L5_2 history; use the
  bucket image or find the commit by date (~2026-05).
- '3063 is on the UART reproduction (`checkInPeriod` 5, off the scoring set); '8549 and
  '4423 are the natural candidates unless Bruce reassigns.
- Fleet-ops raw data behind this request: scratchpad `wave2_ti_risk.csv/.json`,
  `holly_order.py` output (52/52 ST-first, median 2.6 min ST->TI gap).

---

## Appendix (added 9/9, Bruce: "bench test all fleet permutations") — the full list

Census of installed Gen2 with a live TI version, 9/9 morning: **5,368 devices, 55 distinct
ST/TI pairs.** Full table with reachability and image source: `fleet-fw-pair-census-0909.csv`
(repo root). TI-silent units (67, fwVerTi 0) are failures, not permutations, and are excluded.
Every pair gets the same procedure and observables as runs A-D above; **6 units minimum each.**

**Tier 1 — bench-test first (>= 100 devices; 11 pairs, 4,969 devices, 92.6%)**

| # | ST / TI | Devices | Reach <48 h | Class | ST image | TI image |
|---|---|---|---|---|---|---|
| 1 | 17037 / 344 | 1,134 | 1,088 | clean | tag v17037 | tag v344 |
| 2 | 16185 / 314 | 1,027 | 1,004 | clean | bucket / commit f8051bd | bucket msp314.bin |
| 3 | 362 / 209 | 838 | 777 | two-step estate | tag v362 | tag v209 |
| 4 | 16131 / 296 | 797 | 757 | pre-v304 wedge + self-heal | bucket | bucket msp296.bin |
| 5 | 16022 / 260 | 350 | 326 | pre-v304 wedge + self-heal | bucket | bucket msp260.bin |
| 6 | 17060 / 368 | 234 | 234 | clean (Wave 1, already on it) | bucket | tag v368 |
| 7 | 15090 / 254 | 168 | 167 | pre-v304 wedge + self-heal | bucket | bucket msp254.bin |
| 8 | 363 / 219 | 119 | 111 | two-step estate | tag v363 | tag v219 |
| 9 | 16048 / 272 | 112 | **0** | pre-v304 — **16048 brick era, all dark: not rollable, skip** | — | — |
| 10 | 15147 / 256 | 111 | 108 | pre-v304 wedge + self-heal | bucket | bucket msp256.bin |
| 11 | 15154 / 260 | 106 | 96 | pre-v304 wedge + self-heal | bucket | bucket msp260.bin |

**Tier 2 — bench-test before their wave (6-99 devices; 10 pairs, 344 devices, 6.4%)**

| # | ST / TI | Devices | Reach | Class | ST image | TI image |
|---|---|---|---|---|---|---|
| 12 | 17032 / 344 | 99 | 93 | clean | bucket | tag v344 |
| 13 | 17040 / 354 | 73 | 61 | clean | bucket | tag v354 |
| 14 | 16130 / 296 | 51 | 44 | pre-v304 wedge + self-heal | bucket | bucket msp296.bin |
| 15 | 15085 / 254 | 28 | 26 | pre-v304 wedge + self-heal | bucket | bucket msp254.bin |
| 16 | 16128 / 295 | 21 | 14 | pre-v304 wedge + self-heal | bucket | bucket msp295.bin |
| 17 | 15091 / 255 | 13 | 13 | pre-v304 wedge + self-heal | bucket | bucket msp255.bin |
| 18 | 17028 / 341 | 10 | 10 | clean (Shady stale lever) | bucket | tag v341 |
| 19 | 16193 / 320 | 9 | 5 | clean | bucket | bucket msp320.bin |
| 20 | 17050 / 364 | 7 | 6 | clean | bucket | bucket msp364.bin |
| 21 | 17028 / 343 | 6 | 5 | clean | bucket | tag v343 |

**Tier 3 — 34 pairs with 1-5 devices each (55 devices, 1.0%).** Not worth 6 bench units
apiece. Recommendation: roll these by hand, one at a time, with a watch, after their
class's Tier 1 pair has passed (the class mechanism is what's being validated, and each of
these is a class already covered). Of the 55, 25 are unreachable and won't roll anyway.
Notable: 15019/219 (5, all dark), 16165/302 (3), 17055/365 and 17066/372 (bench lineage),
362/205 and 362/265 and 363/296 (odd two-step-estate pairs, 1 each).

**Bench load at 6 units per pair:** Tier 1 = 60 unit-runs (10 rollable pairs), Tier 2 = 60,
total **120 unit-runs.** At ~30 min revert + one metering session + 3 observed sessions per
run, that is the pacing item; Tier 1 rows 1-4 (the Wave 2 pairs) go first, then 5, 7, 8, 10,
11 before Waves 4/5, then Tier 2 as their properties come up.

**Image sourcing rule:** "bucket" = the prod ST bucket path or `dune-firmware-ti/msp<ver>.bin`;
every one of these versions was rolled from there, so the image exists unless it was pruned.
Verify each old image is still present BEFORE scheduling its runs. ST git tags exist only for
v362, v363, v17037 (and 15021, 17185); the 15xxx/16xxx ST revs have to come from the bucket
or be rebuilt from the "Rev NNNNN" commit.
