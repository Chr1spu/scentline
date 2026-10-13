import { describe, expect, it } from 'vitest';
import { HOTSPOTS } from '../config/modelParams';
import { cellAt, frameOf, gridMap, type GridMeta } from '../geo/grid';
import type { ReceiverDetection } from './detection';
import { blockIndex } from './scent';
import { assignSegments, nameSegments, traceBorders, ringArea, scoreSegments, segmentArea, segmentAt, segmentConditions, segmentHours, sweepDetection } from './segments';
import { SEGMENTS } from '../config/modelParams';

const n = 100;
const meta: GridMeta = { crs: 'EPSG:32618', originX: 500000, originY: 4600000, cellSize: 10, cols: n, rows: n, noData: -9999 };
const map = gridMap(meta, frameOf(meta));
const none = new Uint8Array(n * n);
const noDet = (nRecv: number): ReceiverDetection => ({ start: new Int32Array(nRecv + 1), src: new Int32Array(0), det: new Float32Array(0) });

describe('segmentation', () => {
  it('covers the area with segments near the target size, named A1, A2, …', () => {
    const seg = segmentArea({ map, boundary: none, excluded: none, targetM2: 100_000 });
    expect(seg.n).toBeGreaterThanOrEqual(7);
    expect(seg.n).toBeLessThanOrEqual(14);
    for (let i = 0; i < seg.id.length; i++) expect(seg.id[i]).toBeGreaterThanOrEqual(0);
    for (const a of seg.areaM2) {
      expect(a).toBeGreaterThan(30_000);
      expect(a).toBeLessThan(250_000);
    }
    expect(new Set(seg.names).size).toBe(seg.n);
    expect(seg.names).toContain('A1');
    // A is the northernmost row
    const a1 = seg.names.indexOf('A1');
    expect(Math.max(...seg.centroid.map((c) => c[1]))).toBeCloseTo(Math.max(...seg.centroid.filter((_, k) => seg.names[k].startsWith('A')).map((c) => c[1])), 6);
    expect(a1).toBeGreaterThanOrEqual(0);
  });
  it('puts edges on features: segments rarely straddle a stream', () => {
    const boundary = new Uint8Array(n * n);
    for (let c = 0; c < n; c++) boundary[47 * n + c] = 1; // a stream across the middle, slightly off the seed rows
    const seg = segmentArea({ map, boundary, excluded: none, targetM2: 100_000 });
    let straddle = 0;
    for (let k = 0; k < seg.n; k++) {
      let north = 0;
      let south = 0;
      for (let i = 0; i < seg.id.length; i++) {
        if (seg.id[i] !== k || boundary[i]) continue;
        if (Math.floor(i / n) < 47) north++;
        else south++;
      }
      if (Math.min(north, south) > 0.1 * (north + south)) straddle++;
    }
    expect(straddle).toBe(0);
  });
  it('leaves water out', () => {
    const excluded = new Uint8Array(n * n);
    for (let r = 0; r < n; r++) for (let c = 80; c < n; c++) excluded[r * n + c] = 1;
    const seg = segmentArea({ map, boundary: none, excluded, targetM2: 100_000 });
    expect(seg.id[50 * n + 90]).toBe(-1);
    expect(seg.id[50 * n + 10]).toBeGreaterThanOrEqual(0);
  });
  it('traces outlines that enclose each segment’s area', () => {
    const seg = segmentArea({ map, boundary: none, excluded: none, targetM2: 100_000 });
    for (let k = 0; k < seg.n; k++) {
      const outer = seg.rings[k][0];
      // simplification shaves a little off the staircase; within 10%
      expect(Math.abs(Math.abs(ringArea(outer)) - seg.areaM2[k]) / seg.areaM2[k]).toBeLessThan(0.1);
    }
  });
  it('names rows north to south and west to east', () => {
    expect(
      nameSegments(
        [
          [0, 100],
          [-100, 100],
          [0, -100],
        ],
        150,
      ),
    ).toEqual(['A2', 'A1', 'B1']);
  });
});

describe('segment scoring and assignment', () => {
  const seg = segmentArea({ map, boundary: none, excluded: none, targetM2: 100_000 });
  const blocks = blockIndex(n, n, HOTSPOTS.recvBlockCells, HOTSPOTS.srcBlockCells);
  const q = new Float32Array(blocks.nSrc);
  const home = cellAt(map, -200, 200);
  q[blocks.srcOf[home]] = 1;
  const windAt = () => ({ u: 1.5, v: 0 }); // toward the east
  const scores = scoreSegments({ seg, map, blocks, det: noDet(blocks.nRecv), q, deployable: new Uint8Array(n * n).fill(1), windAt });
  const homeSeg = seg.id[home];
  it('gives the segment holding the probability its POA and the walk-through POD', () => {
    const s = scores[homeSeg];
    expect(s.poa).toBeCloseTo(1, 5);
    expect(s.podInside).toBeCloseTo(HOTSPOTS.dogPOD * sweepDetection(1), 5);
    expect(s.podInside).toBeCloseTo(0.5, 2); // NASAR's working average for a dog team
    expect(s.fromOutside).toBe(0);
    for (const o of scores) if (o.seg !== homeSeg) expect(o.value).toBe(0);
  });
  it('search-theory detection rises with scent conditions and saturates', () => {
    expect(sweepDetection(0.3)).toBeLessThan(sweepDetection(1));
    expect(sweepDetection(1)).toBeLessThan(sweepDetection(1.5));
    expect(sweepDetection(5)).toBeCloseTo(sweepDetection(1.5), 9); // clamped
    expect(sweepDetection(0)).toBeGreaterThan(0); // never zero: the team still walks the ground
  });
  it('enters from the downwind edge and works upwind', () => {
    const s = scores[homeSeg];
    expect(s.entry[0]).toBeGreaterThan(seg.centroid[homeSeg][0]);
    expect(s.upwind[0]).toBeCloseTo(-1, 6);
    expect(s.hours).toBeGreaterThan(0.3);
  });
  it('credits scent drifting in from outside the segment', () => {
    // a receiver in another segment that detects the home source strongly
    const other = segmentAt(seg, map, 300, -300);
    const r = blocks.recvOf[cellAt(map, 300, -300)];
    const det: ReceiverDetection = { start: new Int32Array(blocks.nRecv + 1), src: Int32Array.from([blocks.srcOf[home]]), det: Float32Array.from([0.9]) };
    for (let j = r + 1; j <= blocks.nRecv; j++) det.start[j] = 1;
    const sc = scoreSegments({ seg, map, blocks, det, q, deployable: new Uint8Array(n * n).fill(1), windAt });
    expect(sc[other].fromOutside).toBeCloseTo(HOTSPOTS.dogPOD * 0.9, 5);
  });
  it('assigns the best segment first and stops when the rest add nothing', () => {
    const a = assignSegments(scores, q, 3);
    expect(a.length).toBe(1);
    expect(a[0].score.seg).toBe(homeSeg);
  });
});

describe('terrain-aware segments', () => {
  const seg = segmentArea({ map, boundary: none, excluded: none, targetM2: 100_000 });
  it('takes longer on ground steeper than the area typically is (Tobler)', () => {
    const flat = segmentHours(seg, new Float32Array(n * n), 10);
    const uniform = segmentHours(seg, new Float32Array(n * n).fill(30), 10);
    for (let k = 0; k < seg.n; k++) {
      expect(flat[k]).toBeCloseTo(seg.areaM2[k] / SEGMENTS.teamRateM2PerH, 6);
      expect(uniform[k]).toBeCloseTo(flat[k], 6); // all equally steep: the team's usual pace
    }
    const slope = new Float32Array(n * n);
    for (let i = 0; i < n * n; i++) slope[i] = i % n < n / 2 ? 30 : 0; // west half steep
    const mixed = segmentHours(seg, slope, 10);
    const west = seg.centroid.findIndex(([x]) => x < -200);
    const east = seg.centroid.findIndex(([x]) => x > 200);
    expect(mixed[west] / seg.areaM2[west]).toBeGreaterThan((2 * mixed[east]) / seg.areaM2[east]);
    let total = 0;
    let areaSum = 0;
    for (let k = 0; k < seg.n; k++) {
      total += mixed[k];
      areaSum += seg.areaM2[k];
    }
    expect(total).toBeCloseTo(areaSum / SEGMENTS.teamRateM2PerH, 3); // the area as a whole at the usual pace
  });
  it('reads scent conditions per segment, falling back where there is no scent', () => {
    const heat = new Float32Array(n * n);
    const ref = new Float32Array(n * n);
    for (let i = 0; i < n * n; i++) {
      ref[i] = 1;
      heat[i] = seg.id[i] === 0 ? 0.3 : 1; // segment 0 loses most of its scent
    }
    ref.fill(0, 0, 0);
    const c = segmentConditions(seg, heat, ref, 0.8);
    expect(c[0]).toBeCloseTo(0.3, 5);
    expect(c[1]).toBeCloseTo(1, 5);
    const none2 = segmentConditions(seg, new Float32Array(n * n), new Float32Array(n * n), 0.8);
    expect(none2[0]).toBeCloseTo(0.8, 5);
  });
  it('lowers POD for poor scent and for a segment too big for one assignment', () => {
    const blocks = blockIndex(n, n, HOTSPOTS.recvBlockCells, HOTSPOTS.srcBlockCells);
    const q = new Float32Array(blocks.nSrc).fill(1 / blocks.nSrc);
    const base = { seg, map, blocks, det: noDet(blocks.nRecv), q, deployable: new Uint8Array(n * n).fill(1), windAt: () => ({ u: 1, v: 0 }) };
    const good = scoreSegments(base)[0].podInside;
    const poor = scoreSegments({ ...base, conditions: 0.3 })[0].podInside;
    const long = scoreSegments({ ...base, hours: Float64Array.from(seg.areaM2, () => 2 * SEGMENTS.assignmentH) })[0].podInside;
    expect(poor).toBeLessThan(good);
    expect(long).toBeLessThan(good);
    expect(long).toBeCloseTo(HOTSPOTS.dogPOD * sweepDetection(1, 0.5), 5);
  });
});

describe('segment borders', () => {
  it('traces each shared border once, with the lower id on its left', () => {
    const m = gridMap({ ...meta, cols: 10, rows: 10 }, frameOf({ ...meta, cols: 10, rows: 10 }));
    const id = new Int32Array(100);
    for (let i = 0; i < 100; i++) id[i] = i % 10 < 5 ? 0 : 1; // west half 0, east half 1
    const b = traceBorders(id, m);
    const shared = b.filter((x) => x.left === 0 && x.right === 1);
    expect(shared.length).toBe(1);
    const pts = shared[0].pts;
    expect(pts.length).toBe(11); // the full height, one vertex per cell edge
    // moving north (y increasing) region 0 (west) is on the left
    expect(pts[pts.length - 1][1]).toBeGreaterThan(pts[0][1]);
    for (const [x] of pts) expect(x).toBeCloseTo(pts[0][0], 6);
    // nothing along the grid's outer edge (the focus-square frame marks it)
    expect(b.length).toBe(1);
    // but a lake inside the area does get a shoreline border
    id[55] = -1;
    expect(traceBorders(id, m).some((x) => x.left === -1 && x.right === 1)).toBe(true);
  });
  it('real segmentations: every neighbouring pair shares exactly one border line set, no duplicates', () => {
    const seg = segmentArea({ map, boundary: none, excluded: none, targetM2: 100_000 });
    const keys = seg.borders.map((x) => `${x.left},${x.right}`);
    for (const x of seg.borders) expect(x.left).toBeLessThan(x.right === -1 ? Infinity : x.right + 1e-9);
    // no border appears in both orientations
    for (const x of seg.borders) expect(keys).not.toContain(`${x.right},${x.left}`);
  });
});
