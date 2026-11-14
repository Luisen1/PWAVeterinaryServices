import { useEffect } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ScreenState, type ScreenStatus } from '@/components/ui/ScreenState';
import { Icon } from '@/components/ui/Icon';

interface PlaceholderPageProps {
  title: string;
  description: string;
  emptyDescription: string;
  home?: boolean;
}

export function PlaceholderPage({
  title,
  description,
  emptyDescription,
  home = false,
}: PlaceholderPageProps) {
  const [params, setParams] = useSearchParams();
  const requestedState = params.get('estado');
  const status: ScreenStatus =
    requestedState === 'carga'
      ? 'loading'
      : requestedState === 'error'
        ? 'error'
        : 'empty';

  useEffect(() => {
    document.title = `${title} · Servicios veterinarios`;
  }, [title]);

  function resetState() {
    setParams(
      (current) => {
        current.delete('estado');
        return current;
      },
      { replace: true },
    );
  }

  return (
    <>
      <div className="mb-7 flex flex-wrap items-center gap-2 text-xs font-medium text-brand-700">
        <span
          className="size-1.5 rounded-full bg-brand-600"
          aria-hidden="true"
        />
        Proyecto en construcción
      </div>
      <h1 className="text-3xl font-semibold tracking-tight text-brand-900 sm:text-4xl">
        {title}
      </h1>
      <p className="mt-3 max-w-lg text-sm leading-6 text-stone-600 sm:text-base">
        {description}
      </p>
      <section
        aria-label={`Contenido de ${title}`}
        className="mt-8 overflow-hidden rounded-3xl border border-stone-200 bg-white"
      >
        <ScreenState
          status={status}
          description={emptyDescription}
          onRetry={resetState}
        />
      </section>
      {home && (
        <section
          aria-label="Espacios de la aplicación"
          className="mt-5 grid gap-3 sm:grid-cols-3"
        >
          {[
            {
              to: '/explorar',
              label: 'Explorar',
              text: 'Directorio de servicios · Próximamente',
              icon: 'compass' as const,
            },
            {
              to: '/citas',
              label: 'Citas',
              text: 'Agenda de atención · Próximamente',
              icon: 'calendar' as const,
            },
            {
              to: '/cuenta',
              label: 'Cuenta',
              text: 'Acceso y registro',
              icon: 'user' as const,
            },
          ].map(({ to, label, text, icon }) => (
            <Link
              key={to}
              to={to}
              className="group flex items-center gap-3 rounded-2xl border border-stone-200 bg-white p-4 transition-colors hover:border-brand-600"
            >
              <Icon name={icon} className="size-5 shrink-0 text-brand-700" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{label}</span>
                <span className="mt-0.5 block text-xs text-stone-500">
                  {text}
                </span>
              </span>
              <Icon
                name="arrow"
                className="size-4 shrink-0 text-stone-400 group-hover:text-brand-700"
              />
            </Link>
          ))}
        </section>
      )}
    </>
  );
}
