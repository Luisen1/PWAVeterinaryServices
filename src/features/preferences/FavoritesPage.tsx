import { Link } from 'react-router';
import { usePreferenceUser, usePreferences } from './usePreferences';
import { usePublications } from '@/features/directory/public-api';
import { PreferencePanel } from './PreferenceControls';
import {
  Workspace,
  Notice,
  secondaryClass,
} from '@/features/directory/Workspace';
import { authWithReturn } from '@/features/auth/return-to';

export function FavoritesPage() {
  const user = usePreferenceUser();
  const rows = usePreferences(user?.id);
  const publications = usePublications();
  const visible =
    rows.data?.filter((p) => p.favorite || p.note || p.pending) ?? [];
  return (
    <Workspace
      title="Favoritos y notas"
      description="Tus establecimientos guardados y tus notas privadas, también sin conexión."
    >
      <Link className={secondaryClass} to="/explorar">
        Volver a Explorar
      </Link>
      {!user && (
        <Notice>
          Inicia sesión con correo confirmado o recupera una sesión local
          válida.
          <Link
            className={secondaryClass}
            to={authWithReturn('/acceso', '/favoritos')}
          >
            Ir a iniciar sesión
          </Link>
        </Notice>
      )}
      {user && (
        <div key={user.id} className="space-y-5">
          <p>
            {visible.filter((p) => p.favorite).length} establecimiento(s)
            favorito(s)
          </p>
          {rows.isPending && (
            <Notice>Cargando tus preferencias locales…</Notice>
          )}
          {rows.isError && (
            <Notice error>
              No pudimos leer los datos locales. Reintenta al abrir esta
              pantalla.
            </Notice>
          )}
          {rows.isSuccess && !visible.length && (
            <Notice>Aún no tienes favoritos ni notas guardadas.</Notice>
          )}
          {visible.map((p) => {
            const publication = publications.data?.find(
              (row) => row.id === p.establishment_id,
            );
            return (
              <article key={p.id} className="space-y-3">
                <h2 className="text-lg font-semibold">
                  {publication?.document.name ??
                    'Establecimiento sin publicación disponible'}
                </h2>
                {publication && (
                  <Link
                    className={secondaryClass}
                    to={`/establecimientos/${publication.id}`}
                  >
                    Consultar ficha de {publication.document.name}
                  </Link>
                )}
                <PreferencePanel establishmentId={p.establishment_id} />
              </article>
            );
          })}
        </div>
      )}
    </Workspace>
  );
}
