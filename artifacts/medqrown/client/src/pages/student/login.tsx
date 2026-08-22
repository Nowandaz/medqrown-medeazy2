import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Eye, EyeOff, LogIn, Phone, MessageSquare, Mail as MailIcon, UserPlus } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { MedQrownBrand } from "@/components/MedQrownBrand";

export default function StudentLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await apiRequest("POST", "/api/student/login", { email, password });
      const data = await res.json();
      if (res.ok && data.accountType === "dashboard") {
        setLocation("/student/dashboard");
      } else {
        toast({ title: "Login Failed", description: data.message || "Invalid email or password", variant: "destructive" });
      }
    } catch (error: any) {
      toast({ title: "Login Failed", description: "Could not connect. Please try again.", variant: "destructive" });
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
            <MedQrownBrand size="lg" layout="stacked" />
            <h1 className="text-2xl font-bold tracking-tight mt-5" data-testid="text-title">Student Portal</h1>
          </div>

          <Card className="border-primary/10 shadow-lg">
            <CardContent className="p-6">
              <form onSubmit={handleLogin} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-sm font-medium">School email address</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="your@institution.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="h-11"
                    data-testid="input-email"
                  />
                  <p className="text-xs text-muted-foreground">Use your school or institution email address.</p>
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
                <Button type="submit" className="w-full h-11 text-sm font-medium" disabled={loading} data-testid="button-login">
                  <LogIn className="w-4 h-4 mr-2" />
                  {loading ? "Signing in..." : "Sign In"}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card className="mt-5 bg-primary/5 border-primary/10">
            <CardContent className="p-5">
              <h3 className="text-sm font-semibold mb-3 text-foreground">Need Help?</h3>
              <div className="grid gap-2.5">
                <a href="mailto:norysndachule@gmail.com" className="flex items-center gap-2.5 text-sm text-muted-foreground hover:text-primary transition-colors group" data-testid="link-email">
                  <div className="w-8 h-8 rounded-lg bg-background flex items-center justify-center border group-hover:border-primary/30 transition-colors">
                    <MailIcon className="w-4 h-4" />
                  </div>
                  norysndachule@gmail.com
                </a>
                <a href="tel:0702797977" className="flex items-center gap-2.5 text-sm text-muted-foreground hover:text-primary transition-colors group" data-testid="link-phone">
                  <div className="w-8 h-8 rounded-lg bg-background flex items-center justify-center border group-hover:border-primary/30 transition-colors">
                    <Phone className="w-4 h-4" />
                  </div>
                  0702797977
                </a>
                <a href="https://wa.me/254702797977" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 text-sm text-muted-foreground hover:text-primary transition-colors group" data-testid="link-whatsapp">
                  <div className="w-8 h-8 rounded-lg bg-background flex items-center justify-center border group-hover:border-primary/30 transition-colors">
                    <MessageSquare className="w-4 h-4" />
                  </div>
                  WhatsApp
                </a>
              </div>
            </CardContent>
          </Card>

          <div className="mt-5 space-y-3">
            <button
              onClick={() => setLocation("/student/signup")}
              className="w-full flex items-center justify-center gap-2 h-11 rounded-lg border border-primary/20 text-sm text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors bg-primary/5 hover:bg-primary/10"
              data-testid="button-signup"
            >
              <UserPlus className="w-4 h-4" />
                New student? Create your verified account
            </button>
            <p className="text-center text-xs text-muted-foreground">
              <button
                onClick={() => setLocation("/student/forgot-password")}
                className="hover:text-primary transition-colors underline underline-offset-2"
              >
                Forgot password?
              </button>
            </p>
            <p className="text-center text-xs text-muted-foreground">
              <a href="/admin" className="hover:text-primary transition-colors underline underline-offset-2" data-testid="link-admin-portal">Admin Portal</a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
