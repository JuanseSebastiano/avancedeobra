"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { importarPlanilla, type ImportarEstado } from "./actions";

export function ImportForm() {
  const [estado, action, pending] = useActionState<ImportarEstado, FormData>(
    importarPlanilla,
    null
  );

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="archivo">Planilla (.xlsx)</Label>
        <Input
          id="archivo"
          name="archivo"
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          required
          className="h-auto py-2"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="fecha">Fecha de corte (opcional)</Label>
        <Input id="fecha" name="fecha" type="date" />
        <p className="text-xs text-zinc-500">
          Si se deja vacía se toma la fecha del nombre de las hojas (p.ej. &quot;SS -
          25-03-26&quot;).
        </p>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Importando…" : "Importar"}
      </Button>

      {estado && !estado.ok && <p className="text-sm text-red-600">{estado.error}</p>}
      {estado?.ok && (
        <div className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-800">
          <p className="font-medium">Importación completada — corte {estado.resultado.fechaCorte}</p>
          <ul className="mt-1 list-inside list-disc text-emerald-700">
            <li>
              Catálogo: {estado.resultado.zonas} zonas, {estado.resultado.pisos} pisos,{" "}
              {estado.resultado.rubros} rubros, {estado.resultado.subrubros} subrubros,{" "}
              {estado.resultado.items} ítems
            </li>
            <li>{estado.resultado.avancesInsertados} avances nuevos o modificados</li>
            <li>{estado.resultado.avancesSinCambio} sin cambios (no se duplicaron)</li>
          </ul>
        </div>
      )}
    </form>
  );
}
