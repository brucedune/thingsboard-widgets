# Session prompt — 17040/354 release readout + fleet convergence

Continuing from 8/26 (session 9f13368c). Read memory
`little-acres-sf-migration` FIRST (authoritative campaign state) and
`rig-regression-pairing` + `site-fw-pin-cleanup` (standing rules).
Cal-function code work lives in Bruce's OTHER session — see
`cal-spec-v349-354-handoff.md` (repo root); this session = fleet ops
only (scans, attr writes, cohorts, readouts).

## State at handoff

- **17040/354 released 8/26 ~05:00Z to 222 not-metering devices**
  ("do them all"): every reachable installed not-metering unit, any
  fwVer (17037 x130, 16185 x53, 17032 x17, 12 old-rev singles), incl.
  NoWater units; 20 VB/GV members as LOGGED PIN EXCEPTION. Excluded:
  4 TI-Silent corpses, bench groups (Wyse Test, Flow Testing).
  222/222 written+verified. Cohort: `cohort_17040_release.json/.csv`
  (old session scratchpad — copy them).
- **Early readout (13:23Z)**: 21 converted; clean recovery 7/20=35%
  (biased low — early reporters are the chronic FC class). All 7
  recoveries = old-rev SILENT class (incl. a 12377-era unit), meterVal
  baselines intact, 5/7 at gain 29. 10 re-railed @55 (chronic acoustic
  self-identifying). 201 pending daily check-in.
- Blocking 50gal/5gpm regression passed (Bruce); trio ran
  17037→17040/354 clean; 17040 = 5 chunks, **~1.0 KB under the 256K
  FOTA erase ceiling — next rev NEEDS a build-time chunk check or it
  breaks all 256K OTA.**

## JOB 1 — full-cycle readout (~24h after 05:00Z)

Sweep `cohort_17040_release.json` (script pattern in old scratchpad:
compare deviceState ts vs RELEASE_TS 1787722800000, fwVer==17040,
meterVal ts fresh). Report:
- Clean-subset recovery rate (~190 non-NoWater; realistic ceiling
  60–70% — ~24 members are verified never-metered dead meters)
- Re-railed @55 list → merge into acoustic/dispatch lists (they
  self-identified under the rebuilt ladder)
- '7786 Forest at Sherman (failed @gain 38 — transient? recheck)
- Pace East 3x failure cluster (new acoustic-investigation property,
  joins Sunview + Shirlee's)
- Recovered-at-high-gain overcount watch: '3287 Coleman g50, '9412
  Aurora g47 (usage-rate vs pre-baseline — the '3051 35x check)
- Salvage-zero check on all recoveries (meterVal<=5 where history >5)
- NoWater units: expected fails, count separately

## Loose ends (in priority order)

1. **recal-11**: '6620 PW2 + '2669 Parker re-armed (recalibrate=true
   fresh edge 8/26) — did they fire and land <45? '1244 Cactus quiet
   since 8/23 (watch). Set recalibrate=false on all recal successes
   to re-arm the trigger (edge semantics — see write log).
2. **VB/GV pin cleanup**: 20 exception pins from the release — delete
   (with Bruce's confirm) when VB/GV site levers move to 17040.
3. **Dispatch list** (physical service): TI-dead '4122 CJ, '2382
   Cactus, '2945 Pleasant Acres, '2530 VB, '0260 Shelby's, '6984
   Browns (predicted by scan 24h ahead!); sick-flash '5097 VB +
   '7897 Azulejo (spiInitFail ~5.9k); '0011 Kingsbrook, '5408
   Crystal, '8587 Highlands.
4. **If readout green → next 17040 waves**: the 136-device HIGH
   degradation queue (`ti_degradation_results.csv`, clean-marker
   subset first), then healthy-fleet phase 2 property-by-property
   (group levers + confirmed pin cleanup per site rule).
5. **Ops lists**: high-ADC/compression class (`adc-ppk-fleet-0825.csv`,
   108 devices, joint ppk×tnormSd discriminator), stale No Water
   flags (6 healthy units), 16048 graveyard errata
   (`ERRATA_field_silence_post_16048.md` — known cause + recovery).

## Tooling (COPY from old scratchpad)

`C:\Users\Bruce\AppData\Local\Temp\claude\C--Users-Bruce-Documents-GitHub\9f13368c-ccdd-48f1-816d-12f5754edcc2\scratchpad\`
- `tb_auth.py` (+ tb_delete helper) — **tokens are Bruce-pasted
  browser JWTs, 2.5h hard expiry, NO working refresh** — expect to
  ask each work burst; save to tb_token.txt; NEVER print. MCP tb_*
  tools work for single-device reads when token dead (server auth,
  no bulk fwVer filter).
- Scanners: `tb_17037_yield.py` (edit fwVer filter for 17040),
  `tb_recharacterize.py`, `tb_yield_gain_audit.py`,
  `tb_ti_degradation_scan.py` (checkpointed), `tb_pipe_correlation.py`
- Cohorts/results: `cohort_17040_release.json/.csv`,
  `cohort_recal11.json`, `casualty_watchlist_29.json`,
  `ti_degradation_results.csv`, `tb_write_log.txt` (FULL audit trail)
- Watchers: `tb_trio_watch.py`, `tb_dev_watch.py` (rig)

## Key facts (hard-won — do not relearn)

- entitiesQuery latestValues ATTRIBUTE lags real writes by hours —
  re-verify write lists with per-device scope reads (8/13 gotcha).
- "No Water" device attr = dry-lot flag (cal impossible); ~50x
  enriched in failures; exclude from casualty math.
- Gain bands: 26–44 healthy, 47+ elevated, 55 = ladder ceiling =
  failed-acquisition fingerprint. tnormStddev 65535 = saturated
  sentinel; qual 0 is overloaded (unset OR worst).
- Wedge boundary: pre-v304 TI FOTA sessions mint the flash wedge
  (self-heals on 17036+); post-v304 clean.
- Fleet pairs for rig seeds (matrix rule): 362/209, 363/219,
  15147/256, 16022/260, 16131/296, 16185/314, 16193/320, 17032/344,
  17037/344, 17040/354. Group-level only on the rig, no pins.
- Debugger bench unit = 79459697 (Wyse Sample 7). Rig trio =
  72714423/72718549/70273063 (Flow Testing, group-governed).
- Old-session scratchpad also holds tb_token.txt Bruce sometimes
  updates: `...253a7f06-131c-43dd-8d6e-2b24d8b18044\scratchpad\`.

Start with: copy tooling → ask Bruce for a token → run JOB 1.
