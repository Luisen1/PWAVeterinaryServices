# Decisiones de arquitectura

Fecha de referencia 2026-11-14, America/Bogota.

| Decisión                                                             | Motivo                                                                                                                                                                                                   |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Implementar la base técnica descrita en el texto adjunto             | El PDF de ruta e historias de usuario aporta contexto para fases posteriores. Las HU del documento no amplían esta entrega.                                                                              |
| SPA con React 19, Vite 8 y TypeScript 5.9 estricto                   | Pila requerida. TypeScript 5.9 es compatible con el rango admitido por typescript-eslint 8.72.2.                                                                                                         |
| Node 24 LTS y npm 11                                                 | Coincide con el entorno disponible y permite las herramientas de build seleccionadas.                                                                                                                    |
| Versiones directas exactas y lockfile npm                            | Instalaciones reproducibles mediante npm ci, sin etiquetas flotantes ni dependencias preliminares directas.                                                                                              |
| React Router con createBrowserRouter y cuatro rutas planas           | Resuelve el shell, errores y 404 con la estructura mínima.                                                                                                                                               |
| Tailwind como único sistema de estilos y DM Sans local               | Tokens y utilidades compartidos. Los archivos de fuentes forman parte del precache.                                                                                                                      |
| Nombre descriptivo provisional e icono de huella reproducible        | Evita fijar un nombre comercial. Sharp genera cinco PNG a partir de un dibujo incluido en el script, con motivo dentro de la zona segura maskable.                                                       |
| Guardar los SVG originales en src/assets/brand                       | Recursos de marca aportados por el usuario, preparados para importarse desde React y procesarse con Vite. Los PNG de instalación se generan en public/icons.                                             |
| Estados vacíos por defecto y carga/error mediante ?estado=           | Permite verificar estados de todas las pantallas sin peticiones, datos ni formularios de negocio.                                                                                                        |
| injectManifest y manifest estático en public                         | Mantiene un SW propio tipado y un manifest inspeccionable. Workbox inserta revisiones de los activos compilados.                                                                                         |
| SW de producción con actualización prompt                            | La versión en espera se activa al pulsar Actualizar. Se comprueba al recuperar conexión, volver a la página y cada hora visible.                                                                         |
| useCanReload con bloqueos por operación                              | Punto de extensión para llamadas/escrituras, con liberación idempotente y soporte de operaciones concurrentes en la misma pestaña. La coordinación entre pestañas se resolverá con esas funcionalidades. |
| SW deshabilitado en desarrollo                                       | Permite HMR y evita que la caché interfiera con la implementación. Las pruebas de PWA usan preview de producción.                                                                                        |
| Precache solo de recursos propios y navegación SPA offline           | Conserva el shell, rutas, fuentes e iconos. Los recursos propios desconocidos devuelven un 503 explícito al faltar red.                                                                                  |
| Instalación nativa bajo demanda y guía manual desplegable            | Se captura beforeinstallprompt cuando existe y se respeta standalone. iOS recibe pasos de Safari. La disponibilidad final depende del navegador.                                                         |
| Solicitud de persistencia no bloqueante                              | Las decisiones de almacenamiento del navegador no impiden arrancar el shell.                                                                                                                             |
| Dexie singleton con esquema v1 y helpers genéricos tipados           | Diez tablas esqueleto e índices por propietario, sin implementar sincronización ni modelos de negocio.                                                                                                   |
| Fechas persistidas como ISO UTC y presentación en America/Bogota     | Evita confundir el huso del equipo con el de referencia.                                                                                                                                                 |
| Purga de todas las tablas privadas mediante una transacción          | Limpieza consistente de filas, adjuntos, outbox y metadatos. Se puede limitar a una cuenta o borrar todas las cuentas locales.                                                                           |
| Supabase nullable sin variables y con validación cuando se configura | El shell funciona sin proyecto remoto ni credenciales inventadas. El cliente único usa sesión persistente y PKCE en HU01/HU02.                                                                           |
| TanStack Query con una instancia y useZodForm compartido             | Proveedores y configuración preparados sin consultas ni formularios de negocio.                                                                                                                          |
| SQL inicial con extensiones únicamente                               | El esquema extensions ya existe en el proyecto Supabase administrado. Las tablas y RLS pertenecen a la fase de backend.                                                                                  |
| Hosting estático preparado para Cloudflare Pages                     | _redirects resuelve rutas profundas y _headers evita fijar versiones antiguas de SW y manifest. Esta entrega prepara los archivos locales de despliegue.                                                 |
| Playwright serial sobre build y preview propios                      | Verifica el resultado distribuible y permite probar una segunda compilación sin competir por el directorio servido.                                                                                      |
| Marca BUILD_ID opcional, pública y predeterminada a 0.1.0            | Facilita comprobar versiones. Cambiar esta marca cambia el JS y el precache. No es una credencial.                                                                                                       |
| GitHub Actions con permisos de lectura                               | Verifica cada push y PR, incluidos navegador y SW, sin credenciales remotas.                                                                                                                             |
| Verificación actual de instalabilidad con Chrome DevTools Protocol   | Chrome retiró la categoría PWA de Lighthouse. Se verifican errores de manifest e instalabilidad con Page.getAppManifest y Page.getInstallabilityErrors.                                                  |

La categoría PWA retirada se documenta en [Chrome for Developers](https://developer.chrome.com/blog/update-install-criteria). El flujo de actualización sigue la [documentación de Vite PWA](https://vite-pwa-org.netlify.app/guide/prompt-for-update.html).

## Límites de las dependencias de herramientas

Todas las versiones elegidas directamente en `package.json` son estables. El árbol transitivo publicado por Workbox/Babel y los bindings opcionales de Rolldown incluye versiones con sufijos upstream, entre ellas `gensync@1.0.0-beta.2` y `@trickfilm400/rollup-plugin-off-main-thread@3.0.0-pre1`. Por tanto, el lockfile completo contiene esas dependencias transitivas preliminares. El requisito de evitar cualquier versión preliminar en todo el árbol queda parcialmente cumplido. Se conservó el árbol admitido por las herramientas estables para evitar forzar versiones transitivas incompatibles. Esta limitación debe revisarse al actualizar Workbox y Vite.

`npm audit` informó 12 avisos en el árbol de desarrollo, dos bajos y diez moderados, relacionados con Workbox/build y typescript-eslint. La auditoría de producción con `npm audit --omit=dev` informó cero vulnerabilidades. Las herramientas también emiten una advertencia de deprecación de `inlineDynamicImports` durante el build del SW. Las compilaciones y las pruebas terminan correctamente.

## Control de recarga

La prueba de segunda compilación detectó que el callback de recarga de Workbox puede omitir una actualización dentro de la misma primera sesión, porque esa sesión empezó sin controlador. `UpdatePrompt` escucha también `controllerchange`, distingue la primera toma de control y conserva la confirmación explícita antes de recargar. El callback `onNeedReload` del registro se controla localmente para respetar `useCanReload`, incluso si otra pestaña activa una versión.

## Registro y acceso de HU01/HU02

Actualización del 2026-11-14, America/Bogota. La autorización del usuario amplía la base con registro, acceso y recuperación. Supabase usa sesión persistente, refresco y PKCE, con procesamiento explícito del callback y validación remota mediante `getUser`.

La identidad privada se establece en una migración SQL. El servidor asigna `user`, registra versión y fecha del aviso, y exige correo confirmado en las políticas. Los roles se guardan en un esquema privado. Los clientes consultan su rol mediante una RPC. La edición de perfil y el resto de dominios se desarrollarán en sus siguientes historias.

El cierre comprueba pendientes y purga la cuenta dentro de la misma transacción IndexedDB. Los pendientes sobreviven a recargas y sesiones vencidas. El usuario decide expresamente su descarte al cerrar sesión. El motor de sincronización se implementará en su fase correspondiente.

PGlite 0.5.16 se incorpora únicamente al entorno de pruebas para ejecutar el SQL y verificar RLS con PostgreSQL embebido. Docker está instalado y su motor local estaba detenido durante la comprobación. Los e2e usan el SDK real con un backend interceptado y credenciales ficticias de prueba. La aceptación en Supabase requiere aplicar las migraciones y comprobar los enlaces de correo reales.

El aviso de privacidad corresponde al entorno de desarrollo. El responsable, contacto y retención quedan pendientes de definición antes de su publicación general. La guía operativa está en `autenticacion.md`.

## HU22-HU24 (2026-11-16)

- Regla inicial explícita: cambios antes del inicio, configurable como anticipación de 0–10080 minutos y conservada al solicitar. No se inventa un plazo de 24 horas ni se endurecen citas anteriores.
- Reprogramar conserva identidad y contexto de la cita; el nuevo horario se asegura en la transacción y vuelve a requerir confirmación. Nunca se libera la anterior desde el cliente. Motivo, actor y valores anteriores/nuevos quedan auditados.
- Cambios offline son pendientes privados con revisión y envío explícito tras revalidar, sin reservar ni cancelar remotamente. IndexedDB v4 conserva versiones previas y cuenta pendientes al cerrar.
- Agenda adicional con filtros en servidor y cursor por inicio/ID; listas de solicitudes mantienen el contrato anterior. Completada/no asistió solo por personal autorizado tras fin de una confirmada.
- Chat cliente-equipo por sede, con permiso específico `messages`. Lectura explícita compartida por equipo; recibir/descargar no marca leído. Realtime invalida consultas protegidas, con respaldo HTTP y cursor/deduplicación para reconexión. Sin adjuntos, llamadas ni push simulados.
- La prueba remota real verificó Auth/Realtime y privacidad con tres cuentas técnicas temporales posteriormente eliminadas. La primera conexión fría requirió reintento; se conserva recuperación HTTP.

## HU25-HU27 (2026-11-16)

- Fotos y voz usan un bucket privado sin acceso directo del cliente. Edge valida los bytes y publica el mensaje solo después de guardar el objeto y revalidar permisos. La descarga vuelve a comprobar la conversación con RLS; no se comparten enlaces públicos.
- Cada archivo conserva un UUID y hash estables. El pendiente se guarda antes de subir y requiere envío explícito tras reconectar; repetir una respuesta perdida no crea otro mensaje. El descarte conserva una intención de limpieza cuando no hay conexión.
- La cuenta Auth que representa al profesional se asigna expresamente a la cita. Un nombre de catálogo no concede identidad ni acceso a pacientes. Solo cliente y cuenta profesional vigente pueden acceder a una cita virtual confirmada dentro de la ventana publicada.
- El usuario eligió preparar LiveKit Cloud sin tener cuenta todavía. La integración usa pistas reales y tokens breves limitados a sala/participante; no hay una llamada simulada ni aceptación de HU27 CA3. La expiración del token no expulsa una sesión activa: un worker cierra salas invalidadas o vencidas, y la emisión permanece bloqueada hasta configurar y comprobar ese mantenimiento.
- Se verificaron fotos, tres formatos de audio, reintentos y aislamiento mediante HTTP/Auth/Storage reales con cuentas temporales posteriormente retiradas. La prueba de audio/video entre dos equipos y los navegadores móviles físicos sigue pendiente de activar el proveedor.
- Para la baja demanda académica se añade compresión de fotos en el cliente antes de crear el pendiente: WebP/JPEG hasta 512 KiB y 1600 px. No recomprimir operaciones ya persistidas. El usuario aclaró que no pide adjuntos de video: se limita el flujo de la llamada a 360p/15 fps y bitrates de voz/video reducidos, sin guardar medios en Supabase. LiveKit Cloud Build es la recomendación gratuita por la integración existente y su límite duro de cuota; no se cambia de proveedor sin elección del usuario.

## Tipos de cuenta separados (2026-11-16)

El usuario solicita elegir Dueño de mascota o Veterinaria al registrarse y eliminar las opciones combinadas del perfil. El tipo de producto se guarda en la tabla privada y se separa del rol global: una veterinaria nueva no obtiene aprobación ni administración. Un contexto protegido compartido gobierna menús/rutas, mientras triggers y permisos existentes controlan las acciones en servidor.

Las cuentas anteriores se clasifican por actividad; las desconocidas completan una elección única. Se conservan datos y pendientes, con prioridad del recorrido Veterinaria cuando una cuenta previa combinaba ambos. No se introduce alternancia de roles ni se transfieren datos entre cuentas. La copia offline solo mantiene navegación con sesión comprobada y no concede permisos remotos.

## Coordenadas de sede desde el mapa (2026-11-16)

El paso Ubicación incorpora un selector Google por sede, abierto bajo acción explícita y con el mismo SDK/opciones del resto de la PWA. Clic, arrastre o uso del centro completan coordenadas, sin sustituir la dirección escrita ni seleccionar automáticamente el centro de Tunja. Cada cambio requiere confirmar de nuevo la correspondencia; se mantiene la edición manual ante fallo o falta de conexión. No se añade otro proveedor ni se requiere geocodificación. El evento de arrastre MVC se conserva para el canal quarterly, junto al evento DOM nuevo; la prueba con Google real validó ambos movimientos del usuario: clic y arrastre.
