# Spec — calibration restarts when a measurement parameter changes (TI v366 + ST 17059)

**Bruce 9/6:** "What we need to do is recalibrate if measurement parameters
change — not have to issue a recal. The previous cal matrix is invalid, needs
to rerun." / "We don't need to restart TI." / "Just restart the calibration."

## Problem (observed on the bench 9/6, 4/4 units)
- `pulse=6` written together with `recalibrate=true`: the ST pushed 6 to the
  running TI, then the recalibrate path power-cycled the TI, which rebooted to
  its default 13 and calibrated at 13. Status `pulse=6` reflects the ST, not
  the TI. The 6 then lands as a LIVE parameter change at the next session end
  under a gain committed for 13 — the cal matrix is invalid from that moment.
- The recalibrate path (`main.c` ~470: zero offset, `offset_init()`,
  `ti_power_cycle()`) also left `flowDirection=UNKNOWN` on all four units —
  the ABS-rectification path 17058 was designed to keep fielded units out of.

## Design

### TI v366 — soft re-cal on parameter change (no reset)
1. `cal.c`: remember the drive parameter the committed cal was measured with:
   `g_cal_num_pls` set in `setMetering()` (commit).
2. New `void cal_on_params_applied(void)`, called ONLY from the ST-write path
   (`hmi.c` `HMI_PreMeasurement_Update`, `appReqUpdate` branch, after
   `HMI_validate_update_params()` returns OK) — never from the cal's own
   `apply_gain/apply_window/apply_env` calls, which go through the same
   validate function.
   - If `gCommandHandler.num_pls != g_cal_num_pls`:
     - committed (`g_cal_state == CAL_METERING && gIsMetering`): soft re-cal
       = `gIsMetering=false; gFailedCal=false; enter_amp_scan(true);`
       (the universal cal-start funnel; ST sees InfoMetering drop, then the
       normal commit path). Log "param recal pls %u->%u".
     - mid-cal: `enter_amp_scan(true)` so the sweep restarts with the new
       drive.
     - update `g_cal_num_pls`.
   - v366 scope is `num_pls` only. `gap_pls_adc_start` / `capture_duration`
     overrides are cal seeds the sweep already re-derives; add them later if
     a bench case shows they need it.
3. Export: `duneInfo.calFlags2` gets `CalF2_ParamRecal = 8` set for the
   cycle following a param-triggered re-cal (visible on TB via calFlags2).

### ST 17059 — offset follows the cal, direction does not
1. `hci_push_user_overrides()` (hci.c): track the last pushed
   `numberOfPulse`; when the pushed value differs, call a new
   `meas_on_drive_change()` (measure.c): `meas.offset = 0; meas.offsetSet =
   false; NVRG_OFFSET_ID = 0; offset_init();` — the delta-TOF zero is
   re-qualified against the new drive. **Direction untouched.** No TI power
   cycle.
2. `recalibrate=true` attribute: same effect as (1) plus an explicit soft
   re-cal request to the TI. Needs one new HCI write, `DUNE_CAL_RESTART`
   (0xAD, next free after 0xAC CAL_SURF), handled in the TI by the same
   `cal_on_params_applied()` funnel with a "forced" flag. Removes
   `ti_power_cycle()` from that path. **Direction untouched** (today's path
   ends with UNKNOWN — 4/4 bench 9/6).
3. Ordering fix as a side effect: nothing reboots the TI, so no window in
   which the TI calibrates on a default the ST is about to overwrite.

## Acceptance (bench, four units)
1. With v366 + 17059 on, write `pulse=6` alone. Expect: InfoMetering drops
   within one session, fresh sweep, commit at a gain ~1-2 rungs higher than
   the 13-pulse commit, amplitude ~0.4-0.6x at the OLD gain equivalent,
   `calFlags2` bit 8 set on the first post, offset re-promotes, **flowDirection
   unchanged**.
2. Write `pulse=6` again (no change): no re-cal.
3. `recalibrate=true`: soft re-cal, offset 0 -> re-promoted, direction
   unchanged, no TI reboot (tiBootCnt unchanged).
4. Then the 5 gpm baseline and the 1 gpm / 0.5 gpm knots at 6 pulses.

## Open questions for Bruce
- Confirm `recalibrate` should stop power-cycling the TI and stop wiping
  direction fleet-wide (this changes a long-standing attribute's behaviour).
- Keep `blank` / `captureDuration` out of v366's trigger set?
