import type { Session, User } from '@supabase/supabase-js';
import { db } from '@/lib/db';
import { cacheWithAccountWriteLock } from '@/features/sync/account-write-lock';
import { supabase } from '@/lib/supabase';

export type OfflineUser = {
  id: string;
  email?: string;
  email_confirmed_at?: string;
};
async function fingerprint(token: string) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(token),
  );
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
export async function rememberVerifiedSession(session: Session, user: User) {
  if (!user.email_confirmed_at || !session.expires_at) return;
  const token_hash = await fingerprint(session.access_token);
  await cacheWithAccountWriteLock(user.id, async () => {
    const current = await supabase?.auth.getSession();
    if (current?.data.session?.access_token !== session.access_token) return;
    await db.offline_sessions.put({
      owner_id: user.id,
      token_hash,
      expires_at: session.expires_at!,
      user: {
        id: user.id,
        email: user.email,
        email_confirmed_at: user.email_confirmed_at,
      },
    });
  });
}
export async function offlineIdentity(
  session: Session | null,
): Promise<(OfflineUser & { validUntil: number }) | null> {
  if (!session?.expires_at || session.expires_at * 1000 <= Date.now())
    return null;
  const saved = await db.offline_sessions.get(session.user.id);
  if (
    !saved?.user.email_confirmed_at ||
    saved.expires_at * 1000 <= Date.now() ||
    saved.token_hash !== (await fingerprint(session.access_token))
  )
    return null;
  return {
    ...saved.user,
    validUntil: Math.min(saved.expires_at, session.expires_at) * 1000,
  };
}
