import { useEffect, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useOnline } from '@/pwa/useOnline';
import { supabase } from '@/lib/supabase';
import { BrandSymbol } from '@/components/ui/Brand';
import { Icon, type IconName } from '@/components/ui/Icon';

export const submitClass = 'button button-primary w-full';
export const authLinkClass = 'text-link rounded';

export function AuthFrame({
  title,
  description,
  children,
  icon = 'heart',
}: {
  title: string;
  description: string;
  children: ReactNode;
  icon?: IconName;
}) {
  const online = useOnline();
  useEffect(() => {
    document.title = `${title} · Servicios veterinarios`;
  }, [title]);
  return (
    <section className="auth-frame">
      <aside className="auth-aside">
        <BrandSymbol />
        <h2>Su bienestar empieza contigo.</h2>
        <p>
          Un espacio para cuidar de tus mascotas y encontrar servicios
          veterinarios cerca de ti.
        </p>
        <div className="auth-aside__benefits">
          <span>
            <Icon name="paw" />
            Tus mascotas, siempre presentes
          </span>
          <span>
            <Icon name="store" />
            Establecimientos revisados
          </span>
          <span>
            <Icon name="shield" />
            Tu información protegida
          </span>
        </div>
      </aside>
      <div className="auth-content">
        <Link to="/cuenta" className="back-link">
          <Icon name="back" />
          Volver a Cuenta
        </Link>
        <div className="auth-heading">
          <span className="auth-heading__icon">
            <Icon name={icon} />
          </span>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        {!online && (
          <p
            role="status"
            className="mt-5 rounded-xl bg-amber-50 p-3 text-sm text-amber-900"
          >
            Necesitas conexión para completar esta operación.
          </p>
        )}
        {!supabase && (
          <p
            role="status"
            className="mt-5 rounded-xl bg-amber-50 p-3 text-sm text-amber-900"
          >
            El acceso a las cuentas todavía no está disponible. Inténtalo más
            tarde.
          </p>
        )}
        <div>{children}</div>
      </div>
    </section>
  );
}
