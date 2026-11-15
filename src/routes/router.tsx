import { createBrowserRouter } from 'react-router';
import { Layout } from '@/app/Layout';
import { PlaceholderPage } from '@/routes/PlaceholderPage';
import { HomePage } from '@/routes/HomePage';
import { NotFoundPage } from '@/routes/NotFoundPage';
import { RouteErrorPage } from '@/routes/RouteErrorPage';
import { AccountPage } from '@/features/auth/pages/AccountPage';
import { LoginPage } from '@/features/auth/pages/LoginPage';
import { RegisterPage } from '@/features/auth/pages/RegisterPage';
import { RecoveryPage } from '@/features/auth/pages/RecoveryPage';
import { ConfirmEmailPage } from '@/features/auth/pages/ConfirmEmailPage';
import { ResetPasswordPage } from '@/features/auth/pages/ResetPasswordPage';
import { PrivacyPage } from '@/features/auth/pages/PrivacyPage';
import { ProfilePage } from '@/features/directory/ProfilePage';
import {
  ProviderPage,
  ProviderEditPage,
} from '@/features/directory/ProviderPages';
import { AdminPage } from '@/features/directory/AdminPage';
import { OfferingsPage } from '@/features/offerings/OfferingsPage';
import { PublicEstablishmentPage } from '@/features/directory/PublicPages';
import { DirectoryPage } from '@/features/directory/DirectoryPage';
import { DirectionsPage } from '@/features/directory/DirectionsPage';
import { FavoritesPage } from '@/features/preferences/FavoritesPage';

export const router = createBrowserRouter([
  {
    element: <Layout />,
    errorElement: <RouteErrorPage />,
    children: [
      {
        path: '/',
        element: <HomePage />,
      },
      {
        path: '/explorar',
        element: <DirectoryPage />,
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
        element: <AccountPage />,
      },
      { path: '/acceso', element: <LoginPage /> },
      { path: '/registro', element: <RegisterPage /> },
      { path: '/recuperar-acceso', element: <RecoveryPage /> },
      { path: '/auth/confirmar', element: <ConfirmEmailPage /> },
      { path: '/restablecer-clave', element: <ResetPasswordPage /> },
      { path: '/privacidad', element: <PrivacyPage /> },
      { path: '/perfil', element: <ProfilePage /> },
      { path: '/favoritos', element: <FavoritesPage /> },
      { path: '/oferentes', element: <ProviderPage /> },
      { path: '/oferentes/nuevo', element: <ProviderEditPage /> },
      { path: '/oferentes/servicios', element: <OfferingsPage /> },
      { path: '/oferentes/:id/servicios', element: <OfferingsPage /> },
      { path: '/oferentes/:id/editar', element: <ProviderEditPage /> },
      { path: '/administracion/oferentes', element: <AdminPage /> },
      { path: '/establecimientos/:id', element: <PublicEstablishmentPage /> },
      {
        path: '/establecimientos/:id/como-llegar',
        element: <DirectionsPage />,
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
