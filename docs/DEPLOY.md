# Hamyon AI — serverga joylash (deploy)

Bitta VPS'da Docker bilan ishlaydi: HTTPS (Let's Encrypt) avtomatik,
PostgreSQL, Redis, kunlik shifrlangan backup (7 kun saqlanadi).

```
Internet ──443──▶ Caddy (HTTPS) ──▶ app (API + bot webhook + web panel + workers)
                                      ├── PostgreSQL 16
                                      └── Redis 7 (navbat, scheduler)
                  backup ── har kuni pg_dump → deploy/backups/*.sql.gz.enc
```

## 0. Kerak bo'ladi

| Nima | Izoh |
|---|---|
| VPS | Ubuntu 22.04/24.04, kamida 2 vCPU · 4 GB RAM · 40 GB disk. Diskni shifrlangan (encrypted volume) qilib oling. |
| Domen | Masalan `hamyon.uz`. A-yozuvi VPS IP manziliga qaragan bo'lsin. |
| Telegram bot | @BotFather'dan **yangi** token (chatda oshkor bo'lgan eski tokenni `/revoke` qiling). |
| Anthropic API key | Matnni tushunish uchun (ixtiyoriy — kalitsiz faqat qoida-asosidagi parser ishlaydi). |
| Google Cloud API key | Ovoz uchun Speech-to-Text (ixtiyoriy). Kalitni faqat Speech-to-Text API bilan cheklang. |

## 1. Serverni tayyorlash

```bash
# Docker
curl -fsSL https://get.docker.com | sh
# Faqat kerakli portlar
sudo ufw allow 22/tcp && sudo ufw allow 80/tcp && sudo ufw allow 443/tcp && sudo ufw --force enable
```

## 2. Kodni olish

```bash
git clone https://github.com/muminovilhom16-dev/HamyonAI.git
cd HamyonAI
git checkout claude/hamyon-ai-master-prompt-wx9kdh   # yoki main'ga merge qilingandan keyin main
```

## 3. Sozlash

```bash
cd deploy
./deploy.sh            # birinchi marta deploy/.env yaratadi va to'xtaydi
nano .env              # DOMAIN, ACME_EMAIL, TELEGRAM_BOT_TOKEN, TELEGRAM_BOT_USERNAME
                       # (ixtiyoriy) ANTHROPIC_API_KEY, GOOGLE_STT_API_KEY, AI_TEXT_MODEL
```

`POSTGRES_PASSWORD`, `TELEGRAM_WEBHOOK_SECRET`, `AUTH_TOKEN_SECRET`,
`BACKUP_ENCRYPTION_KEY` bo'sh qolsa — `deploy.sh` o'zi kuchli tasodifiy
qiymat yaratadi. **`BACKUP_ENCRYPTION_KEY` nusxasini serverdan tashqarida
xavfsiz joyda saqlang** — usiz backup'larni ochib bo'lmaydi.

## 4. Ishga tushirish

```bash
./deploy.sh
```

Skript: image'ni build qiladi → migratsiyalarni bajaradi → hammasini
ishga tushiradi → `https://DOMAIN/health` ni tekshiradi → Telegram webhook
va buyruqlar menyusini o'rnatadi.

Oxirida @BotFather'da: `/setdomain` → bot → `DOMAIN` (saytda «Telegram bilan
kirish» tugmasi shu domen uchun ishlaydi).

## 5. Tekshirish

1. `https://DOMAIN` — landing ochiladi.
2. Botga `/start` → til → valyuta → `taksi 25 ming` → kartochka chiqadi.
3. Botga `/web` → havola → web panel ochiladi.
4. Ovozli xabar → «Qabul qilindi» → transkripsiya bilan kartochka.
5. `./deploy.sh status` — barcha konteynerlar `healthy`.

## Kundalik ishlar

| Buyruq | Nima qiladi |
|---|---|
| `./deploy.sh update` | `git pull` + qayta build va ishga tushirish (migratsiyalar avtomatik) |
| `./deploy.sh status` | konteynerlar holati + HTTPS tekshiruvi |
| `./deploy.sh logs` | ilova loglari (token va secret'lar loglarga yozilmaydi) |
| `./deploy.sh backup` | hozir backup olish |
| `./deploy.sh webhook` | Telegram webhook'ni qayta o'rnatish |

### Backup va tiklash

- Har kuni 02:00 (Toshkent) da `deploy/backups/` ga shifrlangan dump, 7 kun saqlanadi (TZ §39).
- **Serverdan tashqariga ham nusxa oling** (masalan, `rclone` bilan S3/Backblaze'ga) — bitta disk yo'qolsa, backup ham yo'qolmasin.
- Tiklash (mavjud bazani ustidan yozadi!):
  ```bash
  docker compose -f docker-compose.prod.yml exec backup /bin/sh /backup.sh restore /backups/hamyon-YYYYMMDDTHHMMSSZ.sql.gz.enc
  ```

### Akkaunt o'chirish va saqlash muddatlari (TZ §40)

O'chirish so'rovidan 7 kun o'tib (`ACCOUNT_DELETION_GRACE_DAYS`) ma'lumotlar
butunlay o'chiriladi; backup'lar yana ≤7 kun saqlanadi — jami 30 kundan kam.

## Masshtablash

- 10 000 foydalanuvchi uchun bitta VPS yetarli (matn p95 ~25 ms, AI'siz).
- Ko'proq yuk: `app` ni bir nechta replica qiling; scheduler Redis orqali
  baribir faqat bir marta ishlaydi. Faqat API bo'lgan replica'larda `RUN_WORKERS=false`.

## Xavfsizlik ro'yxati

- [ ] Eski (chatda ko'ringan) bot token `/revoke` qilingan
- [ ] `deploy/.env` faqat root o'qiy oladi (`chmod 600`, skript o'zi qo'yadi) va git'ga tushmaydi
- [ ] Disk shifrlangan, SSH faqat kalit bilan
- [ ] `BACKUP_ENCRYPTION_KEY` tashqarida saqlangan, backup'lar tashqariga ko'chiriladi
- [ ] Google API key faqat Speech-to-Text uchun cheklangan
- [ ] Google Cloud loyihada «data logging» o'chiq

Yuridik talablar (maxfiylik siyosati, foydalanish shartlari, ma'lumotlarni
saqlash joyi bo'yicha O'zbekiston qonunchiligi) — texnik qism emas; ishga
tushirishdan oldin yurist bilan tekshiring (TZ §40).
