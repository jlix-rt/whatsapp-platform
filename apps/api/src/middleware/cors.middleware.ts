import { Request, Response, NextFunction } from 'express';

/**
 * Middleware de CORS dinámico y seguro
 * 
 * Permite requests desde:
 * - *.inbox.tiendasgt.com (producción)
 * - *.tiendasgt.com (producción)
 * - http://localhost:4200 (desarrollo)
 * - Requests sin Origin (Twilio / server-to-server)
 * 
 * Bloquea orígenes desconocidos por seguridad.
 */

// Dominios permitidos (whitelist)
const ALLOWED_ORIGINS = [
  /^https?:\/\/.*\.inbox\.tiendasgt\.com$/,
  /^https?:\/\/.*\.tiendasgt\.com$/,
  /^http:\/\/localhost:\d+$/, // Desarrollo local
  /^http:\/\/127\.0\.0\.1:\d+$/, // Desarrollo local
];

/**
 * Verifica si un origen está permitido
 */
function isOriginAllowed(origin: string | undefined): boolean {
  // Si no hay Origin, permitir (Twilio / server-to-server)
  if (!origin) {
    return true;
  }

  // Verificar contra la whitelist
  return ALLOWED_ORIGINS.some(pattern => pattern.test(origin));
}

/**
 * Middleware de CORS dinámico
 */
export const corsMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const origin = req.headers.origin;

  // Si el origen está permitido, configurar CORS
  if (isOriginAllowed(origin)) {
    if (origin) {
      res.header('Access-Control-Allow-Origin', origin);
    } else {
      // Para requests sin Origin (Twilio), no establecer el header
      // pero permitir la request
    }
    
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.header('Access-Control-Allow-Credentials', 'true');
  } else {
    // Origen no permitido - bloquear en producción, permitir en desarrollo para debugging
    if (process.env.NODE_ENV === 'production') {
      console.warn(`🚫 CORS bloqueado para origen: ${origin}`);
      res.status(403).json({ error: 'Origen no permitido' });
      return;
    } else {
      // En desarrollo, permitir pero loguear
      console.warn(`⚠️  CORS: Origen no permitido pero permitido en desarrollo: ${origin}`);
      if (origin) {
        res.header('Access-Control-Allow-Origin', origin);
      }
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    }
  }

  // Manejar preflight requests (OPTIONS)
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
    return;
  }

  next();
};

