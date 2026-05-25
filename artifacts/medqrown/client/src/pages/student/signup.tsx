import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { UserPlus, ArrowLeft, Eye, EyeOff } from "lucide-react";
import logoPath from "@assets/medqrown_logo.png";

const YEAR_OPTIONS = ["Year 1", "Year 2", "Year 3", "Year 4", "Year 5", "Year 6", "Postgraduate", "Other"];

export default function StudentSignup() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [university, setUniversity] = useState("");
  const [yearOfStudy, setYearOfStudy] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showCpw, setShowCpw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: universities } = useQuery<{ id: number; name: string }[]>({
    queryKey: ["/api/admin/universities"],
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast({ title: "Passwords don't match", description: "Please make sure both passwords are the same.", variant: "destructive" });
      return;
    }
    if (password.length < 6) {
      toast({ title: "Password too short", description: "Password must be at least 6 characters.", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/student/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name, email, university, yearOfStudy, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409 && data.token) {
          toast({ title: "Application already in progress", description: "You already have a pending application with this email." });
          setLocation(`/student/awaiting?token=${data.token}`);
          return;
        }
        if (res.status === 409 && data.hasAccount) {
          toast({ title: "Email already registered", description: "This email already has an account. Please sign in instead.", variant: "destructive" });
          setLocation("/");
          return;
        }
        toast({ title: "Signup failed", description: data.message || "Something went wrong. Please try again.", variant: "destructive" });
        return;
      }
      setLocation(`/student/verify?token=${data.token}`);
    } catch {
      toast({ title: "Connection error", description: "Could not reach the server. Please check your internet and try again.", variant: "destructive" });
    } finally {
      setLoading(false);
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
            <img src={logoPath} alt="MedQrown" className="h-24 w-auto mx-auto mb-4 object-contain" />
            <h1 className="text-2xl font-bold tracking-tight">Create Your Account</h1>
            <p className="text-muted-foreground mt-1 text-sm">MedQrown MedEazy — Student Portal</p>
          </div>

          <Card className="border-primary/10 shadow-lg">
            <CardContent className="p-6">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-sm font-medium">Full Name</Label>
                  <Input id="name" type="text" placeholder="Your full name" value={name}
                    onChange={(e) => setName(e.target.value)} required className="h-11" />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email" className="text-sm font-medium">Email Address</Label>
                  <Input id="email" type="email" placeholder="your@email.com" value={email}
                    onChange={(e) => setEmail(e.target.value)} required className="h-11" />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="university" className="text-sm font-medium">University / Institution</Label>
                  <select
                    id="university"
                    value={university}
                    onChange={(e) => setUniversity(e.target.value)}
                    required
                    className="h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  >
                    <option value="" disabled>Select your university...</option>
                    {(universities && universities.length > 0
                      ? universities
                      : [{ id: -1, name: "University of Nairobi" }, { id: -2, name: "Kenyatta University" }]
                    ).map(u => <option key={u.id} value={u.name}>{u.name}</option>)}
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="year" className="text-sm font-medium">Year of Study</Label>
                  <select
                    id="year"
                    value={yearOfStudy}
                    onChange={(e) => setYearOfStudy(e.target.value)}
                    required
                    className="h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  >
                    <option value="" disabled>Select your year...</option>
                    {YEAR_OPTIONS.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password" className="text-sm font-medium">Password</Label>
                  <div className="relative">
                    <Input id="password" type={showPw ? "text" : "password"} placeholder="Create a password (min. 6 chars)"
                      value={password} onChange={(e) => setPassword(e.target.value)} required className="h-11 pr-10" />
                    <button type="button" onClick={() => setShowPw(p => !p)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword" className="text-sm font-medium">Confirm Password</Label>
                  <div className="relative">
                    <Input id="confirmPassword" type={showCpw ? "text" : "password"} placeholder="Repeat your password"
                      value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required className="h-11 pr-10" />
                    <button type="button" onClick={() => setShowCpw(p => !p)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {showCpw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {confirmPassword && password !== confirmPassword && (
                    <p className="text-xs text-red-500">Passwords don't match</p>
                  )}
                </div>

                <Button type="submit" className="w-full h-11 text-sm font-medium mt-2" disabled={loading}>
                  <UserPlus className="w-4 h-4 mr-2" />
                  {loading ? "Submitting..." : "Create Account"}
                </Button>
              </form>
            </CardContent>
          </Card>

          <p className="text-center text-xs text-muted-foreground mt-5">
            Already registered?{" "}
            <button onClick={() => setLocation("/")}
              className="hover:text-primary transition-colors underline underline-offset-2">
              Sign In
            </button>
          </p>
          <p className="text-center text-xs text-muted-foreground mt-2">
            <button onClick={() => setLocation("/")}
              className="hover:text-primary transition-colors inline-flex items-center gap-1">
              <ArrowLeft className="w-3 h-3" /> Back to login
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
