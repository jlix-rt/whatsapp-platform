// Service Worker para notificaciones push
self.addEventListener('push', function(event) {
  const data = event.data ? event.data.json() : {};
  
  const options = {
    body: data.body || 'Nuevo mensaje recibido',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    vibrate: [200, 100, 200],
    tag: data.tag || 'whatsapp-message',
    data: data.data || {},
    requireInteraction: true,
    actions: [
      {
        action: 'open',
        title: 'Abrir conversación'
      },
      {
        action: 'close',
        title: 'Cerrar'
      }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'Nuevo mensaje de WhatsApp', options)
  );
});

// Manejar clics en las notificaciones
self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  if (event.action === 'open') {
    // Abrir la aplicación
    event.waitUntil(
      clients.openWindow(event.notification.data.url || '/')
    );
  }
});

// Manejar notificaciones cerradas
self.addEventListener('notificationclose', function(event) {
  // Opcional: registrar que la notificación fue cerrada
});
