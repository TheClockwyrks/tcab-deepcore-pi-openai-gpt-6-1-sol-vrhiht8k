import type { UpdateApi } from "@clockwyrks/simple-2d";
import * as C from "./constants";
import { BAND_COLORS } from "./palette";
import {
  type DeepcoreState,
  type ReadState,
  clone,
  clamp,
  tile,
  put,
  grounded,
  maxFuel,
  loadKg,
  lift,
  depth,
  minerCell,
  effect,
  sound,
} from "./model";
import * as T from "./transactions";
import * as UI from "./interface";
export interface Held {
  left: number;
  right: number;
  down: number;
  up: number;
}
const STEP = 1 / 120;
function surface(s: ReadState, c: number, r: number): number {
  const t = tile(s, c, r),
    below = tile(s, c, r + 1);
  return (
    r * C.TILE +
    (t.health !== null &&
    t.maxHealth &&
    t.health < t.maxHealth &&
    below.kind !== "tunnel" &&
    below.kind !== "lava"
      ? (1 - t.health / t.maxHealth) * C.TILE
      : 0)
  );
}
function move(s: DeepcoreState, dx: number, dy: number) {
  const m = s.miner,
    d = m.drilling;
  if (dx) {
    let nx = clamp(m.x + dx, C.TILE, C.WORLD_W - C.TILE - C.MINER_W);
    const c = Math.floor((dx > 0 ? nx + C.MINER_W - 0.001 : nx) / C.TILE);
    for (
      let r = Math.floor(m.y / C.TILE);
      r <= Math.floor((m.y + C.MINER_H - 0.01) / C.TILE);
      r++
    ) {
      const t = tile(s, c, r);
      if (
        t.kind === "tunnel" ||
        (d?.dir === "down" && d.col === c && d.row === r)
      )
        continue;
      if (m.y + C.MINER_H <= surface(s, c, r) + 0.01) continue;
      nx = dx > 0 ? c * C.TILE - C.MINER_W : (c + 1) * C.TILE;
      m.vx = 0;
    }
    m.x = nx;
  }
  if (dy) {
    let ny = m.y + dy;
    const top = Math.floor(Math.min(m.y, ny) / C.TILE),
      bottom = Math.floor((Math.max(m.y, ny) + C.MINER_H) / C.TILE);
    for (let r = top; r <= bottom; r++)
      for (
        let c = Math.floor((m.x + 0.01) / C.TILE);
        c <= Math.floor((m.x + C.MINER_W - 0.01) / C.TILE);
        c++
      ) {
        if (
          tile(s, c, r).kind === "tunnel" ||
          (d?.dir === "down" && d.col === c && d.row === r)
        )
          continue;
        const floor = surface(s, c, r);
        if (
          dy > 0 &&
          m.y + C.MINER_H <= floor + 0.1 &&
          ny + C.MINER_H >= floor
        ) {
          const impact =
            Math.max(0, m.vy - C.IMPACT_SAFE_SPEED) * C.IMPACT_DAMAGE_RATE;
          if (impact > 0) {
            T.damage(s, impact);
            effect(s, "impact-dust", m.x + C.MINER_W / 2, floor);
            sound(s, C.CUES.impact);
            s.shake = Math.max(s.shake, 0.4);
          }
          ny = Math.min(ny, floor - C.MINER_H);
          m.vy = 0;
        } else if (
          dy < 0 &&
          m.y >= (r + 1) * C.TILE - 0.1 &&
          ny < (r + 1) * C.TILE
        ) {
          ny = Math.max(ny, (r + 1) * C.TILE);
          m.vy = 0;
        }
      }
    m.y = ny;
  }
}
function drill(s: DeepcoreState, h: Held, dt: number, canCut: boolean) {
  const m = s.miner,
    old = m.drilling;
  let target: DeepcoreState["miner"]["drilling"] = null;
  if (m.drill && canCut && h.up === 0) {
    if (h.down) {
      const c = Math.floor((m.x + C.MINER_W / 2) / C.TILE),
        r =
          old?.dir === "down"
            ? old.row
            : Math.floor((m.y + C.MINER_H + 0.1) / C.TILE);
      if (
        tile(s, c, r).health !== null ||
        (tile(s, c, r).kind === "core" && s.coreTimer === null)
      )
        target = { col: c, row: r, dir: "down" };
    } else if (h.left || h.right) {
      const dir = h.right ? "right" : "left",
        edge = dir === "right" ? m.x + C.MINER_W : m.x;
      if (Math.abs(edge / C.TILE - Math.round(edge / C.TILE)) < 0.02) {
        const c = Math.floor((edge + (dir === "right" ? 0.1 : -0.1)) / C.TILE),
          r = Math.floor((m.y + C.MINER_H / 2) / C.TILE);
        if (tile(s, c, r).health !== null) target = { col: c, row: r, dir };
      }
    }
  }
  if (!target) {
    if (
      old?.dir === "down" &&
      m.travel &&
      tile(s, old.col, old.row).health !== null
    )
      m.y = surface(s, old.col, old.row) - C.MINER_H;
    m.drilling = null;
    s.drillClock = 0;
    return;
  }
  if (
    !old ||
    old.col !== target.col ||
    old.row !== target.row ||
    old.dir !== target.dir
  )
    s.drillClock = 0;
  m.drilling = target;
  s.drillClock += dt;
  const t = tile(s, target.col, target.row);
  if (s.drillClock + 1e-9 >= C.DRILL_HIT_INTERVAL && m.fuel > 0) {
    s.drillClock -= C.DRILL_HIT_INTERVAL;
    if (t.kind === "core") {
      m.fuel = Math.max(0, m.fuel - C.DRILL_HIT_FUEL);
      T.extract(s, target.col, target.row);
      return;
    }
    m.fuel = Math.max(0, m.fuel - C.DRILL_HIT_FUEL);
    const health = (t.health ?? 0) - C.DRILL_DAMAGE_TIERS[s.tiers.drill - 1];
    const below = tile(s, target.col, target.row + 1),
      sink =
        target.dir === "down" &&
        below.kind !== "tunnel" &&
        below.kind !== "lava";
    if (health <= 0) {
      T.breakCell(s, target.col, target.row);
      if (sink && m.travel) m.y = (target.row + 1) * C.TILE - C.MINER_H;
      m.drilling = null;
    } else {
      put(s, target.col, target.row, { ...t, health });
      if (sink && m.travel)
        m.y =
          target.row * C.TILE +
          (1 - health / t.maxHealth!) * C.TILE -
          C.MINER_H;
    }
    effect(
      s,
      "drill-debris",
      (target.col + 0.5) * C.TILE,
      target.dir === "down" ? m.y + C.MINER_H : (target.row + 0.5) * C.TILE,
      t.band ? BAND_COLORS[t.band] : null,
    );
  }
  const current = tile(s, target.col, target.row),
    below = tile(s, target.col, target.row + 1);
  if (
    m.drilling &&
    target.dir === "down" &&
    current.health !== null &&
    current.maxHealth &&
    m.travel &&
    below.kind !== "tunnel" &&
    below.kind !== "lava"
  ) {
    const progress =
      1 -
      current.health / current.maxHealth +
      ((s.drillClock / C.DRILL_HIT_INTERVAL) *
        C.DRILL_DAMAGE_TIERS[s.tiers.drill - 1]) /
        current.maxHealth;
    m.y = (target.row + clamp(progress, 0, 1)) * C.TILE - C.MINER_H;
  }
}
function tick(s: DeepcoreState, h: Held, dt: number) {
  if (s.screen !== "in-mine") return;
  s.elapsedSeconds += dt;
  s.animationTime += dt;
  s.hurt = Math.max(0, s.hurt - dt);
  s.noteAge = Math.max(0, s.noteAge - dt);
  s.shake = Math.max(0, s.shake - dt);
  s.effects = s.effects
    .map((e) => ({ ...e, age: e.age + dt }))
    .filter((e) => e.age < 2.5);
  if (s.notice) {
    s.notice.age += dt;
    if (s.notice.age > C.NOTICE_DELAY + C.NOTICE_FADE) s.notice = null;
  }
  T.checkDeath(s);
  if (s.screen !== "in-mine") return;
  if (s.coreTimer !== null) {
    s.coreTimer -= dt;
    if (s.coreTimer <= 0) T.expireCore(s);
  }
  if (s.screen !== "in-mine") return;
  if (s.launchTime !== null) {
    s.launchTime += dt;
    if (Math.floor(s.launchTime * 12) !== Math.floor((s.launchTime - dt) * 12))
      effect(
        s,
        "launch-exhaust",
        1820,
        C.SURFACE_Y - s.launchTime * s.launchTime * 110,
      );
    if (s.launchTime > 4) T.finish(s, null);
    return;
  }
  if (!s.panel) {
    const m = s.miner,
      wasGrounded = grounded(s),
      thrust = h.up > 0 && m.fuel > 0;
    if (h.left) m.facing = "west";
    if (h.right) m.facing = "east";
    const load = loadKg(s) / lift(s),
      jet = C.JETPACK_TIERS[s.tiers.jetpack - 1];
    if (m.travel) {
      m.vx =
        s.hurt > 0 && Math.abs(m.vx) > C.WALK_SPEED
          ? m.vx * Math.exp(-3 * dt)
          : (h.right - h.left) * C.WALK_SPEED;
      if (thrust)
        m.vy = Math.max(
          -jet.emptyClimb * (1 - (1 - C.CLIMB_CAP_FLOOR) * Math.min(1, load)),
          m.vy - jet.emptyAccel * Math.max(0, 1 - load) * dt,
        );
      else if (!m.drilling)
        m.vy = Math.min(
          C.FALL_TERMINAL_EMPTY +
            (C.FALL_TERMINAL_LOADED - C.FALL_TERMINAL_EMPTY) *
              Math.min(1, load),
          m.vy + C.GRAVITY * dt,
        );
      move(s, m.vx * dt, 0);
    }
    drill(s, h, dt, wasGrounded || grounded(s));
    if (m.travel && !m.drilling) move(s, 0, m.vy * dt);
    if (thrust) {
      const burn =
        (C.THRUST_BURN_MAX +
          (C.THRUST_BURN_MIN - C.THRUST_BURN_MAX) *
            Math.min(1, Math.max(0, -m.vy) / C.CRUISE_SPEED)) *
        C.THRUST_BURN_SIZE_MULT[s.worldSize];
      m.fuel -= burn * dt;
      if (
        Math.floor(s.elapsedSeconds * 18) !==
        Math.floor((s.elapsedSeconds - dt) * 18)
      )
        effect(s, "jetpack-exhaust", m.x + 12, m.y + 52);
    }
    if (!wasGrounded && (h.left || h.right)) m.fuel -= C.AIR_BURN * dt;
    if (m.y + C.MINER_H > C.SURFACE_Y + 0.1) m.fuel -= C.LIFE_SUPPORT_BURN * dt;
    m.fuel = Math.max(0, m.fuel);
    // Heat contact includes a flush encounter at a lava pool's boundary.
    let hot = false;
    for (
      let r = Math.floor((m.y - 0.1) / C.TILE);
      r <= Math.floor((m.y + C.MINER_H + 0.1) / C.TILE);
      r++
    )
      for (
        let c = Math.floor((m.x - 0.1) / C.TILE);
        c <= Math.floor((m.x + C.MINER_W + 0.1) / C.TILE);
        c++
      ) {
        if (
          tile(s, c, r).kind === "lava" &&
          !(m.drilling?.col === c && m.drilling.row === r)
        )
          hot = true;
      }
    if (hot) {
      T.damage(
        s,
        C.LAVA_CONTACT_DPS * (1 - C.RADIATOR_TIERS[s.tiers.radiator - 1]) * dt,
        "lava",
      );
      if (
        Math.floor(s.elapsedSeconds * 4) !==
        Math.floor((s.elapsedSeconds - dt) * 4)
      ) {
        effect(s, "lava-embers", m.x, m.y + C.MINER_H);
        sound(s, C.CUES.lavaSizzle);
      }
    }
    const prev = m.state;
    m.state = m.drilling
      ? m.drilling.dir === "down"
        ? "drill-down"
        : "drill-side"
      : s.hurt > 0
        ? "hurt"
        : m.fuel <= 0 && depth(s) > 0
          ? "fuel-out"
          : thrust
            ? "jetpack"
            : !grounded(s)
              ? "fall"
              : h.left || h.right
                ? "walk"
                : "idle";
    if (prev !== m.state) s.animationTime = 0;
    T.checkDeath(s);
  }
  s.deepestDepthMeters = Math.max(s.deepestDepthMeters, depth(s));
  const m = s.miner,
    target =
      Math.abs(m.vy) <= C.CAM_STILL_SPEED
        ? 0
        : Math.sign(m.vy) * C.CAM_LEAD_MAX;
  const unwind =
    Math.sign(target) !== Math.sign(s.camera.lead) ||
    Math.abs(target) < Math.abs(s.camera.lead);
  const amount =
    (C.CAM_LEAD_MAX / C.CAM_LEAD_RAMP) * (unwind ? C.CAM_UNWIND_MULT : 1) * dt;
  s.camera.lead += clamp(target - s.camera.lead, -amount, amount);
  s.camera.x = clamp(
    m.x + C.MINER_W / 2 - C.VIEW_W / 2,
    0,
    C.WORLD_W - C.VIEW_W,
  );
  s.camera.y = Math.min(
    m.y + C.MINER_H / 2 - C.VIEW_H / 2 + s.camera.lead,
    (s.coreRow + 1) * C.TILE - C.VIEW_H,
  );
  // Every visible gas pocket breathes at least once every two seconds.
  if (
    Math.floor(s.elapsedSeconds / C.GAS_SEEP_PERIOD) !==
    Math.floor((s.elapsedSeconds - dt) / C.GAS_SEEP_PERIOD)
  ) {
    const r0 = Math.max(1, Math.floor(s.camera.y / C.TILE)),
      r1 = Math.min(s.coreRow, Math.ceil((s.camera.y + C.VIEW_H) / C.TILE));
    for (let r = r0; r <= r1; r++)
      for (
        let c = Math.floor(s.camera.x / C.TILE);
        c <= Math.floor((s.camera.x + C.VIEW_W) / C.TILE);
        c++
      )
        if (tile(s, c, r).kind === "gas")
          effect(s, "gas-seep", (c + 0.5) * C.TILE, (r + 0.5) * C.TILE);
  }
}
export function advance(s: DeepcoreState, h: Held, dt: number): DeepcoreState {
  s.accumulator += dt;
  while (s.accumulator + 1e-9 >= STEP) {
    s.accumulator -= STEP;
    tick(s, h, STEP);
  }
  return s;
}
export function update(
  state: ReadState,
  api: UpdateApi,
  dt: number,
): DeepcoreState {
  let s = clone(state);
  s.simTime += dt;
  s.muted = api.audio.muted();
  T.checkDeath(s);
  if (api.input.pressed("mute")) s.muted = !s.muted;
  const pressed = Object.fromEntries(
    C.ACTION_NAMES.filter((a) => a !== "mute").map((a) => [
      a,
      api.input.pressed(a),
    ]),
  ) as Record<C.ActionName, boolean>;
  const held = {
    left: api.input.value("left"),
    right: api.input.value("right"),
    down: api.input.value("down"),
    up: api.input.value("up"),
  };
  if (pressed.pause) UI.back(s);
  else if (s.screen === "in-mine") {
    C.ITEM_IDS.forEach((id, i) => {
      if (pressed[`supply${i + 1}` as C.ActionName]) T.useItem(s, id);
    });
    if (pressed.jettison) T.jettison(s);
    if (pressed.inventory) UI.act(s, "inventory", null);
    if (s.panel) {
      const cs = UI.controls(s).filter(
        (c) =>
          !["inventory", "pause", "mute", "dismiss-notice"].includes(c.control),
      );
      if (pressed.down)
        s.panelIndex = (s.panelIndex + 1) % Math.max(1, cs.length);
      if (pressed.up)
        s.panelIndex = (s.panelIndex + cs.length - 1) % Math.max(1, cs.length);
      const c = cs[s.panelIndex];
      if (pressed.activate && c?.enabled) UI.act(s, c.control, c.subject);
    } else if (pressed.activate) {
      const b = UI.nearbyBuilding(s);
      if (b) UI.activateBuilding(s, b.id);
    }
  } else {
    const count = UI.menuItems(s).length;
    if (pressed.down) s.menuIndex = (s.menuIndex + 1) % count;
    if (pressed.up) s.menuIndex = (s.menuIndex + count - 1) % count;
    if (pressed.activate) s = UI.choose(s);
  }
  for (const p of api.input.pointerSamples()) {
    const items = UI.menuItems(s);
    let hitId: string | null = null;
    items.forEach((_, i) => {
      const r = UI.menuItemRect(s, i);
      if (r && UI.hit(r, p.x, p.y)) {
        s.menuIndex = i;
        hitId = "menu:" + i;
      }
    });
    for (const c of UI.controls(s))
      if (c.enabled && UI.hit(c, p.x, p.y)) hitId = c.id;
    if (s.screen === "in-mine" && !s.panel) {
      const near = UI.nearbyBuilding(s);
      if (
        near &&
        UI.hit(
          {
            x: near.x - s.camera.x,
            y: near.y - s.camera.y + C.HUD_H,
            w: near.w,
            h: near.h,
          },
          p.x,
          p.y,
        )
      )
        hitId = "building:" + near.id;
    }
    if (p.type === "down") {
      if (hitId) s.pointerDown[p.id] = hitId;
      if (hitId === "dismiss-notice") s.notice = null;
    }
    if (p.type === "up") {
      if (hitId && s.pointerDown[p.id] === hitId) {
        if (hitId.startsWith("menu:")) s = UI.choose(s);
        else if (hitId.startsWith("building:"))
          UI.activateBuilding(s, hitId.slice(9) as C.BuildingId);
        else {
          const c = UI.controls(s).find((c) => c.id === hitId);
          if (c) UI.act(s, c.control, c.subject);
        }
      }
      delete s.pointerDown[p.id];
    }
  }
  api.audio.setMuted(s.muted);
  s = advance(s, held, dt);
  if (s.screen === "game-over") {
    s.effects = s.effects
      .map((e) => ({ ...e, age: e.age + dt }))
      .filter((e) => e.age < 2.5);
    s.shake = Math.max(0, s.shake - dt);
  }
  T.checkDeath(s);
  api.audio.loop(C.CUES.music);
  const live = s.screen === "in-mine" && !s.panel;
  if (live && s.miner.drilling) api.audio.loop(C.CUES.drill);
  else api.audio.stop(C.CUES.drill);
  if (live && s.miner.state === "jetpack") api.audio.loop(C.CUES.thrust);
  else api.audio.stop(C.CUES.thrust);
  if (
    s.screen === "in-mine" &&
    s.miner.fuel < maxFuel(s) * C.LOW_FUEL_FRACTION &&
    Math.floor(s.simTime / 2) !== Math.floor(state.simTime / 2)
  )
    sound(s, C.CUES.alarmFuel);
  if (s.screen === "in-mine" && s.coreTimer !== null) {
    const period = s.coreTimer < 15 ? 0.25 : s.coreTimer < 30 ? 0.5 : 1;
    if (Math.floor(s.simTime / period) !== Math.floor(state.simTime / period))
      sound(s, C.CUES.alarmCore);
  }
  for (const cue of s.sounds) api.audio.play(cue);
  s.sounds = [];
  return s;
}
export { minerCell };
