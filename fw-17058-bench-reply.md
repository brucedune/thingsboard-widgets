# Bench session reply to `fw-17058-offset-cleanup-prompt.md`

**2026-09-05 ~20:15 PT, bench/FW session (44b8a8f9). For the fleet-ops session
(493a4abd). Read this before touching the rollout plan again.**

## 17058 is landed — not yet rolled

- Patch applied unchanged on 17057 (`stuck-event-fix`, main fast-forwarded):
  commit **`154d166`**, built 109,652 B / 2,988 B headroom / zero warnings,
  sha256 `195b9289…`, uploaded to `st-prod` 672132E5/G/17058. Marker bit 28
  verified free (OPER 16-25, V1 26, V2 27; hardware/pipe/installed masks all
  below bit 16).
- **Bruce's call (9/5 20:20-20:25): 17058 is for a LIMITED set of fielded
  devices only** — not the bench (trio stays 17057, '8538 on 17903, offsets
  intact) and not a blanket fleet roll. Which devices is Bruce's list; do not
  size or schedule it as the 5,433-device campaign. Acceptance runs on that
  limited set's FOTA posts: on those devices' FOTA post expect `offset` 0 and
  `offsetSet` false once, a normal offset re-promoting on the next water,
  `flowDirection` unchanged, `deltaMeterVal` in (-1, 0], and no re-fire on a
  later reset. Plan Wave 1 as that test and read those keys.

## Answers to your §6 dependencies

1. **PEX-A 3/4" L-factor = 2.225, final.** Baked into the table in 17056
   (`64c4cb3`) and confirmed since on four 50-gal reference runs (group means
   +1.10 / +1.36 / +1.38 / +1.41 % against a cold-water model of +1.0 to
   +1.5 %). Your +9 % / 2,554-meter figure stands. Note the per-unit spread
   on PEX-A at 5 gpm is ~3.8 pp and stable per unit (coupling), so individual
   meters will move by 2.225/2.270 ± ~2 %.
2. **The FIFO / flash "bug" is RETRACTED — Waves 3-5 are unblocked.** The
   2.6× pending re-growth on 17055 was `adcCapture=true` (installer
   live-waveform mode) left on all four bench units from 9/4 14:40: a capture
   pair every 20 s, 120 records each, ~5,400 records/h on top of ~3,500
   samples/h. 17057's pointer keys (tofHead/tofTail/tofFree) showed head
   advancing by exactly the uploaded amount at every post and tail−head ==
   bytesToSend/16 throughout. No record-loss behaviour exists in 17055-17058
   beyond the designed struck-chunk drop and the 60-min keep on a data-phase
   punt. Details: handoff §0e (retraction block).
   **Fleet action item for you:** scan the fleet for `adcCapture=true` shared
   attributes — any field device left in that mode is burning ~86 KB/h of
   flash and long data phases.

## Other bench facts your plan should carry

- **17055 upload policy** (in every rev ≥ 17055): no carry cap; newest chunk
  previewed first; oldest-first drain; struck chunk dropped after its retry;
  ONLY a data-phase punt trims (to newest 3,825 slots ≈ 60 min at 1 Hz);
  connect/status failures and force-offs keep everything; the Rev 16040
  drop-all-on-cycle-failure eviction is gone. Fringe sites with 0.7-1.9 MB
  pending will therefore drain over several sessions rather than be trimmed.
- **ST RTC is LSI-clocked with LSE prescalers → 2.7-3.6 % slow** (~40 min/day
  at the daily cadence). Hourly/daily record boundaries drift accordingly;
  check-in intervals stretch ~3 %. Not fixed; not in 17058 scope.
- **Bell-first special build 17902/17903** exists for the WYSE Toronto sample
  only (`DUNE_CARRIER_BELL_FIRST`); keep those units on the 179xx line
  (monotonic validated-version record). Not a fleet image.
- **Laminar correction on PEX-A is material-specific:** copper knot 2 does
  not carry over (PEX-A k ≈ 0.988 at Re 4,780 vs copper 0.965; knot 1 matches
  copper at Re ~2,000). `lamCorr` stays OFF fleet-wide (default) until the
  PEX knots are confirmed; nothing in the rollout should enable it.
- The three remaining `lFactor=2225` attrs on the trio read identically to
  the 17056+ table; deletion awaits Bruce's OK (they are bench units only).

## Follow-up agreed

`flowDirAlarm` in the status report is a cheap addition for a later rev; the
bench session will fold it into the next mainline rev after the laminar work
closes, unless you take it first — say which.
