import { createHash, createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyTelegramLogin } from '../src/auth';

const TOKEN = '123456:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const NOW = new Date('2026-10-01T10:00:00Z');

export function signTelegramLogin(token: string, data: Record<string, string | number>) {
  const dcs = Object.entries(data).map(([k, v]) => `${k}=${v}`).sort().join('\n');
  const hash = createHmac('sha256', createHash('sha256').update(token).digest()).update(dcs).digest('hex');
  return { ...data, hash };
}

const fresh = () => ({ id: 42, first_name: 'Ilhom', username: 'ilhom', auth_date: Math.floor(NOW.getTime() / 1000) - 60 });

describe('verifyTelegramLogin', () => {
  it('accepts a correctly signed, recent payload', () => {
    expect(verifyTelegramLogin(TOKEN, signTelegramLogin(TOKEN, fresh()), NOW)).toMatchObject({ id: 42 });
  });

  it('rejects tampered fields, wrong token, extra fields and bad hashes', () => {
    const signed = signTelegramLogin(TOKEN, fresh());
    expect(verifyTelegramLogin(TOKEN, { ...signed, id: 43 }, NOW)).toBeNull();
    expect(verifyTelegramLogin('999:BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB', signed, NOW)).toBeNull();
    expect(verifyTelegramLogin(TOKEN, { ...signed, admin: true }, NOW)).toBeNull();
    expect(verifyTelegramLogin(TOKEN, { ...signed, hash: 'x' }, NOW)).toBeNull();
    expect(verifyTelegramLogin(TOKEN, { ...fresh() }, NOW)).toBeNull();
  });

  it('rejects stale payloads (replay window 24h)', () => {
    const old = signTelegramLogin(TOKEN, { ...fresh(), auth_date: Math.floor(NOW.getTime() / 1000) - 90_000 });
    expect(verifyTelegramLogin(TOKEN, old, NOW)).toBeNull();
  });
});
