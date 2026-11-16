import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { useAuth } from './useAuth';
import { useAccountContext } from './useAccountContext';
import {
  accountTypeLabels,
  canUseArea,
  type AccountType,
} from './account-types';
import {
  Notice,
  secondaryClass,
  Workspace,
} from '@/features/directory/Workspace';

export function AccountArea({
  area,
  children,
}: {
  area: AccountType | 'admin';
  children: ReactNode;
}) {
  const auth = useAuth();
  const context = useAccountContext();
  const identity = auth.user ?? auth.offlineUser;
  // Las pantallas existentes conservan sus avisos de acceso/confirmación para visitantes.
  if (!identity?.email_confirmed_at) return children;
  if (!context.data || context.isError)
    return (
      <Workspace
        title="Comprobar tipo de cuenta"
        description="Validamos el acceso a esta sección."
      >
        <Notice error={context.isError}>
          {context.isError
            ? 'No pudimos comprobar tu tipo de cuenta. Recupera conexión y reintenta.'
            : 'Consultando tipo y permisos de la cuenta…'}
        </Notice>
        <button
          className={secondaryClass}
          onClick={() => void context.refetch()}
        >
          Reintentar
        </button>
      </Workspace>
    );
  if (!context.data.account_type_selected && context.data.role !== 'admin')
    return (
      <Workspace
        title="Elige tu tipo de cuenta"
        description="Define el recorrido de esta cuenta antes de continuar."
      >
        <Link to="/cuenta" className={secondaryClass}>
          Elegir desde mi cuenta
        </Link>
      </Workspace>
    );
  if (!canUseArea(context.data, area))
    return (
      <Workspace
        title="Sección de otra cuenta"
        description={`Esta sección corresponde a ${area === 'admin' ? 'Administración' : accountTypeLabels[area]}.`}
      >
        <Notice>
          {area === 'admin'
            ? 'Esta sección requiere una cuenta administradora.'
            : 'Tu perfil tiene un recorrido separado. Continúa desde las opciones de tu cuenta.'}
        </Notice>
        <Link to="/cuenta" className={secondaryClass}>
          Volver a mi cuenta
        </Link>
      </Workspace>
    );
  return children;
}
