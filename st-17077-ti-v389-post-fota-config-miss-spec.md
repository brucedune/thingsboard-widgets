# ST 17077 + TI v389 — a missed post-FOTA config push must not re-flash the TI or stall metering

Status: SPEC for approval (Bruce 9/11 14:58 "I would like to fix this"; "What I saw was TI fota 2x attempts").

## 1. What happened ('3063, 14:43, TI 387 -> 388)
- 14:43:15 want=388; 14:43:19 image staged in RAM; BSL flash OK; 14:43:34 TI up on 388 (banner 388, INFO 388), CAL_INIT, gain 40 / env 30.
- The ST's direct post-flash config push (`ti_update_and_start`: 5 x 450 ms `hci_request_application_config_update`, then `hci_start_data`) got NO response. `bg95_tifota` treats that as a failed leg and its `for (i < 3)` loop RE-FLASHES the TI. Counters across the session: tiBslOkCnt 14 -> 17, tiUartBannerCnt 4 -> 7, tifota_config_err 1 -> 4 = three flashes, three TI boots, three config misses. The 387 FOTA at 10:29 had the same thing once (tiBslOkCnt 12 -> 14, config_err 0 -> 1) and its second pass answered.
- After the third miss the leg ended rc != SUCCESS, so the session skipped CAL_HOLD (the in-session gate) and went SEND_STATUS -> OFF. The OVERRIDES + CAL_GATE queued at RADIO OFF are trigger-window writes; the TI never got START_DATA (g_stReady false) and, at CAL_INIT's 4 s aggregate cadence, sat out the ST-silent backstop: CAL_START_TIMEOUT_AGGS 120 x 4 s = 8 min (14:43:34 -> 14:51:43). Then it swept and metered on its own. Offset/direction retained on the ST, 17076 re-qualified at metering.
- Cost: ~9 min not metering per FOTA, three BSL passes on a healthy TI, and a fleet unit doing this at night looks like a TI-silent event.

## 2. ST 17077
1. **Never re-flash a TI that is running the target.** In the post-flash loop, after `bsl_reset(true)`/`ti_update_and_start`: if `hciConfigState` is not SUCCESS but `bg95_public.tiUartVer == allowTiFotaVer` (banner heard) or `duneInfo.version == allowTiFotaVer` (INFO seen), set `ti_fota_state = TI_FOTA_SUCCESS` and break. Same rule 16167 already applies in the no-INFO branch; extend it to the config-miss branch. Count the miss in `tifota_config_err` as today.
2. **CAL_HOLD retries the direct push.** CAL_HOLD already re-sends the gate every 5 s as a trigger write; add, on the same 5 s tick while `metering_seen == 0` and the last direct push did not succeed: `hci_request_application_config_update()` + `hci_start_data()` directly (the TI listens to direct writes at boot; today's misses were a timing miss on a 2.25 s window). Bounded by the existing hold cap.
3. **Wider first window.** `ti_update_and_start`: 5 x 450 ms -> 8 x 600 ms (constants only).
Flash: (1) ~30 B, (2) ~80 B, (3) 0 B; release has 760 B.

## 3. TI v389
- CAL_INIT backstops sized for the observed 4 s aggregate cadence: `CAL_START_TIMEOUT_AGGS` 120 -> 30 (2 min ST-silent), `CAL_START_GATED_TIMEOUT_AGGS` 60 -> 20 (80 s with a known-alive ST). The normal gate lands 15-25 s after the TI boot (10:29: 17 s), so neither backstop fires in a healthy session. (v329's field deadlock case shrinks from 32 min / 8 min to 2 min.)
- No change to the v388 split guard.

## 4. Verification ('3063, pump unplugged)
1. Flash 17077 lean over SWD (PIN reset -> boot session -> CAL_HOLD -> cal), confirm 'Config update success' or the CAL_HOLD retry landing it, metering within ~90 s of the TI boot.
2. Set allowTiFotaVer 389: TIFOTA leg must show ONE BSL pass (tiBslOkCnt +1, banner +1), CAL_HOLD entered in the same session, sweep and metering inside the hold, 'offset promoted' before RADIO OFF.
3. Repeat once (389 -> 388 -> 389 is not needed; a second FOTA of the same image is refused by the RAM-refresh rule) — instead force one config miss by unplugging the TI UART? Not available; accept the two runs above plus the counters.
4. Then the PVC six on 17077/389 after the 388 verdict there.

## 5. Risks
- (1) accepts a TI that runs the target but never took the config: the overrides re-push at every radio-off and CAL_HOLD's retry covers the start; a TI that truly cannot hear the ST is already the ti_monitor's case.
- (3) on the TI: a self-start 20 aggregates in could seed the search before a late calMinBlank push in a slow session; v317 restarts a below-floor search when the raise lands, so the cost is one extra sweep.
