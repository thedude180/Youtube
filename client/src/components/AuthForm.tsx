import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { SiGoogle, SiDiscord, SiTwitch, SiTiktok, SiX, SiKick } from "react-icons/si";
import { Mail, Lock, User, Eye, EyeOff, ArrowRight, Loader2 } from "lucide-react";

type AuthMode = "login" | "register";

const OAUTH_PROVIDERS = [
  { id: "google", label: "Google", icon: SiGoogle, path: "/api/auth/google" },
  { id: "discord", label: "Discord", icon: SiDiscord, path: "/api/auth/discord" },
  { id: "twitch", label: "Twitch", icon: SiTwitch, path: "/api/auth/twitch" },
  { id: "x", label: "X", icon: SiX, path: "/api/auth/x" },
  { id: "tiktok", label: "TikTok", icon: SiTiktok, path: "/api/auth/tiktok" },
  { id: "kick", label: "Kick", icon: SiKick, path: "/api/auth/kick" },
];

async function authRequest(mode: AuthMode, data: Record<string, string>) {
  const res = await fetch(`/api/auth/${mode === "register" ? "register" : "login"}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(data),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || "Something went wrong");
  return json;
}

export function AuthForm({ onSuccess }: { onSuccess?: () => void }) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: () => {
      const data: Record<string, string> = { email, password };
      if (mode === "register") {
        data.firstName = firstName;
        if (lastName) data.lastName = lastName;
      }
      return authRequest(mode, data);
    },
    onSuccess: () => {
      if (onSuccess) {
        onSuccess();
      } else {
        window.location.href = "/";
      }
    },
    onError: (err: Error) => {
      toast({
        title: mode === "register" ? "Registration Failed" : "Login Failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate();
  };

  return (
    <Card className="w-full max-w-sm" data-testid="card-auth-form">
      <CardContent className="p-6 space-y-5">
        <div className="text-center space-y-1">
          <h2 className="text-xl font-display font-bold" data-testid="text-auth-title">
            {mode === "login" ? "Welcome Back" : "Create Account"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {mode === "login"
              ? "Sign in to your CreatorOS account"
              : "Get started with CreatorOS for free"}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {mode === "register" && (
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="firstName" className="text-xs">First Name</Label>
                <div className="relative">
                  <User className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    id="firstName"
                    data-testid="input-first-name"
                    placeholder="First"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="pl-8"
                    required
                    autoComplete="given-name"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lastName" className="text-xs">Last Name</Label>
                <Input
                  id="lastName"
                  data-testid="input-last-name"
                  placeholder="Last"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  autoComplete="family-name"
                />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-xs">Email</Label>
            <div className="relative">
              <Mail className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                id="email"
                data-testid="input-email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="pl-8"
                required
                autoComplete="email"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-xs">Password</Label>
            <div className="relative">
              <Lock className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                id="password"
                data-testid="input-password"
                type={showPassword ? "text" : "password"}
                placeholder={mode === "register" ? "Min. 8 characters" : "Your password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-8 pr-9"
                required
                minLength={mode === "register" ? 8 : 1}
                autoComplete={mode === "register" ? "new-password" : "current-password"}
              />
              <button
                type="button"
                data-testid="button-toggle-password"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>

          <Button
            type="submit"
            data-testid="button-auth-submit"
            className="w-full"
            disabled={mutation.isPending}
          >
            {mutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : null}
            {mode === "login" ? "Sign In" : "Create Account"}
            {!mutation.isPending && <ArrowRight className="h-4 w-4 ml-2" />}
          </Button>
        </form>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center">
            <span className="bg-card px-3 text-xs text-muted-foreground">or continue with</span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {OAUTH_PROVIDERS.map((provider) => (
            <Button
              key={provider.id}
              type="button"
              variant="outline"
              data-testid={`button-auth-${provider.id}`}
              onClick={() => { window.location.href = provider.path; }}
              title={`Sign in with ${provider.label}`}
            >
              <provider.icon className="h-3.5 w-3.5 mr-1.5 shrink-0" />
              <span className="text-xs truncate">{provider.label}</span>
            </Button>
          ))}
        </div>

        <div className="text-center">
          <button
            type="button"
            data-testid="button-toggle-auth-mode"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => {
              setMode(mode === "login" ? "register" : "login");
              setPassword("");
            }}
          >
            {mode === "login" ? (
              <>Don&apos;t have an account? <span className="text-primary font-medium">Sign up</span></>
            ) : (
              <>Already have an account? <span className="text-primary font-medium">Sign in</span></>
            )}
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
