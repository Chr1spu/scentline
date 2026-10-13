"""Summarise cache/validation/samples.json from validate_wind.py.

    python scripts/analyse_wind.py [samples.json]

Direction error = smallest angle between modelled and observed wind (from-directions), over hours
when the station's wind was at least MIN_OBS m/s (below that a vane's direction means little).
Compares WindNinja, the slope-wind fallback and the raw input wind, and checks the planner's wind
confidence rules (frontend/src/models/windConfidence.ts) against the real errors.
"""
from __future__ import annotations

import json
import statistics
import sys
from collections import defaultdict
from pathlib import Path

MIN_OBS = 1.0  # m/s
# the planner's thresholds (WIND_CONFIDENCE in frontend/src/config/modelParams.ts)
POOR_SPEED, FAIR_SPEED = 1.0, 2.0
FAIR_DIS, POOR_DIS = 25, 45
FAIR_TURN, POOR_TURN = 30, 60


def ang(a: float, b: float) -> float:
    d = abs(a - b) % 360
    return 360 - d if d > 180 else d


def stats(errs: list[float]) -> dict:
    if not errs:
        return {"n": 0}
    return {
        "n": len(errs),
        "median": round(statistics.median(errs), 1),
        "within30": round(sum(e <= 30 for e in errs) / len(errs), 2),
        "over45": round(sum(e > 45 for e in errs) / len(errs), 2),
    }


def main() -> None:
    path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parents[1] / "cache" / "validation" / "samples.json"
    samples = json.loads(path.read_text())
    by_key = {(s["stid"], s["date"], s["hour"]): s for s in samples}
    rows = []
    for s in samples:
        if s["obsSpeed"] < MIN_OBS:
            continue
        prev = by_key.get((s["stid"], s["date"], s["hour"] - 1))
        nxt = by_key.get((s["stid"], s["date"], s["hour"] + 1))
        turn = ang(prev["wnDir"], nxt["wnDir"]) if prev and nxt else 0.0
        dis = ang(s["wnDir"], s["fbDir"])
        level = 0
        if s["wnSpeed"] <= POOR_SPEED or dis >= POOR_DIS or turn >= POOR_TURN:
            level = 2
        elif s["wnSpeed"] <= FAIR_SPEED or dis >= FAIR_DIS or turn >= FAIR_TURN:
            level = 1
        rows.append({**s, "eWN": ang(s["wnDir"], s["obsDir"]), "eFB": ang(s["fbDir"], s["obsDir"]), "eIN": ang(s["inDir"], s["obsDir"]),
                     "turn": turn, "dis": dis, "level": ["good", "fair", "poor"][level]})
    out: dict = {"samples": len(samples), "used": len(rows), "minObsSpeed": MIN_OBS, "stations": len({r["stid"] for r in rows})}
    out["overall"] = {k: stats([r[f"e{k}"] for r in rows]) for k in ("WN", "FB", "IN")}

    def group(key, bins, field="eWN"):
        g = defaultdict(list)
        for r in rows:
            v = r[key]
            for lo, hi, label in bins:
                if lo <= v < hi:
                    g[label].append(r[field])
                    break
        return {label: stats(g[label]) for _, _, label in bins}

    out["byModelSpeed"] = group("wnSpeed", [(0, 1, "<1"), (1, 2, "1-2"), (2, 3, "2-3"), (3, 99, ">=3")])
    out["byObsSpeed"] = group("obsSpeed", [(1, 2, "1-2"), (2, 3, "2-3"), (3, 5, "3-5"), (5, 99, ">=5")])
    out["byDisagreement"] = group("dis", [(0, 25, "<25"), (25, 45, "25-45"), (45, 181, ">=45")])
    out["byTurn"] = group("turn", [(0, 30, "<30"), (30, 60, "30-60"), (60, 181, ">=60")])
    out["byHour"] = group("hour", [(h, h + 1, f"{h}:00") for h in range(13, 22)])
    out["byLevel"] = {lv: stats([r["eWN"] for r in rows if r["level"] == lv]) for lv in ("good", "fair", "poor")}
    out["byRegion"] = {reg: {k: stats([r[f"e{k}"] for r in rows if r["region"] == reg]) for k in ("WN", "IN")} for reg in sorted({r["region"] for r in rows})}
    # speed thresholds that would best separate small from large errors
    cands = []
    for th in [0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 4.0]:
        lo = [r["eWN"] for r in rows if r["wnSpeed"] < th]
        hi = [r["eWN"] for r in rows if r["wnSpeed"] >= th]
        if lo and hi:
            cands.append({"modelSpeedBelow": th, "below": stats(lo), "atOrAbove": stats(hi)})
    out["speedThresholds"] = cands
    res = path.with_name("analysis.json")
    res.write_text(json.dumps(out, indent=1))
    print(json.dumps(out, indent=1))


if __name__ == "__main__":
    main()
