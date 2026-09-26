import { useState } from "react";
import { 
  useSubmitProfileRequest, 
  useUpdateAvatar 
} from "@/hooks/use-student";
import { useStage8Profile } from "@/hooks/use-stage8";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Check, CheckCircle2, Clock, AlertCircle, Palette, Sparkles, Receipt, Calendar } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { getStudentAvatarUrl } from "@/lib/avatar";
import { AvatarPicker } from "@/components/student/avatar-picker";
import { TEXT_LIMITS } from "@/lib/text-limits";

function getSelectedAvatar(key: string) {
  const [style, ...seed] = (key || "adventurer:student").split(":");
  return { key, name: seed.length ? `${style.replace("-", " ")} ${seed.join(":")}` : "Your avatar" };
}

const READONLY_FIELDS = [
  { key: "name", label: "Full Name" },
  { key: "email", label: "Email Address" },
  { key: "phone", label: "Phone Number" },
];

export default function StudentProfile() {
  const { data: user, isLoading: loadingUser } = useStage8Profile();
  const submitRequest = useSubmitProfileRequest();
  const updateAvatar = useUpdateAvatar();
  const { toast } = useToast();

  const [requestDialogOpen, setRequestDialogOpen] = useState(false);
  const [selectedField, setSelectedField] = useState("");
  const [requestedValue, setRequestedValue] = useState("");
  const [reason, setReason] = useState("");
  const [isUpdatingAvatar, setIsUpdatingAvatar] = useState(false);

  if (loadingUser) {
    return (
      <div className="space-y-8">
        <Skeleton className="h-10 w-48" />
        <div className="grid gap-8 lg:grid-cols-3">
          <Skeleton className="lg:col-span-1 h-[600px]" />
          <Skeleton className="lg:col-span-2 h-[600px]" />
        </div>
      </div>
    );
  }

  if (!user) return null;

  const handleAvatarSelect = (key: string) => {
    if (key === user.avatarKey) return;
    setIsUpdatingAvatar(true);
    updateAvatar.mutate({ avatarKey: key }, {
      onSuccess: () => {
        toast({ title: "Avatar updated" });
      },
      onSettled: () => {
        setIsUpdatingAvatar(false);
      }
    });
  };

  const selectedAvatar = getSelectedAvatar(user.avatarKey);

  const handleRequestSubmit = () => {
    if (!selectedField || !requestedValue || !reason) {
      toast({
        title: "Missing fields",
        description: "Please fill out all fields in the request form.",
        variant: "destructive"
      });
      return;
    }

    submitRequest.mutate({ fieldName: selectedField, requestedValue, reason }, {
      onSuccess: () => {
        toast({ title: "Request submitted successfully" });
        setRequestDialogOpen(false);
        setSelectedField("");
        setRequestedValue("");
        setReason("");
      },
      onError: (err) => {
        toast({
          title: "Failed to submit request",
          description: err instanceof Error ? err.message : "An error occurred.",
          variant: "destructive"
        });
      }
    });
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Profile & Account</h1>
        <p className="text-muted-foreground mt-2">
          Manage your identity, view membership status, and track payment history.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        {/* Left Column: Avatar & Membership */}
        <div className="lg:col-span-1 space-y-8">
          {/* Avatar Selection */}
          <Card className="border-primary/20 shadow-sm overflow-hidden flex flex-col">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2">
                <div className="rounded-lg bg-primary/10 p-2 text-primary">
                  <Palette className="h-4 w-4" />
                </div>
                <div>
                  <CardTitle className="text-lg">Your avatar</CardTitle>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-5 flex-1 flex flex-col">
              <div className="flex flex-col items-center rounded-2xl bg-gradient-to-br from-primary/5 via-background to-accent/10 px-4 py-6 border">
                <div className="h-32 w-32 shrink-0 overflow-hidden rounded-full border-4 border-background bg-white shadow-lg ring-1 ring-primary/20">
                  <img
                    src={getStudentAvatarUrl(selectedAvatar.key, 256)}
                    alt={`${selectedAvatar.name} avatar`}
                    className={`h-full w-full object-cover transition-opacity ${isUpdatingAvatar ? "opacity-50" : "opacity-100"}`}
                  />
                </div>
                <div className="mt-4 flex items-center gap-1.5 text-sm font-semibold">
                  <Sparkles className="h-4 w-4 text-amber-500" />
                  {selectedAvatar.name}
                </div>
                <p className="mt-2 text-center text-xs text-muted-foreground max-w-[200px]">
                  Your avatar appears on your profile and to your tutors.
                </p>
              </div>
              
              <div className="w-full flex-1">
                <h4 className="mb-3 text-sm font-semibold">Choose an avatar</h4>
                <AvatarPicker value={user.avatarKey} onSelect={handleAvatarSelect} disabled={isUpdatingAvatar} />
              </div>
            </CardContent>
          </Card>

          {/* Membership Summary */}
          {user.membership && (
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-primary" /> Membership
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center border-b pb-3">
                  <span className="text-muted-foreground text-sm">Status</span>
                  <Badge variant={
                    user.membership.status === "active" ? "default" : 
                    user.membership.status === "grace" ? "secondary" : "destructive"
                  }>
                    {user.membership.status.toUpperCase()}
                  </Badge>
                </div>
                <div className="flex justify-between items-center border-b pb-3">
                  <span className="text-muted-foreground text-sm">Started</span>
                  <span className="font-medium text-sm">{user.membership.startDate}</span>
                </div>
                <div className="flex justify-between items-center border-b pb-3">
                  <span className="text-muted-foreground text-sm">Valid Until</span>
                  <span className="font-medium text-sm">{user.membership.endDate}</span>
                </div>
                {user.membership.status === "grace" && (
                  <div className="flex justify-between items-center pt-1">
                    <span className="text-muted-foreground text-sm">Grace End</span>
                    <span className="font-medium text-sm text-yellow-600 dark:text-yellow-500">{user.membership.graceEndDate}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right Column: Identity & Payment History */}
        <div className="lg:col-span-2 space-y-8 flex flex-col">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
              <div>
                <CardTitle className="text-lg">Verified Identity</CardTitle>
                <CardDescription>Verified details associated with your account.</CardDescription>
              </div>
              <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 shrink-0 ml-2">
                <CheckCircle2 className="w-3 h-3 mr-1" /> Verified
              </Badge>
            </CardHeader>
            <CardContent>
              <div className="grid gap-6 sm:grid-cols-2">
                {READONLY_FIELDS.map(field => (
                  <div key={field.key} className="space-y-1.5 flex flex-col min-w-0">
                    <Label className="text-muted-foreground text-xs uppercase tracking-wider">{field.label}</Label>
                    <div className="font-medium p-3 bg-muted/40 rounded-md border border-transparent truncate">
                      {(user as any)[field.key] || "—"}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-8 pt-6 border-t flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <p className="text-sm text-muted-foreground">
                  Need to update your official details? 
                </p>
                <Button variant="outline" onClick={() => setRequestDialogOpen(true)} className="w-full sm:w-auto">
                  Request Change
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Change Requests History */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Change Requests</CardTitle>
              <CardDescription>Track the status of your identity update requests.</CardDescription>
            </CardHeader>
            <CardContent>
              {!user.changeRequests || user.changeRequests.length === 0 ? (
                <div className="text-center py-6 text-sm text-muted-foreground">
                  You have no pending or past change requests.
                </div>
              ) : (
                <div className="space-y-4">
                  {user.changeRequests.map(req => (
                    <div key={req.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border rounded-lg gap-4">
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                          <span className="font-medium text-sm capitalize truncate">{req.fieldName}</span>
                          <span className="text-muted-foreground text-sm hidden sm:inline">→</span>
                          <span className="text-muted-foreground text-sm truncate">{req.requestedValue}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {new Date(req.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <Badge variant={
                        req.status === 'approved' ? 'default' : 
                        req.status === 'rejected' ? 'destructive' : 'secondary'
                      } className="w-fit shrink-0">
                        {req.status === 'pending' && <Clock className="w-3 h-3 mr-1" />}
                        {req.status === 'rejected' && <AlertCircle className="w-3 h-3 mr-1" />}
                        {req.status.toUpperCase()}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Payment History */}
          <Card className="flex-1">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Receipt className="w-5 h-5 text-primary" /> Payment History
              </CardTitle>
              <CardDescription>Your past membership transactions.</CardDescription>
            </CardHeader>
            <CardContent>
              {!user.paymentHistory || user.paymentHistory.length === 0 ? (
                <div className="text-center py-12 text-sm text-muted-foreground flex flex-col items-center justify-center h-full">
                  <Receipt className="w-10 h-10 text-muted-foreground/30 mb-4" />
                  <p>No payment records found.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {user.paymentHistory.map(payment => (
                    <div key={payment.id} className="flex flex-col sm:flex-row justify-between p-4 border rounded-lg gap-4 bg-card hover:bg-muted/30 transition-colors">
                      <div className="space-y-2 flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-base font-mono">{payment.code}</span>
                          <Badge variant={
                            payment.status === 'verified' ? 'default' : 
                            payment.status === 'rejected' ? 'destructive' : 'secondary'
                          } className="text-[10px]">
                            {payment.status.toUpperCase()}
                          </Badge>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                          <span className="capitalize">{payment.plan} Plan</span>
                          <span>•</span>
                          <span>${payment.amount} via {payment.source}</span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Submitted on {new Date(payment.submittedAt).toLocaleDateString()}
                        </div>
                        {payment.reason && payment.status === 'rejected' && (
                          <div className="text-xs text-destructive bg-destructive/10 p-2 rounded mt-2">
                            Reason: {payment.reason}
                          </div>
                        )}
                        {payment.planStartDate && payment.status === 'verified' && (
                          <div className="text-xs text-primary bg-primary/5 p-2 rounded mt-2 border border-primary/10">
                            Valid: {payment.planStartDate} to {payment.planEndDate}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={requestDialogOpen} onOpenChange={setRequestDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Request Identity Change</DialogTitle>
            <DialogDescription>
              Submit official corrections to your profile. Administrators will review this request.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>Field to Change</Label>
              <Select value={selectedField} onValueChange={setSelectedField}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a field" />
                </SelectTrigger>
                <SelectContent>
                  {READONLY_FIELDS.map(f => (
                    <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>New Value</Label>
              <Input 
                placeholder="Enter the correct details" 
                value={requestedValue}
                onChange={e => setRequestedValue(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Reason</Label>
              <Textarea 
                placeholder="Explain why this change is needed" 
                className="resize-none"
                value={reason}
                onChange={e => setReason(e.target.value)}
                maxLength={TEXT_LIMITS.reportReason}
              />
              <p className="text-right text-xs text-muted-foreground">{reason.length}/{TEXT_LIMITS.reportReason}</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRequestDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleRequestSubmit} disabled={submitRequest.isPending}>
              {submitRequest.isPending ? "Submitting..." : "Submit Request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}