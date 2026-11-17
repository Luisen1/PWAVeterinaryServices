import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation, useSearchParams } from 'react-router';
import { useAuth } from '@/features/auth/useAuth';
import { authWithReturn } from '@/features/auth/return-to';
import { useOnline } from '@/pwa/useOnline';
import {
  usePublications,
  usePublicServices,
} from '@/features/directory/public-api';
import {
  Notice,
  secondaryClass,
  Workspace,
} from '@/features/directory/Workspace';
import { dataError } from '@/features/directory/api';
import { RequestForm } from './RequestForm';
import { MyUpcomingAppointments } from './MyUpcomingAppointments';
import { useNow } from '@/features/directory/useNow';
import {
  acquireSlot,
  releaseSlot,
  useAvailability,
  useAvailabilityDrafts,
  useCurrentHold,
  saveAvailabilityDraft,
  removeAvailabilityDraft,
} from './api';
import {
  dayInZone,
  daySchema,
  slotLabel,
  type Availability,
  type AvailableSlot,
} from './model';

function availabilityError(error: unknown) {
  if (
    error &&
    typeof error === 'object' &&
    'code' in error &&
    error.code === '23P01'
  )
    return 'Ese horario ya no está disponible. Actualiza y elige otro; conservamos tu selección como referencia.';
  return dataError(error);
}
export function AvailabilityPage() {
  const [params, setParams] = useSearchParams();
  const publications = usePublications();
  const services = usePublicServices();
  const auth = useAuth();
  const online = useOnline();
  const user = auth.user?.email_confirmed_at
    ? auth.user
    : !online
      ? auth.offlineUser
      : null;
  const establishment = params.get('establecimiento') ?? '';
  const publication = publications.data?.find((p) => p.id === establishment);
  const siteId = params.get('sede') ?? '';
  const site = publication?.document.sites.find((s) => s.id === siteId);
  const service = params.get('servicio') ?? '';
  const date = params.get('fecha') ?? dayInZone(site?.timezone);
  const professional = params.get('profesional') ?? '';
  const offered =
    services.data?.filter(
      (s) =>
        s.establishment_id === establishment &&
        s.document.site_id === siteId &&
        s.document.active,
    ) ?? [];
  const validService = !!offered.find((s) => s.id === service);
  const change = (values: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(values)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    setParams(next, { replace: true });
  };
  return (
    <Workspace
      title="Citas"
      description="Consulta las citas de tus mascotas, conversa con tu veterinaria y solicita una nueva atención."
    >
      <nav aria-label="Opciones de citas" className="flex flex-wrap gap-3">
        <Link to="/citas/solicitudes" className={secondaryClass}>
          Mis citas y solicitudes
        </Link>
        <Link to="/mensajes" className={secondaryClass}>
          Mis chats con veterinarias
        </Link>
        <a href="#nueva-cita" className={secondaryClass}>
          Solicitar una nueva cita
        </a>
        <Link to="/explorar" className={secondaryClass}>
          Explorar establecimientos
        </Link>
      </nav>
      {user && (
        <MyUpcomingAppointments
          key={service ? 'booking' : 'overview'}
          owner={user.id}
          collapsed={!!service}
        />
      )}
      <h2 id="nueva-cita" className="scroll-mt-24 text-lg font-semibold">
        Solicitar una nueva cita
      </h2>
      <Notice>
        <ol className="list-inside list-decimal space-y-1">
          <li>Elige establecimiento, sede, servicio y fecha.</li>
          <li>Selecciona uno de los horarios disponibles.</li>
          <li>Elige tu mascota y pulsa Enviar solicitud de cita.</li>
        </ol>
        <p className="mt-2">
          Apartar cinco minutos es opcional. Enviar una solicitud requiere
          respuesta del establecimiento; no confirma la atención.
        </p>
      </Notice>
      {(publications.isError || services.isError) && (
        <Notice error>
          No pudimos cargar el catálogo.
          <button
            className={secondaryClass}
            disabled={!online}
            onClick={() => {
              void publications.refetch();
              void services.refetch();
            }}
          >
            Reintentar catálogo
          </button>
        </Notice>
      )}
      {(publications.isPending || services.isPending) && (
        <Notice>Cargando servicios publicados…</Notice>
      )}
      <div className="sv-card grid gap-4 sm:grid-cols-2">
        <label>
          Establecimiento
          <select
            aria-label="Establecimiento para consultar horarios"
            className="sv-input"
            value={establishment}
            onChange={(e) =>
              change({
                establecimiento: e.target.value,
                sede: '',
                servicio: '',
                profesional: '',
              })
            }
          >
            <option value="">Seleccionar establecimiento</option>
            {publications.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.document.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Sede
          <select
            aria-label="Sede para consultar horarios"
            className="sv-input"
            value={siteId}
            disabled={!publication}
            onChange={(e) =>
              change({ sede: e.target.value, servicio: '', profesional: '' })
            }
          >
            <option value="">Seleccionar sede</option>
            {publication?.document.sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Servicio
          <select
            aria-label="Servicio reservable"
            className="sv-input"
            value={service}
            disabled={!site}
            onChange={(e) =>
              change({ servicio: e.target.value, profesional: '' })
            }
          >
            <option value="">Seleccionar servicio</option>
            {offered.map((s) => (
              <option key={s.id} value={s.id}>
                {s.document.name} · {s.document.modality}
              </option>
            ))}
          </select>
        </label>
        <label>
          Fecha en la zona de la sede
          <input
            type="date"
            aria-label="Fecha para consultar horarios"
            className="sv-input"
            value={date}
            onChange={(e) => change({ fecha: e.target.value })}
          />
        </label>
      </div>
      {site && (
        <p className="text-sm">
          Zona horaria: {site.timezone}. Las horas corresponden a la sede.
        </p>
      )}
      {service &&
        !validService &&
        services.isSuccess &&
        publications.isSuccess && (
          <Notice error>
            El servicio elegido no pertenece a esta sede publicada o ya no está
            activo. Elige otra opción.
          </Notice>
        )}
      {!daySchema.safeParse(date).success && (
        <Notice error>Elige una fecha válida.</Notice>
      )}
      {validService && daySchema.safeParse(date).success && (
        <Slots
          key={`${service}:${date}:${professional}:${user?.id ?? 'visitor'}`}
          service={service}
          date={date}
          professional={professional}
          owner={user?.id}
          change={change}
        />
      )}
      {!service && (
        <Notice>
          Selecciona un establecimiento, una sede y un servicio para consultar
          su disponibilidad.
        </Notice>
      )}
      {user && <Drafts owner={user.id} />}
    </Workspace>
  );
}
function Slots({
  service,
  date,
  professional,
  owner,
  change,
}: {
  service: string;
  date: string;
  professional: string;
  owner?: string;
  change: (values: Record<string, string>) => void;
}) {
  const online = useOnline();
  const location = useLocation();
  const query = useAvailability(service, date, professional);
  const cache = useQueryClient();
  const current = useCurrentHold(owner, service);
  const now = useNow(1000);
  const [selected, select] = useState<{
    slot: AvailableSlot;
    context: Availability;
  } | null>(null);
  const [operation, setOperation] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const requestPanel = useRef<HTMLDivElement>(null);
  const availability = query.data?.value;
  const cached = query.data?.fromCache ?? !online;
  useEffect(() => {
    if (selected) requestPanel.current?.scrollIntoView({ block: 'start' });
  }, [selected]);
  const refresh = async () => {
    await Promise.all([
      cache.invalidateQueries({ queryKey: ['service-availability', service] }),
      cache.invalidateQueries({ queryKey: ['slot-hold', owner] }),
      cache.invalidateQueries({ queryKey: ['offering-slots'] }),
    ]);
  };
  const hold = useMutation({
    mutationFn: (id: string) =>
      acquireSlot(owner!, id, service, selected!.slot),
    onSuccess: async () => {
      setOperation(null);
      setMessage(
        'Horario apartado temporalmente. Todavía no has solicitado una cita.',
      );
      await refresh();
    },
    onError: () => {
      void query.refetch();
    },
  });
  const release = useMutation({
    mutationFn: () => releaseSlot(owner!, current.data!.hold!.id),
    onSuccess: async () => {
      setMessage('Apartado liberado.');
      await refresh();
    },
  });
  const draft = useMutation({
    networkMode: 'always',
    mutationFn: () =>
      saveAvailabilityDraft(owner!, selected!.context, selected!.slot),
    onSuccess: () => {
      setMessage(
        'Borrador guardado en este dispositivo; no reserva ningún horario.',
      );
    },
  });
  const remaining = current.data?.hold
    ? Math.max(
        0,
        Math.ceil(
          (Date.parse(current.data.hold.expires_at) -
            (Date.parse(current.data.server_now) +
              Math.max(0, now.getTime() - current.data.received_at))) /
            1000,
        ),
      )
    : 0;
  return (
    <section className="sv-card space-y-4" aria-label="Horarios reservables">
      <h2 className="text-lg font-semibold">Horarios reservables</h2>
      {availability && (
        <>
          <p>
            {availability.service_name} · {availability.site_name} ·{' '}
            {availability.modality}
          </p>
          <label>
            Profesional
            <select
              className="sv-input"
              aria-label="Profesional para consultar horarios"
              value={professional}
              onChange={(e) => change({ profesional: e.target.value })}
            >
              <option value="">Cualquier profesional disponible</option>
              {availability.professionals.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <p className="text-xs">
            Consultado el{' '}
            {new Date(availability.calculated_at).toLocaleString('es-CO', {
              timeZone: availability.timezone,
            })}{' '}
            · {availability.timezone}. La disponibilidad puede cambiar.
          </p>
        </>
      )}
      {cached && (
        <Notice>
          Disponibilidad guardada
          {availability
            ? ' con la antigüedad indicada arriba'
            : ' todavía no disponible en este dispositivo'}
          . Solo puedes preparar un borrador; recupera conexión para revalidar y
          apartar.
        </Notice>
      )}
      {query.isPending && <Notice>Consultando horarios…</Notice>}
      {query.isError && <Notice error>{availabilityError(query.error)}</Notice>}
      <button
        className={secondaryClass}
        disabled={!online || query.isFetching}
        onClick={() => void query.refetch()}
      >
        Actualizar disponibilidad
      </button>
      {availability?.slots.length === 0 && !selected && (
        <Notice>
          <p>
            {availability.professionals.length === 0
              ? 'Este servicio todavía no tiene profesionales asignados para reservar. El establecimiento debe vincular el servicio con un profesional y un recurso, y configurar sus jornadas y el horario de la sede.'
              : 'No hay intervalos disponibles para esta fecha y profesional. Prueba otra fecha o profesional; los horarios dependen de las jornadas, el horario de la sede y los cupos libres.'}
          </p>
          <Link
            className="underline"
            to={`/establecimientos/${availability.establishment_id}?sede=${availability.site_id}`}
          >
            Ver ficha y contactar al establecimiento
          </Link>
        </Notice>
      )}
      <div
        className="grid gap-3 sm:grid-cols-2"
        role="group"
        aria-label="Intervalos disponibles"
      >
        {availability?.slots.map((slot) => (
          <button
            key={`${slot.assignment_id}:${slot.starts_at}`}
            className="button button-secondary flex-col items-start text-left"
            aria-pressed={
              selected?.slot.assignment_id === slot.assignment_id &&
              selected.slot.starts_at === slot.starts_at
            }
            onClick={() => {
              select({ slot, context: availability });
              setOperation(null);
              setMessage('');
            }}
          >
            <span>{slotLabel(slot)}</span>
            <span className="text-xs">
              {slot.professional_name} · {slot.modality}
            </span>
          </button>
        ))}
      </div>
      {selected && (
        <div className="space-y-3 rounded-2xl bg-brand-50 p-4">
          <h3 className="font-semibold">Tu selección</h3>
          <p>{slotLabel(selected.slot)}</p>
          <p>
            {selected.slot.professional_name} · {selected.slot.modality}
          </p>
          {owner ? (
            <div className="flex flex-wrap gap-3">
              <button
                className={secondaryClass}
                disabled={draft.isPending}
                onClick={() => draft.mutate()}
              >
                Guardar borrador de horario
              </button>
              <button
                className={secondaryClass}
                disabled={
                  !online || cached || hold.isPending || release.isPending
                }
                onClick={() => {
                  const id = operation ?? crypto.randomUUID();
                  setOperation(id);
                  hold.mutate(id);
                }}
              >
                Revalidar y apartar 5 minutos
              </button>
            </div>
          ) : (
            <Link
              className={secondaryClass}
              to={authWithReturn(
                '/acceso',
                location.pathname + location.search,
              )}
            >
              Acceder para guardar o apartar
            </Link>
          )}
        </div>
      )}
      {availability && (
        <div
          ref={requestPanel}
          className="scroll-mt-24 rounded-2xl border border-brand-100 p-4"
        >
          {owner ? (
            <RequestForm
              owner={owner}
              context={selected?.context ?? availability}
              slot={selected?.slot ?? null}
              cached={cached}
              holdId={
                selected &&
                current.data?.hold?.assignment_id ===
                  selected.slot.assignment_id &&
                current.data.hold.starts_at === selected.slot.starts_at &&
                remaining > 0
                  ? current.data.hold.id
                  : null
              }
            />
          ) : (
            <Notice>
              Necesitas una cuenta de Dueño de mascota con correo confirmado
              para enviar la solicitud.{' '}
              <Link
                className={secondaryClass}
                to={authWithReturn(
                  '/acceso',
                  location.pathname + location.search,
                )}
              >
                Acceder para solicitar cita
              </Link>
            </Notice>
          )}
        </div>
      )}
      {current.data?.hold && (
        <Notice>
          {online && remaining > 0
            ? `Apartado activo: ${Math.floor(remaining / 60)} min ${remaining % 60} s restantes.`
            : !online
              ? 'Sin conexión no podemos verificar tu apartado.'
              : 'El apartado ha vencido; consulta de nuevo.'}{' '}
          No es una cita confirmada.
          <button
            className={secondaryClass}
            disabled={!online || release.isPending}
            onClick={() => release.mutate()}
          >
            Liberar apartado
          </button>
        </Notice>
      )}
      {current.isError && online && (
        <Notice error>
          No pudimos comprobar tu apartado actual. Reintenta con conexión.
        </Notice>
      )}
      {message && <Notice>{message}</Notice>}
      {(hold.isError || release.isError || draft.isError) && (
        <Notice error>
          {availabilityError(hold.error ?? release.error ?? draft.error)}
        </Notice>
      )}
    </section>
  );
}
function Drafts({ owner }: { owner: string }) {
  const rows = useAvailabilityDrafts(owner);
  const remove = useMutation({
    networkMode: 'always',
    mutationFn: (id: string) => removeAvailabilityDraft(owner, id),
  });
  return (
    <section
      className="sv-card space-y-4"
      aria-label="Borradores de disponibilidad"
    >
      <h2 className="font-semibold">Mis borradores de horario</h2>
      <p className="text-sm">
        Son privados y se guardan en este dispositivo. No se envían
        automáticamente al reconectar y no bloquean horarios.
      </p>
      {rows.data?.length === 0 && <p>Aún no tienes borradores guardados.</p>}
      {rows.data?.map((d) => (
        <article className="site-card space-y-2" key={d.id}>
          <h3 className="font-semibold">
            {d.service_name} · {d.site_name}
          </h3>
          <p>{slotLabel(d.slot)}</p>
          <p>
            {d.slot.professional_name} · {d.slot.modality}
          </p>
          <p className="text-xs">
            Disponibilidad consultada:{' '}
            {new Date(d.calculated_at).toLocaleString('es-CO', {
              timeZone: d.slot.timezone,
            })}{' '}
            · {d.slot.timezone}.
          </p>
          <span className="status-badge">Borrador local · sin reservar</span>
          <div className="flex flex-wrap gap-2">
            <Link
              className={secondaryClass}
              to={`/citas?${new URLSearchParams({ establecimiento: d.establishment_id, sede: d.site_id, servicio: d.service_id, fecha: d.date, profesional: d.slot.professional_id })}`}
            >
              Consultar de nuevo este horario
            </Link>
            <button
              className={secondaryClass}
              disabled={remove.isPending}
              onClick={() => remove.mutate(d.id)}
            >
              Eliminar borrador
            </button>
          </div>
        </article>
      ))}
      {(rows.isError || remove.isError) && (
        <Notice error>{dataError(rows.error ?? remove.error)}</Notice>
      )}
    </section>
  );
}
