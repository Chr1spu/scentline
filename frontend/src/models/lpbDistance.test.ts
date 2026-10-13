import { describe, expect, it } from 'vitest';
import { lognormalModel, quantileModel } from './lpbDistance';

describe('distance distributions from published quantiles', () => {
  // Lost Person Behavior: child 1–3, temperate mountains (km)
  const m = quantileModel([0.2, 0.3, 0.6, 4.5]);
  it('passes through all four published quantiles', () => {
    expect(m.cdf(200)).toBeCloseTo(0.25, 6);
    expect(m.cdf(300)).toBeCloseTo(0.5, 6);
    expect(m.cdf(600)).toBeCloseTo(0.75, 6);
    expect(m.cdf(4500)).toBeCloseTo(0.95, 6);
    expect(m.quantile(0.5)).toBeCloseTo(300, 0);
  });
  it('is a proper, increasing CDF with a finite tail', () => {
    let prev = 0;
    for (let d = 10; d < 60000; d *= 1.1) {
      const f = m.cdf(d);
      expect(f).toBeGreaterThanOrEqual(prev - 1e-12);
      expect(m.areaDensity(d)).toBeGreaterThanOrEqual(0);
      prev = f;
    }
    expect(m.cdf(1e5)).toBeGreaterThan(0.99);
  });
  it('density integrates (over area) to the CDF', () => {
    let acc = 0;
    let r = 1;
    while (r < 2000) {
      const dr = 1;
      acc += m.areaDensity(r + dr / 2) * 2 * Math.PI * (r + dr / 2) * dr;
      r += dr;
    }
    expect(acc).toBeCloseTo(m.cdf(2000) - m.cdf(1), 2);
  });
  it('keeps the heavy tail a quartile-fitted log-normal would lose', () => {
    const ln = lognormalModel(300, Math.log(600 / 200) / 1.349);
    expect(ln.quantile(0.95)).toBeLessThan(1500);
    expect(m.quantile(0.95)).toBeCloseTo(4500, -1);
  });
});

describe('adult, activity unknown (blend of the adult categories)', () => {
  it('lies between its categories and is weighted by their cases', async () => {
    const { PROFILES } = await import('../config/modelParams');
    const { distanceModelFor } = await import('./lpbDistance');
    const adult = distanceModelFor(PROFILES.adult, 'mtn');
    const hiker = distanceModelFor(PROFILES.hiker, 'mtn').model.quantile(0.5);
    const despondent = distanceModelFor(PROFILES.despondent, 'mtn').model.quantile(0.5);
    const med = adult.model.quantile(0.5);
    expect(med).toBeGreaterThan(despondent);
    expect(med).toBeLessThan(hiker);
    expect(adult.table!.n).toBeGreaterThan(1000); // hikers alone are 568 cases in mountains
    expect(adult.model.cdf(1e5)).toBeGreaterThan(0.98);
  });
  it('every person type has a usable distance model in every terrain', async () => {
    const { PROFILES } = await import('../config/modelParams');
    const { distanceModelFor } = await import('./lpbDistance');
    for (const [id, p] of Object.entries(PROFILES)) {
      if (!p.lpb) continue;
      for (const t of ['mtn', 'flat', 'dryMtn', 'dryFlat', 'urban'] as const) {
        const m = distanceModelFor(p, t).model;
        const q50 = m.quantile(0.5);
        expect(q50, `${id} ${t}`).toBeGreaterThan(10);
        expect(q50, `${id} ${t}`).toBeLessThan(20000);
      }
    }
  });
});
