# "Spark" uslubi — kinetik tipografiya (9:16, 15 soniya)

Namuna: yashil/laym rangli, kinetik tipografiyali explainer-video ("Everything starts with a Spark…").
`spark.html` — shu uslubning Hamyon AI uchun qayta ishlangan shabloni.

## Qayta yaratish

```bash
pnpm install
node marketing/spark/render.mjs                    # → marketing/spark/hamyon-spark-9x16.mp4
node marketing/spark/render.mjs --stills 2.6,9.4   # tez tekshirish uchun PNG kadrlar
```

Bayroqlar `promo` bilan bir xil: `--bot`, `--fps 60`, `--out`, `--no-sfx`.

## Vositalar

| Vosita | Nima uchun |
|---|---|
| **GSAP 3** (`gsap`) | Timeline + easing (`expo.out`, `back.out`, `elastic`). Timeline pauzada, `tl.seek(t)` bilan har bir kadr aniq chiziladi |
| **Plus Jakarta Sans** (`@fontsource-variable/plus-jakarta-sans`) | Namunadagi geometrik grotesk shriftga eng yaqin bepul variant (200–800 vazn) |
| Chromium + ffmpeg (`../lib/render.mjs`) | Kadrma-kadr render → H.264 MP4 |
| `../lib/sound.mjs` | Litsenziyasiz sintez qilingan SFX (whoosh, pop, impact, shimmer) |

## Uslub qoidalari (namunadan olingan)

**Ranglar** — ikki "dunyo" almashib turadi:
- Dark: `#04241b` → `#08402f` → `#12a36a` radial gradient, ustida xira (blur 110px) suzuvchi blob'lar va pastda laym yoy.
- Light: `#f2fbe6` krem-yalpiz, burchakda sariq `#fbffd0` dog'.
- Aksent: laym `#dcff3a` (kalit so'zlar), krem `#f1f7dc` (oddiy matn), to'q lenta `#0c5b3b`.

**Tipografiya**
- Oddiy so'zlar — yupqa (300–400), kalit so'z — qalin (800) laym. Bitta jumlada ikkala vazn kontrastda.
- Matn kam: bir kadrda 1–6 so'z. Katta sahnada bitta so'z ("Idea", "GROWTH").
- Katta so'z orqasida 4 ta "ghost" nusxa (faqat kontur, 14% shaffoflik).
- Final sahnalarda chapga tekislangan, ustma-ust qatorlar; oxirgi qator qalin laym.

**Harakat**
- So'z kirishi: `blur(18px) + y:50 + scale:1.08` → aniq holat, `expo.out`, 0.7s, so'zlar orasida 0.09s.
- So'z chiqishi: yuqoriga + blur, `power2.in`, 0.4s. Kesish yo'q — har doim blur orqali o'tish.
- "Pill" tugma: kenglik 0 dan ochiladi, ichida aylanib chiqadigan gul-uchqun; kursor kelib bosadi (elastic).
- Gul-uchqun (8 bargli) — brend motiv: porlash `drop-shadow`, `back.out` bilan aylanib paydo bo'ladi.
- Dark → light o'tishi: 0.2s oq-sariq flash + "impact" ovozi.
- Gradient lenta (SVG `stroke-dashoffset`) karta/foto atrofida chiziladi.
- Fon hech qachon to'xtamaydi: blob'lar `sin(t)` bo'yicha sekin suzadi.

**Ritm**: har 1.5–2.5 soniyada yangi sahna; har bir harakat ovoz effekti bilan bog'langan.

## Yangi video qilish

1. `spark.html` dagi `#s1…#s6` bloklarini nusxalang, matnni almashtiring.
2. Vaqtlarni pastdagi `tl` (GSAP timeline) ichida o'zgartiring; `wordIn(els, at)` / `wordOut(els, at)` yordamchilaridan foydalaning.
3. `sfx.mjs` dagi cue vaqtlarini timeline'ga moslang.
4. `--stills` bilan tekshiring, keyin to'liq render.
