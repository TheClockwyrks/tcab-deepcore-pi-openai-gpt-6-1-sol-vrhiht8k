# DEEPCORE

**Depth is cheap. Height is expensive.**

A browser dig-and-build expedition on a dead mining world. Drill through four strata, haul weighty mineral ore back to the surface, and turn the proceeds into better equipment and an escape rocket. Gas, lava, hard landings, and a dwindling fuel tank are the mine's only adversaries. The final Core Sample gives you ninety seconds to make it home.

Choose Standard (restore from your last Save Pad save after death) or Hardcore (death deletes your save), then Quick, Standard, or Marathon depth. There is one local save slot, no backend, and no account.

## Run

Requires Node.js 22.12+ (or a newer supported Node release).

```sh
npm ci
npm run dev
```

Open the local URL Vite prints. Click or press a key to enable audio.

```sh
npm run build
npm run preview
```

`dist/` is the complete static site. Serve the directory from any static host, including a subdirectory. All asset URLs are relative. A build bundles the committed art, animation frames, particle definitions, and audio — it does **not** run asset-generation tools.

## Controls

| Keys | Action |
| --- | --- |
| A / D or Left / Right | Walk; drill a wall when grounded and flush against it |
| S or Down | Drill downward while grounded |
| W, Up, or Space | Fire the jetpack |
| E or Enter | Interact with a building; confirm a menu or panel choice |
| I | Open/close cargo and supplies |
| 1–6 | Dynamite, Plastic Explosives, Quantum Teleporter, Matter Transmitter, Nanobots, Emergency Fuel |
| J | Jettison a carried Core Sample |
| Escape or P | Close panel; pause/resume |
| M | Mute/unmute all audio |
| Backtick | Engine diagnostics overlay |

Menus and panels also support pointer and touch. Use Up/Down and Enter to operate them by keyboard. The miner itself uses the keyboard.

## Your first haul

Hold Down on the surface to start a shaft, or walk east to the marked mine access. Cut mineral veins to collect ore. Watch **both** the cargo slot count and the load in kilograms: a full bay is not necessarily an overload, and an overweight bay cannot be lifted. Open the inventory to discard a unit if you need to lighten the climb.

Thrust back through your shaft before fuel gets low. Sell at the Ore Market, pay for fuel and hull repairs at the Fuel Depot, then buy upgrades and field supplies. Nothing automatically refills on the surface. Visit the Save Pad to bank the expedition.

Buy a scanner to find Resonite and Cryenite. Fabricate five ordered components at the Launch Pad. The last requires a live Core Sample from the bottom of the mine; it cannot be saved and does not stop ticking in a panel. Launch the completed rocket to win.

## Development and tests

```sh
npm run typecheck
npm run lint
npm run format
npm test
```

The simulation uses a fixed 120 Hz step over the engine's elapsed seconds. State transitions use copy-on-write terrain and new actor/economy records. Rendering is read-only; visual particle instances are reconstructed from event age and seed, so rendering does not advance the simulation.

The engine owns input, audio, loading, the frame loop, fitting, recording, and diagnostics. `engine.debug` is the sole automation surface; no game handle is installed on the page. The tests run the actual engine over a native canvas and a scripted clock, with dispatched keyboard/pointer input and the same game transitions used in play.

- `src/model.ts`: state, grid generation, derived readings
- `src/simulation.ts`: fixed-step physics, drilling, hazards, input orchestration
- `src/transactions.ts`: economy, supplies, persistence, fabrication, deaths
- `src/interface.ts`: shared menu/control layout and navigation
- `src/debug.ts`: validated automation operations
- `src/render.ts`: canvas presentation and produced particle playback
- `tools/generate-art.py`, `tools/generate-effects.py`: one-time asset-authoring recipes, not build steps
- `tools/capture.mjs`: live showcase capture through the engine's recorder

Original art was authored with `draw` and `draw-sheet`; effects with `particle-2d`; audio with `sfx-synth`, `sfx-sample`, and `music`. All generated shipping files live under `assets/`. The showcase is in `showcase/`.
