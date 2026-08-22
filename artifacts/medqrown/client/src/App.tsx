import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider, useTheme } from "@/contexts/theme-context";
import { Button } from "@/components/ui/button";
import { Moon, Sun } from "lucide-react";
import NotFound from "@/pages/not-found";
import LandingPage from "@/pages/landing";
import AdminLogin from "@/pages/admin/login";
import AdminDashboard from "@/pages/admin/dashboard";
import AdminExamDetail from "@/pages/admin/exam-detail";
import AdminSettings from "@/pages/admin/settings";
import AdminDemoExams from "@/pages/admin/demo-exams";
import AdminSiteContent from "@/pages/admin/site-content";
import AdminStudentAccess from "@/pages/admin/student-access";
import AdminSelfTestReports from "@/pages/admin/self-test-reports";
import { TermsPage, PrivacyPage, FaqPage, InstitutionsPage } from "@/pages/landing/site-pages";
import StudentLogin from "@/pages/student/login";
import StudentSignup from "@/pages/student/signup";
import StudentVerifyEmail from "@/pages/student/verify-email";
import StudentAwaiting from "@/pages/student/awaiting";
import StudentForgotPassword from "@/pages/student/forgot-password";
import StudentResetPassword from "@/pages/student/reset-password";
import StudentInstructions from "@/pages/student/instructions";
import StudentExam from "@/pages/student/exam";
import StudentResults from "@/pages/student/results";

// Student Shell & Pages
import { StudentShell } from "@/components/student/student-shell";
import StudentDashboard from "@/pages/student/dashboard";
import StudentUnits from "@/pages/student/units";
import StudentUnitDetail from "@/pages/student/unit-detail";
import StudentPastExams from "@/pages/student/past-exams";
import StudentPastExamDetail from "@/pages/student/past-exam-detail";
import StudentProfile from "@/pages/student/profile";
import StudentStats from "@/pages/student/stats";
import StudentSelfTests from "@/pages/student/self-tests";
import StudentSelfTestRun from "@/pages/student/self-test-run";
import StudentSelfTestResults from "@/pages/student/self-test-results";
import StudentLiveRooms from "@/pages/student/live-rooms";
import StudentLiveRoom from "@/pages/student/live-room";
import LiveQuizShare from "@/pages/student/live-quiz-share";
import LiveRoomJoin from "@/pages/student/live-room-join";

function StudentRoutes() {
  return (
    <StudentShell>
      <Switch>
        <Route path="/student/dashboard" component={StudentDashboard} />
        <Route path="/student/units" component={StudentUnits} />
        <Route path="/student/units/:id" component={StudentUnitDetail} />
        <Route path="/student/past-exams" component={StudentPastExams} />
        <Route path="/student/past-exams/:id" component={StudentPastExamDetail} />
        <Route path="/student/stats" component={StudentStats} />
        <Route path="/student/self-tests" component={StudentSelfTests} />
        <Route path="/student/live-rooms" component={StudentLiveRooms} />
        <Route path="/student/profile" component={StudentProfile} />
        <Route component={NotFound} />
      </Switch>
    </StudentShell>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={LandingPage} />
      <Route path="/portal" component={StudentLogin} />
      <Route path="/admin" component={AdminLogin} />
      <Route path="/admin/dashboard" component={AdminDashboard} />
      <Route path="/admin/exams/:id" component={AdminExamDetail} />
      <Route path="/admin/settings" component={AdminSettings} />
      <Route path="/admin/demo-exams" component={AdminDemoExams} />
      <Route path="/admin/site-content" component={AdminSiteContent} />
      <Route path="/admin/student-access" component={AdminStudentAccess} />
      <Route path="/admin/self-test-reports" component={AdminSelfTestReports} />
      <Route path="/terms" component={TermsPage} />
      <Route path="/privacy" component={PrivacyPage} />
      <Route path="/faq" component={FaqPage} />
      <Route path="/institutions" component={InstitutionsPage} />
      <Route path="/student/signup" component={StudentSignup} />
      <Route path="/student/verify" component={StudentVerifyEmail} />
      <Route path="/student/awaiting" component={StudentAwaiting} />
      <Route path="/student/forgot-password" component={StudentForgotPassword} />
      <Route path="/student/reset-password" component={StudentResetPassword} />
      <Route path="/student/instructions" component={StudentInstructions} />
      <Route path="/student/exam" component={StudentExam} />
      <Route path="/student/results" component={StudentResults} />
      <Route path="/student/self-tests/:id/run" component={StudentSelfTestRun} />
      <Route path="/student/self-tests/:id/results" component={StudentSelfTestResults} />
       <Route path="/student/live-rooms/share/:token" component={LiveQuizShare} />
       <Route path="/student/live-rooms/:id" component={StudentLiveRoom} />
       <Route path="/join/:roomCode" component={LiveRoomJoin} />
      
      {/* Nested Shell Routes */}
      <Route path="/student/dashboard" component={StudentRoutes} />
      <Route path="/student/units" component={StudentRoutes} />
      <Route path="/student/units/:id" component={StudentRoutes} />
      <Route path="/student/past-exams" component={StudentRoutes} />
      <Route path="/student/past-exams/:id" component={StudentRoutes} />
      <Route path="/student/stats" component={StudentRoutes} />
      <Route path="/student/self-tests" component={StudentRoutes} />
       <Route path="/student/live-rooms" component={StudentRoutes} />
      <Route path="/student/profile" component={StudentRoutes} />
      
      <Route component={NotFound} />
    </Switch>
  );
}

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  return (
    <button
      onClick={toggleTheme}
      className="fixed top-3 right-20 sm:top-auto sm:right-5 sm:bottom-5 z-[9999] h-11 w-11 rounded-full shadow-xl border-2 border-primary/30 bg-card hover:bg-muted flex items-center justify-center transition-colors"
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
