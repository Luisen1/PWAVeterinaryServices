import { Link } from 'react-router';
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
}: {
  document: Omit<EstablishmentDocument, 'responsible_name'> & {
    responsible_name?: string;
  };
  updatedAt: string;
}) {
  return (
    <div className="space-y-5">
      <div className="flex items-start gap-4">
        <MediaImage
          path={document.logo_path}
          alt={`Logo de ${document.name}`}
        />
        <div className="min-w-0">
          <h2 className="break-words text-xl font-semibold">{document.name}</h2>
          <p className="text-sm text-stone-600">{document.category}</p>
          <a
            className="block break-all text-sm text-brand-700 underline"
            href={`tel:${document.phone.replace(/[^+\d]/g, '')}`}
          >
            {document.phone}
          </a>
          <a
            className="block break-all text-sm text-brand-700 underline"
            href={`mailto:${document.email}`}
          >
            {document.email}
          </a>
        </div>
      </div>
      {document.responsible_name && (
        <p className="text-sm">Responsable: {document.responsible_name}</p>
      )}
      {document.sites.map((site) => (
        <section key={site.id} className="space-y-3 rounded-xl bg-stone-50 p-4">
          <h3 className="font-semibold">{site.name}</h3>
          <p className="break-words text-sm">{site.address}</p>
          <p className="text-sm">Teléfono: {site.phone}</p>
          <a
            className="block text-sm text-brand-700 underline"
            target="_blank"
            rel="noopener noreferrer"
            href={`https://www.google.com/maps/search/?api=1&query=${site.latitude},${site.longitude}`}
          >
            Ver ubicación ({site.latitude}, {site.longitude})
          </a>
          <p className="text-xs text-stone-600">
            Zona horaria: {site.timezone}
          </p>
          <h4 className="text-sm font-semibold">Horario semanal</h4>
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
              <h4 className="text-sm font-semibold">Excepciones</h4>
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
          <p className="text-sm">
            Medios de pago: {site.payment_methods.join(', ')}
          </p>
          <div className="flex flex-wrap gap-3">
            {site.photos.map((path) => (
              <MediaImage key={path} path={path} alt={`Foto de ${site.name}`} />
            ))}
          </div>
          <p className="text-xs leading-5 text-stone-500">
            Última actualización: {displayDate(updatedAt, site.timezone)}
          </p>
        </section>
      ))}
    </div>
  );
}
export function DecisionHistory({ decisions }: { decisions: Decision[] }) {
  if (decisions.length === 0) return null;
  return (
    <div className="space-y-3">
      <h3 className="font-semibold">Historial de revisión</h3>
      {decisions.map((d) => (
        <div
          key={d.id}
          className="rounded-xl border border-stone-200 p-3 text-sm"
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
          <p className="mt-1 break-all text-xs text-stone-500">
            Revisor: {d.reviewer_id ?? 'Cuenta eliminada'}
          </p>
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
