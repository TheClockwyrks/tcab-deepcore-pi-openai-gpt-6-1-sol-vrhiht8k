import * as C from "./constants";
import {
  type ReadState,
  type DeepcoreState,
  clone,
  fresh,
  cell,
  put,
  tile,
  emptyGrid,
  generate,
  snapshot,
  buildings,
  maxFuel,
  maxHull,
  clamp,
} from "./model";
import * as T from "./transactions";
import * as UI from "./interface";
function valid(ok: boolean, message = "Invalid debug argument"): asserts ok {
  if (!ok) throw new RangeError(message);
}
function number(n: number, min = -Infinity, max = Infinity, integer = false) {
  valid(
    Number.isFinite(n) &&
      n >= min &&
      n <= max &&
      (!integer || Number.isInteger(n)),
  );
}
function member<T extends string>(list: readonly T[], value: T) {
  valid(list.includes(value));
}
function at(s: ReadState, c: number, r: number) {
  number(c, 0, C.WORLD_COLS - 1, true);
  number(r, 1, s.coreRow, true);
}
function pose(s: ReadState, fn: (n: DeepcoreState) => void) {
  return T.transaction(s, fn);
}
export const debug = {
  version: C.DEEPCORE_DEBUG_VERSION,
  snapshot,
  tileAt: (s: ReadState, c: number, r: number) => ({ ...tile(s, c, r) }),
  findTile(s: ReadState, kind: C.TileKind) {
    member(C.TILE_KINDS, kind);
    let best: { col: number; row: number } | null = null,
      distance = Infinity;
    for (let r = 0; r < s.grid.length; r++)
      for (let c = 0; c < C.WORLD_COLS; c++)
        if (s.grid[r][c].kind === kind) {
          const d = Math.hypot(
            (c + 0.5) * C.TILE - s.miner.x - C.MINER_W / 2,
            (r + 0.5) * C.TILE - s.miner.y - C.MINER_H / 2,
          );
          if (d < distance) {
            best = { col: c, row: r };
            distance = d;
          }
        }
    return best;
  },
  buildings: (_s: ReadState) => buildings.map((b) => ({ ...b })),
  menuItemRect: UI.menuItemRect,
  controlRect(s: ReadState, control: string, subject: string | null) {
    valid(
      [
        "drop-ore",
        "use-item",
        "jettison",
        "sell",
        "buy-fuel",
        "fill-fuel",
        "buy-repair",
        "repair-full",
        "buy-upgrade",
        "buy-item",
        "fabricate",
        "launch",
        "dismiss-notice",
        "inventory",
        "pause",
        "mute",
      ].includes(control),
    );
    if (control === "drop-ore") valid(C.MINERALS.some((m) => m.id === subject));
    else if (control === "use-item" || control === "buy-item")
      valid(C.ITEMS.some((i) => i.id === subject));
    else if (control === "buy-upgrade")
      valid(C.TRACKS.some((t) => t === subject));
    else valid(subject === null);
    return UI.controlRect(s, control, subject);
  },
  reset: (s: ReadState) => {
    const n = fresh(
      s.images as DeepcoreState["images"],
      s.systems as DeepcoreState["systems"],
      s.saveData,
    );
    n.muted = s.muted;
    return n;
  },
  reconcile: (s: ReadState) => clone(s),
  generateMine: (s: ReadState) => pose(s, generate),
  clearMine: (s: ReadState) =>
    pose(s, (n) => {
      n.grid = emptyGrid(n.coreRow);
    }),
  clearCargo: (s: ReadState) =>
    pose(s, (n) => {
      n.cargo = {};
    }),
  clearItems: (s: ReadState) =>
    pose(s, (n) => {
      for (const id of C.ITEM_IDS) n.items[id] = 0;
    }),
  setTile: (
    s: ReadState,
    c: number,
    r: number,
    kind: Exclude<C.TileKind, "ore" | "material">,
  ) =>
    pose(s, (n) => {
      at(s, c, r);
      member(
        ["rock", "gas", "lava", "stone", "bedrock", "tunnel", "core"],
        kind,
      );
      put(n, c, r, cell(kind, tile(s, c, r).band));
    }),
  setOreTile: (s: ReadState, c: number, r: number, ore: C.OreId) =>
    pose(s, (n) => {
      at(s, c, r);
      member([...C.ORE_IDS, ...C.GEMSTONE_IDS], ore);
      put(n, c, r, cell("ore", tile(s, c, r).band, ore));
    }),
  setMaterialTile: (
    s: ReadState,
    c: number,
    r: number,
    material: C.MaterialId,
  ) =>
    pose(s, (n) => {
      at(s, c, r);
      member(C.MATERIALS, material);
      put(n, c, r, cell("material", tile(s, c, r).band, null, material));
    }),
  setTileHealth: (s: ReadState, c: number, r: number, health: number) =>
    pose(s, (n) => {
      at(s, c, r);
      const t = tile(s, c, r);
      valid(t.maxHealth !== null);
      number(health, Number.MIN_VALUE, t.maxHealth);
      put(n, c, r, { ...t, health });
    }),
  placeCoreSample: (s: ReadState, c: number, r: number) =>
    pose(s, (n) => {
      at(s, c, r);
      valid(s.coreTimer === null && tile(s, c, r).kind === "tunnel");
      n.coreGround = { col: c, row: r };
      n.coreTimer = C.CORE_TIMER;
    }),
  setMinerPosition: (s: ReadState, x: number, y: number) =>
    pose(s, (n) => {
      number(x);
      number(y);
      n.miner.x = x;
      n.miner.y = y;
    }),
  setMinerVelocity: (s: ReadState, vx: number, vy: number) =>
    pose(s, (n) => {
      number(vx);
      number(vy);
      n.miner.vx = vx;
      n.miner.vy = vy;
    }),
  setFacing: (s: ReadState, facing: C.Facing) =>
    pose(s, (n) => {
      member(C.FACINGS, facing);
      n.miner.facing = facing;
    }),
  setFuel: (s: ReadState, value: number) =>
    pose(s, (n) => {
      number(value, 0);
      n.miner.fuel = value;
    }),
  setHull: (s: ReadState, value: number) =>
    pose(s, (n) => {
      number(value, 0);
      n.miner.hull = value;
    }),
  setMinerTravel: (s: ReadState, enabled: boolean) =>
    pose(s, (n) => {
      valid(typeof enabled === "boolean");
      n.miner.travel = enabled;
    }),
  setMinerDrill: (s: ReadState, enabled: boolean) =>
    pose(s, (n) => {
      valid(typeof enabled === "boolean");
      n.miner.drill = enabled;
    }),
  setScreen: (s: ReadState, screen: C.ScreenName) =>
    pose(s, (n) => {
      member(C.SCREENS, screen);
      n.screen = screen;
    }),
  setPanel: (s: ReadState, panel: C.PanelId | null) =>
    pose(s, (n) => {
      if (panel !== null) member(C.PANELS, panel);
      n.panel = panel;
    }),
  setMenuIndex: (s: ReadState, index: number) =>
    pose(s, (n) => {
      number(index, 0, UI.menuItems(s).length - 1, true);
      n.menuIndex = index;
    }),
  setMode: (s: ReadState, mode: C.Mode) =>
    pose(s, (n) => {
      member(C.MODES, mode);
      n.mode = mode;
    }),
  setWorldSize: (s: ReadState, size: C.WorldSize) =>
    pose(s, (n) => {
      member(C.WORLD_SIZES, size);
      T.resize(n, size);
    }),
  setCredits: (s: ReadState, value: number) =>
    pose(s, (n) => {
      number(value, 0);
      n.credits = value;
    }),
  setTier: (s: ReadState, track: C.TrackName, tier: number) =>
    pose(s, (n) => {
      member(C.TRACKS, track);
      number(tier, 1, C.MAX_TIER[track], true);
      n.tiers[track] = tier;
      n.miner.fuel = clamp(n.miner.fuel, 0, maxFuel(n));
      n.miner.hull = clamp(n.miner.hull, 0, maxHull(n));
    }),
  setCargo: (s: ReadState, ore: C.OreId, count: number) =>
    pose(s, (n) => {
      member([...C.ORE_IDS, ...C.GEMSTONE_IDS], ore);
      number(count, 0, Infinity, true);
      n.cargo[ore] = count;
    }),
  setMaterial: (s: ReadState, material: C.MaterialId, count: number) =>
    pose(s, (n) => {
      member(C.MATERIALS, material);
      number(count, 0, Infinity, true);
      n.satchel[material] = count;
    }),
  setCoreCarried: (s: ReadState, carried: boolean) =>
    pose(s, (n) => {
      valid(typeof carried === "boolean");
      if (carried) {
        valid(s.coreTimer === null);
        n.coreTimer = C.CORE_TIMER;
      } else if (n.satchel.coreSample) n.coreTimer = null;
      n.satchel.coreSample = carried;
    }),
  setCoreTimer: (s: ReadState, seconds: number) =>
    pose(s, (n) => {
      valid(s.coreTimer !== null);
      number(seconds, Number.MIN_VALUE);
      n.coreTimer = seconds;
    }),
  setItemCount: (s: ReadState, item: C.ItemId, count: number) =>
    pose(s, (n) => {
      member(C.ITEM_IDS, item);
      number(count, 0, Infinity, true);
      n.items[item] = count;
    }),
  setRocketInstalled: (s: ReadState, count: number) =>
    pose(s, (n) => {
      number(count, 0, C.ROCKET_COMPONENT_IDS.length, true);
      n.rocket = count;
    }),
  setNoticeFired: (s: ReadState, hazard: C.NoticeHazard, fired: boolean) =>
    pose(s, (n) => {
      member(C.NOTICE_HAZARDS, hazard);
      valid(typeof fired === "boolean");
      n.noticesFired[hazard] = fired;
    }),
  setCameraLead: (s: ReadState, lead: number) =>
    pose(s, (n) => {
      number(lead, -C.CAM_LEAD_MAX, C.CAM_LEAD_MAX);
      n.camera.lead = lead;
    }),
  setElapsed: (s: ReadState, seconds: number) =>
    pose(s, (n) => {
      number(seconds, 0);
      n.elapsedSeconds = seconds;
    }),
  clearSave: (s: ReadState) => pose(s, T.clearSave),
  setNextTeleportHeight: (s: ReadState, tiles: number | null) =>
    pose(s, (n) => {
      if (tiles !== null)
        number(
          tiles,
          C.TELEPORT_HEIGHT_TILES_MIN,
          C.TELEPORT_HEIGHT_TILES_MAX,
          true,
        );
      n.nextTeleportHeight = tiles;
    }),
  setNextTeleportSpeed: (s: ReadState, speed: number | null) =>
    pose(s, (n) => {
      if (speed !== null)
        number(speed, C.TELEPORT_SPEED_MIN, C.TELEPORT_SPEED_MAX);
      n.nextTeleportSpeed = speed;
    }),
  dropOre: (s: ReadState, ore: C.OreId) =>
    pose(s, (n) => {
      member([...C.ORE_IDS, ...C.GEMSTONE_IDS], ore);
      if (n.cargo[ore]) n.cargo[ore]!--;
    }),
  sell: (s: ReadState) => pose(s, T.sell),
  buyFuel: (s: ReadState) => pose(s, (n) => T.buyResource(n, "fuel", false)),
  fillFuel: (s: ReadState) => pose(s, (n) => T.buyResource(n, "fuel", true)),
  buyRepair: (s: ReadState) => pose(s, (n) => T.buyResource(n, "hull", false)),
  repairFull: (s: ReadState) => pose(s, (n) => T.buyResource(n, "hull", true)),
  buyUpgrade: (s: ReadState, track: C.TrackName) =>
    pose(s, (n) => {
      member(C.TRACKS, track);
      T.buyUpgrade(n, track);
    }),
  buyItem: (s: ReadState, item: C.ItemId) =>
    pose(s, (n) => {
      member(C.ITEM_IDS, item);
      T.buyItem(n, item);
    }),
  useItem: (s: ReadState, item: C.ItemId) =>
    pose(s, (n) => {
      member(C.ITEM_IDS, item);
      T.useItem(n, item);
    }),
  jettison: (s: ReadState) => pose(s, T.jettison),
  fabricate: (s: ReadState) => pose(s, T.fabricate),
  launch: (s: ReadState) => pose(s, T.launch),
  save: (s: ReadState) => pose(s, T.save),
  dismissNotice: (s: ReadState) =>
    pose(s, (n) => {
      n.notice = null;
    }),
};
export type DeepcoreDebugApi = typeof debug;
