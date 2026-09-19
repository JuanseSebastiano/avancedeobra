/**
 * Borrador de celdas sin guardar, en localStorage.
 *
 * Cubre el caso real de perder señal en obra: hoy, si se corta la conexión, los
 * cambios se pierden sin aviso. Guarda sólo las celdas modificadas (no la grilla
 * entera) y nunca se aplica solo: al volver se ofrece restaurar o descartar,
 * porque resucitar ediciones viejas en silencio es peor que perderlas.
 */

const VERSION = 1;

export interface Borrador {
  v: number;
  guardadoEn: number;
  /** `${itemId}|${pisoId}` → 0..100 (o -1 para sin dato). */
  celdas: Record<string, number>;
}

/** Tope defensivo: un corte completo son ~14.000 celdas y localStorage son ~5 MB. */
const MAX_CELDAS = 8000;

function clave(obraId: string, zonaId: string, fecha: string | null): string {
  return `avance:borrador:${obraId}:${zonaId}:${fecha ?? "actual"}`;
}

export function guardarBorrador(
  obraId: string,
  zonaId: string,
  fecha: string | null,
  celdas: Record<string, number>
): void {
  try {
    const entradas = Object.entries(celdas);
    if (entradas.length === 0) {
      borrarBorrador(obraId, zonaId, fecha);
      return;
    }
    const recorte = entradas.length > MAX_CELDAS ? entradas.slice(0, MAX_CELDAS) : entradas;
    const borrador: Borrador = {
      v: VERSION,
      guardadoEn: Date.now(),
      celdas: Object.fromEntries(recorte),
    };
    localStorage.setItem(clave(obraId, zonaId, fecha), JSON.stringify(borrador));
  } catch {
    // Modo privado, cuota llena o storage bloqueado: el borrador es una red de
    // seguridad, no puede romper la carga.
  }
}

export function leerBorrador(
  obraId: string,
  zonaId: string,
  fecha: string | null
): Borrador | null {
  try {
    const crudo = localStorage.getItem(clave(obraId, zonaId, fecha));
    if (!crudo) return null;
    const parsed = JSON.parse(crudo) as Borrador;
    if (parsed?.v !== VERSION || typeof parsed.celdas !== "object") return null;
    if (Object.keys(parsed.celdas).length === 0) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function borrarBorrador(obraId: string, zonaId: string, fecha: string | null): void {
  try {
    localStorage.removeItem(clave(obraId, zonaId, fecha));
  } catch {
    /* ver guardarBorrador */
  }
}

export function hace(ms: number): string {
  const min = Math.round((Date.now() - ms) / 60000);
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} días`;
}
