import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getAvancesActuales, getCatalogo, getSesion } from "@/lib/data";
import { buildWorkbook, nombreArchivo } from "@/lib/excel/export";

export const dynamic = "force-dynamic";

export async function GET() {
  const sesion = await getSesion();
  if (!sesion) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const [catalogo, avances] = await Promise.all([
    getCatalogo(sesion.supabase, sesion.obra.id),
    getAvancesActuales(sesion.supabase, sesion.obra.id),
  ]);
  if (catalogo.zonas.length === 0) {
    return NextResponse.json({ error: "No hay datos para exportar" }, { status: 400 });
  }

  const fecha = new Date();
  const wb = buildWorkbook(catalogo, avances, fecha);
  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombreArchivo(fecha)}"`,
    },
  });
}
