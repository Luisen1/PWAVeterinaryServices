import { createBrowserRouter } from 'react-router';
import { Layout } from '@/app/Layout';
import { PlaceholderPage } from '@/routes/PlaceholderPage';
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
import {
  DirectoryPage,
  PublicEstablishmentPage,
} from '@/features/directory/PublicPages';

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
      { path: '/oferentes', element: <ProviderPage /> },
      { path: '/oferentes/nuevo', element: <ProviderEditPage /> },
      { path: '/oferentes/:id/editar', element: <ProviderEditPage /> },
      { path: '/administracion/oferentes', element: <AdminPage /> },
      { path: '/establecimientos/:id', element: <PublicEstablishmentPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
