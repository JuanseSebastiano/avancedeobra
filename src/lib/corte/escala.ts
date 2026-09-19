/**
 * Escala de color del avance.
 *
 * Es una escala SECUENCIAL (magnitud continua 0→100 %), así que un solo tono que
 * va de claro a oscuro. El tono es AZUL y no verde a propósito: la app ya usa
 * emerald como color de estado (los Badge verdes, los deltas positivos), y si la
 * magnitud usara el mismo tono, un verde intermedio quedaría ambiguo entre
 * "50 % hecho" y "OK".
 *
 * Los pasos salen de la rampa azul del sistema de visualización y se validaron
 * contra las superficies reales de la app:
 *
 *   claro  (sobre #ffffff): L 0.905 → 0.338, monotónica, paso mínimo ΔL 0.093
 *   oscuro (sobre #1a1a19): L 0.338 → 0.812, monotónica, paso mínimo ΔL 0.095
 *
 * El invariante en los dos modos es el mismo: más avance = más contraste contra
 * la superficie. En claro eso va de claro a oscuro; en oscuro, al revés. El modo
 * oscuro no es la rampa clara dada vuelta, son pasos elegidos para esa superficie.
 *
 * Los dos pasos más bajos quedan por debajo de 3:1 contra la superficie, que es
 * la regla documentada para escalas secuenciales ("el paso más claro significa
 * casi cero y puede replegarse hacia el fondo"). El alivio es que cada banda
 * lleva contorno fino, el panel de detalle muestra el número y hay leyenda.
 */

/** Umbrales superiores de cada tramo, en 0..1. */
const TRAMOS = [0, 0.25, 0.5, 0.75, 0.999, 1] as const;

export const PASOS_AVANCE = 6;

/**
 * Índice de tramo (0..5) de un porcentaje 0..1.
 * 0 % y 100 % tienen tramo propio: son los dos valores que más aparecen.
 */
export function tramoDeAvance(porcentaje: number): number {
  if (porcentaje <= 0) return 0;
  if (porcentaje >= 1) return 5;
  for (let i = 1; i < TRAMOS.length; i++) {
    if (porcentaje <= TRAMOS[i]) return i;
  }
  return 5;
}

/** Variable CSS del relleno. `null` = sin dato, que no es lo mismo que 0 %. */
export function colorAvance(porcentaje: number | null): string {
  if (porcentaje === null) return "var(--avance-sin-dato)";
  return `var(--avance-${tramoDeAvance(porcentaje)})`;
}

/** Color de texto que se lee encima de ese relleno. */
export function tintaSobreAvance(porcentaje: number | null): string {
  if (porcentaje === null) return "var(--avance-tinta-clara)";
  return tramoDeAvance(porcentaje) >= 3
    ? "var(--avance-tinta-oscura)"
    : "var(--avance-tinta-clara)";
}

export const ETIQUETAS_TRAMO = [
  "0 %",
  "1–25 %",
  "26–50 %",
  "51–75 %",
  "76–99 %",
  "100 %",
] as const;

/** Tono de acento para gráficos de una sola serie, tomado de la misma rampa. */
export const COLOR_SERIE = "var(--avance-4)";
export const COLOR_GRILLA = "var(--viz-grilla)";
