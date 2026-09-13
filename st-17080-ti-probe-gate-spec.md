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

## DEFECT 9/12 23:09 (rig, 17085 under 11 gpm) — gate hold mid-session leaves the TI non-metering
Evidence: aggregates stopped at the event-end session start (agg 3554); INFO age reached 70/86 s during the session (the TI pauses its flush while the radio is up); the session's first status post shows sfProbeHeld 0 -> 1; after RADIO OFF the TI reports f10 (metering bit clear) and stays there for the rest of the night answering INFO every ~72 s (the ST's own request cadence) with no aggregates; tiBootCnt unchanged (4); register frozen under flow. 17078 (no gate) showed no post-session f10 in its overnight soak.
Code facts: SEND_DATA -> sf_flow_tof_get() (bg95.c:1543) is gated (spi_flash.c:1789/1838 -> sf_unstable). ti_transition() = disturbed-and-not-yet-heard only; it does not know about radio sessions. ti_monitor has bg95_radio_recent() grace; the gate does not. The probe waits 4 x 250 ms; a TI holding its flush for the radio did not answer in that window.
Open question: why tiBootCnt did not increment after ti_hold_in_reset() (a real RST-low release should PUC the MSP430) — either the hold was released without a full reset cycle, or the TI's bootCnt is not incremented on that reset path; the TI's f10 with the same boot count suggests the app was re-entered at a non-metering state rather than rebooted.
Fix options (decide 9/13 morning):
A. Session-aware gate: while the radio is on (or bg95_radio_recent), a gated op with an unknown TI DEFERS (counts sfGatedUnstable) instead of probing/holding. Cost: a SEND_DATA whose ring read is deferred uploads nothing that session (INFO is routinely 70+ s old at SEND_DATA), so A alone loses uploads — pair with B or C.
B. Keep the window fresh during sessions: while the radio is up and INFO age > 30 s, ti_request_info() (the TI answers requests within ~2 s when idle, per tonight's 72 s cadence). Small, no gate change; proves itself by sfProbe* staying 0 through sessions.
C. Widen the probe for a pausing TI: 4 x 250 ms -> up to 3 s when a radio session is active.
D. After ANY hold, force the release+config path at once (bsl_reset(false) + ti_update_and_start when the radio goes off) instead of relying on ti_monitor's INFO timeout, which never fires when INFO keeps flowing.
E. Watchdog for the silent-metering state: INFO alive with metering bit clear for > 5 min while the ST expects metering -> re-issue START/config; > 15 min -> bsl_reset + config. This also covers the earlier "TI-silent class".
Recommendation: B + D + E in 17086 (A only if B proves insufficient). Test: rig under flow through >= 20 event-end sessions with sfProbeHeld staying 0 and aggregates resuming within 60 s of every RADIO OFF; then the bench six for a night.
