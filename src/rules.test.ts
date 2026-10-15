import { describe, expect, it } from "vitest";
import * as C from "./constants";
import { fresh, grounded, snapshot, tile } from "./model";
import { debug } from "./debug";
import { advance } from "./simulation";
import * as UI from "./interface";

const held = { left: 0, right: 0, down: 0, up: 0 };
function setup() {
  let s = debug.setWorldSize(fresh(), "quick");
  s = debug.setScreen(s, "in-mine");
  return s;
}

describe("boundary rules and automation", () => {
  it("keeps random band densities bounded and every objective connected", () => {
    for (const size of C.WORLD_SIZES)
      for (const seed of [1, 613, 7713, 98721]) {
        let s = debug.setWorldSize(fresh(), size);
        s.seed = seed;
        s = debug.generateMine(s);
        for (const band of C.BANDS) {
          const cells = s.grid.flatMap((row, r) =>
            row
              .filter(
                (t, c) => t.band === band && c > 0 && c < C.WORLD_COLS - 1,
              )
              .map((t) => ({ ...t, r })),
          );
          for (const kind of ["ore", "stone", "gas", "lava"] as const) {
            const expected = cells.reduce((sum, t) => {
              const f = (t.r - 1) / (s.coreRow - 1);
              return (
                sum +
                (kind === "ore"
                  ? C.ORE_DENSITY
                  : kind === "lava"
                    ? f < 0.5
                      ? 0
                      : C.LAVA_DENSITY_MIN +
                        ((C.LAVA_DENSITY_MAX - C.LAVA_DENSITY_MIN) *
                          (f - 0.5)) /
                          0.5
                    : f < 0.25
                      ? 0
                      : kind === "stone"
                        ? C.STONE_DENSITY_MIN +
                          ((C.STONE_DENSITY_MAX - C.STONE_DENSITY_MIN) *
                            (f - 0.25)) /
                            0.75
                        : C.GAS_DENSITY_MIN +
                          ((C.GAS_DENSITY_MAX - C.GAS_DENSITY_MIN) *
                            (f - 0.25)) /
                            0.75)
              );
            }, 0);
            const actual = cells.filter((t) => t.kind === kind).length;
            expect(Math.abs(actual - expected)).toBeLessThanOrEqual(
              expected * C.DENSITY_TOLERANCE + 1e-8,
            );
          }
        }
        const seen = new Set<number>(),
          queue = [C.WORLD_COLS + C.CAVE_MOUTH_COL];
        for (let i = 0; i < queue.length; i++) {
          const index = queue[i];
          if (seen.has(index)) continue;
          seen.add(index);
          const c = index % C.WORLD_COLS,
            r = Math.floor(index / C.WORLD_COLS);
          for (const [x, y] of [
            [c - 1, r],
            [c + 1, r],
            [c, r - 1],
            [c, r + 1],
          ]) {
            if (x < 1 || x > C.WORLD_COLS - 2 || y < 1 || y > s.coreRow)
              continue;
            if (
              !["lava", "stone", "bedrock"].includes(s.grid[y][x].kind) &&
              !seen.has(y * C.WORLD_COLS + x)
            )
              queue.push(y * C.WORLD_COLS + x);
          }
        }
        expect(seen.has(s.coreRow * C.WORLD_COLS + C.CORE_COL)).toBe(true);
        for (let r = 1; r < s.coreRow; r++)
          for (let c = 1; c < C.WORLD_COLS - 1; c++)
            if (s.grid[r][c].material)
              expect(seen.has(r * C.WORLD_COLS + c)).toBe(true);
      }
  });

  it("smoothly sinks during a cut and resumes a partially cut floor", () => {
    let s = setup();
    s = debug.setTile(s, 4, 1, "rock");
    s = debug.setTile(s, 4, 2, "rock");
    s = advance(s, { ...held, down: 1 }, 0.2);
    expect(tile(s, 4, 1).health).toBe(3);
    expect(s.miner.y).toBeGreaterThan(28);
    s = advance(s, held, 0.05);
    expect(grounded(s)).toBe(true);
    s = advance(s, { ...held, down: 1 }, 0.375);
    expect(tile(s, 4, 1).kind).toBe("tunnel");
  });

  it("extracts exactly one live Sample by drilling down, without consuming the Core", () => {
    let s = setup();
    s = debug.setMinerPosition(
      s,
      C.CORE_COL * C.TILE + 12,
      s.coreRow * C.TILE - C.MINER_H,
    );
    s = advance(s, { ...held, down: 1 }, C.DRILL_HIT_INTERVAL);
    expect(s.satchel.coreSample).toBe(true);
    expect(s.coreTimer).toBe(C.CORE_TIMER);
    expect(tile(s, C.CORE_COL, s.coreRow).kind).toBe("core");
    const fuel = s.miner.fuel;
    s = advance(s, { ...held, down: 1 }, 0.5);
    expect(s.coreTimer).toBeCloseTo(C.CORE_TIMER - 0.5, 6);
    expect(s.miner.fuel).toBeCloseTo(fuel - C.LIFE_SUPPORT_BURN * 0.5, 6);
  });

  it("does not sink while drilling a roof over an open cavern", () => {
    let s = setup();
    s = debug.setTile(s, 4, 1, "rock");
    s = advance(s, { ...held, down: 1 }, 0.25);
    expect(s.miner.y).toBe(C.SURFACE_Y - C.MINER_H);
    expect(tile(s, 4, 1).health).toBe(2);
  });

  it("destroys a drilled ore when the bay has no slot left", () => {
    let s = setup();
    s = debug.setMinerTravel(s, false);
    s = debug.setCargo(s, "ferron", C.CARGO_TIERS[0]);
    s = debug.setOreTile(s, 4, 1, "aurite");
    s = advance(s, { ...held, down: 1 }, 0.5);
    expect(s.cargo.aurite).toBeUndefined();
    expect(s.note).toContain("CARGO FULL");
    expect(tile(s, 4, 1).kind).toBe("tunnel");
  });

  it("keeps individual poses independent and rejects unknown controls", () => {
    let s = setup();
    s = debug.setFacing(s, "west");
    s = debug.setMinerVelocity(s, 12, -60);
    s = debug.setMinerDrill(s, false);
    s = debug.setNoticeFired(s, "gas", true);
    s = debug.setElapsed(s, 123);
    s = debug.setNextTeleportHeight(s, null);
    s = debug.setNextTeleportSpeed(s, null);
    const v = snapshot(s);
    expect(v.miner.facing).toBe("west");
    expect(v.miner.vx).toBe(12);
    expect(v.miner.drill).toBe(false);
    expect(v.elapsedSeconds).toBe(123);
    expect(v.noticesFired.gas).toBe(true);
    expect(() => debug.controlRect(s, "unknown", null)).toThrow();
    expect(() => debug.controlRect(s, "buy-upgrade", "unknown")).toThrow();
    expect(debug.controlRect(s, "sell", null)).toBe(null);
    expect(debug.menuItemRect(s, 0.5)).toBe(null);
    s = debug.clearItems(s);
    s = debug.clearMine(s);
    s = debug.dismissNotice(s);
    s = debug.dropOre(s, "ferron");
    expect(debug.findTile(s, "ore")).toBe(null);
  });

  it("returns to the menu entry that led away, and runs panel transactions", () => {
    const s = fresh();
    UI.changeScreen(s, "mode-select");
    s.mode = "hardcore";
    UI.changeScreen(s, "size-select");
    UI.back(s);
    expect(s.menuIndex).toBe(1);
    UI.back(s);
    expect(UI.menuItems(s)[s.menuIndex]).toBe("NEW EXPEDITION");
    UI.changeScreen(s, "how-to-play");
    UI.back(s);
    expect(UI.menuItems(s)[s.menuIndex]).toBe("HOW TO PLAY");
    s.screen = "in-mine";
    s.credits = 20000;
    UI.act(s, "buy-item", "emergency-fuel");
    s.miner.fuel = 20;
    UI.act(s, "use-item", "emergency-fuel");
    expect(s.miner.fuel).toBe(50);
    UI.act(s, "buy-upgrade", "hull");
    expect(s.tiers.hull).toBe(2);
    UI.act(s, "buy-fuel", null);
    UI.act(s, "fill-fuel", null);
    s.miner.hull = 10;
    UI.act(s, "buy-repair", null);
    UI.act(s, "repair-full", null);
    expect(s.miner.hull).toBe(C.HULL_TIERS[1]);
    s.cargo.ferron = 2;
    UI.act(s, "drop-ore", "ferron");
    UI.act(s, "sell", null);
    expect(s.cargo).toEqual({});
    UI.act(s, "fabricate", null);
    expect(s.rocket).toBe(1);
    UI.act(s, "launch", null);
    expect(s.launchTime).toBe(null);
    UI.act(s, "jettison", null);
    UI.act(s, "dismiss-notice", null);
    UI.act(s, "pause", null);
    expect(s.screen).toBe("paused");
  });
});
