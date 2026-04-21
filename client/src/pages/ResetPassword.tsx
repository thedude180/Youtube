import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  Lock, Eye, EyeOff, Loader2, CheckCircle2, XCircle, ArrowLeft, Zap,
} from "lucide-react";

function getPasswordStrength(password: string) {
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

function getTokenFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get("token");
}

export default function ResetPassword() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [token] = useState<string | null>(() => getTokenFromUrl());
  const [tokenState, setTokenState] = useState<"checking" | "valid" | "invalid">("checking");
  const [invalidReason, setInvalidReason] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [done, setDone] = useState(false);

  const strength = getPasswordStrength(password);

  // Validate the token on mount
  useEffect(() => {
    if (!token) {
      setTokenState("invalid");
      setInvalidReason("No reset token found in the link. Please request a new one.");
      return;
    }
    fetch(`/api/auth/reset-password/validate?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.valid) {
          setTokenState("valid");
        } else {
          setTokenState("invalid");
          setInvalidReason(data.message || "This reset link is invalid or has expired.");
        }
      })
      .catch(() => {
        setTokenState("invalid");
        setInvalidReason("Could not verify the reset link. Please try again.");
      });
  }, [token]);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Something went wrong");
      return json;
    },
    onSuccess: () => {
      setDone(true);
      toast({ title: "Password Reset!", description: "You can now sign in with your new password." });
    },
    onError: (err: Error) => {
      toast({ title: "Reset Failed", description: err.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast({ title: "Passwords Don't Match", description: "Please make sure both passwords are identical.", variant: "destructive" });
      return;
    }
    if (strength.score < 5) {
      toast({ title: "Password Too Weak", description: `Still needs: ${strength.missing.join(", ")}`, variant: "destructive" });
      return;
    }
    mutation.mutate();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-16">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex items-center gap-2 justify-center mb-2">
          <div className="h-8 w-8 rounded-xl bg-primary/15 border border-primary/20 flex items-center justify-center">
            <Zap className="h-4 w-4 text-primary" />
          </div>
          <span className="font-bold text-base tracking-tight">
            Creator<span className="text-muted-foreground">OS</span>
          </span>
        </div>

        <div className="rounded-2xl border border-border/40 bg-card shadow-2xl shadow-black/40 p-7 space-y-5">

          {/* Checking token */}
          {tokenState === "checking" && (
            <div className="flex flex-col items-center gap-3 py-6" data-testid="status-token-checking">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Verifying your reset link…</p>
            </div>
          )}

          {/* Invalid token */}
          {tokenState === "invalid" && (
            <div className="flex flex-col items-center gap-4 py-4 text-center" data-testid="status-token-invalid">
              <XCircle className="h-12 w-12 text-destructive" />
              <div>
                <h2 className="text-lg font-semibold mb-1">Link Invalid or Expired</h2>
                <p className="text-sm text-muted-foreground">{invalidReason}</p>
              </div>
              <Button variant="outline" data-testid="button-request-new-link"
                onClick={() => setLocation("/login?forgot=1")}>
                <ArrowLeft className="h-4 w-4 mr-2" />Request a New Link
              </Button>
            </div>
          )}

          {/* Done */}
          {tokenState === "valid" && done && (
            <div className="flex flex-col items-center gap-4 py-4 text-center" data-testid="status-reset-success">
              <CheckCircle2 className="h-12 w-12 text-emerald-400" />
              <div>
                <h2 className="text-lg font-semibold mb-1">Password Updated!</h2>
                <p className="text-sm text-muted-foreground">Your password has been changed. You can now sign in.</p>
              </div>
              <Button data-testid="button-go-to-signin" onClick={() => setLocation("/login")}>
                Go to Sign In
              </Button>
            </div>
          )}

          {/* Reset form */}
          {tokenState === "valid" && !done && (
            <>
              <div>
                <h2 className="text-xl font-display font-bold" data-testid="text-reset-title">Choose a new password</h2>
                <p className="text-sm text-muted-foreground mt-1">Make it strong — at least 8 characters with uppercase, number, and symbol.</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="new-password" className="text-xs font-medium">New Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      id="new-password"
                      data-testid="input-new-password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Min. 8 characters"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pl-9 pr-10 h-10"
                      required
                      autoComplete="new-password"
                    />
                    <button type="button" data-testid="button-toggle-new-password"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      aria-label={showPassword ? "Hide password" : "Show password"}>
                      {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  </div>

                  {password.length > 0 && (
                    <div className="space-y-1.5 pt-0.5" data-testid="password-strength-meter">
                      <div className="flex gap-1">
                        {[1, 2, 3, 4, 5].map((seg) => (
                          <div key={seg}
                            className={`h-1 flex-1 rounded-full transition-colors ${seg <= strength.score ? strength.bgColor : "bg-muted"}`}
                            data-testid={`strength-segment-${seg}`} />
                        ))}
                      </div>
                      <div className="flex items-center justify-between">
                        <span className={`text-xs font-medium ${strength.color}`} data-testid="text-strength-label">
                          {strength.label}
                        </span>
                        {strength.missing.length > 0 && (
                          <span className="text-[10px] text-muted-foreground" data-testid="text-strength-missing">
                            needs: {strength.missing.slice(0, 2).join(", ")}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="confirm-password" className="text-xs font-medium">Confirm Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      id="confirm-password"
                      data-testid="input-confirm-password"
                      type={showConfirm ? "text" : "password"}
                      placeholder="Repeat your new password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="pl-9 pr-10 h-10"
                      required
                      autoComplete="new-password"
                    />
                    <button type="button" data-testid="button-toggle-confirm-password"
                      onClick={() => setShowConfirm(!showConfirm)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      aria-label={showConfirm ? "Hide" : "Show"}>
                      {showConfirm ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                  {confirmPassword.length > 0 && password !== confirmPassword && (
                    <p className="text-xs text-destructive" data-testid="text-password-mismatch">Passwords don't match</p>
                  )}
                </div>

                <Button type="submit" data-testid="button-reset-submit"
                  className="w-full h-10 font-semibold"
                  disabled={mutation.isPending || strength.score < 5 || password !== confirmPassword}>
                  {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Set New Password
                </Button>
              </form>

              <div className="text-center">
                <button type="button" data-testid="button-back-to-login"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setLocation("/login")}>
                  <ArrowLeft className="h-3 w-3 inline mr-1" />Back to Sign In
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
