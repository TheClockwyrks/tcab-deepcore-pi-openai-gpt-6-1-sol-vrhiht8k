import type { DeepReadonly } from "ts-essentials";
import type { ParticleSystem } from "@clockwyrks/particle-runtime";
import * as C from "./constants";

export interface Cell {
  kind: C.TileKind;
  band: C.BandName | null;
  ore: C.OreId | null;
  material: C.MaterialId | null;
  health: number | null;
  maxHealth: number | null;
}
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Effect {
  name: string;
  x: number;
  y: number;
  age: number;
  seed: number;
  tint: string | null;
}
export interface DeepcoreState {
  screen: C.ScreenName;
  panel: C.PanelId | null;
  mode: C.Mode;
  worldSize: C.WorldSize;
  coreRow: number;
  menuIndex: number;
  muted: boolean;
  simTime: number;
  elapsedSeconds: number;
  credits: number;
  creditsEarned: number;
  deepestDepthMeters: number;
  coreTimer: number | null;
  coreGround: { col: number; row: number } | null;
  camera: { x: number; y: number; lead: number };
  miner: {
    x: number;
    y: number;
    vx: number;
    vy: number;
    facing: C.Facing;
    state: C.MinerState;
    travel: boolean;
    drill: boolean;
    fuel: number;
    hull: number;
    drilling: {
      col: number;
      row: number;
      dir: "down" | "left" | "right";
    } | null;
  };
  cargo: Partial<Record<C.OreId, number>>;
  satchel: { resonite: number; cryenite: number; coreSample: boolean };
  tiers: Record<C.TrackName, number>;
  items: Record<C.ItemId, number>;
  rocket: number;
  grid: Cell[][];
  nextTeleportHeight: number | null;
  nextTeleportSpeed: number | null;
  noticesFired: Record<C.NoticeHazard, boolean>;
  notice: { hazard: C.NoticeHazard; age: number } | null;
  summary: {
    deepestDepthMeters: number;
    creditsEarned: number;
    elapsedSeconds: number;
    mode: C.Mode;
    componentsInstalled: number;
    deathCause: C.DeathCause | null;
  } | null;
  saveData: string | null;
  images: Record<string, ImageBitmap>;
  systems: Record<string, ParticleSystem>;
  effects: Effect[];
  sounds: C.CueName[];
  note: string;
  noteAge: number;
  hurt: number;
  drillClock: number;
  accumulator: number;
  animationTime: number;
  shake: number;
  launchTime: number | null;
  panelIndex: number;
  pointerDown: Record<number, string>;
  seed: number;
}
export type ReadState = DeepReadonly<DeepcoreState>;
export const clamp = (n: number, a: number, b: number) =>
  Math.max(a, Math.min(b, n));
export function clone(s: ReadState): DeepcoreState {
  return {
    ...s,
    miner: {
      ...s.miner,
      drilling: s.miner.drilling ? { ...s.miner.drilling } : null,
    },
    camera: { ...s.camera },
    cargo: { ...s.cargo },
    satchel: { ...s.satchel },
    tiers: { ...s.tiers },
    items: { ...s.items },
    noticesFired: { ...s.noticesFired },
    notice: s.notice ? { ...s.notice } : null,
    coreGround: s.coreGround ? { ...s.coreGround } : null,
    summary: s.summary ? { ...s.summary } : null,
    grid: s.grid as Cell[][],
    images: s.images as Record<string, ImageBitmap>,
    systems: s.systems as Record<string, ParticleSystem>,
    effects: s.effects.map((e) => ({ ...e })),
    sounds: [...s.sounds],
    pointerDown: { ...s.pointerDown },
  };
}
export function random(s: DeepcoreState): number {
  s.seed = (Math.imul(s.seed, 1664525) + 1013904223) >>> 0;
  return s.seed / 4294967296;
}
export function bandAt(row: number, coreRow: number): C.BandName {
  return C.BANDS[
    Math.min(3, Math.max(0, Math.floor((4 * (row - 1)) / (coreRow - 1))))
  ];
}
export function cell(
  kind: C.TileKind,
  band: C.BandName | null,
  ore: C.OreId | null = null,
  material: C.MaterialId | null = null,
): Cell {
  const health =
    band && ["rock", "ore", "material", "gas", "lava"].includes(kind)
      ? C.BAND_HEALTH[band]
      : null;
  return { kind, band, ore, material, health, maxHealth: health };
}
export const outside = cell("bedrock", null);
export function tile(
  s: ReadState,
  col: number,
  row: number,
): DeepReadonly<Cell> {
  if (row < 0 && col >= 0 && col < C.WORLD_COLS) return cell("tunnel", null);
  return s.grid[row]?.[col] ?? outside;
}
export function put(s: DeepcoreState, col: number, row: number, t: Cell): void {
  s.grid = s.grid.slice();
  s.grid[row] = s.grid[row].slice();
  s.grid[row][col] = t;
}
export function emptyGrid(coreRow: number): Cell[][] {
  return Array.from({ length: coreRow + 1 }, (_, r) =>
    Array.from({ length: C.WORLD_COLS }, (_, c) =>
      cell(
        r === coreRow
          ? c === C.CORE_COL
            ? "core"
            : "bedrock"
          : r === 0
            ? "tunnel"
            : c === 0 || c === C.WORLD_COLS - 1
              ? "bedrock"
              : "tunnel",
        r > 0 && r < coreRow ? bandAt(r, coreRow) : null,
      ),
    ),
  );
}
function drawOre(s: DeepcoreState, f: number): C.OreId {
  const weights = C.MINERALS.map(
    (m) => m.pick * Math.max(0, 1 - Math.abs(f - m.peak) / m.spread),
  );
  let n = random(s) * weights.reduce((a, b) => a + b, 0),
    i = 0;
  while (i < weights.length - 1 && n >= weights[i]) n -= weights[i++];
  return C.MINERALS[i].id;
}

// Sampling remains random, but a small band must never get an unlucky density
// outlier. Repair only out-of-tolerance counts, without sealing the safe route.
function constrainDensities(s: DeepcoreState): void {
  const nodeRows = new Set(
    s.grid.flatMap((row, r) => (row.some((t) => t.material) ? [r] : [])),
  );
  for (const band of C.BANDS) {
    const cells: { c: number; r: number }[] = [];
    for (let r = 1; r < s.coreRow; r++)
      if (bandAt(r, s.coreRow) === band)
        for (let c = C.PLAYABLE_COL_MIN; c <= C.PLAYABLE_COL_MAX; c++)
          cells.push({ c, r });
    for (const kind of ["ore", "stone", "gas", "lava"] as const) {
      let expected = 0;
      for (const { r } of cells) {
        const f = (r - 1) / (s.coreRow - 1);
        expected +=
          kind === "ore"
            ? C.ORE_DENSITY
            : kind === "lava"
              ? f < 0.5
                ? 0
                : C.LAVA_DENSITY_MIN +
                  ((C.LAVA_DENSITY_MAX - C.LAVA_DENSITY_MIN) * (f - 0.5)) / 0.5
              : f < 0.25
                ? 0
                : kind === "stone"
                  ? C.STONE_DENSITY_MIN +
                    ((C.STONE_DENSITY_MAX - C.STONE_DENSITY_MIN) * (f - 0.25)) /
                      0.75
                  : C.GAS_DENSITY_MIN +
                    ((C.GAS_DENSITY_MAX - C.GAS_DENSITY_MIN) * (f - 0.25)) /
                      0.75;
      }
      const existing = cells.filter(({ c, r }) => s.grid[r][c].kind === kind);
      if (
        !expected ||
        Math.abs(existing.length - expected) <= expected * C.DENSITY_TOLERANCE
      )
        continue;
      const target = Math.round(expected);
      if (existing.length > target) {
        while (existing.length > target) {
          const index = Math.floor(random(s) * existing.length),
            { c, r } = existing.splice(index, 1)[0];
          s.grid[r][c] = cell("rock", band);
        }
      } else {
        const candidates = cells.filter(({ c, r }) => {
          if (
            s.grid[r][c].kind !== "rock" ||
            (kind === "ore" && r < C.ORE_MIN_ROW)
          )
            return false;
          if (kind === "ore" || kind === "gas") return true;
          const route = 15 + Math.round(7 * Math.sin(r / 28));
          return (
            c !== route &&
            c !== route + 1 &&
            r !== s.coreRow - 1 &&
            !nodeRows.has(r)
          );
        });
        for (let i = candidates.length - 1; i > 0; i--) {
          const j = Math.floor(random(s) * (i + 1));
          [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
        }
        if (kind === "lava") {
          const adjacent = ({ c, r }: { c: number; r: number }) =>
            [
              [c - 1, r],
              [c + 1, r],
              [c, r - 1],
              [c, r + 1],
            ].filter(([x, y]) => s.grid[y]?.[x]?.kind === "lava").length;
          candidates.sort((a, b) => adjacent(b) - adjacent(a));
        }
        for (let i = 0; i < target - existing.length; i++) {
          const { c, r } = candidates[i];
          s.grid[r][c] = cell(
            kind,
            band,
            kind === "ore" ? drawOre(s, (r - 1) / (s.coreRow - 1)) : null,
          );
        }
      }
    }
  }
}
export function generate(s: DeepcoreState): void {
  s.grid = emptyGrid(s.coreRow);
  const poolSeed = s.seed;
  for (let r = 1; r < s.coreRow; r++)
    for (let c = 1; c < C.WORLD_COLS - 1; c++) {
      const b = bandAt(r, s.coreRow),
        f = (r - 1) / (s.coreRow - 1),
        v = random(s);
      const stone =
        b === "topsoil"
          ? 0
          : C.STONE_DENSITY_MIN +
            ((C.STONE_DENSITY_MAX - C.STONE_DENSITY_MIN) *
              Math.max(0, f - 0.25)) /
              0.75;
      const gas =
        b === "topsoil"
          ? 0
          : C.GAS_DENSITY_MIN +
            ((C.GAS_DENSITY_MAX - C.GAS_DENSITY_MIN) * Math.max(0, f - 0.25)) /
              0.75;
      // Correlated 2x2 pools, then individual sampling for the other deposits.
      const pool =
        (Math.sin(
          Math.floor(c / 2) * 127.1 + Math.floor(r / 2) * 311.7 + poolSeed,
        ) *
          43758.5453) %
        1;
      const lava =
        f < 0.5
          ? 0
          : C.LAVA_DENSITY_MIN +
            ((C.LAVA_DENSITY_MAX - C.LAVA_DENSITY_MIN) * (f - 0.5)) / 0.5;
      let kind: C.TileKind =
        Math.abs(pool) < lava
          ? "lava"
          : v < stone
            ? "stone"
            : v < stone + gas
              ? "gas"
              : r >= C.ORE_MIN_ROW && v < stone + gas + C.ORE_DENSITY
                ? "ore"
                : "rock";
      // A winding guaranteed diggable route through every stratum.
      const route = 15 + Math.round(7 * Math.sin(r / 28));
      if ((c === route || c === route + 1) && ["stone", "lava"].includes(kind))
        kind = "rock";
      s.grid[r][c] = cell(kind, b, kind === "ore" ? drawOre(s, f) : null);
    }
  for (const material of C.MATERIALS) {
    const b = C.MATERIAL_BAND[material],
      bi = C.BANDS.indexOf(b);
    const r =
      Math.floor(((bi + 0.2 + random(s) * 0.6) * (s.coreRow - 1)) / 4) + 1;
    const c = 1 + Math.floor(random(s) * (C.WORLD_COLS - 2));
    s.grid[r][c] = cell("material", b, null, material);
    // Connect each node horizontally to the guaranteed route without losing deposits.
    const route = 15 + Math.round(7 * Math.sin(r / 28));
    for (let x = Math.min(c, route); x <= Math.max(c, route); x++)
      if (["stone", "lava"].includes(s.grid[r][x].kind))
        s.grid[r][x] = cell("rock", b);
  }
  // Connect cave mouth and chamber to the safe route.
  for (const r of [1, s.coreRow - 1])
    for (let c = 1; c < C.WORLD_COLS - 1; c++)
      if (["stone", "lava"].includes(s.grid[r][c].kind))
        s.grid[r][c] = cell("rock", bandAt(r, s.coreRow));
  s.grid[1][C.CAVE_MOUTH_COL] = cell("tunnel", "topsoil");
  constrainDensities(s);
}
export const buildings = C.BUILDINGS.map((id, i) => ({
  id,
  x: 100 + i * 320,
  y: C.SURFACE_Y - 160,
  w: 240,
  h: 160,
}));
export function fresh(
  images: Record<string, ImageBitmap> = {},
  systems: Record<string, ParticleSystem> = {},
  saveData: string | null = null,
): DeepcoreState {
  const coreRow = C.STANDARD_ROWS;
  return {
    screen: "title",
    panel: null,
    mode: "standard",
    worldSize: "standard",
    coreRow,
    menuIndex: 0,
    muted: false,
    simTime: 0,
    elapsedSeconds: 0,
    credits: 0,
    creditsEarned: 0,
    deepestDepthMeters: 0,
    coreTimer: null,
    coreGround: null,
    camera: { x: 0, y: 0, lead: 0 },
    miner: {
      x: C.SPAWN_COL * C.TILE + (C.TILE - C.MINER_W) / 2,
      y: C.SURFACE_Y - C.MINER_H,
      vx: 0,
      vy: 0,
      facing: "east",
      state: "idle",
      travel: true,
      drill: true,
      fuel: C.FUEL_TIERS[0],
      hull: C.HULL_TIERS[0],
      drilling: null,
    },
    cargo: {},
    satchel: { resonite: 0, cryenite: 0, coreSample: false },
    tiers: Object.fromEntries(C.TRACKS.map((t) => [t, 1])) as Record<
      C.TrackName,
      number
    >,
    items: Object.fromEntries(C.ITEM_IDS.map((t) => [t, 0])) as Record<
      C.ItemId,
      number
    >,
    rocket: 0,
    grid: emptyGrid(coreRow),
    nextTeleportHeight: null,
    nextTeleportSpeed: null,
    noticesFired: { gas: false, lava: false },
    notice: null,
    summary: null,
    saveData,
    images,
    systems,
    effects: [],
    sounds: [],
    note: "",
    noteAge: 0,
    hurt: 0,
    drillClock: 0,
    accumulator: 0,
    animationTime: 0,
    shake: 0,
    launchTime: null,
    panelIndex: 0,
    pointerDown: {},
    seed: 613,
  };
}
export const maxFuel = (s: ReadState) => C.FUEL_TIERS[s.tiers.fuel - 1];
export const maxHull = (s: ReadState) => C.HULL_TIERS[s.tiers.hull - 1];
export const slots = (s: ReadState) =>
  Object.values(s.cargo).reduce((a, b) => a + (b ?? 0), 0);
export const loadKg = (s: ReadState) =>
  C.MINERALS.reduce((a, m) => a + (s.cargo[m.id] ?? 0) * m.weightKg, 0);
export const lift = (s: ReadState) =>
  C.JETPACK_TIERS[s.tiers.jetpack - 1].liftLimitKg;
export const depth = (s: ReadState) =>
  Math.max(
    0,
    ((s.miner.y + C.MINER_H - C.SURFACE_Y) / C.TILE) * C.METERS_PER_ROW,
  );
export const minerCell = (s: ReadState) => ({
  col: Math.floor((s.miner.x + C.MINER_W / 2) / C.TILE),
  row: Math.max(0, Math.floor((s.miner.y + C.MINER_H / 2) / C.TILE)),
});
export function grounded(s: ReadState): boolean {
  const feet = s.miner.y + C.MINER_H,
    r = Math.floor((feet + 0.1) / C.TILE);
  return [s.miner.x + 0.1, s.miner.x + C.MINER_W - 0.1].some((x) => {
    const c = Math.floor(x / C.TILE),
      t = tile(s, c, r),
      below = tile(s, c, r + 1);
    if (t.kind === "tunnel") return false;
    const cut =
      t.health !== null &&
      t.maxHealth &&
      below.kind !== "tunnel" &&
      below.kind !== "lava"
        ? (1 - t.health / t.maxHealth) * C.TILE
        : 0;
    const d = s.miner.drilling;
    if (
      d?.dir === "down" &&
      d.col === c &&
      d.row === r &&
      t.health !== null &&
      cut >= 0 &&
      feet >= r * C.TILE &&
      feet <= (r + 1) * C.TILE
    )
      return true;
    return Math.abs(feet - r * C.TILE - cut) < 0.2;
  });
}
export function scanner(s: ReadState) {
  const range = C.SCANNER_TIERS[s.tiers.scanner - 1],
    m = minerCell(s);
  let best: { target: C.MaterialId; dx: number; dy: number; d: number } | null =
    null;
  if (range !== null)
    for (let r = 1; r < s.grid.length; r++)
      for (let c = 1; c < C.WORLD_COLS - 1; c++) {
        const t = s.grid[r][c];
        if (!t.material || s.satchel[t.material]) continue;
        const dx = c - m.col,
          dy = r - m.row,
          d = Math.hypot(dx, dy);
        if (d <= range && (!best || d < best.d))
          best = { target: t.material, dx, dy, d };
      }
  return best
    ? {
        locked: true,
        target: best.target,
        dirX: best.dx / (best.d || 1),
        dirY: best.dy / (best.d || 1),
        distanceTiles: best.d,
      }
    : { locked: false, target: null, dirX: 0, dirY: 0, distanceTiles: null };
}
export function snapshot(s: ReadState) {
  const m = minerCell(s),
    d = s.miner.drilling,
    t = d ? tile(s, d.col, d.row) : null;
  return {
    version: C.DEEPCORE_DEBUG_VERSION,
    screen: s.screen,
    panel: s.panel,
    mode: s.mode,
    worldSize: s.worldSize,
    coreRow: s.coreRow,
    menuIndex: s.menuIndex,
    muted: s.muted,
    simTime: s.simTime,
    elapsedSeconds: s.elapsedSeconds,
    hasSave: s.saveData !== null,
    credits: s.credits,
    creditsEarned: s.creditsEarned,
    depthMeters: depth(s),
    deepestDepthMeters: s.deepestDepthMeters,
    coreTimer: s.coreTimer,
    coreGround: s.coreGround ? { ...s.coreGround } : null,
    camera: { ...s.camera },
    miner: {
      ...s.miner,
      ...m,
      grounded: grounded(s),
      maxFuel: maxFuel(s),
      maxHull: maxHull(s),
      overloaded: loadKg(s) >= lift(s),
      drilling: d
        ? {
            ...d,
            progress: t?.health && t.maxHealth ? 1 - t.health / t.maxHealth : 0,
          }
        : null,
    },
    cargo: {
      slotsUsed: slots(s),
      slotCap: C.CARGO_TIERS[s.tiers.cargo - 1],
      loadKg: loadKg(s),
      liftLimitKg: lift(s),
      ore: Object.fromEntries(Object.entries(s.cargo).filter(([, n]) => n)),
    },
    satchel: { ...s.satchel },
    tiers: { ...s.tiers },
    items: { ...s.items },
    nextTeleportHeight: s.nextTeleportHeight,
    nextTeleportSpeed: s.nextTeleportSpeed,
    rocket: {
      installed: C.ROCKET_COMPONENT_IDS.slice(0, s.rocket),
      nextComponent: C.ROCKET_COMPONENT_IDS[s.rocket] ?? null,
    },
    scanner: scanner(s),
    notice: s.notice
      ? {
          hazard: s.notice.hazard,
          shown: s.notice.age + 1e-9 >= C.NOTICE_DELAY,
        }
      : null,
    noticesFired: { ...s.noticesFired },
    summary: s.summary ? { ...s.summary } : null,
  };
}
export function note(s: DeepcoreState, text: string) {
  s.note = text;
  s.noteAge = 4;
}
export function effect(
  s: DeepcoreState,
  name: string,
  x: number,
  y: number,
  tint: string | null = null,
) {
  s.effects.push({
    name,
    x,
    y,
    age: 0,
    seed: Math.floor(random(s) * 1e7),
    tint,
  });
}
export function sound(s: DeepcoreState, cue: C.CueName) {
  s.sounds.push(cue);
}
