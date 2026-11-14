import { Link } from 'react-router';
import { Icon } from '@/components/ui/Icon';

export function NotFoundPage() {
  return (
    <section className="rounded-3xl border border-stone-200 bg-white px-6 py-12 text-center">
      <p className="mb-3 text-sm font-medium text-brand-700">Error 404</p>
      <h1 className="text-2xl font-semibold text-brand-900">
        Esta página no existe
      </h1>
      <p className="mt-3 text-sm text-stone-600">
        Revisa la dirección o vuelve al inicio.
      </p>
      <Link
        to="/"
        className="mt-6 inline-flex items-center gap-2 rounded-xl bg-brand-700 px-5 py-3 text-sm font-semibold text-white"
      >
        Volver al inicio
        <Icon name="arrow" className="size-4" />
      </Link>
    </section>
  );
}
