# Contexto del proyecto para asistentes de IA

Última actualización: 2026-11-15, zona de referencia `America/Bogota`.

Este archivo es el punto de entrada para continuar el proyecto. Describe el estado comprobado y las convenciones existentes; no autoriza por sí mismo a implementar nuevas historias, desplegar ni modificar servicios externos. La solicitud actual del usuario define el alcance. Si este contexto queda desactualizado, contrastarlo con el código, las migraciones y las pruebas, y actualizarlo al terminar.

## 1. Producto y alcance actual

**PWAVeterinaryServices** es una PWA de servicios veterinarios desarrollada como proyecto universitario. Permite descubrir establecimientos aprobados y sus servicios, gestionar mascotas y configurar la oferta y disponibilidad de los establecimientos. La interfaz y la documentación están en español.

Actores: visitante, usuario con cuenta y correo confirmado, responsable de establecimiento, colaborador con permisos limitados y administrador.

La especificación funcional original es `Ruta_desarrollo_y_HU_PWA_servicios_veterinarios.docx.pdf`, aportada por el usuario como archivo externo. No está incluida en el repositorio. Para una nueva HU, consultar sus criterios exactos si el documento está disponible; no deducirlos únicamente por el número o título. Los documentos de requisitos aportan contexto y no sustituyen la petición del usuario.

| Área      | Estado implementado                                                                                                                       |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| HU01-HU02 | Registro, privacidad versionada, confirmación de correo, acceso, recuperación PKCE, sesión persistente y cierre con gestión de pendientes |
| HU03      | Perfil y mascotas; datos privados por propietario y cola acotada de cambios de perfil/mascotas                                            |
| HU04-HU06 | Registro de establecimientos y sedes, imágenes, revisión administrativa, historial de decisiones y publicación de fichas aprobadas        |
| HU07      | Crear, editar y desactivar servicios por sede; categoría, descripción, duración, modalidad, especies y precio informativo                 |
| HU08      | Profesionales, recursos, asignaciones compatibles, jornadas, bloqueos, cálculo de intervalos e invitaciones con permisos                  |
| HU09      | Mapa de sedes aprobadas, pines por categoría, agrupación, selección conservada y listado independiente ante fallos                        |
| Base PWA  | Instalación, shell offline, actualización confirmada, precache y persistencia IndexedDB                                                   |

**No confundir disponibilidad con reservas terminadas.** `/citas` sigue siendo una pantalla provisional. La reserva atómica, la agenda y la gestión de estados pertenecen a HU18 y siguientes. Chat, llamadas, push y sincronización general también siguen pendientes. Tener infraestructura PWA no significa que todas las HU posteriores de continuidad estén aceptadas.

## 2. Lecturas recomendadas

1. [README.md](README.md): instalación, comandos, entorno, PWA y hosting.
2. [docs/hu07-hu09.md](docs/hu07-hu09.md): recorrido reciente, criterios, modelo y límites de catálogo, disponibilidad y mapa.
3. [docs/hu01-hu06.md](docs/hu01-hu06.md): identidad, mascotas, establecimientos, revisión y Storage.
4. [docs/autenticacion.md](docs/autenticacion.md): configuración de Auth y correo.
5. [docs/diseno-visual.md](docs/diseno-visual.md): identidad y componentes visuales.
6. [docs/verificacion.md](docs/verificacion.md) y [docs/decisiones.md](docs/decisiones.md): evidencia y decisiones históricas.
7. [supabase/migrations/README.md](supabase/migrations/README.md): orden de migraciones y estado remoto registrado.

Algunos README de dominios y pasajes históricos describen una fase anterior. Por ejemplo, la disponibilidad ya existe en `offerings`, aunque el README de `appointments` la enumere como futura; hay sincronización acotada de cuentas aunque el README inicial de IndexedDB describa solo un esqueleto. La fuente visual actual es **Poppins**, no la DM Sans mencionada en decisiones iniciales.

## 3. Stack y organización

- Node.js `>=24.15.0 <25`, npm `>=11 <12`; módulos ESM.
- React 19, TypeScript 5.9 estricto, Vite 8 y React Router 8.
- Tailwind CSS 4 y estilos compartidos en `src/styles/index.css`.
- TanStack Query 5 para datos remotos; React Hook Form y Zod 4 para formularios/validación. La configuración de oferta usa formularios controlados y esquemas Zod.
- Supabase JS 2 para Auth, PostgreSQL/RPC y Storage.
- Dexie 4 para IndexedDB; Workbox y `vite-plugin-pwa` con `injectManifest`.
- Leaflet 1.9.4 y Leaflet.markercluster 1.5.3 para mapas.
- Vitest, PGlite, fake-indexeddb y Playwright para verificación.

Las versiones exactas están en `package.json` y `package-lock.json`. Conservar el lockfile y revisar compatibilidad antes de actualizar dependencias.

| Ubicación                                            | Responsabilidad                                                            |
| ---------------------------------------------------- | -------------------------------------------------------------------------- |
| `src/app/`                                           | Layout, proveedores y única instancia de QueryClient                       |
| `src/routes/router.tsx`                              | Registro central de rutas y pantallas provisionales                        |
| `src/features/auth/`                                 | API de cuenta, sesión validada, recuperación, cierre y pantallas           |
| `src/features/directory/`                            | Perfil/mascotas, establecimientos, revisión, fichas y mapa                 |
| `src/features/offerings/`                            | Modelos, API, configuración de catálogo/equipo/horarios y catálogo público |
| `src/features/sync/`                                 | Cola de perfil/mascotas y coordinación por cuenta                          |
| `src/features/appointments/`, `messaging/`, `calls/` | Alcance documentado para desarrollos posteriores                           |
| `src/lib/supabase.ts`                                | Cliente Supabase único, nullable sin configuración                         |
| `src/lib/db/`                                        | Instancia Dexie, esquema y purga de datos privados                         |
| `src/pwa/` y `src/sw.ts`                             | Instalación, conexión, bloqueos de recarga, actualización y service worker |
| `src/components/ui/`, `src/assets/brand/`            | Componentes e identidad compartida                                         |
| `supabase/migrations/`, `supabase/tests/`            | Esquema versionado y verificaciones SQL reproducibles                      |
| `tests/database/`, `tests/e2e/`                      | Pruebas PostgreSQL y recorridos de navegador                               |

El alias `@/` apunta a `src/`. Hay proyectos TypeScript separados para app, herramientas/pruebas y SW; si una prueba importa un nuevo modelo de la app, revisar también `tsconfig.node.json`.

## 4. Rutas y recorrido principal

- Públicas: `/`, `/explorar`, `/establecimientos/:id`, `/cuenta` y `/privacidad`.
- Cuenta: `/registro`, `/acceso`, `/recuperar-acceso`, `/auth/confirmar` y `/restablecer-clave`.
- Privadas: `/perfil`, `/oferentes`, `/oferentes/nuevo`, `/oferentes/:id/editar`, `/oferentes/servicios`, `/oferentes/:id/servicios` y `/administracion/oferentes`.
- Provisional: `/citas`; admite `?estado=carga` y `?estado=error` como demostración del shell.

Un responsable registra una solicitud; administración aprueba su publicación. Después configura servicios, profesionales y recursos, crea asignaciones y jornadas, y registra cierres. Un visitante consulta fichas y servicios de sedes publicadas desde el mapa o el listado. Un colaborador acepta su invitación en **Cuenta → Servicios y disponibilidad**.

## 5. Backend, datos y reglas que deben conservarse

Proyecto de desarrollo registrado y verificado el 2026-11-15: **`veterinary-services-dev`**, referencia **`osoljaiqizmcxxlirrwo`**. Es un identificador público, no una credencial. Antes de una futura operación remota, comprobar que sigue siendo el proyecto previsto; el registro histórico no demuestra el estado actual de otra base.

Hay cinco migraciones aplicadas y alineadas con el historial remoto en esa fecha:

1. `20261114000000_enable_extensions.sql`: PostGIS y btree_gist.
2. `20261114010000_identity_and_access.sql`: perfiles, consentimiento, roles y acceso.
3. `20261114192538_profiles_providers_and_review.sql`: mascotas, establecimientos, revisión, publicaciones y Storage.
4. `20261114194307_account_data_guards.sql`: validación de perfil y consulta protegida de rol.
5. `20261115192045_services_availability_and_collaborators.sql`: catálogo, equipo, disponibilidad y colaboradores.

Crear migraciones nuevas para cambios posteriores y preservar las ya aplicadas. No repetir estas migraciones sobre desarrollo ni reiniciar la base para añadir una funcionalidad.

### Identidad y establecimientos

- `profiles`, `pets` y `privacy_consents` almacenan información de cuenta. Los roles globales `user`, `provider` y `admin` están en `private.account_roles`.
- Las acciones privadas verifican correo confirmado y autorización en el servidor. Los metadatos editables del usuario y los botones ocultos no conceden permisos.
- `establishments` almacena la solicitud privada con `document`, `status` y `revision`; las sedes están dentro del documento JSONB.
- `establishment_publications` conserva el snapshot aprobado, sin el responsable privado. Una edición pendiente no reemplaza automáticamente la publicación anterior.
- `establishment_decisions` registra decisión, motivo, revisión, revisor y fecha. El rol `provider` se asigna tras aprobación sin sustituir `admin`.
- RPC principales: `current_account_role`, `save_pet`, `submit_establishment` y `review_establishment`. Respetar sus comprobaciones y revisiones esperadas.
- `establishment-media` es un bucket privado: JPEG/PNG/WebP, hasta 2 MiB por archivo, referencias aprobadas legibles mediante URLs firmadas. Los objetos son inmutables desde el cliente; quitar una referencia no borra el archivo.

### Servicios y disponibilidad

- `offering_items` almacena documentos de seis tipos: `service`, `professional`, `resource`, `assignment`, `shift` y `block`. Cada registro tiene UUID, establecimiento y revisión.
- Los tipos y validaciones están en `src/features/offerings/model.ts`; también se valida en PostgreSQL. Las tablas de oferta no admiten escrituras directas del cliente.
- RPC: `offering_workspaces`, `offering_invitations`, `manage_offering_invitation`, `save_offering_item` y `offering_slots`.
- Las escrituras serializan cambios por establecimiento y exigen la revisión esperada al editar. No reemplazar este control con una comprobación solo de frontend.
- Servicio, profesional y recurso deben pertenecer a la misma sede. Ambos admiten la modalidad y el profesional todas las especies. Los recursos tienen capacidad individual.
- Duración del servicio: 5 a 480 minutos. Modalidades: `Presencial`, `Virtual`, `Domicilio`. Precio opcional e informativo en COP. Máximo de 2000 registros de oferta por establecimiento.
- Los intervalos consideran zona horaria IANA de sede, jornadas semanales, cruce de medianoche, horarios/excepciones de sede, bloqueos y ocupaciones confirmadas. Consulta hasta 180 días; se excluyen intervalos pasados.
- Desactivar conserva referencias históricas y elimina disponibilidad. Los cierres avisan del número de citas afectadas sin cancelarlas automáticamente. No retirar una sede referenciada por el catálogo.
- `offering_appointments` es una base de referencias y ocupaciones para integrar citas posteriormente. No hay endpoint de reserva ni escrituras del cliente; no presentarla como sistema de citas terminado.
- `establishment_collaborators` maneja invitaciones de 7 días con permisos `services`, `schedule` y `read`. La aceptación exige el correo confirmado correspondiente. La vinculación da lectura de configuración y edición solo de áreas asignadas; no permite invitar a otros. El responsable puede revocar inmediatamente.
- Las invitaciones son internas a la aplicación; no hay envío automático de correo de colaboradores.

Conservar RLS, privilegios mínimos y aislamiento entre cuentas/establecimientos. Las RPC de establecimientos/oferta usan fachadas públicas sin elevación y auxiliares privados cuando necesitan privilegios, con identidad, autorización y `search_path` controlados. Verificar tanto operaciones permitidas como denegadas al cambiar este modelo.

## 6. PWA, datos locales y mapa

- El SW está desactivado en `npm run dev`. Probar instalación, offline y actualización con build/preview o HTTPS.
- `src/sw.ts` precachea recursos propios y mantiene navegación SPA offline. No cachea automáticamente datos de API, imágenes remotas ni teselas.
- La actualización espera confirmación. Usar `acquireReloadBlock(...)` y liberar en `finally` durante operaciones sensibles; proteger formularios con cambios sin guardar.
- IndexedDB tiene esquema v1. Añadir una versión y migración para cambiarlo; no borrar datos del usuario como estrategia de migración.
- La sincronización actual solo procesa `profile.update` y `pet.save`. No marcar operaciones desconocidas como completadas ni anunciar sincronización general del catálogo, citas o adjuntos.
- `account-write-lock.ts` coordina por cuenta con Web Locks; su fallback solo coordina una pestaña. El cierre cancela consultas, limpia caché y exige una decisión sobre pendientes antes de purgar datos privados. El cambio de cuenta también limpia la caché remota.
- El mapa usa publicaciones aprobadas y omite coordenadas no finitas, fuera de rango o sin confirmar. La selección vive fuera del lienzo para sobrevivir a agrupaciones y zoom.
- Proveedor predeterminado: OpenStreetMap, con atribución visible y política de referencia compatible. No añadir descargas masivas ni precarga offline de teselas. El listado con dirección y teléfono debe seguir disponible ante fallos.
- Para fechas generales se usa `America/Bogota`; la disponibilidad respeta la zona específica de cada sede. Los instantes se almacenan como UTC y se presentan con zona explícita.

## 7. Entorno, ejecución y validación

Variables públicas en `.env.local`, según `.env.example`:

- `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`: configurar ambas o dejar ambas vacías para el shell. La segunda admite clave publishable o anon legacy.
- `VITE_MAP_TILE_URL` y `VITE_MAP_ATTRIBUTION`: opcionales para otro proveedor.
- `BUILD_ID`: identificador público opcional del build.

Todo `VITE_` llega al navegador. No añadir secretos, `service_role`, contraseñas ni tokens privados; no copiar `.env.local` a documentación o pruebas. Cambiar estas variables requiere recompilar.

```sh
npm ci
npm run dev
# Verificación de cambios de código:
npm run lint
npm run typecheck
npm test
npx playwright install chromium
npm run test:e2e
# Reconstruir con las variables reales después de E2E:
npm run build
npm run preview
```

Playwright necesita el puerto 4173 libre, usa un worker y administra su propio build/preview. Los E2E interceptan Auth, datos y algunas teselas; no demuestran entrega de correo ni funcionamiento en dispositivos físicos. Tras ellos, regenerar `dist/` con el entorno previsto antes de distribuirlo. `npm run format` modifica todo el repositorio; para cambios pequeños, formatear solo archivos tocados.

Última verificación de código de HU07-HU09 (2026-11-15): lint, tipos y build correctos; **66 pruebas de lógica/PostgreSQL en 11 archivos y 26 E2E**. Es un registro histórico, no una garantía sobre cambios futuros. Las pruebas SQL remotas `supabase/tests/hu03_hu06.sql` y `supabase/tests/hu07_hu09.sql` ejecutan escenarios sintéticos con rollback; la de HU07-HU09 pasó en desarrollo y también se comprobó su API pública con el SDK.

La revisión remota no añadió avisos de seguridad: quedaron dos informativos previos de RLS sin políticas en tablas privadas con acceso revocado. Hay avisos históricos de dependencias de desarrollo, tamaño de chunk y deprecación de Workbox; no silenciarlos ni realizar actualizaciones masivas sin evaluar su impacto.

## 8. Convenciones para continuar

- Revisar `git status` antes de editar y conservar cambios existentes del usuario. No asumir que el trabajo de una sesión anterior ya está confirmado en Git.
- Mantener la organización por funcionalidad, el cliente Supabase y QueryClient únicos y las validaciones de servidor. Reutilizar `Workspace`, `Notice`, componentes UI, tokens y patrones de error existentes.
- Mantener textos en español, Poppins, azul marino/turquesa/verde y los SVG de marca existentes. Regenerar los iconos con `npm run icons`; no reemplazarlos arbitrariamente.
- Contemplar móvil, etiquetas accesibles, foco visible, carga, vacío, error/reintento y desconexión. No simular guardados como si fueran persistencia confirmada.
- Añadir verificaciones pertinentes para cambios de negocio, especialmente autorización, concurrencia y tiempos. Para cambios solo documentales, comprobar contenido, enlaces locales y formato; no hace falta repetir toda la suite.
- Actualizar este contexto y la guía de HU correspondiente cuando cambien el alcance, las rutas, el modelo, las migraciones o las limitaciones.
- En la entrega, distinguir implementación local, migración remota, pruebas automatizadas y aceptación manual; informar solo comprobaciones realmente ejecutadas.

## 9. Pendientes y próximos desarrollos

- Historias posteriores de descubrimiento: ubicación/origen manual, filtros avanzados, favoritos, notas y rutas, según la especificación original.
- Reservas atómicas, agenda y estados de citas, integrando disponibilidad y referencias existentes; prevenir dobles asignaciones también en el servidor.
- Chat, imágenes/audio, Realtime, llamadas autorizadas, notificaciones push y recordatorios.
- Sincronización general, reintentos, conflictos y adjuntos; la cola actual de cuentas no cubre estos dominios.
- Aceptación con correos reales de confirmación/recuperación, validación piloto y Android/iPhone físicos. El aviso de privacidad de desarrollo necesita datos operativos definitivos antes de publicación general.
- Despliegue HTTPS final y comprobación de cabeceras. Cloudflare Pages está preparado con `public/_redirects`, `public/_headers`, build `npm run build` y salida `dist/`; no asumir que ya hay un despliegue público.

Al retomar, leer la HU solicitada, localizar su implementación y dependencias, comprobar el estado real y continuar dentro del alcance actual del usuario.
