# Session prompt — Fleet 17037 rollout: verification + cohort 3

Continuing from 8/12 (session 253a7f06). Read memory
`little-acres-sf-migration` FIRST — it is the authoritative state and
carries the full root-cause chain. One-paragraph recap: devices coming
from pre-16023 FW (v1 flash layout) or through legacy-TI FOTA sessions
hit a flash READ-PATH wedge (content intact, reads dead, only an ST
reset clears it) → no meterVal/usage recorded. Rev **17037** (branch
sf-migration-fix @ d25be2f, test+prod buckets) = verified migration +
QLTS tiTime fix + TI-reset bus quiesce (INFO early-release) + wedge
self-heal via controlled reboot (2 bad marker reads → reboot when radio
off, once/uptime) + boot-path meter salvage. Bench-validated 8/12 on
the Flow Testing trio: wedge → self-reboot in 86s → totalizer intact.

## Deployed 8/12 ~15:00-15:45Z (all writes logged in old scratchpad tb_write_log.txt)

- **Cohort 1 — Little Acres 8 wedged** (72715180/8317/8671/2582/0602/
  3051/8812/4076): device-scope gen2fw=17037 + allowTiFotaVer=344.
  '8812 healed early via a 17032 hop.
- **Cohort 2 — VB 16 wedged in-group** + lot-13 '9687 (17032/320
  stuck-cal): same levers. '0204 healed early via 17032 hop. 4
  attr-orphans excluded (70273493, 72383621, 72387945, 79454276 —
  Property attr but NOT in group = pulled meters, returns flow).
- **VB GROUP lever** ("Virginia Beach HOA - Cust",
  503d23b0-5ac4-11f1-b1bb-f3574cce671d): Bruce set gen2fw 17032→17037
  (verified), allowTiFotaVer=344 — the whole 262-device property
  funnels to 17037. Bruce: "wait and see."

## THIS SESSION'S JOB 1 — verification sweep (~24h after writes)

Per device across cohorts + VB group wave, check:
- fwVer=17037, fwVerTi=344
- meterVal ALIVE (ts tracking check-ins) and magnitude ≈ pre-wedge
  (Little Acres pre-8/8 values are in TB history)
- spiReadyTimeout=false, spiInitFail sane
- bootReasonFlags=20 tally (self-heal reboots = expected signature)
- VB Calibrating population collapsed (was 23; mostly the 17032 wave
  in flight + 7 stuck 17032/320 TI-laggards — confirm v320s took 344)
- Residue that did NOT converge = true replace list. Expected member:
  72385097 (lot 211, spiInitFail was 27k = genuinely sick chip).
  Watchlist: 72385253 (TI Silent), plus VB silent class (9 devices).

## JOB 2 — cohort 3 (after sweep is green)

186 active devices still on 15090/25x (v1 layout): bulk of Oaklawn
Park HOA + Roper Center + Brighton Court + Riverview Apartments MF +
Midtown MHP. Direct hop gen2fw=17037 + allowTiFotaVer=344 — NEVER via
16023-17032. Stage property-by-property, Oaklawn first (or a pilot
slice). Expected per-device signature (tell support this is NORMAL):
~3-4 min TI Silent → possibly brief Metering (retained cal) → 1-2
wedged statuses → self-reboot (~1-2 min) → Calibrating → Metering,
totalizer intact. ~10 min end-to-end. Prefer GROUP-level writes where a
whole property goes at once; diff Property attr vs actual GROUP
membership first (attr ≠ membership — VB had 14 orphans). Also: VB pin
cleanup — 9 healthy devices still device-pinned gen2fw=17028 (pins
beat group); clear or update pins when VB baseline confirmed.

## Tools (old session scratchpad — COPY these to the new scratchpad)

`C:\Users\Bruce\AppData\Local\Temp\claude\C--Users-Bruce-Documents-GitHub\253a7f06-131c-43dd-8d6e-2b24d8b18044\scratchpad\`
- `tb_auth.py` — self-refreshing TB REST auth. Token pair in
  tb_token.txt/tb_refresh.txt is from Bruce's API login (NOT browser —
  no rotation problem; refresh chain stays valid if only one session
  uses it). NEVER print tokens.
- `tb_deploy.py` — cohort preview/execute with read-back verify +
  tb_write_log.txt audit trail. Attr-save endpoint returns EMPTY body
  (json parse guarded). Cohort files: cohort1_little_acres.json,
  cohort2_vb.json, cohort2b_vb13.json.
- Etiquette (org policy): preview old→new diff per cohort, wait for
  explicit yes, verify after write, log everything.
- TB MCP tools work for reads if REST auth dies (server-auth, but no
  latestValues bulk and fossil partitions unreadable — see memory).

## Key TB facts
- Wedged signature: deviceState ts fresh + meterVal ts frozen 36h+.
- spiReadyTimeout=true correlates with (but does not define) the wedge.
- latest-values fossils (9e13 / 3.9e12 ts) are historical corrupt-ts
  rows pinned forever — decode = unix_s×1e6 QLTS bug (fixed in 17037);
  ignore them, range-query real windows instead.
- Fleet rule: PRODUCTION = ST 17037 + TI v344 (supersedes 17032/344).
  FO experiments (17033/17034, TI≥345) remain test-pool only.

## Parked (do not start unless Bruce asks)
sf_meter_erase marker-rewrite hardening (third unhardened path — real
but nothing field-triggers it found); v254-transient micro-mechanism
root cause (contained by self-heal); '2490-class "records uploaded
during wedge" nuance; SPI TI-backup removal (Bruce: leave it, may
resurrect); PWB rev unshares the bus permanently.
