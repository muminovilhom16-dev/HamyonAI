import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import ExcelJS from 'exceljs';
import { schema } from '@hamyon/db';
import { renderCsv, renderXlsx } from '../src/export';
import { runMaintenance } from '../src/maintenance';
import { createHarness, type Harness } from './harness';

let H: Harness;
beforeAll(async () => { H = await createHarness(); });
afterAll(async () => H?.close());
beforeEach(() => {
  H.reset();
  H.clock.now = new Date('2026-10-05T10:00:00Z');
});

let next = 140_000;
async function newUser() {
  const id = next++;
  await H.send(id, '/start');
  await H.h.db.update(schema.users).set({ onboardingStep: null, onboardingCompletedAt: new Date() }).where(eq(schema.users.telegramId, id));
  H.reset();
  return id;
}
const buttons = () => H.lastKeyboard().flat();
const button = (re: RegExp) => buttons().find((b) => re.test(b.text))!.callback_data!;
const fileData = (call: { payload: Record<string, any> }) => Buffer.from(call.payload.document.fileData as Uint8Array);

describe('/eksport (TZ §31)', () => {
  it('range → format → xlsx document with TZ columns', async () => {
    const id = await newUser();
    await H.send(id, 'taksi 25 ming');
    await H.send(id, 'oylik tushdi 6 mln');
    await H.send(id, '=HYPERLINK("x") 10 ming');
    H.reset();
    await H.send(id, '/eksport');
    await H.tap(id, button(/Bu oy/));
    await H.tap(id, button(/Excel/));
    const doc = H.calls.find((c) => c.method === 'sendDocument')!;
    expect(doc.payload.caption).toBe('Hamyon AI eksport: 3 ta yozuv');
    expect(doc.payload.document.filename).toBe('hamyon-2026-10-01_2026-10-05.xlsx');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(fileData(doc) as never);
    const ws = wb.worksheets[0]!;
    expect(ws.getRow(1).values).toEqual([undefined, 'sana', 'tur', 'summa', 'valyuta', 'kategoriya', 'izoh', 'kim kiritgan', "summa (so'm)", 'kim bilan']);
    expect(ws.getRow(2).getCell(2).value).toBe('xarajat');
    expect(ws.getRow(2).getCell(3).value).toBe(25_000);
    expect(ws.getRow(3).getCell(2).value).toBe('daromad');
  });

  it('xlsx neutralizes formula injection in text cells', async () => {
    const buf = await renderXlsx(
      [{ date: '2026-10-01', time: '10:00', type: 'expense', amount: 1, currency: 'UZS', amountUzs: 1, category: null, note: '=HYPERLINK("http://x")', counterparty: '+cmd', enteredBy: null }],
      'uz_latn',
    );
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as never);
    const row = wb.worksheets[0]!.getRow(2);
    expect(row.getCell(6).value).toBe('\'=HYPERLINK("http://x")');
    expect(row.getCell(9).value).toBe("'+cmd");
  });

  it('csv works and empty ranges say so', async () => {
    const id = await newUser();
    await H.send(id, '/eksport');
    await H.tap(id, button(/O'tgan oy/));
    await H.tap(id, button(/CSV/));
    expect(H.texts().at(-1)).toBe("Bu davrda yozuv yo'q.");
  });

  it('csv: BOM, quoting, injection guard', () => {
    const csv = renderCsv(
      [{ date: '2026-10-01', time: '10:00', type: 'expense', amount: 25_000, currency: 'UZS', amountUzs: 25_000, category: 'Oziq-ovqat', note: 'non, "sut"', counterparty: null, enteredBy: '@x' }],
      'uz_latn',
    ).toString('utf8');
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('2026-10-01 10:00,xarajat,25000,UZS,Oziq-ovqat,"non, ""sut""",\'@x,25000,');
  });
});

describe('/sozlamalar and account deletion (TZ §40)', () => {
  it('shows settings; delete needs confirmation; cancel restores', async () => {
    const id = await newUser();
    await H.send(id, '/sozlamalar');
    expect(H.texts()[0]).toBe("⚙️ Sozlamalar\n\nTil: O'zbekcha\nKunlik eslatma: 21:00\nValyuta: UZS");
    await H.tap(id, 'acc:del');
    expect(H.texts().at(-1)).toContain('7 kundan keyin');
    await H.tap(id, 'acc:no');
    let [u] = await H.h.db.select().from(schema.users).where(eq(schema.users.telegramId, id));
    expect(u!.deletionRequestedAt).toBeNull();

    await H.tap(id, 'acc:del');
    await H.tap(id, 'acc:yes');
    expect(H.texts().at(-1)).toBe("Akkaunt 12-oktabr kuni butunlay o'chiriladi. Web paneldan chiqarildingiz.");
    // Everything else is paused until cancelled.
    H.reset();
    await H.send(id, 'taksi 20 ming');
    expect(H.texts()[0]).toContain("o'chirilishi rejalashtirilgan");
    [u] = await H.h.db.select().from(schema.users).where(eq(schema.users.telegramId, id));
    expect(await H.h.db.select().from(schema.transactions).where(eq(schema.transactions.userId, u!.id))).toHaveLength(0);
    await H.tap(id, 'acc:cancel');
    expect(H.texts().at(-1)).toBe('✅ Akkaunt saqlab qolindi.');
    await H.send(id, 'taksi 20 ming');
    expect(H.texts().at(-1)).toContain('20 000');
  });

  it('maintenance removes the account after the grace period', async () => {
    const id = await newUser();
    await H.send(id, 'taksi 20 ming');
    await H.send(id, '/sozlamalar');
    await H.tap(id, 'acc:del');
    await H.tap(id, 'acc:yes');
    const r = await runMaintenance(H.h.db, new Date('2026-10-13T10:00:00Z'), 7);
    expect(r.deletedAccounts).toBeGreaterThanOrEqual(1);
    expect(await H.h.db.select().from(schema.users).where(eq(schema.users.telegramId, id))).toHaveLength(0);
  });
});

describe('web export & deletion', () => {
  async function login(tg: number) {
    await H.send(tg, '/web');
    const token = decodeURIComponent(/token=(\S+)/.exec(H.texts().at(-1)!)![1]!);
    const res = await H.app.inject(`/auth/web?token=${encodeURIComponent(token)}`);
    return res.cookies.find((c) => c.name === 'hamyon_session')!.value;
  }

  it('downloads csv/xlsx with attachment headers', async () => {
    const id = await newUser();
    await H.send(id, 'taksi 25 ming');
    const cookie = await login(id);
    const csv = await H.app.inject({ url: '/api/export?format=csv&start=2026-10-01&end=2026-10-31', cookies: { hamyon_session: cookie } });
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.headers['content-disposition']).toBe('attachment; filename="hamyon-2026-10-01_2026-10-31.csv"');
    expect(csv.body).toContain('xarajat,25000,UZS,Transport');
    const xlsx = await H.app.inject({ url: '/api/export?format=xlsx', cookies: { hamyon_session: cookie } });
    expect(xlsx.rawPayload.subarray(0, 2).toString()).toBe('PK');
  });

  it('delete requires explicit confirm, signs out, and shows the schedule', async () => {
    const id = await newUser();
    const cookie = await login(id);
    const post = (url: string, body: object, c = cookie) =>
      H.app.inject({ method: 'POST', url, payload: body, cookies: { hamyon_session: c }, headers: { 'x-hamyon-csrf': '1' } });
    expect((await post('/api/account/delete', {})).statusCode).toBe(400);
    expect((await post('/api/account/delete', { confirm: true })).statusCode).toBe(202);
    expect((await H.app.inject({ url: '/api/settings', cookies: { hamyon_session: cookie } })).statusCode).toBe(401);
    // The bot does not hand out new login links until the deletion is cancelled.
    H.reset();
    await H.send(id, '/web');
    expect(H.texts()[0]).toContain("o'chirilishi rejalashtirilgan");
    expect(H.texts()[0]).not.toContain('token=');
  });
});
