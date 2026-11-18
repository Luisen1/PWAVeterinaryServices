# Sincronización

`account-sync.ts` implementa una cola acotada para los cambios de perfil y mascotas de HU03 y la sincronización antes del cierre de HU02. Valida la cuenta remota, preserva operaciones fallidas y solo confirma acciones con un manejador conocido. Las mascotas usan UUID estables y RPC idempotente.

`account-write-lock.ts` coordina sincronización, escrituras y cierre entre pestañas mediante Web Locks. El fallback sin esta API coordina solo la pestaña actual. Nunca se envían pendientes de otra cuenta. Los borradores y adjuntos de futuros dominios se conservan o se descartan explícitamente.

HU35-HU36 incorporan `/cuenta/pendientes`, `PendingPage`, `pending-store` y `usePending`. Reúnen operaciones, favoritos/notas, horarios, solicitudes/cambios de cita, texto, adjuntos e incidencias de la misma cuenta. La sincronización en primer plano procesa solo manejadores conocidos y textos previamente autorizados; citas y archivos tienen acciones explícitas. Los borradores no se envían al reconectar.

`local-owner.ts` exige sesión local vigente con comprobante para consultar y conservar datos, y cuenta revalidada antes de enviar. Una sesión expirada ofrece autenticación sin borrar pendientes. `usePending` observa únicamente consultas Dexie y vuelve a ejecutar la lectura autorizada; no mezclar Auth/webCrypto directamente dentro del observador.

Los stores de mensaje, solicitud y cambio guardan datos/operación antes del HTTP, conservan el ID y el contenido tras una respuesta perdida y no eliminan el pendiente hasta confirmar. Citas ocupadas/revisiones incompatibles y notas cambiadas permanecen visibles para decidir. La pantalla compara nota local/remota. Descartar una copia local no cancela una operación ya recibida por el servidor. El conteo de salida evita contar dos veces una intención y la purga incluye las tablas nuevas de IndexedDB v6.

Ver [HU34-HU36](../../../docs/hu34-hu36.md) para contratos, límites, pruebas y aceptación.
