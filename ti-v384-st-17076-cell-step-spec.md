# TI v384 + ST 17076 — a cell change must not move the billed zero

Status: SPEC for approval (Bruce 9/11 08:50 "I like it"). Follows the 70262090 phantom (9/11): TI 383 cal moved the cell 38/38 -> 39/46, raw zero moved ~1,200 ps, ST retained offset 1,201 -> +1,196 ps on still water = 0.36 gpm phantom, 175 gal in 8 h, self-heals only at the 24 h commit.

## 1. Facts
- Between clean cells the delta zero differs by up to the plateau tolerance, SC_LVL_DELTA_PS = 3,000 ps (v362 level channel). Typical: gain moves 90-160 ps, env moves hundreds to ~1,200 ps (9/11 five-unit table).
- The ST tracker's provisional re-anchor accepts a new cluster only within +-768 ps (OTK_GATE_PS) of the applied zero; beyond that the stale offset stands until the 24 h qualification commit (shadow peak, mass >= 5,000).
- The TI already measured every cell's delta level at cal time: `g_sc_lvl[sc_lvl_slot(cell)]` (int16 ps, SC_LVL_NONE when unmeasured), all cells scored within seconds under the same water, so level differences cancel the flow term.

## 2. TI v384 — cell-step translation (in-surface cell changes)
- Reference cell = the cell committed at the last FULL cal (boot cal, recal): `g_ref_cell`, `g_ref_lvl = g_sc_lvl[slot(g_ref_cell)]`.
- `g_cell_step_ps` = `g_sc_lvl[slot(current)] - g_ref_lvl` when both levels exist, else 0 with `g_cell_step_unknown = true`.
- Updated at every in-surface cell change: sc_apply_cell (re-park), sc_restore_commit (back to home), sc_commit_cluster (v380 D). NOT at a full cal (there the surface is re-derived and g_ref_cell is reset to the new commit, step 0).
- Applied to the SHIPPED aggregate delta only: `agg.tofDps -= g_cell_step_ps` (raw absolute TOFs untouched; the v373 pair hold, v374 aggregation, the v382 raw qualifier all run BEFORE translation on raw values). The ST keeps the offset it locked on the reference cell; in Bruce's scenario 4,000 ps stays 4,000 ps through the walk.
- The TI's own zero copy (v383 delta_tof_offset) is NOT cleared at a translated cell change (the ST offset stays valid); it is cleared only at a full cal, as before.
- If the step is unknown (no level for one of the cells): no translation, and the TI clears its zero copy as v383 does today, so the ST's 17076 path re-qualifies.
- Telemetry: `gCellStepPs` (RAM), and the step is exposed in INFO if a spare int16 exists; otherwise bench-only.

## 3. ST 17076 — re-qualify on a FULL recal (not on translated cell moves)
- Trigger: INFO shows a new full commit — `calFlags2` transitions through Unstable (sweep) back to metering — while `meas.offsetSet`. (Translated cell moves do not raise Unstable.) Equivalent trigger already exists for param recals (hci.c nowParamRecal -> meas_on_drive_change); extend the same call to any sweep-and-recommit.
- Action: `meas_on_drive_change()` semantics minus the direction wipe: offset 0, offsetSet false, tracker requalify, billing gated to 0 (17068) until the quick lock (~32 s still water). Push offset 0 to the TI (17075 path) so its tests run on raw meanwhile.
- Result: a full recal is followed by a fresh zero within ~32 s of still water instead of carrying a stale one for up to 24 h. Under continuous flow after a recal the ST bills 0 until still water (the 17068 policy), never a phantom.

## 4. Behaviour matrix after v384/17076
| event | zero handling | billing during |
|---|---|---|
| in-place kick (same cell) | nothing | unchanged |
| re-park / cluster commit (new cell, levels known) | TI translates by the cell step; ST offset stays | continuous, no step |
| new cell, level unknown | TI clears its zero copy; ST re-qualifies at next still water | 0 until quick lock |
| full recal (boot/pending recal) | ST re-qualifies; TI zero copy cleared | 0 until quick lock (~32 s still) |
| 24 h tracker commit | unchanged | unchanged |

## 5. Verification
1. Rig ('3063): force a cluster move under flow (aerated water does this on its own): shipped delta continuous across the move within +-200 ps at 11 gpm; register == records; no ST re-qualify (offset unchanged in the post); gCellStepPs equals the cell-table difference.
2. Bench (PVC): a `recalibrate` attr under still water: ST offset goes 0 -> new value within ~40 s of metering; no phantom; event closes.
3. Re-run last night's 70262090 case: TI FOTA -> recal -> if the new cell's zero differs by > 768 ps, the ST re-qualifies (17076) and locks the new zero within a minute; no OPEN EVENT on a dry bench.
4. 24 h: no OPEN EVENT / 0.3-0.5 gpm floors on any of the six units or 79454912.

## 6. Risks
- Level table staleness (temperature drift differs per cell over days): translation error bounded by the plateau spread; the tracker's slow re-anchor covers the remainder. Re-measured at every full cal.
- Sign: step = lvl(current) - lvl(reference); shipped = raw - step. Check on the rig with a known cell move before rolling.
- The v373 pair hold / v382 qualifier must see RAW values, not translated: translation is the last operation before the packet is built.
- 17076 trigger must not fire on env walks (EnvWalked flag) or translated moves: gate on the Unstable transition only.
