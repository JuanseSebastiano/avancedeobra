/**
 * Helpers puros de formato y cálculo.
 *
 * Viven acá y no en data.ts porque los usan componentes de cliente: data.ts
 * importa el cliente de Supabase del servidor (next/headers), y arrastrarlo al
 * bundle del navegador rompe el build.
 */

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
