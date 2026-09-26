import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AdminNav } from "@/components/admin/admin-nav";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Download, Mail, Phone, Search, Send, Trash2, Users } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { apiErrorMessage } from "@/lib/api-error";
import { formatNairobi } from "@/lib/datetime";

type Entry = { id: number; name: string; email: string; phone: string; source: string | null; createdAt: string; invitationEmailSentAt: string | null };

export default function AdminWaitlist() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const { data: admin } = useQuery<any>({ queryKey: ["/api/admin/me"] });
  const { data: waitlist, isLoading } = useQuery<Entry[]>({ queryKey: ["/api/admin/waitlist"] });
  const { data: site } = useQuery<{ settings: Record<string, any> }>({ queryKey: ["/api/site-content"] });
  const registrationOpen = site?.settings?.registrationOpen === true;

  const [composeOpen, setComposeOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("Hello {student_name},\n\n");
  const [confirm, setConfirm] = useState<null | "link" | "custom">(null);
  const [deleting, setDeleting] = useState<Entry | null>(null);

  const total = waitlist?.length ?? 0;
  const filtered = (waitlist || []).filter((w) =>
    [w.name, w.email, w.phone].some((v) => String(v || "").toLowerCase().includes(search.toLowerCase())));
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["/api/admin/waitlist"] });

  const report = (data: any) => toast({
    title: `Sent to ${data.emailSent} of ${data.recipients}`,
    description: data.emailFailed ? `${data.emailFailed} failed — see Settings → Email Log.` : "All emails were accepted by Gmail.",
  });

  const sendLink = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/admin/waitlist/resend", { confirmedCount: total })).json(),
    onSuccess: (data) => { setConfirm(null); refresh(); report(data); },
    onError: (e) => toast({ title: "Couldn't send", description: apiErrorMessage(e), variant: "destructive" }),
  });
  const sendCustom = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/admin/waitlist/email", { subject, body, confirmedCount: total })).json(),
    onSuccess: (data) => { setConfirm(null); setComposeOpen(false); report(data); },
    onError: (e) => toast({ title: "Couldn't send", description: apiErrorMessage(e), variant: "destructive" }),
  });
  const remove = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/admin/waitlist/${id}`),
    onSuccess: () => { setDeleting(null); refresh(); toast({ title: "Removed from waitlist" }); },
    onError: (e) => toast({ title: "Couldn't remove", description: apiErrorMessage(e), variant: "destructive" }),
  });

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-primary/3">
      <AdminNav admin={admin} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Users className="w-6 h-6 text-primary" />Waitlist</h1>
            <p className="text-muted-foreground text-sm mt-1">{total} {total === 1 ? "person is" : "people are"} waiting to join.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => setComposeOpen(true)} disabled={!total}><Mail className="w-4 h-4 mr-2" />Email waitlist</Button>
            <Button onClick={() => setConfirm("link")} disabled={!total || !registrationOpen}
              title={registrationOpen ? "" : "Open registration in Admin → Site first"}>
              <Send className="w-4 h-4 mr-2" />Send sign-up link
            </Button>
            <a href="/api/admin/waitlist/export.csv" download>
              <Button variant="outline" disabled={!total}><Download className="w-4 h-4 mr-2" />Export CSV</Button>
            </a>
          </div>
        </div>
        {!registrationOpen && total > 0 && (
          <p className="text-xs text-muted-foreground">"Send sign-up link" is available while registration is Open (Admin → Site). Opening registration also emails everyone here automatically, once.</p>
        )}

        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search name, email or phone" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>

        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead>Sign-up link sent</TableHead>
                  <TableHead className="w-10"><span className="sr-only">Remove</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={7}><Skeleton className="h-6 w-full" /></TableCell></TableRow>
                ) : !filtered.length ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                    {search ? "No one matches your search." : "The waitlist is empty."}
                  </TableCell></TableRow>
                ) : filtered.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="font-medium whitespace-nowrap">{entry.name}</TableCell>
                    <TableCell className="break-all">{entry.email}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      <a href={`tel:${entry.phone}`} className="inline-flex items-center gap-1 hover:text-primary"><Phone className="w-3 h-3" />{entry.phone}</a>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">{entry.source || "Direct"}</TableCell>
                    <TableCell className="text-muted-foreground text-xs whitespace-nowrap">{formatNairobi(entry.createdAt)}</TableCell>
                    <TableCell className="text-muted-foreground text-xs whitespace-nowrap">{entry.invitationEmailSentAt ? formatNairobi(entry.invitationEmailSentAt) : "—"}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" aria-label={`Remove ${entry.name}`} onClick={() => setDeleting(entry)}>
                        <Trash2 className="w-4 h-4 text-muted-foreground" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </main>

      <Dialog open={composeOpen} onOpenChange={setComposeOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Email the waitlist</DialogTitle>
            <DialogDescription>Goes to all {total} people, in the MedEazy email design. {"{student_name}"} becomes each person's name.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="wl-subject">Subject</Label>
              <Input id="wl-subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Registration opens this Friday" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wl-body">Message</Label>
              <Textarea id="wl-body" rows={8} value={body} onChange={(e) => setBody(e.target.value)} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setComposeOpen(false)}>Cancel</Button>
            <Button onClick={() => setConfirm("custom")} disabled={!subject.trim() || body.trim().length < 5}>Review &amp; send</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send to {total} {total === 1 ? "person" : "people"}?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "link"
                ? "Everyone on the waitlist gets the “Registration is open” email with your Google Form link."
                : `Everyone on the waitlist gets “${subject}”.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); (confirm === "link" ? sendLink : sendCustom).mutate(); }}>
              {sendLink.isPending || sendCustom.isPending ? "Sending..." : `Send ${total} email${total === 1 ? "" : "s"}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {deleting?.name} from the waitlist?</AlertDialogTitle>
            <AlertDialogDescription>They won't receive waitlist emails. They can join again from the website.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => { e.preventDefault(); if (deleting) remove.mutate(deleting.id); }}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
