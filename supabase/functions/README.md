# Edge Functions

`chat-media` valida/sube/publica y descarga fotos/voz privadas; `appointment-call` autoriza sala y firma tokens cortos; `call-maintenance` revoca participantes y cierra salas invalidadas/vencidas. Las tres están desplegadas en desarrollo. LiveKit Cloud y el trabajo de mantenimiento todavía no están activados.

Los endpoints de usuario verifican bearer con `auth.getUser` y RPC/RLS; su gateway `verify_jwt=false` no omite esta validación. El worker exige credencial de servidor. Usar el único `.env.local` de la raíz, según [plantilla](../../.env.example), y `npm run deploy:secrets` para cargar solo las variables permitidas del backend. No crear un segundo archivo en esta carpeta ni usar prefijo VITE_ para secretos. Seguir [HU25-HU27](../../docs/hu25-hu27.md).

`npm run check:functions` comprueba Deno 2.9.6. `deno.json` fija imports y `deno.lock` fija transitivas. Se usa livekit-server-sdk 2.19.3, anterior a la ventana mínima de edad de dependencias; no desactivar esa protección para instalar una versión recién publicada.
