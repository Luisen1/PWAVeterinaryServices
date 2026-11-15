import { useEffect, useId, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import { authClient, withAuthOperation } from '@/features/auth/api';
import { categories, species, weekdays } from '@/features/directory/model';
import { dataError } from '@/features/directory/api';
import {
  cardClass,
  fieldClass,
  Notice,
  secondaryClass,
  Verified,
  Workspace,
} from '@/features/directory/Workspace';
import { useOnline } from '@/pwa/useOnline';
import { acquireReloadBlock } from '@/pwa/reload-safety';
import {
  blankDocument,
  itemSchemas,
  modalities,
  permissions,
  permissionLabels,
  type Invitation,
  type Item,
  type Kind,
  type OfferingWorkspace,
  type Documents,
} from './model';
import { getSlots, offeringRpc, saveItem } from './api';

const labels: Record<Kind, string> = {
  service: 'Servicios',
  professional: 'Profesionales',
  resource: 'Recursos',
  assignment: 'Asignaciones',
  shift: 'Jornadas',
  block: 'Bloqueos y cierres',
};
const singular: Record<Kind, string> = {
  service: 'servicio',
  professional: 'profesional',
  resource: 'recurso',
  assignment: 'asignación',
  shift: 'jornada',
  block: 'bloqueo',
};

function useUnsavedOffering(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const release = acquireReloadBlock(
      'configuración de servicios sin guardar',
    );
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => {
      release();
      window.removeEventListener('beforeunload', warn);
    };
  }, [dirty]);
}

export function OfferingsPage() {
  const { id } = useParams();
  return (
    <Workspace
      title="Servicios y disponibilidad"
      description="Configura el catálogo, tu equipo y los horarios de atención de cada sede."
    >
      <Link to="/oferentes" className={secondaryClass}>
        Mis establecimientos
      </Link>
      <Verified>
        {(userId) => <OfferingContent userId={userId} establishmentId={id} />}
      </Verified>
    </Workspace>
  );
}

function OfferingContent({
  userId,
  establishmentId,
}: {
  userId: string;
  establishmentId?: string;
}) {
  const online = useOnline();
  const cache = useQueryClient();
  const [selection, setSelection] = useState(establishmentId ?? '');
  const workspaces = useQuery({
    queryKey: ['offering-workspaces', userId],
    enabled: online,
    queryFn: () => offeringRpc<OfferingWorkspace[]>('offering_workspaces'),
  });
  const invitations = useQuery({
    queryKey: ['offering-invitations', userId],
    enabled: online,
    queryFn: () => offeringRpc<Invitation[]>('offering_invitations'),
  });
  const accept = useMutation({
    mutationFn: (invite: Invitation) =>
      withAuthOperation(() =>
        offeringRpc('manage_offering_invitation', {
          p_establishment: invite.establishment_id,
          p_action: 'accept',
          p_id: invite.id,
        }),
      ),
    onSuccess: async () => {
      await Promise.all([
        cache.invalidateQueries({ queryKey: ['offering-workspaces', userId] }),
        cache.invalidateQueries({ queryKey: ['offering-invitations', userId] }),
      ]);
    },
  });
  const selected = workspaces.data?.find(
    (w) => w.id === (selection || workspaces.data?.[0]?.id),
  );
  const pending = invitations.data?.filter(
    (i) =>
      i.status === 'pending' &&
      i.user_id !== userId &&
      !workspaces.data?.some((w) => w.id === i.establishment_id && w.owner),
  );
  return (
    <div className="space-y-5">
      <button
        className={secondaryClass}
        disabled={!online}
        onClick={() => {
          void workspaces.refetch();
          void invitations.refetch();
        }}
      >
        Actualizar accesos
      </button>
      {workspaces.isPending && online && (
        <Notice>Cargando establecimientos y permisos…</Notice>
      )}
      {(workspaces.isError || invitations.isError) && (
        <Notice error>
          {dataError(workspaces.error ?? invitations.error)}
        </Notice>
      )}
      {accept.isError && <Notice error>{dataError(accept.error)}</Notice>}
      {pending?.map((invite) => (
        <article className={cardClass} key={invite.id}>
          <h2 className="font-semibold">
            Invitación a {invite.establishment_name}
          </h2>
          <p>
            Permisos:{' '}
            {invite.permissions
              .map((p) => permissionLabels[p as keyof typeof permissionLabels])
              .join(', ')}
          </p>
          <p className="text-sm">
            Vence:{' '}
            {new Date(invite.expires_at).toLocaleString('es-CO', {
              timeZone: 'America/Bogota',
            })}{' '}
            · America/Bogota
          </p>
          <button
            className={secondaryClass}
            disabled={!online || accept.isPending}
            onClick={() => accept.mutate(invite)}
          >
            Aceptar vinculación
          </button>
        </article>
      ))}
      {workspaces.data?.length === 0 && (
        <Notice>
          Registra un establecimiento o acepta una invitación para configurar
          servicios.
        </Notice>
      )}
      {!!workspaces.data?.length && (
        <label className="block">
          Establecimiento a configurar
          <select
            aria-label="Establecimiento a configurar"
            className={fieldClass}
            value={selection || workspaces.data[0]!.id}
            onChange={(e) => setSelection(e.target.value)}
          >
            {workspaces.data.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {establishmentId &&
        workspaces.isSuccess &&
        !workspaces.data.some((w) => w.id === establishmentId) && (
          <Notice error>No tienes acceso a la configuración solicitada.</Notice>
        )}
      {selected && (
        <OfferingManager
          key={selected.id}
          workspace={selected}
          userId={userId}
          invitations={
            invitations.data?.filter(
              (i) => i.establishment_id === selected.id,
            ) ?? []
          }
        />
      )}
    </div>
  );
}

function OfferingManager({
  workspace,
  userId,
  invitations,
}: {
  workspace: OfferingWorkspace;
  userId: string;
  invitations: Invitation[];
}) {
  const online = useOnline();
  const cache = useQueryClient();
  const [kind, setKind] = useState<Kind>('service');
  const [editing, setEditing] = useState<Item | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const rows = useQuery({
    queryKey: ['offering-items', userId, workspace.id],
    enabled: online,
    queryFn: async ({ signal }) => {
      const { data, error } = await authClient()
        .from('offering_items')
        .select('*')
        .eq('establishment_id', workspace.id)
        .order('updated_at', { ascending: false })
        .abortSignal(signal);
      if (error) throw error;
      return data as Item[];
    },
  });
  const allowed = workspace.permissions.includes(
    kind === 'service' ? 'services' : 'schedule',
  );
  const items = rows.data ?? [];
  const refresh = async () => {
    await Promise.all([
      cache.invalidateQueries({
        queryKey: ['offering-items', userId, workspace.id],
      }),
      cache.invalidateQueries({ queryKey: ['offering-slots'] }),
      cache.invalidateQueries({ queryKey: ['public-services'] }),
    ]);
  };
  return (
    <div className="space-y-5">
      <Notice>
        Los cambios se confirman al guardar con conexión. Los servicios
        desactivados conservan sus referencias históricas. Las reservas se
        incorporarán en la fase de citas.
      </Notice>
      <nav className="category-chips" aria-label="Configurar catálogo y agenda">
        {(Object.keys(labels) as Kind[]).map((k) => (
          <button
            className="category-chip"
            aria-pressed={kind === k}
            key={k}
            onClick={() => {
              setKind(k);
              setEditing(null);
              setFormOpen(false);
            }}
          >
            {labels[k]}
          </button>
        ))}
      </nav>
      <div className="flex flex-wrap gap-3">
        {allowed && (
          <button
            className={secondaryClass}
            disabled={!online || !rows.isSuccess}
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            Crear {singular[kind]}
          </button>
        )}
        <button
          className={secondaryClass}
          disabled={!online}
          onClick={() => void rows.refetch()}
        >
          Recargar configuración
        </button>
      </div>
      {rows.isPending && online && <Notice>Cargando configuración…</Notice>}
      {rows.isError && <Notice error>{dataError(rows.error)}</Notice>}
      {!allowed && (
        <Notice>
          Tu acceso permite consultar esta sección. El responsable asigna los
          permisos de edición.
        </Notice>
      )}
      {formOpen && allowed && (
        <ItemEditor
          key={`${kind}-${editing?.id ?? 'new'}-${editing?.revision ?? 0}`}
          kind={kind}
          existing={editing}
          workspace={workspace}
          items={items}
          onSaved={refresh}
          onClose={() => {
            setEditing(null);
            setFormOpen(false);
          }}
        />
      )}
      {rows.isSuccess && items.filter((i) => i.kind === kind).length === 0 && (
        <Notice>
          Aún no hay {labels[kind].toLocaleLowerCase('es')} configurados.
        </Notice>
      )}
      <div className="space-y-3">
        {items
          .filter((i) => i.kind === kind)
          .map((item) => (
            <article className={cardClass} key={item.id}>
              <h2 className="font-semibold">{itemTitle(item, items)}</h2>
              <p className="text-sm">
                {item.document.active ? 'Activo' : 'Desactivado'} · Revisión{' '}
                {item.revision}
              </p>
              <ItemSummary item={item} workspace={workspace} />
              {allowed && (
                <button
                  className={secondaryClass}
                  disabled={!online}
                  onClick={() => {
                    setEditing(item);
                    setFormOpen(true);
                  }}
                >
                  Editar {itemTitle(item, items)}
                </button>
              )}
            </article>
          ))}
      </div>
      <AvailabilityPreview items={items} />
      {workspace.owner && (
        <Collaborators
          workspace={workspace}
          userId={userId}
          invitations={invitations}
        />
      )}
    </div>
  );
}

function itemTitle(item: Item, items: Item[]): string {
  const named = (id: string) => {
    const linked = items.find((i) => i.id === id);
    return linked && 'name' in linked.document
      ? linked.document.name
      : 'Registro no disponible';
  };
  switch (item.kind) {
    case 'service':
    case 'professional':
    case 'resource':
      return item.document.name;
    case 'assignment':
      return `${named(item.document.service_id)} · ${named(item.document.professional_id)} · ${named(item.document.resource_id)}`;
    case 'shift':
      return `${named(item.document.professional_id)} · ${weekdays[item.document.day]} ${item.document.start}–${item.document.end}${item.document.next_day ? ' (+1 día)' : ''}`;
    case 'block':
      return item.document.reason;
  }
}
function ItemSummary({
  item,
  workspace,
}: {
  item: Item;
  workspace: OfferingWorkspace;
}) {
  const d = item.document;
  return (
    <div className="my-3 space-y-1 text-sm">
      {'site_id' in d && (
        <p>{workspace.sites.find((s) => s.id === d.site_id)?.name}</p>
      )}
      {item.kind === 'service' && (
        <>
          <p>
            {item.document.category} · {item.document.duration} min ·{' '}
            {item.document.modality} · {item.document.species.join(', ')}
          </p>
          <p className="whitespace-pre-wrap break-words">
            {item.document.description}
          </p>
          <p>
            {item.document.price === null
              ? 'Precio a consultar'
              : `${new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 2 }).format(item.document.price)} · informativo`}
          </p>
        </>
      )}
      {'modalities' in d && <p>Modalidades: {d.modalities.join(', ')}</p>}
      {'species' in d && item.kind !== 'service' && (
        <p>Especies: {d.species.join(', ')}</p>
      )}
      {item.kind === 'block' && (
        <p>
          {item.document.start_date} {item.document.start} a{' '}
          {item.document.end_date} {item.document.end} ·{' '}
          {
            workspace.sites.find((s) => s.id === item.document.site_id)
              ?.timezone
          }
          {item.document.professional_id
            ? ' · Un profesional'
            : ' · Toda la sede'}
        </p>
      )}
    </div>
  );
}

function ItemEditor({
  kind,
  existing,
  workspace,
  items,
  onSaved,
  onClose,
}: {
  kind: Kind;
  existing: Item | null;
  workspace: OfferingWorkspace;
  items: Item[];
  onSaved: () => Promise<void>;
  onClose: () => void;
}) {
  const online = useOnline();
  const prefix = useId();
  const [id] = useState(() => existing?.id ?? crypto.randomUUID());
  const [revision, setRevision] = useState<number | null>(
    existing?.revision ?? null,
  );
  const [document, setDocument] = useState<Record<string, unknown>>(() => ({
    ...(existing?.document ??
      blankDocument(kind, workspace.sites[0]?.id ?? '')),
  }));
  const [issues, setIssues] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  useUnsavedOffering(dirty);
  const save = useMutation({
    mutationFn: () =>
      saveItem(workspace.id, kind, id, revision, document as Documents[Kind]),
    onSuccess: async () => {
      setRevision((r) => (r ?? 0) + 1);
      setSaved(true);
      setDirty(false);
      await onSaved();
    },
  });
  const update = (key: string, value: unknown) => {
    setSaved(false);
    setDirty(true);
    setDocument((d) => ({ ...d, [key]: value }));
  };
  function input(key: string, label: string, type = 'text', optional = false) {
    return (
      <label key={key} htmlFor={`${prefix}-${key}`} className="block space-y-1">
        <span>{label}</span>
        <input
          id={`${prefix}-${key}`}
          className={fieldClass}
          type={type}
          required={!optional}
          min={key === 'duration' ? 5 : type === 'number' ? 0 : undefined}
          max={
            key === 'duration' ? 480 : key === 'price' ? 100000000 : undefined
          }
          step={key === 'price' ? '0.01' : type === 'number' ? 1 : undefined}
          maxLength={key === 'name' ? 120 : key === 'reason' ? 500 : undefined}
          value={document[key] === null ? '' : String(document[key] ?? '')}
          onChange={(e) =>
            update(
              key,
              type === 'number'
                ? e.target.value === ''
                  ? null
                  : Number(e.target.value)
                : e.target.value,
            )
          }
        />
      </label>
    );
  }
  function select(
    key: string,
    label: string,
    options: { value: string; label: string }[],
  ) {
    return (
      <label key={key} className="block space-y-1">
        <span>{label}</span>
        <select
          className={fieldClass}
          value={String(document[key] ?? '')}
          aria-label={label}
          onChange={(e) =>
            update(key, key === 'day' ? Number(e.target.value) : e.target.value)
          }
        >
          {!options.some((o) => o.value === '') && (
            <option value="">Seleccionar</option>
          )}
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    );
  }
  function checks(key: string, label: string, options: readonly string[]) {
    const values = document[key] as string[];
    return (
      <fieldset className="space-y-2">
        <legend className="font-medium">{label}</legend>
        <div className="flex flex-wrap gap-4">
          {options.map((v) => (
            <label key={v} className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={values.includes(v)}
                onChange={(e) =>
                  update(
                    key,
                    e.target.checked
                      ? [...values, v]
                      : values.filter((s) => s !== v),
                  )
                }
              />
              {v}
            </label>
          ))}
        </div>
      </fieldset>
    );
  }
  const linkedOptions = (k: Kind) =>
    items
      .filter(
        (i) =>
          i.kind === k && (i.document.active || i.id === document[`${k}_id`]),
      )
      .map((i) => ({ value: i.id, label: itemTitle(i, items) }));
  function submit(e: FormEvent) {
    e.preventDefault();
    setSaved(false);
    const result = itemSchemas[kind].safeParse(document);
    if (!result.success) {
      setIssues(
        result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      );
      return;
    }
    setIssues([]);
    save.mutate();
  }
  return (
    <form className={`${cardClass} space-y-5`} onSubmit={submit}>
      <h2 className="text-lg font-semibold">
        {existing ? 'Editar' : 'Crear'} {singular[kind]}
      </h2>
      <fieldset disabled={save.isPending} className="space-y-4">
        {['service', 'professional', 'resource', 'block'].includes(kind) &&
          select(
            'site_id',
            'Sede',
            workspace.sites.map((s) => ({
              value: s.id,
              label: `${s.name} · ${s.timezone}`,
            })),
          )}
        {['service', 'professional', 'resource'].includes(kind) &&
          input('name', 'Nombre')}
        {kind === 'service' && (
          <>
            {select(
              'category',
              'Categoría del servicio',
              categories.map((v) => ({ value: v, label: v })),
            )}
            <label className="block">
              Descripción
              <textarea
                className={fieldClass}
                value={String(document.description)}
                required
                minLength={5}
                maxLength={2000}
                onChange={(e) => update('description', e.target.value)}
              />
            </label>
            {input('duration', 'Duración en minutos', 'number')}
            {select(
              'modality',
              'Modalidad',
              modalities.map((v) => ({ value: v, label: v })),
            )}
            <label className="flex gap-2">
              <input
                type="checkbox"
                checked={document.emergency === true}
                onChange={(e) => update('emergency', e.target.checked)}
              />
              Este servicio atiende urgencias
            </label>
            {input(
              'price',
              'Precio informativo (COP, opcional)',
              'number',
              true,
            )}
          </>
        )}
        {['professional', 'resource'].includes(kind) &&
          checks('modalities', 'Modalidades habilitadas', modalities)}
        {['service', 'professional'].includes(kind) &&
          checks('species', 'Especies atendidas', species)}
        {['assignment', 'shift', 'block'].includes(kind) &&
          select(
            'professional_id',
            kind === 'block'
              ? 'Profesional (vacío: toda la sede)'
              : 'Profesional',
            kind === 'block'
              ? [
                  { value: '', label: 'Toda la sede' },
                  ...linkedOptions('professional'),
                ]
              : linkedOptions('professional'),
          )}
        {kind === 'assignment' && (
          <>
            {select('service_id', 'Servicio', linkedOptions('service'))}
            {select('resource_id', 'Recurso', linkedOptions('resource'))}
            <p className="text-sm">
              El recurso representa un consultorio, equipo o sala virtual de
              capacidad individual. El profesional y el recurso deben admitir la
              modalidad del servicio, y el profesional todas sus especies.
            </p>
          </>
        )}
        {kind === 'shift' && (
          <>
            {select(
              'day',
              'Día de la semana',
              weekdays.map((v, i) => ({ value: String(i), label: v })),
            )}
            {input('start', 'Inicio de jornada', 'time')}
            {input('end', 'Fin de jornada', 'time')}
            <label className="flex gap-2">
              <input
                type="checkbox"
                checked={!!document.next_day}
                onChange={(e) => update('next_day', e.target.checked)}
              />
              Termina al día siguiente
            </label>
            <p className="text-sm">
              Se usa la zona horaria de la sede del profesional. La duración de
              cada servicio define los intervalos.
            </p>
          </>
        )}
        {kind === 'block' && (
          <>
            {input('start_date', 'Fecha de inicio del cierre', 'date')}
            {input('start', 'Hora de inicio del cierre', 'time')}
            {input('end_date', 'Fecha de fin del cierre', 'date')}
            {input('end', 'Hora de fin del cierre', 'time')}
            {input('reason', 'Motivo del cierre')}
            <p className="text-sm">
              Horas en la zona de la sede. Para cerrar un día completo, usa
              00:00 hasta 00:00 del día siguiente. Las citas afectadas requieren
              revisión; no se cancelan automáticamente.
            </p>
          </>
        )}
        <label className="flex gap-2">
          <input
            type="checkbox"
            checked={!!document.active}
            onChange={(e) => update('active', e.target.checked)}
          />
          Activo
        </label>
        {issues.length > 0 && (
          <Notice error>
            <ul>
              {issues.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          </Notice>
        )}
        {save.isError && <Notice error>{dataError(save.error)}</Notice>}
        {saved && (
          <Notice>
            Configuración guardada.
            {kind === 'block' &&
              ` Citas existentes afectadas: ${save.data?.affected_appointments ?? 0}.`}
            {kind === 'block' &&
              !!save.data?.affected_appointments &&
              ' Contacta a sus responsables y revisa la agenda.'}
          </Notice>
        )}
        <div className="flex flex-wrap gap-3">
          <button
            className="button button-primary"
            disabled={!online || save.isPending}
            type="submit"
          >
            {save.isPending ? 'Guardando…' : `Guardar ${singular[kind]}`}
          </button>
          <button className={secondaryClass} type="button" onClick={onClose}>
            Cerrar formulario
          </button>
        </div>
      </fieldset>
    </form>
  );
}

function AvailabilityPreview({ items }: { items: Item[] }) {
  const online = useOnline();
  const [service, setService] = useState('');
  const [date, setDate] = useState('');
  const slots = useQuery({
    queryKey: ['offering-slots', service, date],
    enabled: online && !!service && !!date,
    queryFn: () => getSlots(service, date),
  });
  return (
    <section className={`${cardClass} space-y-4`}>
      <h2 className="font-semibold">Comprobar disponibilidad</h2>
      <label className="block">
        Servicio para consultar
        <select
          className={fieldClass}
          value={service}
          aria-label="Servicio para consultar"
          onChange={(e) => setService(e.target.value)}
        >
          <option value="">Seleccionar servicio</option>
          {items
            .filter((i) => i.kind === 'service' && i.document.active)
            .map((i) => (
              <option key={i.id} value={i.id}>
                {itemTitle(i, items)}
              </option>
            ))}
        </select>
      </label>
      <label className="block">
        Fecha de consulta
        <input
          type="date"
          className={fieldClass}
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </label>
      {service && date && slots.isPending && online && (
        <Notice>Calculando intervalos…</Notice>
      )}
      {slots.isError && (
        <Notice error>
          {dataError(slots.error)}
          <button
            className={secondaryClass}
            disabled={!online}
            onClick={() => void slots.refetch()}
          >
            Reintentar disponibilidad
          </button>
        </Notice>
      )}
      {slots.data?.length === 0 && (
        <Notice>
          Sin intervalos disponibles. Revisa asignaciones, capacidades,
          jornadas, horarios de sede y bloqueos.
        </Notice>
      )}
      {!!slots.data?.length && (
        <>
          <p>
            {slots.data.length} intervalo(s) disponibles; la confirmación de
            reservas se añadirá con Citas.
          </p>
          <ul className="availability-slots">
            {slots.data.map((s) => (
              <li key={`${s.assignment_id}-${s.starts_at}`}>
                {new Date(s.starts_at).toLocaleTimeString('es-CO', {
                  timeZone: s.timezone,
                  hour: '2-digit',
                  minute: '2-digit',
                })}
                –
                {new Date(s.ends_at).toLocaleTimeString('es-CO', {
                  timeZone: s.timezone,
                  hour: '2-digit',
                  minute: '2-digit',
                })}{' '}
                · {s.timezone}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function Collaborators({
  workspace,
  userId,
  invitations,
}: {
  workspace: OfferingWorkspace;
  userId: string;
  invitations: Invitation[];
}) {
  const cache = useQueryClient();
  const online = useOnline();
  const [email, setEmail] = useState('');
  const [grants, setGrants] = useState<string[]>(['read']);
  useUnsavedOffering(!!email);
  const mutation = useMutation({
    mutationFn: ({ action, id }: { action: string; id?: string }) =>
      withAuthOperation(() =>
        offeringRpc('manage_offering_invitation', {
          p_establishment: workspace.id,
          p_action: action,
          p_id: id ?? null,
          p_email: email,
          p_permissions: grants,
        }),
      ),
    onSuccess: async () => {
      setEmail('');
      await cache.invalidateQueries({
        queryKey: ['offering-invitations', userId],
      });
    },
  });
  return (
    <section className={`${cardClass} space-y-4`}>
      <h2 className="font-semibold">Colaboradores del establecimiento</h2>
      <p className="text-sm">
        La invitación estará disponible en Servicios y disponibilidad cuando la
        persona acceda con ese correo confirmado. Vence en 7 días. Comparte esta
        indicación con tu colaborador.
      </p>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate({ action: 'invite' });
        }}
      >
        <label className="block">
          Correo del colaborador
          <input
            className={fieldClass}
            type="email"
            required
            maxLength={254}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <fieldset className="space-y-2">
          <legend>Permisos asignados</legend>
          {permissions.map((p) => (
            <label key={p} className="flex gap-2">
              <input
                type="checkbox"
                checked={grants.includes(p)}
                onChange={(e) =>
                  setGrants(
                    e.target.checked
                      ? [...grants, p]
                      : grants.filter((v) => v !== p),
                  )
                }
              />
              {permissionLabels[p]}
            </label>
          ))}
        </fieldset>
        <button
          className={secondaryClass}
          disabled={!online || mutation.isPending || grants.length === 0}
        >
          Crear invitación
        </button>
      </form>
      {mutation.isError && <Notice error>{dataError(mutation.error)}</Notice>}
      {mutation.isSuccess && <Notice>Vinculación actualizada.</Notice>}
      {invitations.length === 0 && (
        <p className="text-sm">Todavía no hay colaboradores invitados.</p>
      )}
      {invitations.map((i) => (
        <article key={i.id} className="rounded-xl border border-brand-100 p-3">
          <p className="break-all">
            {i.email} ·{' '}
            {i.status === 'pending'
              ? 'Pendiente'
              : i.status === 'accepted'
                ? 'Vinculado'
                : 'Revocado'}
          </p>
          <p className="text-sm">
            {i.permissions
              .map((p) => permissionLabels[p as keyof typeof permissionLabels])
              .join(', ')}
          </p>
          {i.status !== 'revoked' && (
            <button
              className={secondaryClass}
              disabled={!online || mutation.isPending}
              onClick={() => mutation.mutate({ action: 'revoke', id: i.id })}
            >
              Revocar acceso de {i.email}
            </button>
          )}
        </article>
      ))}
    </section>
  );
}
