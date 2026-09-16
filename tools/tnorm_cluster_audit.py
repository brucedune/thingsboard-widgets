"""v2 (Bruce 9/16): quiet = LARGEST cluster, as the firmware does (top bin +/-3, 128 ps bins).
Confidence: HIGH if top cluster >= 2x the runner-up AND n >= 500; MED if either fails; LOW if both.
With sparse event-only records the largest cluster can be a draw plateau, so LOW/MED are shown, not judged.
Nearest-zero (v1) is circular when the offset is wrong and is dropped."""
import json, glob, csv, math, statistics as st
STEP, HW, GATE, MAG = 128, 3, 768, 1536
def cl(v):
    if len(v) < 32: return None
    h = {}
    for x in v:
        b = int(math.floor((x + STEP/2)/STEP)); h[b] = h.get(b, 0)+1
    def mass(b):
        num = den = 0
        for k in range(b-HW, b+HW+1):
            c = h.get(k, 0); num += c*k*STEP; den += c
        return den, (num/den if den else 0)
    modes = sorted([b for b in h if all(h[b] >= h.get(k, 0) for k in range(b-HW, b+HW+1)) and mass(b)[0] >= 32], key=lambda b: -mass(b)[0])
    if not modes: return None
    top = modes[0]; den, z = mass(top)
    d2 = mass(modes[1])[0] if len(modes) > 1 else 0
    conf = "HIGH" if (den >= 2*d2 and len(v) >= 500) else ("LOW" if (den < 2*d2 and len(v) < 500) else "MED")
    quiet = [x for x in v if abs(x-z) <= GATE]
    noise = None
    if len(quiet) >= 16:
        d = sorted(abs(quiet[i]-quiet[i-1]) for i in range(1, len(quiet))); noise = 1.4826*d[len(d)//2]/1.4142
    pos = sum(1 for x in v if x-z > MAG); neg = sum(1 for x in v if x-z < -MAG)
    return {"zero": round(z), "mass": den, "mass2": d2, "conf": conf, "noise": None if noise is None else round(noise, 1), "pos": pos, "neg": neg, "n": len(v)}
def tdir(c):
    if not c or c["pos"]+c["neg"] < 10: return "no draws"
    if c["pos"] >= 2*c["neg"]: return "NOT FLIPPED"
    if c["neg"] >= 2*c["pos"]: return "FLIPPED"
    return "ambiguous"
rows = []
for fn in sorted(glob.glob("tn88_records/*.json")):
    r = json.load(open(fn)); pre = [x for _, x in r["pre"]]; post = [x for _, x in r["post"]]
    cp, cq = cl(pre), cl(post)
    m = lambda a: max(set(a), key=a.count) if a else None
    dpost = [v for t, v in r["dir"] if t >= r["t88"]]; dpre = [v for t, v in r["dir"] if t < r["t88"]]
    rows.append({"serial": r["serial"], "apt": r["apt"], "n_pre": len(pre), "n_post": len(post),
        "zero_pre": cp and cp["zero"], "conf_pre": cp and cp["conf"], "zero_post": cq and cq["zero"], "conf_post": cq and cq["conf"],
        "noise_pre": cp and cp["noise"], "noise_post": cq and cq["noise"],
        "dir_rep_pre": m(dpre), "dir_rep_post": m(dpost), "dir_draw_post": tdir(cq), "pos_post": cq and cq["pos"], "neg_post": cq and cq["neg"]})
with open("cluster88b.csv", "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=list(rows[0].keys())); w.writeheader(); w.writerows(rows)
F = [r for r in rows if "TEST" not in str(r["apt"]).upper() and "DEBUG" not in str(r["apt"]).upper()]
ok = lambda x: x is not None
H = [r for r in F if r["conf_post"] == "HIGH"]
print("field %d; post-window confidence: HIGH %d  MED %d  LOW %d  (no cluster %d)\n" % (len(F), len(H), sum(1 for r in F if r["conf_post"] == "MED"), sum(1 for r in F if r["conf_post"] == "LOW"), sum(1 for r in F if not ok(r["zero_post"]))))
zq = sorted(abs(r["zero_post"]) for r in H); zp = sorted(abs(r["zero_pre"]) for r in F if r["conf_pre"] == "HIGH")
print("OFFSET residual (largest cluster = quiet), HIGH-confidence only:")
print("   PRE  n=%d  |zero| p50 %4.0f  p90 %4.0f  within 1 bin %d  beyond gate (768) %d" % (len(zp), zp[len(zp)//2], zp[int(.9*(len(zp)-1))], sum(1 for x in zp if x <= 128), sum(1 for x in zp if x > 768)))
print("   POST n=%d  |zero| p50 %4.0f  p90 %4.0f  within 1 bin %d  beyond gate (768) %d" % (len(zq), zq[len(zq)//2], zq[int(.9*(len(zq)-1))], sum(1 for x in zq if x <= 128), sum(1 for x in zq if x > 768)))
print("   STUCK-OFFSET candidates (HIGH conf, quiet cluster > 768 ps from zero):")
for r in sorted([r for r in H if abs(r["zero_post"]) > 768], key=lambda r: -abs(r["zero_post"])):
    print("      %-9s apt %-10s quiet zero %+6.0f ps  n=%-5d  reported dir %-11s  draws %s (pos %s/neg %s)" % (r["serial"], r["apt"][:10], r["zero_post"], r["n_post"], r["dir_rep_post"], r["dir_draw_post"], r["pos_post"], r["neg_post"]))
N = [(r["noise_pre"], r["noise_post"]) for r in F if ok(r["noise_pre"]) and ok(r["noise_post"]) and r["n_pre"] >= 500 and r["n_post"] >= 500]
a = sorted(x for x, _ in N); b = sorted(y for _, y in N); rat = sorted(y/x for x, y in N if x)
print("\nNOISE (gated robust sd, n>=500 both sides, %d devices): PRE p50 %.0f p90 %.0f   POST p50 %.0f p90 %.0f   ratio p50 %.2f  >1.5x %d  <0.67x %d" % (len(N), a[len(a)//2], a[int(.9*(len(a)-1))], b[len(b)//2], b[int(.9*(len(b)-1))], rat[len(rat)//2], sum(1 for x in rat if x > 1.5), sum(1 for x in rat if x < 0.67)))
print("\nDIRECTION (HIGH conf only): reported vs draw sign relative to the largest cluster")
ag = dg = uk = nd = 0; dis = []
for r in H:
    t, rep = r["dir_draw_post"], r["dir_rep_post"]
    if t in ("no draws", "ambiguous"): nd += 1
    elif rep == "UNKNOWN": uk += 1
    elif rep == t: ag += 1
    else: dg += 1; dis.append(r)
print("   agree %d   DISAGREE %d   UNKNOWN-with-visible-direction %d   no/ambiguous draws %d" % (ag, dg, uk, nd))
for r in dis: print("      DISAGREE %-9s apt %-10s reported %s, draws %s (pos %s/neg %s), quiet zero %+.0f" % (r["serial"], r["apt"][:10], r["dir_rep_post"], r["dir_draw_post"], r["pos_post"], r["neg_post"], r["zero_post"]))
print("   UNKNOWN with visible direction:")
for r in H:
    if r["dir_rep_post"] == "UNKNOWN" and r["dir_draw_post"] in ("FLIPPED", "NOT FLIPPED"): print("      %-9s apt %-10s draws %-11s (pos %s/neg %s) was %s" % (r["serial"], r["apt"][:10], r["dir_draw_post"], r["pos_post"], r["neg_post"], r["dir_rep_pre"]))
