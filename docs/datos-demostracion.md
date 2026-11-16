# Datos de demostración en Tunja

El archivo [supabase/seed.sql](../supabase/seed.sql) crea **6 establecimientos aprobados, 7 sedes, 9 servicios activos y 1 desactivado**. Incluye 9 profesionales ficticios, 9 recursos, 9 asignaciones, 63 jornadas y un bloqueo: 101 registros de oferta en total.

Todos los nombres llevan `[DEMO]` o `DEMO`. Las coordenadas son puntos de prueba en Tunja, Boyacá: **no identifican negocios veterinarios reales**. Las direcciones son descriptivas, los teléfonos `0000000000` no son contactos reales y los correos terminan en `example.invalid`. Los precios son ficticios. No usar estos datos para buscar atención real.

## Carga y repetición

Ya se cargó y se repitió correctamente en **`veterinary-services-dev`**, referencia `osoljaiqizmcxxlirrwo`, el 2026-11-15, fecha local de Colombia. No hace falta volver a ejecutarlo para ver las sedes.

Para otra base **de desarrollo**:

1. Aplicar las once [migraciones](../supabase/migrations/README.md) en orden.
2. Abrir el **SQL Editor** del proyecto de desarrollo en Supabase y comprobar el nombre del proyecto seleccionado.
3. Copiar y ejecutar completo `supabase/seed.sql` con el acceso de operador `postgres`. No requiere claves privadas en la aplicación, cambios de `.env.local` ni un proveedor adicional de mapas.
4. Abrir `/explorar`, quitar búsquedas/filtros previos y pulsar **Actualizar establecimientos**. Deben aparecer siete sedes; los pines cercanos pueden estar agrupados.

Es un seeder de datos separado de las migraciones. No se incorpora a producción por aplicar migraciones. El nombre estándar `supabase/seed.sql` permite usarlo en un entorno local de Supabase que tenga habilitada la carga de semillas; este repositorio no configura ni reinicia ese entorno automáticamente. Ver [documentación de seeding de Supabase](https://supabase.com/docs/guides/local-development/seeding-your-database).

## Escenarios disponibles

Los horarios siguientes están en `America/Bogota` y se repiten todos los días. La sede y la jornada profesional son conceptos distintos.

| Establecimiento / sede                  | Servicios y filtros                                           | Horario de sede / profesional                    |
| --------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------ |
| Huellitas Tunja / Centro                | Consulta general presencial y orientación virtual; perro/gato | 08:00–18:00                                      |
| Huellitas Tunja / Norte                 | Vacunación presencial y consulta a domicilio; perro/gato      | 08:00–18:00                                      |
| Clínica Vida Animal / Universitaria 24h | Urgencias declaradas, presencial; perro/gato                  | Sede 24h; profesional 08:00–20:00                |
| Hospital Nocturno / Sur                 | Urgencias declaradas; perro/gato/conejo                       | 20:00–06:00 del día siguiente                    |
| Peludos y Cuidados / Occidente          | Baño y peluquería; perro                                      | 09:00–18:00                                      |
| Nutrición Mascotas / Oriente            | Orientación nutricional presencial, precio cero; perro/gato   | 10:00–19:00                                      |
| Aves y Conejos / Norte                  | Ave/conejo/otro; precio y urgencias sin declarar              | Horario sin informar; sin intervalos reservables |

El Centro también tiene un **Servicio desactivado DEMO**, que no debe aparecer en la oferta pública activa ni permitir consultar disponibilidad.

La primera carga guarda una fecha base en la cuenta técnica, y las siguientes ejecuciones la conservan:

- **Fecha base + 2 días:** consulta general del Centro bloqueada entre 09:00 y 10:00. El resto del horario sigue disponible.
- **Fecha base + 3 días:** cierre excepcional completo de la sede Norte.
- En la carga realizada: bloqueo **2026-11-17** y cierre **2026-11-18**. Para una fecha normal, probar **2026-11-22**. La consulta pública solo admite fechas futuras dentro de su ventana de 180 días.

Estos dos escenarios excepcionales son fechas fijas del fixture; no avanzan al repetirlo. Las jornadas semanales continúan funcionando después. No se generan citas confirmadas ni apartados permanentes.

## Recorrido de comprobación

1. En **Explorar**, comprobar siete sedes entre mapa y lista. Probar categorías, búsquedas por nombre de servicio, especie, modalidad, urgencias, domicilio y abierto ahora. Sin ubicación elegida, no se inventan distancias desde tu casa.
2. Seleccionar un pin y abrir su ficha. Verificar la sede, los servicios y el horario. El negocio 24h puede estar abierto sin tener intervalos profesionales disponibles a esa hora.
3. En **Cómo llegar**, elegir tu punto de partida y calcular la ruta o abrir la navegación externa. El seeder proporciona destinos; el cálculo interno sigue requiriendo la configuración Google de [HU17](hu17-hu18.md). No se hacen llamadas de pago a Google al ejecutar el SQL.
4. En **Citas**, elegir Centro / Consulta general y una fecha futura normal: deben aparecer veinte intervalos de treinta minutos entre 08:00 y 18:00. En la fecha del bloqueo aparecen dieciocho. En Norte, el día del cierre no debe haber intervalos.
5. Con **tu propia cuenta confirmada**, elegir un intervalo, apartarlo y liberarlo. En otra sesión, actualizar y comprobar que el apartado activo oculta ese intervalo. Un apartado dura cinco minutos y no equivale a una solicitud de cita.
6. Guardar un favorito y una nota con tu cuenta y comprobar su recuperación offline. Las cuentas del fixture no incluyen credenciales de acceso.
7. Con HU19-HU21 se puede elegir mascota y enviar una solicitud presencial/virtual desde un intervalo. Un oferente debe confirmarla o rechazarla; el apartado por sí solo no la crea. Las cuentas técnicas DEMO no tienen acceso de inicio de sesión: para probar la decisión, usar un establecimiento propio aprobado o una invitación `schedule` aceptada. Ver [recorrido completo](hu19-hu21.md).

Enlace directo a un ejemplo de disponibilidad (cambiar la fecha cuando corresponda):

```text
http://localhost:4173/citas?establecimiento=de171000-0000-4000-8000-000000000001&sede=de172000-0000-4000-8000-000000000001&servicio=de173000-0000-4000-8000-000000000001&fecha=2026-11-22
```

## Garantías y límites del seeder

- Una sentencia `DO` atómica y un bloqueo de ejecución impiden cargas parciales o duplicadas entre dos operadores.
- UUID estables con prefijo `de17`; repetir conserva documentos, revisiones, fechas de publicación y decisiones.
- Valida establecimientos con la función del dominio; las aprobaciones y la oferta usan las RPC existentes. No cambia esquema, RLS, permisos públicos ni migraciones.
- Crea dos cuentas técnicas ficticias sin contraseña ni identidades OAuth. El responsable termina como `provider` y el revisor como `user`; el privilegio de revisión solo existe dentro de la transacción y no deja un administrador nuevo. No envía correos.
- Si un identificador/correo está ocupado por otra cuenta o un documento DEMO fue modificado, aborta sin sobrescribirlo. Revisar el conflicto; no borrar cuentas o datos reales para forzar la ejecución.
- No borra establecimientos ajenos, mascotas, favoritos, notas, citas ni apartados. No hay limpieza automática destructiva ni restablecimiento de la base.

La prueba `tests/database/seed.test.ts` ejecuta las migraciones y el archivo real en PostgreSQL embebido, valida compatibilidad con los esquemas del frontend, repetición, colisiones/rollback, conservación de datos ajenos, acceso de operador, horarios públicos y toma/liberación de un apartado.

```sh
npx vitest run tests/database/seed.test.ts
```
