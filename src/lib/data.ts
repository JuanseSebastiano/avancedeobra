import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type {
  AvanceActual,
  ItemRow,
  Obra,
  Piso,
  Rol,
  RubroRow,
  SubrubroRow,
  Zona,
} from "@/lib/types";

export interface Sesion {
  usuarioId: string;
  email: string;
  obra: Obra;
  rol: Rol;
  supabase: SupabaseClient;
}

/** Usuario autenticado + primera obra a la que pertenece (la app es mono-obra por ahora). */
export async function getSesion(): Promise<Sesion | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: membresia, error } = await supabase
    .from("usuarios_obras")
    .select("rol, obras(id, codigo, nombre)")
    .eq("usuario_id", user.id)
    .limit(1)
    .maybeSingle();
  if (error || !membresia || !membresia.obras) return null;

  return {
    usuarioId: user.id,
    email: user.email ?? "",
    obra: membresia.obras as unknown as Obra,
    rol: membresia.rol as Rol,
    supabase,
  };
}

export interface Catalogo {
  zonas: Zona[];
  pisos: Piso[];
  rubros: RubroRow[];
  subrubros: SubrubroRow[];
  items: ItemRow[];
}

export async function getCatalogo(
  supabase: SupabaseClient,
  obraId: string,
  opts: { incluirInactivos?: boolean } = {}
): Promise<Catalogo> {
  const filtrar = <T extends { activo: boolean }>(rows: T[]) =>
    opts.incluirInactivos ? rows : rows.filter((r) => r.activo);

  const [zonas, pisos, rubros, subrubros, items] = await Promise.all([
    supabase.from("zonas").select("*").eq("obra_id", obraId).order("orden"),
    supabase.from("pisos").select("*").eq("obra_id", obraId).order("orden"),
    supabase.from("rubros").select("*").eq("obra_id", obraId).order("orden"),
    supabase.from("subrubros").select("*").eq("obra_id", obraId).order("orden"),
    supabase.from("items").select("*").eq("obra_id", obraId).order("orden").limit(5000),
  ]);

  const err = zonas.error ?? pisos.error ?? rubros.error ?? subrubros.error ?? items.error;
  if (err) throw new Error(`Error leyendo catálogo: ${err.message}`);

  return {
    zonas: filtrar((zonas.data ?? []) as Zona[]),
    pisos: filtrar((pisos.data ?? []) as Piso[]),
    rubros: filtrar((rubros.data ?? []) as RubroRow[]),
    subrubros: filtrar((subrubros.data ?? []) as SubrubroRow[]),
    items: filtrar((items.data ?? []) as ItemRow[]),
  };
}

export async function getAvancesActuales(
  supabase: SupabaseClient,
  obraId: string
): Promise<AvanceActual[]> {
  const { data, error } = await supabase
    .from("avances_actuales")
    .select("*")
    .eq("obra_id", obraId)
    .limit(50000);
  if (error) throw new Error(`Error leyendo avances: ${error.message}`);
  return (data ?? []) as AvanceActual[];
}

/** Promedio ponderado por monto; si no hay montos (peso 0), promedio simple. */
export function promedioPonderado(valores: { porcentaje: number; monto: number }[]): number | null {
  if (valores.length === 0) return null;
  const pesoTotal = valores.reduce((s, v) => s + v.monto, 0);
  if (pesoTotal > 0) {
    return valores.reduce((s, v) => s + v.porcentaje * v.monto, 0) / pesoTotal;
  }
  return valores.reduce((s, v) => s + v.porcentaje, 0) / valores.length;
}

export function formatPct(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return `${(v * 100).toFixed(1).replace(/\.0$/, "")}%`;
}
