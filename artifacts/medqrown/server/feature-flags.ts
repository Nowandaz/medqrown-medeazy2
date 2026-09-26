export const FEATURE_FLAG_ENV = {
  selfTests: "FEATURE_SELF_TESTS",
  liveRooms: "FEATURE_LIVE_ROOMS",
  adminReports: "FEATURE_ADMIN_REPORTS",
  unitsEnrolment: "FEATURE_UNITS_ENROLMENT",
  examAccessRequests: "FEATURE_EXAM_ACCESS_REQUESTS",
  schoolDomains: "FEATURE_SCHOOL_DOMAINS",
  universities: "FEATURE_UNIVERSITIES",
  signupRequests: "FEATURE_SIGNUP_REQUESTS",
  institutionsInquiries: "FEATURE_INSTITUTIONS_INQUIRIES",
  publicSignup: "FEATURE_PUBLIC_SIGNUP",
  demoVideoMedia: "FEATURE_DEMO_VIDEO_MEDIA",
} as const;

export type FeatureName = keyof typeof FEATURE_FLAG_ENV;

export function isFeatureEnabled(feature: FeatureName): boolean {
  return /^(1|true|yes|on)$/i.test(process.env[FEATURE_FLAG_ENV[feature]] || "");
}

export function featureForPath(path: string): FeatureName | undefined {
  if (
    path === "/ws/live-quiz" ||
    path.startsWith("/api/student/live-rooms") ||
    path.startsWith("/api/student/live-leaderboards") ||
    path.startsWith("/api/student/live-matches") ||
    path.startsWith("/api/live-share/") ||
    path.startsWith("/share/quiz/")
  ) return "liveRooms";

  if (
    path.startsWith("/api/student/self-tests") ||
    path.startsWith("/api/student/self-test-attempts") ||
    path.startsWith("/api/student/self-test-questions")
  ) return "selfTests";

  if (
    path.startsWith("/api/admin/self-test-question-reports")
  ) return "adminReports";

  if (
    path.startsWith("/api/student/units") ||
    path.startsWith("/api/admin/units") ||
    path.startsWith("/api/admin/exams/") && /\/unit$/.test(path) ||
    path.startsWith("/api/admin/students/enrol")
  ) return "unitsEnrolment";

  if (
    path.startsWith("/api/student/exams/") &&
      path.endsWith("/request-access") ||
    path.startsWith("/api/admin/exam-access-requests")
  ) return "examAccessRequests";

  if (
    path === "/api/student/allowed-domains" ||
    path.startsWith("/api/admin/allowed-domains")
  ) return "schoolDomains";

  if (path.startsWith("/api/admin/universities")) return "universities";
  if (path.startsWith("/api/admin/signups")) return "signupRequests";

  if (
    path === "/api/inquiries" ||
    path.startsWith("/api/admin/inquiries")
  ) return "institutionsInquiries";

  if (
    path === "/api/student/signup" ||
    path === "/api/student/verify-email" ||
    path.startsWith("/api/student/signup/") ||
    path.startsWith("/api/student/signup-status/")
  ) return "publicSignup";

  return undefined;
}