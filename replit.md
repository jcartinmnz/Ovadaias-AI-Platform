# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## Artifacts

### Ovadaias — Corporate AI Assistant (`artifacts/ovadaias`)

Spanish/English corporate AI agent with futuristic purple branding.

- **Branding**: nuclear purple #6327EC, Orbitron + Exo 2 fonts, brand gradient on logo/headings, carbon-black background
- **Chat**: Streaming chat UI calling `/api/openai/conversations/:id/messages` (SSE)
- **Knowledge base** (`/knowledge`): Upload company documents (paste, `.txt`/`.md`, `.pdf`, or `.docx`). Each document is split into ~1000-char overlapping chunks and indexed for retrieval. PDF parsing uses `pdf-parse` v2 (`PDFParse` class), DOCX uses `mammoth.extractRawText`.
- **Acceso restringido (invitación)**: el registro público está deshabilitado. La ruta `/sign-up` muestra una página informativa (`pages/sign-up-disabled.tsx`); solo `/sign-in` permite entrar. Para invitar un nuevo operador:
  1. Abre el panel **Auth** desde la barra del workspace.
  2. En la pestaña **Users** crea/invita la cuenta del operador con su correo corporativo.
  3. (Opcional pero recomendado) Define una allowlist por entorno con `VITE_ALLOWED_EMAILS` (lista separada por comas) y/o `VITE_ALLOWED_EMAIL_DOMAINS` (ej. `ovadaias.com,partner.com`). Si se configura, cualquier sesión cuya dirección no coincida será cerrada automáticamente y verá el mensaje "Cuenta no autorizada" (`AuthorizedOnly` en `App.tsx`).
  4. Para revocar acceso, banea/elimina al usuario en la pestaña **Users** del panel Auth.

### API server (`artifacts/api-server`)

- **AI provider**: Replit AI Integrations OpenAI proxy (model `gpt-5.2`)
- **Database**: Neon Postgres (project `ovadaias`, ID `long-tree-32033209`). Connection via `NEON_DATABASE_URL` env var. The runtime-managed `DATABASE_URL` cannot be overridden, so `lib/db` reads `NEON_DATABASE_URL` first.
- **RAG**: Postgres full-text search in Spanish (`to_tsvector('spanish', ...)` with GIN index). Each user message triggers `retrieveRelevantChunks` which ranks by `ts_rank_cd` and injects the top results as additional context into the system prompt. We chose lexical FTS over vector embeddings because the Replit AI proxies do not expose embeddings endpoints and bundling local embedding models (e.g. `@xenova/transformers`) requires native modules (`sharp`, `onnxruntime-node`) whose post-install scripts are blocked in this environment.
- **Routes**:
  - `GET /api/openai/documents` — list documents with chunk counts
  - `POST /api/openai/documents` `{ title, content, source? }` — create + index document from raw text
  - `POST /api/openai/documents/upload` (multipart, field `file`, optional `title`/`source`) — upload PDF/DOCX/TXT (max 25 MB)
  - `DELETE /api/openai/documents/:id` — cascade-delete document + chunks
  - `POST /api/openai/conversations` — create conversation
  - `POST /api/openai/conversations/:id/messages` — SSE stream of `{content}` chunks ending with `{done:true}`

## Notes

- Orval codegen quirk: after running `pnpm --filter @workspace/api-spec run codegen`, ensure `lib/api-zod/src/index.ts` is `export * from "./generated/api";`
