# Build request — TI v355 / ST 17041 (cal-state visibility + walker clamp)

> **STATUS 2026-08-26 pm — EXECUTED AND VERIFIED (bench session). Do not re-run.**
> TI v355 committed+tagged+pushed (`cc3a0da` on `cal-spec`); ST 17041 committed+pushed
> (`e4bb3ef` on `sf-migration-fix`). `msp355.bin` in `dune-firmware-ti` MD5-matches the
> local build; `G/17041` (5 chunks) in BOTH ST buckets reassembles byte-for-byte to the
> local bin. All three self-review fixes confirmed in the committed code; `hci.c` memcpy
> over-read cleared (RX buffers are 256/251 B vs the 82 B copy).
> Step 3 done 8/26 pm: trio set to `gen2fw=17041` + `allowTiFotaVer=355`, read-back
> verified 6/6, logged. **Still open:** rig verification only (cal session).

**The code is already written and sitting UNCOMMITTED in both working trees.** Nothing needs to be
re-implemented. This is a build + upload request.

Spec: `cal-recovery-ladder-spec.md` (Phase 1 only). Root cause: `copper-m-flow-handoff.md`.

## Why (one paragraph)

8/26 17:31 priming draw: three meters, **one bench, one valve, one flow**. They stopped counting at
three different times, ordered by how far `env` had walked above committed — env 42 → 9 s of capture,
env 37 → 33 s, env 35 (committed) → 42 s. Identical dip→partial-recovery→collapse signature on each,
at three different moments ⇒ meter-internal, not hydraulic. Water kept flowing; the meters stopped.
**Silent under-registration**, and nothing flagged it: `qual` read 100 on a failing unit and 0 on a
healthy one, `tofRejectCnt` stayed 0 throughout. `env` alone can't reveal it — only `env - bestEnv`
can, and `g_best_env` was a cal.c static that never left the chip.

## Changes already in the working tree

**`Dune_FW_TI`** (branch `cal-spec`, was clean at tag v354):
- `dune/cal.c`
  - new statics `g_env_lo` / `g_env_hi` (measured good-env run) + `gErrCrossCnt` / `gErrFloorCnt`
  - v353 commit block now **retains the run extent**, not just its centre (it was computed and discarded)
  - walker clamp: `> 50` (a guess) → `> g_env_hi` / wrap to `g_env_lo` (per-device evidence).
    Cycle/recal escalation semantics unchanged — the range just can't leave measured-good territory.
  - `err_floor` no longer resets `gCleanStreak` (it can't push env UP, so it must not block env
    coming DOWN — up: 4 errors → +1; down: 60 clean aggs → −1 and ANY error reset it = deadlock)
  - new `calFillInfoState()` publishes walker state
- `dune/dune.h` — 9 appended `uint8_t` fields + `enum CalFlags2` + `calFillInfoState()` decl
- `dune/info.c` — one call to `calFillInfoState()`
- `dune/dune_version.h` — **354 → 355**

**`DuneFW_L5_2-eprod-led`** (branch `sf-migration-fix`):
- `lib/inc/hci.h` — mirrored 9-byte tail, `TI_CALSTATE_MIN_VERSION 355U`, `CAL_F2_*` bits
- `lib/src/hci.c` — zero the tail when in-packet version < 355 (same pattern as v298/v302)
- `Core/Src/status_report.c` — new keys: `bestEnv`, **`envWalk`** (= env − bestEnv), `envLo`, `envHi`,
  `tofFailCnt`, `envCycleCnt`, `calFlags2`, `cleanStreak`, `errCrossCnt`, `errFloorCnt`
- ST version bump to **17041** NOT yet done — please set it as part of the build.

## Build / upload

1. **TI v355** → `msp355.bin` → `dune-firmware-ti` bucket. *(I could not build here: CCS 2041 on this
   box has only armllvm/c2000/c29 codegen, no MSP430.)*
2. **ST 17041** → `G/17041` in both ST buckets.
3. Then set on the Flow Testing trio: `allowTiFotaVer=355`, `gen2fw=17041`.

## Compatibility — both directions are safe, so they can roll independently
- **New TI + old ST:** old ST memcpys its own smaller `sizeof` → ignores the tail.
- **Old TI + new ST:** new ST reads 9 stale bytes, then the version gate zeroes them.

## What I could and could not verify here
- **ST side BUILDS CLEAN** — `arm-none-eabi-gcc 13.3.1`, full link, 115556 text / 1360 data / 243480 bss.
- **STRUCT LAYOUT VERIFIED.** Compiled both variants side by side (packed = ST, natural = TI) with
  per-field `_Static_assert` on every offset: **all match**. `uartMirrorCnt` still at offset 72,
  `bestEnv` at 73, ST packed `sizeof` = **82**. TI natural `sizeof` = 84 (2 bytes trailing pad) —
  harmless, since the ST memcpys its own 82 and every field offset through `errFloorCnt` is identical.
  Same situation existed pre-change (73 vs 76).
- **TI side: NOT COMPILED.** No MSP430 toolchain on this box. Treat `cal.c` / `dune.h` / `info.c` as
  unverified against the compiler — please build before trusting.

### Three defects found in self-review and already fixed
Worth knowing because they are the kind a compiler would NOT have caught:
1. **Stale bounds across a re-cal.** `g_best_env` is reset at cal.c:705 and cal.c:1146; the new
   `g_env_lo`/`g_env_hi` were not, so after a re-cal the walker would have been clamped by the
   PREVIOUS pipe's sweep. Bounds now reset alongside the commit they bound.
2. **Regression risk on un-swept devices.** Bounds initialised to a degenerate `lo==hi==DUNE_ENV_MIN`
   would have pinned env on any device that had not completed a sweep. Now default to the legacy
   v331 band (`DUNE_ENV_MIN..50`, `CAL_ENV_WALK_CEIL_LEGACY`) so behaviour is **identical to v354
   until a sweep supplies real evidence to narrow with**.
3. **Wrap could go below the device floor.** The wrap target is now
   `max(g_env_lo, minimumEnvelopeThres)`.
- Worth a look while you're in there: `hci.c:944` `memcpy(&duneInfo, packet->payload, sizeof(DuneInfo_t))`
  now copies 9 more bytes. That over-read is the established v298 pattern, but confirm the RX buffer
  is comfortably larger than 82.

## Verification once flashed (rig work stays in the campaign session)
1. `bestEnv` / `envLo` / `envHi` populate and are non-zero on all three.
2. `envWalk` reads 0 on a freshly-cal'd unit.
3. Force a walk → `envWalk` > 0 and `calFlags2` bit2 (`CAL_F2_ENV_WALKED`) sets.
4. `env` never leaves `[envLo, envHi]`.
5. Regression: 50 gal @ 5 gpm on unwalked units still ≈ −0.6% trio.
6. **Primary:** with env deliberately walked high, all three capture the same duration within ±2 s
   on one valve. Today: 9 s / 33 s / 42 s.

## NOT in this change (deliberately deferred)
- **Phase 1b — freeze env stepping during flow.** Needs a clean-sample flow EMA: it cannot use
  `dtof_ps` from the erroring sample, because `err_cross` fires exactly when that value is garbage
  (>100 ns ≈ 28 gpm, physically impossible on this rig).
- **Phase 2** — bounded hold / `heldGal` (the rung that can fabricate water).
- **Phase 3** — amp-then-env directed recovery spirals.
