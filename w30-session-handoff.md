# w30 Billing Review Dashboard — session handoff (2026-08-21)

Paste the block below as the first message of the new session.

---

## Continue work on Widget 30 (Billing Review Dashboard)

**Repo:** `C:\Users\Bruce\Documents\GitHub\Thingsboard_Widget_Dev`, branch **`w30`**
**Latest commit:** `0547c6c` — build stamp **`2026-08-20l batched array writes`**
**Read first:** `W30_SESSION_NOTES.md` in that repo — every detection rule and correction type is documented there with its named proving-case device. Memory files `billing-review-pipeline`, `tb-bulk-writes`, `tb-jwt-refresh` also apply.

### What w30 is
A ThingsBoard PE widget (Latest-values type, no datasource; all data via REST + JWT) that scans a property group for a billing period, flags data-integrity problems on `meterValUpdated`, and proposes + writes corrections. Detection functions are pure and live in a delimited section so they can lift into a future scheduled daily script.

### Deploy / verify loop (important)
1. Paste `widget30_billing_review.js` into the TB widget editor. Paste `widget30_template.html` too **only when the template changed** — the commit message says.
2. Save in the widget editor **and** save the dashboard.
3. Confirm the gray build stamp under "Select a device row…" matches the expected build. Several "it didn't work" reports were stale pastes — always check the stamp before debugging.
4. Local testing: regenerate `w30_harness_inline.html` (template + JS concatenated — the script is in the session history; never hand-edit the harness) and open it via the `tb-widget-static` launch config (port 8137). `window.__w30_detect` exposes the pure functions; `window.__w30_ui.stage(devs)` renders fake rows.
5. Device replays for regression sweeps are saved as `dev_<serial>_ts.json` in the repo folder (28 devices). Re-run the sweep after any detection change — every prior verdict should stay identical unless intentionally changed.

### Immediate next steps
1. **Verify the batched-write fix on Stafford Lot 290 (`72719182`).** Its phantom-strip proposal is large (hundreds of points) and previously failed: parallel per-point POSTs tripped TB's rate limiter and all writes 429'd. `0547c6c` batches 100 points per request. Accept the proposal, watch for the progress messages, then re-scan and confirm the corrected trace persisted.
2. **Stafford Lot 214 (`72389354`) is already corrected** — its approved −2,426 gal jump adjust was applied via REST and verified in TB. Just confirm the re-scan shows corrected usage (~3,400 gal) and that Set Status Flags clears its Billing Review.
3. Field-test the newest proposals on real devices: **PHANTOM STRIP** (Chickadee 927 `72386343` ≈ −8,734 gal; Parkwood 5192JUSTIN `75374593` ≈ −16,208 gal) and **FLASH BACKFILL** (Flower Mound Lot 22 `72391194` ≈ +7,681 gal; Lakeview Lot 16 `70262074` ≈ +126 gal).

### Known open items
- `DIR PHANTOM` flag label under-reports vs. the actual jump-adjust amount (label bins across span edges; the write is the accurate number). Tighten the label math.
- Batch size 100 is untested against a PE build that rejects array bodies — a per-point fallback exists; confirm which path Lot 290 takes.
- Not built: batch accept across devices, per-flag rescan after write, flag-clearing rules.
- Operational: leak escalations (Oakwood Apt 6/11/110), Parkwood service list (3124LINDA, 3398DONNA, 5192JUSTIN), 916-TOWHEE `72385113` is a 17037/344 FOTA candidate (fixed-gain compression).

### Working agreements from the last session
- **Every detected faux/lost-usage class must produce a plotted proposal** — the corrected trace is drawn and the operator accepts. Flag-only is reserved for cases where a proposal would guess at real water (LOW FLOW = real leaks, SHIFT without instrument evidence, unreverted DIR changes).
- Never auto-detect swap-ins/late starts — that's the manual **Backfill Start** button (operator-written data and residual registers poison any heuristic).
- Single-attribute override buttons write with no confirm; **Set Status Flags** (bulk) keeps its confirm.
- TB writes are upserts at the point's own timestamp — no deletes except Zero Span's range-delete.
- I need a fresh TB JWT to query devices (`copy(localStorage.getItem('jwt_token'))` in the TB tab's console, F12). Tokens last ~2.5 h; closing the browser does **not** rotate them — an explicit logout/login does.
- Commit each change to `w30` with the proving-case device named in the message, and bump `W30_BUILD`.
