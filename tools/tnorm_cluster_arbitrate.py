"""FINAL arbitration. Two candidate quiet zeros from the records: LARGEST cluster (FW rule; right when the
device is mis-offset into continuous recording) and EDGE zero (Bruce's rule; right when the largest
cluster is a long draw plateau). Arbiter = status tnormAvg, the mean over ALL 1 Hz samples since landing,
including the quiet seconds that never become records: on an idle-most-of-the-day meter it sits near the
true quiet zero. Pick the candidate nearest tnormAvg; if neither is within 1500 ps, mark ambiguous."""
import csv, json, statistics as st
C = list(csv.DictReader(open("cluster88d.csv", encoding="utf-8-sig"))); S = json.load(open("tn88_status.json"))
f = lambda x: None if x in ("", "None", None) else float(x)
rows = []
for r in C:
    sn = r["serial"]; lz, ez = f(r["zero_post"]), f(r["edge_post"]); s = S.get(sn, {}); ta = s.get("tnormAvg_med")
    if lz is None: continue
    pick, why = None, ""
    if ta is not None:
        dl = abs(lz-ta); de = abs(ez-ta) if ez is not None else 1e9
        if min(dl, de) <= 1500:
            pick, why = (lz, "largest~tnormAvg") if dl <= de else (ez, "edge~tnormAvg")
        else: why = "ambiguous(tnormAvg %+.0f)" % ta
    else: why = "no status stats"
    if pick is None and r["cls_post"] == "AGREE": pick, why = lz, "largest=edge"
    pos, neg = int(r["pos"] or 0), int(r["neg"] or 0)
    # direction relative to the PICKED zero: re-sign using the shift between largest and picked zero
    dirn = r["dir_draw_post"]
    if pick is not None and ez is not None and pick == ez and abs(lz-ez) > 1536:   # largest is a real draw plateau, not the same cluster
        # largest cluster is a draw plateau at lz: its sign relative to edge zero IS the direction
        dirn = "NOT FLIPPED" if lz-ez > 0 else "FLIPPED"
    rows.append({**r, "tnormAvg": None if ta is None else round(ta), "quiet_final": None if pick is None else round(pick), "basis": why, "dir_final": dirn})
with open("tnorm-17088-final.csv", "w", newline="", encoding="utf-8") as fo:
    w = csv.DictWriter(fo, fieldnames=list(rows[0].keys())); w.writeheader(); w.writerows(rows)
F = [r for r in rows if "TEST" not in str(r["apt"]).upper() and "DEBUG" not in str(r["apt"]).upper()]
J = [r for r in F if r["quiet_final"] is not None]; A = [r for r in F if r["quiet_final"] is None]
from collections import Counter
print("field devices judged %d  (basis: %s)   ambiguous/no-stats %d" % (len(J), dict(Counter(r["basis"].split("(")[0] for r in J)), len(A)))
z = sorted(abs(r["quiet_final"]) for r in J)
print("\nOFFSET residual, final: p50 %.0f ps  p90 %.0f   within 1 bin (128) %d   within gate (768) %d   BEYOND gate %d" % (z[len(z)//2], z[int(.9*(len(z)-1))], sum(1 for x in z if x <= 128), sum(1 for x in z if x <= 768), sum(1 for x in z if x > 768)))
print("  beyond gate = offset wrong:")
for r in sorted([r for r in J if abs(r["quiet_final"]) > 768], key=lambda r: -abs(r["quiet_final"])):
    print("    %-9s apt %-10s quiet %+6.0f ps  (tnormAvg %+6.0f, largest %+6.0f, edge %s)  reported %-11s true %s" % (r["serial"], r["apt"][:10], r["quiet_final"], r["tnormAvg"], f(r["zero_post"]), r["edge_post"], r["dir_rep_post"], r["dir_final"]))
print("\nDIRECTION, final (true = sign of draws vs the picked zero):")
ag = dg = uk = nd = 0; dis = []
for r in J:
    t, rep = r["dir_final"], r["dir_rep_post"]
    if t in ("no draws", "ambiguous", None): nd += 1
    elif rep == "UNKNOWN": uk += 1
    elif rep == t: ag += 1
    else: dg += 1; dis.append(r)
print("  agree %d   DISAGREE %d   UNKNOWN with visible true direction %d   no/ambiguous draws %d" % (ag, dg, uk, nd))
for r in dis: print("    DISAGREE %-9s apt %-10s reported %s, true %s  (quiet %+.0f via %s; pos %s neg %s)" % (r["serial"], r["apt"][:10], r["dir_rep_post"], r["dir_final"], r["quiet_final"], r["basis"], r["pos"], r["neg"]))
print("  ambiguous (neither candidate near tnormAvg):")
for r in A: print("    %-9s apt %-10s largest %+.0f edge %s tnormAvg %s  %s" % (r["serial"], r["apt"][:10], f(r["zero_post"]), r["edge_post"], r["tnormAvg"], r["basis"]))
