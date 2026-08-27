# Signal Frontier

[Play the demo](https://bluehexagons.github.io/hexstrategy/)

Signal Frontier is a compact turn-based strategy demo built on the remains of a 2011 canvas experiment. Command three Northstar units across a weighted hex grid, capture relay stations, and complete a six-point signal chain before the Redline counterforce.

## How to play

1. Select a cyan unit.
2. Select a dashed cyan hex to move, or a red-outlined enemy in range to attack.
3. Capture relay stations to earn signal at the end of your turn.
4. Reach six signal—or disable every rival unit—to win.

Vanguards move quickly, Wardens can absorb and deal heavy damage, and Lancers attack from two hexes away. Forest and ridge hexes cost two movement; water is impassable. Adjacent defenders return one damage when attacked.

## Development

The demo has no runtime dependencies. It uses the native TypeScript 7 compiler, Vite, Canvas 2D, and Vitest.

```bash
npm install
npm run dev
```

Useful commands:

```bash
npm run typecheck  # TypeScript 7 validation
npm test           # Engine and hex-grid tests
npm run build      # Validate and create the production bundle
npm run preview    # Preview the production bundle
```

The application is organized around a testable game engine in `src/game.ts`, coordinate helpers in `src/hex.ts`, a high-DPI Canvas renderer in `src/renderer.ts`, and DOM orchestration in `src/main.ts`.

Pushes to `main` are tested, built, and deployed to GitHub Pages by GitHub Actions.
