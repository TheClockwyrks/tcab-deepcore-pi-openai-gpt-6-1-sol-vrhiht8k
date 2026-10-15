import type { Game } from "@clockwyrks/simple-2d";
import type { ParticleSystem } from "@clockwyrks/particle-runtime";
import * as C from "./constants";
import { fresh, snapshot, type DeepcoreState } from "./model";
import { debug, type DeepcoreDebugApi } from "./debug";
import { readSave } from "./transactions";
import { update } from "./simulation";
import { render } from "./render";
export { BACKGROUND } from "./render";
export type { DeepcoreState } from "./model";
export type { DeepcoreDebugApi } from "./debug";

// Vite bundles the committed files. The engine remains the sole runtime loader.
const files = import.meta.glob<string>("../assets/**/*.{png,json,wav}", {
  query: "?url&no-inline",
  import: "default",
  eager: true,
});
function path(url: string): string {
  // With a relative Vite base, production URL imports may be expanded with
  // import.meta.url. Return the part below assets/, never an origin or host prefix.
  const pathname = new URL(url, "https://deepcore.invalid/").pathname;
  const marker = pathname.lastIndexOf("/assets/");
  if (marker < 0)
    throw new Error(`Asset is outside the bundled assets directory: ${url}`);
  return pathname.slice(marker + "/assets/".length);
}
export const game: Game<DeepcoreState, DeepcoreDebugApi> = {
  async initialize(api) {
    for (const name of C.ACTION_NAMES)
      api.input.register(name, { keys: [...C.ACTIONS[name]] });
    const images: Record<string, ImageBitmap> = {},
      systems: Record<string, ParticleSystem> = {};
    await Promise.all(
      Object.entries(files).map(async ([key, url]) => {
        const name = key.slice("../assets/".length),
          p = path(url);
        if (name.endsWith(".png")) images[name] = await api.assets.loadImage(p);
        else if (name.endsWith(".json"))
          systems[name.slice(3, -5)] = JSON.parse(
            await (await api.assets.load(p)).text(),
          ) as ParticleSystem;
        else await api.audio.load(name.slice(6, -4), p);
      }),
    );
    const readings = [
      "screen",
      "panel",
      "mode",
      "worldSize",
      "credits",
      "depthMeters",
      "satchel",
      "tiers",
      "coreTimer",
      "scanner",
    ] as const;
    for (const key of readings)
      api.diagnostics.register(key, (s) => {
        const v = snapshot(s)[key];
        return typeof v === "object" ? JSON.stringify(v) : (v ?? "none");
      });
    api.diagnostics.register(
      "position",
      (s) => `${s.miner.x.toFixed(1)}, ${s.miner.y.toFixed(1)}`,
    );
    api.diagnostics.register(
      "velocity",
      (s) => `${s.miner.vx.toFixed(1)}, ${s.miner.vy.toFixed(1)}`,
    );
    api.diagnostics.register(
      "miner",
      (s) =>
        `${s.miner.state} / ${s.miner.facing} / grounded ${snapshot(s).miner.grounded}`,
    );
    api.diagnostics.register("fuel / hull", (s) => {
      const m = snapshot(s).miner;
      return `${m.fuel.toFixed(1)}/${m.maxFuel} / ${m.hull.toFixed(1)}/${m.maxHull}`;
    });
    api.diagnostics.register("drill", (s) => {
      const d = snapshot(s).miner.drilling;
      return d
        ? `${d.col},${d.row} ${d.dir} ${(d.progress * 100).toFixed(0)}%`
        : "none";
    });
    api.diagnostics.register("cargo", (s) => {
      const c = snapshot(s).cargo;
      return `${c.slotsUsed}/${c.slotCap} / ${c.loadKg}kg / overload ${c.loadKg >= c.liftLimitKg}`;
    });
    return [fresh(images, systems, readSave()), debug];
  },
  update,
  render,
};
