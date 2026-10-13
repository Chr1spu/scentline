/**
 * Every tunable model number lives here. These are heuristics for a demo, not
 * validated scent physics; the UI labels them as such.
 */

export type ProfileId =
  | 'child13'
  | 'child46'
  | 'child79'
  | 'child1012'
  | 'youth1315'
  | 'adult'
  | 'hiker'
  | 'hunter'
  | 'gatherer'
  | 'camper'
  | 'angler'
  | 'mtnBiker'
  | 'horseRider'
  | 'skierNordic'
  | 'worker'
  | 'dementia'
  | 'autistic'
  | 'intellectual'
  | 'mentalIllness'
  | 'despondent'
  | 'substance'
  /** older names, kept so saved links keep working: 1–6 → 4–6, 7–12 → 7–9 */
  | 'child16'
  | 'child712'
  | 'catIndoor'
  | 'catOutdoor'
  | 'dogSmall'
  | 'dogLarge';

/**
 * Terrain tables in Lost Person Behavior (Koester 2008): Bailey ecoregion domain (temperate, dry)
 * split into mountainous and non-mountainous ("flat", which includes hilly), plus urban.
 */
export type TerrainClass = 'mtn' | 'flat' | 'dryMtn' | 'dryFlat' | 'urban';

export const TERRAIN_LABELS: Record<TerrainClass, string> = {
  mtn: 'Temperate, mountains',
  flat: 'Temperate, flat or hilly',
  dryMtn: 'Dry, mountains',
  dryFlat: 'Dry, flat or hilly',
  urban: 'Urban',
};

/** Distance quantiles (km): 25%, 50%, 75% and 95% found within; n = cases. */
export interface DistanceTable {
  n: number;
  q: [number, number, number, number];
}

export interface ProfileParams {
  label: string;
  /** median crow's-flight distance from LKP (m), for display and log-normal profiles */
  medianM: number;
  /** log-normal spread (sigma of ln d), for profiles without `lpb` tables */
  spread: number;
  /** linear-feature attraction amplitude and length scale (m), for profiles without `terrain` */
  featureA: number;
  featureL: number;
  /**
   * Evidence-based terrain model (TERRAIN below, from ISRID find locations): multipliers near
   * trails, roads, streams, lakes, low and high points, within this track offset (m); slope neutral.
   * Profiles without it use the simple featureA/featureL attraction and the slope penalty.
   */
  terrain?: { trackOffsetM: number };
  /**
   * Lost Person Behavior tables: distance quantiles by terrain class (missing classes fall back to
   * the nearest one) and the dispersion angle quantiles (degrees off the intended direction).
   */
  lpb?: {
    distanceKm: Partial<Record<TerrainClass, DistanceTable>>;
    dispersionDeg?: [number, number, number, number];
    table: string;
    /** a blend of these categories, weighted by their number of cases (no table of its own) */
    mixOf?: ProfileId[];
  };
  /** heading in the "who is missing" picker */
  group?: 'Children' | 'Adults' | 'Health and state of mind';
  /** optional preference by land-cover class (1 water … 6 wetland); missing classes = 1 */
  landcoverWeight?: Partial<Record<number, number>>;
  /**
   * Upper bound on straight-line travel speed (km/h) while lost, for the time-since-missing limit.
   * Deliberately generous (only rules out distances nobody could cover); omitted = no limit.
   */
  maxSpeedKmh?: number;
  /** hidden from profile pickers (old names kept for links) */
  alias?: boolean;
  note: string;
}

// Lost Person Behavior (R. Koester, dbS Productions 2008), ISRID data. Distances in km (the book's
// kilometre tables); dispersion angles in degrees; track offsets (50% from a linear feature):
// hiker 100 m, dementia 15 m; not given for children (100 m used, the general ISRID figure).
const LPB = {
  child13: { distanceKm: { mtn: { n: 58, q: [0.2, 0.3, 0.6, 4.5] }, flat: { n: 61, q: [0.2, 0.3, 1.0, 3.2] }, dryMtn: { n: 13, q: [0.6, 1.3, 3.9, 9.0] }, dryFlat: { n: 13, q: [0.6, 1.3, 3.9, 9.0] }, urban: { n: 17, q: [0.2, 0.5, 0.8, 1.1] } }, dispersionDeg: [0, 23, 66, 137], table: 'Child (1–3), p. 130' },
  child46: { distanceKm: { mtn: { n: 38, q: [0.2, 0.8, 1.5, 3.7] }, flat: { n: 90, q: [0.2, 0.6, 1.5, 6.6] }, dryMtn: { n: 19, q: [0.6, 1.9, 3.2, 8.2] }, dryFlat: { n: 19, q: [0.6, 1.9, 3.2, 8.2] }, urban: { n: 25, q: [0.1, 0.5, 1.0, 3.4] } }, dispersionDeg: [0, 23, 66, 137], table: 'Child (4–6), p. 135' },
  child79: { distanceKm: { mtn: { n: 38, q: [0.8, 1.6, 3.2, 11.3] }, flat: { n: 79, q: [0.2, 0.8, 2.0, 8.0] }, dryMtn: { n: 18, q: [0.4, 1.2, 3.2, 7.2] }, urban: { n: 22, q: [0.2, 0.5, 1.5, 5.2] } }, dispersionDeg: [21, 40, 57, 146], table: 'Child (7–9), p. 140' },
  child1012: { distanceKm: { mtn: { n: 72, q: [0.8, 1.6, 3.2, 9.0] }, flat: { n: 57, q: [0.4, 1.6, 4.8, 10.0] }, dryMtn: { n: 22, q: [0.8, 2.0, 7.2, 16.1] }, urban: { n: 18, q: [0.3, 1.5, 2.9, 5.8] } }, dispersionDeg: [21, 40, 57, 146], table: 'Child (10–12), p. 145' },
  hiker: { distanceKm: { mtn: { n: 568, q: [1.1, 3.1, 5.8, 18.3] }, flat: { n: 274, q: [0.6, 1.8, 3.2, 9.9] }, dryMtn: { n: 221, q: [1.6, 3.2, 6.5, 19.3] }, dryFlat: { n: 58, q: [1.3, 2.1, 6.6, 13.1] } }, dispersionDeg: [2, 23, 64, 132], table: 'Hiker, p. 184' },
  dementia: { distanceKm: { mtn: { n: 95, q: [0.3, 0.8, 1.9, 8.3] }, flat: { n: 175, q: [0.3, 1.0, 2.4, 12.8] }, dryMtn: { n: 14, q: [1.0, 1.9, 3.1, 6.1] }, dryFlat: { n: 15, q: [0.5, 1.6, 3.6, 11.8] }, urban: { n: 336, q: [0.3, 1.1, 3.2, 12.6] } }, dispersionDeg: [11, 23, 66, 70], table: 'Dementia, p. 164' },
  youth1315: { distanceKm: { mtn: { n: 74, q: [0.8, 2.1, 4.8, 21.4] }, flat: { n: 80, q: [0.6, 1.3, 3.2, 10.0] }, dryMtn: { n: 19, q: [2.4, 3.2, 4.8, 11.9] } }, dispersionDeg: [0, 6, 48, 139], table: 'Child/Youth (13–15), p. 151' },
  hunter: { distanceKm: { mtn: { n: 355, q: [1.0, 2.1, 4.8, 17.2] }, flat: { n: 465, q: [0.6, 1.6, 3.1, 13.7] }, dryMtn: { n: 138, q: [2.1, 4.8, 8.1, 22.2] }, dryFlat: { n: 40, q: [1.6, 3.1, 6.4, 11.3] } }, dispersionDeg: [12, 45, 90, 156], table: 'Hunter, p. 194' },
  gatherer: { distanceKm: { mtn: { n: 94, q: [1.5, 3.2, 6.4, 12.9] }, dryMtn: { n: 14, q: [1.6, 2.6, 5.8, 11.1] } }, table: 'Gatherer, p. 180' },
  camper: { distanceKm: { mtn: { n: 17, q: [0.2, 2.2, 3.0, 39.5] }, flat: { n: 18, q: [0.2, 1.1, 3.2, 12.8] }, dryMtn: { n: 26, q: [0.6, 1.6, 4.2, 32.5] } }, table: 'Camper, p. 121' },
  angler: { distanceKm: { mtn: { n: 25, q: [0.3, 1.5, 5.5, 9.9] }, flat: { n: 62, q: [0.8, 1.6, 3.9, 14.9] }, dryMtn: { n: 15, q: [3.2, 9.7, 10.5, 13.0] } }, dispersionDeg: [28, 50, 59, 111], table: 'Angler, p. 107' },
  mtnBiker: { distanceKm: { mtn: { n: 25, q: [3.1, 4.0, 11.3, 25.0] }, dryMtn: { n: 32, q: [2.7, 6.4, 13.2, 29.1] } }, table: 'Mountain Biker, p. 215' },
  horseRider: { distanceKm: { mtn: { n: 17, q: [0.3, 3.2, 8.1, 19.8] } }, table: 'Horseback Rider (all terrain), p. 190' },
  skierNordic: { distanceKm: { mtn: { n: 29, q: [1.6, 3.5, 6.4, 19.6] }, dryMtn: { n: 41, q: [1.9, 4.3, 6.4, 19.5] } }, table: 'Skier-Nordic, p. 237' },
  worker: { distanceKm: { mtn: { n: 29, q: [1.0, 1.9, 3.2, 11.8] } }, table: 'Worker, p. 290' },
  autistic: { distanceKm: { mtn: { n: 20, q: [0.6, 1.6, 3.7, 15.2] }, urban: { n: 16, q: [0.3, 1.0, 3.8, 8.0] } }, table: 'Autistic (temperate), p. 117' },
  intellectual: { distanceKm: { mtn: { n: 31, q: [0.6, 1.6, 3.2, 11.3] }, flat: { n: 36, q: [0.3, 1.0, 2.1, 11.8] }, dryMtn: { n: 21, q: [1.1, 4.0, 8.7, 62.6] }, urban: { n: 44, q: [0.3, 0.8, 3.7, 9.9] } }, table: 'Intellectual disability (“Mental Retardation”), p. 208' },
  mentalIllness: { distanceKm: { mtn: { n: 23, q: [0.6, 2.3, 8.3, 14.6] }, flat: { n: 23, q: [0.8, 1.0, 2.3, 8.1] }, urban: { n: 38, q: [0.3, 0.6, 1.5, 12.5] } }, table: 'Mental Illness, p. 201' },
  despondent: { distanceKm: { mtn: { n: 103, q: [0.3, 1.1, 3.2, 21.6] }, flat: { n: 193, q: [0.3, 0.8, 2.3, 17.3] }, dryMtn: { n: 20, q: [0.8, 1.6, 3.4, 18.0] }, dryFlat: { n: 14, q: [0.5, 1.9, 3.7, 20.7] }, urban: { n: 96, q: [0.1, 0.5, 1.5, 13.1] } }, dispersionDeg: [0, 0, 3, 30], table: 'Despondent, p. 173' },
  substance: { distanceKm: { mtn: { n: 15, q: [0.5, 1.1, 4.2, 9.7] } }, table: 'Substance Abuse (temperate), p. 257' },
} satisfies Record<string, ProfileParams['lpb']>;

const person = (label: string, lpb: ProfileParams['lpb'], group: ProfileParams['group'], speed: number, trackOffsetM = 100): ProfileParams => ({
  label,
  medianM: (lpb!.distanceKm.mtn ?? Object.values(lpb!.distanceKm)[0])?.q[1] ? (lpb!.distanceKm.mtn ?? Object.values(lpb!.distanceKm)[0])!.q[1] * 1000 : 1000,
  spread: 0.9,
  featureA: 1,
  featureL: 150,
  maxSpeedKmh: speed,
  terrain: { trackOffsetM },
  lpb,
  group,
  note: `Lost Person Behavior, ${lpb!.table}`,
});

const child = (label: string, lpb: ProfileParams['lpb'], speed: number, alias = false): ProfileParams => ({ ...person(label, lpb, 'Children', speed), alias });

export const PROFILES: Record<ProfileId, ProfileParams> = {
  child13: child('Child (1–3)', LPB.child13, 1.5),
  child46: child('Child (4–6)', LPB.child46, 2),
  child79: child('Child (7–9)', LPB.child79, 3),
  child1012: child('Child (10–12)', LPB.child1012, 3),
  youth1315: child('Teen (13–15)', LPB.youth1315, 4),
  // adults, activity unknown: the adult categories blended by their number of cases
  adult: {
    ...person('Adult, activity unknown', { distanceKm: {}, table: 'adult categories combined', mixOf: ['hiker', 'hunter', 'gatherer', 'camper', 'angler', 'worker', 'despondent', 'mentalIllness', 'substance'] }, 'Adults', 4),
    medianM: 1800,
    note: 'Lost Person Behavior: hikers, hunters, gatherers, campers, anglers, workers, despondent, mental illness and substance use combined by number of cases',
  },
  hiker: person('Hiker', LPB.hiker, 'Adults', 4),
  hunter: person('Hunter', LPB.hunter, 'Adults', 4),
  gatherer: person('Gatherer (berries, mushrooms…)', LPB.gatherer, 'Adults', 4),
  camper: person('Camper', LPB.camper, 'Adults', 4),
  angler: person('Angler', LPB.angler, 'Adults', 4),
  mtnBiker: person('Mountain biker', LPB.mtnBiker, 'Adults', 12),
  horseRider: person('Horse rider', LPB.horseRider, 'Adults', 10),
  skierNordic: person('Cross-country skier', LPB.skierNordic, 'Adults', 8),
  worker: person('Outdoor worker', LPB.worker, 'Adults', 4),
  dementia: person('Dementia', LPB.dementia, 'Health and state of mind', 3, 15),
  autistic: person('Autism', LPB.autistic, 'Health and state of mind', 3, 15),
  intellectual: person('Intellectual disability', LPB.intellectual, 'Health and state of mind', 3, 15),
  mentalIllness: person('Mental illness', LPB.mentalIllness, 'Health and state of mind', 4, 23),
  despondent: person('Despondent (may be suicidal)', LPB.despondent, 'Health and state of mind', 4, 50),
  substance: person('Under the influence', LPB.substance, 'Health and state of mind', 3),
  child16: child('Child (4–6)', LPB.child46, 2, true),
  child712: child('Child (7–9)', LPB.child79, 3, true),
  // lost pets: cats hide in cover close by (Huang et al. 2018: indoor-only cats median 39 m,
  // outdoor-access cats 315 m); dog figures are placeholders, dogs follow roads and trails
  catIndoor: { label: 'Cat (indoor-only)', medianM: 50, spread: 1.0, featureA: 0, featureL: 100, landcoverWeight: { 2: 0.5, 3: 1.6, 4: 1.3, 5: 1.4 }, note: 'Huang et al. 2018' },
  catOutdoor: { label: 'Cat (goes outdoors)', medianM: 315, spread: 1.0, featureA: 0, featureL: 100, landcoverWeight: { 2: 0.6, 3: 1.5, 4: 1.3, 5: 1.3 }, note: 'Huang et al. 2018' },
  dogSmall: { label: 'Dog (small)', medianM: 800, spread: 0.9, featureA: 2, featureL: 120, note: 'placeholder, tune' },
  dogLarge: { label: 'Dog (large)', medianM: 1600, spread: 0.9, featureA: 2.5, featureL: 150, note: 'placeholder, tune' },
};

/**
 * Auto terrain class: Lost Person Behavior uses Bailey's ecoregion map (mountain provinces). Without
 * that map here, an area counts as mountainous when the 12 km area spans at least this much relief
 * (heuristic); dry and urban are chosen by hand.
 */
export const AUTO_MOUNTAIN_RELIEF_M = 300;

export const PROBABILITY = {
  /** cells whose least-cost detour ratio exceeds these are "across a barrier" */
  barrierRatioLo: 1.25,
  barrierRatioHi: 1.6,
  barrierFactor: 0.2,
  /** cost multiplier for crossing water / cliff / river cells in the detour pass */
  barrierCost: 25,
  /** slope penalty for profiles without `terrain` (ISRID finds show no lower density on steep ground) */
  slopeScaleDeg: 25,
  brushRadiusM: 250,
  brushUp: 2,
  brushDown: 0.5,
  /** detail cells below this probability do not emit scent */
  minSourceProb: 1e-6,
  /**
   * Time-since-missing limit: the profile distances describe where people are eventually found,
   * so early on, weight beyond maxSpeed × elapsed time falls off (logistic, width = softness × reach).
   * Elapsed time is floored so the map never collapses onto the last known point.
   */
  travelMinH: 0.25,
  travelSoftness: 0.2,
};

/**
 * Terrain multipliers (probability density relative to the area average) from Jacobs (2015),
 * Terrain Based Probability Models for SAR, Table 1: ~2,200 ISRID find locations in the US,
 * uninjured subjects. Applied within a profile's track offset of each feature (soft edge beyond);
 * where several apply, the largest counts (they are not independent). Low/high points: the top and
 * bottom 5% of topographic position in the area, with at least minReliefM of relief.
 */
export const TERRAIN = {
  trail: 5,
  road: 3,
  stream: 2,
  lake: 2,
  trailStream: 7,
  trailStreamM: 80,
  low: 2,
  high: 1.5,
  lowPct: 0.95,
  highPct: 0.05,
  minReliefM: 5,
};

/**
 * Direction of travel (ISRID dispersion angle, children 1–6 and dementia; NEWSAR SAR FTM Unit 3):
 * 50% are found within ~30° of the intended direction, 75% within 66°, 95% within ~140°.
 * Used for any profile when a direction is given; fades in over the first fadeM metres.
 */
export const DISPERSION = {
  cdf: [
    [0, 0],
    [30, 0.5],
    [66, 0.75],
    [140, 0.95],
    [180, 1],
  ] as [number, number][],
  fadeM: 150,
};

/** Fallback slope-wind model; mirrors backend/app/config.py SLOPE_WIND. */
export const SLOPE_WIND = {
  k: 3.0,
  cap: 2.5,
  forecastTo2m: 0.7,
  nightSunElev: 5.0,
  daySunElev: 10.0,
  sunFacingDot: 0.2,
  calmForecast: 3.0,
  minSlopeWeight: 0.35,
  smoothPasses: 2,
  smoothRadius: 2,
};

export const ENSEMBLE = {
  members: 6,
  rotDeg: 20,
  /**
   * Spread used instead when the forecast direction is uncertain (wind confidence fair/poor and no
   * measured wind): docs/EVALUATION.md, a wider planning ensemble then covers more on average.
   */
  rotDegUncertain: 35,
  scaleMin: 0.7,
  scaleMax: 1.3,
  particlesPerMember: 4500,
  windowMin: 60,
  /** simulated step for off-screen ensembles (s); visible sim uses SCENT.dt */
  dt: 12,
  /** cheap per-hour snapshots for best time windows */
  hourlyParticles: 3000,
  /**
   * Detectability thresholds are absolute: θ1/θ2 are the 70th/95th percentiles of a reference
   * run with the same wind but neutral scent conditions (no sun, no lofting, 1800 s decay).
   * Poor conditions (heat, sun, lofting) therefore really lower detectability.
   */
  referenceMembers: 2,
  referenceParticles: 3000,
};

/**
 * Plume meander: each particle carries a turbulent velocity that decorrelates over the Lagrangian
 * time scale (an Ornstein-Uhlenbeck process). Its strength σv = a·U is set so a plume's lateral
 * spread follows the Briggs (1973) open-country curves σy ≈ a·x·(1 + 0.0001x)^-0.5, with `a` from the
 * Pasquill stability class (sun, cloud and wind decide how turbulent the air is).
 */
export const TURBULENCE = {
  /** σy / downwind distance in the near field, by Pasquill class (Briggs, open country) */
  briggsA: { A: 0.22, B: 0.16, C: 0.11, D: 0.08, E: 0.06, F: 0.04 } as Record<string, number>,
  /** Lagrangian integral time scale (s): spread grows ∝ distance for travel times well below this */
  lagrangianS: 600,
  /** meander floor in near-calm air (m/s) */
  minSigmaV: 0.08,
  /** 1 = on (tests switch it off to check pure advection) */
  scale: 1,
};

export const SCENT = {
  visibleParticles: 15000,
  dt: 2,
  stepsPerFrame: 3,
  /** small-scale mixing on top of the meander (m²/s); was the whole turbulence model before */
  turbK0: 0.1,
  turbKPerWind: 0,
  /** below this nose-height wind a particle in a local hollow is "pooling" */
  calmWind: 0.3,
  calmDamp: 0.3,
  /** a cell is a local low if lower than at least this many of 8 neighbours */
  localLowNeighbours: 6,
  baseTauS: 1800,
  sunFactor: 0.7,
  sunHighElev: 20,
  /** lofting off sunlit slopes when the 2 m wind is below this (m/s) */
  liftWind: 2,
  liftPerS: 0.002,
  minStrength: 0.01,
  /**
   * Particles represent a continuous release: births are staggered over the first lifetime and a
   * particle is re-emitted at its source once older than this. Scent older than ~40 min is mostly
   * decayed or lofted anyway (see baseTauS / liftPerS).
   */
  lifetimeS: 2400,
  accumHalfLifeS: 600,
};

/**
 * Dogs smell at nose height (~0.6 m), but WindNinja and the fallback model give wind at 2 m.
 * Particles are moved by the 2 m wind scaled to nose height: a neutral log profile
 * u(z) ∝ ln(z / z0) over open ground, and a sub-canopy attenuation factor in forest
 * (WindNinja reports its output height above the vegetation, so in forest the 2 m wind is
 * effectively above the canopy).
 */
export const NOSE = {
  heightM: 0.6,
  refHeightM: 2,
  /** aerodynamic roughness length z0 (m) per land-cover class */
  z0: { water: 0.0002, open: 0.03, wetland: 0.05, shrub: 0.1, developed: 0.3 },
  /** wind under a closed canopy as a fraction of the model wind (typically 0.2–0.4) */
  forestFactor: 0.3,
};

export const HOTSPOTS = {
  detLoPct: 0.7,
  detHiPct: 0.95,
  /** receiver (dog position) blocks and source blocks for contribution tracking */
  recvBlockCells: 5, // 50 m on the 10 m detail grid
  srcBlockCells: 10, // 100 m
  /** a source "contributes" at a receiver if it supplies at least this share of its scent */
  contribShare: 0.02,
  maxSourcesPerRecv: 50,
  dogPOD: 0.7,
  /**
   * Close range: a dog finds a person it passes near even when drifted scent is weak:
   * detectability at least nearDet within nearRadiusM of a team's route. Calibrated with
   * scripts/sweepwidth.ts so that, with d50 = 200 m, the model's effective sweep width in reference
   * conditions is ~94 m, matching the field-measured 95 m for air-scent dog teams (95% CI 44–145;
   * Chiacchia, Houlahan & Hostetter 2015). 150 m gave 147 m, above the measured range.
   */
  nearRadiusM: 60,
  nearDet: 0.6,
  /**
   * Hedge: until the wind is confirmed on site, with at least this many teams, the last team goes
   * on the most likely ground instead of a scent point. docs/EVALUATION.md: with a wind-direction
   * error of 30° or more this beats placing every team by scent; with a good forecast it costs ~1–2 points.
   */
  hedgeMinTeams: 3,
  /**
   * Each team works a route upwind from its start during its hour (dogs work into the wind toward
   * the source; quartering across the wind, a team typically advances a few hundred metres to
   * ~1 km an hour). Heuristic length; the route follows the local modelled wind.
   */
  routeM: 600,
  routeStepM: 50,
  /** below this wind (m/s) there is no upwind to follow; the route ends */
  routeCalmWind: 0.2,
  suppressRadiusM: 300,
  maxSlopeDeg: 35,
  cliffBufferM: 20,
};

/**
 * Wind confidence (models/windConfidence.ts): when to distrust the modelled direction. Heuristic
 * thresholds: light winds meander (horizontal direction spread grows sharply below ~2 m/s), two
 * independent models that disagree flag terrain the forecast handles badly, and a turning wind
 * (evening downslope transition) makes a one-hour plan stale. Speeds are the 2 m model wind.
 */
export const WIND_CONFIDENCE = {
  poorSpeed: 1.0,
  fairSpeed: 2.0,
  fairDisagreeDeg: 25,
  poorDisagreeDeg: 45,
  fairTurnDeg: 30,
  poorTurnDeg: 60,
  /** below this a model's direction is too weak to compare */
  minSpeedForDirection: 0.3,
  /** sample square half-width around the last known point (m) */
  radiusM: 800,
};

/**
 * Absolute detection (models/detection.ts): the distance straight downwind at which a dog detects
 * one person half the time, in a steady neutral wind of refWind m/s (2 m model wind, class D,
 * neutral scent decay). 0.9 at half that distance, 0.1 at twice it. Heuristic default: set it from
 * your dog's record; air-scent dogs are often reported alerting from roughly 100 to 300+ m downwind.
 */
export const DETECTION = {
  d50M: 200,
  refWind: 2,
  /** sources sampled by fewer particles than this share are treated as this likely (noise floor) */
  minQ: 5e-4,
};

/**
 * Search segments (models/segments.ts). Sizes follow dog-team practice: NASAR area-search tests use
 * 40–60 acres in 1.5 h (SARTECH III) up to 140–160 acres in 4 h (SARTECH I), and a team clears
 * about 1.3 km² in a day (Graham, "77 Facts about Search Dogs"); both give roughly 0.13 km² an hour.
 */
export const SEGMENTS = {
  /** target segment area (m²): ~75 acres, a little over two hours for one team */
  targetM2: 300_000,
  /** search pace of one dog team (m² per hour) */
  teamRateM2PerH: 130_000,
  /** crossing a trail, road, stream or ridgeline costs this many cells of travel: edges follow them */
  crossCost: 40,
  /** segments smaller than this share of the target are folded into a neighbour */
  minFraction: 0.3,
  /** outline simplification tolerance (cells) */
  simplifyCells: 1.2,
  /** ridgelines: cells this far (m) above the mean within ~150 m count as a boundary */
  ridgeReliefM: 12,
  /** dogs need the air clear of other searchers for this long before entering (Hill; Graham: 15–30 min) */
  clearAirMin: 30,
  /**
   * Search theory for a team that searches a whole segment: POD = 1 − e^(−coverage). Reference
   * coverage 1.25 gives 0.7 × (1 − e^−1.25) ≈ 50%, the average NASAR uses for a dog team (Graham:
   * "not a bad average" of a 21–96% range). Coverage scales with scent conditions (scent present
   * relative to neutral, from the ensemble), clamped to minCond–maxCond.
   */
  coverageRef: 1.25,
  minCond: 0.15,
  maxCond: 1.5,
  /**
   * Length of one dog-team assignment (h). A segment that needs longer is only partly covered:
   * coverage scales by assignmentH / hours. NASAR tests run 1.5 h (40–60 acres) to 4 h (140–160).
   */
  assignmentH: 3,
  /**
   * Walking pace on slopes: Tobler's hiking function, v ∝ e^(−3.5 |tan θ|) relative to flat
   * (Tobler 1993), applied cell by cell to the team pace.
   */
  toblerK: 3.5,
};

export const TRIANGULATION = {
  /**
   * Fanning plumes: on stable nights scent holds at its elevation, and "a series of night-time
   * alerts at the same elevation is an important clue: check elsewhere at that elevation"
   * (Graham, 77 Facts about Search Dogs, #29). When at least two alerts in stable air (Pasquill
   * E/F) lie within fanMatchM of each other in elevation, probability is weighted toward that
   * elevation: × (fanFloor + (1 − fanFloor)·e^(−½(Δz/fanBandM)²)). A gentle heuristic.
   */
  fanMatchM: 30,
  fanBandM: 40,
  fanFloor: 0.35,
  fanMinClass: 4,
  particles: 3000,
  backMinutes: 60,
  dt: 5,
  eps: 0.02,
  blurPasses: 2,
};

export const SEARCH = {
  /**
   * A no-alert search also lowers places whose scent should have drifted to the team. That depends
   * on the modelled wind being right, and wrongly clearing ground is the costly mistake, so only
   * this share of that drift credit is applied.
   */
  driftCredit: 0.5,
  defaultRadiusM: 150,
  windowMin: 60,
  recheckDet: 0.3,
};

export const TIME = {
  start: 14,
  end: 22,
  stepMin: 15,
  /** playback: simulated hours per real second */
  playRate: 0.25,
};
