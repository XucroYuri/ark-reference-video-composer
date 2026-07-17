# Contributing

Thank you for helping improve this reference implementation. Before starting a large change, open a feature request so scope and API behavior can be discussed.

## Development

Use Node.js 22 or newer, then run:

```bash
npm install
cp .env.example .env.local
npm run serve
```

Keep real generation disabled while developing. Never add credentials, user media, full real task IDs, or temporary result URLs to commits, issues, screenshots, fixtures, or logs.

## Pull requests

Keep changes focused, add or update tests, and run these checks before opening a pull request:

```bash
npm audit --omit=dev
npm run check:secrets
npm run test
npm run lint
npm run build
```

Explain user-visible behavior and safety implications in the pull request. By participating, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
