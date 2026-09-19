import { NextResponse } from "next/server";
import { getSesion } from "@/lib/data";
import { cargarGrilla } from "@/lib/avances/grilla";

/**
 * Grilla de carga de una zona.
 *
 * Es un GET y no una server action a propósito: cambiar de zona dispara lecturas
 * que conviene poder cancelar con AbortController cuando el usuario sigue
 * navegando. El guardado sí es server action, para conservar revalidatePath.
 */
export async function GET(request: Request) {
  const sesion = await getSesion();
  if (!sesion) {
    return NextResponse.json({ error: "Sesión expirada" }, { status: 401 });
  }

  const url = new URL(request.url);
  const zonaId = url.searchParams.get("zona");
  const fecha = url.searchParams.get("fecha");

  if (!zonaId) {
    return NextResponse.json({ error: "Falta el parámetro zona" }, { status: 400 });
  }

  try {
    const grilla = await cargarGrilla(sesion.supabase, sesion.obra.id, zonaId, { fecha });
    return NextResponse.json(grilla, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : "Error leyendo la grilla";
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}
