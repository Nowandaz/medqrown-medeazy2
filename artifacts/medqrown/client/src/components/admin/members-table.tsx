import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Download, Mail, CalendarClock, UserMinus, Phone, Search } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { getStudentAvatarUrl } from "@/lib/avatar";
import { formatCalendarDate } from "@/lib/datetime";

export type MemberRow = {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  avatarKey: string | null;
  cohortId: number | null;
  membershipStartDate: string | null;
  membershipEndDate: string | null;
  latestPlan: "Individual" | "Group" | null;
  status: "active" | "grace" | "invited" | "expired" | "unassigned";
  inviteStatus: "activated" | "pending" | "expired" | "not_invited";
  examsTaken: number;
  averageScore: number | null;
  classes?: { id: number; name: string; status: string }[];
};

const STATUS_STYLES: Record<MemberRow["status"], string> = {
  active: "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20",
  grace: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
  invited: "bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/20",
  expired: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20",
  unassigned: "bg-muted text-muted-foreground",
};
const STATUS_LABELS: Record<MemberRow["status"], string> = {
  active: "Active", grace: "Grace", invited: "Not started", expired: "Expired", unassigned: "No membership",
};
const INVITE_LABELS: Record<MemberRow["inviteStatus"], string> = {
  activated: "Activated", pending: "Invited – not activated", expired: "Invite expired", not_invited: "Not invited",
};

function errorMessage(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  const json = text.replace(/^\d{3}:\s*/, "");
  try { return JSON.parse(json).message || json; } catch { return json; }
}

/**
 * Master members table (Admin → Classes → [class] → Members, and Admin → Students).
 * With classId it lists that class and offers "Remove from class"; without, all students.
 */
export function MembersTable({ classId }: { classId?: number }) {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState("name");
  const params = new URLSearchParams({ sort, ...(search.trim() ? { search: search.trim() } : {}), ...(status !== "all" ? { status } : {}) });
  const baseUrl = classId ? `/api/admin/classes/${classId}/members` : "/api/admin/students";
  const { data: members, isLoading } = useQuery<MemberRow[]>({
    // Keyed [baseUrl, filters] so invalidating [baseUrl] (after imports/adds) refreshes every filter view.
    queryKey: [baseUrl, params.toString()],
    queryFn: async () => {
      const res = await fetch(`${baseUrl}?${params.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load members");
      return res.json();
    },
  });
  const { data: cohorts } = useQuery<any>({ queryKey: ["/api/admin/cohorts"] });

  const [endDateFor, setEndDateFor] = useState<MemberRow | null>(null);
  const [newEndDate, setNewEndDate] = useState("");
  const [endDateReason, setEndDateReason] = useState("");
  const [removeFor, setRemoveFor] = useState<MemberRow | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: [baseUrl] });
    if (classId) queryClient.invalidateQueries({ queryKey: [`/api/admin/classes/${classId}/overview`] });
  };

  const resendInvite = useMutation({
    mutationFn: (member: MemberRow) => apiRequest("POST", `/api/admin/students/${member.id}/resend-invite`),
    onMutate: (member) => setBusyId(member.id),
    onSettled: () => setBusyId(null),
    onSuccess: (_d, member) => { refresh(); toast({ title: "Invite resent", description: `A new 7-day link was emailed to ${member.email}; the old link no longer works.` }); },
    onError: (e) => toast({ title: "Could not resend invite", description: errorMessage(e), variant: "destructive" }),
  });

  const updateEndDate = useMutation({
    mutationFn: (member: MemberRow) => apiRequest("PUT", `/api/admin/memberships/${member.id}`, {
      cohortId: member.cohortId ?? cohorts?.current?.id,
      startDate: member.membershipStartDate ?? cohorts?.current?.startDate,
      endDate: newEndDate,
      reason: endDateReason.trim(),
    }),
    onSuccess: () => { refresh(); setEndDateFor(null); toast({ title: "Membership end date updated" }); },
    onError: (e) => toast({ title: "Could not update end date", description: errorMessage(e), variant: "destructive" }),
  });

  const removeFromClass = useMutation({
    mutationFn: (member: MemberRow) => apiRequest("DELETE", `/api/admin/classes/${classId}/members/${member.id}`),
    onSuccess: (_d, member) => { refresh(); setRemoveFor(null); toast({ title: `${member.name} removed from this class` }); },
    onError: (e) => toast({ title: "Could not remove student", description: errorMessage(e), variant: "destructive" }),
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-2 p-4 border-b">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email, phone" className="pl-9" aria-label="Search members" />
        </div>
        <div className="flex gap-2">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-[140px]" aria-label="Filter by status"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="grace">Grace</SelectItem>
              <SelectItem value="invited">Not started</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
              <SelectItem value="unassigned">No membership</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={setSort}>
            <SelectTrigger className="w-[140px]" aria-label="Sort by"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="name">Sort: Name</SelectItem>
              <SelectItem value="membershipEndDate">Sort: End date</SelectItem>
              <SelectItem value="status">Sort: Status</SelectItem>
              <SelectItem value="inviteStatus">Sort: Invite</SelectItem>
              <SelectItem value="averageScore">Sort: Avg score</SelectItem>
            </SelectContent>
          </Select>
          {classId && (
            <a href={`/api/admin/classes/${classId}/members/export.csv?${params.toString()}`} download>
              <Button variant="outline" size="icon" title="Export CSV" aria-label="Export CSV"><Download className="w-4 h-4" /></Button>
            </a>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Student</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Membership</TableHead>
              <TableHead>Invite</TableHead>
              <TableHead className="text-right">Exams</TableHead>
              <TableHead className="text-right">Avg</TableHead>
              {!classId && <TableHead>Classes</TableHead>}
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Loading members...</TableCell></TableRow>
            ) : !members?.length ? (
              <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">No members match.</TableCell></TableRow>
            ) : members.map((member) => (
              <TableRow key={member.id}>
                <TableCell>
                  <div className="flex items-center gap-3 min-w-[180px]">
                    <img src={getStudentAvatarUrl(member.avatarKey, 64)} alt="" className="w-8 h-8 rounded-full bg-muted shrink-0" loading="lazy" />
                    <div className="min-w-0">
                      <div className="font-medium">{member.name}</div>
                      <div className="text-xs text-muted-foreground break-all">{member.email}</div>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {member.phone ? (
                    <a href={`tel:${member.phone}`} className="inline-flex items-center gap-1 text-sm hover:text-primary"><Phone className="w-3 h-3" />{member.phone}</a>
                  ) : <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell className="text-sm">{member.latestPlan ?? <span className="text-muted-foreground">Complimentary</span>}</TableCell>
                <TableCell className="whitespace-nowrap">
                  <Badge variant="outline" className={STATUS_STYLES[member.status]}>{STATUS_LABELS[member.status]}</Badge>
                  {member.membershipEndDate && <div className="text-xs text-muted-foreground mt-1">Ends {formatCalendarDate(member.membershipEndDate)}</div>}
                </TableCell>
                <TableCell className="text-sm whitespace-nowrap">
                  <span className={member.inviteStatus === "activated" ? "" : "text-amber-700 dark:text-amber-400 font-medium"}>{INVITE_LABELS[member.inviteStatus]}</span>
                </TableCell>
                <TableCell className="text-right">{member.examsTaken}</TableCell>
                <TableCell className="text-right">{member.averageScore == null ? "—" : `${Math.round(member.averageScore)}%`}</TableCell>
                {!classId && <TableCell className="text-xs">{member.classes?.map((c) => c.name).join(", ") || "—"}</TableCell>}
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    {member.inviteStatus !== "activated" && (
                      <Button variant="ghost" size="sm" onClick={() => resendInvite.mutate(member)} disabled={busyId === member.id} title="Resend invite">
                        <Mail className="w-4 h-4 sm:mr-1" /><span className="hidden sm:inline">{busyId === member.id ? "Sending..." : "Resend invite"}</span>
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" title="Edit membership end date" aria-label="Edit membership end date"
                      onClick={() => { setEndDateFor(member); setNewEndDate(member.membershipEndDate ?? ""); setEndDateReason(""); }}>
                      <CalendarClock className="w-4 h-4" />
                    </Button>
                    {classId && (
                      <Button variant="ghost" size="icon" title="Remove from class" aria-label="Remove from class" onClick={() => setRemoveFor(member)}>
                        <UserMinus className="w-4 h-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!endDateFor} onOpenChange={(open) => !open && setEndDateFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit membership end date</DialogTitle>
            <DialogDescription>{endDateFor?.name} — the change and your reason are recorded.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="member-end-date">New end date</Label>
              <Input id="member-end-date" type="date" value={newEndDate} onChange={(e) => setNewEndDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="member-end-reason">Reason *</Label>
              <Input id="member-end-reason" value={endDateReason} onChange={(e) => setEndDateReason(e.target.value)} placeholder="e.g. Joined late after talking to us" />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEndDateFor(null)}>Cancel</Button>
            <Button onClick={() => endDateFor && updateEndDate.mutate(endDateFor)} disabled={!newEndDate || !endDateReason.trim() || updateEndDate.isPending}>
              {updateEndDate.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!removeFor} onOpenChange={(open) => !open && setRemoveFor(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removeFor?.name} from this class?</AlertDialogTitle>
            <AlertDialogDescription>
              They lose access to this class's exams and announcements. Their account, membership and past results are kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => { e.preventDefault(); if (removeFor) removeFromClass.mutate(removeFor); }}>
              {removeFromClass.isPending ? "Removing..." : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
