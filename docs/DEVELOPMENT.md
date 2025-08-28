# Development

## Prereqs

- Node 18+
- Yarn (preferred) or npm
- qobuz-dl, ffmpeg, ffprobe (runtime integration tests)

Install deps and browsers:

- `yarn install`
- `npx playwright install chromium`

## Scripts

- Type-check: `yarn typecheck`
- Test (Jest): `yarn test`
- Lint: `yarn lint` (autofix: `yarn lint:fix`)
- Format: `yarn format` / `yarn format:check`

## Structure

- `src/cli/*`: Executable CLI entrypoints (ts-node via scripts under `script/`).
- `src/lib/*`: Pure helpers and orchestration.
- `src/qobuzRunner.ts`: qobuz-dl integration, tagging, AIFF conversion, organising.
- `script/*`: Thin shell shims to run the CLIs without a build step.

## Notes

- The project runs TypeScript directly via ts-node in dev. No build step is required for local usage.
- CI runs tests and `tsc --noEmit`.
- If you add new env vars, document them in `.env.example` and the README.
