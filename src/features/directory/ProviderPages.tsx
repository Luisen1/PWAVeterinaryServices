import { useQuery } from '@tanstack/react-query';
import { Link, useParams, useSearchParams } from 'react-router';
import { authClient } from '@/features/auth/api';
import { useOnline } from '@/pwa/useOnline';
import { statusLabels, type Decision, type Establishment } from './model';
import { dataError } from './api';
import {
  cardClass,
  Notice,
  secondaryClass,
  Verified,
  Workspace,
} from './Workspace';
import { EstablishmentForm } from './EstablishmentForm';
import {
  DecisionHistory,
  EstablishmentDetails,
  PublicLink,
} from './EstablishmentDetails';
import { Icon } from '@/components/ui/Icon';

export function ProviderPage() {
  return (
    <Workspace
      title="Mis establecimientos"
      description="Registra tu establecimiento, consulta decisiones y envía cambios para su publicación."
    >
      <Verified>{(userId) => <ProviderContent userId={userId} />}</Verified>
    </Workspace>
  );
}
function ProviderContent({ userId }: { userId: string }) {
  const online = useOnline();
  const [params] = useSearchParams();
  const rows = useQuery({
    queryKey: ['establishments', userId],
    enabled: online,
    queryFn: async ({ signal }) => {
      const { data, error } = await authClient()
        .from('establishments')
        .select('*,establishment_decisions(*)')
        .eq('owner_id', userId)
        .order('created_at', { ascending: false })
        .abortSignal(signal);
      if (error) throw error;
      return data as (Establishment & {
        establishment_decisions: Decision[];
      })[];
    },
  });
  return (
    <div className="space-y-6">
      {params.get('enviado') && (
        <Notice>
          Solicitud enviada a revisión. La información nueva aparecerá
          públicamente después de su aprobación.
        </Notice>
      )}
      <nav
        aria-label="Atención del establecimiento"
        className="flex flex-wrap gap-3"
      >
        <Link to="/oferentes/citas" className="button button-primary">
          <Icon name="calendar" />
          Solicitudes de citas
        </Link>
        <Link to="/oferentes/agenda" className={secondaryClass}>
          <Icon name="clock" />
          Agenda del establecimiento
        </Link>
        <Link to="/oferentes/mensajes" className={secondaryClass}>
          <Icon name="mail" />
          Chats del establecimiento
        </Link>
      </nav>
      <div className="flex flex-wrap gap-3">
        <Link to="/oferentes/servicios" className={secondaryClass}>
          Servicios, disponibilidad e invitaciones
        </Link>
        <Link to="/oferentes/nuevo" className={secondaryClass}>
          <Icon name="plus" />
          Registrar establecimiento
        </Link>
        <button
          disabled={!online}
          className={secondaryClass}
          onClick={() => void rows.refetch()}
        >
          <Icon name="refresh" />
          Actualizar establecimientos
        </button>
      </div>
      {rows.isPending && online && (
        <Notice>Cargando tus establecimientos…</Notice>
      )}
      {rows.isError && <Notice error>{dataError(rows.error)}</Notice>}
      {rows.data?.length === 0 && (
        <div className={`${cardClass} empty-state`}>
          <span className="empty-state__icon">
            <Icon name="store" />
          </span>
          <p>Aún no has registrado establecimientos.</p>
          <p className="text-sm text-stone-600">
            Prepara nombre, categoría, contacto y la ubicación de tu primera
            sede.
          </p>
        </div>
      )}
      {rows.data?.map((row) => (
        <article key={row.id} className={cardClass}>
          <p
            className={`status-badge ${row.status === 'approved' ? '' : row.status === 'rejected' ? 'status-badge--rejected' : 'status-badge--pending'}`}
          >
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
          <Link className={secondaryClass} to={`/oferentes/${row.id}/editar`}>
            Editar y enviar a revisión
          </Link>
          <div>
            <PublicLink id={row.id} />
          </div>
          <Link
            className={secondaryClass}
            to={`/oferentes/${row.id}/servicios`}
          >
            Administrar servicios y disponibilidad
          </Link>
        </article>
      ))}
    </div>
  );
}
export function ProviderEditPage() {
  const { id } = useParams();
  return (
    <Workspace
      title={id ? 'Editar establecimiento' : 'Registrar establecimiento'}
      description="Completa los datos y verifica la ubicación de cada sede. Administración revisará la solicitud antes de publicarla."
    >
      <Verified>
        {(userId) =>
          id ? (
            <LoadEditor userId={userId} id={id} />
          ) : (
            <EstablishmentForm userId={userId} />
          )
        }
      </Verified>
    </Workspace>
  );
}
function LoadEditor({ userId, id }: { userId: string; id: string }) {
  const online = useOnline();
  const row = useQuery({
    queryKey: ['establishment-edit', userId, id],
    staleTime: 0,
    enabled: online,
    queryFn: async ({ signal }) => {
      const { data, error } = await authClient()
        .from('establishments')
        .select('*')
        .eq('id', id)
        .eq('owner_id', userId)
        .abortSignal(signal)
        .single();
      if (error) throw error;
      return data as Establishment;
    },
  });
  if (row.isError)
    return (
      <div className={cardClass}>
        <Notice error>
          No se encontró un establecimiento que puedas editar.
        </Notice>
        <button
          className={secondaryClass}
          disabled={!online}
          onClick={() => void row.refetch()}
        >
          Reintentar
        </button>
      </div>
    );
  if (!row.data) return <Notice>Cargando solicitud…</Notice>;
  return (
    <EstablishmentForm
      key={`${id}-${row.data.revision}`}
      userId={userId}
      establishment={row.data}
    />
  );
}
