# Ovadaias — Project Context for Claude Code

> Pega este documento como contexto inicial. Describe arquitectura, stack, esquema de datos, rutas, convenciones y decisiones.

---

## 1. Visión general

Ovadaias es una **plataforma corporativa de IA** (ES/EN, branding morado futurista #6327EC) que combina:
- Asistente de chat con RAG sobre documentos de la empresa
- Subagente creativo de Marketing (genera carruseles con Gemini Flash Image)
- Subagente/CRUD de Calendario corporativo
- Atención al cliente por **WhatsApp** vía Evolution API con bot IA, tickets, multimedia (Whisper/Vision), inbox unificado y vista Kanban
- Auth con Clerk + registro restringido por allowlist

Hospedado en **Replit** como monorepo pnpm con varios *artifacts*.

---

## 2. Stack técnico

### Monorepo
- pnpm workspaces, Node 24, TypeScript 5.9
- esbuild para bundling backend
- Orval para codegen de cliente desde OpenAPI

### Backend (`artifacts/api-server`)
- Express 5, Drizzle ORM, Zod (`zod/v4`)
- PostgreSQL (Neon — `NEON_DATABASE_URL`)
- Multer (uploads), Pino + pino-http (logs), Nodemailer (SMTP)
- `@clerk/express` para auth
- `pdf-parse` v2 (clase `PDFParse`) y `mammoth` para extracción de texto
- `openai` SDK + `@google/genai` SDK
- AI vía **proxy de Replit AI Integrations**:
  - `@workspace/integrations-openai-ai-server` (modelo `gpt-5.2`)
  - `@workspace/integrations-gemini-ai` (`gemini-2.5-flash-image` aka nano-banana)

### Frontend (`artifacts/ovadaias`)
- React 19 + Vite 7 + Tailwind CSS 4 (tema "Nuclear Purple")
- TanStack Query v5, Wouter, Radix UI, Lucide, Framer Motion, Recharts, Sonner, react-hook-form, zod
- `@clerk/react` para auth
- Hooks/clientes generados: `@workspace/api-client-react`

### Librerías compartidas (`lib/`)
- `lib/db` — esquema Drizzle + cliente Postgres
- `lib/api-spec` — OpenAPI + Orval config
- `lib/api-zod` — Zod schemas autogenerados (¡recordar `export * from "./generated/api"` después de codegen!)
- `lib/api-client-react` — hooks React Query autogenerados
- `lib/integrations-openai-ai-server`, `lib/integrations-openai-ai-react`, `lib/integrations-gemini-ai` — wrappers del proxy IA

---

## 3. Estructura de carpetas

```
artifacts/
  api-server/
    src/
      app.ts
      index.ts            # arranca Express en puerto 8080
      middlewares/        # requireAuth (Clerk), error handlers
      routes/
        index.ts          # monta requireAuth scopeado por prefijo
        health.ts         # PÚBLICO
        openai/           # /conversations, /documents, /messages (SSE)
        marketing/        # generación de carruseles
        calendar/         # CRUD de eventos
        chat-projects/    # proyectos/personas
        whatsapp/
          index.ts        # /whatsapp/* (auth excepto webhook)
                          # ALLOWED_EVENTS = solo 4 variantes upsert
      lib/
        rag.ts            # FTS español (to_tsvector + ts_rank_cd)
        file-parsers.ts   # PDF/DOCX → texto plano
        calendar-agent.ts # tool-calling agent
        logger.ts         # Pino
        whatsapp/
          evolution.ts    # cliente HTTP de Evolution API
          pipeline.ts     # webhook → contacto → media → IA → respuesta
          agent.ts        # loop recursivo (max 6 pasos) con tools
          multimedia.ts   # Whisper (audio) + Vision (imagen)
          email.ts        # Nodemailer (notificaciones de tickets/handoff)
  ovadaias/
    src/
      App.tsx                     # rutas wouter + AuthorizedOnly
      components/
        layout/
          shell.tsx               # contenedor + header móvil + Sheet drawer
          sidebar.tsx             # nav + proyectos + lista chats; props {mobile?, onNavigate?}
        calendar/
          event-dialog.tsx
          reminders-bell.tsx
        projects/
          project-dialog.tsx
        clock-calendar.tsx
        ui/                       # shadcn-style sobre Radix
      pages/
        chat.tsx                  # / y /chat/:id
        conversations.tsx
        knowledge.tsx              # /knowledge — RAG
        marketing.tsx              # /marketing
        calendar.tsx               # /calendar
        whatsapp-inbox.tsx         # /whatsapp (responsive: list↔thread)
        whatsapp-tickets.tsx       # /whatsapp/tickets (Kanban)
        whatsapp-settings.tsx      # /whatsapp/settings
        sign-up-disabled.tsx
        not-found.tsx
      hooks/
        use-chat-stream.ts        # consume SSE
        use-mobile.tsx            # breakpoint 768
        use-toast.ts
      lib/
        events-api.ts
        projects-api.ts
        whatsapp-api.ts           # waApi { unreadCount, listConversations, ... }
        utils.ts
  mockup-sandbox/                  # vite preview para prototipos en canvas
lib/                               # paquetes @workspace/*
```

---

## 4. Esquema de base de datos (Drizzle, PostgreSQL)

Archivos en `lib/db/src/schema/`:

| Archivo | Tablas |
|---|---|
| `conversations.ts` | `conversations` (id serial, title, projectId fk → chat_projects, createdAt) |
| `messages.ts` | `messages` (id serial, conversationId fk, role, content, createdAt) |
| `documents.ts` | `documents` (id serial, title, source, content, createdAt), `document_chunks` (id, documentId fk, content, **GIN index sobre `to_tsvector('spanish', content)`**) |
| `events.ts` | `events` (id, title, description, type: publication\|payment\|meeting\|reminder, startAt, endAt, ...) |
| `chat-projects.ts` | `chat_projects` (id, name, color, systemPrompt) |
| `whatsapp.ts` | `whatsapp_settings` (singleton: evolutionUrl, evolutionApiKey, instance, smtpHost/port/user/pass, notifyOnNewTicket, notifyOnNewConversation, notifyOnHandoff, botEnabled, systemPrompt, ...), `whatsapp_contacts` (phone, name, notes, language), `whatsapp_conversations` (contactId, status open/closed, botEnabled, unreadCount, lastMessagePreview), `whatsapp_messages` (conversationId, direction in/out, type text/image/audio/video/document, content, mediaUrl, transcription), `whatsapp_tickets` (conversationId, title, summary, priority, category, status open/in_progress/resolved/closed, source ai/human) |

**Importante:**
- IDs: todos `serial` salvo Clerk userIds que son varchar
- NUNCA cambiar tipo de PK
- Para sincronizar schema usar `pnpm --filter @workspace/db run push` (Drizzle Kit `--force` si requiere)

---

## 5. Rutas API (todas prefijadas con `/api`)

### Públicas
- `GET /health`
- `POST /whatsapp/webhook` — protegido por shared-secret en header `apikey` (`WHATSAPP_WEBHOOK_SECRET`). Solo procesa eventos en `ALLOWED_EVENTS`:
  - `messages.upsert`
  - `MESSAGES_UPSERT`
  - `messages.upsert.received`
  - `MESSAGES_UPSERT_RECEIVED`

### Protegidas (`requireAuth` scopeado por prefijo en `routes/index.ts`)
| Endpoint | Descripción |
|---|---|
| `POST /openai/conversations` | crea conversación |
| `GET /openai/conversations` | lista (hook `useListOpenaiConversations`) |
| `DELETE /openai/conversations/:id` | borra chat |
| `POST /openai/conversations/:id/messages` | **SSE** stream de `{content}` chunks, termina con `{done:true}` |
| `GET/POST/DELETE /openai/documents` | RAG — listado, creación desde texto, borrado en cascada |
| `POST /openai/documents/upload` | multipart `file` (PDF/DOCX/TXT, máx 25 MB) |
| `GET/POST/PATCH/DELETE /chat-projects` | proyectos |
| `GET/POST/PATCH/DELETE /calendar/events` | eventos |
| `POST /marketing/generate` | carrusel de imágenes |
| `GET /whatsapp/conversations`, `GET /whatsapp/conversations/:id` | inbox |
| `POST /whatsapp/conversations/:id/messages` | enviar mensaje (texto/imagen/archivo) |
| `PATCH /whatsapp/conversations/:id` | toggle bot/status |
| `GET /whatsapp/unread-count` | badge |
| `GET/POST/PATCH /whatsapp/tickets` | tickets (Kanban) — POST manual dispara email si `notifyOnNewTicket` |
| `GET/PUT /whatsapp/settings` | configuración |

---

## 6. Decisiones técnicas clave

1. **RAG léxico en lugar de vectorial**: el proxy AI de Replit no expone embeddings y los modelos locales (`@xenova/transformers`, `onnxruntime-node`, `sharp`) tienen post-install scripts bloqueados en este entorno. Usamos **Postgres FTS español** con índice GIN sobre `to_tsvector('spanish', content)` y ranking por `ts_rank_cd`. Suficiente para corpus corporativo.

2. **Auth scopeada por prefijo**: aplicar `router.use(requireAuth, fooRouter)` desde root afectaba al webhook público de WhatsApp. Solución: en `routes/index.ts`, registrar `requireAuth` como middleware a prefijos explícitos (`/openai`, `/marketing`, `/calendar`, `/chat-projects`, `/conversations`) ANTES de montar los routers.

3. **WhatsApp event allowlist estricta**: Evolution API envía muchos eventos; solo procesamos las 4 variantes de `messages.upsert` para evitar loops y duplicados.

4. **Safe fetch en agente WhatsApp**: cuando la IA genera URLs para enviar como media, validamos contra SSRF (sin localhost, sin IPs privadas, solo http/https).

5. **Recursión con tope**: agente WhatsApp loop máx 6 pasos para evitar gasto descontrolado de tokens.

6. **Path-based routing**: el frontend usa `import.meta.env.BASE_URL` como prefijo para llamadas API (no usar URLs root-relative `/api/...` directamente, escapan al artifact prefix del workspace).

7. **DB connection**: `lib/db` lee `NEON_DATABASE_URL` con preferencia sobre `DATABASE_URL` (este último es runtime-managed y no se puede sobrescribir).

8. **Sidebar responsive (recién agregado)**: `Sidebar` acepta props `{mobile?, onNavigate?}`. En móvil va dentro de un `Sheet` desde `Shell`, con cabecera hamburguesa visible en `md:hidden`.

9. **Inbox WhatsApp responsive**: lista y hilo se alternan vía clases condicionales basadas en `selectedId`; back button visible solo en `md:hidden`.

---

## 7. Variables de entorno

| Var | Uso |
|---|---|
| `NEON_DATABASE_URL` / `DATABASE_URL` | Postgres |
| `SESSION_SECRET` | sesiones Express |
| `VITE_CLERK_PUBLISHABLE_KEY` + `CLERK_SECRET_KEY` | auth |
| `VITE_ALLOWED_EMAILS` | allowlist (comas) |
| `VITE_ALLOWED_EMAIL_DOMAINS` | allowlist por dominio (comas) |
| `EVOLUTION_API_URL`, `EVOLUTION_API_KEY` | WhatsApp |
| `WHATSAPP_WEBHOOK_SECRET` | shared-secret del webhook |
| `SMTP_HOST/PORT/USER/PASS` | notificaciones |

---

## 8. Workflows / arranque local

| Workflow | Comando |
|---|---|
| `artifacts/api-server: API Server` | `pnpm --filter @workspace/api-server run dev` (puerto 8080) |
| `artifacts/ovadaias: web` | `pnpm --filter @workspace/ovadaias run dev` (puerto asignado por Replit) |
| `artifacts/mockup-sandbox: Component Preview Server` | `pnpm --filter @workspace/mockup-sandbox run dev` |

Comandos clave:
- `pnpm run typecheck` — typecheck monorepo completo
- `pnpm run build` — typecheck + build
- `pnpm --filter @workspace/api-spec run codegen` — regenera hooks/zod desde OpenAPI
- `pnpm --filter @workspace/db run push` — sincroniza schema (dev)

---

## 9. Convenciones de código

- TypeScript estricto en todo el monorepo
- `zod/v4` import path
- IDs siempre `serial` (no cambiar)
- Para validación HTTP: usar schemas de `@workspace/api-zod`
- Para llamadas frontend: hooks de `@workspace/api-client-react` (no fetch manual salvo `BASE_URL` + ruta nueva no codegen)
- Mensajes de UI en español (audiencia principal)
- Componentes UI siguen patrón shadcn (Radix + cva + tailwind-merge)
- Nada de `console.log` en backend — usar logger Pino

---

## 10. Estado actual / tareas completadas

- ✅ WhatsApp Customer Service Agent con event allowlist + email manual de tickets
- ✅ Auth Clerk en pantallas WhatsApp y resto de endpoints internos
- ✅ Vista Kanban de tickets
- ✅ Agente WhatsApp puede enviar imágenes/archivos (con safe fetch)
- ✅ Registro restringido por allowlist
- ✅ Sidebar retraíble + eliminar conversación
- ✅ Plataforma responsive en móvil (Sheet drawer + WhatsApp inbox adaptativo)

## 11. Pendientes conocidos / mejoras posibles

- Calendar: layout de 7 columnas en móvil aún apretado
- Marketing/Knowledge: paneles `lg:grid-cols-2` apilan bien pero podrían optimizarse para tablets `md:`
- Errores TS preexistentes (drizzle/openai/gemini types) no bloquean dev pero conviene limpiar
- Considerar embeddings reales si se permite usar `pgvector` en Neon
- Tests E2E (no hay aún)
