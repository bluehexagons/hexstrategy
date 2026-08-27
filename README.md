# Hex Strategy

[Play the realtime demo](https://bluehexagons.github.io/hexstrategy/)

Hex Strategy is a modern restoration of a small canvas experiment begun around 2008–2011. It is an open-ended realtime systems toy: procedural forms wait, grow, rotate, and become ready on a 16 × 16 hex lattice. Arm one before it matures and the live world clock will pick its next mutation, preserve the old form as an imprint, and sometimes echo the mutation into an open neighbor.

This deliberately follows the character of the original prototype instead of turning it into a conventional turn-based tactics game. The clock runs continuously at one simulation tick every 250 milliseconds, the shapes and colors are procedural, and the interaction remains direct and slightly strange.

## How to play

- Left-click a shape to arm it. Drag across cells for a multi-selection.
- Hold Shift to add cells or Control/Command to toggle them.
- When an armed shape turns red, its mutation is picked on the next tick.
- Press **A** to seed selected cells, or the cell under the pointer when nothing is selected.
- Press **D** to clear the same targets.
- Right-drag, middle-drag, or Space-drag to pan. Use the wheel to zoom around the pointer.
- Press **P** to pause the world clock and **0** to recenter the camera.

The single dark cell at coordinate 3.3 is the unbuildable tile encoded in the original level. There is no win state; the sample counter and accumulated imprints are the record of the evolving run.

## Restored concepts

- A realtime render loop with a separate 250 ms simulation tick
- The original 16 × 16 level and its single unbuildable cell
- Random polygon meshes, colors, delayed activation, progress bars, and six scale/rotation variants
- Red completion highlights and selection-driven mutation picking
- Multi-selection, Shift-add, Control-toggle, right-drag panning, pointer-centered zoom, and A/D actions
- Persistent visual imprints of picked forms, replacing the old prototype's accidental content stacking
- FPS, tick, thing, ready, and picked-sample telemetry

Factory production, enemies, collision handling, and pathfinding were partial or unused experiments in the old source, not working parts of the playable loop. They are intentionally not presented as restored mechanics in this demo.

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

The application is organized around a deterministic, testable simulation in `src/simulation.ts`, coordinate helpers in `src/hex.ts`, a high-DPI Canvas renderer and camera in `src/renderer.ts`, and DOM/input orchestration in `src/main.ts`.

Pushes to `main` are tested, built, and deployed to GitHub Pages by GitHub Actions.
