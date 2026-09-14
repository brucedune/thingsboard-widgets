# Session prompt — Cal Table Optimization

Cal table optimization, continuing from 8/6. Read memory
cal-state-2026-08-03 — the SESSION-END DIGEST 8/6 block at the top has
current state, shipped revs, and the bench-ops crumbs. Bench stack:
board 2 (Release 17028 + TI v341, copper 3/4" M, current-verified) +
all 3 Wyse (17028/v341, PEX). Everything committed/pushed on uart-only
in both repos; fleet levers gen2fw=17028 + allowTiFotaVer=341 staged
but NOT pulled.

Focus: optimize the v33x-v341 cal ceremony's tables/constants for pick
stability and accuracy. The raw material:

1. PICK WANDER: same fixture, same water, five ceremonies picked
   g29/g32/g35/g41/g32 (board 2) — knee movement + 3-aggregate jitter
   estimate wobble. Known dials: more aggregates per rung (3->4-5) or
   pick hysteresis. Decide from data, not vibes — see item 2.
2. ESTIMATOR MISMATCH (new, from 8/6 board-2 run): ceremony fidelity
   sd read 500-900ps across ALL rungs, then steady-state on the SAME
   commit collapsed to sd 28-63 (sd28 = best-ever this fixture, at
   g29 — a rung the ceremony scored 657). The closest-pair |diff|/sqrt2
   estimator (v335/v336) at 3 aggs may be systematically pessimistic
   and rank-scrambling. If rung RANKING is unreliable, hysteresis won't
   save the pick. Characterize: ceremony-sd vs 60s steady-sd per rung,
   per fixture (board 2 copper + one Wyse PEX).
3. Current constants in play (Dune_FW_TI dune/cal.c): ladder 26..50
   step 3, sense rung 41 both paths, CAL_AMP_FLOOR_UPAMP 410 strict +
   relaxed fallback (v340 punt), CAL_CLIP_PEAK 1850, DUNE_ENV_MIN 30,
   OP_ENV_COMMIT 35, walker band 30..50 wrap-to-30, num_pls 9, raw-fed
   AMP_SCAN ~600ms/rung + GAIN_OPT 3 aggs/rung, S/N-knee guard (skip
   lowest plateau member when >=2, v334).
4. Wyse 4gpm A/B is STILL the accuracy gate for any table change: 13p/
   e50 baseline vs current stack — and the old baseline workbook is
   CONTAMINATED (RAM-ring truncation, see digest); re-pull baseline
   from clean captures first.
5. Watch item riding along: board 2 promoted at ofs=0 post-v341 (prior
   cycles 684-1051; TI-rebuild zero shift). Check tracker refinement;
   if tnorm bias shows, it's this.
6. Under-registration thread (percent-recovery dollars) eventually
   keys off the same tables — env band, Qmin deadband 256ps, reject
   counters. In scope only if the A/B surfaces it.

Ground rules from this week: bench-first on board 2 (SWD Debug flash
for trap prints — Release is silent), one mag then hands-off during
FOTA chains, extractor scripts are version-pinned (update grep vXXX),
never target msp335, TI set-but-unused warnings in cal.c are v340
debris (g_last_blank_seen, g_scan_ts_upamp, enter_surface_detect) —
clean up opportunistically, don't chase.

First actions for you: re-arm the bench console trap + UART echo
(uart-console launch config; server + capture scripts need the NEW
session scratchpad path — copy from session 253a7f06 scratchpad;
verify COM4 exists and log grows). Board 2 is on RELEASE — ask me
before reflashing Debug (I may be mid-current-test). TB pulls need a
fresh JWT in tb_token.txt (DevTools -> Local Storage -> jwt_token).
Then propose the item-2 characterization plan and wait for my go.
