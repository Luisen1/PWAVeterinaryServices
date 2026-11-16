import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { withAuthOperation } from '@/features/auth/api';
import { Notice, secondaryClass } from '@/features/directory/Workspace';
import { useOnline } from '@/pwa/useOnline';
import { appointmentRpc } from './requests-api';
import { appointmentError } from './requests-model';
import { policySchema, useAppointmentPolicy } from './policy-api';

export function PolicyNotice({ establishment }: { establishment: string }) {
  const policy = useAppointmentPolicy(establishment);
  if (policy.isError)
    return (
      <Notice error>
        No pudimos consultar la regla publicada.{' '}
        <button
          className={secondaryClass}
          onClick={() => void policy.refetch()}
        >
          Reintentar reglas de cambios
        </button>
      </Notice>
    );
  return (
    <p className="text-sm">
      {policy.data
        ? `Regla publicada: cancelar hasta ${policy.data.cancel_minutes} min antes del inicio; reprogramar hasta ${policy.data.reschedule_minutes} min antes. El límite es exclusivo; 0 permite cambios antes de comenzar. Se conserva la regla al solicitar.`
        : 'Consulta la regla publicada de cambios antes de enviar la solicitud.'}
    </p>
  );
}
export function AppointmentPolicy({
  establishment,
}: {
  establishment?: string;
}) {
  const [selected, setSelected] = useState(establishment ?? '');
  const online = useOnline();
  const workspaces = useQuery({
    queryKey: ['policy-workspaces'],
    enabled: online,
    retry: false,
    queryFn: async () =>
      z
        .array(
          z.object({
            id: z.uuid(),
            name: z.string(),
            permissions: z.array(z.string()),
          }),
        )
        .parse(await appointmentRpc('offering_workspaces', {})),
  });
  const allowed =
    workspaces.data?.filter((w) => w.permissions.includes('schedule')) ?? [];
  const id = establishment ?? selected;
  const policy = useAppointmentPolicy(id);
  return (
    <section className="sv-card space-y-3">
      <h2 className="font-semibold">Reglas publicadas de cambios</h2>
      {!establishment && (
        <label>
          Establecimiento
          <select
            className="sv-input"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            <option value="">Elegir establecimiento autorizado</option>
            {allowed.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {policy.isError && (
        <Notice error>No pudimos consultar las reglas.</Notice>
      )}
      {allowed.some((w) => w.id === id) && policy.data && (
        <PolicyEditor
          key={`${id}:${policy.data.revision}`}
          id={id}
          policy={policy.data}
          refresh={() => void policy.refetch()}
          online={online}
        />
      )}
    </section>
  );
}
function PolicyEditor({
  id,
  policy,
  refresh,
  online,
}: {
  id: string;
  policy: z.infer<typeof policySchema>;
  refresh: () => void;
  online: boolean;
}) {
  const [cancel, setCancel] = useState(policy.cancel_minutes);
  const [reschedule, setReschedule] = useState(policy.reschedule_minutes);
  const save = useMutation({
    mutationFn: () =>
      withAuthOperation(() =>
        appointmentRpc('save_appointment_policy', {
          p_establishment: id,
          p_cancel: cancel,
          p_reschedule: reschedule,
          p_revision: policy.revision,
        }),
      ),
    onSuccess: refresh,
  });
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <p className="text-sm">
        Minutos mínimos antes del inicio (0–10080). Solo se aplica a nuevas
        solicitudes; las existentes conservan su regla.
      </p>
      <label className="block">
        Anticipación para cancelar (minutos)
        <input
          className="sv-input"
          type="number"
          min={0}
          max={10080}
          required
          value={cancel}
          onChange={(e) => setCancel(e.target.valueAsNumber)}
        />
      </label>
      <label className="block">
        Anticipación para reprogramar (minutos)
        <input
          className="sv-input"
          type="number"
          min={0}
          max={10080}
          required
          value={reschedule}
          onChange={(e) => setReschedule(e.target.valueAsNumber)}
        />
      </label>
      <button className={secondaryClass} disabled={!online || save.isPending}>
        Publicar regla
      </button>
      {save.isError && <Notice error>{appointmentError(save.error)}</Notice>}
    </form>
  );
}
