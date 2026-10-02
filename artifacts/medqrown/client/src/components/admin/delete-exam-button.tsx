import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Trash2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { apiErrorMessage } from "@/lib/api-error";

/** Admin → Exam → Delete. Permanent, so the admin must type the exam title to confirm. */
export function DeleteExamButton({ exam }: { exam: { id: number; title: string; classId?: number | null; stats?: { total?: number; submitted?: number; inProgress?: number } } }) {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const submitted = exam.stats?.submitted ?? 0;
  const inProgress = exam.stats?.inProgress ?? 0;

  const deleteExam = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/exams/${exam.id}`);
    },
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: ["/api/exams", exam.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/exams"] });
      if (exam.classId) queryClient.invalidateQueries({ queryKey: [`/api/admin/classes/${exam.classId}/overview`] });
      setOpen(false);
      toast({ title: "Exam deleted", description: `"${exam.title}" was permanently deleted.` });
      setLocation(exam.classId ? `/admin/classes/${exam.classId}` : "/admin/dashboard");
    },
    onError: (e) => toast({ title: "Could not delete exam", description: apiErrorMessage(e), variant: "destructive" }),
  });

  return (
    <>
      <Button variant="outline" size="sm" className="text-destructive hover:text-destructive shrink-0"
        onClick={() => { setConfirmText(""); setOpen(true); }} data-testid="button-delete-exam">
        <Trash2 className="w-4 h-4 sm:mr-1.5" /><span className="hidden sm:inline">Delete exam</span>
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this exam permanently?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>This deletes the exam, all its questions, and every student attempt, answer, mark and feedback for it. It cannot be undone.</p>
                {(submitted > 0 || inProgress > 0) && (
                  <p className="font-medium text-destructive">
                    {submitted} submitted attempt{submitted === 1 ? "" : "s"}
                    {inProgress > 0 ? ` and ${inProgress} in progress` : ""} will be lost.
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="delete-exam-confirm">Type the exam title to confirm: <span className="font-semibold">{exam.title}</span></Label>
            <Input id="delete-exam-confirm" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button variant="destructive" onClick={() => deleteExam.mutate()}
              disabled={confirmText.trim() !== exam.title.trim() || deleteExam.isPending} data-testid="button-confirm-delete-exam">
              {deleteExam.isPending ? "Deleting..." : "Delete exam"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
