import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Notice, secondaryClass } from '@/features/directory/Workspace';
import { useOnline } from '@/pwa/useOnline';
import { useNow } from '@/features/directory/useNow';
import { acquireReloadBlock } from '@/pwa/reload-safety';
import {
  appointmentError,
  type Appointment,
  type AppointmentChange,
} from './requests-model';
import { useRefreshAppointments } from './requests-api';
import { useAvailability } from './api';
import { dayInZone, slotLabel } from './model';
import {
  readChangeDraft,
  removeChangeDraft,
  saveChangeDraft,
  sendChangeDraft,
} from './change-store';

export function AppointmentChanges({
  owner,
  appointment: a,
}: {
  owner: string;
  appointment: Appointment;
}) {
  const online = useOnline();
  const now = useNow(1000);
  const refresh = useRefreshAppointments();
  const [action, setAction] =
    useState<AppointmentChange['p_action']>('cancelled');
  const [reason, setReason] = useState('');
  const [baseRevision, setBaseRevision] = useState(a.revision);
  const [date, setDate] = useState(
    dayInZone(a.snapshot.timezone, new Date(a.starts_at)),
  );
  const [target, setTarget] = useState('');
  const [message, setMessage] = useState('');
  const [restored, setRestored] = useState<AppointmentChange | null>(null);
  const operation = useRef<{
    signature: string;
    value: AppointmentChange;
  } | null>(null);
  const draft = useQuery({
    queryKey: ['appointment-change-draft', owner, a.id],
    networkMode: 'always',
    queryFn: () => readChangeDraft(owner, a.id),
  });
  const availability = useAvailability(
    action === 'rescheduled' ? a.service_id : '',
    date,
    '',
  );
  const slot = availability.data?.value?.slots.find(
    (s) => `${s.assignment_id}|${s.starts_at}` === target,
  );
  const build = (): AppointmentChange => {
    const value = {
      p_id: a.id,
      p_revision: baseRevision,
      p_action: action,
      p_reason: reason.trim(),
      p_assignment:
        action === 'rescheduled'
          ? (slot?.assignment_id ?? restored?.p_assignment ?? null)
          : null,
      p_start:
        action === 'rescheduled'
          ? (slot?.starts_at ?? restored?.p_start ?? null)
          : null,
    };
    const signature = JSON.stringify(value);
    if (operation.current?.signature !== signature)
      operation.current = {
        signature,
        value: { ...value, p_operation: crypto.randomUUID() },
      };
    return operation.current.value;
  };
  const submit = useMutation({
    networkMode: 'always',
    mutationFn: async () => {
      const args = build();
      await saveChangeDraft(owner, args);
      if (!online) {
        return false;
      }
      if (baseRevision !== a.revision) throw { code: '40001' };
      if (
        args.p_action === 'rescheduled' &&
        (!args.p_assignment || !args.p_start)
      )
        throw {
          code: '23514',
          message: 'Elige un nuevo intervalo disponible.',
        };
      await sendChangeDraft(owner, a.id);
      return true;
    },
    onSuccess: (sent) => {
      if (sent) setBaseRevision(baseRevision + 1);
      setReason('');
      setRestored(null);
      operation.current = null;
      setMessage(
        sent
          ? 'Cambio aceptado por el servidor. Revisa el estado actualizado.'
          : 'Cambio pendiente guardado en este dispositivo. La cita remota sigue vigente. Al reconectar debes revisarlo y enviarlo.',
      );
      void draft.refetch();
      void refresh();
    },
  });
  useEffect(() => {
    if (!reason) return;
    const release = acquireReloadBlock('cambio de cita sin enviar');
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => {
      release();
      window.removeEventListener('beforeunload', warn);
    };
  }, [reason]);
  const canChange = a.owner_id === owner || a.can_decide;
  if (!canChange) return null;
  const active = a.status === 'requested' || a.status === 'confirmed';
  const closable =
    a.can_decide &&
    a.status === 'confirmed' &&
    Date.parse(a.ends_at) <= now.getTime();
  if (!active && !draft.data) return null;
  const deadline =
    Date.parse(a.starts_at) -
    (action === 'cancelled'
      ? a.snapshot.cancel_minutes
      : a.snapshot.reschedule_minutes) *
      60000;
  const pastDeadline =
    (action === 'cancelled' || action === 'rescheduled') &&
    deadline <= now.getTime();
  return (
    <section className="sv-card space-y-4" aria-label="Cambiar o cerrar cita">
      <h2 className="font-semibold">Cambiar o cerrar cita</h2>
      {baseRevision !== a.revision && (
        <Notice>
          La cita cambió mientras preparabas esta acción. Conservamos el texto.
          Revisa el estado y el historial antes de continuar.{' '}
          <button
            className={secondaryClass}
            disabled={!!restored}
            onClick={() => {
              setBaseRevision(a.revision);
              setTarget('');
              operation.current = null;
            }}
          >
            Revisé el estado actualizado
          </button>
        </Notice>
      )}
      <p className="text-sm">
        Regla acordada: cancelación hasta {a.snapshot.cancel_minutes} min antes
        del inicio; reprogramación hasta {a.snapshot.reschedule_minutes} min
        antes. El límite es exclusivo. Una reprogramación requiere nueva
        confirmación.
      </p>
      {draft.data && (
        <Notice>
          Cambio local pendiente. La cita remota sigue vigente.{' '}
          <button
            className={secondaryClass}
            onClick={() => {
              const d = draft.data!;
              setAction(d.p_action);
              setReason(d.p_reason);
              setRestored(d);
              setBaseRevision(d.p_revision);
              if (d.p_start) {
                setDate(dayInZone(a.snapshot.timezone, new Date(d.p_start)));
                setTarget(`${d.p_assignment}|${d.p_start}`);
              }
              operation.current = {
                signature: JSON.stringify({
                  p_id: d.p_id,
                  p_revision: d.p_revision,
                  p_action: d.p_action,
                  p_reason: d.p_reason,
                  p_assignment: d.p_assignment,
                  p_start: d.p_start,
                }),
                value: d,
              };
              setMessage(
                d.p_revision !== a.revision
                  ? 'La cita cambió: revisa el detalle y descarta este pendiente antes de preparar otro con el estado actual.'
                  : 'Borrador recuperado. Revisa y envía explícitamente.',
              );
            }}
          >
            Recuperar cambio pendiente
          </button>
          <button
            className={secondaryClass}
            onClick={() =>
              void removeChangeDraft(owner, a.id).then(() => {
                setRestored(null);
                setBaseRevision(a.revision);
                setReason('');
                operation.current = null;
                return draft.refetch();
              })
            }
          >
            Descartar cambio pendiente
          </button>
        </Notice>
      )}
      <label className="block">
        Acción
        <select
          className="sv-input"
          value={action}
          disabled={submit.isPending}
          onChange={(e) => {
            setAction(e.target.value as typeof action);
            setRestored(null);
          }}
        >
          <option value="cancelled">Cancelar cita</option>
          <option value="rescheduled">Reprogramar cita</option>
          {closable && (
            <>
              <option value="completed">Marcar completada</option>
              <option value="no_show">Marcar no asistió</option>
            </>
          )}
        </select>
      </label>
      {action === 'rescheduled' && (
        <>
          <label className="block">
            Nueva fecha
            <input
              className="sv-input"
              type="date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                setTarget('');
                setRestored(null);
              }}
            />
          </label>
          {availability.isError && (
            <Notice error>
              No pudimos consultar horarios. La cita anterior sigue vigente.
            </Notice>
          )}
          <label className="block">
            Nuevo intervalo
            <select
              className="sv-input"
              value={target}
              onChange={(e) => {
                setTarget(e.target.value);
                setRestored(null);
              }}
            >
              <option value="">Elegir horario</option>
              {availability.data?.value?.slots.map((s) => (
                <option
                  key={`${s.assignment_id}|${s.starts_at}`}
                  value={`${s.assignment_id}|${s.starts_at}`}
                >
                  {slotLabel(s)} · {s.professional_name}
                </option>
              ))}
            </select>
          </label>
          {!online && (
            <Notice>
              Puedes preparar el motivo y guardar el cambio pendiente. Elige y
              revalida el horario al reconectar; el horario guardado es solo
              referencia.
            </Notice>
          )}
          {restored?.p_start && (
            <p className="text-sm">
              Horario del borrador:{' '}
              {new Date(restored.p_start).toLocaleString('es-CO', {
                timeZone: a.snapshot.timezone,
              })}{' '}
              · {a.snapshot.timezone}
            </p>
          )}
        </>
      )}
      <label className="block">
        Motivo del cambio
        <textarea
          className="sv-input"
          maxLength={500}
          value={reason}
          disabled={submit.isPending}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      <p className="text-xs">
        Cancelación y reprogramación requieren 5–500 caracteres. El servidor
        valida estado, permisos, plazo y disponibilidad antes de aceptar.
      </p>
      {pastDeadline && (
        <Notice>
          El plazo de esta acción ya terminó según la hora de este dispositivo.
          Actualiza el detalle si tu reloj no es correcto.
        </Notice>
      )}
      <button
        className="button button-primary"
        disabled={
          submit.isPending ||
          (online && baseRevision !== a.revision) ||
          pastDeadline ||
          (!active && !closable) ||
          ((action === 'cancelled' || action === 'rescheduled') &&
            reason.trim().length < 5) ||
          (online && restored !== null && restored.p_revision !== a.revision)
        }
        onClick={() => submit.mutate()}
      >
        {submit.isPending
          ? 'Procesando cambio…'
          : online
            ? 'Revalidar y enviar cambio'
            : 'Guardar cambio pendiente local'}
      </button>
      {submit.isError && (
        <Notice error>{appointmentError(submit.error)}</Notice>
      )}
      {message && <Notice>{message}</Notice>}
    </section>
  );
}
