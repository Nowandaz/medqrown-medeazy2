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

export interface LiveRoomSetup {
  unitId: number;
  topic: string;
  difficulty: "easy" | "mixed" | "hard";
  contentStyle: "direct" | "clinical" | "mixed";
  questionCount: number;
  perQuestionSeconds: number;
}

export interface LiveRoomState {
  room: {
    id: number; roomCode: string; inviteToken?: string | null; topic: string; unitName: string; unitCode?: string | null;
    hostName: string; hostStudentId: number; difficulty: string; contentStyle: string;
    questionCount: number; perQuestionSeconds: number; status: "generating" | "generation_failed" | "ready" | "running" | "finished" | "closed" | "expired";
    generationError?: string | null; currentQuestionIndex: number; questionStartedAt?: string | null;
    expiresAt: string; startedAt?: string | null; finishedAt?: string | null;
  };
  me: { memberId: number; role: string; isHost: boolean };
  members: Array<{ id: number; studentId: number; name: string; role: string; status: string; joinedAt: string; lastSeenAt: string }>;
  leaderboard: Array<{ studentId: number; name: string; score?: number; correctCount?: number; answerCount: number; rank: number }>;
  question: { id: number; content: string; options: string[]; orderIndex: number; selectedOptionIndex: number | null } | null;
  results?: Array<{ id: number; content: string; options: string[]; correctOptionIndex: number; explanation?: string | null; orderIndex: number; selectedOptionIndex: number | null; isCorrect: boolean | null; points: number | null }>;
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

export function useCreateLiveRoom() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: LiveRoomSetup) => apiRequest("POST", "/api/student/live-rooms", data).then((res) => res.json() as Promise<{ roomId: number; roomCode: string; inviteToken: string; status: string }>),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/student/live-matches"] }),
  });
}

export function useLookupLiveRoomCode() {
  return useMutation({
    mutationFn: (code: string) => apiRequest("GET", `/api/student/live-rooms/code/${encodeURIComponent(code.trim().toUpperCase())}`).then((res) => res.json() as Promise<{ roomId: number; roomCode: string }>),
  });
}

export function useJoinLiveRoom() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ roomId, roomCode, inviteToken }: { roomId: number; roomCode?: string; inviteToken?: string }) => apiRequest("POST", `/api/student/live-rooms/${roomId}/join`, { roomCode, inviteToken }).then((res) => res.json()),
    onSuccess: (_, values) => queryClient.invalidateQueries({ queryKey: [`/api/student/live-rooms/${values.roomId}`] }),
  });
}

export function useLiveRoom(roomId: string, enabled = true) {
  return useQuery<LiveRoomState>({
    queryKey: [`/api/student/live-rooms/${roomId}`],
    enabled: enabled && !!roomId,
    refetchInterval: (query) => query.state.data?.room.status === "running" || query.state.data?.room.status === "generating" ? 1500 : 5000,
    retry: false,
  });
}

export function useStartLiveRoom() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (roomId: number) => apiRequest("POST", `/api/student/live-rooms/${roomId}/start`),
    onSuccess: (_, roomId) => queryClient.invalidateQueries({ queryKey: [`/api/student/live-rooms/${roomId}`] }),
  });
}

export function useCloseLiveRoom() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (roomId: number) => apiRequest("POST", `/api/student/live-rooms/${roomId}/close`),
    onSuccess: (_, roomId) => queryClient.invalidateQueries({ queryKey: [`/api/student/live-rooms/${roomId}`] }),
  });
}

export function useAnswerLiveRoom() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ roomId, questionId, selectedOptionIndex }: { roomId: number; questionId: number; selectedOptionIndex: number }) =>
      apiRequest("POST", `/api/student/live-rooms/${roomId}/answer`, { questionId, selectedOptionIndex }).then((res) => res.json() as Promise<{ locked: boolean; duplicate?: boolean; isCorrect: boolean; points: number; rank?: number | null; advanced?: boolean }>),
    onSuccess: (_, values) => queryClient.invalidateQueries({ queryKey: [`/api/student/live-rooms/${values.roomId}`] }),
  });
}

export function useLiveRoomShare() {
  return useMutation({
    mutationFn: (roomId: number) => apiRequest("POST", `/api/student/live-rooms/${roomId}/share`).then((res) => res.json() as Promise<{ token: string; url: string }>),
  });
}

export function useLiveMatches() {
  return useQuery<Array<{ id: number; roomCode: string; topic: string; finishedAt: string; unitName: string; score: number; rank: number; correctCount: number }>>({
    queryKey: ["/api/student/live-matches"],
  });
}

export function useLiveUnitLeaderboard(unitId: number | null) {
  return useQuery<Array<{ name: string; score: number; correctCount: number; matchesPlayed: number }>>({
    queryKey: [`/api/student/live-leaderboards/${unitId}`],
    enabled: !!unitId,
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
