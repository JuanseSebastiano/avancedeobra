import { readFileSync } from "node:fs";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: "/home/user/avancedeobra/.env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Faltan env vars");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

const zones = ["SS", "BAS", "MON", "PAL", "AZ", "FU"];
const rowRegex = /\('([^']+)','([^']+)','([^']+)','([^']+)',([\d.]+),'([^']+)'\)/g;

const allRows = [];
for (const zone of zones) {
  const content = readFileSync(`/tmp/sql_05_${zone}.sql`, "utf8");
  let m;
  while ((m = rowRegex.exec(content)) !== null) {
    allRows.push({
      id: m[1],
      obra_id: m[2],
      item_id: m[3],
      piso_id: m[4],
      porcentaje: parseFloat(m[5]),
      fecha_corte: m[6],
    });
  }
}

console.log(`Parsed ${allRows.length} rows. Inserting in batches of 500…`);

const BATCH = 500;
let inserted = 0;
for (let i = 0; i < allRows.length; i += BATCH) {
  const batch = allRows.slice(i, i + BATCH);
  const { error } = await supabase.from("avances").insert(batch);
  if (error) {
    console.error(`Batch starting at ${i} failed:`, error);
    process.exit(1);
  }
  inserted += batch.length;
  if (inserted % 2000 === 0 || inserted === allRows.length) {
    console.log(`  ${inserted} / ${allRows.length}`);
  }
}

console.log("Done.");
