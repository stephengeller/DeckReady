# Contributing

Thanks for your interest in contributing!

## Ground Rules

- Be kind and follow the `CODE_OF_CONDUCT.md`.
- For security issues, see `SECURITY.md` and do not open public issues.

## Development Setup

Requirements:

- Node.js 20+
- `tidal-dl-ng`, `ffmpeg`, and `ffprobe` available in your PATH for integration runs

Bootstrap:

```bash
script/setup
# or: yarn setup
```

Useful scripts:

- `yarn typecheck` – TypeScript type checking (no emit)
- `yarn test` – Run tests (Jest)
- `yarn lint` / `yarn lint:fix` – ESLint
- `yarn format` / `yarn format:check` – Prettier

## Pull Requests

- Fork the repo and create a feature branch.
- Keep PRs focused and reasonably small.
- Ensure CI passes: lint, format check, typecheck, and tests.
- Do not commit `.env` or secrets. Use `.env.example` as reference.
- Remove any focused tests (e.g., `it.only`, `describe.only`).

## Commit Style

- Clear, descriptive commit messages are appreciated.
- If your change affects docs or public behavior, update relevant docs.

## Discussions & Issues

- File an issue for bugs or small proposals.
- For larger changes, consider opening a Discussion or issue first to align on approach.

## License

By contributing, you agree that your contributions are licensed under the project’s MIT License.
