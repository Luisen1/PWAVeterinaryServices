import { useAccountRole } from './useAccountRole';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { authClient, withAuthOperation } from '@/features/auth/api';
import { submitClass } from '@/features/auth/components/AuthFrame';
import { useOnline } from '@/pwa/useOnline';
import { statusLabels, type Decision, type Establishment } from './model';
import { dataError } from './api';
import {
  cardClass,
  fieldClass,
  Notice,
  secondaryClass,
  Verified,
  Workspace,
} from './Workspace';
import { DecisionHistory, EstablishmentDetails } from './EstablishmentDetails';

export function AdminPage() {
  return (
    <Workspace
      title="Revisión de oferentes"
      description="Verifica identidad, contacto y ubicación antes de publicar. Cada decisión conserva responsable, fecha y motivo."
    >
      <Verified>{(userId) => <AdminContent userId={userId} />}</Verified>
    </Workspace>
  );
}
function AdminContent({ userId }: { userId: string }) {
  const role = useAccountRole();
  const online = useOnline();
  const [status, setStatus] = useState('pending');
  const rows = useQuery({
    queryKey: ['admin-establishments', userId, status],
    enabled: role.data === 'admin' && online,
    queryFn: async ({ signal }) => {
      const { data, error } = await authClient()
        .from('establishments')
        .select('*,establishment_decisions(*)')
        .eq('status', status)
        .order('updated_at')
        .abortSignal(signal);
      if (error) throw error;
      return data as (Establishment & {
        establishment_decisions: Decision[];
      })[];
    },
  });
  if (role.isPending)
    return <Notice>Comprobando permisos administrativos…</Notice>;
  if (role.isError)
    return (
      <div className={cardClass}>
        <Notice error>No pudimos consultar tus permisos.</Notice>
        <button className={secondaryClass} onClick={() => void role.refetch()}>
          Reintentar
        </button>
      </div>
    );
  if (role.data !== 'admin')
    return (
      <Notice error>
        Esta sección requiere una cuenta administradora autorizada.
      </Notice>
    );
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3">
        <label className="grow text-sm font-medium">
          Estado de solicitudes
          <select
            className={`${fieldClass} mt-2`}
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            {Object.entries(statusLabels).map(([key, value]) => (
              <option key={key} value={key}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <button
          className={secondaryClass}
          disabled={!online || rows.isFetching}
          onClick={() => void rows.refetch()}
        >
          Actualizar revisión
        </button>
      </div>
      {rows.isPending && online && <Notice>Cargando solicitudes…</Notice>}
      {rows.isError && <Notice error>{dataError(rows.error)}</Notice>}
      {rows.data?.length === 0 && (
        <div className={cardClass}>
          <p>No hay solicitudes en este estado.</p>
        </div>
      )}
      {rows.data?.map((row) => (
        <article
          key={`${row.id}-${row.revision}-${row.status}`}
          className={cardClass}
        >
          <p className="text-xs font-semibold text-amber-900">
            {statusLabels[row.status]} · Revisión {row.revision}
          </p>
          <EstablishmentDetails
            document={row.document}
            updatedAt={row.updated_at}
          />
          <DecisionHistory
            decisions={[...row.establishment_decisions].sort((a, b) =>
              b.decided_at.localeCompare(a.decided_at),
            )}
          />
          {row.status === 'pending' && <ReviewForm row={row} />}
        </article>
      ))}
    </div>
  );
}
function ReviewForm({ row }: { row: Establishment }) {
  const online = useOnline();
  const client = useQueryClient();
  const [decision, setDecision] = useState<
    'approved' | 'rejected' | 'changes_requested'
  >('changes_requested');
  const [reason, setReason] = useState('');
  const [checked, setChecked] = useState(false);
  const [invalid, setInvalid] = useState('');
  const mutation = useMutation({
    mutationFn: () =>
      withAuthOperation(async () => {
        const { error } = await authClient().rpc('review_establishment', {
          p_id: row.id,
          p_revision: row.revision,
          p_decision: decision,
          p_reason: reason.trim(),
        });
        if (error) throw error;
      }),
    onSuccess: async () => {
      await Promise.all(
        [
          'admin-establishments',
          'establishments',
          'public-establishments',
          'public-establishment',
          'account-role',
        ].map((key) => client.invalidateQueries({ queryKey: [key] })),
      );
    },
  });
  return (
    <form
      className="space-y-4 border-t border-stone-200 pt-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (decision !== 'approved' && reason.trim().length < 5) {
          setInvalid('Explica el motivo con al menos cinco caracteres.');
          return;
        }
        if (decision === 'approved' && !checked) {
          setInvalid('Verifica primero los datos de la solicitud.');
          return;
        }
        setInvalid('');
        mutation.mutate();
      }}
    >
      <label className="block text-sm font-medium">
        Decisión
        <select
          aria-label="Decisión"
          className={`${fieldClass} mt-2`}
          value={decision}
          disabled={mutation.isPending}
          onChange={(event) =>
            setDecision(event.target.value as typeof decision)
          }
        >
          <option value="changes_requested">Solicitar corrección</option>
          <option value="rejected">Rechazar solicitud</option>
          <option value="approved">Aprobar y publicar</option>
        </select>
      </label>
      <label className="block text-sm font-medium">
        Motivo de la decisión
        <textarea
          className={`${fieldClass} mt-2 min-h-28`}
          maxLength={2000}
          value={reason}
          disabled={mutation.isPending}
          onChange={(event) => setReason(event.target.value)}
          required={decision !== 'approved'}
        />
      </label>
      {decision === 'approved' && (
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-1 size-4 shrink-0"
            checked={checked}
            disabled={mutation.isPending}
            onChange={(event) => setChecked(event.target.checked)}
          />
          Verifiqué identidad, contacto y coordenadas de todas las sedes.
        </label>
      )}
      {invalid && <Notice error>{invalid}</Notice>}
      {mutation.isError && <Notice error>{dataError(mutation.error)}</Notice>}
      <button className={submitClass} disabled={!online || mutation.isPending}>
        {mutation.isPending ? 'Registrando decisión…' : 'Confirmar decisión'}
      </button>
    </form>
  );
}
