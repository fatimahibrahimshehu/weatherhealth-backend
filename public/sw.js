self.addEventListener("push", (event) => {
  let data = { title: "WeatherHealth Alert", body: "" };
  try {
    data = event.data.json();
  } catch (e) {}

  event.waitUntil(
    self.registration.showNotification(data.title, { body: data.body })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow("/"));
});