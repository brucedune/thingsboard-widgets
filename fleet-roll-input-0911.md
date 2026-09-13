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
- 20:40 update: two hours of 10.7 gpm aerated flow on 391 — register +1,324 gal, records integrate -0.4% of that with 5.2% of aggregates invalidated, zero forced walks, offset unchanged. Billing is safe on 391; the reject count is the only visible artefact.
- 9/12 08:56: TI 392 on '3063 under 11 gpm aerated flow: 2.65% aggregates invalidated (391: 4.3%), billing exact (event 221.1 gal, records -0.2%), no walks; 17078's TI-only FOTA path 3 for 3. 392 is the recommended bulk TI target (msp392.bin). A 393 with a 350 ns threshold is possible if the reject count matters for support dashboards.

## Addendum 9/12 10:05 — ST 17079 available (TI/flash isolation)
Bucket 672132E5/G/17079 (112,612 B, fits the slot). Breaks the VB 159 class: no SPI-flash operation until the TI has been heard after any reset/FOTA (register restore exempt), marker health check inconclusive while unstable (no strike, no reboot heal), heal at most once per 6 h across boots, TI-FOTA breaker after 3 failed sessions per version parks the TI in reset until the lever moves (status keys sfGatedUnstable, tiParked). Bench repro pending; for a device already in the loop, pointing gen2fw at 17079 lands it in the boot session (STFOTA runs before TIFOTA). Note VB 159 currently has gen2fw 17060 pinned and has downgraded to 17060.

## Addendum 9/12 10:35 — ST 17080 available (supersedes 17079 for the roll)
Bucket 672132E5/G/17080 (111,880 B). Same isolation as 17079 plus: an unknown TI is verified by an INFO probe before a flash op instead of the op being refused, and a silent TI is held in reset for the op (ti_monitor releases it). Any valid TI packet counts as alive. Untested on hardware as of this note: rig + bench repro pending Bruce's go. For VB 159 prefer 17080 over 17079 once the rig run is clean; until then keep allowTiFotaVer 0 on VB 159.

## Addendum 9/12 10:56 — VB 159: allowTiFotaVer 0 does NOT stop the loop on 17060
17060 substitutes the compiled default TI version 320 when the lever is 0 and the TI/UART/backup versions are all 0 (exactly a TI-dead unit). VB 159 kept running 3 BSL cycles per boot session after the 0 (ramBackupVer/tifota_lastFailedVer 320 at 09:51 and 09:55, tiBslOkCnt 229 -> 235), then went silent after 09:55:58 with nothing since. Options that do not depend on the FW honouring 0: allowTiFotaVer = a positive version with no bucket object (e.g. 1) -> HTTP failure, no BSL, no bus wreck, no heal reboot; and/or gen2fw 17080 (breaker parks a TI after 3 failed sessions). Roll session's call.

## Addendum 9/12 11:28 — two field loopers, two fixes; 17080 live on 72381773
72381773 (Ontario Place, TI dead) = VB 159 class -> gen2fw 17080 written 11:21/11:28 (Bruce), allowTiFotaVer 391 kept so the breaker parks the TI after 3 sessions. First field exposure of 17080; pass = bBootCount flat after the swap, tiParked 1. 72385774 (Crystal Acres, TI alive at 344, BSL password refuses 391) -> do NOT send 17080 (breaker would park a working TI); allowTiFotaVer 344 device pin stops the loop; needs a field visit to move past 344. Same rule for the fleet: 17080 is for TI-dead loopers; 344-era units need their own version pinned.

## Addendum 9/12 12:10 — 17080 field result on 72381773, and how to read a TI-dead unit
17080 stopped the loop: one heal reboot at the swap (1229 -> 1230 at 11:31), flat since, 10-min posts, VddAdc recovering (3533 -> 3548). The TI is the part, not the image: a 314 leg (its pre-roll version) also produced no banner. Two more 314 sessions trip the breaker and park it (tiParked 1) — then it is quiet until swapped. Rules for the roll: (1) 17080 for TI-dead loopers; (2) do NOT use allowTiFotaVer 0 as "stop" — 17080 still substitutes the compiled default 320 when every TI version reads 0; (3) 344-era units (Crystal Acres class, TI alive, BSL password refuses newer images) get allowTiFotaVer 344 pinned, not 17080; (4) within one uptime the RAM blocklist pre-empts the breaker, so tiParked shows 1 only after the next reboot or boot session — no BSL churn either way. Rig '3063: breaker park verified on 17080, recovery via a different lever (392) in progress.

## Addendum 9/12 12:25 — 344-era units: pin their own TI version, do not push 391
On 72385774 (Crystal Acres) the ST's BSL flow (two wrong passwords -> auto mass erase -> default password) never erases, so no newer TI image can be written remotely; each refused attempt counts toward the 17080 breaker, which would park a LIVE TI after 3. Rule: any unit whose TI reports 344 (or another pre-357 version) and whose tiBslOkCnt does not move across a TI-FOTA attempt gets allowTiFotaVer = its resident version. 72385774 pinned 344 at 12:26. Fix under design: ST supplies the resident image's vector table as the BSL password.

## Addendum 9/12 13:09 — ST 17081 available: TI BSL unlock with the known password
Bucket 672132E5/G/17081 (112,064 B). 17080 + one change: bsl_init tries the resident image's known BSL password (constant per TI family: A = 314/320/324, B = 341-392) before the wrong-password erase trick. Proven on the rig in all three directions (B->B, B->A resident, A->B), zero wrong-password strikes. What it means for the roll: (1) 344-era units (Crystal Acres class) become updatable remotely — sequence per unit: gen2fw 17081 first, confirm it, THEN allowTiFotaVer to the target; until 17081 is on the unit keep its own version pinned. (2) Every TI-FOTA no longer erases the resident app before writing, so an interrupted leg leaves the old app (with its vectors) instead of an empty part. Field trial candidate: 72385774. Untested on a non-erasing BSL until that trial.

## Addendum 9/12 14:52 — measured resident TI versions across the 412 groups
Latest fwVerTi per device (13,931 devices): A 209: 934 | B 218-302: 2,533 | C 314-325: 1,207 | D 341-392: 2,794 | G 119-194: 959 (159: 422, 149: 180, 181: 130 — not in the cohort table) | F 13-102: 122 | TI 0: 199 | no fwVerTi: 5,174. Full tally in Claude Data/resident_ti_versions_0912.json (per group too). If the v1xx units are in the roll, say so: the password table set in 17083 covers them with one more entry.

## Addendum 9/12 21:31 — 17084 is the shipping candidate; bench six levered to it
17084 = 17080 (TI/flash isolation, heal window, breaker) + known BSL password unlock (five lineage tables, resident = last written image until heard, one try then the 16017 erase). Rig proofs: password families A, B, C, D unlocked first try; the rig also showed the one allowed heal reboot per 6 h after BSL-wrecked sessions (by design). Bench six now gen2fw 17084 / TI 391 for the overnight soak; 72385774 (Crystal Acres, 344, non-erasing BSL) has gen2fw 17084 pending pickup, then one 391 attempt is the field trial. Roll target recommendation: ST 17084 + TI 391, ST first then TI, cohorts by risk (368/17060 -> 344/17037 after the 72385774 pilot -> 314/16185 small pilots -> pre-16131 only after a bench check of the FOTA path from 362/16022/16131).

## Addendum 9/12 22:05 — 17085 supersedes 17084 as the shipping candidate
Bench pickup of 17084 exposed an inherited-register defect: BKP5R ("unused" since forever) keeps whatever old firmware left, and 17079-17084 read stale bits as breaker attempts; 2 of 6 bench units parked a healthy TI at their first boot and self-released only because the lever did not match the stale version bits (about 1 in 1,024 garbage words would match and stay parked). 17085 normalises the word once at boot (VALID marker) and records real writes (WRITTEN flag). Do NOT roll 17079-17084 to the fleet; roll 17085 (bucket 672132E5/G/17085). Bench six levered to 17085 at 22:03; rig follows when the pump is off.
