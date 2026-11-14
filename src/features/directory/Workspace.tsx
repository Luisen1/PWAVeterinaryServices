import { useEffect, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useAuth } from '@/features/auth/useAuth';
import { refreshAuthSession } from '@/features/auth/session-store';
import { useOnline } from '@/pwa/useOnline';
import { authLinkClass } from '@/features/auth/components/AuthFrame';

export const fieldClass =
  'min-h-12 w-full min-w-0 rounded-xl border border-stone-300 bg-white px-3 py-3 text-base disabled:opacity-50';
export const secondaryClass =
  'inline-flex min-h-11 items-center justify-center rounded-xl border border-brand-700 px-4 py-2 text-sm font-semibold text-brand-700 disabled:opacity-50';
export const cardClass =
  'space-y-5 rounded-2xl border border-stone-200 bg-white p-5 sm:p-7';
export function Notice({
  children,
  error = false,
}: {
  children: ReactNode;
  error?: boolean;
}) {
  return (
    <p
      role={error ? 'alert' : 'status'}
      className={`rounded-xl p-3 text-sm leading-6 ${error ? 'bg-red-50 text-red-800' : 'bg-brand-50 text-brand-900'}`}
    >
      {children}
    </p>
  );
}
export function Workspace({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  const online = useOnline();
  useEffect(() => {
    document.title = `${title} · Servicios veterinarios`;
  }, [title]);
  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <Link to="/cuenta" className={authLinkClass}>
        Volver a Cuenta
      </Link>
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-brand-900">
          {title}
        </h1>
        <p className="mt-3 text-sm leading-6 text-stone-600">{description}</p>
      </div>
      {!online && (
        <Notice>
          Estás sin conexión. Los formularios conservan lo escrito; vuelve a
          conectarte para enviar solicitudes e imágenes.
        </Notice>
      )}
      {children}
    </section>
  );
}
export function Verified({
  children,
}: {
  children: (userId: string) => ReactNode;
}) {
  const auth = useAuth();
  if (auth.status === 'loading') return <Notice>Comprobando sesión…</Notice>;
  if (auth.status === 'unavailable')
    return (
      <div className={cardClass}>
        <Notice error>{auth.error}</Notice>
        <button
          className={secondaryClass}
          onClick={() => void refreshAuthSession()}
        >
          Reintentar validación
        </button>
      </div>
    );
  if (!auth.user || !auth.user.email_confirmed_at)
    return (
      <div className={cardClass}>
        <Notice>
          Inicia sesión y confirma tu correo para acceder a esta sección.
        </Notice>
        <Link className={authLinkClass} to="/cuenta">
          Ir a mi cuenta
        </Link>
      </div>
    );
  return <div key={auth.user.id}>{children(auth.user.id)}</div>;
}
