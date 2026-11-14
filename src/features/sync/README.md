# Sincronización

`account-sync.ts` implementa una cola acotada para los cambios de perfil y mascotas de HU03 y la sincronización antes del cierre de HU02. Valida la cuenta remota, preserva operaciones fallidas y solo confirma acciones con un manejador conocido. Las mascotas usan UUID estables y RPC idempotente.

`account-write-lock.ts` coordina sincronización, escrituras y cierre entre pestañas mediante Web Locks. El fallback sin esta API coordina solo la pestaña actual. Nunca se envían pendientes de otra cuenta. Los borradores y adjuntos de futuros dominios se conservan o se descartan explícitamente.

El protocolo general, resolución de conflictos, replay de adjuntos, cuotas y coordinación completa de HU35/HU36 siguen pendientes.
