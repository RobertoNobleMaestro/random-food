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
--
-- `(select auth.uid())` y no `auth.uid()` a secas: envuelto en un subselect,
-- Postgres lo evalúa una vez por consulta en lugar de una vez por fila. Es el
-- aviso `auth_rls_initplan` del Performance Advisor de Supabase.

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

revoke execute on function public.es_miembro(uuid)     from public, anon;
revoke execute on function public.es_propietario(uuid) from public, anon;
grant  execute on function public.es_miembro(uuid)     to authenticated;
grant  execute on function public.es_propietario(uuid) to authenticated;


-- ----------------------------------------------------------------------------
-- Forzar la autoría
-- ----------------------------------------------------------------------------
-- Sin esto, `creado_por` es un campo cualquiera que el cliente rellena a mano:
-- se puede escribir el id de otra persona y falsear quién añadió un plato.

-- También en UPDATE, y no solo en INSERT: un `upsert` que choca resuelve por
-- UPDATE, así que un disparador de solo inserción se saltaba justo por donde
-- escribe el calendario. En UPDATE se conserva el autor original: quien edita
-- un plato no pasa a figurar como quien lo creó.
create or replace function public.forzar_autoria()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    new.creado_por := (select auth.uid());
  else
    new.creado_por := old.creado_por;
  end if;
  return new;
end;
$$;

create trigger platos_autoria
  before insert or update on public.platos
  for each row execute function public.forzar_autoria();

create trigger plan_comidas_autoria
  before insert or update on public.plan_comidas
  for each row execute function public.forzar_autoria();


-- ----------------------------------------------------------------------------
-- Hogares sin nadie dentro
-- ----------------------------------------------------------------------------
-- Un hogar sin miembros es invisible para siempre: ninguna política lo alcanza,
-- nadie puede entrar y sus datos quedan ocupando sitio. Pasa al borrar la cuenta
-- del propietario en Authentication, o al salirse el último miembro.
--
-- Si quedan miembros pero ninguno es propietario, asciende al más antiguo.

create or replace function public.cuidar_hogar_huerfano()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (select 1 from public.miembros where hogar_id = old.hogar_id) then
    -- Sin miembros: el hogar y todo lo que cuelga de él se van con él.
    delete from public.hogares where id = old.hogar_id;
    return old;
  end if;

  if not exists (
    select 1 from public.miembros
    where hogar_id = old.hogar_id and rol = 'propietario'
  ) then
    update public.miembros
       set rol = 'propietario'
     where hogar_id = old.hogar_id
       and user_id = (
         select user_id from public.miembros
          where hogar_id = old.hogar_id
          order by creado_en
          limit 1
       );
  end if;

  return old;
end;
$$;

create trigger miembros_cuidar_huerfano
  after delete on public.miembros
  for each row execute function public.cuidar_hogar_huerfano();


-- ----------------------------------------------------------------------------
-- Freno a la fuerza bruta sobre los códigos de invitación
-- ----------------------------------------------------------------------------
-- El registro es abierto: cualquiera consigue el rol `authenticated` en medio
-- minuto y puede llamar al RPC de unirse en bucle. Con 48 bits de código el
-- barrido ya es inviable, pero el contador lo cierra del todo y además deja
-- rastro del intento.

create table public.intentos_union (
  user_id    uuid not null references auth.users (id) on delete cascade,
  intento_en timestamptz not null default now()
);

create index intentos_union_idx on public.intentos_union (user_id, intento_en desc);

alter table public.intentos_union enable row level security;
-- Sin ninguna política: solo se toca desde funciones `security definer`.
revoke all on public.intentos_union from anon, authenticated;


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
-- Esta función lo resuelve en el servidor, con contador de intentos.
--
-- Ante un código inválido devuelve NULL en lugar de lanzar una excepción, y no
-- es un capricho: una excepción revierte la transacción ENTERA, incluido el
-- apunte en `intentos_union`. Con `raise`, el contador solo sobrevivía a los
-- aciertos —que es justo cuando se borra—, así que el limitador no frenaba
-- absolutamente nada. Comprobado: 12 intentos seguidos y ni un bloqueo.

create or replace function public.unirse_a_hogar(_codigo text)
returns public.hogares
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _uid     uuid := (select auth.uid());
  _fallos  integer;
  _hogar   public.hogares;
begin
  if _uid is null then
    raise exception 'Necesitas iniciar sesión para unirte a un hogar'
      using errcode = '28000';
  end if;

  delete from public.intentos_union where intento_en < now() - interval '1 hour';

  select count(*) into _fallos
    from public.intentos_union
   where user_id = _uid
     and intento_en > now() - interval '1 hour';

  if _fallos >= 10 then
    raise exception 'Demasiados intentos fallidos. Prueba dentro de una hora.'
      using errcode = '54000';
  end if;

  select * into _hogar
  from public.hogares
  where codigo_invitacion = upper(trim(_codigo));

  if _hogar.id is null then
    -- Se apunta el intento y se devuelve NULL sin excepción, para que el
    -- INSERT llegue a confirmarse. Quien llama distingue NULL de un error.
    insert into public.intentos_union (user_id) values (_uid);
    return null;
  end if;

  -- Acierto: se limpia el contador de esta persona.
  delete from public.intentos_union where user_id = _uid;

  insert into public.miembros (hogar_id, user_id, rol)
  values (_hogar.id, _uid, 'miembro')
  on conflict (hogar_id, user_id) do nothing;

  return _hogar;
end;
$$;

revoke execute on function public.unirse_a_hogar(text) from public, anon;
grant  execute on function public.unirse_a_hogar(text) to authenticated;


-- ----------------------------------------------------------------------------
-- rotar_codigo_invitacion
-- ----------------------------------------------------------------------------
-- Un código compartido por WhatsApp acaba donde no debe. Esto lo invalida.

create or replace function public.rotar_codigo_invitacion(_hogar_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  _codigo text;
begin
  if not public.es_propietario(_hogar_id) then
    raise exception 'Solo el propietario puede cambiar el código'
      using errcode = '42501';
  end if;

  update public.hogares
     set codigo_invitacion = public.generar_codigo_invitacion()
   where id = _hogar_id
  returning codigo_invitacion into _codigo;

  return _codigo;
end;
$$;

revoke execute on function public.rotar_codigo_invitacion(uuid) from public, anon;
grant  execute on function public.rotar_codigo_invitacion(uuid) to authenticated;


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
-- Los permisos son la primera puerta; RLS, la segunda.
--
-- El REVOKE sobre `anon` es imprescindible: Supabase concede privilegios por
-- defecto a `anon` y a `authenticated` sobre toda tabla nueva del esquema
-- public. Las políticas son todas `to authenticated`, así que RLS ya frenaba a
-- un visitante sin sesión, pero dejarle el GRANT puesto significa que el día
-- que alguien cree una tabla y olvide activar RLS, queda abierta a internet.

revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;

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
-- Sin política de INSERT: las pertenencias solo nacen en crear_hogar() y
-- unirse_a_hogar(). Con una política de INSERT, un propietario podía meter en
-- su hogar el id de cualquier usuario sin que esa persona hiciera nada.

create policy "miembros_ver_los_de_mi_hogar" on public.miembros
  for select to authenticated
  using (public.es_miembro(hogar_id));

-- El propietario cambia roles; nadie puede cambiar el hogar de una fila.
create policy "miembros_cambiar_rol" on public.miembros
  for update to authenticated
  using (public.es_propietario(hogar_id))
  with check (public.es_propietario(hogar_id));

-- Una sola política de DELETE en vez de dos: el propietario echa a quien quiera
-- y cualquiera puede irse por su cuenta. Dos políticas permisivas sobre la misma
-- acción funcionan, pero el Performance Advisor las marca.
create policy "miembros_borrar" on public.miembros
  for delete to authenticated
  using (public.es_propietario(hogar_id) or user_id = (select auth.uid()));


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
