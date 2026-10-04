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

## Musiqa qo'shish

Video ovozsiz. Musiqa qo'shish uchun (25 soniyaga qirqib, oxirida so'nadi):

```bash
ffmpeg -i hamyon-promo-9x16.mp4 -i musiqa.mp3 -map 0:v -map 1:a -c:v copy -c:a aac \
  -af "afade=t=out:st=23:d=2" -shortest hamyon-promo-music.mp4
```

Yoki CapCut / Instagram / TikTok ichida tayyor musiqani qo'shing.
