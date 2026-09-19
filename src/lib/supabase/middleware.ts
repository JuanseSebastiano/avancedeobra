import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { faltantes, getConfig } from "./config";

export async function updateSession(request: NextRequest) {
  // Si falta la configuración, no se crea el cliente: createServerClient tiraría
  // dentro del middleware y eso devuelve 500 en TODAS las rutas (Vercel lo
  // muestra como MIDDLEWARE_INVOCATION_FAILED, sin decir qué falta). Mejor una
  // página que diga exactamente qué cargar.
  const pendientes = faltantes();
  if (pendientes.length > 0) {
    return respuestaSinConfig(pendientes);
  }

  const { url: urlSupabase, anonKey } = getConfig();

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(urlSupabase, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  // Si Supabase no responde (proyecto pausado, red caída), tampoco conviene que
  // reviente el middleware: se manda a /login, que sabe mostrar el error.
  let user = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch {
    user = null;
  }

  const isLogin = request.nextUrl.pathname.startsWith("/login");
  if (!user && !isLogin) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  if (user && isLogin) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

/** Página de configuración faltante. HTML plano: el middleware no puede renderizar React. */
function respuestaSinConfig(pendientes: string[]): NextResponse {
  const lista = pendientes.map((v) => `<li><code>${v}</code></li>`).join("");
  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Falta configurar la app</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center;
         font: 15px/1.6 system-ui, sans-serif; background: #fafaf9; color: #18181b; padding: 24px; }
  main { max-width: 34rem; }
  h1 { font-size: 1.25rem; margin: 0 0 .5rem; }
  code { background: #e4e4e7; padding: .1em .35em; border-radius: 4px; font-size: .9em; }
  ul { padding-left: 1.2rem; }
  p.pie { color: #71717a; font-size: .875rem; }
  @media (prefers-color-scheme: dark) {
    body { background: #18181b; color: #fafafa; } code { background: #3f3f46; }
    p.pie { color: #a1a1aa; }
  }
</style>
</head>
<body>
<main>
  <h1>Falta configurar la conexión con Supabase</h1>
  <p>La app está desplegada pero no tiene las variables de entorno necesarias:</p>
  <ul>${lista}</ul>
  <p>
    Cargalas en <strong>Vercel → Settings → Environment Variables</strong> (para
    Production, Preview y Development) con los valores de
    <strong>Supabase → Settings → API</strong>, y volvé a desplegar.
  </p>
  <p class="pie">
    La <code>service_role</code> no va en Vercel: sólo la usa el seed local.
  </p>
</main>
</body>
</html>`;

  return new NextResponse(html, {
    status: 503,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}
