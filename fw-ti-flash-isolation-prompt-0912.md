# Prompt for the firmware dev session — TI/flash isolation (2026-09-12)

Context: fleet-ops found a self-sustaining ST reboot loop on 17078/391 in the field. Full evidence, code anchors and the
wait-loop audit are in `fw-17078-field-flags-0912.md` (read section 1 first). Live specimen: VB 159 (72390030), still
cycling; earlier survivors Highlands 9 (75368587) and VB 117 (72389347).

## Design rules (Bruce, 9/12) — treat as requirements
1. A TI problem must never be the source of an ST reboot.
2. The ST cannot rely on SPI-flash state while the TI state is not stable (TI and flash share SCLK/MISO/MOSI; flash on
   VBATT, TI behind VS1 — ti_bsl.c:329-364).
3. The SPI flash exists only to serve TI output (init marker, meterVal checkpoints, TI backup image, record ring;
   spi_flash.c:44-101; every writer is TI-data-derived; the ST image is in internal flash). If the TI is not
   functioning, the flash is irrelevant. The ONLY legitimate flash op with an unstable TI is the boot-time meterVal
   restore — a read; on failure carry the last known value, never erase, never heal.
4. I2C is no longer in use (TIUART_ONLY, config.h:373). Remove the dead I2C paths rather than auditing them.

## The loop (one cycle = 3 min 50 s, ~15 boot sessions/h, 170-190 s radio each, VddAdc -56 mV in the first hour)
1. Boot (flag 20 = PIN|SOFTWARE). init.c:413/430 reset the TI twice, no INFO.
2. Boot radio session. `tifota_lastFailedVer` blocklist is RAM -> empty again.
3. TIFOTA gate passes (bg95.c:1679-1693) -> fetches msp391.bin every cycle.
4. bg95.c:1770-1810: 3 x { BSL password/erase/write OK (tiBslOkCnt +3) ; bsl_reset(true) 10 s soft + 10 s hard, no
   banner/INFO -> tifota_config_err++ }.
5. Not verified -> blocklist 391 (RAM). No SPI backup -> no rollback. fsm_fail_TIFOTA.
6. Late SEND_STATUS: spiReadyTimeout true; status_report.c:191 and misc.c:206 each call sf_is_initialized(); two bad
   marker reads on the TI-wrecked bus -> SF_SELFHEAL_STRIKES reached; `sf_heal_reboot_used` is per-UPTIME and uptime is
   2 min -> heal armed (spi_flash.c:1245).
7. Radio off -> main.c:497 NVIC_SystemReset. wdCheckpoint 4 (RADIO). Goto 1.
Nothing bounds it: RAM blocklist, per-uptime heal limit, ti_monitor needs 5 x 60 s (> uptime), overuse limiter
counts periodic check-ins only (radioOveruseCnt stays 1).
Prior fixes do not cover it: 16158 (IWDG spin), 17035 (DPD quiesce assumes the TI comes up), 17036 (heal assumes "a
boot with a settled TI always reads clean"), 16030 (blocklist RAM by design).

## Changes requested
A. TI-stable predicate, and gate the entire flash layer on it: no record writes, no marker health checks, no strikes,
   no heal, no GC, no backup save while unstable (no INFO/banner since last TI reset; bsl_reset/ti_fota/power-cycle
   this uptime; ti_monitor timeout active). Boot-time meterVal restore is the single exception (read-only, no erase).
B. Wedge heal: never arm in an uptime that had a TI reset/FOTA; move the once-per-uptime limit to a BKUP register
   (e.g. max 1 heal / 6 h across boots).
C. TI-FOTA: persist a per-version attempt counter in BKUP; after N failed sessions stop fetching/flashing that version
   until allowTiFotaVer changes. Count boot sessions against radioOveruseMax or add an explicit boot-loop breaker.
D. Known-bad TI (N failed boots after a write, or recovery exhausted): park it in reset (RST low = MSP430 GPIOs high-Z,
   ti_bsl.c:370) so the bus belongs to the flash; release on attr change / next daily session.
E. Driver hygiene (at25sf321b_driver.c): spi_tx/spi_rx cap exhaustion (SPI_POLL_CAP 10,000/byte) must return a hard
   error callers handle, not silently skip the byte; feed IWDG inside the long byte-wise loops (sf_ti_backup_read/
   write spi_flash.c:1043/1152, GC) so a dead bus yields an error, not a watchdog reset.
F. Remove dead I2C code (ti_hci_impl.c:57-200, 366/378/521 and MX_I2C1_Init) under TIUART_ONLY.
G. Bench repro: TI Fota Failure group, hold a unit's TI in reset or flash a non-booting image, run a session with
   allowTiFotaVer set, confirm: no reboot, one blocklisted fetch per N sessions, meterVal intact, no heal.

## Also open from the same roll (details in the flags file)
- Crystal Acres 29 (72385774): TI on v344 rejects the BSL password for both 368 and 391 (passwd/baud/init errors); TI
  survives on 344. Only 1 of 105 landed. Password/vector-table scheme for the 344-era image?
- `pulse`: group attr 13 fleet-wide overrides the TI default 9 (hci.c:237 push, 17065 mirror + v369 FRAM keep the
  last value after an attr delete). Roster pinned 9; fleet-wide is Bruce's call. tiPulse reads 0 for TI 390-399 by
  design (hci.h:681).
- 17078 image is 576 B under the 112,640 B FOTA slot.
- CSP150 (72383795): fringe RSRP -120, hourly data POSTs fail ERROR-class every session (17051 keeps the backlog);
  status posts succeed, records never land. Chunk size / per-session byte cap at fringe?
