import { useEffect, useRef } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { Icon, type IconName } from '@/components/ui/Icon';
import { ConnectionStatus } from '@/pwa/ConnectionStatus';
import { InstallApp } from '@/pwa/InstallApp';
import { UpdatePrompt } from '@/pwa/UpdatePrompt';
import { Brand } from '@/components/ui/Brand';
import { useAccountContext } from '@/features/auth/useAccountContext';
import { PendingReminder } from '@/features/sync/PendingPage';

const publicLinks: { to: string; label: string; icon: IconName }[] = [
  { to: '/', label: 'Inicio', icon: 'home' },
  { to: '/explorar', label: 'Explorar', icon: 'compass' },
  { to: '/citas', label: 'Citas', icon: 'calendar' },
  { to: '/cuenta', label: 'Perfil', icon: 'user' },
];

export function Layout() {
  const account = useAccountContext();
  const context = !account.isError ? account.data : undefined;
  const links = publicLinks.map((link) => {
    if (link.to === '/citas' && context?.role === 'admin')
      return { ...link, to: '/administracion/oferentes', label: 'Revisión' };
    if (context?.account_type === 'veterinary' && context.role !== 'admin') {
      if (link.to === '/explorar')
        return {
          ...link,
          to: '/oferentes',
          label: 'Veterinaria',
          icon: 'store' as const,
        };
      if (link.to === '/citas')
        return {
          ...link,
          to: context.can_read_appointments
            ? '/oferentes/agenda'
            : context.can_message_team
              ? '/oferentes/mensajes'
              : '/oferentes/servicios',
          label: context.can_read_appointments
            ? 'Agenda'
            : context.can_message_team
              ? 'Mensajes'
              : 'Servicios',
        };
    }
    return link;
  });
  const location = useLocation();
  const main = useRef<HTMLElement>(null);
  const previousPath = useRef(location.pathname);
  const authLayout = [
    '/acceso',
    '/registro',
    '/recuperar-acceso',
    '/restablecer-clave',
    '/auth/confirmar',
    '/privacidad',
    '/terminos',
  ].includes(location.pathname);

  useEffect(() => {
    if (previousPath.current !== location.pathname) {
      main.current?.focus();
      window.scrollTo(0, 0);
      previousPath.current = location.pathname;
    }
  }, [location.pathname]);

  return (
    <div className={`app-shell ${authLayout ? 'auth-layout' : ''}`}>
      <a
        href="#contenido"
        className="sr-only fixed left-4 top-4 z-50 rounded-lg bg-brand-700 px-4 py-3 text-white focus:not-sr-only"
      >
        Saltar al contenido
      </a>
      <header className="app-header">
        <div className="app-header__inner">
          <Brand />
          <div className="app-header__actions">
            {!authLayout && (
              <nav
                aria-label="Navegación de escritorio"
                className="desktop-nav"
              >
                {links.map(({ to, label }) => (
                  <NavLink key={to} to={to} end={to === '/'}>
                    {label}
                  </NavLink>
                ))}
              </nav>
            )}
            <ConnectionStatus />
          </div>
        </div>
      </header>
      <main
        id="contenido"
        ref={main}
        tabIndex={-1}
        className="app-main focus:outline-none"
      >
        <Outlet />
        {['/', '/cuenta'].includes(location.pathname) && <PendingReminder />}
        {!authLayout && <InstallApp />}
      </main>
      <footer className="app-footer">
        <p>Servicios Veterinarios · Cuidamos lo que más quieres</p>
        <Link to="/privacidad">Aviso de privacidad</Link>
        <Link to="/terminos">Condiciones de uso</Link>
      </footer>
      <UpdatePrompt />
      {!authLayout && (
        <nav aria-label="Navegación principal" className="mobile-nav">
          <div className="mobile-nav__inner">
            {links.map(({ to, label, icon }) => (
              <NavLink key={to} to={to} end={to === '/'}>
                <Icon name={icon} className="size-5" />
                {label}
              </NavLink>
            ))}
          </div>
        </nav>
      )}
    </div>
  );
}
