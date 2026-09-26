import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useRenewalStatus, usePaymentDetails, useSubmitRenewal } from "@/hooks/use-student";
import { Copy, CheckCircle, Loader2, Users, User } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiErrorMessage } from "@/lib/api-error";

const ksh = (value: number | undefined) => `KSh ${Number(value ?? 0).toLocaleString("en-KE")}`;

function CopyField({ label, value, id, copied, onCopy }: { label: string; value: string; id: string; copied: string | null; onCopy: (v: string, id: string) => void }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg bg-muted p-3">
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="font-mono font-semibold text-base break-all">{value}</p>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={() => onCopy(value, id)} className="shrink-0">
        {copied === id ? <><CheckCircle className="h-4 w-4 mr-1 text-green-600" />Copied</> : <><Copy className="h-4 w-4 mr-1" />Copy</>}
      </Button>
    </div>
  );
}

/** Renew membership (master prompt §5.2): payment details, plan choice and the M-Pesa code. */
export function RenewMembershipDialog({ trigger }: { trigger?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [plan, setPlan] = useState<"Individual" | "Group">("Individual");
  const queryClient = useQueryClient();

  const { data: status, isLoading: statusLoading } = useRenewalStatus();
  const { data: details, isLoading: detailsLoading } = usePaymentDetails();
  const submitRenewal = useSubmitRenewal();
  const { toast } = useToast();

  const handleCopy = async (text: string, field: string) => {
    try { await navigator.clipboard.writeText(text); } catch { /* clipboard blocked: the value is still visible */ }
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const normalizedCode = code.replace(/\s+/g, "").toUpperCase();
  const codeValid = /^[A-Z0-9]{10}$/.test(normalizedCode);

  const handleSubmit = () => {
    submitRenewal.mutate({ code: normalizedCode, plan }, {
      onSuccess: () => {
        toast({ title: "Payment submitted", description: "We'll verify it shortly and let you know by email." });
        for (const key of ["/api/student/dashboard", "/api/student/profile", "/api/student/membership"]) {
          queryClient.invalidateQueries({ queryKey: [key] });
        }
        setOpen(false);
        setCode("");
      },
      onError: (e) => toast({ title: "Couldn't submit your code", description: apiErrorMessage(e), variant: "destructive" }),
    });
  };

  if (statusLoading || !status?.available) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || <Button variant="default" className="w-full">Renew membership</Button>}
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Renew membership</DialogTitle>
          <DialogDescription>Pay via M-Pesa, then enter your transaction code below.</DialogDescription>
        </DialogHeader>

        {detailsLoading ? (
          <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : !details ? (
          <p className="text-center p-4 text-destructive text-sm">We couldn't load the payment details. Please refresh and try again.</p>
        ) : (
          <div className="space-y-5">
            <div className="space-y-2">
              <p className="text-sm font-medium">1. Pay via M-Pesa (Lipa na M-Pesa → Paybill)</p>
              <CopyField label="Paybill number" value={details.paybill} id="paybill" copied={copiedField} onCopy={handleCopy} />
              <CopyField label="Account number" value={details.accountNumber} id="account" copied={copiedField} onCopy={handleCopy} />
              <p className="text-xs text-muted-foreground">Bank: {details.bankName}. {details.accountNote}</p>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">2. Choose your plan</p>
              <RadioGroup value={plan} onValueChange={(v) => setPlan(v as "Individual" | "Group")} className="grid grid-cols-2 gap-2">
                <label htmlFor="plan-individual" className={`rounded-lg border p-3 cursor-pointer ${plan === "Individual" ? "border-primary bg-primary/5" : ""}`}>
                  <div className="flex items-center gap-2"><RadioGroupItem value="Individual" id="plan-individual" /><User className="w-4 h-4" /><span className="font-medium text-sm">Individual</span></div>
                  <p className="text-xs text-muted-foreground mt-1">{ksh(details.individualPrice)} / month</p>
                </label>
                <label htmlFor="plan-group" className={`rounded-lg border p-3 cursor-pointer ${plan === "Group" ? "border-primary bg-primary/5" : ""}`}>
                  <div className="flex items-center gap-2"><RadioGroupItem value="Group" id="plan-group" /><Users className="w-4 h-4" /><span className="font-medium text-sm">Group of 4</span></div>
                  <p className="text-xs text-muted-foreground mt-1">{ksh(details.groupPrice)} total ({ksh(Math.round(details.groupPrice / 4))} each)</p>
                </label>
              </RadioGroup>
              {plan === "Group" && <p className="text-xs text-muted-foreground bg-muted p-2 rounded">{details.groupInstructions}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="mpesa-code" className="text-sm font-medium">3. Enter your M-Pesa code</Label>
              <Input id="mpesa-code" placeholder="e.g. SJK4ABC123" value={code} maxLength={14} autoCapitalize="characters"
                onChange={(e) => setCode(e.target.value.toUpperCase())} className="font-mono uppercase" />
              <p className={`text-xs ${code && !codeValid ? "text-destructive" : "text-muted-foreground"}`}>
                {code && !codeValid ? "M-Pesa codes are exactly 10 letters and numbers." : "It's the 10-character code at the start of your M-Pesa confirmation SMS."}
              </p>
            </div>

            <Button className="w-full" onClick={handleSubmit} disabled={submitRenewal.isPending || !codeValid}>
              {submitRenewal.isPending ? "Submitting..." : "Submit payment code"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
