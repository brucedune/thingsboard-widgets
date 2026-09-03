# Handoff: Bench FW Campaign → NTEP Flow Accuracy Testing
*(from the 8/29–8/30 bench session; share this with the session running Wyse NTEP accuracy work)*

## Why this matters to accuracy testing
The 8/29 bench campaign found and killed a firmware defect that has been silently corrupting flow accuracy fleet-wide for ~8 months, and replaced the calibration algorithm. Any accuracy data collected on firmware older than the versions below is suspect; any NTEP runs must be on the new stack.

## Required firmware for accuracy runs
- **ST ≥ 17044** (17045 preferred — extends the install-session cal hold to 8 min so mag→Metering reports in one session). Rev 17045 is on both FOTA buckets.
- **TI ≥ v357** (v361 preferred). v357 fixes the root-cause bug; v359–v361 replace the old gain sweep with "surface cal."
- Never collect accuracy data on TI ≤ v356: an unbounded dtof latch (present since v180, 2025-12) could freeze the flow reading at a stale value indefinitely — it produced bit-identical phantom flow (e.g. +200 gal in 47 min at a frozen 4.233 gpm on the bench). Fixed in v357, kill-confirmed under a 0–7.7 gpm burst barrage.

## What surface cal means for test setup
- On mag reset the TI now walks a full 23×5 gain×envelope grid (~3 min, red/green blink) and self-selects its operating point inside an envelope of gain 23–38 dB × env 30–50. **Wait for Metering (green blink / TB state) before starting any test flow.**
- Each unit parks at its own cell (bench trio: g29/e30, g24/e50, g33/e40). Repeatability across mags is still being verified (±1 cell target) — if you mag a unit mid-series, treat it as a new cal.

## Accuracy results in hand (bench trio, 3/4" copper M, 17044+v361)
- **5 gpm, 50.0 gal marked tank:** −1.0% / +0.8% / +0.4%. Zero data defects.
- **0.5 gpm, ~64 min, 30.0 gal marked tank (8/29 eve):** main-run totals 31.14 / 31.82 / 29.60 gal. If the tank reference covered only the main run that's +3.8 / +6.1 / −1.3% — but a ~1.6–1.9 gal pre-squirt and the reference coverage were still being confirmed with Bruce. A 20-gal repeat is planned. Historical context: pre-surface-cal, 0.5 gpm showed ~+11% over-read attributed to flow-profile physics.
- Per-unit spread of 2–3% on harsh high-flow transitions is normal device character, not a defect.
- dtof scales ~3.4–3.6 ns/gpm, linear 0–7.5 gpm; hydraulic settling after a valve step is 2–4 s.

## Test protocol rules (learned the hard way — follow all of them)
1. **No radio sessions during a run.** During any radio session the ST goes deaf to the TI for ~45–180 s (samples lost; register still accrues). Check-in beats mid-run also force-close the open event, splitting it. Keep each run shorter than the check-in period, and start flow a couple of minutes after a check-in so the beat clock is fresh. For long runs, raise checkInPeriod first.
2. **Totals come from `eventMeterDelta`** (register-based, posts at event close) — they reconcile to the register to 3 decimals. Do NOT total by integrating the 1 Hz `flowRate` samples (blackout holes bias it) and do NOT difference `meterVal` across a reboot.
3. **Never reboot/mag/FOTA mid-series:** a known save-gap bug rolls the register back to the last flash save on reset (observed −70 to −90 gal). Fix is queued but not built. Close out totals before any reset.
4. **Reference discipline:** record the marked tank value exactly, and note precisely which water it covers (prime squirts vs main run). Ambiguity there moved tonight's verdict by 6 points.
5. **Data integrity check per run:** confirm zero on `stuckFlowCnt`, `forcedEndCnt`, `procStallCnt`, `tofMarkerRejCnt`, and no bit-identical `flowRate` runs longer than a few samples. Clean tofNorm has sd ~100+ during flow; sd 0 = frozen = discard the run.
6. TB gotchas: some keys carry corrupted far-future "latest" timestamps (×1000 tiTime bug) — filter ts > ~4e12. Latest-values fabricates `{ts: now, value: null}` for dataless keys. Group-level attributes (e.g. checkInPeriod, numberOfPulse) don't show in device-scope dumps — audit the group too.
7. Events left open past 60 min raise a TB "OPEN EVENT" alarm and will be split by the next check-in beat — size runs accordingly.

## Reference material
- Devices (bench trio): '8549 `5f18a040-dc4c-11f0-b691-d965a62fa4fa`, '4423 `737b0320-db7a-11f0-b691-d965a62fa4fa`, '3063 `d08d4e60-db7a-11f0-b691-d965a62fa4fa` on https://thingsboard.dunelabs.ai
- Repos/branches: `dunelabs/DuneFW_L5_2` branch `stuck-event-fix` (17043→17045), `dunelabs/Dune_FW_TI` branch `cal-reacq` (v357→v361) — both pushed
- Ledger: `cal-diag-findings-0827.md`; specs: `cal-v357-transient-gate-spec.md`, `cal-v359-surface-cal-spec.md`; day report: `aug29-bench-report.pdf` (all in `C:\Users\Bruce\Documents\GitHub\`)
- L-factor work: `L-Factor Optimization Check Sheet v2.xlsx` (3/4" M Lf 2.239 validated)

Ask Bruce for the true reference value on every run — never assume tank volume or flow rate.
