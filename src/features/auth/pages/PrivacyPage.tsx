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
          El tipo elegido, Dueño de mascota o Veterinaria, se guarda para
          separar las opciones de la cuenta. Esta elección no concede aprobación
          de establecimientos ni permisos administrativos o de equipo.
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
        <section className="space-y-3">
          <h2 className="font-semibold">
            Información adicional de mapas y disponibilidad
          </h2>
          <p>
            El origen GPS o manual permanece en memoria y se elimina al
            recargar. Los mapas de la aplicación se cargan desde Google Maps; al
            mostrarlos, Google recibe consultas de la zona visible. Al pulsar
            Calcular ruta se envían el origen y el destino; al abrir la
            navegación externa también se comparten los puntos elegidos. Google
            procesa esas consultas según su{' '}
            <a
              className="underline"
              href="https://policies.google.com/privacy"
              target="_blank"
              rel="noopener noreferrer"
            >
              Política de Privacidad
            </a>
            . No guardamos trazados ni estimaciones de Google en IndexedDB.
          </p>
          <p>
            Las notas privadas, favoritos y borradores de horario se guardan por
            cuenta en este dispositivo. Los apartados temporales se validan y
            almacenan en Supabase. Los datos privados locales se purgan al
            salir, tras decidir sobre los pendientes.
          </p>
          <p>
            Las solicitudes de cita registran en Supabase la mascota, el
            servicio, el horario y la modalidad, junto con los estados, motivos
            y fechas de sus cambios. Solo tu cuenta y el personal autorizado del
            establecimiento pueden consultarlas. Sus avisos se muestran dentro
            de la aplicación; esta versión no envía correos ni push de citas.
          </p>
          <p>
            Para preparar una cancelación o reprogramación sin conexión se
            guarda una copia privada del detalle consultado y del cambio
            pendiente en este dispositivo. La cita del servidor permanece
            vigente hasta aceptar el cambio. Estos datos se purgan al salir,
            tras decidir sobre los pendientes.
          </p>
          <p>
            El chat guarda en Supabase el texto, autor, identificador, fecha y
            confirmaciones de lectura. Solo la cuenta participante y el
            responsable o colaboradores con permiso de mensajes pueden
            consultarlo. La lectura del establecimiento es compartida entre su
            equipo autorizado. El historial de chat se mantiene en memoria del
            navegador durante la sesión; no se guarda como catálogo público ni
            se envía por correo o push.
          </p>
        </section>
        <p>
          Este entorno se encuentra en desarrollo. La información del
          responsable, el contacto para solicitudes y los plazos de conservación
          se incorporarán al aviso antes de su publicación para uso general.
        </p>
        <section className="space-y-3">
          <h2 className="font-semibold">
            Fotografías, notas de voz y llamadas
          </h2>
          <p>
            La cámara y el micrófono se solicitan solo bajo una acción tuya.
            Puedes revisar y descartar antes de enviar. Las fotografías y notas
            de voz enviadas se almacenan en Supabase de forma privada; su
            descarga se limita a participantes autorizados. Un archivo ya
            descargado puede permanecer en el dispositivo del receptor.
          </p>
          <p>
            Los archivos guardados como pendientes permanecen en este navegador
            por cuenta hasta enviarlos, descartarlos o cerrar sesión tras
            decidir sobre ellos. No se envían automáticamente al reconectar. Los
            archivos recibidos se mantienen solo en memoria mientras los
            consultas.
          </p>
          <p>
            Cuando el establecimiento active la videollamada, se compartirá
            audio y video con la otra parte autorizada mediante LiveKit Cloud.
            El acceso requiere cita virtual confirmada y ventana vigente. La
            aplicación no graba automáticamente la consulta y detiene cámara y
            micrófono al salir o fallar.
          </p>
        </section>
      </div>
    </AuthFrame>
  );
}
