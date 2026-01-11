# Notificaciones Push Web

Este documento explica cómo configurar y usar las notificaciones push web para alertar cuando los clientes envían mensajes en modo BOT.

## Requisitos Previos

1. **HTTPS**: Las notificaciones push solo funcionan en sitios HTTPS (o localhost para desarrollo)
2. **Service Worker**: Ya está configurado en `apps/inbox/src/sw.js`
3. **Claves VAPID**: Necesitas generar claves VAPID públicas y privadas

## Configuración

### 1. Generar Claves VAPID

Ejecuta el script para generar las claves:

```bash
cd apps/api
node scripts/generate-vapid-keys.js
```

Esto generará:
- `VAPID_PUBLIC_KEY`: Clave pública (se usa en el frontend)
- `VAPID_PRIVATE_KEY`: Clave privada (solo en el backend)

### 2. Configurar Variables de Entorno

Agrega estas variables a `apps/api/.env`:

```env
VAPID_PUBLIC_KEY=tu_clave_publica_aqui
VAPID_PRIVATE_KEY=tu_clave_privada_aqui
VAPID_EMAIL=mailto:tu-email@ejemplo.com
```

### 3. Configurar Frontend

Actualiza las claves VAPID en los archivos de environment:

**`apps/inbox/src/environments/environment.ts`**:
```typescript
export const environment = {
  production: false,
  apiUrl: 'http://localhost:3333',
  messagesLimit: 50,
  vapidPublicKey: 'TU_CLAVE_PUBLICA_VAPID_AQUI'
};
```

**`apps/inbox/src/environments/environment.prod.ts`**:
```typescript
export const environment = {
  production: true,
  apiUrl: '',
  messagesLimit: 50,
  vapidPublicKey: 'TU_CLAVE_PUBLICA_VAPID_AQUI'
};
```

### 4. Migrar Base de Datos

La tabla `push_subscriptions` se crea automáticamente cuando se ejecuta el servidor por primera vez (a través de `schema.sql`).

Si necesitas crearla manualmente:

```sql
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id SERIAL PRIMARY KEY,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_endpoint ON push_subscriptions(endpoint);
```

## Funcionamiento

### Flujo de Suscripción

1. Cuando la aplicación Angular se carga, `PushNotificationService` se inicializa automáticamente
2. Solicita permisos al usuario para mostrar notificaciones
3. Si el usuario acepta, se crea una suscripción push
4. La suscripción se envía al backend y se guarda en la base de datos

### Flujo de Notificación

1. Un cliente envía un mensaje a WhatsApp
2. El webhook recibe el mensaje en `apps/api/src/flows/crunchypaws.flow.ts` o `dkape.flow.ts`
3. Si la conversación está en modo `BOT`, se envía una notificación push
4. El Service Worker recibe la notificación y la muestra al usuario
5. Al hacer clic en la notificación, se abre la aplicación

## Endpoints API

### POST /api/push/subscribe
Guarda una suscripción push.

**Body**:
```json
{
  "subscription": {
    "endpoint": "https://fcm.googleapis.com/...",
    "keys": {
      "p256dh": "...",
      "auth": "..."
    }
  }
}
```

### POST /api/push/unsubscribe
Elimina una suscripción push.

**Body**:
```json
{
  "endpoint": "https://fcm.googleapis.com/..."
}
```

## Testing

### Desarrollo Local

1. Asegúrate de que el servidor esté corriendo en HTTPS o localhost
2. Abre la aplicación en el navegador
3. Acepta los permisos de notificación cuando se soliciten
4. Envía un mensaje de prueba desde WhatsApp a un número en modo BOT
5. Deberías recibir una notificación push

### Verificar Suscripciones

Puedes verificar las suscripciones guardadas en la base de datos:

```sql
SELECT * FROM push_subscriptions;
```

## Troubleshooting

### Las notificaciones no aparecen

1. Verifica que las claves VAPID estén configuradas correctamente
2. Asegúrate de que el Service Worker esté registrado (verifica en DevTools > Application > Service Workers)
3. Verifica que el usuario haya aceptado los permisos de notificación
4. Revisa la consola del navegador para errores

### Error: "VAPID keys no configuradas"

- Verifica que `VAPID_PUBLIC_KEY` y `VAPID_PRIVATE_KEY` estén en `.env`
- Reinicia el servidor después de agregar las variables

### Error: "Push messaging no está soportado"

- Las notificaciones push solo funcionan en navegadores modernos
- Asegúrate de usar HTTPS en producción (o localhost para desarrollo)

## Notas Importantes

- Las notificaciones solo se envían cuando la conversación está en modo `BOT`
- Si una suscripción es inválida (410 Gone), se elimina automáticamente
- Las notificaciones incluyen información del mensaje y un enlace para abrir la conversación
- El Service Worker maneja las notificaciones incluso cuando la aplicación está cerrada
