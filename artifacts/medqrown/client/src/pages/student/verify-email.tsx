import { useState } from "react";
import { useLocation, useSearch } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { ShieldCheck, RefreshCw } from "lucide-react";
import logoPath from "@assets/medqrown_logo.png";

export default function StudentVerifyEmail() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const token = params.get("token") || "";
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await apiRequest("POST", "/api/student/verify-email", { token, code });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Verification failed", description: data.message, variant: "destructive" });
        return;
      }
      toast({ title: "Email verified!", description: "Your application is now pending admin approval." });
      setLocation(`/student/awaiting?token=${token}`);
    } catch {
      toast({ title: "Error", description: "Could not connect. Please try again.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    try {
      const res = await fetch("/api/student/signup/resend-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: res.status === 429 ? "Limit reached" : "Error", description: data.message, variant: "destructive" });
        return;
      }
      toast({ title: "Code resent", description: "A new verification code has been sent to your email." });
    } catch {
      toast({ title: "Error", description: "Could not resend. Please try again.", variant: "destructive" });
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex flex-col">
      <header className="px-4 sm:px-6 py-4">
        <img src={logoPath} alt="MedQrown Logo" className="h-12 w-auto object-contain" />
      </header>

      <div className="flex-1 flex items-center justify-center px-4 pb-8">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <ShieldCheck className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Verify Your Email</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              We've sent a 6-digit code to your email address. Enter it below to continue.
            </p>
          </div>

          <Card className="border-primary/10 shadow-lg">
            <CardContent className="p-6">
              <form onSubmit={handleVerify} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="code" className="text-sm font-medium">Verification Code</Label>
                  <Input
                    id="code"
                    type="text"
                    inputMode="numeric"
                    placeholder="123456"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    required
                    maxLength={6}
                    className="h-14 text-center text-2xl tracking-widest font-mono"
                  />
                </div>
                <Button type="submit" className="w-full h-11 text-sm font-medium" disabled={loading || code.length !== 6}>
                  <ShieldCheck className="w-4 h-4 mr-2" />
                  {loading ? "Verifying..." : "Verify Email"}
                </Button>
              </form>

              <div className="mt-5 pt-5 border-t border-border text-center">
                <p className="text-sm text-muted-foreground mb-3">Didn't receive the code?</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleResend}
                  disabled={resending}
                  className="w-full"
                >
                  <RefreshCw className={`w-4 h-4 mr-2 ${resending ? "animate-spin" : ""}`} />
                  {resending ? "Sending..." : "Resend Code"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <p className="text-center text-xs text-muted-foreground mt-5">
            Check your spam folder if you don't see the email.
          </p>
        </div>
      </div>
    </div>
  );
}
