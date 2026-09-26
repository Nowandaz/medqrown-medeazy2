import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Bell, X, Share, PlusSquare } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function PushSubscriptionPrompt() {
  const [showPrompt, setShowPrompt] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(true);

  const { data: config } = useQuery<{ enabled: boolean; publicKey: string | null }>({
    queryKey: ["/api/student/push/config"],
    staleTime: Infinity,
  });

  const subscribeMutation = useMutation({
    mutationFn: async (subscription: PushSubscriptionJSON) => {
      await apiRequest("PUT", "/api/student/push/subscription", { subscription });
    }
  });

  useEffect(() => {
    if (!config?.enabled || !config.publicKey || dismissed) return;

    const checkIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    const checkStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone;
    
    setIsIOS(checkIOS);
    setIsStandalone(checkStandalone);

    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

    if (Notification.permission === 'granted') {
      // Silently subscribe if already granted
      navigator.serviceWorker.ready.then(async (registration) => {
        try {
          let subscription = await registration.pushManager.getSubscription();
          if (!subscription) {
            subscription = await registration.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: urlBase64ToUint8Array(config.publicKey!)
            });
          }
          subscribeMutation.mutate(subscription.toJSON());
        } catch (e) {
          console.error("Silent push subscription failed", e);
        }
      });
    } else if (Notification.permission === 'default') {
      // Show friendly prompt
      setShowPrompt(true);
    }
  }, [config, dismissed]);

  const handleEnablePush = async () => {
    if (!config?.publicKey) return;
    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(config.publicKey)
        });
        subscribeMutation.mutate(subscription.toJSON());
        setShowPrompt(false);
      } else {
        setDismissed(true);
      }
    } catch (e) {
      console.error("Push subscription failed", e);
      setDismissed(true);
    }
  };

  if (!showPrompt || dismissed) return null;

  return (
    <Card className="mb-6 border-primary/20 bg-primary/5">
      <CardContent className="p-4 flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/20 shrink-0">
          <Bell className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-sm">Stay Updated</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Enable notifications to get instant alerts for exam results, upcoming live rooms, and class announcements.
          </p>
          {isIOS && !isStandalone && (
            <p className="text-xs text-primary/80 font-medium mt-2 flex items-center gap-1">
              On iPhone? Tap <Share className="w-3 h-3" /> Share then <PlusSquare className="w-3 h-3" /> "Add to Home Screen" first.
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 mt-2 sm:mt-0 w-full sm:w-auto">
          <Button variant="ghost" size="sm" onClick={() => setDismissed(true)} className="flex-1 sm:flex-none">Not Now</Button>
          <Button size="sm" onClick={handleEnablePush} className="flex-1 sm:flex-none">Enable</Button>
        </div>
      </CardContent>
    </Card>
  );
}
