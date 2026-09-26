import { useState } from "react";
import { Eye, EyeOff, Check, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const MIN_PASSWORD_LENGTH = 8;

export function passwordsValid(password: string, confirm: string) {
  return password.length >= MIN_PASSWORD_LENGTH && password === confirm;
}

function PasswordInput({ id, value, onChange, placeholder, onEnter }: {
  id: string; value: string; onChange: (v: string) => void; placeholder: string; onEnter?: () => void;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={visible ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="new-password"
        className="pr-10"
        onKeyDown={(e) => { if (e.key === "Enter") onEnter?.(); }}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-muted-foreground hover:text-foreground"
        aria-label={visible ? "Hide password" : "Show password"}
      >
        {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
}

function Hint({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <p className={`flex items-center gap-1.5 text-xs ${ok ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}`}>
      {ok ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />} {children}
    </p>
  );
}

/** New password + confirm, with show/hide toggles, a length check and a live match indicator. */
export function PasswordFields({ password, confirm, onPasswordChange, onConfirmChange, onSubmit, label = "New password" }: {
  password: string; confirm: string;
  onPasswordChange: (v: string) => void; onConfirmChange: (v: string) => void;
  onSubmit?: () => void; label?: string;
}) {
  const longEnough = password.length >= MIN_PASSWORD_LENGTH;
  const matches = confirm.length > 0 && password === confirm;
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="new-password">{label}</Label>
        <PasswordInput id="new-password" value={password} onChange={onPasswordChange} placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`} />
        {password.length > 0 && <Hint ok={longEnough}>At least {MIN_PASSWORD_LENGTH} characters</Hint>}
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirm-password">Confirm password</Label>
        <PasswordInput id="confirm-password" value={confirm} onChange={onConfirmChange} placeholder="Type it again"
          onEnter={() => { if (passwordsValid(password, confirm)) onSubmit?.(); }} />
        {confirm.length > 0 && <Hint ok={matches}>{matches ? "Passwords match" : "Passwords don't match yet"}</Hint>}
      </div>
    </div>
  );
}
