# Fleet TI-health census — 9/13/2026 10:50 (Dune Labs internal)
Source: ti_health_census_0913.{json,csv} (14,639 unique devices across the 412 roll groups, paginated, deduplicated, 0 API errors); per-class lists in ti_health_classes_0913.csv. "Heard <= 7 d" = a fwVer post in the last 7 days. GenI = no fwVerTi key.

| population | devices |
|---|---|
| total unique | 14,639 |
| heard <= 7 d | 8,065 (GenI 1,863 / Gen2 6,202) |
| stale > 7 d | 6,394 |
| no status ever | 180 |

## Gen2 classes (heard <= 7 d)
| class | devices | in property groups | notes |
|---|---|---|---|
| TI dead (fwVerTi 0 and tiUartVer 0) | 10 | 10 | 2 on ST 362 (Azulejo, Carolina Springs: cfg errors 612 / 54), 2 on 16185, 1 on 16131, 1 on 17037, 2 on 17080 (Roosevelt d502fe10 stable; Ontario 72381773 stable), 1 on 17086 (VB 79462923, stopped looping at 09:34), 1 on 16193 (VB 9592ae00, battery 2,794 mV) |
| boot looper (>= 6 reboots / 24 h) | 8 | 8 | see below |
| TI-FOTA failure (lastFailedVer != 0 or config_err >= 3) | 9 | 9 | 72385774 (344-era password, pinned 344), Aurora e703e200 16022/260, Estancia c814e6a0 15147/256, Lafountaine a366d840 16131 (last post 9/9), Ontario dfe22720 15147, VB 95712650 17060/325 failed 368, + the two ST-362 units and VB 79462923 |
| failed cal | 997 | 338 | field by TI: 344: 106, 391: 104, 314: 72, 368: 22, 296: 18; by ST: 17078: 104, 17037: 86, 16185: 72 |
| TI parked (17079+ breaker) | 1 | 1 | |

## Boot loopers — two distinct classes
1. **Heal loop (flags 20, TI dead/failing FOTA)** — the class 17080+ fixes: VB 79462923 (17078 -> 17086 at 09:34, stopped), VB 159 72390030 (17060, 22/day, TI now 320 after the 0-lever substitution, gen2fw 17086 set 09:36 but not fetched: no session since 09:26, battery 3,487), 72385774 Crystal Acres (pinned 344 by Bruce), 72381773 Ontario (17080, stable since 11:31 9/12).
2. **PIN-only resets (flags 4, healthy battery, offset repeatedly 0)** — NOT a TI problem: Roosevelt 72724018 (17037/344, 100 resets/day, 1079 -> 1207 in 48 h), Aurora 79457667 (9/day), Aurora 432f1b80 (7/day), Aurora 75502425 (6/day). PIN-only = external NRST = the magnet-reset path; each reset wipes offset/dir/pipe, so these units never keep a calibration. Suspect a stuck/vibrating reed switch or a magnet nearby; needs a site visit, no firmware will fix it.

## Failed cal, read with care
Half of the wave-1 units that landed on 17078/391 (104) report failed cal; before the roll 183 of 274 of that cohort were failed cal on 368, so 391 improved it but the cohort (VB HOA, PVC) remains cal-hostile. The 344 cohort shows 106 failed cal of ~1,650 (6%).

## Actions suggested
- VB 159: it cannot fetch 17086 without a session; a checkInPeriod (or wait for its daily slot) is needed, then confirm the loop stops as on 79462923 and Ontario. 17087 supersedes 17086 for any new lever.
- The two ST-362 units with TI 0 need the ST roll before any TI work (their TI-FOTA path is ancient).
- VB 9592ae00 at 2,794 mV: battery, go-back candidate.
- Roosevelt 72724018 + the three Aurora PIN-reset units: field visit (magnet/reed switch), not firmware.
- Failed-cal 391 cohort: separate accuracy investigation (PVC cal on 391/392), not part of the loop work.
