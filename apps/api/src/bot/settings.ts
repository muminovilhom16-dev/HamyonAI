import { InlineKeyboard, InputFile, type Bot } from 'grammy';
import {
  addDays,
  cancelAccountDeletion,
  deletionDate,
  exportTransactions,
  localDate,
  requestAccountDeletion,
  type User,
} from '@hamyon/core';
import { schema } from '@hamyon/db';
import { renderCsv, renderXlsx } from '../export';
import { formatDay } from '../format';
import { t, tf } from '../i18n';
import type { BotContext, BotServices } from './context';

const LANG_NAMES = { uz_latn: "O'zbekcha", uz_cyrl: 'Ўзбекча', ru: 'Русский' } as const;

function settingsText(u: User): string {
  const l = u.language;
  const reminder = u.remindersEnabled ? u.reminderTime.slice(0, 5) : t(l, 'off');
  return [
    t(l, 'settingsTitle'),
    '',
    `${t(l, 'settingsLanguage')}: ${LANG_NAMES[l]}`,
    `${t(l, 'settingsReminder')}: ${reminder}`,
    `${t(l, 'settingsCurrency')}: ${u.currency}`,
  ].join('\n');
}

export function pendingDeletionMessage(s: BotServices, u: User) {
  const date = formatDay(localDate(deletionDate(u.deletionRequestedAt!, s.deletionGraceDays), u.timezone), u.language);
  return {
    text: tf(u.language, 'deletePending', { date }),
    reply_markup: new InlineKeyboard().text(t(u.language, 'deleteCancel'), 'acc:cancel'),
  };
}

function exportRange(range: 'm' | 'p' | 'a', today: string): { startDate?: string; endDate?: string } {
  const monthStart = `${today.slice(0, 7)}-01`;
  if (range === 'm') return { startDate: monthStart, endDate: today };
  if (range === 'p') {
    const prevEnd = addDays(monthStart, -1);
    return { startDate: `${prevEnd.slice(0, 7)}-01`, endDate: prevEnd };
  }
  return {};
}

export function registerSettings(bot: Bot<BotContext>, s: BotServices): void {
  bot.command('sozlamalar', async (ctx) => {
    const u = ctx.user!;
    await ctx.reply(settingsText(u), {
      reply_markup: new InlineKeyboard()
        .text(t(u.language, 'btnLanguage'), 'st:lang')
        .text(t(u.language, 'btnReminder'), 'st:rem')
        .row()
        .text(t(u.language, 'btnExport'), 'st:exp')
        .row()
        .text(t(u.language, 'btnDeleteAccount'), 'acc:del'),
    });
  });

  bot.callbackQuery('st:lang', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply(t(ctx.user!.language, 'settingsLanguage'), {
      reply_markup: new InlineKeyboard().text("O'zbekcha", 'ob:l:uz_latn').text('Ўзбекча', 'ob:l:uz_cyrl').text('Русский', 'ob:l:ru'),
    });
  });

  bot.callbackQuery('st:rem', async (ctx) => {
    const l = ctx.user!.language;
    await ctx.answerCallbackQuery();
    await ctx.reply(t(l, 'askReminder'), {
      reply_markup: new InlineKeyboard().text('20:00', 'ob:r:2000').text('21:00', 'ob:r:2100').text('22:00', 'ob:r:2200').row().text(t(l, 'reminderOff'), 'ob:r:off'),
    });
  });

  // ─── Export (TZ §31): range, then format ───
  const askRange = async (ctx: BotContext) => {
    const l = ctx.user!.language;
    await ctx.reply(t(l, 'exportPickRange'), {
      reply_markup: new InlineKeyboard().text(t(l, 'rangeThisMonth'), 'ex:r:m').text(t(l, 'rangePrevMonth'), 'ex:r:p').text(t(l, 'rangeAll'), 'ex:r:a'),
    });
  };
  bot.command('eksport', askRange);
  bot.callbackQuery('st:exp', async (ctx) => {
    await ctx.answerCallbackQuery();
    await askRange(ctx);
  });

  bot.callbackQuery(/^ex:r:([mpa])$/, async (ctx) => {
    const r = ctx.match[1]!;
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(t(ctx.user!.language, 'exportPickFormat'), {
      reply_markup: new InlineKeyboard().text('Excel (.xlsx)', `ex:f:${r}:xlsx`).text('CSV', `ex:f:${r}:csv`),
    });
  });

  bot.callbackQuery(/^ex:f:([mpa]):(csv|xlsx)$/, async (ctx) => {
    const u = ctx.user!;
    await ctx.answerCallbackQuery();
    const range = exportRange(ctx.match[1] as 'm' | 'p' | 'a', localDate(s.now(), u.timezone));
    const rows = await exportTransactions(s.db, { userId: u.id, walletId: ctx.walletId!, timeZone: u.timezone, language: u.language, ...range });
    if (rows.length === 0) {
      await ctx.editMessageText(t(u.language, 'exportEmpty'));
      return;
    }
    const format = ctx.match[2] as 'csv' | 'xlsx';
    const data = format === 'csv' ? renderCsv(rows, u.language) : await renderXlsx(rows, u.language);
    const name = `hamyon-${range.startDate ?? 'all'}${range.endDate ? `_${range.endDate}` : ''}.${format}`;
    await ctx.replyWithDocument(new InputFile(data, name), { caption: tf(u.language, 'exportCaption', { count: String(rows.length) }) });
  });

  // ─── Account deletion (TZ §40) ───
  bot.callbackQuery('acc:del', async (ctx) => {
    const l = ctx.user!.language;
    await ctx.answerCallbackQuery();
    await ctx.reply(tf(l, 'deleteConfirm', { days: String(s.deletionGraceDays) }), {
      reply_markup: new InlineKeyboard().text(t(l, 'deleteYes'), 'acc:yes').text(t(l, 'deleteNo'), 'acc:no'),
    });
  });

  bot.callbackQuery('acc:no', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(t(ctx.user!.language, 'deleteAborted'));
  });

  bot.callbackQuery('acc:yes', async (ctx) => {
    const u = ctx.user!;
    const at = await requestAccountDeletion(s.db, u.id, s.now());
    await s.db.insert(schema.analyticsEvents).values({ userId: u.id, name: 'account_deletion_requested' });
    const date = formatDay(localDate(deletionDate(at, s.deletionGraceDays), u.timezone), u.language);
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(tf(u.language, 'deleteScheduled', { date }), {
      reply_markup: new InlineKeyboard().text(t(u.language, 'deleteCancel'), 'acc:cancel'),
    });
  });

  bot.callbackQuery('acc:cancel', async (ctx) => {
    await cancelAccountDeletion(s.db, ctx.user!.id, s.now());
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(t(ctx.user!.language, 'deleteCancelled'));
  });
}
