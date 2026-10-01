/**
 * Calendar helpers in the user's IANA time zone (default Asia/Tashkent, UTC+5).
 * Dates are `YYYY-MM-DD` strings in local time; instants are UTC Dates.
 */

export function localDate(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant);
}

/** Offset of `timeZone` from UTC at `instant`, in minutes. */
function offsetMinutes(instant: Date, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
      .formatToParts(instant)
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(+parts.year!, +parts.month! - 1, +parts.day!, +parts.hour!, +parts.minute!, +parts.second!);
  return Math.round((asUtc - instant.getTime()) / 60_000);
}

/** UTC instant of local `date` at `hh:mm` in `timeZone`. */
export function zonedInstant(date: string, timeZone: string, hh = 0, mm = 0): Date {
  const guess = new Date(`${date}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00Z`);
  const off = offsetMinutes(guess, timeZone);
  return new Date(guess.getTime() - off * 60_000);
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export type Period = 'day' | 'week' | 'month';

/** [from, to) instants for the period containing `now` (weeks start Monday). */
export function periodRange(period: Period, now: Date, timeZone: string): { from: Date; to: Date; startDate: string; endDate: string } {
  const today = localDate(now, timeZone);
  let start = today;
  let endExclusive = addDays(today, 1);
  if (period === 'week') {
    const dow = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7; // Monday = 0
    start = addDays(today, -dow);
    endExclusive = addDays(start, 7);
  } else if (period === 'month') {
    start = `${today.slice(0, 7)}-01`;
    const d = new Date(`${start}T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + 1);
    endExclusive = d.toISOString().slice(0, 10);
  }
  return {
    from: zonedInstant(start, timeZone),
    to: zonedInstant(endExclusive, timeZone),
    startDate: start,
    endDate: addDays(endExclusive, -1),
  };
}

/** Instant to store for a parsed date: now if it is today, else local noon. */
export function occurredAtFor(date: string, now: Date, timeZone: string): Date {
  return date === localDate(now, timeZone) ? now : zonedInstant(date, timeZone, 12, 0);
}
