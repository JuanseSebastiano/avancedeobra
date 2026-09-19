"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const pctTick = (v: number) => `${Math.round(v * 100)}%`;
const pctTooltip = (v: number | string) =>
  typeof v === "number" ? `${(v * 100).toFixed(1)}%` : v;
const puntosTooltip = (v: number | string) =>
  typeof v === "number" ? `${(v * 100).toFixed(1)} pts` : v;

const MARGEN = { top: 8, right: 8, bottom: 0, left: -16 } as const;
const EJE = { fontSize: 11, fill: "var(--viz-tinta-suave)" } as const;

export function CurvaAvance({ data }: { data: { fecha: string; porcentaje: number }[] }) {
  /**
   * Cuánto sumó cada corte respecto del anterior. Es la lectura que falta en la
   * curva acumulada: un acumulado que sube sigue "subiendo" aunque el mes haya
   * sido flojo, y el delta muestra eso de inmediato.
   */
  const deltas = useMemo(
    () =>
      data.map((d, i) => ({
        fecha: d.fecha,
        delta: i === 0 ? 0 : d.porcentaje - data[i - 1].porcentaje,
      })),
    [data]
  );

  const maxDelta = Math.max(0.01, ...deltas.map((d) => Math.abs(d.delta)));

  return (
    <div className="flex flex-col gap-1">
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={MARGEN}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--viz-grilla)" />
          <XAxis dataKey="fecha" tick={EJE} />
          <YAxis domain={[0, 1]} tickFormatter={pctTick} tick={EJE} />
          <Tooltip formatter={pctTooltip} />
          <Line
            type="monotone"
            dataKey="porcentaje"
            name="Avance acumulado"
            stroke="var(--avance-4)"
            strokeWidth={2}
            dot={{ r: 3, fill: "var(--avance-4)" }}
          />
        </LineChart>
      </ResponsiveContainer>

      {/*
        Gráfico aparte y no un segundo eje: el acumulado va de 0 a 100 % y el
        delta son unos pocos puntos, así que compartir escala escondería el
        delta y compartir eje sería un gráfico de doble eje.
      */}
      <p className="pl-1 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
        Avance de cada corte
      </p>
      <ResponsiveContainer width="100%" height={90}>
        <BarChart data={deltas} margin={MARGEN}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--viz-grilla)" vertical={false} />
          <XAxis dataKey="fecha" tick={EJE} />
          <YAxis
            domain={[0, maxDelta]}
            tickFormatter={(v: number) => `${Math.round(v * 100)}`}
            tick={EJE}
            width={40}
          />
          <Tooltip formatter={puntosTooltip} />
          <Bar
            dataKey="delta"
            name="Puntos ganados"
            fill="var(--avance-2)"
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function BarrasAvance({ data }: { data: { nombre: string; porcentaje: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(160, data.length * 28)}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--viz-grilla)" horizontal={false} />
        <XAxis type="number" domain={[0, 1]} tickFormatter={pctTick} tick={EJE} />
        <YAxis type="category" dataKey="nombre" width={150} tick={EJE} />
        <Tooltip formatter={pctTooltip} />
        <Bar dataKey="porcentaje" name="Avance" fill="var(--avance-4)" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
