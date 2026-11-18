import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Notice } from '@/features/directory/Workspace';
import { useOnline } from '@/pwa/useOnline';
import {
  notificationPreferences,
  notificationPreferencesSchema,
  saveNotificationPreferences,
  type NotificationPreferences as Preferences,
} from './inbox-api';

export function NotificationPreferences({ owner }: { owner: string }) {
  const online = useOnline();
  const query = useQuery({
    queryKey: ['notification-preferences', owner],
    queryFn: () => notificationPreferences(),
    enabled: online,
    retry: false,
  });
  return (
    <section className="sv-card space-y-4">
      <h2 className="font-semibold">Avisos y plazo de recordatorio</h2>
      <p className="text-sm">
        Estas preferencias se aplican a tu cuenta en todos los dispositivos. Los
        cambios y mensajes permanecen en la bandeja aunque desactives su push.
      </p>
      {!online ? (
        <Notice>Conéctate para consultar o cambiar tus preferencias.</Notice>
      ) : query.isPending ? (
        <Notice>Cargando preferencias…</Notice>
      ) : query.isError ? (
        <>
          <Notice error>No pudimos consultar tus preferencias.</Notice>
          <button
            className="button button-secondary"
            onClick={() => void query.refetch()}
          >
            Reintentar preferencias
          </button>
        </>
      ) : (
        <PreferencesForm
          key={JSON.stringify(query.data)}
          initial={query.data}
          owner={owner}
          online={online}
          onSaved={() => void query.refetch()}
        />
      )}
    </section>
  );
}
function PreferencesForm({
  initial,
  owner,
  online,
  onSaved,
}: {
  initial: Preferences;
  owner: string;
  online: boolean;
  onSaved: () => void;
}) {
  const [value, setValue] = useState(initial);
  const action = useMutation({
    mutationFn: () => saveNotificationPreferences(owner, value),
    onSuccess: onSaved,
  });
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        action.mutate();
      }}
    >
      {(['changes', 'messages', 'reminders'] as const).map((name, index) => (
        <label key={name} className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={value[name]}
            onChange={(event) =>
              setValue({ ...value, [name]: event.target.checked })
            }
          />
          {
            [
              'Push de cambios de citas',
              'Push de mensajes nuevos',
              'Recordatorios de citas confirmadas',
            ][index]
          }
        </label>
      ))}
      <label className="block" htmlFor="notification-reminder-minutes">
        Recordarme antes de la cita
      </label>
      <select
        id="notification-reminder-minutes"
        className="sv-input mt-2"
        value={value.reminder_minutes}
        onChange={(event) =>
          setValue({
            ...value,
            reminder_minutes:
              notificationPreferencesSchema.shape.reminder_minutes.parse(
                Number(event.target.value),
              ),
          })
        }
      >
        <option value={15}>15 minutos</option>
        <option value={30}>30 minutos</option>
        <option value={60}>1 hora</option>
        <option value={120}>2 horas</option>
        <option value={1440}>1 día</option>
      </select>
      <p className="text-sm">
        El nuevo plazo se aplica a recordatorios que aún no se han procesado. Si
        la cita se confirma con menos antelación, se intenta en el siguiente
        ciclo antes de su inicio. El aviso depende de tu conexión y del
        navegador.
      </p>
      <button
        className="button button-primary"
        disabled={!online || action.isPending}
      >
        Guardar preferencias
      </button>
      {action.isError && <Notice error>{action.error.message}</Notice>}
      {action.isSuccess && <Notice>Preferencias guardadas.</Notice>}
    </form>
  );
}
