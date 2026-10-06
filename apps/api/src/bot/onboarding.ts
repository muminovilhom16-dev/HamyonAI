import { InlineKeyboard, type Bot } from 'grammy';
import { eq } from 'drizzle-orm';
import { schema } from '@hamyon/db';
import { markNoSpendingToday, optOutOfDebtorReminders, type Language } from '@hamyon/core';
import { t } from '../i18n';
import type { BotContext, BotServices } from './context';
import { sendGuideVideo } from './guide';
import { sendMenu } from './menu';

/**
 * TZ §14: /start → language → currency → example → first transaction →
 * reminder time → completed. No phone/email. Every step is one tap.
 */
const LANGS: Array<[Language, string]> = [
  ['uz_latn', "O'zbekcha"],
  ['uz_cyrl', 'Ўзбекча'],
  ['ru', 'Русский'],
];
const REMINDER_TIMES = ['20:00', '21:00', '22:00'];

async function setUser(s: BotServices, ctx: BotContext, patch: Partial<typeof schema.users.$inferInsert>) {
  const [u] = await s.db
    .update(schema.users)
    .set({ ...patch, updatedAt: s.now() })
    .where(eq(schema.users.id, ctx.user!.id))
    .returning();
  ctx.user = u!;
}

/** Called after a transaction is saved: moves onboarding to the reminder step. */
export async function afterFirstTransaction(ctx: BotContext, s: BotServices): Promise<void> {
  if (ctx.user?.onboardingStep !== 'first_tx') return;
  await setUser(s, ctx, { onboardingStep: 'reminder' });
  const lang = ctx.user.language;
  const kb = new InlineKeyboard();
  for (const time of REMINDER_TIMES) kb.text(time, `ob:r:${time.replace(':', '')}`);
  kb.row().text(t(lang, 'reminderOff'), 'ob:r:off');
  await ctx.reply(t(lang, 'askReminder'), { reply_markup: kb });
}

export function registerOnboarding(bot: Bot<BotContext>, s: BotServices): void {
  // Daily reminder answer: "no spending today" counts as activity (TZ §32).
  bot.callbackQuery(/^ns:([0-9a-f-]{36})$/, async (ctx) => {
    const ok = await markNoSpendingToday(s.db, ctx.user!.id, ctx.match[1]!, s.now());
    await ctx.answerCallbackQuery();
    if (ok) await ctx.editMessageText(t(ctx.user!.language, 'noSpendDone'));
    else await ctx.editMessageReplyMarkup({ reply_markup: new InlineKeyboard() }).catch(() => {});
  });

  // Debtor turned off reminders sent on behalf of other users' debts.
  bot.callbackQuery('dro:off', async (ctx) => {
    await optOutOfDebtorReminders(s.db, ctx.user!.id);
    await ctx.answerCallbackQuery();
    await ctx.editMessageReplyMarkup({ reply_markup: new InlineKeyboard() }).catch(() => {});
    await ctx.reply(t(ctx.user!.language, 'debtorOptedOut'));
  });

  bot.command('start', async (ctx) => {
    const user = ctx.user!;
    await s.db.insert(schema.analyticsEvents).values({ userId: user.id, name: 'start' });
    if (user.onboardingCompletedAt) {
      await sendMenu(ctx, s, t(user.language, 'welcomeBack'));
      return;
    }
    await setUser(s, ctx, { onboardingStep: 'language' });
    // New users see the 1-minute how-to video first, then the language picker.
    await sendGuideVideo(ctx, s);
    const kb = new InlineKeyboard();
    for (const [code, label] of LANGS) kb.text(label, `ob:l:${code}`);
    await ctx.reply(t(user.language, 'welcome'), { reply_markup: kb });
  });

  bot.callbackQuery(/^ob:l:(uz_latn|uz_cyrl|ru)$/, async (ctx) => {
    const lang = ctx.match[1] as Language;
    const done = !!ctx.user!.onboardingCompletedAt;
    await setUser(s, ctx, { language: lang, ...(done ? {} : { onboardingStep: 'currency' }) });
    await ctx.answerCallbackQuery();
    if (done) {
      await ctx.editMessageText(t(lang, 'settingsSaved'));
      await sendMenu(ctx, s); // button labels follow the new language
      return;
    }
    await ctx.editMessageText(t(lang, 'askCurrency'), {
      reply_markup: new InlineKeyboard().text(t(lang, 'currencyUzs'), 'ob:c:UZS').text(t(lang, 'currencyUsd'), 'ob:c:USD'),
    });
  });

  bot.callbackQuery(/^ob:c:(UZS|USD)$/, async (ctx) => {
    await setUser(s, ctx, {
      currency: ctx.match[1] as 'UZS' | 'USD',
      ...(ctx.user!.onboardingCompletedAt ? {} : { onboardingStep: 'first_tx' }),
    });
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(t(ctx.user!.language, 'askFirstTx'));
  });

  bot.callbackQuery(/^ob:r:(2000|2100|2200|off)$/, async (ctx) => {
    const choice = ctx.match[1]!;
    const first = !ctx.user!.onboardingCompletedAt;
    await setUser(s, ctx, {
      ...(choice === 'off'
        ? { remindersEnabled: false }
        : { remindersEnabled: true, reminderTime: `${choice.slice(0, 2)}:${choice.slice(2)}` }),
      onboardingStep: null,
      onboardingCompletedAt: ctx.user!.onboardingCompletedAt ?? s.now(),
    });
    if (first) await s.db.insert(schema.analyticsEvents).values({ userId: ctx.user!.id, name: 'onboarding_completed' });
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(t(ctx.user!.language, first ? 'onboardingDone' : 'settingsSaved'));
    if (first) await sendMenu(ctx, s);
  });
}
