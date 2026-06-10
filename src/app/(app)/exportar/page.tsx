import { redirect } from "next/navigation";
import { FileDown } from "lucide-react";
import { getSesion } from "@/lib/data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { nombreArchivo } from "@/lib/excel/export";

export const dynamic = "force-dynamic";

export default async function ExportarPage() {
  const sesion = await getSesion();
  if (!sesion) redirect("/login");

  return (
    <div className="mx-auto max-w-lg">
      <Card>
        <CardHeader>
          <CardTitle>Exportar a Excel</CardTitle>
          <p className="text-sm text-zinc-500">
            Genera <code className="text-xs">{nombreArchivo(new Date())}</code> con el
            estado actual: una hoja por zona y las hojas &quot;PROM. PONDERADO&quot; con
            fórmulas SUMPRODUCT/SUM (los promedios se recalculan si editás montos o
            porcentajes en Excel).
          </p>
        </CardHeader>
        <CardContent>
          <a
            href="/api/exportar"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-700"
          >
            <FileDown className="h-4 w-4" />
            Descargar planilla
          </a>
        </CardContent>
      </Card>
    </div>
  );
}
