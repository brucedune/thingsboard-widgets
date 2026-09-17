"""Flow-direction pre-scan for roll candidates (Bruce 9/17). READ-ONLY. For each Metering device on a
pre-16190 build in a pre-16190-lever group: 7-day tofNorm records -> quiet zero (largest vs edge, arbitrated
by non-zero tnormAvg) -> draw-tail sign -> compare with reported flowDirection and any waterFlowDir attr.
Verdicts: PIN <dir>  reported known, draws agree, HIGH conf        -> safe to pin before the roll
          ATTR-OK    already carries waterFlowDir and draws agree
          ATTR-CONFLICT attr contradicts draws                     -> Bruce
          DRAWS-ONLY reported blank/UNKNOWN, draws HIGH conf        -> Bruce's call
          CONFLICT   reported known but draws disagree              -> do not pin, cross unpinned
          NO-DRAWS / LOW                                           -> cross unpinned"""
import sys, json, csv, time, math, statistics as st; sys.path.insert(0, ".")
from tb_auth import tb_get
STEP, HW, GATE, MAG = 128, 3, 768, 1536
SKIPG = ("RMA", "Removed", "Failure", "Inventory", "Test", "Engineering")
C = [d for d in json.load(open("dir_prescan_candidates.json")) if d["fw_pre16190"] and d["state"] == "Metering" and not any(s in d["group"] for s in SKIPG)]
now = int(time.time()*1000); D = 86400000
def largest(v, mm=32):
    if len(v) < mm: return None, 0, 0
    h = {}
    for x in v: b = math.floor((x+STEP/2)/STEP); h[b] = h.get(b, 0)+1
    def mass(b):
        num = den = 0
        for k in range(b-HW, b+HW+1): c = h.get(k, 0); num += c*k*STEP; den += c
        return den, (num/den if den else 0)
    ms = sorted(((mass(b)[0], b) for b in h), reverse=True)
    den, z = mass(ms[0][1]); second = ms[1][0] if len(ms) > 1 else 0
    return (round(z) if den >= mm else None), den, second
def edge(recs):
    edges, cur = [], []
    def fl():
        if not cur: return
        xs = [x for _, x in cur]; edges.extend(xs[:2]+xs[-2:] if len(xs) >= 6 else xs)
    for i, (t, x) in enumerate(recs):
        if cur and t-recs[i-1][0] > 60000: fl(); cur.clear()
        cur.append((t, x))
    fl(); return largest(edges, 8)[0]
out = open("dir_prescan_results.csv", "w", newline="", encoding="utf-8"); w = csv.writer(out)
w.writerow(["serial", "id", "group", "lever", "apt", "fw", "ti", "reported", "attr", "records", "conf", "quiet", "basis", "pos", "neg", "draws", "verdict", "pin_value"])
n = 0; t0 = time.time()
for d in C:
    n += 1
    try:
        r = tb_get("/api/plugins/telemetry/DEVICE/%s/values/timeseries?keys=tofNorm,flowDirection,tnormAvg&startTs=%d&endTs=%d&limit=6000" % (d["id"], now-7*D, now))
    except Exception as ex:
        w.writerow([d["serial"], d["id"], d["group"], d["lever"], d["apt"], d["fw"], d["ti"], d["dir"], d["wfd_attr"], 0, "", "", "read-fail", "", "", "", "ERROR", ""]); continue
    recs = sorted((p["ts"], float(p["value"])) for p in r.get("tofNorm", []) if p["value"] not in (None, "") and float(p["value"]) != 0)
    dirs = [p["value"] for p in r.get("flowDirection", []) if p["value"]]
    rep = max(set(dirs), key=dirs.count) if dirs else (d["dir"] or "")
    ta = [float(p["value"]) for p in r.get("tnormAvg", []) if p["value"] not in (None, "") and float(p["value"]) != 0]
    A = st.median(ta) if ta else None
    vals = [x for _, x in recs]
    L, mass, second = largest(vals); E = edge(recs) if recs else None
    conf = "HIGH" if (L is not None and mass >= 2*second and len(vals) >= 500) else ("MED" if L is not None else "")
    quiet, basis = None, ""
    if L is not None:
        if A is not None:
            dl, de = abs(L-A), (abs(E-A) if E is not None else 1e9)
            if min(dl, de) <= 1500: quiet, basis = (L, "largest") if dl <= de else (E, "edge")
        elif E is not None and abs(E-L) <= GATE: quiet, basis = L, "largest=edge"
    pos = neg = 0; draws = ""
    if quiet is not None:
        pos = sum(1 for x in vals if x-quiet > MAG); neg = sum(1 for x in vals if x-quiet < -MAG)
        draws = "no draws" if pos+neg < 10 else "NOT FLIPPED" if pos >= 2*neg else "FLIPPED" if neg >= 2*pos else "ambiguous"
        if basis == "edge" and abs(L-E) > MAG: draws = "NOT FLIPPED" if L-E > 0 else "FLIPPED"
    attr = {"1": "NOT FLIPPED", "2": "FLIPPED"}.get(str(d["wfd_attr"]), "")
    verdict, pinval = "NO-DRAWS", ""
    if draws in ("FLIPPED", "NOT FLIPPED") and conf == "HIGH":
        if attr: verdict = "ATTR-OK" if attr == draws else "ATTR-CONFLICT"
        elif rep in ("FLIPPED", "NOT FLIPPED"): verdict, pinval = ("PIN", "2" if draws == "FLIPPED" else "1") if rep == draws else ("CONFLICT", "")
        else: verdict = "DRAWS-ONLY"
    elif draws in ("FLIPPED", "NOT FLIPPED"): verdict = "LOW"
    elif quiet is None and L is not None: verdict = "AMBIGUOUS-ZERO"
    w.writerow([d["serial"], d["id"], d["group"], d["lever"], d["apt"], d["fw"], d["ti"], rep, attr, len(vals), conf, quiet, basis, pos, neg, draws, verdict, pinval]); out.flush()
    if n % 250 == 0: print("  %d/%d  %.0f min" % (n, len(C), (time.time()-t0)/60), flush=True)
out.close(); print("done %d devices -> dir_prescan_results.csv" % n)
