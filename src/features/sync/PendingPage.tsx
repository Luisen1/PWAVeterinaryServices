import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { Notice, Verified, Workspace } from '@/features/directory/Workspace';
import { useOnline } from '@/pwa/useOnline';
import { authClient } from '@/features/auth/api';
import { authWithReturn } from '@/features/auth/return-to';
import { useAuth } from '@/features/auth/useAuth';
import { requestPersistentStorage } from '@/pwa/storage';
import { syncForeground, retryAppointmentChange } from './pending-store';
import { pendingFailure } from './local-owner';
import {
  requestDraftSchema,
  sendRequestDraft,
  discardRequestDraft,
} from '@/features/appointments/request-store';
import { changeSchema } from '@/features/appointments/requests-model';
import { removeChangeDraft } from '@/features/appointments/change-store';
import { slotLabel } from '@/features/appointments/model';
import { removeAvailabilityDraft } from '@/features/appointments/api';
import {
  sendTextDraft,
  discardTextDraft,
} from '@/features/messaging/text-store';
import {
  sendMediaDraft,
  discardMediaDraft,
} from '@/features/messaging/media-store';
import { PreferencePanel } from '@/features/preferences/PreferenceControls';
import { flushCallFailures } from '@/features/calls/failures';
import type { PreferenceRecord } from '@/lib/db/schema';
import { useRefreshAppointments } from '@/features/appointments/requests-api';
import { usePending } from './usePending';

export function PendingPage() {
  return (
    <Workspace
      title="Pendientes y sincronización"
      description="Revisa lo guardado en este dispositivo y decide qué enviar o conservar."
    >
      <p>
        La sincronización funciona con la aplicación abierta. No depende de
        Background Sync. Si tu sesión venció, accede con la misma cuenta para
        recuperar tus pendientes.
      </p>
      <Link
        className="button button-secondary"
        to={authWithReturn('/acceso', '/cuenta/pendientes')}
      >
        Revalidar acceso con la misma cuenta
      </Link>
      <Verified allowOffline>
        {(owner) => <PendingContent key={owner} owner={owner} />}
      </Verified>
    </Workspace>
  );
}
function PendingContent({ owner }: { owner: string }) {
  const online = useOnline(),
    client = useQueryClient(),
    query = usePending(owner);
  const [notice, setNotice] = useState('');
  const refreshAppointments = useRefreshAppointments();
  const action = useMutation({
    networkMode: 'always',
    mutationFn: async (run: () => Promise<unknown>) => {
      setNotice('');
      return run();
    },
    onSuccess: () => {
      setNotice(
        'Operación completada. Revisa los pendientes y el estado del servidor.',
      );
      void client.invalidateQueries({ queryKey: ['pending-center', owner] });
      void refreshAppointments();
      void client.invalidateQueries({ queryKey: ['chat-history', owner] });
    },
  });
  const run = (callback: () => Promise<unknown>) => action.mutate(callback);
  const value = query.data;
  if (query.isError)
    return (
      <Notice error>
        No pudimos leer los pendientes. Se conservan en el dispositivo. Revalida
        tu sesión con la misma cuenta y vuelve a abrir esta pantalla.
      </Notice>
    );
  if (!value) return <Notice>Consultando pendientes locales…</Notice>;
  const count =
    value.preferences.length +
    value.requests.length +
    value.changes.length +
    value.availability.length +
    value.texts.length +
    value.media.length +
    value.calls.length;
  const accountOperations = value.operations.filter(
    (r) => r.action === 'profile.update' || r.action === 'pet.save',
  );
  const unknown = value.operations.filter(
    (r) =>
      ![
        'profile.update',
        'pet.save',
        'preference.save',
        'chat.message',
        'availability.draft',
        'appointment.request',
        'appointment.change',
      ].includes(r.action),
  );
  return (
    <div className="space-y-5">
      <Notice>
        Las citas guardadas son borradores pendientes. No reservan cupos ni
        están confirmadas. Los mensajes preparados tampoco se envían al
        reconectar: confirma su envío o sincroniza los que ya habías autorizado.
      </Notice>
      <div className="flex flex-wrap gap-3">
        <button
          className="button button-primary"
          disabled={!online || action.isPending}
          onClick={() =>
            run(async () => {
              const result = await syncForeground(owner);
              if (result.needsReview)
                throw new Error(
                  `La sincronización terminó con ${result.needsReview} grupo(s) o mensaje(s) que requieren revisión. Los datos se conservan.`,
                );
            })
          }
        >
          Sincronizar perfil, favoritos y mensajes autorizados
        </button>
        <button
          className="button button-secondary"
          onClick={() => void query.refetch()}
        >
          Actualizar pendientes
        </button>
        <button
          className="button button-secondary"
          onClick={() =>
            void requestPersistentStorage().then((granted) =>
              setNotice(
                granted
                  ? 'El navegador concedió almacenamiento persistente.'
                  : 'El navegador decide si conserva los datos. Evita borrar el almacenamiento del sitio.',
              ),
            )
          }
        >
          Solicitar conservación del almacenamiento
        </button>
      </div>
      {!count && !accountOperations.length && !unknown.length && (
        <Notice>No hay pendientes locales de esta cuenta.</Notice>
      )}
      {unknown.map((operation) => (
        <Notice key={operation.operation_id}>
          Hay un pendiente de otra versión o funcionalidad. Se conserva sin
          enviarlo ni marcarlo como completado.
        </Notice>
      ))}
      {accountOperations.map((operation) => (
        <article className="sv-card" key={operation.operation_id}>
          <h2 className="font-semibold">
            {operation.action === 'pet.save'
              ? 'Mascota pendiente'
              : 'Perfil pendiente'}
          </h2>
          <p>{operation.last_error ?? 'Guardado en la cola local.'}</p>
          <Link className="underline" to="/perfil">
            Revisar perfil
          </Link>
        </article>
      ))}
      {value.preferences.map((preference) => (
        <section key={preference.id}>
          <PreferenceComparison preference={preference} />
          <PreferencePanel establishmentId={preference.establishment_id} />
        </section>
      ))}
      {value.requests.map((row) => {
        const draft = requestDraftSchema.parse(row.data);
        return (
          <article key={row.id} className="sv-card space-y-3">
            <h2 className="font-semibold">
              Borrador pendiente de solicitud · {draft.service_name}
            </h2>
            <p>
              {draft.site_name} ·{' '}
              {new Date(draft.args.p_start).toLocaleString('es-CO', {
                timeZone: draft.timezone,
              })}{' '}
              · {draft.timezone}
            </p>
            <p>
              {draft.conflict
                ? 'Conflicto: revisa el horario antes de intentar otro envío.'
                : draft.attempted
                  ? 'No se confirmó la respuesta del envío. Reintentar consulta el mismo identificador.'
                  : 'Sin enviar al servidor. No es una reserva.'}
            </p>
            {draft.error && <p role="alert">{draft.error}</p>}
            <div className="flex flex-wrap gap-3">
              <button
                className="button button-primary"
                disabled={!online || action.isPending}
                onClick={() =>
                  run(() => sendRequestDraft(owner, draft.args.p_service))
                }
              >
                Revalidar y enviar solicitud guardada
              </button>
              <Link
                className="button button-secondary"
                to={`/citas?${new URLSearchParams({ servicio: draft.args.p_service, ...(draft.establishment_id ? { establecimiento: draft.establishment_id } : {}), ...(draft.site_id ? { sede: draft.site_id } : {}), ...(draft.date ? { fecha: draft.date } : {}) })}`}
              >
                Consultar otro horario
              </Link>
              <button
                className="button button-secondary"
                disabled={action.isPending}
                onClick={() =>
                  run(() => discardRequestDraft(owner, draft.args.p_service))
                }
              >
                Descartar copia local de la solicitud
              </button>
            </div>
            <p className="text-xs">
              Descartar no cancela una solicitud que el servidor ya hubiera
              recibido. Revisa Mis citas y solicitudes si el resultado fue
              incierto.
            </p>
          </article>
        );
      })}
      {value.changes.map((row) => {
        const args = changeSchema.parse(row.data),
          operation = value.operations.find(
            (o) => o.operation_id === args.p_operation,
          );
        return (
          <article className="sv-card space-y-3" key={row.id}>
            <h2 className="font-semibold">Cambio de cita pendiente</h2>
            <p>{args.p_reason}</p>
            <p>
              {operation?.last_error ??
                'La cita remota conserva su estado hasta que se confirme el cambio.'}
            </p>
            <Link className="underline" to={`/citas/solicitudes/${args.p_id}`}>
              Revisar cita y conflicto
            </Link>
            <div className="flex flex-wrap gap-3">
              <button
                className="button button-primary"
                disabled={!online || action.isPending}
                onClick={() => run(() => retryAppointmentChange(owner, row.id))}
              >
                Reintentar cambio guardado
              </button>
              <button
                className="button button-secondary"
                disabled={action.isPending}
                onClick={() => run(() => removeChangeDraft(owner, args.p_id))}
              >
                Descartar cambio local
              </button>
            </div>
          </article>
        );
      })}
      {value.availability.map((draft) => (
        <article key={draft.id} className="sv-card space-y-3">
          <h2 className="font-semibold">
            Borrador de horario · {draft.service_name}
          </h2>
          <p>
            {draft.site_name} · {slotLabel(draft.slot)}
          </p>
          <p>No reserva ni solicita una cita.</p>
          <Link
            className="button button-secondary"
            to={`/citas?establecimiento=${draft.establishment_id}&sede=${draft.site_id}&servicio=${draft.service_id}&fecha=${draft.date}`}
          >
            Consultar de nuevo y elegir mascota
          </Link>
          <button
            className="button button-secondary"
            disabled={action.isPending}
            onClick={() => run(() => removeAvailabilityDraft(owner, draft.id))}
          >
            Descartar borrador de horario
          </button>
        </article>
      ))}
      {value.texts.map((row) => {
        const data = row.data as {
          conversation: string;
          body: string;
          ready: boolean;
          error: string | null;
          attempted: boolean;
        };
        return (
          <article key={row.id} className="sv-card space-y-3">
            <h2 className="font-semibold">
              {data.ready
                ? 'Mensaje pendiente de envío'
                : 'Borrador de mensaje'}
            </h2>
            <p className="whitespace-pre-wrap break-words">{data.body}</p>
            {data.error && <p>{data.error}</p>}
            <Link
              className="button button-secondary"
              to={`/mensajes/${data.conversation}`}
            >
              Revisar conversación y texto
            </Link>
            {data.ready && (
              <button
                className="button button-primary"
                disabled={!online || action.isPending}
                onClick={() =>
                  run(() => sendTextDraft(owner, data.conversation))
                }
              >
                Reintentar mensaje autorizado
              </button>
            )}
            <button
              className="button button-secondary"
              disabled={action.isPending}
              onClick={() =>
                run(() => discardTextDraft(owner, data.conversation))
              }
            >
              Descartar copia local del mensaje
            </button>
          </article>
        );
      })}
      {value.media.map((row) => (
        <article key={row.id} className="sv-card space-y-3">
          <h2 className="font-semibold">Foto o audio pendiente</h2>
          <p>
            Archivo privado · {Math.ceil(row.file.size / 1024)} KB. Revisa su
            vista previa en la conversación.
          </p>
          <Link className="underline" to={`/mensajes/${row.entity_id}`}>
            Revisar adjunto
          </Link>
          <div className="flex flex-wrap gap-3">
            <button
              className="button button-primary"
              disabled={!online || action.isPending}
              onClick={() => run(() => sendMediaDraft(owner, row.id))}
            >
              Enviar archivo pendiente
            </button>
            <button
              className="button button-secondary"
              disabled={action.isPending}
              onClick={() => run(() => discardMediaDraft(owner, row.id))}
            >
              Descartar archivo pendiente
            </button>
          </div>
        </article>
      ))}
      {!!value.calls.length && (
        <article className="sv-card">
          <p>
            {value.calls.length} incidencia(s) de llamada pendiente(s) de
            registrar.
          </p>
          <button
            className="button button-secondary"
            disabled={!online || action.isPending}
            onClick={() => run(() => flushCallFailures(owner))}
          >
            Reintentar registro de incidencias
          </button>
        </article>
      )}
      {action.isError && (
        <Notice error>
          {action.error instanceof Error
            ? action.error.message
            : pendingFailure(action.error).message}
        </Notice>
      )}
      {notice && <Notice>{notice}</Notice>}
    </div>
  );
}
function PreferenceComparison({
  preference: p,
}: {
  preference: PreferenceRecord;
}) {
  const online = useOnline();
  const query = useQuery({
    queryKey: [
      'preference-conflict-preview',
      p.owner_id,
      p.establishment_id,
      p.remote_revision,
    ],
    enabled: online && p.conflict,
    queryFn: async () => {
      const { data, error } = await authClient()
        .from('establishment_preferences')
        .select('note,favorite,revision')
        .eq('owner_id', p.owner_id)
        .eq('establishment_id', p.establishment_id)
        .maybeSingle();
      if (error) throw error;
      return data as {
        note: string;
        favorite: boolean;
        revision: number;
      } | null;
    },
  });
  if (!p.conflict) return null;
  return (
    <Notice>
      <p>Conflicto de favorito o nota. Conservamos tus cambios locales.</p>
      <p className="whitespace-pre-wrap">Tu nota: {p.note || '(vacía)'}</p>
      {query.data && (
        <p className="whitespace-pre-wrap">
          Nota del servidor (revisión {query.data.revision}):{' '}
          {query.data.note || '(vacía)'}
        </p>
      )}
      {query.isError && (
        <p>
          No se pudo consultar la versión remota; reintenta antes de decidir.
        </p>
      )}
    </Notice>
  );
}
export function PendingReminder() {
  const auth = useAuth();
  const owner = auth.user?.id ?? auth.offlineUser?.id;
  return owner ? <ReminderForOwner key={owner} owner={owner} /> : null;
}
function ReminderForOwner({ owner }: { owner: string }) {
  const query = usePending(owner),
    v = query.data;
  if (
    !v ||
    !(
      v.operations.length +
      v.requests.length +
      v.changes.length +
      v.texts.length +
      v.availability.length +
      v.media.length +
      v.calls.length
    )
  )
    return null;
  return (
    <div className="mt-5">
      <Notice>
        Tienes trabajo guardado en este dispositivo.{' '}
        <Link className="font-semibold underline" to="/cuenta/pendientes">
          Revisar pendientes y sincronizar
        </Link>
      </Notice>
    </div>
  );
}
