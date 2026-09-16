"""v4: quiet = LARGEST cluster after dropping exact-zero samples (TI all-zero error frames; measure.c skips
tofd==0 for the tracker too). Edge zero (first/last 2 records of each event, 60 s gaps) is a CONFIRMATION:
  AGREE     |largest - edge| <= 768 -> zero is solid
  CONTINUOUS one burst spans most of the window (no real edges) -> device is mis-offset into continuous
             recording; quiet = largest cluster (Bruce: Rustic 44, +3959 baseline recorded as reverse flow)
  DISAGREE  edges exist but sit elsewhere -> shown, not judged
Direction = sign of samples beyond 1536 ps of the chosen zero."""
import json, glob, csv, math
STEP, HW, GATE, MAG = 128, 3, 768, 1536
def largest(v, minmass=32):
    if len(v) < minmass: return None, 0
    h = {}
    for x in v:
        b = int(math.floor((x+STEP/2)/STEP)); h[b] = h.get(b, 0)+1
    def mass(b):
        num = den = 0
        for k in range(b-HW, b+HW+1):
            c = h.get(k, 0); num += c*k*STEP; den += c
        return den, (num/den if den else 0)
    top = max(h, key=lambda b: mass(b)[0]); den, z = mass(top)
    return (round(z) if den >= minmass else None), den
def events(pts, gap_s=60):
    ev, cur = [], []
    for i, (t, x) in enumerate(pts):
        if cur and t-pts[i-1][0] > gap_s*1000: ev.append(cur); cur = []
        cur.append((t, x))
    if cur: ev.append(cur)
    return ev
def analyse(pts):
    pts = [(t, x) for t, x in pts if x != 0]          # drop TI zero frames
    if len(pts) < 32: return None
    v = [x for _, x in pts]
    lz, lmass = largest(v)
    if lz is None: return None
    ev = events(pts); span = pts[-1][0]-pts[0][0]
    longest = max((e[-1][0]-e[0][0] for e in ev), default=0)
    edges = []
    for e in ev:
        xs = [x for _, x in e]; edges += (xs[:2]+xs[-2:]) if len(xs) >= 6 else xs
    ez, emass = largest(edges, 8)
    if longest > 0.6*span and len(ev) <= 3: cls = "CONTINUOUS"
    elif ez is None: cls = "NO-EDGES"
    elif abs(ez-lz) <= GATE: cls = "AGREE"
    else: cls = "DISAGREE"
    z = lz
    quiet = [x for x in v if abs(x-z) <= GATE]; noise = None
    if len(quiet) >= 16:
        d = sorted(abs(quiet[i]-quiet[i-1]) for i in range(1, len(quiet))); noise = round(1.4826*d[len(d)//2]/1.4142, 1)
    pos = sum(1 for x in v if x-z > MAG); neg = sum(1 for x in v if x-z < -MAG)
    d = "no draws" if pos+neg < 10 else "NOT FLIPPED" if pos >= 2*neg else "FLIPPED" if neg >= 2*pos else "ambiguous"
    return {"zero": lz, "mass": lmass, "edge_zero": ez, "cls": cls, "events": len(ev), "noise": noise, "pos": pos, "neg": neg, "dir": d, "zeros_dropped": 0}
rows = []
for fn in sorted(glob.glob("tn88_records/*.json")):
    r = json.load(open(fn))
    a, b = analyse(r["pre"]), analyse(r["post"])
    m = lambda s: max(set(s), key=s.count) if s else None
    dpost = [v for t, v in r["dir"] if t >= r["t88"]]; dpre = [v for t, v in r["dir"] if t < r["t88"]]
    rows.append({"serial": r["serial"], "apt": r["apt"], "n_post": len(r["post"]), "zeros_post": sum(1 for _, x in r["post"] if x == 0),
        "zero_pre": a and a["zero"], "cls_pre": a and a["cls"], "zero_post": b and b["zero"], "edge_post": b and b["edge_zero"], "cls_post": b and b["cls"], "events_post": b and b["events"],
        "noise_pre": a and a["noise"], "noise_post": b and b["noise"], "dir_rep_pre": m(dpre), "dir_rep_post": m(dpost),
        "dir_draw_post": b and b["dir"], "pos": b and b["pos"], "neg": b and b["neg"]})
with open("cluster88d.csv", "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=list(rows[0].keys())); w.writeheader(); w.writerows(rows)
F = [r for r in rows if "TEST" not in str(r["apt"]).upper() and "DEBUG" not in str(r["apt"]).upper()]
ok = lambda x: x is not None
J = [r for r in F if ok(r["zero_post"])]
from collections import Counter
print("field %d, post-window judged %d; zero class: %s" % (len(F), len(J), dict(Counter(r["cls_post"] for r in J))))
print("exact-zero samples dropped (post): total %d across %d devices" % (sum(r["zeros_post"] for r in F), sum(1 for r in F if r["zeros_post"])))
zq = sorted(abs(r["zero_post"]) for r in J); zp = sorted(abs(r["zero_pre"]) for r in F if ok(r["zero_pre"]))
print("\nOFFSET residual (largest cluster, zeros dropped):")
print("  PRE  n=%d  p50 %4.0f  p90 %4.0f  within 1 bin %d  beyond gate %d" % (len(zp), zp[len(zp)//2], zp[int(.9*(len(zp)-1))], sum(1 for x in zp if x <= 128), sum(1 for x in zp if x > 768)))
print("  POST n=%d  p50 %4.0f  p90 %4.0f  within 1 bin %d  beyond gate %d" % (len(zq), zq[len(zq)//2], zq[int(.9*(len(zq)-1))], sum(1 for x in zq if x <= 128), sum(1 for x in zq if x > 768)))
print("  beyond gate, post window:")
for r in sorted([r for r in J if abs(r["zero_post"]) > 768], key=lambda r: -abs(r["zero_post"])):
    print("    %-9s apt %-10s quiet %+6.0f ps [%s, edge %s, %s events]  reported %-11s draws %s (pos %s neg %s)" % (r["serial"], r["apt"][:10], r["zero_post"], r["cls_post"], r["edge_post"], r["events_post"], r["dir_rep_post"], r["dir_draw_post"], r["pos"], r["neg"]))
N = [(r["noise_pre"], r["noise_post"]) for r in F if ok(r["noise_pre"]) and ok(r["noise_post"])]
a = sorted(x for x, _ in N); b = sorted(y for _, y in N); rat = sorted(y/x for x, y in N if x)
print("\nNOISE (gated robust sd at the quiet cluster), %d devices: PRE p50 %.0f p90 %.0f   POST p50 %.0f p90 %.0f   ratio p50 %.2f  >1.5x %d  <0.67x %d" % (len(N), a[len(a)//2], a[int(.9*(len(a)-1))], b[len(b)//2], b[int(.9*(len(b)-1))], rat[len(rat)//2], sum(1 for x in rat if x > 1.5), sum(1 for x in rat if x < 0.67)))
ag = dg = uk = nd = 0; dis = []
for r in J:
    t, rep = r["dir_draw_post"], r["dir_rep_post"]
    if t in ("no draws", "ambiguous"): nd += 1
    elif rep == "UNKNOWN": uk += 1
    elif rep == t: ag += 1
    else: dg += 1; dis.append(r)
print("\nDIRECTION vs quiet zero: agree %d  DISAGREE %d  UNKNOWN-with-visible-direction %d  no/ambiguous %d" % (ag, dg, uk, nd))
for r in dis: print("    DISAGREE %-9s apt %-10s reported %s, draws %s (pos %s neg %s) quiet %+.0f [%s]" % (r["serial"], r["apt"][:10], r["dir_rep_post"], r["dir_draw_post"], r["pos"], r["neg"], r["zero_post"], r["cls_post"]))
print("  UNKNOWN with visible direction:")
for r in J:
    if r["dir_rep_post"] == "UNKNOWN" and r["dir_draw_post"] in ("FLIPPED", "NOT FLIPPED"): print("    %-9s apt %-10s %-11s (pos %s neg %s) was %s" % (r["serial"], r["apt"][:10], r["dir_draw_post"], r["pos"], r["neg"], r["dir_rep_pre"]))
