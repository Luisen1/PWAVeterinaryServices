# Edge Functions

Seis funciones desplegadas en desarrollo. `notification-push` procesa la cola con secreto de servidor. `account-data` deriva el titular del JWT y exporta datos propios, o solicita/procesa eliminación tras reautenticación. Solo administración procesa una solicitud confirmada. Ver [política y contratos](../../docs/hu37-hu39.md).

`chat-media` admite la descarga explícita de un archivo reportado con autorización de revisión y auditoría. `operations` exige una credencial de operador distinta y entrega copias cifradas de tablas y archivos. Las funciones de aplicación registran errores agregables con un código técnico. Configuración y ensayo en la [guía HU40–HU42](../../docs/hu40-hu42.md).

`chat-media` valida y entrega fotos/voz privadas. `appointment-call` autoriza la sala y firma tokens cortos. `call-maintenance` revoca participantes y cierra salas invalidadas/vencidas. LiveKit Cloud y Cron están activos en desarrollo. El worker verifica `x-call-worker-key` con Vault. El backend puede obtener el par del proveedor mediante la RPC exclusiva de `service_role` cuando faltan variables LiveKit en Edge.

Los endpoints de usuario verifican bearer con `auth.getUser` y RPC/RLS; su gateway `verify_jwt=false` no omite esta validación. El worker exige credencial de servidor. Usar el único `.env.local` de la raíz, según [plantilla](../../.env.example), y `npm run deploy:secrets` para cargar solo las variables permitidas del backend. No crear un segundo archivo en esta carpeta ni usar prefijo VITE_ para secretos. Seguir [HU25-HU27](../../docs/hu25-hu27.md).

`npm run check:functions` comprueba Deno 2.9.6. `deno.json` fija imports y `deno.lock` fija transitivas. Se usa livekit-server-sdk 2.19.3, anterior a la ventana mínima de edad de dependencias; no desactivar esa protección para instalar una versión recién publicada.
