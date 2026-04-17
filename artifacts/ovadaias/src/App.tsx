import { useEffect, useRef } from "react";
import {
  ClerkProvider,
  SignIn,
  SignUp,
  Show,
  useClerk,
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

function SignUpPage() {
  // To update login providers, app branding, or OAuth settings use the Auth
  // pane in the workspace toolbar. More information can be found in the Replit docs.
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <SignUp
        routing="path"
        path={`${basePath}/sign-up`}
        signInUrl={`${basePath}/sign-in`}
      />
    </div>
  );
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
      <Route path="/sign-up/*?" component={SignUpPage} />
      <Route>
        <Show when="signed-in">
          <ProtectedRoutes />
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
