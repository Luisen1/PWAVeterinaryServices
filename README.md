# PWA de servicios veterinarios

PWA con React, TypeScript estricto y Vite. Incluye instalación, shell offline, actualización confirmada, persistencia local y la implementación de registro y acceso de HU01/HU02. Inicio, Explorar y Citas mantienen pantallas provisionales.

## Requisitos e instalación

- Node.js 24.15 o superior de la rama 24 y npm 11.
- Para las pruebas de navegador, Chromium de Playwright.
- Para instalar en un celular, una dirección HTTPS accesible desde el dispositivo.

```sh
npm ci
npm run dev
```

El desarrollo usa Vite y mantiene el service worker desactivado para evitar interferencias con HMR. Para probar la PWA se necesita el build de producción.

```sh
npm run build
npm run preview
```

El preview se sirve en `http://localhost:4173`. `localhost` permite probar el service worker en el mismo equipo. La dirección HTTP de la red local, por ejemplo `http://192.168.1.10:4173`, requiere HTTPS para probar instalación y service workers desde el celular.

## Variables de entorno

Copiar `.env.example` a `.env.local` para configurar un proyecto Supabase.

| Variable                 | Valor                             |
| ------------------------ | --------------------------------- |
| `VITE_SUPABASE_URL`      | URL pública del proyecto Supabase |
| `VITE_SUPABASE_ANON_KEY` | Clave pública anon del proyecto   |

Ambas pueden quedar vacías para ejecutar y probar el shell. `supabase` se exporta como `null` hasta que existan valores válidos. Si se configura una variable, se deben configurar ambas. Vite incorpora las variables `VITE_` al código público. Nunca incluir claves `service_role`, claves secretas, contraseñas o tokens privados. Las variables se fijan al compilar, por lo que sus cambios requieren otro build.

El cliente admite una clave pública publishable (`sb_publishable_`) en `VITE_SUPABASE_ANON_KEY`, además de la clave anon legacy. La sesión persiste y se refresca mediante el SDK. Los enlaces de correo usan PKCE y se procesan en `/auth/confirmar`.

Para habilitar las cuentas en un proyecto remoto, aplicar ambas migraciones y configurar las URL de Auth y el correo según `docs/autenticacion.md`. La migración de identidad incluye perfiles, aceptación del aviso de privacidad y roles protegidos con RLS.

## Comandos

| Comando             | Resultado                                                 |
| ------------------- | --------------------------------------------------------- |
| `npm run dev`       | Vite en modo desarrollo, accesible en la red              |
| `npm run icons`     | Regenera cinco PNG provisionales con Sharp                |
| `npm run build`     | Genera iconos, comprueba tipos y produce `dist/` con SW   |
| `npm run preview`   | Sirve el build en el puerto 4173                          |
| `npm run lint`      | ESLint y comprobación de Prettier                         |
| `npm run format`    | Aplica Prettier                                           |
| `npm run typecheck` | TypeScript estricto para app, pruebas, configuración y SW |
| `npm test`          | Vitest con IndexedDB de prueba                            |
| `npm run test:e2e`  | Compila, abre preview y ejecuta Playwright                |

Primera ejecución de e2e en el equipo

```sh
npx playwright install chromium
npm run test:e2e
```

En Linux CI se usa `npx playwright install --with-deps chromium`. El puerto 4173 debe estar libre. Playwright inicia y detiene su propio preview de producción. Utiliza variables de un backend de prueba e intercepta sus peticiones para comprobar los flujos sin enviar correos reales. La prueba de actualización genera una segunda compilación en `test-results/` y restaura el build inicial. Ejecutar la suite con un único worker evita publicaciones concurrentes. Después de e2e, ejecutar `npm run build` para generar el artefacto con las variables reales del entorno previsto.

## Estructura

```text
.
├── .github/workflows/ci.yml
├── .env.example
├── .npmrc / .nvmrc / .prettierrc.json
├── docs/
│   ├── decisiones.md
│   ├── autenticacion.md
│   └── verificacion.md
├── public/
│   ├── icons/                 # PNG 192, 512, maskable y Apple 180
│   ├── manifest.webmanifest
│   ├── _headers
│   └── _redirects
├── scripts/generate-icons.mjs
├── src/
│   ├── app/                   # Shell, proveedores y QueryClient
│   ├── assets/brand/          # Emblema y logotipo originales en SVG
│   ├── components/ui/         # Iconos y estados reutilizables
│   ├── features/              # Autenticación y dominios futuros
│   │   ├── appointments/
│   │   ├── auth/             # HU01/HU02, formularios, sesión y pruebas
│   │   ├── calls/
│   │   ├── directory/
│   │   ├── messaging/
│   │   └── sync/
│   ├── lib/
│   │   ├── db/                # Singleton, tipos, prueba y guía de migración
│   │   ├── utils/             # Fecha con America/Bogota
│   │   ├── forms.ts           # React Hook Form con zodResolver
│   │   └── supabase.ts
│   ├── pwa/                   # Instalación, conexión y actualización
│   ├── routes/                # Shell, rutas y 404
│   ├── styles/index.css       # Tailwind, tokens y foco visible
│   ├── main.tsx
│   ├── sw.ts
│   └── vite-env.d.ts
├── supabase/
│   ├── functions/README.md
│   └── migrations/            # Extensiones e identidad con RLS
├── tests/
│   ├── database/identity.test.ts
│   ├── e2e/auth.spec.ts
│   ├── e2e/pwa.spec.ts
│   └── setup.ts
├── index.html
├── package.json / package-lock.json
├── eslint.config.js
├── playwright.config.ts
├── tsconfig*.json
├── vite.config.ts
└── vitest.config.ts
```

## Shell y estados

Las rutas `/`, `/explorar` y `/citas` contienen pantallas provisionales. `/cuenta` permite iniciar sesión, crear cuenta, recuperar acceso y cerrar sesión. Las rutas de autenticación incluyen `/registro`, `/acceso`, `/recuperar-acceso`, `/auth/confirmar`, `/restablecer-clave` y `/privacidad`. Una URL desconocida muestra la página 404. Los tres placeholders admiten los mismos parámetros de demostración.

```text
/explorar               Estado vacío
/explorar?estado=carga  Estado de carga
/explorar?estado=error  Estado de error con Reintentar
```

El botón Reintentar elimina el parámetro de demostración. La navegación mueve el foco al contenido. Se incluyen enlace para saltar al contenido, foco visible, etiquetas y márgenes seguros para pantallas con recortes. El indicador online/offline refleja la señal del navegador. La sesión se valida con Supabase antes de mostrar el acceso autenticado.

## PWA y actualización

`src/sw.ts` usa `injectManifest` con precache de recursos propios, revisiones de Workbox y fallback de navegación a `index.html`. Incluye fuentes locales e iconos. Las rutas funcionan offline después de completar la primera instalación del SW. Los recursos propios ausentes devuelven 503 con un mensaje en español. El catch del documento también dispone de una respuesta HTML autónoma de emergencia. Las respuestas de APIs y terceros se obtienen por red y su almacenamiento requerirá una decisión futura.

La nueva versión queda en espera y muestra “Hay una nueva versión”. El botón Actualizar envía `SKIP_WAITING` y recarga conservando la ruta. Más tarde oculta el aviso durante esa sesión del shell. Al reabrir, una versión pendiente puede volver a ofrecerse. También se comprueban actualizaciones al volver a primer plano, recuperar conexión y cada hora mientras la página está visible.

`useCanReload()` controla la disponibilidad de Actualizar. Las operaciones futuras deben adquirir un bloqueo con `acquireReloadBlock('motivo')` y llamar a la función de liberación en `finally`. Los bloqueos admiten concurrencia dentro de una pestaña. El alcance entre pestañas deberá definirse al añadir llamadas o escrituras. La solicitud de almacenamiento persistente se realiza si el navegador la admite y su denegación no bloquea el arranque.

## Probar en un celular mediante HTTPS

Primero compilar y abrir preview. En otra terminal, usar una herramienta de túnel instalada en el equipo.

```sh
cloudflared tunnel --url http://localhost:4173
```

O bien

```sh
ngrok http 4173
```

Abrir en el celular la dirección **HTTPS** que muestre la herramienta. Si Vite rechaza el hostname temporal, autorizar únicamente ese hostname antes de iniciar preview. En PowerShell

```powershell
$env:__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS = 'hostname-exacto-del-tunel'
npm run preview
```

Después de la prueba se puede limpiar esa variable con `Remove-Item Env:__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS`. Los túneles se cierran deteniendo su proceso.

### Android con Chrome

1. Abrir el enlace HTTPS, esperar a que termine la primera carga e interactuar con la página.
2. Cuando Chrome emita `beforeinstallprompt`, aparecerá Instalar app. Pulsarlo y confirmar la instalación del sistema. Chrome decide cuándo ofrecer el evento según sus condiciones de instalación y el historial del usuario.
3. Si aún no aparece, abrir la guía manual o el menú de Chrome y buscar Instalar aplicación o Añadir a pantalla de inicio.
4. Abrir el icono desde la pantalla de inicio. Verificar el icono, la ruta `/` y la presentación standalone sin la barra normal del navegador. La sección de instalación debe ocultarse.

### iPhone con Safari

1. Abrir la dirección HTTPS en Safari.
2. Desplegar Cómo añadirla a mi celular.
3. Tocar Compartir > Añadir a pantalla de inicio > Añadir. Confirmar Abrir como app web si el sistema ofrece esa opción.
4. Abrir el icono de la pantalla de inicio y comprobar que desaparece la guía.

Las pruebas automatizadas de iPhone emulan dimensiones y agente de usuario en Chromium. La instalación nativa y Safari en un dispositivo real requieren comprobación manual.

### Offline y modo avión

1. Con conexión, esperar a que el SW esté activo en DevTools > Application > Service Workers. En un dispositivo real, abrir primero el shell conectado y dejar terminar la carga.
2. Activar modo avión o deshabilitar la red en DevTools.
3. Abrir Inicio, Explorar, Citas y Cuenta. Recargar directamente `/explorar` y `/cuenta`.
4. Comprobar el shell y el indicador Sin conexión. También se puede recargar una dirección desconocida para comprobar la 404 offline.
5. Recuperar la red y comprobar el cambio del indicador.

### Actualización entre publicaciones

1. Instalar y abrir una primera versión desde un origen HTTPS estable.
2. Publicar otra compilación con un cambio real de código. Opcionalmente establecer `BUILD_ID` en el entorno del proceso de build, por ejemplo el SHA del commit. La marca se expone como `data-build` en el elemento HTML y no contiene secretos.
3. Volver a primer plano o solicitar Update en DevTools sin activar Update on reload ni Skip waiting.
4. Verificar el aviso, la versión anterior todavía visible y la ausencia de recarga automática.
5. Pulsar Actualizar. Verificar que carga la nueva versión en la misma ruta.

## Cloudflare Pages

Conectar este repositorio a un proyecto Pages mediante Git, seleccionar Node 24.15 y establecer el comando `npm run build` y el directorio de salida `dist`. Configurar las dos variables públicas de Supabase solo cuando se necesiten. El despliegue de prueba proporciona una dirección HTTPS `*.pages.dev` para los dispositivos.

`public/_redirects` conserva las rutas SPA al recargar. `public/_headers` fuerza revalidación del manifest y del HTML, evita cachear `sw.js` y permite caché larga solo en activos con hash. Los PNG sin hash usan el comportamiento normal del hosting y revisiones de precache. Verificar estas cabeceras en el despliegue, ya que Vite preview no interpreta los archivos de configuración de Pages.

La primera migración SQL habilita `postgis` y `btree_gist` en `extensions`. La segunda crea la base de identidad y sus políticas. El frontend usa las migraciones aplicadas al proyecto seleccionado, con el procedimiento descrito en `docs/autenticacion.md`.

## Calidad y siguientes fases

GitHub Actions ejecuta instalación reproducible, lint, TypeScript, Vitest, build y e2e en cada push y pull request. Las dependencias directas usan versiones exactas y `package-lock.json` fija las transitivas. La selección y las limitaciones verificadas están en `docs/decisiones.md` y `docs/verificacion.md`.

Pendiente para las siguientes fases

- Aplicación y verificación remota de las migraciones y configuración del correo.
- Perfil y mascotas de HU03, oferentes y aprobación de HU04/HU05 y ficha de HU06.
- Tablas, restricciones, permisos y RLS de los siguientes dominios.
- Directorio, mapa, filtros, fichas, favoritos y notas.
- Disponibilidad, reservas atómicas, agenda y citas.
- Chat, archivos, audios, Storage y Realtime.
- Llamadas de audio/vídeo y autorización de salas.
- Protocolo de sincronización, outbox, reintentos y conflictos.
- Push, recordatorios, observabilidad y políticas de privacidad.
- Identidad visual definitiva y validación en Android e iPhone físicos.
