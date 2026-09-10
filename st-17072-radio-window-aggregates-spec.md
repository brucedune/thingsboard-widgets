# ST Rev 17072 — keep the TI aggregates that arrive during a radio session

Status: APPROVED for the '3063 debug bench (Bruce 9/10 12:40-12:41); building. Author: Claude, 9/10/2026 12:30. Evidence: fw-17047-bugfix-handoff.md §1f/§1g.

## 1. Problem (verified on '3063, 17070/17071 link line)

Every radio session discards 100% of the aggregates the TI produces while the radio is on.

- main.c runs `ti_hci_loop()` — the ONLY drain of the USART3 ring (`tiuart_rx_poll` via ti_hci_impl.c:551) — inside `if (radio_get_powerstate() == RADIO_POWERSTATE_OFF)`. I2C-era design: the TI buffered until the master pulled.
- Since TI v305 (DUNE_UART_ONLY) and ST `TIUART_ONLY` (config.h:350) the TI PUSHES every frame (~25 B, ~1/s). The 512 B ring (lib/src/uart.c BUFFER_SIZE) fills after ~20 frames; the rest increments `bufferWasFull` and is gone.
- At RADIO OFF `ti_hci_drain()` (TIUART_ONLY branch) flushes the 512 B that did fit and resyncs the framer.
- measure.c accrues volume per aggregate (`volIncrement = flow/60`), so a lost aggregate is a lost second of water. Record timestamps are a synthetic per-aggregate counter re-synced at SYNC_TIME, so TB shows the loss as the "gap at a session".

Measured: 11:35 session rx frozen 44 s, REQ +32, ring-full 0→465, 48 aggregates lost; 11:41 +465; 12:11 +465. Fleet: every Gen2 on a TIUART_ONLY build with a v305+ TI, i.e. the current fleet. `tiUartFull` (17070 status key) measures it per device.

Billing exposure per session ≈ session length (40–60 s) of flow. Event-end sessions start after the water stops (no loss). Open-event hourly reports, recal/CAL_HOLD sessions, hold-KILL sessions and check-ins landing mid-flow lose ~1 min each: ≈1.5% of a long event, ~10 gal at this rig's 12 gpm. Also lost: the TI's re-commit burst after a ladder walk (§1g).

## 2. Objective

During a radio session the ST keeps parsing TI frames, keeps billing, keeps recording; records reach flash in order with correct timestamps once the radio is off. No flash writes during the session (bus arbitration unchanged). No change to the radio FSM.

## 3. Scope

In: main.c drain call, ti_hci_drain flush removal, a RAM record queue in measure.c/spi_flash.c, two status keys, config.h rev. Out: TI firmware (option (b) below rejected for now), ring size, hold/kill thresholds, offset retention (see §8).

## 4. Design

### 4.1 Drain during radio (main.c)
In the radio-ON branch (today only `wasRadioOn = true;`) add:
```
if (tiuart_fb_active()) tiuart_rx_poll();   /* Rev 17072: RX only — no ready byte, no queued writes */
```
`tiuart_rx_poll` is bounded by the ring (≤512 B) and calls `hci_process_data` per frame exactly as the post-session path does. NOT called: the 0xFF ready byte, `ti_trig_writes` service, ti_monitor, gate watchdog, capture scheduler — all stay radio-off only. `ti_trigger` keeps counting REQ edges and is zeroed by `ti_hci_drain()` at RADIO OFF as today.

### 4.2 Post-session flush removed (ti_hci_impl.c, TIUART_ONLY branch of ti_hci_drain)
Delete the `while (uart_readbyte_noblock(USART3) >= 0) {}` loop. Keep `ti_trigger = 0` and `tiuart_fb_resync()` (no-op when the framer is idle; still protects a frame cut by a real overrun).

### 4.3 RAM record queue (measure.c + spi_flash.c)
Today (measure.c:1285) a sample is written with `sf_flow_tof_buffer()` only when the radio is off or in CAL_HOLD; otherwise `bufGateRadio++` and the record is dropped (the register was already updated above). Replace the drop with an enqueue:
```
#define RADIO_Q_LEN 96                     /* 16 B each = 1,536 B RAM; ~1.5 min */
static flow_tof_t radioQ[RADIO_Q_LEN]; static uint8_t radioQn; static uint32_t radioQt0;
```
- enqueue: if `radioQn == 0` record `radioQt0 = tiTime`; if full, drop and `bg95_public.radioQDrops++`; else `radioQ[radioQn++] = sample`, `bg95_public.radioQueued++`.
- flush `meas_radio_queue_flush()`: called from main.c right after `ti_hci_drain()` in the `wasRadioOn` block (radio now OFF) and at CAL_HOLD entry. Writes the queued records through a new `sf_flow_tof_buffer_at(flow_tof_t*, uint32_t t0)` variant that stamps the page header(s) with `t0 + i*1000` instead of `tiTime` so the batch keeps its own second-by-second times; the live stream then continues from the current `tiTime`. (Header only when the page buffer is empty, as today; a batch spanning >16 records gets a header per page.)
- Ordering: the queue is flushed BEFORE the first post-session live sample is buffered (flush runs in the same main-loop pass as `ti_hci_drain`, before `ti_hci_loop`).
- SYNC_TIME inside the session moves `tiTime`; the batch header uses `radioQt0` captured before the sync, so pre-sync records keep pre-sync times (same as the fleet's behaviour today for records written before a session).
- The existing 17-slot page buffer's own radio gate (`sfRadioSkips`) stays as belt: with the queue upstream it is never hit during a session.

### 4.4 Telemetry
status_report.c: `radioQueued` (records saved by the queue, cumulative), `radioQDrops` (queue overflow). Existing `tiUartFull` should stop growing after 17072 — the fleet-wide proof.

### 4.5 Rev bump
config.h `DUNE_FIRMWARE_REV 17072` with the rationale comment.

## 5. Constraints and risks

- **Lean image size**: 17071 lean has 96 B free of 112,640; release has 1,248 B. 17072 adds ~400–700 B. Release fits. For the '3063 rig image the DEBUG-SPAN route is DEAD (handoff 9/8: bank 2 cannot be programmed through CubeProgrammer here), so the lean build must quiet one or two more modules under DUNE_LOG_QUIET (candidates by print count, keeping measure.c samples, the link line, cal hold and the >> RADIO state lines). Measure at build.
- Processing aggregates during a session interleaves `DBG_PRINTF` with AT traffic in the log (already happens with the link line; cosmetic).
- `hci_process_data` during radio also handles INFO and any other TI frame types. Captures (`adc_cap_t`) go through the same record path and are queued like samples (16 B each). No capture is scheduled during a session today, so exposure is nil.
- Watchdog: the drain is bounded (≤512 B ≈ 20 frames per pass). `TI_HCI_PASS_BUDGET_MS` untouched.
- I2C-era "EMI-suspect data during radio" rationale: UART frames are checksummed (`tiuart` framer rejects on checksum), so corrupted frames are dropped, not recorded.
- meas_hold_tick already ignores radio time (17068); aggregates arriving during radio simply refresh `lastAggEpoch` — no new kill path.
- 96-record queue = 1.5 min. A session longer than that (carrier survey, FOTA) overflows; `radioQDrops` counts it; the register is still right because totalization is upstream.

## 6. Success criteria ('3063 rig)

1. Link line through a session under flow: `rx` keeps climbing, `full` flat, `agg` advances ~16 per 16 s.
2. Records continuous across the session: no gap >3 s in TB except the SYNC_TIME step; the queued batch appears with its own times, in order.
3. Register delta == integrated records ±0.5% across a run that contains ≥1 mid-flow session (test: stop pump, wait for RADIO INIT, restart pump 10 s later — flow during the event-end session).
4. `tiUartFull` flat across ≥3 sessions; `radioQueued` ≈ session seconds; `radioQDrops` 0.
5. No new hold ENTER/KILL, no framer `bad` increments, `fe/ne/ore` unchanged.
6. Test scope = '3063 on the debug probe ONLY (Bruce 9/10 12:41: "not the bench pair", "just 3063"). '8549/'4423 stay at 17066/375; any later roll is a separate decision.

## 7. Option (b), rejected for now
TI-side flow control: ST clears the TI's `g_stReady` at RADIO INIT so aggregates stay in the TI's 1,024-packet FRAM buffer, re-arms at RADIO OFF, TI dumps the backlog. Needs a TI release plus an ST drain able to absorb ~60 frames in one burst (~1.5 KB > 512 B ring — would need 4.1 anyway). Keeps the ST FSM untouched but doubles the moving parts. Revisit only if 4.1 shows a concrete problem.

## 8. 17071(b) "retain offset across a TI recal" — NOT NEEDED (verified)
- TI FOTA / ti_monitor recovery: main.c (Rev 16123) sets `measState = MEAS_NOT_METERING` but RETAINS `meas.offset/offsetSet`; the 17068 gate is `measState != MEAS_METERING && !meas.offsetSet`, so billing continues with the retained offset and the fresh promotion overwrites it.
- TI self-recal (v349 deferred, v379 lobe fault): the ST changes nothing — measState and offset untouched; the TI ships no aggregates during the sweep (hold covers it), then metering resumes with the retained offset.
- Offset is wiped only by: fresh/PIN/BOR boot (init.c "PIN/fresh boot" — this is what an SWD flash under reset is), the one-shot cleanups V1–V3, `resetOffset`, `recalibrate` attr, and `meas_on_drive_change` (pulse/pipe change). The 9/10 11:02 unbilled window was the SWD PIN-reset fresh-install path with the pump running — a bench artifact. Field equivalent = magnet install with water running, where waiting for still water is the intended 17068 behaviour.
- Bench note: flash '3063 only with the water off (procedure already in place).

## 9. Build/verify plan
patch_17072.py (anchored edits) → `make DEBUG=0 OPT=-Os` (release, check ≤112,640) → lean or debug-span for '3063 → SWD flash with water off → run + forced mid-flow session → criteria §6 → upload release to prod bucket → roll to '8549/'4423 on Bruce's go (they also need 17069→17072 and TI 379).
