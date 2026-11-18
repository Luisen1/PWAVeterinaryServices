import { useMutation, useQuery } from '@tanstack/react-query';
import { useOnline } from '@/pwa/useOnline';
import { Notice, secondaryClass } from './Workspace';
import {
  downloadDirectory,
  readDirectoryBundle,
  type DirectoryBundle,
} from './offline-directory';

export function OfflineDirectoryControls() {
  const online = useOnline();
  const saved = useQuery({
    queryKey: ['offline-directory-status'],
    networkMode: 'always',
    queryFn: readDirectoryBundle,
  });
  const action = useMutation({
    networkMode: 'always',
    mutationFn: downloadDirectory,
    onSuccess: () => void saved.refetch(),
  });
  const bundle = saved.data?.data as DirectoryBundle | undefined;
  return (
    <details className="sv-card space-y-3">
      <summary className="font-semibold">Directorio sin conexión</summary>
      <p className="text-sm">
        Guarda fichas, direcciones, teléfonos y servicios para buscar en este
        dispositivo. Los mapas, rutas e imágenes remotas necesitan conexión.
      </p>
      {saved.data ? (
        <p className="text-sm">
          Descarga completa: {bundle?.publications.length} establecimiento(s).
          Última actualización:{' '}
          {new Date(saved.data.saved_at).toLocaleString('es-CO')}. Los horarios
          y servicios pueden haber cambiado.
        </p>
      ) : (
        <p className="text-sm">
          Aún no has completado una descarga. Las páginas visitadas pueden tener
          una copia parcial.
        </p>
      )}
      <button
        className={secondaryClass}
        disabled={!online || action.isPending}
        onClick={() => action.mutate()}
      >
        {action.isPending
          ? 'Descargando directorio…'
          : saved.data
            ? 'Actualizar descarga offline'
            : 'Guardar directorio sin conexión'}
      </button>
      {action.isSuccess && (
        <Notice>Descarga completa guardada en este dispositivo.</Notice>
      )}
      {action.isError && (
        <Notice error>
          No pudimos completar la descarga. La copia anterior se conserva;
          comprueba conexión y espacio disponible.
        </Notice>
      )}
      <p className="text-xs">
        Se conserva mientras el navegador mantenga su almacenamiento. Una
        descarga no garantiza disponibilidad actual ni reserva una cita.
      </p>
    </details>
  );
}
