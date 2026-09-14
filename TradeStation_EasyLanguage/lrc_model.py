"""Python port of LRC_Trendlines_Indicator.txt (v0.5) geometry.

Mirrors the EasyLanguage bar-by-bar logic so parameter sweeps can run offline from one export.
Bars come from the indicator's CSV (close/high/low columns) or any OHLC list.

Faithfulness notes (things deliberately copied from the EL, quirks included):
  * swing at bar (B - Strength) is detected on bar B; StartDate filters on the swing bar's date
  * swing history capped at 60 (oldest dropped); FanMode 1 anchor = extreme stored swing within
    AnchorLookback bars, ties -> the most recent; fan = anchor -> each MORE RECENT stored swing,
    index 0 = newest, capped at 60; fan rebuilt only when a swing on that side confirms
  * FanMode 2 = consecutive pairs, newest MaxPairs
  * ATR = simple average of TrueRange over ATRLen (TS AvgTrueRange); first bar uses High-Low
  * level list = line values within LevelRangeATR*ATR of Close, uppers then lowers, cap 120;
    cluster = for each level, count of levels within LevelTolATR*ATR; best = max count
    (first wins on ties), price = mean of members
  * crossings: for each (upper, lower) with different slopes, bX in (B-1, B] -> crossing now;
    ring buffer of 400 crossings; Q count = crossings within ClusterBars bars and
    ClusterTolATR*ATR (itself included); best = max (first wins)
"""
from dataclasses import dataclass, field
from typing import List, Optional


@dataclass
class Params:
    FanMode: int = 1
    Strength: int = 1
    AnchorLookback: int = 0
    StartDate: int = 0          # YYYYMMDD, 0 = off
    MaxPairs: int = 12
    LookAhead: int = 40
    ATRLen: int = 14
    LevelTolATR: float = 0.35
    LevelRangeATR: float = 3.0
    ClusterMinLines: int = 3
    ClusterBars: int = 3
    ClusterTolATR: float = 0.5
    ClusterMin: int = 2


@dataclass
class Bar:
    bar: int        # TradeStation BarNumber
    date: int       # TS YYYMMDD
    close: float
    high: float
    low: float


@dataclass
class BarOut:
    bar: int
    date: int
    close: float
    high: float
    low: float
    atr: float
    up_levels: List[float] = field(default_factory=list)   # index 0 = newest line
    lo_levels: List[float] = field(default_factory=list)
    n_lines: int = 0
    best_cnt: int = 0
    best_px: float = 0.0
    crossings: List[float] = field(default_factory=list)
    best_q: int = 0
    best_q_px: float = 0.0
    n_icpt: int = 0
    near_bars: float = 0.0
    near_px: float = 0.0
    anchor_u: Optional[int] = None
    anchor_l: Optional[int] = None


def _line(a_bar, a_px, b_bar, b_px):
    m = (b_px - a_px) / (b_bar - a_bar)
    return (a_bar, a_px, b_bar, b_px, m)


def _value(line, B):
    _, _, b_bar, b_px, m = line
    return b_px + m * (B - b_bar)


def run(bars: List[Bar], p: Params) -> List[BarOut]:
    """bars must be consecutive by BarNumber (gaps break the [Strength] references)."""
    S = p.Strength
    sdTS = p.StartDate - 19000000 if p.StartDate > 0 else None
    hi_hist: List[tuple] = []   # (bar, px), index 0 = newest, cap 60
    lo_hist: List[tuple] = []
    up_lines: List[tuple] = []
    lo_lines: List[tuple] = []
    prev_anchor_u = None
    prev_anchor_l = None
    tr_hist: List[float] = []
    cv_buf: List[tuple] = []    # ring buffer of (bar, px), cap 400 (oldest dropped)
    outs: List[BarOut] = []

    for i, b in enumerate(bars):
        B = b.bar
        # ATR (TS AvgTrueRange: simple average of TrueRange)
        if i == 0:
            tr = b.high - b.low
        else:
            pc = bars[i - 1].close
            tr = max(b.high, pc) - min(b.low, pc)
        tr_hist.append(tr)
        window = tr_hist[-p.ATRLen:]
        atr = sum(window) / len(window)
        tolLv = p.LevelTolATR * atr
        tolCv = p.ClusterTolATR * atr

        # swing detection at bar i-S (needs S bars on both sides); EL: CurrentBar > 2*Strength
        isHi = isLo = False
        if i >= 2 * S:
            mid = bars[i - S]
            isHi = isLo = True
            for dd in range(1, S + 1):
                if mid.high <= bars[i - S - dd].high or mid.high <= bars[i - S + dd].high:
                    isHi = False
                if mid.low >= bars[i - S - dd].low or mid.low >= bars[i - S + dd].low:
                    isLo = False
            if sdTS is not None and mid.date < sdTS:
                isHi = isLo = False
        if isHi:
            hi_hist.insert(0, (bars[i - S].bar, bars[i - S].high))
            del hi_hist[60:]
        if isLo:
            lo_hist.insert(0, (bars[i - S].bar, bars[i - S].low))
            del lo_hist[60:]

        # rebuild active line sets
        if isHi and len(hi_hist) >= 2:
            up_lines = []
            if p.FanMode == 1:
                aIdx, aPx = -1, -9e8
                for j, (sb, spx) in enumerate(hi_hist):
                    if (p.AnchorLookback == 0 or B - sb <= p.AnchorLookback) and spx > aPx:
                        aPx, aIdx = spx, j
                if aIdx >= 0:
                    prev_anchor_u = hi_hist[aIdx][0]
                    for j in range(0, aIdx):
                        if len(up_lines) < 60:
                            up_lines.append(_line(hi_hist[aIdx][0], hi_hist[aIdx][1],
                                                  hi_hist[j][0], hi_hist[j][1]))
            else:
                mp = min(max(p.MaxPairs, 1), 50)
                for j in range(0, min(len(hi_hist) - 1, mp)):
                    up_lines.append(_line(hi_hist[j + 1][0], hi_hist[j + 1][1],
                                          hi_hist[j][0], hi_hist[j][1]))
        if isLo and len(lo_hist) >= 2:
            lo_lines = []
            if p.FanMode == 1:
                aIdx, aPx = -1, 9e8
                for j, (sb, spx) in enumerate(lo_hist):
                    if (p.AnchorLookback == 0 or B - sb <= p.AnchorLookback) and spx < aPx:
                        aPx, aIdx = spx, j
                if aIdx >= 0:
                    prev_anchor_l = lo_hist[aIdx][0]
                    for j in range(0, aIdx):
                        if len(lo_lines) < 60:
                            lo_lines.append(_line(lo_hist[aIdx][0], lo_hist[aIdx][1],
                                                  lo_hist[j][0], lo_hist[j][1]))
            else:
                mp = min(max(p.MaxPairs, 1), 50)
                for j in range(0, min(len(lo_hist) - 1, mp)):
                    lo_lines.append(_line(lo_hist[j + 1][0], lo_hist[j + 1][1],
                                          lo_hist[j][0], lo_hist[j][1]))

        o = BarOut(B, b.date, b.close, b.high, b.low, atr, anchor_u=prev_anchor_u, anchor_l=prev_anchor_l)

        # A. step lines forward, cluster levels
        o.up_levels = [_value(ln, B) for ln in up_lines]
        o.lo_levels = [_value(ln, B) for ln in lo_lines]
        o.n_lines = len(up_lines) + len(lo_lines)
        lv = [v for v in o.up_levels + o.lo_levels if abs(v - b.close) <= p.LevelRangeATR * atr][:120]
        best_cnt, best_px = 0, 0.0
        for k in range(len(lv)):
            members = [x for x in lv if abs(x - lv[k]) <= tolLv]
            if len(members) > best_cnt:
                best_cnt, best_px = len(members), sum(members) / len(members)
        o.best_cnt, o.best_px = best_cnt, best_px

        # B. intercepts
        now = []
        n_icpt, near_bars, near_px = 0, 999999.0, 0.0
        for ul in up_lines:
            up_now = _value(ul, B)
            for ll in lo_lines:
                lo_now = _value(ll, B)
                mU, mL = ul[4], ll[4]
                if mU != mL:
                    bX = (ll[3] - ul[3] + mU * ul[2] - mL * ll[2]) / (mU - mL)
                    pX = ul[3] + mU * (bX - ul[2])
                    if B - 1 < bX <= B:
                        if len(now) < 400:
                            now.append(pX)
                    if up_now > lo_now and B < bX <= B + p.LookAhead:
                        n_icpt += 1
                        if bX - B < near_bars:
                            near_bars, near_px = bX - B, pX
        o.crossings = now
        o.n_icpt, o.near_bars, o.near_px = n_icpt, near_bars, near_px

        for px in now:
            cv_buf.append((B, px))
            del cv_buf[:-400]
        best_q, best_q_px = 0, 0.0
        for px in now:
            cnt = sum(1 for (cb, cp) in cv_buf if B - cb <= p.ClusterBars and abs(cp - px) <= tolCv)
            if cnt > best_q:
                best_q, best_q_px = cnt, px
        o.best_q, o.best_q_px = best_q, best_q_px
        outs.append(o)
    return outs


# ------------------------------------------------------------------ evaluation helpers

def evaluate(outs: List[BarOut], events, h=5, reach_h=10):
    """events: list of (index into outs, level price).  Returns dict of metrics.
    toward = close moved toward the level after h bars; reach = high/low touched the level within
    reach_h bars; mirror = same for a control level at the same distance on the opposite side."""
    tow, rets, hit, hit_m = [], [], 0, 0
    for i, px in events:
        if i + reach_h >= len(outs):
            continue
        c0 = outs[i].close
        c1 = outs[i + h].close
        rets.append((c1 / c0 - 1) * 100)
        if px != c0 and c1 != c0:
            tow.append(1 if (px > c0) == (c1 > c0) else 0)
        mirror = 2 * c0 - px
        got = got_m = False
        for k in range(1, reach_h + 1):
            hi, lo = outs[i + k].high, outs[i + k].low
            if not got and ((px > c0 and hi >= px) or (px < c0 and lo <= px)):
                got = True
            if not got_m and ((mirror > c0 and hi >= mirror) or (mirror < c0 and lo <= mirror)):
                got_m = True
        hit += got
        hit_m += got_m
    n = len(rets)
    if n == 0:
        return None
    return {"n": n,
            "toward": 100 * sum(tow) / len(tow) if tow else float("nan"),
            "reach": 100 * hit / n, "mirror": 100 * hit_m / n,
            "edge": 100 * (hit - hit_m) / n,
            "fwd_mean": sum(rets) / n,
            "fwd_up": 100 * sum(1 for r in rets if r > 0) / n}


def level_events(outs: List[BarOut], min_count=3, min_density=0.0, max_dist_atr=None):
    """Bars whose best level cluster passes the thresholds -> (index, cluster price)."""
    ev = []
    for i, o in enumerate(outs):
        if o.best_cnt < min_count or o.n_lines == 0:
            continue
        if o.best_cnt / o.n_lines < min_density:
            continue
        if max_dist_atr is not None and abs(o.best_px - o.close) > max_dist_atr * o.atr:
            continue
        ev.append((i, o.best_px))
    return ev


def load_bars_from_csv(path):
    """Unique bars from the indicator export (any row carries close/high/low). Reports gaps."""
    import csv
    seen = {}
    hl = False
    with open(path, newline="") as f:
        for r in csv.reader(f):
            if not r:
                continue
            if r[0] == "rec":
                hl = "high" in r
                continue
            bar = int(r[3])
            if bar in seen:
                continue
            if hl:
                seen[bar] = Bar(bar, int(r[1]), float(r[4]), float(r[5]), float(r[6]))
            else:
                seen[bar] = Bar(bar, int(r[1]), float(r[4]), float(r[4]), float(r[4]))
    bars = [seen[k] for k in sorted(seen)]
    gaps = [(bars[i - 1].bar, bars[i].bar) for i in range(1, len(bars)) if bars[i].bar != bars[i - 1].bar + 1]
    return bars, gaps
