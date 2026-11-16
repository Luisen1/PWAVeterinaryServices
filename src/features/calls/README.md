# Llamadas

HU27 tiene integración LiveKit Cloud preparada: cuenta profesional asignada desde el detalle, autorización en servidor de cliente/host/estado/ventana y JWT corto para sala privada por cita/revisión. `CallPanel.tsx`, `VideoCallPage.tsx`, `model.ts` y `livekit.ts` implementan el cliente; el SDK se carga al entrar y las pistas se liberan al salir/fallar/abortar.

El usuario ya creó el proyecto LiveKit y reemplazó el secreto enmascarado. La configuración local única está en `.env.local` de la raíz; `npm run deploy:secrets` carga solo las variables del backend en Supabase. No hay secretos remotos ni trabajo de cierre activados; el endpoint devuelve servicio pendiente. No se ha verificado una videollamada entre dos equipos. **No declarar HU27 aceptada ni HU28-HU29 implementadas.**

La activación requiere secretos de servidor y mantenimiento con revocación/cierre de salas; TTL del JWT no desconecta una sesión activa. Ver [guía y evidencia](../../../docs/hu25-hu27.md).
