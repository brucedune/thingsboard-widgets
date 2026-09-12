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
