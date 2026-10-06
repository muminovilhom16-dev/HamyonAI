import { existsSync } from 'node:fs';
import { InlineKeyboard, InputFile, type Bot } from 'grammy';
import { t } from '../i18n';
import type { BotContext, BotServices } from './context';

/**
 * Sends the 1-minute how-to video (apps/api/assets/guide.mp4). The first send
 * uploads the file; Telegram's file_id is then reused, so later sends are
 * instant. Never throws: a failed video must not block onboarding.
 */
export async function sendGuideVideo(ctx: BotContext, s: BotServices): Promise<void> {
  const g = s.guideVideo;
  if (!g) return;
  try {
    const lang = ctx.user!.language;
    let video: string | InputFile;
    let thumbnail: InputFile | undefined;
    if (g.fileId) {
      video = g.fileId;
    } else {
      if (!existsSync(g.path)) return;
      await ctx.replyWithChatAction('upload_video').catch(() => {});
      video = new InputFile(g.path);
      if (existsSync(g.thumbnail)) thumbnail = new InputFile(g.thumbnail);
    }
    const msg = await ctx.replyWithVideo(video, {
      caption: t(lang, 'guideCaption'),
      supports_streaming: true,
      width: 720,
      height: 1280,
      duration: 60,
      ...(thumbnail && { thumbnail }),
    });
    const fileId = (msg as { video?: { file_id?: string } } | undefined)?.video?.file_id;
    if (fileId) g.fileId = fileId;
  } catch (err) {
    s.log.warn({ err: err instanceof Error ? err.message : 'error' }, 'guide video not sent');
  }
}

/** Help → «🎬 Video qo‘llanma» button. */
export function guideOfferKeyboard(lang: Parameters<typeof t>[0]): InlineKeyboard {
  return new InlineKeyboard().text(t(lang, 'guideButton'), 'guide:play');
}

export function registerGuide(bot: Bot<BotContext>, s: BotServices): void {
  bot.callbackQuery('guide:play', async (ctx) => {
    await ctx.answerCallbackQuery();
    await sendGuideVideo(ctx, s);
  });
}
