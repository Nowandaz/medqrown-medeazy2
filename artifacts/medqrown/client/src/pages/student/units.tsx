import { useStudentUnits, useEnrolUnit } from "@/hooks/use-student";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { BookOpen, CheckCircle2, ChevronRight, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

export default function StudentUnits() {
  const { data: units, isLoading } = useStudentUnits();
  const enrolMutation = useEnrolUnit();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");

  const filteredUnits = useMemo(() => {
    if (!units) return [];
    return units.filter(
      (unit) =>
        unit.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        unit.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [units, searchQuery]);

  const handleEnrol = (id: string, code: string) => {
    enrolMutation.mutate(id, {
      onSuccess: () => {
        toast({
          title: "Enrolled Successfully",
          description: `You have been enrolled in ${code}.`,
        });
      },
      onError: (error) => {
        toast({
          title: "Enrolment Failed",
          description: error instanceof Error ? error.message : "An unexpected error occurred.",
          variant: "destructive",
        });
      }
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-8">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-64 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Units</h1>
          <p className="text-muted-foreground mt-2">
            Browse and enrol in available medical units to access their exams.
          </p>
        </div>
        <div className="relative w-full md:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search units..." 
            className="pl-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {!filteredUnits.length ? (
        <div className="flex h-64 flex-col items-center justify-center rounded-xl border border-dashed bg-card/50 text-center">
          <BookOpen className="h-10 w-10 text-muted-foreground/30 mb-4" />
          <h3 className="text-lg font-semibold">No units found</h3>
          <p className="text-sm text-muted-foreground max-w-sm mt-1">
            {searchQuery ? "Try adjusting your search criteria." : "There are currently no units available for enrolment."}
          </p>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filteredUnits.map((unit) => (
            <Card key={unit.id} className="flex flex-col overflow-hidden">
              <CardHeader className="pb-4">
                <div className="flex justify-between items-start gap-4">
                  <div className="space-y-1">
                    <Badge variant={unit.enrolled ? "default" : "secondary"} className="mb-2">
                      {unit.code}
                    </Badge>
                    <CardTitle className="text-lg leading-tight line-clamp-2">
                      {unit.name}
                    </CardTitle>
                  </div>
                  {unit.enrolled && (
                    <div className="flex items-center text-primary bg-primary/10 rounded-full px-2 py-1 text-xs font-medium shrink-0">
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      Enrolled
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent className="flex-1">
                <CardDescription className="line-clamp-3 text-sm">
                  {unit.description || "No description provided for this unit."}
                </CardDescription>
                
                {unit.enrolled && (
                  <div className="mt-6 flex gap-4 text-sm text-muted-foreground">
                    <div className="flex flex-col">
                      <span className="font-semibold text-foreground">{unit.activeExamCount}</span>
                      <span className="text-xs">Exams</span>
                    </div>
                    <div className="w-px bg-border" />
                    <div className="flex flex-col">
                      <span className="font-semibold text-foreground">{unit.completedAttempts}</span>
                      <span className="text-xs">Attempts</span>
                    </div>
                  </div>
                )}
              </CardContent>
              <CardFooter className="pt-4 border-t bg-muted/20">
                {unit.enrolled ? (
                  <Link href={`/student/units/${unit.id}`} className="w-full">
                    <Button variant="secondary" className="w-full group">
                      View Unit
                      <ChevronRight className="w-4 h-4 ml-1 transition-transform group-hover:translate-x-1" />
                    </Button>
                  </Link>
                ) : (
                  <Button 
                    className="w-full" 
                    onClick={() => handleEnrol(unit.id, unit.code)}
                    disabled={enrolMutation.isPending || !unit.isActive}
                  >
                    {enrolMutation.isPending ? "Enrolling..." : "Enrol Now"}
                  </Button>
                )}
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
