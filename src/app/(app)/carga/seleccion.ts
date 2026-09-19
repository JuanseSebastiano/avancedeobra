import { SIN_DATO } from "@/lib/types";

/** Una celda de la grilla por posición (fila, columna) dentro de la vista filtrada. */
export interface Celda {
  f: number;
  c: number;
}

/** Rango rectangular, inclusivo en los cuatro bordes. */
export interface Rango {
  f0: number;
  c0: number;
  f1: number;
  c1: number;
}

export function rangoEntre(a: Celda, b: Celda): Rango {
  return {
    f0: Math.min(a.f, b.f),
    c0: Math.min(a.c, b.c),
    f1: Math.max(a.f, b.f),
    c1: Math.max(a.c, b.c),
  };
}

export function dentro(rango: Rango | null, f: number, c: number): boolean {
  if (!rango) return false;
  return f >= rango.f0 && f <= rango.f1 && c >= rango.c0 && c <= rango.c1;
}

export function celdasDelRango(rango: Rango): Celda[] {
  const out: Celda[] = [];
  for (let f = rango.f0; f <= rango.f1; f++) {
    for (let c = rango.c0; c <= rango.c1; c++) out.push({ f, c });
  }
  return out;
}

export function tamanoRango(rango: Rango): number {
  return (rango.f1 - rango.f0 + 1) * (rango.c1 - rango.c0 + 1);
}

/**
 * Normaliza un valor tipeado o pegado a 0..100, o SIN_DATO.
 *
 * Acepta lo que aparece en la planilla real: `0,85`, `0.85`, `85%`, `85`, `1`.
 * Los valores entre 0 y 1 se leen como fracción salvo que vengan con `%`, que es
 * como los guarda Excel; `1` es 100 % y `0` es 0 %.
 */
export function normalizarValor(texto: string): number | null {
  const limpio = texto.trim();
  if (limpio === "") return SIN_DATO;
  if (/^(-|—|n\/?a|no aplica)$/i.test(limpio)) return SIN_DATO;

  const porcentual = /%\s*$/.test(limpio);
  const numero = Number(limpio.replace(/%/g, "").replace(",", ".").trim());
  if (!Number.isFinite(numero)) return null;

  const escala = !porcentual && numero >= 0 && numero <= 1 ? numero * 100 : numero;
  if (escala < 0 || escala > 100) return null;
  return Math.round(escala);
}

export interface BloquePegado {
  filas: number;
  columnas: number;
  /** Valores por fila; `null` = celda que no se pudo interpretar y se saltea. */
  valores: (number | null)[][];
}

/**
 * Parsea un bloque TSV copiado desde Excel.
 *
 * Es el camino más rápido para el primer corte: la planilla ya existe, así que
 * copiar un rectángulo y pegarlo acá evita retipear miles de celdas.
 */
export function parsearPegado(texto: string): BloquePegado | null {
  const limpio = texto.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n+$/, "");
  if (limpio === "") return null;

  const filas = limpio.split("\n").map((linea) => linea.split("\t"));
  const columnas = Math.max(...filas.map((f) => f.length));

  const valores = filas.map((fila) => {
    const out: (number | null)[] = [];
    for (let c = 0; c < columnas; c++) out.push(normalizarValor(fila[c] ?? ""));
    return out;
  });

  return { filas: filas.length, columnas, valores };
}

/** Índice plano dentro de los arrays `valores` / `anteriores`. */
export function indicePlano(fila: number, columna: number, ancho: number): number {
  return fila * ancho + columna;
}
