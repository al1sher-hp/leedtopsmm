# Contabo Deploy Runbook — leedtopsmm

Bu hujjat `leedtopsmm` loyihasini Contabo VPS serveriga deploy qilish
bosqichlarini tavsiflaydi. Server bir nechta loyihani bir vaqtda
xosting qiladi — shuning uchun ⚠️ TAQIQLAR bo'limiga qat'iy amal qiling.

## 0. Talablar

- Serverda Docker va Docker Compose plugin o'rnatilgan bo'lishi kerak.
- `leedtopsmm` loyihasi alohida papkada joylashgan (masalan
  `/opt/apps/leedtopsmm`) va u yerda `docker-compose.yml` bor.
- `.env` fayli o'sha papkada mavjud va to'ldirilgan (qarang: `.env.example`).

## 1. Avtomatik deploy (GitHub Actions) — tavsiya etiladi

`main` branchga push qilinganda `.github/workflows/deploy-contabo.yml`
ishga tushib, GitHub'ning runneri SSH orqali serverga ulanadi va shu
papkada (`CONTABO_PROJECT_PATH`) quyidagilarni bajaradi:

```
git fetch origin main
git reset --hard origin/main
docker compose build
docker compose up -d
docker compose ps
```

Bu buyruqlar faqat `leedtopsmm` papkasi ichida, faqat shu loyihaning
`docker-compose.yml` fayli doirasida ishlaydi — boshqa loyihalarga
tegmaydi.

### Kerakli GitHub Secrets (Settings → Secrets and variables → Actions)

| Secret | Tavsif |
| --- | --- |
| `CONTABO_HOST` | Server IP yoki domen |
| `CONTABO_USER` | SSH foydalanuvchi (root emas, alohida deploy user tavsiya etiladi) |
| `CONTABO_SSH_KEY` | Shu user uchun private SSH kalit (PEM matni) |
| `CONTABO_PORT` | SSH port (ixtiyoriy, standart 22) |
| `CONTABO_PROJECT_PATH` | Serverdagi `leedtopsmm` loyihasining to'liq yo'li |

Workflow'ni qo'lda ishga tushirish uchun: GitHub → Actions →
"Deploy to Contabo" → Run workflow.

## 2. Qo'lda deploy (fallback)

Agar CI ishlamasa yoki qo'lda tekshirish kerak bo'lsa, serverga SSH
orqali kirib, faqat quyidagilarni bajaring:

```bash
cd /opt/apps/leedtopsmm      # o'zingizning loyiha yo'lingiz
git fetch origin main
git reset --hard origin/main

docker compose build
docker compose up -d

docker compose ps            # api, web, postgres holatini tekshiring
docker compose logs -f api   # kerak bo'lsa loglarni kuzating
```

## 3. Deploydan keyin tekshirish

- `docker compose ps` — barcha servislar (`postgres`, `api`, `web`)
  `healthy`/`running` holatida ekanini tasdiqlang.
- API: `curl http://localhost:4000/health` (yoki mavjud health endpoint).
- Web dashboard brauzerda ochilishini tekshiring.

## ⚠️ TAQIQLAR

- **leedtopsmm-siz hech narsaga tegmang.** Faqat shu loyiha papkasi va
  shu loyihaning `docker-compose.yml` fayli doirasida ishlang.
- **`docker system prune` (yoki `-a`, `--volumes` variantlari) ishlatmang.**
  Bu boshqa loyihalarning image/volume/network'larini ham o'chirib
  yuborishi mumkin.
- **Boshqa loyihalarning konteynerlarini to'xtatmang yoki qayta
  ishga tushirmang.** Faqat `docker compose` (shu papka ichida, `-p`
  flagisiz yoki loyihaning o'z nomi bilan) buyruqlaridan foydalaning —
  `docker stop`/`docker rm` kabi global buyruqlarni butun serverga
  qo'llamang.
- Umumiy resurslarga (Nginx reverse proxy config, umumiy Postgres
  instance va h.k.) o'zgartirish kiritishdan oldin, agar ular boshqa
  loyihalar bilan bo'lishilgan bo'lsa, alohida tasdiqlang.
