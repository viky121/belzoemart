# Belzo eMart — single-EC2 deploy (Docker Compose + Caddy)

Runs the whole stack (web + api + worker + PostgreSQL + Redis + Caddy) on one Ubuntu box.

## 0. Prerequisites (already done on this instance)
- Ubuntu 24.04, Docker + Compose installed, 2 GB swap added.
- Security group inbound: `22` (your IP), `80`, `443`.
- Instance: `13.48.85.9`.

> ⚠️ 2 GB RAM is tight for building. Prefer resizing to `t3.medium` (4 GB), or build images
> elsewhere and push to a registry. With swap it can build, just slowly.

## 1. Get the code on the server
Option A — git:
```bash
git clone <your-repo-url> belzo && cd belzo
```
Option B — copy from your machine (run locally):
```powershell
tar --exclude=node_modules --exclude=.git --exclude=.next --exclude=dist `
    --exclude=.pnpm-store --exclude=*.pem -czf belzo-src.tgz -C C:\xampp\htdocs\Belzo .
scp -i Belzo-key.pem belzo-src.tgz ubuntu@13.48.85.9:/home/ubuntu/
ssh -i Belzo-key.pem ubuntu@13.48.85.9 "mkdir -p ~/belzo && tar -xzf ~/belzo-src.tgz -C ~/belzo"
```

## 2. Configure secrets
```bash
cd ~/belzo
cp .env.prod.example .env.prod
# generate strong values:
openssl rand -base64 48   # -> JWT_ACCESS_SECRET
openssl rand -base64 48   # -> JWT_REFRESH_SECRET
openssl rand -hex 16      # -> POSTGRES_PASSWORD (put in POSTGRES_PASSWORD *and* DATABASE_URL)
nano .env.prod            # fill PUBLIC_BASE_URL, CORS_ORIGINS, secrets
```

## 3. Build, migrate, run
```bash
CMP="docker compose --env-file .env.prod -f docker-compose.prod.yml"
sudo $CMP build                                   # build api + web images
sudo $CMP run --rm api npx prisma migrate deploy  # apply DB migrations
sudo $CMP run --rm api npx ts-node prisma/seed.ts # (optional) seed admin + demo data
sudo $CMP up -d                                   # start everything
sudo $CMP ps
```

Open **http://13.48.85.9** — storefront. Admin: **/admin/login**.

## 4. Add a domain + HTTPS (later)
1. Point an A record at `13.48.85.9`.
2. In `Caddyfile`, swap the `:80 { … }` block for the `your-domain { … }` block (auto-TLS).
3. Set `PUBLIC_BASE_URL=https://your-domain` and `CORS_ORIGINS=https://your-domain` in `.env.prod`.
4. Rebuild web (public URL is baked at build) and restart:
   ```bash
   sudo $CMP build web && sudo $CMP up -d
   ```

## Ops cheatsheet
```bash
sudo $CMP logs -f api          # tail logs
sudo $CMP restart web          # restart a service
sudo $CMP down                 # stop all (keeps volumes/data)
# Backups:
sudo docker exec -t $(sudo docker ps -qf name=postgres) pg_dump -U belzo belzo > backup_$(date +%F).sql
```

## Going to real production
- Move Postgres → **RDS**, Redis → **ElastiCache** (just change `DATABASE_URL`/`REDIS_URL`).
- Set `PAYMENT_PROVIDER=live` (+ Razorpay keys), `EMAIL_PROVIDER=live` (SES), `STORAGE_PROVIDER=s3`.
- Put secrets in **AWS Secrets Manager** instead of `.env.prod`.
