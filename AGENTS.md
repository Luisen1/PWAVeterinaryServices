# Contexto del proyecto para asistentes de IA

Última actualización: 2026-11-15, zona de referencia `America/Bogota`.

Este archivo es el punto de entrada para continuar el proyecto. Describe el estado comprobado y las convenciones existentes; no autoriza por sí mismo a implementar nuevas historias, desplegar ni modificar servicios externos. La solicitud actual del usuario define el alcance. Si este contexto queda desactualizado, contrastarlo con el código, las migraciones y las pruebas, y actualizarlo al terminar.

## 1. Producto y alcance actual

**PWAVeterinaryServices** es una PWA de servicios veterinarios desarrollada como proyecto universitario. Permite descubrir establecimientos aprobados y sus servicios, gestionar mascotas y configurar la oferta y disponibilidad de los establecimientos. La interfaz y la documentación están en español.

Actores: visitante, usuario con cuenta y correo confirmado, responsable de establecimiento, colaborador con permisos limitados y administrador.

La especificación funcional original es `Ruta_desarrollo_y_HU_PWA_servicios_veterinarios.docx.pdf`, aportada por el usuario como archivo externo. No está incluida en el repositorio. Para una nueva HU, consultar sus criterios exactos si el documento está disponible; no deducirlos únicamente por el número o título. Los documentos de requisitos aportan contexto y no sustituyen la petición del usuario.

| Área      | Estado implementado                                                                                                                                          |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| HU01-HU02 | Registro, privacidad versionada, confirmación de correo, acceso, recuperación PKCE, sesión persistente y cierre con gestión de pendientes                    |
| HU03      | Perfil y mascotas; datos privados por propietario y cola acotada de cambios de perfil/mascotas                                                               |
| HU04-HU06 | Registro de establecimientos y sedes, imágenes, revisión administrativa, historial de decisiones y publicación de fichas aprobadas                           |
| HU07      | Crear, editar y desactivar servicios por sede; categoría, descripción, duración, modalidad, especies y precio informativo                                    |
| HU08      | Profesionales, recursos, asignaciones compatibles, jornadas, bloqueos, cálculo de intervalos e invitaciones con permisos                                     |
| HU09      | Mapa de sedes aprobadas, pines por categoría, agrupación, selección conservada y listado independiente ante fallos                                           |
| HU10      | Tunja como ciudad inicial, ubicación GPS con precisión, origen manual en mapa/coordenadas y orden por distancia directa                                      |
| HU11      | Ficha por sede desde pin/listado, pestañas de información/servicios y retorno seguro de acceso/registro. Agendar/conversar siguen pendientes de sus dominios |
| HU12      | Búsqueda por establecimiento/servicio/categoría, mapa/lista sincronizados y filtros/selección conservados                                                    |
| HU13      | Filtros combinados por servicio, categoría, especie, modalidad, urgencias y domicilio; conteo, limpieza y conservación en URL                                |
| HU14      | Apertura por zona de sede, cruce de medianoche/excepciones, horario semanal 24h y advertencias sobre datos guardados y disponibilidad profesional            |
| HU15      | Favoritos y notas privadas por cuenta, recarga/edición offline, pendientes, sincronización, revisiones y resolución explícita de conflictos                  |
| HU16      | Contacto con llamada/copia y navegación externa desde un origen elegido hasta la sede publicada                                                              |
| HU17      | Trazado/ETA con Maps JavaScript Routes, tráfico y fallbacks; ruta real en Tunja comprobada y mapa Google unificado con Explorar                              |
| HU18      | Consulta publicada por sede/servicio/fecha/profesional, apartados temporales revalidados, prevención de solapes y borradores locales offline                 |
| Base PWA  | Instalación, shell offline, actualización confirmada, precache y persistencia IndexedDB                                                                      |

**No confundir apartado con cita solicitada o confirmada.** `/citas` ya consulta disponibilidad y prepara borradores/apartados temporales de cinco minutos. La solicitud con mascota, sus estados y agenda pertenecen a HU19 y siguientes. Chat, llamadas, push y sincronización general siguen pendientes. HU17 tiene clave local y prueba real de ruta en Tunja; esto no demuestra navegación física, tráfico real ni operación a escala. Tener infraestructura PWA no significa que todas las HU de continuidad estén aceptadas.

## 2. Lecturas recomendadas

1. [README.md](README.md): instalación, comandos, entorno, PWA y hosting.
2. [docs/hu07-hu09.md](docs/hu07-hu09.md): recorrido reciente, criterios, modelo y límites de catálogo, disponibilidad y mapa.
3. [docs/hu01-hu06.md](docs/hu01-hu06.md): identidad, mascotas, establecimientos, revisión y Storage.
4. [docs/autenticacion.md](docs/autenticacion.md): configuración de Auth y correo.
5. [docs/diseno-visual.md](docs/diseno-visual.md): identidad y componentes visuales.
6. [docs/verificacion.md](docs/verificacion.md) y [docs/decisiones.md](docs/decisiones.md): evidencia y decisiones históricas.
7. [supabase/migrations/README.md](supabase/migrations/README.md): orden de migraciones y estado remoto registrado.
8. [docs/hu10-hu12.md](docs/hu10-hu12.md): descubrimiento en Tunja, origen, búsqueda, ficha por sede y Cómo llegar; diferencia entre navegación externa y ruta/ETA internas.
9. [docs/hu13-hu15.md](docs/hu13-hu15.md): criterios, filtros combinados, apertura, favoritos/notas, persistencia offline, modelo privado y límites de sincronización.
10. [docs/hu17-hu18.md](docs/hu17-hu18.md): activar Google Maps, cálculo/privacidad de rutas, horarios reservables, apartados temporales, protocolo de ocupación y borradores.
11. [docs/datos-demostracion.md](docs/datos-demostracion.md): seeder reproducible, sedes ficticias en Tunja, escenarios y fechas de prueba.

Algunos README de dominios y pasajes históricos describen una fase anterior. Por ejemplo, la disponibilidad ya existe en `offerings`, aunque el README de `appointments` la enumere como futura; hay sincronización acotada de cuentas aunque el README inicial de IndexedDB describa solo un esqueleto. La fuente visual actual es **Poppins**, no la DM Sans mencionada en decisiones iniciales.

## 3. Stack y organización

- Node.js `>=24.15.0 <25`, npm `>=11 <12`; módulos ESM.
- React 19, TypeScript 5.9 estricto, Vite 8 y React Router 8.
- Tailwind CSS 4 y estilos compartidos en `src/styles/index.css`.
- TanStack Query 5 para datos remotos; React Hook Form y Zod 4 para formularios/validación. La configuración de oferta usa formularios controlados y esquemas Zod.
- Supabase JS 2 para Auth, PostgreSQL/RPC y Storage.
- Dexie 4 para IndexedDB; Workbox y `vite-plugin-pwa` con `injectManifest`.
- Maps JavaScript API para todos los mapas y `@googlemaps/markerclusterer` 2.6.2 para agrupación. Se retiraron Leaflet y sus tipos.
- Vitest, PGlite, fake-indexeddb y Playwright para verificación.

Las versiones exactas están en `package.json` y `package-lock.json`. Conservar el lockfile y revisar compatibilidad antes de actualizar dependencias.

| Ubicación                                                                 | Responsabilidad                                                                                      |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `src/app/`                                                                | Layout, proveedores y única instancia de QueryClient                                                 |
| `src/routes/router.tsx`                                                   | Registro central de rutas y pantallas de la aplicacion                                               |
| `src/features/auth/`                                                      | API de cuenta, sesión validada, recuperación, cierre y pantallas                                     |
| `src/features/directory/`                                                 | Perfil/mascotas, establecimientos, revisión, fichas y mapa                                           |
| `src/features/directory/discovery.ts`, `origin-store.ts`, `public-api.ts` | Referencia de Tunja, búsqueda por sede, distancias, origen en memoria y consultas públicas paginadas |
| `src/features/directory/DirectionsPage.tsx`                               | Origen/destino, modo carro/a pie y enlace de indicaciones externas                                   |
| `src/features/auth/return-to.ts`                                          | Destinos de retorno permitidos y contexto público de registro con caducidad                          |
| `src/features/offerings/`                                                 | Modelos, API, configuración de catálogo/equipo/horarios y catálogo público                           |
| `src/features/preferences/`                                               | Favoritos/notas, persistencia local, sincronización y resolución de conflictos por cuenta            |
| `src/features/sync/`                                                      | Cola de perfil/mascotas y coordinación por cuenta                                                    |
| `src/features/appointments/`, `messaging/`, `calls/`                      | Disponibilidad/borradores en appointments; mensajeria/llamadas pendientes                            |
| `src/lib/supabase.ts`                                                     | Cliente Supabase único, nullable sin configuración                                                   |
| `src/lib/db/`                                                             | Instancia Dexie, esquema y purga de datos privados                                                   |
| `src/pwa/` y `src/sw.ts`                                                  | Instalación, conexión, bloqueos de recarga, actualización y service worker                           |
| `src/components/ui/`, `src/assets/brand/`                                 | Componentes e identidad compartida                                                                   |
| `supabase/migrations/`, `supabase/tests/`                                 | Esquema versionado y verificaciones SQL reproducibles                                                |
| `tests/database/`, `tests/e2e/`                                           | Pruebas PostgreSQL y recorridos de navegador                                                         |

El alias `@/` apunta a `src/`. Hay proyectos TypeScript separados para app, herramientas/pruebas y SW; si una prueba importa un nuevo modelo de la app, revisar también `tsconfig.node.json`.

## 4. Rutas y recorrido principal

- Públicas: `/`, `/explorar`, `/establecimientos/:id`, `/establecimientos/:id/como-llegar`, `/cuenta`, `/privacidad`, `/terminos` y `/citas`. Favoritos y borradores/apartados de Citas tienen contenido privado condicionado a su cuenta/sesión local válida.
- Cuenta: `/registro`, `/acceso`, `/recuperar-acceso`, `/auth/confirmar` y `/restablecer-clave`.
- Privadas: `/perfil`, `/oferentes`, `/oferentes/nuevo`, `/oferentes/:id/editar`, `/oferentes/servicios`, `/oferentes/:id/servicios` y `/administracion/oferentes`.
- `/citas` tiene consulta real de HU18. Ya no usa `PlaceholderPage` ni los parámetros de demostración `estado=carga/error`. Conserva `establecimiento`, `sede`, `servicio`, `fecha` y `profesional` en URL; el acceso permite volver a esa ruta o a Cómo llegar, con validación del destino.

Un responsable registra una solicitud; administración aprueba su publicación. Después configura servicios, profesionales y recursos, crea asignaciones y jornadas, y registra cierres. Un visitante consulta fichas y servicios de sedes publicadas desde el mapa o el listado. Un colaborador acepta su invitación en **Cuenta → Servicios y disponibilidad**.

En Explorar se conservan `q`, `categoria`, `vista`, `orden`, `seleccion`, `servicio`, `especie`, `modalidad`, `urgencias`, `domicilio`, `abierto` y `24h` en la URL. Los filtros booleanos activos usan `1`. La ficha identifica la sede mediante `sede` y conserva la vuelta al directorio con `volver`; `tab` alterna información/servicios. Cómo llegar recibe la sede y un retorno público validado. No usar parámetros de URL para almacenar notas privadas/origen GPS ni aceptar retornos externos.

## 5. Backend, datos y reglas que deben conservarse

Proyecto de desarrollo registrado y verificado el 2026-11-15: **`veterinary-services-dev`**, referencia **`osoljaiqizmcxxlirrwo`**. Es un identificador público, no una credencial. Antes de una futura operación remota, comprobar que sigue siendo el proyecto previsto; el registro histórico no demuestra el estado actual de otra base.

Hay ocho migraciones aplicadas y alineadas con el historial remoto en esa fecha:

1. `20261114000000_enable_extensions.sql`: PostGIS y btree_gist.
2. `20261114010000_identity_and_access.sql`: perfiles, consentimiento, roles y acceso.
3. `20261114192538_profiles_providers_and_review.sql`: mascotas, establecimientos, revisión, publicaciones y Storage.
4. `20261114194307_account_data_guards.sql`: validación de perfil y consulta protegida de rol.
5. `20261115192045_services_availability_and_collaborators.sql`: catálogo, equipo, disponibilidad y colaboradores.
6. `20261115210218_discovery_filters_and_private_preferences.sql`: urgencias explícitas en servicios y preferencias privadas, RLS y RPC con revisión/idempotencia.
7. `20261116002733_reservable_availability_and_slot_holds.sql`: motor común, consulta publicada y apartados temporales con guardas de ocupación.
8. `20261116002913_index_slot_hold_references.sql`: índices completos de FK de profesional/recurso de apartados. Las dos versiones usan fecha UTC 2026-11-16; se aplicaron el 2026-11-15 en `America/Bogota`.

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
- Los servicios admiten `emergency?: boolean`, validado también en PostgreSQL. La ausencia conserva el atributo desconocido; filtrar urgencias requiere `true`. No inferirlo del nombre ni de la categoría. Los filtros de servicio/especie/modalidad/urgencias/domicilio deben cumplirse en un mismo servicio activo de la sede publicada.
- Los intervalos consideran zona horaria IANA de sede, jornadas semanales, cruce de medianoche, horarios/excepciones de sede, bloqueos y ocupaciones confirmadas. Consulta hasta 180 días; se excluyen intervalos pasados.
- Desactivar conserva referencias históricas y elimina disponibilidad. Los cierres avisan del número de citas afectadas sin cancelarlas automáticamente. No retirar una sede referenciada por el catálogo.
- `offering_appointments` sigue siendo la base de referencias y ocupaciones para integrar solicitudes de cita en HU19. HU18 añade `slot_holds` y sus RPC de apartado temporal, no un endpoint de solicitud/confirmación de cita. No presentar el dominio como sistema de citas terminado.
- `establishment_collaborators` maneja invitaciones de 7 días con permisos `services`, `schedule` y `read`. La aceptación exige el correo confirmado correspondiente. La vinculación da lectura de configuración y edición solo de áreas asignadas; no permite invitar a otros. El responsable puede revocar inmediatamente.
- Las invitaciones son internas a la aplicación; no hay envío automático de correo de colaboradores.

Conservar RLS, privilegios mínimos y aislamiento entre cuentas/establecimientos. Las RPC de establecimientos/oferta usan fachadas públicas sin elevación y auxiliares privados cuando necesitan privilegios, con identidad, autorización y `search_path` controlados. Verificar tanto operaciones permitidas como denegadas al cambiar este modelo.

### Preferencias privadas y apertura

- `establishment_preferences` tiene clave primaria `(owner_id, establishment_id)`, `favorite`, `note` de hasta 2000 caracteres, `revision`, `last_operation_id` y `updated_at`. Desmarcar favorito conserva la nota; una relación vacía se mantiene para conservar revisiones entre dispositivos.
- RLS permite SELECT solo al propietario con correo confirmado. No hay escrituras directas del cliente. La RPC `save_establishment_preference` devuelve JSONB mediante una fachada pública invoker y un auxiliar privado definer con `search_path=''`. El propietario se deriva de Auth, nunca de un parámetro del cliente.
- La RPC serializa por cuenta, exige una ficha publicada al crear y la revisión esperada al editar. Repetir la última operación confirma el mismo resultado; una revisión obsoleta responde `40001`. La UI conserva la versión local y ofrece elegir entre ella y el servidor.
- `opening.ts` calcula apertura por zona IANA de sede, minuto local, jornada de hoy/cola de ayer y excepciones. Un cierre por fecha o un horario especial de hoy reemplaza también la cola anterior. El cierre es exclusivo. `useNow` actualiza cada 30 segundos/al recuperar foco y conserva una instancia Date estable entre esos cambios para evitar reconstrucciones innecesarias del mapa.
- El horario semanal 24h se representa con siete jornadas completas ya compatibles con el modelo existente; no añade un campo booleano independiente a la sede. Las excepciones prevalecen. La apertura no garantiza profesional ni cupo y se ofrece contacto telefónico en selección/ficha.
- Sin horario, con zona inválida, sin conexión, con fallback de caché o más de cinco minutos desde la consulta, la apertura es desconocida. No incluirla en “Abierto ahora”; mostrar aviso y permitir quitar el filtro. El horario semanal 24h es una declaración, no una garantía de apertura actual.

## 6. PWA, datos locales y mapa

### Disponibilidad reservable y apartados (HU18)

- `appointments/model.ts`, `api.ts` y `AvailabilityPage.tsx` implementan `/citas`. Los servicios publicados enlazan con establecimiento/sede/servicio elegidos. La consulta devuelve zona IANA, modalidad, nombres de profesionales asignados y fecha de consulta.
- RPC pública `service_availability` usa `private.available_service_slots(...,true)` para consultar exclusivamente la sede publicada. La previsualización de responsables mediante `offering_slots` conserva el modo de borrador privado. Ambos motores descuentan citas confirmadas y apartados no vencidos/liberados.
- `slot_holds` permite SELECT solo al propietario con correo confirmado y no admite escrituras directas. `acquire_slot_hold`, `release_slot_hold` y `current_slot_hold` son fachadas públicas invoker con auxiliares privados que validan Auth. Un apartado dura cinco minutos y no crea una cita.
- Al apartar se bloquean cuenta y establecimientos afectados en orden estable; se recalcula el intervalo y sus datos se derivan del servidor. UUID estable permite reintento sin extender vencimiento. Cambiar selección reemplaza el apartado anterior atómicamente; si falla se conserva el anterior.
- Los triggers de apartados y referencias de citas comparten bloqueo de establecimiento y rechazan solapes de profesional o recurso con `23P01`. Los extremos son semiabiertos y se admiten intervalos adyacentes. No desactivar estas guardas en desarrollos futuros. HU19 debe revalidar/consumir el apartado e insertar su solicitud dentro de la misma transacción, añadiendo mascota/propietario/estados.
- El servidor decide vencimiento; no requiere cron para dejar de ocupar. La UI consulta el apartado vigente y usa la hora del servidor para su contador. Conflictos conservan fecha/servicio/selección como referencia.
- Las consultas públicas se guardan con antigüedad. Offline o ante fallback solo habilitan borrador privado local; no permiten apartar. Los borradores no entran en outbox ni se envían al reconectar. El cierre los cuenta como pendientes y requiere decisión antes de purgarlos.

### Persistencia y mapas

- El SW está desactivado en `npm run dev`. Probar instalación, offline y actualización con build/preview o HTTPS.
- `src/sw.ts` precachea recursos propios y mantiene navegación SPA offline. No cachea automáticamente datos de API, imágenes remotas ni teselas.
- La actualización espera confirmación. Usar `acquireReloadBlock(...)` y liberar en `finally` durante operaciones sensibles; proteger formularios con cambios sin guardar.
- IndexedDB tiene esquema v3. Conserva v1/v2 (`preferences`, `offline_sessions`, `public_snapshots`) y añade `availability_drafts`, privada por cuenta/servicio. Se probó actualización conservando catálogo y outbox previos. No borrar datos para migrar. `favorites`/`private_notes` siguen como esqueleto; preferencias usa `preferences` junto a outbox.
- La sincronización actual procesa `profile.update`, `pet.save` y `preference.save`. No marcar operaciones desconocidas como completadas ni anunciar sincronización general del catálogo, citas o adjuntos. Preferencias consulta/envía al validar sesión, reconectar y cada 30 segundos con la app abierta; también tiene reintento manual. Un fallo conserva el pendiente y un conflicto exige elección explícita.
- Los guardados de favorito/nota consolidan un pendiente por cuenta/establecimiento y conservan la revisión remota. La transacción de IndexedDB abarca preferencia y outbox. No sustituir cambios pendientes al descargar datos remotos. `liveQuery` mantiene la interfaz al día entre pestañas; las consultas/mutaciones locales usan `networkMode: 'always'` para no quedar pausadas offline.
- Tras recargar offline, favoritos/notas y borradores de horario requieren sesión SDK vigente y comprobante persistido tras validar `getUser`: propietario, vencimiento, SHA-256 del token y datos mínimos. No se duplica el token en IndexedDB. `offlineUser` no autoriza apartados ni solicitudes remotas; sincronizar/revalidar exige conexión y validación de servidor. RLS aísla cuentas en servidor; IndexedDB no está cifrado.
- `public-cache.ts` conserva publicaciones, servicios y consultas públicas de disponibilidad con fecha en `public_snapshots`. El fallback es explícito. No cachea notas junto al catálogo, teselas ni rutas/ETA de Google. La apertura guardada es desconocida y la disponibilidad guardada solo sirve de referencia/borrador. Al salir se conservan snapshots públicos y se purgan preferencias, comprobantes y borradores privados.
- `account-write-lock.ts` coordina por cuenta con Web Locks; su fallback solo coordina una pestaña. El cierre cancela consultas, limpia caché y exige una decisión sobre pendientes antes de purgar datos privados. El cambio de cuenta también limpia la caché remota.
- El mapa usa publicaciones aprobadas y omite coordenadas no finitas, fuera de rango o sin confirmar. La selección vive fuera del lienzo para sobrevivir a agrupaciones y zoom.
- La ciudad inicial es **Tunja, Boyacá**, referencia `5.5353, -73.3678`, por solicitud explícita del usuario. Los prototipos que nombran Bogotá se adaptan a Tunja. No inventar una ubicación GPS ni presentar el centro de ciudad como la casa del visitante; una ubicación real obtenida no se fuerza a esas coordenadas. La referencia inicial no constituye un límite municipal ni importa negocios externos.
- En Explorar móvil, el mapa tiene prioridad en la primera pantalla: origen compacto, búsqueda/actualización en una fila, categorías horizontales y leyenda desplegable debajo del mapa. El mapa base se renderiza aunque el catálogo esté vacío, cargando o falle; la presencia de publicaciones solo determina los pines. No anteponer formularios extensos o estados vacíos al mapa. Los cambios sucesivos de filtros acumulan los parámetros para no perder la vista elegida.
- **Más filtros** abre un diálogo nativo sin desplazar el mapa. Mantiene un borrador y **Ver resultados** lo aplica en una sola actualización de URL; Escape lo descarta. Limpiar filtros conserva término/vista/orden; Limpiar búsqueda elimina también el término. Al volver de Lista a Mapa se invalida su tamaño y se vuelve a mostrar el pin seleccionado, conservando el lienzo.
- El origen se obtiene con permiso bajo acción explícita, se marca en el mapa o se introduce con coordenadas. Se conserva solo en memoria mientras vive la página y se elimina al recargar; no se guarda en backend, IndexedDB, localStorage ni URL. Una respuesta GPS tardía no puede reemplazar una elección manual posterior.
- La búsqueda reúne publicaciones/servicios activos mediante consultas paginadas en bloques de 500 con orden estable, y filtra por sede publicada en el cliente. Mapa y lista representan el mismo conjunto; alternar conserva filtros y selección. El catálogo grande requerirá búsqueda en servidor. Un fallo de consulta no debe presentarse como cero coincidencias.
- La ficha mantiene identidad y sede elegida; sus servicios se filtran por esa sede. No cambiar silenciosamente un destino inexistente por otra sede ni generar indicaciones con coordenadas no verificadas.
- **Cómo llegar** mantiene la Maps URL externa sin requerir claves y añade el cálculo integrado de HU17 mediante `RoutePlanner`, `google-routes.ts` y `MapCanvas`. Usa `Route.computeRoutes`, campos mínimos y tráfico opcional desactivado por defecto. Muestra fecha/estimación/avisos y fallback de tráfico, nunca hora garantizada. El mapa base es Google antes y después del cálculo: se añade/quita una polilínea sin reemplazar el lienzo. `GoogleRouteMap` fue retirado. Un resultado se descarta al cambiar contexto/conexión; no se persiste y respuestas demoradas no reemplazan la elección nueva. El centro de ciudad no se envía como casa.
- HU17 requiere **Maps JavaScript API + Routes API**, facturación y `VITE_GOOGLE_MAPS_API_KEY`, pública y restringida por dominio/APIs. La clave local ya está configurada y se comprobó una ruta real sin tráfico en Tunja. Fallos de cuota/cobertura/red/configuración mantienen la alternativa externa online. No hay Edge Function nueva. No modificar facturación/cuotas sin autorización.
- El acceso conserva el destino público en `continuar`; el registro conserva solo esa ruta pública en `localStorage` (`veterinary.public-return`), con caducidad de una hora y consumo único. Esto permite confirmar correo en otra pestaña del mismo navegador/origen sin ampliar las Redirect URLs autorizadas de Supabase. No guardar el origen GPS en ese contexto. Si el almacenamiento está bloqueado/vencido, la confirmación vuelve a Cuenta. Los retornos se validan contra rutas públicas propias.
- Proveedor único: **Google Maps** en Explorar, selección de origen y rutas, con atribución del SDK. No añadir fallback a OSM ni almacenamiento offline de mapas. `google-maps.ts` comparte la carga y las opciones (estilo claro, idioma español, región Colombia e ID de mapa). Los marcadores avanzados conservan categorías, accesibilidad y agrupación; sedes coincidentes se eligen desde una lista en el grupo sin modificar coordenadas. El listado con dirección/teléfono sigue disponible ante fallos, incluso una denegación posterior al callback del SDK.
- Conservar `strict-origin-when-cross-origin` en el meta referrer, hosting y script de Google. Se transmite solo el origen a otros dominios, sin ruta ni parámetros de acceso/recuperación. Al mostrar el mapa Google procesa consultas de la zona visible; la consulta de rutas comparte origen/destino solo al pulsar Calcular. El aviso de privacidad distingue estos tratamientos. Los enlaces externos conservan `noreferrer` donde corresponde.
- Para fechas generales se usa `America/Bogota`; la disponibilidad respeta la zona específica de cada sede. Los instantes se almacenan como UTC y se presentan con zona explícita.

## 7. Entorno, ejecución y validación

Variables públicas en `.env.local`, según `.env.example`:

- `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`: configurar ambas o dejar ambas vacías para el shell. La segunda admite clave publishable o anon legacy.
- `VITE_GOOGLE_MAPS_MAP_ID`: ID público de mapa JavaScript; opcional en desarrollo (`DEMO_MAP_ID`), configurar uno propio en producción. El mismo ID/opciones mantiene el estilo entre mapa y ruta. `VITE_MAP_TILE_URL` y `VITE_MAP_ATTRIBUTION` ya no se utilizan.
- `BUILD_ID`: identificador público opcional del build.
- `VITE_GOOGLE_MAPS_API_KEY`: necesaria para los mapas y HU17; clave pública de navegador restringida a dominios propios y Maps JavaScript API/Routes API. No usar claves privadas de servidor. Sin ella siguen funcionando listado, fichas, disponibilidad y navegación externa. Mostrar mapas usa Maps JavaScript API; no implica consultar rutas automáticamente.

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

Playwright necesita el puerto 4173 libre, usa un worker y administra su propio build/preview. Los E2E interceptan Auth/datos y el SDK de Google mediante `google-maps-fixture.ts`; no demuestran entrega de correo ni funcionamiento en dispositivos físicos. Tras ellos, regenerar `dist/` con el entorno previsto antes de distribuirlo. `npm run format` modifica todo el repositorio; para cambios pequeños, formatear solo archivos tocados.

Última verificación de código de HU07-HU09 (2026-11-15): lint, tipos y build correctos; **66 pruebas de lógica/PostgreSQL en 11 archivos y 26 E2E**. Es un registro histórico, no una garantía sobre cambios futuros. Las pruebas SQL remotas `supabase/tests/hu03_hu06.sql` y `supabase/tests/hu07_hu09.sql` ejecutan escenarios sintéticos con rollback; la de HU07-HU09 pasó en desarrollo y también se comprobó su API pública con el SDK.

Verificación posterior de descubrimiento en Tunja (2026-11-15): **76 pruebas de lógica/PostgreSQL en 13 archivos y 38 E2E**, lint, tipos y build correctos. El build final se regeneró con el entorno real después de E2E. Incluye ubicación concedida/denegada/demorada, origen manual, respuestas GPS obsoletas, búsqueda paginada, contexto entre vistas/ficha/acceso/registro en otra pestaña, indicaciones externas y fallos de catálogo. Se revisaron capturas a 320/360/1280 px. Se comprobaron lecturas públicas paginadas de publicaciones y servicios activos con el SDK contra desarrollo, sin modificar datos; ambas consultas estaban vacías en esa revisión. No hubo nuevas migraciones ni cambios de RLS/configuración Auth. Los correos físicos, GPS real y apertura/navegación en una aplicación de mapas requieren aceptación manual.

La revisión remota no añadió avisos de seguridad: quedaron dos informativos previos de RLS sin políticas en tablas privadas con acceso revocado. Hay avisos históricos de dependencias de desarrollo, tamaño de chunk y deprecación de Workbox; no silenciarlos ni realizar actualizaciones masivas sin evaluar su impacto.

Corrección posterior de visibilidad del mapa (2026-11-15): 19 E2E de descubrimiento, mapa y regresión visual correctos; se añadieron casos con catálogo vacío y fallido que exigen al menos 180 px de mapa visibles sobre la navegación inferior al entrar, a 360×800 y 400×876 con ubicación activada. Lint, tipos y build final correctos. Se comprobó además el preview de producción con teselas reales de OpenStreetMap sin interceptar: seis imágenes decodificadas y mapa visible en la primera pantalla a 400×876, usando geolocalización controlada. Estas dos pruebas elevan la suite disponible a 40 E2E; la ejecución completa previa de 38 sigue registrada arriba.

Verificación de HU13-HU15 (2026-11-15): **103 pruebas de lógica/PostgreSQL en 16 archivos**, suite ampliada a **44 E2E**, lint, tipos y build correctos. Incluye filtros combinados/limpieza, medianoche, excepciones, DST, apertura desconocida offline, 24h con contacto desde selección, favoritos/notas tras recarga offline, reconexión, conflictos, purga, migración IndexedDB y aislamiento de cuenta. La suite completa pasó; tras añadir apertura a la selección del mapa se ajustó una aserción que coincidía con el listado y el panel oculto, y se repitieron los cuatro recorridos de HU13-HU15. El build final se regenera con el entorno real después de E2E. Se revisaron capturas de mapa/lista a 320/360 px. `supabase/tests/hu13_hu15.sql` pasó en desarrollo con rollback y el historial remoto quedó alineado con las seis migraciones. No se añadieron avisos de seguridad; los dos informativos privados previos permanecen. El detalle y los avisos de rendimiento están en `docs/hu13-hu15.md`.

Verificación de HU17-HU18 (2026-11-15): **129 pruebas de lógica/PostgreSQL en 18 archivos y 52 E2E**, lint, tipos y build. Tras ajustar el alcance del aviso de fallo OSM al mostrar una ruta Google, se repitieron los recorridos nuevos y de descubrimiento. Capturas revisadas en Citas a 320/1280 px y ruta con SDK controlado a 360 px. Las ocho migraciones están aplicadas/alineadas y `supabase/tests/hu18.sql` pasó con rollback. Se corrigieron los dos avisos nuevos de FK sin índice; quedan los informativos privados e índices sin uso y la política permisiva histórica de oferta. El build se regenera con el entorno real después de E2E. **Pendiente:** clave/APIs y prueba real de Google, dispositivos físicos y solicitudes HU19. No se afirmó haber ejecutado tráfico real, solicitudes HTTP simultáneas ni consumo facturable.

Actualización a proveedor único Google (2026-11-15): `MapCanvas` sirve directorio/selección/ruta y mantiene su instancia al calcular o quitar el trazado; SDK/opciones están en `google-maps.ts`. Se retiraron Leaflet/OSM y `GoogleRouteMap`; no restaurar un segundo proveedor. La clave local ya funciona: se comprobaron siete marcadores DEMO y una ruta real sin tráfico en Tunja, con el mismo lienzo, sin peticiones OSM ni errores de autorización/JavaScript. Se inspeccionaron capturas de escritorio y móvil a 360 px. Esta prueba sí hizo consultas reales de Maps/Routes; las verificaciones históricas con SDK controlado no equivalían a esa aceptación.

Verificación de este cambio: **141 pruebas en 20 archivos y 30 E2E de descubrimiento, mapa, disponibilidad/rutas y preferencias**, lint, tipos y build correctos. Los E2E usaron SDK controlado, puerto 4174 y salida aislada. La suite disponible tiene 54 E2E. El build real del preview 4173 se regeneró conservando `.env.local` fuera de Git: 16 entradas de precache (~1118 KiB), mapa diferido ~27.5 kB y avisos conocidos de tamaño/Workbox. Documentación y aviso de privacidad actualizados. Pendiente operativo: ID de mapa propio/dominio/cuotas de producción y dispositivos físicos; no afirmar navegación física ni tráfico real por haber obtenido una estimación sin tráfico.

## 8. Convenciones para continuar

Registro histórico anterior a la unificación con Google: se alinearon el meta referrer, las cabeceras y la capa Leaflet; se añadió un E2E de origen sin parámetros. Se verificaron autenticación, descubrimiento y mapa en un build aislado en 4174, manteniendo el preview del usuario en 4173 y su `dist/` real; la aserción de retorno de registro se hizo independiente del puerto. Entonces la suite disponible sumaba 53 E2E y se comprobaron seis teselas OSM HTTP 200. Esa revisión no calculó rutas Google. La migración posterior a Google y la prueba real de HU17 constan en la sección 7; este registro no autoriza restaurar Leaflet ni indica que la clave siga pendiente.

Si una pestaña aún muestra atribución Leaflet/OSM con «Hay una nueva versión», está ejecutando el shell anterior pendiente de activar. El build actual no contiene esos proveedores. Usar la actualización confirmada de la PWA; no borrar IndexedDB, sesiones ni preferencias, ni forzar recargas durante operaciones sensibles para cambiar el mapa.

- Revisar `git status` antes de editar y conservar cambios existentes del usuario. No asumir que el trabajo de una sesión anterior ya está confirmado en Git.
- Cuando se solicite un commit, conservar la identidad Git configurada y no añadir atribución `Co-authored-by` del asistente: es una preferencia explícita del usuario.
- Mantener la organización por funcionalidad, el cliente Supabase y QueryClient únicos y las validaciones de servidor. Reutilizar `Workspace`, `Notice`, componentes UI, tokens y patrones de error existentes.
- Mantener textos en español, Poppins, azul marino/turquesa/verde y los SVG de marca existentes. Regenerar los iconos con `npm run icons`; no reemplazarlos arbitrariamente.
- Contemplar móvil, etiquetas accesibles, foco visible, carga, vacío, error/reintento y desconexión. No simular guardados como si fueran persistencia confirmada.
- Añadir verificaciones pertinentes para cambios de negocio, especialmente autorización, concurrencia y tiempos. Para cambios solo documentales, comprobar contenido, enlaces locales y formato; no hace falta repetir toda la suite.
- Actualizar este contexto y la guía de HU correspondiente cuando cambien el alcance, las rutas, el modelo, las migraciones o las limitaciones.
- En la entrega, distinguir implementación local, migración remota, pruebas automatizadas y aceptación manual; informar solo comprobaciones realmente ejecutadas.

## 9. Pendientes y próximos desarrollos

### Datos de demostración disponibles

`supabase/seed.sql` está cargado en `veterinary-services-dev` (`osoljaiqizmcxxlirrwo`). Crea 6 establecimientos aprobados, 7 sedes ficticias en Tunja, 9 servicios activos y 1 inactivo, con profesionales/recursos/asignaciones/jornadas y un bloqueo (101 registros de oferta). Son destinos y contactos de prueba, identificados con DEMO; no representan negocios reales. No importar ni presentar estos datos como catálogo verificado de la ciudad.

La ejecución es atómica, con bloqueo entre ejecuciones, UUID estables `de17`, validación del dominio y aprobaciones/oferta mediante las RPC existentes. Repetir no cambia revisiones ni publicaciones. Si una cuenta o documento entra en conflicto, aborta sin sobrescribir; no usar borrados o reinicios para forzarlo. Se conservan datos ajenos y preferencias/apartados de usuarios. El archivo es un seeder separado, no una migración de producción.

Las cuentas técnicas `de170000-0000-4000-8000-000000000001` y `...0002` no tienen contraseña ni identidad OAuth. No ofrecen acceso de prueba ni envían correos. El responsable termina como `provider` y el revisor como `user`; no queda un administrador nuevo. Usar una cuenta propia confirmada para aceptación de favoritos y apartados.

Fecha base persistida en la carga inicial: `2026-11-15`. Bloqueo de consulta general Centro el `2026-11-17` de 09:00 a 10:00; cierre completo Norte el `2026-11-18`. No desplazar esas fechas automáticamente al repetir el seeder. Jornadas semanales siguen disponibles; elegir una fecha futura dentro de 180 días. La clínica 24h tiene jornada profesional 08:00–20:00; la sede sin horario no ofrece intervalos. Ver [guía y recorridos](docs/datos-demostracion.md).

Verificación del seeder: 137 pruebas en 19 archivos, lint y tipos correctos; ocho pruebas nuevas ejecutan el SQL real en PostgreSQL embebido. Se cargó y repitió en desarrollo, y se comprobó en el navegador real de 4173 sin interceptar: siete pines, ficha desde pin, veinte intervalos normales, dieciocho con bloqueo y ninguno con cierre. Se inspeccionó la captura del mapa; no hubo errores JavaScript. No se calcularon rutas facturables de Google ni se crearon citas definitivas. El asesor de seguridad muestra dos informativos de tablas privadas sin políticas y un aviso de protección contra contraseñas filtradas desactivada; no se cambiaron ajustes de Auth.

### Próximos pasos

- Preparar operación de Google en producción: ID de mapa propio, restricciones del dominio final, cuotas y aceptación en dispositivos físicos. Clave/APIs y una ruta real sin tráfico en Tunja ya se comprobaron localmente. No se importan automáticamente establecimientos de Google.
- Completar el recorrido real de HU11 CA3 cuando se implementen las reservas y el chat. El contexto y retorno de autenticación están preparados y probados; no habilitar botones que simulen esos dominios.
- HU19 y siguientes: solicitudes atómicas con mascota, agenda y estados. Integrar el apartado de HU18 y revalidar dentro de la misma transacción, conservando las guardas contra solapes de profesional/recurso.
- Chat, imágenes/audio, Realtime, llamadas autorizadas, notificaciones push y recordatorios.
- Sincronización general, reintentos, conflictos y adjuntos; la cola actual de cuentas no cubre estos dominios.
- Aceptación con correos reales de confirmación/recuperación, validación piloto y Android/iPhone físicos. El aviso de privacidad de desarrollo necesita datos operativos definitivos antes de publicación general.
- Despliegue HTTPS final y comprobación de cabeceras. Cloudflare Pages está preparado con `public/_redirects`, `public/_headers`, build `npm run build` y salida `dist/`; no asumir que ya hay un despliegue público.

Al retomar, leer la HU solicitada, localizar su implementación y dependencias, comprobar el estado real y continuar dentro del alcance actual del usuario.
