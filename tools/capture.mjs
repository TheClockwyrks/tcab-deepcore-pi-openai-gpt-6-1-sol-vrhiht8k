/* global console, document, KeyboardEvent */
// Run against `npm run dev`. Captures real engine drawing, never fabricated media.
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";

await mkdir("showcase", { recursive: true });
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on("pageerror", (e) => console.error(e));
await page.route("**/capture", (route) =>
  route.fulfill({
    contentType: "text/html",
    body: '<html><body style="margin:0;background:#0b1720"><canvas id="capture" style="display:block;width:1280px;height:720px"></canvas></body></html>',
  }),
);
await page.goto("http://localhost:5173/capture");
const engine = await page.evaluateHandle(async () => {
  const { createEngine, ConstantClock, game, BACKGROUND } =
    await import("/tools/capture-entry.ts");
  const e = createEngine({
    canvas: document.querySelector("canvas"),
    width: 1280,
    height: 720,
    background: BACKGROUND,
    game,
    clock: new ConstantClock(1000 / 30),
  });
  await e.initialize();
  return e;
});
const key = async (code, type) =>
  page.evaluate(
    ({ code, type }) =>
      document.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true })),
    { code, type },
  );
const step = (n) => engine.evaluate((e, n) => e.advance(n), n);
// A mid-expedition rockbed cut. Earlier shafts are already excavated; every
// movement, drill hit, pickup and climb in the capture runs the real simulation.
await engine.evaluate((e) => {
  const d = e.debug;
  e.apply((s) => d.setWorldSize(s, "quick"));
  e.apply((s) => d.generateMine(s));
  e.apply((s) => d.setScreen(s, "in-mine"));
  for (const [track, tier] of [
    ["drill", 3],
    ["fuel", 3],
    ["hull", 3],
    ["cargo", 2],
    ["jetpack", 2],
    ["scanner", 3],
  ])
    e.apply((s) => d.setTier(s, track, tier));
  e.apply((s) => d.setFuel(s, 240));
  e.apply((s) => d.setHull(s, 190));
  for (let r = 1; r < 71; r++) e.apply((s) => d.setTile(s, 16, r, "tunnel"));
  for (let c = 12; c <= 20; c++) e.apply((s) => d.setTile(s, c, 69, "tunnel"));
  for (let r = 71; r <= 83; r++)
    e.apply((s) => d.setOreTile(s, 16, r, r % 3 ? "argenite" : "cuprite"));
  e.apply((s) => d.setMaterialTile(s, 21, 75, "resonite"));
  e.apply((s) => d.setTile(s, 22, 74, "gas"));
  e.apply((s) => d.setMinerPosition(s, 16 * 80 + 12, 71 * 80 - 72));
  e.apply((s) => d.setMinerVelocity(s, 0, 0));
  e.apply((s) => d.setCredits(s, 2860));
  e.apply((s) => d.setRocketInstalled(s, 2));
});
await step(1);
await engine.evaluate((e) => e.startRecording());
await key("KeyS", "keydown");
await step(93);
await key("KeyS", "keyup");
await page.screenshot({ path: "showcase/rockbed.png" });
await key("Space", "keydown");
await step(75);
await key("Space", "keyup");
await step(12);
const recording = await engine.evaluate((e) => e.stopRecording());
await writeFile(
  "showcase/rockbed.json.gz",
  gzipSync(JSON.stringify(recording)),
);

// The surface camp, with the actual miner at rest and two installed components.
await engine.evaluate((e) => {
  const d = e.debug;
  e.apply((s) => d.setMinerPosition(s, 1450, 8));
  e.apply((s) => d.setMinerVelocity(s, 0, 0));
  e.apply((s) => d.setCameraLead(s, 0));
});
await step(60);
await page.screenshot({ path: "showcase/surface.png" });

// Deeper geology: a navigable tunnel beside a natural lava pool.
await engine.evaluate((e) => {
  const d = e.debug;
  for (let c = 10; c <= 22; c++) e.apply((s) => d.setTile(s, c, 159, "tunnel"));
  for (let r = 150; r <= 159; r++)
    e.apply((s) => d.setTile(s, 15, r, "tunnel"));
  for (let c = 19; c <= 23; c++)
    for (let r = 161; r <= 162; r++) e.apply((s) => d.setTile(s, c, r, "lava"));
  e.apply((s) => d.setMaterialTile(s, 11, 161, "cryenite"));
  e.apply((s) => d.setMinerPosition(s, 15 * 80 + 12, 160 * 80 - 72));
  e.apply((s) => d.setMinerVelocity(s, 0, 0));
  e.apply((s) => d.setCameraLead(s, 0));
  e.apply((s) => d.setMaterial(s, "resonite", 1));
  e.apply((s) => d.setCargo(s, "voltite", 6));
});
await step(18);
await page.screenshot({ path: "showcase/deepstone.png" });
await engine.evaluate((e) => e.destroy());
await browser.close();
console.log(
  `Captured ${recording.frames.length} live frames, ${recording.images.length} embedded sprites.`,
);
