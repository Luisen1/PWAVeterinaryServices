import { Link, useLocation, useParams, useSearchParams } from 'react-router';
import { useOnline } from '@/pwa/useOnline';
import { useAuth } from '@/features/auth/useAuth';
import { authWithReturn } from '@/features/auth/return-to';
import { PublicServices } from '@/features/offerings/PublicServices';
import { EstablishmentDetails } from './EstablishmentDetails';
import { usePublication } from './public-api';
import { safeDiscoveryReturn } from './discovery';
import { cardClass, Notice, secondaryClass, Workspace } from './Workspace';
import { validCoordinates } from './map-model';
import { Icon } from '@/components/ui/Icon';
import { PhoneContact } from './PhoneContact';
import { MediaImage } from './Media';
import { PreferencePanel } from '@/features/preferences/PreferenceControls';
import { OpeningBadge } from './OpeningBadge';
import { useNow } from './useNow';

export function PublicEstablishmentPage() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const auth = useAuth();
  const online = useOnline();
  const row = usePublication(id);
  const now = useNow();
  const siteId = params.get('sede');
  const site = siteId
    ? row.data?.document.sites.find((s) => s.id === siteId)
    : row.data?.document.sites[0];
  const tab = params.get('tab') === 'servicios' ? 'servicios' : 'informacion';
  const destination = location.pathname + location.search;
  const requestedAction = params.get('accion');
  return (
    <Workspace
      title="Ficha del establecimiento"
      description="Información, servicios y contacto de la sede publicada."
    >
      <Link
        to={safeDiscoveryReturn(params.get('volver'))}
        className={secondaryClass}
      >
        Volver a Explorar
      </Link>
      {row.isPending && online && <Notice>Cargando ficha…</Notice>}
      {row.isError && (
        <div className={cardClass}>
          <Notice error>No pudimos consultar la ficha.</Notice>
          <button
            className={secondaryClass}
            disabled={!online}
            onClick={() => void row.refetch()}
          >
            Reintentar consulta
          </button>
        </div>
      )}
      {row.isSuccess && !row.data && (
        <Notice>
          Este establecimiento todavía no tiene una ficha publicada.
        </Notice>
      )}
      {row.data && (
        <>
          <div className="public-establishment-identity">
            <MediaImage
              path={row.data.document.logo_path}
              alt={`Logo de ${row.data.document.name}`}
            />
            <div>
              <h2 className="break-words text-lg font-semibold">
                {row.data.document.name}
              </h2>
              <p className="text-sm">{row.data.document.category}</p>
              <span className="status-badge mt-2">Ficha publicada</span>
            </div>
          </div>
          <div className="public-site-picker">
            <label>
              Sede a consultar
              <select
                className="sv-input"
                aria-label="Sede a consultar"
                value={site?.id ?? ''}
                onChange={(e) =>
                  setParams(
                    (previous) => {
                      const next = new URLSearchParams(previous);
                      next.set('sede', e.target.value);
                      return next;
                    },
                    { replace: true },
                  )
                }
              >
                {!site && (
                  <option value="">Selecciona una sede publicada</option>
                )}
                {row.data.document.sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {!site && (
            <Notice error>
              La sede seleccionada no está publicada. Elige una sede disponible
              antes de continuar.
            </Notice>
          )}
          {site && (
            <>
              <div className="public-site-actions">
                <PhoneContact phone={site.phone} />
                {validCoordinates(site) && (
                  <Link
                    className="button button-primary"
                    to={`/establecimientos/${id}/como-llegar?${new URLSearchParams({ sede: site.id, volver: destination })}`}
                  >
                    <Icon name="pin" />
                    Cómo llegar
                  </Link>
                )}
              </div>
              <OpeningBadge
                site={site}
                now={now}
                trusted={
                  online &&
                  !row.fromCache &&
                  !!row.savedAt &&
                  now.getTime() - new Date(row.savedAt).getTime() < 300000
                }
              />
              <div
                className="discovery-view-switch"
                role="group"
                aria-label="Contenido de la ficha"
              >
                <button
                  aria-pressed={tab === 'informacion'}
                  onClick={() =>
                    setParams(
                      (p) => {
                        const next = new URLSearchParams(p);
                        next.delete('tab');
                        return next;
                      },
                      { replace: true },
                    )
                  }
                >
                  Información
                </button>
                <button
                  aria-pressed={tab === 'servicios'}
                  onClick={() =>
                    setParams(
                      (p) => {
                        const next = new URLSearchParams(p);
                        next.set('tab', 'servicios');
                        return next;
                      },
                      { replace: true },
                    )
                  }
                >
                  Servicios
                </button>
              </div>
              <article className={cardClass} hidden={tab !== 'informacion'}>
                <EstablishmentDetails
                  showIdentity={false}
                  document={{ ...row.data.document, sites: [site] }}
                  updatedAt={row.data.published_at}
                />
              </article>
              <div hidden={tab !== 'servicios'}>
                <PublicServices establishmentId={row.data.id} sites={[site]} />
              </div>
              {(!auth.user || !auth.user.email_confirmed_at) && (
                <Link
                  className={secondaryClass}
                  to={authWithReturn('/acceso', destination)}
                >
                  Iniciar sesión y conservar esta sede
                </Link>
              )}
              <Link
                className="button button-primary"
                to={`/citas?${new URLSearchParams({ establecimiento: row.data.id, sede: site.id })}`}
              >
                Solicitar una cita en esta sede
              </Link>
              {requestedAction === 'agendar' && (
                <Notice>
                  Conservamos la sede elegida. Elige un servicio y un horario
                  para solicitar atención presencial o virtual.
                </Notice>
              )}
              {requestedAction === 'conversar' && (
                <Notice>
                  {!auth.user
                    ? 'Inicia sesión para conservar la sede elegida y continuar cuando esta función esté habilitada.'
                    : 'Conservamos la sede elegida. El chat todavía no está habilitado en la aplicación.'}
                </Notice>
              )}
              <PreferencePanel establishmentId={row.data.id} />
            </>
          )}
        </>
      )}
    </Workspace>
  );
}
