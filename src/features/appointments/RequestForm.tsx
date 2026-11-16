import { useEffect, useRef, useState } from 'react';
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

export function RequestForm({
  owner,
  context,
  slot,
  holdId,
  cached,
}: {
  owner: string;
  context: Availability;
  slot: AvailableSlot;
  holdId: string | null;
  cached: boolean;
}) {
  const online = useOnline();
  const refresh = useRefreshAppointments();
  const [pet, setPet] = useState('');
  const pending = useRef(false);
  const operation = useRef<{ key: string; id: string } | null>(null);
  const key = `${context.service_id}:${slot.assignment_id}:${slot.starts_at}:${context.modality}:${pet}`;
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
        una confirmación de atención.
      </p>
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
          Necesitas conexión estable, cámara y micrófono. Esta versión no
          incluye videollamada; la coordinación se realizará tras la
          confirmación del establecimiento.
        </p>
      )}
      <button
        className="button button-primary"
        disabled={
          !online ||
          cached ||
          !pet ||
          request.isPending ||
          !!result ||
          pets.isError
        }
        onClick={() => {
          if (pending.current) return;
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
        {request.isPending
          ? 'Enviando solicitud…'
          : 'Confirmar solicitud de cita'}
      </button>
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
