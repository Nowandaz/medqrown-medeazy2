import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Eye, EyeOff, LogIn } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { MedQrownBrand } from "@/components/MedQrownBrand";
import { apiErrorMessage } from "@/lib/api-error";

export default function AdminLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [loginError, setLoginError] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setLoginError("");
    try {
      await apiRequest("POST", "/api/admin/login", { email: email.trim(), password });
      setLocation("/admin/dashboard");
    } catch (error: any) {
      const message = apiErrorMessage(error, "We couldn't sign you in. Please try again.");
      setLoginError(message);
      toast({ title: "Couldn't sign in", description: message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };


  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex flex-col">
      <AppHeader />

      <div className="flex-1 flex items-start justify-center px-4 pt-10 pb-8">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <MedQrownBrand size="lg" layout="stacked" />
            <h1 className="text-2xl font-bold tracking-tight mt-5" data-testid="text-title">Admin Portal</h1>
          </div>

          <Card className="border-primary/10 shadow-lg">
            <CardContent className="p-6">
              <form onSubmit={handleLogin} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-sm font-medium">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="admin@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="h-11"
                    data-testid="input-email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password" className="text-sm font-medium">Password</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="current-password"
                      required
                      className="h-11 pr-11"
                      data-testid="input-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((visible) => !visible)}
                      className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      aria-pressed={showPassword}
                      data-testid="button-toggle-password"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                {loginError && (
                  <p role="alert" className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2">{loginError}</p>
                )}
                <Button type="submit" className="w-full h-11 text-sm font-medium" disabled={loading} data-testid="button-login">
                  <LogIn className="w-4 h-4 mr-2" />
                  {loading ? "Signing in..." : "Sign In"}
                </Button>
              </form>
            </CardContent>
          </Card>

          <p className="text-center text-xs text-muted-foreground mt-5">
            <a href="/portal" className="hover:text-primary transition-colors underline underline-offset-2" data-testid="link-student-portal">Go to Student Portal</a>
          </p>
        </div>
      </div>
    </div>
  );
}
