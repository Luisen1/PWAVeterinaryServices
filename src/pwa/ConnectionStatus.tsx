import { useOnline } from '@/pwa/useOnline';

export function ConnectionStatus() {
  const online = useOnline();
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex shrink-0 items-center gap-2 rounded-full border px-3 py-2 text-xs font-medium ${online ? 'border-brand-100 bg-brand-50 text-brand-700' : 'border-amber-200 bg-amber-50 text-amber-900'}`}
    >
      <span
        aria-hidden="true"
        className={`size-1.5 rounded-full ${online ? 'bg-brand-600' : 'bg-amber-700'}`}
      />
      {online ? 'En línea' : 'Sin conexión'}
    </div>
  );
}
