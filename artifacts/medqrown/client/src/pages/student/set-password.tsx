import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { MedQrownBrand } from "@/components/MedQrownBrand";
import { Lock } from "lucide-react";
import { apiErrorMessage } from "@/lib/api-error";
import { PasswordFields, passwordsValid } from "@/components/password-fields";

export default function StudentSetPassword() {
  const params = useParams<{ token: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const setPasswordMutation = useMutation({
    mutationFn: async () => {
      if (password !== confirmPassword) {
        throw new Error("Passwords do not match");
      }
      if (password.length < 8) {
        throw new Error("Password must be at least 8 characters");
      }
      const res = await apiRequest("POST", "/api/student/set-password", {
        token: params.token,
        password,
      });
      return await res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Welcome to MedQrown", description: data.message });
      setLocation(data.redirectTo || "/portal");
    },
    onError: (e: any) => {
      toast({ title: "Couldn't set your password", description: apiErrorMessage(e), variant: "destructive" });
    },
  });

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-primary/3 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <MedQrownBrand />
        </div>
        
        <Card className="border-border/50 shadow-sm">
          <CardHeader className="space-y-1 pb-4">
            <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center mb-2 mx-auto">
              <Lock className="w-5 h-5 text-primary" />
            </div>
            <CardTitle className="text-2xl text-center">Set Your Password</CardTitle>
            <CardDescription className="text-center">
              Create a password for your account to get started
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <PasswordFields
              password={password} confirm={confirmPassword}
              onPasswordChange={setPassword} onConfirmChange={setConfirmPassword}
              onSubmit={() => setPasswordMutation.mutate()}
            />
            <Button 
              className="w-full mt-2" 
              onClick={() => setPasswordMutation.mutate()}
              disabled={!passwordsValid(password, confirmPassword) || setPasswordMutation.isPending}
            >
              {setPasswordMutation.isPending ? "Saving..." : "Set Password"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
