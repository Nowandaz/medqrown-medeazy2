import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider, useTheme } from "@/contexts/theme-context";
import { Button } from "@/components/ui/button";
import { Moon, Sun } from "lucide-react";
import NotFound from "@/pages/not-found";
import AdminLogin from "@/pages/admin/login";
import AdminDashboard from "@/pages/admin/dashboard";
import AdminExamDetail from "@/pages/admin/exam-detail";
import AdminSettings from "@/pages/admin/settings";
import StudentLogin from "@/pages/student/login";
import StudentSignup from "@/pages/student/signup";
import StudentVerifyEmail from "@/pages/student/verify-email";
import StudentAwaiting from "@/pages/student/awaiting";
import StudentForgotPassword from "@/pages/student/forgot-password";
import StudentResetPassword from "@/pages/student/reset-password";
import StudentInstructions from "@/pages/student/instructions";
import StudentExam from "@/pages/student/exam";
import StudentResults from "@/pages/student/results";

function Router() {
  return (
    <Switch>
      <Route path="/" component={StudentLogin} />
      <Route path="/admin" component={AdminLogin} />
      <Route path="/admin/dashboard" component={AdminDashboard} />
      <Route path="/admin/exams/:id" component={AdminExamDetail} />
      <Route path="/admin/settings" component={AdminSettings} />
      <Route path="/student/signup" component={StudentSignup} />
      <Route path="/student/verify" component={StudentVerifyEmail} />
      <Route path="/student/awaiting" component={StudentAwaiting} />
      <Route path="/student/forgot-password" component={StudentForgotPassword} />
      <Route path="/student/reset-password" component={StudentResetPassword} />
      <Route path="/student/instructions" component={StudentInstructions} />
      <Route path="/student/exam" component={StudentExam} />
      <Route path="/student/results" component={StudentResults} />
      <Route component={NotFound} />
    </Switch>
  );
}

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  return (
    <button
      onClick={toggleTheme}
      style={{ position: "fixed", bottom: "20px", right: "20px", zIndex: 9999 }}
      className="h-11 w-11 rounded-full shadow-xl border-2 border-primary/30 bg-card hover:bg-muted flex items-center justify-center transition-colors"
      title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
    >
      {theme === "dark"
        ? <Sun className="w-5 h-5 text-primary" />
        : <Moon className="w-5 h-5 text-primary" />}
    </button>
  );
}

function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Router />
          <ThemeToggle />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
