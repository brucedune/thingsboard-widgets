# Gen2 Ultrasonic Calibration Pipeline — Code Review (2026-08-25)

> Handoff document for the cal-function session. Produced from source review of
> `Dune_FW_TI` (HEAD = v348, branch `uart-only`; fleet = v344; cal.c identical
> v344↔v348 outside the Fo blocks) and `DuneFW_L5_2-eprod-led` (HEAD = Rev 17019).
> Line numbers are v348/HEAD. Field context: ~8% of post-17037 re-cals locked at
> gain 47–55 with high tnormStddev / near-rail ppk / metering-on-air cases and
> zero CAL_STEP packets observed on TB; one confirmed 35× phantom-flow device.

## 0. Version state

| Item | Value |
|---|---|
| TI HEAD | `954236e` v348, branch `uart-only`; fleet v344 = `2328b34` (2026-08-09) |
| Ladder (v342+) | `cal.c:406-416` — rungs **26,29,32,35,38,41,44,47,50,53,55** (LOW→HIGH) |
| ST embedded TI image | `config.h:59` `TI_EMBEDDED_FW_VER 324` (stale vs fleet 344) |

## 1. Pipe sense
- No separate state — a verdict read from the amplitude ladder at fixed idx 6 = gain 44 (`cal.c:423,427`, `amp_scan_done()` `cal.c:1415-1437`). Seed blank 25 µs / capture 30 µs floored by `cal_min_blank` (`cal.c:80-81, 901-906`); env pinned `DUNE_ENV_MIN=30`.
- Floor: `CAL_AMP_FLOOR_UPAMP 273` counts ≈ 200 mVpp (`dune.h:236`) — **v342 lowered from 410**; both up AND dn paths must clear (v332).
- Fail ×3 (`CAL_RESWEEP_BAIL_LIMIT`, `dune.h:317`) → `enter_off_pipe()` (`cal.c:1016-1036`, gFailedCal latch, retry in 60 aggs).
- ⚠ **P1**: v344 raised `num_pls` 9→13 (`ussDCCommandHandlers.c:140-147`) against the lowered 273 floor → ringdown/crosstalk artifact can clear pipe-sense. Clearest v344-specific door to "metering on air."

## 2. Pre-ladder gate — none of it hard-rejects
- Flatness "loud-but-fake" check `cal.c:1449-1472` (armed only if rung-26 already ≥ floor; ratio 1.30×/rung).
- Compression: real ADC clip `CAL_CLIP_PEAK 1850` (`cal.c:1956-1962`) → per-row flag only; legacy `COMPRESSION_MAX_UPAMP 1638` (`cal.c:1395`) → preference bit only. **All-clipped grid still commits** (`cal.c:1610-1632, 1672-1673`; intent comment `cal.c:1390-1394`) → the ppk≈2700 cohort.
- No pre-ladder signal-quality gate exists.

## 3. Gain ladder — two passes
- **Pass 1 amplitude ladder** (`CAL_AMP_SCAN`, `cal.c:1879-1907`): 11 rungs × 1 raw, ~600 ms/rung; records up/dn p2p. v346+ emits SCAN_RESULT per rung (not in v344).
- **Pass 2 fidelity grid** (`CAL_GAIN_OPT`, `cal.c:1916-1975`): rows HIGH→LOW; per-step statistic = isqrt(var(Δ successive raw UPS TOF)/2), skip-quanta (≥350 µs) excluded, floor 500 ps (`cal.c:1150-1194, 1836-1842`); 15 samples/row; v340 punt: sub-floor rungs recorded invalid, **no CAL_STEP emitted** (`cal.c:1927-1932`).
- CAL_STEP 0xA5: non-final at `cal.c:1845` (valid rows only), final at `cal.c:1799` (always, just before `enter_metering()`).
- ⚠ **G1**: `emit_cal_step` writes skips to `payload[7]` but `length=3+4` → skips byte never transmitted (`cal.c:1210-1212`).
- **The ST's "45" is stale**: TI max = 55 (`MAX_PIPE_SENSE_GAIN`, `cal.c:392`; v342 restored from 50). `DUNE_GAIN_MAX 55` = apply_gain clamp. Boot/idle gain 40. 45 is not a rung.

## 4. Gain pick (grid_commit, `cal.c:1571-1801`)
- Plateau: rows with min-sd ≤ 1.5× global unclipped min (`dune.h:292-293`); prefer inband (≤1638), then closest to `GAIN_AMP_TARGET 600`; ties → lower gain.
- ⚠ **K1**: v334 "knee guard" skips the FIRST record = **highest** gain (records are high-first) — the actual low-gain S/N knee is never guarded (`cal.c:1663-1701`).
- ⚠ **K2**: env knee search is dead code — `CAL_GRID_ENV_N == 1` (`dune.h:241-250`) and result overwritten by constant `OP_ENV_COMMIT 35` (`cal.c:1791`). **Env is not calibrated.**
- ⚠ **K3**: latent OOB at `cal.c:1751,1774` if ENV_N ever raised (pe=255 path).
- 🔴 **K4**: `amp_pass` relax (`cal.c:1740-1744`) — if no row clears the 273 avg-amplitude floor, the floor is dropped and the pick re-runs → **commits at ppk<500 (metering on air)**.
- **Promotion is single-path**: `CAL_METERING` assigned only at `cal.c:1138`; `enter_metering()` called only from `grid_commit()` `cal.c:1800`. **No sweep-skip promotion exists on v344/v348.** Zero-0xA5 with Metering ⇒ transport loss (see 6e), with one exception:
- 🔴 **K5**: `gIsMetering` is NOT cleared by `enter_amp_scan()/enter_pipe_scan()/enter_grid()` — only by `cal_init()`, `cal_resweep_gain()`, `enter_off_pipe()`. `cal_feed_aggregate()` `cal.c:2021-2026` enters PIPE_SCAN from METERING without `setNotMetering()`; verdict → `enter_amp_scan(true)` = **full re-cal ceremony reporting InfoMetering=1 at whatever rung is under test** (gain 26–55, clipped or starved amplitude, in-flight tnormSd). Trigger: TB attr `pipeScan` (ST `bg95.c:4305-4311`, fired once per radio cycle at `main.c:308-310`). **Literal reproduction of the field signature.**
- Also: `apply_gain()` writes `duneInfo.gain` before validation; `HMI_guiInputValidation` is all-or-nothing (`hmi.c:274-290`) → reported gain can differ from PGA reality.

## 5. Post-cal runtime
- qual bands (`cal.c:811-818`): 0=undefined OR ≥60 ns (overloaded — **R1**); 100 <5 ns; 66 <20 ns; 33 <60 ns.
- **tnormStddev = two different statistics**: commit-time single-path raw jitter (`cal.c:1836`) vs METERING-time population sd of aggregate delta-TOF ring (`cal.c:2293-2316`); same field, same bands, not comparable. 65535 = saturation sentinel (`cal.c:370-373`).
- envTest (`cal.c:2322-2389`): |dtof|>100 ns or path<floor → tofFailCnt>3 → gCalUnstable + env++ (ceiling 50, wrap→min); 2 full wraps → gFailedCal + setNotMetering → `cal_resweep_gain()` soft re-cal. 3 clean aggs → setMetering. Rolling-window drift auto-recal = TODO, not implemented (`cal.c:2291-2292`).
- 🔴 **R2**: deglitcher (`measure.c:186-222`) re-injects last good delta-TOF up to **20 consecutive raws** → manufactures constant phantom flow AND feeds the held value to envTest, masking the instability the promotion gate should catch. The 35× phantom mechanism. Resets on any single good sample (19-bad/1-good holds forever).

## 6. ST interaction
- TI **ignores** ST writes of gain and pacing (handlers commented out, `ussDCCommandHandlers.c:830-853`); accepts blank/captureDuration/num_pls/PARAM3/env(PARAM8)/calMinBlank.
- 🔴 **S1**: reboot-window stomp is worse than believed — `load_default_configuration_parameters()` is EMPTY since 16100 (`hci.c:100-118`) so the `duneInfo.version==0` fallback pushes **zeros** (blank 0, env 0…), failing TI validation all-or-nothing; env=0 is not validated ST-side (T10) and only self-repairs on metering entry.
- ⚠ **S2**: `hci_pick_env()` requires `duneInfo.env >= 33` but TI reports 30 during cal → falls to 0 (`hci.c:399-401`).
- Cal gate: TI waits 0xA8; backstops 60 aggs (ST alive) / 120 (silent) (`cal.c:244-256`). ST hold caps 90 s / 180 s sweep / 180 s promote / 7 min FSM (`bg95.c:2848-2878`).
- ⚠ **S3**: slow-network sessions burn budget pre-gate → boot-default cal start or hold-cap expiry → transient Failed Cal; gFailedCal latches until setMetering.
- **No FRAM-retained cal exists**: all cal state is RAM (`__persistent` is empty define); every TI reset/FOTA/recalibrate forces a full ceremony.
- 🔴 **S4**: `max_gain_override` (HCI 0xA2 / TB `maxGain`) is stored and **never read** — a fleet maxGain cap is a NO-OP on the TI.
- 🔴 **S5**: ST `calSweep[]` reset waits for `gain == 45` which is no longer a rung (`hci.c:1132-1141`) → `calSweepCount` never resets; after the first 15 entries all later CAL_STEPs are silently dropped. `calStartedAt` set once per boot, never cleared on re-cal.
- 🔴 **S6**: TI transmits NO buffered packets until `gIsMetering` (`comm.c:407-431`, v310) and `Comm_writePacketToBuffer` **drops-newest** on full (1024 ring, `comm.c:328-340`); ST sends TIW_START_DATA only after metering_seen (`bg95.c:2955-2968`). Ceremony CAL_STEPs — including the final — are the packets most likely lost. (Corroborated `cal.c:2267-2271`, `leds.c:161-165`.)

## 7. Defect synthesis (ranked)
- **A. Gain 47–55 is largely legitimate** (v342 ladder to 55 for gain-starved PVC; ST 45-references stale).
- **B. Zero CAL_STEP ≠ no sweep** — S6 transport blackout + S5 ST reset bug + v340 punt. Promotion without grid_commit is impossible in this source.
- **C. K5 pipeScan/gIsMetering leak** — exact field signature generator; check `pipeScan` attr on affected devices.
- **D. Genuine bad commits** — P1 (num_pls 13 vs floor 273) + K4 (floor-drop retry → metering on air) + all-clipped commit (ppk≈2700).
- **E. Phantom flow** — R2 deglitch hold (35× device) with envTest masked.
- **F. tnormStddev dual-statistic** explains "committed clean, noisy in field."

## Fix candidates
**TI**: T1 clear gIsMetering in enter_amp_scan/enter_pipe_scan (K5) · T2 drain ring during cal + drop-oldest (S6) · T3 honour max_gain_override (S4) · T4 remove/guard amp_pass relax (K4) · T5 clip hard-reject + restore floor toward 410 (P1) · T6 fix emit_cal_step length (G1) · T7 fix plateau_edge to low-gain knee (K1) · T8 cap deglitch hold / feed envTest raw (R2) · T9 split commit vs runtime stddev fields (R1) · T10 validate env ∈[1,100].
**ST**: S-1 reset calSweepCount on is_final; grow array · S-2 env pick ≥1 not ≥33 · S-3 restore real defaults in load_default_configuration_parameters (stomp) · S-4 TIW_START_DATA at hold entry · S-5 earlier gate / longer cap on slow sessions · S-6 clear calSweep/calBest/calStartedAt on TI version change · S-7 fix (17..45) docs.

## Unknowns the code can't answer
1. TI fw of affected devices — **field data says v344** (all high-gain class report fwVerTi=344), so ladder geometry conclusions hold.
2. Whether `pipeScan` is set on affected devices (TB attr query — discriminates K5).
3. Where 0xA5s die (TI ring vs UART vs ST cap) — needs a UART capture during a ceremony.
4. Real mV/count + rail (is ppk 2700 true clipping?) — bench measurement.
5. Whether HMI all-or-nothing validation fails in the field (TI logs it; not forwarded to TB).
6. 35× magnitude (gLastDeltaTOFps unobservable).
7. Fo sweep (v347+) not in v344 — irrelevant to current fleet.
8. Prevalence split A vs C/D — needs telemetry cross-check (ppk/tnSd CSVs in repo root).
