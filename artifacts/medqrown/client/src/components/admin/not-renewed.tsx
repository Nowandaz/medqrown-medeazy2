import { useQuery } from "@tanstack/react-query";
import { Phone, Download } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cohortName, formatCalendarDate } from "@/lib/datetime";

type Row = {
  id: number; name: string; email: string; phone: string | null; status: string;
  membershipEndDate: string | null; latestPlan: string | null;
  cohort: { startDate: string; endDate: string } | null;
  classes: { id: number; name: string }[]; pendingPayment: boolean;
};
type Data = { current: any; next: any; lapsed: Row[]; due: Row[] };

const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86400000);
const today = () => new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10);

function downloadCsv(name: string, rows: Row[]) {
  const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [["Name", "Email", "Phone", "Status", "Membership end", "Last cohort", "Classes", "Payment pending"].map(cell).join(",")]
    .concat(rows.map((r) => [r.name, r.email, r.phone, r.status, r.membershipEndDate, r.cohort ? cohortName(r.cohort) : "",
      r.classes?.map((c) => c.name).join("; "), r.pendingPayment ? "yes" : "no"].map(cell).join(",")));
  const url = URL.createObjectURL(new Blob([lines.join("\r\n")], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url; a.download = `${name}-${today()}.csv`; a.click();
  URL.revokeObjectURL(url);
}

function Section({ title, description, rows, empty, kind }: { title: string; description: string; rows: Row[]; empty: string; kind: "lapsed" | "due" }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <h3 className="font-semibold">{title} <span className="text-muted-foreground font-normal">({rows.length})</span></h3>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        {rows.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => downloadCsv(kind === "lapsed" ? "not-renewed" : "renewal-due", rows)}>
            <Download className="w-4 h-4 mr-1" />CSV
          </Button>
        )}
      </CardHeader>
      <CardContent className="p-0 overflow-x-auto">
        {!rows.length ? (
          <p className="px-6 pb-6 text-sm text-muted-foreground">{empty}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Last cohort</TableHead>
                <TableHead>{kind === "lapsed" ? "Ended" : "Ends"}</TableHead>
                <TableHead>Class</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const days = r.membershipEndDate ? daysBetween(today(), r.membershipEndDate) : null;
                return (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div className="font-medium">{r.name}</div>
                      <div className="text-xs text-muted-foreground break-all">{r.email}</div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {r.phone ? <a href={`tel:${r.phone}`} className="inline-flex items-center gap-1 hover:text-primary"><Phone className="w-3 h-3" />{r.phone}</a> : "—"}
                    </TableCell>
                    <TableCell className="text-sm whitespace-nowrap">{r.cohort ? cohortName(r.cohort) : "—"}</TableCell>
                    <TableCell className="text-sm whitespace-nowrap">
                      {formatCalendarDate(r.membershipEndDate)}
                      {days !== null && (
                        <span className="block text-xs text-muted-foreground">
                          {days < 0 ? `${-days} day${days === -1 ? "" : "s"} ago` : days === 0 ? "today" : `in ${days} day${days === 1 ? "" : "s"}`}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">{r.classes?.map((c) => c.name).join(", ") || "—"}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {r.pendingPayment
                        ? <Badge variant="secondary">Payment pending</Badge>
                        : <Badge variant="outline" className="capitalize">{r.status === "grace" ? "In grace" : r.status}</Badge>}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

/** Admin → Students → Not renewed: who is still on a previous cohort, and who is due to renew. */
export function NotRenewed() {
  const { data, isLoading } = useQuery<Data>({ queryKey: ["/api/admin/students/not-renewed"], refetchOnMount: "always" });
  if (isLoading || !data) return <Skeleton className="h-64" />;
  const lapsedUnpaid = data.lapsed.filter((r) => !r.pendingPayment).length;
  return (
    <div className="space-y-6">
      <Section
        kind="lapsed"
        title="Didn't renew"
        description={`Their membership has ended and they haven't paid or been confirmed for ${data.current ? cohortName(data.current) : "the current cohort"}. ${lapsedUnpaid} have nothing pending.`}
        rows={data.lapsed}
        empty="Everyone whose membership ended has renewed."
      />
      <Section
        kind="due"
        title="Renewal due"
        description={`Active, but their membership ends with the current cohort and they haven't paid for ${data.next ? cohortName(data.next) : "the next cohort"} yet.`}
        rows={data.due}
        empty="Nobody is due — everyone active has already renewed."
      />
    </div>
  );
}
