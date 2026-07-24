# Deploy Navastar to your own Hetzner server

The production stack is one `docker compose` file: **web** (Caddy — serves the
SPA, terminates auto-HTTPS, reverse-proxies the API + WebSocket), **api**,
**postgres** (persistent volume), and **minio**, plus a nightly **backup**
sidecar. Everything is configured through `.env`.

> Works on any Docker host — Hetzner is just the example. Postgres/MinIO stay on
> the internal Docker network and are never exposed to the internet.

## 1. Provision the server
- Create a Hetzner Cloud VM (Ubuntu 24.04, CX22 or larger).
- Point DNS at it: an **A record** for `navastarlogistics.com` (and `www`, and
  optionally `minio.` — see step 5) → the server's IP.

## 2. Harden + install Docker
```bash
ssh root@YOUR_SERVER_IP

# firewall: SSH + HTTP + HTTPS only
ufw allow 22/tcp && ufw allow 80/tcp && ufw allow 443/tcp && ufw --force enable

# Docker + compose plugin
curl -fsSL https://get.docker.com | sh
```

## 3. Get the code + configure
```bash
git clone https://github.com/BIGTRG/Navastar.git && cd Navastar
cp .env.example .env
nano .env
```
Set at minimum:
- `DOMAIN=navastarlogistics.com`
- `JWT_SECRET=` a long random string (`openssl rand -hex 32`)
- `POSTGRES_PASSWORD=`, `S3_ACCESS_KEY=`, `S3_SECRET_KEY=` — strong secrets
- `HERE_API_KEY=` (optional; enables truck routing — set `MAP_PROVIDER=here`)

## 4. Deploy
```bash
./scripts/deploy.sh          # git pull && docker compose -f docker-compose.prod.yml up -d --build
```
Caddy obtains Let's Encrypt certificates automatically once DNS resolves. Then
seed demo data once:
```bash
docker compose -f docker-compose.prod.yml exec api pnpm --filter @navastar/db seed
```
Visit **https://navastarlogistics.com**. API docs: **/api/docs**.

## 5. Media uploads (MinIO) in production
Browser presigned uploads must reach MinIO at a URL whose host matches the signed
request. Expose MinIO on a subdomain:
1. Add DNS: `minio.navastarlogistics.com` → server IP.
2. Uncomment the `minio.{$DOMAIN}` block in [`deploy/Caddyfile`](../deploy/Caddyfile).
3. In `.env` set both `S3_ENDPOINT=https://minio.navastarlogistics.com` and
   `S3_PUBLIC_URL=https://minio.navastarlogistics.com`, then redeploy.

(For a first look without media, leave `STORAGE_PROVIDER=stub`.)

## 6. Backups
The `backup` service runs `pg_dump` nightly to `./backups/` (keeps the last 14).
Pull them off-box on a schedule, e.g. host cron:
```
0 4 * * *  rsync -a /root/Navastar/backups/ backups@offsite:/navastar/
```
Restore: `docker compose -f docker-compose.prod.yml exec -T postgres psql -U navastar navastar < backups/navastar-YYYYMMDD-HHMMSS.sql`

## 7. Updates
```bash
./scripts/deploy.sh
```
Pulls, rebuilds, and restarts with zero config changes. Schema changes apply
automatically on API boot (`prisma db push`).

## Operations cheatsheet
```bash
docker compose -f docker-compose.prod.yml logs -f api      # tail API logs
docker compose -f docker-compose.prod.yml ps               # status
docker compose -f docker-compose.prod.yml restart api      # restart a service
docker compose -f docker-compose.prod.yml down             # stop (volumes persist)
```
