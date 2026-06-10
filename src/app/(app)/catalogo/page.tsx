import Link from "next/link";
import { redirect } from "next/navigation";
import { getCatalogo, getSesion } from "@/lib/data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  actualizarItem,
  actualizarRubro,
  crearItem,
  crearPiso,
  crearRubro,
  crearZona,
  toggleZona,
} from "./actions";
import { FormAccion } from "./form-accion";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ zona?: string }>;
}

export default async function CatalogoPage({ searchParams }: Props) {
  const sesion = await getSesion();
  if (!sesion) redirect("/login");
  const params = await searchParams;
  const esAdmin = sesion.rol === "admin";

  const catalogo = await getCatalogo(sesion.supabase, sesion.obra.id, {
    incluirInactivos: esAdmin,
  });
  const zona = catalogo.zonas.find((z) => z.id === params.zona) ?? catalogo.zonas[0];

  if (!zona) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-zinc-500">No hay zonas todavía.</p>
        {esAdmin && <NuevaZona />}
      </div>
    );
  }

  const pisos = catalogo.pisos.filter((p) => p.zona_id === zona.id);
  const rubros = catalogo.rubros.filter((r) => r.zona_id === zona.id);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {catalogo.zonas.map((z) => (
          <Link key={z.id} href={`/catalogo?zona=${z.id}`}>
            <Badge variant={z.id === zona.id ? "green" : "default"}>
              {z.nombre}
              {!z.activo && " (inactiva)"}
            </Badge>
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {zona.nombre} <span className="font-normal text-zinc-400">({zona.codigo})</span>
          </CardTitle>
          <p className="text-xs text-zinc-500">
            Pisos: {pisos.map((p) => p.codigo).join(", ") || "—"}
          </p>
        </CardHeader>
        {esAdmin && (
          <CardContent className="flex flex-wrap items-end gap-3">
            <FormAccion accion={crearPiso} className="flex items-end gap-2">
              <input type="hidden" name="zona_id" value={zona.id} />
              <div className="flex flex-col gap-1">
                <Label htmlFor="nuevo-piso">Agregar piso</Label>
                <Input id="nuevo-piso" name="codigo" placeholder="ej: 57" className="w-28" required />
              </div>
              <Button type="submit" variant="outline" size="sm" className="h-10">
                Agregar
              </Button>
            </FormAccion>
            <FormAccion accion={toggleZona} className="flex items-end gap-2">
              <input type="hidden" name="id" value={zona.id} />
              {zona.activo ? (
                <Button type="submit" variant="ghost" size="sm" className="h-10">
                  Desactivar zona
                </Button>
              ) : (
                <>
                  <input type="hidden" name="activo" value="on" />
                  <Button type="submit" variant="ghost" size="sm" className="h-10">
                    Reactivar zona
                  </Button>
                </>
              )}
            </FormAccion>
          </CardContent>
        )}
      </Card>

      {rubros.map((rubro) => {
        const subrubros = catalogo.subrubros.filter((s) => s.rubro_id === rubro.id);
        return (
          <details key={rubro.id} className="rounded-xl border border-zinc-200 bg-white shadow-sm">
            <summary className="flex cursor-pointer items-center justify-between gap-2 p-4 text-sm font-semibold">
              <span>
                {rubro.nombre}
                {!rubro.activo && <Badge className="ml-2">inactivo</Badge>}
              </span>
              <span className="text-xs font-normal text-zinc-500">
                {rubro.responsable ?? "sin responsable"}
              </span>
            </summary>
            <div className="border-t border-zinc-100 p-4">
              {esAdmin && (
                <FormAccion accion={actualizarRubro} className="mb-4 flex flex-wrap items-end gap-2">
                  <input type="hidden" name="id" value={rubro.id} />
                  <div className="flex flex-col gap-1">
                    <Label>Responsable</Label>
                    <Input
                      name="responsable"
                      defaultValue={rubro.responsable ?? ""}
                      placeholder="ej: JO Norte"
                      className="w-44"
                    />
                  </div>
                  <label className="flex h-10 items-center gap-2 text-sm">
                    <input type="checkbox" name="activo" defaultChecked={rubro.activo} />
                    Activo
                  </label>
                  <Button type="submit" variant="outline" size="sm" className="h-10">
                    Guardar
                  </Button>
                </FormAccion>
              )}

              {subrubros.map((sub) => {
                const items = catalogo.items.filter((i) => i.subrubro_id === sub.id);
                return (
                  <div key={sub.id} className="mb-4 last:mb-0">
                    {sub.codigo !== "general" && (
                      <p className="mb-1 text-xs font-semibold uppercase text-zinc-500">
                        {sub.nombre}
                      </p>
                    )}
                    <div className="flex flex-col gap-2">
                      {items.map((item) =>
                        esAdmin ? (
                          <FormAccion
                            key={item.id}
                            accion={actualizarItem}
                            className="flex flex-wrap items-center gap-2 rounded-md border border-zinc-100 p-2"
                          >
                            <input type="hidden" name="id" value={item.id} />
                            <Input
                              name="descripcion"
                              defaultValue={item.descripcion}
                              className="h-9 min-w-48 flex-1 text-xs"
                            />
                            <Input
                              name="monto"
                              type="number"
                              step="0.01"
                              min={0}
                              defaultValue={item.monto}
                              className="h-9 w-36 text-right text-xs tabular-nums"
                            />
                            <label className="flex items-center gap-1 text-xs">
                              <input type="checkbox" name="activo" defaultChecked={item.activo} />
                              activo
                            </label>
                            <Button type="submit" variant="ghost" size="sm">
                              Guardar
                            </Button>
                          </FormAccion>
                        ) : (
                          <div
                            key={item.id}
                            className="flex items-center justify-between gap-2 rounded-md border border-zinc-100 p-2 text-xs"
                          >
                            <span>{item.descripcion}</span>
                            <span className="tabular-nums text-zinc-500">
                              $ {Intl.NumberFormat("es-AR").format(item.monto)}
                            </span>
                          </div>
                        )
                      )}
                      {esAdmin && (
                        <FormAccion accion={crearItem} className="flex flex-wrap items-center gap-2 p-2">
                          <input type="hidden" name="subrubro_id" value={sub.id} />
                          <Input
                            name="descripcion"
                            placeholder="Nuevo ítem…"
                            className="h-9 min-w-48 flex-1 text-xs"
                            required
                          />
                          <Input
                            name="monto"
                            type="number"
                            step="0.01"
                            min={0}
                            placeholder="Monto"
                            className="h-9 w-36 text-right text-xs"
                          />
                          <Button type="submit" variant="outline" size="sm">
                            Agregar
                          </Button>
                        </FormAccion>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </details>
        );
      })}

      {esAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>Nuevo rubro en {zona.nombre}</CardTitle>
          </CardHeader>
          <CardContent>
            <FormAccion accion={crearRubro} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="zona_id" value={zona.id} />
              <div className="flex flex-1 flex-col gap-1">
                <Label>Nombre</Label>
                <Input name="nombre" placeholder="ej: Ascensores" required />
              </div>
              <Button type="submit" className="h-10">
                Crear rubro
              </Button>
            </FormAccion>
          </CardContent>
        </Card>
      )}

      {esAdmin && <NuevaZona />}
    </div>
  );
}

function NuevaZona() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Nueva zona</CardTitle>
      </CardHeader>
      <CardContent>
        <FormAccion accion={crearZona} className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1">
            <Label>Código</Label>
            <Input name="codigo" placeholder="ej: AME" className="w-28" required />
          </div>
          <div className="flex flex-1 flex-col gap-1">
            <Label>Nombre</Label>
            <Input name="nombre" placeholder="ej: Amenities" required />
          </div>
          <Button type="submit" className="h-10">
            Crear zona
          </Button>
        </FormAccion>
      </CardContent>
    </Card>
  );
}
