import { useState, useMemo } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { SiGoogle } from "react-icons/si";
import {
  Mail, Lock, User, Eye, EyeOff, ArrowRight, Loader2, ArrowLeft,
  CheckCircle2, Zap, Bot, Shield, Sparkles,
} from "lucide-react";

type AuthMode = "login" | "register" | "forgot-password";

const OAUTH_PROVIDERS = [
  { id: "google", label: "Continue with Google", icon: SiGoogle, path: "/api/auth/google", color: "#4285F4" },
];

async function authRequest(mode: AuthMode, data: Record<string, string>) {
  const endpoint = mode === "register" ? "register" : mode === "forgot-password" ? "forgot-password" : "login";
  const res = await fetch(`/api/auth/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok) {
    if (res.status === 401) {
      const event = new CustomEvent("session-expired");
      window.dispatchEvent(event);
    }
    throw new Error(json.message || "Something went wrong");
  }
  return json;
}

interface PasswordStrength {
  score: number;
  label: string;
  color: string;
  bgColor: string;
  missing: string[];
}

function getPasswordStrength(password: string): PasswordStrength {
  const checks = [
    { test: password.length >= 8, label: "8+ characters" },
    { test: /[A-Z]/.test(password), label: "Uppercase letter" },
    { test: /[a-z]/.test(password), label: "Lowercase letter" },
    { test: /\d/.test(password), label: "Number" },
    { test: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(password), label: "Special character" },
  ];
  const passed = checks.filter((c) => c.test).length;
  const missing = checks.filter((c) => !c.test).map((c) => c.label);
  if (passed <= 2) return { score: passed, label: "Weak", color: "text-red-400", bgColor: "bg-red-500", missing };
  if (passed === 3) return { score: passed, label: "Fair", color: "text-yellow-400", bgColor: "bg-yellow-500", missing };
  if (passed === 4) return { score: passed, label: "Good", color: "text-blue-400", bgColor: "bg-blue-500", missing };
  return { score: passed, label: "Strong", color: "text-emerald-400", bgColor: "bg-emerald-500", missing };
}

const BRAND_BENEFITS = [
  { icon: Bot, text: "AI team works 24/7 on your channel" },
  { icon: Zap, text: "Fully autonomous — zero clicks needed" },
  { icon: Shield, text: "Your content stays private and secure" },
];

const PIPELINE_LINES = [
  { text: "Clipping last night's stream...", status: "running" },
  { text: "SEO tags generated — 3 uploads", status: "done" },
  { text: "Thumbnail AI: variant ready", status: "done" },
];

function BrandPanel() {
  return (
    <div className="hidden sm:flex flex-col justify-between w-[260px] shrink-0 relative overflow-hidden rounded-l-2xl"
      style={{ background: "linear-gradient(145deg, hsl(265 85% 30%) 0%, hsl(245 80% 20%) 50%, hsl(232 60% 12%) 100%)" }}>
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 right-0 w-64 h-64 rounded-full bg-white/[0.03] -translate-y-1/2 translate-x-1/3" />
        <div className="absolute bottom-0 left-0 w-48 h-48 rounded-full bg-white/[0.04] translate-y-1/2 -translate-x-1/3" />
        <div className="absolute top-1/2 left-1/2 w-full h-px bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-1/2" />
      </div>

      <div className="relative z-10 p-7 flex flex-col h-full">
        <div className="flex items-center gap-2 mb-8">
          <div className="h-8 w-8 rounded-xl bg-white/15 backdrop-blur-sm border border-white/20 flex items-center justify-center">
            <Zap className="h-4 w-4 text-white" />
          </div>
          <span className="font-display font-bold text-sm text-white tracking-tight">
            Creator<span className="text-white/50">OS</span>
          </span>
        </div>

        <div className="flex-1">
          <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-white/10 border border-white/15 mb-4">
            <Sparkles className="h-3 w-3 text-purple-300" />
            <span className="text-[10px] font-semibold text-purple-200 uppercase tracking-widest">Gaming Creator OS</span>
          </div>

          <h2 className="text-[22px] font-display font-bold text-white leading-tight mb-3">
            Your channel.<br />
            <span className="text-purple-300">On full autopilot.</span>
          </h2>
          <p className="text-[12px] text-white/55 leading-relaxed mb-7">
            Connect once. AI handles Shorts, SEO, thumbnails, and publishing — while you focus on playing.
          </p>

          <div className="space-y-3">
            {BRAND_BENEFITS.map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-2.5">
                <div className="h-6 w-6 rounded-md bg-white/10 border border-white/10 flex items-center justify-center shrink-0">
                  <Icon className="h-3 w-3 text-purple-300" />
                </div>
                <span className="text-[11px] text-white/65 leading-tight">{text}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6">
          <div className="rounded-xl bg-white/[0.07] border border-white/[0.08] p-3.5 space-y-2">
            <div className="flex items-center gap-1.5 mb-2">
              <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
              <span className="text-[9px] font-mono text-white/40 uppercase tracking-widest">Pipeline Active</span>
            </div>
            {PIPELINE_LINES.map((line, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className={`w-1 h-1 rounded-full shrink-0 ${line.status === "running" ? "bg-primary animate-pulse" : "bg-emerald-400/60"}`} />
                <span className="text-[10px] text-white/40 font-mono truncate">{line.text}</span>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-white/25 text-center mt-3">Free plan • No card required</p>
        </div>
      </div>
    </div>
  );
}

export function AuthForm({ onSuccess, initialMode }: { onSuccess?: () => void; initialMode?: AuthMode }) {
  const [mode, setMode] = useState<AuthMode>(initialMode ?? "login");
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [forgotSent, setForgotSent] = useState(false);
  const { toast } = useToast();

  const passwordStrength = useMemo(() => getPasswordStrength(password), [password]);

  const mutation = useMutation({
    mutationFn: () => {
      if (mode === "forgot-password") return authRequest("forgot-password", { email });
      const data: Record<string, string> = { email, password };
      if (mode === "register") {
        data.firstName = firstName;
        if (lastName) data.lastName = lastName;
      }
      return authRequest(mode, data);
    },
    onSuccess: (result) => {
      if (mode === "forgot-password") {
        setForgotSent(true);
        toast({ title: "Check Your Email", description: result.message || "If an account exists, a reset link has been sent." });
        return;
      }
      if (onSuccess) onSuccess();
      else window.location.href = "/";
    },
    onError: (err: Error) => {
      toast({
        title: mode === "register" ? "Registration Failed" : mode === "forgot-password" ? "Request Failed" : "Login Failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate();
  };

  if (mode === "forgot-password") {
    return (
      <div className="flex overflow-hidden rounded-2xl border border-border/40 shadow-2xl shadow-black/40 bg-card w-full max-w-sm" data-testid="card-forgot-password">
        <div className="flex-1 p-7 space-y-5">
          <div className="space-y-1">
            <h2 className="text-xl font-display font-bold" data-testid="text-forgot-title">Reset Password</h2>
            <p className="text-sm text-muted-foreground">Enter your email to receive a reset link</p>
          </div>

          {forgotSent ? (
            <div className="flex flex-col items-center gap-3 py-4" data-testid="text-forgot-success">
              <CheckCircle2 className="h-10 w-10 text-emerald-400" />
              <p className="text-sm text-center text-muted-foreground">
                If an account with that email exists, you will receive a password reset link shortly. Check your inbox (and spam folder).
              </p>
              <Button type="button" variant="outline" data-testid="button-back-to-login"
                onClick={() => { setMode("login"); setForgotSent(false); }}>
                <ArrowLeft className="h-4 w-4 mr-2" /> Back to Sign In
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="rounded-lg bg-muted/40 border border-border/50 px-3.5 py-3 text-xs text-muted-foreground leading-relaxed" data-testid="text-username-reminder">
                <span className="font-semibold text-foreground/70">Forgot your username?</span> Your username is the email address you used to sign up. Enter it below to receive a password reset link.
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="forgot-email" className="text-xs font-medium">Email Address</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input id="forgot-email" data-testid="input-forgot-email" type="email"
                    placeholder="you@example.com" value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-9 h-10" required autoComplete="email" />
                </div>
              </div>
              <Button type="submit" data-testid="button-forgot-submit" className="w-full h-10" disabled={mutation.isPending}>
                {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Send Reset Link
              </Button>
              <div className="text-center">
                <button type="button" data-testid="button-back-to-login-link"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => { setMode("login"); setForgotSent(false); }}>
                  <ArrowLeft className="h-3 w-3 inline mr-1" />Back to Sign In
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex overflow-hidden rounded-2xl border border-border/40 shadow-2xl shadow-black/40 w-full max-w-[660px]"
      data-testid="card-auth-form">
      <BrandPanel />

      <div className="flex-1 bg-card p-7 flex flex-col justify-center min-w-0">
        <div className="space-y-1 mb-6">
          <h2 className="text-xl font-display font-bold" data-testid="text-auth-title">
            {mode === "login" ? "Welcome back" : "Create account"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {mode === "login" ? "Sign in to your CreatorOS account" : "Get started — it's free, no card needed"}
          </p>
        </div>

        <div className="flex flex-col gap-2 mb-5">
          {OAUTH_PROVIDERS.map((provider) => (
            <button
              key={provider.id}
              type="button"
              data-testid={`button-auth-${provider.id}`}
              onClick={() => { window.location.href = provider.path; }}
              title={provider.label}
              className="flex items-center justify-center gap-2 h-10 rounded-lg border border-border/60 bg-muted/30 hover:bg-muted/60 hover:border-border transition-all text-sm font-medium text-foreground/80 hover:text-foreground w-full"
            >
              <provider.icon className="h-4 w-4 shrink-0" />
              <span>{provider.label}</span>
            </button>
          ))}
        </div>

        <div className="relative mb-5">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-border/50" />
          </div>
          <div className="relative flex justify-center">
            <span className="bg-card px-3 text-xs text-muted-foreground">or with email</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          {mode === "register" && (
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="firstName" className="text-xs font-medium">First Name</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input id="firstName" data-testid="input-first-name" placeholder="First"
                    value={firstName} onChange={(e) => setFirstName(e.target.value)}
                    className="pl-9 h-10" required autoComplete="given-name" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lastName" className="text-xs font-medium">Last Name</Label>
                <Input id="lastName" data-testid="input-last-name" placeholder="Last"
                  value={lastName} onChange={(e) => setLastName(e.target.value)}
                  className="h-10" autoComplete="family-name" />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-xs font-medium">Email</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input id="email" data-testid="input-email" type="email" placeholder="you@example.com"
                value={email} onChange={(e) => setEmail(e.target.value)}
                className="pl-9 h-10" required autoComplete="email" />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="password" className="text-xs font-medium">Password</Label>
              {mode === "login" && (
                <button type="button" data-testid="link-forgot-password"
                  className="text-xs text-muted-foreground hover:text-primary transition-colors"
                  onClick={() => setMode("forgot-password")}>
                  Forgot password?
                </button>
              )}
            </div>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input id="password" data-testid="input-password"
                type={showPassword ? "text" : "password"}
                placeholder={mode === "register" ? "Min. 8 characters" : "Your password"}
                value={password} onChange={(e) => setPassword(e.target.value)}
                className="pl-9 pr-10 h-10" required
                minLength={mode === "register" ? 8 : 1}
                autoComplete={mode === "register" ? "new-password" : "current-password"} />
              <button type="button" data-testid="button-toggle-password"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword}>
                {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>

            {mode === "register" && password.length > 0 && (
              <div className="space-y-1.5 pt-0.5" data-testid="password-strength-meter">
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((segment) => (
                    <div key={segment}
                      className={`h-1 flex-1 rounded-full transition-colors ${segment <= passwordStrength.score ? passwordStrength.bgColor : "bg-muted"}`}
                      data-testid={`password-strength-segment-${segment}`} />
                  ))}
                </div>
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-medium ${passwordStrength.color}`} data-testid="text-password-strength">
                    {passwordStrength.label}
                  </span>
                  {passwordStrength.missing.length > 0 && (
                    <span className="text-[10px] text-muted-foreground" data-testid="text-password-requirements">
                      needs: {passwordStrength.missing.slice(0, 2).join(", ")}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          <Button type="submit" data-testid="button-auth-submit"
            className="w-full h-10 font-semibold shadow-md shadow-primary/20 mt-1"
            disabled={mutation.isPending}>
            {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            {mode === "login" ? "Sign In" : "Create Account"}
            {!mutation.isPending && <ArrowRight className="h-4 w-4 ml-2" />}
          </Button>
        </form>

        <div className="text-center mt-4">
          <button type="button" data-testid="button-toggle-auth-mode"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => { setMode(mode === "login" ? "register" : "login"); setPassword(""); }}>
            {mode === "login" ? (
              <>Don&apos;t have an account? <span className="text-primary font-medium">Sign up free</span></>
            ) : (
              <>Already have an account? <span className="text-primary font-medium">Sign in</span></>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
