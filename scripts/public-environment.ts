const publicNames = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'VITE_GOOGLE_MAPS_API_KEY',
  'VITE_GOOGLE_MAPS_MAP_ID',
  'VITE_WEB_PUSH_PUBLIC_KEY',
] as const;

type Environment = Record<string, string | undefined>;

export function privateEnvironmentValues(env: Environment) {
  return Object.entries(env)
    .filter(
      ([name, value]) =>
        !name.startsWith('VITE_') &&
        /SECRET|PRIVATE_KEY|SERVICE_ROLE|ENCRYPTION_KEY|ACCESS_TOKEN|PASSWORD|^CF_.*TOKEN|^CLOUDFLARE_.*TOKEN/i.test(
          name,
        ) &&
        value &&
        value.length >= 8,
    )
    .map(([, value]) => value!);
}

function legacyRole(value: string) {
  const parts = value.split('.');
  if (
    parts.length !== 3 ||
    parts.some((part) => !/^[a-zA-Z0-9_-]+$/.test(part))
  )
    return undefined;
  try {
    return JSON.parse(Buffer.from(parts[1]!, 'base64url').toString('utf8'))
      ?.role as unknown;
  } catch {
    return undefined;
  }
}

export function validatePublicEnvironment(
  env: Environment,
  requireSupabase = false,
) {
  const privateValues = privateEnvironmentValues(env);
  for (const [name, value] of Object.entries(env)) {
    if (!name.startsWith('VITE_') || !value) continue;
    if (!publicNames.some((allowed) => name === allowed))
      throw new Error(
        'Hay una variable VITE_ fuera de la lista de configuración pública.',
      );
    if (
      value.startsWith('sb_secret_') ||
      legacyRole(value) === 'service_role' ||
      privateValues.some((secret) => value.includes(secret))
    )
      throw new Error(
        'La configuración pública contiene una credencial privada.',
      );
  }

  const url = env.VITE_SUPABASE_URL?.trim();
  const key = env.VITE_SUPABASE_ANON_KEY?.trim();
  if (requireSupabase || url || key) {
    const endpoint = URL.canParse(url ?? '') ? new URL(url!) : null;
    const local =
      endpoint &&
      ['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname);
    if (
      !endpoint ||
      (endpoint.protocol !== 'https:' &&
        !(local && endpoint.protocol === 'http:')) ||
      endpoint.username ||
      endpoint.password ||
      endpoint.pathname !== '/' ||
      endpoint.search ||
      endpoint.hash ||
      !key ||
      (!/^sb_publishable_[a-zA-Z0-9_-]+$/.test(key) &&
        legacyRole(key) !== 'anon')
    )
      throw new Error('Configura la URL y una clave pública de Supabase.');
  }
}
