import Link from "next/link";
import { redirect } from "next/navigation";
import {
  formatPct,
  getAvancePorNivel,
  getAvancePorNivelSerie,
  getAvanceRubroNivel,
  getAvancesActuales,
  getCatalogo,
  getSesion,
  promedioPonderado,
} from "@/lib/data";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarrasAvance, CurvaAvance } from "@/components/charts";
import { CortePanel } from "./corte-panel";
import { HeatmapRubroNivel } from "@/components/heatmap";

export const dynamic = "force-dynamic";

const MESES_ESTANCADO = 2;

interface Props {
  searchParams: Promise<{ zona?: string; rubro?: string; responsable?: string }>;
}

export default async function DashboardPage({ searchParams }: Props) {
  const sesion = await getSesion();
  if (!sesion) redirect("/login");
  const params = await searchParams;

  const catalogo = await getCatalogo(sesion.supabase, sesion.obra.id);
  if (catalogo.zonas.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        Todavía no hay datos. Importá la planilla inicial desde la pestaña Importar.
      </p>
    );
  }

  const zonaSel = catalogo.zonas.find((z) => z.id === params.zona) ?? null;
  const responsableSel = params.responsable || null;
  const rubroNombreSel = params.rubro || null;

  const filtroNivel = {
    zonaId: zonaSel?.id ?? null,
    rubroNombre: rubroNombreSel,
  };

  const [avances, curvaRes, estancadosRes, avancePorNivel, serieNivel, rubroNivel] =
    await Promise.all([
    getAvancesActuales(sesion.supabase, sesion.obra.id),
    sesion.supabase.rpc("curva_avance", {
      p_obra: sesion.obra.id,
      p_zona: zonaSel?.id ?? null,
    }),
    sesion.supabase.rpc("items_estancados", {
      p_obra: sesion.obra.id,
      p_meses: MESES_ESTANCADO,
    }),
    getAvancePorNivel(sesion.supabase, sesion.obra.id, filtroNivel),
    getAvancePorNivelSerie(sesion.supabase, sesion.obra.id, filtroNivel),
    getAvanceRubroNivel(sesion.supabase, sesion.obra.id, { zonaId: zonaSel?.id ?? null }),
    ]);
  if (curvaRes.error) throw new Error(curvaRes.error.message);
  if (estancadosRes.error) throw new Error(estancadosRes.error.message);

  // índices item → rubro/zona para agrupar
  const subrubroDeItem = new Map(catalogo.subrubros.map((s) => [s.id, s]));
  const rubroPorId = new Map(catalogo.rubros.map((r) => [r.id, r]));
  const itemInfo = new Map(
    catalogo.items.map((i) => {
      const sub = subrubroDeItem.get(i.subrubro_id);
      const rubro = sub ? rubroPorId.get(sub.rubro_id) : undefined;
      return [i.id, { item: i, rubro }];
    })
  );
  const pisoPorId = new Map(catalogo.pisos.map((p) => [p.id, p]));

  const filtrados = avances.filter((a) => {
    const info = itemInfo.get(a.item_id);
    if (!info?.rubro) return false;
    if (zonaSel && info.rubro.zona_id !== zonaSel.id) return false;
    if (rubroNombreSel && info.rubro.nombre !== rubroNombreSel) return false;
    if (responsableSel && info.rubro.responsable !== responsableSel) return false;
    return true;
  });

  const valores = filtrados.map((a) => ({
    porcentaje: a.porcentaje,
    monto: itemInfo.get(a.item_id)!.item.monto,
  }));
  const total = promedioPonderado(valores);

  const agrupar = (clave: (a: (typeof filtrados)[number]) => string | null) => {
    const grupos = new Map<string, { porcentaje: number; monto: number }[]>();
    for (const a of filtrados) {
      const k = clave(a);
      if (!k) continue;
      const arr = grupos.get(k) ?? [];
      arr.push({ porcentaje: a.porcentaje, monto: itemInfo.get(a.item_id)!.item.monto });
      grupos.set(k, arr);
    }
    return [...grupos.entries()].map(([nombre, vs]) => ({
      nombre,
      porcentaje: promedioPonderado(vs) ?? 0,
    }));
  };

  const porZona = catalogo.zonas
    .map((z) => {
      const vs = avances
        .filter((a) => itemInfo.get(a.item_id)?.rubro?.zona_id === z.id)
        .map((a) => ({ porcentaje: a.porcentaje, monto: itemInfo.get(a.item_id)!.item.monto }));
      return { zona: z, porcentaje: promedioPonderado(vs) };
    })
    .filter((z) => z.porcentaje !== null);

  const porRubro = agrupar((a) => itemInfo.get(a.item_id)?.rubro?.nombre ?? null).sort(
    (a, b) => a.porcentaje - b.porcentaje
  );
  const porPiso = zonaSel
    ? agrupar((a) => {
        const p = pisoPorId.get(a.piso_id);
        return p && p.zona_id === zonaSel.id ? `Piso ${p.codigo}` : null;
      })
    : [];

  const curva = ((curvaRes.data ?? []) as { fecha_corte: string; porcentaje: number }[]).map(
    (c) => ({ fecha: c.fecha_corte, porcentaje: Number(c.porcentaje) })
  );

  const estancados = ((estancadosRes.data ?? []) as {
    item_id: string;
    descripcion: string;
    zona: string;
    rubro: string;
    piso: string;
    porcentaje: number;
    ultimo_registro: string;
  }[]).filter((e) => !zonaSel || e.zona === zonaSel.codigo);

  const responsables = [
    ...new Set(catalogo.rubros.map((r) => r.responsable).filter((r): r is string => !!r)),
  ];
  const nombresRubros = [...new Set(catalogo.rubros.map((r) => r.nombre))].sort();

  const filtroLink = (cambios: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { zona: params.zona, rubro: params.rubro, responsable: params.responsable, ...cambios };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const qs = p.toString();
    return qs ? `/?${qs}` : "/";
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Link href={filtroLink({ zona: undefined })}>
          <Badge variant={!zonaSel ? "green" : "default"}>Toda la obra</Badge>
        </Link>
        {catalogo.zonas.map((z) => (
          <Link key={z.id} href={filtroLink({ zona: z.id })}>
            <Badge variant={zonaSel?.id === z.id ? "green" : "default"}>{z.nombre}</Badge>
          </Link>
        ))}
        {responsables.length > 0 && (
          <span className="ml-2 flex flex-wrap gap-2">
            {responsables.map((r) => (
              <Link
                key={r}
                href={filtroLink({ responsable: responsableSel === r ? undefined : r })}
              >
                <Badge variant={responsableSel === r ? "yellow" : "default"}>{r}</Badge>
              </Link>
            ))}
          </span>
        )}
      </div>
      {rubroNombreSel && (
        <p className="text-sm text-zinc-500">
          Filtrado por rubro <strong>{rubroNombreSel}</strong> ·{" "}
          <Link className="underline" href={filtroLink({ rubro: undefined })}>
            quitar
          </Link>
        </p>
      )}

      {/* Resumen */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="col-span-2 sm:col-span-1">
          <CardHeader>
            <CardTitle className="text-zinc-500">
              {zonaSel ? zonaSel.nombre : "Avance total"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold tabular-nums text-emerald-700">
              {formatPct(total)}
            </p>
            <p className="text-xs text-zinc-500">ponderado por monto</p>
          </CardContent>
        </Card>
        {porZona
          .filter((z) => !zonaSel || z.zona.id === zonaSel.id)
          .slice(0, zonaSel ? 1 : 3)
          .map(({ zona, porcentaje }) => (
            <Card key={zona.id}>
              <CardHeader>
                <CardTitle className="text-zinc-500">{zona.nombre}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold tabular-nums">{formatPct(porcentaje)}</p>
              </CardContent>
            </Card>
          ))}
      </div>

      {/* Corte del edificio */}
      {catalogo.niveles.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>
              Avance por nivel
              {zonaSel ? ` — ${zonaSel.nombre}` : ""}
              {rubroNombreSel ? ` · ${rubroNombreSel}` : ""}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <CortePanel
              niveles={catalogo.niveles.map((n) => ({
                codigo: n.codigo,
                nombre: n.nombre,
                orden: n.orden,
                grupo: n.grupo,
              }))}
              actual={avancePorNivel}
              serie={serieNivel}
            />
          </CardContent>
        </Card>
      )}

      {/* Avance por zona */}
      {!zonaSel && porZona.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Avance ponderado por zona</CardTitle>
          </CardHeader>
          <CardContent>
            <BarrasAvance
              data={porZona.map((z) => ({ nombre: z.zona.nombre, porcentaje: z.porcentaje ?? 0 }))}
            />
          </CardContent>
        </Card>
      )}

      {/* Dónde está frenado cada rubro */}
      {rubroNivel.length > 0 && catalogo.niveles.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Avance por rubro y nivel {zonaSel ? `— ${zonaSel.nombre}` : ""}</CardTitle>
          </CardHeader>
          <CardContent>
            <HeatmapRubroNivel
              datos={rubroNivel}
              niveles={catalogo.niveles.map((n) => ({
                codigo: n.codigo,
                nombre: n.nombre,
                orden: n.orden,
              }))}
            />
          </CardContent>
        </Card>
      )}

      {/* Curva mes a mes */}
      <Card>
        <CardHeader>
          <CardTitle>Curva de avance {zonaSel ? `— ${zonaSel.nombre}` : ""}</CardTitle>
        </CardHeader>
        <CardContent>
          {curva.length > 1 ? (
            <CurvaAvance data={curva} />
          ) : (
            <p className="text-sm text-zinc-500">
              Se necesita más de un corte para graficar la curva. {curva.length === 1 && `Corte actual: ${curva[0].fecha} (${formatPct(curva[0].porcentaje)})`}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Por piso (con zona seleccionada) */}
      {zonaSel && porPiso.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Avance por piso — {zonaSel.nombre}</CardTitle>
          </CardHeader>
          <CardContent>
            <BarrasAvance data={porPiso} />
          </CardContent>
        </Card>
      )}

      {/* Por rubro */}
      <Card>
        <CardHeader>
          <CardTitle>Avance por rubro</CardTitle>
        </CardHeader>
        <CardContent>
          <BarrasAvance data={porRubro} />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {nombresRubros.map((n) => (
              <Link key={n} href={filtroLink({ rubro: rubroNombreSel === n ? undefined : n })}>
                <Badge variant={rubroNombreSel === n ? "yellow" : "default"}>{n}</Badge>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Estancados */}
      <Card>
        <CardHeader>
          <CardTitle>
            Ítems sin avance hace más de {MESES_ESTANCADO} meses{" "}
            <Badge variant={estancados.length > 0 ? "red" : "green"}>{estancados.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {estancados.length === 0 ? (
            <p className="text-sm text-zinc-500">Sin ítems estancados. 👌</p>
          ) : (
            <div className="max-h-80 overflow-y-auto">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-white text-xs uppercase text-zinc-500">
                  <tr>
                    <th className="py-1.5 pr-2">Ítem</th>
                    <th className="py-1.5 pr-2">Zona</th>
                    <th className="py-1.5 pr-2">Piso</th>
                    <th className="py-1.5 pr-2 text-right">%</th>
                    <th className="py-1.5 text-right">Último</th>
                  </tr>
                </thead>
                <tbody>
                  {estancados.slice(0, 200).map((e, i) => (
                    <tr key={`${e.item_id}-${e.piso}-${i}`} className="border-t border-zinc-100">
                      <td className="max-w-64 truncate py-1.5 pr-2" title={e.descripcion}>
                        {e.descripcion}
                        <span className="block text-xs text-zinc-400">{e.rubro}</span>
                      </td>
                      <td className="py-1.5 pr-2">{e.zona}</td>
                      <td className="py-1.5 pr-2">{e.piso}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">
                        {formatPct(Number(e.porcentaje))}
                      </td>
                      <td className="py-1.5 text-right tabular-nums text-zinc-500">
                        {e.ultimo_registro}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
