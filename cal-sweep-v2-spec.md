# Spec — Cal Sweep v2: TOF-stability-first grid survey ("operating surface" cal)

Draft 2026-08-28 (bench session, from Bruce's design). Status: **survey-instrument
phase approved in outline; awaiting Bruce's redline of details.** Companion docs:
`cal-diag-findings-0827.md` (mechanism + two days of evidence), `cal-diag-v356-spec.md`
(diag-band conventions), `cal-recovery-ladder-spec.md` (runtime recovery layer).

## Mechanism (measured 8/27-28, the reason SNR-first cal is insufficient)

The received 2 MHz burst rings up GRADUALLY (~20 lobes). env (threshold as % of
envelope peak) selects WHICH lobe the absolute-TOF crossing lands on; each lobe hop
= one carrier period = 500 ns of absolute TOF. Measured on real captures (banked
adcCapture files): **at env=35 the skip margin is 0.2-2.2% of peak** — adjacent
ring-up lobes differ by only ~3-4%. Any sub-percent envelope drift (temperature,
turbulence, coupling) re-deals the lobe: the quantized ±500 ns "cycle skip" class
we measured all week (errDtofX/errSplitX = 5). Dominant error signature —
split-tripped with dtof clean — is explained: crossing-based abs TOFs are
lobe-fragile; correlation-based dtof is lobe-robust (and those rejected samples
likely carry valid flow — billability question with the cal session).

Today's cal (v268-v355) optimizes tnorm stddev (SNR) and can happily commit a
point 0.2% from a lobe cliff. Sweep v2 makes TOF stability the GATE and SNR the
tiebreaker, and commits to the point most distant from every cliff.

## The pipeline (Bruce, 8/28)

### Step 1 — valid gain range
Fast scan gain 17..50: floor = minimum signal (upamp above noise threshold),
ceiling = linearity (clip/compression detection — v352 guards). Output [gmin, gmax].

### Step 2 — 2-D grid survey
- ROWS: gain from gmin to gmax in ~3 dB steps. PGA = 2 dB/control-unit, so
  implement as whatever unit pattern lands nearest 3 dB (Bruce: "use whatever
  scale gets close to 3 dB" — e.g., alternating 1/2-unit steps).
- COLUMNS: env = 20, 30, 40, 50, 60 (deliberately wider than the 30-50 band —
  the survey should see the cliffs).
- PER CELL (dwell default 5 s ≈ 5 aggs; bench may use 10 s):
  - skipCnt: count of 500 ns-quantized jumps in tofUPS/tofDNS (self-labeling)
  - errRate: err_cross rate over the dwell
  - tnormStddev (SNR), upamp + clip flag (linearity)
- Runtime: ~8-11 rows x 5 cols x 5 s ≈ 3.5-4.5 min. Survey/install-time cal, not
  the fleet boot cal, until the maps justify promotion.

### Step 3 — cluster selection
- Cell passes if: skipCnt == 0 AND errRate ~ 0 AND stddev < threshold AND linear.
- Find the LARGEST CONNECTED REGION of passing cells; **commit = region centroid**
  — the point maximally distant from every cliff in BOTH axes (robust optimum,
  not point optimum).
- EXPORTS: committed gain+env; measured bounds = region edges — envLo/envHi
  (replacing run-extent proxies) AND NEW gainLo/gainHi; full grid map uploaded
  (bench instrument) for the operating-surface picture.

## Deployment plan
1. **Phase A — bench survey instrument in the diag band (ST 17901 / TI v391,
   one-shot attr-triggered).** Runs the grid, uploads the map. First deliverable:
   operating-surface maps of all three bench units — including during an acute
   window (the roving sickness has never been imaged; the survey does exactly
   that). Quarantine/containment rules per cal-diag-v356-spec.md.
2. **Phase B — promote selection logic into fleet cal** once Phase A maps set the
   thresholds (skip threshold, stddev threshold, minimum region size).

## Relation to the runtime layer (v357 patch list, separate build)
- Rate-triggered env re-centering INTO THE WIDEST GAP (Bruce's random-recentering
  refined by the lobe-ladder knowledge) replaces the v356 ±5 ladder.
- Event-end (not episode-end) revert of the winning value — the v356 defect Bruce
  found (immediate revert re-enters the glitch = the fix-unfix churn loop).
- False-hold suppression at boot/TI transitions (4 instances, 2 units).
- Success criterion = rate-based, not 3-consecutive-cleans.
- All tunables as TB attrs + enable/kill switches (required before fleet talk).
- Hold(<=10 s, heldGal)/kill floor unchanged — no threshold placement survives a
  convulsing envelope; the frozen-build data proved such windows exist.

## Companion study
- `numberOfPulse` reduction: fewer excitation pulses -> steeper ring-up -> larger
  adjacent-lobe steps -> wider margins at ANY env. TB attr exists; bench-testable
  with one unit + adcCapture + the lobe-margin analysis script. Trade-off: SNR
  (energy) — which the survey's stddev column prices automatically.

## Open for Bruce's redline
- Dwell 5 s vs 10 s (bench Phase A can afford 10).
- Pass thresholds (set empirically from the first three maps).
- Whether Phase A survey also runs DURING flow at a fixed rate (a wet map vs dry
  map comparison would show how the surface deforms under flow — 2x runtime).
