# Avance de Obra — Harbour Tower

Aplicación web para que el Director De Obra (DDO) y los Jefes de Obra (JO) carguen y
consulten el avance físico de obra, reemplazando la planilla Excel mensual
`AVANCE_DE_OBRA_HARBOUR_TOWER_-_AA-MM-DD.xlsx`.

**Stack**: Next.js 15 (App Router) + TypeScript estricto · Supabase (Postgres + Auth + RLS) ·
Tailwind 4 · SheetJS (xlsx) · recharts · Vercel.

## Funcionalidad

| Pantalla | Qué hace |
|---|---|
| **Dashboard** (`/`) | **Corte del edificio** pintado por avance con línea de tiempo entre cortes, heatmap rubro × nivel, avance ponderado (total, por zona, piso y rubro), curva con el delta de cada corte, ítems sin avance hace más de 2 meses, filtros por zona / rubro / responsable |
| **Carga** (`/carga`) | **Grilla ítems × pisos**: selección por arrastre, relleno por rango, pincel, atajos `0`/`1`, pegar un bloque desde Excel, y un solo guardado para N celdas. Mini-corte al costado que se llena mientras se carga |
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
obras ─< zonas ─< pisos >─ niveles        (nivel físico, transversal a las zonas)
         └────< rubros ─< subrubros ─< items ─< avances >─ pisos
                                                  └──────>─ cortes
usuarios_obras (usuario, obra, rol)
```

- Los **rubros cuelgan de zona** (no de obra) porque en la planilla real el mismo
  rubro ("Albañilería") tiene ítems distintos en cada zona.
- `avances(item_id, piso_id, porcentaje 0..1, porcentaje_anterior, fecha_corte, usuario_id)`
  es append-only; la vista `avances_actuales` expone el último valor por (item, piso).
- **`niveles`**: los pisos físicos del edificio (`4SS`…`PB`…`56`, 60 en total). Hace
  falta porque `pisos` cuelga de zona, así que "PISO 12" son tres filas distintas en
  FU, MON y PAL y no había nada a qué agregar el avance de un piso real — que es lo
  que pinta el corte.
- **`cortes`**: la foto mensual con identidad propia, para poder cargar con fecha
  pasada y cerrar un corte. `pisos.nivel_id` y `avances.corte_id` los resuelven
  triggers, no la app, así que ningún camino de escritura puede dejar huérfanos.
  Un corte cerrado se rechaza en la base, no sólo en la UI.
- Funciones SQL: `curva_avance(obra, zona?)` (avance ponderado a cada fecha de corte),
  `items_estancados(obra, meses)`, `avance_por_nivel(obra, fecha?, zona?, rubro?)`,
  `avance_por_nivel_series(...)` (la serie completa para la línea de tiempo),
  `avance_rubro_nivel(...)` (heatmap) y `avances_al_corte(...)` (llena la grilla).

### Ojo con el ponderado por monto

La mayoría de los ítems de la planilla no tiene monto cargado (MON: 0 de 22; FU: 60
de 185; PAL: 26 de 81), y un ítem sin monto pesa **0** en el promedio ponderado. O
sea que un nivel con el fuste al 100 % y las montantes al 0 % hoy se informa como
100 %. Por eso `avance_por_nivel` devuelve también `porcentaje_simple` y
`celdas_con_monto`, y la UI avisa cuando los dos números difieren. **La solución de
fondo es cargar los montos reales desde `/catalogo`**, no un cambio de código.

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
src/lib/avances/diff.ts             diff append-only, compartido por importador y grilla
src/lib/avances/grilla.ts           arma la grilla de una zona
src/lib/corte/geometria.ts          bandas del corte, medidas sobre el plano original
src/lib/corte/escala.ts             escala secuencial de avance (tokens CSS)
src/components/corte.tsx            el corte del edificio en SVG
src/components/heatmap.tsx          heatmap rubro × nivel
src/lib/excel/parse.ts              xlsx → estructura normalizada
src/lib/excel/export.ts             DB → xlsx con fórmulas de promedio ponderado
src/lib/importar.ts                 upsert idempotente de catálogo + avances
src/app/(app)/                      dashboard, carga, catálogo, importar, exportar
src/app/api/exportar/route.ts       descarga del xlsx
src/app/api/carga/grilla/route.ts   datos de la grilla por zona
supabase/migrations/0002_*.sql      niveles, cortes y consultas del corte
```

## El corte del edificio

`Ficha_CORTE.pdf` es un escaneo — una sola imagen JPEG de 796×1754, sin capa
vectorial ni texto. Medido sobre esa imagen resultó una grilla casi perfecta: los
niveles 56 a 6 caen en un paso uniforme de 28,04 px y la silueta son cinco
retranqueos escalonados. Por eso el corte se **redibuja** en SVG
(`src/lib/corte/geometria.ts`) en vez de pintar sobre el escaneo: así se puede
colorear, escala a cualquier tamaño, funciona en modo oscuro, y se pueden incluir
los tres niveles que el plano original no dibuja pero los datos sí registran
(`4SS`, `2` y `5`, que van con borde punteado).

La escala de avance es secuencial de un solo tono, **azul y no verde**: la app ya
usa emerald como color de estado, y usar el mismo tono para magnitud dejaría un
verde intermedio ambiguo entre "a medio hacer" y "OK". Los pasos están en
`globals.css` como custom properties, validados contra las superficies reales de la
app en los dos modos (monotónicos en luminosidad, paso mínimo ΔL ≈ 0,09).
