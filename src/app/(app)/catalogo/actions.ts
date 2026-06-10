"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSesion, type Sesion } from "@/lib/data";

export type AccionResultado = { ok: true } | { ok: false; error: string };

async function comoAdmin(): Promise<Sesion | { ok: false; error: string }> {
  const sesion = await getSesion();
  if (!sesion) return { ok: false, error: "Sesión expirada" };
  if (sesion.rol !== "admin") return { ok: false, error: "Solo el DDO (admin) puede editar el catálogo" };
  return sesion;
}

function refrescar() {
  revalidatePath("/catalogo");
  revalidatePath("/carga");
  revalidatePath("/");
}

const slug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);

const nombreSchema = z.string().trim().min(1, "Nombre requerido").max(200);

export async function crearZona(formData: FormData): Promise<AccionResultado> {
  const sesion = await comoAdmin();
  if ("ok" in sesion) return sesion;
  const nombre = nombreSchema.safeParse(formData.get("nombre"));
  const codigo = nombreSchema.safeParse(formData.get("codigo"));
  if (!nombre.success || !codigo.success) return { ok: false, error: "Datos inválidos" };

  const { error } = await sesion.supabase.from("zonas").insert({
    obra_id: sesion.obra.id,
    codigo: codigo.data.toUpperCase(),
    nombre: nombre.data,
    orden: 99,
  });
  if (error) return { ok: false, error: error.message };
  refrescar();
  return { ok: true };
}

export async function crearPiso(formData: FormData): Promise<AccionResultado> {
  const sesion = await comoAdmin();
  if ("ok" in sesion) return sesion;
  const zonaId = z.string().uuid().safeParse(formData.get("zona_id"));
  const codigo = nombreSchema.safeParse(formData.get("codigo"));
  if (!zonaId.success || !codigo.success) return { ok: false, error: "Datos inválidos" };

  const { error } = await sesion.supabase.from("pisos").insert({
    obra_id: sesion.obra.id,
    zona_id: zonaId.data,
    codigo: codigo.data.toUpperCase(),
    orden: 99,
  });
  if (error) return { ok: false, error: error.message };
  refrescar();
  return { ok: true };
}

export async function crearRubro(formData: FormData): Promise<AccionResultado> {
  const sesion = await comoAdmin();
  if ("ok" in sesion) return sesion;
  const zonaId = z.string().uuid().safeParse(formData.get("zona_id"));
  const nombre = nombreSchema.safeParse(formData.get("nombre"));
  if (!zonaId.success || !nombre.success) return { ok: false, error: "Datos inválidos" };

  const { data: rubro, error } = await sesion.supabase
    .from("rubros")
    .insert({
      obra_id: sesion.obra.id,
      zona_id: zonaId.data,
      codigo: slug(nombre.data),
      nombre: nombre.data,
      orden: 99,
    })
    .select()
    .single();
  if (error) return { ok: false, error: error.message };

  // subrubro General por defecto para poder colgar ítems directamente
  const { error: subError } = await sesion.supabase.from("subrubros").insert({
    obra_id: sesion.obra.id,
    rubro_id: rubro.id,
    codigo: "general",
    nombre: "General",
    orden: 0,
  });
  if (subError) return { ok: false, error: subError.message };
  refrescar();
  return { ok: true };
}

export async function crearItem(formData: FormData): Promise<AccionResultado> {
  const sesion = await comoAdmin();
  if ("ok" in sesion) return sesion;
  const parsed = z
    .object({
      subrubro_id: z.string().uuid(),
      descripcion: nombreSchema,
      monto: z.coerce.number().min(0),
    })
    .safeParse({
      subrubro_id: formData.get("subrubro_id"),
      descripcion: formData.get("descripcion"),
      monto: formData.get("monto") || 0,
    });
  if (!parsed.success) return { ok: false, error: "Datos inválidos" };

  const { error } = await sesion.supabase.from("items").insert({
    obra_id: sesion.obra.id,
    ...parsed.data,
    orden: 9999,
  });
  if (error) return { ok: false, error: error.message };
  refrescar();
  return { ok: true };
}

export async function actualizarItem(formData: FormData): Promise<AccionResultado> {
  const sesion = await comoAdmin();
  if ("ok" in sesion) return sesion;
  const parsed = z
    .object({
      id: z.string().uuid(),
      descripcion: nombreSchema,
      monto: z.coerce.number().min(0),
      activo: z.coerce.boolean(),
    })
    .safeParse({
      id: formData.get("id"),
      descripcion: formData.get("descripcion"),
      monto: formData.get("monto") || 0,
      activo: formData.get("activo") === "on",
    });
  if (!parsed.success) return { ok: false, error: "Datos inválidos" };

  const { id, ...resto } = parsed.data;
  const { error } = await sesion.supabase.from("items").update(resto).eq("id", id);
  if (error) return { ok: false, error: error.message };
  refrescar();
  return { ok: true };
}

export async function actualizarRubro(formData: FormData): Promise<AccionResultado> {
  const sesion = await comoAdmin();
  if ("ok" in sesion) return sesion;
  const parsed = z
    .object({
      id: z.string().uuid(),
      responsable: z.string().trim().max(120),
      activo: z.coerce.boolean(),
    })
    .safeParse({
      id: formData.get("id"),
      responsable: formData.get("responsable") ?? "",
      activo: formData.get("activo") === "on",
    });
  if (!parsed.success) return { ok: false, error: "Datos inválidos" };

  const { id, responsable, activo } = parsed.data;
  const { error } = await sesion.supabase
    .from("rubros")
    .update({ responsable: responsable || null, activo })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  refrescar();
  return { ok: true };
}

export async function toggleZona(formData: FormData): Promise<AccionResultado> {
  const sesion = await comoAdmin();
  if ("ok" in sesion) return sesion;
  const parsed = z
    .object({ id: z.string().uuid(), activo: z.coerce.boolean() })
    .safeParse({ id: formData.get("id"), activo: formData.get("activo") === "on" });
  if (!parsed.success) return { ok: false, error: "Datos inválidos" };

  const { error } = await sesion.supabase
    .from("zonas")
    .update({ activo: parsed.data.activo })
    .eq("id", parsed.data.id);
  if (error) return { ok: false, error: error.message };
  refrescar();
  return { ok: true };
}
