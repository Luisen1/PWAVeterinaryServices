# Persistencia local

La instancia `db` es única y se abre de forma diferida al usarla. La versión 1 declara diez tablas vacías. `data`, `payload` y `value` admiten JSON tipado. Los archivos pendientes admiten `Blob`. Los registros privados tienen `owner_id` obligatorio. Los índices compuestos permiten consultas por cuenta.

`operation_id` debe ser un UUID creado por `crypto.randomUUID()` al construir una operación en una fase futura. La tabla outbox no ejecuta, reintenta ni sincroniza operaciones. Las fechas se almacenan en ISO 8601 UTC y la interfaz usa America/Bogota.

## Migraciones

1. Conservar siempre los bloques de versiones publicadas.
2. Añadir `db.version(2).stores(...)` para el siguiente cambio de índices o tablas.
3. Añadir `.upgrade(async transaction => { ... })` si cambia el contenido de registros existentes. Usar solo la transacción IndexedDB, sin peticiones remotas.
4. Probar una base poblada con la versión anterior antes de publicar. No borrar IndexedDB para migrar.

`purgePrivateLocalData(ownerId)` elimina los registros de esa cuenta en una sola transacción. Sin argumento borra todas las tablas privadas, incluidos adjuntos, outbox y metadatos. Conserva `catalog`, `services` y `hours`. Todas las filas de `sync_meta` deben tener un propietario. El futuro cierre de sesión debe detener primero las escrituras y la sincronización para impedir que se creen filas después de la purga.
