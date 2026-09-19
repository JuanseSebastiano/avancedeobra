import type { SupabaseClient } from "@supabase/supabase-js";
import { SIN_DATO } from "@/lib/types";
import type { Corte, GrillaData, GrillaFila, GrillaPiso, ItemRow, Nivel, Piso, RubroRow, SubrubroRow } from "@/lib/types";

/**
 * Arma la grilla de carga de una zona entera.
 *
 * Trae sólo lo de la zona pedida (no el catálogo completo como hacía /carga) y
 * devuelve los avances como arrays planos, listos para que el cliente los edite
 * sin volver a pedir nada al cambiar de rubro.
 */
export async function cargarGrilla(
  supabase: SupabaseClient,
  obraId: string,
  zonaId: string,
  opts: { fecha?: string | null } = {}
): Promise<GrillaData> {
  const [pisosRes, rubrosRes, nivelesRes, cortesRes] = await Promise.all([
    supabase.from("pisos").select("*").eq("zona_id", zonaId).order("orden"),
    supabase.from("rubros").select("*").eq("zona_id", zonaId).order("orden"),
    supabase.from("niveles").select("id, codigo").eq("obra_id", obraId),
    supabase.from("cortes").select("*").eq("obra_id", obraId).order("fecha", { ascending: false }),
  ]);

  const primerError = pisosRes.error ?? rubrosRes.error ?? nivelesRes.error ?? cortesRes.error;
  if (primerError) throw new Error(`Error leyendo la grilla: ${primerError.message}`);

  const pisosRaw = ((pisosRes.data ?? []) as Piso[]).filter((p) => p.activo);
  const rubros = ((rubrosRes.data ?? []) as RubroRow[]).filter((r) => r.activo);
  const cortes = (cortesRes.data ?? []) as Corte[];
  const nivelPorId = new Map(
    ((nivelesRes.data ?? []) as Pick<Nivel, "id" | "codigo">[]).map((n) => [n.id, n.codigo])
  );

  // El corte activo es el pedido, o el más reciente. `fechaAnterior` es el corte
  // previo, que es lo que la planilla muestra como columna de comparación
  // (no `avances.porcentaje_anterior`, que es el valor previo inmediato).
  const corteActivo = opts.fecha
    ? (cortes.find((c) => c.fecha === opts.fecha) ?? null)
    : (cortes[0] ?? null);
  const indiceActivo = corteActivo ? cortes.findIndex((c) => c.id === corteActivo.id) : -1;
  const fechaAnterior =
    indiceActivo >= 0 && indiceActivo + 1 < cortes.length ? cortes[indiceActivo + 1].fecha : null;

  const pisos: GrillaPiso[] = pisosRaw.map((p) => ({
    id: p.id,
    codigo: p.codigo,
    orden: p.orden,
    nivelCodigo: p.nivel_id ? (nivelPorId.get(p.nivel_id) ?? null) : null,
  }));

  const filas = await cargarFilas(supabase, rubros);

  const ancho = pisos.length;
  const valores = new Array<number>(filas.length * ancho).fill(SIN_DATO);
  const anteriores = new Array<number>(filas.length * ancho).fill(SIN_DATO);

  if (filas.length > 0 && ancho > 0) {
    const filaDe = new Map(filas.map((f, i) => [f.itemId, i]));
    const colDe = new Map(pisos.map((p, i) => [p.id, i]));

    const volcar = async (fecha: string | null, destino: number[]) => {
      const { data, error } = await supabase.rpc("avances_al_corte", {
        p_obra: obraId,
        p_fecha: fecha,
        p_zona: zonaId,
      });
      if (error) throw new Error(`Error leyendo avances: ${error.message}`);
      for (const row of (data ?? []) as { item_id: string; piso_id: string; porcentaje: number }[]) {
        const f = filaDe.get(row.item_id);
        const c = colDe.get(row.piso_id);
        if (f === undefined || c === undefined) continue;
        destino[f * ancho + c] = Math.round(Number(row.porcentaje) * 100);
      }
    };

    await volcar(corteActivo?.fecha ?? null, valores);
    if (fechaAnterior) await volcar(fechaAnterior, anteriores);
  }

  return {
    zonaId,
    corte: corteActivo
      ? { id: corteActivo.id, fecha: corteActivo.fecha, estado: corteActivo.estado }
      : null,
    fechaAnterior,
    pisos,
    filas,
    valores,
    anteriores,
  };
}

/** Ítems de los rubros de la zona, aplanados y ordenados como se ven en pantalla. */
async function cargarFilas(
  supabase: SupabaseClient,
  rubros: RubroRow[]
): Promise<GrillaFila[]> {
  if (rubros.length === 0) return [];

  const { data: subData, error: subError } = await supabase
    .from("subrubros")
    .select("*")
    .in(
      "rubro_id",
      rubros.map((r) => r.id)
    )
    .order("orden");
  if (subError) throw new Error(`Error leyendo subrubros: ${subError.message}`);
  const subrubros = ((subData ?? []) as SubrubroRow[]).filter((s) => s.activo);
  if (subrubros.length === 0) return [];

  const { data: itemData, error: itemError } = await supabase
    .from("items")
    .select("*")
    .in(
      "subrubro_id",
      subrubros.map((s) => s.id)
    )
    .order("orden")
    .limit(5000);
  if (itemError) throw new Error(`Error leyendo ítems: ${itemError.message}`);
  const items = ((itemData ?? []) as ItemRow[]).filter((i) => i.activo);

  const rubroPorId = new Map(rubros.map((r) => [r.id, r]));
  const subrubroPorId = new Map(subrubros.map((s) => [s.id, s]));

  const filas: GrillaFila[] = [];
  for (const item of items) {
    const subrubro = subrubroPorId.get(item.subrubro_id);
    if (!subrubro) continue;
    const rubro = rubroPorId.get(subrubro.rubro_id);
    if (!rubro) continue;
    filas.push({
      itemId: item.id,
      descripcion: item.descripcion,
      monto: Number(item.monto),
      rubroId: rubro.id,
      rubroNombre: rubro.nombre,
      subrubroId: subrubro.id,
      subrubroNombre: subrubro.nombre,
    });
  }

  // Orden de pantalla: rubro, luego subrubro, luego ítem.
  const ordenRubro = new Map(rubros.map((r, i) => [r.id, i]));
  const ordenSub = new Map(subrubros.map((s, i) => [s.id, i]));
  filas.sort(
    (a, b) =>
      (ordenRubro.get(a.rubroId) ?? 0) - (ordenRubro.get(b.rubroId) ?? 0) ||
      (ordenSub.get(a.subrubroId) ?? 0) - (ordenSub.get(b.subrubroId) ?? 0)
  );

  return filas;
}
