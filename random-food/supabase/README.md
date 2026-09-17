# Supabase · puesta en marcha

Pasos para dejar la base de datos lista. Se hacen una sola vez.

## 1. Crear el proyecto

En [supabase.com](https://supabase.com) → **New project**. Pide nombre, una contraseña para la base
de datos y región (elige la más cercana). Tarda un par de minutos en aprovisionar.

El plan gratuito da 500 MB y **pausa el proyecto tras una semana sin actividad** — se reactiva con
un clic desde el panel.

## 2. Ejecutar las migraciones

En el **SQL Editor**, pegar y ejecutar **en este orden**:

1. `migraciones/0001_esquema.sql` — tipos, tablas, índices y disparadores
2. `migraciones/0002_seguridad.sql` — funciones, RLS y políticas

El orden importa: la segunda da por hechas las tablas de la primera.

## 3. Copiar las credenciales

En **Project Settings → API**, copiar:

- **Project URL** → `supabaseUrl`
- **anon public** → `supabaseAnonKey`

Y pegarlas en [`src/environments/environment.ts`](../src/environments/environment.ts).

La `anon key` acaba dentro del paquete que descarga el navegador: es pública por diseño, y lo que
protege los datos es RLS. La **`service_role` key no se usa en este proyecto** — se salta RLS
entera.

## 4. Crear tu hogar

Todo cuelga de un hogar, así que hace falta uno antes de poder guardar nada. Con un usuario ya
registrado, desde la app:

```ts
const { data, error } = await db.rpc('crear_hogar', { _nombre: 'Casa' });
```

Devuelve el hogar con su `codigo_invitacion`. Quien quiera entrar, lo canjea:

```ts
const { data, error } = await db.rpc('unirse_a_hogar', { _codigo: 'A3F9C1' });
```

---

## Comprobar que la seguridad funciona

Esto es lo que de verdad hay que verificar, porque todo lo demás se construye encima.

### Revisión rápida

- **Table Editor** → las siete tablas con el escudo verde de *RLS enabled*.
- **Advisors → Security** → cero avisos de `RLS disabled` o `policy allows public access`.

### Prueba de aislamiento

Con dos usuarios de prueba (**Authentication → Add user**):

| Paso | Resultado esperado |
| --- | --- |
| A llama a `crear_hogar` | Aparece el hogar **y sus diez categorías** |
| A crea un plato | Correcto |
| B consulta `platos` sin unirse | **0 filas** — no un error |
| B llama a `unirse_a_hogar` con el código | Ahora ve el plato de A |
| B lo intenta con un código inventado | Excepción *código no válido* |

Si el tercer paso devolviera filas, hay una fuga de datos y no merece la pena seguir construyendo
hasta arreglarla.

### Integridad entre hogares

Intentar meter en `plan_comidas` de un hogar un `plato_id` de otro: la clave foránea compuesta
`(plato_id, hogar_id)` lo rechaza. Es lo que impide mezclar datos aunque la app tuviera un fallo.

---

## Notas sobre el esquema

**El historial no tiene tabla propia.** Es `plan_comidas` con fecha pasada. "Asignar desde el
historial" es copiar una fila a otra fecha.

**Los platos se archivan, no se borran.** `archivado = true`. Borrarlos de verdad se llevaría por
delante el historial donde aparecen.

**Un plato por hueco, por ahora.** La restricción es `unique (hogar_id, fecha, momento, orden)` con
`orden` fijo a 1. Admitir primer y segundo plato más adelante solo requiere cambiar la interfaz.

**Las categorías son datos, no esquema.** Renombrarlas, reordenarlas o añadir nuevas es un `INSERT`
desde la app, sin migraciones. Una categoría en uso no se puede borrar (`ON DELETE RESTRICT`): hay
que mover los platos primero.

**Añadir un momento** (desayuno, merienda) sí es una línea de SQL:

```sql
alter type public.momento_comida add value 'desayuno';
```
