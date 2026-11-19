import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { z } from 'zod';
import {
  Workspace,
  Verified,
  Notice,
  cardClass,
  secondaryClass,
  fieldClass,
} from '@/features/directory/Workspace';
import { useAccountContext } from '@/features/auth/useAccountContext';
import { useOnline } from '@/pwa/useOnline';
import { appointmentRpc } from '@/features/appointments/requests-api';
const configSchema = z.object({
  map_daily: z.number().int(),
  route_daily: z.number().int(),
  media_bytes: z.number().int(),
  error_threshold: z.number().int(),
  queue_minutes: z.number().int(),
  push_failures: z.number().int(),
  call_failures: z.number().int(),
});
const dashboardSchema = z.object({
  checked_at: z.string(),
  settings: z.object({ revision: z.number(), config: configSchema }),
  metrics: z.object({
    map_attempts: z.number(),
    route_attempts: z.number(),
    storage_bytes: z.number(),
    open_reports: z.number(),
    pending_push: z.number(),
  }),
  alerts: z.array(
    z.object({
      code: z.string(),
      component: z.string(),
      level: z.enum(['warning', 'critical']),
      active: z.boolean(),
      observed: z.number(),
      threshold: z.number(),
      opened_at: z.string(),
      checked_at: z.string(),
      acknowledged_at: z.string().nullable(),
    }),
  ),
});
const names: Record<string, string> = {
  map_budget: 'Intentos de carga de mapa',
  route_budget: 'Intentos de rutas',
  storage_usage: 'Espacio de archivos',
  push_queue_lag: 'Retraso de cola push',
  push_failures: 'Entregas push fallidas',
  call_failures: 'Incidencias de llamada',
  errors_api: 'Errores de API',
  errors_map: 'Errores de mapas',
  errors_media: 'Errores de archivos',
  errors_push: 'Errores de notificaciones',
  errors_call: 'Errores del servicio de llamadas',
};
export function OperationsPage() {
  return (
    <Workspace
      title="Estado y límites de operación"
      description="Alertas agregadas y límites de la aplicación, sin contenido privado."
    >
      <Verified>{(owner) => <Dashboard owner={owner} />}</Verified>
    </Workspace>
  );
}
function Dashboard({ owner }: { owner: string }) {
  const context = useAccountContext(),
    online = useOnline();
  const query = useQuery({
    queryKey: ['operation-dashboard', owner],
    queryFn: async () =>
      dashboardSchema.parse(await appointmentRpc('operation_dashboard', {})),
    enabled: online && context.data?.role === 'admin',
    retry: false,
    refetchInterval: online ? 60_000 : false,
  });
  const acknowledge = useMutation({
    mutationFn: (code: string) =>
      appointmentRpc('acknowledge_operation_alert', { p_code: code }),
    onSuccess: () => void query.refetch(),
  });
  if (context.data?.role !== 'admin')
    return <Notice>Esta sección requiere administración.</Notice>;
  return (
    <div className="space-y-5">
      <Notice>
        Los contadores de mapas son intentos realizados desde esta aplicación,
        no una factura de Google. Las alertas no detienen cobros del proveedor;
        configura también sus restricciones y cuotas.
      </Notice>
      <button
        className={secondaryClass}
        disabled={!online || query.isFetching}
        onClick={() => void query.refetch()}
      >
        Comprobar operación ahora
      </button>
      {query.isPending && online && (
        <Notice>Consultando estado técnico…</Notice>
      )}
      {!online && <Notice>Conéctate para comprobar el estado actual.</Notice>}
      {query.isError && (
        <Notice error>
          No pudimos comprobar la operación. No se presenta como un servicio
          saludable.
        </Notice>
      )}
      {online && !query.isError && query.data && (
        <>
          <p className="text-sm">
            Comprobado:{' '}
            {new Date(query.data.checked_at).toLocaleString('es-CO', {
              timeZone: 'America/Bogota',
            })}{' '}
            · America/Bogota
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {Object.entries({
              map_attempts: 'Intentos de mapa hoy',
              route_attempts: 'Intentos de ruta hoy',
              storage_bytes: 'Bytes almacenados',
              open_reports: 'Reportes pendientes',
              pending_push: 'Entregas push pendientes',
            }).map(([key, label]) => (
              <article key={key} className={cardClass}>
                <h2 className="font-semibold">{label}</h2>
                <p>
                  {query.data.metrics[
                    key as keyof typeof query.data.metrics
                  ].toLocaleString('es-CO')}
                </p>
              </article>
            ))}
          </div>
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Alertas técnicas</h2>
            {query.data.alerts.filter((a) => a.active).length === 0 && (
              <Notice>No hay umbrales activos en esta comprobación.</Notice>
            )}
            {query.data.alerts
              .filter((a) => a.active)
              .map((alert) => (
                <article key={alert.code} className={`${cardClass} space-y-2`}>
                  <h3 className="font-semibold">
                    {names[alert.code] ?? 'Incidencia técnica'} ·{' '}
                    {alert.level === 'critical' ? 'Crítica' : 'Advertencia'}
                  </h3>
                  <p>
                    Observado: {alert.observed.toLocaleString('es-CO')} ·
                    Umbral: {alert.threshold.toLocaleString('es-CO')}
                  </p>
                  <p className="text-sm">
                    {alert.component} · {alert.code}
                  </p>
                  <button
                    className={secondaryClass}
                    disabled={
                      acknowledge.isPending ||
                      !!alert.acknowledged_at ||
                      !online
                    }
                    onClick={() => acknowledge.mutate(alert.code)}
                  >
                    {alert.acknowledged_at
                      ? 'Revisada; sigue activa hasta recuperarse'
                      : 'Marcar alerta como revisada'}
                  </button>
                </article>
              ))}
            {acknowledge.isError && (
              <Notice error>
                No se pudo confirmar la revisión de la alerta.
              </Notice>
            )}
          </section>
          <Limits
            key={query.data.settings.revision}
            settings={query.data.settings}
            onSaved={() => query.refetch()}
          />
        </>
      )}
    </div>
  );
}
function Limits({
  settings,
  onSaved,
}: {
  settings: z.infer<typeof dashboardSchema>['settings'];
  onSaved: () => Promise<unknown>;
}) {
  const [config, setConfig] = useState(settings.config),
    online = useOnline();
  const save = useMutation({
    mutationFn: () =>
      appointmentRpc('save_operation_settings', {
        p_revision: settings.revision,
        p_config: config,
      }),
    onSuccess: async () => {
      await onSaved();
    },
  });
  const labels: Record<keyof typeof config, string> = {
    map_daily: 'Máximo diario de intentos de mapa',
    route_daily: 'Máximo diario de intentos de ruta',
    media_bytes: 'Presupuesto de archivos de chat en bytes',
    error_threshold: 'Errores en cinco minutos para alertar',
    queue_minutes: 'Minutos de atraso de cola push',
    push_failures: 'Entregas fallidas en una hora para alertar',
    call_failures: 'Incidencias de llamada en quince minutos',
  };
  return (
    <details className={cardClass}>
      <summary className="font-semibold">Configurar límites y umbrales</summary>
      <form
        className="mt-4 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <Notice>
          Estos límites controlan intentos y reservas de archivos de la app. No
          cambian tu plan ni la facturación de Google, Supabase o LiveKit.
        </Notice>
        {Object.entries(labels).map(([key, label]) => (
          <label key={key} className="block">
            {label}
            <input
              className={fieldClass}
              type="number"
              min={key === 'media_bytes' ? 5242880 : 1}
              max={key === 'queue_minutes' ? 1440 : 1073741824}
              step={1}
              required
              value={config[key as keyof typeof config]}
              onChange={(e) =>
                setConfig((p) => ({ ...p, [key]: e.target.valueAsNumber }))
              }
            />
          </label>
        ))}
        <button
          className="button button-primary"
          disabled={!online || save.isPending}
        >
          Guardar límites con revisión
        </button>
        {save.isError && (
          <Notice error>
            No se guardaron los límites. Revisa sus valores o actualiza si otra
            persona los cambió.
          </Notice>
        )}
      </form>
    </details>
  );
}
