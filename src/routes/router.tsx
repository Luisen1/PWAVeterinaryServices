import { AccountArea } from '@/features/auth/AccountArea';
import { createBrowserRouter } from 'react-router';
import { Layout } from '@/app/Layout';
import { AvailabilityPage } from '@/features/appointments/AvailabilityPage';
import {
  RequestsPage,
  AppointmentDetailsPage,
} from '@/features/appointments/RequestsPage';
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
import { TermsPage } from '@/features/auth/pages/TermsPage';
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
import { VideoCallPage } from '@/features/calls/VideoCallPage';
import { NotificationSettingsPage } from '@/features/notifications/NotificationSettingsPage';
import { NotificationInboxPage } from '@/features/notifications/NotificationInboxPage';
import { PendingPage } from '@/features/sync/PendingPage';
import {
  ChatInboxPage,
  ChatStartPage,
  ConversationPage,
} from '@/features/messaging/ChatPages';

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
          <AccountArea area="pet_owner">
            <AvailabilityPage />
          </AccountArea>
        ),
      },
      {
        path: '/cuenta',
        element: <AccountPage />,
      },
      {
        path: '/citas/solicitudes',
        element: (
          <AccountArea area="pet_owner">
            <RequestsPage />
          </AccountArea>
        ),
      },
      { path: '/citas/solicitudes/:id', element: <AppointmentDetailsPage /> },
      { path: '/cuenta/notificaciones', element: <NotificationSettingsPage /> },
      { path: '/notificaciones', element: <NotificationInboxPage /> },
      { path: '/cuenta/pendientes', element: <PendingPage /> },
      {
        path: '/citas/solicitudes/:id/videollamada',
        element: <VideoCallPage />,
      },
      {
        path: '/oferentes/citas',
        element: (
          <AccountArea area="veterinary">
            <RequestsPage team />
          </AccountArea>
        ),
      },
      {
        path: '/oferentes/:id/citas',
        element: (
          <AccountArea area="veterinary">
            <RequestsPage team />
          </AccountArea>
        ),
      },
      {
        path: '/citas/agenda',
        element: (
          <AccountArea area="pet_owner">
            <RequestsPage agenda />
          </AccountArea>
        ),
      },
      {
        path: '/oferentes/agenda',
        element: (
          <AccountArea area="veterinary">
            <RequestsPage team agenda />
          </AccountArea>
        ),
      },
      {
        path: '/oferentes/:id/agenda',
        element: (
          <AccountArea area="veterinary">
            <RequestsPage team agenda />
          </AccountArea>
        ),
      },
      {
        path: '/mensajes',
        element: (
          <AccountArea area="pet_owner">
            <ChatInboxPage />
          </AccountArea>
        ),
      },
      {
        path: '/mensajes/nuevo',
        element: (
          <AccountArea area="pet_owner">
            <ChatStartPage />
          </AccountArea>
        ),
      },
      { path: '/mensajes/:id', element: <ConversationPage /> },
      {
        path: '/oferentes/mensajes',
        element: (
          <AccountArea area="veterinary">
            <ChatInboxPage team />
          </AccountArea>
        ),
      },
      { path: '/acceso', element: <LoginPage /> },
      { path: '/registro', element: <RegisterPage /> },
      { path: '/recuperar-acceso', element: <RecoveryPage /> },
      { path: '/auth/confirmar', element: <ConfirmEmailPage /> },
      { path: '/restablecer-clave', element: <ResetPasswordPage /> },
      { path: '/privacidad', element: <PrivacyPage /> },
      { path: '/terminos', element: <TermsPage /> },
      { path: '/perfil', element: <ProfilePage /> },
      {
        path: '/favoritos',
        element: (
          <AccountArea area="pet_owner">
            <FavoritesPage />
          </AccountArea>
        ),
      },
      {
        path: '/oferentes',
        element: (
          <AccountArea area="veterinary">
            <ProviderPage />
          </AccountArea>
        ),
      },
      {
        path: '/oferentes/nuevo',
        element: (
          <AccountArea area="veterinary">
            <ProviderEditPage />
          </AccountArea>
        ),
      },
      {
        path: '/oferentes/servicios',
        element: (
          <AccountArea area="veterinary">
            <OfferingsPage />
          </AccountArea>
        ),
      },
      {
        path: '/oferentes/:id/servicios',
        element: (
          <AccountArea area="veterinary">
            <OfferingsPage />
          </AccountArea>
        ),
      },
      {
        path: '/oferentes/:id/editar',
        element: (
          <AccountArea area="veterinary">
            <ProviderEditPage />
          </AccountArea>
        ),
      },
      {
        path: '/administracion/oferentes',
        element: (
          <AccountArea area="admin">
            <AdminPage />
          </AccountArea>
        ),
      },
      { path: '/establecimientos/:id', element: <PublicEstablishmentPage /> },
      {
        path: '/establecimientos/:id/como-llegar',
        element: <DirectionsPage />,
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
