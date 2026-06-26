# Stock Clean It · inventario por servicio

Web app responsive para controlar el stock de insumos por consorcio o servicio, desarrollada con HTML, CSS, JavaScript, Bootstrap y Supabase.

## Incluye esta versión

- Acceso público sin usuario ni contraseña para operarios.
- El operario selecciona el servicio, escribe su nombre y continúa.
- Selector público con únicamente el nombre del servicio.
- Descripción y frecuencia visible después de seleccionar el servicio.
- 64 servicios de Clean It precargados.
- Visibilidad individual de insumos por servicio.
- Carga rápida de insumos no listados.
- Cantidades enteras para insumos comunes.
- Cantidades fraccionables con accesos rápidos `0`, `¼`, `½`, `¾` y `1` para bidones.
- Control de estado para elementos reutilizables: **Buen estado**, **Usado** o **Para reemplazar**.
- Los elementos marcados como **Para reemplazar** se consideran críticos aunque la cantidad sea alta.
- Exportación Excel de uno, varios o todos los servicios.
- Vista previa administrativa antes de descargar.
- Excel con dos hojas: matriz **Stock por servicio** y listado **Detalle**.
- Inventario en vivo, alertas, historial y Supabase Realtime.
- Políticas RLS y funciones RPC para mantener controlado el acceso público.

## Actualizar una instalación existente

1. Abrir **Supabase → SQL Editor**.
2. Ejecutar `actualizar-fracciones-estados-exportacion.sql`.
3. Reemplazar los archivos del repositorio de GitHub por los incluidos en este paquete.
4. Publicar nuevamente GitHub Pages.

La migración conserva servicios, cantidades, usuarios, imágenes, configuraciones de visibilidad e historial existentes.

Para una instalación nueva, ejecutar directamente `supabase-schema.sql`.

## Tipos de control por insumo

En la app:

**Administración → Insumos → Editar**

Cada insumo puede configurarse como:

- **Cantidad entera:** escobas, guantes, bolsas, pulverizadores, etc.
- **Cantidad fraccionable:** bidones u otros consumibles que pueden quedar a ¼, ½ o ¾.
- **Cantidad + estado:** trapos, rejillas, microfibras y otros elementos reutilizables.

La migración configura inicialmente como fraccionables los principales bidones y como “cantidad + estado” los paños y fibras más habituales. Después puede modificarse cualquier insumo desde Administración.

## Exportar inventario

En la app:

**Administración → Exportar stock**

1. Seleccionar uno, varios o todos los servicios.
2. Presionar **Ver lista** para revisar los datos.
3. Presionar **Descargar Excel**.

El archivo incluye:

- **Stock por servicio:** una fila por servicio y una columna por insumo.
- **Detalle:** una fila por cada combinación de servicio e insumo, con cantidad, unidad, estado del elemento, estado de stock y fecha de actualización.

Los insumos ocultos para un servicio no se incluyen en su exportación. Los faltantes de relevamiento aparecen como **Sin informar**, diferenciados de una cantidad informada en cero.

## Visibilidad de insumos por servicio

En la app:

**Administración → Inventario → seleccionar servicio**

Cada tarjeta incluye el botón **Ocultar en este servicio** o **Habilitar en este servicio**. La configuración afecta únicamente al servicio seleccionado.

Los insumos ocultos:

- No aparecen en la vista pública.
- No se contabilizan como pendientes, críticos o bajos.
- Siguen disponibles en Administración para volver a habilitarlos.
- Conservan el stock y el historial previamente registrado.

## Instalación nueva

1. Crear un proyecto en Supabase.
2. Ejecutar `supabase-schema.sql` en **SQL Editor**.
3. Crear un usuario en **Authentication → Users**.
4. Promoverlo a administrador:

```sql
update public.profiles
set role = 'admin', full_name = 'Administrador Clean It'
where email = 'TU-CORREO@DOMINIO.COM';
```

5. Editar `config.js` con la URL y la clave pública `anon` del proyecto.
6. Subir todos los archivos a GitHub y activar GitHub Pages.

## Archivos principales

- `index.html`: interfaz pública y administrativa.
- `styles.css`: diseño responsive.
- `app.js`: lógica de inventario, estados y exportación.
- `config.js`: conexión con Supabase.
- `supabase-schema.sql`: instalación completa.
- `actualizar-fracciones-estados-exportacion.sql`: migración puntual para esta versión.
- `actualizar-servicios.sql`: actualización masiva de servicios y frecuencias.
- `actualizar-visibilidad-insumos.sql`: migración de visibilidad por servicio.
- `servicios-precargados.json`: respaldo de servicios y frecuencias.
- `seed-materials.json`: catálogo inicial y tipos de control.

## Seguridad

La carga pública utiliza funciones RPC `security definer`. Los operarios pueden consultar servicios activos y actualizar el inventario del servicio elegido, pero no pueden acceder a perfiles, historial administrativo ni observaciones internas.
