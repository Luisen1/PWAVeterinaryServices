import type { Site } from './model';

export interface Opening {
  state: 'open' | 'closed' | 'unknown';
  label: string;
  allDay: boolean;
  reason: string;
}
const minutes = (time: string) =>
  /^([01]\d|2[0-3]):[0-5]\d$/.test(time)
    ? Number(time.slice(0, 2)) * 60 + Number(time.slice(3))
    : NaN;
export function declared24Hours(site: Site) {
  return (
    Array.isArray(site.hours) &&
    site.hours.length === 7 &&
    new Set(site.hours.map((h) => h.day)).size === 7 &&
    site.hours.every(
      (h) =>
        h.day >= 0 &&
        h.day <= 6 &&
        h.next_day === true &&
        Number.isFinite(minutes(h.open)) &&
        h.open === h.close &&
        h.open === site.hours[0]?.open,
    )
  );
}
export function openingAt(site: Site, now: Date, trusted = true): Opening {
  const allDay = declared24Hours(site);
  const unknown = (reason: string): Opening => ({
    state: 'unknown',
    label: 'Horario sin verificar',
    allDay,
    reason,
  });
  if (!trusted)
    return unknown(
      'Sin conexión o sin consulta reciente. Confirma la apertura por teléfono.',
    );
  if (
    !Array.isArray(site.hours) ||
    !site.hours.length ||
    !Array.isArray(site.exceptions)
  )
    return unknown(
      'No hay un horario declarado que permita verificar apertura.',
    );
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: site.timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(now);
    const get = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((p) => p.type === type)?.value ?? '';
    const date = `${get('year')}-${get('month')}-${get('day')}`;
    const day = new Date(`${date}T12:00:00Z`).getUTCDay();
    const previous = new Date(
      new Date(`${date}T12:00:00Z`).getTime() - 86400000,
    )
      .toISOString()
      .slice(0, 10);
    const minute = Number(get('hour')) * 60 + Number(get('minute'));
    const todayException = site.exceptions.find((e) => e.date === date);
    if (todayException?.closed)
      return {
        state: 'closed',
        label: 'Cerrado por excepción',
        allDay,
        reason: `${date} · ${site.timezone}`,
      };
    const interval = (when: string, weekday: number) => {
      const exception = site.exceptions.find((e) => e.date === when);
      return exception
        ? exception.closed
          ? undefined
          : exception
        : site.hours.find((h) => h.day === weekday);
    };
    const current = interval(date, day);
    const yesterday = todayException
      ? undefined
      : interval(previous, (day + 6) % 7);
    for (const h of [current, yesterday])
      if (
        h &&
        (!Number.isFinite(minutes(h.open)) ||
          !Number.isFinite(minutes(h.close)) ||
          typeof h.next_day !== 'boolean' ||
          (h.next_day ? h.close > h.open : h.close <= h.open))
      )
        return unknown('El horario declarado no es válido.');
    const open =
      (!!current &&
        (current.next_day
          ? minute >= minutes(current.open)
          : minute >= minutes(current.open) &&
            minute < minutes(current.close))) ||
      (!!yesterday?.next_day && minute < minutes(yesterday.close));
    return {
      state: open ? 'open' : 'closed',
      label: open ? 'Abierto según horario' : 'Cerrado según horario',
      allDay,
      reason: `${site.timezone}. La apertura no garantiza disponibilidad profesional; confirma por teléfono.`,
    };
  } catch {
    return unknown('No se pudo interpretar la zona horaria o la fecha.');
  }
}
