"use client";

import { useActionState } from "react";
import type { AccionResultado } from "./actions";

interface Props {
  accion: (formData: FormData) => Promise<AccionResultado>;
  children: React.ReactNode;
  className?: string;
}

/** Form que ejecuta una server action de catálogo y muestra el error si falla. */
export function FormAccion({ accion, children, className }: Props) {
  const [estado, dispatch, pending] = useActionState<AccionResultado | null, FormData>(
    async (_prev, formData) => accion(formData),
    null
  );

  return (
    <form action={dispatch} className={className}>
      <fieldset disabled={pending} className="contents">
        {children}
      </fieldset>
      {estado && !estado.ok && <p className="mt-1 text-xs text-red-600">{estado.error}</p>}
    </form>
  );
}
