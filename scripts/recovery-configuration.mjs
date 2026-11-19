export function recoveryServerConfiguration(env) {
  const names = ['RECOVERY_WORKER_SECRET', 'RECOVERY_ENCRYPTION_KEY'];
  if (names.every((name) => !env[name])) return {};
  if (names.some((name) => !/^[a-f0-9]{64}$/i.test(env[name] ?? '')))
    throw new Error(
      'Completa el par de recuperación de 32 bytes; no se cargan valores parciales.',
    );
  if (env.RECOVERY_WORKER_SECRET === env.RECOVERY_ENCRYPTION_KEY)
    throw new Error(
      'La credencial de operación y la clave de cifrado deben ser distintas.',
    );
  for (const [name, value] of Object.entries(env))
    if (
      name.startsWith('VITE_') &&
      names.some((secret) => value.includes(env[secret]))
    )
      throw new Error(
        'Una variable pública contiene una clave privada de recuperación.',
      );
  return Object.fromEntries(names.map((name) => [name, env[name]]));
}
