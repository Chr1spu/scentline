import { useMemo } from 'react';
import type { AreaBundle } from '../api/types';
import { COLORS } from '../config/constants';
import { toScene } from '../geo/heights';
import { useStore } from '../state/store';
import { CasedLine, Label } from './primitives';

/** Densify a ring every ~20 m so it hugs the terrain. */
function densify(ring: [number, number][]): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < ring.length; i++) {
    const [ax, ay] = ring[i];
    const [bx, by] = ring[i + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 20));
    for (let k = 0; k < n; k++) out.push([ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n]);
  }
  if (ring.length) out.push(ring[ring.length - 1]);
  return out;
}

/** Offset a polyline sideways by d metres (positive = to the left of travel). */
function offset(pts: [number, number][], d: number): [number, number][] {
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    return [p[0] - (dy / l) * d, p[1] + (dx / l) * d] as [number, number];
  });
}

const SPLIT_M = 7;

/**
 * Search segment borders, each drawn once. An assigned segment's border is in its team's colour;
 * where two assigned segments meet, the border splits into two parallel lines, each colour on its
 * own segment's side.
 */
export function SegmentsLayer({ bundle }: { bundle: AreaBundle }) {
  const seg = useStore((s) => s.segments);
  const visible = useStore((s) => s.layers.segments);
  const mode = useStore((s) => s.assignMode);
  const deployments = useStore((s) => s.deployments);
  const assigned = useMemo(() => {
    const m = new Map<number, number>();
    for (const d of deployments) if (d.segment) m.set(d.segment.index, d.team);
    return m;
  }, [deployments]);
  const lines = useMemo(() => {
    if (!seg) return [];
    const teamColor = (k: number) => {
      const t = assigned.get(k);
      return t ? COLORS.team[(t - 1) % COLORS.team.length] : null;
    };
    const out: { key: string; pts: [number, number][]; color: string; strong: boolean }[] = [];
    seg.borders.forEach((b, i) => {
      const pts = densify(b.pts);
      const cl = b.left >= 0 ? teamColor(b.left) : null;
      const cr = b.right >= 0 ? teamColor(b.right) : null;
      if (cl && cr) {
        // two assigned neighbours: split the border, each colour on its own side
        out.push({ key: `${i}l`, pts: offset(pts, SPLIT_M), color: cl, strong: true });
        out.push({ key: `${i}r`, pts: offset(pts, -SPLIT_M), color: cr, strong: true });
      } else if (cl || cr) {
        out.push({ key: `${i}`, pts, color: (cl ?? cr)!, strong: true });
      } else {
        out.push({ key: `${i}`, pts, color: '#f4f0e6', strong: false });
      }
    });
    // light lines underneath, team colours on top
    return out.sort((a, b) => Number(a.strong) - Number(b.strong));
  }, [seg, assigned]);
  if (!seg || !visible || mode !== 'segments') return null;
  return (
    <group>
      {lines.map((l) =>
        l.strong ? (
          <CasedLine key={l.key} bundle={bundle} pts={l.pts} color={l.color} width={4} casing={2} lift={6} />
        ) : (
          <CasedLine key={l.key} bundle={bundle} pts={l.pts} color={l.color} width={2} casing={1.5} lift={4} opacity={0.9} />
        ),
      )}
      {seg.centroid.map(([x, y], k) => {
        const team = assigned.get(k);
        return (
          <Label key={k} position={toScene(bundle, x, y, team ? 40 : 15)} tone={team ? 'amber' : 'default'}>
            {seg.names[k]}
            {team ? ` · Team ${team}` : ''}
          </Label>
        );
      })}
    </group>
  );
}
