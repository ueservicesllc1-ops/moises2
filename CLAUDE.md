# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project: Judith (moises-clone)

AI audio-separation web app: upload a song (or YouTube link), get back isolated stems (vocals / drums / bass / guitar / piano / other), then mix them in an in-browser DAW with EQ, pitch/tempo control, chord detection, BPM, click track, etc. UI strings and most code comments are in Spanish.

## Commands

```
npm run dev          # Next on :3000 + b2-proxy on :3001 (concurrently)
npm run dev:port     # Same, but fails fast if :3000 is occupied (scripts/ensure-dev-port.mjs)
npm run dev:clean    # Wipes .next/ first (scripts/clean-next.mjs) — use after weird HMR/chunk 404s
npm run dev:any      # Plain `next dev` letting Next pick a port (no b2-proxy)
npm run proxy        # Just the B2 CORS proxy on :3001
npm run lint         # next lint
npm run build        # next build
npm run start        # next start (frontend only)
npm run start:full   # Used by Railway: Next + Python backend together via concurrently
npm run desktop:dev  # Next dev + Electron shell (desktop/)
npm run desktop:dist # Build web bundle and package Electron app
```

No automated test suite — there are no `*.test.ts(x)` or `*.spec.*` files outside `node_modules`. Don't claim "tests pass" — type-check / lint / manual browser smoke is the verification path.

Python backend (when not using `start:full`):
```
cd backend
python main.py      # FastAPI on :8000 (dev). Production path is /opt/venv/bin/python (Docker).
```

## Architecture

### Two-process monolith, one Docker image

The repo is a Next.js 14 (App Router) frontend **plus** a FastAPI Python backend living under `backend/`. The `Dockerfile` builds both into a single image; `railway.json` deploys to Railway with `npm run start:full`, which runs Next on `:3000` and FastAPI on `127.0.0.1:8000` concurrently in the same container. The Next API routes act as a thin reverse-proxy / orchestrator over FastAPI.

### Backend URL resolution — read this before touching server-side fetches

[lib/backendUrl.ts](lib/backendUrl.ts) is the single source of truth for "where is FastAPI from the Node process?". It deliberately does **not** try a chain of URLs:

- Default (monolith): `http://127.0.0.1:8000`.
- Override: `BACKEND_INTERNAL_URL=<url>`.
- Split-stack: set `BACKEND_FETCH_MODE=remote` AND one of `INTERNAL_BACKEND_URL` / `BACKEND_URL` / `BACKEND_PUBLIC_URL`.
- Placeholder strings (`tu-backend`, `your-backend`, `example.com`, `xxx.xxx`, etc.) are filtered out via `PLACEHOLDER_RE` — leaving them in Railway env vars is safe; they're ignored.

[next.config.js](next.config.js) duplicates this logic for the one `rewrites()` entry (`/api/upload/* → ${backend}/api/upload/*`). Keep both in sync if you change the resolver.

Browser-facing API base is separate — [lib/config.ts](lib/config.ts) `getBackendUrl()` — and prefers `NEXT_PUBLIC_API_URL` then auto-detects `judith.life` / `*.railway.app` / `*.run.app` to mean "same origin".

### Audio delivery: the B2 proxy chain

Stems are stored on Backblaze B2 (`f005.backblazeb2.com` / `s3.us-east-005.backblazeb2.com`, buckets `moises2` / `Multitrack`). The browser **never** fetches B2 directly — CORS would block it and some user networks can't reach B2 at all. Audio always flows through a proxy:

- [app/api/download/route.ts](app/api/download/route.ts) — Next route. `GET /api/download?url=<B2 https url>`. Same-origin in both dev and prod. Allow-lists the two B2 hosts; rejects anything else with 403.
- [b2-proxy.mjs](b2-proxy.mjs) — Standalone Node server on `:3001`. Same allow-list. Used by `npm run dev` as a secondary candidate, and also exposes `/file/<bucket>/…` for legacy callers.
- [lib/audioProxy.ts](lib/audioProxy.ts) — Browser-side. `getCachedAudioBlobUrl()` is the entry point. It walks a candidate list (`b2DownloadProxyBaseCandidates`): same origin → `localhost:3001` → optional fallback to a remote Railway origin if local network can't reach B2. Successful WAV blobs are stored in a Cache API bucket `moises-audio-cache`.
- Relevant env vars: `NEXT_PUBLIC_REMOTE_AUDIO_PROXY` (force a specific HTTPS proxy origin in dev) and `NEXT_PUBLIC_AUDIO_PROXY_FALLBACK` (override default Railway fallback, or `0`/`false` to disable).

If you touch audio fetching: keep the host allow-list in `app/api/download/route.ts` and `b2-proxy.mjs` in sync, and remember the browser checks WAV magic bytes (`RIFF`) before caching — a 200-OK HTML page won't pass.

### Separation pipeline (where the ML actually runs)

[backend/main.py](backend/main.py) (FastAPI) is the orchestrator and accepts uploads / YouTube links. There are **two** demucs paths:

1. **Modal GPU (production)** — [backend/modal_worker.py](backend/modal_worker.py) defines `modal.App("moises-demucs-worker")` running on A10G with pre-baked demucs models (`mdx_extra_q`, `mdx_extra`, `htdemucs_6s`). Requires `MODAL_TOKEN_ID` / `MODAL_TOKEN_SECRET`. The fine-tuned checkpoint is mounted from the `zion-demucs-dataset` volume.
2. **Local CPU fallback** — [backend/audio_processor_real.py](backend/audio_processor_real.py) runs `htdemucs_ft` or `htdemucs_6s` directly via the `demucs` pip package (slow on CPU; intended for local debugging).

Model choice rule (both paths): if requested tracks include `guitar` or `piano`, use a 6-stem model; otherwise use the 4-stem fine-tuned one. `is_hi_fi=True` multiplies `shifts` and `overlap` for quality at the cost of latency.

Training pipeline lives in [backend/modal_trainer.py](backend/modal_trainer.py) (`modal.App("moises-demucs-trainer")`) and is invoked from the `app/admin/training` UI.

### Separation cache

[backend/database.py](backend/database.py) — SQLAlchemy. Defaults to `sqlite:///./moises_clone.db`; honors `DATABASE_URL` if set (Railway can inject an empty string, which is treated as unset). Three tables:

- `tasks` — in-flight separation jobs.
- `separation_cache` — keyed by SHA256(audio bytes) + sorted requested tracks + quality profile + hi_fi flag + `SEPARATION_MODEL_VERSION`. TTL via `SEPARATION_CACHE_TTL_HOURS` (default 168h). See `build_cache_key()` in `main.py`.
- `visits` — analytics.

There is an in-memory `JobQueueManager` (max 2 concurrent) in `main.py` — if you change concurrency, also check `tasks_storage` (an in-memory dict that mirrors DB state) for staleness across worker boundaries.

### Next API surface

Routes live in [app/api/](app/api/). Most are thin wrappers around FastAPI:

- `separate/` — tries `/separate`, `/api/separate-demucs`, `/api/separate` on the backend in that order to stay compatible with multiple backend deploys; only stops on non-404.
- `download/` — B2 proxy (see above).
- `youtube-extract/`, `chord-analysis/`, `analyze-chords/`, `export-audio/`, `download-track/`, `proxy-audio/` — forward to FastAPI.
- `stripe/` — Stripe webhook + checkout session creation (uses `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, price IDs from env).
- `training/` — admin-only Modal training trigger.
- `health/`, `visits/`, `status/`.

### Auth, payments, surfaces

- Firebase Auth (client SDK in [lib/firebase.ts](lib/firebase.ts), admin in [lib/firebaseAdmin.ts](lib/firebaseAdmin.ts)). Service-account JSON via `FIREBASE_SERVICE_ACCOUNT_JSON` env var (not a file).
- Stripe via `@stripe/stripe-js` and `stripe` server SDK; pricing tiers in [lib/pricing.ts](lib/pricing.ts).
- Top-level routes: `/` (landing), `/studio` (main editor), `/mixer`, `/login`, `/admin` (incl. `/admin/training`), `/checkout`, plus several legal pages.
- Electron wrapper in [desktop/](desktop/) is built separately via `npm --prefix desktop`.

### Dev quirks worth knowing

- [middleware.ts](middleware.ts) only acts in dev: it sets `Cache-Control: no-store` and redirects `/_next/static/chunks/*.js` requests without a `?v=` to add one, working around a stale-chunk 404 pattern on some browsers. In production it's a no-op.
- [scripts/ensure-dev-port.mjs](scripts/ensure-dev-port.mjs) fails `npm run dev:port` if 3000 is taken — because Next will silently jump to 3001 otherwise and the user keeps hitting :3000 expecting it to work.
- Path alias: `@/*` → repo root (see [tsconfig.json](tsconfig.json)). Standard `next/core-web-vitals` ESLint config.

## Editing conventions specific to this repo

- Keep new comments/log messages in Spanish if you're editing files where the surrounding context is Spanish — most of the codebase is.
- Don't add new "try URL A, then B, then C" backend resolution. The existing single-URL discipline in `lib/backendUrl.ts` is intentional and was fought for; `/api/separate` is the one allowed exception (it probes alternate backend paths, not alternate backends).
- The B2 host allow-list is duplicated in `app/api/download/route.ts` and `b2-proxy.mjs` — update both, don't introduce a new bypass.
