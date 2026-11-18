# Dispositivo, preferencias y bandeja de notificaciones

HU30 añade `/cuenta/notificaciones` para ambos tipos de cuenta y administración. `api.ts` gestiona un UUID de instalación, permiso explícito del navegador, alta idempotente y baja por cuenta/dispositivo. El servidor conserva endpoints y claves únicamente en `private.push_subscriptions`; las RPC no admiten un propietario del cliente ni devuelven endpoints.

`push_bindings` de IndexedDB v5 conserva la intención antes del alta y la elegibilidad solo tras éxito. El cierre desvincula remotamente antes de purgar; si esa confirmación falla con un vínculo activo/incierto, mantiene sesión/datos para reintentar. `session-store` retira elegibilidad de cuentas anteriores al cambiar/expirar sesión; el SW solo presenta contenido genérico de una cuenta localmente activa. No confundir permiso global del navegador con suscripción de la cuenta.

HU31 añade `NotificationPreferences` y el emisor remoto `supabase/functions/notification-push`: preferencias por cuenta, recordatorios por revisión y cola con leases, reautorización y tres intentos máximos. Triggers persisten avisos únicos en la transacción de cita/mensaje. Cancelar/reprogramar invalida recordatorios anteriores. Un 2xx significa aceptación del servicio push, sin acreditar recepción.

HU32 añade `/notificaciones`, `NotificationInboxPage` e `inbox-api.ts`: páginas de treinta, conteo y lectura explícita, carga/vacío/error/offline. `read_notification` deriva el destino y comprueba autorización actual. No aceptar rutas arbitrarias de payload ni marcar mensajes del chat al leer un aviso. La bandeja consulta online, sin copia IndexedDB; limpiar sus consultas al cambiar de cuenta.

`npm run push:keys` conserva VAPID y genera `NOTIFICATION_WORKER_SECRET` si falta, sin mostrarlos. `VITE_WEB_PUSH_PUBLIC_KEY` es pública; la privada, `WEB_PUSH_SUBJECT` y el secreto pertenecen al servidor. El archivo raíz sigue siendo el origen de configuración. Desarrollo usa Vault; la configuración del emisor solo es recuperable por el runtime `service_role` con secreto vigente cuando no hay variables Edge. El job remoto está activo cada minuto. El SW muestra contenido mínimo, usa tag por aviso y abre la bandeja solo para una cuenta localmente activa.

Ver [HU31–HU33](../../../docs/hu31-hu33.md) para contratos, operación y aceptación física pendiente; [HU28–HU30](../../../docs/hu28-hu30.md) conserva la implementación inicial de suscripciones.
