"""Compare modelled wind with weather-station observations (Synoptic / MesoWest).

    docker exec -e SYNOPTIC_TOKEN=... scentline-backend-1 python scripts/validate_wind.py [--quick]

For RAWS fire-weather stations (federal network, standard 6 m mast, mostly in rough terrain) in
several mountain regions, an area is created centred on each station and, for chosen afternoons
and evenings, the backend's own wind pipeline is run: WindNinja (domain-average initialisation
from Open-Meteo's hourly wind, diurnal on, as the planner uses for past dates) and the slope-wind
fallback. Each hour, the modelled wind at the station is compared with the station's observation
nearest that hour. Writes cache/validation/samples.json; scripts/analyse_wind.py summarises it.

Synoptic's free tier only serves the last ~6 days of observations, so the dates are the last five
days. For dates that recent the backend's input wind is Open-Meteo's forecast-model output (not a
reanalysis), close to what the planner would have had.
"""
from __future__ import annotations

import datetime as dt
import json
import math
import os
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

import numpy as np
from pyproj import Transformer

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import windninja  # noqa: E402
from app.areas import create_area  # noqa: E402
from app.weather import fetch_weather, hour_entry, resolve_timezone  # noqa: E402

TOKEN = os.environ.get("SYNOPTIC_TOKEN", "")
API = "https://api.synopticdata.com/v2"
OUT = Path(__file__).resolve().parents[1] / "cache" / "validation"
QUICK = "--quick" in sys.argv

# mountain regions (state, lat, lon of a centre, radius in miles); RAWS = network 2
REGIONS = [
    ("NY", 42.15, -74.25, 60),   # Catskills / Adirondack foothills
    ("MT", 46.20, -114.20, 60),  # Bitterroot
    ("CO", 39.60, -105.80, 60),  # Front Range
    ("WA", 47.60, -121.40, 60),  # Cascades
    ("NC", 35.60, -83.10, 60),   # Southern Appalachians
    ("CA", 38.60, -120.20, 60),  # Sierra Nevada
]
PER_REGION = 1 if QUICK else 2
_today = dt.date.today()
DATES = [(_today - dt.timedelta(days=k)).isoformat() for k in ([2] if QUICK else [1, 2, 3, 4, 5])]
HOURS = list(range(13, 22))  # 13:00–21:00 local: afternoon into the evening transition


def get(path: str, **params) -> dict:
    params["token"] = TOKEN
    url = f"{API}/{path}?{urllib.parse.urlencode(params)}"
    for attempt in range(3):
        try:
            with urllib.request.urlopen(url, timeout=60) as r:
                return json.loads(r.read())
        except Exception:  # noqa: BLE001
            time.sleep(3 * (attempt + 1))
    raise RuntimeError(f"Synoptic request failed: {path}")


def stations_for(region) -> list[dict]:
    state, lat, lon, miles = region
    j = get("stations/metadata", radius=f"{lat},{lon},{miles}", network=2, status="active",
            vars="wind_speed,wind_direction", complete=1, limit=40)
    st = [s for s in j.get("STATION", []) if s.get("ELEVATION")]
    # mountain stations: from the upper half by elevation (the 60th and 90th percentiles)
    st.sort(key=lambda s: float(s["ELEVATION"]))
    if not st:
        return []
    ranks = [0.75] if PER_REGION == 1 else [0.6, 0.9]
    idx = sorted({min(len(st) - 1, round(p * (len(st) - 1))) for p in ranks})
    return [st[i] for i in idx]


def observations(stid: str, date: str, utc_offset: int) -> dict[int, tuple[float, float]]:
    """Local hour -> (speed m/s, direction from, deg): the observation nearest each hour (±30 min)."""
    d0 = dt.datetime.fromisoformat(date) + dt.timedelta(hours=HOURS[0] - 1) - dt.timedelta(seconds=utc_offset)
    d1 = dt.datetime.fromisoformat(date) + dt.timedelta(hours=HOURS[-1] + 1) - dt.timedelta(seconds=utc_offset)
    j = get("stations/timeseries", stid=stid, start=d0.strftime("%Y%m%d%H%M"), end=d1.strftime("%Y%m%d%H%M"),
            vars="wind_speed,wind_direction", units="metric")
    st = (j.get("STATION") or [None])[0]
    if not st:
        return {}
    ob = st["OBSERVATIONS"]
    times = [dt.datetime.fromisoformat(t.replace("Z", "+00:00")).replace(tzinfo=None) + dt.timedelta(seconds=utc_offset) for t in ob["date_time"]]
    spd = ob.get("wind_speed_set_1") or []
    drn = ob.get("wind_direction_set_1") or []
    out: dict[int, tuple[float, float]] = {}
    base = dt.datetime.fromisoformat(date)
    for h in HOURS:
        target = base + dt.timedelta(hours=h)
        best = None
        for t, s, d in zip(times, spd, drn):
            if s is None or d is None:
                continue
            gap = abs((t - target).total_seconds())
            if gap <= 1800 and (best is None or gap < best[0]):
                best = (gap, float(s), float(d))
        if best:
            out[h] = (best[1], best[2])
    return out


def sample_model(uv: np.ndarray, meta: dict, x: float, y: float) -> tuple[float, float]:
    """Mean wind over the 3×3 cells around (x, y) in the grid's CRS -> (speed, direction from)."""
    c = int(round((x - meta["originX"]) / meta["cellSize"] - 0.5))
    r = int(round((meta["originY"] - y) / meta["cellSize"] - 0.5))
    u = float(np.mean(uv[0, max(r - 1, 0):r + 2, max(c - 1, 0):c + 2]))
    v = float(np.mean(uv[1, max(r - 1, 0):r + 2, max(c - 1, 0):c + 2]))
    return math.hypot(u, v), (math.degrees(math.atan2(-u, -v)) + 360) % 360


def main() -> None:
    if not TOKEN:
        sys.exit("set SYNOPTIC_TOKEN")
    OUT.mkdir(parents=True, exist_ok=True)
    out_path = OUT / ("samples_quick.json" if QUICK else "samples.json")
    samples = json.loads(out_path.read_text()) if out_path.exists() else []
    done = {(s["stid"], s["date"]) for s in samples}
    for region in REGIONS:
        for st in stations_for(region):
            lat, lon = float(st["LATITUDE"]), float(st["LONGITUDE"])
            tz = resolve_timezone(lat, lon)
            area = create_area(lat, lon, tz)
            to_utm = Transformer.from_crs("EPSG:4326", f"EPSG:{area.epsg}", always_xy=True)
            sx, sy = to_utm.transform(lon, lat)
            for date in DATES:
                if (st["STID"], date) in done:
                    continue
                t0 = time.time()
                print(f"{region[0]} {st['STID']} {st['NAME']} ({float(st['ELEVATION']):.0f} ft) {date} ...", flush=True)
                try:
                    weather = fetch_weather(area, date)
                    obs = observations(st["STID"], date, weather["utcOffsetSeconds"])
                    if len(obs) < 4:
                        print("  too few observations, skipped", flush=True)
                        continue
                    windninja.compute_fallback(area, date, HOURS, weather)
                    res = windninja.run_windninja(area, date, HOURS)
                except Exception as e:  # noqa: BLE001
                    print(f"  failed: {e}", flush=True)
                    continue
                for h in HOURS:
                    wn = windninja.load_wind(area, date, h, "windninja")
                    fb = windninja.load_wind(area, date, h, "fallback")
                    if h not in obs or wn is None or fb is None:
                        continue
                    w = hour_entry(weather, h)
                    s_wn, d_wn = sample_model(wn, area.detail, sx, sy)
                    s_fb, d_fb = sample_model(fb, area.detail, sx, sy)
                    samples.append({
                        "region": region[0], "stid": st["STID"], "name": st["NAME"], "elevFt": float(st["ELEVATION"]),
                        "date": date, "hour": h, "method": res.get("method"),
                        "obsSpeed": obs[h][0], "obsDir": obs[h][1],
                        "wnSpeed": s_wn, "wnDir": d_wn, "fbSpeed": s_fb, "fbDir": d_fb,
                        "inSpeed": float(w["windSpeed"]), "inDir": float(w["windDirection"]),
                        "cloud": float(w["cloudCover"]),
                    })
                out_path.write_text(json.dumps(samples))
                print(f"  {sum(1 for s in samples if s['stid'] == st['STID'] and s['date'] == date)} hours in {time.time() - t0:.0f} s", flush=True)
    print(f"wrote {out_path} ({len(samples)} samples)")


if __name__ == "__main__":
    main()
