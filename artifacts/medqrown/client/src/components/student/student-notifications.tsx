import { useState } from "react";
import { useStudentNotifications } from "@/hooks/use-student";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Bell, Info, CheckCircle, AlertTriangle, CheckCheck } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export function StudentNotifications() {
  const { data: notifications, isLoading } = useStudentNotifications();
  
  const { data: unreadData } = useQuery<{ count: number }>({
    queryKey: ["/api/student/notifications/unread-count"]
  });
  
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const markRead = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("PATCH", `/api/student/notifications/${id}/read`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/student/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/student/notifications/unread-count"] });
    }
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/student/notifications/read-all`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/student/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/student/notifications/unread-count"] });
    }
  });

  const unreadCount = unreadData?.count || 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-10 w-10">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-destructive border-2 border-background" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="flex items-center gap-2">
            <h4 className="font-semibold text-sm">Notifications</h4>
            {unreadCount > 0 && <Badge variant="secondary" className="text-[10px]">{unreadCount} unread</Badge>}
          </div>
          {unreadCount > 0 && (
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-auto p-1 text-xs text-primary"
              onClick={() => markAllRead.mutate()}
              disabled={markAllRead.isPending}
            >
              <CheckCheck className="w-4 h-4 mr-1" /> Mark all read
            </Button>
          )}
        </div>
        <ScrollArea className="h-[300px]">
          {isLoading ? (
            <div className="p-4 space-y-4">
              {[1,2,3].map(i => (
                <div key={i} className="flex gap-3">
                  <div className="h-8 w-8 rounded-full bg-muted animate-pulse" />
                  <div className="space-y-2 flex-1">
                    <div className="h-4 w-full bg-muted animate-pulse rounded" />
                    <div className="h-3 w-2/3 bg-muted animate-pulse rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : !notifications || notifications.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground flex flex-col items-center">
              <Bell className="h-8 w-8 text-muted-foreground/30 mb-2" />
              <p className="text-sm">No notifications yet.</p>
            </div>
          ) : (
            <div className="divide-y">
              {notifications.map(notif => (
                <div 
                  key={notif.id} 
                  className={`p-4 flex gap-3 group transition-colors ${!notif.readAt ? "bg-primary/5 hover:bg-primary/10 cursor-pointer" : "hover:bg-muted/50 cursor-pointer"}`}
                  onClick={() => {
                    if (!notif.readAt) markRead.mutate(notif.id);
                  }}
                >
                  <div className="shrink-0 mt-0.5">
                    {notif.type === "success" ? <CheckCircle className="h-5 w-5 text-green-500" /> :
                     notif.type === "warning" ? <AlertTriangle className="h-5 w-5 text-yellow-500" /> :
                     <Info className="h-5 w-5 text-blue-500" />}
                  </div>
                  <div className="flex-1 space-y-1">
                    <div className="flex justify-between items-start gap-2">
                      <p className={`text-sm leading-tight ${!notif.readAt ? "font-semibold" : "font-medium"}`}>{notif.title}</p>
                      {!notif.readAt && (
                        <div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-1" />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground leading-snug">{notif.body}</p>
                    <p className="text-[10px] text-muted-foreground/70 pt-1">
                      {new Date(notif.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
