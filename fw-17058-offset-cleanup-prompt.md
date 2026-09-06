# Session prompt — ST Rev 17058: one-time fleet OFFSET cleanup

**For the bench/FW session.** Written 2026-09-05 by the fleet-ops session
(493a4abd). The design is settled and the code is already written, built and
parked as a patch — this session's job is to review it, land it on the branch
you are working on, and bench-verify it. Full rationale with fleet numbers is in
`fleet-rollout-plan-0905.md` §2b.

---

## 0. What and why, in short

The fleet FW rollout (ST 17056+ / TI v365) is blocked on one behavioural gap:
**a FOTA does not reset the flow offset — it deliberately preserves it.**

`main.c:318`, Rev 16123: *"RETAIN the applied offset/direction across TI FOTA and
ti_monitor recovery (user spec: wipe only on mag reset; normal operation keeps
them across ST/TI FOTA)."* On a TI cross, `offset_init()` clears only the RAM
clustering histogram; the applied value survives in `NVRG_OFFSET_ID` and keeps
correcting flow until a fresh promotion overwrites it.

So without an explicit cleanup, **4,958 installed devices would carry their
current offset straight through the campaign.**

**Bruce's decision (9/5): reset the offset fleet-wide, leave flow direction
alone** — *"the majority should be correct — we can always scan for potential
errors."*

**Why wipe offsets that mostly look fine.** They do look fine: only **4 of
5,433** installed devices sit at a rail (|offset| >= 16k); the bulk read a
plausible 1k-4k. The case is **provenance, not appearance** — every offset in
the fleet was clustered while the TI v180 DTHRES latch could substitute a frozen
dtof indefinitely (fixed in v357, see `project_ti_dthres_latch_2026_08_29`), so
a healthy-looking offset is not evidence of data learned from a healthy
measurement. The upgrade to v365 is the natural point to re-qualify them once.

---

## 1. Fastest path — the patch is already written and built

```
git apply "C:/Users/Bruce/AppData/Local/Temp/claude/C--Users-Bruce-Documents-GitHub/493a4abd-fbfa-44db-8ae0-9e2014ca77f7/scratchpad/rev17058-offset-cleanup.patch"
```

3 files, +46/-1: `Core/Inc/config.h` (rev bump + changelog),
`Core/Inc/main.h` (the marker), `Core/Src/init.c` (the cleanup block).

Built clean against 17057: **109,652 B, 2,988 B headroom, zero warnings**
(reference binary parked next to the patch as `DuneFW_L5_2_17058.bin`).

It was parked rather than committed specifically so it could not collide with
your L-factor / flash-bug work on `stuck-event-fix`. **If you have since taken
17058, renumber** — only `config.h` needs the change; the marker bit and the
`init.c` block are rev-independent.

---

## 2. The implementation (if you'd rather write it fresh)

Same one-shot done-bit pattern as the existing Rev 16128 (V1) and Rev 16190 (V2)
cleanups, so it fires exactly once per device on the upgrade and can never
degrade into wipe-on-every-FOTA.

**`Core/Inc/main.h`** — new marker after `..._V2` (bit 28; OPER occupies 16-25,
V1 is bit 26, V2 bit 27; the next cleanup after this claims bit 29):

```c
#define NVRG_SETTING_OFFSET_CLEANUP_V3 0x10000000
```

**`Core/Src/init.c`** — immediately after the existing V2 block:

```c
if (!(settings & NVRG_SETTING_OFFSET_CLEANUP_V3))
{
    DBG_PRINTF("ofs cleanup v3\r\n");

    HAL_RTCEx_BKUPWrite(&hrtc, NVRG_OFFSET_ID, 0);
    meas.offset = 0;
    meas.offsetSet = false;
    offset_init();

    settings |= NVRG_SETTING_OFFSET_CLEANUP_V3;
    HAL_RTCEx_BKUPWrite(&hrtc, NVRG_SETTINGS_ID, settings);
}
```

**The difference from V1/V2 is what is NOT there.** Both earlier blocks also did:

```c
HAL_RTCEx_BKUPWrite(&hrtc, NVRG_FLOW_DIR_ID, 0);   /* deliberately omitted */
flowDirection = FLOW_DIRECTION_UNKNOWN;            /* deliberately omitted */
```

Verified safe to omit: `offset_init()` (`analytics.c:77`) only calls
`otk_requalify()` — it does not touch `flowDirection`. That is why V1/V2 had to
set it as a separate statement.

---

## 3. Do NOT also wipe direction — two findings that settled it

1. **It would be a no-op on 1,930 of 5,433 installed devices (36%).**
   `measure.c:798-806` assigns `flowDirection = dynamicConfig.waterFlowDir` on
   *every sample* when the attr is non-zero. TB census 9/5: 1,022 devices carry
   `waterFlowDir=2` (FLIP), 908 carry `=1` (NOFLIP). A FW wipe is overwritten on
   the first sample after the config push. A real direction wipe would require
   deleting those 1,930 attributes as a separate TB campaign.

2. **UNKNOWN direction is the ABS-rectification path** (`measure.c:582-588`) —
   the phantom-usage route named in `config.h` Rev 17038. Re-qualification needs
   `FLOW_DIRECTION_DETECT_CNT = 50` (`config.h:357`) detections, so on a low-use
   lot the window is long, and during it a genuinely reversed install bills
   reverse flow as forward. Retaining direction keeps **zero** devices in that
   window. (740 already sit in UNKNOWN independently.)

---

## 4. Build + verify

```
make DEBUG=0 OPT=-Os -j8
```
(toolchain paths in memory `reference_st_build_recipe`; not on PATH)

- Image must stay **<= 112,640 B** (the real slot ceiling — the old
  "5 chunks / 102,360 B" rule is retracted, see
  `reference_st_fota_slot_ceiling`). 17058 measured 109,652 B / 2,988 B free.
- Zero warnings expected.

## 5. Bench acceptance

On the trio + '8538, currently 17055/v365:

1. Record `offset` on each unit before the roll.
2. Roll `gen2fw` to 17058. On the FOTA boot expect `ofs cleanup v3` once in the
   debug log, `offset` reported 0, and `offsetSet` false.
3. **Reboot again** and confirm the block does **not** fire a second time (the
   done-bit is the whole design).
4. Confirm `flowDirection` is unchanged on every unit — this is the specific
   thing that separates V3 from V1/V2.
5. Run water; confirm the offset re-promotes to a sane value and flow stays
   correctly signed throughout (no negative `flowRate` / `revGal` appearing on a
   unit that had none).
6. `deltaMeterVal` should stay in (-1, 0] across the FOTA reset as usual.

**Note for the pre-flight generally:** the four `lFactor=2225` attrs on the trio
and '8538 should be deleted when the bench moves to a rev >= 17056 so the
compiled table is what actually runs (Bruce's OK needed for the deletions).

---

## 6. How this interacts with what you are working on

- **L-factor optimization:** if you land a different 3/4" PEX-A constant than
  17056's 2.225, tell the fleet session — `fleet-rollout-plan-0905.md` §2 sizes
  the customer-facing change at ~+9% across 2,554 installed meters using that
  value, and the figure moves with it.
- **The flash/FIFO bug:** the fleet plan currently **holds rollout Waves 3-5**
  on it (§6 W0.3b). 17057's changelog records that on 17055, after every full
  drain `bytesToSend` re-grew to ~2.6x the records written and hit the ring size
  on two units (~90 dropped records/h), remainder always an exact 64 KB
  multiple. Rolling record-loss behaviour to ~5,000 devices before that is
  understood would re-create the "usage but no records" class the campaign is
  partly meant to end. **A verdict here unblocks the bulk waves.**

## 7. Follow-up this creates (not in scope for 17058)

Since Rev 17039 a wrong direction is visible rather than silent (negative
`flowRate`, non-zero `revGal`). Present evidence: **53 devices already report
non-zero `revGal`** — 27 FLIPPED, 24 NOT FLIPPED, 2 UNKNOWN — out of only ~232
devices new enough to report the key. That wants a proper scan as coverage grows.

One gap worth a cheap fix in a later rev: **`flowDirAlarm` exists in `meas` but
is not in the status report**, so attr-vs-learned disagreement cannot be detected
remotely today. Adding it would make the direction scan conclusive.
