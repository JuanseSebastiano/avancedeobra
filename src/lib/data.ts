import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type {
  AvanceActual,
  AvanceNivel,
  AvanceNivelSerie,
  AvanceRubroNivel,
  Corte,
  ItemRow,
  Nivel,
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
  /** Niveles físicos del edificio, ordenados de abajo hacia arriba. */
  niveles: Nivel[];
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

  const [zonas, pisos, niveles, rubros, subrubros, items] = await Promise.all([
    supabase.from("zonas").select("*").eq("obra_id", obraId).order("orden"),
    supabase.from("pisos").select("*").eq("obra_id", obraId).order("orden"),
    supabase.from("niveles").select("*").eq("obra_id", obraId).order("orden"),
    supabase.from("rubros").select("*").eq("obra_id", obraId).order("orden"),
    supabase.from("subrubros").select("*").eq("obra_id", obraId).order("orden"),
    supabase.from("items").select("*").eq("obra_id", obraId).order("orden").limit(5000),
  ]);

  const err =
    zonas.error ?? pisos.error ?? niveles.error ?? rubros.error ?? subrubros.error ?? items.error;
  if (err) throw new Error(`Error leyendo catálogo: ${err.message}`);

  return {
    zonas: filtrar((zonas.data ?? []) as Zona[]),
    pisos: filtrar((pisos.data ?? []) as Piso[]),
    niveles: filtrar((niveles.data ?? []) as Nivel[]),
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

/** Cortes de la obra, del más reciente al más viejo. */
export async function getCortes(supabase: SupabaseClient, obraId: string): Promise<Corte[]> {
  const { data, error } = await supabase
    .from("cortes")
    .select("*")
    .eq("obra_id", obraId)
    .order("fecha", { ascending: false });
  if (error) throw new Error(`Error leyendo cortes: ${error.message}`);
  return (data ?? []) as Corte[];
}

export interface FiltroNivel {
  /** null = último estado conocido. */
  fecha?: string | null;
  zonaId?: string | null;
  /**
   * Nombre del rubro, no su id: los rubros cuelgan de zona, así que
   * "Albañilería" son seis filas distintas y filtrar por id daría una sola zona.
   */
  rubroNombre?: string | null;
}

/**
 * Avance por nivel físico: ~60 filas en vez de las ~13.500 celdas que haría
 * falta bajar para calcularlo en el cliente. Devuelve todos los niveles; los que
 * no tienen avances cargados vienen con porcentaje `null` ("sin dato", que no es
 * lo mismo que 0 %).
 */
export async function getAvancePorNivel(
  supabase: SupabaseClient,
  obraId: string,
  filtro: FiltroNivel = {}
): Promise<AvanceNivel[]> {
  const { data, error } = await supabase.rpc("avance_por_nivel", {
    p_obra: obraId,
    p_fecha: filtro.fecha ?? null,
    p_zona: filtro.zonaId ?? null,
    p_rubro: filtro.rubroNombre ?? null,
  });
  if (error) throw new Error(`Error leyendo avance por nivel: ${error.message}`);
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return ((data ?? []) as AvanceNivel[]).map((r) => ({
    ...r,
    porcentaje: num(r.porcentaje),
    porcentaje_simple: num(r.porcentaje_simple),
    monto: Number(r.monto ?? 0),
    celdas: Number(r.celdas ?? 0),
    celdas_con_monto: Number(r.celdas_con_monto ?? 0),
  }));
}

/**
 * La misma serie para todas las fechas de corte de una sola vez, para que la
 * línea de tiempo del corte se pueda mover sin latencia.
 */
export async function getAvancePorNivelSerie(
  supabase: SupabaseClient,
  obraId: string,
  filtro: Omit<FiltroNivel, "fecha"> = {}
): Promise<AvanceNivelSerie[]> {
  const { data, error } = await supabase.rpc("avance_por_nivel_series", {
    p_obra: obraId,
    p_zona: filtro.zonaId ?? null,
    p_rubro: filtro.rubroNombre ?? null,
  });
  if (error) throw new Error(`Error leyendo serie por nivel: ${error.message}`);
  return ((data ?? []) as AvanceNivelSerie[]).map((r) => ({
    ...r,
    porcentaje: Number(r.porcentaje),
  }));
}

// Re-export para no romper los imports existentes desde "@/lib/data".
export { promedioPonderado, formatPct } from "@/lib/formato";

/** Avance cruzado rubro × nivel, para el heatmap. */
export async function getAvanceRubroNivel(
  supabase: SupabaseClient,
  obraId: string,
  filtro: { fecha?: string | null; zonaId?: string | null } = {}
): Promise<AvanceRubroNivel[]> {
  const { data, error } = await supabase.rpc("avance_rubro_nivel", {
    p_obra: obraId,
    p_fecha: filtro.fecha ?? null,
    p_zona: filtro.zonaId ?? null,
  });
  if (error) throw new Error(`Error leyendo avance por rubro y nivel: ${error.message}`);
  return ((data ?? []) as AvanceRubroNivel[]).map((r) => ({
    ...r,
    porcentaje: r.porcentaje === null ? null : Number(r.porcentaje),
    porcentaje_simple: r.porcentaje_simple === null ? null : Number(r.porcentaje_simple),
    celdas: Number(r.celdas ?? 0),
  }));
}
