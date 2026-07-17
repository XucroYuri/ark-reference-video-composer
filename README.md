# Ark Reference Video Composer

[简体中文](README.zh-CN.md)

A Vue 3 reference implementation for guarded Seedance 2.0 video generation with atomic Tiptap media mentions, a minimal Express adapter, and the complete Ark task lifecycle. It is published as source for learning and migration; no npm package is published.

## What it demonstrates

- Text-to-video and image-reference video generation for the selected Seedance 2.0 model.
- One to nine local PNG/JPEG/WebP references or registered public HTTPS image URLs.
- Atomic `@ImageN` mentions in a Tiptap document and deterministic readable, template, and model prompts.
- A server-authoritative media registry, strict request construction, Dry-run preview, one-time confirmation, and sequential creation of one to four tasks.
- Immediate provisional task display, bounded polling, task-history recovery, status-aware cancellation/deletion, usage display, and `succeeded`, `failed`, `cancelled`, and `expired` terminal states.

The [API conformance matrix](docs/api-conformance.md) maps every implemented Ark lifecycle endpoint to its client, adapter, store, and contract tests.

## Safety and cost boundary

`APP_REAL_GENERATION_ENABLED=false` is the default. Dry-run never calls Ark and never creates a billable task. Real generation costs money; actual charges and quotas are determined by the Volcengine Ark console.

`ARK_API_KEY` is server-only and must never use a `VITE_` prefix. Real creation also requires a valid current Dry-run, public media, and an explicit one-time confirmation. Creation is never retried automatically. Successful video and last-frame URLs expire after 24 hours, so download or transfer results promptly. Task queries cover only the most recent seven days.

## Architecture

```text
Vue 3 Composer
  ├─ upload / remote HTTPS reference registration
  ├─ Tiptap document + atomic mediaMention nodes
  ├─ generation options + Dry-run confirmation
  └─ task history, polling, results, cancel/delete
                 │ { code, data, msg }
                 ▼
Express reference adapter
  ├─ authoritative in-memory media registry
  ├─ validation + Ark request builder
  ├─ one-time confirmation store
  └─ fixed-origin Ark API client
                 │
                 ▼
Volcengine Ark video generation API
```

The browser submits media IDs and editor JSON. The adapter resolves authoritative media records, builds the ordered Ark `content` array, and keeps credentials out of browser bundles.

## Quick start

Node.js 22 or newer is required.

```bash
npm install
cp .env.example .env.local
npm run serve
```

Open `http://127.0.0.1:8080/#/video-generation`. The health endpoint is `http://127.0.0.1:8888/api/health`. Change local ports with `VITE_CLI_PORT` and `VITE_SERVER_PORT` if necessary.

## Remote URL workflow

Choose the public URL input, enter an HTTPS image URL and optional display name, then register it. The server accepts only structurally safe public hostnames: no credentials, localhost/local domains, literal IP addresses, control characters, or unusual ports.

URL media is not pre-fetched. Registration therefore validates URL structure, not reachability, MIME type, byte size, or dimensions; Ark performs those media checks when a real task is created. Browser previews use a no-referrer policy. This workflow does not require `PUBLIC_MEDIA_BASE_URL`.

## Local upload workflow

Choose one to nine PNG, JPEG, or WebP images and insert their atomic `@ImageN` mentions from the editor menu. The server validates signature, decodeability, single-frame structure, dimensions of 300–6000 px, aspect ratio of 0.4–2.5, and a size strictly below 30 MB.

Local `/uploads` paths work for preview and Dry-run but cannot be fetched by Ark. For real generation, configure `PUBLIC_MEDIA_BASE_URL` as a public HTTPS origin backed by appropriate storage, or use the remote URL workflow.

## Dry-run versus real generation

Dry-run validates the canonical editor document, media registry, and configuration, then returns three prompts, canonical media ordering, the exact Ark request body, blockers, and—only when all gates pass—a one-time confirmation token. It makes zero Ark calls.

Real creation requires `APP_REAL_GENERATION_ENABLED=true`, a server-side API key, reachable public media, an unchanged Dry-run, and explicit confirmation. `count` is a local option: the adapter creates one to four independent single-result tasks sequentially and stops at the first error while preserving already-created task IDs. It does not retry or compensate an uncertain or partially successful paid request.

## Environment variables

| Variable | Scope | Purpose |
| --- | --- | --- |
| `VITE_CLI_PORT` | Browser tooling | Vite port; defaults to `8080`. |
| `VITE_SERVER_PORT` | Server/launcher | Express port; defaults to `8888`. |
| `VITE_BASE_API` | Browser | Axios API prefix; defaults to `/api`. |
| `VITE_BASE_PATH` | Browser | Local development base; defaults to `http://127.0.0.1`. |
| `SERVE_SERVER_ENTRYPOINT` | Launcher | Server entry point; defaults to `server/index.js`. |
| `SERVER_HOST` | Server | Bind host; defaults to `127.0.0.1`. |
| `ARK_BASE_URL` | Server | Fixed approved Ark OpenAPI origin. |
| `ARK_MODEL` | Server | Selected Seedance 2.0 endpoint/model identifier. |
| `ARK_API_KEY` | Server secret | Ark credential; never expose through `VITE_*`. |
| `PUBLIC_MEDIA_BASE_URL` | Server | Optional public HTTPS base for local uploads. |
| `APP_REAL_GENERATION_ENABLED` | Server | Paid-generation gate; defaults to `false`. |

Store local secrets only in the ignored `.env.local`. The tracked `.env.example` intentionally contains no value for the key.

## API lifecycle

The local adapter exposes upload, remote registration, media deletion, Dry-run, task creation, single-task query, list query, and task cancellation/deletion under `/api/videoGeneration`. The paid lifecycle maps to Ark as follows:

1. `POST /api/v3/contents/generations/tasks` creates one task.
2. `GET /api/v3/contents/generations/tasks/{id}` drives bounded, visibility-aware polling. After creation, the provisional `queued` task appears immediately; the first bounded GET occurs after 3 seconds while visible or 10 seconds while hidden.
3. `GET /api/v3/contents/generations/tasks` restores explicitly requested recent history with pagination and supported filters.
4. `DELETE /api/v3/contents/generations/tasks/{id}` cancels a queued task or removes an eligible terminal record.

`queued` and `running` are active. `succeeded`, `failed`, `cancelled`, and `expired` are terminal. The UI never sends `expired` as a list filter, and uses a local-only `unavailable` display state when an old/deleted task cannot be queried.

## Testing

```bash
npm audit --omit=dev
npm run check:secrets
npm run test
npm run lint
npm run build
```

The secret scanner reads only paths returned by `git ls-files`, skips binary files and `.env.example`, and never opens ignored `.env.local`. CI repeats the checks with Node.js 22 and `npm ci` on pushes and pull requests to `main`.

## Known limitations

The selected implementation supports Seedance 2.0 text plus 1–9 reference images, chosen video options, and all four task endpoints. Optional Ark fields such as callbacks, tools, draft workflow, frames, seed, camera controls, and create-time service tier are deliberately omitted. Reference video/audio, person-asset authorization, network search, production remote-media probing, automatic long-term result storage, database persistence, authentication, billing, and multi-user collaboration are unsupported product capabilities—not silently emulated fields.

The in-memory registries and local upload directory are development references. Restarting the adapter loses registrations and confirmations. Result URLs remain temporary.

## Migration

Preserve `src/view/videoGeneration/`, `src/api/videoGeneration.js`, the `{ code, data, msg }` envelope, atomic Tiptap nodes, authoritative media resolution, and one-time confirmation semantics. Replace local media storage and confirmation state with your authenticated service, object storage/CDN, and durable cache. Keep the API key server-side and retain the no-retry rule for task creation. See [the migration guide](docs/migration/hc-gpt-web.md).

## Security

Read [SECURITY.md](SECURITY.md) before deploying or reporting a vulnerability. Do not post credentials, private media, complete real task IDs, or temporary result URLs in issues or logs. Production deployments need authentication, authorization, durable storage, rate limits, abuse controls, auditing, and appropriate compliance work.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) and follow the [Code of Conduct](CODE_OF_CONDUCT.md). Focused issues and pull requests are welcome after all local checks pass.

## License

MIT © 2026 XucroYuri. See [LICENSE](LICENSE). This repository publishes source code only; no npm package is published.
