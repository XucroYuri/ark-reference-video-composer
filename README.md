# Ark Reference Video Composer MVP

This prototype reproduces the marked Volcengine Ark reference-media video composer as a Vue 3 JavaScript MVP. It is shaped for low-cost migration into `/Users/huachi/Code/huachi.online/hc-gpt-web`: Element Plus, Pinia, Axios API modules, Hash Router, Tiptap JSON, and `{ code, data, msg }` response envelopes.

## Commands

```bash
npm install
npm run serve
npm run test
npm run lint
npm run build
```

`npm run serve` starts the local Express adapter and the Vite frontend together. The default frontend route is `/#/video-generation`; the server health check is `/api/health`.

## Default Cost Boundary

Dry-run is the default and is the only path used by tests. The primary submit button calls `/api/videoGeneration/dryRun`; it serializes the Tiptap document, validates media/config, and returns the final Ark-shaped request without creating a paid task.

Real generation is guarded and opt-in. It requires all of the following:

- `APP_REAL_GENERATION_ENABLED=true`
- server-only `ARK_API_KEY`
- a successful Dry-run for the current draft
- public media URLs or Ark asset URLs
- a single-use confirmation token
- explicit confirmation in the preview drawer

Task creation is never retried automatically. This avoids duplicate paid jobs when the network is ambiguous or Ark returns a partial failure.

## Environment Variables

| Variable | Scope | Description |
| --- | --- | --- |
| `VITE_CLI_PORT` | frontend | Vite dev server port. Defaults to `8080`; use another value if the port is occupied. |
| `VITE_SERVER_PORT` | server | Express adapter port. Defaults to `8888`. |
| `VITE_BASE_API` | frontend | API prefix used by Axios. Defaults to `/api`. |
| `VITE_BASE_PATH` | frontend | Local base URL used by the combined launcher. Defaults to `http://127.0.0.1`. |
| `SERVE_SERVER_ENTRYPOINT` | launcher | Optional server entrypoint for `npm run serve`; defaults to `server/index.js`. |
| `SERVER_HOST` | server | Bind host for Express; defaults to `127.0.0.1`. |
| `ARK_BASE_URL` | server | Ark OpenAPI base URL. Defaults to `https://ark.cn-beijing.volces.com/api/v3`. |
| `ARK_MODEL` | server | Ark model id. Defaults to `doubao-seedance-2-0-260128`. |
| `ARK_API_KEY` | server secret | Server-only Ark API key. Never expose this through a `VITE_` variable. |
| `PUBLIC_MEDIA_BASE_URL` | server | Public HTTPS base used to turn local uploaded media into Ark-reachable URLs. |
| `APP_REAL_GENERATION_ENABLED` | server | Set to `true` only when real paid task creation is intentionally enabled. |

Copy `.env.example` to ignored `.env.local` for local secrets. `.env.development` defaults load first, then `.env.local`, then process environment overrides.

## Media URL Boundary

Local upload previews use `/uploads/...`, which is fine for the browser and Dry-run. Ark cannot fetch `127.0.0.1`, private LAN URLs, or local filesystem paths. For real generation, `PUBLIC_MEDIA_BASE_URL` must point to an HTTPS origin that Ark can reach, or the media must already be an Ark asset URL. Dry-run reports `MEDIA_NOT_PUBLIC` blockers when media cannot be used for real generation.

## What Was Reverse Engineered

The inline `@图片N` behavior is modeled as Tiptap atomic JSON nodes, not decorated textarea text. The UI shows human-readable `@图片1`, while serialization produces:

- readable prompt for the user
- console-compatible template prompt
- model prompt text such as `【图片 1】`
- Ark request `content` with a text part followed by `image_url` reference parts

See `docs/research/` and `docs/design-references/` for captured source evidence.

## Verification

The non-visual gates are:

```bash
npm run test
npm run lint
npm run build
```

Browser and visual parity evidence is handled separately in `design-qa.md` during the final QA task.
