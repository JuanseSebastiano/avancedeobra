"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { formatPct } from "@/lib/formato";
import { colorAvance, tintaSobreAvance } from "@/lib/corte/escala";
import type { AvanceRubroNivel } from "@/lib/types";

interface Props {
  datos: AvanceRubroNivel[];
  niveles: { codigo: string; nombre: string; orden: number }[];
}

/**
 * Heatmap rubro × nivel.
 *
 * El corte responde "cuánto avanzó cada piso"; esto responde "quién lo tiene
 * frenado", que es la pregunta de la reunión mensual. Va en CSS grid y no en
 * recharts porque recharts no tiene heatmap, y porque así cada celda es un nodo
 * normal con tooltip y foco.
 */
export function HeatmapRubroNivel({ datos, niveles }: Props) {
  const [activa, setActiva] = useState<string | null>(null);

  const rubros = useMemo(
    () => [...new Set(datos.map((d) => d.rubro))].sort((a, b) => a.localeCompare(b, "es")),
    [datos]
  );

  // Sólo los niveles que algún rubro toca: el resto serían 60 columnas vacías.
  const columnas = useMemo(() => {
    const conDato = new Set(datos.map((d) => d.codigo));
    return niveles.filter((n) => conDato.has(n.codigo)).sort((a, b) => a.orden - b.orden);
  }, [datos, niveles]);

  const porClave = useMemo(
    () => new Map(datos.map((d) => [`${d.rubro}|${d.codigo}`, d])),
    [datos]
  );

  if (rubros.length === 0 || columnas.length === 0) {
    return <p className="text-sm text-zinc-500">Todavía no hay avances cargados.</p>;
  }

  const detalle = activa ? porClave.get(activa) : undefined;

  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-auto" style={{ maxHeight: "min(60vh, 520px)" }}>
        <table className="border-separate border-spacing-0 text-xs">
          <thead className="sticky top-0 z-20">
            <tr>
              <th className="sticky left-0 z-30 min-w-[13rem] max-w-[13rem] border-b border-r bg-zinc-50 px-2 py-1.5 text-left font-medium text-zinc-600">
                Rubro
              </th>
              {columnas.map((n) => (
                <th
                  key={n.codigo}
                  className="border-b border-r bg-zinc-50 px-1 py-1.5 text-center font-medium text-zinc-600"
                  style={{ minWidth: "2.1rem" }}
                >
                  {n.codigo}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rubros.map((rubro) => (
              <tr key={rubro}>
                <th
                  scope="row"
                  className="sticky left-0 z-10 min-w-[13rem] max-w-[13rem] truncate border-b border-r bg-white px-2 py-1 text-left font-normal text-zinc-700"
                  title={rubro}
                >
                  {rubro}
                </th>
                {columnas.map((n) => {
                  const clave = `${rubro}|${n.codigo}`;
                  const celda = porClave.get(clave);
                  const pct = celda?.porcentaje ?? null;
                  return (
                    <td
                      key={n.codigo}
                      onPointerEnter={() => setActiva(clave)}
                      onFocus={() => setActiva(clave)}
                      tabIndex={celda ? 0 : -1}
                      title={
                        celda
                          ? `${rubro} · ${n.nombre}: ${formatPct(pct)} (${celda.celdas} celdas)`
                          : `${rubro} · ${n.nombre}: sin datos`
                      }
                      className={cn(
                        "border-b border-r px-1 py-1 text-center tabular-nums",
                        activa === clave && "ring-2 ring-inset ring-zinc-900"
                      )}
                      style={
                        celda
                          ? { background: colorAvance(pct), color: tintaSobreAvance(pct) }
                          : {
                              background: "var(--avance-sin-dato)",
                              color: "var(--viz-tinta-suave)",
                            }
                      }
                    >
                      {celda && pct !== null ? Math.round(pct * 100) : "·"}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="min-h-[1.25rem] text-xs text-zinc-600">
        {detalle ? (
          <>
            <strong>{detalle.rubro}</strong> · nivel {detalle.codigo}:{" "}
            {formatPct(detalle.porcentaje)} ponderado, {formatPct(detalle.porcentaje_simple)}{" "}
            simple, sobre {detalle.celdas} celdas.
          </>
        ) : (
          "Pasá el cursor por una celda para ver el detalle. Las celdas grises no tienen avances cargados."
        )}
      </p>
    </div>
  );
}
