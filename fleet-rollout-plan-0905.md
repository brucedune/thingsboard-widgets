# Fleet FW rollout plan — ST 17047+ / TI v365

**Drafted 2026-09-05 by Claude (session 493a4abd) at Bruce's request. PROPOSAL —
no fleet writes made.** All fleet numbers are live TB reads from this session
(census scripts + `rollout_census.csv` in the session scratchpad). Code facts are
read from `DuneFW_L5_2` @ `stuck-event-fix`/`main` (17056) and `Dune_FW_TI` @
`cal-reacq`/`main` (v365).

---

## 1. Objective

Converge the installed Gen2 fleet from its current 17037/16185/362-era spread onto
one current ST + TI v365 pair, to close four defects that are live in the field
today:

| Defect | Fixed in | Field exposure today |
|---|---|---|
| **TI DTHRES latch** — unbounded dtof latch since v180 (Dec 2025) ships a frozen historical dtof forever; bench reproduced **+200 gal phantom in 47 min** | TI **v357** | Every device on TI < 357 = **effectively the whole fleet.** Retro-explains the constant-rate phantom floors (21 Maple 677 gal/d, 40 Maple #5 289 gal/d) |
| **Billing register rollback** — checkpoint was *daily*, so any unplanned reset rolled the totalizer back up to 24 h (measured −77 to −81 gal on bench) | ST **17047** | Every device on ST < 17047 |
| **Flow-record backlog destroyed on reset** — normal boot bulk-erased the FIFO; separately, Rev 16040 dropped the *entire* pending backlog on any connect-cycle failure | ST **17050**, **17055** | Every device on ST < 17050. Candidate cause of the standing "usage but no records" class at fringe sites |
| **Stuck events / phantom containment** — ingress marker discernment, impossible-water detector, wall-clock event cap | ST **17043** | Every device on ST < 17043 |

Secondary gains: surface cal (v359–v361) replaces the env spiral, lock integrity
(v362–v364), v365 stops raising Failed Cal on a metering unit, 17054 fixes the
stuck radio-on flag.

---

## 2. L-factor / billing — **DECIDED 2026-09-05: target ST 17056, both corrections accepted**

**Bruce, 9/5: "Not concerned about 10% increase — we understand."** Both L-factor
corrections are accepted. Combined with the offset decision in §2b, the rollout
target is **ST 17058 + TI v365** (17056 tables + 17057 FIFO forensics + the 17058
offset cleanup). The rest of this section is retained as the record of exactly what
changes and for whom.

Two accuracy corrections are baked into the rev stream and **cannot be taken
selectively** once you roll past them:

| Rev | Table change | Effect on readings | Installed meters affected | Reachable |
|---|---|---|---|---|
| **17048** | 3/4" copper M `2.255 → 2.239` | **≈ +3.5%** | 213 | 200 |
| **17056** | 3/4" PEX-A `2.270 → 2.225` | **≈ +9%** | **2,554** | 2,346 |

Both are *corrections* — the fleet currently **under-reads** on these pipe classes,
so Dune is under-recovering. Both are bench-validated (copper M: predicted +3.489%
vs actual +3.496%; PEX-A: two 50-gal reference runs, trio mean on the temperature
model within ~0.4%). Neither is an error being introduced.

But rolling 17056 fleet-wide silently raises billed water on **47% of the installed
fleet by ~9%**, landing as a step change in one billing cycle.

### Consequences of the 17056 decision (accepted)

- ~2,346 reachable PEX-A 3/4 meters read **~+9%** and ~200 copper M 3/4 read
  **~+3.5%** from the cycle in which each property converges. Corrections of a known
  under-read; Dune has been under-recovering on these classes.
- The step lands **per property as that property rolls**, not fleet-wide at once —
  so the wave order determines which properties see it first. Worth telling
  Gallin/Hratch which properties moved in a given week so month-over-month review
  doesn't flag them as anomalies.
- Unchanged and still **unvalidated** constants (not touched by 17056, flagged for a
  separate accuracy effort): PEX-B (`x`) 2.250, and all 1/2" and 1" rows —
  650 reachable X 1/2 and 32 X 1 meters run on unvalidated table values.

**One pre-flight consequence:** the 17056 *image* has never run on hardware. The
bench trio + '8538 are on 17055 with an `lFactor=2225` shared attr, which reads
identically to the 17056 table — so the constant is validated, but the image is not.
Per the bench handoff's own plan: roll the trio to 17056, **delete the four
`lFactor=2225` attrs** so the compiled table is what actually runs, and confirm one
reference run before the fleet uses it.

**Two other billing-visible behavior changes ride along in every option** (they are
in 17038+, so the 199 devices already on 17040 have them; the rest do not):
- **Noise gate ON by default** (`noiseGateK=2`) — noisy units **stop billing noise**.
  Correct, and revenue-*negative* on affected meters. This is the mechanism that
  should end the phantom-floor class.
- **Signed flow** — reverse-installed meters begin recording negative `flowRate` and
  accumulating `revGal`; **billing takes the forward component only.** Any meter that
  was reverse-installed and previously billed on |flow| will show a usage **drop**.

---

## 2b. Offset / flow-direction on the crossing — **DECIDED 9/5: wipe offset, keep direction**

**Question asked: does the FOTA wipe the existing offset? It does not — it is
designed to preserve it.** `main.c:318` (Rev 16123): *"RETAIN the applied
offset/direction across TI FOTA and ti_monitor recovery (user spec: wipe only on mag
reset; normal operation keeps them across ST/TI FOTA)."* On a TI cross,
`offset_init()` clears only the RAM clustering histogram; the applied offset survives
in `NVRG_OFFSET_ID` and keeps correcting flow through the ~2 min re-cluster window
until a fresh promotion overwrites it. Without an explicit cleanup, **4,958 devices
would carry their current offset straight through the campaign.**

**Decision (Bruce 9/5): reset the offset fleet-wide; leave flow direction alone**
("the majority should be correct — we can always scan for potential errors").

**Implemented as Rev 17058** — `NVRG_SETTING_OFFSET_CLEANUP_V3 = 0x10000000`
(bit 28; OPER occupies 16–25, V1 bit 26, V2 bit 27), the same one-shot done-bit
pattern as the Rev 16128 (V1) and Rev 16190 (V2) cleanups, so it fires exactly once
per device on the upgrade and never regresses into wipe-on-every-FOTA. Unlike V1/V2
it writes `NVRG_OFFSET_ID = 0`, clears `meas.offset`/`offsetSet` and calls
`offset_init()`, but **does not touch `NVRG_FLOW_DIR_ID` or `flowDirection`.**
Build verified: 109,652 B, 2,988 B headroom, zero warnings.

**Why wipe the offset when the values mostly look fine.** They do look fine — only
**4 of 5,433** installed devices sit at a rail (|offset| ≥ 16k); the bulk read a
plausible 1k–4k. The case is *provenance, not appearance*: every offset in the fleet
was clustered while the TI v180 DTHRES latch could substitute a frozen dtof
indefinitely (fixed in v357), so a healthy-looking offset is not evidence of data
learned from a healthy measurement. The upgrade to v365 is the natural point to
re-qualify all of them once.

**Why keeping direction is the safer half of the decision** (two findings that would
have made a direction wipe partly useless and partly risky):
1. **It would be a no-op on 1,930 of 5,433 devices (36%)** — 1,022 carry
   `waterFlowDir=2` (FLIP) and 908 `waterFlowDir=1` (NOFLIP), and `measure.c:798-806`
   re-imposes the attribute on *every sample*. A true direction wipe would require
   deleting those 1,930 attributes as a separate TB campaign.
2. **UNKNOWN direction is the ABS-rectification path** (`measure.c:582-588`) — the
   phantom-usage route named in `config.h` Rev 17038. Re-qualification needs
   `FLOW_DIRECTION_DETECT_CNT = 50` detections, so on a low-use lot the window is
   long, and during it a genuinely reversed install bills reverse flow as forward.
   Retaining direction keeps **zero** devices in that window. (740 already sit in
   UNKNOWN independently.)

**Follow-up owed — the direction scan.** Since Rev 17039 a wrong direction is
*visible* rather than silent (negative `flowRate`, non-zero `revGal`). Present
evidence: **53 devices already report non-zero `revGal`** — 27 FLIPPED, 24 NOT
FLIPPED, 2 UNKNOWN — out of only ~232 devices new enough to report the key at all.
That is a ~23% hit rate on the reporting population and wants a proper scan as
coverage grows through the campaign. `flowDirAlarm` is *not* in the status report,
so attr-vs-learned disagreement cannot currently be detected remotely; adding it is a
cheap candidate for the next rev.

**Watch at the pilot, not at Wave 1:** offset re-promotion latency and any phantom
during the re-cluster window. Wave 1 devices aren't flowing, so they cannot test it.

---

## 3. Scope

**In scope:** 4,959 installed + reachable (<48 h) Gen2 devices across 165 properties
needing a move; 387 device groups carrying FW levers; plus the warehouse/production
pool (2,235 Gen2 not marked Installed) as a later wave.

**Excluded:**
- GenI (10xxx) — different platform.
- Toronto Bell-first units on 179xx — monotonic validated-version record means
  mainline revs < 17903 will never validate on them. Keep on the 179xx line.
- Bench: Flow Testing trio, Wyse Test, '8538.
- 8 TI-silent units (`fwVerTi=0`) — investigate/dispatch, not roll targets.
- 474 installed but unreachable (>48 h) — they roll if/when they return.

---

## 4. Current state (live census, 2026-09-05)

Gen2 total **7,668** · installed **5,433** · installed+reachable **4,959**.
Device state: Metering 4,718 · Failed Cal 171 · Not Metering 33 · Calibrating 31 ·
TI Silent 6.

**Only 18 devices fleet-wide are on ≥17047.** The campaign is effectively
greenfield.

| ST band | installed | reachable | pinned |
|---|---|---|---|
| 17037 | 1,187 | 1,126 | 614 |
| 16185/1619x | 1,080 | 1,041 | 771 |
| 362/363 estate | 974 | 898 | 55 |
| 1613x/1616x | 893 | 827 | 360 |
| 1602x/16048 | 498 | 330 | 429 |
| 15xxx and older | 448 | 417 | 27 |
| 17040 | 199 | 184 | 199 |
| 1702x–1703x legacy | 135 | 123 | 17 |
| current (≥17047) | 18 | 13 | 18 |

**Governance:** 389 of 410 device groups already carry `gen2fw`/`allowTiFotaVer` in
SERVER_SCOPE; **387 need a move.** Biggest cluster by far: **210 groups on 362/209**
and 11 on 363/219. So the campaign is mostly ~390 *group* writes plus per-site pin
cleanup — not ~5,000 device writes.

---

## 5. Transition classes (these set the pace, not the device count)

| Class | Reachable | Behavior | Rule |
|---|---|---|---|
| **v304+ TI → clean** | 2,480 | No wedge (T1 314, T5 320 proven) | Group lever, both attrs |
| **pre-v304 TI → wedge + self-heal** | 1,573 | Wedge minted during the live TI session, cleared by the 17036+ controlled reboot. ~6–8 min/device, one extra boot (`bootReasonFlags` 20). **Support signature is NORMAL** | Group lever; expect ~1% salvage baseline loss |
| **362/363 estate → TWO-STEP** | 898 (221 groups) | v363's BSL predates 15007's baud fallback (2–3% TI-brick era); TI v288+ boots gated on ST 16104+ | **`gen2fw` first → verify `fwVer` on check-in → THEN `allowTiFotaVer`.** Never TI-first |
| TI silent (`fwVerTi=0`) | 8 | Won't move | Investigate / BSL recovery / dispatch |

Every device that crosses TI versions **recalibrates** — that is intended here
(it's how v357's latch fix and surface cal take effect), but it means a fleet-wide
recal event with a transient Failed Cal bulge.

---

## 6. Waves

### Wave 0 — Pre-flight (no fleet writes)
1. ~~L-factor decision~~ **DECIDED: 17056.** Remaining step: put **17056 on the bench
   trio + '8538 and delete the four `lFactor=2225` attrs** so the compiled table is
   what runs; one reference run to confirm. (17056 = 109,296 B, ceiling 112,640 B,
   ~3.3 KB headroom — verified.)
2. Verify `msp365.bin` is in `dune-firmware-ti` and G/17056 is in `st-prod`
   (handoff says both were uploaded; confirm the listing before writing levers).
3. Decide whether these unexercised paths gate the roll (my read: **they do not**,
   but they should be named): meter-log **compaction path never run on hardware**;
   30/40 gpm **flow ceiling never exercised** (`maxFlowRate` unset, peak seen 8 gpm);
   overnight thermal soak still outstanding.
3b. **OPEN BENCH BUG — this one may genuinely gate the bulk waves.** Rev 17057's
   changelog records that on 17055, after every full drain, `bytesToSend` re-grew to
   **~2.6× the records written** and hit the ring size on two units (flash-full
   sessions, **~90 dropped records/h**), with the post-drain remainder always an
   exact 64 KB multiple. 17057 adds the forensics (`tofHead`/`tofTail`/`tofFree`/
   `tofRing`/`tofAvail`) but no fix. Rolling record-loss behavior to 5,000 devices
   before this is understood would re-create the "usage but no records" class the
   campaign is partly meant to end. **Recommend: hold Waves 3–5 until the forensics
   land a verdict.** Waves 1–2 are small enough to proceed and will add field data.
4. Brief billing/support: expected Failed Cal bulge, wedge/self-heal signature,
   noise-gate and signed-flow effects.
5. Campaign freeze — no unrelated attribute campaigns while this runs.

### Wave 1 — Nothing-to-lose cohort (235 devices, ~2 cycles)
The 235 installed+reachable devices **not currently metering** (171 Failed Cal,
33 Not Metering, 31 Calibrating; 127 already on 17040; 28 NoWater dry lots).
Device-scope pins, logged as a deliberate exception, cleaned when their property
moves later — same pattern as the 17040 release.

These aren't billing, so cal churn and L-factor are moot. This wave is the
field proof of the new cal stack at scale.

**Success:** recovery ≥ the 17040 wave's 21% of checked-in; zero permanent wedges;
zero salvage-zeros; `calSurf*` telemetry shows commits inside the gain 23–38 ×
env 30–50 envelope; no new failure mode.

### Wave 2 — Pilot properties (~3 properties, ~150–250 meters, ~1 week)
One property per transition class, so all three shapes are exercised at property
scale before the bulk:
- **Clean (v304+):** Ponderosa MHC (56) or Holly Tree MHP (76, 16185)
- **Wedge + self-heal:** Kay Bee Mobile Villa MHP (97, mostly 1613x — and it
  already has 4 units on 17055 as an accidental head start) or Kingsbrook (144)
- **Two-step 362/363:** Maple Run MHP (106) or Westview (74)

**Also propose Shady Lane early** (36 PEX-A units): its 21 Maple phantom
(~677 gal/d, over-billing since 8/24) is exactly what v357 fixes, and two units
are already on 17050. Caveat: it's PEX-A, so if you choose 17056 the +9% lands
there first, on a property with an active billing conversation.

Method per property: set **group** levers → verify uptake on check-in → 48 h watch →
then propose pin deletions per the standing site-pin-cleanup rule.

### Wave 3 — Clean-transition estate (2,480 devices)
Group levers, both attrs at once. Pace ~10 properties/day after the pilot readout is
green; these carry the lowest risk.

### Wave 4 — Wedge + self-heal estate (1,573 devices)
Slower — expect the wedge/self-heal signature on every unit and ~1% salvage baseline
loss (**~16 devices**, needing Usage Adjust). Batch by property, verify totalizer
continuity in the next-day sweep, maintain a billing watch list.

### Wave 5 — 362/363 estate (898 devices, 221 groups)
**Two-step, strictly.** Day 1 `gen2fw` on a batch of groups; day 2 verify `fwVer`
moved on check-in; day 3 `allowTiFotaVer`. Largest group count, so batch groups
rather than properties.

### Wave 6 — Warehouse / production pool + returning stragglers
Production Inventory group lever; dry units fail cal by design — expected, not
casualties.

### Wave 7 — Pin hygiene (rolling, not terminal)
Per the standing rule, pin cleanup happens **per property as each site moves**
(group lever set → show member pins → Bruce's explicit OK → delete). Current pin
load: 771 on the 16185 band, 614 on 17037, 429 on 1602x, 360 on 1613x.

---

## 7. Success criteria & abort triggers

**Per wave, measured at the daily check-in sweep:**
- ≥95% of targeted reachable devices report the target `fwVer` + `fwVerTi` within
  3 cycles.
- Failed Cal returns to ≤ baseline (**171/4,959 = 3.4%** today) within 2 cycles of
  the recal bulge.
- **Zero permanent wedges** (wedged and still wedged after 2 cycles).
- Salvage-zero rate **<1.5%** (17037 campaign measured ~1.3%).
- `deltaMeterVal` in **(−1, 0]** on resets — register durability holding.
- No unexplained meterVal freeze on a previously-metering unit.

**Abort / pause triggers:**
- Any device bricked or unreachable post-FOTA that was reachable before.
- Salvage-zero rate >3%.
- Failed Cal not recovering within 3 cycles on the pilot.
- `stFotaEraseErr` or `stFotaCrcErr` non-zero anywhere.
- Any TI brick on the 362/363 estate → stop that wave immediately.

---

## 8. Risks

1. **Billing step change** from L-factor (§2) — mitigated by rolling billing-neutral.
2. **Noise gate + signed flow** change billed volume on some meters in *both*
   directions; these are correct but need to be explained before bills go out.
3. **Recal bulge** — every crossing device recalibrates; the Failed Cal count will
   spike transiently and support will see it. v365 masks Failed Cal on metering units,
   which limits the noise.
4. **~1% salvage baseline loss** on the wedge class (~16 devices) → Usage Adjust.
5. **Support load** — the wedge/self-heal signature (3–4 min TI Silent, 2 wedged
   statuses, one self-reboot) is normal but looks alarming.
6. **512K variant:** both devices reporting `flashKB=512` are bench/lab, not
   installed — the field is 256K, consistent with Bruce's 8/15 BOM call. The 362/363
   estate can't report `flashKB` at all (key added 16194), so that estate rests on
   the BOM assertion, not telemetry. `fota.c` has served both variants since 16194.
7. **Image headroom is thin** — 3.3 KB. Any further feature needs a size check
   against 112,640 B, not a chunk count.
8. **Unexercised code paths** — compaction, high-flow ceiling, thermal soak (§6 W0).

---

## 9. What I need from Bruce to start

1. ~~L-factor decision~~ **DONE 9/5 — both corrections accepted.**
2. ~~Offset/direction decision~~ **DONE 9/5 — offset wiped, direction retained;
   built as Rev 17058 (§2b).**
3. **Review + apply 17058** — 3 files, +46/−1 (`config.h`, `main.h`, `init.c`),
   109,652 B, 2,988 B headroom, zero warnings. **PARKED 9/5 as a patch, working
   tree restored to 17057** so it cannot collide with the bench session's L-factor
   / flash-bug work on the same branch. Restore with:
   `git apply "<scratchpad>/rev17058-offset-cleanup.patch"` — the built binary is
   also saved at `<scratchpad>/DuneFW_L5_2_17058.bin`. **Re-number if the bench
   session takes 17058 first.**
4. **Bench pre-flight** — trio + '8538 to 17058 with the four `lFactor=2225` attrs
   deleted (needs your OK for the deletions), one reference run, and confirm
   `ofs cleanup v3` fires exactly once and the offset re-promotes.
5. **Wave 1 go** — 234 device pins to 17058/365. Preview built:
   `wave1_cohort.csv` / `.json` in the session scratchpad.
6. **Pilot property picks** — and whether Shady Lane goes early.
7. **Verdict on the 17057 FIFO investigation** before Waves 3–5 (§6 W0.3b).
