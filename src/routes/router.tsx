import { createBrowserRouter } from 'react-router';
import { Layout } from '@/app/Layout';
import { PlaceholderPage } from '@/routes/PlaceholderPage';
import { NotFoundPage } from '@/routes/NotFoundPage';
import { RouteErrorPage } from '@/routes/RouteErrorPage';

export const router = createBrowserRouter([
  {
    element: <Layout />,
    errorElement: <RouteErrorPage />,
    children: [
      {
        path: '/',
        element: (
          <PlaceholderPage
            home
            title="Inicio"
            description="Bienvenido a la base de tu aplicación de servicios veterinarios."
            emptyDescription="Aquí comenzará la experiencia. Las funcionalidades se incorporarán en las siguientes fases."
          />
        ),
      },
      {
        path: '/explorar',
        element: (
          <PlaceholderPage
            title="Explorar"
            description="El futuro espacio del directorio de servicios veterinarios."
            emptyDescription="El directorio se construirá en una siguiente fase. Este espacio todavía no contiene establecimientos."
          />
        ),
      },
      {
        path: '/citas',
        element: (
          <PlaceholderPage
            title="Citas"
            description="El futuro espacio para la agenda de atención."
            emptyDescription="La gestión de citas se incorporará en una siguiente fase. Esta pantalla es provisional."
          />
        ),
      },
      {
        path: '/cuenta',
        element: (
          <PlaceholderPage
            title="Cuenta"
            description="El futuro espacio para la información de tu cuenta."
            emptyDescription="La cuenta y el acceso se incorporarán en una siguiente fase. Esta pantalla es provisional."
          />
        ),
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
