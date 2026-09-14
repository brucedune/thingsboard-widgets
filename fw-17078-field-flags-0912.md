# 17078/391 field flags for the bench session — 2026-09-12

Source: fleet-ops session, Wave 1 redo roll (264 devices, 17078/391), morning of 9/12.
Principle from Bruce, 9/12: **TI issues should never be the source of an ST reboot.**

## 1. TI-FOTA failure -> SPI "wedge heal" -> ST reboot loop (VB 159, 72390030)

Live specimen, one cycle every 3 min 50 s since 08:20, ~15 boot sessions/h, 170-190 s radio each, VddAdc 3608 -> 3552 in the first hour.
Highlands 9 ('8587) and VB 117 ('9347) ran the same loop for 22 min and 3.5 h and broke out by luck (a boot that heard the banner).

Cycle, with code anchors (all verified against DuneFW_L5_2 head):
1. Boot (flag 20 = PIN|SOFTWARE, boot.c). init.c:413/430 bsl_reset(false) x2, no INFO -> hard_reset_cnt 2.
2. Boot radio session (init.c:73). Attrs: allowTiFotaVer 391. Failed-version blocklist (`tifota_lastFailedVer`) is RAM -> empty after reboot.
3. Early SEND_STATUS (post A). STFOTA/FOTA skip.
4. TIFOTA gate (bg95.c:1679-1693) passes -> fetches msp391.bin (~112 KB) every cycle = the radio cost.
5. bg95.c:1770-1810: 3 x { ti_fota() BSL password/erase/write OK (tiBslOkCnt +3/cycle) ; bsl_reset(true) soft 10 s + hard 10 s, no INFO/banner -> tifota_config_err++ }. Fingerprint: config_err 3, hard_reset 5, elapsed 14-16 s.
6. bg95.c:1895: not verified -> blocklist 391 (RAM); rollback needs SPI backup, tiBackupVer 0 -> none. fsm_fail_TIFOTA 1.
7. Late SEND_STATUS (post B): spiReadyTimeout true; status_report.c:191 + misc.c:206 each call sf_is_initialized() -> marker read fails twice -> SF_SELFHEAL_STRIKES (2) reached, `sf_heal_reboot_used` is per-uptime and uptime is 2 min -> reboot armed (spi_flash.c:1245).
8. PWRDN, radio off -> main.c:497 NVIC_SystemReset. wdCheckpoint 4 (RADIO) on every boot. Back to 1.

Why nothing bounds it: blocklist in RAM; heal limit per uptime; ti_monitor recovery needs 5 x 60 s silence (> uptime) and its only image is the RAM 391 that is failing; radio overuse limiter counts periodic check-ins only (radioOveruseCnt = 1 throughout).

Hardware note (ti_bsl.c:329-364): flash is on VBATT, only the TI is behind VS1; shared SCLK/MISO/MOSI are floated during VS1-off and SPI1 re-inited on restore. The marker read failing in the SAME session as three BSL power cycles is a bus/sequencing artefact of the TI transition, not a flash wedge.

Asks:
- Wedge heal: never arm while a TI reset/FOTA happened this uptime (or re-verify the marker after spi_bus_pins_restore + a settle); rate-limit heals across boots in a BKUP register (e.g. max 1 per 6 h).
- TI-FOTA: persist a per-version attempt counter in BKUP; after N failed sessions stop fetching/flashing that version until the attr changes; count boot sessions against radioOveruseMax or add a boot-loop breaker.
- Root cause open: BSL reports write OK but TI never banners on 391; 368 was running on this board minutes earlier. Remote test offered: allowTiFotaVer=368 on VB 159 (Bruce's call).


Prior fixes and why they do not cover this case (Bruce 9/12: "I thought this was resolved"):
- Rev 16158 (7/2): uninitialized status byte in flash wait-ready -> dead SPI spun 7-12 min -> IWDG crash-loop. Fixed. VB 159 reboots by SOFTWARE reset with bCrashCount unchanged, so this is not it.
- Rev 17035 (8/11): flash parked in DPD for 6 s around every TI reset (shared-bus port-init transient). Assumes the TI comes up. Here it is reset 6x per session and never boots.
- Rev 17036 (8/12): two bad marker reads -> one reboot heal per UPTIME, on the premise that "a boot with a settled TI always reads clean." With a TI that never settles, uptime is 4 min and the limit resets every cycle. This heal is the reboot source.
- Rev 16030 (5/26): tifota_lastFailedVer blocklist is RAM by design ("operator can clear via ST reboot"), so the 17036 reboot wipes it and every boot re-fetches and re-flashes 391.
Note from the 16158 commit: a TI with tiBslOkCnt climbing, FailCnt 0, never booting what it is given = core/clock silicon failure, RMA class. VB 159 matches (BslOk 205 -> 214 this morning, 1,193 banners / 68 hard resets on 368 pre-roll = boot-and-die cycling). Expect the 368 retarget to be low-probability; the firmware ask is that an RMA-class TI cannot take the ST and battery down.


**Design rule (Bruce 9/12): the ST cannot rely on SPI-flash state while the TI state is not stable.** Concretely:
- Any flash-health judgment (marker read in sf_is_initialized, wedge strikes, sf_init/erase decisions, RAM-only demotion) is INCONCLUSIVE while the TI is unstable: no INFO/banner since the last TI reset, a bsl_reset/ti_fota/ti_power_cycle within this uptime, or the ti_monitor timeout active. Gate the strike counter on a "TI stable" predicate; do not arm the heal, do not erase.
- When the TI is known-bad (N failed boots after a write, or ti_monitor recovery exhausted), park it in reset: RST low = every MSP430FR GPIO high-Z (ti_bsl.c:370 comment), so the shared SCLK/MISO/MOSI belong to the flash alone. Re-release only on an attribute change or next daily session.
- Both cross-boot limits (wedge heal, failed-version blocklist) go in BKUP registers, not RAM.


**Wait-loop audit of the SPI-dependent code (Bruce 9/12: "any function dependent on SPI could hang if TI state unknown").** All loops found via grep of spi_flash.c, at25sf321b_driver.c, ti_hci_impl.c, ti_bsl.c, misc.c:
- Bounded by count: spi_tx/spi_rx per-byte TXE/RXNE wait, SPI_POLL_CAP 10,000 (at25sf321b_driver.c:196) — returns SILENTLY on cap, byte not transferred, no error flag. I2C flag waits I2C_POLL_CAP 200,000 (ti_hci_impl.c:54) -> HAL_ERROR — DEAD CODE on fleet builds: TIUART_ONLY is defined (config.h:373), MX_I2C1_Init is compiled out (main.c:244), ti_hci_drain returns before its I2C loops (ti_hci_impl.c:326-347) and the I2C receive path sits under the #else of TIUART_PRIMARY (:517). Bruce 9/12: I2C is no longer in use. Candidate for removal so the audit surface shrinks. sf type detect SF_INIT_MAX_RETRIES. BSL write BSL_WRITE_RETRIES.
- Bounded by time: wait_for_ready_status (poll cap 2M + wall clock SPI_READY_TIMEOUT_MS + FF-mute heal cap 3000 x 2 ms, IWDG fed only in the FF branch); sf_wait_idle(deadline); quiesce wait SF_TI_RESET_QUIESCE_MS (IWDG fed); backup erase settle 800 x 10 ms (IWDG fed); TI drain/pass budgets; BSL UART flush/boot waits; monitor verify 30 s.
- Unbounded: misc.c:417 debug-UART TXE spin (not SPI); misc.c:445 while(1) in the fault path (intended). misc.c:212 fill loop is RADIO_TEST only.
Residual hazards even with every loop bounded:
1. Per-byte cap x large transfer with no IWDG reload: sf_ti_backup_read/write loops (spi_flash.c:1043, :1152) and GC walk a whole image or region byte-by-byte; on a dead bus that is ~0.36 ms per byte-wait, minutes for a 112 KB image, IWDG at 32.8 s -> watchdog reset (boot flag 36). This is the 16158 shape with a different caller.
2. Silent returns: spi_tx/spi_rx give no error, so callers consume whatever is in the buffer. CRC protects the TI image; the sanity gate protects meter salvage; NOTHING protects the init marker read (-> 17036 heal) or per-record reads.
3. No function in the flash layer consults TI state. That is the gap Bruce named: gate the flash layer on a TI-stable predicate (or park the TI in reset first), and make spi_tx/spi_rx cap-exhaustion a hard error the callers must handle.


**Refined principle (Bruce 9/12): the SPI flash exists to serve TI output; if the TI is not functioning, the flash is irrelevant.** Verified against spi_flash.c:44-101 and the writer list: the chip holds (a) the init marker, (b) the meter-entry log = meterVal checkpoints, (c) the TI backup image, (d) the flow/TOF record ring. The ST image goes to internal flash banks (fota.c), not SPI. Every writer (measure.c x6, analytics.c, meter.c x3, ti_hci_impl.c) is TI-data-derived, and meterVal only changes with TI data. Therefore with the TI unstable or dead there is exactly one legitimate flash operation: the boot-time meterVal restore (a read; on failure carry the last known value, never erase, never heal). Everything else - record writes, marker health checks, wedge strikes, heals, GC, backup saves - should be skipped until the TI is healthy again. This removes the whole class of "SPI-dependent function hangs or misjudges because the TI wrecked the bus" rather than bounding it loop by loop.


Field follow-up 09:35-09:56: Bruce reverted VB 159 to gen2fw 17060 (bank swap, boot flag 6 at 09:41), set checkInPeriod 10 and allowTiFotaVer 0 (09:47). The loop continued on 17060 (17036 heal is in 17060 too) until 09:56, then the device went silent (VddAdc 3511, falling). NOTE: allowTiFotaVer=0 on a device with lastver 0, tiUartVer 0, tiBackupVer 0 takes the Rev 17002 factory-bootstrap path (bg95.c:1654-1666) and flashes TI_DEFAULT_FW_VER 320; msp320.bin is live in the bucket. There is NO remote way to tell the ST "leave a dead TI alone": every non-zero value is flashed, zero bootstraps 320.
Ask H: an explicit TI-FOTA-off sentinel (e.g. allowTiFotaVer = -1 or a `tiFotaDisable` attr) that skips TIFOTA entirely and parks the TI in reset.

**17080 first result (Ontario Place 91, 11:27):** ST boot count flat at 1230 from 11:31 through 11:52 with the TI still dead and the TI monitor hard-resetting it every ~60 s (hard_reset_cnt 5 -> 11 -> 19). No heal reboot. VddAdc 3533 -> 3545. The reboot loop is closed on this specimen; TI recovery behaviour unchanged as expected.
**Crystal Acres 29 variant:** with the TI ALIVE on 344 and NO TI-FOTA attempt in the session (blocklisted), 17078 still heal-rebooted every ~5 min from 10:26 (17 boots in 90 min, Vdd -93 mV). The legacy-TI session alone wrecks the marker read. Same window 17061-17078; 17060/344 ran for weeks without it.
**Pleasant Acres 44** (dead TI on 17037 for weeks) landed 17078/391 at 11:23 and the TI came back: Metering, gain 28. Revival count for the pre-dead class now 5 of 8.

## 2. TI rejects the BSL password for 391 — Crystal Acres 29 (TI 344) AND Pace East 11 (75369502, TI 368)
Pace East 11: tifota_bsl_passwd_err 6, lastFailedVer 391, TI intact on 368, not looping (17078, boot flag 6). So it is not only the 344-era image; a 368 TI also refuses the 391 password. 2 of 242 landed.
tifota_bsl_passwd_err 3-6, baud 3-6, init 3 per attempt; TI survives intact on 344 (fwVerTi 344 for 60+ days; 17060/368 roll failed the same way 9/11 09:24). Only 1 of 105 landed roster devices with a TI-FOTA failure record. Points at the password/vector-table scheme for the 344-era image, not this board.

## 3. `pulse`: group attr 13 fleet-wide overrides the TI 9 default
238/241 groups carry pulse=13 (group template since Dec 2024). ST pushes it every drain (hci.c:237), Rev 17065 BKUP mirror + TI v369 FRAM overlay keep the last pushed value after an attr delete. The 9 default has never run in the field. Roster now pinned pulse=9 (Bruce 9/12); fleet-wide is open. tiPulse reads 0 for TI 390-399 (diag band, hci.h:681) so 391 cannot confirm the count from TB.

## 4. 17078 image is 576 B under the 112,640 B FOTA slot ceiling.

## 5. Fringe-site data POSTs (CSP150, 72383795)
RSRP -117..-121: hourly data POSTs fail ERROR-class every session (Rev 17051 policy keeps the backlog), status posts succeed, records never reach TB. Pre-existing on 17060. Question for the policy: at fringe RSRP, is a smaller chunk or a per-session byte cap better than retrying the same 118 KB every hour?

## 6. Accuracy regression on metering devices after landing (9/13 evening) — the gate Bruce cares about
Register-derived gal/day (meterVal at midnight) and status-post tnorm stats, pre vs post landing:
- **Holly Tree 53 (77054379, 16185/314 -> 17078/391, 9/12 09:30): NEW PHANTOM.** ~100-138 gal/d pre -> 449 / 472 gal/d post. Status tnormAvg 371 -> -1702 ps with stddev unchanged (42 -> 49): the no-flow level moved ~2 ns (offset median -2.5 ns), and the records now show 100% flow>0 at median 0.6 gpm through the night. Fringe RSRP -113 (upload struggler), so records are thin, but the register is unambiguous. Over-billing since landing.
- **Holly Tree 64 (77056069, 16185/314 -> 17066/372, day 1, 9/10 08:39): register STOPPED.** 123/118/173 gal/d pre -> 11.6 / 0.0 post. tnormAvg 384 (sd 108) -> 24 (sd 30). Two readings: (a) 372 removed a ~380 ps phantom and the site is genuinely near zero, or (b) the register is being held. Records still show flow>0 73% at ~1 gpm, which argues for (b) or for event-snapshot bias. Needs a water-on confirmation.
- **Shady Lane 76 (79455422, 17060/368 -> 17078/391, 9/12 07:04): PHANTOM REMOVED (probable).** ~105 gal/d pre -> 15 post; tnormAvg 250 -> 14, records flow>0 95% -> 7%. Consistent with the Shady Lane phantom history; a billing correction, not a regression.
- Direction changes UNKNOWN -> FLIPPED on 4 of 32 (Oaks 36, Oaks 31, Sara Drive 1008, 1010); Sara Drive offsets re-anchored 1-2.3 ns (from ST 362).
Ask I: the offset re-anchor at TI FOTA is not neutral on metering devices; both signs appear. Before Wave 2 (metering population) the crossing must be shown offset-neutral on the bench for 17060/368 -> new pair, and the ST should carry the pre-FOTA zero across (Rev 16123 intent) unless the TI cal explicitly re-derives it.
