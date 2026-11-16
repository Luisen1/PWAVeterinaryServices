# Persistencia local

La instancia `db` es única y se abre al usarla. v1 declaró diez tablas; v2 añadió `preferences`, `offline_sessions` y `public_snapshots`; v3 añade `availability_drafts`. Se conservan los esquemas previos y sus datos. Los registros privados tienen `owner_id` obligatorio.

Outbox usa UUID de operación y manejadores de `profile.update`, `pet.save` y `preference.save`. Los borradores de horario no son operaciones de reserva y no se envían al reconectar. Los snapshots públicos guardan la fecha de consulta; no contienen notas/origen GPS ni rutas/ETA de Google. Los instantes se almacenan en ISO UTC y se presentan con zona explícita.

## Migraciones

1. Conservar siempre los bloques de versiones publicadas.
2. Añadir una nueva versión para el siguiente cambio de índices o tablas; el esquema actual es v3.
3. Añadir `.upgrade(async transaction => { ... })` si cambia el contenido de registros existentes. Usar solo la transacción IndexedDB, sin peticiones remotas.
4. Probar una base poblada con la versión anterior antes de publicar. No borrar IndexedDB para migrar.

`purgePrivateLocalData(ownerId)` elimina los registros de esa cuenta en una transacción. Sin argumento purga todas las cuentas. Conserva catálogo y snapshots públicos. El cierre comparte bloqueo de escrituras por cuenta y exige decisión sobre pendientes, incluidos los borradores de horario.

El segundo argumento opcional `assertCanPurge` permite comprobar pendientes dentro de la misma transacción antes de borrar. El cierre de sesión lo usa para exigir descarte explícito. Ese callback debe usar únicamente IndexedDB, sin operaciones de red.
