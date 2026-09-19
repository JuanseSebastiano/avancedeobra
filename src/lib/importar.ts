import type { SupabaseClient } from "@supabase/supabase-js";
import type { ParsedWorkbook } from "@/lib/excel/parse";
import { insertarAvancesEnLote, type CeldaAvance } from "@/lib/avances/diff";

/**
 * Vuelca un workbook parseado a la DB de forma idempotente:
 * - catálogo por upsert sobre las claves naturales (codigo / descripcion),
 * - avances append-only: solo inserta filas cuando el valor difiere del actual.
 */

function slug(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

export interface ResultadoImport {
  zonas: number;
  pisos: number;
  rubros: number;
  subrubros: number;
  items: number;
  avancesInsertados: number;
  avancesSinCambio: number;
  fechaCorte: string;
}

export async function importarWorkbook(
  supabase: SupabaseClient,
  obraId: string,
  parsed: ParsedWorkbook,
  opts: { fechaCorte: string; usuarioId: string | null }
): Promise<ResultadoImport> {
  const upsert = async <T extends { id: string }>(
    tabla: string,
    rows: Record<string, unknown>[],
    onConflict: string
  ): Promise<T[]> => {
    if (rows.length === 0) return [];
    const { data, error } = await supabase
      .from(tabla)
      .upsert(rows, { onConflict })
      .select();
    if (error) throw new Error(`Error importando ${tabla}: ${error.message}`);
    return data as T[];
  };

  // 1. Zonas
  const zonas = await upsert<{ id: string; codigo: string }>(
    "zonas",
    parsed.zonas.map((z, i) => ({
      obra_id: obraId,
      codigo: z.codigo,
      nombre: z.nombre,
      orden: i,
    })),
    "obra_id,codigo"
  );
  const zonaId = new Map(zonas.map((z) => [z.codigo, z.id]));

  // 2. Pisos
  const pisos = await upsert<{ id: string; zona_id: string; codigo: string }>(
    "pisos",
    parsed.zonas.flatMap((z) =>
      z.pisos.map((codigo, i) => ({
        obra_id: obraId,
        zona_id: zonaId.get(z.codigo)!,
        codigo,
        orden: i,
      }))
    ),
    "zona_id,codigo"
  );
  const pisoId = new Map(pisos.map((p) => [`${p.zona_id}|${p.codigo}`, p.id]));

  // 3. Rubros
  const rubros = await upsert<{ id: string; zona_id: string; codigo: string }>(
    "rubros",
    parsed.zonas.flatMap((z) =>
      z.rubros.map((r) => ({
        obra_id: obraId,
        zona_id: zonaId.get(z.codigo)!,
        codigo: slug(r.nombre),
        nombre: r.nombre,
        orden: r.orden,
      }))
    ),
    "zona_id,codigo"
  );
  const rubroId = new Map(rubros.map((r) => [`${r.zona_id}|${r.codigo}`, r.id]));

  // 4. Subrubros
  const subrubros = await upsert<{ id: string; rubro_id: string; codigo: string }>(
    "subrubros",
    parsed.zonas.flatMap((z) =>
      z.rubros.flatMap((r) =>
        r.subrubros.map((s) => ({
          obra_id: obraId,
          rubro_id: rubroId.get(`${zonaId.get(z.codigo)}|${slug(r.nombre)}`)!,
          codigo: slug(s.nombre),
          nombre: s.nombre,
          orden: s.orden,
        }))
      )
    ),
    "rubro_id,codigo"
  );
  const subrubroId = new Map(subrubros.map((s) => [`${s.rubro_id}|${s.codigo}`, s.id]));

  // 5. Items
  const itemsRows = parsed.zonas.flatMap((z) =>
    z.rubros.flatMap((r) => {
      const rId = rubroId.get(`${zonaId.get(z.codigo)}|${slug(r.nombre)}`)!;
      return r.subrubros.flatMap((s) =>
        s.items.map((it) => ({
          obra_id: obraId,
          subrubro_id: subrubroId.get(`${rId}|${slug(s.nombre)}`)!,
          descripcion: it.descripcion,
          monto: it.monto,
          orden: it.orden,
        }))
      );
    })
  );
  const items = await upsert<{ id: string; subrubro_id: string; descripcion: string }>(
    "items",
    itemsRows,
    "subrubro_id,descripcion"
  );
  const itemId = new Map(items.map((i) => [`${i.subrubro_id}|${i.descripcion}`, i.id]));

  // 6. Avances: el diff contra el estado actual vive en src/lib/avances/diff.ts,
  //    compartido con el guardado en lote de la grilla de carga.
  const celdas: CeldaAvance[] = [];
  for (const z of parsed.zonas) {
    const zId = zonaId.get(z.codigo)!;
    for (const r of z.rubros) {
      const rId = rubroId.get(`${zId}|${slug(r.nombre)}`)!;
      for (const s of r.subrubros) {
        const sId = subrubroId.get(`${rId}|${slug(s.nombre)}`)!;
        for (const it of s.items) {
          const iId = itemId.get(`${sId}|${it.descripcion}`)!;
          for (const [pisoCodigo, porcentaje] of Object.entries(it.avances)) {
            const pId = pisoId.get(`${zId}|${pisoCodigo}`);
            if (!pId) continue;
            celdas.push({ itemId: iId, pisoId: pId, porcentaje });
          }
        }
      }
    }
  }

  const { insertados, sinCambio } = await insertarAvancesEnLote(supabase, obraId, celdas, {
    fechaCorte: opts.fechaCorte,
    usuarioId: opts.usuarioId,
  });

  return {
    zonas: zonas.length,
    pisos: pisos.length,
    rubros: rubros.length,
    subrubros: subrubros.length,
    items: items.length,
    avancesInsertados: insertados,
    avancesSinCambio: sinCambio,
    fechaCorte: opts.fechaCorte,
  };
}
