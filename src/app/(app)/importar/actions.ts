"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSesion } from "@/lib/data";
import { parseWorkbook } from "@/lib/excel/parse";
import { importarWorkbook, type ResultadoImport } from "@/lib/importar";

export type ImportarEstado =
  | { ok: true; resultado: ResultadoImport }
  | { ok: false; error: string }
  | null;

const fechaSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal(""));

export async function importarPlanilla(
  _prev: ImportarEstado,
  formData: FormData
): Promise<ImportarEstado> {
  const sesion = await getSesion();
  if (!sesion) return { ok: false, error: "Sesión expirada" };
  if (sesion.rol !== "admin") {
    return { ok: false, error: "Solo el DDO (admin) puede importar planillas" };
  }

  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) {
    return { ok: false, error: "Seleccioná un archivo .xlsx" };
  }
  const fechaForm = fechaSchema.safeParse(formData.get("fecha") ?? "");
  if (!fechaForm.success) {
    return { ok: false, error: "Fecha de corte inválida" };
  }

  let parsed;
  try {
    parsed = parseWorkbook(await archivo.arrayBuffer());
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo leer el archivo" };
  }

  const fechaCorte =
    fechaForm.data || parsed.fechaCorte || new Date().toISOString().slice(0, 10);

  try {
    const resultado = await importarWorkbook(sesion.supabase, sesion.obra.id, parsed, {
      fechaCorte,
      usuarioId: sesion.usuarioId,
    });
    revalidatePath("/");
    revalidatePath("/carga");
    return { ok: true, resultado };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error importando" };
  }
}
