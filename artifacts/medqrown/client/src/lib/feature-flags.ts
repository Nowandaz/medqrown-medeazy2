/**
 * Stage 2 frontend release switches. Disabled features remain routable only to
 * a safe dashboard redirect until they are intentionally enabled here.
 */
export const FEATURES = {
  studentSelfTests: false,
  studentLiveRooms: false,
  adminSelfTestReports: false,
  studentUnits: false,
  studentUnitEnrolment: false,
  studentAccessRequests: false,
  schoolDomains: false,
  universityManagement: false,
  signupRequests: false,
  institutions: false,
  inquiries: false,
  publicSignup: false,
  demoVideoLinks: false,
} as const;