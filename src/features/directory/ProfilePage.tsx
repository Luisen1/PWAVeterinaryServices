import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useZodForm } from '@/lib/forms';
import { authClient, withAuthOperation } from '@/features/auth/api';
import { AuthField } from '@/features/auth/components/AuthField';
import { submitClass } from '@/features/auth/components/AuthFrame';
import { useOnline } from '@/pwa/useOnline';
import {
  enqueueAccountChange,
  syncPendingAccountChanges,
} from '@/features/sync/account-sync';
import { withAccountWriteLock } from '@/features/sync/account-write-lock';
import { db } from '@/lib/db';
import {
  petSchema,
  profileSchema,
  species,
  type Pet,
  type Profile,
} from './model';
import { dataError } from './api';
import {
  cardClass,
  fieldClass,
  Notice,
  secondaryClass,
  Verified,
  Workspace,
} from './Workspace';

export function ProfilePage() {
  return (
    <Workspace
      title="Perfil y mascotas"
      description="Actualiza tus datos y registra las mascotas que podrás seleccionar al agendar."
    >
      <Verified>{(userId) => <ProfileContent userId={userId} />}</Verified>
    </Workspace>
  );
}
function ProfileContent({ userId }: { userId: string }) {
  const online = useOnline();
  const client = useQueryClient();
  const [editing, setEditing] = useState<Pet | null>(null);
  const [petFormVersion, setPetFormVersion] = useState(0);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const profile = useQuery({
    queryKey: ['profile', userId],
    enabled: online,
    queryFn: async ({ signal }) => {
      const { data, error } = await authClient()
        .from('profiles')
        .select('id,display_name,phone')
        .eq('id', userId)
        .abortSignal(signal)
        .single();
      if (error) throw error;
      return data as Profile;
    },
  });
  const pets = useQuery({
    queryKey: ['pets', userId],
    enabled: online,
    queryFn: async ({ signal }) => {
      const { data, error } = await authClient()
        .from('pets')
        .select('*')
        .eq('owner_id', userId)
        .order('created_at')
        .abortSignal(signal);
      if (error) throw error;
      return data as Pet[];
    },
  });
  const pending = useQuery({
    queryKey: ['account-pending', userId],
    queryFn: () =>
      db.outbox
        .where('owner_id')
        .equals(userId)
        .filter((r) => r.status !== 'completed')
        .count(),
  });
  async function refresh() {
    await Promise.all([
      client.invalidateQueries({ queryKey: ['profile', userId] }),
      client.invalidateQueries({ queryKey: ['pets', userId] }),
      client.invalidateQueries({ queryKey: ['account-pending', userId] }),
    ]);
  }
  const sync = useMutation({
    mutationFn: () => syncPendingAccountChanges(userId),
    onSettled: refresh,
  });
  const deletion = useMutation({
    mutationFn: (id: string) =>
      withAccountWriteLock(userId, () =>
        withAuthOperation(async () => {
          const queued = await db.outbox
            .where('owner_id')
            .equals(userId)
            .filter((r) => r.entity_id === id && r.status !== 'completed')
            .count();
          if (queued)
            throw new Error(
              'Sincroniza primero los cambios pendientes de esta mascota.',
            );
          const { error } = await authClient()
            .from('pets')
            .delete()
            .eq('id', id)
            .eq('owner_id', userId)
            .select('id')
            .single();
          if (error) throw error;
        }),
      ),
    onSuccess: async () => {
      setDeleteId(null);
      setEditing(null);
      await refresh();
    },
  });
  return (
    <div className="space-y-6">
      {!!pending.data && (
        <div className={cardClass}>
          <Notice>
            Hay {pending.data} cambio(s) pendiente(s) de confirmar. Los datos
            del servidor se muestran debajo.
          </Notice>
          <button
            className={secondaryClass}
            disabled={!online || sync.isPending}
            onClick={() => sync.mutate()}
          >
            Sincronizar pendientes
          </button>
          {sync.isError && <Notice error>{dataError(sync.error)}</Notice>}
        </div>
      )}
      {profile.isError && (
        <div className={cardClass}>
          <Notice error>{dataError(profile.error)}</Notice>
          <button
            className={secondaryClass}
            disabled={!online}
            onClick={() => void profile.refetch()}
          >
            Reintentar perfil
          </button>
        </div>
      )}
      {profile.isPending && online && <Notice>Cargando perfil…</Notice>}
      {profile.data && (
        <ProfileForm
          key={userId}
          userId={userId}
          profile={profile.data}
          onSaved={refresh}
        />
      )}
      <section className={cardClass}>
        <h2 className="text-xl font-semibold">Mis mascotas</h2>
        {pets.isPending && online && <Notice>Cargando mascotas…</Notice>}
        {pets.isError && (
          <div>
            <Notice error>{dataError(pets.error)}</Notice>
            <button
              className={secondaryClass}
              onClick={() => void pets.refetch()}
              disabled={!online}
            >
              Reintentar
            </button>
          </div>
        )}
        {pets.data?.length === 0 && (
          <p className="text-sm text-stone-600">
            Todavía no tienes mascotas registradas.
          </p>
        )}
        {pets.data?.map((pet) => (
          <div
            key={pet.id}
            className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 pb-4"
          >
            <div>
              <p className="font-semibold">{pet.name}</p>
              <p className="text-sm text-stone-600">{pet.species}</p>
            </div>
            <div className="flex gap-2">
              <button
                className={secondaryClass}
                onClick={() => {
                  setEditing(pet);
                  setPetFormVersion((v) => v + 1);
                }}
              >
                Editar {pet.name}
              </button>
              <button
                className={secondaryClass}
                disabled={!online || deletion.isPending}
                onClick={() => setDeleteId(pet.id)}
              >
                Eliminar {pet.name}
              </button>
            </div>
          </div>
        ))}
        {deleteId && (
          <div
            role="alertdialog"
            aria-label="Eliminar mascota"
            className="space-y-3 rounded-xl bg-amber-50 p-4"
          >
            <p>¿Eliminar esta mascota de tu perfil?</p>
            <button
              className={secondaryClass}
              disabled={deletion.isPending}
              onClick={() => setDeleteId(null)}
            >
              Cancelar eliminación
            </button>
            <button
              className={`${secondaryClass} ml-2`}
              disabled={deletion.isPending || !online}
              onClick={() => deletion.mutate(deleteId)}
            >
              Confirmar eliminación
            </button>
          </div>
        )}
        {deletion.isError && <Notice error>{dataError(deletion.error)}</Notice>}
        <PetForm
          key={`${editing?.id ?? 'new'}-${petFormVersion}`}
          userId={userId}
          pet={editing}
          onSaved={async () => {
            setEditing(null);
            setPetFormVersion((v) => v + 1);
            await refresh();
          }}
          onCancel={() => {
            setEditing(null);
            setPetFormVersion((v) => v + 1);
          }}
          onQueued={refresh}
        />
      </section>
    </div>
  );
}
function ProfileForm({
  userId,
  profile,
  onSaved,
}: {
  userId: string;
  profile: Profile;
  onSaved: () => Promise<void>;
}) {
  const online = useOnline();
  const form = useZodForm(profileSchema, {
    defaultValues: { display_name: profile.display_name, phone: profile.phone },
  });
  const mutation = useMutation({
    mutationFn: async (values: { display_name: string; phone: string }) => {
      await enqueueAccountChange(userId, userId, 'profile.update', values);
      await syncPendingAccountChanges(userId);
    },
    onSettled: onSaved,
  });
  return (
    <form
      className={cardClass}
      noValidate
      onSubmit={(event) =>
        void form.handleSubmit((values) => mutation.mutate(values))(event)
      }
    >
      <h2 className="text-xl font-semibold">Mis datos</h2>
      <AuthField
        label="Nombre de visualización"
        required
        autoComplete="name"
        {...form.register('display_name')}
        error={form.formState.errors.display_name?.message}
      />
      <AuthField
        label="Teléfono personal (opcional)"
        autoComplete="tel"
        type="tel"
        {...form.register('phone')}
        error={form.formState.errors.phone?.message}
      />
      {mutation.isSuccess && <Notice>Perfil guardado.</Notice>}
      {mutation.isError && (
        <Notice error>
          {dataError(mutation.error)} El cambio queda pendiente para
          reintentarlo.
        </Notice>
      )}
      <button className={submitClass} disabled={mutation.isPending || !online}>
        {mutation.isPending ? 'Guardando…' : 'Guardar perfil'}
      </button>
    </form>
  );
}
function PetForm({
  userId,
  pet,
  onSaved,
  onCancel,
  onQueued,
}: {
  userId: string;
  pet: Pet | null;
  onSaved: () => Promise<void>;
  onCancel: () => void;
  onQueued: () => Promise<void>;
}) {
  const online = useOnline();
  const [id] = useState(() => pet?.id ?? crypto.randomUUID());
  const form = useZodForm(petSchema, {
    defaultValues: { name: pet?.name ?? '', species: pet?.species ?? 'Perro' },
  });
  const mutation = useMutation({
    mutationFn: async (values: { name: string; species: Pet['species'] }) => {
      await enqueueAccountChange(userId, id, 'pet.save', { id, ...values });
      await syncPendingAccountChanges(userId);
    },
    onSuccess: onSaved,
    onSettled: onQueued,
  });
  return (
    <form
      noValidate
      className="space-y-4 border-t border-stone-200 pt-5"
      onSubmit={(event) =>
        void form.handleSubmit((values) => mutation.mutate(values))(event)
      }
    >
      <h3 className="font-semibold">
        {pet ? 'Editar mascota' : 'Añadir mascota'}
      </h3>
      <AuthField
        label="Nombre de la mascota"
        required
        {...form.register('name')}
        error={form.formState.errors.name?.message}
      />
      <label className="block text-sm font-medium">
        Especie
        <select
          aria-label="Especie"
          className={`${fieldClass} mt-2`}
          {...form.register('species')}
        >
          {species.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </label>
      {mutation.isError && (
        <Notice error>
          {dataError(mutation.error)} La operación se conserva para reintentar.
        </Notice>
      )}
      <button className={submitClass} disabled={mutation.isPending || !online}>
        {mutation.isPending
          ? 'Guardando…'
          : pet
            ? 'Guardar mascota'
            : 'Registrar mascota'}
      </button>
      {pet && (
        <button type="button" className={secondaryClass} onClick={onCancel}>
          Cancelar edición
        </button>
      )}
    </form>
  );
}
