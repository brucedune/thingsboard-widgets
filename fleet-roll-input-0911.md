# Fleet roll — critical input from the bench session (2026-09-11 16:45)

Source: fw-17047-bugfix-handoff.md (full evidence). Written for the session running the roll.

## Target pair
- **ST 17078 + TI 391.** Both in the buckets (672132E5/G/17078 = 112,016 B, fits the 112,640 slot; s3://dune-firmware-ti/msp391.bin 52,180 B).
- Why this pair and not the paused 17066/368: 17072 fixes a fleet-wide billing loss (every radio session dropped ~1 min of aggregates on the UART-only link); 17076 re-qualifies the zero after a TI recal instead of carrying a stale one for 24 h (the 70262090 phantom class); 17077/17078 make a TI FOTA survive the post-flash config miss (today: 3x re-flash + 8 min not metering per TI FOTA on a running ST, 5 of 5 legs missed the first push); TI 391 = split guard + direct re-lock against the radio-window channel-displacement phantom (77058339: 240 gal in a day on 387) and the guard tested against real flow (388/389 mis-fired on cycle skips; 391 fixed).
- Bench time as of 16:45: 17078 ~45 min on six units + two TI-only FOTA legs proven; 391 ~1.5 h on six units, 15 min under 11 gpm on '3063. If more soak is wanted, ST 17078 alone is the safe first move (no TI change), TI 391 the morning after.

## NEVER ROLL
- ST 17068 (killed live events every aggregate blob).
- TI 376, 379, 383 (hmi.c applies the pushed zero as the USS dcOffset -> +/-4-5 ns phantoms after the first re-config; 77058339 fabricated 225 gal on it this morning), 384, 385, 386, 388, 389 (guard on the raw delta: 4% of flow aggregates invalidated, forced walks under flow), 390 (the bucket object was a stale 8/28 image; deleted and archived today — the key is now absent, so a device pointed at 390 would just fail the fetch).
- Do not stop a roll at 17075/383 "on the way": 383 is the phantom.

## Ordering and mechanics
- Group levers live in ENTITY_GROUP **SERVER_SCOPE** (gen2fw, allowTiFotaVer); device SHARED_SCOPE pins override them (site-pin cleanup rule: after a group lever, list the member pins and delete them only with Bruce's OK).
- Same-session order is STFOTA -> reboot -> next session TIFOTA, so writing both levers at once yields ST-first automatically (bench six today: all one-pass). For the 362/363 estate keep the plan's strict two-step (gen2fw, verify fwVer, then allowTiFotaVer).
- tb_attr.py's `write` path is broken; use a direct POST to /api/plugins/telemetry/DEVICE/{id}/attributes/SHARED_SCOPE (or /ENTITY_GROUP/{id}/attributes/SERVER_SCOPE) and RE-READ every write.
- Do NOT put checkInPeriod on fleet devices (bench-only debugging cadence).
- Do NOT clear gen2fw after the roll: the L5 bootloader boots bank 0 after any cold power-on (backup-domain loss zeroes its bank choice), so a device whose newest image is in bank 1 reverts to the older image at the next battery pull and needs the lever to come back (79454912 did exactly this today: 17075 -> 17058 -> re-FOTA to 17076 in 90 s).

## What to expect and how to read it
- ST FOTA reboot: register floors to an integer (deltaMeterVal in (-1, 0]); offset 0 then re-locked within ~32 s of still water (17076 boot re-qualify); a device flowing at the FOTA bills 0 until still water (17068 policy), never a phantom.
- TI FOTA on 17078: tiBslOkCnt +1 exactly (never +2/+3), tifota_config_err may step +1 (first push misses on a running ST; the soft-reset re-push lands), CAL_HOLD in the same session, metering ~90 s after the TI boot, `fsm_fail_TIFOTA` must not step on a successful leg. tiUartBannerCnt +2 per TI FOTA (flash boot + the soft reset) is normal.
- TI 391 in service: reacqCnt increments = forced re-locks (split guard), reacqSelfOk = the ones followed by clean data; a few per day on turbulent sites is fine, a climbing count with tnormAvg pinned = look at the unit. tofMarkerRejCnt ~1% of aggregates under flow (invalid aggregates); 4%+ means the guard is biting (that was 389).
- tnormAvg is the mean of ALL corrected samples since the last status post, flow included — never read it as a still-water floor; the record-level tofNorm or a flat tnormAvg equal to -offset (raw exactly 0) are the phantom signatures.
- PIN/magnet resets wipe offset, direction and pipe: direction UNKNOWN bills either sign (ABS). Fleet devices with waterFlowDir pinned (1,930) are covered; fresh installs are not until the tracker learns direction.
- Record timestamps are a synthetic per-aggregate clock, frozen through cal windows and re-synced at sessions: expect 1-2 min record "gaps" around FOTA sessions with volumes intact (register vs eventMeterDelta reconcile). Cosmetic; RTC-stamped records are queued as 17079.

## Data ready for the roll session (scratchpad of this session, also summarized here)
- Group lever census (412 device groups, SERVER_SCOPE): 362/209 = 210 groups, 17037/344 = 41, 16185/314 = 23, none = 20, 16131/296 = 18, 16022/260 = 15, 15154/260 = 12, 363/219 = 11, 16130/296 = 10, 15090/254 = 9, 17028/341 = 7, ... (group_levers_0911.json).
- Wave 1 (device pins, cache of 9/10 + pins read 16:40): 286 devices at fwVer 17060/17066; pins 17060/368 on 274, 17066/372 on 3, 17066/375 on 2, 17078/391 on 6 (the bench), 17075/383 on 1 (72379322); states: Failed Cal 183, Metering 62, Calibrating 40, TI Silent 1 (wave1_pins_0911.json). These 274 pins are the natural first write: re-pin to 17078/391 (device scope, as they are today).
- Fleet pair distribution (9/10 cache, Gen2 = 2,772): 17037/344 = 2,207; 17060/368 = 272; 17032/344 = 129; 17040/354 = 67; 17028/341 = 27; the rest < 12 each.

## Addendum 17:15 — TI 391 reject rate under turbulent flow
On the aerated rig 391 ships ~5% of flow aggregates as invalid (tofMarkerRejCnt), no forced walks. Records lose those seconds; the register integrates across them (verification in the handoff). Expect the same on turbulent high-flow sites; it is not a fault unless reacqCnt climbs with it. v392 (median pair, 200 ns) removes it; if the TI roll can wait a day, roll 391 -> 392 instead. ST 17078 is unaffected.
