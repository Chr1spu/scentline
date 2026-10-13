import { describe, expect, it } from 'vitest';
import { cellCenterLocal, frameOf, gridMap, type GridMeta } from '../geo/grid';
import { parseSegmentFile, rasterizeSegments } from './segmentImport';
import { segmentationFromIds } from './segments';

const KML = `<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>
<Placemark><name><![CDATA[AA]]></name><Polygon><outerBoundaryIs><LinearRing><coordinates>
-74.21,42.16,0 -74.20,42.16,0 -74.20,42.15,0 -74.21,42.15,0 -74.21,42.16,0
</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>
<Placemark><name>Trail point</name><Point><coordinates>-74.2,42.1,0</coordinates></Point></Placemark>
</Document></kml>`;

const GEOJSON = JSON.stringify({
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', properties: { title: 'AB', class: 'Assignment' }, geometry: { type: 'Polygon', coordinates: [[[-74.2, 42.16], [-74.19, 42.16], [-74.19, 42.15], [-74.2, 42.15], [-74.2, 42.16]]] } },
    { type: 'Feature', properties: { title: 'Road' }, geometry: { type: 'LineString', coordinates: [[-74.2, 42.1], [-74.1, 42.1]] } },
    { type: 'Feature', properties: { name: 'Split' }, geometry: { type: 'MultiPolygon', coordinates: [[[[0, 0], [1, 0], [1, 1], [0, 0]]], [[[2, 2], [3, 2], [3, 3], [2, 2]]]] } },
  ],
});

describe('importing planners’ segments', () => {
  it('reads named polygons from CalTopo KML (points and lines ignored)', () => {
    const p = parseSegmentFile(KML);
    expect(p.map((x) => x.name)).toEqual(['AA']);
    expect(p[0].ring[0]).toEqual([-74.21, 42.16]);
  });
  it('reads GeoJSON titles, polygons and multipolygons', () => {
    const p = parseSegmentFile(GEOJSON);
    expect(p.map((x) => x.name)).toEqual(['AB', 'Split (1)', 'Split (2)']);
  });
  it('rejects other files', () => {
    expect(() => parseSegmentFile('hello')).toThrow();
  });
  it('places polygons on the grid, keeping their names; ground outside them is unsegmented', () => {
    const meta: GridMeta = { crs: 'EPSG:32618', originX: 500000, originY: 4600000, cellSize: 10, cols: 40, rows: 40, noData: -9999 };
    const map = gridMap(meta, frameOf(meta));
    const polys = [
      { name: 'West', xs: [-200, 0, 0, -200], ys: [200, 200, -200, -200] },
      { name: 'Far away', xs: [5000, 5100, 5100], ys: [0, 0, 100] },
      { name: 'East', xs: [0, 100, 100, 0], ys: [200, 200, -200, -200] },
    ];
    const ids = rasterizeSegments(polys, 40, 40, (i) => cellCenterLocal(map, i));
    const seg = segmentationFromIds(ids, map, polys.map((p) => p.name));
    expect(seg.n).toBe(2); // the far one has no cells
    expect(seg.names).toEqual(['West', 'East']);
    expect(seg.areaM2[0]).toBeCloseTo(200 * 400, -3);
    expect(seg.areaM2[1]).toBeCloseTo(100 * 400, -3);
    expect(Array.from(seg.id).filter((v) => v < 0).length).toBe(40 * 40 - (20 + 10) * 40);
  });
});
