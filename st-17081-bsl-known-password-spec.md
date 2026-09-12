# ST 17081 — TI BSL unlock with the known password (344-era refusal fix)

Bruce 9/12 12:30: "So we have the necessary knowns to determine the correct password."

## Verified facts (9/12)
* MSP430 BSL password = the 32 bytes of the interrupt vector table 0xFFE0–0xFFFF of the resident image.
* Today's ST flow (ti_bsl.c, Rev 16017): erase_via_wrong_password() (two deliberately wrong passwords -> the BSL's auto mass erase resets the password to 32 x 0xFF) -> entry -> baud 57600 -> default password -> unlock. On 72385774 (TI 344) tiBslOkCnt has not moved since 9/10 while the 344 app keeps running: the auto-erase does not fire on that BSL, so the default password is refused every time (tifota_bsl_passwd_err / unlock_err path).
* The password is NOT per-image. Extracted from the bucket containers (chunk @0xFFAC covers 0xFFE0–0xFFFF):
  * family A (314, 320, 324): 8659b059405af2594a5a4a5a4a5a4a5a38584a5a4a5a4a5a4a5a4a5a4a5a105a
  * family B (341, 344, 357, 368, 374, 387, 391, 392): 8659b059505af2595a5a5a5a5a5a5a5a38585a5a5a5a5a5a5a5a5a5a5a5a105a
  The linker keeps the ISR trampolines at fixed addresses, so the table only changed once (341). Reset vector 0x5A10 in both.
* Therefore the ST needs no download to know the resident password: INFO version >= 341 -> B, < 341 -> A, unknown (dead TI) -> try B then A.

## Change (ti_bsl.c bsl_init)
1. entry_sequence -> baud change (as today).
2. Send the KNOWN password for the resident family. ACK + COREMSG_SUCCESS -> unlocked, skip the erase entirely (FRAM needs no erase; the write overwrites).
3. PASSWD_ERR -> send the other family. Success -> unlocked.
4. Both refused -> today's fallback: erase_via_wrong_password() -> re-entry -> default password. (On an auto-erasing BSL the two failed known-password attempts in step 2–3 already performed the erase; the default password then succeeds as today. On a non-erasing BSL nothing is lost: it was refusing anyway.)
5. Counters: reuse tifota_bsl_passwd_err; add nothing (space: release 760 B free, lean 180 B — two 32-byte tables + logic ≈ 220 B; the lean image needs one print trimmed).

## Side effects to check
* Units where the erase trick works (all bench units) now unlock without erasing: the old app stays in FRAM until overwritten. Interrupted writes leave a mixed image — same exposure as today's post-erase partial write, and the ST already re-runs the leg.
* The password tables are firmware facts of the TI lineage; if a future TI build moves the trampolines, add family C. tools/pack_ti_fw.py should print the 32-byte table at pack time so the change is noticed.

## Proof plan
1. Rig '3063 (TI 392, family B): build 17081 lean, allowTiFotaVer 391 -> the leg must unlock on the first known-password try (log: "BSL unlocked" without the erase sequence), write, banner 391. Then back to 392. Proves the bytes and the BSL response path.
2. Field 72385774 (TI 344, family B, non-erasing BSL): gen2fw 17081, allowTiFotaVer 391 once -> tiBslOkCnt must move and the TI must banner 391. This is the only 344-era unit available; if it refuses the known password too, its BSL is locked differently (then: BSL version query on the bench with a 344-era spare).
3. A pre-341 unit (family A) when one appears in the roll: same check.

## As built (9/12 13:09) — commit e4fbc289 (+ lean-visibility follow-up), bucket 672132E5/G/17081
- bsl_open() = entry + 9600 + baud change to 57600; bsl_unlock(pw) = one password attempt (ACK + CORE SUCCESS). bsl_init: first = family of the resident (tiUartVer, else duneInfo.version; < 341 -> A, else B, unknown -> B), then the other family, then the 16017 fallback (erase_via_wrong_password + default password). Route logged as "BSL kpw" / "BSL opw" / "BSL ers" (BSL_LOG alias reaches the real DBG_PRINTF past ti_bsl.c's DUNE_LOG_QUIET, so it shows in the lean rig image). Two prints ("STFOTA … TEST", "pipesize") left the lean image for space.
- Sizes: release 112,064 B (576 free), lean 112,584 B (56 free).
- Rig proof (all three legs "BSL kpw", first try, passwd_err flat, one BSL pass each): 392->391 (B resident), 391->324 (B resident), 324->392 (A resident). Unlock-to-TI-up 13-14 s per leg.
- Not yet proven: a non-erasing BSL (72385774 class) accepting the known password — that is the field trial. Also open: tools/pack_ti_fw.py should print the 0xFFE0-0xFFFF table at pack time so a future linker change (family C) is noticed.

## Documentation basis (checked 9/12 13:40, SLAU550Q "MSP430 FRAM Devices Bootloader (BSL)")
- RX Password (0x11): "unlocks the BSL protected commands if the password matches the top 16 words in the BSL interrupt vector table (located between addresses 0xFFE0 and 0xFFFF)". "The BSL password is equal to the content of the interrupt vector table on the device." -> the 17081 tables are exactly what the BSL compares against.
- "When an incorrect password is given, a mass erase is initiated. For MSP430FR5xx and MSP430FR6xx devices, this means all code FRAM is erased but not information memory." "After a mass erase is performed, the password is always 0xFF for all bytes." -> the 16017 erase trick is a documented side effect, not a documented unlock method.
- Footnote to the BSL overview table: "Some devices can disable mass erase on incorrect password. See the device family user's guide." -> the erase-on-wrong-password is a disableable device feature; a unit with it disabled refuses the default password forever (the 72385774 signature). E2E carries several threads titled exactly this failure ("MSP430FR5969: BSL won't erase memory on failed password", "MSP430FR5994: Unable to Mass Erase with BSL", "MSP430FR5969: BSL mass erase not working"); their bodies are behind a bot check and were not read. A search snippet from E2E attributes the disable to writing 0xAAAA into both BSL Signature words (unverified here; the FR6047 family guide SLAU367 is the authority).
- Core response 0x05 = "BSL password error" (what bsl_unlock() counts in tifota_bsl_passwd_err).
Conclusion: the correct password is the primary, documented unlock; the wrong-password erase is a documented consequence that some devices can switch off. 17081 uses the primary path and keeps the erase as the fallback.

## Deployed-set lookup (9/12 14:20, Bruce: "just what's deployed in valid property groups that are part of the fleet FW upgrade")
From group_levers_0911.json (412 groups) + wave1_pins_0911.json, the resident TI versions in the roll's scope and their vector tables (Claude Data/ti_bsl_password_families_0912.json):

| family | versions | groups | table (first/last bytes) |
|---|---|---|---|
| A | 209 | 210 | 4e5abc5a … 5bfe5a |
| B | 219, 254, 256, 260, 296 | 94 | 1c5a8a5a … 5bcc5a |
| C | 314, 320, 325 | 28 | 8659b059405a … 5a105a (17081's "A") |
| D | 341 … 392 | 57 (+ wave-1 368/372/374) | 8659b059505a … 5a105a (17081's "B") |

17081 as built covers C and D only. The two largest cohorts (209 on 210 groups; 219–296 on 94) are NOT covered: on them 17081 tries D then C (two forgiven/erasing strikes) and falls through to the 16017 erase trick — today's behaviour, no regression, no gain. Caveat: the census holds lever TARGETS, not measured residents; a device that never took its lever may run something older (v180-era per the DTHRES history). A telemetry sweep of fwVerTi across the 412 groups would settle the true resident set.

Proposed 17082: four tables + map (v<=209 A; 210–313 B; 314–340 C; >=341 D; unknown: D, C, B, A). Cost ≈ +64 B tables + ~40 B map: release fits (576 free); lean needs ~60 B more trimmed. Rig cannot prove A/B directly unless a 209/296 image is flashed to the rig TI (they exist in the bucket; a 209 leg on the rig is a legitimate test: flash 209, then unlock it with table A to go back to 392).
