import { useEffect, useRef } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { Icon, type IconName } from '@/components/ui/Icon';
import { ConnectionStatus } from '@/pwa/ConnectionStatus';
import { InstallApp } from '@/pwa/InstallApp';
import { UpdatePrompt } from '@/pwa/UpdatePrompt';

const links: { to: string; label: string; icon: IconName }[] = [
  { to: '/', label: 'Inicio', icon: 'home' },
  { to: '/explorar', label: 'Explorar', icon: 'compass' },
  { to: '/citas', label: 'Citas', icon: 'calendar' },
  { to: '/cuenta', label: 'Cuenta', icon: 'user' },
];

export function Layout() {
  const location = useLocation();
  const main = useRef<HTMLElement>(null);
  const previousPath = useRef(location.pathname);

  useEffect(() => {
    if (previousPath.current !== location.pathname) {
      main.current?.focus();
      window.scrollTo(0, 0);
      previousPath.current = location.pathname;
    }
  }, [location.pathname]);

  return (
    <div className="mx-auto min-h-dvh max-w-5xl px-5 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-[calc(1.5rem+env(safe-area-inset-top))] sm:px-10 sm:pt-10">
      <a
        href="#contenido"
        className="sr-only fixed left-4 top-4 z-50 rounded-lg bg-brand-700 px-4 py-3 text-white focus:not-sr-only"
      >
        Saltar al contenido
      </a>
      <header className="flex items-center justify-between gap-3 border-b border-stone-200 pb-6">
        <Link
          to="/"
          aria-label="Servicios veterinarios, inicio"
          className="flex min-w-0 items-center gap-3 rounded-lg"
        >
          <img
            src="/icons/icon-192.png"
            alt=""
            width="44"
            height="44"
            className="size-11 rounded-2xl"
          />
          <span className="text-sm font-semibold leading-5 tracking-tight sm:text-base">
            Servicios
            <br />
            veterinarios
          </span>
        </Link>
        <ConnectionStatus />
      </header>
      <main
        id="contenido"
        ref={main}
        tabIndex={-1}
        className="py-8 focus:outline-none sm:py-12"
      >
        <Outlet />
        <InstallApp />
      </main>
      <footer className="flex flex-wrap justify-between gap-2 border-t border-stone-200 pt-5 text-xs text-stone-500">
        <p>Base técnica · Versión 0.1.0</p>
        <p>Español · America/Bogota</p>
      </footer>
      <UpdatePrompt />
      <nav
        aria-label="Navegación principal"
        className="fixed inset-x-0 bottom-0 z-20 border-t border-stone-200 bg-white pb-[env(safe-area-inset-bottom)]"
      >
        <div className="mx-auto grid max-w-xl grid-cols-4 px-3 py-2">
          {links.map(({ to, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `mx-1 flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-2 py-2 text-xs font-medium transition-colors ${isActive ? 'bg-brand-50 text-brand-700' : 'text-stone-500 hover:bg-stone-50 hover:text-stone-800'}`
              }
            >
              <Icon name={icon} className="size-5" />
              {label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
