import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { AdminNav } from "@/components/admin/admin-nav";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Plus, Users, LayoutGrid, Calendar, ArrowRight } from "lucide-react";
import { apiErrorMessage } from "@/lib/api-error";

export default function AdminClasses() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [newClassName, setNewClassName] = useState("");

  const { data: admin, isLoading: adminLoading } = useQuery<any>({
    queryKey: ["/api/admin/me"],
  });

  const { data: classes, isLoading } = useQuery<any[]>({
    queryKey: ["/api/admin/classes/overview"],
  });

  const createClass = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/classes", { name: newClassName });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/classes/overview"] });
      setShowCreate(false);
      setNewClassName("");
      toast({ title: "Class Created" });
    },
    onError: (e: any) => {
      toast({ title: "Error", description: apiErrorMessage(e), variant: "destructive" });
    }
  });

  useEffect(() => {
    if (!adminLoading && !admin) setLocation("/");
  }, [adminLoading, admin, setLocation]);

  if (adminLoading) return <div className="min-h-screen bg-background" />;
  if (!admin) return null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-primary/3">
      <AdminNav admin={admin} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <LayoutGrid className="w-6 h-6 text-primary" />
              Classes
            </h1>
            <p className="text-muted-foreground text-sm mt-1">Manage your institution's classes and their members.</p>
          </div>
          
          <Dialog open={showCreate} onOpenChange={setShowCreate}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Create Class
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Class</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label>Class Name</Label>
                  <Input 
                    placeholder="e.g. MS1 2024" 
                    value={newClassName}
                    onChange={(e) => setNewClassName(e.target.value)}
                  />
                </div>
                <Button 
                  className="w-full" 
                  onClick={() => createClass.mutate()} 
                  disabled={!newClassName || createClass.isPending}
                >
                  {createClass.isPending ? "Creating..." : "Create Class"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-40 rounded-xl" />)}
          </div>
        ) : !classes?.length ? (
          <Card className="border-dashed shadow-none">
            <CardContent className="py-16 text-center">
              <LayoutGrid className="w-10 h-10 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No Classes Yet</h3>
              <p className="text-sm text-muted-foreground mb-4 max-w-sm mx-auto">Create a class to start organizing your students and exams.</p>
              <Button onClick={() => setShowCreate(true)} variant="outline">
                <Plus className="w-4 h-4 mr-2" />Create First Class
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {classes.map((cls) => (
              <Card key={cls.id} className="hover:shadow-md transition-shadow group">
                <CardHeader className="pb-3 border-b border-border/50 bg-muted/20">
                  <div className="flex justify-between items-start">
                    <h3 className="font-semibold text-lg line-clamp-1" title={cls.name}>{cls.name}</h3>
                    <Badge variant="secondary" className="font-normal tabular-nums gap-1 shrink-0">
                      <Users className="w-3 h-3" />
                      {cls.memberCount || 0}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="pt-4 flex flex-col gap-4">
                  <div className="flex items-start gap-3 text-sm">
                    <Calendar className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-muted-foreground text-xs uppercase tracking-wider mb-0.5">Next Exam</p>
                      {cls.nextExam ? (
                        <div>
                          <p className="font-medium line-clamp-1">{cls.nextExam.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(cls.nextExam.opensAt).toLocaleDateString()}
                          </p>
                        </div>
                      ) : (
                        <p className="text-muted-foreground italic">None scheduled</p>
                      )}
                    </div>
                  </div>
                  
                  <Link href={`/admin/classes/${cls.id}`}>
                    <Button variant="outline" className="w-full justify-between group-hover:bg-primary group-hover:text-primary-foreground group-hover:border-primary transition-colors">
                      Manage Class
                      <ArrowRight className="w-4 h-4" />
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
