"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

interface Opcion {
  id: string;
  nombre: string;
}

interface Props {
  zonas: Opcion[];
  pisos: Opcion[];
  rubros: Opcion[];
  zonaId: string;
  pisoId: string;
  rubroId: string;
}

export function Selector({ zonas, pisos, rubros, zonaId, pisoId, rubroId }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const navegar = (cambios: Record<string, string>) => {
    const params = new URLSearchParams(searchParams);
    for (const [k, v] of Object.entries(cambios)) params.set(k, v);
    router.push(`/carga?${params.toString()}`);
  };

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <div className="flex flex-col gap-1">
        <Label>Zona</Label>
        <Select
          value={zonaId}
          onChange={(e) => navegar({ zona: e.target.value, piso: "", rubro: "" })}
        >
          {zonas.map((z) => (
            <option key={z.id} value={z.id}>
              {z.nombre}
            </option>
          ))}
        </Select>
      </div>
      <div className="flex flex-col gap-1">
        <Label>Piso</Label>
        <Select value={pisoId} onChange={(e) => navegar({ piso: e.target.value })}>
          {pisos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </Select>
      </div>
      <div className="col-span-2 flex flex-col gap-1 sm:col-span-1">
        <Label>Rubro</Label>
        <Select value={rubroId} onChange={(e) => navegar({ rubro: e.target.value })}>
          {rubros.map((r) => (
            <option key={r.id} value={r.id}>
              {r.nombre}
            </option>
          ))}
        </Select>
      </div>
    </div>
  );
}
