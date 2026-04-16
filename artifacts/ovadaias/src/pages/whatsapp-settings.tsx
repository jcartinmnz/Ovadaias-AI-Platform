import { useEffect, useState } from "react";
import { Shell } from "@/components/layout/shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import {
  Settings as SettingsIcon,
  Save,
  Wifi,
  WifiOff,
  Mail,
  Bot,
  Webhook,
} from "lucide-react";
import { waApi, type WhatsappSettings } from "@/lib/whatsapp-api";

export default function WhatsappSettingsPage() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<WhatsappSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{
    configured: boolean;
    status?: string;
    error?: string;
  } | null>(null);

  const load = async () => {
    const s = await waApi.getSettings();
    setSettings(s);
    const st = await waApi.getStatus();
    setStatus(st);
  };
  useEffect(() => {
    load();
  }, []);

  const update = (patch: Partial<WhatsappSettings>) =>
    setSettings((s) => (s ? { ...s, ...patch } : s));

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const patch: Partial<WhatsappSettings> = { ...settings };
      // Don't send masked secrets back
      if (settings.evolutionApiKey === "***") delete patch.evolutionApiKey;
      if (settings.smtpPass === "***") delete patch.smtpPass;
      const updated = await waApi.updateSettings(patch);
      setSettings(updated);
      toast({ title: "Guardado", description: "Configuración actualizada." });
      const st = await waApi.getStatus();
      setStatus(st);
    } catch (e) {
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : "Falló",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (!settings) {
    return (
      <Shell>
        <div className="p-8 text-muted-foreground">Cargando...</div>
      </Shell>
    );
  }

  const webhookUrl = `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, "")}/api/whatsapp/webhook${
    settings.webhookSecretSet
      ? `?secret=<TU_SECRET>`
      : ""
  }`;

  return (
    <Shell>
      <ScrollArea className="h-full">
        <div className="max-w-3xl mx-auto p-6 space-y-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-mono uppercase tracking-wider text-primary flex items-center gap-2">
                <SettingsIcon className="w-5 h-5" /> Ajustes WhatsApp
              </h1>
              <p className="text-xs text-muted-foreground mt-1">
                Configura Evolution API, comportamiento del agente IA y notificaciones por email.
              </p>
            </div>
            <Button onClick={save} disabled={saving}>
              <Save className="w-4 h-4 mr-2" />
              {saving ? "Guardando..." : "Guardar"}
            </Button>
          </div>

          {/* Status */}
          <Section title="Estado de la conexión">
            <div className="flex items-center gap-3 p-3 border border-border/40 rounded-lg bg-card/30">
              {status?.configured ? (
                status.status === "open" ? (
                  <>
                    <Wifi className="w-5 h-5 text-emerald-400" />
                    <span className="text-emerald-300">Conectado</span>
                  </>
                ) : (
                  <>
                    <WifiOff className="w-5 h-5 text-amber-400" />
                    <span>
                      Estado: <strong>{status.status || "desconocido"}</strong>
                      {status.error && ` — ${status.error}`}
                    </span>
                  </>
                )
              ) : (
                <>
                  <WifiOff className="w-5 h-5 text-muted-foreground" />
                  <span className="text-muted-foreground">No configurado</span>
                </>
              )}
            </div>
          </Section>

          {/* Evolution */}
          <Section title="Evolution API" icon={<Webhook className="w-4 h-4" />}>
            <Field label="Base URL (sin / final)">
              <Input
                placeholder="https://evolution.tu-dominio.com"
                value={settings.evolutionBaseUrl ?? ""}
                onChange={(e) => update({ evolutionBaseUrl: e.target.value })}
              />
            </Field>
            <Field label="API Key">
              <Input
                type="password"
                placeholder={settings.evolutionApiKey === "***" ? "(guardada)" : ""}
                value={
                  settings.evolutionApiKey === "***"
                    ? ""
                    : (settings.evolutionApiKey ?? "")
                }
                onChange={(e) => update({ evolutionApiKey: e.target.value })}
              />
            </Field>
            <Field label="Nombre de la instancia">
              <Input
                placeholder="empresa-prod"
                value={settings.evolutionInstance ?? ""}
                onChange={(e) => update({ evolutionInstance: e.target.value })}
              />
            </Field>
            <Field
              label="Webhook Secret (opcional, recomendado)"
              help="Si lo configuras, Evolution debe enviar este valor en ?secret=... o el header x-webhook-secret"
            >
              <Input
                type="password"
                placeholder={
                  settings.webhookSecretSet ? "(guardado)" : "cadena-aleatoria-segura"
                }
                value={settings.webhookSecret === "***" ? "" : (settings.webhookSecret ?? "")}
                onChange={(e) => update({ webhookSecret: e.target.value })}
              />
            </Field>
            <Field
              label="URL del webhook (configura esta URL en Evolution)"
              help="Apunta el webhook 'messages.upsert' de tu instancia Evolution a esta URL."
            >
              <Input value={webhookUrl} readOnly className="font-mono text-xs" />
            </Field>
          </Section>

          {/* Agent */}
          <Section title="Agente IA" icon={<Bot className="w-4 h-4" />}>
            <div className="flex items-center gap-3">
              <Switch
                checked={settings.agentEnabled}
                onCheckedChange={(v) => update({ agentEnabled: v })}
              />
              <span className="text-sm">
                Agente activo (responde automáticamente cuando el bot está habilitado por conversación)
              </span>
            </div>
            <Field label="Idioma por defecto">
              <Input
                value={settings.defaultLanguage}
                onChange={(e) => update({ defaultLanguage: e.target.value })}
                placeholder="es"
                className="w-24"
              />
            </Field>
            <Field
              label="Instrucciones adicionales para el agente"
              help="Tono de marca, datos clave del negocio, qué SÍ/NO debe hacer. La base de conocimiento de Ovadaias se consulta automáticamente."
            >
              <Textarea
                rows={6}
                value={settings.agentSystemPrompt ?? ""}
                onChange={(e) => update({ agentSystemPrompt: e.target.value })}
                placeholder={`Ej: Trabajas para "Acme S.A.", una empresa de venta de equipos industriales. Sé cordial, usa el "usted". Si preguntan por horarios, lunes a viernes 9-18h. Para cotizaciones, deriva siempre a un humano.`}
              />
            </Field>
          </Section>

          {/* Email */}
          <Section title="Notificaciones por email" icon={<Mail className="w-4 h-4" />}>
            <div className="flex items-center gap-3">
              <Switch
                checked={settings.emailEnabled}
                onCheckedChange={(v) => update({ emailEnabled: v })}
              />
              <span className="text-sm">Activar envíos por email</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="SMTP Host">
                <Input
                  value={settings.smtpHost ?? ""}
                  onChange={(e) => update({ smtpHost: e.target.value })}
                  placeholder="smtp.gmail.com"
                />
              </Field>
              <Field label="Puerto">
                <Input
                  type="number"
                  value={settings.smtpPort ?? ""}
                  onChange={(e) =>
                    update({ smtpPort: e.target.value ? Number(e.target.value) : null })
                  }
                  placeholder="587"
                />
              </Field>
              <Field label="Usuario">
                <Input
                  value={settings.smtpUser ?? ""}
                  onChange={(e) => update({ smtpUser: e.target.value })}
                />
              </Field>
              <Field label="Contraseña">
                <Input
                  type="password"
                  placeholder={settings.smtpPass === "***" ? "(guardada)" : ""}
                  value={settings.smtpPass === "***" ? "" : (settings.smtpPass ?? "")}
                  onChange={(e) => update({ smtpPass: e.target.value })}
                />
              </Field>
              <Field label="From">
                <Input
                  value={settings.emailFrom ?? ""}
                  onChange={(e) => update({ emailFrom: e.target.value })}
                  placeholder="bot@empresa.com"
                />
              </Field>
              <Field label="Recipiente(s) (coma)">
                <Input
                  value={settings.emailTo ?? ""}
                  onChange={(e) => update({ emailTo: e.target.value })}
                  placeholder="ventas@empresa.com,soporte@empresa.com"
                />
              </Field>
              <Field label="Conexión segura (TLS)">
                <Switch
                  checked={settings.smtpSecure}
                  onCheckedChange={(v) => update({ smtpSecure: v })}
                />
              </Field>
            </div>
            <div className="space-y-2 pt-2 border-t border-border/30">
              <div className="text-xs font-mono text-muted-foreground uppercase">
                Eventos a notificar
              </div>
              <Toggle
                label="Nueva conversación"
                value={settings.notifyOnNewConversation}
                onChange={(v) => update({ notifyOnNewConversation: v })}
              />
              <Toggle
                label="Nuevo ticket"
                value={settings.notifyOnNewTicket}
                onChange={(v) => update({ notifyOnNewTicket: v })}
              />
              <Toggle
                label="Handoff a humano"
                value={settings.notifyOnHandoff}
                onChange={(v) => update({ notifyOnHandoff: v })}
              />
            </div>
          </Section>
        </div>
      </ScrollArea>
    </Shell>
  );
}

function Section({
  title,
  children,
  icon,
}: {
  title: string;
  children: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="border border-border/40 rounded-lg p-4 bg-card/20 space-y-3">
      <div className="text-sm font-mono uppercase tracking-wider text-primary flex items-center gap-2">
        {icon}
        {title}
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Field({
  label,
  help,
  children,
}: {
  label: string;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
      {help && <p className="text-[11px] text-muted-foreground">{help}</p>}
    </div>
  );
}

function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span>{label}</span>
      <Switch checked={value} onCheckedChange={onChange} />
    </div>
  );
}
