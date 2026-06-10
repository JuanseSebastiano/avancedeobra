"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Check, CircleAlert, Loader2 } from "lucide-react";
import { guardarAvance } from "./actions";

interface Props {
  itemId: string;
  pisoId: string;
  descripcion: string;
  monto: number;
  /** 0..100, último valor guardado */
  actual: number | null;
  /** 0..100, valor del corte anterior */
  anterior: number | null;
  editable: boolean;
}

type Estado = "idle" | "saving" | "saved" | "error";

export function ItemEditor({ itemId, pisoId, descripcion, monto, actual, anterior, editable }: Props) {
  const [valor, setValor] = useState(actual ?? 0);
  const [estado, setEstado] = useState<Estado>("idle");
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ultimoGuardado = useRef(actual ?? 0);

  useEffect(() => () => {
    if (timeout.current) clearTimeout(timeout.current);
  }, []);

  const programarGuardado = (nuevo: number) => {
    setValor(nuevo);
    if (!editable) return;
    setEstado("saving");
    if (timeout.current) clearTimeout(timeout.current);
    timeout.current = setTimeout(() => {
      if (nuevo === ultimoGuardado.current) {
        setEstado("idle");
        return;
      }
      startTransition(async () => {
        const res = await guardarAvance({ itemId, pisoId, porcentaje: nuevo });
        if (res.ok) {
          ultimoGuardado.current = Math.round(res.porcentaje * 100);
          setEstado("saved");
          setError(null);
        } else {
          setEstado("error");
          setError(res.error);
        }
      });
    }, 700);
  };

  return (
    <div className="flex flex-col gap-2 border-b border-zinc-100 py-3 last:border-0">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm leading-snug text-zinc-800">{descripcion}</p>
        <span className="shrink-0 pt-0.5">
          {estado === "saving" && <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />}
          {estado === "saved" && <Check className="h-4 w-4 text-emerald-600" />}
          {estado === "error" && <CircleAlert className="h-4 w-4 text-red-600" />}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={valor}
          disabled={!editable}
          onChange={(e) => programarGuardado(Number(e.target.value))}
        />
        <div className="flex w-28 shrink-0 items-center gap-1">
          <input
            type="number"
            min={0}
            max={100}
            value={valor}
            disabled={!editable}
            onChange={(e) =>
              programarGuardado(Math.min(100, Math.max(0, Number(e.target.value) || 0)))
            }
            className="h-9 w-16 rounded-md border border-zinc-300 px-2 text-right text-sm tabular-nums outline-none focus:border-zinc-500"
          />
          <span className="text-sm text-zinc-500">%</span>
        </div>
      </div>
      <div className="flex items-center justify-between text-xs text-zinc-500">
        <span>
          Anterior:{" "}
          <span className="font-medium tabular-nums text-zinc-700">
            {anterior !== null ? `${anterior}%` : "—"}
          </span>
          {anterior !== null && valor !== anterior && (
            <span className={valor > anterior ? "ml-1 text-emerald-600" : "ml-1 text-red-600"}>
              ({valor > anterior ? "+" : ""}
              {valor - anterior} pts)
            </span>
          )}
        </span>
        {monto > 0 && (
          <span className="tabular-nums">
            $ {Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(monto)}
          </span>
        )}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
