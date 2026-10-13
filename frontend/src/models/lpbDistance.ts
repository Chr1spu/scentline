/**
 * Distance from the last known point (IPP) as a probability distribution, built from the four
 * published quantiles of Lost Person Behavior (Koester 2008): 25%, 50%, 75% and 95% of subjects are
 * found within these crow's-flight distances. A single log-normal fitted to the quartiles badly
 * underestimates the long tails in these tables (e.g. children 1–3 in mountains: 95% within 4.5 km,
 * a log-normal through the quartiles would say ~1.1 km), so the CDF goes through all four points:
 *   - below the 25% distance: area-uniform around the IPP (CDF ∝ d²);
 *   - between 25% and 95%: a monotone cubic (Fritsch–Carlson) in ln d through the quantiles;
 *   - beyond 95%: an exponential tail in ln d, continuous in slope with the 75–95% segment.
 * Pure; no React/three.
 */

import type { DistanceTable, ProfileParams, TerrainClass } from '../config/modelParams';

/** Nearest available table when a terrain class has no data for a profile. */
const FALLBACK: Record<TerrainClass, TerrainClass[]> = {
  mtn: ['mtn', 'flat', 'dryMtn', 'dryFlat', 'urban'],
  flat: ['flat', 'mtn', 'dryFlat', 'dryMtn', 'urban'],
  dryMtn: ['dryMtn', 'dryFlat', 'mtn', 'flat', 'urban'],
  dryFlat: ['dryFlat', 'dryMtn', 'flat', 'mtn', 'urban'],
  urban: ['urban', 'flat', 'mtn', 'dryFlat', 'dryMtn'],
};

/** The distance model for a profile in a terrain class, with the table actually used. */
export function distanceModelFor(profile: ProfileParams, terrain: TerrainClass): { model: DistanceModel; used: TerrainClass | null; table: DistanceTable | null } {
  if (profile.lpb) {
    for (const t of FALLBACK[terrain]) {
      const tab = profile.lpb.distanceKm[t];
      if (tab) return { model: quantileModel(tab.q), used: t, table: tab };
    }
  }
  return { model: lognormalModel(profile.medianM, profile.spread), used: null, table: null };
}

export interface DistanceModel {
  /** share found within d metres */
  cdf(dM: number): number;
  /** per-unit-area density at distance d (for a grid cell weight), unnormalised scale ok */
  areaDensity(dM: number): number;
  /** distance (m) within which a share p is found */
  quantile(p: number): number;
}

const P = [0.25, 0.5, 0.75, 0.95];

/** Quantiles in km: [q25, q50, q75, q95]; strictly increasing (ties are nudged apart). */
export function quantileModel(qKm: [number, number, number, number]): DistanceModel {
  const q = qKm.map((v) => v * 1000);
  for (let i = 1; i < 4; i++) if (q[i] <= q[i - 1]) q[i] = q[i - 1] * 1.05;
  const x = q.map(Math.log);
  // knot slopes dF/dx: below q25 F = 0.25 e^{2(x − x25)} (slope 0.5 at x25); tail slope k·0.05
  const dTail = x[3] - x[2];
  const k = 0.2 / dTail / 0.05; // tail decay rate, matching the 75–95% secant slope at x95
  const sec = [0, 1, 2].map((i) => (P[i + 1] - P[i]) / (x[i + 1] - x[i]));
  const m = [0.5, 0, 0, 0.05 * k];
  for (let i = 1; i < 3; i++) m[i] = sec[i - 1] * sec[i] > 0 ? (2 * sec[i - 1] * sec[i]) / (sec[i - 1] + sec[i]) : 0; // harmonic mean
  // Fritsch–Carlson limiter keeps the cubic monotone
  for (let i = 0; i < 3; i++) {
    const a = m[i] / sec[i];
    const b = m[i + 1] / sec[i];
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      m[i] = t * a * sec[i];
      m[i + 1] = t * b * sec[i];
    }
  }
  const herm = (i: number, xx: number): [number, number] => {
    const h = x[i + 1] - x[i];
    const t = (xx - x[i]) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    const F = (2 * t3 - 3 * t2 + 1) * P[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * P[i + 1] + (t3 - t2) * h * m[i + 1];
    const dF = ((6 * t2 - 6 * t) * P[i] + (3 * t2 - 4 * t + 1) * h * m[i] + (-6 * t2 + 6 * t) * P[i + 1] + (3 * t2 - 2 * t) * h * m[i + 1]) / h;
    return [F, dF];
  };
  const evalX = (xx: number): [number, number] => {
    if (xx <= x[0]) {
      const F = 0.25 * Math.exp(2 * (xx - x[0]));
      return [F, 2 * F];
    }
    if (xx >= x[3]) {
      const F = 1 - 0.05 * Math.exp(-k * (xx - x[3]));
      return [F, k * (1 - F)];
    }
    const i = xx < x[1] ? 0 : xx < x[2] ? 1 : 2;
    return herm(i, xx);
  };
  return {
    cdf: (d) => (d <= 0 ? 0 : evalX(Math.log(d))[0]),
    areaDensity: (d) => {
      const dd = Math.max(d, 1);
      // dF/dd = (dF/dx)/d; per area: divide by 2πd
      return evalX(Math.log(dd))[1] / (2 * Math.PI * dd * dd);
    },
    quantile: (p) => {
      let lo = Math.log(1);
      let hi = Math.log(1e6);
      for (let it = 0; it < 60; it++) {
        const mid = (lo + hi) / 2;
        if (evalX(mid)[0] < p) lo = mid;
        else hi = mid;
      }
      return Math.exp((lo + hi) / 2);
    },
  };
}

/** Log-normal (median m, spread σ of ln d), for profiles described that way (pets). */
export function lognormalModel(medianM: number, spread: number): DistanceModel {
  const erf = (z: number) => {
    const t = 1 / (1 + 0.3275911 * Math.abs(z));
    const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z);
    return z >= 0 ? y : -y;
  };
  const cdf = (d: number) => (d <= 0 ? 0 : 0.5 * (1 + erf(Math.log(d / medianM) / (spread * Math.SQRT2))));
  return {
    cdf,
    areaDensity: (d) => {
      const dd = Math.max(d, 1);
      const z = Math.log(dd / medianM) / spread;
      return Math.exp(-0.5 * z * z) / (dd * spread * Math.sqrt(2 * Math.PI)) / (2 * Math.PI * dd);
    },
    quantile: (p) => {
      let lo = 0;
      let hi = 1e6;
      for (let it = 0; it < 80; it++) {
        const mid = (lo + hi) / 2;
        if (cdf(mid) < p) lo = mid;
        else hi = mid;
      }
      return (lo + hi) / 2;
    },
  };
}
