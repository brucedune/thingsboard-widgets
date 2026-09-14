# Rustic Acres — customer go-back triage (new session prompt)

Paste everything below the line into a fresh session. Have a ThingsBoard JWT ready to paste when asked
(log out of TB or use incognito first — closing Chrome does not clear localStorage, so re-copying gives
the identical expired token).

---

Rustic Acres — customer go-back trip. I need to know which meters to replace, which need a mag reset /
firmware fix, and which are genuine cell-coverage cases getting external-antenna devices (10–12 dB RSRP
improvement).

Run the same analysis you did for Ontario Place MHC on 2026-08-31. The method, the decision rules and the
traps are in memory — read these first and follow them:
`goback-triage-rules`, `checkin-cadence-spec`, `fw-brick-16048-16185`,
`ontario-place-goback-2026-08-31`, `mvu-outlier-debugging`, `site-fw-pin-cleanup`, `tb-write-access`.

## Method

Work from a scripted bulk pull, not per-device MCP calls. Keep the raw data on disk in the scratchpad and
script the analysis — never load big telemetry dumps into context.

1. **Find the site.** `tb_list_property_groups` with `name_contains=Rustic`. Ontario Place had two groups
   with the same name where only the `-CUST` one held devices — check both before assuming.
2. **Bulk pull** attributes + latest telemetry per device, then 300 days of history for
   `rsrp,rssi,sinr,rsrq,fwVer,fwVerTi,missedConnectCnt,missedStatusCnt,VddAdc,Vdda,bBootCount,bCrashCount,radioOper,status`.
   Use `POST /api/entitiesQuery/find` (1000/page) when the site is large. Base URL
   `https://thingsboard.dunelabs.ai`. Abort loudly on 401.
3. **Liveness.** Last radio contact from `rsrp,rssi,status,fwVer,sinr,rsrq` ONLY. Never
   `meterValUpdated` — it carries server-side batch stamps and will make dark meters look alive.
   Drop any point with a timestamp in the future (the tiTime ×1000 corruption hits
   `flowRate`/`tofNorm`/`temp_int_c`).
4. **Cadence spec** per `checkin-cadence-spec`: split by generation (GEN2 reports `VddAdc`, GEN1 reports
   `Vdda` only; nominal 24 h and 120 h), 30-day window, trim outliers on modified z-score > 3.5, bound =
   2× cohort median p90 with fallback to 2× nominal if the cohort has drifted past 1.5× nominal. Report
   false positives on the online population — that is the number that matters.
5. **The firmware-vs-pin test.** Compare each device's running `fwVer` to its `gen2fw` SHARED_SCOPE pin,
   and pull `allowTiFotaVer` too. At Ontario Place this was the single best predictor of death: 13 of 13
   pending were dark, 74 of 74 in-sync were online. **Flag every dark lot pinned to 16185 or 16048.**
6. **Per-version kill rate.** For each firmware version, how many devices ever ran it and how many went
   silent within ~3.5 days of receiving it. Watch for TI version latching to 0 on the update day and
   never returning — that is the 16185 signature.
7. **Test coverage as a hypothesis rather than assuming it.** Measure each meter's median RSRP in the
   10 days *before* its own update, then compare the meters that died against those that survived the
   same version. At Ontario Place the distributions overlapped almost completely, which killed the
   coverage explanation. Also cross-tab carrier × firmware band against dark rate — AT&T on pre-17019
   firmware was the danger cohort there.
8. **Metering-side scan:** register movement over 45 days, `failedCal`, `rejPct`, so the trip also covers
   meters that are online but not measuring.

## Decision rules (Bruce's — do not re-derive these)

- An **external-antenna device is a whole new meter**. Decide hardware-or-not first, then the variant.
- **Never replace a meter that is metering, attaching, and on a healthy battery** just because RSRP is
  marginal. Those go on a no-action list.
- **Any meter that failed FOTA is an antenna candidate** — but trigger on *terminal* failure only.
  `fsm_fail_TIFOTA` was non-zero on 90 of 92 healthy-and-unhealthy meters at Ontario Place, so the raw
  counter is useless. Terminal = `tifota_fetch_err` ≥ 3, TI version latched 0 and never returned, a retry
  loop that never exited (`stFotaHttpFail`, huge `tifota_hard_reset_cnt`), BSL handshake errors, or the
  meter died on the update itself.
- Ext-antenna variant for a door already getting hardware: RSRP ≤ about −122 dBm.
- Battery: `VddAdc` below ~3400 mV is spent (compute the site's own p10 to confirm). Do not waste a reset
  attempt on those.
- Do not call a meter dead on a few days of silence — use the cadence bound, not a fixed day count.

## Deliverable

A CSV work order in `C:\Users\Bruce\Documents\GitHub` (Bruce prefers CSV over xlsx; write it UTF-8 with
BOM so Excel opens it directly), plus a published HTML Artifact. Columns that earned their place last
time: Action, Lot, Device, State, DaysDark, LastRadioContact, FW_now, gen2fw_pin, SyncState, TI_now,
allowTiFotaVer, Carrier, RSRP_final30_dBm, VddAdc_mV, Gen, CadenceVerdict, Silence_h, Bound_h,
Silence_x_bound, Basis. Group rows by action and state the evidence per row.

Separate what is verified from telemetry, what is inferred, and what was not checked. Give parts counts
(ext-antenna meters, standard meters, spares) and a doors-to-visit total.

## Rules of engagement

- **Read-only. Make no ThingsBoard writes.** If pins need changing, show the exact before/after list and
  wait for my explicit OK.
- Keep it scoped to Rustic Acres unless I say otherwise.
- Push back with numbers if the data contradicts something I tell you — that happened twice on Ontario
  Place and both times the data was right.
- Flag any discrepancy between two sources with exact figures rather than quietly picking one.

## Still open from Ontario Place

Seven dark lots there (11, 12, 43, 49, 92, 100, 132) are still pinned to `gen2fw = 16185` and are waiting
on my approval to be repointed at 17037/344. If Rustic Acres shows the same pattern, surface it the same
way — do not act on it.
