"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSesion } from "@/lib/data";

const schema = z.object({
  itemId: z.string().uuid(),
  pisoId: z.string().uuid(),
  porcentaje: z.number().min(0).max(100),
});

export type GuardarResultado =
  | { ok: true; porcentaje: number }
  | { ok: false; error: string };

export async function guardarAvance(input: {
  itemId: string;
  pisoId: string;
  porcentaje: number;
}): Promise<GuardarResultado> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Valor inválido" };
  }

  const sesion = await getSesion();
  if (!sesion) return { ok: false, error: "Sesión expirada" };
  if (sesion.rol === "viewer") {
    return { ok: false, error: "Tu rol es de solo lectura" };
  }

  const { itemId, pisoId } = parsed.data;
  const porcentaje = Math.round(parsed.data.porcentaje) / 100;

  const { data: actual, error: actualError } = await sesion.supabase
    .from("avances_actuales")
    .select("porcentaje")
    .eq("item_id", itemId)
    .eq("piso_id", pisoId)
    .maybeSingle();
  if (actualError) return { ok: false, error: actualError.message };

  if (actual && Math.abs(actual.porcentaje - porcentaje) < 1e-6) {
    return { ok: true, porcentaje };
  }

  const { error } = await sesion.supabase.from("avances").insert({
    obra_id: sesion.obra.id,
    item_id: itemId,
    piso_id: pisoId,
    porcentaje,
    porcentaje_anterior: actual?.porcentaje ?? null,
    usuario_id: sesion.usuarioId,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/");
  return { ok: true, porcentaje };
}
