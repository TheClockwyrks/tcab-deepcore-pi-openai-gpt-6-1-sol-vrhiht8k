import * as C from "./constants";
import { mineralColor } from "./palette";
import {
  type DeepcoreState,
  type ReadState,
  clone,
  clamp,
  fresh,
  generate,
  emptyGrid,
  cell,
  tile,
  put,
  maxFuel,
  maxHull,
  slots,
  loadKg,
  lift,
  minerCell,
  depth,
  random,
  note,
  effect,
  sound,
} from "./model";

const SAVE_KEY = "deepcore.expedition.v1";
export function readSave(): string | null {
  try {
    return globalThis.localStorage?.getItem(SAVE_KEY) ?? null;
  } catch {
    return null;
  }
}
export function writeSave(data: string | null): boolean {
  try {
    if (!globalThis.localStorage) return false;
    if (data === null) globalThis.localStorage.removeItem(SAVE_KEY);
    else globalThis.localStorage.setItem(SAVE_KEY, data);
    return true;
  } catch {
    return false;
  }
}
export function clearSave(s: DeepcoreState) {
  s.saveData = null;
  writeSave(null);
}
export function start(s: ReadState): DeepcoreState {
  const n = fresh(
    s.images as DeepcoreState["images"],
    s.systems as DeepcoreState["systems"],
  );
  n.mode = s.mode;
  n.worldSize = s.worldSize;
  n.coreRow = Math.round(C.STANDARD_ROWS * C.WORLD_SIZE_SCALE[n.worldSize]);
  n.muted = s.muted;
  n.simTime = s.simTime;
  n.seed = (s.seed + Math.floor(Math.random() * 1e8)) >>> 0;
  generate(n);
  n.screen = "in-mine";
  clearSave(n);
  note(n, "CAMP ONLINE / Find ore. Build your way home.");
  return n;
}
export function resize(s: DeepcoreState, size: C.WorldSize) {
  const old = s.coreRow,
    next = Math.round(C.STANDARD_ROWS * C.WORLD_SIZE_SCALE[size]);
  const grid = emptyGrid(next);
  for (let r = 1; r < Math.min(old, next); r++) grid[r] = s.grid[r];
  s.grid = grid;
  s.worldSize = size;
  s.coreRow = next;
}
export function save(s: DeepcoreState) {
  if (s.coreTimer !== null) {
    note(s, "SAVE REFUSED / Unstable Core Sample detected.");
    return;
  }
  const payload = {
    worldSize: s.worldSize,
    mode: s.mode,
    grid: s.grid,
    credits: s.credits,
    tiers: s.tiers,
    rocket: s.rocket,
    items: s.items,
    cargo: s.cargo,
    satchel: s.satchel,
    fuel: s.miner.fuel,
    hull: s.miner.hull,
  };
  const data = JSON.stringify(payload);
  if (writeSave(data)) {
    s.saveData = data;
    note(s, "EXPEDITION SAVED / Return here to bank your progress.");
    sound(s, C.CUES.fabricate);
  } else note(s, "SAVE UNAVAILABLE / Browser storage is disabled.");
}
export function restore(s: ReadState): DeepcoreState {
  if (!s.saveData) return clone(s);
  try {
    const p = JSON.parse(s.saveData) as {
      worldSize: C.WorldSize;
      mode: C.Mode;
      grid: DeepcoreState["grid"];
      credits: number;
      tiers: DeepcoreState["tiers"];
      rocket: number;
      items: DeepcoreState["items"];
      cargo: DeepcoreState["cargo"];
      satchel: DeepcoreState["satchel"];
      fuel: number;
      hull: number;
    };
    const n = fresh(
      s.images as DeepcoreState["images"],
      s.systems as DeepcoreState["systems"],
      s.saveData,
    );
    Object.assign(n, {
      worldSize: p.worldSize,
      mode: p.mode,
      grid: p.grid,
      credits: p.credits,
      tiers: p.tiers,
      rocket: Math.max(p.rocket, s.rocket),
      items: p.items,
      cargo: p.cargo,
      satchel: p.satchel,
      screen: "in-mine",
      simTime: s.simTime,
      muted: s.muted,
    });
    n.coreRow = Math.round(C.STANDARD_ROWS * C.WORLD_SIZE_SCALE[n.worldSize]);
    n.miner.fuel = p.fuel;
    n.miner.hull = p.hull;
    return n;
  } catch {
    const n = clone(s);
    note(n, "SAVE CORRUPT / Start a new expedition.");
    return n;
  }
}
export function finish(s: DeepcoreState, cause: C.DeathCause | null) {
  if (s.screen === "game-over" || s.screen === "victory") return;
  s.summary = {
    deepestDepthMeters: s.deepestDepthMeters,
    creditsEarned: s.creditsEarned,
    elapsedSeconds: s.elapsedSeconds,
    mode: s.mode,
    componentsInstalled: s.rocket,
    deathCause: cause,
  };
  s.screen = cause ? "game-over" : "victory";
  s.panel = null;
  s.menuIndex = 0;
  s.coreTimer = null;
  s.coreGround = null;
  s.satchel.coreSample = false;
  if (cause) {
    effect(
      s,
      "death-burst",
      s.miner.x + C.MINER_W / 2,
      s.miner.y + C.MINER_H / 2,
    );
    sound(s, C.CUES.death);
  }
  if (!cause || s.mode === "hardcore") clearSave(s);
}
export function checkDeath(s: DeepcoreState) {
  if (s.screen !== "in-mine") return;
  if (s.miner.hull <= 0) {
    s.miner.hull = 0;
    finish(s, "hull-destroyed");
  } else if (s.miner.fuel <= 0 && s.miner.y + C.MINER_H > C.SURFACE_Y + 0.1) {
    s.miner.fuel = 0;
    s.miner.state = "fuel-out";
    finish(s, "fuel-out");
  }
}
export function damage(
  s: DeepcoreState,
  amount: number,
  hazard?: C.NoticeHazard,
) {
  if (amount <= 0) return;
  s.miner.hull = Math.max(0, s.miner.hull - amount);
  s.hurt = C.HURT_TIME;
  if (hazard && !s.noticesFired[hazard]) {
    s.noticesFired[hazard] = true;
    s.notice = { hazard, age: 0 };
  }
}
export function gasBlast(s: DeepcoreState, c: number, r: number) {
  const x = (c + 0.5) * C.TILE,
    y = (r + 0.5) * C.TILE;
  effect(s, "gas-explosion", x, y);
  sound(s, C.CUES.gasExplosion);
  s.shake = 1;
  const dx = s.miner.x + C.MINER_W / 2 - x,
    dy = s.miner.y + C.MINER_H / 2 - y,
    d = Math.hypot(dx, dy);
  if (d <= C.GAS_BLAST_TILES * C.TILE) {
    damage(
      s,
      C.GAS_DAMAGE_MIN +
        ((C.GAS_DAMAGE_MAX - C.GAS_DAMAGE_MIN) *
          Math.max(0, (r - 1) / (s.coreRow - 1) - 0.25)) /
          0.75,
      "gas",
    );
    if (s.miner.travel) {
      s.miner.vx = (dx / (d || 1)) * C.GAS_KNOCKBACK;
      s.miner.vy = (dy / (d || 1)) * C.GAS_KNOCKBACK;
    }
  }
}
export function sell(s: DeepcoreState) {
  const value = C.MINERALS.reduce(
    (sum, m) => sum + (s.cargo[m.id] ?? 0) * m.value,
    0,
  );
  if (!value) {
    note(s, "CARGO EMPTY / Bring back a haul.");
    return;
  }
  s.credits += value;
  s.creditsEarned += value;
  s.cargo = {};
  note(s, `SALE COMPLETE / +${value.toLocaleString()} Credits`);
  sound(s, C.CUES.fabricate);
}
export function buyResource(
  s: DeepcoreState,
  resource: "fuel" | "hull",
  full: boolean,
) {
  const maximum = resource === "fuel" ? maxFuel(s) : maxHull(s),
    price = resource === "fuel" ? C.FUEL_PRICE : C.REPAIR_PRICE;
  const increment =
    resource === "fuel" ? C.FUEL_BUY_INCREMENT : C.REPAIR_BUY_INCREMENT;
  const amount = Math.max(
    0,
    Math.min(
      maximum - s.miner[resource],
      full ? Infinity : increment,
      s.credits / price,
    ),
  );
  if (amount <= 0) {
    note(
      s,
      s.miner[resource] >= maximum ? "ALREADY FULL" : "INSUFFICIENT CREDITS",
    );
    return;
  }
  s.miner[resource] += amount;
  s.credits -= amount * price;
  note(s, `${resource.toUpperCase()} RESTORED / +${amount.toFixed(0)}`);
  sound(s, C.CUES.fabricate);
}
export function buyUpgrade(s: DeepcoreState, track: C.TrackName) {
  const current = s.tiers[track],
    price = C.UPGRADE_PRICES[current - 1];
  if (current >= C.MAX_TIER[track]) {
    note(s, "TRACK MAXED");
    return;
  }
  if (s.credits < price) {
    note(s, "INSUFFICIENT CREDITS");
    return;
  }
  const oldFuel = maxFuel(s),
    oldHull = maxHull(s);
  s.credits -= price;
  s.tiers[track]++;
  if (track === "fuel") s.miner.fuel += maxFuel(s) - oldFuel;
  if (track === "hull") s.miner.hull += maxHull(s) - oldHull;
  note(s, `${track.toUpperCase()} UPGRADED / TIER ${current + 1}`);
  sound(s, C.CUES.fabricate);
}
export function buyItem(s: DeepcoreState, item: C.ItemId) {
  const price = C.ITEMS.find((i) => i.id === item)!.price;
  if (s.credits < price) {
    note(s, "INSUFFICIENT CREDITS");
    return;
  }
  s.credits -= price;
  s.items[item]++;
  note(s, "SUPPLY BANKED");
  sound(s, C.CUES.fabricate);
}
export function useItem(s: DeepcoreState, item: C.ItemId) {
  if (!s.items[item]) {
    note(s, "NO SUPPLY HELD");
    return;
  }
  const m = minerCell(s);
  if (item === "nanobots" || item === "emergency-fuel") {
    const key = item === "nanobots" ? "hull" : "fuel",
      max = key === "hull" ? maxHull(s) : maxFuel(s),
      add = key === "hull" ? C.NANOBOT_HULL : C.EMERGENCY_FUEL;
    if (s.miner[key] >= max) {
      note(s, "ALREADY FULL / Supply retained.");
      return;
    }
    s.miner[key] = Math.min(max, s.miner[key] + add);
    effect(s, "material-shimmer", s.miner.x, s.miner.y);
    sound(s, C.CUES.materialChime);
  } else if (item === "quantum-teleporter" || item === "matter-transmitter") {
    s.miner.x = C.SPAWN_COL * C.TILE + (C.TILE - C.MINER_W) / 2;
    s.miner.y = C.SURFACE_Y - C.MINER_H;
    s.miner.vx = 0;
    s.miner.vy = 0;
    s.miner.drilling = null;
    if (item === "quantum-teleporter") {
      const h =
        s.nextTeleportHeight ??
        C.TELEPORT_HEIGHT_TILES_MIN +
          Math.floor(
            random(s) *
              (C.TELEPORT_HEIGHT_TILES_MAX - C.TELEPORT_HEIGHT_TILES_MIN + 1),
          );
      s.miner.y -= h * C.TILE;
      s.miner.vy =
        s.nextTeleportSpeed ??
        C.TELEPORT_SPEED_MIN +
          random(s) * (C.TELEPORT_SPEED_MAX - C.TELEPORT_SPEED_MIN);
      s.nextTeleportHeight = null;
      s.nextTeleportSpeed = null;
    }
    effect(s, "core-extract", s.miner.x, s.miner.y);
    sound(s, C.CUES.materialChime);
  } else {
    const radius =
      item === "dynamite" ? C.DYNAMITE_RADIUS : C.PLASTIC_EXPLOSIVES_RADIUS;
    let changed = false;
    for (
      let r = Math.max(1, m.row - radius);
      r <= Math.min(s.coreRow, m.row + radius);
      r++
    )
      for (
        let c = Math.max(1, m.col - radius);
        c <= Math.min(C.WORLD_COLS - 2, m.col + radius);
        c++
      ) {
        const t = tile(s, c, r);
        if (["bedrock", "core", "material", "tunnel"].includes(t.kind))
          continue;
        changed = true;
        put(s, c, r, cell("tunnel", t.band));
        if (t.kind === "gas") gasBlast(s, c, r);
      }
    if (!changed) {
      note(s, "NOTHING TO BLAST / Supply retained.");
      return;
    }
    effect(s, "gas-explosion", (m.col + 0.5) * C.TILE, (m.row + 0.5) * C.TILE);
    sound(s, C.CUES.gasExplosion);
    s.shake = 1;
  }
  s.items[item]--;
  note(s, `${C.ITEMS.find((i) => i.id === item)!.name.toUpperCase()} USED`);
  checkDeath(s);
}
export function jettison(s: DeepcoreState) {
  if (!s.satchel.coreSample) {
    note(s, "NO CORE SAMPLE CARRIED");
    return;
  }
  s.satchel.coreSample = false;
  s.coreGround = minerCell(s);
  note(s, "SAMPLE JETTISONED / Get clear of the blast.");
}
export function fabricate(s: DeepcoreState) {
  const part = C.ROCKET_COMPONENTS[s.rocket];
  if (!part) {
    note(s, "ROCKET COMPLETE / Ready to launch.");
    return;
  }
  if (s.credits < part.credits) {
    note(s, "INSUFFICIENT CREDITS");
    return;
  }
  if (
    part.material &&
    (part.material === "core-sample"
      ? !s.satchel.coreSample
      : !s.satchel[part.material])
  ) {
    note(s, "REQUIRED MATERIAL MISSING");
    return;
  }
  s.credits -= part.credits;
  s.rocket++;
  if (part.material === "core-sample") {
    s.satchel.coreSample = false;
    s.coreTimer = null;
  } else if (part.material) s.satchel[part.material]--;
  effect(s, "material-shimmer", buildingsLaunchX(), -10);
  note(s, `${part.name.toUpperCase()} INSTALLED`);
  sound(s, C.CUES.fabricate);
}
function buildingsLaunchX() {
  return 100 + 5 * 320 + 120;
}
export function launch(s: DeepcoreState) {
  if (s.rocket < C.ROCKET_COMPONENT_IDS.length) {
    note(s, "ASSEMBLY INCOMPLETE");
    return;
  }
  if (s.launchTime !== null) return;
  s.panel = null;
  s.screen = "in-mine";
  s.menuIndex = 0;
  s.camera = {
    x: clamp(buildingsLaunchX() - C.VIEW_W / 2, 0, C.WORLD_W - C.VIEW_W),
    y: C.SURFACE_Y - C.MINER_H / 2 - C.VIEW_H / 2,
    lead: 0,
  };
  s.launchTime = 0;
  s.coreTimer = null;
  s.satchel.coreSample = false;
  effect(s, "launch-exhaust", buildingsLaunchX(), C.SURFACE_Y);
  sound(s, C.CUES.launch);
}
export function breakCell(s: DeepcoreState, c: number, r: number) {
  const t = tile(s, c, r),
    x = (c + 0.5) * C.TILE,
    y = (r + 0.5) * C.TILE;
  if (t.ore) {
    if (slots(s) < C.CARGO_TIERS[s.tiers.cargo - 1]) {
      s.cargo[t.ore] = (s.cargo[t.ore] ?? 0) + 1;
      effect(s, "ore-sparkle", x, y, mineralColor(t.ore));
      sound(s, C.CUES.orePickup);
      note(
        s,
        `+ ${t.ore.toUpperCase()} / ${loadKg(s)} kg • ${Math.round((loadKg(s) / lift(s)) * 100)}% lift`,
      );
    } else note(s, "CARGO FULL / Ore lost. Open [I] to shed weight.");
  }
  if (t.material) {
    s.satchel[t.material]++;
    effect(s, "material-shimmer", x, y);
    sound(s, C.CUES.materialChime);
    note(s, `${t.material.toUpperCase()} ACQUIRED`);
  }
  if (t.kind === "gas") gasBlast(s, c, r);
  if (t.kind === "lava") {
    damage(
      s,
      (t.band === "coreshell"
        ? C.LAVA_DRILL_CORESHELL
        : C.LAVA_DRILL_DEEPSTONE) *
        (1 - C.RADIATOR_TIERS[s.tiers.radiator - 1]),
      "lava",
    );
    effect(s, "lava-embers", x, y);
    sound(s, C.CUES.lavaSizzle);
  }
  put(s, c, r, cell("tunnel", t.band));
}
export function extract(s: DeepcoreState, c: number, r: number) {
  if (s.coreTimer !== null) return;
  s.satchel.coreSample = true;
  s.coreTimer = C.CORE_TIMER;
  effect(s, "core-extract", (c + 0.5) * C.TILE, r * C.TILE);
  sound(s, C.CUES.materialChime);
  note(s, "CORE SAMPLE LIVE / 90 seconds to get home. [J] to jettison.");
}
export function expireCore(s: DeepcoreState) {
  const ground = s.coreGround;
  const x = ground ? (ground.col + 0.5) * C.TILE : s.miner.x + C.MINER_W / 2,
    y = ground ? (ground.row + 0.5) * C.TILE : s.miner.y + C.MINER_H / 2;
  effect(s, "core-detonation", x, y);
  sound(s, C.CUES.gasExplosion);
  s.shake = 2;
  const hit =
    s.satchel.coreSample ||
    Math.hypot(s.miner.x + C.MINER_W / 2 - x, s.miner.y + C.MINER_H / 2 - y) <=
      C.CORE_BLAST_TILES * C.TILE;
  s.coreTimer = null;
  s.coreGround = null;
  s.satchel.coreSample = false;
  if (hit) finish(s, "core-detonation");
}
export const transaction = (s: ReadState, fn: (n: DeepcoreState) => void) => {
  const n = clone(s);
  fn(n);
  return n;
};
export { depth };
