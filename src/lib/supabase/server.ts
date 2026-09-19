import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getConfig } from "./config";

export async function createClient() {
  const cookieStore = await cookies();

  const { url, anonKey } = getConfig();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // llamado desde un Server Component: el middleware refresca la sesión
        }
      },
    },
  });
}
