import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSesion } from "@/lib/data";
import { cargarGrilla } from "@/lib/avances/grilla";
import type { Zona } from "@/lib/types";
import { Grilla } from "./grilla";

export const dynamic = "force-dynamic";

export default async function CargaPage({
  searchParams,
}: {
  searchParams: Promise<{ zona?: string; fecha?: string }>;
}) {
  const params = await searchParams;
  const sesion = await getSesion();
  if (!sesion) redirect("/login");

  const { data: zonasData, error } = await sesion.supabase
    .from("zonas")
    .select("*")
    .eq("obra_id", sesion.obra.id)
    .order("orden");
  if (error) throw new Error(`Error leyendo zonas: ${error.message}`);

  const zonas = ((zonasData ?? []) as Zona[]).filter((z) => z.activo);

  if (zonas.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Carga de avance</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-zinc-600">
          Todavía no hay catálogo cargado. Importá la planilla desde{" "}
          <strong>Importar</strong> o cargá zonas y rubros en <strong>Catálogo</strong>.
        </CardContent>
      </Card>
    );
  }

  const zona = zonas.find((z) => z.id === params.zona) ?? zonas[0];
  const grilla = await cargarGrilla(sesion.supabase, sesion.obra.id, zona.id, {
    fecha: params.fecha ?? null,
  });

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold text-zinc-900">Carga de avance</h1>
        <p className="text-sm text-zinc-600">
          Filas: ítems. Columnas: pisos. Seleccioná un rango y escribí el valor una sola vez.
        </p>
      </div>

      <Grilla
        obraId={sesion.obra.id}
        zonas={zonas}
        inicial={grilla}
        editable={sesion.rol !== "viewer"}
      />
    </div>
  );
}
