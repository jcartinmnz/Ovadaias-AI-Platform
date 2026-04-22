# Deploy en VPS Linux (x64)

Guía mínima para correr Ovadaias en cualquier servidor Linux x64 (Ubuntu / Debian / etc.) fuera de Replit.

## 1. Prerrequisitos

```bash
# Node 20+ y pnpm
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs git
sudo npm install -g pnpm pm2
```

## 2. Clonar e instalar

```bash
git clone https://github.com/jcartinmnz/Ovadaias-AI-Platform.git
cd Ovadaias-AI-Platform
pnpm install
```

## 3. Configurar variables

```bash
cp .env.example .env
# Editar .env con las claves reales (OpenAI, Gemini, DB, Clerk)
```

Carga el `.env` en la shell (o usa `dotenv-cli` / PM2 `--env-file`):

```bash
set -a; . ./.env; set +a
```

## 4. Build

```bash
pnpm run build
```

Esto compila:
- las libs (`lib/*`)
- el api-server → `artifacts/api-server/dist/`
- el frontend ovadaias → `artifacts/ovadaias/dist/public/`

## 5. Correr con PM2

```bash
# API server (puerto 3000)
cd artifacts/api-server
PORT=3000 NODE_ENV=production pm2 start dist/index.mjs --name ovadaias-api

# Frontend en modo preview (sirve el build estático)
cd ../ovadaias
PORT=5173 BASE_PATH=/ pm2 start "pnpm run serve" --name ovadaias-web

pm2 save
pm2 startup
```

## 6. Nginx (opcional — recomendado)

```nginx
server {
    listen 80;
    server_name tudominio.com;

    # Frontend
    location / {
        proxy_pass http://127.0.0.1:5173;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # API
    location /api/ {
        proxy_pass http://127.0.0.1:3000/;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

Luego `sudo certbot --nginx -d tudominio.com` para HTTPS.

## 7. Verificar

- Frontend: `http://IP:5173/` o `http://tudominio.com/`
- Marketing Studio: `http://tudominio.com/marketing`
- API health: `curl http://IP:3000/health` (si existe)

## Notas

- El `pnpm-workspace.yaml` excluye binarios de plataformas no-linux (darwin/win/freebsd/etc). En un VPS Linux x64 **no requiere cambios**.
- Los plugins de Replit (`@replit/vite-plugin-*`) están condicionados a `REPL_ID`, se desactivan solos fuera de Replit.
- Para desarrollo local con auto-reload: `pnpm --filter @workspace/api-server dev` y `cd artifacts/ovadaias && PORT=5173 BASE_PATH=/ pnpm dev`.
