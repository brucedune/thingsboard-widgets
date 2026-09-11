# TI v383 + ST 17075 — give the TI its zero (Bruce 9/10 23:10: "on the TI side there is no tnorm offset — will always seem to be flowing")

Status: SPEC for approval. Small, coordinated (both sides), no billing-path change.

## 1. Problem (verified in code + TB)
The TI has no offset. Every TI-side flow judgement runs on the RAW delta:
- `dune_meas_flow_active()` = |raw dtof| > 700 ps (v362; gates cell hops "while water is moving" and, since v381, the pending recal).
- `dune_meas_noflow_aggs()` still-water streak = |raw dtof| < 2,000 ps for 60 aggregates (v375; gates the pending recal).
- v382 does not depend on the zero (split vs correlation, range, error rate) — unaffected.

Raw zeros today: '3063 -5,050 ps (offset 5,180); the six PVC units -3,896 / -3,633 / -1,336 / -433 / +1,201 / 0 (never metered). So on '3063 and 4 of 5 metering PVC units the TI believes water is always moving: no re-park is ever allowed, the v375 recal never fires on its own. The only recals today came from the v379 force (now removed). Fleet-wide: most devices carry |offset| > 700 ps, so the same holds.

The legacy channel exists on both ends and both ends neuter it: TI cmd 0x8A `delta_tof_offset` — TI READs it at boot config, ST answers 0 (lib/src/hci.c:739 `deltaToFOffset = 0`); TI WRITE handler stores 0 regardless of payload (ussDCCommandHandlers.c:903); TI reports it in INFO (`duneInfo.offset`, always 0). Nothing on the TI consumes it.

## 2. Change
### TI v383
- `Handler_delta_tof_offset_id` WRITE: parse payload[3..4] as int16 ps (LSB first, the ST's existing encoding) into `gCommandHandler.delta_tof_offset`; keep the READ reply.
- Corrected delta for TI-internal judgements only: `dz = dtof + delta_tof_offset` (the ST applies `deltaTOF += offset`, so zero-corrected = raw + offset; '3063: -5,050 + 5,180 = +130).
  - `dune_meas_flow_active()`: |dz| > 700 ps.
  - v375 still-water streak: |dz| < 2,000 ps.
  - v362 continuity anchor and everything shipped to the ST: UNCHANGED (raw). The ST keeps applying its own offset; no double correction.
- INFO `duneInfo.offset` now reports the value in use (verification on TB via the INFO decode).

### ST 17075
- Answer the TI's boot READ with `meas.offsetSet ? meas.offset : 0` (was hard 0).
- Push `hci_delta_tof_offset(meas.offset)` when the offset promotes (analytics.c setMetering path), when the 24 h commit / 17066 re-anchor changes the applied value, and inside `hci_push_user_overrides()` so a TI reset or FOTA gets it back at the first post-radio window. 0 is pushed when the offset is wiped (recalibrate / resetOffset / fresh install) so the TI falls back to raw.
- int16 ps range is ±32.7 ns; offsets beyond that (none seen) are clamped.

## 3. Effect
- The TI's "still water" and "flow active" become true still/flow within the ST's zero accuracy (~100s of ps). Re-parks under genuine still water become possible again; the pending recal fires at the next genuine quiet-and-still window instead of never.
- v382 behaviour unchanged. Billing path unchanged (ST-side offset as before).
- Until the first promotion after boot the TI has offset 0 (raw): identical to today, and the ST pushes the value ~32 s after metering.

## 4. Verification ('3063 rig, then the six PVC units)
1. After promotion, TB INFO decode shows the TI offset == ST offset (e.g. 5,180 on '3063); after a TI reset the value is back within one post-radio window.
2. Still water: `dune_meas_flow_active()` false — visible as a random re-park (not only in-place kicks) on a still-water ladder episode, and a pending recal firing within ~2 min of quiet+still (create one: 3 killed episodes, or a recalibrate attr).
3. Flow: flow_active true at >= 0.3 gpm equivalent; no recal fires during a pump run (unchanged from v381/v382).
4. Register == records across a run (billing unaffected).

## 5. Risks
- Sign error would invert every TI judgement: verified against the ST code (`deltaTOF += current_offset()`) and the '3063 numbers; the INFO decode gives a same-day check.
- The TI applying the offset to SHIPPED data would double-correct on the ST: explicitly excluded; the shipped raw stays raw.
- Lean image: ST change is ~60 B; 17074 lean has 12 B free -> drop the 17074 print's `x%u` field or quiet one more module in the lean build.
