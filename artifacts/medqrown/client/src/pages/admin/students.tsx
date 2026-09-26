import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { AdminNav } from "@/components/admin/admin-nav";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Users, Search, Edit2, Check, X } from "lucide-react";
import { MembersTable } from "@/components/admin/members-table";

export default function AdminStudents() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const { toast } = useToast();

  const { data: admin, isLoading: adminLoading } = useQuery<any>({ queryKey: ["/api/admin/me"] });

  const { data: students, isLoading: studentsLoading } = useQuery<any[]>({
    queryKey: ["/api/admin/students"],
  });

  const { data: requests, isLoading: requestsLoading } = useQuery<any[]>({
    queryKey: ["/api/admin/students/change-requests?status=pending"],
  });

  const handleRequest = useMutation({
    mutationFn: async ({ id, decision }: { id: number, decision: "approved" | "declined" }) => {
      await apiRequest("PATCH", `/api/admin/students/change-requests/${id}`, { decision });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/students/change-requests?status=pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/students"] });
      toast({ title: "Request processed" });
    }
  });

  useEffect(() => {
    if (!adminLoading && !admin) setLocation("/");
  }, [adminLoading, admin, setLocation]);

  if (adminLoading) return <div className="min-h-screen bg-background" />;
  if (!admin) return null;

  const filtered = students?.filter(s => 
    s.name.toLowerCase().includes(search.toLowerCase()) || 
    s.email.toLowerCase().includes(search.toLowerCase())
  ) || [];

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-primary/3">
      <AdminNav admin={admin} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Users className="w-6 h-6 text-primary" />
              Students
            </h1>
            <p className="text-muted-foreground text-sm mt-1">Master database of all enrolled students and identity change requests.</p>
          </div>
        </div>

        <Tabs defaultValue="all" className="space-y-6">
          <TabsList>
            <TabsTrigger value="all" className="gap-2">All Students</TabsTrigger>
            <TabsTrigger value="requests" className="gap-2 relative">
              Change Requests
              {requests?.length ? (
                <span className="ml-1 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold leading-none">
                  {requests.length}
                </span>
              ) : null}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="m-0 space-y-4">
            <Card>
              <CardContent className="p-0">
                <MembersTable />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="requests" className="m-0">
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Student</TableHead>
                      <TableHead>Requested Changes</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {requestsLoading ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-8">
                          <Skeleton className="h-6 w-full" />
                        </TableCell>
                      </TableRow>
                    ) : !requests?.length ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-12 text-muted-foreground">
                          No pending change requests.
                        </TableCell>
                      </TableRow>
                    ) : (
                      requests.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="font-medium">{r.studentName}</TableCell>
                          <TableCell>
                            <div className="space-y-1 text-sm">
                              {r.requestedChanges.name && (
                                <div><span className="text-muted-foreground">Name:</span> {r.requestedChanges.name}</div>
                              )}
                              {r.requestedChanges.email && (
                                <div><span className="text-muted-foreground">Email:</span> {r.requestedChanges.email}</div>
                              )}
                              {r.requestedChanges.phone && (
                                <div><span className="text-muted-foreground">Phone:</span> {r.requestedChanges.phone}</div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {new Date(r.createdAt).toLocaleDateString()}
                          </TableCell>
                          <TableCell className="text-right space-x-2">
                            <Button 
                              variant="outline" 
                              size="sm"
                              className="text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
                              onClick={() => handleRequest.mutate({ id: r.id, decision: "declined" })}
                              disabled={handleRequest.isPending}
                            >
                              <X className="w-4 h-4 mr-1" /> Decline
                            </Button>
                            <Button 
                              size="sm"
                              onClick={() => handleRequest.mutate({ id: r.id, decision: "approved" })}
                              disabled={handleRequest.isPending}
                            >
                              <Check className="w-4 h-4 mr-1" /> Approve
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
