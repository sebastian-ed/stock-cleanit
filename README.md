# Stock Clean It

Web app responsive para controlar el stock de insumos por consorcio o servicio, con HTML, CSS, JavaScript, Bootstrap y Supabase.

## Incluye

- Vista operario limitada al servicio asignado.
- Catálogo visual con búsqueda, categorías y carga rápida de cantidades.
- Estados **Crítico**, **Bajo**, **Correcto** y **Sin informar**.
- Panel administrador con KPIs, alertas y estado por servicio.
- Administración de servicios, insumos, fotos, usuarios y roles.
- Historial de cambios y actualización en vivo con Supabase Realtime.
- Políticas RLS para impedir que un operario vea o modifique otros servicios.
- Catálogo inicial con 35 insumos de Clean It.

## Puesta en marcha

### 1. Supabase

1. Crear un proyecto en Supabase.
2. Abrir **SQL Editor**.
3. Ejecutar todo `supabase-schema.sql`.
4. Crear el primer usuario en **Authentication → Users**.
5. Ejecutar:

```sql
update public.profiles
set role = 'admin', full_name = 'Administrador Clean It'
where email = 'TU-CORREO@DOMINIO.COM';
```

### 2. Configuración

Editar `config.js`:

```javascript
SUPABASE_URL: "https://TU-PROYECTO.supabase.co",
SUPABASE_ANON_KEY: "TU-ANON-KEY"
```

Usar solamente la clave pública `anon`. No colocar la clave `service_role` en GitHub.

### 3. Usuarios operarios

1. Crear cada usuario desde **Supabase → Authentication → Users**.
2. Ingresar a la web como administrador.
3. Abrir **Usuarios**.
4. Asignar cada operario a un servicio.

### 4. GitHub Pages

1. Subir todos los archivos a la raíz de un repositorio.
2. Ir a **Settings → Pages**.
3. Seleccionar `Deploy from a branch`, rama `main`, carpeta `/root`.

No requiere compilación.

## Gestión del dato

La app diferencia cantidad cero de ausencia de relevamiento. Un material sin registro aparece como **Sin informar**, no como faltante. Esto evita pedidos innecesarios por datos incompletos.

Las imágenes SVG incluidas son ilustrativas y sirven para el arranque. Desde la vista administrador pueden reemplazarse por fotografías reales de cada producto, almacenadas en Supabase Storage.
