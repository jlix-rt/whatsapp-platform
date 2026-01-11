import twilio from 'twilio';
import { Store } from './message.service';

/**
 * Servicio de Twilio multitenant
 * 
 * Cada tenant puede tener sus propias credenciales de Twilio almacenadas en la base de datos.
 * Las credenciales se obtienen del objeto Store pasado como parámetro.
 * 
 * Prioridad de configuración:
 * 1. Credenciales del tenant en la base de datos (tabla stores)
 *    - twilio_account_sid
 *    - twilio_auth_token
 *    - whatsapp_from (número de WhatsApp específico del tenant)
 * 2. Variables de entorno globales (.env) como fallback
 *    - TWILIO_ACCOUNT_SID
 *    - TWILIO_AUTH_TOKEN
 *    - WHATSAPP_FROM
 * 
 * Casos de uso:
 * - Producción: Cada tenant tiene sus propias credenciales en la BD
 *   Ejemplo: crunchypaws usa número de producción, dkape usa número de sandbox
 * - Desarrollo: Usar variables de entorno compartidas
 * 
 * IMPORTANTE: El campo 'whatsapp_from' en la tabla stores permite que cada tenant
 * use un número diferente (producción vs sandbox).
 */

const isProduction = process.env.NODE_ENV === 'production';

/**
 * Obtiene o crea un cliente de Twilio para un tenant específico
 * 
 * MULTITENANT: Cada tenant puede tener sus propias credenciales
 */
function getTwilioClient(tenant?: Store): any {
  // Si no hay tenant, usar credenciales globales (fallback)
  let accountSid: string | undefined;
  let authToken: string | undefined;
  let whatsappFrom: string | undefined;

  if (tenant) {
    // Usar credenciales del tenant si están disponibles
    accountSid = tenant.twilio_account_sid || undefined;
    authToken = tenant.twilio_auth_token || undefined;
    whatsappFrom = tenant.whatsapp_from || undefined;
  }

  // Fallback a variables de entorno si el tenant no tiene credenciales
  if (!accountSid) {
    accountSid = process.env.TWILIO_ACCOUNT_SID;
  }
  if (!authToken) {
    authToken = process.env.TWILIO_AUTH_TOKEN;
  }
  if (!whatsappFrom) {
    whatsappFrom = process.env.WHATSAPP_FROM;
  }

  // Validar que tenemos credenciales antes de continuar
  if (!accountSid || !authToken) {
    const tenantInfo = tenant ? ` (tenant: ${tenant.slug})` : '';
    console.error(`❌ Error: Credenciales de Twilio no configuradas${tenantInfo}`);
    
    // En desarrollo sin credenciales, retornar null para modo MOCK
    if (!isProduction) {
      console.warn(`⚠️  Modo desarrollo sin credenciales: usando MOCK`);
      return null;
    }
    
    // En producción sin credenciales, lanzar error
    throw new Error(`Credenciales de Twilio no configuradas${tenantInfo}`);
  }

  // Si tenemos credenciales válidas, crear cliente incluso en desarrollo
  // Esto permite probar con credenciales reales en desarrollo si es necesario
  // Para forzar MOCK en desarrollo, usar: ENABLE_TWILIO_MOCK=true
  const forceMock = process.env.ENABLE_TWILIO_MOCK === 'true';
  if (forceMock) {
    return null;
  }


  try {
    return twilio(accountSid, authToken);
  } catch (error) {
    console.error('❌ Error inicializando cliente de Twilio:', error);
    throw error;
  }
}

/**
 * Envía un mensaje interactivo de WhatsApp
 * 
 * MULTITENANT: Usa las credenciales del tenant para enviar el mensaje
 * 
 * @param to Número de teléfono destino
 * @param interactive Objeto interactivo de Twilio
 * @param tenant Tenant (Store) con las credenciales de Twilio
 */
export const sendInteractive = async (
  to: string, 
  interactive: any, 
  tenant?: Store
): Promise<boolean> => {
  const bodyText = interactive.body?.text || 'Selecciona una opción';

  // Obtener cliente de Twilio para el tenant
  const client = getTwilioClient(tenant);
  // En desarrollo: solo loguear, NO enviar a Twilio
  if (!client) {
    return false; // Indica que fue simulado
  }

  // Obtener número de WhatsApp del tenant o usar variable de entorno como fallback
  // Prioridad: 1) tenant.whatsapp_from (configurado en BD), 2) process.env.WHATSAPP_FROM
  const whatsappFrom = tenant?.whatsapp_from || process.env.WHATSAPP_FROM;
  
  if (!whatsappFrom) {
    const tenantInfo = tenant ? ` para el tenant '${tenant.slug}'` : '';
    throw new Error(`Número de WhatsApp no configurado${tenantInfo}. Configure whatsapp_from en la tabla stores o WHATSAPP_FROM en .env`);
  }


  try {
    await client.messages.create({
      from: whatsappFrom,
      to,
      body: bodyText,
      interactive
    } as any);
    return true; // Indica que fue enviado realmente
  } catch (error: any) {
    console.error('❌ Error enviando mensaje interactivo por Twilio:', error.message);
    throw error;
  }
};

/**
 * Envía un mensaje de texto de WhatsApp
 * 
 * MULTITENANT: Usa las credenciales del tenant para enviar el mensaje
 * 
 * @param to Número de teléfono destino
 * @param text Texto del mensaje
 * @param tenant Tenant (Store) con las credenciales de Twilio
 */
export const sendText = async (
  to: string, 
  text: string, 
  tenant?: Store
): Promise<boolean> => {
  // Obtener cliente de Twilio para el tenant
  const client = getTwilioClient(tenant);

  // En desarrollo: solo loguear, NO enviar a Twilio
  if (!client) {
    return false; // Indica que fue simulado
  }

  // Obtener número de WhatsApp del tenant o usar variable de entorno como fallback
  // Prioridad: 1) tenant.whatsapp_from (configurado en BD), 2) process.env.WHATSAPP_FROM
  const whatsappFrom = tenant?.whatsapp_from || process.env.WHATSAPP_FROM;
  
  if (!whatsappFrom) {
    const tenantInfo = tenant ? ` para el tenant '${tenant.slug}'` : '';
    throw new Error(`Número de WhatsApp no configurado${tenantInfo}. Configure whatsapp_from en la tabla stores o WHATSAPP_FROM en .env`);
  }


  try {
    await client.messages.create({
      from: whatsappFrom,
      to,
      body: text
    });
    return true; // Indica que fue enviado realmente
  } catch (error: any) {
    console.error('❌ Error enviando mensaje por Twilio:', error.message);
    throw error;
  }
};

/**
 * Envía un mensaje con archivo adjunto (imagen o PDF) de WhatsApp
 * 
 * MULTITENANT: Usa las credenciales del tenant para enviar el mensaje
 * 
 * @param to Número de teléfono destino
 * @param text Texto del mensaje (opcional)
 * @param mediaUrl URL pública del archivo a enviar
 * @param mediaType Tipo MIME del archivo (ej: image/jpeg, application/pdf)
 * @param tenant Tenant (Store) con las credenciales de Twilio
 */
export const sendMedia = async (
  to: string,
  text: string | null,
  mediaUrl: string,
  mediaType: string,
  tenant?: Store
): Promise<boolean> => {
  const client = getTwilioClient(tenant);
  if (!client) {
    return false;
  }
  const whatsappFrom = tenant?.whatsapp_from || process.env.WHATSAPP_FROM;
  if (!whatsappFrom) {
    const tenantInfo = tenant ? ` para el tenant '${tenant.slug}'` : '';
    throw new Error(`Número de WhatsApp no configurado${tenantInfo}. Configure whatsapp_from en la tabla stores o WHATSAPP_FROM en .env`);
  }
  try {
    const messagePayload: any = {
      from: whatsappFrom,
      to,
      mediaUrl: [mediaUrl]
    };
    if (text && text.trim()) {
      messagePayload.body = text.trim();
    }
    await client.messages.create(messagePayload);
    return true;
  } catch (error: any) {
    console.error('❌ Error enviando media por Twilio:', error.message);
    throw error;
  }
};
