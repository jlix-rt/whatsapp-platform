/**
 * Script para generar claves VAPID para notificaciones push
 * 
 * Ejecutar: node scripts/generate-vapid-keys.js
 */

const webpush = require('web-push');

console.log('🔑 Generando claves VAPID para notificaciones push...\n');

const vapidKeys = webpush.generateVAPIDKeys();

console.log('✅ Claves VAPID generadas:\n');
console.log('VAPID_PUBLIC_KEY=' + vapidKeys.publicKey);
console.log('VAPID_PRIVATE_KEY=' + vapidKeys.privateKey);
console.log('\n📝 Agrega estas claves a tu archivo .env:');
console.log('   VAPID_PUBLIC_KEY=' + vapidKeys.publicKey);
console.log('   VAPID_PRIVATE_KEY=' + vapidKeys.privateKey);
console.log('   VAPID_EMAIL=mailto:tu-email@ejemplo.com');
console.log('\n⚠️  IMPORTANTE:');
console.log('   - VAPID_EMAIL DEBE empezar con "mailto:" (ejemplo: mailto:crunchypawsgt@gmail.com)');
console.log('   - La clave pública también debe agregarse en:');
console.log('     apps/inbox/src/environments/environment.ts');
console.log('     apps/inbox/src/environments/environment.prod.ts');
console.log('     Como: vapidPublicKey: \'' + vapidKeys.publicKey + '\'');
