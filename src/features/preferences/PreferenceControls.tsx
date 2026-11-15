import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation } from 'react-router';
import { authWithReturn } from '@/features/auth/return-to';
import { useOnline } from '@/pwa/useOnline';
import { acquireReloadBlock } from '@/pwa/reload-safety';
import { dataError } from '@/features/directory/api';
import { Notice, secondaryClass } from '@/features/directory/Workspace';
import { Icon } from '@/components/ui/Icon';
import {
  blankPreference,
  saveLocalPreference,
  syncPreferences,
  resolvePreference,
} from './store';
import { usePreferences, usePreferenceUser } from './usePreferences';

export function FavoriteButton({
  establishmentId,
}: {
  establishmentId: string;
}) {
  const user = usePreferenceUser();
  const rows = usePreferences(user?.id);
  const location = useLocation();
  const online = useOnline();
  const cache = useQueryClient();
  const preference = rows.data?.find(
    (p) => p.establishment_id === establishmentId,
  );
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  const mutation = useMutation({
    networkMode: 'always',
    mutationFn: (favorite: boolean) =>
      saveLocalPreference(user!.id, establishmentId, { favorite }),
    onMutate: setOptimistic,
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: ['preferences', user?.id] });
      if (online) void syncPreferences(user!.id).catch(() => undefined);
    },
    onSettled: () => setOptimistic(null),
  });
  if (!user)
    return (
      <Link
        className={secondaryClass}
        to={authWithReturn('/acceso', location.pathname + location.search)}
      >
        <Icon name="heart" />
        Acceder para guardar favorito
      </Link>
    );
  const selected = optimistic ?? preference?.favorite ?? false;
  return (
    <div className="space-y-1">
      <button
        className={secondaryClass}
        aria-pressed={selected}
        disabled={mutation.isPending}
        onClick={() => mutation.mutate(!selected)}
      >
        <Icon name="heart" />
        {selected ? 'Quitar de favoritos' : 'Guardar favorito'}
      </button>
      {preference?.pending && (
        <span className="block text-xs text-amber-900">
          Pendiente de sincronizar
        </span>
      )}
      {mutation.isError && <Notice error>{dataError(mutation.error)}</Notice>}
    </div>
  );
}
export function PreferencePanel({
  establishmentId,
}: {
  establishmentId: string;
}) {
  const user = usePreferenceUser();
  if (!user)
    return (
      <section className="sv-card">
        <h2 className="font-semibold">Favoritos y notas privadas</h2>
        <FavoriteButton establishmentId={establishmentId} />
      </section>
    );
  return (
    <PrivatePanel
      key={`${user.id}:${establishmentId}`}
      owner={user.id}
      establishmentId={establishmentId}
    />
  );
}
function PrivatePanel({
  owner,
  establishmentId,
}: {
  owner: string;
  establishmentId: string;
}) {
  const cache = useQueryClient();
  const online = useOnline();
  const rows = usePreferences(owner);
  const preference =
    rows.data?.find((p) => p.establishment_id === establishmentId) ??
    blankPreference(owner, establishmentId);
  const [draft, setDraft] = useState({
    base: preference.note,
    value: preference.note,
  });
  const [message, setMessage] = useState('');
  const note =
    draft.base !== preference.note && draft.value === draft.base
      ? preference.note
      : draft.value;
  const dirty = note !== preference.note;
  useEffect(() => {
    if (!dirty) return;
    const release = acquireReloadBlock('nota privada sin guardar');
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => {
      release();
      window.removeEventListener('beforeunload', warn);
    };
  }, [dirty]);
  const save = useMutation({
    networkMode: 'always',
    mutationFn: () => saveLocalPreference(owner, establishmentId, { note }),
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: ['preferences', owner] });
      setDraft({ base: note, value: note });
      setMessage('Nota guardada en este dispositivo.');
      if (online) void syncPreferences(owner).catch(() => undefined);
    },
  });
  const sync = useMutation({ mutationFn: () => syncPreferences(owner) });
  const resolve = useMutation({
    mutationFn: (keep: boolean) =>
      resolvePreference(owner, establishmentId, keep),
    onSuccess: () => setMessage('Conflicto resuelto.'),
  });
  return (
    <section
      className="sv-card space-y-4"
      aria-label="Favoritos y nota privada"
    >
      <h2 className="font-semibold">Favorito y nota privada</h2>
      <FavoriteButton establishmentId={establishmentId} />
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          setMessage('');
          save.mutate();
        }}
      >
        <label className="block text-sm">
          Mi nota privada
          <textarea
            className="sv-input"
            maxLength={2000}
            rows={4}
            value={note}
            onChange={(e) =>
              setDraft({ base: preference.note, value: e.target.value })
            }
          />
        </label>
        <p className="text-xs">
          Solo tu cuenta puede consultarla. {note.length}/2000 caracteres.
        </p>
        <button
          className="button button-primary"
          disabled={save.isPending || !dirty}
        >
          Guardar nota privada
        </button>
      </form>
      {message && <Notice>{message}</Notice>}
      {preference.pending && (
        <Notice>
          {preference.conflict
            ? 'Cambió en otro dispositivo. Conservamos tu nota local; elige qué versión utilizar.'
            : 'Pendiente de sincronizar. Tus cambios están guardados localmente.'}
        </Notice>
      )}
      {preference.pending && !preference.conflict && (
        <button
          className={secondaryClass}
          disabled={!online || sync.isPending}
          onClick={() => sync.mutate()}
        >
          Sincronizar favorito y nota
        </button>
      )}
      {preference.conflict && (
        <div className="flex flex-wrap gap-2">
          <button
            className={secondaryClass}
            disabled={!online || resolve.isPending || dirty}
            onClick={() => resolve.mutate(true)}
          >
            Conservar mis cambios
          </button>
          <button
            className={secondaryClass}
            disabled={!online || resolve.isPending || dirty}
            onClick={() => resolve.mutate(false)}
          >
            Usar datos del servidor
          </button>
        </div>
      )}
      {(save.isError || sync.isError || resolve.isError || rows.isError) && (
        <Notice error>
          {dataError(save.error ?? sync.error ?? resolve.error ?? rows.error)}
        </Notice>
      )}
      {!online && (
        <p className="text-xs">
          Sin conexión: puedes seguir editando mientras tu sesión local sea
          válida.
        </p>
      )}
    </section>
  );
}
