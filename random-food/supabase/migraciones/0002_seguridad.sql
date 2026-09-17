-- ============================================================================
-- Random Food · 0002 · Seguridad
-- ============================================================================
-- Row Level Security en las siete tablas. Todo el acceso responde a una única
-- pregunta: ¿soy miembro de ese hogar?
--
-- Ejecutar después de 0001_esquema.sql.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- Funciones de pertenencia
-- ----------------------------------------------------------------------------
-- `security definer` NO es opcional aquí. Una política sobre `miembros` que
-- consulte `miembros` provoca recursión infinita y Postgres aborta la consulta.
-- Es el error clásico de Supabase con tablas de pertenencia; una función que se
-- salta RLS es la forma estándar de romper el ciclo.
--
-- `set search_path` evita que un esquema inyectado pueda suplantar a `public`
-- dentro de una función privilegiada.

create or replace function public.es_miembro(_hogar_id uuid)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (
    select 1
    from public.miembros m
    where m.hogar_id = _hogar_id
      and m.user_id  = (select auth.uid())
  );
$$;

create or replace function public.es_propietario(_hogar_id uuid)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (
    select 1
    from public.miembros m
    where m.hogar_id = _hogar_id
      and m.user_id  = (select auth.uid())
      and m.rol      = 'propietario'
  );
$$;

revoke execute on function public.es_miembro(uuid)    from public, anon;
revoke execute on function public.es_propietario(uuid) from public, anon;
grant  execute on function public.es_miembro(uuid)    to authenticated;
grant  execute on function public.es_propietario(uuid) to authenticated;


-- ----------------------------------------------------------------------------
-- crear_hogar
-- ----------------------------------------------------------------------------
-- `hogares` no tiene política de INSERT a propósito: crear un hogar pasa
-- obligatoriamente por aquí. Si se insertara a pelo, quedaría un hogar sin
-- miembros — que RLS te impediría ver acto seguido — y sin categorías.

create or replace function public.crear_hogar(_nombre text)
returns public.hogares
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _uid   uuid := (select auth.uid());
  _hogar public.hogares;
begin
  if _uid is null then
    raise exception 'Necesitas iniciar sesión para crear un hogar'
      using errcode = '28000';
  end if;

  insert into public.hogares (nombre)
  values (trim(_nombre))
  returning * into _hogar;

  insert into public.miembros (hogar_id, user_id, rol)
  values (_hogar.id, _uid, 'propietario');

  -- Categorías de partida. Son datos, no esquema: se renombran, se borran y se
  -- amplían desde la propia app.
  insert into public.categorias (hogar_id, nombre, color, icono, orden) values
    (_hogar.id, 'Legumbre', '#b45309', '🫘', 1),
    (_hogar.id, 'Carne',    '#b91c1c', '🥩', 2),
    (_hogar.id, 'Pescado',  '#0369a1', '🐟', 3),
    (_hogar.id, 'Pasta',    '#ca8a04', '🍝', 4),
    (_hogar.id, 'Arroz',    '#a16207', '🍚', 5),
    (_hogar.id, 'Verdura',  '#15803d', '🥦', 6),
    (_hogar.id, 'Sopa',     '#c2410c', '🍲', 7),
    (_hogar.id, 'Huevo',    '#d97706', '🍳', 8),
    (_hogar.id, 'Ensalada', '#65a30d', '🥗', 9),
    (_hogar.id, 'Postre',   '#db2777', '🍰', 10);

  return _hogar;
end;
$$;

revoke execute on function public.crear_hogar(text) from public, anon;
grant  execute on function public.crear_hogar(text) to authenticated;


-- ----------------------------------------------------------------------------
-- unirse_a_hogar
-- ----------------------------------------------------------------------------
-- Hace falta porque la política de SELECT de `hogares` solo deja ver aquellos
-- de los que ya eres miembro: desde el cliente es imposible buscar por código.
-- Esta función lo resuelve en el servidor.

create or replace function public.unirse_a_hogar(_codigo text)
returns public.hogares
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _uid   uuid := (select auth.uid());
  _hogar public.hogares;
begin
  if _uid is null then
    raise exception 'Necesitas iniciar sesión para unirte a un hogar'
      using errcode = '28000';
  end if;

  select * into _hogar
  from public.hogares
  where codigo_invitacion = upper(trim(_codigo));

  if _hogar.id is null then
    raise exception 'El código de invitación no es válido'
      using errcode = 'P0002';
  end if;

  insert into public.miembros (hogar_id, user_id, rol)
  values (_hogar.id, _uid, 'miembro')
  on conflict (hogar_id, user_id) do nothing;

  return _hogar;
end;
$$;

revoke execute on function public.unirse_a_hogar(text) from public, anon;
grant  execute on function public.unirse_a_hogar(text) to authenticated;


-- ----------------------------------------------------------------------------
-- Activar RLS
-- ----------------------------------------------------------------------------
-- Sin políticas, RLS bloquea todo. Se va abriendo solo lo necesario.

alter table public.hogares            enable row level security;
alter table public.miembros           enable row level security;
alter table public.categorias         enable row level security;
alter table public.platos             enable row level security;
alter table public.ingredientes       enable row level security;
alter table public.plato_ingredientes enable row level security;
alter table public.plan_comidas       enable row level security;


-- ----------------------------------------------------------------------------
-- Permisos de tabla
-- ----------------------------------------------------------------------------
-- Los permisos son la primera puerta; RLS, la segunda. `anon` no recibe nada, y
-- además ninguna política le aplica: un visitante sin sesión no ve nada.

grant select, insert, update, delete on all tables in schema public to authenticated;


-- ----------------------------------------------------------------------------
-- Políticas · hogares
-- ----------------------------------------------------------------------------

create policy "hogares_ver_los_mios" on public.hogares
  for select to authenticated
  using (public.es_miembro(id));

create policy "hogares_editar_propietario" on public.hogares
  for update to authenticated
  using (public.es_propietario(id))
  with check (public.es_propietario(id));

create policy "hogares_borrar_propietario" on public.hogares
  for delete to authenticated
  using (public.es_propietario(id));

-- Sin política de INSERT: se crean con crear_hogar().


-- ----------------------------------------------------------------------------
-- Políticas · miembros
-- ----------------------------------------------------------------------------

create policy "miembros_ver_los_de_mi_hogar" on public.miembros
  for select to authenticated
  using (public.es_miembro(hogar_id));

create policy "miembros_gestion_propietario" on public.miembros
  for all to authenticated
  using (public.es_propietario(hogar_id))
  with check (public.es_propietario(hogar_id));

-- Cualquiera puede irse de un hogar, propietario o no.
create policy "miembros_salir_yo_mismo" on public.miembros
  for delete to authenticated
  using (user_id = (select auth.uid()));


-- ----------------------------------------------------------------------------
-- Políticas · el resto
-- ----------------------------------------------------------------------------
-- Idénticas entre sí, que es justo el motivo de llevar `hogar_id` en todas las
-- tablas: una sola forma que revisar.

create policy "categorias_acceso_por_hogar" on public.categorias
  for all to authenticated
  using (public.es_miembro(hogar_id))
  with check (public.es_miembro(hogar_id));

create policy "platos_acceso_por_hogar" on public.platos
  for all to authenticated
  using (public.es_miembro(hogar_id))
  with check (public.es_miembro(hogar_id));

create policy "ingredientes_acceso_por_hogar" on public.ingredientes
  for all to authenticated
  using (public.es_miembro(hogar_id))
  with check (public.es_miembro(hogar_id));

create policy "plato_ingredientes_acceso_por_hogar" on public.plato_ingredientes
  for all to authenticated
  using (public.es_miembro(hogar_id))
  with check (public.es_miembro(hogar_id));

create policy "plan_comidas_acceso_por_hogar" on public.plan_comidas
  for all to authenticated
  using (public.es_miembro(hogar_id))
  with check (public.es_miembro(hogar_id));
