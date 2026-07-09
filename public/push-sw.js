// Dedicated Web Push service worker for Maison Caviar.
// Handles incoming push messages and notification clicks. This worker is
// separate from the offline app-shell worker (/sw.js) and is registered with
// its own narrow scope so the two never conflict.

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: "Maison Caviar", body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "Maison Caviar";
  const options = {
    body: data.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: { url: data.url || "/cockpit" },
    tag: data.tag || undefined,
    renotify: !!data.tag,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/cockpit";

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of allClients) {
        try {
          const url = new URL(client.url);
          if (url.pathname === targetUrl || url.pathname.startsWith(targetUrl)) {
            return client.focus();
          }
        } catch (e) {
          // ignore
        }
      }
      // Focus any open window and navigate, or open a new one.
      if (allClients.length > 0) {
        const client = allClients[0];
        await client.focus();
        if ("navigate" in client) {
          try {
            return await client.navigate(targetUrl);
          } catch (e) {
            // fall through to openWindow
          }
        }
      }
      return self.clients.openWindow(targetUrl);
    })(),
  );
});
