import type { Bot } from 'grammy';
import { AIUnavailableError } from '@hamyon/ai';
import { checkMonthlyLimit, logAIUsage, maskCardNumbers } from '@hamyon/core';
import { schema } from '@hamyon/db';
import { t, tf } from '../i18n';
import type { BotContext, BotServices } from './context';
import { processText } from './flows';

/** Below this provider confidence the transcript is not trusted (never guess). */
export const MIN_STT_CONFIDENCE = 0.5;

/**
 * TZ §5/§57: voice → speech-to-text → the same text pipeline → confirmation
 * card showing what was heard. Audio is processed in memory only and never
 * stored.
 */
export function registerVoice(bot: Bot<BotContext>, s: BotServices): void {
  bot.on('message:voice', async (ctx) => {
    const user = ctx.user!;
    const lang = user.language;
    const voice = ctx.message.voice;

    if (!s.speech) {
      await ctx.reply(t(lang, 'voiceUnavailable'));
      return;
    }
    if (voice.duration > s.voiceMaxSeconds) {
      await ctx.reply(tf(lang, 'voiceTooLong', { max: String(s.voiceMaxSeconds) }));
      return;
    }
    // Plan limit for voice; text is never limited (TZ §35).
    const limit = await checkMonthlyLimit(s.db, {
      userId: user.id, plan: user.plan, timeZone: user.timezone, now: s.now(), feature: 'voicePerMonth', plans: s.plans,
    });
    if (!limit.allowed) {
      await s.db.insert(schema.analyticsEvents).values({ userId: user.id, name: 'limit_reached', props: { feature: 'voice', limit: limit.limit } });
      await ctx.reply(tf(lang, 'voiceLimitReached', { limit: String(limit.limit) }));
      return;
    }

    await ctx.replyWithChatAction('typing').catch(() => {});
    let text: string;
    let confidence: number;
    try {
      const file = await ctx.getFile();
      if (!file.file_path) throw new AIUnavailableError('api_error');
      const audio = await s.downloadFile(file.file_path);
      const out = await s.speech.transcribe({
        audio,
        encoding: 'OGG_OPUS',
        sampleRateHertz: 48000,
        languages: lang === 'ru' ? ['ru-RU', 'uz-UZ'] : ['uz-UZ', 'ru-RU'],
      });
      text = out.text;
      confidence = out.confidence;
      await logAIUsage(s.db, user.id, 'stt', out.usage, text.length > 0);
    } catch (err) {
      if (err instanceof AIUnavailableError && err.usage) await logAIUsage(s.db, user.id, 'stt', err.usage, false);
      s.log.warn({ sttError: err instanceof AIUnavailableError ? err.reason : 'unexpected' }, 'voice transcription failed');
      await ctx.reply(t(lang, 'voiceFailed'));
      return;
    }

    if (!text || (confidence > 0 && confidence < MIN_STT_CONFIDENCE)) {
      await ctx.reply(t(lang, 'voiceNotUnderstood'));
      return;
    }
    // Card numbers are masked before the transcript is shown or stored.
    await processText(ctx, s, maskCardNumbers(text), 'voice');
  });
}

/** Default Telegram file downloader (bounded size, timeout; URL holds the token, never logged). */
export function telegramFileDownloader(token: string, apiRoot = 'https://api.telegram.org', maxBytes = 5_000_000) {
  return async (filePath: string): Promise<Uint8Array> => {
    const res = await fetch(`${apiRoot}/file/bot${token}/${filePath}`, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new AIUnavailableError('api_error');
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength > maxBytes) throw new AIUnavailableError('bad_output');
    return buf;
  };
}
