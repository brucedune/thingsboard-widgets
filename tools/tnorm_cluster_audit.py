"""FW-faithful clustering of recorded tofNorm (offset-corrected, signed).
   bins 128 ps; quiet cluster = top bin +/-3 (offset_tracker.c: OTK_STEP, OTK_CLUSTER_HW); lock needs mass>=32.
   residual  = centroid of quiet cluster (0 = applied offset sits on the no-flow signal)
   noise     = robust sd of samples inside the +/-768 ps gate around the quiet zero
   draw tail = samples beyond +/-1536 ps of the zero (OTK_DIR_MIN_MAG_PS): sign majority = true direction
               (NOFLIP draws positive, FLIP negative, per the tracker header)"""
import json, glob, csv, statistics as st, math
STEP, HW, GATE, MAG = 128, 3, 768, 1536
def cluster(v):
    if len(v) < 32: return None
    h = {}
    for x in v:
        b = int(math.floor((x + STEP/2) / STEP)); h[b] = h.get(b, 0) + 1
    # TB records are written DURING flow (event samples), so the globally densest bin is often a steady
    # draw plateau, not the quiet baseline the FW's 1 Hz histogram sees. Records are offset-corrected, so
    # the quiet cluster must be the local mode NEAREST ZERO with lock-worthy mass (>=32 in bin +/-3).
    def mass(b):
        num = den = 0
        for k in range(b-HW, b+HW+1):
            c = h.get(k, 0); num += c*k*STEP; den += c
        return den, (num/den if den else None)
    modes = [b for b in h if all(h[b] >= h.get(k, 0) for k in range(b-HW, b+HW+1)) and mass(b)[0] >= 32]
    if not modes: return None
    top = min(modes, key=lambda b: abs(mass(b)[1]))          # quiet zero = mode nearest 0
    big = max(modes, key=lambda b: mass(b)[0])               # dominant mode (draw plateau if != quiet)
    den, z = mass(top); bden, bz = mass(big)
    quiet = [x for x in v if abs(x - z) <= GATE]
    noise = None
    if len(quiet) >= 16:
        d = sorted(abs(quiet[i]-quiet[i-1]) for i in range(1, len(quiet)))
        noise = 1.4826*d[len(d)//2]/1.4142
    pos = sum(1 for x in v if x - z > MAG); neg = sum(1 for x in v if x - z < -MAG)
    return {"zero": round(z), "mass": den, "frac_quiet": round(den/len(v), 2), "noise": None if noise is None else round(noise, 1),
            "tail_pos": pos, "tail_neg": neg, "n": len(v), "plateau": None if big == top else round(bz), "plateau_mass": bden}
rows = []
for fn in sorted(glob.glob("tn88_records/*.json")):
    r = json.load(open(fn))
    pre = [x for _, x in r["pre"]]; post = [x for _, x in r["post"]]
    cp, cq = cluster(pre), cluster(post)
    dpre = [v for t, v in r["dir"] if t < r["t88"]]; dpost = [v for t, v in r["dir"] if t >= r["t88"]]
    m = lambda a: max(set(a), key=a.count) if a else None
    def true_dir(c):
        if not c or c["tail_pos"] + c["tail_neg"] < 10: return "no draws"
        if c["tail_pos"] >= 2*c["tail_neg"]: return "NOT FLIPPED"
        if c["tail_neg"] >= 2*c["tail_pos"]: return "FLIPPED"
        return "ambiguous"
    rows.append({"serial": r["serial"], "apt": r["apt"], "n_pre": len(pre), "n_post": len(post),
        "zero_pre": cp and cp["zero"], "zero_post": cq and cq["zero"], "quietfrac_pre": cp and cp["frac_quiet"], "quietfrac_post": cq and cq["frac_quiet"],
        "noise_pre": cp and cp["noise"], "noise_post": cq and cq["noise"],
        "dir_reported_pre": m(dpre), "dir_reported_post": m(dpost), "dir_true_pre": true_dir(cp), "dir_true_post": true_dir(cq),
        "tail_pos_post": cq and cq["tail_pos"], "tail_neg_post": cq and cq["tail_neg"],
        "plateau_post": cq and cq["plateau"], "plateau_pre": cp and cp["plateau"]})
with open("cluster88.csv", "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=list(rows[0].keys())); w.writeheader(); w.writerows(rows)
F = [r for r in rows if "TEST" not in str(r["apt"]).upper() and "DEBUG" not in str(r["apt"]).upper()]
ok = lambda x: x is not None
print("clustered %d devices (%d field)\n" % (len(rows), len(F)))
# OFFSET
zp = sorted(abs(r["zero_pre"]) for r in F if ok(r["zero_pre"])); zq = sorted(abs(r["zero_post"]) for r in F if ok(r["zero_post"]))
print("OFFSET residual = quiet-cluster zero in offset-corrected tofNorm (0 = correct):")
print("   PRE  n=%d |zero| p50 %4.0f  p90 %4.0f   within 128 ps (1 bin): %d   beyond 768 ps (gate): %d" % (len(zp), zp[len(zp)//2], zp[int(.9*(len(zp)-1))], sum(1 for x in zp if x <= 128), sum(1 for x in zp if x > 768)))
print("   POST n=%d |zero| p50 %4.0f  p90 %4.0f   within 128 ps (1 bin): %d   beyond 768 ps (gate): %d" % (len(zq), zq[len(zq)//2], zq[int(.9*(len(zq)-1))], sum(1 for x in zq if x <= 128), sum(1 for x in zq if x > 768)))
bad = sorted([r for r in F if ok(r["zero_post"]) and abs(r["zero_post"]) > 768], key=lambda r: -abs(r["zero_post"]))
for r in bad[:12]: print("      %-9s apt %-10s quiet zero post %+6.0f ps (pre %s)  quietfrac %s  n=%s  draw plateau %s" % (r["serial"], r["apt"][:10], r["zero_post"], r["zero_pre"], r["quietfrac_post"], r["n_post"], r["plateau_post"]))
# NOISE
N = [(r["noise_pre"], r["noise_post"]) for r in F if ok(r["noise_pre"]) and ok(r["noise_post"]) and r["n_pre"] >= 200 and r["n_post"] >= 200]
a = sorted(x for x, _ in N); b = sorted(y for _, y in N); rat = sorted(y/x for x, y in N if x)
print("\nNOISE = robust sd inside the +/-768 ps gate (quiet samples only), n=%d with >=200 recs both sides:" % len(N))
print("   PRE p50 %.0f ps p90 %.0f    POST p50 %.0f ps p90 %.0f    ratio p50 %.2f   >1.5x: %d   <0.67x: %d" % (a[len(a)//2], a[int(.9*(len(a)-1))], b[len(b)//2], b[int(.9*(len(b)-1))], rat[len(rat)//2], sum(1 for x in rat if x > 1.5), sum(1 for x in rat if x < 0.67)))
worse = sorted([r for r in F if ok(r["noise_pre"]) and ok(r["noise_post"]) and r["n_pre"] >= 200 and r["n_post"] >= 200 and r["noise_post"] > 1.5*r["noise_pre"]], key=lambda r: -r["noise_post"]/r["noise_pre"])
for r in worse[:8]: print("      %-9s apt %-10s %5.0f -> %5.0f ps  x%.1f" % (r["serial"], r["apt"][:10], r["noise_pre"], r["noise_post"], r["noise_post"]/r["noise_pre"]))
# DIRECTION
print("\nDIRECTION: reported vs true (draw-tail sign beyond 1536 ps of the quiet zero):")
agree = dis = unk = nod = 0; bad_d = []
for r in F:
    t = r["dir_true_post"]; rep = r["dir_reported_post"]
    if t in ("no draws", "ambiguous"): nod += 1; continue
    if rep == "UNKNOWN": unk += 1; continue
    if rep == t: agree += 1
    else: dis += 1; bad_d.append(r)
print("   reported known & agrees with draw sign: %d   DISAGREES: %d   reported UNKNOWN (true dir visible): %d   no/ambiguous draws: %d" % (agree, dis, unk, nod))
for r in bad_d: print("      DISAGREE %-9s apt %-10s reported %s, draws say %s (pos %s / neg %s)" % (r["serial"], r["apt"][:10], r["dir_reported_post"], r["dir_true_post"], r["tail_pos_post"], r["tail_neg_post"]))
print("   UNKNOWN devices, true direction from draws:")
for r in F:
    if r["dir_reported_post"] == "UNKNOWN": print("      %-9s apt %-10s draws say %-12s (pos %s / neg %s)  was %s" % (r["serial"], r["apt"][:10], r["dir_true_post"], r["tail_pos_post"], r["tail_neg_post"], r["dir_reported_pre"]))
