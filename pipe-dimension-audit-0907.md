# Pipe bore audit: firmware lookup table vs industry standards (2026-09-07)

Firmware table: `DuneFW_L5_2/Core/Src/measure.c` `pipeDiameters[][11]` / `lFactorsM[][11]`; column codes from `Core/Src/opt.c getPipeTypeIndex()`:
K L M = copper B88 types; P = PVC Sch 40, p = PVC Sch 80; X = PEX-A, x = PEX-B; C = CPVC, c = CPVC Sch 80 (assumed); B b = not in the installer app (galvanized was removed).
Flow scales as D / sqrt(Lf^2 - 4): 1% bore error = 1% flow; 1% Lf error = 2.3% flow at Lf 2.225.

## Sources (verified 9/7)
- Copper ASTM B88: Engineers Edge B88 chart (K/L/M OD, wall, ID).
- PVC ASTM D1785 Sch 40/80: nominal (min-wall) IDs from pipesizing.net; AVERAGE IDs from the US Plastic / Harvel Clear PVC spec sheet (34100specsheet10-2004.pdf), column "Avg. I.D.".
- PEX ASTM F876 CTS SDR-9: PPI average wall/ID via turn2engineering.com; Uponor AquaPEX listings (3/4" ID 0.671, 1/2" 0.475, 1-1/4" 1.054); min-wall nominal IDs = OD - 2*(OD/9).
- CPVC CTS ASTM D2846 SDR-11: Spears CTS catalog 4129-015 (OD, min wall, average ID).

## Inside diameter, inches (table value -> standard; OK = matches)

| size | K | L | M | P40 (table / nominal / AVG) | p80 (table / nominal / AVG) | PEX X,x (table / nominal / AVG) | C CPVC (table / CTS nominal / CTS AVG) |
|---|---|---|---|---|---|---|---|
| 3/8 | .402 OK | .430 OK | .450 OK | .493 / .493 / .473 | .423 / .423 / .403 | **.485 / .360 / .350** (row copied from 1/2") | .493 (n/a; CTS has no 3/8) |
| 1/2 | .527 OK | .545 OK | .569 OK | .602 / .622 / .602 OK(avg) | .526 / .546 / .526 OK(avg) | .485 / .485 / .475 (-2.1%) | **.622 / .489 / .469** (+27%) |
| 3/4 | .745 OK | .785 OK | .811 OK | .804 / .824 / .804 OK(avg) | .722 / .742 / .722 OK(avg) | .681 / .681 / .671 (-1.5%) | **.824 / .715 / .695** (+15..19%) |
| 1 | .995 OK | 1.025 OK | 1.055 OK | 1.029 / 1.049 / 1.029 OK(avg) | .936 / .957 / .936 OK(avg) | .875 / .875 / .862 (-1.5%) | **.815 / .921 / .901** (placeholder) |
| 1-1/4 | 1.245 OK | 1.265 OK | 1.291 OK | **1.000 / 1.380 / 1.360** | **1.000 / 1.278 / 1.255** | **1.000 / 1.069 / 1.054** | .815 / 1.125 / 1.105 |
| 1-1/2 | 1.481 OK | 1.505 OK | 1.527 OK | **1.000 / 1.610 / 1.590** | **1.000 / 1.500 / 1.476** | **1.000 / 1.263 / 1.244** | .815 / 1.329 / 1.309 |

c column = PVC/CPVC Sch 80 IPS nominal (.423/.546/.742) then .825 placeholders. B/b columns = .815/.825 constants (placeholders).

## Findings
1. **Copper K/L/M: all 18 entries exact.**
2. **PVC Sch 40/80 at 1/2-1": table uses the manufacturers' AVERAGE ID** (0.602/0.804/1.029; 0.526/0.722/0.936) — the right choice for a flow computation. The 3/8" entries use the min-wall nominal instead (inconsistent, small population).
3. **PEX uses the min-wall NOMINAL ID** (0.485/0.681/0.875) where the average bore is 2.1/1.5/1.5% smaller (0.475/0.671/0.862, PPI + Uponor). Different convention from PVC. Harmless where Lf was FITTED on the rig (3/4" PEX-A 2.225 absorbed it: the pair (0.681, 2.225) is self-consistent), but any Lf inherited or reasoned from another row carries the 1.5-2% bore error straight into the reading. 1/2" PEX (567 Gen2 meters, Lf 2.220 unvalidated) is in that state until fitted.
4. **PEX-A vs PEX-B: identical dimensions by standard** (F876 CTS SDR-9 for both), so bore cannot distinguish them; the table's Lf difference (2.225 vs 2.250 = 2.6% of flow) is the only thing the PEX-B bench eval can settle.
5. **CPVC column is IPS Schedule-40 geometry, but plumbing CPVC is CTS SDR-11** (FlowGuard Gold class, D2846). At 3/4" the table bore 0.824 vs 0.695-0.715 real is +15 to +19%; at 1/2" 0.622 vs 0.469-0.489 is +27%. Column Lf 2.30 (set 2025-03-31, commit 3c08207, no fit record) takes flow down 9.2% relative to 2.25, which looks like a partial compensation for the wrong bore (INFERRED). Exposure: 252 Gen2 meters coded C (225 at one size, 21 at another, 6 at 1"). Whether they are on CTS or IPS CPVC is not recorded. **This is a larger accuracy risk than PEX-B and should be checked before the PEX-B eval, or right after.**
6. **1-1/4" and 1-1/2" plastic rows are 1.000 placeholders with Lf 2.130**: 11 Gen2 meters are coded P at 1 1/4" (true bore 1.360, table 1.000 = -26% before Lf). Needs a real row or those meters need an lFactor/bore override.
7. 3/8" PEX row is a copy of 1/2" (0.485 vs 0.360). Population at 3/8": 1 Gen2 meter.

## Recommended table changes (not applied)
- PEX rows: decide one convention. Either keep nominal and keep fitting Lf per row, or move to average ID (0.475/0.671/0.862/1.054/1.244) and refit 3/4" Lf (it would move ~1.5%: 2.225 -> ~2.21 to keep today's readings).
- CPVC: add a CTS SDR-11 column or repoint C to CTS bores (0.469/0.695/0.901/1.105/1.309 average) and bench-fit its Lf; find out what pipe the 252 fielded C meters are actually on.
- Fill 1-1/4" and 1-1/2" plastic bores from the standards above; the 11 fielded 1-1/4" PVC meters are the immediate case.
