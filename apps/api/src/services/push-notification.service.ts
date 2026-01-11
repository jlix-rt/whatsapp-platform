import * as webpush from 'web-push';
import { pool } from '../db/pool';

export interface PushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

/**
 * Inicializa web-push con las claves VAPID
 */
export function initializePushNotifications(): void {
  const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
  let vapidEmail = process.env.VAPID_EMAIL || 'mailto:admin@tiendasgt.com';

  if (!vapidPublicKey || !vapidPrivateKey) {
    console.warn('⚠️  VAPID keys no configuradas. Las notificaciones push no funcionarán.');
    console.warn('   Configura VAPID_PUBLIC_KEY y VAPID_PRIVATE_KEY en .env');
    return;
  }

  // Asegurar que el email tenga el prefijo mailto: si no lo tiene
  if (!vapidEmail.startsWith('mailto:')) {
    vapidEmail = `mailto:${vapidEmail}`;
  }

  try {
    webpush.setVapidDetails(
      vapidEmail,
      vapidPublicKey,
      vapidPrivateKey
    );
    console.log('✅ Notificaciones push inicializadas correctamente');
  } catch (error: any) {
    console.error('❌ Error inicializando notificaciones push:', error.message);
    console.error('   Verifica que VAPID_EMAIL tenga el formato correcto: mailto:email@ejemplo.com');
    throw error;
  }
}

/**
 * Guarda una suscripción push en la base de datos
 */
export async function savePushSubscription(subscription: PushSubscription): Promise<void> {
  const query = `
    INSERT INTO push_subscriptions (endpoint, p256dh, auth)
    VALUES ($1, $2, $3)
    ON CONFLICT (endpoint) 
    DO UPDATE SET 
      p256dh = EXCLUDED.p256dh,
      auth = EXCLUDED.auth,
      updated_at = CURRENT_TIMESTAMP
  `;

  await pool.query(query, [
    subscription.endpoint,
    subscription.keys.p256dh,
    subscription.keys.auth
  ]);
}

/**
 * Elimina una suscripción push de la base de datos
 */
export async function deletePushSubscription(endpoint: string): Promise<void> {
  const query = 'DELETE FROM push_subscriptions WHERE endpoint = $1';
  await pool.query(query, [endpoint]);
}

/**
 * Obtiene todas las suscripciones push activas
 */
export async function getAllPushSubscriptions(): Promise<PushSubscription[]> {
  const query = 'SELECT endpoint, p256dh, auth FROM push_subscriptions';
  const result = await pool.query(query);
  
  return result.rows.map(row => ({
    endpoint: row.endpoint,
    keys: {
      p256dh: row.p256dh,
      auth: row.auth
    }
  }));
}

/**
 * Envía una notificación push a todas las suscripciones activas
 */
export async function sendPushNotification(
  title: string,
  body: string,
  data?: any
): Promise<void> {
  const subscriptions = await getAllPushSubscriptions();

  if (subscriptions.length === 0) {
    console.warn('⚠️  No hay suscripciones activas para enviar notificaciones');
    return;
  }

  console.log(`📤 Enviando notificación push a ${subscriptions.length} suscripción(es)`);

  const payload = JSON.stringify({
    title,
    body,
    data: data || {},
    tag: 'whatsapp-message',
    requireInteraction: true
  });

  const results = await Promise.allSettled(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(subscription, payload);
        console.log(`✅ Notificación enviada exitosamente a: ${subscription.endpoint.substring(0, 50)}...`);
        return { success: true, endpoint: subscription.endpoint };
      } catch (error: any) {
        // Si la suscripción es inválida (410 Gone), eliminarla
        if (error.statusCode === 410) {
          console.log(`⚠️  Suscripción expirada (410 Gone), eliminando: ${subscription.endpoint.substring(0, 50)}...`);
          await deletePushSubscription(subscription.endpoint);
        } else {
          console.error(`❌ Error enviando notificación push a ${subscription.endpoint.substring(0, 50)}...:`, error.message);
          if (error.statusCode) {
            console.error(`   Status Code: ${error.statusCode}`);
          }
        }
        return { success: false, endpoint: subscription.endpoint, error: error.message };
      }
    })
  );

  const successful = results.filter(r => r.status === 'fulfilled' && r.value?.success).length;
  const failed = results.length - successful;

  console.log(`📊 Resumen: ${successful} exitosas, ${failed} fallidas de ${subscriptions.length} total`);
}

/**
 * Envía una notificación cuando llega un mensaje en modo BOT
 */
export async function notifyBotMessage(
  conversationId: number,
  phoneNumber: string,
  messageBody: string,
  storeName?: string
): Promise<void> {
  const title = storeName 
    ? `Nuevo mensaje en ${storeName}`
    : 'Nuevo mensaje de WhatsApp';
  
  const body = `De: ${phoneNumber}\n${messageBody.substring(0, 100)}${messageBody.length > 100 ? '...' : ''}`;

  await sendPushNotification(title, body, {
    conversationId,
    phoneNumber,
    url: `/inbox?conversation=${conversationId}`
  });
}
