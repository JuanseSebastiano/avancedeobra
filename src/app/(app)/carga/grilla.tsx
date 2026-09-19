"use client";

import { Fragment, useCallback, useEffect, useMemo, useReducer, useRef, useState, useTransition } from "react";
import { Check, CircleAlert, Loader2, Paintbrush, Save, Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { SIN_DATO, type GrillaData, type Zona } from "@/lib/types";
import { guardarLote } from "./actions";
import { borrarBorrador, guardarBorrador, hace, leerBorrador } from "./borrador";
import {
  celdasParaGuardar,
  estadoInicial,
  reducer,
  seleccionDe,
  type Contexto,
} from "./estado";
import {
  dentro,
  indicePlano,
  normalizarValor,
  parsearPegado,
  tamanoRango,
  type Celda,
  type Rango,
} from "./seleccion";

interface Props {
  obraId: string;
  zonas: Zona[];
  inicial: GrillaData;
  editable: boolean;
}

type EstadoGuardado =
  | { tipo: "idle" }
  | { tipo: "ok"; insertados: number; sinCambio: number }
  | { tipo: "error"; mensaje: string };

/** El 92,5 % de las celdas reales son exactamente 0 % o 100 %: una tecla cada una. */
const ATAJOS: Record<string, number> = { "0": 0, "1": 100 };

export function Grilla({ obraId, zonas, inicial, editable }: Props) {
  const [data, setData] = useState<GrillaData>(inicial);
  const [zonaId, setZonaId] = useState(inicial.zonaId);
  const [cargando, setCargando] = useState(false);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [rubroId, setRubroId] = useState<string>("");
  const [pincel, setPincel] = useState<number | null>(null);
  const [estado, setEstado] = useState<EstadoGuardado>({ tipo: "idle" });
  const [aviso, setAviso] = useState<string | null>(null);
  const [borradorPendiente, setBorradorPendiente] = useState<{ n: number; cuando: number } | null>(
    null
  );
  const [pendiente, startTransition] = useTransition();

  const [g, dispatch] = useReducer(reducer, inicial.valores, estadoInicial);
  const arrastrando = useRef(false);
  const contenedor = useRef<HTMLDivElement>(null);

  const rubros = useMemo(() => {
    const vistos = new Map<string, string>();
    for (const f of data.filas) if (!vistos.has(f.rubroId)) vistos.set(f.rubroId, f.rubroNombre);
    return [...vistos].map(([id, nombre]) => ({ id, nombre }));
  }, [data.filas]);

  const rubroActivo = rubros.find((r) => r.id === rubroId)?.id ?? rubros[0]?.id ?? "";

  const filasVisibles = useMemo(() => {
    const out: number[] = [];
    data.filas.forEach((f, i) => {
      if (!rubroActivo || f.rubroId === rubroActivo) out.push(i);
    });
    return out;
  }, [data.filas, rubroActivo]);

  const ancho = data.pisos.length;
  const ctx: Contexto = useMemo(
    () => ({ filasVisibles, ancho, alto: filasVisibles.length }),
    [filasVisibles, ancho]
  );

  const fecha = data.corte?.fecha ?? null;
  const corteCerrado = data.corte?.estado === "cerrado";
  const puedeEditar = editable && !corteCerrado;
  const guardando = pendiente;

  // --- cambio de zona: una request, sin recargar la página -------------------
  useEffect(() => {
    if (zonaId === data.zonaId) return;
    const ctrl = new AbortController();
    setCargando(true);
    setErrorCarga(null);
    fetch(`/api/carga/grilla?zona=${encodeURIComponent(zonaId)}`, { signal: ctrl.signal })
      .then(async (r) => {
        const cuerpo = await r.json();
        if (!r.ok) throw new Error(cuerpo?.error ?? "No se pudo cargar la zona");
        return cuerpo as GrillaData;
      })
      .then((nueva) => {
        setData(nueva);
        dispatch({ tipo: "reset", valores: nueva.valores });
        setRubroId("");
        setEstado({ tipo: "idle" });
      })
      .catch((e: unknown) => {
        if (e instanceof Error && e.name === "AbortError") return;
        setErrorCarga(e instanceof Error ? e.message : "No se pudo cargar la zona");
      })
      .finally(() => setCargando(false));
    return () => ctrl.abort();
  }, [zonaId, data.zonaId]);

  // --- borrador --------------------------------------------------------------
  useEffect(() => {
    const b = leerBorrador(obraId, data.zonaId, fecha);
    setBorradorPendiente(b ? { n: Object.keys(b.celdas).length, cuando: b.guardadoEn } : null);
  }, [obraId, data.zonaId, fecha]);

  useEffect(() => {
    if (g.sucias.size === 0) return;
    const t = setTimeout(() => {
      const celdas: Record<string, number> = {};
      for (const indice of g.sucias.keys()) {
        const fila = data.filas[Math.floor(indice / ancho)];
        const piso = data.pisos[indice % ancho];
        if (fila && piso) celdas[`${fila.itemId}|${piso.id}`] = g.valores[indice];
      }
      guardarBorrador(obraId, data.zonaId, fecha, celdas);
    }, 300);
    return () => clearTimeout(t);
  }, [g.sucias, g.valores, obraId, data, fecha, ancho]);

  useEffect(() => {
    if (g.sucias.size === 0) return;
    const alSalir = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", alSalir);
    return () => window.removeEventListener("beforeunload", alSalir);
  }, [g.sucias.size]);

  const restaurarBorrador = useCallback(() => {
    const b = leerBorrador(obraId, data.zonaId, fecha);
    if (!b) return;
    const posicion = new Map<string, Celda>();
    data.filas.forEach((fila, f) =>
      data.pisos.forEach((piso, c) => posicion.set(`${fila.itemId}|${piso.id}`, { f, c }))
    );
    const celdas: Celda[] = [];
    const valores: number[] = [];
    for (const [k, v] of Object.entries(b.celdas)) {
      const pos = posicion.get(k);
      if (!pos) continue;
      celdas.push(pos);
      valores.push(v);
    }
    // El borrador guarda posiciones absolutas, así que se aplica sobre todas las filas.
    dispatch({
      tipo: "aplicarMuchos",
      celdas,
      valores,
      ctx: { filasVisibles: data.filas.map((_, i) => i), ancho, alto: data.filas.length },
    });
    setBorradorPendiente(null);
  }, [obraId, data, fecha, ancho]);

  // --- teclado ---------------------------------------------------------------
  const alTeclear = (e: React.KeyboardEvent) => {
    if (!g.activa) return;
    const meta = e.ctrlKey || e.metaKey;
    const mover = (df: number, dc: number) => {
      e.preventDefault();
      dispatch({ tipo: "mover", df, dc, extender: e.shiftKey, ctx });
    };

    if (e.key === "ArrowUp") return mover(-1, 0);
    if (e.key === "ArrowDown") return mover(1, 0);
    if (e.key === "ArrowLeft") return mover(0, -1);
    if (e.key === "ArrowRight") return mover(0, 1);
    if (e.key === "Tab") {
      e.preventDefault();
      return dispatch({ tipo: "mover", df: 0, dc: e.shiftKey ? -1 : 1, extender: false, ctx });
    }
    if (e.key === "Enter") {
      e.preventDefault();
      return dispatch({ tipo: "mover", df: 1, dc: 0, extender: false, ctx });
    }

    if (!puedeEditar) return;
    const seleccion = seleccionDe(g);

    if (meta && (e.key === "r" || e.key === "R")) {
      e.preventDefault();
      return dispatch({ tipo: "rellenarDerecha", ctx });
    }
    if (meta && (e.key === "d" || e.key === "D")) {
      e.preventDefault();
      return dispatch({ tipo: "rellenarAbajo", ctx });
    }
    if (meta) return;

    if (e.key === "Delete" || e.key === "Backspace" || e.key === "x" || e.key === "X") {
      e.preventDefault();
      return dispatch({ tipo: "aplicar", celdas: seleccion, valor: SIN_DATO, ctx });
    }
    if (e.key in ATAJOS) {
      e.preventDefault();
      return dispatch({ tipo: "aplicar", celdas: seleccion, valor: ATAJOS[e.key], ctx });
    }
    if (/^[2-9]$/.test(e.key)) {
      e.preventDefault();
      const v = normalizarValor(`${e.key}0`);
      if (v !== null) dispatch({ tipo: "aplicar", celdas: seleccion, valor: v, ctx });
    }
  };

  const alPegar = (e: React.ClipboardEvent) => {
    if (!puedeEditar || !g.activa) return;
    const bloque = parsearPegado(e.clipboardData.getData("text/plain"));
    if (!bloque) return;
    e.preventDefault();

    const celdas: Celda[] = [];
    const valores: number[] = [];
    let ignoradas = 0;
    for (let df = 0; df < bloque.filas; df++) {
      for (let dc = 0; dc < bloque.columnas; dc++) {
        const f = g.activa.f + df;
        const c = g.activa.c + dc;
        if (f >= filasVisibles.length || c >= ancho) continue;
        const v = bloque.valores[df][dc];
        if (v === null) {
          ignoradas++;
          continue;
        }
        celdas.push({ f, c });
        valores.push(v);
      }
    }
    if (celdas.length === 0) {
      setAviso("No se pudo interpretar ninguna celda del bloque pegado");
      return;
    }
    dispatch({ tipo: "aplicarMuchos", celdas, valores, ctx });
    setAviso(
      `Se pegaron ${celdas.length} celdas${ignoradas > 0 ? ` · ${ignoradas} sin interpretar` : ""}`
    );
  };

  // --- guardado --------------------------------------------------------------
  const guardar = () => {
    if (g.sucias.size === 0) return;
    const indices = [...g.sucias.keys()];
    const { celdas, omitidas } = celdasParaGuardar(g, data.filas, data.pisos);

    if (celdas.length === 0) {
      setEstado({ tipo: "error", mensaje: "Las celdas sin dato no se pueden guardar" });
      return;
    }

    startTransition(async () => {
      const res = await guardarLote({ fecha, celdas });
      if (res.ok) {
        dispatch({ tipo: "limpiarSucias" });
        borrarBorrador(obraId, data.zonaId, fecha);
        setEstado({ tipo: "ok", insertados: res.insertados, sinCambio: res.sinCambio });
        if (omitidas > 0) {
          setAviso(`${omitidas} celdas quedaron sin dato y no se guardaron`);
        }
      } else {
        // Rollback real: el editor anterior dejaba en pantalla el valor que no entró.
        dispatch({ tipo: "revertir", indices });
        setEstado({ tipo: "error", mensaje: res.error });
      }
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <Controles
        zonas={zonas}
        zonaId={zonaId}
        onZona={setZonaId}
        rubros={rubros}
        rubroId={rubroActivo}
        onRubro={setRubroId}
        cargando={cargando}
        corte={data.corte}
        pincel={pincel}
        onPincel={setPincel}
        puedeEditar={puedeEditar}
      />

      {errorCarga && <Nota tono="error">{errorCarga}</Nota>}
      {corteCerrado && data.corte && (
        <Nota tono="aviso">
          El corte del {formatearFecha(data.corte.fecha)} está cerrado: no admite cambios.
        </Nota>
      )}
      {borradorPendiente && (
        <Nota tono="aviso">
          <span>
            Tenés {borradorPendiente.n} celdas sin guardar de {hace(borradorPendiente.cuando)}.
          </span>
          <span className="ml-auto flex gap-2">
            <Button size="sm" variant="outline" onClick={restaurarBorrador}>
              Restaurar
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                borrarBorrador(obraId, data.zonaId, fecha);
                setBorradorPendiente(null);
              }}
            >
              Descartar
            </Button>
          </span>
        </Nota>
      )}
      {aviso && (
        <Nota tono="info">
          <span>{aviso}</span>
          <button
            className="ml-auto text-zinc-400 hover:text-zinc-700"
            onClick={() => setAviso(null)}
            aria-label="Cerrar aviso"
          >
            ✕
          </button>
        </Nota>
      )}

      <div
        ref={contenedor}
        tabIndex={0}
        onKeyDown={alTeclear}
        onPaste={alPegar}
        onPointerUp={() => {
          arrastrando.current = false;
        }}
        onPointerLeave={() => {
          arrastrando.current = false;
        }}
        className="overflow-auto rounded-xl border bg-white outline-none focus:ring-2 focus:ring-emerald-500/40"
        style={{ maxHeight: "min(70vh, 640px)" }}
      >
        <Tabla
          data={data}
          filasVisibles={filasVisibles}
          valores={g.valores}
          sucias={g.sucias}
          activa={g.activa}
          rango={g.rango}
          puedeEditar={puedeEditar}
          onCeldaDown={(f, c, shift) => {
            contenedor.current?.focus();
            arrastrando.current = true;
            if (pincel !== null && puedeEditar) {
              dispatch({ tipo: "foco", celda: { f, c }, extender: false });
              dispatch({ tipo: "aplicar", celdas: [{ f, c }], valor: pincel, ctx });
              return;
            }
            dispatch({ tipo: "foco", celda: { f, c }, extender: shift });
          }}
          onCeldaEnter={(f, c) => {
            if (!arrastrando.current) return;
            if (pincel !== null && puedeEditar) {
              dispatch({ tipo: "foco", celda: { f, c }, extender: false });
              dispatch({ tipo: "aplicar", celdas: [{ f, c }], valor: pincel, ctx });
              return;
            }
            dispatch({ tipo: "foco", celda: { f, c }, extender: true });
          }}
        />
      </div>

      <BarraAcciones
        sucias={g.sucias.size}
        seleccionadas={g.rango ? tamanoRango(g.rango) : g.activa ? 1 : 0}
        estado={estado}
        guardando={guardando}
        puedeEditar={puedeEditar}
        onGuardar={guardar}
        onDescartar={() => {
          dispatch({ tipo: "descartar" });
          borrarBorrador(obraId, data.zonaId, fecha);
          setEstado({ tipo: "idle" });
        }}
      />

      <Ayuda />
    </div>
  );
}

// ---------------------------------------------------------------------------

function Tabla({
  data,
  filasVisibles,
  valores,
  sucias,
  activa,
  rango,
  puedeEditar,
  onCeldaDown,
  onCeldaEnter,
}: {
  data: GrillaData;
  filasVisibles: number[];
  valores: number[];
  sucias: Map<number, number>;
  activa: Celda | null;
  rango: Rango | null;
  puedeEditar: boolean;
  onCeldaDown: (f: number, c: number, shift: boolean) => void;
  onCeldaEnter: (f: number, c: number) => void;
}) {
  const ancho = data.pisos.length;

  if (filasVisibles.length === 0) {
    return <p className="p-6 text-sm text-zinc-500">No hay ítems para este rubro.</p>;
  }

  let subrubroPrevio = "";

  return (
    <table className="border-separate border-spacing-0 text-xs">
      <thead className="sticky top-0 z-20">
        <tr>
          <th className="sticky left-0 z-30 min-w-[18rem] max-w-[18rem] border-b border-r bg-zinc-50 px-3 py-2 text-left font-medium text-zinc-600">
            Ítem
          </th>
          {data.pisos.map((p) => (
            <th
              key={p.id}
              className="border-b border-r bg-zinc-50 px-1 py-2 text-center font-medium text-zinc-600"
              style={{ minWidth: "3rem" }}
              title={p.nivelCodigo ? `Nivel ${p.nivelCodigo}` : undefined}
            >
              {p.codigo}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {filasVisibles.map((filaPlana, f) => {
          const fila = data.filas[filaPlana];
          const encabezado = fila.subrubroNombre !== subrubroPrevio ? fila.subrubroNombre : null;
          subrubroPrevio = fila.subrubroNombre;

          return (
            <Fragment key={fila.itemId}>
              {encabezado && (
                <tr>
                  <td
                    colSpan={ancho + 1}
                    className="sticky left-0 border-b bg-zinc-100/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-600"
                  >
                    {encabezado}
                  </td>
                </tr>
              )}
              <tr>
                <th
                  scope="row"
                  className="sticky left-0 z-10 min-w-[18rem] max-w-[18rem] truncate border-b border-r bg-white px-3 py-1 text-left font-normal text-zinc-700"
                  title={fila.descripcion}
                >
                  {fila.descripcion}
                </th>
                {data.pisos.map((piso, c) => {
                  const indice = indicePlano(filaPlana, c, ancho);
                  const valor = valores[indice];
                  const sucia = sucias.has(indice);
                  const esActiva = activa?.f === f && activa?.c === c;
                  const enRango = dentro(rango, f, c);
                  return (
                    <td
                      key={piso.id}
                      aria-selected={esActiva || enRango}
                      onPointerDown={(e) => {
                        e.preventDefault();
                        onCeldaDown(f, c, e.shiftKey);
                      }}
                      onPointerEnter={() => onCeldaEnter(f, c)}
                      className={cn(
                        "select-none border-b border-r px-1 py-1 text-center tabular-nums",
                        puedeEditar ? "cursor-cell" : "cursor-default",
                        colorCelda(valor),
                        enRango && "ring-1 ring-inset ring-emerald-500/60",
                        esActiva && "ring-2 ring-inset ring-emerald-600",
                        sucia && "font-semibold outline outline-1 -outline-offset-1 outline-amber-500"
                      )}
                    >
                      {valor === SIN_DATO ? "·" : valor}
                    </td>
                  );
                })}
              </tr>
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

/** Escala discreta. "Sin dato" se distingue de 0 %: nunca se cargó, no es cero. */
function colorCelda(v: number): string {
  if (v === SIN_DATO) return "bg-zinc-50 text-zinc-300";
  if (v === 0) return "bg-white text-zinc-400";
  if (v < 25) return "bg-emerald-50 text-emerald-900";
  if (v < 50) return "bg-emerald-100 text-emerald-900";
  if (v < 75) return "bg-emerald-200 text-emerald-900";
  if (v < 100) return "bg-emerald-300 text-emerald-950";
  return "bg-emerald-600 text-white";
}

function Controles({
  zonas,
  zonaId,
  onZona,
  rubros,
  rubroId,
  onRubro,
  cargando,
  corte,
  pincel,
  onPincel,
  puedeEditar,
}: {
  zonas: Zona[];
  zonaId: string;
  onZona: (v: string) => void;
  rubros: { id: string; nombre: string }[];
  rubroId: string;
  onRubro: (v: string) => void;
  cargando: boolean;
  corte: GrillaData["corte"];
  pincel: number | null;
  onPincel: (v: number | null) => void;
  puedeEditar: boolean;
}) {
  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">Zona</span>
        <Select value={zonaId} onChange={(e) => onZona(e.target.value)} className="w-40">
          {zonas.map((z) => (
            <option key={z.id} value={z.id}>
              {z.nombre}
            </option>
          ))}
        </Select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">Rubro</span>
        <Select value={rubroId} onChange={(e) => onRubro(e.target.value)} className="w-64">
          {rubros.map((r) => (
            <option key={r.id} value={r.id}>
              {r.nombre}
            </option>
          ))}
        </Select>
      </label>

      {puedeEditar && (
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">Pincel</span>
          <div className="flex gap-1">
            {[0, 50, 100].map((v) => (
              <Button
                key={v}
                size="sm"
                variant={pincel === v ? "default" : "outline"}
                onClick={() => onPincel(pincel === v ? null : v)}
                title={`Elegir ${v} % y pintar arrastrando`}
              >
                <Paintbrush className="mr-1 h-3 w-3" />
                {v}
              </Button>
            ))}
          </div>
        </div>
      )}

      <div className="ml-auto flex items-center gap-2 text-xs text-zinc-500">
        {cargando && <Loader2 className="h-4 w-4 animate-spin" />}
        {corte && <Badge variant="default">Corte {formatearFecha(corte.fecha)}</Badge>}
      </div>
    </div>
  );
}

function BarraAcciones({
  sucias,
  seleccionadas,
  estado,
  guardando,
  puedeEditar,
  onGuardar,
  onDescartar,
}: {
  sucias: number;
  seleccionadas: number;
  estado: EstadoGuardado;
  guardando: boolean;
  puedeEditar: boolean;
  onGuardar: () => void;
  onDescartar: () => void;
}) {
  return (
    <div className="sticky bottom-0 flex flex-wrap items-center gap-3 rounded-xl border bg-white/95 px-3 py-2 shadow-sm backdrop-blur">
      <span className="text-sm text-zinc-600">
        {sucias > 0 ? (
          <strong className="text-amber-700">{sucias} celdas modificadas</strong>
        ) : (
          "Sin cambios"
        )}
        {seleccionadas > 1 && (
          <span className="ml-2 text-zinc-400">· {seleccionadas} seleccionadas</span>
        )}
      </span>

      {estado.tipo === "ok" && (
        <span className="flex items-center gap-1 text-sm text-emerald-700">
          <Check className="h-4 w-4" />
          {estado.insertados} guardadas
          {estado.sinCambio > 0 && ` · ${estado.sinCambio} sin cambio`}
        </span>
      )}
      {estado.tipo === "error" && (
        <span className="flex items-center gap-1 text-sm text-red-700">
          <CircleAlert className="h-4 w-4" />
          {estado.mensaje}
        </span>
      )}

      <div className="ml-auto flex gap-2">
        <Button variant="ghost" size="sm" onClick={onDescartar} disabled={sucias === 0 || guardando}>
          <Undo2 className="mr-1 h-4 w-4" />
          Descartar
        </Button>
        <Button onClick={onGuardar} disabled={!puedeEditar || sucias === 0 || guardando}>
          {guardando ? (
            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-1 h-4 w-4" />
          )}
          Guardar{sucias > 0 ? ` ${sucias}` : ""}
        </Button>
      </div>
    </div>
  );
}

function Ayuda() {
  return (
    <details className="rounded-xl border bg-white px-3 py-2 text-xs text-zinc-600">
      <summary className="cursor-pointer font-medium text-zinc-700">Atajos</summary>
      <ul className="mt-2 grid gap-1 sm:grid-cols-2">
        <li>
          <kbd>0</kbd> / <kbd>1</kbd> — 0 % / 100 % (son el 92 % de las celdas)
        </li>
        <li>
          <kbd>2</kbd>…<kbd>9</kbd> — 20 % … 90 %
        </li>
        <li>
          <kbd>x</kbd> o <kbd>Supr</kbd> — sin dato (distinto de 0 %)
        </li>
        <li>Arrastrar — seleccionar un rango de pisos</li>
        <li>
          <kbd>Ctrl</kbd>+<kbd>R</kbd> — repetir hacia la derecha
        </li>
        <li>
          <kbd>Ctrl</kbd>+<kbd>D</kbd> — repetir hacia abajo
        </li>
        <li>
          <kbd>Ctrl</kbd>+<kbd>V</kbd> — pegar un bloque desde Excel
        </li>
        <li>Pincel — elegir un valor y arrastrar sobre las celdas</li>
      </ul>
    </details>
  );
}

function Nota({ tono, children }: { tono: "info" | "aviso" | "error"; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm",
        tono === "info" && "border-zinc-200 bg-zinc-50 text-zinc-700",
        tono === "aviso" && "border-amber-200 bg-amber-50 text-amber-900",
        tono === "error" && "border-red-200 bg-red-50 text-red-800"
      )}
    >
      {children}
    </div>
  );
}

function formatearFecha(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}
