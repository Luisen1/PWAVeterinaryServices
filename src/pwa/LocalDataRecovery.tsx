import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { db } from '@/lib/db';
import { useCanReload } from './useCanReload';

// Abrir o migrar nunca debe recuperarse borrando la base o la cola.
export function LocalDataRecovery() {
  const [problem, setProblem] = useState('');
  const safe = useCanReload();
  const opening = useQuery({
    queryKey: ['local-database-open'],
    queryFn: async () => {
      await db.open();
      return true;
    },
    retry: false,
    networkMode: 'always',
    staleTime: Infinity,
  });
  useEffect(() => {
    const blocked = () =>
      setProblem(
        'Otra pestaña impide actualizar los datos locales. Guarda su actividad y ciérrala; tus pendientes se conservan.',
      );
    db.on('blocked', blocked);
    const ready = () => {
      setProblem('');
    };
    db.on('ready', ready);
    return () => {
      db.on('blocked').unsubscribe(blocked);
      db.on('ready').unsubscribe(ready);
    };
  }, []);
  const message = opening.isError
    ? 'No pudimos abrir los datos locales. Tus pendientes no se han borrado. Cierra otras pestañas de esta aplicación y reintenta. Si instalaste una versión anterior, vuelve a una versión compatible.'
    : problem;
  if (!message) return null;
  return (
    <aside role="alert" className="notice notice--error mx-auto my-4 max-w-4xl">
      <div className="space-y-3">
        <h2 className="font-semibold">Recuperar datos locales</h2>
        <p>{message}</p>
        <p>
          No borres los datos del sitio ni reinstales para resolverlo: podrías
          perder información sin enviar.
        </p>
        <button
          className="button button-secondary"
          disabled={!safe || opening.isFetching}
          onClick={() => {
            if (safe) void opening.refetch();
          }}
        >
          Reintentar apertura local
        </button>
      </div>
    </aside>
  );
}
