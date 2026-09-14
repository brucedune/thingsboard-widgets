"""Validate lrc_model.py against an indicator CSV export produced with the same inputs.

Usage: python lrc_validate.py lrc_tqqq_daily.csv [FanMode] [AnchorLookback] [StartDate] [MaxPairs]
Compares per bar: L line values (as multiset, 4 dp), K (price, count), X crossings, Q (price, count).
Prints match rates and the first few mismatches.  Early bars can differ because the export lacks the
bars inside TradeStation's MaxBarsBack buffer (ATR warm-up, first swing); the report says from which
bar onward everything matches.
"""
import csv
import sys
from collections import defaultdict

from lrc_model import Params, load_bars_from_csv, run


def load_rows(path):
    L, K, X, Q = defaultdict(list), {}, defaultdict(list), {}
    hl = False
    with open(path, newline="") as f:
        for r in csv.reader(f):
            if not r:
                continue
            if r[0] == "rec":
                hl = "high" in r
                continue
            bar = int(r[3])
            fld = r[7:] if hl else r[5:]
            if r[0] == "L":
                L[bar].append((fld[0], round(float(fld[2]), 4)))
            elif r[0] == "K":
                K[bar] = (round(float(fld[0]), 4), int(fld[1]))
            elif r[0] == "X":
                X[bar].append(round(float(fld[0]), 4))
            elif r[0] == "Q":
                Q[bar] = (round(float(fld[0]), 4), int(fld[1]))
    return L, K, X, Q


def main(path, fanmode=1, lookback=0, startdate=0, maxpairs=12):
    bars, gaps = load_bars_from_csv(path)
    print(f"bars in export: {len(bars)}  {bars[0].bar}..{bars[-1].bar}  gaps: {gaps if gaps else 'none'}")
    p = Params(FanMode=fanmode, AnchorLookback=lookback, StartDate=startdate, MaxPairs=maxpairs)
    outs = run(bars, p)
    L, K, X, Q = load_rows(path)

    def cmp_levels(o):
        mine = sorted([("U", round(v, 4)) for v in o.up_levels] + [("L", round(v, 4)) for v in o.lo_levels])
        theirs = sorted(L.get(o.bar, []))
        if len(mine) != len(theirs):
            return False
        return all(a[0] == b[0] and abs(a[1] - b[1]) <= 0.00015 for a, b in zip(mine, theirs))

    def cmp_k(o):
        theirs = K.get(o.bar)
        mine = (round(o.best_px, 4), o.best_cnt) if o.best_cnt >= p.ClusterMinLines else None
        if theirs is None and mine is None:
            return True
        if theirs is None or mine is None:
            return False
        return abs(theirs[0] - mine[0]) <= 0.0015 and theirs[1] == mine[1]

    def cmp_x(o):
        theirs = sorted(X.get(o.bar, []))
        mine = sorted(round(v, 4) for v in o.crossings)
        return len(theirs) == len(mine) and all(abs(a - b) <= 0.00015 for a, b in zip(theirs, mine))

    def cmp_q(o):
        theirs = Q.get(o.bar)
        mine = (round(o.best_q_px, 4), o.best_q) if o.best_q >= p.ClusterMin else None
        if theirs is None and mine is None:
            return True
        if theirs is None or mine is None:
            return False
        return abs(theirs[0] - mine[0]) <= 0.0015 and theirs[1] == mine[1]

    results = {"L": [], "K": [], "X": [], "Q": []}
    for o in outs:
        results["L"].append((o.bar, cmp_levels(o)))
        results["K"].append((o.bar, cmp_k(o)))
        results["X"].append((o.bar, cmp_x(o)))
        results["Q"].append((o.bar, cmp_q(o)))

    for name, res in results.items():
        ok = sum(1 for _, r in res if r)
        # first bar from which everything matches to the end
        clean_from = None
        for idx in range(len(res)):
            if all(r for _, r in res[idx:]):
                clean_from = res[idx][0]
                break
        bad = [b for b, r in res if not r]
        print(f"{name}: {ok}/{len(res)} bars match; clean from bar {clean_from}; "
              f"first mismatches {bad[:6]}")

    # detail on the first level mismatch after the warm-up
    for o in outs:
        if o.bar > outs[0].bar + 40 and not cmp_levels(o):
            mine = sorted([("U", round(v, 4)) for v in o.up_levels] + [("L", round(v, 4)) for v in o.lo_levels])
            print(f"\nfirst post-warm-up L mismatch at bar {o.bar}:")
            print("  mine  :", mine[:12], "..." if len(mine) > 12 else "")
            print("  export:", sorted(L.get(o.bar, []))[:12])
            break
    for o in outs:
        if o.bar > outs[0].bar + 40 and not cmp_k(o):
            print(f"first post-warm-up K mismatch at bar {o.bar}: mine=({o.best_px:.4f},{o.best_cnt}) export={K.get(o.bar)} atr={o.atr:.4f}")
            break


if __name__ == "__main__":
    a = sys.argv[1:]
    main(a[0] if a else "lrc_tqqq_daily.csv",
         int(a[1]) if len(a) > 1 else 1, int(a[2]) if len(a) > 2 else 0,
         int(a[3]) if len(a) > 3 else 0, int(a[4]) if len(a) > 4 else 12)
