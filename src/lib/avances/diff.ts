import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Inserción append-only de avances con diff contra el estado actual.
 *
 * Es el único lugar donde se decide qué es "un cambio": lo usan tanto el
 * importador de planillas (src/lib/importar.ts) como el guardado en lote de la
 * grilla de carga, para que no puedan divergir.
 *
 * `avances` no tiene UPDATE ni DELETE: cada cambio es una fila nueva, y la vista
 * `avances_actuales` expone el último valor por (item, piso). El `corte_id` lo
 * resuelve un trigger a partir de `fecha_corte`, así que acá no se toca.
 */

/** Una celda de la grilla. `porcentaje` va 0..1, igual que en la DB. */
export interface CeldaAvance {
  itemId: string;
  pisoId: string;
  porcentaje: number;
}

export interface ResultadoLote {
  insertados: number;
  sinCambio: number;
}

/**
 * Por encima de este número de ítems distintos conviene traer el estado
 * completo de la obra en vez de filtrar por `in`: la lista de uuids viaja en la
 * URL del GET de PostgREST y se vuelve enorme.
 */
const MAX_ITEMS_EN_FILTRO = 200;

const LOTE_INSERT = 1000;

export async function insertarAvancesEnLote(
  supabase: SupabaseClient,
  obraId: string,
  celdas: CeldaAvance[],
  opts: { fechaCorte: string; usuarioId: string | null }
): Promise<ResultadoLote> {
  if (celdas.length === 0) return { insertados: 0, sinCambio: 0 };

  const itemIds = [...new Set(celdas.map((c) => c.itemId))];

  // Estado actual sólo de lo que se va a tocar. El importador manda miles de
  // ítems y cae en el camino completo; un guardado de grilla toca decenas.
  let consulta = supabase
    .from("avances_actuales")
    .select("item_id, piso_id, porcentaje")
    .eq("obra_id", obraId);
  consulta =
    itemIds.length <= MAX_ITEMS_EN_FILTRO
      ? consulta.in("item_id", itemIds)
      : consulta.limit(50000);

  const { data, error } = await consulta;
  if (error) throw new Error(`Error leyendo avances actuales: ${error.message}`);

  const actual = new Map(
    (data ?? []).map((a) => [`${a.item_id}|${a.piso_id}`, a.porcentaje as number])
  );

  const nuevos: Record<string, unknown>[] = [];
  let sinCambio = 0;

  for (const celda of celdas) {
    const previo = actual.get(`${celda.itemId}|${celda.pisoId}`);
    if (previo !== undefined && Math.abs(previo - celda.porcentaje) < 1e-6) {
      sinCambio++;
      continue;
    }
    nuevos.push({
      obra_id: obraId,
      item_id: celda.itemId,
      piso_id: celda.pisoId,
      porcentaje: celda.porcentaje,
      porcentaje_anterior: previo ?? null,
      fecha_corte: opts.fechaCorte,
      usuario_id: opts.usuarioId,
    });
  }

  for (let i = 0; i < nuevos.length; i += LOTE_INSERT) {
    const { error: errInsert } = await supabase
      .from("avances")
      .insert(nuevos.slice(i, i + LOTE_INSERT));
    if (errInsert) throw new Error(`Error insertando avances: ${errInsert.message}`);
  }

  return { insertados: nuevos.length, sinCambio };
}
