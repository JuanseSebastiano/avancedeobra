-- Avance de Obra — niveles físicos del edificio y cortes como entidad
--
-- Motivación:
--   * `pisos` cuelga de zona (unique (zona_id, codigo)), así que "PISO 12" son tres
--     filas distintas en FU, MON y PAL. Sin una noción de nivel físico compartido no
--     se puede agregar el avance por piso del edificio, que es lo que pinta el corte.
--   * `avances.fecha_corte` era un date suelto que siempre caía en current_date, por
--     lo que no se podía cargar un corte con fecha pasada ni nombrarlo.
--
-- Esta migración es idempotente: corre igual sobre una base vacía o con datos.
-- `nivel_id` y `corte_id` se resuelven por trigger, así ningún camino de escritura
-- (seed, importador, carga manual) puede dejar una fila huérfana.

-- ---------------------------------------------------------------------------
-- Derivación del nivel a partir del código de piso
-- ---------------------------------------------------------------------------
-- Los códigos ya vienen normalizados por pisoCodigo() en src/lib/excel/parse.ts
-- (saca el prefijo "PISO ", recorta, mayúsculas). Sobre la planilla real dan 60
-- valores: 4SS 3SS 2SS 1SS PB 1 2 3 5 6 … 56.
-- Un código inesperado no rompe nada: cae en orden 9999 y grupo 'torre'.

create or replace function public.nivel_orden(p_codigo text)
returns integer language sql immutable as $$
  select case
    when upper(trim(p_codigo)) ~ '^\d+SS$'
      then -((regexp_replace(upper(trim(p_codigo)), '^(\d+)SS$', '\1'))::integer)
    when upper(trim(p_codigo)) = 'PB' then 0
    when trim(p_codigo) ~ '^\d+$' then (trim(p_codigo))::integer
    else 9999
  end;
$$;

create or replace function public.nivel_grupo(p_codigo text)
returns text language sql immutable as $$
  select case
    when public.nivel_orden(p_codigo) < 0  then 'subsuelo'
    when public.nivel_orden(p_codigo) <= 5  then 'basamento'
    when public.nivel_orden(p_codigo) <= 53 then 'torre'
    when public.nivel_orden(p_codigo) <= 56 then 'azotea'
    else 'torre'
  end;
$$;

create or replace function public.nivel_nombre(p_codigo text)
returns text language sql immutable as $$
  select case
    when public.nivel_orden(p_codigo) < 0
      then abs(public.nivel_orden(p_codigo)) || 'º Subsuelo'
    when public.nivel_orden(p_codigo) = 0 then 'Planta Baja'
    when public.nivel_orden(p_codigo) between 1 and 900
      then 'Piso ' || upper(trim(p_codigo))
    else upper(trim(p_codigo))
  end;
$$;

-- ---------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------

create table if not exists public.niveles (
  id      uuid primary key default gen_random_uuid(),
  obra_id uuid not null references public.obras (id) on delete cascade,
  codigo  text not null,
  nombre  text not null,
  orden   integer not null,
  grupo   text not null default 'torre'
          check (grupo in ('subsuelo', 'basamento', 'torre', 'azotea')),
  activo  boolean not null default true,
  unique (obra_id, codigo)
);

create index if not exists niveles_obra_orden_idx on public.niveles (obra_id, orden);

alter table public.pisos
  add column if not exists nivel_id uuid references public.niveles (id) on delete set null;
create index if not exists pisos_nivel_idx on public.pisos (nivel_id);

-- Un corte es la foto mensual del avance. Tenerlo como entidad permite cargar
-- con fecha pasada, nombrarlo ("Corte julio 2026") y cerrarlo.
create table if not exists public.cortes (
  id         uuid primary key default gen_random_uuid(),
  obra_id    uuid not null references public.obras (id) on delete cascade,
  fecha      date not null,
  nombre     text,
  estado     text not null default 'abierto' check (estado in ('abierto', 'cerrado')),
  created_at timestamptz not null default now(),
  unique (obra_id, fecha)
);

create index if not exists cortes_obra_fecha_idx on public.cortes (obra_id, fecha desc);

alter table public.avances
  add column if not exists corte_id uuid references public.cortes (id) on delete set null;
create index if not exists avances_corte_idx on public.avances (corte_id);

-- ---------------------------------------------------------------------------
-- Resolución automática (SECURITY DEFINER: las policies de niveles/cortes son
-- más restrictivas que las de pisos/avances, pero el obra_id de la fila que las
-- dispara ya fue validado por RLS en la tabla de origen).
-- ---------------------------------------------------------------------------

create or replace function public.asegurar_nivel(p_obra uuid, p_codigo text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id  uuid;
  v_cod text := upper(trim(p_codigo));
begin
  if p_obra is null or v_cod is null or v_cod = '' then
    return null;
  end if;

  select id into v_id from niveles where obra_id = p_obra and codigo = v_cod;
  if v_id is not null then
    return v_id;
  end if;

  insert into niveles (obra_id, codigo, nombre, orden, grupo)
  values (p_obra, v_cod, nivel_nombre(v_cod), nivel_orden(v_cod), nivel_grupo(v_cod))
  on conflict (obra_id, codigo) do update set codigo = excluded.codigo
  returning id into v_id;

  return v_id;
end $$;

create or replace function public.asegurar_corte(p_obra uuid, p_fecha date)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if p_obra is null or p_fecha is null then
    return null;
  end if;

  select id into v_id from cortes where obra_id = p_obra and fecha = p_fecha;
  if v_id is not null then
    return v_id;
  end if;

  insert into cortes (obra_id, fecha)
  values (p_obra, p_fecha)
  on conflict (obra_id, fecha) do update set fecha = excluded.fecha
  returning id into v_id;

  return v_id;
end $$;

-- El importador hace upsert sobre pisos sin mandar nivel_id; en el camino de
-- UPDATE eso llegaría como NULL y borraría el vínculo. Por eso se conserva el
-- valor anterior salvo que el código haya cambiado.
create or replace function public.pisos_resolver_nivel()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE'
     and new.codigo is not distinct from old.codigo
     and new.nivel_id is null then
    new.nivel_id := old.nivel_id;
  end if;

  if new.nivel_id is null then
    new.nivel_id := public.asegurar_nivel(new.obra_id, new.codigo);
  end if;

  return new;
end $$;

drop trigger if exists pisos_set_nivel on public.pisos;
create trigger pisos_set_nivel
  before insert or update on public.pisos
  for each row execute function public.pisos_resolver_nivel();

-- Resuelve el corte del avance y, si el corte ya está cerrado, lo rechaza.
-- El cierre se hace cumplir acá y no sólo en la app: la tabla es append-only,
-- así que una fila mal insertada no se puede borrar después.
create or replace function public.avances_resolver_corte()
returns trigger language plpgsql security definer set search_path = public as $$
declare c record;
begin
  if new.corte_id is null then
    new.corte_id := public.asegurar_corte(new.obra_id, new.fecha_corte);
  end if;

  select fecha, estado, obra_id into c from public.cortes where id = new.corte_id;
  if found then
    if c.obra_id <> new.obra_id then
      raise exception 'El corte pertenece a otra obra';
    end if;
    if c.estado <> 'abierto' then
      raise exception 'El corte del % está cerrado', to_char(c.fecha, 'DD/MM/YYYY');
    end if;
    -- El corte manda sobre la fecha: así no puede quedar inconsistente.
    new.fecha_corte := c.fecha;
  end if;

  return new;
end $$;

-- avances es append-only: sólo hace falta en INSERT.
drop trigger if exists avances_set_corte on public.avances;
create trigger avances_set_corte
  before insert on public.avances
  for each row execute function public.avances_resolver_corte();

-- ---------------------------------------------------------------------------
-- Backfill (idempotente). Corre como dueño de las tablas, así que no lo frena RLS.
-- ---------------------------------------------------------------------------

insert into public.niveles (obra_id, codigo, nombre, orden, grupo)
select distinct
  p.obra_id,
  upper(trim(p.codigo)),
  public.nivel_nombre(p.codigo),
  public.nivel_orden(p.codigo),
  public.nivel_grupo(p.codigo)
from public.pisos p
where p.codigo is not null and trim(p.codigo) <> ''
on conflict (obra_id, codigo) do nothing;

update public.pisos p
set nivel_id = n.id
from public.niveles n
where n.obra_id = p.obra_id
  and n.codigo = upper(trim(p.codigo))
  and p.nivel_id is distinct from n.id;

insert into public.cortes (obra_id, fecha)
select distinct a.obra_id, a.fecha_corte
from public.avances a
on conflict (obra_id, fecha) do nothing;

update public.avances a
set corte_id = c.id
from public.cortes c
where c.obra_id = a.obra_id
  and c.fecha = a.fecha_corte
  and a.corte_id is null;

-- ---------------------------------------------------------------------------
-- Row Level Security (mismo patrón que 0001)
-- ---------------------------------------------------------------------------

alter table public.niveles enable row level security;
alter table public.cortes  enable row level security;

drop policy if exists niveles_select on public.niveles;
create policy niveles_select on public.niveles
  for select using (public.rol_en_obra(obra_id) is not null);

drop policy if exists niveles_admin_write on public.niveles;
create policy niveles_admin_write on public.niveles
  for all using (public.rol_en_obra(obra_id) = 'admin')
  with check (public.rol_en_obra(obra_id) = 'admin');

drop policy if exists cortes_select on public.cortes;
create policy cortes_select on public.cortes
  for select using (public.rol_en_obra(obra_id) is not null);

-- Un JO puede abrir el corte que está cargando; cerrarlo o borrarlo es del DDO.
drop policy if exists cortes_insert on public.cortes;
create policy cortes_insert on public.cortes
  for insert with check (public.rol_en_obra(obra_id) in ('admin', 'editor'));

drop policy if exists cortes_admin_write on public.cortes;
create policy cortes_admin_write on public.cortes
  for all using (public.rol_en_obra(obra_id) = 'admin')
  with check (public.rol_en_obra(obra_id) = 'admin');

-- ---------------------------------------------------------------------------
-- Consultas para el corte
-- ---------------------------------------------------------------------------

-- Avance por nivel físico. Devuelve ~60 filas en vez de las ~13.500 celdas que
-- hoy baja el dashboard.
--
-- Devuelve DOS medidas a propósito. En la planilla real la mayoría de los ítems
-- no tienen monto cargado (MON: 0 de 22; FU: 60 de 185; PAL: 26 de 81), y esos
-- ítems pesan 0 en un promedio ponderado: el número ponderado de un nivel sale
-- calculado sólo sobre la minoría que sí tiene monto. `porcentaje_simple` y
-- `celdas_con_monto` existen para que la UI pueda mostrarlo en vez de esconderlo.
--
-- El filtro de rubro es por NOMBRE, no por id: los rubros cuelgan de zona, así
-- que "Albañilería" son seis filas distintas y filtrar por id daría una sola zona.
--
-- LEFT JOIN desde niveles: devuelve TODOS los niveles, con porcentaje null en los
-- que no tienen ningún avance cargado. Sin dato no es lo mismo que 0 %.
create or replace function public.avance_por_nivel(
  p_obra   uuid,
  p_fecha  date default null,   -- null = último estado conocido
  p_zona   uuid default null,
  p_rubro  text default null    -- nombre del rubro
)
returns table (
  codigo            text,
  nombre            text,
  orden             integer,
  grupo             text,
  porcentaje        numeric,   -- ponderado por monto (fallback a simple si no hay pesos)
  porcentaje_simple numeric,   -- promedio simple sobre todas las celdas
  monto             numeric,
  celdas            bigint,    -- celdas con avance cargado en este nivel
  celdas_con_monto  bigint     -- de esas, cuántas pesan en el ponderado
)
language sql stable
as $$
  with ultimos as (
    select distinct on (a.item_id, a.piso_id)
      a.item_id, a.piso_id, a.porcentaje
    from public.avances a
    where a.obra_id = p_obra
      and (p_fecha is null or a.fecha_corte <= p_fecha)
    order by a.item_id, a.piso_id, a.fecha_corte desc, a.created_at desc
  ),
  filtrados as (
    select pi.nivel_id, u.porcentaje, i.monto
    from ultimos u
    join public.items     i  on i.id = u.item_id and i.activo
    join public.subrubros s  on s.id = i.subrubro_id
    join public.rubros    r  on r.id = s.rubro_id
    join public.pisos     pi on pi.id = u.piso_id
    where pi.nivel_id is not null
      and (p_zona  is null or r.zona_id = p_zona)
      and (p_rubro is null or r.nombre  = p_rubro)
  )
  select
    n.codigo,
    n.nombre,
    n.orden,
    n.grupo,
    case
      when sum(f.monto) > 0 then round(sum(f.porcentaje * f.monto) / sum(f.monto), 4)
      else round(avg(f.porcentaje), 4)
    end,
    round(avg(f.porcentaje), 4),
    coalesce(sum(f.monto), 0),
    count(f.porcentaje),
    count(f.porcentaje) filter (where f.monto > 0)
  from public.niveles n
  left join filtrados f on f.nivel_id = n.id
  where n.obra_id = p_obra and n.activo
  group by n.codigo, n.nombre, n.orden, n.grupo
  order by n.orden;
$$;

-- La misma serie para todas las fechas de corte de una sola vez, para que la
-- línea de tiempo del corte se pueda mover sin latencia del lado del cliente.
create or replace function public.avance_por_nivel_series(
  p_obra  uuid,
  p_zona  uuid default null,
  p_rubro text default null    -- nombre del rubro, igual que avance_por_nivel
)
returns table (
  fecha      date,
  codigo     text,
  orden      integer,
  porcentaje numeric
)
language sql stable
as $$
  with fechas as (
    select distinct a.fecha_corte as fecha
    from public.avances a
    where a.obra_id = p_obra
  ),
  ultimos as (
    select f.fecha, u.item_id, u.piso_id, u.porcentaje
    from fechas f
    cross join lateral (
      select distinct on (a.item_id, a.piso_id)
        a.item_id, a.piso_id, a.porcentaje
      from public.avances a
      where a.obra_id = p_obra and a.fecha_corte <= f.fecha
      order by a.item_id, a.piso_id, a.fecha_corte desc, a.created_at desc
    ) u
  ),
  filtrados as (
    select u.fecha, n.codigo, n.orden, u.porcentaje, i.monto
    from ultimos u
    join public.items     i  on i.id = u.item_id and i.activo
    join public.subrubros s  on s.id = i.subrubro_id
    join public.rubros    r  on r.id = s.rubro_id
    join public.pisos     pi on pi.id = u.piso_id
    join public.niveles   n  on n.id = pi.nivel_id
    where (p_zona  is null or r.zona_id = p_zona)
      and (p_rubro is null or r.nombre  = p_rubro)
  )
  select
    f.fecha,
    f.codigo,
    f.orden,
    case
      when sum(f.monto) > 0 then round(sum(f.porcentaje * f.monto) / sum(f.monto), 4)
      else round(avg(f.porcentaje), 4)
    end
  from filtrados f
  group by f.fecha, f.codigo, f.orden
  order by f.fecha, f.orden;
$$;

-- Estado de los avances de una zona a una fecha dada. Se usa para llenar la
-- grilla de carga: una llamada devuelve los valores actuales y otra, con la
-- fecha del corte anterior, la columna "anterior" que espera el JO.
--
-- Ojo: `avances.porcentaje_anterior` NO sirve para eso. Guarda el valor previo
-- inmediato (dos ediciones el mismo día ya lo pisan), no el valor al cierre del
-- corte anterior, que es lo que la planilla muestra como comparación.
create or replace function public.avances_al_corte(
  p_obra  uuid,
  p_fecha date default null,   -- null = último estado conocido
  p_zona  uuid default null
)
returns table (item_id uuid, piso_id uuid, porcentaje numeric)
language sql stable
as $$
  select u.item_id, u.piso_id, u.porcentaje
  from (
    select distinct on (a.item_id, a.piso_id)
      a.item_id, a.piso_id, a.porcentaje
    from public.avances a
    where a.obra_id = p_obra
      and (p_fecha is null or a.fecha_corte <= p_fecha)
    order by a.item_id, a.piso_id, a.fecha_corte desc, a.created_at desc
  ) u
  join public.pisos p on p.id = u.piso_id
  where p_zona is null or p.zona_id = p_zona;
$$;
