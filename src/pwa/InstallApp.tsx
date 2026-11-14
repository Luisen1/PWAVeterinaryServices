import { Icon } from '@/components/ui/Icon';
import { useInstall } from '@/pwa/useInstall';

export function InstallApp() {
  const { installed, canPrompt, prompting, install, ios, error } = useInstall();
  if (installed) return null;

  return (
    <aside aria-label="Instalación de la aplicación" className="install-panel">
      <div className="flex items-start gap-4">
        <div className="grid size-10 shrink-0 place-items-center rounded-xl border border-brand-100 bg-white text-brand-700">
          <Icon name="download" className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-brand-900">
            La app, en tu pantalla de inicio
          </h2>
          <p className="mt-1 text-sm leading-6 text-stone-600">
            Ábrela desde tu celular y accede a esta interfaz incluso sin
            conexión después de la primera carga.
          </p>
          {canPrompt ? (
            <button
              onClick={() => void install()}
              disabled={prompting}
              className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-900 disabled:opacity-60"
            >
              <Icon name="download" className="size-4" />
              {prompting ? 'Abriendo instalación…' : 'Instalar app'}
            </button>
          ) : (
            <details className="mt-3 text-sm text-brand-700">
              <summary className="w-fit rounded py-1 font-semibold">
                Cómo añadirla a mi celular
              </summary>
              <ol className="mt-3 list-decimal space-y-2 pl-5 leading-6 text-stone-700">
                {ios ? (
                  <>
                    <li>Abre esta dirección en Safari.</li>
                    <li>
                      Toca Compartir y selecciona Añadir a pantalla de inicio.
                    </li>
                    <li>Confirma el nombre y toca Añadir.</li>
                  </>
                ) : (
                  <>
                    <li>Abre el menú del navegador.</li>
                    <li>
                      Busca Instalar aplicación o Añadir a pantalla de inicio y
                      confirma.
                    </li>
                    <li>
                      En iPhone, abre Safari y utiliza Compartir &gt; Añadir a
                      pantalla de inicio.
                    </li>
                  </>
                )}
              </ol>
              <p className="mt-3 text-xs leading-5 text-stone-600">
                Las opciones dependen del navegador y del dispositivo.
              </p>
            </details>
          )}
          {error && (
            <p role="status" className="mt-3 text-sm text-amber-900">
              No se pudo abrir la instalación. Puedes seguir la guía manual.
            </p>
          )}
        </div>
      </div>
    </aside>
  );
}
