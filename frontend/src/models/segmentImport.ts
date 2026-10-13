/**
 * Search segments drawn by the planning team (CalTopo / SARTopo / Google Earth exports): polygons
 * with names from KML or GeoJSON. Pure; no DOM. Coordinates come back as [lon, lat].
 */

export interface ImportedPolygon {
  name: string;
  /** outer ring, [lon, lat] */
  ring: [number, number][];
}

function kmlCoords(text: string): [number, number][] {
  return text
    .trim()
    .split(/\s+/)
    .map((t) => t.split(',').map(Number))
    .filter((v) => v.length >= 2 && Number.isFinite(v[0]) && Number.isFinite(v[1]))
    .map((v) => [v[0], v[1]] as [number, number]);
}

function parseKml(text: string): ImportedPolygon[] {
  const out: ImportedPolygon[] = [];
  const marks = text.match(/<Placemark\b[\s\S]*?<\/Placemark>/g) ?? [];
  marks.forEach((pm, k) => {
    const name = (/<name>\s*(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?\s*<\/name>/.exec(pm)?.[1] ?? '').trim() || `Segment ${k + 1}`;
    const polys = pm.match(/<Polygon\b[\s\S]*?<\/Polygon>/g) ?? [];
    polys.forEach((poly, j) => {
      const outer = /<outerBoundaryIs>[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>/.exec(poly)?.[1];
      if (!outer) return;
      const ring = kmlCoords(outer);
      if (ring.length >= 3) out.push({ name: polys.length > 1 ? `${name} (${j + 1})` : name, ring });
    });
  });
  return out;
}

interface GeoFeature {
  type?: string;
  geometry?: { type?: string; coordinates?: unknown } | null;
  properties?: Record<string, unknown> | null;
}

function parseGeoJson(text: string): ImportedPolygon[] {
  const j = JSON.parse(text) as { type?: string; features?: GeoFeature[] } & GeoFeature;
  const feats: GeoFeature[] = j.type === 'FeatureCollection' ? j.features ?? [] : [j];
  const out: ImportedPolygon[] = [];
  feats.forEach((f, k) => {
    const g = f.geometry;
    if (!g) return;
    const p = f.properties ?? {};
    // CalTopo uses `title`; others `name`
    const name = String(p.title ?? p.name ?? p.Name ?? '').trim() || `Segment ${k + 1}`;
    const rings: unknown[] = g.type === 'Polygon' ? [(g.coordinates as unknown[])?.[0]] : g.type === 'MultiPolygon' ? (g.coordinates as unknown[][]).map((pp) => pp?.[0]) : [];
    rings.forEach((r, i) => {
      if (!Array.isArray(r)) return;
      const ring = (r as number[][]).filter((c) => Array.isArray(c) && Number.isFinite(c[0]) && Number.isFinite(c[1])).map((c) => [c[0], c[1]] as [number, number]);
      if (ring.length >= 3) out.push({ name: rings.length > 1 ? `${name} (${i + 1})` : name, ring });
    });
  });
  return out;
}

/** Polygons from a KML or GeoJSON export (detected from the content). */
export function parseSegmentFile(text: string): ImportedPolygon[] {
  const t = text.trimStart();
  if (t.startsWith('{') || t.startsWith('[')) return parseGeoJson(t);
  if (/<kml\b|<Placemark\b/i.test(t)) return parseKml(t);
  throw new Error('Not a KML or GeoJSON file');
}

/** Even–odd point-in-polygon. */
export function pointInRing(xs: number[], ys: number[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = xs.length - 1; i < xs.length; j = i++) {
    if (ys[i] > y !== ys[j] > y && x < ((xs[j] - xs[i]) * (y - ys[i])) / (ys[j] - ys[i]) + xs[i]) inside = !inside;
  }
  return inside;
}

/**
 * Segment id per grid cell from polygons in local metres (cell centres inside a polygon; where
 * polygons overlap, the later one wins). Cells in no polygon, or excluded (water), are −1.
 */
export function rasterizeSegments(polys: { xs: number[]; ys: number[] }[], cols: number, rows: number, centre: (i: number) => [number, number], excluded?: Uint8Array): Int32Array {
  const id = new Int32Array(cols * rows).fill(-1);
  polys.forEach((p, k) => {
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (let i = 0; i < p.xs.length; i++) {
      x0 = Math.min(x0, p.xs[i]);
      x1 = Math.max(x1, p.xs[i]);
      y0 = Math.min(y0, p.ys[i]);
      y1 = Math.max(y1, p.ys[i]);
    }
    for (let i = 0; i < id.length; i++) {
      if (excluded?.[i]) continue;
      const [x, y] = centre(i);
      if (x < x0 || x > x1 || y < y0 || y > y1) continue;
      if (pointInRing(p.xs, p.ys, x, y)) id[i] = k;
    }
  });
  return id;
}
