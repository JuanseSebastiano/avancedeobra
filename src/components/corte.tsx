"use client";

import { useId, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { formatPct } from "@/lib/formato";
import {
  bandasCorte,
  llevaEtiqueta,
  viewboxCorte,
  X_ETIQUETA,
  type BandaNivel,
} from "@/lib/corte/geometria";
import { colorAvance, ETIQUETAS_TRAMO, PASOS_AVANCE } from "@/lib/corte/escala";
import type { GrupoNivel } from "@/lib/types";

export interface DatoNivel {
  codigo: string;
  /** 0..1, o null si ese nivel no tiene ningún avance cargado. */
  porcentaje: number | null;
  /** Promedio simple, para contrastar contra el ponderado. */
  porcentajeSimple?: number | null;
  celdas?: number;
  celdasConMonto?: number;
}

interface Props {
  niveles: { codigo: string; nombre: string; orden: number; grupo: GrupoNivel }[];
  datos: DatoNivel[];
  seleccion?: string | null;
  onSelect?: (codigo: string) => void;
  variante?: "completo" | "mini";
  className?: string;
}

/**
 * El corte del edificio como gráfico: una banda por nivel físico, coloreada por
 * avance.
 *
 * Es un componente puro — nunca pide datos. Así el mismo dibujo sirve en el
 * dashboard (con los datos del servidor) y como mini-mapa en la pantalla de
 * carga (con los valores que el usuario todavía no guardó).
 */
export function CorteAvance({
  niveles,
  datos,
  seleccion,
  onSelect,
  variante = "completo",
  className,
}: Props) {
  const idPatron = useId();
  const [hover, setHover] = useState<string | null>(null);

  const bandas = useMemo(() => bandasCorte(niveles), [niveles]);
  const vb = useMemo(() => viewboxCorte(bandas.length), [bandas.length]);
  const porCodigo = useMemo(() => new Map(datos.map((d) => [d.codigo, d])), [datos]);

  const mini = variante === "mini";
  const activo = hover ?? seleccion ?? null;
  const detalle = activo ? porCodigo.get(activo) : undefined;
  const bandaActiva = activo ? bandas.find((b) => b.codigo === activo) : undefined;

  if (bandas.length === 0) {
    return <p className="text-sm text-zinc-500">Todavía no hay niveles cargados.</p>;
  }

  return (
    <div className={cn("flex gap-4", mini && "gap-2", className)}>
      <svg
        viewBox={`0 0 ${vb.ancho} ${vb.alto}`}
        role="img"
        aria-label="Corte del edificio con el avance de cada nivel"
        className={cn("h-auto shrink-0", mini ? "w-[104px]" : "w-full max-w-[300px]")}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          {/* Trama para los niveles sin dato: distinta de 0 %, no un color más. */}
          <pattern
            id={`${idPatron}-sindato`}
            width="6"
            height="6"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width="6" height="6" fill="var(--avance-sin-dato)" />
            <line x1="0" y1="0" x2="0" y2="6" stroke="var(--viz-eje)" strokeWidth="1.5" />
          </pattern>
        </defs>

        {bandas.map((banda, i) => {
          const dato = porCodigo.get(banda.codigo);
          const pct = dato?.porcentaje ?? null;
          const esActiva = banda.codigo === activo;
          const etiqueta =
            !mini && llevaEtiqueta(banda, i === bandas.length - 1, i === 0);

          return (
            <g key={banda.codigo}>
              {etiqueta && (
                <text
                  x={X_ETIQUETA}
                  y={banda.y + banda.alto - 1.5}
                  textAnchor="end"
                  fontSize="7.5"
                  fill="var(--viz-tinta-suave)"
                  className="tabular-nums"
                >
                  {banda.codigo}
                </text>
              )}

              <rect
                x={banda.x}
                y={banda.y}
                width={banda.ancho}
                height={banda.alto}
                rx="1"
                fill={pct === null ? `url(#${idPatron}-sindato)` : colorAvance(pct)}
                stroke={esActiva ? "var(--avance-tinta-clara)" : "var(--avance-contorno)"}
                strokeWidth={esActiva ? 1.5 : 0.5}
                strokeDasharray={banda.enPlano ? undefined : "2 1.5"}
                className={onSelect ? "cursor-pointer" : undefined}
                onPointerEnter={() => setHover(banda.codigo)}
                onClick={() => onSelect?.(banda.codigo)}
              >
                <title>
                  {`${banda.nombre}: ${pct === null ? "sin datos cargados" : formatPct(pct)}`}
                </title>
              </rect>

              {/* Zona de toque: las bandas miden ~10 unidades, poco para el dedo. */}
              <rect
                x={0}
                y={banda.y - 0.8}
                width={vb.ancho}
                height={banda.alto + 1.6}
                fill="transparent"
                className={onSelect ? "cursor-pointer" : undefined}
                onPointerEnter={() => setHover(banda.codigo)}
                onClick={() => onSelect?.(banda.codigo)}
              />
            </g>
          );
        })}
      </svg>

      {!mini && (
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <Detalle banda={bandaActiva} dato={detalle} />
          <Leyenda />
          <p className="text-[11px] leading-snug text-zinc-400">
            Esquema, no a escala. Los niveles con borde punteado (4SS, 2 y 5) no figuran
            en el plano original pero sí tienen avance cargado.
          </p>
        </div>
      )}
    </div>
  );
}

function Detalle({ banda, dato }: { banda?: BandaNivel; dato?: DatoNivel }) {
  if (!banda) {
    return (
      <p className="text-sm text-zinc-500">
        Pasá el cursor por un nivel del corte para ver su detalle.
      </p>
    );
  }

  const pct = dato?.porcentaje ?? null;
  const simple = dato?.porcentajeSimple ?? null;
  // El ponderado sólo toma los ítems que tienen monto cargado. Cuando son pocos,
  // el número puede diferir bastante del promedio real y conviene decirlo.
  const discrepa =
    pct !== null && simple !== null && Math.abs(pct - simple) >= 0.05;

  return (
    <div className="rounded-lg border bg-white p-3">
      <p className="text-sm font-semibold text-zinc-900">{banda.nombre}</p>
      {pct === null ? (
        <p className="mt-1 text-sm text-zinc-500">Sin avances cargados en este nivel.</p>
      ) : (
        <>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-zinc-900">
            {formatPct(pct)}
          </p>
          <p className="text-xs text-zinc-500">
            ponderado por monto · {dato?.celdas ?? 0} celdas cargadas
          </p>
          {discrepa && (
            <p className="mt-2 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-900">
              Promedio simple: {formatPct(simple)}. Sólo {dato?.celdasConMonto ?? 0} de{" "}
              {dato?.celdas ?? 0} celdas tienen monto, así que el ponderado se calcula
              sobre esa minoría.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function Leyenda() {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1">
        {Array.from({ length: PASOS_AVANCE }, (_, i) => (
          <div key={i} className="flex flex-1 flex-col items-center gap-0.5">
            <div
              className="h-3 w-full rounded-sm"
              style={{
                background: `var(--avance-${i})`,
                outline: "0.5px solid var(--avance-contorno)",
              }}
            />
            <span className="text-[9px] leading-none text-zinc-500">
              {i === 0 ? "0" : i === PASOS_AVANCE - 1 ? "100" : ""}
            </span>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-1.5 text-[10px] text-zinc-500">
        <span
          className="inline-block h-3 w-3 rounded-sm"
          style={{
            background: "var(--avance-sin-dato)",
            outline: "0.5px solid var(--avance-contorno)",
          }}
        />
        sin dato (distinto de 0 %)
      </div>
      <span className="sr-only">
        Escala de avance de {ETIQUETAS_TRAMO[0]} a {ETIQUETAS_TRAMO[PASOS_AVANCE - 1]}.
      </span>
    </div>
  );
}
