import { useState } from "react";
import { useLocation, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { AppHeader } from "@/components/AppHeader";
import { MedQrownBrand } from "@/components/MedQrownBrand";
import { CheckCircle2, ArrowRight, ArrowLeft } from "lucide-react";
import { motion } from "framer-motion";
import { engagementSessionId, engagementSource, trackEngagement } from "@/lib/engagement";
import { apiErrorMessage } from "@/lib/api-error";

export default function StudentSignup() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const { data: contentData, isLoading } = useQuery<{ settings: Record<string, any> }>({
    queryKey: ["/api/site-content"],
  });

  const googleFormUrl = contentData?.settings?.googleFormUrl || "";
  const registrationOpen = contentData?.settings?.registrationOpen === true && !!googleFormUrl;

  const [form, setForm] = useState({ name: "", email: "", phone: "" });
  const [submitted, setSubmitted] = useState(false);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, sessionId: engagementSessionId(), ...(engagementSource() ? { source: engagementSource() } : {}) }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.message || "Please check your details and try again.");
      return res.json();
    },
    onSuccess: (data) => {
      if (data.alreadyRegistered) {
        toast({ title: "Already on waitlist", description: "This email is already registered on our waitlist." });
      }
      setSubmitted(true);
    },
    onError: (e: any) => toast({ title: "Failed to join", description: apiErrorMessage(e), variant: "destructive" }),
  });

  if (isLoading) {
    return <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex items-center justify-center">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex flex-col">
      <AppHeader />

      <div className="flex-1 flex items-center justify-center px-4 pb-8">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <MedQrownBrand size="lg" layout="stacked" />
            <h1 className="text-2xl font-bold tracking-tight mt-5">
              {registrationOpen ? "Sign up for this cohort" : "Join the waitlist"}
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              MedEazy is invite-only. Join the current cohort or the waitlist to get an invite.
            </p>
          </div>

          <Card className="border-primary/10 shadow-lg">
            <CardContent className="p-6">
              {registrationOpen ? (
                <div className="text-center space-y-4">
                  <p className="text-sm text-foreground">Pay first, then submit your details and M-Pesa code on our registration form. We'll email your invite once your payment is verified.</p>
                  <a href={googleFormUrl} target="_blank" rel="noopener noreferrer" className="block w-full"
                    onClick={() => trackEngagement("signup_click", "signup")}>
                    <Button size="lg" className="w-full font-bold gap-2">
                      Sign up for this cohort <ArrowRight className="w-4 h-4" />
                    </Button>
                  </a>
                </div>
              ) : submitted ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="text-center"
                >
                  <CheckCircle2 className="w-12 h-12 text-primary mx-auto mb-4" />
                  <h2 className="font-black text-foreground text-xl mb-2">You're on the list!</h2>
                  <p className="text-muted-foreground text-sm mb-6 max-w-sm mx-auto">
                    We've added your details. We will reach out when spots open up.
                  </p>
                  <Link href="/">
                    <Button variant="outline" className="w-full rounded-xl gap-2 font-bold">
                      <ArrowLeft className="w-4 h-4" /> Back to Home
                    </Button>
                  </Link>
                </motion.div>
              ) : (
                <form onSubmit={(e) => { e.preventDefault(); mutation.mutate(); }} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name" className="text-sm font-medium">Full Name *</Label>
                    <Input id="name" type="text" placeholder="Your name" value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })} required className="h-11" />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-sm font-medium">Email Address *</Label>
                    <Input id="email" type="email" placeholder="you@example.com" value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })} required className="h-11" />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="phone" className="text-sm font-medium">WhatsApp Number *</Label>
                    <Input id="phone" type="text" placeholder="+254..." value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })} required className="h-11" />
                  </div>

                  <Button type="submit" className="w-full h-11 text-sm font-bold mt-2" disabled={mutation.isPending}>
                    {mutation.isPending ? "Joining..." : "Join Waitlist"}
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>

          <p className="text-center text-xs text-muted-foreground mt-6">
            Already a member?{" "}
            <Link href="/portal" className="hover:text-primary transition-colors underline underline-offset-2">
              Student Login
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
