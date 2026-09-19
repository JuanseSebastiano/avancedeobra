"use client";

import { useMemo, useState } from "react";
import { CorteAvance, type DatoNivel } from "@/components/corte";
import type { AvanceNivel, AvanceNivelSerie, GrupoNivel } from "@/lib/types";

interface Props {
  niveles: { codigo: string; nombre: string; orden: number; grupo: GrupoNivel }[];
  /** Estado actual, con las dos medidas y la cobertura. */
  actual: AvanceNivel[];
  /** Serie por fecha de corte, para la línea de tiempo. */
  serie: AvanceNivelSerie[];
  onSelect?: (codigo: string) => void;
}

/**
 * El corte del edificio con una línea de tiempo entre cortes.
 *
 * Toda la serie viene precargada del servidor (~60 filas por corte), así que
 * mover el control no sale a la red: el edificio se llena mes a mes sin latencia,
 * que es lo que hace que la animación valga la pena.
 */
export function CortePanel({ niveles, actual, serie, onSelect }: Props) {
  const fechas = useMemo(
    () => [...new Set(serie.map((s) => s.fecha))].sort(),
    [serie]
  );
  const [indice, setIndice] = useState(Math.max(0, fechas.length - 1));
  const enElUltimo = indice >= fechas.length - 1;

  const porFecha = useMemo(() => {
    const m = new Map<string, Map<string, number>>();
    for (const s of serie) {
      if (!m.has(s.fecha)) m.set(s.fecha, new Map());
      m.get(s.fecha)!.set(s.codigo, s.porcentaje);
    }
    return m;
  }, [serie]);

  const datos: DatoNivel[] = useMemo(() => {
    // En el último corte se usa el dato rico (ponderado + simple + cobertura);
    // al retroceder alcanza con la serie, que es más liviana.
    if (enElUltimo || fechas.length === 0) {
      return actual.map((a) => ({
        codigo: a.codigo,
        porcentaje: a.porcentaje,
        porcentajeSimple: a.porcentaje_simple,
        celdas: a.celdas,
        celdasConMonto: a.celdas_con_monto,
      }));
    }
    const instantanea = porFecha.get(fechas[indice]) ?? new Map();
    return niveles.map((n) => ({
      codigo: n.codigo,
      porcentaje: instantanea.has(n.codigo) ? instantanea.get(n.codigo)! : null,
    }));
  }, [enElUltimo, fechas, indice, porFecha, actual, niveles]);

  return (
    <div className="flex flex-col gap-3">
      <CorteAvance niveles={niveles} datos={datos} onSelect={onSelect} />

      {fechas.length > 1 && (
        <div className="flex flex-col gap-1 border-t pt-3">
          <div className="flex items-center justify-between text-xs text-zinc-500">
            <span>Corte</span>
            <span className="font-medium tabular-nums text-zinc-700">
              {formatearFecha(fechas[indice])}
              {enElUltimo && " · último"}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={fechas.length - 1}
            step={1}
            value={indice}
            onChange={(e) => setIndice(Number(e.target.value))}
            aria-label="Elegir corte"
          />
          <div className="flex justify-between text-[10px] tabular-nums text-zinc-400">
            <span>{formatearFecha(fechas[0])}</span>
            <span>{formatearFecha(fechas[fechas.length - 1])}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function formatearFecha(iso: string): string {
  if (!iso) return "—";
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}
