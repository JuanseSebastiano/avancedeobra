"use client";

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

export function CurvaAvance({ data }: { data: { fecha: string; porcentaje: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
        <XAxis dataKey="fecha" tick={{ fontSize: 11 }} />
        <YAxis domain={[0, 1]} tickFormatter={pctTick} tick={{ fontSize: 11 }} />
        <Tooltip formatter={pctTooltip} />
        <Line
          type="monotone"
          dataKey="porcentaje"
          name="Avance"
          stroke="#059669"
          strokeWidth={2}
          dot={{ r: 3 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function BarrasAvance({ data }: { data: { nombre: string; porcentaje: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(160, data.length * 28)}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" horizontal={false} />
        <XAxis type="number" domain={[0, 1]} tickFormatter={pctTick} tick={{ fontSize: 11 }} />
        <YAxis type="category" dataKey="nombre" width={150} tick={{ fontSize: 11 }} />
        <Tooltip formatter={pctTooltip} />
        <Bar dataKey="porcentaje" name="Avance" fill="#059669" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
