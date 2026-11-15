import { Link } from 'react-router';
import { Icon } from '@/components/ui/Icon';
import { SectionHeading } from '@/components/ui/PageHeading';
import { MediaImage } from './Media';
import {
  statusLabels,
  weekdays,
  type Decision,
  type EstablishmentDocument,
} from './model';

function displayDate(value: string, timezone = 'America/Bogota') {
  return (
    new Intl.DateTimeFormat('es-CO', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: timezone,
    }).format(new Date(value)) + ` · ${timezone}`
  );
}
export function EstablishmentDetails({
  document,
  updatedAt,
  showTimestamp = true,
  showIdentity = true,
}: {
  document: Omit<EstablishmentDocument, 'responsible_name'> & {
    responsible_name?: string;
  };
  updatedAt: string;
  showTimestamp?: boolean;
  showIdentity?: boolean;
}) {
  return (
    <div className="space-y-5">
      {showIdentity && (
        <div className="flex items-center gap-4 rounded-xl border border-brand-100 p-4">
          <MediaImage
            path={document.logo_path}
            alt={`Logo de ${document.name}`}
          />
          <div className="min-w-0">
            <h2 className="break-words text-xl font-semibold">
              {document.name}
            </h2>
            <p className="text-sm text-stone-600">{document.category}</p>
            {!document.responsible_name && (
              <span className="status-badge mt-2">
                <Icon name="check" className="size-3" />
                Ficha publicada
              </span>
            )}
          </div>
        </div>
      )}
      <div className="detail-contact">
        <a
          className="button button-secondary"
          href={`tel:${document.phone.replace(/[^+\d]/g, '')}`}
        >
          <Icon name="phone" />
          {document.phone}
        </a>
        <a
          className="button button-secondary break-all"
          href={`mailto:${document.email}`}
        >
          <Icon name="mail" />
          {document.email}
        </a>
      </div>
      {document.responsible_name && (
        <p className="text-sm">Responsable: {document.responsible_name}</p>
      )}
      <SectionHeading icon="store">
        Información del establecimiento
      </SectionHeading>
      {document.sites.map((site) => (
        <section key={site.id} className="site-card space-y-4">
          <h3 className="font-semibold">{site.name}</h3>
          <p className="flex gap-2 break-words text-sm">
            <Icon name="pin" className="size-4 shrink-0 text-brand-700" />
            {site.address}
          </p>
          <p className="text-sm">Teléfono: {site.phone}</p>
          <a
            className="button button-secondary"
            target="_blank"
            rel="noopener noreferrer"
            href={`https://www.google.com/maps/search/?api=1&query=${site.latitude},${site.longitude}`}
          >
            <Icon name="pin" />
            Ver ubicación ({site.latitude}, {site.longitude})
          </a>
          <p className="text-xs text-stone-600">
            Zona horaria: {site.timezone}
          </p>
          <h4 className="detail-label">
            <Icon name="clock" />
            Horario semanal
          </h4>
          {site.hours.length === 0 ? (
            <p className="text-sm">Sin atención semanal declarada.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {site.hours.map((h) => (
                <li key={h.day}>
                  {weekdays[h.day]}: {h.open}–{h.close}
                  {h.next_day ? ' del día siguiente' : ''}
                </li>
              ))}
            </ul>
          )}
          {site.exceptions.length > 0 && (
            <>
              <h4 className="detail-label">
                <Icon name="calendar" />
                Excepciones
              </h4>
              <ul className="space-y-1 text-sm">
                {site.exceptions.map((e) => (
                  <li key={e.date}>
                    {e.date}:{' '}
                    {e.closed
                      ? 'Cerrado'
                      : `${e.open}–${e.close}${e.next_day ? ' del día siguiente' : ''}`}
                  </li>
                ))}
              </ul>
            </>
          )}
          <p className="rounded-xl border border-brand-100 bg-white p-3 text-xs leading-6">
            Medios de pago: {site.payment_methods.join(', ')}
          </p>
          <div className="flex flex-wrap gap-3">
            {site.photos.map((path) => (
              <MediaImage key={path} path={path} alt={`Foto de ${site.name}`} />
            ))}
          </div>
          {showTimestamp && (
            <p className="text-xs leading-5 text-stone-500">
              Última actualización: {displayDate(updatedAt, site.timezone)}
            </p>
          )}
        </section>
      ))}
    </div>
  );
}
export function DecisionHistory({ decisions }: { decisions: Decision[] }) {
  if (decisions.length === 0) return null;
  return (
    <div className="space-y-3">
      <h3 className="detail-label">
        <Icon name="shield" />
        Historial de revisión
      </h3>
      {decisions.map((d) => (
        <div
          key={d.id}
          className="rounded-xl border-l-3 border-brand-600 bg-brand-50 p-4 text-xs leading-6"
        >
          <p className="font-semibold">
            {statusLabels[d.decision]} · Revisión {d.revision}
          </p>
          {d.reason && (
            <p className="mt-2 whitespace-pre-wrap break-words">
              Motivo: {d.reason}
            </p>
          )}
          <p className="mt-2 text-xs text-stone-500">
            {displayDate(d.decided_at)}
          </p>
          <details className="mt-2 text-xs text-stone-500">
            <summary>Registro de auditoría</summary>
            <p className="mt-1 break-all">
              Revisor: {d.reviewer_id ?? 'Cuenta eliminada'}
            </p>
          </details>
        </div>
      ))}
    </div>
  );
}
export function PublicLink({ id }: { id: string }) {
  return (
    <Link
      className="text-sm font-semibold text-brand-700 underline"
      to={`/establecimientos/${id}`}
    >
      Consultar ficha publicada
    </Link>
  );
}
