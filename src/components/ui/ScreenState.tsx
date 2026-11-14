import { Icon } from '@/components/ui/Icon';

export type ScreenStatus = 'loading' | 'empty' | 'error';

interface ScreenStateProps {
  status: ScreenStatus;
  description: string;
  onRetry: () => void;
}

export function ScreenState({
  status,
  description,
  onRetry,
}: ScreenStateProps) {
  if (status === 'loading') {
    return (
      <div
        role="status"
        className="flex min-h-64 flex-col items-center justify-center gap-4 px-6 text-center"
      >
        <Icon
          name="refresh"
          className="size-8 text-brand-700 motion-safe:animate-spin"
        />
        <p className="font-medium">Cargando este espacio…</p>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div
        role="alert"
        className="flex min-h-64 flex-col items-center justify-center gap-4 px-6 text-center"
      >
        <Icon name="alert" className="size-8 text-amber-800" />
        <p className="font-semibold">No pudimos cargar este espacio</p>
        <p className="max-w-sm text-sm text-stone-600">
          Estado de error de demostración. Puedes volver al estado inicial.
        </p>
        <button
          onClick={onRetry}
          className="rounded-xl bg-brand-700 px-5 py-3 text-sm font-semibold text-white"
        >
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div
      role="status"
      className="flex min-h-64 flex-col items-center justify-center px-6 py-10 text-center"
    >
      <div className="mb-5 grid size-16 place-items-center rounded-2xl bg-brand-50 text-brand-700">
        <Icon name="box" className="size-8" />
      </div>
      <p className="text-lg font-semibold tracking-tight">
        Un espacio por construir
      </p>
      <p className="mt-2 max-w-sm text-sm leading-6 text-stone-600">
        {description}
      </p>
      <span className="mt-5 rounded-md border border-stone-200 bg-stone-50 px-2.5 py-1 text-xs font-medium text-stone-600">
        Pantalla provisional
      </span>
    </div>
  );
}
