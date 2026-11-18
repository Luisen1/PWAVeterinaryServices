# Llamadas

HU27 tiene integración LiveKit Cloud preparada: cuenta profesional asignada desde el detalle, autorización en servidor de cliente/host/estado/ventana y JWT corto para sala privada por cita/revisión. `CallPanel.tsx`, `VideoCallPage.tsx`, `model.ts` y `livekit.ts` implementan el cliente; el SDK se carga al entrar y las pistas se liberan al salir/fallar/abortar.

El usuario ya creó el proyecto LiveKit y reemplazó el secreto enmascarado. La configuración local única está en `.env.local` de la raíz; `npm run deploy:secrets` carga solo las variables del backend en Supabase. La activación remota/mantenimiento y la prueba de dos equipos siguen pendientes según el último estado registrado. **No declarar HU27–HU29 aceptadas en condiciones reales por pasar tests con transporte controlado.**

HU28–HU29 añaden controles de micrófono/cámara, solo audio antes/durante la llamada, cambio de dispositivos y recuperación acotada de la misma sala con autorización vigente. El controlador cierra a los 35 segundos de interrupción persistente, ante revocación/cambio de sala o fin de ventana. Ofrece reingreso, chat y teléfono publicado. Las incidencias privadas se registran sin medios ni texto libre, con UUID estable y pendientes por cuenta en IndexedDB v5. La limpieza incluye pistas creadas por cambios de cámara y capturas tardías. Ver [HU28–HU30](../../../docs/hu28-hu30.md).

La activación requiere secretos de servidor y mantenimiento con revocación/cierre de salas; TTL del JWT no desconecta una sesión activa. Ver [guía y evidencia](../../../docs/hu25-hu27.md).
