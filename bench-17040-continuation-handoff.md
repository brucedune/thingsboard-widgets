# Session prompt — bench 17040/354 validation + fleet follow-through

Created 2026-08-26 from session 253a7f06 (the Little-Acres/wedge/cal-spec marathon).
Read memory `little-acres-sf-migration` FIRST — it carries the full ledger. Sibling
handoffs in repo root: `cal-spec-v349-354-handoff.md` (for the cal-function session),
`fleet-17037-rollout-handoff.md` (superseded rev numbers but correct procedures).

---

```
STATE (all committed + pushed; binaries in buckets):
- WORKING PAIR, bench-validated: ST 17040 (branch sf-migration-fix @ 77e859b) +
  TI v354 (branch cal-spec @ 79874d2). Fleet still on 17037/344.
- ST 17035-17040 in G/ paths of both ST buckets; TI msp349-354.bin in dune-firmware-ti.
- Bench trio (Flow Testing rig): 72718549 / 72714423 / 70273063, device-pinned
  gen2fw=17040 + allowTiFotaVer=354. Board 2 = 79454912 (E/512K, on SWD debugger,
  TB id 35ea96e0-8eb4-11f1-a1a6-391af391818e), locally flashed bootloader+17040,
  pinned 17040/354 — the cal-spec debug platform (UART console possible).
- Validated so far: wedge self-heal (86s), install time back to baseline, migration
  + salvage, reverse-flow record/bill split ('8549 FD-flip: revGal 3.779, meterVal
  flat, event+session fired), noise gate live (tnormMasd/gatedAggs on '8549).

WHAT 17038-17040 / v349-354 DO (one-liners; full detail in the cal-spec handoff):
  17038 noise gate: totalization deadband = max(256ps, noiseGateK x MASD); attr
        noiseGateK default 2, 0=legacy; telemetry tnormMasd + gatedAggs.
  17039 signed flow: record both directions, bill forward only; revGal key.
  17040 reverse events REPORT (end-gate on observed volume — 17039 gated on billed
        volume = silent reverse events; deterministic bug, fixed + bench-proven).
  v349-354: env searched per-device, dtof fidelity, skip vetoes, truncated
        lowest-gain-first grid + early exit, run-center env pick, bounded amp hold
        (compression-range bounds), walker decay + quiet-deferred recals, TI
        multi-skip aggregate invalidation.

JOB 1 — finish bench validation (blocks everything downstream):
  a. Forward-billing regression: 50-gal truth run on '4423/'3063 at 17040/354 —
     billed volume must match rig truth (the noise gate + signed-flow path both
     touch totalization). ALWAYS ask Bruce for true volume + flow (standing rule).
  b. Quiet-commit stopwatch: mag each trio unit, record mag->Metering time and the
     commit (gain / env / sd-dtof / skips). env is per-device now (30..45).
  c. '8549 0.5gpm torture on the new commit: walker holds (no ratchet), NO mid-flow
     recal, FailedCal-flag-while-metering is INTENDED, deferred recal fires ~2min
     after shutoff. gatedAggs climbs while meterVal holds.
  d. Overnight soak: walker decay, amp-hold cadence (needs adcCapPeriod cranked to
     see actuations), deferred-recal timing, no spurious self-heal reboots.

JOB 2 — ST 17041 (build on sf-migration-fix on top of 17040):
  Check-in schedule defaults for Gen2 (bg95.c:92 dynamicConfig init):
    radioTimeHour 9 -> 1, radioTimeDurationHours 3 -> 4, radioTimePeriodDays 5 -> 1
  Rationale: fleet Gen2 runs COMPILED defaults (group radioTime* attrs never
  propagate to devices — 3rd propagation casualty) so check-ins land 9am-noon
  local instead of Bruce's intended 1-5AM daily. Scheduler itself is correct
  (connmgr.c ~150-230: local-hour via NITZ tzOffset, next-day + rand(0..duration)).
  SAFE for GenI: different codebase entirely; GenI additionally protected by
  device-scope radioTimePeriodDays=5 (VERIFIED 8/26: 2,338 of 2,354 installed
  GenI have it; GenI = serial 'Device 20*', Model M-L5DB where tagged).
  Bench-verify on the trio (expect next-day check-in 1-5AM ET) before fleet.

JOB 3 — fleet writes pending Bruce's go (use tb_deploy.py etiquette: preview
  old->new, explicit yes, verify read-back, log to tb_write_log.txt):
  a. 16 installed GenI stragglers missing radioTimePeriodDays=5 (query: entityName
     'Device 20' + Installed=true + NOT periodDays=5).
  b. Cohort 3: 186 active devices on 15090/25x (Oaklawn bulk + Roper + Brighton +
     Riverview + Midtown) -> gen2fw=17041(?)+allowTiFotaVer=344 or 354 per Bruce.
     DIRECT hop, never via 16023-17032. Expect per-device: ~3-4min TI Silent ->
     1-2 wedged statuses -> self-reboot -> Metering, totalizer intact (NORMAL).
     Diff Property attr vs GROUP membership before writing (attr != membership).
  c. VB pin cleanup: 9 healthy devices still device-pinned gen2fw=17028.
  d. QA follow-ups: 23 recalibrate-armed devices' outcome sweep (calStartedAt >
     armTs = fired; then DISARM recalibrate=false — attr re-arms every boot);
     VB v320 stuck-cal stragglers; '5097 lot 211 = hardware replace.

STANDING ISSUES / DECISIONS:
  - Group->device attr propagation is broken for config keys (FOTA levers, cal
    tuning, radioTime*) — the TB rule-chain fix is the highest-leverage platform
    item; every campaign so far has hand-written device attrs instead.
  - '8549 low-flow crossing bistability = open joint problem with the cal-function
    session (board 2 + UART console is the tool). sd-65535 Tier-A fleet class =
    metering-on-noise; noise gate contains billing, units still need recal/replace.
  - TI INFO packet export of gDuneAggInvalidated deferred (needs paired ST hci.h
    mirror bump).
  - SPI TI-backup code stays (Bruce: may resurrect). PWB rev will unshare the
    TI/flash SPI bus (hardware fix for the wedge class).

TOOLS / ETIQUETTE:
  - Scratchpad of session 253a7f06 holds tb_auth.py, tb_deploy.py, cohort jsons,
    tb_write_log.txt (audit trail) — copy to the new session's scratchpad:
    C:\Users\Bruce\AppData\Local\Temp\claude\C--Users-Bruce-Documents-GitHub\
    253a7f06-131c-43dd-8d6e-2b24d8b18044\scratchpad\
  - TB tokens: Bruce pastes short-lived JWTs; each NEW login kills the prior
    session's token, so expect mid-task 401s — re-request, never handle passwords,
    never print tokens. TB MCP tools work for reads as fallback (no bulk
    latestValues; fossil-ts partitions unreadable — range-query real windows).
  - Range-query TB, never trust latest (fossil timestamps pin latest forever).
  - Rev ledger: TI v345-348 = Fo experiments (test pool only); v349-354 = cal-spec.
    ST 17033/17034 = Fo; 17035-17040 = sf-migration-fix. Always git fetch + check
    tags/buckets before taking a rev number (parallel sessions share the repos).
  - Flash recipe (board 2): STM32_Programmer_CLI -c port=SWD mode=UR, boot bin @
    0x08000000 (L5Boot_loader/Debug), app bin @ 0x08004800, -v, then mode=UR -rst.
    SWAP_BANK was 0; check -ob displ first if it misbehaves.
```
