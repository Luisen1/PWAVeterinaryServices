# Mensajería

HU24 implementa chat privado de texto entre cuenta y equipo de una sede. `model.ts` valida conversaciones/mensajes y une por ID con cursores bigint como cadenas. `api.ts` integra Postgres Changes, recibos y recuperación HTTP; `ChatPages.tsx` ofrece inicio, bandejas y conversación.

El responsable o permiso explícito `messages` da acceso al equipo; otros permisos no lo conceden. Persistir precede a «Enviado» y el botón de lectura confirma «Leído». El servidor deriva autor/lado/hora y valida cada acción; RLS también protege Realtime. Texto en memoria mientras se edita y guardado remoto al enviar, sin envío offline automático ni historial público/IndexedDB.

Rutas: `/mensajes`, `/mensajes/nuevo`, `/mensajes/:id`, `/oferentes/mensajes`. Entrada desde ficha conserva la sede durante acceso/registro. Ver [HU22-HU24](../../../docs/hu22-hu24.md).

HU25-HU26 añaden fotos/voz en `MediaComposer.tsx`, `MediaBlob.tsx`, `MediaMessage.tsx` y `media-store.ts`. Los archivos se guardan como pendientes privados en `pending_attachments` antes de subir; reintentos conservan UUID/blob y no duplican. La Edge Function valida bytes/metadatos, guarda Storage privado y publica el mensaje al finalizar. La descarga revalida RLS y usa URL blob efímera; el audio se reproduce con controles nativos. Hay limpieza explícita de subidas incompletas propias si se perdió el borrador local.

No hay autoenvío al reconectar. `message_drafts` sigue sin integrar y el texto no promete sobrevivir al cerrar pestaña; los blobs guardados sí persisten por cuenta hasta envío/descarte/purga. Llamadas LiveKit están preparadas, sin activación/prueba entre dos equipos; push sigue pendiente. Ver [HU25-HU27](../../../docs/hu25-hu27.md).
