import { useEffect } from 'react';
import { Link } from 'react-router';
import { BrandSymbol } from '@/components/ui/Brand';
import { Icon } from '@/components/ui/Icon';
import { useAccountContext } from '@/features/auth/useAccountContext';

export function HomePage() {
  const account = useAccountContext();
  const context = !account.isError ? account.data : undefined;
  const veterinary =
    context?.account_type === 'veterinary' && context.role !== 'admin';
  const admin = context?.role === 'admin';
  useEffect(() => {
    document.title = 'Inicio · Servicios veterinarios';
  }, []);
  return (
    <section>
      <div className="home-hero">
        <div>
          <h1 className="text-xs font-semibold uppercase tracking-widest text-brand-700">
            Inicio
          </h1>
          <h2 className="mt-4 text-3xl font-bold leading-tight tracking-tight text-brand-900 sm:text-4xl">
            Su bienestar,
            <br />
            <span className="text-brand-700">más cerca de ti.</span>
          </h2>
          <p>
            {admin
              ? 'Revisa solicitudes de establecimientos y administra su publicación.'
              : veterinary
                ? 'Organiza tu establecimiento, su equipo y la atención de sus pacientes.'
                : 'Encuentra establecimientos veterinarios, organiza los datos de tus mascotas y conecta con el cuidado que necesitan.'}
          </p>
          <Link
            to={
              admin
                ? '/administracion/oferentes'
                : veterinary
                  ? '/oferentes'
                  : '/explorar'
            }
            className="button button-primary"
          >
            <Icon name="search" />
            {admin
              ? 'Revisar establecimientos'
              : veterinary
                ? 'Gestionar mi veterinaria'
                : 'Explorar establecimientos'}
          </Link>
        </div>
        <div className="home-hero__mark">
          <BrandSymbol />
        </div>
      </div>
      <div className="quick-links">
        {!veterinary && !admin && (
          <Link to="/perfil" className="quick-link">
            <Icon name="paw" />
            <div>
              <h2>Tus mascotas</h2>
              <p>Un espacio para quienes son parte de tu familia.</p>
            </div>
          </Link>
        )}
        {(!context || veterinary) && (
          <Link to="/oferentes" className="quick-link">
            <Icon name="store" />
            <div>
              <h2>Tu establecimiento</h2>
              <p>Regístralo y consulta el estado de su revisión.</p>
            </div>
          </Link>
        )}
        <Link to="/cuenta" className="quick-link">
          <Icon name="user" />
          <div>
            <h2>Tu cuenta</h2>
            <p>Accede, crea tu perfil y mantén tus datos al día.</p>
          </div>
        </Link>
      </div>
    </section>
  );
}
