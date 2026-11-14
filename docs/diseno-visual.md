# Diseño visual de HU01 a HU06

Fecha: 2026-11-14, America/Bogota. Trabajo realizado en `Luise-Dev`, creada desde `main` antes de modificar archivos.

## Referencias y alcance

Se revisaron los prototipos de `Prototipos_Servicios_Veterinarios_Usuarios_y_Establecimientos.docx.pdf` y la imagen `Guía visual veterinaria en azul y verde.png`, proporcionados por el responsable del proyecto. El alcance acordado comprende las funciones existentes hasta HU06. Las pantallas futuras de citas, chat y videollamada conservan su planificación por historias; el rediseño no declara implementados sus servicios.

La interfaz adapta los patrones de las referencias a una web responsive: no reproduce el marco del teléfono, la barra del sistema ni los datos de ejemplo de los prototipos. Conserva los campos que actualmente se guardan y validan. No añade datos de mascotas, proveedores de acceso o textos legales sin soporte funcional.

## Identidad y fundamentos

| Uso                          | Color                 |
| ---------------------------- | --------------------- |
| Texto principal y estructura | Azul marino `#0B1F4B` |
| Acentos e indicadores        | Turquesa `#00BFA6`    |
| Énfasis positivo             | Verde `#15A34A`       |
| Superficies de apoyo         | Verde claro `#D1F7EF` |
| Fondo neutro                 | Gris claro `#F3F5F7`  |
| Fondo principal              | Blanco `#FFFFFF`      |

Poppins se sirve desde el propio build, con pesos 400, 500, 600 y 700. Se mantienen títulos de aproximadamente 24–28 px y texto de contenido entre 12 y 16 px según la jerarquía y el espacio disponible.

Los enlaces usan un turquesa más oscuro (`#007464`) y los botones principales un degradado oscuro (`#008572` → `#12813E`) para mantener contraste de texto normal. El contraste calculado de texto blanco sobre los extremos del botón es 4,57:1 y 4,96:1. El texto turquesa oscuro sobre la superficie de apoyo alcanza 4,96:1. Los acentos conservan los colores originales de la guía.

El emblema utilizado es `src/assets/brand/Emblema-de-corazón-con-perro-y-gato.svg`. Su geometría original no se modifica: la cabecera lo presenta en azul marino mediante una máscara CSS y un nombre de marca en texto. Los cinco PNG de instalación se generan de forma reproducible desde el mismo SVG, con fondo opaco y una composición reducida para los iconos maskable. Se eliminó la huella provisional de la identidad de la aplicación. La huella de la iconografía funcional identifica mascotas; no sustituye al emblema.

## Componentes y pantallas

- Cabecera de marca, navegación superior de escritorio y barra inferior móvil con estado activo en verde claro. Las pantallas de autenticación no muestran navegación inferior.
- Inicio con accesos reales a directorio, cuenta y establecimientos.
- Acceso, registro y recuperación con iconos, campos unificados y control accesible para mostrar u ocultar contraseñas. En escritorio se usa una composición de dos columnas; en móvil, una columna.
- Perfil con resumen de cuenta y grupos de accesos. Los nombres y datos mostrados proceden de la cuenta, no del contenido de ejemplo de los prototipos.
- Perfil y mascotas con tarjetas, estados vacíos, edición, eliminación confirmada y formularios conectados al guardado existente.
- Directorio con tarjetas, búsqueda local por nombre o dirección y selección de categoría sobre las publicaciones cargadas. Esto no sustituye la futura búsqueda geográfica, el mapa o la paginación del servidor.
- Ficha con contacto, ubicación, horarios, excepciones, pagos y fotografías reales cuando existen. Un icono de establecimiento identifica la ausencia de logo propio.
- Registro y edición de establecimiento en cuatro pasos: Datos, Ubicación, Contacto y Revisión. Cada paso valida sus campos; Anterior conserva lo escrito. Cambiar la dirección o coordenadas vuelve a exigir la confirmación de ubicación. Solo el último paso envía la solicitud.
- Paneles de oferentes y revisión administrativa mantienen el acceso por rol, los motivos de decisión y la conservación de la publicación anterior mientras se revisan cambios.

Los controles compartidos están en `src/components/ui`, las clases de diseño en `src/styles/index.css` y la generación de iconos en `scripts/generate-icons.mjs`. El `manifest` y el color de navegador se actualizaron a la nueva identidad.

## Verificación

```sh
npm run lint
npm test
npm run test:e2e
npm run build
```

La suite conserva las comprobaciones de Auth, permisos SQL, guardado de mascotas, publicación y PWA. `tests/e2e/visual.spec.ts` añade recorridos de contraseña visible, navegación responsive, búsqueda y registro por pasos. Las capturas de revisión se generan bajo `test-results/` con anchos de 320, 360 y 1280 px. Los datos de estas capturas son fixtures y no se incluyen como establecimientos reales en producción.

La verificación del rediseño terminó con lint correcto, 40 pruebas unitarias y SQL aprobadas y 20 pruebas E2E aprobadas. Se revisaron capturas de acceso, perfil y directorio, además de las comprobaciones automáticas de ancho y navegación. El registro por pasos se comprobó con y sin logo, con retorno a pasos anteriores y con nueva confirmación al cambiar la ubicación.

Después de las pruebas de navegador debe regenerarse el build con las variables reales de `.env.local`, porque Playwright usa un backend interceptado. Los pendientes de aceptación de correo, SMTP y archivos por Storage siguen documentados en `hu01-hu06.md`.
