import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export interface StudentProfile {
  id: string;
  name: string;
  email: string;
  university: string;
  avatarKey: string;
}

export interface Unit {
  id: string;
  code: string;
  name: string;
  description: string;
  isActive: boolean;
  enrolled: boolean;
  activeExamCount: number;
  averageScore: number;
  completedAttempts: number;
}

export interface UnitExam {
  id: string;
  title: string;
  timerMode: string;
  totalQuestions: number;
  accessStatus: string;
  maxAttempts: number;
  attemptsUsed: number;
  canEnter: boolean;
  reattemptStatus: "not_requested" | "pending" | "approved" | "rejected";
}

export interface UnitDetail extends Unit {
  exams: UnitExam[];
}

export interface PastExam {
  attemptId: string;
  examStudentId: string;
  examId: string;
  title: string;
  unitName: string;
  submittedAt: string;
  scorePercent: number;
  earnedMarks: number;
  totalMarks: number;
  responses?: {
    question: string;
    explanation?: string | null;
    marks?: number;
    answer?: string | null;
    answerDisplay?: string | null;
    subquestionId?: number | null;
    isCorrect?: boolean | null;
    marksAwarded?: number | null;
    aiFeedback?: string | null;
  }[];
}

export interface ProfileChangeRequest {
  id: string;
  fieldName: string;
  requestedValue: string;
  reason: string;
  status: string;
  reviewReason?: string;
  createdAt: string;
}

export interface DashboardData {
  recentActivity: PastExam[];
  enrolledUnits: Unit[];
  averageScore: number;
  totalExamsCompleted: number;
}

export interface StudentStats {
  totalAttempts: number;
  averageScore: number;
  bestScore: number;
  passRate: number;
  recentScores: Array<{
    attemptId: string;
    examId: string;
    title: string;
    unitName: string;
    submittedAt: string;
    scorePercent: number;
  }>;
  unitPerformance: Array<{
    unitName: string;
    total: number;
    averageScore: number;
  }>;
}

export type SelfTestQuestionType = "mcq" | "saq" | "mixed";
export type SelfTestContentStyle = "direct" | "clinical" | "mixed";

export interface SelfTestSetup {
  unitId: number;
  title?: string;
  focus?: string;
  questionType: SelfTestQuestionType;
  contentStyle: SelfTestContentStyle;
  questionCount: number;
  timerSeconds?: number | null;
  saveOnly?: boolean;
}

export interface SelfTestSummary {
  id: number;
  title: string;
  unitName: string;
  focus?: string | null;
  questionType: SelfTestQuestionType;
  contentStyle: SelfTestContentStyle;
  questionCount: number;
  timerSeconds?: number | null;
  status: "draft" | "generating" | "generation_failed" | "ready";
  generationError?: string | null;
  latestAttemptId?: number | null;
  latestAttemptStatus?: "in_progress" | "submitted" | null;
  submittedAt?: string | null;
  scorePercent?: number | null;
  attempts?: Array<{
    attemptId: number;
    status: "in_progress" | "submitted";
    startedAt: string;
    submittedAt?: string | null;
    scorePercent?: number | null;
  }>;
}

export interface SelfTestAttemptPayload {
  attemptId: number;
  selfTestId: number;
  title: string;
  timerSeconds?: number | null;
  currentQuestionIndex: number;
  totalQuestions: number;
  startedAt: string;
  question: {
    id: number;
    type: "mcq" | "saq";
    content: string;
    marks: number;
    options: Array<{ id: number; content: string; orderIndex: number }>;
    savedAnswer?: string | null;
  } | null;
}

export function useStudentMe() {
  return useQuery<StudentProfile>({
    queryKey: ["/api/student/me"],
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiRequest("POST", "/api/student/logout"),
    onSuccess: () => {
      queryClient.setQueryData(["/api/student/me"], null);
      queryClient.clear();
    },
  });
}

export function useStudentDashboard() {
  return useQuery<DashboardData>({
    queryKey: ["/api/student/dashboard"],
  });
}

export function useStudentUnits() {
  return useQuery<Unit[]>({
    queryKey: ["/api/student/units"],
  });
}

export function useStudentUnit(id: string) {
  return useQuery<UnitDetail>({
    queryKey: [`/api/student/units/${id}`],
    enabled: !!id,
  });
}

export function useEnrolUnit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/student/units/${id}/enrol`),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ["/api/student/units"] });
      queryClient.invalidateQueries({ queryKey: [`/api/student/units/${id}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/student/dashboard"] });
    },
  });
}

export function useRequestExamAccess() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/student/exams/${id}/request-access`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/student/units"] });
    },
  });
}

export function useEnterExam() {
  return useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/student/exams/${id}/enter`).then(res => res.json()),
  });
}

export function useRequestReattempt() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      apiRequest("POST", `/api/student/exams/${id}/request-reattempt`, { reason }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/student/units"] });
      queryClient.invalidateQueries({ queryKey: [`/api/student/units/${variables.id}`] });
    },
  });
}

export function useStudentStats() {
  return useQuery<StudentStats>({
    queryKey: ["/api/student/stats"],
  });
}

export function useSelfTests() {
  return useQuery<SelfTestSummary[]>({
    queryKey: ["/api/student/self-tests"],
  });
}

export function useSelfTest(id: string) {
  return useQuery<SelfTestSummary & { questions: Array<{ id: number; type: string; content: string; marks: number }> }>({
    queryKey: [`/api/student/self-tests/${id}`],
    enabled: !!id,
  });
}

export function useCreateSelfTest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: SelfTestSetup) => apiRequest("POST", "/api/student/self-tests", data).then((res) => res.json()),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/student/self-tests"] });
    },
  });
}

export function useGenerateSelfTest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/student/self-tests/${id}/generate`).then((res) => res.json()),
    onSettled: (_, __, id) => {
      queryClient.invalidateQueries({ queryKey: ["/api/student/self-tests"] });
      queryClient.invalidateQueries({ queryKey: [`/api/student/self-tests/${id}`] });
    },
  });
}

export function useDeleteSelfTest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/student/self-tests/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/student/self-tests"] }),
  });
}

export function useStartSelfTest() {
  return useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/student/self-tests/${id}/start`).then((res) => res.json() as Promise<SelfTestAttemptPayload>),
  });
}

export function useSelfTestAttempt(id: string) {
  return useQuery<SelfTestAttemptPayload>({
    queryKey: [`/api/student/self-test-attempts/${id}`],
    enabled: !!id,
  });
}

export function useSaveSelfTestAnswer() {
  return useMutation({
    mutationFn: ({ attemptId, questionId, answer }: { attemptId: number; questionId: number; answer: string }) =>
      apiRequest("POST", `/api/student/self-test-attempts/${attemptId}/answer`, { questionId, answer }),
  });
}

export function useAdvanceSelfTest() {
  return useMutation({
    mutationFn: ({ attemptId, expectedCurrentQuestionIndex }: { attemptId: number; expectedCurrentQuestionIndex: number }) =>
      apiRequest("POST", `/api/student/self-test-attempts/${attemptId}/next`, { expectedCurrentQuestionIndex })
        .then((res) => res.json() as Promise<SelfTestAttemptPayload>),
  });
}

export function useSubmitSelfTest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (attemptId: number) => apiRequest("POST", `/api/student/self-test-attempts/${attemptId}/submit`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/student/self-tests"] });
    },
  });
}

export function useSelfTestResults(id: string) {
  return useQuery<any>({
    queryKey: [`/api/student/self-test-attempts/${id}/results`],
    enabled: !!id,
  });
}

export function useReportSelfTestQuestion() {
  return useMutation({
    mutationFn: ({ questionId, reason }: { questionId: number; reason: string }) =>
      apiRequest("POST", `/api/student/self-test-questions/${questionId}/report`, { reason }),
  });
}

export function useStudentPastExams() {
  return useQuery<PastExam[]>({
    queryKey: ["/api/student/past-exams"],
  });
}

export function useStudentPastExam(examStudentId: string) {
  return useQuery<PastExam>({
    queryKey: [`/api/student/past-exams/${examStudentId}`],
    enabled: !!examStudentId,
  });
}

export function useProfileRequests() {
  return useQuery<ProfileChangeRequest[]>({
    queryKey: ["/api/student/profile/requests"],
  });
}

export function useSubmitProfileRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { fieldName: string; requestedValue: string; reason: string }) => 
      apiRequest("POST", "/api/student/profile/requests", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/student/profile/requests"] });
    },
  });
}

export function useUpdateAvatar() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { avatarKey: string }) => 
      apiRequest("POST", "/api/student/profile/avatar", data),
    onSuccess: (_, variables) => {
      queryClient.setQueryData<StudentProfile | undefined>(["/api/student/me"], (old) => {
        if (!old) return old;
        return { ...old, avatarKey: variables.avatarKey };
      });
    },
  });
}
