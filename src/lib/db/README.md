# Persistencia local

Esquema actual: **v6, 18 tablas**. Añade `appointment_request_drafts` y conserva mensajes, adjuntos y operaciones previas. Se prueba migración v5-v6 y purga por cuenta. [HU34-HU36](../../../docs/hu34-hu36.md) describe el paquete público completo y la persistencia atómica de las intenciones privadas.

La instancia `db` es única y se abre al usarla. v1 declaró diez tablas; v2 añadió `preferences`, `offline_sessions` y `public_snapshots`; v3 añadió `availability_drafts`; v4 añadió `appointment_change_drafts`; **v5 añade `push_bindings` y `call_failures`**. Se conservan esquemas y datos previos. Los registros privados tienen `owner_id` obligatorio. `appointment_snapshots` guarda detalles autorizados como referencia offline; nunca se mezclan con catálogo público.

Outbox usa UUID de operación. Perfil/mascotas/preferencias conservan sus manejadores; HU35 añade `chat.message`, `appointment.request`, `appointment.change` y `availability.draft`. La escritura de dato e intención es transaccional. Los borradores de horario no reservan ni se envían al reconectar. El centro solicita acciones explícitas y no marca operaciones desconocidas como completadas. El paquete público guarda fecha, publicaciones y servicios; no contiene notas/origen GPS ni rutas/ETA. Los instantes se almacenan en ISO y se presentan con zona explícita.

## Migraciones

1. Conservar siempre los bloques de versiones publicadas.
2. Añadir una nueva versión para el siguiente cambio de índices o tablas; el esquema actual es v6, con 18 tablas y `appointment_request_drafts`.
3. Añadir `.upgrade(async transaction => { ... })` si cambia el contenido de registros existentes. Usar solo la transacción IndexedDB, sin peticiones remotas.
4. Probar una base poblada con la versión anterior antes de publicar. No borrar IndexedDB para migrar.

`purgePrivateLocalData(ownerId)` elimina registros de esa cuenta en una transacción. Sin argumento purga todas las cuentas. Conserva catálogo y snapshots públicos. El cierre comparte bloqueo de escrituras por cuenta y exige decisión sobre pendientes, incluidos texto, solicitudes, horarios, cambios y archivos. HU35 añade intención en outbox para texto y citas; sus borradores no se envían automáticamente. Los conteos evitan duplicar una misma intención presente en ambas tablas.

El segundo argumento opcional `assertCanPurge` permite comprobar pendientes dentro de la misma transacción antes de borrar. El cierre de sesión lo usa para exigir descarte explícito. Ese callback debe usar únicamente IndexedDB, sin operaciones de red.

HU25-HU26 concretan `pending_attachments`, sin cambiar v4: blobs privados por cuenta/conversación, UUID estable, tipo, estado de envío/descarte, intento y error. Se escriben antes de subir y se conservan ante respuesta perdida. Máximo cinco pendientes/20 MiB locales, con comprobante de sesión y Web Locks. No forman parte del replay automático de outbox. La limpieza remota de subidas perdidas exige acción explícita; no guardar medios recibidos ni tokens de LiveKit en IndexedDB.
