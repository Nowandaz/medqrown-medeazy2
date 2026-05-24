import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { UserPlus, ArrowLeft } from "lucide-react";
import logoPath from "@assets/medqrown_logo.png";

export default function StudentSignup() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [university, setUniversity] = useState("");
  const [loading, setLoading] = useState(false);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await apiRequest("POST", "/api/student/signup", { name, email, university });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409 && data.token) {
          toast({ title: "Application exists", description: "An application with this email already exists." });
          setLocation(`/student/awaiting?token=${data.token}`);
          return;
        }
        toast({ title: "Error", description: data.message || "Signup failed", variant: "destructive" });
        return;
      }
      setLocation(`/student/verify?token=${data.token}`);
    } catch {
      toast({ title: "Error", description: "Could not connect. Please try again.", variant: "destructive" });
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
            <img src={logoPath} alt="MedQrown" className="h-32 w-auto mx-auto mb-4 object-contain" />
            <h1 className="text-2xl font-bold tracking-tight">Create Your Account</h1>
            <p className="text-muted-foreground mt-1 text-sm">MedQrown MedEazy — Student Portal</p>
          </div>

          <Card className="border-primary/10 shadow-lg">
            <CardContent className="p-6">
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-sm font-medium">Full Name</Label>
                  <Input
                    id="name"
                    type="text"
                    placeholder="Your full name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    className="h-11"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-sm font-medium">Email Address</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="your@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="h-11"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="university" className="text-sm font-medium">University / Institution</Label>
                  <Input
                    id="university"
                    type="text"
                    placeholder="Your university or institution"
                    value={university}
                    onChange={(e) => setUniversity(e.target.value)}
                    required
                    className="h-11"
                  />
                </div>
                <Button type="submit" className="w-full h-11 text-sm font-medium" disabled={loading}>
                  <UserPlus className="w-4 h-4 mr-2" />
                  {loading ? "Submitting..." : "Create Account"}
                </Button>
              </form>
            </CardContent>
          </Card>

          <p className="text-center text-xs text-muted-foreground mt-5">
            Already registered?{" "}
            <button
              onClick={() => setLocation("/")}
              className="hover:text-primary transition-colors underline underline-offset-2"
            >
              Sign In
            </button>
          </p>
          <p className="text-center text-xs text-muted-foreground mt-2">
            <button
              onClick={() => setLocation("/")}
              className="hover:text-primary transition-colors inline-flex items-center gap-1"
            >
              <ArrowLeft className="w-3 h-3" /> Back to login
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
