# Verificación de la base técnica

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

- No se publicaron recursos remotos ni se aplicó la migración SQL a un proyecto Supabase.
- Falta la comprobación de instalación real y modo avión en Android e iPhone, y las cabeceras del hosting HTTPS definitivo.
- El lockfile contiene dependencias transitivas preliminares heredadas de las herramientas estables. Se detallan en `decisiones.md`.
- Quedan 12 avisos de seguridad en herramientas de desarrollo y una advertencia de deprecación del bundler en Workbox. La auditoría de dependencias de producción está limpia.
- Las siguientes fases están enumeradas en README y en los README de cada dominio.
