import { useState } from "react";
import { 
  useStudentMe, 
  useProfileRequests, 
  useSubmitProfileRequest, 
  useUpdateAvatar 
} from "@/hooks/use-student";
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
import { User, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const AVATAR_OPTIONS = [
  "teal", "navy", "violet", "amber", "rose", "forest"
];

const READONLY_FIELDS = [
  { key: "name", label: "Full Name" },
  { key: "email", label: "Email Address" },
  { key: "university", label: "University" },
];

export default function StudentProfile() {
  const { data: user, isLoading: loadingUser } = useStudentMe();
  const { data: requests, isLoading: loadingRequests } = useProfileRequests();
  const submitRequest = useSubmitProfileRequest();
  const updateAvatar = useUpdateAvatar();
  const { toast } = useToast();

  const [requestDialogOpen, setRequestDialogOpen] = useState(false);
  const [selectedField, setSelectedField] = useState("");
  const [requestedValue, setRequestedValue] = useState("");
  const [reason, setReason] = useState("");

  if (loadingUser || loadingRequests) {
    return (
      <div className="space-y-8">
        <Skeleton className="h-10 w-48" />
        <div className="grid gap-8 md:grid-cols-3">
          <Skeleton className="md:col-span-1 h-[400px]" />
          <Skeleton className="md:col-span-2 h-[400px]" />
        </div>
      </div>
    );
  }

  if (!user) return null;

  const handleAvatarSelect = (key: string) => {
    if (key === user.avatarKey) return;
    updateAvatar.mutate({ avatarKey: key }, {
      onSuccess: () => {
        toast({ title: "Avatar updated" });
      }
    });
  };

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
        <h1 className="text-3xl font-bold tracking-tight">Profile & Identity</h1>
        <p className="text-muted-foreground mt-2">
          Manage your account appearance and identity verification.
        </p>
      </div>

      <div className="grid gap-8 md:grid-cols-3">
        {/* Avatar Selection */}
        <Card className="md:col-span-1 border-primary/20 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Avatar</CardTitle>
            <CardDescription>Choose how you appear on the platform.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center">
            <div className="h-32 w-32 rounded-full bg-primary/10 border-4 border-background shadow-md flex items-center justify-center mb-8 relative">
              <User className="w-12 h-12 text-primary" />
              {/* If we had actual images, we'd render them here based on user.avatarKey */}
              <div className="absolute -bottom-2 right-2 bg-primary text-primary-foreground text-xs font-bold px-2 py-1 rounded-full shadow">
                {user.avatarKey || "default"}
              </div>
            </div>
            
            <div className="w-full">
              <h4 className="text-sm font-medium mb-3">Available Avatars</h4>
              <div className="flex flex-wrap gap-2 justify-center">
                {AVATAR_OPTIONS.map(key => (
                  <button
                    key={key}
                    onClick={() => handleAvatarSelect(key)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-full transition-all ${
                      user.avatarKey === key 
                        ? "bg-primary text-primary-foreground shadow-sm scale-105 ring-2 ring-primary ring-offset-2 ring-offset-background" 
                        : "bg-muted text-muted-foreground hover:bg-primary/20 hover:text-primary"
                    }`}
                  >
                    {key}
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Identity Information */}
        <div className="md:col-span-2 space-y-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
              <div>
                <CardTitle className="text-lg">Verified Identity</CardTitle>
                <CardDescription>Official details linked to your university.</CardDescription>
              </div>
              <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20">
                <CheckCircle2 className="w-3 h-3 mr-1" /> Verified
              </Badge>
            </CardHeader>
            <CardContent>
              <div className="grid gap-6 sm:grid-cols-2">
                {READONLY_FIELDS.map(field => (
                  <div key={field.key} className="space-y-1.5">
                    <Label className="text-muted-foreground text-xs uppercase tracking-wider">{field.label}</Label>
                    <div className="font-medium p-2.5 bg-muted/40 rounded border border-transparent">
                      {(user as any)[field.key] || "—"}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-8 pt-6 border-t flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Need to update your official details? 
                </p>
                <Button variant="outline" onClick={() => setRequestDialogOpen(true)}>
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
              {!requests || requests.length === 0 ? (
                <div className="text-center py-6 text-sm text-muted-foreground">
                  You have no pending or past change requests.
                </div>
              ) : (
                <div className="space-y-4">
                  {requests.map(req => (
                    <div key={req.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border rounded-lg gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm capitalize">{req.fieldName}</span>
                          <span className="text-muted-foreground text-sm">→ {req.requestedValue}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {new Date(req.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <Badge variant={
                        req.status === 'approved' ? 'default' : 
                        req.status === 'rejected' ? 'destructive' : 'secondary'
                      } className="w-fit">
                        {req.status === 'pending' && <Clock className="w-3 h-3 mr-1" />}
                        {req.status === 'rejected' && <AlertCircle className="w-3 h-3 mr-1" />}
                        {req.status}
                      </Badge>
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
                  {READONLY_FIELDS.filter((f) => f.key !== "email").map(f => (
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
              />
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
