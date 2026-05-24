import { useEffect } from "react";
import { useSearch, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Clock, CheckCircle, XCircle, ShieldCheck } from "lucide-react";
import logoPath from "@assets/medqrown_logo.png";

export default function StudentAwaiting() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const token = params.get("token") || "";
  const [, setLocation] = useLocation();

  const { data, isLoading } = useQuery<{
    name: string;
    email: string;
    university: string;
    status: string;
    emailVerified: boolean;
    rejectionReason: string | null;
  }>({
    queryKey: [`/api/student/signup-status/${token}`],
    enabled: !!token,
    refetchInterval: 15000,
  });

  useEffect(() => {
    if (!token) setLocation("/student/signup");
  }, [token]);

  useEffect(() => {
    if (data && !data.emailVerified) {
      setLocation(`/student/verify?token=${token}`);
    }
  }, [data]);

  if (!token || isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const status = data?.status;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex flex-col">
      <header className="px-4 sm:px-6 py-4">
        <img src={logoPath} alt="MedQrown Logo" className="h-12 w-auto object-contain" />
      </header>

      <div className="flex-1 flex items-center justify-center px-4 pb-8">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <img src={logoPath} alt="MedQrown" className="h-24 w-auto mx-auto mb-4 object-contain" />
            <h1 className="text-2xl font-bold tracking-tight">MedQrown MedEazy</h1>
            <p className="text-muted-foreground mt-1 text-sm">Student Portal</p>
          </div>

          {status === "pending_approval" && (
            <Card className="border-primary/10 shadow-lg">
              <CardContent className="p-8 text-center">
                <div className="w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mx-auto mb-5">
                  <Clock className="w-8 h-8 text-amber-600 dark:text-amber-400" />
                </div>
                <h2 className="text-xl font-semibold mb-2">Awaiting Approval</h2>
                <p className="text-muted-foreground text-sm mb-5">
                  Hi <strong>{data?.name}</strong>, your email has been verified.
                  Your application is now under review by our admin team.
                  You'll receive access credentials once approved.
                </p>
                <div className="bg-muted/50 rounded-lg p-4 text-left space-y-2 text-sm mb-5">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Email</span>
                    <span className="font-medium">{data?.email}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">University</span>
                    <span className="font-medium">{data?.university}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Email verified</span>
                    <span className="flex items-center gap-1 text-green-600 font-medium text-xs">
                      <ShieldCheck className="w-3.5 h-3.5" /> Verified
                    </span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  This page refreshes automatically every 15 seconds.
                </p>
              </CardContent>
            </Card>
          )}

          {status === "approved" && (
            <Card className="border-green-200 dark:border-green-800 shadow-lg">
              <CardContent className="p-8 text-center">
                <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-5">
                  <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
                </div>
                <h2 className="text-xl font-semibold mb-2 text-green-700 dark:text-green-400">Application Approved!</h2>
                <p className="text-muted-foreground text-sm mb-6">
                  Hi <strong>{data?.name}</strong>, your application has been approved.
                  You can now sign in to the exam portal. Check your email for your login credentials.
                </p>
                <Button className="w-full h-11" onClick={() => setLocation("/")}>
                  Go to Sign In
                </Button>
              </CardContent>
            </Card>
          )}

          {status === "rejected" && (
            <Card className="border-red-200 dark:border-red-800 shadow-lg">
              <CardContent className="p-8 text-center">
                <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-5">
                  <XCircle className="w-8 h-8 text-red-600 dark:text-red-400" />
                </div>
                <h2 className="text-xl font-semibold mb-2 text-red-700 dark:text-red-400">Application Not Approved</h2>
                <p className="text-muted-foreground text-sm mb-4">
                  Unfortunately your application was not approved at this time.
                </p>
                {data?.rejectionReason && (
                  <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-5 text-left">
                    <p className="text-sm font-medium text-red-700 dark:text-red-400 mb-1">Reason</p>
                    <p className="text-sm text-red-600 dark:text-red-300">{data.rejectionReason}</p>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  For questions, please contact{" "}
                  <a href="mailto:norysndachule@gmail.com" className="underline hover:text-primary">
                    norysndachule@gmail.com
                  </a>
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
