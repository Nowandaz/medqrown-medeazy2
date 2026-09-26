import { useState } from "react";
import { useLocation, useSearch } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ShieldCheck, Eye, EyeOff, ArrowLeft } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { PasswordFields, passwordsValid } from "@/components/password-fields";

export default function ResetPassword() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const emailFromUrl = params.get("email") || "";

  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast({ title: "Passwords don't match", description: "Please make sure both passwords are the same.", variant: "destructive" });
      return;
    }
    if (newPassword.length < 8) {
      toast({ title: "Password too short", description: "Use at least 8 characters.", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/student/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailFromUrl, code: code.trim(), newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: res.status === 429 ? "Limit reached" : "Reset failed", description: data.message, variant: "destructive" });
        return;
      }
      toast({ title: "Password updated!", description: "You can now sign in with your new password." });
      setLocation("/portal");
    } catch {
      toast({ title: "Connection error", description: "Could not reach the server. Please try again.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex flex-col">
      <AppHeader />

      <div className="flex-1 flex items-center justify-center px-4 pb-8">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <ShieldCheck className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Reset Your Password</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Enter the 6-digit code sent to <strong>{emailFromUrl}</strong> and choose a new password.
            </p>
          </div>

          <Card className="border-primary/10 shadow-lg">
            <CardContent className="p-6">
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="code" className="text-sm font-medium">Reset Code</Label>
                  <Input
                    id="code"
                    type="text"
                    inputMode="numeric"
                    placeholder="6-digit code from your email"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    maxLength={6}
                    required
                    className="h-11 text-center tracking-widest text-lg font-mono"
                  />
                </div>

                <PasswordFields
                  password={newPassword} confirm={confirmPassword}
                  onPasswordChange={setNewPassword} onConfirmChange={setConfirmPassword}
                />

                <Button type="submit" className="w-full h-11 text-sm font-medium" disabled={loading || code.length < 6 || !passwordsValid(newPassword, confirmPassword)}>
                  <ShieldCheck className="w-4 h-4 mr-2" />
                  {loading ? "Resetting..." : "Reset Password"}
                </Button>
              </form>
            </CardContent>
          </Card>

          <div className="mt-5 space-y-2 text-center text-xs text-muted-foreground">
            <p>
              Didn't get a code?{" "}
              <button onClick={() => setLocation("/student/forgot-password")}
                className="hover:text-primary underline underline-offset-2">
                Send again
              </button>
            </p>
            <p>
              <button onClick={() => setLocation("/portal")}
                className="hover:text-primary transition-colors inline-flex items-center gap-1">
                <ArrowLeft className="w-3 h-3" /> Back to Sign In
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
