# TI v359 — SURFACE CAL (single-phase, TI-local) — SPEC, Bruce-approved 8/29 evening

The surface walk IS the cal. No quick cal, no peak-seeker, no host in the commit
loop ("I wouldn't do the quick cal" / "I want it done locally by TI"). Replaces the
gain-opt cal core in dune/cal.c. Design lineage: Bruce's cal-sweep-v2 3-step; Phase A
instrument (ST 17044 + surveyHold v358) validated 8/29; maps: dry+wet 8/29.

## Cal sequence (on any cal trigger: install/mag, recal, chronic-error escalation)

1. WALK: full 23x5 grid (gain 17..50 ~3dB alternating steps x env {20,30,40,50,60}),
   TI-local (it owns gain/env — no HCI). Per cell: apply config, discard 1 settle,
   score 3 samples at the NATIVE 200 ms cadence (map measured under exactly metering
   conditions — Bruce's call over a burst mode). ADAPTIVE DWELL: any skip/err in the
   3 -> extend that cell to 7 samples for confirmation. Dead cell = 3 consecutive
   no-result measurements (~0.6 s — TI knows instantly, no timeout theater).
   Scoring per cell (identical to ST instrument): skips (|d absTOF| in 500ns-quantized
   bands, N=1..2, +-150ns), errs (|dtof|>100ns), dtof sd, sample count.
   Walk time: ~100-110 s clean map; +~4 s per dirty cell extended.
2. CLUSTER (TI-local, ~500B RAM, trivial CC on 23x5): clean cells (0 skips, 0 errs,
   full samples) -> largest 4-connected region -> require min size (>=6 cells else
   failedCal path) -> select interior cell maximizing Chebyshev distance to nearest
   non-clean/dead cell; tie-break lowest dtof sd, then lower gain (power).
3. COMMIT selected (gain, env) as the cal result: g_best_env etc. seeded from it;
   downstream (offset qual, tnorm, ladder arming) unchanged.
4. EXPORT: map rides the existing sv0..sv22 status path (ST 17044 already reports);
   plus chosen point + margin (distance-to-cliff) + region size in the INFO tail or
   status keys (small; wire change OK on the v359/17045 pairing).

## Semantics preserved

- Quiet discipline: cal runs where cal runs today (install quiet by procedure;
  v349 quiet-deferred recal machinery unchanged).
- failedCal: no qualifying region -> existing failedCal path.
- Chronic-error escalation (reacq failRun) -> surface RE-walk instead of blind
  re-sweep.
- ST instrument (17044) unchanged and still valuable: fleet observability,
  longitudinal archive (surveyAtHour/surveyEveryNDays), and validation harness
  for v359 (walk maps must agree with cal maps).

## Longitudinal refinement (later)

Distance-from-cliff eventually scored against the UNION of cliffs across a
device's map history (8/29 finding: the cliff moves with conditions — wet vs dry
maps differ at the low-gain edge).

## Acceptance (bench)

1. '3063 v359 boot-cal: map matches the 8/29 ST-instrument maps (plateau + cliff);
   committed point lands interior; cal time <= ~3 min mag->Metering.
2. Repeatability: 3 consecutive mags -> same region, point within 1 cell.
3. Regression: no change in metering accuracy at the committed point (short runs
   vs pair); ladder/defenses behave as on v357/358.
4. Chronic-error path: forced errors -> re-walk (not blind recal).

## Runtime recovery: RANDOM RE-PARK WITHIN THE REGION (Bruce 8/29 — replaces the ±5 spiral)

Clean region stored as a 115-bit RAM bitmap (rebuilt each boot-cal; no persistence).
On sustained error pressure at the committed point (reacq-arm condition, transient
gate cleared it as non-water first):
1. Re-park at a RANDOM untried cell of the stored region (entropy: dtof noise LSBs;
   random, not ordered — deterministic fallback would march correlated failures
   through identical sequences fleet-wide). One config apply (~0.3s) — inherits the
   re-init side effect that the old spiral's "wins" actually were, but lands on
   measured-good coordinates.
2. Failed cells are marked dirty in the bitmap — the region shrinks with evidence.
3. Region < min size OR N consecutive re-park failures -> surface moved -> full
   re-walk (~100s surface re-cal).
4. Re-walk finds no qualifying region -> failedCal.
Consequences: ±5 spiral RETIRED; v358-gate re-derivation resolved (transient gate
shrinks to its classifier role: don't relocate for water — thresholds already
measured 8/29); self-heal question moot (waiting is replaced by informed motion).
