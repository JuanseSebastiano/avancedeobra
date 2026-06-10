import { redirect } from "next/navigation";
import { getCatalogo, getSesion } from "@/lib/data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ItemEditor } from "./item-editor";
import { Selector } from "./selector";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ zona?: string; piso?: string; rubro?: string }>;
}

export default async function CargaPage({ searchParams }: Props) {
  const sesion = await getSesion();
  if (!sesion) redirect("/login");
  const params = await searchParams;

  const catalogo = await getCatalogo(sesion.supabase, sesion.obra.id);
  if (catalogo.zonas.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        Todavía no hay catálogo cargado. Importá la planilla desde la pestaña Importar.
      </p>
    );
  }

  const zona = catalogo.zonas.find((z) => z.id === params.zona) ?? catalogo.zonas[0];
  const pisosZona = catalogo.pisos.filter((p) => p.zona_id === zona.id);
  const rubrosZona = catalogo.rubros.filter((r) => r.zona_id === zona.id);
  const piso = pisosZona.find((p) => p.id === params.piso) ?? pisosZona[0];
  const rubro = rubrosZona.find((r) => r.id === params.rubro) ?? rubrosZona[0];

  const subrubros = rubro
    ? catalogo.subrubros.filter((s) => s.rubro_id === rubro.id)
    : [];
  const subrubroIds = new Set(subrubros.map((s) => s.id));
  const items = catalogo.items.filter((i) => subrubroIds.has(i.subrubro_id));

  // Historial de los ítems visibles en este piso: el más reciente es el valor
  // actual; el primero con fecha_corte anterior es el "avance anterior".
  const historial = piso && items.length > 0
    ? await sesion.supabase
        .from("avances")
        .select("item_id, porcentaje, fecha_corte, created_at")
        .eq("piso_id", piso.id)
        .in("item_id", items.map((i) => i.id))
        .order("fecha_corte", { ascending: false })
        .order("created_at", { ascending: false })
    : { data: [], error: null };
  if (historial.error) throw new Error(historial.error.message);

  const porItem = new Map<string, { actual: number; fechaActual: string; anterior: number | null }>();
  for (const row of historial.data ?? []) {
    const existente = porItem.get(row.item_id);
    if (!existente) {
      porItem.set(row.item_id, {
        actual: row.porcentaje,
        fechaActual: row.fecha_corte,
        anterior: null,
      });
    } else if (existente.anterior === null && row.fecha_corte < existente.fechaActual) {
      existente.anterior = row.porcentaje;
    }
  }

  const editable = sesion.rol !== "viewer";

  return (
    <div className="flex flex-col gap-4">
      <Selector
        zonas={catalogo.zonas.map((z) => ({ id: z.id, nombre: z.nombre }))}
        pisos={pisosZona.map((p) => ({ id: p.id, nombre: `Piso ${p.codigo}` }))}
        rubros={rubrosZona.map((r) => ({ id: r.id, nombre: r.nombre }))}
        zonaId={zona.id}
        pisoId={piso?.id ?? ""}
        rubroId={rubro?.id ?? ""}
      />

      {!piso || !rubro ? (
        <p className="text-sm text-zinc-500">Esta zona no tiene pisos o rubros activos.</p>
      ) : (
        subrubros.map((sub) => {
          const itemsSub = items.filter((i) => i.subrubro_id === sub.id);
          if (itemsSub.length === 0) return null;
          return (
            <Card key={sub.id}>
              <CardHeader>
                <CardTitle>
                  {rubro.nombre}
                  {sub.codigo !== "general" && (
                    <span className="font-normal text-zinc-500"> · {sub.nombre}</span>
                  )}
                  <span className="ml-2 font-normal text-zinc-400">Piso {piso.codigo}</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {itemsSub.map((item) => {
                  const h = porItem.get(item.id);
                  return (
                    <ItemEditor
                      key={`${item.id}-${piso.id}`}
                      itemId={item.id}
                      pisoId={piso.id}
                      descripcion={item.descripcion}
                      monto={item.monto}
                      actual={h ? Math.round(h.actual * 100) : null}
                      anterior={h?.anterior !== null && h?.anterior !== undefined ? Math.round(h.anterior * 100) : null}
                      editable={editable}
                    />
                  );
                })}
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}
