# Migration plan: JavaScript -> TypeScript

# Migration plan: JavaScript -> TypeScript (updated: switch to ts-node-only workflow)

This document captures a concrete, incremental plan to migrate the SpotifyToRekordbox repository from plain JavaScript to TypeScript. The aim is to add types and improve maintainability while keeping the project runnable and testable during migration.

High-level strategy

- Migrate incrementally. Start with configuration and type-checking (no behavioral changes), then convert small modules one-by-one.
- Use Babel to continue running tests and transforms initially (the repo already uses Babel + jest). Use TypeScript (tsc) for static type checking (noEmit) during the first phase.
- Keep Node ESM semantics. Use TypeScript settings that understand ESM-style imports and preserve .js specifiers so runtime behaviour is unchanged.

Phases

1. Preparation (non-destructive)

- Add TypeScript dev tooling.
  - Install dev deps: typescript, @types/node, @types/jest, ts-node (optional), eslint typescript plugin (optional).
    Example (yarn):
    yarn add -D typescript @types/node @types/jest ts-node
- Add tsconfig.json (checked in) configured for incremental migration (allowJs: true, noEmit: true).
- Update Babel to include @babel/preset-typescript so jest/babel continue to run .ts files during tests.
- Update jest.config to transform .ts files with babel-jest.
- Add npm script: "typecheck": "tsc --noEmit" so CI can run type checking.

2. Convert low-risk utility modules

- Pick small, pure modules first (parseArgs.js, parseCliArgs.js, normalize.js, queryBuilders.js).
- For each file:
  - Rename file to .ts (e.g. parseArgs.ts).
  - Add explicit parameter and return types.
  - Keep existing import specifiers (including ".js" extensions) — TypeScript with module: NodeNext / moduleResolution: NodeNext understands .js specifiers in source and will emit compatible outputs.
  - Run `yarn test` and `yarn typecheck` to catch issues.

3. Convert business logic & I/O code

- Convert files that touch Playwright or spawn child processes (qobuzRunner.js, runLuckyForTracklist.js, spotify_list.js).
- Add types for returned promises/objects, and define small local types/interfaces where appropriate.

4. Convert tests

- Option A: keep tests as .js (Babel will handle importing .ts modules).
- Option B (recommended long-term): convert tests to TypeScript and add @types/jest.

5. Tighten TypeScript settings

- After all/most files are .ts, flip tsconfig:
  - allowJs: false
  - noEmit: false (or use a separate tsconfig.build.json for emit)
  - enable strict checks (noImplicitAny, strictNullChecks, etc.) and fix resulting errors.
- Add a build step (tsc --build or tsc -p tsconfig.build.json) to produce dist/ for runtime scripts and bin entries.

6. Finalize runtime scripts

- Update package.json/bin to point to compiled JS in dist/ (or keep using ts-node if preferred).
- Remove Babel if you choose to rely solely on tsc + esbuild/rollup for bundling.

Recommended tsconfig.json (initial, checked-in)

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2020"],
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "strict": false,
    "noEmit": true,
    "allowJs": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": ["src/**/*", "test/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

Notes on imports and file extensions

- The repo currently uses ESM and imports modules with explicit ".js" extensions, e.g. `import { foo } from './normalize.js'`.
- When converting a file to TypeScript (rename to .ts), keep the import specifier as `./normalize.js` in source. TypeScript (>= 4.7) with module: NodeNext understands this and allows it; at emit time your compiled code will match Node expectations.
- If you prefer not to keep ".js" in imports in your sources, convert to `.ts` imports (no extension) and adapt tsconfig options accordingly — but this usually requires extra care for ESM resolution.

Babel + Jest configuration changes (initial)

- Add @babel/preset-typescript to babel.config so babel-jest can transpile TS during tests.
- Update jest.config transform to include .ts files.

CI / scripts

- Add `typecheck` script to package.json and run it in CI to ensure types stay green.
- Keep `test` script as-is (jest + babel-jest) for now.

Per-file migration checklist

- Create a PR per small group of files (2–5 files) to keep reviews small.
- For each PR:
  - Rename files to .ts and update exports with explicit types.
  - Run `yarn test` and `yarn typecheck` locally.
  - Fix any failing tests or type errors.
  - Merge and repeat.

Risks and mitigations

- Runtime import specifier mismatches: Use NodeNext module settings and keep ".js" import specifiers in source to avoid mismatches.
- Jest / Babel differences: Keep Babel handling transforms until TypeScript build is added; add tsc --noEmit for checking.
- Large refactor friction: Migrate incrementally and keep tests running so regressions are visible.

Example conversions (small snippets)

- parseArgs.js → parseArgs.ts

```ts
export function parseArgs(argv: string[]): {
  file: string | null;
  dir: string | null;
  dry: boolean;
} {
  const out = { file: null, dir: null, dry: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (!a) continue;
    if (a === '--dry') out.dry = true;
    else if (a === '--dir') out.dir = argv[++i] || null;
    else if (!a.startsWith('--') && !out.file) out.file = a;
  }
  return out;
}
```

Next actions I will take now (non-destructive):

- Create and check in `MIGRATION_TO_TYPESCRIPT.md` (this file).
- Add an initial `tsconfig.json` with settings suitable for ESM + incremental migration.
- Update `babel.config.cjs` to include `@babel/preset-typescript` so Jest will handle .ts files.
- Update `jest.config.cjs` to transform `.ts` files.
- Add `typecheck` script to package.json.

If you'd like, next I can:

- Install the devDependencies automatically (yarn add -D ...). I will not modify package.json dependencies without your OK.
- Start converting the first small modules (parseArgs.js, parseCliArgs.js, normalize.js, queryBuilders.js) and open a PR/commit with those changes.
- Convert tests to TypeScript once core modules are typed.

Please confirm how far you'd like me to proceed automatically (just the plan + configs, or also renaming and typing files). If you want me to continue converting files now, say which files to start with or say "convert the four files we started auditing" and I'll convert those and run tests/typecheck.
