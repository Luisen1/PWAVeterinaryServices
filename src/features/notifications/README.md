# Permiso y suscripciones de notificaciones

HU30 añade `/cuenta/notificaciones` para ambos tipos de cuenta y administración. `api.ts` gestiona un UUID de instalación, permiso explícito del navegador, alta idempotente y baja por cuenta/dispositivo. El servidor conserva endpoints y claves únicamente en `private.push_subscriptions`; las RPC no admiten un propietario del cliente ni devuelven endpoints.

`push_bindings` de IndexedDB v5 conserva la intención antes del alta y la elegibilidad solo tras éxito. El cierre desvincula remotamente antes de purgar; si esa confirmación falla con un vínculo activo/incierto, mantiene sesión/datos para reintentar. `session-store` retira elegibilidad de cuentas anteriores al cambiar/expirar sesión; el SW solo presenta contenido genérico de una cuenta localmente activa. No confundir permiso global del navegador con suscripción de la cuenta.

VAPID: `npm run push:keys` crea/valida el par en `.env.local` raíz sin imprimir secretos ni rotar claves existentes. `VITE_WEB_PUSH_PUBLIC_KEY` es pública; `WEB_PUSH_PRIVATE_KEY` queda reservada al futuro emisor. No existe envío de recordatorios HU31 ni bandeja HU32. Los accesos alternativos usan citas/avisos ya existentes y conversaciones, con sus guardas de rol/permisos.

Ver [HU28–HU30](../../../docs/hu28-hu30.md) para contratos, pruebas, compatibilidad y límites.
