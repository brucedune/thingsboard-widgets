# ST 17079 — TI/flash isolation (breaks the VB 159 reboot loop)

Status: SPEC for approval, 2026-09-12 ~10:15. Input: fleet-ops prompt `fw-ti-flash-isolation-prompt-0912.md` + evidence `fw-17078-field-flags-0912.md` (both committed 5ff44f4). Design rules 1-4 there are taken as requirements.

## 0. Live state (verified 09:40)
VB 159 (72390030): 42 boot posts in the last 6 h, bBootCount 155 -> 176 in 83 min, tiBslOkCnt 166 -> 223 (3 per cycle), VddAdc 3608 -> 3524 mV in 83 min, fwVerTi 0, tiBackupVer 0. Its device pins are now gen2fw 17060 / allowTiFotaVer 368 / checkInPeriod 10 / radioOveruseMax 15 (the roll session's retarget) — the loop continues on 368: the TI is RMA-class (BSL readback CRC passes every time, never banners).

## 1. Immediate mitigation (no firmware; roll session's write, Bruce's call)
On VB 159 set `allowTiFotaVer = 0` (an explicit 0, not a delete — the group value would apply): bg95.c:1690 `lastver == allowTiFotaVer` (0 == 0) -> "ram refresh only", no fetch, no BSL. Also delete `checkInPeriod` (every extra session is another pair of marker reads) and drop `radioOveruseMax` back to 10. Expected: the three BSL power cycles per session stop; if the marker reads then come back clean (the field evidence says the failure is a TI-transition bus artefact) the heal never arms and the reboots stop within one cycle. If they do not, the loop keeps going at ~40 s of radio per 4 min instead of 180 s (4x slower drain) until 17079 lands — and 17079 CAN land on a looping device: STFOTA runs before TIFOTA in every boot session.

## 2. Changes (release budget 624 B; lean cannot take this — 17079 has no lean image, '3063 stays on 17078 lean)
A. `ti_stable()` predicate (ti_hci_impl.c): true only when an INFO or banner has been heard since the last TI reset/FOTA/power-cycle in this uptime AND ti_timed_out() is false. Every TI reset path sets a "ti_disturbed" flag; the first INFO/banner clears it. Gate on it:
   - sf_is_initialized(): while !ti_stable the marker read is INCONCLUSIVE — return the last conclusive answer, no strike, no heal arm.
   - sf_flow_tof_buffer / sf_meter_entry_append / sf_ti_backup_write / sf_process (GC): skipped while !ti_stable (records: the 17072 RAM queue already exists; on a dead TI there is nothing to write anyway). Counter `sfGatedUnstable` in status.
   - Boot register restore stays untouched (it runs after sf_init and before any TI reset: init.c ordering, Rev 17015).
B. Heal limit to BKUP: BKP5R (free; app uses 0-29 minus 5, bootloader 30/31). Bits [31:16] = hour-of-epoch of the last heal (mod 65536); a heal is refused within 6 h of the previous one across boots. Plus: never arm a heal in an uptime that had any TI reset/FOTA (subsumed by A).
C. TI-FOTA breaker to BKUP: BKP5R bits [9:0] = failed version, [13:10] = failed sessions for it. `tifota_lastFailedVer` is loaded from BKUP at boot; after N = 3 failed sessions the gate (bg95.c:1679) skips that version until allowTiFotaVer changes; a verified success clears the word. Every boot session with a FOTA attempt counts toward radioOveruseMax as well (connmgr increment on the boot session).
D. Park a known-bad TI: when the breaker trips (C) or tiRecoveryExhausted: `ti_hold_in_reset()` at boot after the register restore and skip init.c's boot resets; ti_monitor does nothing while parked; release only when allowTiFotaVer differs from the stored failed version or at the next daily session (one probe).
E. Driver: spi_tx/spi_rx return false on cap exhaustion; spi_flash_read propagates it; sf_is_initialized treats a failed transfer as inconclusive (not a strike). IWDG reload every 256 bytes inside sf_ti_backup_read/write and the GC walk (three loops; feeds exist per chunk today).
F. Dead I2C removal: zero flash gain (already compiled out under TIUART_ONLY) — deferred to a hygiene commit, not 17079.
Estimated cost: A ~180 B, B ~50, C ~90, D ~60, E ~80 = ~460 B of 624.

## 3. Bench repro (G) — proposed on 72379322 (TI Fota Failure group; its TI boots but never cals, so nothing is lost)
1. Craft a non-booting TI image from v392: reset vector @0xFFFE zeroed, repacked (CRC valid, BSL readback passes, the TI never banners) -> `msp999.bin` (999 is unmistakable and outside any roll). Local file ready: scratchpad/msp999_nonboot.bin. Upload only on go.
2. On 17078: set allowTiFotaVer 999 on 72379322 -> expect the field loop (3 BSL per session, heal reboot, ~4 min cycle). Stop it with allowTiFotaVer 0 (tests §1).
3. gen2fw 17079 -> then allowTiFotaVer 999 again -> pass criteria: no ST reboot (bBootCount flat), at most 3 sessions with a BSL attempt then none (breaker), meterVal intact, TI parked (sfGatedUnstable counting, no heal), one probe at the daily session.
4. Recovery: allowTiFotaVer 392 -> the TI (BSL is ROM) takes a good image -> boots -> breaker clears.

## 4. Not in 17079
Crystal Acres 29's 344-era BSL password refusal (separate: BSL password = the 344 image's vector table; needs the 344 build's vectors or a mass-erase entry), pulse 13 vs 9 (policy), fringe data-POST chunking (17051 policy), the 576 B slot headroom (17079 spends ~460 of the 624 left; after this the release image is at the cap — the next ST change needs a diet).
