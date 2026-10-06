# Hamyon AI — 1 daqiqalik qo'llanma video (9:16, 60 soniya)

Botdan foydalanish va web panelni ochish bo'yicha qo'llanma. Videodagi bot
javoblari va web panel ekranlari **haqiqiy** — ular ilovaning o'zidan olinadi.

## Qayta yaratish

```bash
pnpm --filter @hamyon/api build && pnpm --filter @hamyon/web build   # bir marta
node marketing/guide/capture.mjs   # bot javoblari + web skrinshotlar → assets/ (lokal PostgreSQL kerak)
node marketing/guide/render.mjs    # → marketing/guide/hamyon-guide-9x16.mp4
```

- Tez tekshirish: `node marketing/guide/render.mjs --stills 7,24,38 --dir rasmlar`
- Ovozsiz: `--no-sfx`

## Tuzilishi

| Fayl | Vazifasi |
|---|---|
| `timeline.js` | Ssenariy: barcha voqealar vaqti bilan (yozuvlar, bosishlar, xabarlar). Rasm ham, ovoz ham shundan o'qiydi |
| `guide.html` | Animatsiya (`window.render(t)`) |
| `sfx.mjs` | Ovoz effektlari — `timeline.js` dan avtomatik |
| `capture.mjs` | Haqiqiy kontentni yig'ish (`assets/`, gitga kirmaydi) |
| `../lib/` | Promo va qo'llanma uchun umumiy render va ovoz kutubxonasi |

## Matnni o'zgartirish

Ekrandagi yozuvlar — `timeline.js` dagi `caption` voqealari. Vaqtni o'zgartirsangiz,
ovoz effektlari ham avtomatik siljiydi.
