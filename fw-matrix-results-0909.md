# Bench FOTA matrix results — 2026-09-09

**Group:** TI Fota Failure (6 units, PVC 3/4, hw rev G, lot 26W33). **Target:** 17066/372.
**Method:** group lever only, both attributes in ONE write in each direction (OLD pair, then
17066/372), 10-minute check-ins, no device pins. Permutation 1 driven by Bruce by hand; the rest
by `fota_cycle.py` (scratchpad). Raw: `fota_matrix_results.csv` (84 unit-crossings),
`fota_watch_events.csv`, `fota_watch_log.txt`, `fota_cycle_log.txt`, `tb_write_log.txt`.

## Scoreboard — 13 starting pairs, 84 unit-crossings, 0 TI bricks, 0 crashes on a crossing

| Start pair | Field devices | Class | ST-first | TI-zero window (min) | Self-heal reboot | Crash on crossing | Verdict |
|---|---|---|---|---|---|---|---|
| 15154 / 260 | 106 | pre-v304 | 6/6 | 1–3 | 5/6 | 0 | clean (Bruce, manual) |
| 17037 / 344 | 1,134 | clean | 6/6 | 1.8–2.3 (no zero) | — | 0 | clean |
| 16185 / 314 | 1,027 | clean | 6/6 | 1.8–2.2 (no zero) | — | 0 | clean |
| **362 / 209** | 838 | two-step estate | **6/6** | 2.3–3.5 | 6/6 | 0 | **clean, both attrs at once** |
| 16131 / 296 | 797 | pre-v304 | 6/6 | 2.3–3.2 | 6/6 | 0* | clean |
| 16022 / 260 | 350 | pre-v304 | 6/6 (repeat) | 1.7–3.5 | 6/6 | 0 | clean |
| 15090 / 254 | 168 | pre-v304 | 6/6 | 2.6–4.0 | 6/6 | 0 | clean |
| **363 / 219** | 119 | two-step estate | **6/6** | 2.3–3.4 | 6/6 | 0 | **clean, both attrs at once** |
| 15147 / 256 | 111 | pre-v304 | 6/6 | 2.0–3.3 | 6/6 | 0 | clean |
| 17032 / 344 | 99 | clean | 6/6 | 1.8–2.2 (no zero) | — | 0 | clean |
| 17040 / 354 | 73 | clean | 6/6 | 1.8–2.0 (no zero) | — | 0 | clean |
| 16130 / 296 | 51 | pre-v304 | 6/6 | 2.0–2.7 | 6/6 | 0 | clean |
| 15085 / 254 | 28 | pre-v304 | 6/6 | 2.0–3.3 | 6/6 | 0 | clean |
| 17060 / 368 | 234 (Wave 1) | clean | 6/6 | 1.8–2.2 (no zero) | — | 0 | clean |

\* two crash increments on 16131 were logged BEFORE the NEW write, on the old firmware during
the downgrade leg (see artifacts). Zero crashes after any crossing in the whole matrix.

Dropped by Bruce (each < 25 field devices, class already covered): 16128/295, 15091/255,
17028/341, 16193/320, 17050/364, 17028/343. Skipped: 16048/272 (all dark in the field).
Coverage: every pair with >= 25 field-group devices, ~94% of installed Gen2.

## Timing (what a property will do on a group lever)

- Lever -> ST image landed: **median 7.3 min, p90 11.4, max 13.5** over 177 landings. That is
  check-in phase only: **zero** download retries on any unit (all stFota counters 0). A unit lands
  on its first check-in after the write, so a property spreads over one check-in interval.
- ST landed -> TI landed: 1.8–2.2 min when the TI already boots under the new ST (post-v304),
  2–4 min TI-zero window when it doesn't (pre-v304 and 362/363 TIs). Both happen in the boot
  session after the ST flash; a few units waited one more check-in.
- Whole permutation (OLD + NEW) at 10-min check-ins: ~35 min.

## Decisions this supports

1. **Two-step retired for the 362/363 estate (898 devices).** 12/12 bench crossings with both
   attributes in one write, plus 4/5 in Wave 1. Code reason confirmed on tag v363: ST FOTA runs
   first and skips TI FOTA in any session where an ST image flashed. Residual, untested: the ST
   download-failure fall-through (old ST proceeds to TI FOTA). Not seen in 69 Holly Tree field
   crossings at weak signal or in 12 bench crossings.
2. **Wave 2 bench gate passed** for all four pairs (17037/344, 16185/314, 362/209, 16131/296).
3. **Waves 4/5 bulk pairs** (16022/260, 15090/254, 15147/256, 15154/260, 363/219, 16130/296,
   15085/254) all clean; the wedge/self-heal signature (boot flag 20, 2–4 min TI Silent) is
   confirmed as the normal crossing on every pre-v304 TI.

## Bench-only artifacts (not field risks, but they cost time today)

- **Downgrade wipes the register on pre-17028 ST** (15xxx, 16022): meterVal -> 0. 16185/17037
  do not. => this matrix cannot test deltaMeterVal continuity; that needs ST-Link + SPI erase.
- **Radio overuse limiter (pre-16038):** THRES 4 activations, 10-min sessions count; a unit on
  16022 went silent after its 5th session. Fix: group `radioOnEventEnd=true` (set 12:05).
  Counter lives in BKUP => power pull, not mag reset, to clear.
- **Post-install eval (15xxx):** overrides checkInPeriod to 60 min for the first hour after any
  boot. Fix: group `postInstallEval=false` (set 14:14).
- **Two "TI-hard" boards, 72379322 and 72714092:** old-firmware TI-FOTA fails "bsl reset / get
  info" (never hears the TI boot banner; 16164 fixed that race by arming the listener before
  reset release). 17066 flashes them every time (with retries). They took the old BSL after a
  PIN reset but not after a FOTA reboot. Field impact nil: only the NEW ST ever flashes a TI.
- 15090 predates 15092 ("reset before/after mass erase") so its own TI-FOTA is the pre-fix path.

## Group attrs left on 'TI Fota Failure' (bench group)

gen2fw=17066, allowTiFotaVer=372, checkInPeriod=10, recordNoneventFlow=true,
radioOnEventEnd=true, postInstallEval=false, radioTimePeriodDays=1. Bruce to decide what to
revert; none of these belong on a field group.
