/**
 * Configuración de Supabase, leída una sola vez y con fallo explícito.
 *
 * Antes cada cliente hacía `process.env.NEXT_PUBLIC_SUPABASE_URL!`. El `!` es
 * sólo de TypeScript: en runtime, si la variable falta, `createServerClient`
 * tira "Your project's URL and Key are required". Como eso pasa dentro del
 * middleware, que corre en TODAS las rutas, el sitio entero devuelve 500 — hasta
 * /login — y en Vercel se ve como un `MIDDLEWARE_INVOCATION_FAILED` sin ninguna
 * pista de qué falta.
 */

export interface ConfigSupabase {
  url: string;
  anonKey: string;
}

/** Los nombres se escriben completos: Next inlinea `process.env.NEXT_PUBLIC_*` en build. */
const URL_SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY_SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** Qué variables faltan. Vacío = está todo. */
export function faltantes(): string[] {
  const out: string[] = [];
  if (!URL_SUPABASE) out.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!ANON_KEY_SUPABASE) out.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  return out;
}

export function hayConfig(): boolean {
  return faltantes().length === 0;
}

/** Sólo llamar cuando `hayConfig()` es true. */
export function getConfig(): ConfigSupabase {
  const pendientes = faltantes();
  if (pendientes.length > 0) {
    throw new Error(
      `Faltan variables de entorno de Supabase: ${pendientes.join(", ")}. ` +
        "Cargalas en Vercel → Settings → Environment Variables y volvé a desplegar."
    );
  }
  return { url: URL_SUPABASE!, anonKey: ANON_KEY_SUPABASE! };
}
