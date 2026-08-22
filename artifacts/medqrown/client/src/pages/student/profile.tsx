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
import { Check, CheckCircle2, Clock, AlertCircle, Palette, Sparkles } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { getStudentAvatarUrl } from "@/lib/avatar";
import { TEXT_LIMITS } from "@/lib/text-limits";

type AvatarStyle = "adventurer" | "fun-emoji" | "open-peeps";

const AVATAR_OPTIONS: Array<{
  key: string;
  style: AvatarStyle;
  seed: string;
  name: string;
}> = [
  { key: "adventurer:Amara", style: "adventurer", seed: "Amara", name: "Amara" },
  { key: "adventurer:Baraka", style: "adventurer", seed: "Baraka", name: "Baraka" },
  { key: "adventurer:Imani", style: "adventurer", seed: "Imani", name: "Imani" },
  { key: "adventurer:Zuri", style: "adventurer", seed: "Zuri", name: "Zuri" },
  { key: "adventurer:Kato", style: "adventurer", seed: "Kato", name: "Kato" },
  { key: "adventurer:Nia", style: "adventurer", seed: "Nia", name: "Nia" },
  { key: "fun-emoji:Sunshine", style: "fun-emoji", seed: "Sunshine", name: "Sunshine" },
  { key: "fun-emoji:Stethoscope", style: "fun-emoji", seed: "Stethoscope", name: "Stethoscope" },
  { key: "fun-emoji:Star", style: "fun-emoji", seed: "Star", name: "Star" },
  { key: "fun-emoji:Study", style: "fun-emoji", seed: "Study", name: "Study" },
  { key: "fun-emoji:Focus", style: "fun-emoji", seed: "Focus", name: "Focus" },
  { key: "fun-emoji:Bright", style: "fun-emoji", seed: "Bright", name: "Bright" },
  { key: "open-peeps:Joy", style: "open-peeps", seed: "Joy", name: "Joy" },
  { key: "open-peeps:Hope", style: "open-peeps", seed: "Hope", name: "Hope" },
  { key: "open-peeps:Calm", style: "open-peeps", seed: "Calm", name: "Calm" },
  { key: "open-peeps:Energy", style: "open-peeps", seed: "Energy", name: "Energy" },
  { key: "open-peeps:Kind", style: "open-peeps", seed: "Kind", name: "Kind" },
  { key: "open-peeps:Brave", style: "open-peeps", seed: "Brave", name: "Brave" },
];

const AVATAR_FILTERS: Array<{ value: "all" | AvatarStyle; label: string }> = [
  { value: "all", label: "All styles" },
  { value: "adventurer", label: "Adventurer" },
  { value: "fun-emoji", label: "Fun Emoji" },
  { value: "open-peeps", label: "Open Peeps" },
];

function getSelectedAvatar(key: string) {
  return AVATAR_OPTIONS.find((avatar) => avatar.key === key)
    ?? (key.includes(":")
      ? { key, style: key.split(":")[0] as AvatarStyle, seed: key.split(":").slice(1).join(":"),
          name: "Your avatar" }
      : { key, style: "adventurer" as AvatarStyle, seed: key || "student", name: "Your avatar" });
}

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
  const [avatarFilter, setAvatarFilter] = useState<"all" | AvatarStyle>("all");

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

  const selectedAvatar = getSelectedAvatar(user.avatarKey);
  const visibleAvatars = avatarFilter === "all"
    ? AVATAR_OPTIONS
    : AVATAR_OPTIONS.filter((avatar) => avatar.style === avatarFilter);

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
        <Card className="md:col-span-1 border-primary/20 shadow-sm overflow-hidden">
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-primary/10 p-2 text-primary">
                <Palette className="h-4 w-4" />
              </div>
              <div>
                <CardTitle className="text-lg">Your avatar</CardTitle>
                <CardDescription>Choose how you appear on the platform.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex flex-col items-center rounded-2xl bg-gradient-to-br from-primary/10 via-background to-accent/20 px-4 py-5">
              <div className="h-32 w-32 overflow-hidden rounded-full border-4 border-background bg-white shadow-lg ring-1 ring-primary/20">
                <img
                  src={getStudentAvatarUrl(selectedAvatar.key, 256)}
                  alt={`${selectedAvatar.name} avatar`}
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="mt-3 flex items-center gap-1.5 text-sm font-semibold">
                <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                {selectedAvatar.name}
              </div>
              <p className="mt-1 text-center text-xs text-muted-foreground">
                This is how you’ll appear to classmates.
              </p>
            </div>
            
            <div className="w-full">
              <div className="mb-3 flex items-center justify-between">
                <h4 className="text-sm font-semibold">Choose an avatar</h4>
                <span className="text-[11px] text-muted-foreground">{AVATAR_OPTIONS.length} options</span>
              </div>
              <div className="mb-4 flex gap-1 rounded-lg bg-muted/60 p-1">
                {AVATAR_FILTERS.map((filter) => (
                  <button
                    key={filter.value}
                    type="button"
                    onClick={() => setAvatarFilter(filter.value)}
                    className={`flex-1 rounded-md px-2 py-1.5 text-[10px] font-medium transition-colors ${
                      avatarFilter === filter.value
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-2.5">
                {visibleAvatars.map((avatar) => (
                  <button
                    key={avatar.key}
                    type="button"
                    aria-label={`Choose ${avatar.name} avatar`}
                    aria-pressed={user.avatarKey === avatar.key}
                    onClick={() => handleAvatarSelect(avatar.key)}
                    className={`group relative aspect-square overflow-hidden rounded-xl border-2 bg-muted/40 transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md ${
                      user.avatarKey === avatar.key
                        ? "border-primary bg-primary/10 shadow-md ring-2 ring-primary/20"
                        : "border-transparent"
                    }`}
                  >
                    <img
                      src={getStudentAvatarUrl(avatar.key)}
                      alt=""
                      className="h-full w-full object-cover transition-transform group-hover:scale-105"
                    />
                    {user.avatarKey === avatar.key && (
                      <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow">
                        <Check className="h-3 w-3" />
                      </span>
                    )}
                  </button>
                ))}
              </div>
              <p className="mt-3 text-center text-[11px] text-muted-foreground">
                Your choice is saved automatically.
              </p>
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
