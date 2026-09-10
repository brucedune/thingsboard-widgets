# TI v378 — final absolute-TOF clustering sweep; ladder walks clusters largest-first (spec, 2026-09-10)

Bruce: "a final tof clustering sweep. Sequence ladder walks by largest group to smaller."

## Problem
The grid sweep qualifies a cell on delta stability (3 scored raws, skip/err/dead fail-fast,
delta spread) and enforces a delta plateau across cells (±3 ns). Nothing checks WHICH 500 ns
lobe the absolute TOF (ups, dns) sits on across cells: a cell steady on the wrong cycle passes
as clean, and the metering ladder can re-park onto it. Bench 9/10: tofA hopping 45.57 <-> 46.08 us
(one lobe) in shipped records, 56 pair hops in 90 min on v374, spiral re-parks feeding strikes.

## Change (v378, dune/cal.c + measure.c feed)
1. Per-cell absolute-TOF level. During the scored raws store the median ups and dns per cell
   (int32 x 2 x SC_CELLS; or int16 in 100 ns units relative to the first clean cell).
2. Cluster step, after the sweep and the delta plateau, before region labeling:
   - Cluster the clean cells by lobe: two cells are in the same cluster when both |ups_i - ups_j|
     and |dns_i - dns_j| <= SC_LOBE_TOL (150 ns = 0.3 lobe). Greedy: seed from the unassigned cell,
     absorb all within tolerance of the running centroid.
   - Sort clusters by member count (ties: closer to the amplitude target row).
   - Cells outside the LARGEST cluster get SCF_BIAS (lobe-biased): out of the region, out of the
     re-park pool. Region labeling + sc_center_amp_pick() then run only over the largest cluster.
3. Ladder walk order. The re-park pool (sc_random_clean) draws from the committed cluster only.
   When that cluster is exhausted (all cells dirtied), re-derive the commit from the NEXT-largest
   cluster (clear its SCF_BIAS, mark the exhausted one) instead of going straight to the chronic
   full walk; the chronic walk remains the backstop when all clusters are spent.
4. Recovery acceptance gets a lobe check: a re-acquisition counts as recovered only if the
   recovered ups/dns are within SC_LOBE_TOL of the committed cluster centroid (today: dtof
   continuity 30 k ps only). A recovery on another lobe is a shifted lock -> SCF_BIAS + restore.
5. Telemetry: cluster count and largest-cluster size in the 0xAC commit record (two spare bytes:
   pack into [13] bails high nibble / new byte) -> ST 17070 decode as calClusterN/calClusterSz.
   Not blocking: v378 can ship without the ST decode.

## Not in scope
Absolute expectation of TOF from pipe geometry (ST knows dia/Lf, TI does not) — later, as a
sanity band pushed by the ST. Cal-during-flow (v375 covers the deferred recal; boot cal open).

## Success criteria (bucket rig, '3063)
- Commit record shows the largest cluster >= SC_MIN_REGION cells; committed tofA/tofB level
  equals the majority lobe (45.4-45.6 us here), not 46.08.
- Shipped records: pair hops (|A-B| vs tnorm off by >100 ns) fall from ~56/90 min to near zero;
  reacqSpiralOk stops climbing under flow; no mid-flow recal.
- Quiet-water and PVC/PEX bench behaviour unchanged (region/pick identical when all clean cells
  share one lobe — the common case).

## Risks
- Tolerance 150 ns vs real gain/env-dependent TOF shift: envelope threshold moves the detected
  arrival by tens of ns across the grid; 150 ns leaves margin, 250 would be the loosest safe.
- A genuinely split surface (two lobes each ~half) picks the larger; if equal, the row nearest
  the amplitude target wins — deterministic, logged in the commit record.
- FRAM/RAM: +96-192 B for the per-cell levels.

## Roll
cal-reacq branch, build, msp378.bin, '3063 first (bucket run 30-60 min), pair after a clean run.
