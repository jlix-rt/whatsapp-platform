import { Request, Response, NextFunction } from 'express';
import { getStoreBySlug, Store } from '../services/message.service';

/**
 * Middleware multitenant basado en subdominios
 * 
 * Extrae el tenant_id del subdominio del request y valida que el tenant existe.
 * El tenant se adjunta al request como req.tenant para uso en los controladores.
 * 
 * Ejemplos de subdominios:
 * - crunchypaws.inbox.tiendasgt.com → tenant_id = "crunchypaws"
 * - dkape.inbox.tiendasgt.com → tenant_id = "dkape"
 * 
 * El subdominio se obtiene de:
 * 1. req.headers['x-forwarded-host'] (cuando hay proxy reverso como nginx)
 * 2. req.headers.host (fallback directo)
 */
export const tenantMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Obtener el host del request
    // x-forwarded-host tiene prioridad porque viene del proxy reverso (nginx)
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    
    if (!host) {
      console.warn('⚠️  No se pudo obtener el host del request');
      res.status(400).json({ 
        error: 'Host header requerido para identificar el tenant' 
      });
      return;
    }

    // Extraer el subdominio (tenant_id)
    // Formato esperado: {tenant_id}.inbox.tiendasgt.com
    // O en desarrollo: {tenant_id}.localhost:3333
    const hostString = Array.isArray(host) ? host[0] : host;
    const tenantId = extractTenantIdFromHost(hostString);

    if (!tenantId) {
      console.warn(`⚠️  No se pudo extraer tenant_id del host: ${hostString}`);
      res.status(400).json({ 
        error: 'Subdominio inválido. Formato esperado: {tenant_id}.inbox.tiendasgt.com' 
      });
      return;
    }

    // Validar que el tenant existe en la base de datos
    const store = await getStoreBySlug(tenantId);
    
    if (!store) {
      console.warn(`⚠️  Tenant '${tenantId}' no encontrado en la base de datos`);
      res.status(404).json({ 
        error: `Tienda con slug '${tenantId}' no encontrada` 
      });
      return;
    }

    // Adjuntar el tenant al request para uso en los controladores
    req.tenant = store;
    
    // Log para debugging (solo en desarrollo)
    if (process.env.NODE_ENV !== 'production') {
      console.log(`🏪 Tenant identificado: ${tenantId} (ID: ${store.id})`);
    }

    next();
  } catch (error) {
    console.error('❌ Error en tenantMiddleware:', error);
    res.status(500).json({ 
      error: 'Error interno al identificar el tenant' 
    });
  }
};

/**
 * Extrae el tenant_id del host string
 * 
 * Ejemplos:
 * - "crunchypaws.inbox.tiendasgt.com" → "crunchypaws"
 * - "dkape.inbox.tiendasgt.com" → "dkape"
 * - "crunchypaws.localhost:3333" → "crunchypaws"
 * - "localhost:3333" → null (no hay subdominio)
 */
function extractTenantIdFromHost(host: string): string | null {
  if (!host) {
    return null;
  }

  // Remover el puerto si existe (ej: "localhost:3333" → "localhost")
  const hostWithoutPort = host.split(':')[0];

  // Dividir por puntos
  const parts = hostWithoutPort.split('.');

  // Si hay menos de 2 partes, no hay subdominio
  if (parts.length < 2) {
    return null;
  }

  // El primer segmento es el tenant_id
  // Ejemplo: ["crunchypaws", "inbox", "tiendasgt", "com"]
  const tenantId = parts[0];

  // Validar que el tenant_id no esté vacío y sea válido
  if (!tenantId || tenantId.trim() === '') {
    return null;
  }

  // En desarrollo, si el host es "localhost", no hay tenant
  if (tenantId === 'localhost' || tenantId === '127.0.0.1') {
    return null;
  }

  return tenantId.toLowerCase().trim();
}

/**
 * Middleware opcional para rutas que NO requieren tenant
 * Por ejemplo, health checks o endpoints públicos
 */
export const optionalTenantMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    
    if (host) {
      const hostString = Array.isArray(host) ? host[0] : host;
      const tenantId = extractTenantIdFromHost(hostString);
      
      if (tenantId) {
        const store = await getStoreBySlug(tenantId);
        if (store) {
          req.tenant = store;
        }
      }
    }
    
    next();
  } catch (error) {
    // En modo opcional, continuar aunque haya error
    console.warn('⚠️  Error en optionalTenantMiddleware (continuando):', error);
    next();
  }
};

