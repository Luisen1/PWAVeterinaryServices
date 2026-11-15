// Conserva únicamente rutas públicas propias. Nunca acepta un destino externo.
export function safeReturnTo(value: string | null) {
  if (!value || value.length > 2000 || /[\\\r\n]/.test(value)) return '/cuenta';
  try {
    const url = new URL(value, 'https://pwa.invalid');
    if (
      !value.startsWith('/') ||
      url.origin !== 'https://pwa.invalid' ||
      !/^\/(explorar|favoritos|establecimientos\/[0-9a-f-]{36})$/.test(
        url.pathname,
      )
    )
      return '/cuenta';
    return url.pathname + url.search;
  } catch {
    return '/cuenta';
  }
}
export function authWithReturn(
  path: '/acceso' | '/registro',
  destination: string,
) {
  const target = safeReturnTo(destination);
  return target === '/cuenta'
    ? path
    : `${path}?${new URLSearchParams({ continuar: target })}`;
}

const returnKey = 'veterinary.public-return';
// Solo el destino público, nunca el origen del visitante. Mantiene la URL de
// confirmación autorizada y permite abrir el correo en otra pestaña del mismo origen.
export function rememberAuthReturn(value: string | null) {
  try {
    const target = safeReturnTo(value);
    if (target === '/cuenta') localStorage.removeItem(returnKey);
    else
      localStorage.setItem(
        returnKey,
        JSON.stringify({ target, expires: Date.now() + 3600000 }),
      );
  } catch {
    /* El bloqueo de almacenamiento no debe impedir crear la cuenta. */
  }
}
export function consumeAuthReturn() {
  try {
    const raw = localStorage.getItem(returnKey);
    localStorage.removeItem(returnKey);
    const stored: unknown = raw ? JSON.parse(raw) : null;
    if (
      !stored ||
      typeof stored !== 'object' ||
      !('target' in stored) ||
      typeof stored.target !== 'string' ||
      !('expires' in stored) ||
      typeof stored.expires !== 'number' ||
      stored.expires <= Date.now()
    )
      return '/cuenta';
    return safeReturnTo(stored.target);
  } catch {
    return '/cuenta';
  }
}
