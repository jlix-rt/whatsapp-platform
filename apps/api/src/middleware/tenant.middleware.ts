import { Request, Response, NextFunction } from 'express';
import { Store } from '../services/message.service';
import { tenantCache } from '../services/tenant-cache.service';

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
 * 1. req.headers['x-forwarded-host'] (cuando hay proxy reverso como nginx) - PRIORIDAD
 * 2. req.headers.host (fallback directo)
 */
export const tenantMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // ========================================================================
    // PASO 1: Obtener el host del request
    // ========================================================================
    // PRIORIDAD: x-forwarded-host (viene de nginx) > host (directo)
    const xForwardedHost = req.headers['x-forwarded-host'];
    const hostHeader = req.headers.host;
    
    // Log solo si está habilitado el debug (evitar spam de logs)
    if (process.env.DEBUG_TENANT === 'true') {
      console.log('🔍 [TENANT DEBUG] Headers recibidos:', {
        'x-forwarded-host': xForwardedHost,
        'host': hostHeader,
        'origin': req.headers.origin,
        'url': req.url,
        'method': req.method
      });
    }

    // Usar x-forwarded-host si está disponible, sino host
    const host = xForwardedHost || hostHeader;
    
    if (!host) {
      console.error('❌ [TENANT ERROR] No se pudo obtener el host del request');
      console.error('   Headers disponibles:', Object.keys(req.headers));
      res.status(400).json({ 
        error: 'Host header requerido para identificar el tenant',
        debug: {
          hasXForwardedHost: !!xForwardedHost,
          hasHost: !!hostHeader,
          headers: Object.keys(req.headers)
        }
      });
      return;
    }

    // ========================================================================
    // PASO 2: Normalizar el host string
    // ========================================================================
    const hostString = Array.isArray(host) ? host[0] : host;

    // ========================================================================
    // PASO 3: Extraer el tenant_id del subdominio
    // ========================================================================
    let tenantId = extractTenantIdFromHost(hostString);

    // En desarrollo (localhost), usar "crunchypaws" como tenant por defecto
    if (!tenantId) {
      const hostWithoutPort = hostString.split(':')[0].toLowerCase();
      if (hostWithoutPort === 'localhost' || hostWithoutPort === '127.0.0.1' || hostWithoutPort.startsWith('localhost')) {
        tenantId = 'crunchypaws';
        console.log('🏠 [TENANT] Ambiente local detectado, usando tenant por defecto: crunchypaws');
      } else {
        console.error(`❌ [TENANT ERROR] No se pudo extraer tenant_id del host: ${hostString}`);
        console.error('   Host desglosado:', {
          original: hostString,
          withoutPort: hostString.split(':')[0],
          parts: hostString.split(':')[0].split('.')
        });
        res.status(400).json({ 
          error: 'Subdominio inválido. Formato esperado: {tenant_id}.inbox.tiendasgt.com',
          debug: {
            receivedHost: hostString,
            source: xForwardedHost ? 'x-forwarded-host' : 'host'
          }
        });
        return;
      }
    }

    // ========================================================================
    // PASO 4: Obtener tenant del caché (optimizado - sin consulta a BD)
    // ========================================================================
    // El caché se inicializa al arrancar el servicio, evitando consultas repetidas
    const store = await tenantCache.getTenant(tenantId);
    
    if (!store) {
      console.error(`❌ [TENANT ERROR] Tenant '${tenantId}' no encontrado`);
      res.status(404).json({ 
        error: `Tienda con slug '${tenantId}' no encontrada`,
        debug: {
          tenantId,
          host: hostString
        }
      });
      return;
    }

    // ========================================================================
    // PASO 5: Log solo si el tenant no estaba en caché (evitar spam)
    // ========================================================================
    // Solo loguear si fue necesario consultar la BD (tenant nuevo o caché no inicializado)
    const wasInCache = tenantCache.isInitialized() && (tenantCache as any).cache.has(tenantId);
    if (!wasInCache) {
      console.log(`✅ [TENANT] Tenant '${tenantId}' obtenido desde BD:`, {
        id: store.id,
        name: store.name,
        slug: store.slug,
        hasTwilioAccountSid: !!store.twilio_account_sid,
        hasTwilioAuthToken: !!store.twilio_auth_token,
        hasWhatsappFrom: !!store.whatsapp_from,
        environment: store.environment
      });

      // Advertencia si no tiene credenciales de Twilio configuradas
      if (!store.twilio_account_sid || !store.twilio_auth_token) {
        console.warn(`⚠️  [TENANT] Tenant '${tenantId}' no tiene credenciales de Twilio en BD. Se usarán variables de entorno como fallback.`);
      }
    }

    // ========================================================================
    // PASO 6: Adjuntar el tenant completo (con credenciales) al request
    // ========================================================================
    // req.tenant contiene:
    // - id, slug, name
    // - twilio_account_sid (desde BD)
    // - twilio_auth_token (desde BD)
    // - whatsapp_from (desde BD)
    // - environment
    req.tenant = store;

    next();
  } catch (error: any) {
    console.error('❌ [TENANT ERROR] Error en tenantMiddleware:', error);
    console.error('   Stack:', error.stack);
    res.status(500).json({ 
      error: 'Error interno al identificar el tenant',
      message: error.message
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
 * 
 * @param host Host string completo (puede incluir puerto)
 * @returns Tenant ID o null si no se puede extraer
 */
function extractTenantIdFromHost(host: string): string | null {
  if (!host || typeof host !== 'string') {
    console.warn('⚠️  [EXTRACT] Host inválido:', host);
    return null;
  }

  // Remover el puerto si existe (ej: "localhost:3333" → "localhost")
  const hostWithoutPort = host.split(':')[0].trim();
  
  if (!hostWithoutPort) {
    console.warn('⚠️  [EXTRACT] Host vacío después de remover puerto');
    return null;
  }

  // Dividir por puntos
  const parts = hostWithoutPort.split('.');
  

  // Validaciones básicas
  if (parts.length < 2) {
    console.warn('⚠️  [EXTRACT] Host tiene menos de 2 partes, no hay subdominio');
    return null;
  }

  // El primer segmento es el tenant_id
  // Ejemplo: ["crunchypaws", "inbox", "tiendasgt", "com"]
  const tenantId = parts[0];

  // Validar que el tenant_id no esté vacío
  if (!tenantId || tenantId.trim() === '') {
    console.warn('⚠️  [EXTRACT] Tenant ID vacío');
    return null;
  }

  // Validar que no sea localhost o 127.0.0.1 (no hay tenant en estos casos)
  const normalizedTenantId = tenantId.toLowerCase().trim();
  if (normalizedTenantId === 'localhost' || normalizedTenantId === '127' || normalizedTenantId === '0' || normalizedTenantId === '0.0.0.0') {
    console.warn('⚠️  [EXTRACT] Host es localhost, no hay tenant');
    return null;
  }

  // Validar formato básico (solo letras, números, guiones)
  if (!/^[a-z0-9-]+$/i.test(normalizedTenantId)) {
    console.warn('⚠️  [EXTRACT] Tenant ID tiene caracteres inválidos:', normalizedTenantId);
    return null;
  }

  console.log('✅ [EXTRACT] Tenant ID extraído exitosamente:', normalizedTenantId);
  return normalizedTenantId;
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
        const store = await tenantCache.getTenant(tenantId);
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

