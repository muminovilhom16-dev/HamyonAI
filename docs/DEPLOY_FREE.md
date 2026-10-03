# Hamyon AI'ni BEPUL internetga chiqarish — oddiy qo'llanma

Hech qanday buyruq yozish kerak emas. Faqat 3 ta saytda ro'yxatdan o'tasiz
va tugmalarni bosasiz. Taxminan **20–30 daqiqa**.

Natijada bot ishlaydi va sayt manzili shunday bo'ladi:
`https://hamyon-ai.onrender.com` (domen sotib olish shart emas).

---

## 1-qadam. Telegram bot uchun YANGI kalit (5 daqiqa)

> Chatda yozilgan eski kalit hamma ko'rishi mumkin bo'lgan joyga tushdi —
> uni yangilash shart.

1. Telegram'da **@BotFather** ni oching.
2. `/revoke` yozing → botingizni tanlang. BotFather **yangi token** beradi.
   (Token shunga o'xshaydi: `8701185907:AAH...`)
3. Tokenni nusxalab, telefoningizdagi «Saqlangan xabarlar»ga vaqtincha qo'ying.
4. Botning username'ini ham yozib qo'ying (masalan `HamyonAIBot`, `@` belgisisiz).

## 2-qadam. Bepul ma'lumotlar bazasi — Neon (5 daqiqa)

1. **https://neon.tech** ga kiring → **Sign up** → **Continue with Google**.
2. Loyiha nomi: `hamyon` · Region: **AWS US East 2 (Ohio)** (Render ham Ohio’da) → **Create project**.
3. Ekranda **Connection string** chiqadi (`postgresql://...` bilan boshlanadi).
   Yonidagi **Copy** tugmasini bosing va uni ham saqlab qo'ying.

## 3-qadam. Ilovani joylash — Render (10 daqiqa)

1. **https://render.com** ga kiring → **Get Started** → **GitHub** bilan kiring.
2. GitHub so'rasa, **HamyonAI** repozitoriyasiga ruxsat bering
   (*Only select repositories* → `HamyonAI` → **Install**).
3. Render'da yuqorida **New +** → **Blueprint** ni bosing.
4. Ro'yxatdan **HamyonAI** ni tanlang → **Connect**.
5. Render 3 ta qiymatni so'raydi — 1- va 2-qadamda saqlaganlaringizni qo'ying:
   - `TELEGRAM_BOT_TOKEN` → yangi bot token
   - `TELEGRAM_BOT_USERNAME` → bot username (`@`siz)
   - `DATABASE_URL` → Neon'dan olingan connection string
   - `ANTHROPIC_API_KEY` va `GOOGLE_STT_API_KEY` — **bo'sh qoldiring** (pullik; keyin qo'shsa bo'ladi)
6. **Apply** ni bosing. 5–10 daqiqa kuting (birinchi marta build qilinadi).
7. Tayyor bo'lganda yuqorida manzil ko'rinadi, masalan
   `https://hamyon-ai.onrender.com` — ustiga bosing: Hamyon AI sahifasi ochiladi.

## 4-qadam. Tekshirish (2 daqiqa)

1. Telegram'da botingizga **/start** yozing → til, valyuta → `taksi 25 ming`.
2. Kartochka chiqsa — **hammasi ishlayapti!** 🎉
3. Botga `/web` yozing → havolani bosing → web panel ochiladi.

> Bot birinchi xabarga 30–60 soniya javob bermasa — bu normal: bepul server
> «uxlab» qolgan edi. 5-qadam buni hal qiladi.

## 5-qadam. Bot «uxlab qolmasligi» uchun (3 daqiqa)

Bepul Render 15 daqiqa jim qolsa uxlaydi; uxlaganda eslatmalar ham ketmaydi.

1. **https://cron-job.org** → **Sign up** (bepul).
2. **Create cronjob**:
   - Title: `Hamyon`
   - URL: `https://hamyon-ai.onrender.com/health` (o'zingizning manzil)
   - Schedule: **Every 10 minutes**
3. **Create** — tamom.

## 6-qadam (ixtiyoriy). Saytda «Telegram bilan kirish» tugmasi

@BotFather → `/setdomain` → botingiz → `hamyon-ai.onrender.com`

---

## Bepul variantning cheklovlari (bilib qo'ying)

- Server kuchsiz (512 MB). Sinov va dastlabki foydalanuvchilar uchun yetarli.
- AI (Claude) va ovoz (Google) — **pullik xizmatlar**. Ularsiz bot oddiy
  yozuvlarni («taksi 25 ming», «non 5 ming, sut 12 ming», qarzlar) baribir
  tushunadi; noma'lum so'zlarda kategoriyani o'zingiz tanlaysiz.
- Neon bepul bazasi 0.5 GB — minglab yozuvlar uchun yetadi.
- Haqiqiy foydalanuvchilar ko'payganda pullik serverga o'tish tavsiya etiladi
  (`docs/DEPLOY.md`).

## Muammo bo'lsa

Render → `hamyon-ai` → **Logs** bo'limidagi oxirgi qizil qatorlarni
nusxalab menga yuboring (token yoki parol bo'lsa — o'chirib yuboring).

## 7-qadam (ixtiyoriy). Sun'iy intellektni (AI) ulash

AI faqat qiyin xabarlarda ishlatiladi (oddiy «taksi 25 ming» uni chaqirmaydi).
Xarajat chegaralangan: foydalanuvchi boshiga oyiga ~1000 so'm (tarif), butun bot
uchun kuniga $1 (`AI_DAILY_BUDGET_USD`). Chegaraga yetganda bot AI'siz ishlashda davom etadi.

1. **https://console.anthropic.com** → ro'yxatdan o'ting.
2. **Billing** → karta qo'shing → $5 kredit oling. **Limits** bo'limida oylik limitni ($5) qo'ying.
3. **API Keys** → **Create Key** → nomi `hamyon-render` → kalitdan nusxa oling (hech kimga yubormang).
4. Render → **hamyon-ai** → **Environment** → `ANTHROPIC_API_KEY` ga qo'ying → **Save, rebuild, and deploy**.
5. `https://SIZNING-MANZIL.onrender.com/health` → `"ai":"on"` chiqsa, ulandi.
