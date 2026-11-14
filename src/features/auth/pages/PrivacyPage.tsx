import { PRIVACY_POLICY_VERSION } from '@/features/auth/schemas';
import { AuthFrame } from '@/features/auth/components/AuthFrame';

export function PrivacyPage() {
  return (
    <AuthFrame
      title="Aviso de privacidad"
      description={`Entorno de desarrollo · Versión ${PRIVACY_POLICY_VERSION}`}
    >
      <div className="space-y-5 text-sm leading-7 text-stone-700">
        <p>
          Esta aplicación académica de servicios veterinarios utiliza tu correo
          electrónico para crear tu cuenta, verificar su titularidad, permitir
          el acceso y recuperar la contraseña.
        </p>
        <p>
          La autenticación y los datos de la cuenta se procesan mediante
          Supabase. La aplicación conserva en este navegador la sesión necesaria
          para mantener el acceso. Al cerrar sesión se eliminan los datos
          privados locales de la cuenta. Si existen pendientes, se solicita una
          decisión antes de descartarlos.
        </p>
        <p>
          Se registra la versión de este aviso y la fecha de aceptación. El
          correo y el registro de aceptación son accesibles por la cuenta
          correspondiente bajo controles de acceso.
        </p>
        <p>
          Este entorno se encuentra en desarrollo. La información del
          responsable, el contacto para solicitudes y los plazos de conservación
          se incorporarán al aviso antes de su publicación para uso general.
        </p>
      </div>
    </AuthFrame>
  );
}
