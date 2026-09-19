# Spec: pipe-class fixed acoustic window (ST table -> TI), draft 2026-09-18 18:05

Bruce 9/18: "keep it simple: Default (no pipe type specified) / Opt (pipe type + dia specified) = known blank /
capture from a lookup table"; "keep ST for now" (table lives in the ST, ST sends blank + capture).

## Objective
Stop the operating window wandering on configured installs. When pipeType + pipesize are set, the ST pushes a
fixed blank/capture from a per-class table and the TI keeps it through every cal and recal. Unconfigured
devices keep today's adaptive cal (Default).

## Scope
- ST (DuneFW_L5_2, next rev): table {pipeType x pipesize} -> (blank_us, capture_us); one new HCI command
  WINDOW_FIXED (proposed 0xAF: blank u16, capture u16, flags u8) sent in the override batch, acked like every
  other frame, only when the value changed since the last acked push (BKUP mirror) or the TI reports a
  different window. Explicit TB `blank` / `captureDuration` pins override the table (operator exception).
  Classes without a table row (or pipesize/pipeType unset) send nothing = Default.
- TI (Dune_FW_TI v396): WINDOW_FIXED sets the window and a FIXED flag in the FRAM user-params record.
  While FIXED: enter_amp_scan(fresh) does not re-seed the window, enter_tighten_window() does not re-derive
  it, the v393 noise-gate retry does not move it; cal walks gain/env only. Cleared by 0xAE (fresh install;
  the ST re-pushes in the same batch), pipe scan, and by the fallback below. INFO carries lock/fixed state +
  last commit sd so the ST can report it (new status keys: winMode, winBlank, calCommitSd).
- Fallback: if SIGNAL_SEARCH times out or the grid finds no clean cell inside the fixed window, the TI clears
  FIXED for this install, runs the adaptive cal, and raises an INFO flag (winFallback) -> status key. A wrong
  pipesize attribute must never leave a meter dead.
- Default path change (Bruce's call, 2 lines): the noise-gate retry pass never overwrites an existing lock.

## Out of scope
Lobe selection inside the window (TOF algorithm / env walk unchanged), L-factor or flow math, GenI.

## Draft table (fleet pull 9/18 17:50, 8,947 Gen2 devices, Metering units with a live tofA; file
Claude Data/fleet_tofa_by_pipe_0918.csv + .hist.txt). Rule: blank = floor(p5 arrival) - 3 (>= 25, >= dia floor),
window end = ceil(p95 arrival) + 12 (today's cal keeps arrival-3 .. arrival+12), capture = end - blank.
| class | n | arrival us p5 / median / p95 | today live blank (median) | proposed blank / capture | note |
|---|---|---|---|---|---|
| PEX 3/4 (X) | 2,557 | 35.5 / 36.4 / 38.3 | 33 (435 pinned 33) | 32 / 19 | 93% of units in 35-37 us |
| PVC-40 3/4 (P) | 1,281 | 36.2 / 39.4 / 42.8 | 35 (153 pinned 35) | 33 / 22 | BIMODAL: 35-37 (~155) and 38-42 (~1,060); both clusters contain 17089+ quiet units |
| PEX 1/2 (X) | 638 | 28.8 / 29.5 / 31.7 | 26 (47 pinned 25) | 25 / 19 | floor 25 |
| CPVC 3/4 (C) | 390 | 35.8 / 37.1 / 41.8 | 30 | 32 / 22 | |
| Copper M 3/4 | 212 | 30.8 / 38.4 / 42.5 | 35 | 34 / 21 | ~10% tail at 24-35 us = suspect wrong-lobe units; p5 taken on the 36+ core |
| Copper M 1/2 | 82 | 30.3 / 31.7 / 35.1 | 25 | 27 / 20 | |
| Copper M 1 | 51 | 36.1 / 45.3 / 46.3 | 40 (14 pinned 40) | 41 / 17 | rig '3063 derives 40 at ~43 us arrival |
| PEX 1 (X) | 30 | 39.9 / 43.0 / 47.0 | 39 | 37 / 22 | small n |
| PVC-40 1 (P) | 24 | 39.3 / 46.4 / 48.0 | 40 | 36 / 24 | bimodal 39-43 / 46-47, small n |
| Copper L 3/4 | 32 | 36.3 / 44.4 / 45.8 | 35.5 | NO ROW (Default) | 44-45 us on a 3/4" L is not credible vs M 3/4 at 38; likely mislabelled 1" - verify first |
Caveats: arrival = the TI's tofA lock, which on a multipath install can be the later lobe (the 70262371
case), so the spread includes lobe hops; tnQuietSd exists only on 17089+ so no health stratification was
possible; seasons/temperatures are mixed in already (installed fleet).

## Constraints
Every table value must trace to this pull (no reasoning-from-scratch numbers). Capture up to 24 us vs the
15 us tight window = more ADC samples per measurement; battery cost to be measured on 79454912 (Bruce's
current-consumption unit) before the fleet. TI payload cap 100 B unaffected. No change to the 204 legacy
`blank` pins' meaning: they stay seeds unless we decide otherwise after auditing them against tofA (data in
the CSV: 48 PVC 3/4 units have blank >= arrival).

## Success criteria
1. Rig (Cu 1"): 5 recals (0xAD) + 2 fresh installs (probe reset) -> blank/capture identical every time,
   Metering within 120 s, quiet sd <= 100 ps.
2. Bench five (PEX 3/4?) - confirm the bench pipe class first: same, plus tiCmdLost 0.
3. Fallback: pin a wrong pipesize on one bench unit -> winFallback set, unit still meters.
4. Default unit (no pipeType): behaviour unchanged (adaptive cal, lock).
5. Current draw on 79454912 with the table window vs today: delta reported before any fleet roll.

## Risks
- Bimodal classes (PVC 3/4, PVC 1): a single window covers both clusters, so it does not fix lobe choice.
- Wrong pipeType/pipesize attrs in the field (105 Metering units have neither; typos live as separate values)
  -> fallback path is the guard.
- Legacy pins: if a pushed blank were made "fixed" without the flag, 435 PEX units pinned at 33 would be
  fine but the 47 PEX 1/2 pinned at 25 and the 48 PVC units with blank >= arrival would be locked wrong.
