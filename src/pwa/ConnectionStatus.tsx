import { useOnline } from '@/pwa/useOnline';

export function ConnectionStatus() {
  const online = useOnline();
  return (
    <div
      role="status"
      aria-live="polite"
      className={`connection-chip ${online ? '' : 'connection-chip--offline'}`}
    >
      <span
        aria-hidden="true"
        className={`size-1.5 rounded-full ${online ? 'bg-brand-600' : 'bg-amber-700'}`}
      />
      {online ? 'En línea' : 'Sin conexión'}
    </div>
  );
}
