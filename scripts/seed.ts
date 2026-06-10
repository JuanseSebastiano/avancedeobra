/**
 * Seed: crea la obra Harbour Tower e importa la planilla real adjunta en /data.
 *
 * Uso:
 *   npm run seed                      # usa data/AVANCE_DE_OBRA_HARBOUR_TOWER_-_25-03-26.xlsx
 *   npm run seed -- ruta/al/archivo.xlsx
 *
 * Requiere NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env.local
 * (la service key saltea RLS; este script corre solo en local).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { parseWorkbook } from "../src/lib/excel/parse";
import { importarWorkbook } from "../src/lib/importar";

config({ path: ".env.local" });
config({ path: ".env" });

const OBRA = { codigo: "HT", nombre: "Harbour Tower — Madero Harbour S.A." };
const ARCHIVO_DEFAULT = "data/AVANCE_DE_OBRA_HARBOUR_TOWER_-_25-03-26.xlsx";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local");
    process.exit(1);
  }

  const archivo = path.resolve(process.argv[2] ?? ARCHIVO_DEFAULT);
  console.log(`Leyendo ${archivo}…`);
  const parsed = parseWorkbook(readFileSync(archivo));
  const fechaCorte = parsed.fechaCorte ?? new Date().toISOString().slice(0, 10);
  console.log(`Fecha de corte detectada: ${fechaCorte}`);

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

  const { data: obra, error: obraError } = await supabase
    .from("obras")
    .upsert({ codigo: OBRA.codigo, nombre: OBRA.nombre }, { onConflict: "codigo" })
    .select()
    .single();
  if (obraError) throw new Error(`Error creando obra: ${obraError.message}`);
  console.log(`Obra: ${obra.nombre} (${obra.id})`);

  const resultado = await importarWorkbook(supabase, obra.id, parsed, {
    fechaCorte,
    usuarioId: null,
  });

  console.log("Importación completada:");
  console.log(`  zonas: ${resultado.zonas}`);
  console.log(`  pisos: ${resultado.pisos}`);
  console.log(`  rubros: ${resultado.rubros}`);
  console.log(`  subrubros: ${resultado.subrubros}`);
  console.log(`  items: ${resultado.items}`);
  console.log(`  avances insertados: ${resultado.avancesInsertados}`);
  console.log(`  avances sin cambio: ${resultado.avancesSinCambio}`);
  console.log("");
  console.log("Para dar acceso al primer usuario admin, ver README → 'Primer usuario admin'.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
