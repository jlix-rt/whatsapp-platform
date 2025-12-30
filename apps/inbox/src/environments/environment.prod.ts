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
  apiUrl: '/'
  // Alternativa si el backend está directamente accesible:
  // apiUrl: 'http://localhost:3333/api'
};

