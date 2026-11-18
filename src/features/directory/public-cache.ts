import { db } from '@/lib/db';
import { directoryBundleValue } from './offline-directory';

export interface PublicResult<T> {
  value: T;
  fromCache: boolean;
  savedAt: string | null;
}
export async function publicResult<T>(
  key: string,
  online: boolean,
  fetcher: () => Promise<T>,
  empty: T,
): Promise<PublicResult<T>> {
  if (online) {
    try {
      const value = await fetcher();
      const savedAt = new Date().toISOString();
      try {
        await db.public_snapshots.put({ key, saved_at: savedAt, data: value });
      } catch {
        /* La consulta online no depende del almacenamiento. */
      }
      return { value, fromCache: false, savedAt };
    } catch (error) {
      const snapshot =
        (await directoryBundleValue(key).catch(() => undefined)) ??
        (await db.public_snapshots.get(key).catch(() => undefined));
      if (!snapshot) throw error;
      return {
        value: snapshot.data as T,
        fromCache: true,
        savedAt: snapshot.saved_at,
      };
    }
  }
  const snapshot =
    (await directoryBundleValue(key).catch(() => undefined)) ??
    (await db.public_snapshots.get(key).catch(() => undefined));
  return {
    value: snapshot ? (snapshot.data as T) : empty,
    fromCache: true,
    savedAt: snapshot?.saved_at ?? null,
  };
}
