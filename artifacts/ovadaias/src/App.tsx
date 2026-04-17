import { useEffect, useMemo, useRef, useState } from "react";
import {
  ClerkProvider,
  SignIn,
  Show,
  useClerk,
  useUser,
} from "@clerk/react";
import {
  Switch,
  Route,
  Router as WouterRouter,
  Redirect,
  useLocation,
} from "wouter";
import {
  QueryClient,
  QueryClientProvider,
  useQueryClient,
} from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import ChatPage from "@/pages/chat";
import ConversationsPage from "@/pages/conversations";
import KnowledgePage from "@/pages/knowledge";
import MarketingPage from "@/pages/marketing";
import CalendarPage from "@/pages/calendar";
import WhatsappInboxPage from "@/pages/whatsapp-inbox";
import WhatsappTicketsPage from "@/pages/whatsapp-tickets";
import WhatsappSettingsPage from "@/pages/whatsapp-settings";
import SignUpDisabledPage from "@/pages/sign-up-disabled";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 1000 * 60 * 5,
    },
  },
});

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

if (!clerkPubKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY in .env file");
}

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

const clerkAppearance = {
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: "hsl(265, 89%, 66%)",
    colorBackground: "hsl(240, 10%, 8%)",
    colorInputBackground: "hsl(240, 8%, 12%)",
    colorText: "hsl(210, 40%, 98%)",
    colorTextSecondary: "hsl(215, 16%, 65%)",
    colorInputText: "hsl(210, 40%, 98%)",
    colorNeutral: "hsl(215, 16%, 65%)",
    borderRadius: "0.75rem",
    fontFamily: "ui-sans-serif, system-ui, sans-serif",
    fontFamilyButtons: "ui-sans-serif, system-ui, sans-serif",
    fontSize: "0.95rem",
  },
  elements: {
    rootBox: "w-full",
    cardBox:
      "rounded-2xl w-full overflow-hidden border border-border/40 shadow-2xl bg-card",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: { color: "hsl(210, 40%, 98%)" },
    headerSubtitle: { color: "hsl(215, 16%, 65%)" },
    socialButtonsBlockButtonText: { color: "hsl(210, 40%, 98%)" },
    formFieldLabel: { color: "hsl(210, 40%, 98%)" },
    footerActionLink: { color: "hsl(265, 89%, 66%)" },
    footerActionText: { color: "hsl(215, 16%, 65%)" },
    dividerText: { color: "hsl(215, 16%, 65%)" },
    identityPreviewEditButton: { color: "hsl(265, 89%, 66%)" },
    formFieldSuccessText: { color: "hsl(142, 71%, 45%)" },
    alertText: { color: "hsl(210, 40%, 98%)" },
    logoBox: "flex justify-center mb-2",
    logoImage: "h-10 w-10",
    socialButtonsBlockButton:
      "border border-border/40 hover:bg-sidebar-accent",
    formButtonPrimary:
      "bg-primary text-primary-foreground hover:bg-primary/90",
    formFieldInput: "border border-border/40",
    footerAction: "pt-2",
    dividerLine: "bg-border/40",
    alert: "border border-border/40",
    otpCodeFieldInput: "border border-border/40",
    formFieldRow: "space-y-1",
    main: "gap-4",
  },
};

function SignInPage() {
  // To update login providers, app branding, or OAuth settings use the Auth
  // pane in the workspace toolbar. More information can be found in the Replit docs.
  // Public sign-up is intentionally disabled — see SignUpDisabledPage and
  // AuthorizedOnly below. Operators must be added/invited via the Auth pane.
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <SignIn
        routing="path"
        path={`${basePath}/sign-in`}
        signUpUrl={`${basePath}/sign-up`}
      />
    </div>
  );
}

const allowedEmailsRaw = import.meta.env.VITE_ALLOWED_EMAILS as
  | string
  | undefined;
const allowedDomainsRaw = import.meta.env.VITE_ALLOWED_EMAIL_DOMAINS as
  | string
  | undefined;

function parseList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(/[,\s]+/)
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

const allowedEmails = parseList(allowedEmailsRaw);
const allowedDomains = parseList(allowedDomainsRaw).map((domain) =>
  domain.replace(/^@/, ""),
);
const allowlistConfigured =
  allowedEmails.length > 0 || allowedDomains.length > 0;

function isEmailAuthorized(email: string | undefined | null): boolean {
  if (!allowlistConfigured) return true;
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  if (allowedEmails.includes(normalized)) return true;
  const domain = normalized.split("@")[1] ?? "";
  return allowedDomains.includes(domain);
}

function UnauthorizedAccount({ email }: { email: string | null }) {
  const { signOut } = useClerk();
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setSigningOut(true);
    signOut({ redirectUrl: `${basePath}/sign-in` })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setSigningOut(false);
      });
    return () => {
      cancelled = true;
    };
  }, [signOut]);

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <div
        className="w-full max-w-md rounded-2xl border border-destructive/40 bg-card p-8 text-center shadow-2xl"
        data-testid="unauthorized-account"
      >
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Cuenta no autorizada
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          {email ? (
            <>
              El correo <span className="font-medium text-foreground">{email}</span>{" "}
              no está autorizado para acceder al panel de Ovadaias.
            </>
          ) : (
            <>Tu cuenta no está autorizada para acceder al panel de Ovadaias.</>
          )}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Solicita acceso a un administrador del workspace.{" "}
          {signingOut ? "Cerrando sesión…" : "Sesión cerrada."}
        </p>
      </div>
    </div>
  );
}

function AuthorizedOnly({ children }: { children: React.ReactNode }) {
  const { isLoaded, user } = useUser();

  const primaryEmail = useMemo(() => {
    if (!user) return null;
    const primary = user.primaryEmailAddress?.emailAddress;
    if (primary) return primary;
    return user.emailAddresses?.[0]?.emailAddress ?? null;
  }, [user]);

  if (!isLoaded) return null;
  if (!isEmailAuthorized(primaryEmail)) {
    return <UnauthorizedAccount email={primaryEmail} />;
  }
  return <>{children}</>;
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (
        prevUserIdRef.current !== undefined &&
        prevUserIdRef.current !== userId
      ) {
        qc.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, qc]);

  return null;
}

function ProtectedRoutes() {
  return (
    <Switch>
      <Route path="/" component={ChatPage} />
      <Route path="/chat/:id" component={ChatPage} />
      <Route path="/conversations" component={ConversationsPage} />
      <Route path="/knowledge" component={KnowledgePage} />
      <Route path="/marketing" component={MarketingPage} />
      <Route path="/calendar" component={CalendarPage} />
      <Route path="/whatsapp" component={WhatsappInboxPage} />
      <Route path="/whatsapp/tickets" component={WhatsappTicketsPage} />
      <Route path="/whatsapp/settings" component={WhatsappSettingsPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AppRoutes() {
  return (
    <Switch>
      <Route path="/sign-in/*?" component={SignInPage} />
      <Route path="/sign-up/*?" component={SignUpDisabledPage} />
      <Route>
        <Show when="signed-in">
          <AuthorizedOnly>
            <ProtectedRoutes />
          </AuthorizedOnly>
        </Show>
        <Show when="signed-out">
          <Redirect to="/sign-in" />
        </Show>
      </Route>
    </Switch>
  );
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      localization={{
        signIn: {
          start: {
            title: "Bienvenido a Ovadaias",
            subtitle: "Inicia sesión para acceder al panel",
          },
        },
        signUp: {
          start: {
            title: "Crea tu cuenta",
            subtitle: "Acceso de operadores Ovadaias",
          },
        },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <TooltipProvider>
          <AppRoutes />
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}

export default App;
