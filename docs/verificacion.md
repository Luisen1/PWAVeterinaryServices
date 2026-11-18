# Verificación de la base técnica

La verificación más reciente de descubrimiento en Tunja está en [hu10-hu12.md](hu10-hu12.md): 76 pruebas de lógica/base de datos, 38 E2E y consultas públicas reales paginadas. No se añadieron migraciones ni se modificaron datos remotos para esta entrega.

La verificación de HU07-HU09, ejecutada el 2026-11-15, está en [hu07-hu09.md](hu07-hu09.md): 66 pruebas de lógica/base de datos, 26 E2E e integración real en Supabase con datos revertidos. Las secciones siguientes conservan el registro histórico de las fases anteriores.

Ejecutada el 2026-11-14, America/Bogota, en Windows con Node 24.15.0 y npm 11.12.1. Navegador automatizado Chromium 159 de Playwright 1.65.1.

## Comandos ejecutados

| Comando                            | Resultado                                                                     |
| ---------------------------------- | ----------------------------------------------------------------------------- |
| `node --version` y `npm --version` | v24.15.0 y 11.12.1                                                            |
| `npm install`                      | Dependencias instaladas y package-lock.json generado                          |
| `npm ci`                           | Instalación reproducible correcta desde el lockfile, 491 paquetes instalados  |
| `npm run format`                   | Archivos formateados con Prettier                                             |
| `npm run typecheck`                | Correcto tras ajustar la separación de tipos de app, pruebas y SW             |
| `npm run lint`                     | ESLint sin advertencias y Prettier correcto                                   |
| `npm test`                         | 4 pruebas unitarias correctas en 3 archivos                                   |
| `npm run build`                    | Build de producción correcto, SW con injectManifest y 14 recursos en precache |
| `npx playwright install chromium`  | Chromium instalado en la caché del usuario                                    |
| `npm run test:e2e`                 | 6 pruebas correctas, incluida segunda compilación                             |
| `npm audit --omit=dev --json`      | 0 vulnerabilidades de producción                                              |
| `npm audit --json`                 | 12 avisos de desarrollo, 2 bajos y 10 moderados                               |

La primera ejecución de la prueba de actualización falló porque el callback de recarga omitía la actualización de una primera sesión sin controlador inicial. Se corrigió el componente, se ejecutó de nuevo la suite completa y las seis pruebas pasaron.

El primer intento de `npm ci` encontró un bloqueo de archivo nativo en Windows mientras el preview HTTPS propio estaba activo. Se detuvo ese servidor y se repitió `npm ci` correctamente.

## Criterios de aceptación

| N.º | Criterio                                                      | Resultado y evidencia                                                                                                                                                                                                                                                                                                   |
| --- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | build, lint, typecheck y test                                 | Verificado localmente. Los cuatro comandos terminan con código 0.                                                                                                                                                                                                                                                       |
| 2   | Manifest e iconos válidos y SW activo en producción por HTTPS | Verificado en preview HTTPS local con certificado autofirmado de prueba. Chromium informó `secureContext: true`, `manifestErrors: []`, `installabilityErrors: []` y SW `activated`. E2E verifica los cinco PNG y sus dimensiones. Pendiente el mismo control en un origen de despliegue con certificado público válido. |
| 3   | Lighthouse PWA/instalabilidad sin fallos                      | La categoría PWA fue retirada de Lighthouse. Se comprobó instalabilidad mediante `Page.getInstallabilityErrors` y manifest mediante `Page.getAppManifest`, ambos sin errores. No se generó una puntuación Lighthouse PWA.                                                                                               |
| 4   | Instalación Android Chrome y arranque standalone              | Parcial. Se verifica el botón mediante evento controlado, su consumo y ocultación tras appinstalled, y la detección standalone. Pendiente instalación nativa, icono y arranque desde Android físico.                                                                                                                    |
| 5   | Guía e instalación en iPhone Safari                           | Parcial. Se verifica la guía con emulación de iPhone en Chromium. Pendiente Safari y Añadir a pantalla de inicio en iPhone físico.                                                                                                                                                                                      |
| 6   | Shell y rutas offline después de la primera visita            | Verificado con red deshabilitada en Playwright. Se abren y recargan las cuatro rutas, se prueba una 404 profunda y un recurso ausente devuelve 503. Pendiente repetir modo avión en dispositivos físicos.                                                                                                               |
| 7   | Aviso entre compilaciones y actualización confirmada          | Verificado con dos builds reales. La segunda versión queda waiting, mantiene la marca anterior y la ruta, y cambia al pulsar Actualizar.                                                                                                                                                                                |
| 8   | Prueba Dexie y e2e del SW                                     | Verificado. IndexedDB abre, escribe y lee. La purga conserva otra cuenta y el catálogo. El SW se registra y controla la página.                                                                                                                                                                                         |

La retirada de la categoría se describe en [Chrome for Developers](https://developer.chrome.com/blog/update-install-criteria).

## Prueba HTTPS local

Se generó un certificado temporal de un día para localhost mediante OpenSSL. Se sirvió `dist/` con la API `preview` de Vite en `https://localhost:4174` y se abrió Chromium con aceptación del certificado de prueba. Los comandos usados fueron `openssl req -x509 ...`, `node --input-type=module` con `preview({ preview: { https: { key, cert } } })` y un script Playwright que consulta `Page.getAppManifest` y `Page.getInstallabilityErrors`.

Esta verificación ejecuta el flujo HTTPS local. La comprobación de confianza del certificado público y las cabeceras de Cloudflare Pages requiere el despliegue indicado en README.

## Revisión visual

Se capturaron y revisaron las pantallas a 360 px y 1280 px. Las capturas reproducibles se guardan en `test-results/` durante e2e. La navegación inferior permanece fija y el contenido dispone de espacio inferior para desplazarse completamente por encima de ella. La prueba de rutas verifica que el ancho del documento no exceda el viewport de 360 px.

## Límites y pendientes

- Estado inicial de la base técnica: no había migraciones remotas aplicadas. Este punto quedó superado con la implementación de HU01-HU06 descrita al final.
- Falta la comprobación de instalación real y modo avión en Android e iPhone, y las cabeceras del hosting HTTPS definitivo.
- El lockfile contiene dependencias transitivas preliminares heredadas de las herramientas estables. Se detallan en `decisiones.md`.
- Quedan 12 avisos de seguridad en herramientas de desarrollo y una advertencia de deprecación del bundler en Workbox. La auditoría de dependencias de producción está limpia.
- Las siguientes fases están enumeradas en README y en los README de cada dominio.

## Actualización de HU01/HU02

El 2026-11-14 se implementaron registro, confirmación, acceso, recuperación PKCE y cierre de sesión con purga. La nueva migración incluye perfiles, roles controlados por servidor y aceptación versionada del aviso de privacidad. La guía de configuración y el alcance de las pruebas están en `autenticacion.md`.

La comprobación del proyecto remoto confirmó el proveedor Email, registro habilitado y confirmación de correo obligatoria. Las migraciones ya se aplicaron mediante el conector administrativo. La configuración de URL y correo y su aceptación real siguen pendientes; véase `hu01-hu06.md`. Las pruebas de navegador usan peticiones interceptadas y las pruebas SQL usan PostgreSQL embebido.

La verificación local de esta actualización terminó correctamente con `npm run lint`, `npm run typecheck`, 18 pruebas en `npm test`, 12 pruebas de `npm run test:e2e` y `npm run build`. Se revisó visualmente el registro a 360 px. El build final se regeneró con la configuración del proyecto real y se comprobó que no contiene el backend ficticio de Playwright.

El build produce un aviso por el chunk principal de aproximadamente 826 kB y conserva el aviso de deprecación del bundler del SW. El precache tiene 14 recursos, unos 928 KiB. Los comandos terminan con código 0.

## Actualización hasta HU06

Verificación del 2026-11-14 (America/Bogota): `npm test` pasó 40 pruebas en nueve archivos; `npm run test:e2e` pasó 17 pruebas, incluyendo los flujos anteriores de Auth/PWA y los nuevos de perfil, mascotas y oferentes. `npm run lint`, `npm run typecheck`, `npm run build` y `git diff --check` terminaron correctamente. El build final se regeneró con el proyecto real después de Playwright.

Se revisaron capturas de perfil y ficha pública a 360 px y de ficha a 1280 px. Las imágenes de E2E son fixtures. La suite comprueba validación conservando datos, denegación visual de administración, reintento tras fallo, sincronización antes del cierre, logo, corrección, aprobación y conservación de publicación anterior. El directorio ya tiene contenido funcional y sus estados dejaron de usar los parámetros de demostración del placeholder.

Se aplicaron las cuatro migraciones en `veterinary-services-dev`. Se alinearon sus versiones del historial remoto con los archivos locales. La integración SQL de `supabase/tests/hu03_hu06.sql` terminó correctamente antes y después de las protecciones finales. Las cuentas y entidades sintéticas se revirtieron; la base conserva cero cuentas, mascotas, establecimientos, decisiones y publicaciones al terminar la prueba, y una invitación administrativa pendiente para el correo de Git.

La revisión de seguridad de Supabase ya no muestra la advertencia de RPC pública con SECURITY DEFINER. Conserva dos [avisos informativos por tablas privadas con RLS y sin políticas](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy): roles e invitaciones administrativas, que deben permanecer inaccesibles desde los clientes. Rendimiento muestra tres [índices todavía sin uso](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index), esperables en la base sin datos reales; no se eliminan índices de propietario o cola de revisión por esta estadística inicial.

El build conserva las advertencias de tamaño del chunk principal (aproximadamente 884 kB sin comprimir) y de `inlineDynamicImports` en Workbox; genera 14 entradas de precache, unos 986 KiB. No bloquean los comandos. La aceptación real de correo, los archivos por Storage, las URL de retorno y la cuenta administradora confirmada siguen pendientes según `hu01-hu06.md`.

## Rediseño visual en Luise-Dev

El 2026-11-14 se aplicó la guía visual y los prototipos a las funciones hasta HU06, dentro de la rama `Luise-Dev` creada antes de modificar archivos. El detalle de componentes, marca SVG, Poppins, contraste y alcance está en [diseño visual](diseno-visual.md).

Pasaron lint, las 40 pruebas unitarias/SQL y las 20 pruebas E2E. Los recorridos nuevos comprueban el control de contraseña visible, las vistas a 320, 360 y 1280 px sin desbordamiento horizontal, la búsqueda local y el registro de establecimientos en cuatro pasos. Se conserva la cobertura anterior de autenticación, publicación, permisos y PWA. Los casos usan fixtures; los pendientes de aceptación remota de HU01-HU06 no cambian por este rediseño.

## HU13-HU15: filtros, apertura y preferencias privadas

El 2026-11-15 se implementaron filtros combinados por sede/servicio, apertura con zona IANA y excepciones, declaración de urgencias y horario semanal de 24 horas, favoritos y notas privadas. El recorrido y las decisiones están en [HU13-HU15](hu13-hu15.md).

Pasaron **103 pruebas de lógica/PostgreSQL en 16 archivos y 44 E2E**, lint y tipos. Se comprobó la migración IndexedDB v1→v2 sin perder catálogo ni pendientes, la consolidación de preferencias, reintentos con operación estable, conflicto sin sobrescritura, aislamiento entre cuentas y purga al salir. Los casos de tiempo incluyen cruce de medianoche, cierre por fecha, horario especial y cambio DST. El navegador verifica combinación/limpieza de filtros, estado de apertura desconocido offline, recarga con notas, edición sin red y sincronización posterior. Se mantuvo la verificación de al menos 180 px de mapa en la primera pantalla móvil y se revisaron capturas a 320/360 px.

La migración `20261115210218_discovery_filters_and_private_preferences.sql` se aplicó en `veterinary-services-dev` y quedó alineada con el historial remoto. `supabase/tests/hu13_hu15.sql` pasó con datos sintéticos y rollback: urgencias tipadas, RLS de lectura por cuenta, denegación de escritura directa/visitante/correo sin confirmar, idempotencia y rechazo de revisiones obsoletas. Seguridad conserva únicamente los dos avisos informativos previos de tablas privadas con RLS sin políticas. Los avisos de rendimiento y sus enlaces están documentados en la guía de las HU.

El build final se regenera con el entorno real después de Playwright. Mantiene los avisos conocidos de tamaño del chunk principal, de aproximadamente 961 kB sin comprimir, y `inlineDynamicImports` de Workbox; produce 17 entradas de precache, aproximadamente 1269 KiB. Las pruebas con fixtures no sustituyen Android/iPhone físicos, correo real ni la confirmación de horarios/urgencias por el establecimiento. No se implementaron reservas, chat, trazado/ETA internos ni sincronización con la aplicación cerrada.

## HU17-HU18: rutas integradas y consulta reservable

El 2026-11-15 pasaron **129 pruebas de lógica/PostgreSQL en 18 archivos y 52 E2E**, lint, tipos y build. Tras acotar el aviso de fallo del mapa OSM al mapa de selección, se repitieron los 22 E2E de las historias nuevas y descubrimiento, también correctos. Se revisaron capturas de Citas a 320/1280 px y ruta con SDK controlado a 360 px.

La cobertura añade rutas con/sin tráfico y fallback, fecha del cálculo, cuota/cobertura/configuración, resultados incompletos, desconexión y respuesta demorada después de cambiar modalidad. HU18 verifica intervalos por profesional/modalidad/zona, revalidación ante ocupación, recurso compartido, extremos adyacentes, idempotencia/vencimiento, recuperación de apartado tras recarga, aislamiento de cuentas, borradores offline y cierre con pendientes. Los borradores no se envían al reconectar ni crean citas.

Las dos migraciones nuevas quedaron aplicadas y alineadas en desarrollo: `20261116002733_reservable_availability_and_slot_holds.sql` y `20261116002913_index_slot_hold_references.sql`. `supabase/tests/hu18.sql` pasó con rollback; no quedaron datos sintéticos. La revisión mantuvo solo los dos informativos previos de seguridad. Se corrigieron los índices de FK detectados; permanecen los avisos de índices sin uso y la política permisiva histórica de oferta, detallados en [HU17-HU18](hu17-hu18.md).

El build final se regeneró con el entorno real después de E2E: 18 entradas de precache, unos 1288 KiB y chunk principal de unos 979 kB sin comprimir. Permanecen los avisos conocidos de tamaño y Workbox. **No se hicieron consultas reales ni facturables a Google:** faltan clave y activación de Maps JavaScript API/Routes API. La aceptación real de HU17 queda pendiente; el fallback de configuración está implementado. No se afirma haber medido solicitudes HTTP simultáneas ni tiempos de producción. Las solicitudes definitivas con mascota, agenda y estados siguen en HU19 y posteriores.

## Corrección de bloqueo de OpenStreetMap en preview

El HTML conservaba un meta `no-referrer` incompatible con las condiciones de teselas, aunque el archivo de cabeceras de hosting ya declaraba `strict-origin-when-cross-origin`. Se corrigió el meta y se configuró la política explícitamente en Leaflet. Un nuevo E2E comprueba que las solicitudes incluyen solo el origen, sin la ruta ni parámetros de la página.

Se comprobaron 23 casos de autenticación, descubrimiento y mapa; tras ajustar una expectativa que fijaba el puerto 4173 se repitieron los cuatro relevantes, correctos. Las pruebas usaron puerto 4174 y salida de build aislada para conservar el preview activo del usuario. Tipos y build correctos. La suite disponible pasa a 53 E2E.

La comprobación posterior en `localhost:4173` usó el build con el entorno real, sin interceptar ni precargar teselas: seis respuestas HTTP 200, seis imágenes decodificadas y Referer `http://localhost:4173/`. Se inspeccionó el mapa de Tunja a 400×876. No se consultó Google Routes ni se modificaron datos remotos. La clave de Google está añadida localmente, pero esta comprobación no demuestra todavía una ruta real de HU17.

## Seeder de sedes ficticias en Tunja

`supabase/seed.sql` se ejecutó y repitió en `veterinary-services-dev`: seis establecimientos publicados, siete sedes, nueve servicios activos, uno inactivo y 101 registros de oferta. No quedaron administradores técnicos nuevos. Las ocho pruebas nuevas de PostgreSQL comprueban compatibilidad con los esquemas del frontend, idempotencia, colisiones/rollback, conservación de registros ajenos, acceso de operador, horarios/bloqueos/cierres y apartado/liberación. Resultado total: **137 pruebas en 19 archivos**, lint y tipos correctos.

La comprobación con Playwright en el preview real `localhost:4173`, sin interceptar la API ni las teselas, encontró siete pines, abrió una ficha desde un pin y consultó disponibilidad publicada: veinte intervalos el 2026-11-22, dieciocho el 2026-11-17 con bloqueo y cero en Norte el 2026-11-18 con cierre. Se inspeccionó `test-results/seed-live-map.png` y no se registraron errores JavaScript. El script y la captura son artefactos locales ignorados por Git. No se efectuaron llamadas a Google Routes ni reservas definitivas.

El asesor de seguridad remoto reporta dos informativos de tablas privadas con RLS sin políticas y un aviso de protección contra contraseñas filtradas desactivada. El seeder no modifica esquema, RLS ni configuración de Auth. Los escenarios, contactos ficticios y pasos de repetición están en [datos de demostración](datos-demostracion.md).

## Google Maps como proveedor único

Se sustituyeron Leaflet/OSM por Maps JavaScript API en `MapCanvas`, se retiraron sus dependencias/tipos y el componente separado `GoogleRouteMap`. El SDK y sus opciones se comparten con el cálculo de rutas. Una polilínea se añade/quita sobre la instancia existente; no se cambia de proveedor. Se conservan categorías, agrupación, elección de sedes coincidentes, origen con precisión, filtros, selección entre vistas y listado ante fallos. Las variables de teselas antiguas se retiraron de la configuración; se añadió ID de mapa JavaScript opcional, con ID de demostración para desarrollo. El aviso de privacidad distingue mapa visible, cálculo y navegación externa.

Resultado: **141 pruebas en 20 archivos y 30 E2E**, lint, tipos y build correctos. Los recorridos de descubrimiento, rutas, preferencias y mapa se comprobaron con SDK controlado en puerto 4174 y build aislado, conservando el preview del usuario en 4173. Tras corregir la detección de sedes coincidentes frente al redondeo del centro de agrupación se repitieron los 30 recorridos, correctos. Se verificó además la denegación tardía de autorización y la identidad de la instancia al calcular/quitar el trazado. La suite disponible suma 54 E2E; no se afirma haber repetido toda esa suite en esta entrega.

El build real se regeneró con `.env.local`: 16 entradas de precache, unos 1118 KiB y mapa diferido de unos 27.5 kB sin comprimir. Continúan los avisos conocidos de chunk principal grande y opción Workbox deprecada. `npm` reporta las mismas 12 vulnerabilidades previas (2 bajas y 10 moderadas).

La comprobación en 4173 sin interceptar APIs mostró siete marcadores DEMO en el mapa real de Tunja y una ruta real sin tráfico de aproximadamente 1 km/6 min en ese momento. El nodo del lienzo permaneció idéntico, sin solicitudes OpenStreetMap ni errores JavaScript/de autorización. Se inspeccionaron capturas de escritorio y móvil a 360 px, sin desbordamiento horizontal. Fue una consulta real de Google Routes por ejecución de comprobación; no se midieron navegación física, tráfico real ni facturación a escala. Las capturas/helpers quedan ignorados en `test-results/`.

La captura posterior del usuario mostraba Leaflet/OSM y el aviso «Hay una nueva versión». Se volvió a comprobar que el build `dist/` ya no contiene Leaflet ni peticiones OSM: la pestaña conserva el shell anterior hasta activar la actualización. No se borraron datos locales ni se cambió la política de confirmación de actualizaciones. No se afirma haber activado la actualización en la pestaña del usuario.

## HU19-HU21: solicitudes y decisiones

Se implementaron solicitud presencial/virtual con mascota propia, validación de modalidad/especie/asignación, consumo atómico de apartado y reintentos idempotentes. Las solicitudes pendientes vigentes ocupan profesional/recurso; las decisiones requieren revisión y permisos, persisten un evento de aviso y el rechazo exige motivo/libera el intervalo. La consulta registra vencimientos al inicio previsto. Se añadieron listas privadas paginadas, detalle/instrucciones/historial y accesos desde Cuenta/ficha. No se simulan videollamadas ni entregas de correo/push.

Resultados: **154 pruebas de lógica/PostgreSQL en 21 archivos**, **37 E2E** y lint, tipos y build correctos. La suite disponible tiene 61 E2E; esta entrega ejecutó los 37 de solicitudes/decisiones, disponibilidad/rutas, descubrimiento, mapa y preferencias. Los E2E usan APIs controladas y puerto 4174/build aislado, conservando el preview del usuario en 4173. Se revisaron capturas de detalle a 320/1280 px sin desbordamiento horizontal. Los casos nuevos cubren conflicto con datos conservados, respuesta perdida/reintento con el mismo ID, solicitud virtual, confirmación/rechazo, desconexión y detalle ajeno. El cambio de conexión conserva catálogo público previo marcado como guardado para no desmontar el formulario mientras se carga IndexedDB.

Las trece pruebas PostgreSQL nuevas validan el payload real con el modelo del frontend, idempotencia, propiedad de mascota, apartado, modalidad, ocupación de recurso/profesional compartidos, permisos `services`/`read`/`schedule`, revocación, eventos, revisión, bloqueos, expiración y cursor/paginación. También ejecutan el archivo SQL reproducible. Las pruebas anteriores de oferta/seeder siguen pasando.

Se aplicaron y alinearon tres migraciones en desarrollo: `20261116024136_appointment_requests_and_decisions.sql`, `20261116024351_count_pending_requests_on_blocks.sql` y `20261116025001_normalize_appointment_request_pages.sql`; total once. `supabase/tests/hu19_hu21.sql` pasó con rollback, también después de la última migración. La comprobación de concurrencia usó dos operaciones SQL independientes en paralelo, dos cuentas técnicas del fixture y el mismo intervalo/asignación: una devolvió `requested`, otra `23P01`, y se contó una sola ocupación. Los datos de esa prueba se retiraron únicamente por sus IDs acotados y se verificaron cero mascotas/solicitudes residuales. Esto no mide carga ni latencia HTTP de producción.

El asesor remoto conserva los dos informativos de tablas privadas sin políticas y la advertencia de protección contra contraseñas filtradas desactivada; no añadió problemas nuevos de RLS/FK. Rendimiento conserva avisos informativos de índices sin uso y la política permisiva histórica de lectura de oferta. No se cambiaron ajustes de Auth ni permisos de cuentas reales.

El build real se regeneró con `.env.local`, sin publicar claves: 16 entradas de precache (~1133 KiB), mapa diferido ~27.5 kB y chunk principal ~996 kB sin comprimir. Persisten los avisos conocidos de tamaño/Workbox. La comprobación final de 4173 consultó veinte intervalos DEMO, abrió la nueva pantalla de solicitudes con el requisito de cuenta confirmada y verificó que las RPC nuevas existen y rechazan al visitante con `42501`; no hubo errores JavaScript. No se hicieron cálculos Google ni envíos de notificaciones externas.

Para aceptación manual con personas reales, usar una mascota propia y un establecimiento propio aprobado o una invitación `schedule` aceptada. Las cuentas técnicas del seeder no permiten entrar como oferente. Cancelación/reprogramación, agenda completa, videollamada y push siguen en sus historias posteriores. Ver [guía de implementación y pruebas](hu19-hu21.md).

## HU22-HU24: cambios, agenda y chat de texto

Verificación del 2026-11-16: **168 pruebas de lógica/PostgreSQL en 22 archivos y 49 E2E**, tipos, lint y build correctos. La suite disponible suma 69 E2E; se ejecutaron los 49 de solicitudes/cambios, agenda/chat, disponibilidad/rutas, descubrimiento, mapa, oferta y preferencias, con APIs/SDK controlados y salida/puerto 4174 aislados. No se afirma haber repetido todos los 69. Se revisaron capturas a 320 px de chat y cita cancelada, sin desbordamiento horizontal.

Los recorridos nuevos comprueban cancelación con motivo, reprogramación con conflicto/reintento estable, texto conservado al perder conexión, pendiente local sin autoenvío, filtros en servidor, chat de dos cuentas, lectura explícita, recuperación por cursor, respuesta perdida sin duplicados, inicio por sede e identificador ajeno denegado. PostgreSQL verifica además plazo acordado/vencido, transición completada/no asistió tras fin, aislamiento/revocación, lectura sin anticiparse, más de cien mensajes, texto vacío/excesivo y reglas públicas accesibles sin gestión. IndexedDB verifica actualización de v3 poblada a v4, conservación, pendientes, aislamiento y purga.

Se aplicaron/alinearon cuatro migraciones nuevas: `20261116150201_appointment_changes_and_agenda.sql`, `20261116150210_authorized_text_messaging.sql`, `20261116150621_reject_blank_chat_messages.sql` y `20261116151747_allow_public_appointment_policy_reads.sql`. Total quince. `supabase/tests/hu22_hu24.sql` pasó con rollback y forma parte de la suite local. La última corrección surgió del smoke real: una rama CASE de RLS no evitaba que PostgreSQL exigiera EXECUTE sobre la función privada de gestión. Un auxiliar acotado permite leer reglas publicadas, conservando denegada su gestión al visitante; se añadió prueba específica.

Realtime real: tres sesiones Auth técnicas temporales, tablas publicadas, inserción recibida por equipo, recibo recibido por cliente, respuesta recuperada por cursor e idempotencia. La tercera cuenta obtuvo `42501`, SELECT vacío y cero eventos ajenos. El arranque frío inicial del servicio requirió reintento; la segunda comprobación completa pasó. Se cerraron sesiones y retiraron cuentas, vinculación, conversación y mensajes, y se comprobó cero residuos. No se modificaron credenciales de cuentas existentes ni se enviaron correos/push. Las credenciales temporales locales fueron eliminadas.

La revisión de seguridad conserva solo los dos informativos de tablas privadas sin políticas y el aviso histórico de protección contra contraseñas filtradas desactivada. Rendimiento conserva la política permisiva histórica de oferta y avisos informativos de índices sin uso, incluidos índices nuevos todavía sin tráfico; sin nuevas FK sin índice. No se cambiaron ajustes de Auth. Referencia del aviso previo: [protección de contraseñas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

Build con `.env.local` real, sin exponer claves: 16 entradas de precache (~1166 KiB), mapa diferido ~27.5 kB y chunk principal ~1028 kB sin comprimir. Permanecen los avisos conocidos de tamaño/Workbox. El preview real 4173 comprobó cuatro rutas privadas con requisito de cuenta confirmada, lectura pública de reglas y cinco RPC nuevas denegadas a anon con `42501`, sin errores JavaScript. No se hicieron consultas reales de Google en esta entrega.

Pendiente operativo: aceptación con cuentas reales de cliente/equipo, Android/iPhone físicos y despliegue HTTPS. Adjuntos, videollamadas, push y notificaciones fuera de la app siguen en sus HU posteriores. Ver [guía HU22-HU24](hu22-hu24.md).

## Corrección del puerto del chat en CI

El test de chat entre dos cuentas fijaba `http://localhost:4174` al crear sus contextos, mientras CI inicia el servidor en 4173. Se sustituyó ese valor por la fixture `baseURL` de Playwright en ambos contextos. La suite completa con la configuración de CI pasó: **69 E2E**, incluidos los recorridos PWA. Los **cuatro E2E de chat** también pasaron con servidor/build aislados en 4174, comprobando independencia del puerto. Tipos y lint correctos; el build final se regeneró con el entorno real después de las pruebas. El cambio afecta únicamente al test; no cambia mapas, rutas ni servicios externos.

## HU25-HU27: medios privados y preparación de LiveKit Cloud

Verificación del 2026-11-16: **189 pruebas de lógica/PostgreSQL en 23 archivos y la suite completa de 79 E2E**, con `CI=true` y configuración estándar en 4173. Tipos, lint y `npm run check:functions` correctos. Se añadió la comprobación Deno de las tres funciones al flujo de CI. Tras corregir un aviso de cámara que quedaba visible al fallar el ingreso, se repitieron los tres E2E de llamadas: correctos. No se aumentaron timeouts ni se volvió a fijar 4174 en contextos nuevos.

Los recorridos de Chromium usan cámara/micrófono sintéticos, pero capturan una imagen y codifican/reproducen audio real con MediaRecorder. Comprueban vista previa/descarte, denegación de cámara con alternativa de archivo, límite de grabación, pendiente recuperado tras recarga, respuesta perdida sin duplicados, descarte offline y limpieza de una subida propia sin borrador local. La asignación profesional exige revisiones esperadas; terceros o citas no confirmadas/fuera de ventana no activan medios. Una respuesta de proveedor pendiente libera todas las pistas y no muestra conexión simulada. Se revisaron capturas de chat y sala a 320 px, sin desbordamiento horizontal.

PostgreSQL verifica RLS, permisos, límites, idempotencia, publicación exclusiva de servidor, descarte, ventana de sala, identidad profesional, revisión de asignación y revocación/cancelación. La validación de bytes acepta JPEG/PNG/WebP y tonos sintéticos WebM/Opus, Ogg/Opus y MP4/AAC; rechaza contenido/formatos/dimensiones/duración inválidos. Las pruebas de firma verifican identidad, sala, privilegios mínimos, expiración y secreto incorrecto. IndexedDB comprueba persistencia del blob, cuenta propietaria, reintento estable y purga.

La migración `20261116165558_private_chat_media_and_call_authorization.sql` quedó aplicada y alineada en desarrollo, total dieciséis; `supabase/tests/hu25_hu27.sql` pasó con rollback. `chat-media`, `appointment-call` y `call-maintenance` están desplegadas. Las dos funciones de usuario respondieron 401 sin sesión; su gateway permite llegar al handler, que verifica Auth mediante `getUser`. El worker conserva verificación JWT y credencial de servidor adicional.

Prueba remota HTTP/Auth/Storage con tres cuentas técnicas temporales: JPEG y los tres contenedores de audio guardados, descarga autorizada comparada por SHA-256 y reintentos sin duplicados. Tercero y URL pública denegados; MIME falso rechazado. Retirar `messages` impidió descargar sin retirar el permiso de agenda. La autorización vinculó cliente/profesional a una misma sala y negó tercero/cancelación; el endpoint de ingreso respondió 503 por LiveKit sin configurar. Se eliminaron los objetos mediante Storage antes de retirar fixtures, y se comprobó cero cuentas, subidas, citas y objetos temporales. Credenciales locales eliminadas; no se enviaron correos/push ni se cambiaron permisos de cuentas reales.

Los asesores conservaron los avisos previos: dos informativos de tablas privadas sin políticas y protección contra contraseñas filtradas desactivada; rendimiento con índices sin uso y política permisiva histórica de oferta. Sin nuevas FK sin índice ni nuevos problemas de RLS. No se cambiaron ajustes de Auth ni se activaron Cron/pg_net.

Build final regenerado con `.env.local` real, sin exponer claves: 17 entradas de precache (~1772 KiB), mapa diferido ~27.5 kB, SDK LiveKit diferido ~578 kB y principal ~1070 kB sin comprimir. Persisten avisos de tamaño de chunks y opción de Workbox deprecada; no impiden compilar. No se hicieron cálculos Google.

**HU27 no está aceptada como llamada operativa:** faltan cuenta/secretos LiveKit Cloud, mantenimiento comprobado y audio/video entre dos equipos reales. Tampoco se verificaron Safari/iPhone ni Android físicos. La activación, ventana y límites de revocación asíncrona están en [HU25-HU27](hu25-hu27.md). HU25-HU26 están implementadas y verificadas en desarrollo; esa evidencia no sustituye aceptación móvil en dispositivos físicos.

## Compresión de fotografías y ahorro en videollamada

Actualización del 2026-11-16, tras aclarar que el video solicitado corresponde a la videollamada. Se repitieron **189 pruebas de lógica/PostgreSQL y los 15 E2E de chat/llamadas**, incluidos dos recorridos nuevos de compresión; todos correctos. La suite disponible suma ahora 81 E2E; no se afirma haber repetido los 81 en esta actualización. Tipos y lint correctos.

Chromium comprimió un PNG sintético de 2400×1800 con ruido, mayor de 5 MiB, a WebP de hasta 512 KiB y lado máximo de 1600 px, reduciendo más del 90 % del tamaño. Se comprobó el blob final en IndexedDB antes de subir, recuperación tras recarga y reintento con el mismo UUID tras respuesta perdida, con un único mensaje validado por el backend de prueba. Otro recorrido fuerza un navegador sin codificador WebP y verifica JPEG; un original mayor de 20 MiB y una imagen ilegible se rechazan antes de guardar/subir, conservando texto. El recorrido de cámara y el de voz continúan correctos.

El E2E de ingreso con proveedor pendiente comprobó en las pistas capturadas límites de 640×360 y 15 fps, y su liberación después del error. Los ajustes de publicación de video a 500 kbit/s y audio mono a 24 kbit/s están tipados contra el SDK instalado; no se presenta eso como medición de tráfico ni prueba de codificación entre dos participantes LiveKit. Las cuotas gratuitas y alternativas se consultaron en documentación oficial y quedaron en [HU25-HU27](hu25-hu27.md). No hubo cambios de esquema, funciones remotas, credenciales ni proveedor.

Build final con entorno real correcto, 17 entradas de precache (~1774 KiB). Conserva los avisos conocidos de tamaño y Workbox; no hubo cambios de dependencias. Preview restaurado en 4173 después de retirar el servidor de pruebas.

## Configuración local única

Por petición del usuario, se reunieron las variables públicas y privadas en el `.env.local` raíz, fuera de Git. Se compararon todos los valores antes y después y se retiró `supabase/functions/.env.local` tras verificar la escritura. La única plantilla mantenida es `.env.example` raíz. No se mostraron valores privados ni se incluyeron en documentación/pruebas.

`npm run deploy:secrets -- --check` pasó con las cinco variables permitidas; no realizó carga remota. El comando sin `--check` filtra frontend/variables ajenas, deriva el destino del proyecto público, invoca CLI 3.1.0 y retira el archivo temporal. Cuatro pruebas nuevas verifican lista permitida, rechazo de máscaras, credenciales/referencias en VITE_ y formatos/destinos inválidos: **193 pruebas en 24 archivos**, tipos, lint y build correctos. No se repitió E2E porque este cambio no modifica recorridos de la app. Persisten avisos previos de tamaño/Workbox.

La consulta real de solo lectura `RoomServiceClient.listRooms` autenticó correctamente con el nuevo par LiveKit, sin crear salas ni activar llamadas. Se revisó el contenido de `dist/` y no contiene los valores reales de API key/secret de LiveKit. Git confirma que `.env.local` está ignorado. `LIVEKIT_MAINTENANCE_READY` permanece false; no se cargaron secretos remotos, no se activó Cron y sigue pendiente la prueba entre dos equipos.

## Registro y perfil separados por tipo de cuenta

Actualización del 2026-11-16: **206 pruebas en 24 archivos y los 88 E2E completos aprobados**, con configuración estándar de CI. Tipos, lint y build correctos. Los E2E nuevos cubren ambos registros, selección obligatoria, menús/rutas de dueño y veterinaria, administración separada, error de contexto, navegación offline y elección inicial de cuenta antigua. Se revisaron capturas a 320 px sin desbordamiento. Los recorridos anteriores se ajustaron para simular al responsable y al administrador en su rol correspondiente, manteniendo las pruebas de permisos y publicación.

La migración `20261116184257_account_types_and_role_separation.sql` quedó aplicada y alineada en desarrollo, total diecisiete. `supabase/tests/account_types.sql` pasó tanto en PGlite como en desarrollo con rollback. Comprueba elección única/idempotente, rechazo de metadatos usados como privilegio, escritura privada de roles denegada, mascotas de dueño permitidas, registro de veterinaria pendiente de revisión y operaciones cruzadas denegadas incluso mediante el auxiliar privado. Las pruebas locales también verifican invitaciones, apartados y contexto sin privilegios de equipo por elegir Veterinaria.

Los conteos remotos antes/después conservaron **3 usuarios, 3 perfiles, 1 mascota, 6 establecimientos y cero citas/conversaciones/mensajes**. No se eliminaron datos de personas existentes ni se asignaron permisos de equipo nuevos. El contrato remoto utiliza cuentas sintéticas y claims simulados dentro de una transacción revertida; no envía correos ni constituye aceptación del flujo de correo por personas reales.

La revisión remota conservó los avisos anteriores, sin nuevos problemas: dos informativos de [RLS sin políticas en tablas privadas](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), advertencia de [contraseñas filtradas desactivada](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection), quince índices informativos sin uso y la advertencia histórica de políticas permisivas múltiples en oferta. No se cambiaron ajustes de Auth.

Tras explicitar que la elección de tipo no se pausa para autoenviarse al reconectar, se repitieron los siete E2E de tipos de cuenta: correctos. El build real posterior a E2E conserva 17 entradas de precache (~1778 KiB) y avisos conocidos de tamaño/Workbox. La configuración local única, credenciales y activación pendiente de LiveKit se conservan. Ver [reglas y límites de tipos de cuenta](tipos-de-cuenta.md).

## Selección de coordenadas de sedes en el formulario

Actualización del 2026-11-16: **15 E2E de ubicación de sedes, directorio, mapa y regresión visual aprobados**. Tres recorridos nuevos verifican clic, ambos eventos de arrastre del SDK, uso del centro, edición numérica sin recrear el mapa, confirmación obligatoria tras cambios, conservación entre pasos, sedes independientes al eliminar/reindexar y alternativa manual ante error/offline. La suite disponible suma 91 E2E; no se afirma haber repetido los 91 en este cambio. Captura a 320 px revisada, sin desbordamiento horizontal.

Se comprobó además el build con la clave local y **Google Maps real**, sin interceptar el SDK: carga, clic y arrastre actualizaron latitud/longitud correctamente. Esta prueba detectó y corrigió la compatibilidad de `dragend` con el canal quarterly, conservando el evento DOM de versiones nuevas. Auth y datos se interceptaron con una identidad ficticia local; no se envió el formulario ni se escribió en el backend. Hubo consultas reales de Maps JavaScript, sin Routes, Places ni Geocoding.

Tipos, lint y build final con el entorno local correctos, 17 entradas de precache (~1783 KiB). Persisten los avisos conocidos de tamaño y Workbox. Sin cambios de esquema, servicios remotos, variables ni dependencias.

Accesos de atención en Mis establecimientos (2026-11-16): se añadieron enlaces superiores a solicitudes de citas, agenda y chats, antes de las fichas extensas. El refresco se rotula Actualizar establecimientos para distinguir el registro/publicación de las citas. Pasaron los ocho E2E de directorio y presentación, incluida la comprobación de los tres destinos en el recorrido de registro/revisión. Tipos, lint y build correctos; se conservan permisos y RPC de destino, sin cambios remotos.

Visibilidad del envío de citas (2026-11-16): **27 E2E de solicitudes, disponibilidad/rutas y configuración de oferta aprobados**. Tres escenarios nuevos comprueban botón visible/deshabilitado antes de elegir intervalo, conservación de mascota al seleccionarlo y envío directo sin apartado; distinguen falta de asignación de una fecha sin cupos, sin permitir escrituras en ambos casos. Continúan pasando consumo de apartado, conflictos, respuesta perdida, virtual, decisiones, offline y permisos de equipo. Suite disponible: 94 E2E; no repetida completa en esta corrección. Captura a 320 px revisada, sin desbordamiento. Tipos, lint y build final correctos.

La comprobación remota fue solo de lectura: el establecimiento de la captura tenía un servicio y un profesional activos, sin recursos, asignaciones ni jornadas. No se crearon horarios, recursos ni citas reales para hacer desaparecer el bloqueo. La interfaz pública explica qué debe configurar el establecimiento y ofrece contacto; la gestión muestra la guía. Se conserva la validación transaccional de disponibilidad, ocupación e idempotencia, sin cambios de esquema/RPC.

Revisión previa a los commits: el primer recorrido completo terminó con 93 aprobados y un fallo en la comprobación del reintento de audio. El botón cambiaba a «Enviando archivo…», de modo que comprobar la ausencia de «Enviar archivo pendiente» permitía evaluar el contador antes de la segunda petición. La prueba ahora espera el aviso de envío confirmado antes de comprobar dos intentos, el mismo UUID y un único mensaje. Pasó tres repeticiones consecutivas, sin aumentar timeouts ni cambiar la aplicación.

La validación conjunta posterior aprobó **206 pruebas en 24 archivos y los 94 E2E completos con `CI=true`**, sin fallos ni pruebas recuperadas mediante reintento. Lint, tipos y compilación correctos. El build final se regenera con `.env.local` real tras Playwright y se restaura el preview en 4173; continúan los avisos conocidos de tamaño de chunks y Workbox. Los 56 archivos cambiados se revisaron frente a los secretos privados locales: sin coincidencias, con `.env.local` ignorado. Los commits conservan la identidad Git del usuario y no incluyen coautores.

## Chat desde una cita (2026-11-17)

Se añadió **Chat** a solicitudes, agenda y detalle, además del acceso a la bandeja. El centro puede iniciar la conversación del cliente de la cita; abrirla no envía mensajes ni marca lecturas. La RPC recibe solo la cita, deriva cliente/sede y requiere cliente propietario o acceso a pacientes y `messages` del mismo establecimiento. `can_chat` se deriva en servidor; una copia antigua sin el atributo no concede acceso.

Pasaron **217 pruebas en 24 archivos y 30 E2E de citas/mensajería**, con tres recorridos nuevos. Se verificaron apertura desde lista/agenda/detalle, reintento ante rechazo de permisos, ausencia del botón sin autorización y bloqueo offline. El recorrido del centro envía texto, fotografía y voz; el cliente abre la misma conversación desde el detalle y visualiza/reproduce los medios. Usa dos contextos de navegador, backend interceptado y grabación real de Chromium con dispositivo sintético. Captura a 320 px revisada sin desbordamiento. La suite disponible suma 97 E2E; no se repitió entera en esta entrega. Lint, tipos y build correctos.

`20261117210111_appointment_chat_entry.sql` se aplicó y alineó en desarrollo, total dieciocho migraciones. `supabase/tests/appointment_chat.sql` pasó con rollback tanto local como remotamente: cuenta correcta, unicidad/reutilización con ficha, mensaje de equipo, terceros denegados, agenda sin chat denegada, `messages` sin pacientes denegado, combinación permitida, revocación efectiva y seguimiento tras despublicar. Conteos antes/después: cinco usuarios, dos citas, cero conversaciones y cero mensajes; no se modificaron registros de personas ni se enviaron mensajes/correos reales. El endpoint también deniega la llamada anónima.

Asesores sin nuevos avisos: salud sin incidencias; permanecen dos informativos de [RLS sin políticas privadas](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [protección de contraseñas filtradas desactivada](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection), trece [índices sin uso](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index) y la advertencia histórica de [políticas permisivas múltiples](https://supabase.com/docs/guides/database/database-linter?lint=0006_multiple_permissive_policies). No se cambiaron Auth, Storage, secretos, Realtime ni LiveKit. Build real regenerado tras Playwright y preview restaurado en 4173.

## Citas y chat visibles para el dueño (2026-11-17)

La entrada `/citas` muestra **Citas pendientes y confirmadas** antes del formulario nuevo, con hasta tres próximas citas, sus datos y **Chat**. Usa `appointment_agenda` con ámbito propio y filtro remoto `upcoming`, sin pasar un propietario arbitrario ni filtrar una página de historial en el cliente. Con servicio en URL, el resumen empieza plegado y no consulta hasta abrirse. Las tarjetas se comparten con las listas/agendas, conservando permisos, detalle y chat. Los enlaces de cuenta/listado se denominan **Mis citas y solicitudes** y se ofrece **Mis chats con veterinarias**.

Pasaron **40 E2E de roles, citas y mensajería**, incluidos tres nuevos: dueño con pendiente/confirmada y acceso al chat para texto/foto/voz; vacío/error/offline diferenciados sin mostrar datos como actuales; reserva contextual con consulta propia solo al expandir. Capturas revisadas a 320 y 1280 px, sin desbordamiento. Tras agrupar los botones superiores y añadir el salto a **Solicitar una nueva cita**, se repitieron los tres recorridos nuevos: correctos. Suite disponible: 100 E2E; no se repitió completa en esta actualización. Lint, tipos y build real correctos. Sin nuevas migraciones ni operaciones remotas en este ajuste de interfaz; continúa la migración 18 de la entrega anterior.

## Burbujas y controles con iconos en el chat (2026-11-17)

Se adaptó la referencia visual manteniendo los tokens de marca: recibidos a la izquierda, enviados a la derecha, fecha/hora y recibo; barra compacta con texto e iconos accesibles de cámara, foto, micrófono y envío. Se mantienen compresión, vista previa, pendientes, envío explícito y lectura manual. El historial conserva secuencias ascendentes; scroll inicial al final, sin saltar ante mensajes entrantes mientras se lee arriba y con anclaje al cargar anteriores.

Pasaron **19 E2E de mensajería**. El escenario nuevo carga cincuenta mensajes, verifica alineación por posición real de las burbujas, añade uno entrante mientras se lee arriba y recupera los veinte anteriores sin duplicados ni alterar la secuencia. Se revisaron capturas a 320/390/1280 px sin desbordamiento horizontal. Siguen correctos cámara, foto comprimida, reproducción de voz, reintento tras respuesta perdida, cuentas separadas y recibos explícitos. La primera ejecución detectó dos etiquetas con acentos mal codificados; se corrigieron y se repitió la suite de mensajería completa. Suite disponible: 101 E2E; no se repitió entera en esta actualización. Tipos, lint y build real correctos; sin cambios de backend, migraciones, almacenamiento ni variables de entorno.

Validación conjunta previa a los commits (2026-11-17): **217 pruebas en 24 archivos y los 101 E2E completos con `CI=true` aprobados**, sin fallos ni reintentos. Lint, tipos y build final correctos; se conservan los avisos conocidos de tamaño de chunks y Workbox. Se revisaron los veintidós archivos cambiados frente a las credenciales privadas locales: sin coincidencias, con `.env.local` ignorado. Build real regenerado después de Playwright y preview restaurado en 4173. Commits separados por autorización de chat, integración de citas propias, presentación de conversación y documentación, con la identidad Git del usuario y sin coautores.

## Reproductor de notas de voz (2026-11-17)

Se reemplazó el control nativo visible, comprimido en las burbujas pequeñas, por reproducción/pausa, onda calculada localmente, progreso y búsqueda accesible. Comparte controles con las vistas previas y pendientes, conserva descarga privada explícita, colores y recibos. Solo pausa otras notas de voz; al salir retira la fuente y revoca la URL del blob.

Pasaron **21 E2E de mensajería**. Los dos nuevos verifican reproducción real WebM/Opus, Ogg/Opus y M4A/AAC, onda derivada de bytes, búsqueda por teclado, pausa, exclusión entre notas, fin/reinicio, fallo del análisis sin impedir reproducción, denegación de reproducción con reintento y liberación del audio/blob al salir. La primera ejecución del caso de liberación comprobaba el resultado antes de que terminara la navegación; se corrigió para esperar el destino/desmontaje y la suite pasó completa sin reintentos. Capturas revisadas a 320/390/1280 px, sin desbordamiento. Suite disponible: 103 E2E; no se repitió entera en este ajuste. Lint, tipos y build real correctos; preview restaurado en 4173 tras Playwright, con los avisos conocidos de tamaño de chunks y Workbox. La aceptación en teléfonos físicos sigue pendiente; no se modificó el backend ni se hicieron operaciones remotas.
