import { SIN_DATO } from "@/lib/types";
import { celdasDelRango, indicePlano, rangoEntre, type Celda, type Rango } from "./seleccion";

/**
 * Estado de edición de la grilla.
 *
 * Va todo en un reducer y no en varios useState porque `valores` y `sucias`
 * cambian siempre juntos: actualizar uno dentro del updater del otro rompe en
 * StrictMode, donde los updaters se ejecutan dos veces.
 */
export interface EstadoGrilla {
  /** Valores de la zona entera, planos: fila * ancho + columna. 0..100 o SIN_DATO. */
  valores: number[];
  /** índice plano → valor original, para poder revertir si falla el guardado. */
  sucias: Map<number, number>;
  activa: Celda | null;
  ancla: Celda | null;
  rango: Rango | null;
}

export interface Contexto {
  /** Índices (dentro de filas) de las filas visibles con el rubro elegido. */
  filasVisibles: number[];
  ancho: number;
  alto: number;
}

export type Accion =
  | { tipo: "reset"; valores: number[] }
  | { tipo: "foco"; celda: Celda; extender: boolean }
  | { tipo: "mover"; df: number; dc: number; extender: boolean; ctx: Contexto }
  | { tipo: "aplicar"; celdas: Celda[]; valor: number; ctx: Contexto }
  | { tipo: "aplicarMuchos"; celdas: Celda[]; valores: number[]; ctx: Contexto }
  | { tipo: "rellenarDerecha"; ctx: Contexto }
  | { tipo: "rellenarAbajo"; ctx: Contexto }
  | { tipo: "revertir"; indices: number[] }
  | { tipo: "descartar" }
  | { tipo: "limpiarSucias" };

export const estadoInicial = (valores: number[]): EstadoGrilla => ({
  valores,
  sucias: new Map(),
  activa: null,
  ancla: null,
  rango: null,
});

/** Escribe celdas y registra el valor previo de cada una, una sola vez. */
function escribir(
  estado: EstadoGrilla,
  ctx: Contexto,
  pares: { celda: Celda; valor: number }[]
): EstadoGrilla {
  const valores = [...estado.valores];
  const sucias = new Map(estado.sucias);
  let cambio = false;

  for (const { celda, valor } of pares) {
    const fila = ctx.filasVisibles[celda.f];
    if (fila === undefined || celda.c < 0 || celda.c >= ctx.ancho) continue;
    const indice = indicePlano(fila, celda.c, ctx.ancho);
    if (valores[indice] === valor) continue;
    if (!sucias.has(indice)) sucias.set(indice, valores[indice]);
    valores[indice] = valor;
    cambio = true;
  }

  if (!cambio) return estado;
  return { ...estado, valores, sucias };
}

export function reducer(estado: EstadoGrilla, accion: Accion): EstadoGrilla {
  switch (accion.tipo) {
    case "reset":
      return estadoInicial(accion.valores);

    case "foco": {
      const { celda, extender } = accion;
      if (extender && estado.ancla) {
        return { ...estado, activa: celda, rango: rangoEntre(estado.ancla, celda) };
      }
      return { ...estado, activa: celda, ancla: celda, rango: null };
    }

    case "mover": {
      if (!estado.activa) return estado;
      const f = Math.max(0, Math.min(accion.ctx.alto - 1, estado.activa.f + accion.df));
      const c = Math.max(0, Math.min(accion.ctx.ancho - 1, estado.activa.c + accion.dc));
      const destino = { f, c };
      if (accion.extender && estado.ancla) {
        return { ...estado, activa: destino, rango: rangoEntre(estado.ancla, destino) };
      }
      return { ...estado, activa: destino, ancla: destino, rango: null };
    }

    case "aplicar":
      return escribir(
        estado,
        accion.ctx,
        accion.celdas.map((celda) => ({ celda, valor: accion.valor }))
      );

    case "aplicarMuchos":
      return escribir(
        estado,
        accion.ctx,
        accion.celdas.map((celda, i) => ({ celda, valor: accion.valores[i] }))
      );

    case "rellenarDerecha": {
      if (!estado.rango) return estado;
      const { f0, c0, f1, c1 } = estado.rango;
      const pares: { celda: Celda; valor: number }[] = [];
      for (let f = f0; f <= f1; f++) {
        const fila = accion.ctx.filasVisibles[f];
        if (fila === undefined) continue;
        const valor = estado.valores[indicePlano(fila, c0, accion.ctx.ancho)];
        for (let c = c0 + 1; c <= c1; c++) pares.push({ celda: { f, c }, valor });
      }
      return escribir(estado, accion.ctx, pares);
    }

    case "rellenarAbajo": {
      if (!estado.rango) return estado;
      const { f0, c0, f1, c1 } = estado.rango;
      const origen = accion.ctx.filasVisibles[f0];
      if (origen === undefined) return estado;
      const pares: { celda: Celda; valor: number }[] = [];
      for (let c = c0; c <= c1; c++) {
        const valor = estado.valores[indicePlano(origen, c, accion.ctx.ancho)];
        for (let f = f0 + 1; f <= f1; f++) pares.push({ celda: { f, c }, valor });
      }
      return escribir(estado, accion.ctx, pares);
    }

    case "revertir": {
      const valores = [...estado.valores];
      for (const indice of accion.indices) {
        const original = estado.sucias.get(indice);
        if (original !== undefined) valores[indice] = original;
      }
      return { ...estado, valores, sucias: new Map() };
    }

    case "descartar": {
      const valores = [...estado.valores];
      for (const [indice, original] of estado.sucias) valores[indice] = original;
      return { ...estado, valores, sucias: new Map() };
    }

    case "limpiarSucias":
      return { ...estado, sucias: new Map() };
  }
}

/** Las celdas actualmente seleccionadas: el rango, o la celda activa sola. */
export function seleccionDe(estado: EstadoGrilla): Celda[] {
  if (estado.rango) return celdasDelRango(estado.rango);
  return estado.activa ? [estado.activa] : [];
}

/**
 * Convierte las celdas sucias en el payload del guardado.
 *
 * Las celdas en SIN_DATO se excluyen: `avances` no puede representar "sin dato",
 * así que mandarlas como 0 inventaría un avance que nadie cargó.
 */
export function celdasParaGuardar(
  estado: EstadoGrilla,
  filas: { itemId: string }[],
  pisos: { id: string }[]
): { celdas: { itemId: string; pisoId: string; porcentaje: number }[]; omitidas: number } {
  const ancho = pisos.length;
  const celdas: { itemId: string; pisoId: string; porcentaje: number }[] = [];
  let omitidas = 0;

  for (const indice of estado.sucias.keys()) {
    const valor = estado.valores[indice];
    if (valor === SIN_DATO) {
      omitidas++;
      continue;
    }
    const fila = filas[Math.floor(indice / ancho)];
    const piso = pisos[indice % ancho];
    if (!fila || !piso) continue;
    celdas.push({ itemId: fila.itemId, pisoId: piso.id, porcentaje: valor });
  }

  return { celdas, omitidas };
}
