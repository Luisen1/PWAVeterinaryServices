# Registro y acceso

Implementación de HU01 y HU02 con Supabase Auth, React Hook Form y Zod.

- Registro con aviso de privacidad versionado y confirmación por correo.
- Inicio de sesión, refresco y validación de la sesión con `getUser`.
- Recuperación PKCE y cambio de contraseña con permiso temporal en la pestaña.
- Consulta del rol mediante RPC protegida por RLS.
- Cierre local con purga transaccional y descarte explícito de pendientes.

La comprobación de pendientes y su purga comparten una transacción. Una recarga o sesión vencida conserva los pendientes para que la cuenta pueda resolverlos al recuperar el acceso. El cierre explícito elimina los datos de esa cuenta.

Los enlaces de correo se abren en el mismo navegador que inició el flujo. Las pruebas e2e usan respuestas controladas y no envían correos. Los pasos de configuración y la evidencia están en `docs/autenticacion.md`.
