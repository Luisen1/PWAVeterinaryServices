# HU01 y HU02

Fecha de implementación 2026-11-14, America/Bogota.

## Alcance implementado

| Historia | Implementación                                                                                                                                                                                           |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HU01     | Registro por correo y contraseña, validación, aviso de privacidad versionado, confirmación y reenvío. La respuesta contempla cuentas existentes sin confirmar públicamente si un correo está registrado. |
| HU02     | Acceso, sesión persistente, validación remota, recuperación PKCE, control de enlaces inválidos o reutilizados y cierre local con purga y decisión sobre pendientes.                                      |

Los formularios usan validación en español. El registro y los cambios de contraseña admiten entre 8 y 72 caracteres. Las operaciones de autenticación bloquean la recarga de actualización mientras están en curso. Las peticiones y los formularios muestran errores de conexión y rechazos del servidor.

## Actualización de HU03-HU06

Las cuatro migraciones ya están aplicadas en `veterinary-services-dev`. Se añadieron perfil y mascotas, oferentes, revisión y fichas, además de sincronización acotada de perfil y mascotas antes del cierre. La guía vigente de uso y aceptación está en [HU01-HU06](hu01-hu06.md). Las pruebas con correos reales y la configuración administrativa de Auth siguen pendientes.

## Configuración de Supabase

1. Seleccionar el proyecto de desarrollo correspondiente a la URL de `.env.local`.
2. Aplicar las cuatro migraciones de `supabase/migrations`, en orden, sobre un proyecto nuevo. En el proyecto de desarrollo ya están aplicadas y su historial está alineado con los archivos locales; no volver a ejecutarlas. La conexión de administración de Supabase permite aplicarlas como migraciones. Como alternativa, ejecutar cada archivo completo desde SQL Editor una vez, verificando que termine sin errores. Registrar esa aplicación antes de adoptar un historial de migraciones por CLI.
3. En Authentication, habilitar el proveedor Email y mantener Confirm email activado. El proyecto ya informó registro habilitado y confirmación obligatoria durante la comprobación inicial.
4. Configurar una longitud mínima de contraseña de 8 caracteres en las opciones de autenticación.
5. En Authentication > URL Configuration, usar `http://localhost:5173` como Site URL durante desarrollo. Autorizar las URL completas de ambos puertos con `?tipo=signup` y `?tipo=recovery` como Redirect URLs (véase `hu01-hu06.md`). Autorizar también las URL completas de retorno del origen HTTPS de prueba cuando exista.
6. Configurar SMTP para registrar y recuperar cuentas con correos externos al equipo del proyecto. El SMTP predeterminado limita los destinatarios al equipo y aplica límites de envío.
7. Verificar las plantillas de confirmación y recuperación. Las plantillas predeterminadas con `ConfirmationURL` admiten el flujo PKCE solicitado por el cliente.

Las credenciales administrativas y de SMTP se configuran en Supabase. `.env.local` contiene únicamente la URL y clave pública de la aplicación y está excluido de Git.

La documentación oficial describe [las URL de retorno](https://supabase.com/docs/guides/auth/redirect-urls), [la autenticación por contraseña](https://supabase.com/docs/guides/auth/passwords) y [el servicio SMTP](https://supabase.com/docs/guides/auth/auth-smtp).

## Esquema y permisos

- `public.profiles` tiene identidad, nombre de visualización, teléfono opcional y fechas. La cuenta puede leer su perfil y actualizar solo su nombre y teléfono cuando su correo está confirmado. La edición de perfil está disponible en `/perfil` desde HU03.
- `public.privacy_consents` conserva usuario, versión y fecha del servidor. La cuenta confirmada puede leer su aceptación. El cliente carece de permisos para modificarla.
- `private.account_roles` conserva el rol, asignado inicialmente a `user` por un trigger. Los metadatos enviados por el navegador no asignan permisos. La asignación de oferente o administrador requiere una operación administrativa posterior.
- `public.current_account_role()` devuelve únicamente el rol del usuario confirmado que hace la petición.
- `private.is_verified_user()` comprueba la confirmación contra `auth.users`, de modo que un dato editable del navegador no habilita el acceso.

El registro exige la aceptación de la versión vigente mediante el trigger de Auth. La creación del usuario, perfil, rol y consentimiento pertenece a la transacción de registro. Las cuentas existentes reciben perfil y rol básico, sin inventar una aceptación previa.

## Sesión y recuperación

El cliente usa `persistSession`, refresco automático y `flowType: 'pkce'`. La página `/auth/confirmar` canjea el código una vez. El enlace debe abrirse en el mismo navegador que conserva el verificador PKCE. Un enlace inválido conduce a un mensaje en español y su código se elimina de la URL.

El formulario `/restablecer-clave` exige una sesión validada y la marca temporal creada por el callback de recuperación. La marca se guarda solo en esa pestaña, vence como máximo a los 15 minutos o al vencimiento de la sesión y se elimina al cambiar la contraseña, iniciar sesión o cerrar sesión. Supabase valida el código y la operación de cambio de contraseña en el servidor.

La política de referrer del documento y del hosting es `strict-origin-when-cross-origin`. Las solicitudes a otros orígenes comparten únicamente el origen de la aplicación, sin ruta, parámetros ni códigos de acceso/recuperación. El script de Google Maps usa esa misma política explícitamente. El SW conserva únicamente recursos del shell y no cachea respuestas de autenticación ni datos privados.

El cierre de sesión cancela consultas, comprueba pendientes y purga los datos privados de la cuenta en una transacción. Cuando hay pendientes, la interfaz permite sincronizar los cambios de perfil y mascotas, conservar la sesión o descartarlos expresamente. Los dominios futuros, borradores y adjuntos sin manejador permanecen pendientes para una fase posterior. El cierre utiliza el alcance local del SDK y conserva los catálogos públicos. La sesión se actualiza en otras pestañas mediante los eventos del SDK.

## Aviso de privacidad

La ruta `/privacidad` contiene un aviso del entorno académico de desarrollo y su versión se registra al crear la cuenta. La identificación del responsable, el correo de contacto y los plazos de conservación siguen pendientes de definición por el responsable del proyecto antes de la publicación para uso general.

## Pruebas y evidencia

`npm test` ejecuta validaciones, purga, vencimiento del permiso de recuperación y nueve casos del SQL de identidad en PostgreSQL embebido mediante PGlite. Comprueba lectura y edición propias, denegación entre cuentas, bloqueo sin correo confirmado, protección de roles, registros de aceptación y migración de cuentas previas.

`npm run test:e2e` usa las pantallas reales y el SDK con peticiones de autenticación interceptadas para disponer de una prueba repetible sin correos reales. Comprueba registro, desafío PKCE, errores, reenvío, recuperación, reutilización del enlace, persistencia al recargar, cierre entre pestañas, descarte de pendientes y modo offline. Las seis pruebas PWA también se mantienen.

Las variables de backend de prueba se aplican únicamente al build iniciado por Playwright. Al terminar, ejecutar `npm run build` para generar un artefacto con las variables del entorno previsto.

La aceptación remota requiere aplicar las migraciones, configurar URL y correo, registrar una cuenta de prueba autorizada, recibir y abrir los enlaces, recuperar la contraseña y verificar los permisos con dos cuentas distintas en el proyecto Supabase.
