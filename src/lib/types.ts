export type Rol = "admin" | "editor" | "viewer";

export interface Obra {
  id: string;
  codigo: string;
  nombre: string;
}

export interface Zona {
  id: string;
  obra_id: string;
  codigo: string;
  nombre: string;
  orden: number;
  activo: boolean;
}

export interface Piso {
  id: string;
  obra_id: string;
  zona_id: string;
  codigo: string;
  orden: number;
  activo: boolean;
  /** Nivel físico al que pertenece. Lo resuelve un trigger, nunca la app. */
  nivel_id: string | null;
}

export interface RubroRow {
  id: string;
  obra_id: string;
  zona_id: string;
  codigo: string;
  nombre: string;
  responsable: string | null;
  orden: number;
  activo: boolean;
}

export interface SubrubroRow {
  id: string;
  obra_id: string;
  rubro_id: string;
  codigo: string;
  nombre: string;
  orden: number;
  activo: boolean;
}

export interface ItemRow {
  id: string;
  obra_id: string;
  subrubro_id: string;
  descripcion: string;
  monto: number;
  orden: number;
  activo: boolean;
}

export interface AvanceActual {
  obra_id: string;
  item_id: string;
  piso_id: string;
  porcentaje: number;
  porcentaje_anterior: number | null;
  fecha_corte: string;
  usuario_id: string | null;
  created_at: string;
}

/** Nivel físico del edificio (4SS … PB … 56), compartido por todas las zonas. */
export interface Nivel {
  id: string;
  obra_id: string;
  codigo: string;
  nombre: string;
  orden: number;
  grupo: GrupoNivel;
  activo: boolean;
}

export type GrupoNivel = "subsuelo" | "basamento" | "torre" | "azotea";

/** Foto mensual del avance. */
export interface Corte {
  id: string;
  obra_id: string;
  fecha: string;
  nombre: string | null;
  estado: "abierto" | "cerrado";
  created_at: string;
}

/**
 * Una fila de avance_por_nivel(). Los porcentajes vienen 0..1, y son `null`
 * cuando el nivel no tiene ningún avance cargado (sin dato ≠ 0 %).
 *
 * Vienen las dos medidas porque en la planilla real la mayoría de los ítems no
 * tiene monto, y esos pesan 0 en el ponderado: comparar `porcentaje` contra
 * `porcentaje_simple` es la única forma de ver cuánto esconde el ponderado.
 */
export interface AvanceNivel {
  codigo: string;
  nombre: string;
  orden: number;
  grupo: GrupoNivel;
  porcentaje: number | null;
  porcentaje_simple: number | null;
  monto: number;
  celdas: number;
  celdas_con_monto: number;
}

/** Una fila de avance_por_nivel_series(): el mismo dato, por fecha de corte. */
export interface AvanceNivelSerie {
  fecha: string;
  codigo: string;
  orden: number;
  porcentaje: number;
}

// ---------------------------------------------------------------------------
// Grilla de carga
// ---------------------------------------------------------------------------

/** Una columna de la grilla. */
export interface GrillaPiso {
  id: string;
  codigo: string;
  orden: number;
  nivelCodigo: string | null;
}

/** Una fila de la grilla: un ítem, con su rubro y subrubro para agrupar. */
export interface GrillaFila {
  itemId: string;
  descripcion: string;
  monto: number;
  rubroId: string;
  rubroNombre: string;
  subrubroId: string;
  subrubroNombre: string;
}

/**
 * Los datos de una zona entera. Se trae por zona y no por (zona, rubro) para que
 * cambiar de rubro sea un filtro en el cliente, sin red.
 *
 * `valores` y `anteriores` son arrays PLANOS indexados `fila * pisos.length + col`.
 * Es la decisión de rendimiento que sostiene todo: la zona más grande (FU) son
 * ~9.000 celdas, y como array de enteros eso se serializa y se edita barato.
 *
 * SIN_DATO (-1) no es 0 %. El esquema no tiene producto cartesiano ítems × pisos,
 * así que una celda nunca cargada es indistinguible de "no aplica a ese piso":
 * colapsarla a 0 sería inventar un dato.
 */
export interface GrillaData {
  zonaId: string;
  corte: { id: string; fecha: string; estado: "abierto" | "cerrado" } | null;
  /** Fecha del corte anterior, para la columna de comparación. */
  fechaAnterior: string | null;
  pisos: GrillaPiso[];
  filas: GrillaFila[];
  valores: number[];
  anteriores: number[];
}

export const SIN_DATO = -1;

/** Una celda de avance_rubro_nivel(): el cruce de un rubro con un nivel. */
export interface AvanceRubroNivel {
  rubro: string;
  codigo: string;
  orden: number;
  porcentaje: number | null;
  porcentaje_simple: number | null;
  celdas: number;
}
