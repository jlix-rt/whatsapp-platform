/**
 * Environment configuration for development
 */
export const environment = {
  production: false,
  apiUrl: 'http://localhost:3333',
  messagesLimit: 50, // Número de mensajes a cargar por vez (puede ser sobrescrito por variable de entorno del backend)
  vapidPublicKey: 'BLEbFJnzVXi-IZ3-Fiz2axpweVENHnX22sral6H1p4rUPX0VfaAjnyNxQ8b-quwgaVhTCus7zVwgawbsxgjlxas' // Reemplazar con tu clave pública VAPID
};

