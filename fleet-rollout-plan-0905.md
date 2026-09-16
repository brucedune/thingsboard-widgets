# Fleet FW rollout plan — ST 17047+ / TI v365

**Drafted 2026-09-05 by Claude (session 493a4abd) at Bruce's request. PROPOSAL —
no fleet writes made.** All fleet numbers are live TB reads from this session
(census scripts + `rollout_census.csv` in the session scratchpad). Code facts are
read from `DuneFW_L5_2` @ `stuck-event-fix`/`main` (17056) and `Dune_FW_TI` @
`cal-reacq`/`main` (v365).

---

> **STATUS 2026-09-06 (eve) — WAVE 1 NOW TARGETS ST 17060 / TI v368.** All 251
> Wave-1 devices re-pointed (`gen2fw=17060`, `allowTiFotaVer=368`; the one unit
> still on 362 got gen2fw only), `recalibrate` attribute DELETED on 164 (the
> 17059+/v366+ stack restarts cal on a pulse change by itself and the attr now
> sends 0xAD on every fetch), `pulse=6` left on the 131 PEX 3/4 units. 251/251
> verified, 0 failures. Earlier: 17058/365 roll 9/5 (251/251), pulse=6 +
> recalibrate=true on PEX 3/4 9/6 (131/131), acceptance at T+42h: offset
> cleanup passes, direction retained on all >=16190 devices, 11 recoveries
> (6.6% of clean broken), 3 Shady regressions (1 loud-flat reject, 1 in-flight,
> 1 my stray device). v368's gain-17 frame shift is the direct fix for the
> loud-flat class. **FIFO/flash gate RETRACTED** (was `adcCapture=true` on
> bench units). Open: 19 field devices still carry `adcCapture=true`.

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
3b. ~~OPEN BENCH BUG~~ **RETRACTED 9/5 by the bench session.** The 2.6x pending
   re-growth on 17055 was `adcCapture=true` (installer live-waveform mode) left on
   all four bench units from 9/4 — a capture pair every 20 s, ~5,400 records/h on
   top of normal sampling. 17057's pointer keys showed head advancing by exactly
   the uploaded amount every post. **No record-loss behaviour exists in
   17055-17058** beyond the designed struck-chunk drop and the 60-min keep on a
   data-phase punt. **Waves 3-5 are unblocked.**
3c. **NEW — clear `adcCapture`:** 19 devices fleet-wide still carry
   `adcCapture=true`, including field units (Ponderosa 45, VB 74, Brian Fries,
   Stafford 227, Sky Stream x2, Hendricks, Woodland Heights, Crystal Acres,
   Coleman, Highlands, Freedom, Kachina, Whispering Pines, 103 W Broadway).
   Each burns ~86 KB/h of flash and long data phases. Needs a clear-attr
   campaign — preview + Bruce's OK, not yet approved.

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

### Wave 2 — Pilot properties (**re-picked 9/5 by GROUP**, ~171 devices)

**Methodology correction (Bruce 9/5): scan by DEVICE GROUP, not the `Property`
attribute.** The Property attr is unreliable and splits real properties in two —
`Maple Run MHC-CUST` is ONE group of 143 live members carrying two Property values
(`Maple Run MHC` 38 + `Maple Run MHP` 105). **22 groups span more than one Property
value**, including outright typos (`Virgina Beach`, `Rush MHC`) and same-property
aliases (`PW2`/`Parkwood`, `Canada`/`Trans Canada`, `Coleman Village`±`MHC`). The
"165 properties" figure in §4 is therefore inflated; the real unit of rollout is the
**181 groups holding Gen2 members**. Group census cached in
`group_census.json` / `group_members.json`.

**Gate: Wave 1 acceptance first** — on those 251 devices' FOTA posts confirm `offset`
0 with `offsetSet` false exactly once, offset re-promotes on next water,
`flowDirection` unchanged, `deltaMeterVal` in (-1, 0]. Also finish the **6 two-step
devices** (`allowTiFotaVer=365` once `fwVer` moves) before a whole group depends on
that mechanism.

| Sub-wave | Group | live | Class | Pipe / billing | Why |
|---|---|---|---|---|---|
| **2a** | **Shady Lane MHP-Cust** | 36 (15 left) | clean | 12 X 3/4 step +9%, 3 flat | Closes the discontinuity opened 9/5. **Its group lever is stale at `17028/341`** — move it to 17058/365, which is also why 18 units sat on 17028. Then delete the 21 device pins per the site-pin-cleanup rule |
| **2b** | **Holly Tree MHP** | 76 | clean | X 3/4 x76 uniform, all step +9% | Cleanest pilot available: **zero** not-metering, so any failure is attributable. 23 pins to clean |
| **2c** | **The Oaks MHC** | 41 | **wedge + self-heal** | P 3/4 x32 = PVC, **no billing step** | The important one. First property-scale wedge/self-heal test on 17058, with **no simultaneous L-factor variable**. 3 pins, zero not-metering |
| **2d** | **Sara Drive MHP** | 39 | two-step 362/363 | P 3/4 x27 = PVC, **no billing step** | Replaces the invalid "Maple Run MHC" pick. 4 pins, zero not-metering, and PVC again isolates mechanism risk from billing |

Both risky-mechanism pilots (2c wedge, 2d two-step) are **PVC and billing-neutral**
by design — if numbers move there it is the mechanism, not the tables.

**Sequencing:** 2a + 2b together (clean class, low risk). Then 2c and 2d once those
read green.

**Explicitly NOT pilots:** `Maple Run MHC-CUST` (143 live, 128 two-step) is the
two-step **bulk** for Wave 5. `Oaklawn Park HOA - Cust` (167) and `Kingsbrook MHC`
(144) are the wedge bulk. `La Comunidad MHC-CUST` (145) is 127/145 device-pinned.

**Method per group:** set the **group** lever (SERVER_SCOPE) -> verify uptake on
check-in -> 48 h watch -> propose member pin deletions. Always enumerate the cohort
from GROUP membership.

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

### Wave 2 validation ramp (added 9/9, Bruce's design) — bench first, then 1-2-4 per group

**Target rev = parameter** (`TARGET_ST / TARGET_TI`), set the day the ramp starts; Bruce
expects it may still move. Same target for bench and field.

**Step 1 — bench matrix, 6 units minimum per starting pair** (24 unit-runs): 362/209,
16131/296, 16185/314, 17037/344 -> target, both attributes set together; fault injection
(bogus `gen2fw` + real `allowTiFotaVer`) on >= 2 of the 362 units. Spec:
`fw-wave2-crossing-regression-prompt.md`. Bench verdict per pair gates step 2.

**Step 2 — field ramp, per group: 1 device day 1, 2 on day 2, 4 on day 3** (7 per group,
28 total), by DEVICE PIN, both attributes in one write. Day 1 = best-signal unit; day 2 =
median; day 3 = two median + the two weakest-signal eligible units, so the download-failure
path is exercised in the field too. Eligibility: Metering, seen < 30 h, TI alive, crash 0,
no non-transient TI outage in 90 d, No Water false, on the group's dominant starting pair.
Picks (from the 9/9 sweep, `wave2_ramp_picks.csv`; re-check state on the morning of each day):

| Group (start pair) | Day 1 | Day 2 | Day 3 |
|---|---|---|---|
| 2a Shady Lane (17037/344) | 152 Shady '6953 (-108) | 148 Shady '6029, 29 Maple '6938 (-111) | 75 Shady '3901 (-115), 15 Maple '1115, 144 Shady '8777, 5013 Spruce '9098 (-118) |
| 2b Holly Tree (16185/314) | lot 64 '6069 (-101) | lot 58 '1388, lot 53 '4379 (-111) | lot 69 '2199, lot 55 '2382 (-111), lot 63 '8688 (-119), lot 37 '6657 (-120) |
| 2c The Oaks (16131/296) | lot 36 '3700 (-90) | lot 31 '6630 (-100), lot 32 '2358 (-101) | lot 33 '0143 (-99), lot 16 '9228 (-101), lot 26 '1658 (-113), 11 Oaks '2127 (-114) |
| 2d Sara Drive (362/209) | lot 1008 '1133 (-97) | lot 1040 '0617, lot 1010 '9130 (-110) | lot 1038 '3042, lot 1014 '2283 (-111), lot 1027 '2200 (-121), lot 1029 '0855 (-123) |

**Gate to advance a day (per group):** every prior-day device checked in on the target
pair; ST-first ordering on its posts; fwVerTi 0 did not persist past its second session;
`deltaMeterVal` in (-1, 0]; `flowDirection` unchanged; `bCrashCount` unchanged; still
Metering (or Calibrating < 24 h). One miss = hold that group, autopsy before continuing.

**Gate to the group lever (day 4+):** all 7 pass, then set the group lever and delete the
member pins per the site-pin-cleanup rule (Bruce's OK on the list). Excluded from the
lever until hand-rolled: 2a 5019 Spruce / 5027 Spruce / 58 Shady / 66 Shady; 2b lot 27
(chronic TI looper) and lot 72 (crash 9); 2c 11 Laurel (dark); 2d lots 1037, 1020, 1003,
1019 (long dead) and 1043 / 1016 (crash-prone) — 1043/1016 go in a watched hand-roll.

**Two-step question:** if bench run A shows ST-first on all 6 and the fault-injection
case does not brick, 2d and the 898-device 362/363 estate go both-attributes-at-once and
the "TWO-STEP strictly" rule above is retired. Otherwise keep two-step with the TI
attribute set in the same session the ST image lands, not the next day.

### Bench FOTA matrix — DONE 9/9 (see `fw-matrix-results-0909.md`)

13 starting pairs x 6 units = 84 crossings to 17066/372, group lever, both attributes in one
write: **ST-first 84/84, 0 TI bricks, 0 crashes on a crossing.** Covers every pair with >= 25
field-group devices (~94% of installed Gen2). Wave 2 pairs (17037/344, 16185/314, 362/209,
16131/296) all clean.

**TWO-STEP RULE RETIRED (9/9).** 362/209 and 363/219 crossed 6/6 each with `gen2fw` and
`allowTiFotaVer` written together; plus 4/5 in Wave 1 and 69/69 at Holly Tree (362->16185).
Mechanism verified on tag v363: ST FOTA runs first and skips TI FOTA in any session where an
ST image flashed. The §Wave 5 "TWO-STEP strictly" text above is superseded: set both attrs
at once. Residual untested path: ST download failure on the old ST falling through to its own
TI FOTA — not observed in 81 crossings; keep an eye on `tifota_config_err` in the 362/363 wave.

**Field timing expectation from the bench:** a property lands its ST images spread over one
check-in interval after the lever (no retries), TI follows in the boot session 2–4 min later;
pre-v304 TIs show the boot-flag-20 self-heal reboot on every unit — normal, not a fault.

### Roll-day procedure (Bruce 9/9 evening) — device pins + hourly check-in, agent-managed

Per device, ONE shared-scope write: `gen2fw=TARGET_ST`, `allowTiFotaVer=TARGET_TI`,
`checkInPeriod=60`, `radioOveruseMax=15`. Written with the lever, never earlier (cap-4 firmware:
362/363, 15xxx, 16022 burns one of four activations per pre-lever session). Landing still follows
the daily cadence (up to 24 h); after first contact the TI lands in 2-4 min and the verdict is
visible within ~2 h instead of the next day.

Agent `field_roll.py` (scratchpad; state/ledger/results alongside) watches each device: ST-first,
TI back, >=2 check-ins after ST, state Metering/Calibrating, crash flat -> PASS -> deletes the two
cadence pins immediately. Fallback deletes them 8 h after landing (30 h after the write if never
landed) regardless, and flags the device. Flags: TI not back after 2 check-ins, crash increment,
TI Silent / Not Metering after TI landed, dark 30 h pre-landing / 3.5 h post, no uptake 30 h.
FW pins stay until the group lever moves (site-pin-cleanup rule). Devices enter the agent only via
`field_roll_batch_*.json` files created after Bruce's explicit go per batch; `--dry-run` for
rehearsal; `--report` for the per-group table. Every write/delete audited in tb_write_log.txt.
**A forgotten checkInPeriod=60 pin = 24 sessions/day forever and a daily overuse blackout from
~10 h into each UTC day — the ledger + fallback exist for exactly that.**
Dry run 9/9 19:56 on the Wave 2 day-1 picks: loads, tracks, would-write correct — no writes made.

**9/12 addendum — `pulse=9` is part of the roll pin set.** Every field group carries a group attr `pulse=13`
(set at group creation since Dec 2024), which the ST pushes to the TI each session (`hci.c:237`), so the TI's
9 default never applies in the field and deleting the attr does not revert it (Rev 17065 backup mirror +
TI FRAM keep the last value until a mag reset). Per Bruce 9/12 ("set pulse to 9 - the roll is a la carte")
the device pin set is now `gen2fw, allowTiFotaVer, checkInPeriod=60, radioOveruseMax=15, recordNoneventFlow=true, pulse=9`.
`pulse` stays with the FW pins (not deleted at PASS). Never write `pulse=0` (parser pushes 0 pulses). `tiPulse`
reads 0 on TI 390-399 by design, so 391 cannot confirm the pulse count from TB. Fleet-wide group `pulse=9`
pending Bruce's decision.

**9/13 addendum — reboot-loop rule (Bruce).** 17078 with an unstable TI enters a software-reset loop every ~4 min
(17036 wedge heal x RAM blocklist; details in fw-17078-field-flags-0912.md). The field agent now watches every roster
device, passed or not: >=4 software-reset boots within 20 min => FLAG and a single verified, audited `gen2fw` write to
the fix build (`--loop-fix-st`, currently 17086). Deployment is HELD pending 17084/17086 bench results; resume order =
thin-cohort ramp (344/314/296/209/260, first 254 crossing) -> Wave 2 levers + pin cleanup -> re-pin day-1 units.
Gate is regression, not recovery: metering_regression.py (offset, direction, daily gal vs pre-roll median).

### 9/14 — 17088/391 cleared, roll resumed (Bruce: "17088/391 are cleared to continue fleet roll", "Fine with A-C")

17088/391 field-verified before the clear: ST-only crossing on 6 units (Aurora 172 / 155-OLD / 193,
VB 39, VB 109, VB 159) — bank-swap boot flag only, no TI FOTA, no re-anchor, no loop. VB 39's silent
TI came back on 391 at the crossing (first field TI recovery on 17088). 17080/17086 loop fixes hold.

**Step A — agent retargeted** to `--target-st 17088 --target-ti 391 --loop-fix-st 17088`, poll 60 s.
Devices at verdict `pass`/`flagged` are skipped by all roll logic (only the all-roster reboot-loop
detector runs on them), so retargeting does not re-roll the 243 already passed.

**Step B — roster to 17088 (241 devices, done 11:05-11:08, 241/241 verified).** One shared write per
device, `gen2fw` 17078 -> 17088, `allowTiFotaVer` left at 391. **No cadence pins** — they land on the
daily session over ~24 h and stay quiet. Rationale: every 17078 unit is still exposed to the reboot
loop the moment its TI hiccups (VB 60 showed that happens on units that looked fine). List in
`stepB_preview.csv`, results in `stepB_results.csv`, audit in `tb_write_log.txt`.
Excluded: Whispering Pines 317, Carolina Springs CSP4 ('5542) and CSP123 ('5655) — all three sit on
`17080/392`, and Step B deliberately did not overwrite them; plus the 16 already on 17088/391.

**Correction (9/14, my error).** I first told Bruce the two Carolina Springs units "were not in my
write log". That is false — `field_roll.py` rolled **both** to 17078/391 on 9/11 18:58 as ordinary
W1-gap roster devices (log lines 179-180; audit 1705-1706), and both took `pulse=9` in the 9/12
roster write. I had grepped the audit for 9/13-9/14 only and missed the 9/11 entries. What is true
is that the later move to `17080/392` is **not** any write of mine: no gen2fw/allowTiFotaVer write to
either serial appears in `tb_write_log.txt` after 9/11, so it came from outside this session.
Their real status differs and neither is a clean test unit:
- **CSP123 '5655** — passed the roll 9/12 09:03 on 17078/391, now **running** 17080/392, Failed Cal, rsrp -118.
- **CSP4 '5542** — never took 17078 at all: still **running 17037/344**, Calibrating, rsrp **-125**,
  last post 9/12 07:44 (~51 h dark), already flagged "no uptake 30 h" + fallback pin removal.
  At -125 this is a fringe-signal casualty, not a firmware question.

**Resolved 9/14 (Bruce: "please write 17088/391 to both").** Both Carolina Springs units written to
`gen2fw=17088, allowTiFotaVer=391`, verified, audited — no cadence pins, since both are fringe-signal
and an hourly pin would burn the radio-overuse budget. Only Whispering Pines 317 remains on 17080/392
as a test unit. Both were appended to `stepB_results.csv` / `stepB_baseline.json` so the Step B
tracker follows them (243 tracked), because `field_roll.py` skips their `pass`/`flagged` verdicts.
CSP123 should land on its next daily session; CSP4 may never land at -125 and stays a go-back
candidate rather than a firmware item.
Because these devices carry verdict `pass`, `field_roll.py` does not track them: `stepB_track.py`
(baseline `stepB_baseline.json`, log `stepB_track_log.txt`, every 30 min) reports landings, crash
increments, state regressions and >=4-boot flag-20 signatures until all 241 have landed.

**Step B2 — the 4 Wave 2 day-1 units** (Shady 152, Holly Tree 64, Oaks 36, Sara 1008) were on
17066/372; `372 -> 391` is a TI crossing, so they were requeued in `field_roll_state.json`
(verdict `pass` -> `queued`, landing fields cleared) and re-rolled by the agent with the full pin
set. State backup: `field_roll_state.json.bak-0914-stepB`.

**Step C — Wave 2 Day 3 (16 devices, pins written 11:09, 16/16 verified).** All 16 re-checked on the
morning of the roll: Metering, crash 0, TI alive, seen < 30 h (Oaks 26 marginal at 29.8 h). Full pin
set at 17088/391. Batch `field_roll_batch_day3.json` + `.GO`. Day 3 deliberately includes the
weakest-signal eligible units (Sara 1029 -122, Holly Tree 37 -120, Shady 144 -118) so the field
download-failure path is exercised. Per-group gate as in the Wave 2 ramp section, **plus** the
register-derived gal/day check for two days after landing.

**Billing quarantine.** The Holly Tree 53 phantom (offset -3072 -> -5558 at the 16185/314 crossing,
110 -> 427/485 gal/d) **self-corrected on 9/14**: offset back to -3089, tnormAvg 130 ps, no attribute
touched — 17078 re-anchored on its own within two days. ~775 gal of phantom to credit on lot 53 for
9/12-9/13. Holly Tree 64's "register stopped" was **no water drawn** (weekend), confirmed by the
tofNorm trace: flow events returned 9/13 ~16:00 and the register followed. Both closed.
The four Holly Tree Day 3 units therefore carry a **two-day billing quarantine flag** on the same
16185/314 crossing; bench ask I (offset-neutral crossing) stays open.

**Step D (not started, needs a go):** per-group lever + member pin cleanup once a group's 7 ramp
units pass; then the untouched thin cohorts — 16022/260 (350 devices) and 15090/254 (168), two
picks each before any lever.

### 9/14 — check-in cadence measured; 13 of 21 "flagged" devices were never faulty

Bruce: *"We have devices that can miss up to 5-6 consecutive days."* Measured (`gap_census.py`,
90 roster devices x 30 d, 2,530 scheduled gaps):

| metric | value |
|---|---|
| gap p50 / p90 / p95 / p99 | 23.8 / 25.9 / 26.5 / 50.1 h |
| longest gap observed | 191 h (8 d) |
| gaps <= 30 h | 97.0% |
| **devices with >= one gap > 48 h in 30 d** | **29%** |
| per-device max gap p50 / p75 / p90 | 26.8 / 48.8 / 68.4 h |

Long gaps are rare per gap but common per device. **A missed session is not a fault, and recency is
not a health signal.** Roll-pick eligibility gates on health only (Metering/Calibrating, crash 0,
TI alive); `roll_eligibility.likely_gone()` now needs a **30-day** window and calls a device gone
only past `max(72 h, 1.25 x its own worst observed gap)`.

**Retraction.** My 11:30 claim that two Day 3 picks (The Oaks 26, Holly Tree 63) were "already dark
when pinned" was wrong, built on a 14-day window. Oaks 26's own 30-day history holds 48 h and 72 h
gaps, so 30 h of silence is ordinary for it; Holly Tree 63 was 2 h past its 30-day max. Both are
valid picks and Day 3 is 4 of 4 per group. Annotations corrected.

**Re-judging the 21 flagged roster devices** against each device's own 30-day history:

- **13 were mis-flagged on recency alone** and are healthy — most have since checked in (VB 243-OLD,
  Grand Valley 2, Ponderosa 50 + 48, Carolina Springs CSP98, Parkview 47, VB 107, Oaklawn 3405SOC all
  posted within ~5 h). Singing Pines 2 (40 h), Maple Run 110 (29 h), Noble 544 (33 h), Minot Gardens
  (98 h vs its own 195 h max) and Carolina Springs CSP4 (52 h vs its own 191 h max) are all inside
  their normal range. Their `flagged` verdict is stale bookkeeping, not a fault; Step B moved them to
  17088 and `stepB_track.py` follows them, so no re-roll is needed.
- **2 are genuinely off the air:** Aurora 258 (148.7 h vs own 26.7 h max) and Crystal Acres 13
  (99 h vs own 33.2 h max, `VddAdc` 2696 mV = battery, not firmware).
- **6 carry real symptoms** and stand unchanged, all TI-side: Crystal Acres 29, Highlands 9, VB 159,
  Ontario 91, VB 60, VB 117.

The agent's 30 h "no uptake" fallback stays as designed — it strips only *cadence* pins so a
forgotten `checkInPeriod=60` cannot burn the radio budget; FW pins survive and the device still
lands on its own schedule. Only its FLAG wording overstated the case.

**Agent patched to match (9/14 13:10, `field_roll.py.bak-0914-cadence`).** The flat 30 h "dark" flag
had a real functional cost: a flagged device can never satisfy the PASS condition (`not r["flags"]`),
so a merely slow Day-3 pick would have blocked its group's advance to the lever permanently.

- Pre-landing "dark" / "no uptake" now compare against the device's own 30-day worst gap x1.25,
  floored at 72 h, computed once per device and cached in state (`dark_limit`).
- The post-landing 3.5 h rule now applies **only while `checkInPeriod=60` is still pinned**. After the
  cadence pins come off, the device is back on its daily schedule and falls under the same per-device
  limit.
- The cadence-pin fallback itself is **unchanged** (8 h after landing / 30 h after the write): a
  forgotten `checkInPeriod=60` must never outlive its window. What changed is that it no longer
  condemns the device — a unit still inside its own cadence keeps `rolling` and can PASS when it lands.

**Stale flags cleared:** 11 recency-only devices returned to `rolling`; Singing Pines 2 (rsrp -130)
and Maple Run 110 (rsrp -122) had ST+TI landed on target with crash 0 and were blocked only by the
post-landing 3.5 h rule — reclassified as UPLOAD STRUGGLE notes, which by design do not block PASS.
Verdicts now: 239 pass, 33 rolling, **8 flagged** (2 off-air, 6 real TI symptoms) — was 21.

### 9/14 evening — two more instrument fixes, no fleet change

**"No uptake" measured my pin clock, not the device.** After the target moved to 17088, 13 rolling
devices still carried `pins_written` from the 9/11 17078 pin, so the elapsed-time test fired the
moment it passed their cadence limit even though they had simply not connected since Step B. Their
roll-tracking fields were reset to their real 17088 pin time (Step B 11:07-11:36, Noble 544 to its
9/13 11:58 pin), and the rule now requires **>= 2 check-ins since the pin** before it can fire —
"no uptake" must mean the device connected and did not take the image, not that it has been quiet.
Backup: `field_roll_state.json.bak-0914-uptake`.

**Upload-struggle counters are not comparable across uptimes.** 14 of 16 Day 3 picks tripped the
UPLOAD STRUGGLE threshold versus 4% of the rolled roster — which looked alarming and was an artifact.
`fsm_fail_SEND_DATA` / `missedUploadCnt` reset on ST reboot: the picks had ~710 h of uptime on their
pre-roll firmware, the rolled roster ~56 h since its crossing. **Control: 40 unrolled siblings in the
same four groups hit the same threshold 72% of the time**, at the same per-hour rate (p50 0.04 vs
0.08). So Day 3 is normal for its cohort. The note is now evaluated **only after the ST lands**, when
the crossing reboot has zeroed the counters and they describe the new firmware; 15 pre-roll notes
were removed. `meterVal` and `tofA` are present on all 16 picks, so the gal/day regression gate is
evaluable regardless.

Agent stable at 18:53: **239 pass, 33 rolling, 8 flagged** (2 off-air, 6 real TI symptoms).

### 9/16 — tnorm / offset / direction audit of the 97 Metering devices on 17088/391 (Bruce's method)

Method (per Bruce: "cluster tofNorm, histogram, look at how the FW handles offset and direction"): the
recorded `tofNorm` is `deltaTOF += current_offset()` — offset-corrected and SIGNED (rectification only
happens downstream in `flowOfTof`), so a correct offset puts the quiet cluster at 0. Clustering reproduces
`offset_tracker.c`: 128 ps bins, cluster = top bin ±3, lock mass ≥ 32, **quiet = the LARGEST cluster**
(Bruce 9/16). Direction = sign of draws beyond 1536 ps of the quiet zero (NOFLIP positive, FLIP negative).
Confidence graded: HIGH = top cluster ≥ 2x runner-up and ≥ 500 records; sparse event-only records can make
a draw plateau the largest cluster, so MED/LOW are shown, not judged. `tools/tnorm_cluster_audit.py`,
`tnorm-17088-cluster-0916.csv`, `tnorm-17088-offset-dir-0916.csv`.

**RETRACTED (my 9/16 midday claim).** I first clustered on the mode NEAREST ZERO. That is circular when
the offset itself is wrong: on Rustic 44 it took the no-flow baseline sitting at +3959 ps for an 18,000-
sample draw and called the device's FLIPPED direction backwards. Bruce caught it from the chart. With the
largest cluster as quiet, **direction disagreements are 0 of 14** high-confidence devices; the three Rustic
`waterFlowDir` attrs are CORRECT. What those units have is a **stuck offset**, below.

**Findings**
- **Offset — post-crossing quick-lock error, then frozen.** 13 of 28 high-confidence devices show their
  quiet cluster > 768 ps from zero in the post window (Rustic 44 +3985, Rustic 36 −5628, Aurora 116-D
  −9345, Shady 76 +7486 …). Mechanism, from source: the first stable fast cluster after the TI flash
  (mass ≥ 32 = ~32 s of TI settling samples, the design-F2 failure named in the tracker header) sets the
  applied zero; Rev 17031 then LOCKS it for the 24 h qualification; the Rev 17066 re-anchor can only move
  it within one gate width (±768 ps), so a 4–9 ns miss cannot be corrected until the **24 h commit**
  (shadow mass ≥ 5000 + 24 h). Status `tnormAvg` shows 10 of the 13 back near zero after the commit;
  Rustic 44 (+3862) and 36 (−5091) have not posted since 9/15 07:xx so their commit is not yet visible;
  Aurora 89 −1286 still open. Holly Tree 53 (9/12–9/14, −5558 → −3089) was the same mechanism. **This
  answers bench ask I:** the crossing does not corrupt the offset permanently; it mis-locks for ~1–2 days.
  Billing exposure per crossing = up to 2 days of phantom (zero locked flow-ward) or under-read (zero
  locked anti-flow, e.g. Rustic 44 147 → 3 gal/d).
- **Direction UNKNOWN after landing = the Rev 16190 one-shot cleanup, not the TI crossing.** init.c wipes
  offset AND direction on the first boot of any build ≥ 16190. 12 of 18 devices arriving from 362 /
  16131 / 16185 went UNKNOWN at landing vs 1 of 43 from newer builds. Re-acquisition needs the 24 h
  commit plus a 24 h draw window (≥ 3 runs, peak ≥ 1536 ps, 2:1 majority): 17078 precedent p50 49 h,
  p90 74 h, 5 low-draw units still UNKNOWN at ~100 h. While UNKNOWN `flowOfTof` takes |tofNorm| — every
  draw bills positive. 10 UNKNOWN devices show their true direction plainly in the draw tail (list in CSV).
- **Noise: quieter on 17088.** Gated robust sd (quiet samples inside ±768 ps), 44 devices with ≥ 500
  records both sides: p50 137 → 94 ps, p90 393 → 196 ps, ratio p50 0.69; 7 noisier, 22 quieter.
  Confound noted: `recordNoneventFlow` pins during the roll add quiet samples to the post window.

**9/16 evening — method converged (v3), supersedes the tables above.** Two record-derived zeros, arbitrated
by the firmware's own whole-day statistic:
- *Largest cluster* (FW top-bin rule) — right when a mis-offset device records continuously (its baseline
  is read as reverse flow, so there are no event edges: Rustic 44 at +3985, Rustic 36 at −5628).
- *Edge zero* (Bruce: "the true no-flow reveals itself at the leading or trailing edge of an event") —
  first/last 2 records of each event burst, 60 s gaps. Right when the largest cluster is a long draw
  plateau (Ontario 32 at −14461 with 27 events). Exact-zero samples are dropped first: they are the TI's
  all-zero error frames, which the tracker itself skips (`otk_sample: tofd_ps == 0 -> return`).
- *Arbiter* = status `tnormAvg` since landing: the mean over ALL 1 Hz samples including the quiet seconds
  that never become records, so on an idle-most-of-the-day meter it sits on the true quiet zero. Pick the
  candidate within 1500 ps of it (18 devices resolved to the largest cluster, 34 to the edges, 1 ambiguous).
Result on 52 judged field devices: **offset residual p50 41 ps, p90 256 ps; 40 within one 128 ps bin, 48
inside the 768 ps gate, 4 beyond** — Rustic 36 (−5628), Rustic 44 (+3985), Aurora 89 (−1155), Backwater
45 (−814, offset still wandering). **Direction: 29 agree, 1 disagree** — Rustic 46 reports FLIPPED via the
`waterFlowDir=2` attribute while 4,698 positive vs 828 negative draws say NOT FLIPPED (gal/d 78 → 0/21;
the one attribute worth re-checking). **17 UNKNOWN devices show their true direction in the draw tail**
(list in `tnorm-17088-final-0916.csv`). Noise at the quiet cluster: p50 146 → 96 ps, ratio 0.80.
Tools: `tools/tnorm_cluster_audit.py` (v4 clustering) + `tools/tnorm_cluster_arbitrate.py`.
