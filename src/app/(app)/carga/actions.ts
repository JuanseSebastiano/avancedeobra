"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSesion } from "@/lib/data";
import { insertarAvancesEnLote, type CeldaAvance } from "@/lib/avances/diff";

const celdaSchema = z.object({
  itemId: z.string().uuid(),
  pisoId: z.string().uuid(),
  porcentaje: z.number().int().min(0).max(100),
});

/**
 * Tope por guardado. Mantiene el lote en un único `insert` (atómico) y acota el
 * payload de la server action. Un corte completo son ~14.000 celdas, pero con
 * relleno por rango se guarda de a cientos, no de a miles.
 */
const MAX_CELDAS = 5000;

const loteSchema = z.object({
  fecha: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  celdas: z.array(celdaSchema).min(1).max(MAX_CELDAS),
});

/**
 * Cuáles de esos ids pertenecen a la obra.
 *
 * Va por tandas porque la lista de uuids viaja en la URL del GET de PostgREST:
 * un pegado grande puede tocar miles de ítems y reventar el límite de longitud.
 */
async function idsDeLaObra(
  supabase: SupabaseClient,
  tabla: "items" | "pisos",
  obraId: string,
  ids: string[]
): Promise<Set<string>> {
  const TANDA = 200;
  const encontrados = new Set<string>();
  for (let i = 0; i < ids.length; i += TANDA) {
    const { data, error } = await supabase
      .from(tabla)
      .select("id")
      .eq("obra_id", obraId)
      .in("id", ids.slice(i, i + TANDA));
    if (error) throw new Error(`Error validando ${tabla}: ${error.message}`);
    for (const fila of data ?? []) encontrados.add(fila.id as string);
  }
  return encontrados;
}

export type GuardarLoteResultado =
  | {
      ok: true;
      insertados: number;
      sinCambio: number;
      ignoradas: number;
      fechaCorte: string;
    }
  | { ok: false; error: string };

/**
 * Guarda N celdas de la grilla en una sola request.
 *
 * Reemplaza el POST-por-ítem: cargar un rubro sobre 30 pisos pasa de 30 guardados
 * a uno. El diff contra el estado actual lo hace insertarAvancesEnLote(), el
 * mismo que usa el importador.
 */
export async function guardarLote(input: unknown): Promise<GuardarLoteResultado> {
  const parsed = loteSchema.safeParse(input);
  if (!parsed.success) {
    const excede = Array.isArray((input as { celdas?: unknown[] })?.celdas)
      ? (input as { celdas: unknown[] }).celdas.length > MAX_CELDAS
      : false;
    return {
      ok: false,
      error: excede
        ? `Son demasiadas celdas para un solo guardado (máximo ${MAX_CELDAS}). Guardá por partes.`
        : "Hay valores inválidos en el lote",
    };
  }

  const sesion = await getSesion();
  if (!sesion) return { ok: false, error: "Sesión expirada" };
  if (sesion.rol === "viewer") return { ok: false, error: "Tu rol es de solo lectura" };

  const { celdas, fecha } = parsed.data;

  // El obra_id sale de la sesión, nunca del cliente. Además se verifica que los
  // ítems y pisos pertenezcan a esta obra: la policy de avances valida el rol y
  // el usuario, pero no que item_id y piso_id sean de la misma obra.
  const itemIds = [...new Set(celdas.map((c) => c.itemId))];
  const pisoIds = [...new Set(celdas.map((c) => c.pisoId))];

  let itemsOk: Set<string>;
  let pisosOk: Set<string>;
  try {
    [itemsOk, pisosOk] = await Promise.all([
      idsDeLaObra(sesion.supabase, "items", sesion.obra.id, itemIds),
      idsDeLaObra(sesion.supabase, "pisos", sesion.obra.id, pisoIds),
    ]);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error validando el lote" };
  }

  const validas: CeldaAvance[] = [];
  let ignoradas = 0;
  for (const c of celdas) {
    if (!itemsOk.has(c.itemId) || !pisosOk.has(c.pisoId)) {
      ignoradas++;
      continue;
    }
    validas.push({ itemId: c.itemId, pisoId: c.pisoId, porcentaje: c.porcentaje / 100 });
  }

  if (validas.length === 0) {
    return { ok: false, error: "Ninguna de las celdas pertenece a esta obra" };
  }

  const fechaCorte = fecha ?? new Date().toISOString().slice(0, 10);

  try {
    const { insertados, sinCambio } = await insertarAvancesEnLote(
      sesion.supabase,
      sesion.obra.id,
      validas,
      { fechaCorte, usuarioId: sesion.usuarioId }
    );

    revalidatePath("/");
    revalidatePath("/carga");

    return { ok: true, insertados, sinCambio, ignoradas, fechaCorte };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error guardando el lote" };
  }
}

/** Abre (o recupera) el corte de una fecha, para poder cargar con fecha pasada. */
export async function abrirCorte(
  fecha: string
): Promise<{ ok: true; id: string; fecha: string } | { ok: false; error: string }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { ok: false, error: "Fecha inválida" };

  const sesion = await getSesion();
  if (!sesion) return { ok: false, error: "Sesión expirada" };
  if (sesion.rol === "viewer") return { ok: false, error: "Tu rol es de solo lectura" };

  const { data: existente, error: errorLectura } = await sesion.supabase
    .from("cortes")
    .select("id, fecha")
    .eq("obra_id", sesion.obra.id)
    .eq("fecha", fecha)
    .maybeSingle();
  if (errorLectura) return { ok: false, error: errorLectura.message };
  if (existente) return { ok: true, id: existente.id as string, fecha: existente.fecha as string };

  const { data, error } = await sesion.supabase
    .from("cortes")
    .insert({ obra_id: sesion.obra.id, fecha })
    .select("id, fecha")
    .single();
  if (error) return { ok: false, error: error.message };

  revalidatePath("/carga");
  return { ok: true, id: data.id as string, fecha: data.fecha as string };
}
