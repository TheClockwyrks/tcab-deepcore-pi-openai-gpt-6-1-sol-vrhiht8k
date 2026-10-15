import type { RenderApi } from "@clockwyrks/simple-2d";
import { ParticleCanvasPlayer } from "@clockwyrks/particle-runtime/canvas";
import type { ParticleSystem } from "@clockwyrks/particle-runtime";
import * as C from "./constants";
import {
  type ReadState,
  type Rect,
  type Cell,
  tile,
  clamp,
  snapshot,
  buildings,
  depth,
  slots,
  loadKg,
  lift,
  maxFuel,
  maxHull,
  scanner,
} from "./model";
import * as UI from "./interface";
import { mineralColor } from "./palette";
export const BACKGROUND = "#0b1720";
const ink = "#dce5d9",
  muted = "#819a9e",
  amber = "#eec081",
  teal = "#8ad8c7",
  red = "#ef957b";
const frameCounts: Record<C.MinerState, number> = {
  idle: 4,
  walk: 6,
  "drill-down": 4,
  "drill-side": 4,
  jetpack: 4,
  fall: 4,
  hurt: 3,
  "fuel-out": 3,
};
function text(
  ctx: CanvasRenderingContext2D,
  str: string,
  x: number,
  y: number,
  size = 16,
  color = ink,
  font = "monospace",
) {
  ctx.fillStyle = color;
  ctx.font = /^\d/.test(font)
    ? font.replace(" ", ` ${size}px `)
    : `${size}px ${font}`;
  ctx.fillText(str, x, y);
}
function box(
  ctx: CanvasRenderingContext2D,
  r: Rect,
  fill: string,
  stroke?: string,
) {
  ctx.fillStyle = fill;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
  }
}
function image(
  s: ReadState,
  ctx: CanvasRenderingContext2D,
  path: string,
  x: number,
  y: number,
  w?: number,
  h?: number,
) {
  const im = s.images[path];
  if (!im) return;
  if (w === undefined) ctx.drawImage(im, x, y);
  else ctx.drawImage(im, x, y, w, h ?? w);
}
function rock(
  s: ReadState,
  ctx: CanvasRenderingContext2D,
  t: Readonly<Cell>,
  c: number,
  r: number,
  x: number,
  y: number,
) {
  if (!t.band) {
    image(s, ctx, "tiles/bedrock.png", x, y, C.TILE);
    return;
  }
  image(
    s,
    ctx,
    `tiles/${t.band}-${Math.abs((c * 17 + r * 31) % C.TILE_VARIANTS)}.png`,
    x,
    y,
    C.TILE,
  );
}
function passage(
  s: ReadState,
  ctx: CanvasRenderingContext2D,
  c: number,
  r: number,
  x: number,
  y: number,
  kind: "tunnel" | "lava",
) {
  const joins = (dc: number, dr: number) =>
    tile(s, c + dc, r + dr).kind === kind || (kind === "tunnel" && r + dr <= 0);
  const up = joins(0, -1),
    down = joins(0, 1),
    left = joins(-1, 0),
    right = joins(1, 0),
    lip = 7,
    round = 13;
  const xx = x + (left ? 0 : lip),
    yy = y + (up ? 0 : lip),
    ww = C.TILE - (left ? 0 : lip) - (right ? 0 : lip),
    hh = C.TILE - (up ? 0 : lip) - (down ? 0 : lip);
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(xx, yy, ww, hh, [
    up || left ? 0 : round,
    up || right ? 0 : round,
    down || right ? 0 : round,
    down || left ? 0 : round,
  ]);
  ctx.clip();
  if (kind === "tunnel") image(s, ctx, "tiles/tunnel.png", x, y, C.TILE);
  else
    image(
      s,
      ctx,
      `hazards/lava/frame${String(Math.floor(s.simTime * 6) % 4).padStart(2, "0")}.png`,
      x,
      y,
      C.TILE,
    );
  ctx.restore();
  // Convex rock nubs at concave tunnel corners: a quarter-circle, not a notch.
  for (const [dx, dy, angle] of [
    [-1, -1, 0],
    [1, -1, Math.PI / 2],
    [1, 1, Math.PI],
    [-1, 1, Math.PI * 1.5],
  ]) {
    if (joins(dx, 0) && joins(0, dy) && !joins(dx, dy)) {
      ctx.save();
      ctx.beginPath();
      const cx = dx < 0 ? x : x + C.TILE,
        cy = dy < 0 ? y : y + C.TILE;
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, lip, angle, angle + Math.PI / 2);
      ctx.closePath();
      ctx.clip();
      rock(s, ctx, tile(s, c, r), c, r, x, y);
      ctx.restore();
    }
  }
}
function terrain(s: ReadState, ctx: CanvasRenderingContext2D) {
  const c0 = Math.max(0, Math.floor(s.camera.x / C.TILE)),
    c1 = Math.min(
      C.WORLD_COLS - 1,
      Math.ceil((s.camera.x + C.VIEW_W) / C.TILE),
    );
  const r0 = Math.max(1, Math.floor(s.camera.y / C.TILE)),
    r1 = Math.min(s.coreRow, Math.ceil((s.camera.y + C.VIEW_H) / C.TILE));
  for (let r = r0; r <= r1; r++)
    for (let c = c0; c <= c1; c++) {
      const t = tile(s, c, r),
        x = c * C.TILE,
        y = r * C.TILE;
      rock(s, ctx, t, c, r, x, y);
      if (t.kind === "tunnel" || t.kind === "lava")
        passage(s, ctx, c, r, x, y, t.kind);
      if (t.ore) image(s, ctx, `ore/${t.ore}.png`, x, y, C.TILE);
      if (t.material)
        image(s, ctx, `materials/${t.material}.png`, x, y, C.TILE);
      if (t.kind === "core") image(s, ctx, "materials/core.png", x, y, C.TILE);
      if (t.kind === "stone")
        image(s, ctx, `tiles/stone-${(c + r) % 2}.png`, x, y, C.TILE);
      if (t.health !== null && t.maxHealth && t.health < t.maxHealth)
        image(
          s,
          ctx,
          `tiles/crack/frame${String(Math.min(C.CRACK_FRAMES - 1, Math.floor((1 - t.health / t.maxHealth) * C.CRACK_FRAMES))).padStart(2, "0")}.png`,
          x,
          y,
          C.TILE,
        );
      ctx.strokeStyle = "#08141a22";
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, C.TILE, C.TILE);
    }
}
function particle(
  s: ReadState,
  ctx: CanvasRenderingContext2D,
  name: string,
  x: number,
  y: number,
  age: number,
  seed: number,
  tint: string | null,
) {
  const source = s.systems[name];
  if (!source) return;
  const system = tint
    ? {
        ...source,
        emitters: source.emitters.map((e) => ({
          ...e,
          particle: {
            ...e.particle,
            colorGradient: e.particle?.colorGradient?.map((stop, i) => ({
              ...stop,
              color: i === 0 ? tint : stop.color,
            })),
          },
        })),
      }
    : source;
  ctx.save();
  ctx.translate(x - 128, y - 128);
  ctx.scale(256 / ctx.canvas.width, 256 / ctx.canvas.height);
  // Reconstruct the visual simulation from its authoritative event age. Rendering
  // twice is identical and never advances a game clock or retains mutable players.
  ctx.save();
  ctx.globalAlpha = 0;
  const player = new ParticleCanvasPlayer(system as ParticleSystem, ctx, {
    seed,
    clear: false,
    pixelRadius: name === "gas-seep" ? 6 : 4,
  });
  ctx.restore();
  let remaining = Math.max(0.016, age);
  while (remaining > 0) {
    const step = Math.min(remaining, 1 / 60);
    player.simulator.step(step * 1000);
    remaining -= step;
  }
  player.update(0);
  ctx.restore();
}
function world(s: ReadState, ctx: CanvasRenderingContext2D) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, C.HUD_H, C.VIEW_W, C.VIEW_H);
  ctx.clip();
  const shake =
    s.shake > 0 ? Math.sin(s.simTime * 93) * Math.min(14, s.shake * 10) : 0;
  ctx.translate(
    -s.camera.x + shake,
    C.HUD_H - s.camera.y + Math.cos(s.simTime * 71) * shake * 0.5,
  );
  if (s.camera.y < C.SURFACE_Y) {
    image(
      s,
      ctx,
      "surface/sky.png",
      s.camera.x,
      s.camera.y,
      1280,
      Math.max(520, C.SURFACE_Y - s.camera.y),
    );
  }
  terrain(s, ctx);
  if (s.camera.y < 300) {
    for (let c = 0; c < C.WORLD_COLS; c++)
      if (c !== C.CAVE_MOUTH_COL)
        image(s, ctx, "surface/ground.png", c * C.TILE, C.SURFACE_Y, 80, 20);
    image(
      s,
      ctx,
      "surface/cave-mouth.png",
      C.CAVE_MOUTH_COL * C.TILE,
      0,
      80,
      80,
    );
    for (const b of buildings) {
      image(s, ctx, `surface/${b.id}.png`, b.x, b.y, b.w, b.h);
      text(
        ctx,
        b.id.replace(/-/g, " ").toUpperCase(),
        b.x + 12,
        b.y + 4,
        12,
        muted,
      );
      const near = UI.nearbyBuilding(s)?.id === b.id;
      if (near) {
        box(
          ctx,
          { x: b.x + 38, y: C.SURFACE_Y + 25, w: 164, h: 30 },
          "#101e29ee",
          "#6fa8a0",
        );
        text(
          ctx,
          "[E] " + (b.id === "save-pad" ? "SAVE" : "INTERACT"),
          b.x + 53,
          C.SURFACE_Y + 45,
          14,
          teal,
        );
      }
    }
    const b = buildings[5],
      rise = s.launchTime === null ? 0 : s.launchTime * s.launchTime * 110;
    image(
      s,
      ctx,
      `rocket/stage${s.rocket}.png`,
      b.x + 40,
      C.SURFACE_Y - 220 - rise,
      160,
      220,
    );
    text(ctx, "↓ MINE ACCESS", C.CAVE_MOUTH_COL * C.TILE - 18, -30, 13, amber);
  }
  if (s.coreGround) {
    const x = s.coreGround.col * C.TILE,
      y = s.coreGround.row * C.TILE;
    image(s, ctx, "materials/core-sample.png", x, y, C.TILE);
    text(ctx, `${s.coreTimer?.toFixed(1)}s`, x + 6, y - 7, 20, red);
  }
  if (s.launchTime === null) {
    const m = s.miner,
      index =
        m.state === "hurt"
          ? Math.min(
              frameCounts.hurt - 1,
              Math.floor(s.animationTime * C.ANIM_FPS),
            )
          : Math.floor(s.animationTime * C.ANIM_FPS) % frameCounts[m.state];
    ctx.save();
    ctx.translate(m.x + C.MINER_W / 2, m.y + C.MINER_H - 40);
    if (m.facing === "west") ctx.scale(-1, 1);
    image(
      s,
      ctx,
      `miner/${m.state}/frame${String(index).padStart(2, "0")}.png`,
      -40,
      -40,
      C.MINER_SPRITE,
    );
    ctx.restore();
  }
  for (const e of s.effects)
    particle(s, ctx, e.name, e.x, e.y, e.age, e.seed, e.tint);
  ctx.restore();
  // Subterranean light falloff; the lamp keeps the geology legible.
  if (depth(s) > 12) {
    const mx = s.miner.x + C.MINER_W / 2 - s.camera.x,
      my = s.miner.y + C.MINER_H / 2 - s.camera.y + C.HUD_H;
    const light = ctx.createRadialGradient(mx, my, 75, mx, my, 850);
    light.addColorStop(0, "#03101a00");
    light.addColorStop(0.55, "#030c1620");
    light.addColorStop(1, "#030b16aa");
    ctx.fillStyle = light;
    ctx.fillRect(0, C.HUD_H, C.VIEW_W, C.VIEW_H);
  }
}
function gauge(
  s: ReadState,
  ctx: CanvasRenderingContext2D,
  key: string,
  x: number,
  value: number,
  max: number,
  color: string,
) {
  image(s, ctx, `icons/${key}.png`, x, 15, 24);
  text(ctx, key.toUpperCase(), x + 33, 20, 10, muted);
  text(ctx, `${Math.ceil(value)} / ${max}`, x + 33, 37, 14, color);
  box(ctx, { x: x + 33, y: 44, w: 126, h: 3 }, "#273b44");
  box(
    ctx,
    { x: x + 33, y: 44, w: 126 * clamp(value / max, 0, 1), h: 3 },
    color,
  );
}
function hud(s: ReadState, ctx: CanvasRenderingContext2D) {
  box(ctx, { x: 0, y: 0, w: C.STAGE_W, h: C.HUD_H }, "#101e28");
  box(ctx, { x: 0, y: 55, w: C.STAGE_W, h: 1 }, "#45565a");
  gauge(
    s,
    ctx,
    "fuel",
    20,
    s.miner.fuel,
    maxFuel(s),
    s.miner.fuel < maxFuel(s) * C.LOW_FUEL_FRACTION ? red : amber,
  );
  gauge(
    s,
    ctx,
    "hull",
    205,
    s.miner.hull,
    maxHull(s),
    s.miner.hull < maxHull(s) * C.LOW_HULL_FRACTION ? red : teal,
  );
  image(s, ctx, "icons/cargo.png", 395, 16, 24);
  text(
    ctx,
    `BAY ${slots(s)} / ${C.CARGO_TIERS[s.tiers.cargo - 1]}`,
    430,
    22,
    11,
    muted,
  );
  text(
    ctx,
    loadKg(s) >= lift(s)
      ? `${C.OVERLOAD} ${loadKg(s)}kg`
      : `${loadKg(s)} kg / ${lift(s)} kg`,
    430,
    41,
    13,
    loadKg(s) >= lift(s) ? red : ink,
  );
  image(s, ctx, "icons/credits.png", 615, 15, 24);
  text(ctx, "CREDITS", 649, 21, 10, muted);
  text(ctx, Math.floor(s.credits).toLocaleString(), 649, 41, 18, amber);
  image(s, ctx, "icons/depth.png", 758, 15, 24);
  text(ctx, "DEPTH", 789, 21, 10, muted);
  text(ctx, `${Math.floor(depth(s))} m`, 789, 41, 18);
  for (const [i, m] of C.MATERIALS.entries()) {
    ctx.globalAlpha = s.satchel[m] > 0.0 ? 1 : 0.25;
    image(s, ctx, `icons/${m}.png`, 923 + i * 35, 17, 24);
    ctx.globalAlpha = 1;
  }
  for (const c of UI.controls(s).filter((c) =>
    ["inventory", "pause", "mute"].includes(c.control),
  )) {
    box(ctx, c, "#1c303b", "#3b525b");
    text(ctx, c.label, c.x + 10, c.y + 23, 13, muted);
  }
}
function overlays(s: ReadState, ctx: CanvasRenderingContext2D) {
  const m = minerCellBand(s);
  box(ctx, { x: 1018, y: 83, w: 236, h: 54 }, "#0c1922d9", "#354b53");
  text(ctx, "STRATUM / " + m.toUpperCase(), 1034, 104, 11, muted);
  text(
    ctx,
    s.worldSize.toUpperCase() + " · " + s.mode.toUpperCase(),
    1034,
    124,
    11,
    amber,
  );
  if (s.coreTimer !== null && s.satchel.coreSample) {
    box(ctx, { x: 430, y: 78, w: 420, h: 76 }, "#291f25ee", "#be7b58");
    text(ctx, "UNSTABLE CORE SAMPLE", 451, 103, 13, red);
    text(ctx, `${s.coreTimer.toFixed(1)} s`, 451, 138, 30, amber);
    text(ctx, "[J] JETTISON", 662, 134, 14, red);
  }
  const scan = scanner(s);
  if (scan.locked) {
    box(ctx, { x: 28, y: 82, w: 280, h: 58 }, "#0a232bd9", "#4d8e89");
    text(ctx, `SCANNER / ${scan.target?.toUpperCase()}`, 44, 103, 12, teal);
    text(ctx, `${scan.distanceTiles?.toFixed(1)} TILES`, 44, 126, 15);
    const x = 275,
      y = 113;
    ctx.strokeStyle = teal;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + scan.dirX * 20, y + scan.dirY * 20);
    ctx.stroke();
  }
  if (s.noteAge > 0) {
    ctx.globalAlpha = Math.min(1, s.noteAge);
    box(
      ctx,
      { x: 28, y: 660, w: Math.min(1000, s.note.length * 8 + 40), h: 35 },
      "#10252fee",
      "#3d6669",
    );
    text(ctx, s.note, 44, 683, 13, teal);
    ctx.globalAlpha = 1;
  }
  if (!s.panel) {
    text(
      ctx,
      "A D  MOVE    S  DRILL    W / SPACE  THRUST",
      30,
      627,
      12,
      "#c8d0bd",
    );
    text(ctx, "I  CARGO    1–6  SUPPLIES    ESC  PAUSE", 30, 646, 11, muted);
  }
  if (s.notice && s.notice.age >= C.NOTICE_DELAY) {
    const gas = s.notice.hazard === "gas";
    box(ctx, { x: 30, y: 548, w: 620, h: 105 }, "#142b36f5", "#b38d66");
    text(
      ctx,
      gas ? "HAZARD / VOLATILE GAS" : "HAZARD / MOLTEN SEAM",
      50,
      574,
      15,
      amber,
    );
    text(
      ctx,
      gas
        ? "Watch for pale wisps. Gas ignores your radiator."
        : "Heat burns on contact. Upgrade your radiator.",
      50,
      602,
      13,
    );
    text(
      ctx,
      gas
        ? "Upgrade your hull. Detour around suspect cells."
        : "Plan a tunnel around pools to spare your hull.",
      50,
      625,
      13,
      muted,
    );
  }
}
function minerCellBand(s: ReadState) {
  return C.BANDS[
    Math.min(
      3,
      Math.floor(
        (Math.max(0, depth(s) / C.METERS_PER_ROW) / (s.coreRow - 1)) * 4,
      ),
    )
  ];
}
function panel(s: ReadState, ctx: CanvasRenderingContext2D) {
  if (!s.panel) return;
  box(ctx, { x: 0, y: C.HUD_H, w: C.STAGE_W, h: C.VIEW_H }, "#04101abb");
  box(ctx, { x: 180, y: 123, w: 920, h: 500 }, "#14252ff5", "#526766");
  box(ctx, { x: 180, y: 123, w: 4, h: 500 }, amber);
  text(
    ctx,
    s.panel.replace(/-/g, " ").toUpperCase(),
    210,
    163,
    26,
    ink,
    "sans-serif",
  );
  text(ctx, "↑ ↓  SELECT   ENTER  CONFIRM   ESC  CLOSE", 655, 161, 12, muted);
  ctx.strokeStyle = "#3b5258";
  ctx.beginPath();
  ctx.moveTo(210, 181);
  ctx.lineTo(1070, 181);
  ctx.stroke();
  if (s.panel === "inventory") {
    text(
      ctx,
      `BAY ${slots(s)} / ${C.CARGO_TIERS[s.tiers.cargo - 1]}   ${loadKg(s)} kg   LIFT ${lift(s)} kg`,
      210,
      595,
      13,
      loadKg(s) >= lift(s) ? red : amber,
    );
    text(
      ctx,
      `RESONITE ${s.satchel.resonite}   CRYENITE ${s.satchel.cryenite}   CORE ${s.satchel.coreSample ? "LIVE" : "—"}`,
      650,
      595,
      12,
      teal,
    );
    if (!slots(s)) text(ctx, "Your cargo bay is empty.", 220, 239, 15, muted);
  }
  const cs = UI.controls(s).filter(
    (c) =>
      !["inventory", "pause", "mute", "dismiss-notice"].includes(c.control),
  );
  cs.forEach((c, i) => {
    const selected = i === s.panelIndex;
    box(
      ctx,
      c,
      selected ? "#2b4249" : "#1b313b",
      selected ? "#b9af87" : "#344c55",
    );
    if (selected) box(ctx, { x: c.x, y: c.y, w: 3, h: c.h }, amber);
    if (c.control === "buy-item" || c.control === "use-item") {
      text(ctx, "◇", c.x + 13, c.y + 28, 23, c.enabled ? amber : muted);
    }
    text(
      ctx,
      c.label,
      c.x + (c.control.includes("item") ? 45 : 15),
      c.y + c.h * 0.65,
      c.h < 30 ? 12 : 14,
      c.enabled ? ink : "#657c83",
    );
    const detailW = ctx.measureText(c.detail).width;
    text(
      ctx,
      c.detail,
      c.x + c.w - detailW - 17,
      c.y + c.h * 0.65,
      c.h < 30 ? 11 : 13,
      c.enabled ? amber : "#60747c",
    );
  });
  if (s.panel === "ore-market") {
    let y = 310;
    for (const m of C.MINERALS)
      if (s.cargo[m.id]) {
        image(s, ctx, `ore/${m.id}.png`, 223, y - 24, 32);
        text(
          ctx,
          `${m.name}   ×${s.cargo[m.id]}   /   ${m.value} CR each`,
          275,
          y,
          15,
          mineralColor(m.id),
        );
        y += 22;
      }
    if (!slots(s))
      text(
        ctx,
        "Bring your haul back to turn rock into a ticket home.",
        225,
        320,
        16,
        muted,
      );
  }
  if (s.panel === "launch-pad") {
    C.ROCKET_COMPONENTS.forEach((p, i) =>
      text(
        ctx,
        `${i < s.rocket ? "✓" : "○"}  ${p.name.toUpperCase()}    ${p.credits.toLocaleString()} CR${p.material ? " / " + p.material.toUpperCase() : ""}`,
        235,
        330 + i * 42,
        15,
        i < s.rocket ? teal : i === s.rocket ? amber : muted,
      ),
    );
    image(s, ctx, `rocket/stage${s.rocket}.png`, 865, 320, 160, 220);
  }
  if (s.panel === "fuel-depot")
    text(
      ctx,
      "Fuel and hull never restore on their own. Budget the climb.",
      225,
      450,
      14,
      muted,
    );
}
function hero(s: ReadState, ctx: CanvasRenderingContext2D) {
  image(s, ctx, "surface/sky.png", 0, 0, 1280, 520);
  // Geological illustration built from the shipped rock, ore and actor art.
  ctx.save();
  ctx.beginPath();
  ctx.rect(660, 65, 620, 655);
  ctx.clip();
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 9; c++) {
      const band = C.BANDS[Math.min(3, Math.floor(r / 2.5))],
        x = 665 + c * 80,
        y = 135 + r * 80;
      image(s, ctx, `tiles/${band}-${(c + r) % 3}.png`, x, y, 80);
      if ((c * 7 + r * 11) % 8 === 0)
        image(s, ctx, `ore/${C.ORE_IDS[Math.min(9, r)]}.png`, x, y, 80);
      if (
        (c === 3 && r < 4) ||
        (r === 3 && c >= 3 && c < 7) ||
        (c === 6 && r > 3)
      ) {
        const left = r === 3 && c > 3,
          right = r === 3 && c < 6;
        const up = (c === 3 && r <= 3) || (c === 6 && r > 3);
        const down = (c === 3 && r < 3) || (c === 6 && r >= 3);
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(
          x + (left ? 0 : 6),
          y + (up ? 0 : 6),
          80 - (left ? 0 : 6) - (right ? 0 : 6),
          80 - (up ? 0 : 6) - (down ? 0 : 6),
          8,
        );
        ctx.clip();
        image(s, ctx, "tiles/tunnel.png", x, y, 80);
        ctx.restore();
      }
    }
  for (let c = 0; c < 9; c++)
    image(s, ctx, "surface/ground.png", 665 + c * 80, 125, 80, 20);
  image(s, ctx, "surface/cave-mouth.png", 905, 52, 80, 80);
  image(s, ctx, "surface/upgrade-shop.png", 690, -1, 240, 160);
  image(
    s,
    ctx,
    "miner/drill-down/frame" +
      String(Math.floor(s.simTime * 8) % 4).padStart(2, "0") +
      ".png",
    910,
    340,
    80,
    80,
  );
  image(s, ctx, "materials/resonite.png", 1144, 535, 80, 80);
  ctx.restore();
  const g = ctx.createLinearGradient(470, 0, 910, 0);
  g.addColorStop(0, BACKGROUND);
  g.addColorStop(1, "#0b172000");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1280, 720);
  const v = ctx.createLinearGradient(0, 490, 0, 720);
  v.addColorStop(0, "#0b172000");
  v.addColorStop(1, BACKGROUND);
  ctx.fillStyle = v;
  ctx.fillRect(0, 490, 1280, 230);
}
function menu(s: ReadState, ctx: CanvasRenderingContext2D) {
  if (s.screen === "title") {
    hero(s, ctx);
    text(ctx, "D / C     EXPEDITION SYSTEMS", 88, 87, 12, teal);
    text(ctx, C.TITLE_TEXT, 80, 240, 94, "#eee9d0", "900 sans-serif");
    box(ctx, { x: 88, y: 268, w: 65, h: 4 }, amber);
    text(ctx, "DEPTH IS CHEAP. HEIGHT IS EXPENSIVE.", 88, 314, 17, amber);
    text(ctx, "Dig a fortune. Build an escape. Come home.", 88, 344, 14, muted);
    text(
      ctx,
      "A LONE PROSPECTOR. A DEAD WORLD. ONE WAY OUT.",
      88,
      642,
      11,
      muted,
    );
    text(
      ctx,
      "WASD / ARROWS    ENTER TO SELECT    M AUDIO",
      88,
      674,
      11,
      "#53717a",
    );
    text(ctx, "01 / THE DESCENT", 1040, 675, 12, amber);
  } else {
    if (s.screen !== "paused" && s.screen !== "game-over") hero(s, ctx);
    box(
      ctx,
      { x: 0, y: 0, w: 1280, h: 720 },
      s.screen === "game-over" ? "#08151fca" : "#08151fe8",
    );
    const title =
      s.screen === "mode-select"
        ? "CHOOSE YOUR RISK"
        : s.screen === "size-select"
          ? "CHOOSE YOUR DEPTH"
          : s.screen === "paused"
            ? "HOLDING POSITION"
            : s.screen === "victory"
              ? "OFF THIS ROCK"
              : s.screen === "game-over"
                ? "SIGNAL LOST"
                : "FIELD MANUAL";
    text(
      ctx,
      "D / C    EXPEDITION SYSTEMS",
      s.screen === "how-to-play" ? 96 : 400,
      88,
      12,
      teal,
    );
    text(
      ctx,
      title,
      s.screen === "how-to-play" ? 94 : 397,
      170,
      42,
      ink,
      "800 sans-serif",
    );
    if (s.screen === "mode-select") {
      text(
        ctx,
        "STANDARD / Restore from your last save after death.",
        400,
        230,
        14,
        muted,
      );
      text(
        ctx,
        "HARDCORE / Death deletes the save. No second chances.",
        400,
        260,
        14,
        red,
      );
    }
    if (s.screen === "size-select")
      text(
        ctx,
        "QUICK 1250 m    STANDARD 2500 m    MARATHON 5000 m",
        400,
        245,
        13,
        amber,
      );
    if (s.screen === "paused")
      text(
        ctx,
        "Your expedition is frozen. Even the Core can wait.",
        400,
        239,
        14,
        muted,
      );
    if (s.screen === "game-over" || s.screen === "victory") {
      const sum = s.summary;
      text(
        ctx,
        s.screen === "victory"
          ? "The ore was a means. The sky was the prize."
          : `CAUSE / ${sum?.deathCause?.replace(/-/g, " ").toUpperCase() ?? "UNKNOWN"}`,
        400,
        225,
        14,
        s.screen === "victory" ? teal : red,
      );
      text(
        ctx,
        `${Math.floor(sum?.deepestDepthMeters ?? s.deepestDepthMeters)} m DEEPEST    ${sum?.creditsEarned ?? s.creditsEarned} CR EARNED`,
        400,
        255,
        13,
        muted,
      );
      text(
        ctx,
        `${Math.floor(sum?.elapsedSeconds ?? s.elapsedSeconds)} s    ${s.mode.toUpperCase()}    ${s.rocket}/5 COMPONENTS`,
        400,
        280,
        13,
        muted,
      );
    }
    if (s.screen === "how-to-play") {
      const sections = [
        [
          "01 / GET BELOW",
          "A D or ← → to move. S / ↓ drills down; walking into a wall drills sideways.",
          "Cuts start on solid ground. Never drill up. W / ↑ / SPACE fires the jetpack.",
        ],
        [
          "02 / BRING IT HOME",
          "Fall for free. Pay fuel for the climb. Heavy ore climbs slower — too heavy cannot lift.",
          "I opens cargo: drop ore to lose weight. Sell at the Ore Market; buy fuel and repairs.",
        ],
        [
          "03 / READ THE ROCK",
          "Pale wisps betray gas. Lava burns. Long falls hurt. Upgrade hull and radiator.",
          "Buy a scanner to locate Resonite and Cryenite. Take a Core Sample from the bottom.",
        ],
        [
          "04 / BUILD AN EXIT",
          "Fabricate five rocket components at the Launch Pad. The Core gives you 90 seconds.",
          "J jettisons it. 1–6 uses supplies. Save only at the Save Pad; never with a live Sample.",
        ],
        [
          "05 / CHOOSE YOUR RISK",
          "Standard death restores your last save. Hardcore death deletes it.",
          "ESC / P pauses or closes panels. E / ENTER interacts. M mutes. Pointer drives every panel.",
        ],
      ];
      sections.forEach(([heading, a, b], i) => {
        const y = 220 + i * 77;
        text(ctx, heading, 96, y, 13, amber);
        text(ctx, a, 96, y + 25, 14, ink);
        text(ctx, b, 96, y + 46, 13, muted);
      });
    }
  }
  UI.menuItems(s).forEach((item, i) => {
    const r = UI.menuItemRect(s, i)!;
    const selected = s.menuIndex === i;
    box(
      ctx,
      r,
      selected ? "#2c4147ee" : "#10232cdd",
      selected ? "#d9bb83" : "#304750",
    );
    if (selected) box(ctx, { x: r.x, y: r.y, w: 4, h: r.h }, amber);
    text(
      ctx,
      selected ? "›" : "·",
      r.x + 18,
      r.y + r.h * 0.66,
      24,
      selected ? amber : muted,
    );
    text(
      ctx,
      item,
      r.x + 53,
      r.y + r.h * 0.63,
      16,
      selected ? "#fff0d1" : muted,
    );
    if (selected) text(ctx, "↵", r.x + r.w - 33, r.y + r.h * 0.66, 18, amber);
  });
  if (s.screen !== "title" && s.screen !== "how-to-play")
    text(ctx, "↑ ↓ SELECT    ENTER CONFIRM    ESC BACK", 400, 650, 12, muted);
}
export function render(s: ReadState, api: RenderApi) {
  const ctx = api.ctx;
  ctx.imageSmoothingEnabled = false;
  if (
    s.screen === "in-mine" ||
    s.screen === "paused" ||
    s.screen === "game-over"
  ) {
    world(s, ctx);
    hud(s, ctx);
    if (s.screen === "in-mine") {
      overlays(s, ctx);
      panel(s, ctx);
    }
  }
  if (s.screen !== "in-mine") menu(s, ctx);
}
export { snapshot };
