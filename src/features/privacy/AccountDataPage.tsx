import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import {
  Workspace,
  Verified,
  Notice,
  cardClass,
  fieldClass,
  secondaryClass,
} from '@/features/directory/Workspace';
import {
  privacyAction,
  deletionStatus,
  deletionQueue,
  downloadAccountExport,
} from './api';
import { useOnline } from '@/pwa/useOnline';
import { useAccountContext } from '@/features/auth/useAccountContext';
import { AuthField } from '@/features/auth/components/AuthField';

export function RetentionPolicy() {
  return (
    <section className="space-y-3" aria-labelledby="retention-policy">
      <h2 id="retention-policy" className="text-lg font-semibold">
        Conservación y eliminación de datos
      </h2>
      <p>
        Política académica academic-2026-11-18. Administración procesa la
        solicitud confirmada. Hasta que comience puedes seguir usando tu cuenta;
        una solicitud recibida todavía no significa que se haya eliminado.
      </p>
      <p>
        Al procesarla se revocan sesiones y suscripciones push, se cierran las
        salas, se cancelan citas vigentes, se retiran los establecimientos
        publicados y se eliminan tus archivos del almacenamiento activo.
      </p>
      <p>
        Se retiran correo, acceso, contacto, notas, preferencias y contenido de
        tus mensajes. Mascotas referenciadas e historial compartido conservan
        solo identificadores, especie, estados y fechas necesarios para no
        romper sus relaciones; se sustituyen nombres y se vacían motivos
        personales. La identidad técnica queda desactivada y anonimizada.
      </p>
      <p>
        Estas referencias mínimas se conservan mientras exista este proyecto
        académico. Las copias técnicas de Supabase siguen su ciclo de respaldo
        del proveedor; una restauración debe reaplicar las eliminaciones antes
        de habilitar el acceso. No podemos retirar archivos que otras personas
        ya descargaron ni datos de dispositivos desconectados: la app purga su
        copia al comprobar la eliminación con conexión o al cerrar sesión.
      </p>
      <p>
        Los borradores locales no enviados no forman parte de la exportación
        remota. Revísalos en Pendientes antes de solicitar eliminación. Un
        archivo JSON descargado queda bajo tu control; en un dispositivo
        compartido, retíralo después de usarlo.
      </p>
      <p>
        Puedes reportar una ficha o un mensaje concreto. Solo administración
        asignada a ese reporte puede revisar la evidencia mínima y su acceso
        queda registrado; esto no permite explorar conversaciones privadas. No
        incluyas datos ajenos innecesarios en el motivo. Al resolver se retira
        la copia de evidencia; la referencia, decisión y sus motivos se
        conservan durante el proyecto, sujetos a la eliminación de datos
        personales.
      </p>
      <p>
        La supervisión registra únicamente códigos técnicos y contadores, sin
        mensajes, archivos, contraseñas ni ubicaciones. Los fallos técnicos se
        depuran a los siete días y los intentos de mapas a los treinta días. Las
        copias de recuperación están cifradas y requieren una clave privada de
        operador; antes de recuperar se reaplican las eliminaciones vigentes.
      </p>
    </section>
  );
}
export function AccountDataPage() {
  return (
    <Workspace
      title="Mis datos y privacidad"
      description="Consulta el uso de tus datos, exporta tu información o solicita eliminar tu cuenta."
    >
      <Verified>{(owner) => <AccountData owner={owner} />}</Verified>
    </Workspace>
  );
}
function RetentionDetails() {
  return (
    <details className={cardClass}>
      <summary className="font-semibold">
        Política de conservación y eliminación
      </summary>
      <div className="mt-4">
        <RetentionPolicy />
      </div>
    </details>
  );
}
function AccountData({ owner }: { owner: string }) {
  const online = useOnline();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [operation] = useState(() => crypto.randomUUID());
  const status = useQuery({
    queryKey: ['account-data-status', owner],
    queryFn: deletionStatus,
    enabled: online,
    retry: false,
  });
  async function execute(action: 'export' | 'request_deletion') {
    setBusy(true);
    setMessage('');
    setError('');
    try {
      const result = await privacyAction({
        action,
        password,
        id: operation,
        confirmation,
      });
      if (action === 'export') {
        downloadAccountExport(result);
        setMessage(
          'Exportación preparada. Los enlaces privados a archivos vencen en cinco minutos.',
        );
      } else {
        setMessage(
          'Solicitud de eliminación recibida. Administración debe procesarla; tu cuenta todavía no está eliminada.',
        );
        await status.refetch();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo completar.');
    } finally {
      setPassword('');
      setBusy(false);
    }
  }
  return (
    <div className="space-y-6">
      <div className={cardClass}>
        <p>
          Tu perfil, mascotas, citas, texto y archivos se procesan en Supabase.
          Google recibe consultas de mapas/rutas y LiveKit transmite las
          llamadas autorizadas; la app no graba las llamadas.
        </p>
        <Link to="/privacidad" className="underline">
          Consultar aviso de privacidad completo
        </Link>
      </div>
      <RetentionDetails />
      <Link className={secondaryClass} to="/cuenta/pendientes">
        Revisar pendientes antes de continuar
      </Link>
      {!online && (
        <Notice>
          Recupera conexión para comprobar el estado, exportar o solicitar
          eliminación.
        </Notice>
      )}
      {status.isError && (
        <Notice error>
          No pudimos consultar tu solicitud.{' '}
          <button className="underline" onClick={() => void status.refetch()}>
            Reintentar estado
          </button>
        </Notice>
      )}
      {status.data && online && (
        <Notice>
          Solicitud registrada:{' '}
          {status.data.status === 'requested'
            ? 'Pendiente de procesamiento'
            : status.data.status === 'processing'
              ? 'Procesamiento iniciado'
              : 'Completada'}
          . Referencia: {status.data.id}
        </Notice>
      )}
      <form
        className={`${cardClass} space-y-4`}
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          void execute('export');
        }}
      >
        <h2 className="text-lg font-semibold">Exportar mis datos</h2>
        <p>
          Descarga JSON con tus datos remotos y enlaces temporales de tus
          archivos. No incluye contraseñas, sesiones ni mensajes escritos por
          otras cuentas.
        </p>
        <AuthField
          label="Contraseña actual para confirmar tu identidad"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          disabled={busy}
        />
        <button
          className="button button-primary"
          disabled={busy || !online || !password}
        >
          Reautenticar y exportar mis datos
        </button>
        <h2 className="text-lg font-semibold">
          Solicitar eliminación de mi cuenta
        </h2>
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
            disabled={busy}
          />
          He leído la política de conservación y entiendo que perderé el acceso
          cuando se procese.
        </label>
        <label className="block">
          Escribe ELIMINAR para confirmar
          <input
            className={fieldClass}
            autoComplete="off"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            disabled={busy}
          />
        </label>
        <button
          type="button"
          className={secondaryClass}
          disabled={
            busy ||
            !online ||
            !password ||
            !accepted ||
            confirmation !== 'ELIMINAR' ||
            !!status.data ||
            status.isError ||
            status.isPending
          }
          onClick={() => void execute('request_deletion')}
        >
          Reautenticar y solicitar eliminación
        </button>
        {busy && <Notice>Comprobando identidad y procesando la acción…</Notice>}
        {error && <Notice error>{error}</Notice>}
        {message && <Notice>{message}</Notice>}
      </form>
    </div>
  );
}
export function AccountDeletionAdminPage() {
  return (
    <Workspace
      title="Solicitudes de eliminación"
      description="Procesa únicamente solicitudes confirmadas por su titular."
    >
      <Verified>{(owner) => <DeletionAdmin owner={owner} />}</Verified>
    </Workspace>
  );
}
function DeletionAdmin({ owner }: { owner: string }) {
  const context = useAccountContext();
  const online = useOnline();
  const queue = useQuery({
    queryKey: ['account-deletion-queue', owner],
    queryFn: deletionQueue,
    enabled: online && context.data?.role === 'admin',
    retry: false,
  });
  const [selected, setSelected] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  if (context.data?.role !== 'admin')
    return <Notice>Esta sección requiere administración.</Notice>;
  async function process() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await privacyAction({
        action: 'process_deletion',
        id: selected,
        password,
        confirmation,
      });
      setMessage(
        'Eliminación completada: acceso revocado e información personal retirada.',
      );
      setSelected('');
      await queue.refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo procesar.');
      await queue.refetch();
    } finally {
      setPassword('');
      setBusy(false);
    }
  }
  return (
    <div className="space-y-5">
      <RetentionDetails />
      <button
        className={secondaryClass}
        onClick={() => void queue.refetch()}
        disabled={!online || busy}
      >
        Actualizar solicitudes de eliminación
      </button>
      {queue.isPending && <Notice>Consultando solicitudes…</Notice>}
      {queue.isError && <Notice error>No se pudo cargar la cola.</Notice>}
      {queue.data?.length === 0 && (
        <Notice>No hay solicitudes de eliminación.</Notice>
      )}
      {queue.data?.map((row) => (
        <article key={row.id} className={`${cardClass} space-y-2`}>
          <h2 className="font-semibold">Solicitud {row.id}</h2>
          <p>Cuenta: {row.owner_id}</p>
          <p>
            Estado:{' '}
            {row.status === 'requested'
              ? 'Pendiente'
              : row.status === 'processing'
                ? 'En proceso; puede reintentarse'
                : 'Completada'}
          </p>
          <p>
            {new Date(row.requested_at).toLocaleString('es-CO', {
              timeZone: 'America/Bogota',
            })}{' '}
            · America/Bogota
          </p>
          {row.status !== 'completed' && (
            <button
              className={secondaryClass}
              disabled={busy}
              onClick={() => {
                setSelected(row.id);
                setConfirmation('');
                setPassword('');
              }}
            >
              Revisar eliminación
            </button>
          )}
        </article>
      ))}
      {selected && (
        <form
          className={`${cardClass} space-y-4`}
          onSubmit={(e) => {
            e.preventDefault();
            void process();
          }}
        >
          <h2 className="font-semibold">
            Confirmar procesamiento de {selected}
          </h2>
          <Notice>
            Esta acción retira datos personales de forma irreversible. Si falla
            un servicio, el acceso queda bloqueado y debes reintentar la misma
            solicitud.
          </Notice>
          <AuthField
            label="Contraseña actual de administración"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy}
          />
          <label className="block">
            Escribe PROCESAR
            <input
              className={fieldClass}
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              disabled={busy}
            />
          </label>
          <button
            className="button button-primary"
            disabled={
              busy || !online || confirmation !== 'PROCESAR' || !password
            }
          >
            Procesar eliminación confirmada
          </button>
          <button
            className={secondaryClass}
            type="button"
            disabled={busy}
            onClick={() => setSelected('')}
          >
            Cancelar revisión
          </button>
        </form>
      )}
      {busy && <Notice>Procesando eliminación…</Notice>}
      {error && <Notice error>{error}</Notice>}
      {message && <Notice>{message}</Notice>}
    </div>
  );
}
