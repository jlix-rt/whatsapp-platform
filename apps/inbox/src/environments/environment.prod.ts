/**
 * Environment configuration for production
 * 
 * En producción, el backend está en el mismo dominio pero en el puerto 3333.
 * Como el frontend se sirve desde nginx y el backend está detrás del mismo nginx,
 * podemos usar una URL relativa o el mismo dominio.
 * 
 * Si nginx hace proxy reverso para /api, usar '/api'
 * Si el backend está directamente accesible, usar 'http://localhost:3333/api'
 */
export const environment = {
  production: true,
  // URL relativa - nginx hará proxy reverso a localhost:3333
  // En producción, usar URL relativa para que funcione con cualquier dominio
  apiUrl: '',
  messagesLimit: 50, // Número de mensajes a cargar por vez (puede ser sobrescrito por variable de entorno del backend)
  vapidPublicKey: 'BLEbFJnzVXi-IZ3-Fiz2axpweVENHnX22sral6H1p4rUPX0VfaAjnyNxQ8b-quwgaVhTCus7zVwgawbsxgjlxas' // Reemplazar con tu clave pública VAPID
};

