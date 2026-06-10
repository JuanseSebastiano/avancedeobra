-- Avance de Obra — schema inicial
-- Jerarquía: obras → zonas → (pisos, rubros → subrubros → items) → avances
-- `avances` es append-only: cada carga inserta una fila nueva; la lectura
-- toma la más reciente por (item_id, piso_id) vía la vista avances_actuales.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Catálogo
-- ---------------------------------------------------------------------------

create table public.obras (
  id         uuid primary key default gen_random_uuid(),
  codigo     text not null unique,
  nombre     text not null,
  created_at timestamptz not null default now()
);

create table public.zonas (
  id      uuid primary key default gen_random_uuid(),
  obra_id uuid not null references public.obras (id) on delete cascade,
  codigo  text not null,
  nombre  text not null,
  orden   integer not null default 0,
  activo  boolean not null default true,
  unique (obra_id, codigo)
);

create table public.pisos (
  id      uuid primary key default gen_random_uuid(),
  obra_id uuid not null references public.obras (id) on delete cascade,
  zona_id uuid not null references public.zonas (id) on delete cascade,
  codigo  text not null,
  orden   integer not null default 0,
  activo  boolean not null default true,
  unique (zona_id, codigo)
);

-- Los rubros se repiten entre zonas con distintos ítems (p.ej. "Albañilería"
-- existe en SS, BAS y AZ con contenidos distintos), por eso cuelgan de zona.
create table public.rubros (
  id          uuid primary key default gen_random_uuid(),
  obra_id     uuid not null references public.obras (id) on delete cascade,
  zona_id     uuid not null references public.zonas (id) on delete cascade,
  codigo      text not null,
  nombre      text not null,
  responsable text,
  orden       integer not null default 0,
  activo      boolean not null default true,
  unique (zona_id, codigo)
);

create table public.subrubros (
  id       uuid primary key default gen_random_uuid(),
  obra_id  uuid not null references public.obras (id) on delete cascade,
  rubro_id uuid not null references public.rubros (id) on delete cascade,
  codigo   text not null,
  nombre   text not null,
  orden    integer not null default 0,
  activo   boolean not null default true,
  unique (rubro_id, codigo)
);

create table public.items (
  id          uuid primary key default gen_random_uuid(),
  obra_id     uuid not null references public.obras (id) on delete cascade,
  subrubro_id uuid not null references public.subrubros (id) on delete cascade,
  descripcion text not null,
  monto       numeric not null default 0 check (monto >= 0),
  orden       integer not null default 0,
  activo      boolean not null default true,
  unique (subrubro_id, descripcion)
);

-- ---------------------------------------------------------------------------
-- Avances (append-only)
-- ---------------------------------------------------------------------------

create table public.avances (
  id                  uuid primary key default gen_random_uuid(),
  obra_id             uuid not null references public.obras (id) on delete cascade,
  item_id             uuid not null references public.items (id) on delete cascade,
  piso_id             uuid not null references public.pisos (id) on delete cascade,
  porcentaje          numeric not null check (porcentaje >= 0 and porcentaje <= 1),
  porcentaje_anterior numeric check (porcentaje_anterior >= 0 and porcentaje_anterior <= 1),
  fecha_corte         date not null default current_date,
  usuario_id          uuid references auth.users (id) on delete set null,
  created_at          timestamptz not null default now()
);

create index avances_item_piso_idx on public.avances (item_id, piso_id, fecha_corte desc, created_at desc);
create index avances_obra_corte_idx on public.avances (obra_id, fecha_corte);

-- ---------------------------------------------------------------------------
-- Usuarios y roles
-- ---------------------------------------------------------------------------

create table public.usuarios_obras (
  usuario_id uuid not null references auth.users (id) on delete cascade,
  obra_id    uuid not null references public.obras (id) on delete cascade,
  rol        text not null check (rol in ('admin', 'editor', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (usuario_id, obra_id)
);

-- Rol del usuario autenticado en una obra. SECURITY DEFINER para poder
-- usarla dentro de las policies sin recursión sobre usuarios_obras.
create or replace function public.rol_en_obra(p_obra uuid)
returns text
language sql stable security definer
set search_path = public
as $$
  select rol from usuarios_obras
  where usuario_id = auth.uid() and obra_id = p_obra;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.obras          enable row level security;
alter table public.zonas          enable row level security;
alter table public.pisos          enable row level security;
alter table public.rubros         enable row level security;
alter table public.subrubros      enable row level security;
alter table public.items          enable row level security;
alter table public.avances        enable row level security;
alter table public.usuarios_obras enable row level security;

create policy obras_select on public.obras
  for select using (public.rol_en_obra(id) is not null);

create policy usuarios_obras_select on public.usuarios_obras
  for select using (usuario_id = auth.uid() or public.rol_en_obra(obra_id) = 'admin');

create policy usuarios_obras_admin on public.usuarios_obras
  for all using (public.rol_en_obra(obra_id) = 'admin')
  with check (public.rol_en_obra(obra_id) = 'admin');

-- Catálogo: lectura para cualquier miembro, escritura solo admin (DDO).
do $$
declare t text;
begin
  foreach t in array array['zonas', 'pisos', 'rubros', 'subrubros', 'items'] loop
    execute format(
      'create policy %I_select on public.%I for select using (public.rol_en_obra(obra_id) is not null)', t, t);
    execute format(
      'create policy %I_admin_write on public.%I for all using (public.rol_en_obra(obra_id) = ''admin'') with check (public.rol_en_obra(obra_id) = ''admin'')', t, t);
  end loop;
end $$;

-- Avances: lectura para miembros, inserción para editor/admin.
-- Sin UPDATE ni DELETE: el historial es inmutable.
create policy avances_select on public.avances
  for select using (public.rol_en_obra(obra_id) is not null);

create policy avances_insert on public.avances
  for insert with check (
    public.rol_en_obra(obra_id) in ('admin', 'editor')
    and usuario_id = auth.uid()
  );

-- ---------------------------------------------------------------------------
-- Vistas y funciones de consulta
-- ---------------------------------------------------------------------------

-- Último avance conocido por (item, piso).
create view public.avances_actuales
  with (security_invoker = true)
as
select distinct on (item_id, piso_id)
  obra_id, item_id, piso_id, porcentaje, porcentaje_anterior,
  fecha_corte, usuario_id, created_at
from public.avances
order by item_id, piso_id, fecha_corte desc, created_at desc;

-- Curva de avance: avance ponderado de la obra (o de una zona) a cada
-- fecha de corte, tomando para cada corte el último valor conocido de cada
-- (item, piso) y usando los montos de los ítems como peso.
create or replace function public.curva_avance(p_obra uuid, p_zona uuid default null)
returns table (fecha_corte date, porcentaje numeric)
language sql stable
as $$
  with cortes as (
    select distinct a.fecha_corte
    from avances a
    where a.obra_id = p_obra
  ),
  ultimos as (
    select c.fecha_corte as corte, u.item_id, u.piso_id, u.porcentaje, i.monto
    from cortes c
    cross join lateral (
      select distinct on (a.item_id, a.piso_id) a.item_id, a.piso_id, a.porcentaje
      from avances a
      where a.obra_id = p_obra and a.fecha_corte <= c.fecha_corte
      order by a.item_id, a.piso_id, a.fecha_corte desc, a.created_at desc
    ) u
    join items i on i.id = u.item_id and i.activo
    join subrubros sr on sr.id = i.subrubro_id
    join rubros r on r.id = sr.rubro_id
    where p_zona is null or r.zona_id = p_zona
  )
  select
    corte,
    case
      when sum(monto) > 0 then round(sum(porcentaje * monto) / sum(monto), 4)
      else round(avg(porcentaje), 4)
    end
  from ultimos
  group by corte
  order by corte;
$$;

-- Ítems estancados: (item, piso) con avance < 100% cuyo último registro
-- tiene más de p_meses meses.
create or replace function public.items_estancados(p_obra uuid, p_meses integer default 2)
returns table (
  item_id uuid,
  descripcion text,
  zona text,
  rubro text,
  piso text,
  porcentaje numeric,
  ultimo_registro date
)
language sql stable
as $$
  select i.id, i.descripcion, z.codigo, r.nombre, p.codigo, ult.porcentaje, ult.fecha_corte
  from (
    select distinct on (a.item_id, a.piso_id)
      a.item_id, a.piso_id, a.porcentaje, a.fecha_corte
    from avances a
    where a.obra_id = p_obra
    order by a.item_id, a.piso_id, a.fecha_corte desc, a.created_at desc
  ) ult
  join items i on i.id = ult.item_id and i.activo
  join subrubros sr on sr.id = i.subrubro_id
  join rubros r on r.id = sr.rubro_id
  join zonas z on z.id = r.zona_id
  join pisos p on p.id = ult.piso_id
  where ult.porcentaje < 1
    and ult.fecha_corte < current_date - make_interval(months => p_meses)
  order by ult.fecha_corte asc, z.orden, r.orden, i.orden;
$$;
