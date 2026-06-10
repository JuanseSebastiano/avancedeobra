import { redirect } from "next/navigation";
import { getSesion } from "@/lib/data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ImportForm } from "./import-form";

export const dynamic = "force-dynamic";

export default async function ImportarPage() {
  const sesion = await getSesion();
  if (!sesion) redirect("/login");

  return (
    <div className="mx-auto max-w-lg">
      <Card>
        <CardHeader>
          <CardTitle>Importar planilla de avance</CardTitle>
          <p className="text-sm text-zinc-500">
            Sube la planilla &quot;AVANCE_DE_OBRA_HARBOUR_TOWER&quot;. La importación es
            idempotente: los ítems existentes se actualizan (no se duplican) y solo se
            registran los avances que cambiaron.
          </p>
        </CardHeader>
        <CardContent>
          {sesion.rol === "admin" ? (
            <ImportForm />
          ) : (
            <p className="text-sm text-zinc-500">
              Solo el DDO (admin) puede importar planillas.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
