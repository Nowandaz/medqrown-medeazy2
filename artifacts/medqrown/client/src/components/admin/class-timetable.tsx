import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CalendarPlus, Edit, MapPin, Plus, Trash2, Video } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { apiErrorMessage } from "@/lib/api-error";
import { formatNairobi } from "@/lib/datetime";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const SESSION_KINDS: Record<string, string> = {
  online: "Online session", mock_cat: "Mock CAT", revision: "Revision", lab: "Anatomy lab", other: "Other",
};
const RECURRENCE: Record<string, string> = { weekly: "Every week", biweekly: "Every 2 weeks", once: "Once" };
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

type Session = {
  id: number; title: string; kind: string; recurrence: string; dayOfWeek: number | null; startDate: string;
  startTime: string; endTime: string; location: string | null; link: string | null; notes: string | null; active: boolean;
  next: { startsAt: string; endsAt: string } | null;
};

const EMPTY = { title: "", kind: "online", recurrence: "weekly", startDate: "", startTime: "20:00", endTime: "22:00",
  location: "", link: "", notes: "", active: true };

export function ClassTimetable({ classId }: { classId: number }) {
  const { toast } = useToast();
  const key = [`/api/admin/classes/${classId}/timetable`];
  const { data: sessions, isLoading } = useQuery<Session[]>({ queryKey: key });
  const [editing, setEditing] = useState<Session | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<typeof EMPTY>(EMPTY);
  const [deleting, setDeleting] = useState<Session | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: key });

  const save = useMutation({
    mutationFn: () => editing
      ? apiRequest("PATCH", `/api/admin/timetable/${editing.id}`, form)
      : apiRequest("POST", `/api/admin/classes/${classId}/timetable`, form),
    onSuccess: () => { refresh(); setOpen(false); toast({ title: editing ? "Session updated" : "Session added" }); },
    onError: (e) => toast({ title: "Couldn't save session", description: apiErrorMessage(e), variant: "destructive" }),
  });
  const addStandard = useMutation({
    mutationFn: () => apiRequest("POST", `/api/admin/classes/${classId}/timetable/standard`, {}),
    onSuccess: () => { refresh(); toast({ title: "Standard schedule added", description: "Add the Google Meet links by editing each session." }); },
    onError: (e) => toast({ title: "Couldn't add schedule", description: apiErrorMessage(e), variant: "destructive" }),
  });
  const remove = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/admin/timetable/${id}`),
    onSuccess: () => { refresh(); setDeleting(null); toast({ title: "Session deleted" }); },
    onError: (e) => toast({ title: "Couldn't delete", description: apiErrorMessage(e), variant: "destructive" }),
  });

  const openNew = () => { setEditing(null); setForm({ ...EMPTY, startDate: new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10) }); setOpen(true); };
  const openEdit = (s: Session) => {
    setEditing(s);
    setForm({ title: s.title, kind: s.kind, recurrence: s.recurrence, startDate: s.startDate, startTime: s.startTime,
      endTime: s.endTime, location: s.location ?? "", link: s.link ?? "", notes: s.notes ?? "", active: s.active });
    setOpen(true);
  };
  const set = (patch: Partial<typeof EMPTY>) => setForm((f) => ({ ...f, ...patch }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-between items-center gap-2">
        <div>
          <h3 className="text-lg font-medium">Timetable</h3>
          <p className="text-sm text-muted-foreground">Sessions students see on their dashboard and in My Class. Times are Nairobi time.</p>
        </div>
        <div className="flex gap-2">
          {!sessions?.length && (
            <Button variant="outline" onClick={() => addStandard.mutate()} disabled={addStandard.isPending}>
              <CalendarPlus className="w-4 h-4 mr-2" />Add standard schedule
            </Button>
          )}
          <Button onClick={openNew}><Plus className="w-4 h-4 mr-2" />Add session</Button>
        </div>
      </div>

      {isLoading ? null : !sessions?.length ? (
        <Card className="border-dashed"><CardContent className="py-10 text-center text-muted-foreground text-sm">
          No sessions yet. "Add standard schedule" creates the Monday session, Saturday Mock CAT, revision and the fortnightly lab.
        </CardContent></Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {sessions.map((s) => (
            <Card key={s.id} className={s.active ? "" : "opacity-60"}>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold">{s.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {s.recurrence === "once" ? s.startDate : `${RECURRENCE[s.recurrence]} · ${DAYS[s.dayOfWeek ?? 0]}`} · {s.startTime}–{s.endTime}
                    </p>
                  </div>
                  <Badge variant="secondary" className="shrink-0">{SESSION_KINDS[s.kind]}</Badge>
                </div>
                {s.link && <a href={s.link} target="_blank" rel="noopener noreferrer" className="text-sm text-primary inline-flex items-center gap-1 break-all"><Video className="w-3.5 h-3.5" />{s.link}</a>}
                {s.location && <p className="text-sm inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{s.location}</p>}
                <p className="text-xs text-muted-foreground">{!s.active ? "Hidden from students" : s.next ? `Next: ${formatNairobi(s.next.startsAt)}` : "No upcoming date"}</p>
                <div className="flex gap-1 pt-1">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(s)}><Edit className="w-4 h-4 mr-1" />Edit</Button>
                  <Button variant="ghost" size="sm" onClick={() => setDeleting(s)}><Trash2 className="w-4 h-4 mr-1 text-destructive" />Delete</Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit session" : "Add session"}</DialogTitle>
            <DialogDescription>Links (e.g. Google Meet) are only shown to members with an active membership.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="tt-title">Title</Label>
              <Input id="tt-title" value={form.title} onChange={(e) => set({ title: e.target.value })} placeholder="e.g. Weekly Online Session" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select value={form.kind} onValueChange={(v) => set({ kind: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(SESSION_KINDS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Repeats</Label>
                <Select value={form.recurrence} onValueChange={(v) => set({ recurrence: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(RECURRENCE).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5 col-span-3 sm:col-span-1">
                <Label htmlFor="tt-date">{form.recurrence === "once" ? "Date" : "First date"}</Label>
                <Input id="tt-date" type="date" value={form.startDate} onChange={(e) => set({ startDate: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tt-start">Starts</Label>
                <Input id="tt-start" type="time" value={form.startTime} onChange={(e) => set({ startTime: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tt-end">Ends</Label>
                <Input id="tt-end" type="time" value={form.endTime} onChange={(e) => set({ endTime: e.target.value })} />
              </div>
            </div>
            {form.startDate && form.recurrence !== "once" && (
              <p className="text-xs text-muted-foreground">Repeats on {DAYS[new Date(`${form.startDate}T00:00:00Z`).getUTCDay()]}s.</p>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="tt-link">Meeting link (optional)</Label>
              <Input id="tt-link" value={form.link} onChange={(e) => set({ link: e.target.value })} placeholder="https://meet.google.com/..." />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tt-location">Location (optional)</Label>
              <Input id="tt-location" value={form.location} onChange={(e) => set({ location: e.target.value })} placeholder="e.g. Anatomy Lab 2, Chiromo" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tt-notes">Notes (optional)</Label>
              <Textarea id="tt-notes" rows={2} value={form.notes} onChange={(e) => set({ notes: e.target.value })} />
            </div>
            <label className="flex items-center justify-between rounded-lg border p-3">
              <span className="text-sm">Show to students</span>
              <Switch checked={form.active} onCheckedChange={(v) => set({ active: v })} />
            </label>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending || !form.title.trim() || !form.startDate}>
              {save.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleting?.title}"?</AlertDialogTitle>
            <AlertDialogDescription>It disappears from students' timetables. You can switch "Show to students" off instead to hide it temporarily.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => { e.preventDefault(); if (deleting) remove.mutate(deleting.id); }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

