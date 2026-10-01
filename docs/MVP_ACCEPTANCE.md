# Hamyon AI — MVP acceptance (Phase 7)

Date: 2026-10-01 · Branch: `claude/hamyon-ai-master-prompt-wx9kdh`

## TZ §61 mandatory acceptance tests

All 15 pass end to end (webhook → bot → DB → web API): `apps/api/test/acceptance.test.ts`.

| # | Case | Result |
|---|---|---|
| 1 | `taksi 20 ming` → 20 000 UZS, Transport | ✅ |
| 2 | `taksi 20` → 20 000, Transport, confirmation before saving | ✅ |
| 3 | `такси 15к` → 15 000, Transport | ✅ |
| 4 | `bozordan go'sht oldim yuz ellik ming` → 150 000, Oziq-ovqat | ✅ |
| 5 | `non 5 ming, sut 12 ming` → two transactions | ✅ |
| 6 | `kompyuterga windows o'rnatish 70 ming` → Texnika va xizmatlar | ✅ |
| 7 | `kompyuter windows ustanovkasi` → same category (amount asked) | ✅ |
| 8 | `Murod akaga 300 ming qarz berdim` → debt, not expense | ✅ |
| 9 | `Murod aka 100 ming qaytardi` → remaining 200 000 | ✅ |
| 10 | `oylik tushdi 6 mln` → income | ✅ |
| 11 | `50$ kurtka` → 50 USD, frozen UZS conversion, Kiyim | ✅ |
| 12 | `bugun bozorga bordim` → not saved, amount asked | ✅ |
| 13 | AI provider unavailable → transaction not lost | ✅ |
| 14 | Expired `/web` → "Havola muddati tugadi" | ✅ |
| 15 | No income → no negative red balance | ✅ |

## TZ §60 corpus (340 messages)

`packages/core/test/corpus/` — Uzbek Latin, Uzbek Cyrillic, Russian, mixed
scripts, typos, slang, voice-style transcripts, amount formats, multiple
transactions, debts, income, dates, messages without amounts.

Measured on the **deterministic layer alone** (AI off — the worst case).
Category *precision* = when a category is assigned, it is correct;
*coverage* = share of messages that get one (the rest go to AI or the user).

| Set | Amount | Type | Category precision | Category coverage |
|---|---|---|---|---|
| Dev (235), before tuning | 99.1% | 99.6% | 99.5% | 97.2% |
| **Holdout (105), first measurement** | **99.0%** | **99.0%** | **97.7%** | **96.7%** |
| All (340), final | 100.0% | 100.0% | 100.0% | 99.0% |

Targets: amount ≥ 98% ✅, category ≥ 90% ✅.

Honesty notes:
- Both sets were written by the same author as the dictionaries; real user
  messages will score lower. The holdout first measurement is the best
  available estimate. After it, two holdout bugs (`internet oylik` read as
  income; `oyligim` category) were fixed because they were silent errors —
  so the holdout is now spent. Re-measure on real (anonymized) messages.
- Remaining misses: typos like `tacsi`, `benzn`, `taksy` get no category from
  the rule layer; with AI on they are categorized by the model, without AI
  they are saved with a pending category.

## TZ §46 performance

Text, rule path, local DB: p50 15 ms, p95 24 ms (`apps/api/test/perf.test.ts`).
Not yet measured: AI path, Google STT, web on 3G — need real keys and hosting.

## Not verified in this environment

Real Telegram, Claude API, Google STT and CBU rates (network blocked here;
adapters are tested against fake servers with the real wire format).
