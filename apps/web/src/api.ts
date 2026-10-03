/** Thin client. All financial numbers come from the server (TZ rule 5). */
export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(code);
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers: {
      ...(body !== undefined && { 'content-type': 'application/json' }),
      ...(method !== 'GET' && { 'x-hamyon-csrf': '1' }),
    },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
  if (res.status === 204) return undefined as T;
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (json as { error?: string }).error ?? 'error');
  return json as T;
}

export const api = {
  get: <T>(url: string) => request<T>('GET', url),
  patch: <T>(url: string, body: unknown) => request<T>('PATCH', url, body),
  put: <T>(url: string, body: unknown) => request<T>('PUT', url, body),
  post: <T>(url: string, body?: unknown) => request<T>('POST', url, body ?? {}),
  del: (url: string) => request<void>('DELETE', url),
};

export type Lang = 'uz_latn' | 'uz_cyrl' | 'ru';
export type Currency = 'UZS' | 'USD';
export type TxType = 'expense' | 'income' | 'debt_given' | 'debt_taken' | 'debt_return';

export interface Settings {
  displayName: string | null;
  language: Lang;
  currency: Currency;
  timezone: string;
  reminderTime: string;
  remindersEnabled: boolean;
  deletionScheduledFor: string | null;
  deletionGraceDays: number;
}

export interface Dashboard {
  range: { startDate: string; endDate: string };
  expenseUzs: number;
  incomeUzs: number;
  balanceUzs: number | null;
  debts: { owedToMe: Array<{ currency: Currency; amount: number }>; iOwe: Array<{ currency: Currency; amount: number }> };
  byCategory: Array<{ categoryId: string | null; name: string; icon: string | null; totalUzs: number; percentTenths: number }>;
  daily: Array<{ date: string; expenseUzs: number; incomeUzs: number }>;
  insights: { dailyAverageUzs: number; forecastUzs: number | null; prevSamePeriodUzs: number; changePct: number | null } | null;
}

export interface Tx {
  id: string;
  type: TxType;
  amount: number;
  currency: Currency;
  amountUzs: number;
  categoryId: string | null;
  categoryName: string | null;
  categoryIcon: string | null;
  categoryPending: boolean;
  note: string | null;
  counterparty: string | null;
  date: string;
  time: string;
  source: string;
}

export interface Category { id: string; name: string; kind: 'expense' | 'income'; icon: string | null; hidden?: boolean; custom?: boolean }

export interface DebtGroup {
  counterparty: string;
  direction: 'given' | 'taken';
  currency: Currency;
  remaining: number;
  total: number;
  nearestDue: string | null;
  debts: Array<{ id: string; total: number; remaining: number; dueDate: string | null; createdDate: string; payments: Array<{ amount: number; date: string }> }>;
}

export interface Budget { id: string; categoryId: string | null; name: string | null; icon: string | null; limitUzs: number; spentUzs: number }

export interface Recurring {
  id: string; categoryId: string | null; categoryName: string | null; categoryIcon: string | null;
  amount: number; currency: Currency; note: string; dayOfMonth: number; nextDate: string;
}

export interface Goal {
  id: string; name: string; targetAmount: number; currency: Currency; savedAmount: number;
  targetDate: string | null; completed: boolean; perMonth: number | null;
}
