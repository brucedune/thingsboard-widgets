# ST 17080 — SPI-flash gate: verify the TI by INFO, hold only when silent

Bruce 9/12 (after 17079):
* init boot — TI held in reset
* normal operation R/W — verify TI stable first; a recent packet is good enough
* TI unknown — hold reset during the flash operation
* "Verification can be info blob as well"

## What 17079 already does
1. Boot: ti_hold_in_reset() before sf_init and the register restore; released via bsl_reset(false) + config push.  (rule 1: done)
2. Normal: sf_unstable() = !ti_stable(); ti_stable() true when held, or heard and INFO < 60 s old.  (rule 2: done, INFO only)
3. Unknown: every gated entry point REFUSES (append -1, get 0, marker -> last verdict).  (rule 3: NOT done — this rev)

## Heartbeat as verified 9/12
* TI sends INFO unsolicited: boot ("start" banner + INFO), config success, and on every data flush once START DATA (0xA4) set — flush = buffer full (16 packets) or ST flush request (0x96). ST stamps lastInfoTime in lib/src/hci.c on every INFO.
* ST polls INFO (0xA3): install mode every 5 s, pre-metering radio FSM every 3 s. No poll in metering — relies on flush-borne INFO.
* ti_timed_out() = INFO older than 60 s; feeds ti_stable() and ti_monitor.

## 17080 change (spi_flash.c sf_unstable, ti_hci_impl.c)
```
sf_unstable():
  if ti_stable()            -> false (proceed)                     [held, or INFO < 60 s]
  if ti_transition_active() -> count sfGatedUnstable, true (defer)  [BSL / TI-FOTA leg / bsl_reset in progress]
  probe: up to 4 x { hci_request_info(); 250 ms ti_hci_loop+rx_poll }
  if INFO answered          -> ti_mark_heard (lastInfoTime fresh), count sfProbeOk, false (proceed)
  else                      -> ti_hold_in_reset(), count sfProbeHeld, false (proceed, bus is ours)
```
* Held-by-gate is released by ti_monitor's existing path (bsl_reset(false) + ti_update_and_start) on its next eligible tick; ti_monitor already treats a stale INFO as its trigger and is not skipped while held (only tiParked returns early). Result: a genuinely silent TI costs one re-cal — the same re-cal ti_monitor would have forced anyway — and the flash op is no longer lost.
* ti_transition_active(): true between bsl_reset/ti_fota entry and the banner/INFO, and while the 17078 config-miss loop runs. bsl_reset itself is synchronous and waits for INFO, so in practice this window is the TI-FOTA leg (~95–115 s decision→metering). A probe there would talk to a BSL or an unconfigured app: defer instead.
* The radio-window silence (post-session TI pause, open item) no longer needs a grace: the probe answers if the TI is alive but quiet.
* Status keys: sfProbeOk, sfProbeHeld (u16). Keep sfGatedUnstable (now = deferred-in-transition count).

## Cost / risk
* Probe when alive: one 0xA3 round trip (ms). When dead: ≤ 1 s then hold.
* Flash still refused only during a TI transition; all other paths proceed. Records only exist while the TI talks, so record loss is confined to the transition window (radio-queue flush measure.c:326, pre-event buffer 1278) — same as 17079.
* Code space: release 1,088 B free, lean 504 B free at 17079. Probe loop ≈ 150–250 B; may need one more debug print out of the lean build.

## Verification
1. Rig '3063 (pump off for SWD): flash lean 17080, normal metering → sfProbeOk/sfProbeHeld stay 0 (INFO fresh), records and hourly checkpoint unaffected.
2. Pull TI RST low externally / msp999 non-boot image on 72379322 → first flash op probes, holds, proceeds; ti_monitor releases ≤ 60 s later; register intact across the session; no ST reboot; breaker parks after 3 TI-FOTA attempts.
3. Radio session with flow: no probe during the session unless INFO > 60 s; event-end checkpoint lands.

## As built (9/12 10:35) — commit d9f7eab8, bucket 672132E5/G/17080
- Exactly the gate above. ti_probe_alive() has a re-entrancy guard: a flash op reached from inside a packet handler returns "alive" without probing (the packet that got us there was stamped first).
- ti_stable() uses lastTiPacketTime (any valid packet) with the 60 s window; ti_monitor keeps its own INFO-based timeout, unchanged.
- Settle points for tiTransition: ti_mark_heard (any packet/banner), end of ti_update_and_start, end of the bg95 TI-FOTA leg loop. bsl_reset is synchronous and waits for INFO, so an unheard TI after a failed reset becomes probe-able once the following config push finishes.
- Sizes: release 111,880 B (760 free), lean 112,460 B (180 free). One prototype added to main.h (ti_hold_in_reset) for spi_flash.c.
- Deferred: sf_process GC still defers on !ti_stable() without probing (not urgent work); 17081 idea = register checkpoint in BKUP so warm boots need neither flash nor a TI reset.
