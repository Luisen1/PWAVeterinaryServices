import { useEffect, useId, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { authClient } from '@/features/auth/api';
import { Notice, secondaryClass } from '@/features/directory/Workspace';
import { useOnline } from '@/pwa/useOnline';
import { acquireReloadBlock } from '@/pwa/reload-safety';
import type { Pet } from '@/features/directory/model';
import type { Availability, AvailableSlot } from './model';
import { appointmentError } from './requests-model';
import { requestAppointment, useRefreshAppointments } from './requests-api';
import { PolicyNotice } from './AppointmentPolicy';
import { useAppointmentPolicy } from './policy-api';

export function RequestForm({
  owner,
  context,
  slot,
  holdId,
  cached,
}: {
  owner: string;
  context: Availability;
  slot: AvailableSlot | null;
  holdId: string | null;
  cached: boolean;
}) {
  const online = useOnline();
  const policy = useAppointmentPolicy(context.establishment_id);
  const refresh = useRefreshAppointments();
  const [pet, setPet] = useState('');
  const helpId = useId();
  const pending = useRef(false);
  const operation = useRef<{ key: string; id: string } | null>(null);
  const key = `${context.service_id}:${slot?.assignment_id ?? ''}:${slot?.starts_at ?? ''}:${context.modality}:${pet}`;
  const pets = useQuery({
    queryKey: ['pets', owner],
    enabled: online,
    queryFn: async ({ signal }) => {
      const { data, error } = await authClient()
        .from('pets')
        .select('*')
        .eq('owner_id', owner)
        .order('created_at')
        .abortSignal(signal);
      if (error) throw error;
      return data as Pet[];
    },
  });
  const request = useMutation({
    mutationFn: async (args: { id: string; key: string }) => {
      if (!slot) throw new Error('Selecciona un horario antes de solicitar.');
      if (context.modality === 'Domicilio')
        throw new Error('Modalidad no habilitada');
      const value = await requestAppointment(owner, {
        p_id: args.id,
        p_service: context.service_id,
        p_assignment: slot.assignment_id,
        p_start: slot.starts_at,
        p_pet: pet,
        p_modality: context.modality,
        p_hold: holdId,
      });
      return { value, key: args.key };
    },
    onSuccess: () => void refresh(),
  });
  const result = request.data?.key === key ? request.data.value : null;
  const blockedReason = !online
    ? 'Recupera conexión para enviar la solicitud.'
    : cached
      ? 'Actualiza la disponibilidad con conexión antes de solicitar.'
      : !slot
        ? context.slots.length === 0
          ? 'No puedes enviar todavía: no hay horarios disponibles. Consulta el aviso de disponibilidad o elige otra fecha.'
          : 'Elige un horario de la lista para enviar tu solicitud.'
        : pets.isPending
          ? 'Estamos consultando tus mascotas.'
          : pets.isError
            ? 'Reintenta la consulta de mascotas antes de enviar.'
            : !pet
              ? 'Selecciona tu mascota para enviar la solicitud.'
              : policy.isError || !policy.data
                ? 'Debes consultar la regla publicada de cambios antes de enviar.'
                : '';
  useEffect(() => {
    if (!pet || result) return;
    const release = acquireReloadBlock('solicitud de cita sin enviar');
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => {
      release();
      window.removeEventListener('beforeunload', warn);
    };
  }, [pet, result]);
  if (context.modality === 'Domicilio')
    return (
      <Notice>
        Las solicitudes a domicilio todavía no están habilitadas. Consulta con
        el establecimiento.
      </Notice>
    );
  return (
    <section className="space-y-3" aria-label="Solicitar cita para mi mascota">
      <h3 className="font-semibold">
        Solicitar cita{' '}
        {context.modality === 'Virtual' ? 'virtual' : 'presencial'}
      </h3>
      <p className="text-sm">
        La solicitud quedará pendiente de revisión del establecimiento. No es
        una confirmación de atención. No necesitas apartar el horario antes de
        enviarla.
      </p>
      <PolicyNotice establishment={context.establishment_id} />
      {pets.isPending && online && <Notice>Cargando tus mascotas…</Notice>}
      {pets.isError && (
        <Notice error>
          No pudimos consultar tus mascotas.{' '}
          <button
            className={secondaryClass}
            onClick={() => void pets.refetch()}
          >
            Reintentar mascotas
          </button>
        </Notice>
      )}
      {pets.data?.length === 0 && (
        <Notice>
          Registra una mascota en{' '}
          <Link className="underline" to="/perfil">
            Perfil y mascotas
          </Link>{' '}
          antes de solicitar.
        </Notice>
      )}
      <label className="block">
        Mascota para la cita
        <select
          className="sv-input"
          value={pet}
          onChange={(e) => setPet(e.target.value)}
          disabled={request.isPending || !!result}
        >
          <option value="">Seleccionar mascota</option>
          {pets.data?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} · {p.species}
            </option>
          ))}
        </select>
      </label>
      {context.modality === 'Virtual' && (
        <p className="text-sm">
          Necesitas conexión estable, cámara y micrófono. La sala requiere
          confirmación, cuenta profesional asignada y servicio de videollamadas
          activado. Si no está disponible, coordina por chat.
        </p>
      )}
      <button
        type="button"
        className="button button-primary"
        aria-describedby={helpId}
        disabled={!!blockedReason || request.isPending || !!result}
        onClick={() => {
          if (pending.current || blockedReason || result) return;
          pending.current = true;
          if (operation.current?.key !== key)
            operation.current = { key, id: crypto.randomUUID() };
          request.mutate(operation.current, {
            onSettled: () => {
              pending.current = false;
            },
          });
        }}
      >
        {request.isPending ? 'Enviando solicitud…' : 'Enviar solicitud de cita'}
      </button>
      <p id={helpId} className="text-sm">
        {result
          ? 'Tu solicitud ya fue enviada.'
          : request.isPending
            ? 'Espera mientras comprobamos y registramos la solicitud.'
            : blockedReason ||
              'Al enviar, revalidamos el horario y registramos la solicitud.'}
      </p>
      {request.isError && request.variables?.key === key && (
        <Notice error>{appointmentError(request.error)}</Notice>
      )}
      {result && (
        <div className="space-y-2" role="status">
          <p>Solicitud registrada. Espera la decisión del establecimiento.</p>
          <p className="break-all text-xs">ID: {result.id}</p>
          <Link
            className={secondaryClass}
            to={`/citas/solicitudes/${result.id}`}
          >
            Ver detalle de la solicitud
          </Link>
        </div>
      )}
    </section>
  );
}
