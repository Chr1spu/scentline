import { useMemo, useState, type ReactNode } from 'react';
import { Link } from '../router';
import { computeDetailAt, deployTeams, fmtTime, importSearchTrack, importSegments, releaseScent, removeAlert, removeSearched, resetSearch, scheduleHeat, setOnsiteWind, startMoveAlert, useAutoSegments, windConfidenceAt } from '../state/controller';
import { LAYER_LABELS, useStore, type LayerId, type Tool } from '../state/store';
import { Icon } from '../ui/icons';
import { SearchOptions } from './SearchOptions';
import { SourceSection } from './SourceSection';
import { MISSIONS, type SourceKind } from '../config/missions';

const SOURCE_TITLE: Record<SourceKind, string> = { lkp: 'Who is missing', water: 'Where they went in', hides: 'Hides', area: 'Search area', habitat: 'Habitat' };

function Section({ n, title, right, children }: { n?: number; title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="border-b border-rule px-4 py-3.5">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="flex items-center gap-2 font-display text-[15px] font-semibold tracking-tight text-ink">
          {n !== undefined && <span className="num grid h-5 w-5 place-items-center rounded-full bg-sar/15 text-[11px] font-semibold text-sar">{n}</span>}
          {title}
        </h2>
        {right}
      </div>
      {children}
    </section>
  );
}

function ToolButton({ tool, children, title }: { tool: Tool; children: ReactNode; title: string }) {
  const active = useStore((s) => s.tool === tool);
  return (
    <button
      className={`btn btn-sm flex-1 ${active ? 'btn-on' : ''}`}
      title={title}
      aria-pressed={active}
      onClick={() => useStore.getState().set({ tool: active ? 'none' : tool, hover: null, movingAlert: null, focusPreview: tool === 'focus' ? useStore.getState().focusPreview : null })}
    >
      {children}
    </button>
  );
}

function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button className={`btn btn-sm flex-1 ${on ? 'btn-on' : ''}`} aria-pressed={on} onClick={onClick}>
      {children}
    </button>
  );
}

export function ControlPanel() {
  const bundle = useStore((s) => s.bundle);
  const mission = useStore((s) => MISSIONS[s.mission]);
  const teams = useStore((s) => s.teams);
  const mode = useStore((s) => s.mode);
  const layers = useStore((s) => s.layers);
  const tool = useStore((s) => s.tool);
  const focusPreview = useStore((s) => s.focusPreview);
  const alerts = useStore((s) => s.alerts);
  const searched = useStore((s) => s.searched);
  const movingAlert = useStore((s) => s.movingAlert);
  const onsite = useStore((s) => s.onsiteWind);
  const busy = useStore((s) => s.busy);
  const time = useStore((s) => s.time);
  const set = useStore((s) => s.set);
  const toggleLayer = useStore((s) => s.toggleLayer);
  const [wDir, setWDir] = useState('300');
  const [wSpd, setWSpd] = useState('2');
  const [layersOpen, setLayersOpen] = useState(false);
  if (!bundle) return null;
  const c = bundle.config;

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="border-b border-rule px-4 py-3">
        <p className="text-[13px] leading-snug text-ink-2">{mission.id === 'wilderness' && c.truth ? c.scenario : mission.about}</p>
        <div className="mt-2 flex items-center justify-between text-xs text-ink-3">
          <span className="num">
            {c.lat.toFixed(4)}, {c.lon.toFixed(4)}
          </span>
          <Link to="/new" className="text-xs">
            Change area
          </Link>
        </div>
      </div>

      <Section n={1} title={SOURCE_TITLE[mission.source]}>
        <SourceSection />
      </Section>

      <Section n={2} title="Scent">
        <div className="flex gap-1">
          <Toggle on={layers.scent} onClick={() => (layers.scent ? toggleLayer('scent') : releaseScent())}>
            <Icon.Plume size={14} /> {layers.scent ? 'Scent on' : 'Release scent'}
          </Toggle>
          <Toggle
            on={layers.heatmap}
            onClick={() => {
              set({ layers: { ...layers, heatmap: !layers.heatmap, hotspots: !layers.heatmap } });
              if (!layers.heatmap) setTimeout(() => scheduleHeat(0));
            }}
          >
            Heatmap
          </Toggle>
        </div>
      </Section>

      <Section n={3} title="Dog teams">
        <div className="flex items-center gap-1.5">
          <label className="flex items-center gap-1.5 text-[13px] text-ink-2" htmlFor="teams">
            Teams
          </label>
          <input
            id="teams"
            type="number"
            min={1}
            max={6}
            value={teams}
            onChange={(e) => set({ teams: Math.min(6, Math.max(1, Number(e.target.value) || 1)) })}
            className="field !w-14 !py-0.5"
          />
          <button className="btn btn-primary btn-sm flex-1" disabled={!!busy} onClick={deployTeams}>
            <Icon.Dog size={14} /> Deploy at {fmtTime(time)}
          </button>
        </div>
        <AssignMode />
      </Section>

      <Section n={4} title="Search log" right={<button className="text-xs text-ink-3 underline hover:text-ink" onClick={resetSearch}>Reset</button>}>
        <div className="flex gap-1">
          <ToolButton tool="alert" title="Click where a dog alerted (at the time on the time bar)">
            <Icon.Alert size={14} /> Alert
          </ToolButton>
          <ToolButton tool="searched" title="Mark an area searched with nothing found">
            <Icon.Ring size={14} /> Searched
          </ToolButton>
        </div>
        {tool === 'alert' && <p className="mt-1.5 text-xs text-ink-2">{movingAlert !== null ? 'Click the new spot.' : 'Click where the dog alerted.'}</p>}
        {tool === 'searched' && <SearchOptions />}
        <TrackImport />
        {(alerts.length > 0 || searched.length > 0) && (
          <ol className="mt-2 divide-y divide-rule rounded-sm border border-rule bg-card text-xs">
            {[
              ...alerts.map((a, i) => ({ key: `a${a.id}`, t: a.t, text: `Alert ${i + 1}`, tone: 'text-[#ff4fa3]', alertId: a.id, searchedId: null as number | null })),
              ...searched.map((s) => ({
                key: `s${s.id}`,
                t: s.t1,
                text: `Searched ${fmtTime(s.t0)}–${fmtTime(s.t1)}, nothing found${s.recheck ? ' (poor scent: recheck)' : ''}`,
                tone: s.recheck ? 'text-sar-dark' : 'text-ink-2',
                alertId: null as number | null,
                searchedId: s.id,
              })),
            ]
              .sort((a, b) => a.t - b.t)
              .map((e) => (
                <li key={e.key} className={`flex items-center gap-2 px-2 py-1 ${e.alertId !== null && movingAlert === e.alertId ? 'bg-amber/10' : ''}`}>
                  <span className="num text-ink-3">{fmtTime(e.t)}</span>
                  <span className={`flex-1 ${e.tone}`}>{e.text}</span>
                  {e.alertId !== null && (
                    <button className="text-ink-3 underline hover:text-ink" title="Set the time bar to the right time, press Move, then click the right spot" onClick={() => startMoveAlert(e.alertId!)}>
                      {movingAlert === e.alertId ? 'click map' : 'move'}
                    </button>
                  )}
                  <button
                    className="text-ink-3 hover:text-ink"
                    aria-label="Remove"
                    title="Remove"
                    onClick={() => (e.alertId !== null ? removeAlert(e.alertId) : removeSearched(e.searchedId!))}
                  >
                    <Icon.Close size={11} />
                  </button>
                </li>
              ))}
          </ol>
        )}
      </Section>

      <Section n={5} title="Wind on site" right={onsite && <span className="text-xs text-forest">using {onsite.hour}:00 reading</span>}>
        <div className="flex items-center gap-1.5 text-[13px]">
          <span className="text-ink-2">From</span>
          <input aria-label="Wind from (degrees)" className="field !w-14 !py-0.5" value={wDir} onChange={(e) => setWDir(e.target.value)} />
          <span className="text-ink-2">°</span>
          <input aria-label="Wind speed (m/s)" className="field !w-12 !py-0.5" value={wSpd} onChange={(e) => setWSpd(e.target.value)} />
          <span className="text-ink-2">m/s</span>
          <button className="btn btn-sm ml-auto" onClick={() => setOnsiteWind(Number(wDir) % 360, Math.max(0, Number(wSpd)))}>
            Apply
          </button>
          {onsite && (
            <button className="btn btn-sm" onClick={() => setOnsiteWind(null, null)} aria-label="Clear on-site wind">
              <Icon.Close size={12} />
            </button>
          )}
        </div>
        <WindConfidenceNote measured={!!onsite} />
      </Section>

      {mode === 'live' && (
        <Section title="Planning square">
          <div className="flex gap-1">
            <ToolButton tool="focus" title="Drag on the map to move the 3 km planning square">
              <Icon.Square size={14} /> Move
            </ToolButton>
            <button className="btn btn-primary btn-sm flex-1" disabled={!focusPreview} onClick={() => focusPreview && computeDetailAt(focusPreview[0], focusPreview[1])}>
              Load it
            </button>
          </div>
          {tool === 'focus' && <p className="mt-1.5 text-xs text-ink-2">Drag the square on the map, then press Load it.</p>}
        </Section>
      )}

      <Section
        title="Map layers"
        right={
          <button className="text-xs text-ink-3 underline hover:text-ink" onClick={() => setLayersOpen(!layersOpen)}>
            {layersOpen ? 'hide' : 'show'}
          </button>
        }
      >
        {layersOpen && (
          <div className="grid grid-cols-2 gap-x-2 gap-y-1">
            {(Object.keys(LAYER_LABELS) as LayerId[]).map((id) => (
              <label key={id} className="flex cursor-pointer items-center gap-1.5 text-[13px] text-ink-2">
                <input type="checkbox" checked={layers[id]} onChange={() => toggleLayer(id)} className="accent-sar" />
                {LAYER_LABELS[id]}
              </label>
            ))}
          </div>
        )}
      </Section>
      <p className="px-4 py-3 text-[11px] leading-relaxed text-ink-3">
        Keys: 1 to 7 demo steps, Space play, M map/3D, D debug, Esc cancel. <Link to="/guide">Full guide</Link>
      </p>
    </div>
  );
}

const LEVEL_STYLE = { good: 'text-forest', fair: 'text-amber', poor: 'text-sar' } as const;

/** How far to trust the forecast wind direction right now, and why. */
function WindConfidenceNote({ measured }: { measured: boolean }) {
  const time = useStore((s) => s.time);
  const windVersion = useStore((s) => s.windVersion);
  const lkp = useStore((s) => s.lkp);
  const ready = useStore((s) => !!s.bundle);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const c = useMemo(() => (ready ? windConfidenceAt(time) : null), [ready, time, windVersion, lkp]);
  if (!c) return null;
  if (measured) return <p className="mt-1.5 text-xs leading-snug text-ink-3">Using your measured wind.</p>;
  return (
    <p className="mt-1.5 text-xs leading-snug text-ink-2">
      Forecast wind: <span className={`font-semibold ${LEVEL_STYLE[c.level]}`}>{c.level === 'good' ? 'reliable' : c.level === 'fair' ? 'uncertain' : 'unreliable'}</span>
      {c.reasons.length > 0 ? ` (${c.reasons.join(', ')})` : ''}.{c.level !== 'good' && ' Measure it before sending teams.'}
    </p>
  );
}

/** Assign teams to whole search segments, or (hasty) a start point and a route each. */
function AssignMode() {
  const mode = useStore((s) => s.assignMode);
  const source = useStore((s) => s.segments?.source ?? 'auto');
  const set = useStore((s) => s.set);
  const tips = {
    segments: 'Each team searches a whole segment; the handler chooses how',
    points: 'First hour, before segments are set: a start point and a route into the wind for each team',
  };
  return (
    <div className="mt-1.5">
      <div className="flex overflow-hidden rounded border border-rule text-xs">
        {(
          [
            ['segments', 'Segments'],
            ['points', 'Hasty'],
          ] as const
        ).map(([m, label], i) => (
          <button
            key={m}
            title={tips[m]}
            className={`flex-1 py-1 font-medium ${i ? 'border-l border-rule' : ''} ${mode === m ? 'bg-ink text-paper' : 'bg-paper text-ink-2'}`}
            onClick={() => set({ assignMode: m, deployments: [] })}
          >
            {label}
          </button>
        ))}
      </div>
      {mode === 'segments' && (
        <div className="mt-1 flex items-center justify-between gap-2 text-xs text-ink-3">
          <label className="cursor-pointer underline hover:text-ink" title="Use the segments your team drew (CalTopo or Google Earth: KML or GeoJSON)">
            {source === 'imported' ? 'Replace your segments' : 'Use your own segments'}
            <input
              type="file"
              accept=".kml,.geojson,.json,application/vnd.google-earth.kml+xml,application/geo+json"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) await importSegments(await f.text(), f.name);
                e.target.value = '';
              }}
            />
          </label>
          {source === 'imported' && (
            <button className="underline hover:text-ink" onClick={useAutoSegments}>
              Use automatic
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Debrief: a team's GPS track (and any alert waypoints) updates the map. */
export function TrackImport() {
  return (
    <label className="btn btn-sm mt-1.5 w-full justify-center" title="A team's GPS track (GPX): where they walked counts as searched; waypoints named ALERT become alerts">
      Add a team's GPS track
      <input type="file" accept=".gpx,application/gpx+xml" className="hidden" onChange={async (e) => {
        const f = e.target.files?.[0];
        if (f) await importSearchTrack(await f.text(), f.name);
        e.target.value = '';
      }} />
    </label>
  );
}
