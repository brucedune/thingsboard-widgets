"""Analyze the LRC_Trendlines CSV export: do convergence points / clusters precede turns?

Usage:  python analyze_lrc_csv.py lrc_tqqq_daily.csv
Stdlib only.  Prints a compact report; writes nothing.

Record types (see indicator header):
  L  per kept line per bar: f1=side(U/L) f2=lineIdx f3=value
  X  crossing on this bar:  f1=price
  K  level cluster (Plot5): f1=price f2=count
  Q  convergence cluster (Plot6): f1=price f2=count
"""
import csv
import statistics as st
import sys
from collections import defaultdict


def ts_date(d):
    """TS date YYYMMDD (1241007) -> 2024-10-07."""
    d = int(d)
    return f"{1900 + d // 10000}-{(d // 100) % 100:02d}-{d % 100:02d}"


def load(path):
    bars = {}          # bar -> (date, close, high, low)   high/low = close if not exported
    events = defaultdict(list)  # type -> list of (bar, price, count)
    nlines = defaultdict(int)   # bar -> number of kept lines
    hl = False
    with open(path, newline="") as f:
        for r in csv.reader(f):
            if not r:
                continue
            if r[0] == "rec":
                hl = "high" in r
                continue
            typ, date, _time, bar, close = r[0], r[1], r[2], int(r[3]), float(r[4])
            if hl:
                high, low, f = float(r[5]), float(r[6]), r[7:]
            else:
                high, low, f = close, close, r[5:]
            bars[bar] = (date, close, high, low)
            if typ == "L":
                nlines[bar] += 1
            elif typ == "X":
                events["X"].append((bar, float(f[0]), 1))
            elif typ in ("K", "Q"):
                events[typ].append((bar, float(f[0]), int(f[1])))
    return bars, events, nlines


def attractor_stats(bars, order, idx_of, ev, horizons=(1, 3, 5, 10), reach_h=10):
    """Does price move TOWARD the event price?  And does it reach it (high/low touch) within reach_h bars?"""
    print("  horizon   n   %toward   (baseline %toward for a level on a random side = ~50)")
    for h in horizons:
        tow = []
        for b, px, _ in ev:
            i = idx_of.get(b)
            if i is None or i + h >= len(order):
                continue
            c0 = bars[b][1]
            c1 = bars[order[i + h]][1]
            if px == c0 or c1 == c0:
                continue
            tow.append(1 if (px > c0) == (c1 > c0) else 0)
        if tow:
            print(f"  {h:>5}   {len(tow):>4}   {100 * st.mean(tow):>5.1f}")
    reached, reached_mirror, n = 0, 0, 0
    for b, px, _ in ev:
        i = idx_of.get(b)
        if i is None or i + reach_h >= len(order):
            continue
        n += 1
        c0 = bars[b][1]
        mirror = 2 * c0 - px          # same distance, opposite side of the close = control level
        hit, hit_m = False, False
        for k in range(1, reach_h + 1):
            _, _, hi, lo = bars[order[i + k]]
            if not hit and ((px > c0 and hi >= px) or (px < c0 and lo <= px)):
                hit = True
            if not hit_m and ((mirror > c0 and hi >= mirror) or (mirror < c0 and lo <= mirror)):
                hit_m = True
        reached += hit
        reached_mirror += hit_m
    if n:
        print(f"  reached the event price within {reach_h} bars: {100 * reached / n:.1f}%  (n={n})"
              f"   control: mirrored level at the same distance reached {100 * reached_mirror / n:.1f}%")
    dist = [abs(px / bars[b][1] - 1) * 100 for b, px, _ in ev]
    if dist:
        print(f"  distance of event price from close: median {st.median(dist):.2f}%  max {max(dist):.2f}%")


def fwd_stats(bars, order, idx_of, ev_bars, horizons=(1, 3, 5, 10), back=5):
    """Forward log-free % returns from event bars; reversal rate vs prior `back` bars."""
    out = {}
    for h in horizons:
        rets = []
        for b in ev_bars:
            i = idx_of.get(b)
            if i is None or i + h >= len(order):
                continue
            c0 = bars[order[i]][1]
            c1 = bars[order[i + h]][1]
            rets.append((c1 / c0 - 1) * 100)
        if rets:
            out[h] = (len(rets), st.mean(rets), st.median(rets),
                      100 * sum(1 for x in rets if x > 0) / len(rets))
    rev = []
    for b in ev_bars:
        i = idx_of.get(b)
        if i is None or i - back < 0 or i + back >= len(order):
            continue
        pb = bars[order[i]][1] / bars[order[i - back]][1] - 1
        pf = bars[order[i + back]][1] / bars[order[i]][1] - 1
        if pb != 0 and pf != 0:
            rev.append(1 if (pb > 0) != (pf > 0) else 0)
    out["rev"] = (len(rev), 100 * st.mean(rev) if rev else float("nan"))
    return out


def print_block(title, s):
    print(f"\n{title}")
    print("  horizon   n   mean%   median%   %up")
    for h in (1, 3, 5, 10):
        if h in s:
            n, m, md, up = s[h]
            print(f"  {h:>5}   {n:>4}  {m:>6.2f}   {md:>6.2f}   {up:>5.1f}")
    n, r = s["rev"]
    print(f"  5-bar direction reversal rate: {r:.1f}%  (n={n})")


def main(path):
    bars, events, nlines = load(path)
    order = sorted(bars)
    idx_of = {b: i for i, b in enumerate(order)}
    print(f"bars: {len(order)}  {ts_date(bars[order[0]][0])} .. {ts_date(bars[order[-1]][0])}")
    print(f"kept lines per bar: min {min(nlines.values())}  max {max(nlines.values())}  "
          f"median {st.median(nlines.values()):.0f}")
    for t in ("X", "Q", "K"):
        ev = events[t]
        nb = len({b for b, _, _ in ev})
        print(f"{t}: {len(ev)} records on {nb} bars "
              f"({100 * nb / len(order):.1f}% of bars)")

    # baseline: every bar
    print_block("BASELINE  (all bars)", fwd_stats(bars, order, idx_of, order))

    for t, label in (("X", "X  crossing bars"), ("Q", "Q  convergence-cluster bars"),
                     ("K", "K  level-cluster bars")):
        ev_bars = sorted({b for b, _, _ in events[t]})
        if ev_bars:
            print_block(label, fwd_stats(bars, order, idx_of, ev_bars))

    # split by where the event price sits vs the close (support below / resistance above)
    for t in ("X", "Q", "K"):
        below, above = set(), set()
        for b, px, _ in events[t]:
            c = bars[b][1]
            (below if px < c else above).add(b)
        if below:
            print_block(f"{t}  event price BELOW close (support-type)",
                        fwd_stats(bars, order, idx_of, sorted(below)))
        if above:
            print_block(f"{t}  event price ABOVE close (resistance-type)",
                        fwd_stats(bars, order, idx_of, sorted(above)))

    # near vs far: event within 2% of close
    for t in ("X", "Q", "K"):
        near = sorted({b for b, px, _ in events[t] if abs(px / bars[b][1] - 1) <= 0.02})
        if near:
            print_block(f"{t}  event price within 2% of close", fwd_stats(bars, order, idx_of, near))

    # cluster size effect for K and Q
    for t in ("K", "Q"):
        by_cnt = defaultdict(set)
        for b, _, cnt in events[t]:
            by_cnt[min(cnt, 5)].add(b)
        for cnt in sorted(by_cnt):
            s = fwd_stats(bars, order, idx_of, sorted(by_cnt[cnt]))
            if 5 in s:
                n, m, md, up = s[5]
                print(f"{t} count={cnt}{'+' if cnt == 5 else ''}: bars={len(by_cnt[cnt])} "
                      f"5-bar mean {m:.2f}% up {up:.0f}%  reversal {s['rev'][1]:.0f}%")

    # attractor test: does price move toward / reach the cluster price?
    for t in ("K", "Q", "X"):
        if events[t]:
            print(f"\nATTRACTOR TEST  {t}")
            attractor_stats(bars, order, idx_of, events[t])

    # density-scaled level clusters: count relative to active lines on that bar
    def compact(ev, h=5, reach_h=10):
        tow, rets, hit, hit_m = [], [], 0, 0
        for b, px, _ in ev:
            i = idx_of.get(b)
            if i is None or i + reach_h >= len(order):
                continue
            c0 = bars[b][1]
            c1 = bars[order[i + h]][1]
            rets.append((c1 / c0 - 1) * 100)
            if px != c0 and c1 != c0:
                tow.append(1 if (px > c0) == (c1 > c0) else 0)
            mirror = 2 * c0 - px
            got, got_m = False, False
            for k in range(1, reach_h + 1):
                _, _, hi, lo = bars[order[i + k]]
                if not got and ((px > c0 and hi >= px) or (px < c0 and lo <= px)):
                    got = True
                if not got_m and ((mirror > c0 and hi >= mirror) or (mirror < c0 and lo <= mirror)):
                    got_m = True
            hit += got
            hit_m += got_m
        n = len(rets)
        if not n:
            return None
        return (n, 100 * st.mean(tow) if tow else float("nan"), 100 * hit / n, 100 * hit_m / n,
                st.mean(rets))

    if events["K"]:
        print("\nK LEVEL CLUSTERS BY DENSITY (count / active lines on that bar)")
        print("  bucket            n   %toward5   reach10   mirror10   5-bar mean%")
        buckets = [("count 3", lambda c, d: c == 3), ("count 4", lambda c, d: c == 4),
                   ("count 5-6", lambda c, d: 5 <= c <= 6), ("count 7+", lambda c, d: c >= 7),
                   ("density <0.33", lambda c, d: d < 0.33), ("density 0.33-0.5", lambda c, d: 0.33 <= d < 0.5),
                   ("density >=0.5", lambda c, d: d >= 0.5)]
        for name, f in buckets:
            ev = [(b, px, c) for b, px, c in events["K"] if nlines.get(b) and f(c, c / nlines[b])]
            r = compact(ev)
            if r:
                n, tow, rh, rm, m = r
                print(f"  {name:<16} {n:>4}   {tow:>6.1f}    {rh:>5.1f}     {rm:>5.1f}     {m:>6.2f}")
        allk = compact(events["K"])
        if allk:
            n, tow, rh, rm, m = allk
            print(f"  {'ALL K':<16} {n:>4}   {tow:>6.1f}    {rh:>5.1f}     {rm:>5.1f}     {m:>6.2f}")

    # list the Q clusters with what happened next (for eyeballing against the chart)
    print("\nQ clusters (date, close, cluster px, count, +5 bar %):")
    for b, px, cnt in sorted(events["Q"]):
        i = idx_of[b]
        f5 = (bars[order[i + 5]][1] / bars[b][1] - 1) * 100 if i + 5 < len(order) else float("nan")
        print(f"  {ts_date(bars[b][0])}  close {bars[b][1]:7.2f}  px {px:7.2f}  n={cnt}  +5b {f5:6.2f}%")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "lrc_tqqq_daily.csv")
