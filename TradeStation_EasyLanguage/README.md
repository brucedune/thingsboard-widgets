# TradeStation EasyLanguage — LRC (Linear Regression / Trendline Convergence) project

## 2026-09-06 pivot: execution layer first (Bruce)
Daily TQQQ cluster research parked (see spec 3.B.3; sideways/aggregate ETF = poor test bed). Focus
moves to intraday directional trading and the buy/sell macro function.

### Macro order path (three files, import in this order)
1. `LRC_StrReplace_Function.txt` — Function, Return Type **String**, storage Simple.
2. `LRC_SendMacro_Function.txt` — Function, Return Type **Numeric**, storage Simple. Builds the
   command from a template, dry-run prints it, live mode calls `RunCommand`, audit log via FileAppend.
3. `LRC_MacroHarness_Strategy.txt` — Strategy. Fires one BUY (FireTest=1) or SELL (FireTest=-1) on
   the next real-time tick, latches, caps orders per day. Dry run by default.

Syntax verification (required, sim account): run the harness dry, copy the printed command from the
Print Log, paste it into the Command Line. Accepted = template is right. Rejected = edit the
`MacroTemplate` input. The default template is a best guess, not verified against TS help.

### Intraday bounce strategy (spec 3.D) — import order
1. `LRC_PairFanCluster_Function.txt` — Function, Return **Numeric**, Storage **Series**. Per-stream
   pair-fan support/resistance clusters, trend, line values, ATR. Called `of Data3/4/5`.
2. `LRC_Bounce_Strategy.txt` — Strategy. Needs LRC_PairFanCluster, LRC_SendMacro, LRC_StrReplace.

Chart layouts (same symbol on every stream; roles are literal DataN references in the code):

| Stream | Role | Backtest layout | Live layout |
|---|---|---|---|
| Data1 | execution bar, orders | 5 min | 15 sec |
| Data2 | bounce confirmation | 5 min (add the 5-min a second time) | 5 min |
| Data3 | trend + levels | 10 min | 10 min |
| Data4 | trend + levels | 30 min | 30 min |
| Data5 | trend + levels | 60 min | 60 min |

Insert Data2..Data5 via Data > Add Symbol (or Insert Symbol), same symbol, the interval shown, and
set each added stream's Scaling to "No axis" / hidden so only Data1 candles show. Load as much
history as TS allows on Data1. Run TQQQ and SQQQ as two charts. ExecMode 0 for backtests; ExecMode
1 + DryRun for the shadow macro path (strategy automation stays OFF).

Range scalping mode (v0.2, 9/9): on when `AllowRangeMode` is true. Fires only when the trend gate
is not met, no trend stream is down, and a support cluster and a resistance cluster bracket price
with a gap of at least `RangeMinATR` x ATR and `RangeMinPts`. Confirmation is on Data1 bars, so it
is meaningful on the live 15-sec layout; on the 5-min backtest layout it confirms on 5-min bars.
Whole position exits at the resistance cluster (signal LRC_RT). Set `AllowRangeMode` false to test
the trend bounce alone.

Swing layout (both configurations kept, Bruce 9/9): Data1 = 30 or 60 min, Data2 = Daily,
Data3 = Daily, Data4 = Weekly, Data5 = Weekly (or Daily twice + Weekly). Inputs: `FlatTime` 2400,
`EntryStart` 0, `LastEntry` 2400 so positions hold overnight; widen `ZoneMaxATR` and stops to
daily ATR scale. The daily-bar cluster magnet measured on 9/5-9/6 is the evidence for this layout.

First backtest checklist: Strategy Performance Report > Trades list. Every trade long; entries only
between EntryStart and LastEntry; no position held past FlatTime; LRC_T1 fills are half size;
LRC_Stop never fires above the entry-bar zone on the first bar. Export the trade list to CSV and
drop it in this folder.

### Python analysis tooling (from one indicator export, no re-exports needed)
- `lrc_model.py` — exact port of the indicator geometry (validated 379/379 bars after warm-up).
- `lrc_validate.py <csv>` — diff the port against a TS export.
- `lrc_sweep.py <csv> <out.csv>` — parameter sweep + ranked cells. Reports: `sweep_tqqq_report.txt`.
- `analyze_lrc_csv.py <csv>` — original single-run report.

Files
- `SPEC-LRC-strategy.md` — the spec. Section 3.A/3.A.1 = Bruce's geometry (approved by his notes and chart). Section 3.B = open questions. Section 3.C = Claude's proposed entry logic, not yet approved.
- `LRC_Trendlines_Indicator.txt` — v0.1 indicator: swing points, trendline fan, projected intercepts. Geometry only.

## Import the indicator (TradeStation 10)
1. Open the TradeStation Development Environment (TSDev).
2. File > New > Indicator. Name it `LRC_Trendlines`.
3. Delete the template text, paste the whole contents of `LRC_Trendlines_Indicator.txt`.
4. Press F3 (Verify). Report any error line back with the message text.
5. In TSDev, Properties for the indicator: set Plot3 style to a point/dot, and put the study on the price pane (Same Axis as Data1).

## Verification chart
TQQQ, Daily, 2026-05-11 to 2026-09-04 (Bruce's hand-annotated reference).
- Insert the indicator. Expected: yellow lines through consecutive swing highs, red lines through consecutive swing lows, both extended right; the newest 4 per side kept. A dotted cyan horizontal ray at the price of each projected upper/lower intercept inside 40 bars ahead; a cyan label to the right of the last bar with the count, bars-ahead of the nearest intercept, and its price.
- `KeepOldLines` (default true) keeps every historical pair-line on the chart, matching the hand drawing. Set false to see only the newest `MaxPairs` per side, which is the set the intercept math uses. On long intraday charts, true can create hundreds of drawing objects.
- Time-window lower bound (9/6): three levers. Chart data range is the hard floor; `AnchorLookback` is a rolling window in bars for anchor selection (0 = all); `StartDate` (YYYYMMDD, 0 = off) is a fixed calendar floor, swing points before it are ignored so anchors and fans start there.
- v0.5 (Bruce's original construction, 9/5 late): `FanMode` 1 = anchored fans. Upper lines run from the highest swing high (within `AnchorLookback` bars, 0 = all) through every later swing high; a new higher high moves the anchor and starts a fresh fan. Lower lines are the inverse from the lowest swing low. `FanMode` 2 keeps the old consecutive-pair construction. Anchor changes are logged as `A` rows in the CSV. `ShowLines` defaults to true again so the fans can be checked against the hand drawing. The last-bar label now starts with `U<n>/L<n>` = active lines per side.
- v0.4 (Bruce's two requests, 9/5 evening): (A) every kept line is stepped forward to the current bar and the levels near price are clustered; Plot5 `LvlCluster` is the densest level, width = number of lines. (B) crossings are clustered over `ClusterBars` bars and `ClusterTolATR` ATR; clusters are labeled with their count (magenta number), singles keep the "x"; Plot6 `ConvClust` is the largest cluster's price. (C) set the `LogFile` input to a full path to export per-bar line values (L rows), crossings (X), level clusters (K) and convergence clusters (Q) as CSV for offline analysis. `MaxPairs` now goes to 50 (default 12).
- Convergence points (v0.3): every crossing of an upper and a lower line from the recent `MaxPairs` set is marked with a magenta "x" at the bar and price where it occurs, across the whole chart. Plot4 `ConvPt` carries the price of the first crossing on that bar (NoPlot otherwise) for alerts and the future strategy. The cyan rays and label still show intercepts projected ahead of the last bar.
- Compile history: v0.1 failed on `TL_New_BN` (not in this TS10 build) and warned on variables `d` and `l` (reserved words). v0.2 uses `TL_New` / `Text_New` with Date/Time and renamed the variables.
- Compare with the hand drawing: every circled bar should be a swing point; every hand line should have a matching drawn line.

Things that would be a defect: a circled bar with no line through it, lines through bars that are not swing points, a marker behind the current bar, the plots showing before the first two swings.

## Known items to verify in TradeStation (could not be checked here)
- `Text_New_BN` and `TL_New_BN` accepting bar numbers past the last bar (space-to-the-right region).
- Command-line macro syntax for `.BUY` / `.SELL` market orders (needed for the future live mode, see spec 3.9).

## Next steps
1. Bruce: compile, view on the TQQQ chart, answer spec section 3.B, accept or edit 3.C.
2. Claude: strategy `LRC_Strategy.txt` (Mode 0 backtest first), then macro execution mode.
