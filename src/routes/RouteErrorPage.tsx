import { Link } from 'react-router';

export function RouteErrorPage() {
  return (
    <main className="mx-auto max-w-lg px-6 py-16" role="alert">
      <h1 className="text-2xl font-semibold">No pudimos abrir la aplicación</h1>
      <p className="mt-3 text-stone-600">
        Vuelve a intentarlo para recuperar la pantalla.
      </p>
      <Link
        to="/"
        reloadDocument
        className="mt-6 inline-block rounded-xl bg-brand-700 px-5 py-3 text-white"
      >
        Volver al inicio
      </Link>
    </main>
  );
}
