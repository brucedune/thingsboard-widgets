# Rig procedure — Phase 1 (v355/17041) baseline proof

Agreed with Bruce 2026-08-27. Trio: 72718549 / 72714423 / 70273063 on ST 17041 + TI v355
(FOTA confirmed 8/27 am). Spec: `cal-recovery-ladder-spec.md`. Build record:
`cal-v355-build-request.md`. Baseline failure being disproven: 8/26 10:31 LOCAL (17:31Z) priming draw,
capture lifetimes 9 s / 33 s / 42 s ordered by env walk.

## Roles
- **Bruce:** valves; supplies rig TRUTH (volume + how measured) for every volumetric run
  BEFORE the result is judged (standing reference-value rule).
- **Claude (bench session):** polls the 10 cal-state keys + meterVal into per-run CSVs
  (scratchpad `tb_phase1_poll.py`), computes results, judges gates jointly with Bruce.

## Abort rule (whole sequence)
Any report with `env` outside `[envLo, envHi]`, or `bestEnv` changing mid-flow →
STOP, snapshot everything, diagnose. That is a Phase-1 defect and outranks the script.

## Sequence — strict order, each gate blocks the next

| # | Test | Procedure | Pass gate | Result |
|---|------|-----------|-----------|--------|
| T0 | Morning snapshot | No water; pull all keys ×3 | envWalk=0, calFlags2=0, env=bestEnv=35, bounds 30/45 intact | **PASS** 15:37 — all three re-committed bestEnv 35 / bounds 30-45 / gain 29-30 post-mag. BONUS: '4423 walked env 36 dry (errCross 4, flag set) at 15:30 and DECAYED BACK by 15:37 — decay fix field-proven. Cadence: boot 15:28, commit 15:30, 10-min check-in 15:37; 60-min now on board. Watch: meterVal reads a hair under yesterday's post-reboot ('8549 integer-only) — RAM/FRAM persistence gap across mag reset; using in-stream deltas for T1. |
| T1 | Unwalked regression | 50 gal @ 5 gpm, one valve, trio in series; truth+method from Bruce | each unit in −0.5…−0.9% band vs 8/26 (hard fail ±1.5%); envWalk stays 0; bestEnv untouched | |
| T2 | Low-flow regression | 10 gal @ 0.5 gpm | single coherent event; no mid-flow recal; walker holds | |
| T3 | Force the walk | Reproduce 8/26 priming draw (air slug) | errCrossCnt climbs; env stops AT 45; envWalk>0; calFlags2 bit2 sets; bestEnv unchanged | |
| T4 | **PRIMARY** | No recal after T3: 50 gal @ 5 gpm, one valve; stopwatch + event records | all three capture durations within ±2 s (baseline 9/33/42) | |
| T5 | Decay path | Shutoff, quiet ~10 min | cleanStreak climbs; env steps down w/o errFloor deadlock; envWalk→0 OR deferred recal ~2 min post-shutoff | |
| T6 | Overnight soak | Wet, no draws | morning: envWalk=0, no spurious recals, env in band | |

## Agreed interpretation of T4 (Phase 1b did NOT ship — walker still steps mid-flow, bounded)
- Parity ±2 s → clamp alone suffices.
- Parity fails, env ≤ 45 throughout, dropout order tracks envWalk → measured case FOR
  Phase 1b (not a clamp failure).
- env escapes band → defect (abort rule).

## Run log
| Run | Start | End | Truth vol | Truth method | Flow | Notes |
|-----|-------|-----|-----------|--------------|------|-------|
| T1 | 8/27 ~15:42 | 15:51:27 | 50 gal | **marked vessel** (Bruce) | 5.17 gpm avg (stopwatch 580.84s), 19.4°C | RESULT: '8549 49.14 / '4423 37.28 / '3063 48.46. Edge-to-edge samples 564/428/554. '4423 TERMINAL COLLAPSE at sample 428 (18638→dead in 1s, err_cross x36 ONLY, upamp 824→1044, recovered ~35s after valve close). Onset blindness all three (clean zeros, NO error counters). Cross-device ts unreliable (clock slip) — use sample counts. T1 gate: FAIL, decomposed; rate accuracy clean once locked. |
| T2 (50-gal repeat) | 8/27 ~16:35 | +584.30s (stopwatch) | 50 gal | marked vessel | 5.13 gpm avg | RESULT: '8549 577s/49.16 (−1.68%), '4423 568s/48.68 (−2.63%, NO COLLAPSE, 0 new errCross), '3063 581s/49.79 (−0.43%, IN BAND). Collapse NOT repeatable. '8549 now the distressed one: +4 errCross, qual 66 (markers rotate around trio). '8549 edge loss ~identical to T1 (−1.68 vs −1.71) = stable per-unit start signature; '3063 onset lag shrank 28s→~3s with cal age. '4423 adcCapture FIRED post-run (adcCapOk/Received 1→10) = HEALTHY baseline envelope banked in adcDNS/adcUPS. NOTE: ~45s/~5.3gal @~6.9gpm draw ran ~13 min pre-run (purge?). 100-gal T1b superseded by Bruce (waste of time; collapse focus). |
