import type { GrupoNivel } from "@/lib/types";

/**
 * Geometría del corte del edificio.
 *
 * El PDF original (Ficha_CORTE.pdf) es un escaneo: una sola imagen JPEG de
 * 796×1754, sin capa vectorial ni texto. Medido sobre esa imagen, resultó una
 * grilla casi perfecta — los niveles 56 a 6 caen en un paso uniforme de 28,04 px
 * (el 56 en y=72, el 6 en y=1474) y la silueta son cinco retranqueos escalonados.
 * Es decir: una pila de rectángulos. Por eso se redibuja en vez de pintar encima
 * del escaneo, que no se puede colorear, no escala, no tiene modo oscuro y
 * además omite tres niveles que los datos sí registran (4SS, 2 y 5).
 *
 * Todas las bandas tienen la MISMA altura: a efectos de avance un nivel es un
 * nivel, y comprimir los subsuelos como hace el dibujo original les daría menos
 * peso visual del que les corresponde. Lo que se conserva del plano es la
 * silueta — los anchos relativos medidos abajo.
 */

export interface BandaNivel {
  codigo: string;
  nombre: string;
  orden: number;
  grupo: GrupoNivel;
  x: number;
  y: number;
  ancho: number;
  alto: number;
  /** Si el nivel aparece dibujado en el plano original. */
  enPlano: boolean;
}

const ALTO_BANDA = 10;
const SEPARACION = 1.6;
const PASO = ALTO_BANDA + SEPARACION;
const MARGEN_SUP = 8;
const GUTTER = 34;
const ANCHO_TORRE = 96;
const CENTRO_X = GUTTER + 128;

/**
 * Ancho relativo a la torre (=1), medido sobre el escaneo. El ancho de la torre
 * en el original es 264 px (x 282→546); cada tramo se expresa contra eso.
 */
function anchoRelativo(orden: number): number {
  if (orden >= 55) return 98 / 264; // tanques y sala de máquinas
  if (orden === 54) return 176 / 264;
  if (orden === 53) return 190 / 264;
  if (orden >= 51) return 205 / 264;
  if (orden >= 49) return 219 / 264;
  if (orden >= 46) return 234 / 264;
  if (orden >= 6) return 1; // fuste
  if (orden >= 1) return 1.6; // basamento: el podio es más ancho que la torre
  return 2.45; // PB y subsuelos: la huella completa del terreno
}

/** Los tres niveles que el plano original no dibuja, aunque los datos los tengan. */
const FUERA_DEL_PLANO = new Set(["4SS", "2", "5"]);

export interface Viewbox {
  ancho: number;
  alto: number;
}

export function viewboxCorte(cantidadNiveles: number): Viewbox {
  return {
    ancho: GUTTER + 256 + 10,
    alto: MARGEN_SUP * 2 + Math.max(1, cantidadNiveles) * PASO,
  };
}

/**
 * Convierte los niveles de la obra en bandas dibujables.
 *
 * Espera los niveles ordenados por `orden` ascendente (de abajo hacia arriba);
 * los reordena igual por las dudas. El primero de la lista queda abajo.
 */
export function bandasCorte(
  niveles: { codigo: string; nombre: string; orden: number; grupo: GrupoNivel }[]
): BandaNivel[] {
  const ordenados = [...niveles].sort((a, b) => a.orden - b.orden);
  const total = ordenados.length;

  return ordenados.map((n, i) => {
    const ancho = ANCHO_TORRE * anchoRelativo(n.orden);
    // i=0 es el nivel más bajo, así que va al fondo del dibujo.
    const y = MARGEN_SUP + (total - 1 - i) * PASO;
    return {
      codigo: n.codigo,
      nombre: n.nombre,
      orden: n.orden,
      grupo: n.grupo,
      x: CENTRO_X - ancho / 2,
      y,
      ancho,
      alto: ALTO_BANDA,
      enPlano: !FUERA_DEL_PLANO.has(n.codigo),
    };
  });
}

/** X donde arrancan las etiquetas de nivel, a la izquierda del dibujo. */
export const X_ETIQUETA = GUTTER - 6;

/**
 * Qué niveles llevan etiqueta. Etiquetar los 60 satura el dibujo, así que van
 * los múltiplos de 5, los extremos, y siempre PB y los subsuelos, que son los
 * que cuesta ubicar de memoria.
 */
export function llevaEtiqueta(banda: BandaNivel, esUltimo: boolean, esPrimero: boolean): boolean {
  if (esPrimero || esUltimo) return true;
  if (banda.grupo === "subsuelo" || banda.codigo === "PB") return true;
  if (banda.grupo === "azotea") return true;
  return banda.orden > 0 && banda.orden % 5 === 0;
}
