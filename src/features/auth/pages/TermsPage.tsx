import { AuthFrame } from '@/features/auth/components/AuthFrame';
export function TermsPage() {
  return (
    <AuthFrame
      title="Condiciones de uso"
      description="Aplicación académica de servicios veterinarios"
    >
      <div className="space-y-5 text-sm leading-7">
        <p>
          Los establecimientos declaran sus servicios, horarios y
          disponibilidad. Confirma por teléfono la atención de urgencias. Un
          horario de apertura no asegura disponibilidad profesional.
        </p>
        <p>
          Las rutas y los tiempos de viaje son estimaciones de Google Maps.
          Pueden variar por tráfico, cobertura y condiciones del recorrido;
          sigue la señalización y verifica las condiciones de acceso.
        </p>
        <p>
          Al utilizar las funciones de Google Maps se aplican los{' '}
          <a
            className="underline"
            href="https://www.google.com/help/terms_maps/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Términos de Servicio de Google Maps
          </a>{' '}
          y la{' '}
          <a
            className="underline"
            href="https://policies.google.com/privacy"
            target="_blank"
            rel="noopener noreferrer"
          >
            Política de Privacidad de Google
          </a>
          .
        </p>
        <p>
          Un borrador local o un apartado temporal no constituye una cita
          solicitada ni confirmada. Los apartados vencen automáticamente y la
          disponibilidad se revalida en el servidor.
        </p>
      </div>
    </AuthFrame>
  );
}
