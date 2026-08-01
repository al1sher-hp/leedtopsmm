# Rollback — Contabo VPS (leedtopsmm)

Bu hujjat leedtopsmm deploy qilingan hamma narsani **izsiz** o'chirish
tartibini beradi. Har bir buyruq faqat `leedtopsmm` prefiksli
resurslarga tegadi — boshqa 2 loyihaga hech qanday tarzda tegmaydi.

Tartibni tekshirib chiqing: har bir buyruqda `-p leedtopsmm` yoki aniq
`leedtopsmm` nomi bor. Agar biror buyruqda bu yo'q bo'lsa — ISHLATMANG.

## 1. Konteynerlar, tarmoq, volume'larni o'chirish

```bash
cd /opt/leedtopsmm
docker compose -p leedtopsmm -f docker-compose.prod.yml down -v
```

`-v` faqat shu compose loyihasiga (`leedtopsmm`) tegishli volume'larni
(`leedtopsmm_pgdata`, va VARIANT B bo'lsa `leedtopsmm_caddy_data`,
`leedtopsmm_caddy_config`) o'chiradi. Tekshirish:

```bash
docker volume ls | grep leedtopsmm   # bo'sh natija = hammasi o'chdi
docker ps -a | grep leedtopsmm       # bo'sh natija = hammasi o'chdi
```

## 2. Papkani o'chirish

```bash
rm -rf /opt/leedtopsmm
```

## 3. Proksi konfiguratsiyasini olib tashlash

**VARIANT A (mavjud nginx ishlatilgan bo'lsa):**

```bash
rm -f /etc/nginx/sites-enabled/leedtopsmm
rm -f /etc/nginx/sites-available/leedtopsmm
nginx -t && systemctl reload nginx
```

Boshqa `sites-enabled/` fayllariga TEGMANG — faqat `leedtopsmm` nomli
fayl o'chiriladi.

**VARIANT B (Caddy compose ichida bo'lgani uchun) — alohida amal shart
emas, 1-qadamdagi `down -v` Caddy konteyneri va uning volume'larini ham
olib tashlaydi.**

## 4. Cron qatorini olib tashlash

Butun crontab'ni ALMASHTIRMANG — faqat leedtopsmm qatorini o'chiring:

```bash
crontab -l > /tmp/cron.bak
grep -v 'leedtopsmm/scripts/backup.sh' /tmp/cron.bak | crontab -
crontab -l   # tekshiring — boshqa qatorlar joyida qolganini tasdiqlang
```

## 5. Yakuniy tekshiruv

```bash
docker ps -a                 # boshqa 2 loyiha konteynerlari Up ekanini tasdiqlang
docker volume ls             # leedtopsmm_* yo'qligini tasdiqlang
ss -tlnp | grep -E ':80 |:443 |:4000 '
ufw status verbose           # o'zgarmagan bo'lishi kerak
```

Agar zaxira nusxalarni saqlab qolmoqchi bo'lsangiz, 2-qadamdan oldin
`/opt/leedtopsmm/backups/` papkasini boshqa joyga ko'chiring — `rm -rf`
ularni ham o'chiradi.
