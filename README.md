# Stock Clean It · versión pública

Web app responsive para controlar el stock de insumos por consorcio o servicio, desarrollada con HTML, CSS, JavaScript, Bootstrap y Supabase.

## Cambios de esta versión

- Los operarios ingresan **sin usuario ni contraseña**.
- Seleccionan entre los servicios activos cargados por administración.
- Pueden informar su nombre para dejar trazabilidad en el historial.
- Cargan cantidades mediante tarjetas visuales, búsqueda, categorías y botones `+` / `−`.
- Pueden agregar rápidamente un **insumo no listado**, indicando nombre, cantidad, unidad y detalle.
- Los insumos no listados quedan asociados sólo al servicio correspondiente. No contaminan el catálogo maestro.
- Administración continúa protegida mediante correo y contraseña.
- El panel administrador recibe los cambios mediante Supabase Realtime.

## Funcionalidades

- Estados **Crítico**, **Bajo**, **Correcto** y **Sin informar**.
- Panel general con alertas y relevamientos vencidos.
- Inventario detallado por servicio.
- Administración de servicios, catálogo, imágenes, usuarios y umbrales.
- Historial unificado de insumos del catálogo e insumos adicionales.
- 35 insumos iniciales de Clean It.
- Políticas RLS y funciones RPC para evitar acceso anónimo directo a las tablas.

## Instalación nueva

### 1. Crear el proyecto Supabase

1. Crear un proyecto en Supabase.
2. Abrir **SQL Editor**.
3. Ejecutar todo el archivo `supabase-schema.sql`.
4. Crear el usuario administrador en **Authentication → Users**.
5. Promoverlo ejecutando:

```sql
update public.profiles
set role = 'admin', full_name = 'Administrador Clean It'
where email = 'TU-CORREO@DOMINIO.COM';
```

### 2. Actualizar una instalación anterior

Ejecutar nuevamente el archivo completo `supabase-schema.sql` en **SQL Editor**. El script es idempotente: conserva los servicios, usuarios, cantidades e historial existentes, y agrega las tablas y funciones de acceso público.

### 3. Configurar la web

Editar `config.js`:

```javascript
window.APP_CONFIG = {
  APP_NAME: "Stock Clean It",
  SUPABASE_URL: "https://TU-PROYECTO.supabase.co",
  SUPABASE_ANON_KEY: "TU-ANON-KEY",
  STOCK_STALE_DAYS: 7,
  MATERIAL_IMAGE_BUCKET: "material-images"
};
```

Usar únicamente la clave pública `anon`. Nunca colocar la clave `service_role` en GitHub.

### 4. Publicar en GitHub Pages

1. Subir el contenido de la carpeta a la raíz del repositorio.
2. Ir a **Settings → Pages**.
3. Seleccionar `Deploy from a branch`.
4. Elegir la rama `main` y la carpeta `/root`.

No requiere compilación.

## Cómo se usa

### Operario

1. Abre la URL pública.
2. Selecciona el servicio.
3. Escribe su nombre, recomendado para la trazabilidad.
4. Informa el stock real.
5. Si falta un producto, utiliza **Agregar insumo no listado**.
6. Presiona **Guardar relevamiento completo**.

### Administrador

1. Presiona **Ingresar como administrador**.
2. Inicia sesión.
3. Consulta alertas, inventarios e historial.
4. Los insumos agregados por operarios aparecen como **No listado** dentro del servicio.
5. Puede desactivar un adicional que ya no corresponda o crear una versión formal dentro del catálogo maestro.

## Criterio de datos

La aplicación diferencia cantidad cero de ausencia de relevamiento. Un insumo del catálogo sin registro aparece como **Sin informar**, no como faltante. Cuando el operario guarda el relevamiento completo, los productos no modificados y nunca informados se registran con cantidad cero.

## Consideración de seguridad

Eliminar el login operativo reduce fricción, pero también implica que cualquier persona con acceso a la URL puede seleccionar un servicio y enviar cantidades. La implementación limita el alcance mediante funciones RPC, validación de datos y RLS; aun así, no verifica la identidad del operario. Para una fase posterior conviene agregar un PIN corto por servicio o enlaces individuales con token.
