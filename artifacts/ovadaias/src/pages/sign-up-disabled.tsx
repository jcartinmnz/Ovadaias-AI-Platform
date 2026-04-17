import { Link } from "wouter";
import { ShieldCheck, Mail } from "lucide-react";

export default function SignUpDisabledPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-2xl border border-border/40 bg-card p-8 shadow-2xl">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Acceso solo por invitación
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            El panel de Ovadaias está restringido a operadores autorizados. El
            registro público está deshabilitado.
          </p>
        </div>

        <div className="mb-6 rounded-xl border border-border/40 bg-background/40 p-4 text-sm text-muted-foreground">
          <div className="mb-2 flex items-center gap-2 font-medium text-foreground">
            <Mail className="h-4 w-4 text-primary" />
            ¿Necesitas acceso?
          </div>
          <p>
            Solicita una invitación a un administrador del workspace. Una vez
            autorizado tu correo, podrás iniciar sesión normalmente.
          </p>
        </div>

        <Link
          href="/sign-in"
          className="block w-full rounded-xl bg-primary px-4 py-2.5 text-center text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
          data-testid="link-back-to-sign-in"
        >
          Volver al inicio de sesión
        </Link>
      </div>
    </div>
  );
}
