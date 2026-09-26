self.addEventListener('push', function (event) {
  if (event.data) {
    const data = event.data.json();
    const title = data.title || "New Notification";
    const options = {
      body: data.body,
      icon: '/favicon.png',
      badge: '/favicon.png',
      data: { url: data.url || '/student/dashboard' }
    };
    event.waitUntil(self.registration.showNotification(title, options));
  }
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  if (event.notification.data && event.notification.data.url) {
    event.waitUntil(
      clients.openWindow(event.notification.data.url)
    );
  }
});
