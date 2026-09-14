# LRC Strategy Spec — Multi-Timeframe Linear Regression Convergence (Long Only, Intraday Stocks)

Status: DRAFT v0.1 for approval, 2026-09-05. Nothing built yet.
Owner: Bruce. Author of this spec: Claude.
Folder: `C:\Users\Bruce\Documents\GitHub\TradeStation_EasyLanguage\`
Platform verified installed: TradeStation 10.0 (`C:\Program Files (x86)\TradeStation 10.0\`).

---

## 1. Objective

Turn Bruce's concept ("linear regression model with convergence trend lines across multiple
timeframes to identify inflection points / predictive support for directional movement") into a
compilable, backtestable EasyLanguage strategy for intraday stocks, long only, ATR trailing stop,
flat before the close, fixed-share sizing, with a live execution mode that sends orders via
TradeStation command-line macros so no stop or target order ever rests on the broker/exchange server.

Bruce's original model has NOT been seen yet. Everything in section 3 is Claude's interpretation of
the concept and must be confirmed or corrected against Bruce's exported code.

## 2. Scope

In scope:
- Strategy source (EasyLanguage text, paste-importable into TradeStation Development Environment).
- One helper function (residual standard deviation about the regression line, per data stream).
- One companion indicator that plots the same bands and marks convergence, for visual verification.
- README: chart setup, import steps, macro-mode setup, verification checklist.

Out of scope (unless Bruce adds it): shorts, profit targets, multi-symbol scanning, options, any
optimization of parameters, any claim of profitability.

## 3. Strategy design — v0.2 from Bruce's notes (2026-09-05 17:29)

Bruce's notes, verbatim in substance:
1. Any 3-bar sequence where the middle bar is greater or less than both the previous and the next
   bar is an inflection point.
2. Middle bar greater = an upper trendline data point; middle bar less = a lower trendline point.
3. Using a slope-point function, create a trendline at each consecutive point pair:
   TU1, TU2 ... TU(N) for upper; TL1, TL2 ... TL(N) for lower.
4. Compute the projected intercept point of the upper and lower trendline pairs.
5. (Earlier answer, truncated) "Convergence of upper and lower trendlines across a time window."

### 3.A Geometry (specified by Bruce, buildable now)
- Swing high at bar i: `High[i] > High[i-1] and High[i] > High[i+1]`; confirmed one bar late.
- Swing low at bar i: `Low[i] < Low[i-1] and Low[i] < Low[i+1]`; confirmed one bar late.
- Upper trendline = line through the two most recent swing highs: slope
  `mU = (H2 - H1) / (b2 - b1)`, evaluated at any bar b as `H2 + mU * (b - b2)`.
- Lower trendline = same through the two most recent swing lows.
- Projected intercept: solve `UpperLine(b) = LowerLine(b)` for bar offset b. Report the intercept
  bar (bars ahead of the current bar) and the intercept price. Lines that are parallel or diverging
  (intercept behind the current bar) have no forward convergence.

### 3.A.0 Bruce's ORIGINAL construction, recalled 2026-09-05 late (supersedes 3.A pairs) — FanMode 1
- Upper: anchor x1,y1 at the HIGHEST swing high (running extreme; `AnchorLookback` bars, 0 = all).
  Draw one trendline from the anchor through each successive swing high. A new higher high moves
  the anchor and starts a new fan (old fan kept drawn as history).
- Lower: inverse, anchored at the LOWEST swing low, through each successive swing low.
- Chart evidence: yellow fan from H1 (June top) through every later lower high; red fan from L1
  (early-July low) then re-anchored at L2 (August lower low).
- Implemented as `FanMode` input: 1 = anchored fans (default), 2 = consecutive pairs (old).
- The 3.B.1 data result was measured on FanMode 2 with MaxPairs=4; it must be re-run on FanMode 1.

### 3.A.1 Added from Bruce's hand-drawn chart (TQQQ daily, 2026-05-11 to 2026-09-04)
- **Fan, not a single line.** Every consecutive swing pair keeps its own line, projected forward.
  Kept lines per side is an input (`MaxPairs`, default 4).
- **Intercepts are forward in time.** Example on the chart: the rising upper line through the
  late-August swing highs and the rising lower line through the late-August swing lows meet near
  80.5 several bars past the last drawn point (a rising wedge; price broke down before the apex).
- **Convergence zone** = several projected lines crossing inside a small time/price box, e.g. the
  mid-July low where descending upper lines from the June top meet the rising lines and price
  reversed up.
- Implemented 2026-09-05 as `LRC_Trendlines_Indicator.txt` (geometry only, no trade logic).

### 3.B Still open (Bruce's answers will settle these)
- Where linear regression enters: (a) the trendlines are exactly the two-point lines above, or
  (b) each trendline is a regression through the last N swing points, or (c) regression is applied
  to price and the swing points are found on the regression line. v0.1 indicator = (a).
- Trade trigger relative to the intercept: breakout above the upper line before the apex, bounce
  from the lower line as the apex nears, or something else. Long only.
- Which wedge shapes qualify for a long: symmetric (upper falling, lower rising), ascending
  triangle (flat upper, rising lower), rising wedge, falling wedge.
- "Time window": max bars ahead for the intercept to count (`LookAhead`, default 40), and any
  min/max bar spacing between swing points.
- Multi-timeframe: computed on each of Data1/2/3 with agreement required, or a single timeframe.

### 3.B.1 First data result (2026-09-05, TQQQ daily 2024-10-07..2026-09-04, 480 bars, MaxPairs=4)
Script: `analyze_lrc_csv.py` on `lrc_tqqq_daily.csv`.
- Single crossings (X, 120 bars): no edge. 5-bar reversal 48.7% vs 52.6% baseline.
- Level clusters (K, Plot5, 78 bars): price moved TOWARD the cluster 71.8% at 5 bars (trend-adjusted
  baseline ~52%), reached it within 10 bars 66.7% (closes only). Cluster above close: +3.76% / 70% up
  at 5 bars (n=50). Cluster below close: -2.00% / 25% up (n=28). => magnet, not support/resistance.
- Convergence clusters (Q, Plot6, 32 bars): 3-bar +2.31% / 68.8% up vs +0.66% / 58.9%; 5-10 bar mixed.
- Re-export with H/L (still MaxPairs=4): K cluster price touched within 10 bars 76.9% vs 56.4% for a
  mirrored control level at the same distance (n=78). Q 62.5% vs 62.5% (no edge). X 61.1% vs 57.3%.
  => the level-cluster (K) magnet effect survives a fair control; Q and X do not.
- Caveats: one leveraged ETF in an uptrend, shallow fan, autocorrelated events.

### 3.B.2 FanMode 1 (anchored fans) on the same 480 bars, AnchorLookback=0, StartDate=0 (2026-09-06)
Report: `run4_fanmode1_full.txt`. 32 anchor moves. Lines per bar median 34, max 86 (anchor at the
running extreme accumulates a line per later swing) => K (>=3 lines) fired on 88% of bars, Q on 55%.
- ALL K (n=412): toward 56.9% at 5 bars, reached 69.2% vs 55.8% mirror control. Same direction as
  the pair model but diluted. Above-close K: +1.99% / 62.7% up at 5 bars; below-close: -0.41% / 49%.
- Density-scaled K (count / active lines): density >=0.33 (n=27) toward 73-75%, reached 81-100% vs
  44-64% control; density <0.33 (n=385) ~baseline. Small n but the strongest cells in either model.
- Q (n=254) reach 59.1% vs 55.1%; X (n=688) 54.8% vs 55.7%: no edge, consistent with 3.B.1.
Conclusions: unbounded anchored fans are too dense to be selective; the model needs AnchorLookback
(or StartDate) and a density-relative cluster threshold. Next: parameter sweep, preferably offline.
Implication for the long rule: candidate = dense level cluster ABOVE price within N ATR (target =
cluster price), rather than a bounce off a lower line. Needs the MaxPairs=12 re-export and a second
symbol before it is built.

### 3.B.3 Python port + parameter sweep (2026-09-06) — `lrc_model.py`, `lrc_validate.py`, `lrc_sweep.py`
Port validated: from bar 109 to 487 every L/K/X/Q record matches the TS export exactly (379 bars,
0 differences; earlier bars differ only because the export lacks the MaxBarsBack history).
Sweep on TQQQ daily (479 bars, warm-up 100 skipped, baseline 5-bar %up 58.8), 501 cells, geometry x
thresholds, score = reach10 - mirror10. Report `sweep_tqqq_report.txt`, table `sweep_tqqq.csv`.
- **FanMode 2 (consecutive pairs): 54/54 cells with n>=30 have positive edge, median +9.7 pp;
  above-close clusters 5-bar %up median 62.8 (n>=30 cells), below-close 46.6.** Robust across
  MaxPairs 4/8/12 and tolerance 0.25-0.50.
- **FanMode 1 (anchored fans): edge median +1.5 pp, only 52% of 184 cells positive = coin flip;
  above-close 57.0 (= baseline), below-close 50.0.** The anchored construction does NOT produce the
  magnet effect on this data at any lookback (0/40/80/120/200).
- Best individual cells reach +20-24 pp edge with n 30-90 but are partly selection noise from 501
  cells; the per-geometry medians are the trustworthy statistic.
- Conclusion (Claude, to be challenged by Bruce): the tradable object is the consecutive-pair line
  fan's dense level cluster; the anchored fan is the better visual but the weaker signal. Needs the
  SPY export (any FanMode; the port re-runs both offline) before anything is built on it.

### 3.B.4 Pivot (Bruce, 2026-09-06)
"Doesn't look promising. TQQQ is an aggregate, choppy when the market has no direction. Focus on
intraday directional movement; develop the buy/sell macro function." Cluster research parked.
Execution layer built first: `LRC_StrReplace` + `LRC_SendMacro` functions, `LRC_MacroHarness`
strategy (dry-run default, template-driven syntax, audit log, per-day cap). Open: define
"intraday directional movement" signal; choose symbol(s) and interval; intraday export for the port.

### 3.D Intraday multi-timeframe "trade against support" algo — PROPOSAL 2026-09-07 (not approved)
Bruce: "entry/exit algo intraday; multiple timeframes to decide market trend / optimal entry; trade
against support." Long only (per 9/5), ATR trail, flat before close, fixed shares, macro execution.

**Streams.** Data1 = trading TF (proposed 5 min), Data2 = 15 min, Data3 = 60 min. Same symbol.
Session: regular hours; entries EntryStart..LastEntry, flat at FlatTime (from section 3.6).

**Trend (Data3 primary, Data2 confirming), from swing structure — same 3-bar swing detector:**
- UP when the last two swing lows are rising AND the last swing high is above the prior swing high
  (HH + HL) on Data3, and Data2's last swing low is rising. Optional filter: Close of Data3 > EMA(Len).
- Only UP allows longs. DOWN or MIXED = no entries (shorts out of scope).

**Support (what we trade against) — a stack of candidates, each a price level on the current bar:**
  S1 higher-TF swing low: the most recent HL on Data2 (and Data3's HL as the wider floor).
  S2 lower trendline: value now of the newest lower line of the consecutive-pair fan on Data2.
  S3 dense level cluster: Plot5 of the pair fan (the only object with measured pull) on Data1/Data2.
  S4 session anchors: VWAP, prior-day low, opening-range low (cheap, widely watched).
- Support ZONE = the tightest band (<= ZoneTolATR x ATR1) containing >= MinConfluence candidates
  and lying BELOW the current price. Zone price = mean of members; zone strength = member count.

**Entry, two selectable styles (input EntryMode):**
  1 Passive: limit buy at ZoneHigh + small offset while price is above the zone; cancel if price
    closes below ZoneLow - InvalidATR x ATR1 (zone failed) or the zone dissolves.
  2 Confirmed: price trades into the zone (Low <= ZoneHigh), then a Data1 bar closes back above
    ZoneHigh with Close > Open -> buy next bar at market (or stop above that bar's high).
  Guard: no entry within N bars after a failed zone; one attempt per zone per day (input).

**Exits.** Initial stop = ZoneLow - InitStopATR x ATR1. Trail = highest high since entry -
TrailATRMult x ATR1, ratchets only. Optional target = nearest resistance from the mirror stack
(Data2 swing high / upper line / cluster above), input TargetMode 0/1. EOD flat.

**Execution.** Mode 0 strategy orders (backtest, optimization). Mode 1 shadow: automation OFF,
paper fills via strategy orders, real orders via LRC_SendMacro (market, or marketable limit for
EntryMode 1); stop/target/EOD never rest on the server.

**Testing plan.** (a) TS Mode 0 backtest on the chosen symbol(s), 6+ months of 5-min data, for
plumbing and trade lists. (b) Python: extend lrc_model to accept a 5-min OHLC export and derive
15/60-min by aggregation, so the trend/zone rules can be swept offline the way the daily work was.
(c) Sim account live for a week in Mode 1 dry-run, then Mode 1 live in sim.

**Bruce's decisions 2026-09-07:**
- Support = S3 ONLY: the dense level cluster of the consecutive-pair fan (S1/S2/S4 dropped).
- Entry = confirmed bounce (EntryMode 2). Passive limit dropped.
- Market = TQQQ and SQQQ; timeframes 60 min, 30 min, 10 min, 5 min, 15 sec (roles to confirm:
  proposed 60/30/10 = trend + cluster levels, 5 min = trading bar, 15 sec = entry timing).
  Long-only rules on each symbol's own chart => downtrends are traded by buying SQQQ.
- Exits = scale out: half at the nearest resistance (mirror stack), remainder on the ATR trail,
  initial stop under the zone, flat before close.
**Resolved 2026-09-07:** 60/30/10 = trend + clusters, 5 min = confirmation, 15 sec = execution
(live only; backtest layout uses 5 min for Data1 and duplicates it as Data2). SQQQ = separate chart,
same rules. History: 5-min months, 15-sec days => backtests run on the 5-min layout.
**2026-09-09 (Bruce, from a range-bound 15-sec TQQQ mid-morning):** add RANGE SCALPING MODE and
keep BOTH configurations (intraday + swing). Range mode = trend gate not met, no stream down,
support + resistance clusters bracket price (gap >= RangeMinATR x ATR2 and RangeMinPts), bounce
confirms on Data1 (15 sec) bars, full exit at the resistance cluster, tighter stop. Swing layout =
same code on 30/60-min execution, daily confirmation, daily/weekly trend, FlatTime disabled.
Implemented in LRC_Bounce_Strategy v0.2 (inputs AllowRangeMode, RangeNoDownTrend, RangeMinATR,
RangeMinPts, RangeTouchBars, RangeStopATR, RangeTrailATR).
**Built 2026-09-07 (v0.1, uncompiled by Bruce yet):** `LRC_PairFanCluster_Function.txt` (series
function, per-stream clusters/trend), `LRC_Bounce_Strategy.txt` (trend gate, zone from Data3/4/5
clusters, bounce state machine on completed Data2 bars, half at resistance target + ATR trail,
EOD flat, ExecMode 0/1 with macro shadow). Next: compile, Mode 0 backtest on TQQQ 5-min layout,
trade-list review, then Python intraday aggregation for sweeps.

### 3.C Claude's proposed entry logic for v0.2 (Bruce asked for a design; NOT approved)
Long setup = convergence + direction + trigger, evaluated on the trading timeframe:
1. Convergence: at least `MinIcpt` valid future intercepts (default 2) inside `LookAhead` bars,
   and the intercept prices cluster within `IcptTolATR` x ATR (default 1.0) of each other.
2. Direction: the newest lower trendline slope is positive (higher swing lows), and the higher
   timeframe (Data3) newest lower slope is positive as well.
3. Trigger, selectable by input `TriggerMode`:
   - 1 = Breakout: Close crosses above the newest upper trendline while the intercept is still ahead.
   - 2 = Bounce: Low touches the newest lower trendline (within `TouchTolATR` x ATR) and Close
     finishes above it.
4. Exits unchanged from section 3.7: initial stop under the newest lower line, ATR trail, EOD flat.
Rationale: a converging fan with rising lows says sellers are running out of room before the apex;
the breakout catches the resolution, the bounce catches the last test. Both are testable in Mode 0.

The remainder of this section (3.1 to 3.9 below) is the superseded v0.1 text, kept only for the
execution-mode and exit material, which is unchanged.

### 3.1 Chart setup
Multi-data chart, same symbol on all streams:

| Stream | Role | Default interval |
|---|---|---|
| Data1 | Trading timeframe, all orders | 5 min |
| Data2 | Intermediate timeframe | 15 min |
| Data3 | Higher timeframe | 60 min |

Intervals are chart settings, not code; the code treats them as "fast / mid / slow".

### 3.2 Per-timeframe regression model (k = 1, 2, 3)
For each stream, over its own bars, with length `RegLen_k`:
- `Reg_k`   = regression line value, projected one bar forward (the "predictive" part):
  `LinearRegValue(Close, RegLen_k, -1)` evaluated on stream k.
- `Slope_k` = `LinearRegSlope(Close, RegLen_k)` on stream k, normalized by that stream's ATR.
- `Sigma_k` = standard deviation of residuals (Close minus regression line) over `RegLen_k`
  on stream k. Needs a small custom function so it evaluates on the right stream.
- `Support_k` = `Reg_k - BandMult_k * Sigma_k` (projected lower channel line = predictive support).

Inferred, not verified in this session: `LinearRegValue` with a negative target bar projects
forward. This is standard TradeStation behavior and will be checked on first compile/plot.

### 3.3 Convergence ("convergence trend lines")
The support lines of the three timeframes are said to converge when they sit inside a tight zone:

- `ClusterHigh` = highest of the participating `Support_k`; `ClusterLow` = lowest.
- Converged when `(ClusterHigh - ClusterLow) <= ConvTolATR * ATR(Data1)` for at least
  `MinConverge` timeframes (default 3; input allows 2).

### 3.4 Directional gate (trend agreement)
Long only, so the higher timeframes must be rising:
- `Slope_2 >= MinSlopeATR` and `Slope_3 >= MinSlopeATR` (slope per bar divided by ATR of that
  stream; default threshold 0 = simply positive).

### 3.5 Inflection trigger (on Data1)
Price tests the convergence zone and rejects it upward:
- `Low <= ClusterHigh + TouchTolATR * ATR1` (tested the zone), and
- `Close > ClusterHigh` (closed back above it), and
- optional `Close > Open` (bullish bar) via input `RequireBullBar`.

### 3.6 Time filters (chart time zone; set the chart to Exchange time)
- Entries allowed only when `Time >= EntryStart` (default 0945) and `Time <= LastEntry` (default 1500).
- Flat at `FlatTime` (default 1555). No positions held overnight.

### 3.7 Exits (long)
- Initial stop: `ClusterLow - InitStopATR * ATR1` at entry.
- Trailing stop: `HighestHighSinceEntry - TrailATRMult * ATR1` (default 2.0 x ATR(14)).
- Effective stop = max(initial, trailing); it only ratchets up.
- End-of-day flat at `FlatTime`.
- No profit target (Bruce's choice: trailing stop only).

### 3.8 Sizing
- `Shares` input, fixed (default 100).

### 3.9 Execution modes (input `ExecMode`)
**Mode 0 — Strategy orders (backtest / optimization).**
Standard `Buy next bar at market`, `Sell ... stop`, `Sell ... at close`. Used for all historical
testing because macros do not execute historically. Note: if this mode were run with automation ON,
the stop orders would be sent to TradeStation's servers, which is what Bruce wants to avoid live.

**Mode 1 — Macro orders (live, orders concealed from the server).**
Recommended "shadow" pattern:
- Strategy automation stays OFF, so the strategy fills a paper position and `MarketPosition`,
  `EntryPrice`, etc. keep working.
- On each real-time signal the strategy also calls `RunCommand(...)` with a `.BUY` / `.SELL`
  command-line macro for a **market** order (or marketable limit) on the chart's symbol and the
  configured account.
- The trailing stop and EOD flat live only inside the strategy. Intrabar order generation is turned
  on so the stop is checked tick by tick; when breached, a `.SELL` market macro fires immediately.
  Nothing rests at the broker or exchange between signals.
- Guards: fire only on real-time bars (`LastBarOnChartEx`, `GetAppInfo(aiRealTimeCalc)`), one shot
  per signal (persistent flag), never during historical recalculation.

What this does and does not conceal: stops and the EOD exit are invisible until they fire. The
entry and exit market orders themselves are of course visible at the moment they are sent.

**To verify in TradeStation before coding this mode** (the help file could not be extracted in this
session): exact command-line macro syntax for a market buy/sell with quantity and account, e.g.
along the lines of `.BUY <symbol> Q=<shares> MARKET DAY ACCOUNT=<acct>`. The macro string is built
in one place in the code so a syntax correction is a one-line change. `RunCommand(strCommand)` is
confirmed present in the TS10 EasyLanguage dictionary on this machine.

## 4. Inputs (all exposed for optimization in Mode 0)

| Input | Default | Meaning |
|---|---|---|
| RegLen1 / RegLen2 / RegLen3 | 30 / 30 / 30 | Regression length per stream (in that stream's bars) |
| BandMult1 / 2 / 3 | 1.5 | Sigma multiplier for the lower channel line |
| MinConverge | 3 | How many timeframes must converge (2 or 3) |
| ConvTolATR | 0.75 | Max cluster width, in Data1 ATR units |
| TouchTolATR | 0.25 | How close Low must get to the cluster to count as a test |
| RequireBullBar | true | Require Close > Open on the trigger bar |
| MinSlopeATR | 0.0 | Min normalized slope for Data2 and Data3 |
| ATRLen | 14 | ATR length (Data1 and per-stream normalization) |
| InitStopATR | 0.5 | Initial stop buffer below ClusterLow |
| TrailATRMult | 2.0 | Trailing distance from highest high since entry |
| Shares | 100 | Fixed share size |
| EntryStart / LastEntry / FlatTime | 0945 / 1500 / 1555 | HHMM, chart time zone |
| ExecMode | 0 | 0 = strategy orders, 1 = macro orders |
| AcctID | "" | Account for macro orders (Mode 1 only) |

## 5. Deliverables

1. `LRC_ResidSD.txt` — function: residual standard deviation about the regression line.
2. `LRC_Strategy.txt` — the strategy.
3. `LRC_Bands_Indicator.txt` — indicator plotting Support_1/2/3, cluster shading, convergence marker.
4. `README.md` — setup, import, macro-mode, verification checklist.

Source is delivered as text (Claude cannot produce a compiled `.ELD`). Import = paste into a new
Function / Strategy / Indicator in the TradeStation Development Environment and press Verify.

## 6. Verification plan (Bruce runs in TradeStation; Claude cannot execute TS here)

1. All three files verify (compile) with zero errors in TS 10.
2. Indicator on a 5/15/60 SPY chart: three lower lines plot, convergence marker appears only when
   the three lines are visibly bunched, no plots before MaxBarsBack.
3. Strategy Mode 0, SPY 5-min, last 12 months: runs without runtime errors; every trade is long;
   no entries before EntryStart or after LastEntry; position is flat by FlatTime every day
   (check Trades list for any overnight holds = defect).
4. Trailing stop only rises: spot-check 5 trades in the Trades list against the bands.
5. Mode 1 in a **simulated** account, live market: one macro per signal, no duplicates on
   recalculation, stop fires as a market order, nothing shows in the Order Bar as a working stop.
6. Bruce compares signals against his original model on the same chart and reports differences.

Success = items 1 to 5 pass. Profitability is explicitly not a success criterion for v0.1.

## 7. Risks and open questions

- **Interpretation risk (highest).** Section 3 is inferred from one sentence. Bruce's exported
  code may define "convergence" or "trend lines" differently (e.g., regression lines rather than
  lower bands, or slope convergence rather than level convergence). Resolve before build.
- **Macro syntax** unverified in this session; see 3.9.
- **RunCommand behavior**: must be guarded against firing on historical bars and on every tick.
- **Paper vs. real position drift** in Mode 1 (partial fills, rejects). Mitigation: market orders,
  and a manual reconciliation habit; a `GetPositionQuantity`-style check can be added in v0.2.
- **Higher-timeframe alignment**: `of Data2/Data3` values update as their bars form; historical
  tests use completed-bar alignment. Acceptable, but live and backtest can differ slightly.
- **Over-parameterization**: 15+ inputs invite curve fitting. Keep defaults fixed until the logic
  is validated visually.

## 8. Decisions needed from Bruce

1. Approve section 3 as the v0.1 interpretation, or correct it (ideally by exporting the original
   study/strategy as an ELD or pasting its code into this folder).
2. Confirm timeframes 5 / 15 / 60 min or specify others.
3. Confirm the "shadow" macro pattern in 3.9 (automation off, macros mirror paper fills), or state
   a different intent behind "conceal orders from the server".
