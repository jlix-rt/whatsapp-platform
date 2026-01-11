/**
 * Script para probar el envío de notificaciones push
 * 
 * Ejecutar: node scripts/test-push-notification.js
 */

require('dotenv').config();
const { pool } = require('../dist/db/pool');
const webpush = require('web-push');

async function testPushNotification() {
  console.log('🧪 Probando notificaciones push...\n');

  // Verificar configuración VAPID
  const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
  const vapidEmail = process.env.VAPID_EMAIL || 'mailto:admin@tiendasgt.com';

  if (!vapidPublicKey || !vapidPrivateKey) {
    console.error('❌ Error: VAPID keys no configuradas en .env');
    console.error('   Ejecuta: node scripts/generate-vapid-keys.js');
    process.exit(1);
  }

  console.log('✅ VAPID keys configuradas');
  console.log('   Public Key:', vapidPublicKey.substring(0, 20) + '...');
  console.log('   Email:', vapidEmail);
  console.log('');

  // Configurar web-push
  webpush.setVapidDetails(vapidEmail, vapidPublicKey, vapidPrivateKey);

  // Obtener suscripciones de la base de datos
  try {
    const result = await pool.query('SELECT endpoint, p256dh, auth FROM push_subscriptions');
    
    if (result.rows.length === 0) {
      console.log('⚠️  No hay suscripciones guardadas en la base de datos');
      console.log('   Abre la aplicación en el navegador y acepta los permisos de notificación');
      process.exit(0);
    }

    console.log(`📱 Encontradas ${result.rows.length} suscripción(es):\n`);

    for (const row of result.rows) {
      console.log(`   Endpoint: ${row.endpoint.substring(0, 50)}...`);
      
      const subscription = {
        endpoint: row.endpoint,
        keys: {
          p256dh: row.p256dh,
          auth: row.auth
        }
      };

      const payload = JSON.stringify({
        title: '🧪 Prueba de notificación',
        body: 'Si ves esta notificación, las notificaciones push están funcionando correctamente!',
        data: {
          conversationId: 0,
          phoneNumber: '+50200000000',
          url: '/inbox'
        },
        tag: 'test-notification',
        requireInteraction: true
      });

      try {
        await webpush.sendNotification(subscription, payload);
        console.log('   ✅ Notificación enviada exitosamente\n');
      } catch (error) {
        if (error.statusCode === 410) {
          console.log('   ⚠️  Suscripción expirada (410 Gone) - será eliminada');
          await pool.query('DELETE FROM push_subscriptions WHERE endpoint = $1', [row.endpoint]);
        } else {
          console.log(`   ❌ Error enviando notificación: ${error.message}\n`);
        }
      }
    }

    console.log('✅ Prueba completada');
    console.log('   Revisa tu sistema operativo para ver las notificaciones');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await pool.end();
  }
}

testPushNotification();
