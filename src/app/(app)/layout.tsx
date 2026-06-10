import Link from "next/link";
import { redirect } from "next/navigation";
import { BarChart3, ClipboardList, FileDown, FileUp, FolderTree, LogOut } from "lucide-react";
import { getSesion } from "@/lib/data";
import { logout } from "@/app/login/actions";
import { Badge } from "@/components/ui/badge";

const nav = [
  { href: "/", label: "Dashboard", icon: BarChart3 },
  { href: "/carga", label: "Carga", icon: ClipboardList },
  { href: "/catalogo", label: "Catálogo", icon: FolderTree },
  { href: "/importar", label: "Importar", icon: FileUp },
  { href: "/exportar", label: "Exportar", icon: FileDown },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const sesion = await getSesion();
  if (!sesion) redirect("/login");

  return (
    <div className="mx-auto flex min-h-dvh max-w-5xl flex-col">
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/90 backdrop-blur">
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <h1 className="text-sm font-semibold">{sesion.obra.nombre}</h1>
            <p className="text-xs text-zinc-500">{sesion.email}</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={sesion.rol === "admin" ? "green" : "default"}>
              {sesion.rol === "admin" ? "DDO" : sesion.rol === "editor" ? "JO" : "Lectura"}
            </Badge>
            <form action={logout}>
              <button
                className="rounded-md p-2 text-zinc-500 hover:bg-zinc-100"
                title="Cerrar sesión"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-2 pb-2">
          {nav.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="flex-1 p-4 pb-24">{children}</main>
    </div>
  );
}
