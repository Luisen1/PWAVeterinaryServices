# Mensajería

HU24 implementa chat privado de texto entre cuenta y equipo de una sede. `model.ts` valida conversaciones/mensajes y une por ID con cursores bigint como cadenas. `api.ts` integra Postgres Changes, recibos y recuperación HTTP; `ChatPages.tsx` ofrece inicio, bandejas y conversación.

El responsable o permiso explícito `messages` da acceso al equipo; otros permisos no lo conceden. Persistir precede a «Enviado» y el botón de lectura confirma «Leído». El servidor deriva autor/lado/hora y valida cada acción; RLS también protege Realtime. Texto en memoria mientras se edita y guardado remoto al enviar, sin envío offline automático ni historial público/IndexedDB.

Rutas: `/mensajes`, `/mensajes/nuevo`, `/mensajes/:id`, `/oferentes/mensajes`. Entrada desde ficha conserva la sede durante acceso/registro. Ver [HU22-HU24](../../../docs/hu22-hu24.md).

Archivos, audios, llamadas y push siguen pendientes. `message_drafts` y `pending_attachments` siguen siendo infraestructura sin integración con este chat; no anunciar que el texto sobrevive al cerrar la pestaña.
