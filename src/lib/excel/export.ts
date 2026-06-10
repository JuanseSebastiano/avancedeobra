import * as XLSX from "xlsx";
import type { Catalogo } from "@/lib/data";
import type { AvanceActual } from "@/lib/types";

/**
 * Genera el xlsx de reporte con el formato de la planilla original:
 * una hoja por zona ("SS - AA-MM-DD", ...) y una hoja "PROM. PONDERADO XX"
 * por zona. Los promedios ponderados se escriben como FÓRMULAS Excel
 * (SUMPRODUCT/SUM con los montos como peso, con fallback AVERAGE cuando los
 * montos son 0) para que el archivo se recalcule si se editan % o montos.
 */

interface Sheet {
  cells: Record<string, XLSX.CellObject>;
  maxR: number;
  maxC: number;
}

function newSheet(): Sheet {
  return { cells: {}, maxR: 0, maxC: 0 };
}

function set(s: Sheet, r: number, c: number, cell: XLSX.CellObject) {
  s.cells[XLSX.utils.encode_cell({ r, c })] = cell;
  if (r > s.maxR) s.maxR = r;
  if (c > s.maxC) s.maxC = c;
}

const txt = (v: string): XLSX.CellObject => ({ t: "s", v });
const num = (v: number, z?: string): XLSX.CellObject => ({ t: "n", v, ...(z ? { z } : {}) });
const pct = (v: number): XLSX.CellObject => ({ t: "n", v, z: "0%" });
const fml = (f: string, z = "0%"): XLSX.CellObject => ({ t: "n", f, z });

function toWorksheet(s: Sheet, colWidths?: number[]): XLSX.WorkSheet {
  const ws: XLSX.WorkSheet = { ...s.cells };
  ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: s.maxR, c: s.maxC } });
  if (colWidths) ws["!cols"] = colWidths.map((wch) => ({ wch }));
  return ws;
}

const col = (c: number) => XLSX.utils.encode_col(c);

function fechaCorta(fecha: Date): string {
  const aa = String(fecha.getFullYear()).slice(2);
  const mm = String(fecha.getMonth() + 1).padStart(2, "0");
  const dd = String(fecha.getDate()).padStart(2, "0");
  return `${aa}-${mm}-${dd}`;
}

export function nombreArchivo(fecha: Date): string {
  return `AVANCE_DE_OBRA_HARBOUR_TOWER_-_${fechaCorta(fecha)}.xlsx`;
}

export function buildWorkbook(
  catalogo: Catalogo,
  avances: AvanceActual[],
  fecha: Date
): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const sufijo = fechaCorta(fecha);

  const avance = new Map(avances.map((a) => [`${a.item_id}|${a.piso_id}`, a.porcentaje]));
  const prom: { zonaNombre: string; zonaCodigo: string; sheetName: string; rubros: { nombre: string; row: number; montoRef: string }[]; pisos: string[] }[] = [];

  for (const zona of catalogo.zonas) {
    const pisos = catalogo.pisos.filter((p) => p.zona_id === zona.id);
    const rubros = catalogo.rubros.filter((r) => r.zona_id === zona.id);
    if (pisos.length === 0 || rubros.length === 0) continue;

    const s = newSheet();
    const sheetName = `${zona.codigo} - ${sufijo}`;
    const PISO0 = 3; // columna D: primer piso
    // A: descripción | B: monto | C: incidencia | D...: pisos
    set(s, 3, 0, txt("ESTADO DE AVANCE"));
    set(s, 5, 0, txt(zona.nombre.toUpperCase()));
    pisos.forEach((p, i) => {
      set(s, 3, PISO0 + i, txt(`PISO ${p.codigo}`));
      set(s, 4, PISO0 + i, txt("ACUMULADO %"));
    });

    const rubroRows: { nombre: string; row: number; montoRef: string }[] = [];
    let r = 6;

    for (const rubro of rubros) {
      const subrubros = catalogo.subrubros.filter((sr) => sr.rubro_id === rubro.id);
      const bloques = subrubros
        .map((sr) => ({
          subrubro: sr,
          items: catalogo.items.filter((i) => i.subrubro_id === sr.id),
        }))
        .filter((b) => b.items.length > 0);
      if (bloques.length === 0) continue;

      const rubroRow = r;
      const soloGeneral = bloques.length === 1 && bloques[0].subrubro.codigo === "general";
      set(s, rubroRow, 0, txt(rubro.nombre));
      rubroRows.push({ nombre: rubro.nombre, row: rubroRow, montoRef: `B${rubroRow + 1}` });
      r++;

      const escribirItems = (items: typeof catalogo.items, headerRow: number) => {
        const first = r;
        for (const item of items) {
          set(s, r, 0, txt(item.descripcion));
          set(s, r, 1, num(item.monto, "#,##0"));
          set(s, r, 2, fml(`IFERROR(B${r + 1}/B$${headerRow + 1},0)`, "0.0%"));
          pisos.forEach((p, i) => {
            const v = avance.get(`${item.id}|${p.id}`);
            if (v !== undefined) set(s, r, PISO0 + i, pct(v));
          });
          r++;
        }
        return { first, last: r - 1 };
      };

      if (soloGeneral) {
        const { first, last } = escribirItems(bloques[0].items, rubroRow);
        set(s, rubroRow, 1, fml(`SUM(B${first + 1}:B${last + 1})`, "#,##0"));
        pisos.forEach((_, i) => {
          const c = col(PISO0 + i);
          const rango = `${c}${first + 1}:${c}${last + 1}`;
          const montos = `$B$${first + 1}:$B$${last + 1}`;
          set(
            s,
            rubroRow,
            PISO0 + i,
            fml(`IFERROR(SUMPRODUCT(${montos},${rango})/B$${rubroRow + 1},AVERAGE(${rango}))`)
          );
        });
      } else {
        const subRows: number[] = [];
        for (const bloque of bloques) {
          const subRow = r;
          subRows.push(subRow);
          set(s, subRow, 0, txt(bloque.subrubro.nombre.toUpperCase()));
          r++;
          const { first, last } = escribirItems(bloque.items, subRow);
          set(s, subRow, 1, fml(`SUM(B${first + 1}:B${last + 1})`, "#,##0"));
          pisos.forEach((_, i) => {
            const c = col(PISO0 + i);
            const rango = `${c}${first + 1}:${c}${last + 1}`;
            const montos = `$B$${first + 1}:$B$${last + 1}`;
            set(
              s,
              subRow,
              PISO0 + i,
              fml(`IFERROR(SUMPRODUCT(${montos},${rango})/B$${subRow + 1},AVERAGE(${rango}))`)
            );
          });
        }
        set(s, rubroRow, 1, fml(`SUM(${subRows.map((sr) => `B${sr + 1}`).join(",")})`, "#,##0"));
        pisos.forEach((_, i) => {
          const c = col(PISO0 + i);
          const productos = subRows.map((sr) => `B${sr + 1}*${c}${sr + 1}`).join("+");
          const promedio = `AVERAGE(${subRows.map((sr) => `${c}${sr + 1}`).join(",")})`;
          set(
            s,
            rubroRow,
            PISO0 + i,
            fml(`IFERROR((${productos})/B$${rubroRow + 1},${promedio})`)
          );
        });
      }
      r++; // fila en blanco entre rubros
    }

    XLSX.utils.book_append_sheet(wb, toWorksheet(s, [60, 14, 9, ...pisos.map(() => 9)]), sheetName);
    prom.push({
      zonaNombre: zona.nombre,
      zonaCodigo: zona.codigo,
      sheetName,
      rubros: rubroRows,
      pisos: pisos.map((p) => p.codigo),
    });
  }

  // Hojas de promedios ponderados, una por zona, 100% fórmulas.
  for (const z of prom) {
    const s = newSheet();
    const ref = `'${z.sheetName}'`;
    const PISO0 = 2; // columna C: primer piso
    set(s, 0, 0, txt(`PROMEDIO PONDERADO ${z.zonaNombre.toUpperCase()}`));
    set(s, 1, 0, txt("Rubro"));
    set(s, 1, 1, txt("Monto"));
    z.pisos.forEach((codigo, i) => set(s, 1, PISO0 + i, txt(`PISO ${codigo}`)));
    set(s, 1, PISO0 + z.pisos.length, txt("PROMEDIO"));

    z.rubros.forEach((rubro, idx) => {
      const r = 2 + idx;
      set(s, r, 0, txt(rubro.nombre));
      set(s, r, 1, fml(`${ref}!${rubro.montoRef}`, "#,##0"));
      z.pisos.forEach((_, i) => {
        // misma columna de piso que en la hoja de la zona (los pisos arrancan en D)
        set(s, r, PISO0 + i, fml(`${ref}!${col(3 + i)}${rubro.row + 1}`));
      });
      const desde = col(PISO0);
      const hasta = col(PISO0 + z.pisos.length - 1);
      set(s, r, PISO0 + z.pisos.length, fml(`AVERAGE(${desde}${r + 1}:${hasta}${r + 1})`));
    });

    const totalRow = 2 + z.rubros.length;
    const r1 = 3; // primera fila de rubros (1-based)
    const r2 = 2 + z.rubros.length; // última (1-based)
    set(s, totalRow, 0, txt(`TOTAL ${z.zonaNombre.toUpperCase()}`));
    set(s, totalRow, 1, fml(`SUM(B${r1}:B${r2})`, "#,##0"));
    for (let i = 0; i <= z.pisos.length; i++) {
      const c = col(PISO0 + i);
      set(
        s,
        totalRow,
        PISO0 + i,
        fml(
          `IFERROR(SUMPRODUCT($B$${r1}:$B$${r2},${c}${r1}:${c}${r2})/SUM($B$${r1}:$B$${r2}),AVERAGE(${c}${r1}:${c}${r2}))`
        )
      );
    }

    XLSX.utils.book_append_sheet(
      wb,
      toWorksheet(s, [40, 14, ...z.pisos.map(() => 9), 11]),
      `PROM. PONDERADO ${z.zonaCodigo}`
    );
  }

  return wb;
}
