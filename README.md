# Hex Strategy

[Play the realtime demo](https://bluehexagons.github.io/hexstrategy/)

Hex Strategy is a modern restoration of a small canvas experiment begun around 2008–2011. It is an open-ended realtime systems toy running across a procedurally generated 96 × 64 lattice. Energy diffuses between 6,144 linked cells, timed sources produce autonomous motes, motes navigate and colonize the field, and procedural forms inherit and mutate their traits between generations.

This deliberately follows the character of the original prototype instead of turning it into a conventional turn-based tactics game. The clock runs continuously at one simulation tick every 250 milliseconds, the shapes and colors are procedural, and the interaction remains direct and slightly strange.

## How to play

- Left-click a shape to arm it. Drag across cells for a multi-selection.
- Hold Shift to add cells or Control/Command to toggle them.
- When an armed shape turns red, its mutation is picked by the live clock. Its successor inherits a mutated genome and shape.
- Press **A** to seed selected cells, or the cell under the pointer when nothing is selected.
- Press **D** to clear the same targets.
- Right-drag, middle-drag, or Space-drag to pan. Use the wheel to zoom around the pointer, or click the world overview to jump long distances.
- Press **P** to pause the world clock and **0** to recenter the camera.

Dark rifts are procedurally generated unbuildable terrain; coordinate 3.3 remains dark in every seed because it was the one unbuildable tile encoded in the original level. There is no win state; the sample counter, evolving ecology, and accumulated imprints are the record of the run. **New world** creates a different reproducible seed.

## Restored concepts

- A realtime render loop with a separate 250 ms simulation tick
- A large 96 × 64 linked map, expanding the original dynamic `HexMap` design while retaining its single authored void
- Random polygon meshes, colors, delayed activation, progress bars, and six scale/rotation variants
- Red completion highlights and selection-driven mutation picking
- Multi-selection, Shift-add, Control-toggle, right-drag panning, pointer-centered zoom, and A/D actions
- Persistent visual imprints of picked forms, replacing the old prototype's accidental content stacking
- Procedural terrain, energy diffusion, and energy-dependent growth across the complete lattice
- Timed sources inspired by the unfinished factory system
- Autonomous motes inspired by the old scripted enemies: each has speed, momentum, payload, and a finite lifecycle
- Neighbor-scored movement and colonization extending the unfinished pathfinding and surrounding-cell experiments
- Inherited genomes and geometry with bounded mutation instead of unrelated random successors
- Viewport culling, constant-time map picking, and a clickable overview for large-map navigation
- FPS, tick, source, mote, energy, growth, and picked-sample telemetry

Factory production, enemies, collision handling, and pathfinding were partial or unused experiments in the old source, not working parts of the playable loop. The new demo uses those fragments as inspiration rather than claiming to reproduce unfinished rules: factories became sources, scripted enemies became motes, and pathfinding became local procedural steering.

## Development

The demo has no runtime dependencies. It uses the TypeScript 7 compiler, Vite, Canvas 2D, and Vitest.

```bash
npm install
npm run dev
```

Useful commands:

```bash
npm run typecheck  # TypeScript 7 validation
npm test           # Simulation, renderer, and hex-grid tests
npm run build      # Validate and create the production bundle
npm run preview    # Preview the production bundle
```

The application is organized around a seeded, testable simulation in `src/simulation.ts`, coordinate helpers in `src/hex.ts`, a high-DPI Canvas renderer with viewport culling and overview rendering in `src/renderer.ts`, and DOM/input orchestration in `src/main.ts`.

Pushes to `main` are tested, built, and deployed to GitHub Pages by GitHub Actions.
