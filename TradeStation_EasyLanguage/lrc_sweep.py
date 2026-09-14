"""Parameter sweep for the LRC level-cluster ("magnet") signal, offline from one export.

Usage: python lrc_sweep.py lrc_tqqq_daily.csv [out.csv]
For each geometry setting the model runs once; cluster thresholds are applied post hoc.
Score = reach10 - mirror10 (percentage points): how much more often price touches the cluster
level within 10 bars than it touches a control level at the same distance on the other side.
Cells with n < MIN_N are reported but flagged.  Nothing here is a strategy; it ranks signal cells.
"""
import csv
import sys
from itertools import product

from lrc_model import Params, evaluate, level_events, load_bars_from_csv, run

MIN_N = 30
WARMUP = 100          # skip bars before this index (export lacks MaxBarsBack history)


def directional(outs, ev, h=5):
    """Split events by cluster above/below close: % of 5-bar closes up for each side."""
    ab, be = [], []
    for i, px in ev:
        if i + h >= len(outs):
            continue
        up = outs[i + h].close > outs[i].close
        (ab if px > outs[i].close else be).append(up)
    f = lambda xs: (len(xs), 100 * sum(xs) / len(xs) if xs else float("nan"))
    return f(ab), f(be)


def main(path, out_path="sweep_out.csv"):
    bars, gaps = load_bars_from_csv(path)
    if gaps:
        print("WARNING gaps in bars:", gaps)
    rows = []

    # baseline: every bar, "toward" is undefined; report %up over 5 bars
    ups = [1 if bars[i + 5].close > bars[i].close else 0 for i in range(WARMUP, len(bars) - 5)]
    base_up5 = 100 * sum(ups) / len(ups)
    print(f"bars {len(bars)}  baseline 5-bar %up (post-warm-up) = {base_up5:.1f}")

    geoms = []
    for lb in (0, 40, 80, 120, 200):
        for tol in (0.25, 0.35, 0.5):
            geoms.append(dict(FanMode=1, AnchorLookback=lb, LevelTolATR=tol))
    for mp in (4, 8, 12):
        for tol in (0.25, 0.35, 0.5):
            geoms.append(dict(FanMode=2, MaxPairs=mp, LevelTolATR=tol))

    for g in geoms:
        p = Params(**g)
        outs = run(bars, p)
        for min_cnt, min_den, max_dist in product((3, 4, 5, 7), (0.0, 0.25, 0.33, 0.5), (None, 2.0)):
            ev = [(i, px) for i, px in level_events(outs, min_cnt, min_den, max_dist) if i >= WARMUP]
            r = evaluate(outs, ev)
            if not r:
                continue
            (n_ab, up_ab), (n_be, up_be) = directional(outs, ev)
            rows.append(dict(FanMode=p.FanMode, Lookback=p.AnchorLookback if p.FanMode == 1 else "",
                             MaxPairs=p.MaxPairs if p.FanMode == 2 else "", LevelTolATR=p.LevelTolATR,
                             MinCount=min_cnt, MinDensity=min_den, MaxDistATR=max_dist if max_dist else "",
                             n=r["n"], toward5=round(r["toward"], 1), reach10=round(r["reach"], 1),
                             mirror10=round(r["mirror"], 1), edge=round(r["edge"], 1),
                             fwd5_mean=round(r["fwd_mean"], 2), fwd5_up=round(r["fwd_up"], 1),
                             n_above=n_ab, up5_above=round(up_ab, 1), n_below=n_be, up5_below=round(up_be, 1)))

    with open(out_path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)
    print(f"{len(rows)} cells written to {out_path}")

    def show(title, sel, key, top=12):
        print(f"\n{title}")
        print("  FM  LB/MP  tol   cnt  dens  dist |    n  toward5 reach10 mirror10  edge | fwd5%  up%  | above n/up%  below n/up%")
        for r in sorted(sel, key=key, reverse=True)[:top]:
            lbmp = r["Lookback"] if r["FanMode"] == 1 else f"p{r['MaxPairs']}"
            flag = "" if r["n"] >= MIN_N else " *small n*"
            print(f"  {r['FanMode']}  {str(lbmp):>5}  {r['LevelTolATR']:.2f}  {r['MinCount']:>3}  {r['MinDensity']:.2f}  {str(r['MaxDistATR']):>4} |"
                  f" {r['n']:>4}  {r['toward5']:>6.1f}  {r['reach10']:>6.1f}  {r['mirror10']:>6.1f}  {r['edge']:>5.1f} |"
                  f" {r['fwd5_mean']:>5.2f} {r['fwd5_up']:>5.1f} | {r['n_above']:>3}/{r['up5_above']:>5.1f}   {r['n_below']:>3}/{r['up5_below']:>5.1f}{flag}")

    big = [r for r in rows if r["n"] >= MIN_N]
    show(f"TOP CELLS BY EDGE (reach - mirror), n >= {MIN_N}", big, lambda r: r["edge"])
    show(f"TOP CELLS BY toward5, n >= {MIN_N}", big, lambda r: r["toward5"])
    show(f"LONG SIDE: cluster above close, highest 5-bar %up (n_above >= {MIN_N}; baseline {base_up5:.1f})",
         [r for r in rows if r["n_above"] >= MIN_N], lambda r: r["up5_above"])
    show(f"SHORT-WARNING SIDE: cluster below close, lowest 5-bar %up (n_below >= {MIN_N})",
         [r for r in rows if r["n_below"] >= MIN_N], lambda r: -r["up5_below"])

    # robustness: average edge by lookback and by fan mode across all other settings (n>=MIN_N)
    print("\nAVERAGE EDGE BY GEOMETRY (cells with n >= MIN_N)")
    for fm in (1, 2):
        keyname = "Lookback" if fm == 1 else "MaxPairs"
        vals = sorted({r[keyname] for r in big if r["FanMode"] == fm}, key=lambda v: (v == "", v))
        for v in vals:
            cells = [r for r in big if r["FanMode"] == fm and r[keyname] == v]
            if cells:
                print(f"  FanMode {fm} {keyname}={v}: cells={len(cells)}  mean edge {sum(c['edge'] for c in cells) / len(cells):.1f}"
                      f"  mean toward5 {sum(c['toward5'] for c in cells) / len(cells):.1f}")


if __name__ == "__main__":
    a = sys.argv[1:]
    main(a[0] if a else "lrc_tqqq_daily.csv", a[1] if len(a) > 1 else "sweep_out.csv")
