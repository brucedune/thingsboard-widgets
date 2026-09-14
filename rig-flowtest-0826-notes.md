# Rig flow-test session notes — 2026-08-26 afternoon (17040/v354 forward-billing)

Ran mid-stream inside the Shady Lane under-registration session (f39664e0); these notes
exist so the copper-M / cal-v349-354 campaign session can pick this up without that context.
Belongs with `copper-m-flow-handoff.md` + `cal-spec-v349-354-handoff.md`. All times UTC.
Data pulls: session f39664e0 scratchpad — `rig_*_quicktest.json`, `rig_*_50gal.json`,
`rig5*.out` analyses.

## Setup

Flow Testing trio, all **ST 17040 / TI v354**, offsets 5174 / −2676 / −492 (unchanged all day):

| SN | TB device id | notes |
|---|---|---|
| 70273063 | d08d4e60-db7a-11f0-b691-d965a62fa4fa | flowDirection UNKNOWN |
| 72714423 | 737b0320-db7a-11f0-b691-d965a62fa4fa | flowDirection UNKNOWN; ext temp still dead |
| 72718549 | 5f18a040-dc4c-11f0-b691-d965a62fa4fa | direction pathology — see below |

Legs are valved independently and were closed at different times during the 50-gal run
(observed closures 15:28:30 / 15:30:52 / 15:31:05; Bruce confirmed '549 was ended early).
**Per-leg true volume ≠ shared total when closures stagger — this reversed one verdict today.**

## Quick test — 10 gal @ 5 gpm (true per Bruce), events ~15:09–15:13

| SN | read | err | captured dur | delta÷dur |
|---|---|---|---|---|
| '063 | 9.043 | −9.6% | 111 s | 4.89 gpm |
| '423 | 8.260 | −17.4% | 101 s | 4.91 gpm |
| '549 | 9.625 | −3.8% | 117 s | 4.94 gpm |

Rate correct; shortfall ≈ missing seconds at event boundaries (10 gal @ 5 gpm = 120 s).
**UNRESOLVED whether this is real short-event boundary clipping or the same per-leg
reference/valve-stagger ambiguity that produced the false 50-gal fail.** Ask how the quick-test
legs were valved/measured before treating −9.6/−17.4/−3.8 as capture loss. This is the
remaining Gate A item — short events are what tenant usage looks like.

## 50-gal run — true 51.25 gal @ ~5.2 gpm, ~15:21–15:31 — ALL THREE PASS

| SN | read | true (per leg) | err | valve closed |
|---|---|---|---|---|
| '063 | 50.783 | 51.25 | −0.91% | 15:30:52 |
| '423 | 51.008 | 51.25 | −0.47% | 15:31:05 |
| '549 | 38.940 | ~39.15 (leg closed 2.4 min early) | ≈ −0.5% | 15:28:30 |

- Registers match event deltas exactly on all three (billing-path consistent).
- **CORRECTION LOG: initial scoring called '549 −24% HARD FAIL with an env-walker-deafness
  mechanism. WRONG — assumed all legs saw 51.25.** Sample streams show three crisp valve
  closures (steady 5.2 gpm → one ramp sample → ~0). Reference-value discipline, again.
- env walked 35→43 and gain 29→28 on '549 across the run window with **no metering loss** —
  benign here; keep an eye on walkers parked at 43 (v349 should decay it back).
- **No phantom tail** on the UNKNOWN-direction pair after valve close (good data point against
  the measure.c:359 rectify-under-UNKNOWN phantom path at event end).
- **This is the missing high-flow baseline on 17040/354: trio ≈ −0.6%.** Session-3 k values
  can firm up on '063/'423; note Lf 2.239 itself still not re-verified on 354 per the handoff.

## '549 direction pathology (the real finding — fleet-relevant)

- Physical truth: **NOT FLIPPED** (Bruce). Current latch NOT FLIPPED since 03:35 = correct;
  `flowDirectionAlarm` latched true since 03:35.
- Overnight it flapped UNKNOWN↔FLIPPED six times (02:32–03:35). During the wrong-FLIPPED
  stretch 03:01–03:14 it banked **7.154 gal of forward rig water into revGal** = unbilled.
  revGal did NOT move during the 50-gal run (7.154 flat) — today's numbers are clean.
- Mechanism class: a noisy meter that latches the WRONG direction stops billing misclassified
  flow. Field echo: Shady Lane 5033 Spruce (75367100) — flapping + fdAlarm on a customer meter.
- The `waterFlowDir = 1` vs FLIPPED mapping contradiction from copper-m-flow-handoff is still
  unresolved and now matters.
- FW fix direction: harden direction latching against noisy samples; freeze direction
  re-latching while an event is open (same quiet-deferral discipline v349 gave recals).

## Record-timestamp corruption on 17040/354 (all three units)

latest-values returns garbage-stamped event records "newest" on every unit:
'423 an **84.6-gal event stamped 2061-07** (ts 2887893755000, device-epoch class),
'063 an 18.8-gal event stamped 07-02, '549 a 0.26-gal event stamped 01-10.
A live poller keyed on latest-values failed on exactly this. Range-query always.
Belongs on the 17038–17040 record-timestamp / tiTime investigation with the Shady
post-TIFOTA flow-record blackout (bad stamps are what made 777's records unbillable).

## State changes made (revert list)

- **`recordNoneventFlow: true` written to all three trio devices** (DEVICE shared scope,
  8/26 ~15:45Z, HTTP 200, verified by readback; were unset before). Purpose: continuous
  tofNorm/flowRate sampling so the next short-event test separates TI gate latency from
  ST event-layer discard. Takes effect on next attr fetch — run a priming draw, verify via
  `noneventMode` telemetry before trusting. **REVERT to false when the campaign wraps**
  (777 ring-fill lesson).

## Next steps

1. Priming draw → confirm `noneventMode` on all three.
2. Instrumented 10-gal short-event test (one leg at a time; valve wall-times if convenient —
   continuous samples make them optional). Compare flow-visible-in-samples vs event
   open/close per meter → boundary-capture latency, TI vs ST attribution.
3. Resolve quick-test reference question (per-leg volume / valving).
4. Direction-hardening FW change ('549 pathology) + walker/direction freeze-while-event-open.
5. Re-verify Lf 2.239 on 17040/354 (still outstanding).
6. Revert recordNoneventFlow on trio.

Gate A scorecard: 5 gpm × 10 min **PASS (~−0.6% trio)** · short-event capture **OPEN** ·
direction latching **OPEN ('549)** · record timestamps **OPEN (all units)**.
17040/354 stays blocked for billing/customer meters until the OPEN items resolve.
