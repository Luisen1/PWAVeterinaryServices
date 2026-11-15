import { supabase } from '@/lib/supabase';
import { PRIVACY_POLICY_VERSION } from '@/features/auth/schemas';
import { acquireReloadBlock } from '@/pwa/reload-safety';
import { clearRecoveryAccess } from '@/features/auth/recovery-access';
import { rememberAuthReturn } from '@/features/auth/return-to';

export function authClient() {
  if (!supabase)
    throw new Error(
      'Configura las variables públicas de Supabase para utilizar tu cuenta.',
    );
  return supabase;
}

export async function withAuthOperation<Result>(
  operation: () => Promise<Result>,
): Promise<Result> {
  const release = acquireReloadBlock('autenticación');
  try {
    return await operation();
  } finally {
    release();
  }
}

export function authRedirect(
  type: 'signup' | 'recovery',
  destination?: string,
) {
  const url = new URL('/auth/confirmar', window.location.origin);
  url.searchParams.set('tipo', type);
  if (type === 'signup') rememberAuthReturn(destination ?? null);
  return url.toString();
}

export async function registerAccount(
  email: string,
  password: string,
  destination?: string,
) {
  return withAuthOperation(async () => {
    const { data, error } = await authClient().auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: authRedirect('signup', destination),
        data: {
          privacy_accepted: true,
          privacy_policy_version: PRIVACY_POLICY_VERSION,
        },
      },
    });
    if (error) throw error;
    return data;
  });
}

export async function loginAccount(email: string, password: string) {
  return withAuthOperation(async () => {
    clearRecoveryAccess();
    const { error } = await authClient().auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
  });
}

export async function requestPasswordRecovery(email: string) {
  return withAuthOperation(async () => {
    const { error } = await authClient().auth.resetPasswordForEmail(email, {
      redirectTo: authRedirect('recovery'),
    });
    if (error) throw error;
  });
}

export async function resendConfirmation(email: string, destination?: string) {
  return withAuthOperation(async () => {
    const { error } = await authClient().auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: authRedirect('signup', destination) },
    });
    if (error) throw error;
  });
}
