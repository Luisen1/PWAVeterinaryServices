import { useEffect, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useOnline } from '@/pwa/useOnline';
import { supabase } from '@/lib/supabase';

export const submitClass =
  'inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-brand-700 px-5 py-3 font-semibold text-white hover:bg-brand-900 disabled:cursor-not-allowed disabled:opacity-50';
export const authLinkClass =
  'rounded font-medium text-brand-700 underline decoration-brand-100 underline-offset-4 hover:decoration-brand-700';

export function AuthFrame({
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
    <section className="mx-auto max-w-md">
      <Link
        to="/cuenta"
        className={`mb-6 inline-block text-sm ${authLinkClass}`}
      >
        Volver a Cuenta
      </Link>
      <div className="rounded-3xl border border-stone-200 bg-white p-5 sm:p-8">
        <h1 className="text-2xl font-semibold tracking-tight text-brand-900">
          {title}
        </h1>
        <p className="mt-3 text-sm leading-6 text-stone-600">{description}</p>
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
        <div className="mt-6">{children}</div>
      </div>
    </section>
  );
}
