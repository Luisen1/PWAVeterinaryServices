import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { z } from 'zod';
import { Notice, secondaryClass } from '@/features/directory/Workspace';
import { appointmentRpc } from '@/features/appointments/requests-api';
import {
  appointmentError,
  type Appointment,
} from '@/features/appointments/requests-model';
import { useOnline } from '@/pwa/useOnline';
import { authClient, withAuthOperation } from '@/features/auth/api';

export function CallPanel({
  appointment: a,
  owner,
}: {
  appointment: Appointment;
  owner: string;
}) {
  const online = useOnline();
  const [host, setHost] = useState('');
  const query = useQuery({
    queryKey: ['call-host', owner, a.id],
    enabled: online && a.modality === 'Virtual',
    retry: false,
    queryFn: async () => {
      const { data, error } = await authClient()
        .from('appointment_call_hosts')
        .select('host_id,professional_id,revision')
        .eq('appointment_id', a.id)
        .maybeSingle();
      if (error) throw error;
      return data as {
        host_id: string;
        professional_id: string;
        revision: number;
      } | null;
    },
  });
  const candidates = useQuery({
    queryKey: ['call-candidates', owner, a.id],
    enabled: online && a.can_decide && a.modality === 'Virtual',
    retry: false,
    queryFn: async () =>
      z
        .array(z.object({ id: z.uuid(), name: z.string() }))
        .parse(await appointmentRpc('call_team_candidates', { p_id: a.id })),
  });
  const save = useMutation({
    mutationFn: () =>
      withAuthOperation(() =>
        appointmentRpc('assign_call_host', {
          p_id: a.id,
          p_host: host,
          p_revision: a.revision,
          p_host_revision: query.data?.revision ?? 0,
        }),
      ),
    onSuccess: () => void query.refetch(),
  });
  if (a.modality !== 'Virtual') return null;
  return (
    <section className="sv-card space-y-3" aria-label="Videollamada de la cita">
      <h2 className="font-semibold">Videollamada privada</h2>
      <p className="text-sm">
        Requiere una cita confirmada y una cuenta asignada al profesional.
        Ventana: desde 10 minutos antes del inicio hasta 15 minutos después del
        fin. Al entrar autorizas cámara y micrófono; no se graba
        automáticamente.
      </p>
      {query.data && query.data.professional_id === a.professional_id ? (
        <p className="text-sm">
          Cuenta profesional asignada
          {query.data.host_id === owner ? ' a tu sesión' : ''}.
        </p>
      ) : (
        <Notice>Falta asignar una cuenta al profesional de esta cita.</Notice>
      )}
      {a.can_decide && ['requested', 'confirmed'].includes(a.status) && (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <label className="block">
            Cuenta que atenderá como {a.snapshot.professional_name}
            <select
              className="sv-input"
              required
              value={host}
              disabled={!online || save.isPending}
              onChange={(e) => setHost(e.target.value)}
            >
              <option value="">Elegir cuenta verificada del equipo</option>
              {candidates.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {c.id.slice(0, 8)}
                </option>
              ))}
            </select>
          </label>
          <p className="text-xs">
            Asigna la cuenta que representa al profesional. Debe ser responsable
            o colaborador con permiso de agenda y distinta de la cuenta
            solicitante.
          </p>
          <button
            className={secondaryClass}
            disabled={!online || !host || save.isPending}
          >
            Asignar cuenta profesional
          </button>
        </form>
      )}
      {(query.isError || candidates.isError || save.isError) && (
        <Notice error>
          {appointmentError(query.error ?? candidates.error ?? save.error)}
        </Notice>
      )}
      {a.status === 'confirmed' &&
        query.data?.professional_id === a.professional_id &&
        (a.owner_id === owner || query.data.host_id === owner) && (
          <Link
            className="button button-primary"
            to={`/citas/solicitudes/${a.id}/videollamada`}
          >
            Ir a la sala de mi cita
          </Link>
        )}
      <p className="text-xs">
        El acceso se vuelve a comprobar en el servidor. Si el establecimiento
        todavía no activó el proveedor, la sala lo indicará y podrás coordinar
        por chat.
      </p>
    </section>
  );
}
