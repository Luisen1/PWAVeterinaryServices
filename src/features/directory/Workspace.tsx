import { useEffect, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useAuth } from '@/features/auth/useAuth';
import { refreshAuthSession } from '@/features/auth/session-store';
import { useOnline } from '@/pwa/useOnline';
import { authLinkClass } from '@/features/auth/components/AuthFrame';
import { Icon } from '@/components/ui/Icon';
import { PageHeading } from '@/components/ui/PageHeading';

export const fieldClass = 'sv-input';
export const secondaryClass = 'button button-secondary';
export const cardClass = 'sv-card';
export function Notice({
  children,
  error = false,
}: {
  children: ReactNode;
  error?: boolean;
}) {
  return (
    <div
      role={error ? 'alert' : 'status'}
      className={`notice ${error ? 'notice--error' : ''}`}
    >
      <Icon name={error ? 'alert' : 'info'} />
      <div>{children}</div>
    </div>
  );
}
export function Workspace({
  title,
  description,
  children,
  className = '',
}: {
  title: string;
  description: string;
  children: ReactNode;
  className?: string;
}) {
  const online = useOnline();
  useEffect(() => {
    document.title = `${title} · Servicios veterinarios`;
  }, [title]);
  return (
    <section className={`mx-auto max-w-4xl space-y-6 ${className}`}>
      <PageHeading
        title={title}
        description={description}
        backTo="/cuenta"
        icon={
          title.includes('mascota')
            ? 'paw'
            : title.includes('establecimiento') || title.includes('oferente')
              ? 'store'
              : 'compass'
        }
      />
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
  allowOffline = false,
}: {
  children: (userId: string) => ReactNode;
  allowOffline?: boolean;
}) {
  const auth = useAuth();
  const online = useOnline();
  if (allowOffline && !online && auth.offlineUser?.email_confirmed_at)
    return <div key={auth.offlineUser.id}>{children(auth.offlineUser.id)}</div>;
  if (auth.status === 'loading') return <Notice>Comprobando sesión…</Notice>;
  if (auth.status === 'unavailable')
    return (
      <div className={cardClass}>
        <Notice error>{auth.error}</Notice>
        <button
          className={secondaryClass}
          disabled={!online}
          onClick={() => void refreshAuthSession({ showProgress: true })}
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
