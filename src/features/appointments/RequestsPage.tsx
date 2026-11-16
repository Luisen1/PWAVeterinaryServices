import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useParams, useSearchParams } from 'react-router';
import { z } from 'zod';
import {
  Notice,
  secondaryClass,
  Verified,
  Workspace,
} from '@/features/directory/Workspace';
import { useOnline } from '@/pwa/useOnline';
import { useNow } from '@/features/directory/useNow';
import { acquireReloadBlock } from '@/pwa/reload-safety';
import { useEffect } from 'react';
import {
  appointmentError,
  appointmentSchema,
  appointmentStatus,
  type Appointment,
} from './requests-model';
import {
  appointmentRpc,
  decideAppointment,
  useRefreshAppointments,
} from './requests-api';
import { slotLabel } from './model';

export function RequestsPage({ team = false }: { team?: boolean }) {
  const { id } = useParams();
  return (
    <Workspace
      title={
        team ? 'Solicitudes del establecimiento' : 'Mis solicitudes y avisos'
      }
      description={
        team
          ? 'Revisa solicitudes presenciales y virtuales; confirma o rechaza con trazabilidad.'
          : 'Consulta la respuesta de tu veterinario y los detalles de tus solicitudes.'
      }
    >
      <Link className={secondaryClass} to="/citas">
        Consultar horarios
      </Link>
      <Link
        className={secondaryClass}
        to={team ? '/citas/solicitudes' : '/oferentes/citas'}
      >
        {team
          ? 'Ver mis solicitudes'
          : 'Gestionar solicitudes de mis establecimientos'}
      </Link>
      <Verified>
        {(owner) => (
          <RequestList owner={owner} team={team} establishment={id} />
        )}
      </Verified>
    </Workspace>
  );
}
function RequestList({
  owner,
  team,
  establishment,
}: {
  owner: string;
  team: boolean;
  establishment?: string;
}) {
  const online = useOnline();
  const [cursor, setCursor] = useState<{
    created_at: string;
    id: string;
  } | null>(null);
  const query = useQuery({
    queryKey: ['appointments', owner, team, establishment, cursor],
    enabled: online,
    retry: false,
    queryFn: async ({ signal }) =>
      z.array(appointmentSchema).parse(
        await appointmentRpc(
          'appointment_requests',
          {
            p_scope: team ? 'team' : 'mine',
            p_establishment: establishment ?? null,
            p_before: cursor?.created_at ?? null,
            p_before_id: cursor?.id ?? null,
          },
          signal,
        ),
      ),
    refetchInterval: online ? 15000 : false,
  });
  return (
    <div className="space-y-4">
      {!online && (
        <Notice>
          Sin conexión no podemos verificar cambios de estado. Recupera conexión
          para consultar o decidir.
        </Notice>
      )}
      <button
        className={secondaryClass}
        disabled={!online || query.isFetching}
        onClick={() => void query.refetch()}
      >
        Actualizar solicitudes
      </button>
      {query.isPending && online && <Notice>Cargando solicitudes…</Notice>}
      {query.isError && <Notice error>{appointmentError(query.error)}</Notice>}
      {query.data?.length === 0 && (
        <Notice>
          No hay solicitudes en esta página.{' '}
          {team && 'Solo aparecen las de establecimientos donde tienes acceso.'}
        </Notice>
      )}
      {query.data?.map((a) => (
        <article
          key={a.id}
          className="sv-card space-y-2"
          aria-label={`Solicitud de ${a.snapshot.pet_name}`}
        >
          <p className="font-semibold">
            {a.snapshot.pet_name} · {a.snapshot.service_name}
          </p>
          <p>
            <span className="status-badge">{appointmentStatus[a.status]}</span>{' '}
            · {a.modality}
          </p>
          <p className="text-sm">
            {a.snapshot.establishment_name} · {a.snapshot.site_name}
          </p>
          <p className="text-sm">
            {slotLabel({ ...a, timezone: a.snapshot.timezone })}
          </p>
          {!!a.events.at(-1)?.reason && (
            <p className="text-sm">{a.events.at(-1)!.reason}</p>
          )}
          <Link
            className={secondaryClass}
            to={`/citas/solicitudes/${a.id}${team ? '?equipo=1' : ''}`}
          >
            Ver detalle de {a.snapshot.pet_name}
          </Link>
        </article>
      ))}
      <div className="flex flex-wrap gap-3">
        {cursor && (
          <button className={secondaryClass} onClick={() => setCursor(null)}>
            Volver a las más recientes
          </button>
        )}
        {query.data?.length === 30 && (
          <button
            className={secondaryClass}
            disabled={query.isFetching || !online}
            onClick={() => {
              const last = query.data!.at(-1)!;
              setCursor({ created_at: last.created_at, id: last.id });
            }}
          >
            Ver solicitudes anteriores
          </button>
        )}
      </div>
      <p className="text-xs">
        Los cambios de estado se consultan cada quince segundos mientras esta
        pantalla está abierta y conectada. No se envían notificaciones push ni
        correos en esta versión.
      </p>
    </div>
  );
}

export function AppointmentDetailsPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  return (
    <Workspace
      title="Detalle de la solicitud"
      description="Comprueba el estado, las instrucciones y el historial de tu cita."
    >
      <Link
        className={secondaryClass}
        to={
          params.get('equipo') === '1'
            ? '/oferentes/citas'
            : '/citas/solicitudes'
        }
      >
        Volver a solicitudes
      </Link>
      <Verified>{(owner) => <Detail owner={owner} id={id ?? ''} />}</Verified>
    </Workspace>
  );
}
function Detail({ owner, id }: { owner: string; id: string }) {
  const online = useOnline();
  const valid = z.uuid().safeParse(id).success;
  const query = useQuery({
    queryKey: ['appointment-detail', owner, id],
    enabled: online && valid,
    retry: false,
    queryFn: async ({ signal }) =>
      appointmentSchema.parse(
        await appointmentRpc('appointment_detail', { p_id: id }, signal),
      ),
    refetchInterval: online ? 15000 : false,
  });
  const a = query.data;
  return (
    <div className="space-y-4">
      {!valid && (
        <Notice error>El identificador de la solicitud no es válido.</Notice>
      )}
      {query.isPending && online && valid && (
        <Notice>Consultando solicitud…</Notice>
      )}
      {query.isError && <Notice error>{appointmentError(query.error)}</Notice>}
      {!online && (
        <Notice>
          Sin conexión no puedes confirmar el estado ni decidir sobre esta
          solicitud.
        </Notice>
      )}
      <button
        className={secondaryClass}
        disabled={!online || !valid || query.isFetching}
        onClick={() => void query.refetch()}
      >
        Actualizar detalle
      </button>
      {a && (
        <>
          <article className="sv-card space-y-3">
            <h2 className="text-lg font-semibold">
              {a.snapshot.service_name} · {a.snapshot.pet_name}
            </h2>
            <p>
              <span className="status-badge">
                {appointmentStatus[a.status]}
              </span>{' '}
              · {a.modality}
            </p>
            <p>{slotLabel({ ...a, timezone: a.snapshot.timezone })}</p>
            <p>
              {a.snapshot.establishment_name} · {a.snapshot.site_name}
            </p>
            <p>Profesional: {a.snapshot.professional_name}</p>
            {a.modality === 'Presencial' && (
              <p>Dirección: {a.snapshot.site_address}</p>
            )}
            <section
              className="rounded-2xl bg-brand-50 p-4 space-y-2"
              aria-label="Instrucciones de la cita"
            >
              <h3 className="font-semibold">Instrucciones y requisitos</h3>
              <p>{a.snapshot.instructions}</p>
            </section>
            {a.status === 'requested' && (
              <Notice>
                Pendiente de confirmación del establecimiento. La solicitud
                vence al llegar su hora de inicio si no se confirma.
              </Notice>
            )}
            <p className="break-all text-xs">ID: {a.id}</p>
          </article>
          {a.can_decide && a.status === 'requested' && (
            <DecisionForm
              key={a.id}
              owner={owner}
              appointment={a}
              ready={online && !query.isError && !query.isFetching}
            />
          )}
          <section
            className="sv-card space-y-3"
            aria-label="Historial y avisos de la solicitud"
          >
            <h2 className="font-semibold">Historial y avisos</h2>
            <ol className="space-y-3">
              {a.events.map((event) => (
                <li key={event.id} className="border-l-2 border-brand-100 pl-3">
                  <p className="font-medium">{appointmentStatus[event.kind]}</p>
                  <p className="text-xs">
                    {new Date(event.created_at).toLocaleString('es-CO', {
                      timeZone: a.snapshot.timezone,
                    })}{' '}
                    · {a.snapshot.timezone}
                  </p>
                  {event.reason && <p>{event.reason}</p>}
                  <p className="text-xs">
                    {event.actor_id === a.owner_id
                      ? 'Acción de la cuenta solicitante'
                      : event.actor_id
                        ? 'Acción de personal autorizado'
                        : 'Evento del sistema'}
                  </p>
                </li>
              ))}
            </ol>
          </section>
        </>
      )}
    </div>
  );
}
function DecisionForm({
  owner,
  appointment,
  ready,
}: {
  owner: string;
  appointment: Appointment;
  ready: boolean;
}) {
  const [reason, setReason] = useState('');
  const now = useNow(1000);
  const refresh = useRefreshAppointments();
  useEffect(() => {
    if (!reason) return;
    return acquireReloadBlock('motivo de decisión sin guardar');
  }, [reason]);
  const decision = useMutation({
    mutationFn: (value: 'confirmed' | 'rejected') =>
      decideAppointment(
        owner,
        appointment.id,
        appointment.revision,
        value,
        reason,
      ),
    onSuccess: () => {
      setReason('');
      void refresh();
    },
    onError: () => void refresh(),
  });
  const disabled =
    !ready ||
    decision.isPending ||
    Date.parse(appointment.starts_at) <= now.getTime();
  return (
    <section className="sv-card space-y-3" aria-label="Resolver solicitud">
      <h2 className="font-semibold">Resolver solicitud</h2>
      <p className="text-sm">
        La decisión quedará registrada y visible para la persona solicitante.
      </p>
      <label className="block">
        Motivo o instrucciones adicionales
        <textarea
          className="sv-input"
          maxLength={500}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          disabled={decision.isPending}
        />
      </label>
      <p className="text-xs">
        Para rechazar, indica un motivo de 5 a 500 caracteres.
      </p>
      <div className="flex flex-wrap gap-3">
        <button
          className="button button-primary"
          disabled={disabled}
          onClick={() => decision.mutate('confirmed')}
        >
          Confirmar cita
        </button>
        <button
          className={secondaryClass}
          disabled={disabled || reason.trim().length < 5}
          onClick={() => decision.mutate('rejected')}
        >
          Rechazar solicitud
        </button>
      </div>
      {decision.isError && (
        <Notice error>{appointmentError(decision.error)}</Notice>
      )}
      {decision.isPending && <p role="status">Guardando decisión…</p>}
    </section>
  );
}
