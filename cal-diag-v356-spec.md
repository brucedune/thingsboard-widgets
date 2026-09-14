# Spec — TI v390 / ST 17900 diagnostic defeature build (freeze + error-burst snapshot)

**APPROVED by Bruce 2026-08-27; DESCOPED same day at Bruce's direction ("defeature
+ add diagnostics"): compile-time freeze + INFO-tail error snapshot; the
calFreeze/calVerbose attrs and the verbose record pipeline are DROPPED from round 1.
Quarantine rev numbers ST 17900 / TI v390 locked.**

**Branches (created, both at their v355/17041 base — nothing committed yet):**
- `Dune_FW_TI` branch `cal-diag` @ cc3a0da (= tag v355)
- `DuneFW_L5_2` branch `cal-diag` @ e4bb3ef (= Rev 17041)

Division of labor per the established split: cal-function session implements `cal.c`
(their file); bench session compiles, uploads, rig-verifies. Rev numbers ST 17900 /
TI v390 (quarantine) — per ledger discipline, `git fetch` + check tags/buckets first.

## Why (what T1 on 8/27 proved)

'4423 metered perfectly for 428 s at 5.2 gpm, collapsed healthy→dead in 1 s (tnorm
18638 → 321 → silence), stayed blind through ~142 s of continuing flow, recovered ~35 s
after valve close. Error class was EXCLUSIVELY err_cross (36) — errNoSig/errSigWeak/
errSigHigh/tofReject/tofFail all zero — with upamp RISING (824→1044). Signal present,
threshold missing the crossing. Two instrumentation holes block diagnosis:
1. Errored aggregates produce NOTHING in the record stream — the collapse is a hole,
   not a trace.
2. The walker moves the operating point mid-experiment (env 35→37 during the error
   burst; also only 2 steps from 36 errors — itself unexplained, see open questions).

Separate silent failure also found: onset acquisition blindness (clean ZEROS, no error
counters at all, for ~8/15/28 s of real flow at run start). Verbose pass-through must
capture whether onset samples are errored, gated, or genuinely measured-as-zero.

## Changes — DESCOPED 8/27 (Bruce: defeature + diagnostics; verbose record
## pipeline DROPPED — too invasive for round 1)

### TI v390 (`dune/cal.c`, `dune/dune.h`) — TI-mostly build
1. **DEFEATURE (compile-time, always-on in this build):** after the boot cal
   commits, the meter is inert — NO walker steps (up or down), NO decay, NO
   recal pressure/pending/fire, NO amp-hold actuations. Boot cal still runs
   and commits normally (mag reset = fresh point, as today). Error counters
   and the v355 cal-state tail keep reporting. adcCapture unaffected.
2. **ERROR-BURST SNAPSHOT (new diagnostics, ~6 appended u8 INFO fields):**
   latched by the error path so the blind window becomes data at the next
   radio session, without touching the ST record path:
   - errBurstMax — longest consecutive-errored-agg run since boot
   - errDtofX — |dtof_ps|/100000 (units of dthres) at most recent err_cross, clip 255
   - errSplitX — |tofups-tofdns|/100000 at most recent err_cross, clip 255
   - errUpamp — upamp/16 at most recent error (envelope present during blindness?)
   - errClassBits — bitfield of classes seen in last burst (cross-dtof /
     cross-split / floor-ups / floor-dns)
   - preTnormC — last good tnorm/256 before the burst (sanity anchor)
3. Version -> 390 (quarantine band 390-399).

### ST 17900 — mechanical tail mirror only (the proven 17041 pattern)
- hci.h: mirror the appended u8 fields; version gate zeroes them unless
  in-packet version is INSIDE THE QUARANTINE BAND (390..399) — future fleet
  revs 356+ will NOT have these fields, so a plain >= gate would corrupt.
- status_report: new keys for the six fields.
- Rev -> 17900. NO record-path changes, NO new attrs, NO event changes.

### Explicitly DROPPED from round 1 (revisit only if the freeze result demands it)
- calFreeze/calVerbose attrs and TI user-param plumbing (freeze is compile-time).
- Unconditional verbose recording / per-sample errCode stream.

### The experiment this build runs
Trio defeatured, wait for a collapse:
- Collapse WITH everything frozen -> purely environmental/acoustic; mechanism
  hunt goes physical; Phase 2/3 proceed as specced; snapshot fields say what
  the TI saw.
- Collapses STOP -> the adaptive machinery is implicated as a trigger. 15-line
  finding.

## Guards
- **CONTAINMENT CHANGE vs the attr design: this image is frozen ALWAYS (compile-time).
  A fleet device running it would never walk, decay, or recal — NOT harmless.**
  Containment rests entirely on: (a) quarantine rev numbers 17900/390 that no fleet
  lever plausibly references, (b) the no-fleet-lever discipline, (c) bench-trio-only
  levers. State this in the commit message.
- Frozen means NOTHING rescues a collapse (that is the point). Bench only. Under-read
  during frozen runs is expected and fine.
- INFO tail grows ~6 bytes: check PACKET_PAYLOAD_MAX_SZ guard (was bumped 80->88 for
  the 84-byte DuneInfo at v355; TI-natural 90 + header will exceed 88 — bump again)
  and confirm FRAM headroom at link.

## Rig procedure once flashed (bench session)
1. FOTA trio to 17900/390 (device pins only). Mag = fresh commit, then frozen.
2. 50-gal runs @ 5 gpm, no pre-purge (collapse-hunt discipline). Repeat until a
   collapse occurs or the count is convincing.
3. On collapse: snapshot fields (errBurstMax/errDtofX/errSplitX/errUpamp/
   errClassBits/preTnormC) arrive at the event-end radio; adcCapture pre-armed on
   the suspect unit for the envelope picture (false->true toggle re-arms it).
4. Compare collapse RATE frozen-vs-v355 (the discriminating experiment).
5. Onset check: do the frozen units still show onset blindness? Counters + records
   edge counts answer coarsely; full answer deferred to verbose round 2 if needed.

## errDtofX decode (Tx f0 = 2 MHz, Bruce 8/27; units of 100 ns, period 500 ns)
- 1-2 = sub-cycle crossing jitter (first observed: '3063 24-agg burst 8/27 eve,
  errDtofX=1, errSplitX=1, upamp healthy, recovered unaided under freeze)
- ~2-3 = half-cycle slip (wrong-polarity zero crossing)
- ~5 / ~10 / ~15 = one/two/three full CYCLE SKIPS (the GEN1 mechanism — GEN1 shipped
  tnorm glitch filters that held prior values until the waveform stabilized, toggling
  cal states if needed; key property: it recovers and registers flow eventually)
- >>15 = wrong-feature lock / garbage (fits envelope-shape drift with healthy upamp)
First frozen-run findings (8/27 eve): onset blindness REPRODUCES under freeze
(environmental, not adaptation); marginal bursts recover unaided (walker not needed
for this class); TI agg rate may exceed 1 Hz record rate (burst hid between recorded
seconds — verbose-round question).

## Open questions this build should answer
- What does the TI measure during the blind window — garbage dtof, zero dtof, or
  errors? (Error-burst snapshot: errDtofX/errSplitX/errUpamp answer coarsely.)
- Where does the envelope sit vs threshold during collapse? (adcCapture.)
- Why did 36 err_cross produce only 2 walker steps in v355? (Read the trace; the
  4-errors-per-step logic apparently paused mid-outage.)
- Is onset blindness the same mechanism as mid-flow collapse, or a third thing?

## NOT in scope
- Any recovery behavior (Phase 2/3 of cal-recovery-ladder-spec.md).
- Any fleet rollout. **DEBUG INSTRUMENT ONLY (Bruce 8/27: "I would never deploy
  this").** Containment is structural, not procedural:
  1. Image is ALWAYS frozen (compile-time) — see Guards: containment is the
     quarantine numbers + lever discipline, NOT a safe default.
  2. No fleet lever (group or device outside the bench trio) may ever reference
     these revs — v345-348 Fo-experiment discipline.
  3. Note: the trio FOTAs from the PROD bucket (compile-time URL), so the diag
     image unavoidably sits where fleet devices read; 1+2 are the fence, and the
     quarantine rev numbers (ST 17900 / TI v390 — DECIDED) make lever
     fat-fingering implausible.
