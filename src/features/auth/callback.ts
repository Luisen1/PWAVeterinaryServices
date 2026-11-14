import { authClient, withAuthOperation } from '@/features/auth/api';
import { grantRecoveryAccess } from '@/features/auth/recovery-access';

let pending: { search: string; result: Promise<string> } | null = null;

export function completeAuthCallback(search: string): Promise<string> {
  if (pending?.search === search) return pending.result;
  const result = withAuthOperation(async () => {
    const params = new URLSearchParams(search);
    if (params.has('error') || params.has('error_code'))
      throw new Error('Enlace inválido.');
    const client = authClient();
    const code = params.get('code');
    const tokenHash = params.get('token_hash');
    const type = params.get('type');
    const recovery = params.get('tipo') === 'recovery' || type === 'recovery';
    const response = code
      ? await client.auth.exchangeCodeForSession(code)
      : tokenHash &&
          (type === 'signup' || type === 'recovery' || type === 'email')
        ? await client.auth.verifyOtp({ token_hash: tokenHash, type })
        : null;
    if (!response || response.error || !response.data.session)
      throw response?.error ?? new Error('Enlace inválido.');
    if (recovery) {
      grantRecoveryAccess(
        response.data.session.user.id,
        response.data.session.expires_at ?? 0,
      );
      return '/restablecer-clave';
    }
    return '/cuenta?aviso=correo-confirmado';
  });
  pending = { search, result };
  void result
    .finally(() => {
      pending = null;
    })
    .catch(() => undefined);
  return result;
}
