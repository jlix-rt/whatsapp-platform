/**
 * Script para verificar que las VAPID keys coincidan entre frontend y backend
 * 
 * Ejecutar: node scripts/verify-vapid-keys.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');

console.log('🔍 Verificando configuración de VAPID keys...\n');

// Leer VAPID keys del backend
const backendPublicKey = process.env.VAPID_PUBLIC_KEY;
const backendPrivateKey = process.env.VAPID_PRIVATE_KEY;
const backendEmail = process.env.VAPID_EMAIL;

console.log('📦 BACKEND (.env):');
console.log('   VAPID_PUBLIC_KEY:', backendPublicKey ? backendPublicKey.substring(0, 30) + '...' : '❌ NO CONFIGURADA');
console.log('   VAPID_PRIVATE_KEY:', backendPrivateKey ? '✅ Configurada' : '❌ NO CONFIGURADA');
console.log('   VAPID_EMAIL:', backendEmail || '❌ NO CONFIGURADA');
console.log('');

// Leer VAPID keys del frontend
const frontendDevPath = path.join(__dirname, '../../inbox/src/environments/environment.ts');
const frontendProdPath = path.join(__dirname, '../../inbox/src/environments/environment.prod.ts');

let frontendDevKey = null;
let frontendProdKey = null;

try {
  const devContent = fs.readFileSync(frontendDevPath, 'utf8');
  const devMatch = devContent.match(/vapidPublicKey:\s*['"]([^'"]+)['"]/);
  if (devMatch) {
    frontendDevKey = devMatch[1];
  }
} catch (error) {
  console.log('⚠️  No se pudo leer environment.ts');
}

try {
  const prodContent = fs.readFileSync(frontendProdPath, 'utf8');
  const prodMatch = prodContent.match(/vapidPublicKey:\s*['"]([^'"]+)['"]/);
  if (prodMatch) {
    frontendProdKey = prodMatch[1];
  }
} catch (error) {
  console.log('⚠️  No se pudo leer environment.prod.ts');
}

console.log('🌐 FRONTEND:');
console.log('   Development (environment.ts):', frontendDevKey ? frontendDevKey.substring(0, 30) + '...' : '❌ NO CONFIGURADA');
console.log('   Production (environment.prod.ts):', frontendProdKey ? frontendProdKey.substring(0, 30) + '...' : '❌ NO CONFIGURADA');
console.log('');

// Verificar coincidencias
if (backendPublicKey && frontendProdKey) {
  if (backendPublicKey === frontendProdKey) {
    console.log('✅ Las claves públicas coinciden entre backend y frontend (producción)');
  } else {
    console.log('❌ ERROR: Las claves públicas NO coinciden entre backend y frontend (producción)');
    console.log('   Esto causará que las notificaciones no funcionen');
    console.log('');
    console.log('   Backend:', backendPublicKey.substring(0, 50) + '...');
    console.log('   Frontend:', frontendProdKey.substring(0, 50) + '...');
  }
} else {
  console.log('⚠️  No se pueden comparar las claves (faltan configuraciones)');
}

console.log('');
console.log('📝 Verificaciones adicionales:');
if (!backendPublicKey || !backendPrivateKey) {
  console.log('   ❌ Backend: Faltan VAPID keys en .env');
} else {
  console.log('   ✅ Backend: VAPID keys configuradas');
}

if (!frontendProdKey) {
  console.log('   ❌ Frontend: Falta vapidPublicKey en environment.prod.ts');
} else {
  console.log('   ✅ Frontend: vapidPublicKey configurada');
}

if (backendEmail && !backendEmail.startsWith('mailto:')) {
  console.log('   ⚠️  Backend: VAPID_EMAIL debería empezar con "mailto:"');
  console.log('      Actual:', backendEmail);
  console.log('      Debería ser: mailto:' + backendEmail);
} else if (backendEmail) {
  console.log('   ✅ Backend: VAPID_EMAIL tiene formato correcto');
}
