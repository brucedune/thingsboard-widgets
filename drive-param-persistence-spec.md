# Drive-parameter persistence: the first cal after any reset runs on the last known parameters

Spec for TI v369 + ST 17065. Bruce, 2026-09-07: "at check-in when attrs are read, TI parameters should be updated before calibration."
Status: SPEC, awaiting approval. Nothing built.

## 1. Objective
After any reset of either MCU (ST power-on, ST FOTA reboot, TI reset by the ST, TI FOTA, brown-out), the TI's first calibration runs with the drive parameters the device was last configured with (pulse count, blank, capture duration), not with the compiled defaults. A mag reset (fresh install) is the only event that returns them to defaults.

## 2. Today's behaviour (verified 9/7 in code and on the bench)
- TI v288+ holds its first cal for the ST's START_CAL, which the ST sends in CAL_HOLD after the attribute fetch with the overrides queued ahead of it (Rev 16186). Correct order — when it happens in time.
- The TI self-starts after `CAL_START_GATED_TIMEOUT_AGGS` = 60 aggregates (~1 min) when the ST is alive. A boot session on Bell/T-Mobile takes longer than that to attach and fetch, so the first cal usually runs on defaults; v366 then re-cals when the overrides land.
- `gCommandHandler` (TI user params, `num_pls = 13`) is a plain RAM initializer: every TI reset restores 13. The ST keeps `configurationParameters.numberOfPulse` in RAM only and pushes it only when `numberOfPulseSet` was set by THIS session's attribute parse.
- Bench 9/7 13:00 power cycle: all four calibrated at 13; the 13:03 boot post carried `pulse = 0`, i.e. the boot session never applied the attributes; three units stayed at 13 until the 13:12 session pushed 6 and v366 re-calibrated. Same again at the 15:50 FOTA reboot ('3063 at 13 until the next session).

## 3. Scope
In: TI persistence of the three ST-pushed user overrides; ST backup-register mirror of the same three; ST pushes the mirror at the cal-gate release even when the fetch is missing; explicit reset-to-defaults on mag reset; root-cause the boot session that ends with `pulse = 0`.
Out: making the TI wait longer for the gate (the 60-agg backstop protects dead-ST devices and stays); changing the fleet default pulse count; any change to v366 param re-cal (it stays as the safety net).

## 4. Design

### 4.1 TI v369 — persistent user overrides
- New `#pragma PERSISTENT` block `gUserParamsNV` in FRAM (pattern exists: `gDuneDiag` in dune/info.c): `{ magic, num_pls, gap_pls_adc_start, capture_duration, crc }`.
- Handlers 0x80 (blank), 0x81 (num_pls) and the capture-duration handler write the live `gCommandHandler` field as today AND update `gUserParamsNV` (magic + crc). One FRAM write per push; pushes happen once per radio session, so wear is irrelevant.
- At boot (before CAL_INIT can start): if `gUserParamsNV.magic` and crc are valid, copy the three fields into `gCommandHandler`. Otherwise leave the compiled defaults.
- New command 0xAE `COMMAND_HANDLER_DUNE_USER_PARAMS_RESET_ID`: invalidate `gUserParamsNV` and restore the compiled defaults into `gCommandHandler`. Listener table 53 -> 54.
- calFlags2 high nibble (`tiPulse`) keeps reporting the running value, so TB shows which parameters the cal actually used.
- Behaviour on TI FOTA: the BSL rewrites the application image; whether `.TI.persistent` is preserved must be VERIFIED on the bench (see 6). If FOTA wipes it, the TI FOTA session is an ST session with attributes and the overrides arrive with the gate as today — acceptable either way, but the answer goes in the code comment.

### 4.2 ST 17065 — backup-register mirror + push at the gate
- New backup register `NVRG_TI_OVERRIDES_ID` = 29 (registers 29-31 are free; 0-28 in use): `[7:0] num_pls, [15:8] blank us, [31:16] capture duration`, 0 = unset. Written whenever an override attribute is parsed; cleared on the mag-reset (fresh-install) path in init.c next to the offset/direction clears.
- `hci_push_user_overrides()` pushes a field when its `*Set` flag is true (this session) OR the mirror holds a non-zero value for it. Effect: the CAL_HOLD gate release always carries the last known overrides, fetch or no fetch.
- Mag-reset boot session: send 0xAE before the overrides at the gate release, so a redeployed meter starts from defaults plus whatever attributes it now has.
- Note the mirror is lost with backup-domain power (battery pull); the TI's FRAM copy covers that case. Both together cover every reset type.

### 4.3 ST 17065 — boot session that applies no attributes
Symptom: the power-on boot session's status posts report `pulse = 0` and no override reached the TI. Two candidate mechanisms, to be settled with a UART log or the debug key before coding:
- (a) the attribute fetch on that path fails or is skipped, so `numberOfPulseSet` never sets; or
- (b) the fetch succeeds but `configurationParametersUpdated` (what the `pulse` key reports) is only synced by the config-push state that the boot session does not run, while the override push DID happen and the TI deferred/dropped the resulting param re-cal because its self-started cal was mid-sweep.
Fix follows the finding. If (b), the TI-side deferral in `cal_param_recal` must carry a pending flag through the cal so the change is not lost. Either way 4.1 + 4.2 make the first cal right regardless.

## 5. Success criteria
1. Power cycle a bench unit configured at 6 pulses: the first cal after boot reports `tiPulse = 6` and `paramRecal = 0` on the boot post (no second cal needed).
2. ST FOTA reboot: same, `tiPulse = 6`, `paramRecal = 0`.
3. Mag reset with no `pulse` attribute: `tiPulse = 13`; with `pulse = 6`: 6 on the first cal.
4. TI FOTA to v369 then v369 again (bank re-flash): `tiPulse` correct after the session either way.
5. No change to install-session duration beyond one extra HCI write.
6. Slot budget: ST 17064 is at 110,600 B against a 112,640 B ceiling (2,040 B free). 17065 must fit; if it does not, drop a debug string or move something before adding features.

## 6. Verification plan (bench, trio, half a day)
- Build v369 + 17065; TIFOTA v369 to one unit first, check `tiPulse` and cal outcome, then the other two.
- Power cycle each unit twice, read boot posts: `tiPulse`, `paramRecal`, `pulse`, gain, cal outcome.
- ST FOTA round trip (17064 -> 17065 -> 17064 -> 17065) on one unit for criterion 2 and the persistent-section question.
- Mag reset one unit with `pulse` deleted, then with `pulse = 6`.
- `recalibrate = true` still works (soft restart, offset rebaseline from 17064).
- Regression: 50 gal at 5 gpm, all three within the 9/7 PEX-A numbers.

## 7. Risks and open points
- FRAM write protection: MSP430FR6047 FRAM is writable by default in this project (persistent diag counters already update at runtime); confirm no MPU segment covers the new block.
- A stale persisted value on a meter moved between sites: harmless, the ST pushes on every session and 0xAE clears on mag reset.
- If TI FOTA does preserve `.TI.persistent`, a FOTA never changes parameters; if it does not, the FOTA session's gate push restores them. Both fine; must be known.
- Register 29 must not collide with anything the bootloader uses (L5Boot_loader reads registers 7, 10, 22-26 per the ST FOTA code); check the bootloader source before assigning.
