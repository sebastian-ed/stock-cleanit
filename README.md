# Stock Clean It · stock y visibilidad por servicio

Web app responsive para controlar el stock de insumos por consorcio o servicio, desarrollada con HTML, CSS, JavaScript, Bootstrap y Supabase.

## Incluye esta versión

- Acceso público sin usuario ni contraseña para operarios.
- La aplicación siempre abre en la vista pública, aunque exista una sesión administrativa guardada.
- El operario sólo selecciona el servicio, escribe su nombre y continúa.
- Selector con **sólo el nombre del servicio**.
- Visibilidad individual de insumos por servicio: todos aparecen por defecto y Administración puede ocultarlos o habilitarlos.
- Descripción y frecuencia visible después de seleccionar el servicio.
- Edición de nombre, dirección, descripción/frecuencia, observaciones y estado desde Administración.
- 64 servicios de Clean It precargados desde el archivo operativo del 23/06/2026.
- Carga rápida de insumos no listados.
- Inventario en vivo, alertas, historial y Supabase Realtime.
- 35 insumos iniciales de Clean It.
- Políticas RLS y funciones RPC: el acceso anónimo no abre las tablas completas.

## Actualizar la instalación existente

Para agregar únicamente la nueva función de visibilidad sin tocar servicios ni inventarios:

1. Abrir **Supabase → SQL Editor**.
2. Ejecutar `actualizar-visibilidad-insumos.sql`.
3. Reemplazar los archivos de GitHub por los de este paquete.

Para una instalación nueva, ejecutar directamente `supabase-schema.sql`. El archivo `actualizar-servicios.sql` sigue disponible para cargar o actualizar los 64 servicios, sus direcciones y frecuencias.

La lista de respaldo también está disponible en `servicios-precargados.json`.

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

## Visibilidad de insumos por servicio

En la app:

**Administración → Inventario → seleccionar servicio**

Cada tarjeta del catálogo incluye el botón **Ocultar en este servicio** o **Habilitar en este servicio**. La configuración afecta sólo al servicio seleccionado. Si no existe una configuración específica, el insumo se considera visible.

Los insumos ocultos:

- No aparecen en la vista pública del operario.
- No se contabilizan como pendientes, críticos o bajos para ese servicio.
- Siguen disponibles en Administración para volver a habilitarlos.
- No eliminan el stock ni el historial previamente registrado.

## Edición de frecuencias

En la app:

**Administración → Servicios → lápiz**

El campo **Descripción o frecuencia** se muestra al operario únicamente después de elegir el servicio. En el selector se mantiene solamente el nombre para que la búsqueda sea rápida.

## Archivos principales

- `index.html`: interfaz.
- `styles.css`: diseño.
- `app.js`: lógica pública y administrativa.
- `config.js`: conexión con Supabase.
- `supabase-schema.sql`: estructura completa y carga segura inicial.
- `actualizar-servicios.sql`: actualización masiva de servicios y frecuencias.
- `actualizar-visibilidad-insumos.sql`: migración puntual para habilitar la configuración por servicio.
- `servicios-precargados.json`: respaldo legible de los servicios y frecuencias.
- `seed-materials.json`: catálogo inicial de insumos.

## Seguridad

La carga pública utiliza funciones RPC `security definer`. Los operarios pueden consultar servicios activos y actualizar inventarios, pero no pueden consultar perfiles, historial administrativo ni notas internas.
