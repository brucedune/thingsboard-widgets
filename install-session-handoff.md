# install-session handoff — 2026-06-30

Continuation note for picking up DuneFW_L5_2 work on another machine.
Paste this to Claude as the first message, or just read it.

## Where the code is
- Repo: `dunelabs/DuneFW_L5_2`, branch **`install-session`**, pushed to origin.
- HEAD = `7f38bba` (Rev 16135). Working tree was clean at handoff.
- On the laptop: `git fetch origin && git switch install-session && git pull --ff-only origin install-session`

## Commits made this session (all pushed)
- `7f38bba` **16135** — leak-event occurrence counters + once-per-day radio quick-flag (final model)
- `781d9d9` **16134** — first cut of open/large-event radio + `eventRadioDailyOverride` attr (superseded by 16135's model, but the attr/default/parser live here)
- `f0b561a` **16133** — exclude IWDG/WWDG from MAG_RESET + init.c fresh-install/offset wipe (watchdog reboot no longer de-cals); init.c radio-cap reset deliberately still fires on watchdog/PIN to keep crash-loopers reachable
- `c73cf65` **16132** — capture-and-reset fault handlers (field crash self-report)

## Leak-event reporting (16135) — what it does
Two leak modes, each an occurrence counter in `bg95_public`, uploaded with the status report:
- **Open-event**: +1 per `eventTimeout` interval an event stays open (time-chunked, day-independent; `openEventChunks` tracker). `minEventVolume` noise floor retained.
- **Large-event**: +1 per `maxEventThreshold` of volume (`largeEventVol` accumulator decremented by the threshold on each breach; remainder preserved, no drift).
- Counters **reset to 0 after status delivery** (`connmgr_status_report_sent_successfully`) → each upload = "occurrences since last upload".
- **Radio quick-flag**: at most ONCE PER UTC DAY per type (`openEventRadioDay`/`largeEventRadioDay`). `eventRadioDailyOverride` (bool attr) lifts that → connect on every occurrence.
- Status set per occurrence for dashboard, reverted to normal on report delivery via `clearStatusType()`.

### TB keys
- Telemetry: `openEventRadioCnt`, `largeEventRadioCnt` (numbers); `status` string = `"OPEN EVENT"` / `"LARGE EVENT"` / `"NORMAL"`.
- Shared attrs: `eventTimeout` (min, def 60), `maxEventThreshold` (gal, def 200), `minEventVolume` (gal, def 0.05), `eventRadioDailyOverride` (bool, def false).

## Deployed vs held
- **Deployed RC: ST 16131 + TI 296** for the TI-issue group (unchanged).
- 16132–16135 are committed/pushed but **HELD** — not on the fleet.

## Open / next
1. **Bench-validate 16132–16135 with the debugger DETACHED** before any fleet push (`__HAL_DBGMCU_FREEZE_IWDG` masks the watchdog paths while attached; 16133 is watchdog-reset classification).
2. Bench a leak scenario: force an open event past `eventTimeout` and an event past `maxEventThreshold`; confirm `openEventRadioCnt`/`largeEventRadioCnt` increment then reset across an upload; confirm one radio connect/day unless `eventRadioDailyOverride`.
3. 16133 still-open decision: BOR/power-on handling at the init.c fresh-install wipe (depends on install process — magnet swipe vs battery insert).
4. Build the ST image (compile-check 16135: `largeEventVol` float math, `clearStatusType`).

## Notes
- Full project memory (rich context) lives in `~/.claude/projects/C--Users-Bruce-Documents-GitHub/memory/` on the desktop — NOT in git. Copy that folder to the same path on the laptop if you want Claude's full memory; otherwise this note + `git log` covers it.
- Laptop push auth: PAT over HTTPS (gh CLI not used in this setup).
- This file is untracked personal scratch — don't commit it to a firmware repo.
