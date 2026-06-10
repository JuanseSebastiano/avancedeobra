import * as XLSX from "xlsx";

/**
 * Parser de la planilla "AVANCE_DE_OBRA_HARBOUR_TOWER_-_AA-MM-DD.xlsx".
 *
 * Estructura detectada en cada hoja de zona:
 * - Fila 4: rótulos de pisos ("PISO 4SS", "PB", ...) desde la columna C en adelante.
 * - Columna A: descripción. Las filas "agregadas" (con fórmulas SUM/SUMPRODUCT/AVERAGE
 *   en la columna de monto o en las columnas de piso) son rubros.
 * - Si la fórmula SUM de un rubro referencia otras filas agregadas (p.ej.
 *   "Instalación Sanitaria" = SUM(B119,B130,...)), esas filas son subrubros.
 * - Las filas restantes son ítems: monto en la primera columna pre-pisos con un
 *   valor > 1 (las columnas con valores 0..1 son incidencias, no montos) y
 *   avance acumulado 0..1 en cada columna de piso.
 */

export interface ParsedItem {
  descripcion: string;
  monto: number;
  orden: number;
  /** código de piso → avance acumulado 0..1 */
  avances: Record<string, number>;
}

export interface ParsedSubrubro {
  nombre: string;
  orden: number;
  items: ParsedItem[];
}

export interface ParsedRubro {
  nombre: string;
  orden: number;
  subrubros: ParsedSubrubro[];
}

export interface ParsedZona {
  codigo: string;
  nombre: string;
  pisos: string[];
  rubros: ParsedRubro[];
}

export interface ParsedWorkbook {
  fechaCorte: string | null; // ISO yyyy-mm-dd
  zonas: ParsedZona[];
}

const ZONAS: { codigo: string; nombre: string; sheet: RegExp }[] = [
  { codigo: "SS", nombre: "Subsuelos", sheet: /^SS\b/i },
  { codigo: "BAS", nombre: "Basamento", sheet: /^BAS\b/i },
  { codigo: "FU", nombre: "Fuste", sheet: /^FU\b/i },
  { codigo: "MON", nombre: "Montantes", sheet: /^MON\b/i },
  { codigo: "PAL", nombre: "Palieres", sheet: /^PAL\b/i },
  { codigo: "AZ", nombre: "Azoteas", sheet: /^AZ\b/i },
];

const TITULOS_ZONA = new Set([
  "SUBSUELOS",
  "BASAMENTO",
  "FUSTE",
  "MONTANTES",
  "PALIERES",
  "AZOTEA",
  "AZOTEAS",
]);

const HEADER_ROW = 3; // fila 4 (0-based)
const GENERAL = "General";

interface Cell {
  v?: unknown;
  f?: string;
}

function cellAt(ws: XLSX.WorkSheet, r: number, c: number): Cell | undefined {
  return ws[XLSX.utils.encode_cell({ r, c })] as Cell | undefined;
}

function numValue(cell: Cell | undefined): number | null {
  if (!cell || cell.f !== undefined) return null;
  return typeof cell.v === "number" && Number.isFinite(cell.v) ? cell.v : null;
}

/** Expande las referencias de fila de una fórmula =SUM(B10:B14) / =SUM(B119,B130) (0-based). */
function referencedRows(formula: string): Set<number> {
  const rows = new Set<number>();
  for (const m of formula.matchAll(/\$?[A-Z]{1,3}\$?(\d+)(?::\$?[A-Z]{1,3}\$?(\d+))?/g)) {
    const from = parseInt(m[1], 10) - 1;
    const to = m[2] !== undefined ? parseInt(m[2], 10) - 1 : from;
    for (let r = from; r <= to; r++) rows.add(r);
  }
  return rows;
}

function pisoCodigo(label: string): string {
  return label.replace(/^\s*PISO\s*/i, "").trim().toUpperCase();
}

function parseZonaSheet(ws: XLSX.WorkSheet, zona: { codigo: string; nombre: string }): ParsedZona {
  const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1:A1");

  // Pisos: celdas de texto en la fila 4, columnas C en adelante.
  const pisoCols: { col: number; codigo: string }[] = [];
  for (let c = 2; c <= range.e.c; c++) {
    const cell = cellAt(ws, HEADER_ROW, c);
    if (cell && cell.f === undefined && typeof cell.v === "string" && cell.v.trim()) {
      pisoCols.push({ col: c, codigo: pisoCodigo(cell.v) });
    }
  }
  if (pisoCols.length === 0) {
    throw new Error(`Hoja de ${zona.nombre}: no se encontraron columnas de piso en la fila 4`);
  }
  const pisoStart = pisoCols[0].col;

  const rubros: ParsedRubro[] = [];
  let rubroActual: ParsedRubro | null = null;
  let subrubroActual: ParsedSubrubro | null = null;
  let filasSubrubro = new Set<number>(); // filas referenciadas por el SUM del rubro actual
  let orden = 0;

  const nombreRubroUnico = (nombre: string) => {
    let candidato = nombre;
    let n = 2;
    while (rubros.some((r) => r.nombre === candidato)) candidato = `${nombre} (${n++})`;
    return candidato;
  };

  for (let r = HEADER_ROW + 1; r <= range.e.r; r++) {
    const descCell = cellAt(ws, r, 0);
    if (!descCell || typeof descCell.v !== "string") continue;
    const descripcion = descCell.v.replace(/\s+/g, " ").trim();
    if (!descripcion) continue;
    if (TITULOS_ZONA.has(descripcion.toUpperCase())) continue;

    const montoCell = cellAt(ws, r, 1);
    const tieneFormulaPiso = pisoCols.some((p) => cellAt(ws, r, p.col)?.f !== undefined);
    const tieneSumMonto = typeof montoCell?.f === "string" && /^SUM\(/i.test(montoCell.f.trim());
    const esAgregada = tieneFormulaPiso || tieneSumMonto;

    if (esAgregada) {
      if (rubroActual && filasSubrubro.has(r)) {
        subrubroActual = { nombre: descripcion, orden: orden++, items: [] };
        rubroActual.subrubros.push(subrubroActual);
      } else {
        rubroActual = { nombre: nombreRubroUnico(descripcion), orden: orden++, subrubros: [] };
        rubros.push(rubroActual);
        subrubroActual = null;
        filasSubrubro = tieneSumMonto ? referencedRows(montoCell!.f!) : new Set();
      }
      continue;
    }

    // Fila de ítem. Monto: mayor valor numérico pre-pisos; los valores <= 1
    // son incidencias dentro del rubro, no montos.
    let monto = 0;
    for (let c = 1; c < pisoStart; c++) {
      const v = numValue(cellAt(ws, r, c));
      if (v !== null && v > 1 && v > monto) monto = v;
    }

    const avances: Record<string, number> = {};
    for (const p of pisoCols) {
      const v = numValue(cellAt(ws, r, p.col));
      if (v !== null) avances[p.codigo] = Math.min(Math.max(v, 0), 1);
    }

    if (monto === 0 && Object.keys(avances).length === 0) continue; // fila decorativa

    if (!rubroActual) {
      rubroActual = { nombre: nombreRubroUnico("Generales"), orden: orden++, subrubros: [] };
      rubros.push(rubroActual);
    }
    if (!subrubroActual) {
      subrubroActual = { nombre: GENERAL, orden: orden++, items: [] };
      rubroActual.subrubros.push(subrubroActual);
    }

    let desc = descripcion;
    let n = 2;
    while (subrubroActual.items.some((i) => i.descripcion === desc)) {
      desc = `${descripcion} (${n++})`;
    }
    subrubroActual.items.push({ descripcion: desc, monto, orden: orden++, avances });
  }

  return {
    codigo: zona.codigo,
    nombre: zona.nombre,
    pisos: pisoCols.map((p) => p.codigo),
    rubros: rubros.filter((ru) => ru.subrubros.some((s) => s.items.length > 0)),
  };
}

export function parseWorkbook(data: ArrayBuffer | Buffer): ParsedWorkbook {
  const wb = XLSX.read(data, { type: data instanceof ArrayBuffer ? "array" : "buffer", cellFormula: true });

  let fechaCorte: string | null = null;
  const zonas: ParsedZona[] = [];

  for (const zona of ZONAS) {
    const sheetName = wb.SheetNames.find((n) => zona.sheet.test(n.trim()));
    if (!sheetName) continue;

    const m = sheetName.match(/(\d{2})-(\d{2})-(\d{2})/);
    if (m && !fechaCorte) fechaCorte = `20${m[1]}-${m[2]}-${m[3]}`;

    zonas.push(parseZonaSheet(wb.Sheets[sheetName], zona));
  }

  if (zonas.length === 0) {
    throw new Error(
      "El archivo no contiene hojas de zona reconocibles (SS, BAS, FU, MON, PAL, AZ)"
    );
  }

  return { fechaCorte, zonas };
}
