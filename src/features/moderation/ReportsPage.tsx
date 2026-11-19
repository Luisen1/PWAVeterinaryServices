import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useQuery, useMutation } from '@tanstack/react-query';
import { z } from 'zod';
import {
  Workspace,
  Verified,
  Notice,
  cardClass,
  secondaryClass,
  fieldClass,
} from '@/features/directory/Workspace';
import { appointmentRpc } from '@/features/appointments/requests-api';
import { useAccountContext } from '@/features/auth/useAccountContext';
import { useOnline } from '@/pwa/useOnline';
import { acquireReloadBlock } from '@/pwa/reload-safety';
import { authClient } from '@/features/auth/api';
import {
  reportPage,
  reportDetail,
  reportStatuses,
  decisionLabels,
  reportCategories,
  reportError,
  type ReportRow,
  type ReportDetail,
} from './api';
export function ReportsPage({ admin = false }: { admin?: boolean }) {
  return (
    <Workspace
      title={admin ? 'Reportes y moderación' : 'Mis reportes'}
      description={
        admin
          ? 'Revisa referencias concretas y documenta cada decisión.'
          : 'Consulta las referencias enviadas y sus decisiones.'
      }
    >
      <Verified>
        {(owner) => <ReportList key={owner} owner={owner} admin={admin} />}
      </Verified>
    </Workspace>
  );
}
function ReportList({ owner, admin }: { owner: string; admin: boolean }) {
  const context = useAccountContext(),
    online = useOnline(),
    navigate = useNavigate();
  const [cursors, setCursors] = useState<(ReportRow | null)[]>([null]);
  const allowed = !admin || context.data?.role === 'admin';
  const query = useQuery({
    queryKey: ['reports', owner, admin, cursors.at(-1)?.id],
    queryFn: () => reportPage(admin ? 'admin' : 'mine', cursors.at(-1) ?? null),
    enabled: online && allowed,
    retry: false,
  });
  const open = useMutation({
    mutationFn: (row: ReportRow) =>
      appointmentRpc('open_report', { p_id: row.id, p_revision: row.revision }),
    onSuccess: (_data, row) =>
      void navigate(`/administracion/reportes/${row.id}`),
    onError: () => void query.refetch(),
  });
  if (!allowed) return <Notice>Requiere una cuenta administradora.</Notice>;
  return (
    <div className="space-y-4">
      <button
        className={secondaryClass}
        disabled={!online || query.isFetching}
        onClick={() => void query.refetch()}
      >
        Actualizar reportes
      </button>
      {!online && (
        <Notice>
          La bandeja requiere conexión; no se guarda evidencia privada en este
          dispositivo.
        </Notice>
      )}
      {query.isPending && online && <Notice>Consultando reportes…</Notice>}
      {query.isError && (
        <Notice error>No se pudieron consultar los reportes.</Notice>
      )}
      {open.isError && <Notice error>{reportError(open.error)}</Notice>}
      {query.data?.length === 0 && (
        <Notice>No hay reportes en esta página.</Notice>
      )}
      {query.data?.map((row) => (
        <article key={row.id} className={`${cardClass} space-y-3`}>
          <h2 className="font-semibold">
            {row.kind === 'message' ? 'Mensaje reportado' : 'Ficha reportada'}
          </h2>
          <p>
            {reportCategories[row.category]} · {reportStatuses[row.status]}
          </p>
          <p className="text-sm">Referencia: {row.id}</p>
          <p className="text-sm">
            {new Date(row.created_at).toLocaleString('es-CO', {
              timeZone: 'America/Bogota',
            })}{' '}
            · America/Bogota
          </p>
          {admin ? (
            <button
              className={secondaryClass}
              disabled={open.isPending || !online}
              onClick={() => open.mutate(row)}
            >
              Abrir revisión autorizada
            </button>
          ) : (
            <Link className={secondaryClass} to={`/reportes/${row.id}`}>
              Ver estado del reporte
            </Link>
          )}
        </article>
      ))}
      <div className="flex flex-wrap gap-2">
        <button
          className={secondaryClass}
          disabled={cursors.length === 1 || query.isFetching}
          onClick={() => setCursors((p) => p.slice(0, -1))}
        >
          Página anterior
        </button>
        <button
          className={secondaryClass}
          disabled={query.data?.length !== 30 || query.isFetching}
          onClick={() => setCursors((p) => [...p, query.data!.at(-1)!])}
        >
          Siguiente página
        </button>
      </div>
    </div>
  );
}
export function ReportDetailsPage({ admin = false }: { admin?: boolean }) {
  const { id } = useParams();
  return (
    <Workspace
      title="Detalle del reporte"
      description="Referencia, evidencia autorizada y trazabilidad de la decisión."
    >
      <Link
        className={secondaryClass}
        to={admin ? '/administracion/reportes' : '/reportes'}
      >
        Volver a reportes
      </Link>
      <Verified>
        {(owner) =>
          z.uuid().safeParse(id).success ? (
            <Detail owner={owner} id={id!} />
          ) : (
            <Notice error>Referencia no válida.</Notice>
          )
        }
      </Verified>
    </Workspace>
  );
}
function Detail({ owner, id }: { owner: string; id: string }) {
  const online = useOnline();
  const query = useQuery({
    queryKey: ['report-detail', owner, id],
    queryFn: () => reportDetail(id),
    enabled: online,
    retry: false,
  });
  return (
    <div className="space-y-4">
      <button
        className={secondaryClass}
        disabled={!online || query.isFetching}
        onClick={() => void query.refetch()}
      >
        Actualizar detalle
      </button>
      {query.isPending && online && <Notice>Consultando referencia…</Notice>}
      {!online && (
        <Notice>
          Conéctate para comprobar el acceso al detalle del reporte.
        </Notice>
      )}
      {query.isError && (
        <Notice error>
          Sin acceso o reporte no disponible. Administración debe abrir una
          revisión desde la bandeja antes de consultar evidencia privada.
        </Notice>
      )}
      {online && !query.isError && query.data && (
        <>
          <article className={`${cardClass} space-y-3`}>
            <h2 className="font-semibold">
              {reportStatuses[query.data.status]}
            </h2>
            <p>Referencia: {id}</p>
            <p>{query.data.reason}</p>
            {query.data.decision && (
              <p>
                Decisión: {decisionLabels[query.data.decision]}.{' '}
                {query.data.decision_reason}
              </p>
            )}
          </article>
          {query.data.can_review && query.data.status === 'reviewing' && (
            <Evidence report={query.data} />
          )}
          {query.data.can_review &&
            (query.data.status === 'reviewing' ||
              query.data.decision === 'suspended') && (
              <Decision report={query.data} onSaved={() => query.refetch()} />
            )}
          <section className={`${cardClass} space-y-2`}>
            <h2 className="font-semibold">Historial de revisión</h2>
            {query.data.events.map((event, index) => (
              <p key={index} className="text-sm">
                {event.kind} · {event.reason} ·{' '}
                {new Date(event.created_at).toLocaleString('es-CO', {
                  timeZone: 'America/Bogota',
                })}
              </p>
            ))}
          </section>
        </>
      )}
    </div>
  );
}
function Evidence({ report }: { report: ReportDetail }) {
  const file = useMutation({
    mutationFn: async () => {
      const { data, error } = await authClient().functions.invoke(
        'chat-media',
        { body: { action: 'moderation_download', id: report.id } },
      );
      if (error) throw error;
      return data as Blob;
    },
  });
  // La evidencia no se descarga automáticamente. Se entrega como archivo bajo acción explícita.
  async function download() {
    const blob = await file.mutateAsync();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'evidencia-reporte';
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <section className={`${cardClass} space-y-3`}>
      <h2 className="font-semibold">Evidencia mínima autorizada</h2>
      <p className="text-sm">
        Este acceso queda registrado. No permite navegar por la conversación.
      </p>
      {report.kind === 'message' ? (
        <>
          <p className="whitespace-pre-wrap">
            {String(
              report.evidence?.body ??
                'Mensaje sin texto o contenido retirado.',
            )}
          </p>
          {!!report.evidence?.media && (
            <button
              className={secondaryClass}
              disabled={file.isPending}
              onClick={() => void download().catch(() => {})}
            >
              Descargar archivo de este mensaje
            </button>
          )}
        </>
      ) : (
        <p>
          Ficha pública de referencia:{' '}
          {String(report.evidence?.name ?? 'Información retirada')}
        </p>
      )}
      {file.isError && (
        <Notice error>No se pudo recuperar el archivo de evidencia.</Notice>
      )}
    </section>
  );
}
function Decision({
  report,
  onSaved,
}: {
  report: ReportDetail;
  onSaved: () => Promise<unknown>;
}) {
  const online = useOnline();
  const [action, setAction] = useState<keyof typeof decisionLabels>(
    report.status === 'resolved' ? 'restored' : 'dismissed',
  );
  const [reason, setReason] = useState('');
  const publication = report.publication;
  const [phone, setPhone] = useState(publication?.document.phone ?? '');
  const [email, setEmail] = useState(publication?.document.email ?? '');
  const [site, setSite] = useState(publication?.document.sites[0]?.id ?? '');
  const [address, setAddress] = useState(
    publication?.document.sites[0]?.address ?? '',
  );
  const [basis] = useState(publication?.revision ?? null);
  useEffect(() => {
    if (reason) return acquireReloadBlock('decisión de moderación sin guardar');
  }, [reason]);
  const mutation = useMutation({
    mutationFn: () =>
      appointmentRpc('resolve_report', {
        p_id: report.id,
        p_revision: report.revision,
        p_action: action,
        p_reason: reason,
        p_publication_revision: basis,
        p_correction:
          action === 'corrected'
            ? { phone, email, site_id: site, site_address: address }
            : {},
      }),
    onSuccess: async () => {
      setReason('');
      await onSaved();
    },
  });
  return (
    <form
      className={`${cardClass} space-y-4`}
      onSubmit={(e) => {
        e.preventDefault();
        mutation.mutate();
      }}
    >
      <h2 className="font-semibold">Decisión administrativa</h2>
      <label className="block">
        Decisión
        <select
          className={fieldClass}
          value={action}
          onChange={(e) =>
            setAction(e.target.value as keyof typeof decisionLabels)
          }
          disabled={mutation.isPending}
        >
          {Object.entries(decisionLabels)
            .filter(([key]) =>
              report.status === 'resolved'
                ? key === 'restored'
                : key !== 'restored',
            )
            .map(([key, label]) => (
              <option
                key={key}
                value={key}
                disabled={
                  key === 'corrected' &&
                  (!publication?.can_correct || report.kind !== 'establishment')
                }
              >
                {label}
              </option>
            ))}
        </select>
      </label>
      {action === 'corrected' && (
        <>
          <Notice>
            Corrige únicamente datos comprobados. Una edición pendiente o una
            revisión distinta impide sobrescribir la ficha.
          </Notice>
          <label className="block">
            Teléfono del establecimiento
            <input
              className={fieldClass}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
            />
          </label>
          <label className="block">
            Correo del establecimiento
            <input
              className={fieldClass}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label className="block">
            Sede de la corrección
            <select
              className={fieldClass}
              value={site}
              onChange={(e) => {
                setSite(e.target.value);
                setAddress(
                  publication?.document.sites.find(
                    (s) => s.id === e.target.value,
                  )?.address ?? '',
                );
              }}
            >
              {publication?.document.sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            Dirección corregida
            <input
              className={fieldClass}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              required
              minLength={5}
            />
          </label>
        </>
      )}
      {action === 'suspended' && (
        <Notice>
          {report.kind === 'message'
            ? 'Suspende nuevos mensajes y archivos. Los participantes conservan lectura del historial.'
            : 'Retira la ficha pública y nuevas reservas. Las citas existentes conservan su estado y requieren gestión separada.'}
        </Notice>
      )}
      {action === 'restored' && (
        <Notice>
          Levanta esta suspensión. Una ficha retirada requiere nueva revisión
          para publicarse; no se republica automáticamente.
        </Notice>
      )}
      <label className="block">
        Motivo documentado de la decisión
        <textarea
          className={fieldClass}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          minLength={10}
          maxLength={1000}
          rows={4}
          required
          disabled={mutation.isPending}
        />
      </label>
      <button
        className="button button-primary"
        disabled={!online || mutation.isPending || reason.trim().length < 10}
      >
        {mutation.isPending
          ? 'Aplicando decisión…'
          : 'Aplicar decisión y conservar trazabilidad'}
      </button>
      {mutation.isError && <Notice error>{reportError(mutation.error)}</Notice>}
    </form>
  );
}
