# Avance de Obra — Harbour Tower

Aplicación web para que el Director De Obra (DDO) y los Jefes de Obra (JO) carguen y
consulten el avance físico de obra, reemplazando la planilla Excel mensual
`AVANCE_DE_OBRA_HARBOUR_TOWER_-_AA-MM-DD.xlsx`.

**Stack**: Next.js 15 (App Router) + TypeScript estricto · Supabase (Postgres + Auth + RLS) ·
Tailwind 4 · SheetJS (xlsx) · recharts · Vercel.

## Funcionalidad

| Pantalla | Qué hace |
|---|---|
| **Dashboard** (`/`) | Avance ponderado por monto (total, por zona, piso y rubro), curva de avance corte a corte, ítems sin avance hace más de 2 meses, filtros por zona / rubro / responsable |
| **Carga** (`/carga`) | Mobile-first: zona → piso → rubro, slider + input 0-100 % por ítem, avance anterior vs. nuevo, guardado automático con feedback, historial inmutable |
| **Catálogo** (`/catalogo`) | El DDO agrega/edita/desactiva zonas, pisos, rubros (con responsable) e ítems (descripción y monto) |
| **Importar** (`/importar`) | Sube el xlsx original y lo mapea a la DB. Idempotente: re-subir una versión nueva actualiza avances sin duplicar ítems |
| **Exportar** (`/exportar`) | Descarga `AVANCE_DE_OBRA_HARBOUR_TOWER_-_AA-MM-DD.xlsx` con una hoja por zona + hojas "PROM. PONDERADO XX" cuyas celdas son **fórmulas** (`SUMPRODUCT`/`SUM` con fallback `AVERAGE`), de modo que editar montos o % en Excel recalcula los promedios |

Roles: `admin` (DDO: todo), `editor` (JO: carga avances), `viewer` (solo lectura).
Se aplican con Row Level Security; la tabla `avances` es **append-only** (sin UPDATE/DELETE),
cada carga registra usuario, timestamp y valor anterior.

## Setup

### 1. Supabase

1. Crear un proyecto en [supabase.com](https://supabase.com).
2. Aplicar la migración:
   - con CLI: `supabase link --project-ref <ref>` y `supabase db push`
   - o pegando `supabase/migrations/0001_init.sql` en el SQL Editor del dashboard.
3. En **Authentication → Providers** dejar habilitado Email/Password
   (desactivar "Confirm email" si se van a crear usuarios a mano).

### 2. Variables de entorno

```bash
cp .env.example .env.local
```

Completar con los valores de **Settings → API** del proyecto:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (solo para el seed; no se usa en la app)

### 3. Seed con los datos reales

La planilla de referencia está commiteada en `data/`. El seed crea la obra
"Harbour Tower" e importa catálogo + avances (≈650 ítems, ≈13.500 celdas de avance):

```bash
npm install
npm run seed
# o con otra planilla: npm run seed -- ruta/al/archivo.xlsx
```

El seed es idempotente: correrlo de nuevo con una planilla más reciente solo
inserta los avances que cambiaron.

### 4. Primer usuario admin (DDO)

1. En el dashboard de Supabase: **Authentication → Users → Add user** (email + password,
   marcar *Auto confirm*). Copiar el UUID del usuario.
2. En el SQL Editor:

```sql
insert into public.usuarios_obras (usuario_id, obra_id, rol)
select '<UUID-del-usuario>', id, 'admin' from public.obras where codigo = 'HT';
```

Para JO usar rol `'editor'`; para solo-lectura `'viewer'`. Una vez dentro, el admin
también puede gestionar membresías directamente en la tabla `usuarios_obras`
(las policies se lo permiten).

### 5. Desarrollo local

```bash
npm run dev   # http://localhost:3000
```

### 6. Deploy en Vercel

1. Importar el repo en [vercel.com](https://vercel.com) (framework: Next.js, sin config extra).
2. Cargar `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` en
   **Settings → Environment Variables** (la service key NO va a Vercel).
3. Deploy. En Supabase → **Authentication → URL Configuration** agregar la URL de
   Vercel como Site URL / Redirect URL.

## Modelo de datos

```
obras ─< zonas ─< pisos
         └────< rubros ─< subrubros ─< items ─< avances >─ pisos
usuarios_obras (usuario, obra, rol)
```

- Los **rubros cuelgan de zona** (no de obra) porque en la planilla real el mismo
  rubro ("Albañilería") tiene ítems distintos en cada zona.
- `avances(item_id, piso_id, porcentaje 0..1, porcentaje_anterior, fecha_corte, usuario_id)`
  es append-only; la vista `avances_actuales` expone el último valor por (item, piso).
- Funciones SQL: `curva_avance(obra, zona?)` (avance ponderado a cada fecha de corte) e
  `items_estancados(obra, meses)`.

## Importador: cómo interpreta la planilla

El parser (`src/lib/excel/parse.ts`) reconoce las hojas `SS`, `BAS`, `FU`, `MON`,
`PAL`, `AZ`; los pisos salen de la fila 4 de cada hoja. Las filas con fórmulas
(`SUM`/`SUMPRODUCT`/`AVERAGE`) son **rubros**; si el `SUM` de un rubro referencia otras
filas agregadas (p.ej. "Instalación Sanitaria" → "DESAGUES CLOACALES"), esas filas se
importan como **subrubros**. El monto de cada ítem es el mayor valor numérico antes de
las columnas de piso (los valores ≤ 1 se consideran incidencias, no montos — en la hoja
MON los pesos están expresados así, por lo que esa zona pondera por promedio simple
hasta que se carguen montos reales en el catálogo). La fecha de corte se toma del
nombre de las hojas (`SS - 25-03-26`).

## Estructura

```
supabase/migrations/0001_init.sql   schema + RLS + vistas + funciones
scripts/seed.ts                     seed con la planilla real
data/                               planilla de referencia (25-03-26)
src/lib/excel/parse.ts              xlsx → estructura normalizada
src/lib/excel/export.ts             DB → xlsx con fórmulas de promedio ponderado
src/lib/importar.ts                 upsert idempotente de catálogo + avances
src/app/(app)/                      dashboard, carga, catálogo, importar, exportar
src/app/api/exportar/route.ts       descarga del xlsx
```
