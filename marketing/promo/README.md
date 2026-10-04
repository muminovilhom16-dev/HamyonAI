# Hamyon AI — reklama videosi (9:16, 25 soniya)

Video `promo.html` animatsiyasidan kadrma-kadr yaratiladi (Chromium + ffmpeg, bepul).

## Qayta yaratish

```bash
pnpm install            # bir marta (playwright-core va shrift uchun)
node marketing/promo/render.mjs --bot hamyonchai_bot
# natija: marketing/promo/hamyon-promo-9x16.mp4 (1080×1920, 30 fps, H.264)
```

- `--bot` — videoning oxirida ko'rinadigan bot username (@ belgisisiz; standart: hamyonchai_bot).
- `--fps 60` — silliqroq video.
- `--out fayl.mp4` — boshqa nom.
- `--stills 1,8.5,24 --dir rasmlar` — faqat tanlangan soniyalardagi PNG kadrlar (tez tekshirish uchun).

Chromium boshqa joyda bo'lsa: `CHROMIUM_PATH=/yo'l/chromium`.

## Matnni o'zgartirish

Barcha yozuvlar `promo.html` ichida (`<div class="scene">` bloklari va `MSGS` ro'yxati).
Brauzerda `promo.html` ni ochib, konsolda `render(10)` deb istalgan soniyani ko'rish mumkin.

## Ovoz effektlari

Video ichida sintez qilingan ovoz effektlari bor (`sfx.mjs`): whoosh, pop, klaviatura,
tanga, bildirishnoma, qo'ng'iroq va h.k. — barchasi animatsiya vaqtiga moslangan, litsenziyasiz.
Effektlarsiz video: `--no-sfx`. Faqat ovozni yaratish: `node marketing/promo/sfx.mjs`.

## Narrator (o'zbekcha erkak ovozi)

Matn va vaqtlar `narration.py` ichidagi `LINES` ro'yxatida. Ovoz — Microsoft "Sardor"
(uz-UZ-SardorNeural, bepul). Internetda `speech.platform.bing.com` ochiq bo'lishi kerak.

```bash
pip install edge-tts
python3 marketing/promo/narration.py     # → marketing/promo/narration.wav
node marketing/promo/render.mjs          # narration.wav bo'lsa, avtomatik qo'shiladi
```

Mikslashda effektlar pasaytiriladi va ovoz paytida yana pastlaydi (ducking), yakuniy
balandlik -14 LUFS (Instagram/TikTok standarti). Ovozsiz: `--no-voice`.
Proksi orqali ishlansa: `SSL_CERT_FILE=/yo'l/ca.crt python3 marketing/promo/narration.py`.

## Musiqa qo'shish

Effektlarni saqlab, orqa fonga musiqa qo'shish (musiqa pastroq, oxirida so'nadi):

```bash
ffmpeg -i hamyon-promo-9x16.mp4 -i musiqa.mp3 -filter_complex \
  "[1:a]volume=0.35,afade=t=out:st=23:d=2[m];[0:a][m]amix=inputs=2:duration=first:normalize=0[a]" \
  -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 192k hamyon-promo-music.mp4
```

Yoki CapCut / Instagram / TikTok ichida musiqani past ovozda qo'shing.
