# Contabo VPS deploy — qo'llanma (144.91.99.198)

Bu sessiyada Claude Code tarmoq siyosati sabab serverga to'g'ridan-to'g'ri
SSH orqali ulana olmaydi (faqat HTTPS proksi orqali chiqish ruxsat etilgan,
xom TCP/22 yo'q). Shu sabab quyidagi buyruqlarni **siz** serverga ulanib
(`ssh root@144.91.99.198`) bajarasiz. Har bir bosqichdan keyin natijani
Claude'ga qaytaring — keyingi qadam (ayniqsa VARIANT A/B tanlovi) shunga
qarab beriladi.

Ushbu loyihaning barcha fayllari `leedtopsmm-` konteksti bilan yozilgan —
boshqa 2 loyihaga hech narsa tegmaydi, lekin shunga qaramay har bir
buyruqdan keyin `docker ps` bilan ularning holatini tekshiring.

---

## BOSQICH 1 — TEKSHIRUV (faqat o'qish, hech narsa o'zgarmaydi)

```bash
ssh root@144.91.99.198

# Umumiy holat
lsb_release -a; nproc; free -h; df -h /

# Portlar
ss -tlnp

# 80/443 ni kim egallagan (agar band bo'lsa)
ss -tlnp | grep -E ':80 |:443 '

# Docker
docker --version
docker ps -a
docker network ls
docker volume ls
docker compose ls

# Proksi servislar
systemctl is-active nginx apache2 caddy traefik 2>&1
ls -la /etc/nginx/sites-enabled/ 2>&1
ls -la /etc/caddy/ 2>&1

# Host postgresql
systemctl is-active postgresql 2>&1

# Firewall
ufw status verbose

# Mavjud papkalar
ls -la /opt /srv /home

# Cron
crontab -l
```

Natijani menga qaytaring (matn sifatida yoki screenshot). Men shundan
kelib chiqib quyidagilarni tasdiqlayman:

- 80/443 band mi (VARIANT A) yoki bo'sh mi (VARIANT B)
- Bo'sh RAM va disk yetarli mi (RAM < 1GB yoki disk < 5GB bo'lsa TO'XTAYMIZ)
- `/opt/leedtopsmm` yoki `leedtopsmm` prefiksli konteyner/volume allaqachon
  bor-yo'qligi (bor bo'lsa TO'XTAYMIZ)
- Docker o'rnatilganmi (bo'lmasa, o'rnatishdan oldin sizdan tasdiq so'rayman)

**Shu bosqichdan keyin to'xtang va natijani menga yuboring — men tasdiqlamaguncha 2-bosqichga o'tmang.**

---

## BOSQICH 2 — Fayllar (repo'da tayyor, sizga kerak emas)

`deploy/contabo-vps-deploy-y3vf7a` (yoki joriy) branch'da quyidagilar
allaqachon tayyorlangan:

- `docker-compose.prod.yml` — asosiy stack (postgres, api, web, migrate)
- `docker-compose.prod.variantA.yml` — VARIANT A overlay (web'ni
  `127.0.0.1:8081` ga bog'laydi, mavjud nginx shu portga proksi qiladi)
- `docker-compose.prod.caddy.yml` — VARIANT B overlay (Caddy xizmati,
  80/443 ni o'zi egallaydi)
- `Caddyfile` — VARIANT B uchun
- `nginx-leedtopsmm.conf.example` — VARIANT A uchun namuna vhost
- `.env.prod.example` — production `.env` shabloni
- `scripts/backup.sh`, `scripts/restore.sh`

---

## BOSQICH 3 — Deploy

Server ulanib turgan holda (Bosqich 1 natijasiga qarab VARIANT A yoki B
tanlangandan keyin):

```bash
# 1. Papka
mkdir -p /opt/leedtopsmm
cd /opt/leedtopsmm

# 2. Clone qilish (branch nomini Claude beradi)
git clone https://github.com/al1sher-hp/leedtopsmm.git .
git checkout <BRANCH_NOMI>

# 3. .env yaratish
cp .env.prod.example .env
chmod 600 .env
nano .env   # POSTGRES_PASSWORD, API_ID, API_HASH, SESSION, GEMINI_API_KEY,
            # (VARIANT B bo'lsa) DOMAIN — hammasini to'ldiring

# 4. Build
# VARIANT A:
docker compose -p leedtopsmm -f docker-compose.prod.yml -f docker-compose.prod.variantA.yml build
# VARIANT B:
docker compose -p leedtopsmm -f docker-compose.prod.yml -f docker-compose.prod.caddy.yml build

# 5. Postgres'ni ko'tarish va sog'lom bo'lishini kutish
docker compose -p leedtopsmm -f docker-compose.prod.yml up -d postgres
docker compose -p leedtopsmm -f docker-compose.prod.yml ps postgres   # STATUS "healthy" bo'lguncha kuting

# 6. Migratsiya
docker compose -p leedtopsmm -f docker-compose.prod.yml --profile tools run --rm migrate

# 7. (Ixtiyoriy) Eski ma'lumotni ko'chirish — ESKI_DATABASE_URL ni o'zingiz bilasiz
pg_dump "$ESKI_DATABASE_URL" --no-owner --no-acl \
  | docker compose -p leedtopsmm exec -T postgres psql -U postgres leedtopsmm
# XATO chiqsa TO'XTATING, davom ettirmang, Claude'ga xabar bering

# 8. Qolganini ko'tarish
# VARIANT A:
docker compose -p leedtopsmm -f docker-compose.prod.yml -f docker-compose.prod.variantA.yml up -d
# VARIANT B:
docker compose -p leedtopsmm -f docker-compose.prod.yml -f docker-compose.prod.caddy.yml up -d

# Har qadamdan keyin:
docker ps
# BOSHQA 2 LOYIHA konteynerlari hali ham "Up" ekanini tekshiring.
# Biror narsa to'xtagan bo'lsa — DARHOL TO'XTANG va Claude'ga xabar bering.
```

### VARIANT A — nginx qo'shish

```bash
cp nginx-leedtopsmm.conf.example /etc/nginx/sites-available/leedtopsmm
nano /etc/nginx/sites-available/leedtopsmm   # <DOMEN> ni almashtiring
ln -s /etc/nginx/sites-available/leedtopsmm /etc/nginx/sites-enabled/leedtopsmm
nginx -t                      # xato bo'lsa TO'XTANG
systemctl reload nginx        # restart EMAS
certbot --nginx -d <DOMEN>    # certbot bo'lsa; bo'lmasa Claude'ga ayting
```

### VARIANT B — Caddy avtomatik TLS

Yuqoridagi `up -d` buyrug'i Caddy'ni ham ko'taradi; DNS `<DOMEN>` shu
serverga (`144.91.99.198`) ko'rsatayotgan bo'lsa, TLS avtomatik olinadi.

---

## BOSQICH 4 — Zaxira cron

```bash
crontab -l > /tmp/cron.bak
(crontab -l 2>/dev/null; echo "0 3 * * * /opt/leedtopsmm/scripts/backup.sh >> /opt/leedtopsmm/backups/cron.log 2>&1") | crontab -
crontab -l   # eski qatorlar + yangi qator borligini tasdiqlang
```

---

## BOSQICH 5 — Tekshiruv

```bash
curl -s http://127.0.0.1:4000/api/stats
curl -s http://127.0.0.1:4000/api/outreach/accounts
curl -sI https://<DOMEN>/
docker compose -p leedtopsmm -f docker-compose.prod.yml ps
docker ps            # boshqa 2 loyiha "Up" ekanini yana bir bor tasdiqlang
docker stats --no-stream

# Tashqaridan 5432 yopiqligini o'z kompyuteringizdan tekshiring:
nc -zv -w3 144.91.99.198 5432   # "Connection refused"/timeout bo'lishi kerak
```

Natijalarni menga yuboring — men yakuniy hisobotni tayyorlayman.

---

## Orqaga qaytarish

Agar biror narsa noto'g'ri ketsa: `docs/ROLLBACK-CONTABO.md` ga qarang.
