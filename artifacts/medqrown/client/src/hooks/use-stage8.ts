import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export interface Stage8Membership {
  status: string;
  startDate: string;
  endDate: string;
  graceEndDate: string;
  daysRemaining?: number;
  pendingPayment?: {
    id: number;
    code: string;
    plan: string;
    amount: number;
    status: string;
    createdAt: string;
  } | null;
}

export interface Stage8DashboardData {
  membership: Stage8Membership | null;
  pendingPayment: any | null;
  nextExam: {
    id: number;
    title: string;
    opensAt: string;
    closesAt: string;
    classId: number;
    className: string;
    countdownSeconds: number;
  } | null;
  latestAnnouncement: {
    id: number;
    title: string;
    message: string;
    createdAt: string;
    className?: string;
    link?: string | null;
  } | null;
  recentResults: Array<{
    attemptId: number;
    examId: number;
    examTitle: string;
    className: string;
    submittedAt: string;
    earnedMarks: number;
    totalMarks: number;
    scorePercent: number;
  }>;
}

export function useStage8Dashboard() {
  return useQuery<Stage8DashboardData>({
    queryKey: ["/api/student/dashboard"],
    refetchOnMount: "always",
  });
}

export function useStage8ResultsSummary() {
  return useQuery<{
    totalResults: number;
    averageScore: number;
    bestScore: number;
    passRate: number;
    passThreshold: number;
  }>({
    queryKey: ["/api/student/results/summary"],
    refetchOnMount: "always",
  });
}

export function useStage8ResultsHistory() {
  return useQuery<Array<{
    attemptId: number;
    examId: number;
    examTitle: string;
    className: string;
    submittedAt: string;
    earnedMarks: number;
    totalMarks: number;
    scorePercent: number;
  }>>({
    queryKey: ["/api/student/results/history"],
    refetchOnMount: "always",
  });
}

export interface Stage8Profile {
  id: number;
  name: string;
  email: string;
  phone: string;
  avatarKey: string;
  membership: {
    status: string;
    startDate: string;
    endDate: string;
    graceEndDate: string;
  } | null;
  paymentHistory: Array<{
    id: number;
    code: string;
    plan: string;
    amount: number;
    source: string;
    status: string;
    reason: string | null;
    submittedAt: string;
    reviewedAt: string | null;
    planStartDate: string | null;
    planEndDate: string | null;
  }>;
  changeRequests: Array<any>;
}

export function useStage8Profile() {
  return useQuery<Stage8Profile>({
    queryKey: ["/api/student/profile"],
  });
}
