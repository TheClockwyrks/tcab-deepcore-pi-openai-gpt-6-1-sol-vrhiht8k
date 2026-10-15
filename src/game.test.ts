/// <reference types="node" />
import { afterEach, beforeAll, describe, it, expect, vi } from "vitest";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { readFile } from "node:fs/promises";
import {
  createEngine,
  ConstantClock,
  type Engine,
} from "@clockwyrks/simple-2d";
import { game, type DeepcoreState, type DeepcoreDebugApi } from "./game";
import * as C from "./constants";
import {
  clone,
  fresh,
  tile,
  generate,
  snapshot,
  grounded,
  cell,
  put,
} from "./model";
import { advance } from "./simulation";
import { debug } from "./debug";
import * as T from "./transactions";
import * as UI from "./interface";

const engines: Engine<DeepcoreState, DeepcoreDebugApi>[] = [];
const held = { left: 0, right: 0, up: 0, down: 0 };
class AudioHost {
  currentTime = 0;
  state = "running";
  destination = {};
  decodeAudioData(data: ArrayBuffer) {
    return Promise.resolve({ duration: data.byteLength / 44100 });
  }
  createBufferSource() {
    return {
      buffer: null,
      loop: false,
      connect() {},
      start() {},
      stop() {},
      disconnect() {},
    };
  }
  createGain() {
    return {
      gain: { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {} },
      connect() {},
      disconnect() {},
    };
  }
  resume() {
    return Promise.resolve();
  }
}
beforeAll(() => {
  vi.stubGlobal("AudioContext", AudioHost);
  vi.stubGlobal("createImageBitmap", async (blob: Blob) =>
    loadImage(Buffer.from(await blob.arrayBuffer())),
  );
  vi.stubGlobal("fetch", async (url: string) => {
    const path = new URL(url, "http://localhost").pathname.replace(/^\//, "");
    return new Response(await readFile(path));
  });
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => storage.set(k, v),
    removeItem: (k: string) => storage.delete(k),
  });
});
afterEach(() => {
  engines.forEach((e) => e.destroy());
  engines.length = 0;
  globalThis.localStorage.clear?.();
  T.writeSave(null);
});
async function harness(step = 1000 / 60) {
  const canvas = createCanvas(C.STAGE_W, C.STAGE_H),
    events = new EventTarget();
  const engine = createEngine({
    canvas: canvas as unknown as HTMLCanvasElement,
    width: C.STAGE_W,
    height: C.STAGE_H,
    game,
    background: "#0b1720",
    clock: new ConstantClock(step),
    surface: {
      cssWidth: () => C.STAGE_W,
      cssHeight: () => C.STAGE_H,
      dpr: () => 1,
      events: () => events,
    },
  });
  engines.push(engine);
  await engine.initialize();
  const key = (code: string, type = "keydown") =>
    events.dispatchEvent(
      Object.assign(new Event(type), { code, repeat: false }),
    );
  const tap = async (code: string) => {
    key(code);
    await engine.advance(1);
    key(code, "keyup");
    await engine.advance(1);
  };
  const pose = (fn: (s: DeepcoreState) => DeepcoreState) =>
    engine.apply((s) => fn(clone(s)));
  return { engine, canvas, events, key, tap, pose };
}
function mining() {
  let s = fresh();
  s = debug.setWorldSize(s, "quick");
  s.screen = "in-mine";
  s.grid = Array.from(s.grid, (row) => row.map((t) => ({ ...t })));
  return s;
}

describe("engine integration and presentation", () => {
  it("loads the genuine files, registers actions, and navigates the expedition menus", async () => {
    const { engine, tap } = await harness();
    expect(Object.keys(engine.state.images).length).toBeGreaterThan(80);
    expect(Object.keys(engine.state.systems)).toHaveLength(12);
    expect(engine.debug.version).toBe(C.DEEPCORE_DEBUG_VERSION);
    await tap("Enter");
    expect(engine.state.screen).toBe("mode-select");
    await tap("ArrowDown");
    await tap("Enter");
    expect(engine.state.mode).toBe("hardcore");
    await tap("Enter");
    expect(engine.state.screen).toBe("in-mine");
    expect(engine.state.coreRow).toBe(250);
    expect(grounded(engine.state)).toBe(true);
    await tap("KeyP");
    expect(engine.state.screen).toBe("paused");
    await tap("Escape");
    expect(engine.state.screen).toBe("in-mine");
    await tap("KeyI");
    expect(engine.state.panel).toBe("inventory");
    await tap("KeyM");
    expect(engine.state.muted).toBe(true);
    await tap("Escape");
    expect(engine.state.panel).toBe(null);
    expect(engine.diagnostics().every((r) => !r.error)).toBe(true);
  });
  it("uses the engine keyboard for drilling and thrust, and leaves previous frames immutable", async () => {
    const { engine, key, pose } = await harness(1000 / 120);
    pose((s) => {
      s.screen = "in-mine";
      put(s, 4, 1, cell("ore", "topsoil", "ferron"));
      put(s, 4, 2, cell("rock", "topsoil"));
      return s;
    });
    const before = engine.state;
    key("KeyS");
    await engine.advance(60);
    key("KeyS", "keyup");
    expect(before.grid[1][4].kind).toBe("ore");
    expect(engine.state.grid[1][4].kind).toBe("tunnel");
    expect(engine.state.cargo.ferron).toBe(1);
    key("Space");
    await engine.advance(120);
    key("Space", "keyup");
    expect(engine.state.miner.vy).toBeLessThan(0);
    expect(engine.state.miner.fuel).toBeLessThan(98);
  });
  it("requires pointer press and release on the same menu item", async () => {
    const { engine, events } = await harness();
    const pointer = (type: string, x: number, y: number) =>
      events.dispatchEvent(
        Object.assign(new Event(type), {
          clientX: x,
          clientY: y,
          pointerId: 1,
          pointerType: "mouse",
          isPrimary: true,
          button: 0,
          buttons: type === "pointerdown" ? 1 : 0,
        }),
      );
    pointer("pointerdown", 100, 420);
    pointer("pointerup", 100, 480);
    await engine.advance(1);
    expect(engine.state.screen).toBe("title");
    pointer("pointerdown", 100, 420);
    pointer("pointerup", 100, 420);
    await engine.advance(1);
    expect(engine.state.screen).toBe("mode-select");
  });
  it("renders every screen and panel and records actual drawing", async () => {
    const { engine, pose } = await harness();
    for (const screen of C.SCREENS) {
      pose((s) => {
        s.screen = screen;
        return s;
      });
      await engine.advance(1);
    }
    for (const panel of C.PANELS) {
      pose((s) => {
        s.screen = "in-mine";
        s.panel = panel;
        return s;
      });
      await engine.advance(1);
    }
    pose((s) => {
      s.panel = null;
      generate(s);
      return s;
    });
    engine.startRecording();
    await engine.advance(2);
    const r = engine.stopRecording();
    expect(r.frames).toHaveLength(2);
    expect(
      r.ops.some((op) => op.op === "call" && op.method === "drawImage"),
    ).toBe(true);
    expect(r.ops.length).toBeGreaterThan(100);
  });
});

describe("world and debug contract", () => {
  it("generates all sizes, bands, borders and exactly one of each exotic node", () => {
    for (const size of C.WORLD_SIZES) {
      let s = mining();
      s = debug.setWorldSize(s, size);
      generate(s);
      expect(s.grid).toHaveLength(s.coreRow + 1);
      expect(tile(s, C.CORE_COL, s.coreRow).kind).toBe("core");
      expect(tile(s, C.CAVE_MOUTH_COL, 1).kind).toBe("tunnel");
      for (const material of C.MATERIALS)
        expect(
          s.grid.flat().filter((t) => t.material === material),
        ).toHaveLength(1);
      expect(
        s.grid
          .slice(1, 4)
          .flat()
          .every((t) => t.kind !== "ore"),
      ).toBe(true);
      for (const band of C.BANDS) {
        const ts = s.grid
          .flat()
          .filter((t) => t.band === band && t.kind !== "bedrock");
        expect(
          ts.filter((t) => t.kind === "ore").length / ts.length,
        ).toBeGreaterThan(0.09);
      }
    }
  });
  it("resizes cell-by-cell, preserving original bands and health", () => {
    let s = mining();
    s = debug.setTile(s, 5, 100, "rock");
    s = debug.setTileHealth(s, 5, 100, 3);
    const old = debug.tileAt(s, 5, 100);
    s = debug.setWorldSize(s, "marathon");
    expect(debug.tileAt(s, 5, 100)).toEqual(old);
    expect(tile(s, C.CORE_COL, 250).kind).toBe("tunnel");
    expect(tile(s, 5, 700).kind).toBe("tunnel");
    s = debug.setWorldSize(s, "quick");
    expect(debug.tileAt(s, 5, 700).band).toBe(null);
    expect(tile(s, C.CORE_COL, 250).kind).toBe("core");
  });
  it("poses one field, derives readings without advancing, and validates invalid arguments", () => {
    let s = mining();
    s = debug.setCargo(s, "adamite", 10);
    s = debug.setMinerPosition(s, 200, 1000);
    const before = clone(s),
      v = debug.snapshot(s);
    expect(v.cargo.loadKg).toBe(840);
    expect(v.miner.overloaded).toBe(true);
    expect(v.depthMeters).toBeGreaterThan(0);
    expect(debug.reconcile(s)).toEqual(before);
    expect(() => debug.setTier(s, "fuel", 6)).toThrow();
    expect(() => debug.setTileHealth(s, 2, 2, 1)).toThrow();
    expect(() => debug.setCoreTimer(s, 3)).toThrow();
    expect(() => debug.setCredits(s, -1)).toThrow();
    expect(() => debug.setNextTeleportHeight(s, 9)).toThrow();
    expect(debug.findTile(s, "core")).toEqual({ col: C.CORE_COL, row: 250 });
    expect(debug.buildings(s)).toHaveLength(6);
    expect(debug.menuItemRect(s, 0)).toBe(null);
  });
  it("reset clears the expedition but preserves save and mute preference", () => {
    let s = mining();
    s.muted = true;
    s.saveData = "saved";
    s = debug.setFuel(s, 13);
    s = debug.reset(s);
    expect(s.miner.fuel).toBe(100);
    expect(s.screen).toBe("title");
    expect(s.saveData).toBe("saved");
    expect(s.muted).toBe(true);
    expect(s.simTime).toBe(0);
  });
  it("scanner locks to the nearest material still needed", () => {
    let s = mining();
    s = debug.setMaterialTile(s, 5, 3, "resonite");
    s = debug.setTier(s, "scanner", 2);
    let v = snapshot(s);
    expect(v.scanner.locked).toBe(true);
    expect(v.scanner.target).toBe("resonite");
    s = debug.setMaterial(s, "resonite", 1);
    v = snapshot(s);
    expect(v.scanner.locked).toBe(false);
  });
});

describe("fixed-step movement, fuel and drill", () => {
  it("integrates an identical interval across different frame partitions", () => {
    const s = mining();
    s.miner.y = -1000;
    const one = advance(clone(s), held, 1);
    let many = clone(s);
    for (let i = 0; i < 100; i++) many = advance(many, held, 0.01);
    expect(one.miner.y).toBeCloseTo(many.miner.y, 9);
    expect(one.miner.vy).toBeCloseTo(many.miner.vy, 9);
    expect(one.elapsedSeconds).toBeCloseTo(1, 8);
  });
  it("drills exactly four hits for topsoil, banks cargo and spends hit fuel", () => {
    let s = mining();
    s = debug.setMinerTravel(s, false);
    s = debug.setOreTile(s, 4, 1, "ferron");
    s = advance(s, { ...held, down: 1 }, 0.5);
    expect(s.cargo.ferron).toBe(1);
    expect(tile(s, 4, 1).kind).toBe("tunnel");
    expect(s.miner.fuel).toBeCloseTo(99, 6);
    expect(s.miner.y).toBe(8);
  });
  it("side cuts start at an edge, and a gated drill cannot cut", () => {
    let s = mining();
    s = debug.setTile(s, 5, 0 + 1, "rock");
    s = debug.setMinerPosition(s, 5 * C.TILE - C.MINER_W, C.TILE);
    s = debug.setTile(s, 4, 2, "rock");
    s = debug.setMinerDrill(s, false);
    s = advance(s, { ...held, right: 1 }, 0.5);
    expect(tile(s, 5, 1).health).toBe(4);
    expect(s.miner.x).toBe(344);
    s = debug.setMinerDrill(s, true);
    s = advance(s, { ...held, right: 1 }, 0.5);
    expect(tile(s, 5, 1).kind).toBe("tunnel");
  });
  it("cannot lift an overload but can climb after shedding cargo", () => {
    let s = mining();
    s = debug.setCargo(s, "ferron", 35);
    s.miner.y = -100;
    s = advance(s, { ...held, up: 1 }, 0.5);
    expect(s.miner.vy).toBe(0);
    s = debug.clearCargo(s);
    s = advance(s, { ...held, up: 1 }, 0.5);
    expect(s.miner.vy).toBeLessThan(-500);
  });
  it("spends underground life support, never refills at camp, and fuel zero kills immediately", () => {
    let s = mining();
    s = debug.setMinerTravel(s, false);
    s = debug.setMinerPosition(s, 300, 300);
    s = advance(s, held, 1);
    expect(s.miner.fuel).toBeCloseTo(99.6, 6);
    s = debug.setFuel(s, 0);
    s = advance(s, held, 0.01);
    expect(s.screen).toBe("game-over");
    expect(s.summary?.deathCause).toBe("fuel-out");
  });
  it("freezes panels but not the live core, and pauses the entire simulation", () => {
    let s = mining();
    s = debug.setCoreCarried(s, true);
    s.panel = "inventory";
    const y = s.miner.y;
    s = advance(s, held, 2);
    expect(s.coreTimer).toBeCloseTo(88, 6);
    expect(s.miner.y).toBe(y);
    expect(s.miner.fuel).toBe(100);
    s.screen = "paused";
    s = advance(s, held, 2);
    expect(s.coreTimer).toBeCloseTo(88, 6);
    expect(s.elapsedSeconds).toBeCloseTo(2, 6);
  });
  it("camera follows horizontally and winds/unwinds its signed travel lead", () => {
    let s = mining();
    s.miner.travel = false;
    s.miner.x = 1800;
    s.miner.y = 2000;
    s.miner.vy = 100;
    s = advance(s, held, 2);
    expect(s.camera.lead).toBeCloseTo(C.CAM_LEAD_MAX, 6);
    expect(s.camera.x).toBeCloseTo(1188, 6);
    s.miner.vy = 0;
    s = advance(s, held, 0.5);
    expect(s.camera.lead).toBeCloseTo(0, 6);
  });
});

describe("hazards and survival", () => {
  it("gas damage bypasses radiator and triggers delayed one-time notices", () => {
    let s = mining();
    s = debug.setTier(s, "hull", 5);
    s = debug.setHull(s, 450);
    s.miner.x = 4 * C.TILE;
    s.miner.y = 80 * C.TILE;
    T.gasBlast(s, 4, 80);
    expect(s.miner.hull).toBeLessThan(380);
    expect(s.noticesFired.gas).toBe(true);
    expect(snapshot(s).notice?.shown).toBe(false);
    s.miner.travel = false;
    s = advance(s, held, C.NOTICE_DELAY);
    expect(snapshot(s).notice?.shown).toBe(true);
  });
  it("lava drill lump is reduced only by radiator and clears the tile", () => {
    let s = mining();
    s = debug.setTile(s, 4, 150, "lava");
    s = debug.setTier(s, "radiator", 5);
    T.breakCell(s, 4, 150);
    expect(s.miner.hull).toBeCloseTo(88, 6);
    expect(tile(s, 4, 150).kind).toBe("tunnel");
  });
  it("hard landings damage hull and fire impact particles", () => {
    let s = mining();
    s.miner.y = -500;
    s.miner.vy = 950;
    s = debug.setTile(s, 4, 1, "rock");
    s = advance(s, held, 1);
    expect(s.miner.hull).toBeCloseTo(75, 5);
    expect(s.effects.some((e) => e.name === "impact-dust")).toBe(true);
  });
  it("jettison keeps ticking and kills only within the blast radius", () => {
    let s = mining();
    s = debug.setCoreCarried(s, true);
    s = debug.setCoreTimer(s, 0.1);
    s = debug.jettison(s);
    s = debug.setMinerPosition(s, 2200, 8);
    s.miner.travel = false;
    s = advance(s, held, 0.2);
    expect(s.screen).toBe("in-mine");
    expect(s.coreTimer).toBe(null);
    s = debug.setCoreCarried(s, true);
    s = debug.setCoreTimer(s, 0.1);
    s = advance(s, held, 0.2);
    expect(s.summary?.deathCause).toBe("core-detonation");
  });
  it("hull death cannot be evaded by an open overlay", () => {
    let s = mining();
    s.panel = "inventory";
    s = debug.setHull(s, 0);
    s = advance(s, held, 0.01);
    expect(s.screen).toBe("game-over");
  });
});

describe("economy, supplies, persistence and escape", () => {
  it("sells at exact mineral values and caps resource purchases to money and capacity", () => {
    let s = mining();
    s = debug.setCargo(s, "ferron", 3);
    s = debug.setCargo(s, "aurite", 1);
    s = debug.sell(s);
    expect(s.credits).toBe(2544);
    expect(s.creditsEarned).toBe(2544);
    expect(snapshot(s).cargo.slotsUsed).toBe(0);
    s = debug.setFuel(s, 60);
    s = debug.buyFuel(s);
    expect(s.miner.fuel).toBe(85);
    s = debug.fillFuel(s);
    expect(s.miner.fuel).toBe(100);
    s = debug.setHull(s, 50);
    s = debug.setCredits(s, 13);
    s = debug.repairFull(s);
    expect(s.miner.hull).toBe(56.5);
    expect(s.credits).toBe(0);
  });
  it("upgrades apply the capacity delta rather than refilling", () => {
    let s = mining();
    s = debug.setCredits(s, 300);
    s = debug.setFuel(s, 30);
    s = debug.buyUpgrade(s, "fuel");
    expect(s.miner.fuel).toBe(105);
    expect(s.tiers.fuel).toBe(2);
    expect(s.credits).toBe(0);
    s = debug.buyUpgrade(s, "fuel");
    expect(s.tiers.fuel).toBe(2);
  });
  it("explosives lose ore, clear boulders and respect material immunity", () => {
    let s = mining();
    s.miner.y = 80;
    s = debug.setOreTile(s, 4, 1, "aurite");
    s = debug.setTile(s, 3, 1, "stone");
    s = debug.setMaterialTile(s, 5, 1, "resonite");
    s = debug.setItemCount(s, "dynamite", 1);
    s = debug.useItem(s, "dynamite");
    expect(tile(s, 3, 1).kind).toBe("tunnel");
    expect(tile(s, 4, 1).kind).toBe("tunnel");
    expect(tile(s, 5, 1).kind).toBe("material");
    expect(s.cargo.aurite).toBeUndefined();
    expect(s.items.dynamite).toBe(0);
  });
  it("teleporters consume independently posed draws; repair supplies preserve full tanks", () => {
    let s = mining();
    s = debug.setItemCount(s, "quantum-teleporter", 1);
    s = debug.setNextTeleportHeight(s, 8);
    s = debug.setNextTeleportSpeed(s, 700);
    s = debug.useItem(s, "quantum-teleporter");
    expect(s.miner.y).toBe(C.SURFACE_Y - C.MINER_H - 8 * C.TILE);
    expect(s.miner.vy).toBe(700);
    expect(s.nextTeleportHeight).toBe(null);
    s = debug.setItemCount(s, "matter-transmitter", 1);
    s = debug.useItem(s, "matter-transmitter");
    expect(s.miner.y).toBe(8);
    expect(s.miner.vy).toBe(0);
    s = debug.setItemCount(s, "nanobots", 1);
    s = debug.useItem(s, "nanobots");
    expect(s.items.nanobots).toBe(1);
    s = debug.setHull(s, 50);
    s = debug.useItem(s, "nanobots");
    expect(s.miner.hull).toBe(70);
  });
  it("saves only without a live sample; Standard restores and Hardcore deletes", () => {
    let s = mining();
    s = debug.setCredits(s, 800);
    s = debug.save(s);
    const data = s.saveData;
    expect(data).not.toBe(null);
    s = debug.setCoreCarried(s, true);
    s = debug.setCredits(s, 999);
    s = debug.save(s);
    expect(s.saveData).toBe(data);
    T.finish(s, "hull-destroyed");
    expect(s.saveData).toBe(data);
    s = T.restore(s);
    expect(s.credits).toBe(800);
    expect(s.miner.y).toBe(8);
    s.mode = "hardcore";
    T.finish(s, "hull-destroyed");
    expect(s.saveData).toBe(null);
  });
  it("fabricates every ordered part, consumes materials, and wins only by launching", () => {
    let s = mining();
    s = debug.setCredits(s, C.ROCKET_TOTAL_CREDITS);
    s = debug.setMaterial(s, "resonite", 1);
    s = debug.setMaterial(s, "cryenite", 1);
    s = debug.setCoreCarried(s, true);
    for (let i = 0; i < 5; i++) s = debug.fabricate(s);
    expect(s.rocket).toBe(5);
    expect(s.credits).toBe(0);
    expect(s.satchel.resonite).toBe(0);
    expect(s.coreTimer).toBe(null);
    expect(s.screen).toBe("in-mine");
    s = debug.launch(s);
    s = advance(s, held, 4.2);
    expect(s.screen).toBe("victory");
    expect(s.summary?.componentsInstalled).toBe(5);
  });
  it("reports every on-screen control rectangle and supports keyboard transactions", () => {
    const s = mining();
    for (const panel of C.PANELS) {
      s.panel = panel;
      for (const c of UI.controls(s))
        expect(UI.controlRect(s, c.control, c.subject)).toEqual({
          x: c.x,
          y: c.y,
          w: c.w,
          h: c.h,
        });
    }
    s.panel = null;
    expect(UI.controlRect(s, "sell", null)).toBe(null);
  });
});
