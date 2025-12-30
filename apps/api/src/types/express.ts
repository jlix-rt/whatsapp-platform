/**
 * Extensión de Express Request para incluir información del tenant
 * El middleware tenant.middleware.ts adjunta el objeto Store completo al request
 */

// Importar el tipo Store para usarlo en la extensión
import { Store } from '../services/message.service';

declare global {
  namespace Express {
    interface Request {
      tenant?: Store;
    }
  }
}

// Exportar vacío para que este archivo sea tratado como módulo
export {};

