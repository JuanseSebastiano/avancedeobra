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
