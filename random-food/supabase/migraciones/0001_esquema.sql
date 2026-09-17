-- ============================================================================
-- Random Food · 0001 · Esquema
-- ============================================================================
-- Planificador de comidas para un hogar: catálogo de platos enlazados a
-- Cookidoo, calendario de comida y cena, e ingredientes para la lista de la
-- compra.
--
-- Principio de diseño: TODAS las tablas llevan `hogar_id`, incluidas las de
-- unión. Eso permite que cada política de seguridad tenga exactamente la misma
-- forma, y que las claves foráneas compuestas impidan mezclar datos entre
-- hogares en la propia base de datos, sin depender de que la app se porte bien.
--
-- Ejecutar antes que 0002_seguridad.sql.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- Tipos
-- ----------------------------------------------------------------------------

-- `momento` es estructural: condiciona la forma del calendario. Añadir desayuno
-- más adelante es una línea:  alter type public.momento_comida add value 'desayuno';
create type public.momento_comida as enum ('comida', 'cena');

create type public.rol_miembro as enum ('propietario', 'miembro');


-- ----------------------------------------------------------------------------
-- Utilidades
-- ----------------------------------------------------------------------------

create or replace function public.tocar_actualizado_en()
returns trigger
language plpgsql
as $$
begin
  new.actualizado_en := now();
  return new;
end;
$$;

comment on function public.tocar_actualizado_en() is
  'Disparador que mantiene `actualizado_en` al día. Útil además para resolver '
  'conflictos si algún día la PWA edita sin conexión.';


-- ----------------------------------------------------------------------------
-- hogares
-- ----------------------------------------------------------------------------

create table public.hogares (
  id                uuid primary key default gen_random_uuid(),
  nombre            text not null check (length(trim(nombre)) between 1 and 80),
  -- Seis caracteres hexadecimales: suficiente para una casa, y `md5` es una
  -- función del núcleo de Postgres, así que no hace falta ninguna extensión.
  codigo_invitacion text not null unique
                      default upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6)),
  creado_en         timestamptz not null default now(),
  actualizado_en    timestamptz not null default now()
);

create trigger hogares_actualizado_en
  before update on public.hogares
  for each row execute function public.tocar_actualizado_en();

comment on column public.hogares.codigo_invitacion is
  'Código que se comparte para entrar al hogar. Se canjea con unirse_a_hogar().';


-- ----------------------------------------------------------------------------
-- miembros · qué cuentas pertenecen a qué hogar
-- ----------------------------------------------------------------------------

create table public.miembros (
  hogar_id  uuid not null references public.hogares (id) on delete cascade,
  user_id   uuid not null references auth.users (id)     on delete cascade,
  rol       public.rol_miembro not null default 'miembro',
  creado_en timestamptz not null default now(),

  primary key (hogar_id, user_id)
);

create index miembros_user_idx on public.miembros (user_id);


-- ----------------------------------------------------------------------------
-- categorias · legumbre, pescado, pasta...
-- ----------------------------------------------------------------------------
-- Tabla y no tipo enumerado a propósito: así renombrar, añadir o reordenar
-- categorías es un INSERT, no una migración. Cada hogar tiene las suyas, con
-- color e icono para pintar el calendario.

create table public.categorias (
  id             uuid primary key default gen_random_uuid(),
  hogar_id       uuid not null references public.hogares (id) on delete cascade,
  nombre         text not null check (length(trim(nombre)) between 1 and 40),
  color          text not null default '#94a3b8' check (color ~ '^#[0-9a-fA-F]{6}$'),
  icono          text check (icono is null or length(icono) <= 8),
  orden          smallint not null default 0,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),

  -- Requisito de la clave foránea compuesta de `platos`.
  unique (id, hogar_id)
);

create unique index categorias_nombre_unico
  on public.categorias (hogar_id, lower(trim(nombre)));

create index categorias_hogar_idx on public.categorias (hogar_id, orden);

create trigger categorias_actualizado_en
  before update on public.categorias
  for each row execute function public.tocar_actualizado_en();


-- ----------------------------------------------------------------------------
-- platos · el catálogo del hogar
-- ----------------------------------------------------------------------------

create table public.platos (
  id             uuid primary key default gen_random_uuid(),
  hogar_id       uuid not null references public.hogares (id) on delete cascade,
  nombre         text not null check (length(trim(nombre)) between 1 and 120),
  categoria_id   uuid,
  url_cookidoo   text check (url_cookidoo is null or url_cookidoo ~* '^https?://'),
  notas          text,
  favorito       boolean not null default false,
  apto_comida    boolean not null default true,
  apto_cena      boolean not null default true,
  raciones_base  smallint check (raciones_base is null or raciones_base > 0),
  archivado      boolean not null default false,
  creado_por     uuid references auth.users (id) on delete set null,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),

  constraint platos_sirve_para_algo check (apto_comida or apto_cena),

  -- Impide asignar una categoría de otro hogar. Con MATCH SIMPLE (el de serie),
  -- un `categoria_id` nulo satisface la restricción: los platos sin categoría
  -- son válidos.
  constraint platos_categoria_mismo_hogar
    foreign key (categoria_id, hogar_id)
    references public.categorias (id, hogar_id)
    on delete restrict,

  -- Requisito de las claves foráneas compuestas de plan_comidas y
  -- plato_ingredientes.
  unique (id, hogar_id)
);

create unique index platos_nombre_unico
  on public.platos (hogar_id, lower(trim(nombre)));

create index platos_hogar_activos on public.platos (hogar_id) where not archivado;
create index platos_categoria_idx on public.platos (categoria_id);

create trigger platos_actualizado_en
  before update on public.platos
  for each row execute function public.tocar_actualizado_en();

comment on column public.platos.archivado is
  'Los platos se archivan en vez de borrarse: borrarlos de verdad se llevaría '
  'por delante el historial del calendario donde aparecen.';

comment on column public.platos.url_cookidoo is
  'Enlace a la receta. La app es un índice personal, no una copia del recetario.';

comment on column public.platos.raciones_base is
  'Para cuántas personas está pensada la receta. Con plan_comidas.comensales, '
  'permite escalar las cantidades de la lista de la compra.';

comment on constraint platos_categoria_mismo_hogar on public.platos is
  'RESTRICT: una categoría en uso no se puede borrar. Mejor obligar a mover los '
  'platos que dejarlos sin clasificar en silencio.';


-- ----------------------------------------------------------------------------
-- ingredientes · catálogo normalizado
-- ----------------------------------------------------------------------------
-- Normalizado y no texto libre porque es la única forma de sumar cantidades
-- entre platos: con texto libre, "Cebolla" y "cebollas" no se agregan jamás y
-- la lista de la compra no funciona nunca.

create table public.ingredientes (
  id              uuid primary key default gen_random_uuid(),
  hogar_id        uuid not null references public.hogares (id) on delete cascade,
  nombre          text not null check (length(trim(nombre)) between 1 and 80),
  unidad_habitual text check (unidad_habitual is null or length(unidad_habitual) <= 20),
  seccion         text check (seccion is null or length(seccion) <= 40),
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now(),

  unique (id, hogar_id)
);

create unique index ingredientes_nombre_unico
  on public.ingredientes (hogar_id, lower(trim(nombre)));

create index ingredientes_hogar_idx on public.ingredientes (hogar_id);

create trigger ingredientes_actualizado_en
  before update on public.ingredientes
  for each row execute function public.tocar_actualizado_en();

comment on column public.ingredientes.seccion is
  'Fruta, carnicería, congelados... La lista de la compra sale ordenada según '
  'recorres el súper, que es lo que la hace usable.';


-- ----------------------------------------------------------------------------
-- plato_ingredientes · qué lleva cada plato
-- ----------------------------------------------------------------------------

create table public.plato_ingredientes (
  hogar_id       uuid not null references public.hogares (id) on delete cascade,
  plato_id       uuid not null,
  ingrediente_id uuid not null,
  cantidad       numeric(10, 2) check (cantidad is null or cantidad > 0),
  unidad         text check (unidad is null or length(unidad) <= 20),
  opcional       boolean not null default false,
  orden          smallint not null default 0,
  creado_en      timestamptz not null default now(),

  primary key (plato_id, ingrediente_id),

  constraint pling_plato_mismo_hogar
    foreign key (plato_id, hogar_id)
    references public.platos (id, hogar_id) on delete cascade,

  constraint pling_ingrediente_mismo_hogar
    foreign key (ingrediente_id, hogar_id)
    references public.ingredientes (id, hogar_id) on delete cascade
);

create index pling_ingrediente_idx on public.plato_ingredientes (ingrediente_id);
create index pling_hogar_idx       on public.plato_ingredientes (hogar_id);


-- ----------------------------------------------------------------------------
-- plan_comidas · el calendario, y también el historial
-- ----------------------------------------------------------------------------
-- No hay tabla de historial: el historial es esta misma tabla con fecha pasada.
-- "Asignar desde el historial" es copiar una fila a otra fecha.

create table public.plan_comidas (
  id             uuid primary key default gen_random_uuid(),
  hogar_id       uuid not null references public.hogares (id) on delete cascade,
  fecha          date not null,
  momento        public.momento_comida not null,
  -- La puerta abierta: hoy la interfaz escribe siempre 1 y se comporta como un
  -- plato por hueco. El día que quieras primer y segundo plato, solo cambia la
  -- pantalla; el esquema ya lo admite.
  orden          smallint not null default 1 check (orden > 0),
  plato_id       uuid,
  comensales     smallint check (comensales is null or comensales > 0),
  notas          text,
  creado_por     uuid references auth.users (id) on delete set null,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),

  -- Permite anotar "cenamos fuera" sin inventarse un plato falso, pero no deja
  -- huecos completamente vacíos.
  constraint plan_hueco_no_vacio check (plato_id is not null or notas is not null),

  constraint plan_plato_mismo_hogar
    foreign key (plato_id, hogar_id)
    references public.platos (id, hogar_id) on delete cascade,

  unique (hogar_id, fecha, momento, orden)
);

create index plan_hogar_fecha_idx on public.plan_comidas (hogar_id, fecha);
create index plan_plato_idx       on public.plan_comidas (plato_id);

create trigger plan_comidas_actualizado_en
  before update on public.plan_comidas
  for each row execute function public.tocar_actualizado_en();

comment on column public.plan_comidas.comensales is
  'Cuánta gente come ese día. Con platos.raciones_base, escala las cantidades.';
