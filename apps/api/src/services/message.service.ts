import { pool } from '../db/pool';

export interface Store {
  id: number;
  slug: string;
  name: string;
  twilio_account_sid?: string;
  twilio_auth_token?: string;
  whatsapp_from?: string;
  environment?: 'sandbox' | 'production';
}

export interface Conversation {
  id: number;
  store_id: number;
  phone_number: string;
  mode: 'BOT' | 'HUMAN';
  human_handled: boolean;
  created_at: Date;
  updated_at: Date;
  deleted_at?: Date | null;
}

export interface Message {
  id: number;
  conversation_id: number;
  direction: 'inbound' | 'outbound';
  body: string;
  twilio_message_sid?: string;
  media_url?: string | null;
  media_type?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  created_at: Date;
}

/**
 * Obtener tienda por slug (incluyendo credenciales de Twilio)
 * 
 * MULTITENANT: Esta función se usa para validar que un tenant existe y obtener
 * sus credenciales de Twilio desde la base de datos.
 * 
 * El slug corresponde al tenant_id extraído del subdominio.
 * 
 * IMPORTANTE: Esta función consulta explícitamente las credenciales de Twilio:
 * - twilio_account_sid
 * - twilio_auth_token
 * - whatsapp_from
 * 
 * Estas credenciales se obtienen directamente de la tabla 'stores' en la BD.
 */
export const getStoreBySlug = async (slug: string): Promise<Store | null> => {
  const result = await pool.query(
    `SELECT 
       id, 
       slug, 
       name, 
       twilio_account_sid,    -- Credencial de Twilio desde BD
       twilio_auth_token,     -- Credencial de Twilio desde BD
       whatsapp_from,         -- Número de WhatsApp desde BD
       environment 
     FROM stores 
     WHERE slug = $1`,
    [slug]
  );
  
  const store = result.rows[0] || null;
  
  
  return store;
};

/**
 * Obtener todas las tiendas
 * 
 * MULTITENANT: Esta función se usa para cargar todos los tenants en el caché.
 */
export const getAllStores = async (): Promise<Store[]> => {
  const result = await pool.query(
    `SELECT id, slug, name, twilio_account_sid, twilio_auth_token, whatsapp_from, environment 
     FROM stores 
     ORDER BY slug`
  );
  return result.rows;
};

/**
 * Obtener tienda por ID
 * 
 * MULTITENANT: Esta función se usa para obtener las credenciales del tenant.
 */
export const getStoreById = async (id: number): Promise<Store | null> => {
  const result = await pool.query(
    `SELECT id, slug, name, twilio_account_sid, twilio_auth_token, whatsapp_from, environment 
     FROM stores WHERE id = $1`,
    [id]
  );
  return result.rows[0] || null;
};

/**
 * Obtener o crear una conversación
 * 
 * MULTITENANT: Esta función filtra automáticamente por store_id (tenant_id).
 * El store_id debe venir de req.tenant.id en los controladores.
 */
export const getOrCreateConversation = async (
  storeId: number,
  phoneNumber: string
): Promise<Conversation> => {
  const result = await pool.query(
    `INSERT INTO conversations (store_id, phone_number, mode)
     VALUES ($1, $2, 'BOT')
     ON CONFLICT (store_id, phone_number)
     DO UPDATE SET updated_at = CURRENT_TIMESTAMP
     RETURNING *`,
    [storeId, phoneNumber]
  );
  return result.rows[0];
};

/**
 * Obtener una conversación específica
 * 
 * MULTITENANT: Esta función filtra automáticamente por store_id (tenant_id).
 * El store_id debe venir de req.tenant.id en los controladores.
 */
export const getConversation = async (
  storeId: number,
  phoneNumber: string
): Promise<Conversation | null> => {
  const result = await pool.query(
    `SELECT * FROM conversations
     WHERE store_id = $1 AND phone_number = $2`,
    [storeId, phoneNumber]
  );
  return result.rows[0] || null;
};

export const updateConversationMode = async (
  conversationId: number,
  mode: 'BOT' | 'HUMAN'
): Promise<Conversation> => {
  // Asegurar que conversationId sea un número
  const id = Number(conversationId);
  
  if (isNaN(id) || id <= 0) {
    throw new Error(`ID de conversación inválido: ${conversationId}`);
  }

  // Cuando se cambia a modo BOT o HUMAN, resetear human_handled a false
  // human_handled solo se marcará como true cuando se envíe un mensaje manualmente
  const result = await pool.query(
    `UPDATE conversations
     SET mode = $1, human_handled = false, updated_at = CURRENT_TIMESTAMP
     WHERE id = $2
     RETURNING *`,
    [mode, id]
  );
  
  
  if (result.rowCount === 0) {
    throw new Error(`No se encontró la conversación con id ${id}`);
  }
  
  if (result.rows.length === 0) {
    throw new Error(`UPDATE ejecutado pero no se retornaron filas para id ${id}`);
  }
  
  return result.rows[0];
};

export const saveMessage = async (
  conversationId: number,
  direction: 'inbound' | 'outbound',
  body: string,
  twilioMessageSid?: string,
  mediaUrl?: string | null,
  mediaType?: string | null,
  latitude?: number | null,
  longitude?: number | null
): Promise<Message> => {
  const result = await pool.query(
    `INSERT INTO messages (conversation_id, direction, body, twilio_message_sid, media_url, media_type, latitude, longitude)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [conversationId, direction, body, twilioMessageSid, mediaUrl || null, mediaType || null, latitude || null, longitude || null]
  );
  return result.rows[0];
};

/**
 * Obtener todas las conversaciones de un tenant
 * 
 * MULTITENANT: Esta función filtra automáticamente por store_id (tenant_id).
 * El store_id debe venir de req.tenant.id en los controladores.
 * Solo retorna conversaciones del tenant especificado.
 */
export const getConversations = async (storeId: number): Promise<any[]> => {
  const result = await pool.query(
    `SELECT c.*, 
            (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) as message_count,
            (SELECT m.body FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) as last_message,
            (SELECT m.direction FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) as last_message_direction
     FROM conversations c
     WHERE c.store_id = $1 AND c.deleted_at IS NULL
     ORDER BY c.updated_at DESC`,
    [storeId]
  );
  
  // Debug: log para conversaciones con +50277777777
  result.rows.forEach((row: any) => {
    if (row.phone_number && row.phone_number.includes('77777777')) {
      
    }
  });
  
  return result.rows;
};

/**
 * Obtener una conversación por ID
 * 
 * MULTITENANT: Esta función NO filtra por tenant.
 * Los controladores DEBEN validar que conversation.store_id === req.tenant.id
 * después de llamar a esta función para asegurar aislamiento de datos.
 */
export const getConversationById = async (conversationId: number): Promise<Conversation | null> => {
  const result = await pool.query(
    `SELECT * FROM conversations WHERE id = $1`,
    [conversationId]
  );
  return result.rows[0] || null;
};

/**
 * Obtener mensajes de una conversación
 * 
 * MULTITENANT: Esta función NO valida el tenant directamente.
 * Los controladores DEBEN validar primero que la conversación pertenece al tenant
 * usando getConversationById y verificando conversation.store_id === req.tenant.id
 * 
 * @param conversationId ID de la conversación
 * @param limit Número máximo de mensajes a retornar (por defecto: todos)
 * @param offset Número de mensajes a saltar (para paginación)
 * @param beforeId ID del mensaje más antiguo a partir del cual cargar (para cursor-based pagination)
 */
export const getMessages = async (
  conversationId: number,
  limit?: number,
  offset?: number,
  beforeId?: number
): Promise<Message[]> => {
  let query = `SELECT * FROM messages WHERE conversation_id = $1`;
  const params: any[] = [conversationId];
  let paramIndex = 2;

  // Si se especifica beforeId, cargar mensajes anteriores a ese ID
  if (beforeId) {
    query += ` AND id < $${paramIndex}`;
    params.push(beforeId);
    paramIndex++;
  }

  query += ` ORDER BY created_at DESC`;

  // Aplicar limit y offset si se especifican
  if (limit) {
    query += ` LIMIT $${paramIndex}`;
    params.push(limit);
    paramIndex++;
  }
  
  if (offset) {
    query += ` OFFSET $${paramIndex}`;
    params.push(offset);
  }

  const result = await pool.query(query, params);
  
  // Retornar en orden ascendente (más antiguos primero) para facilitar el renderizado
  return result.rows.reverse();
};

/**
 * Obtener el conteo total de mensajes de una conversación
 */
export const getMessageCount = async (conversationId: number): Promise<number> => {
  const result = await pool.query(
    `SELECT COUNT(*) as count FROM messages WHERE conversation_id = $1`,
    [conversationId]
  );
  return parseInt(result.rows[0].count);
};

/**
 * Obtener un mensaje por ID
 */
export const getMessageById = async (messageId: number): Promise<Message | null> => {
  const result = await pool.query(
    `SELECT * FROM messages WHERE id = $1`,
    [messageId]
  );
  return result.rows[0] || null;
};

export const markConversationAsHandled = async (conversationId: number): Promise<Conversation> => {
  const result = await pool.query(
    `UPDATE conversations
     SET human_handled = true, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1
     RETURNING *`,
    [conversationId]
  );
  return result.rows[0];
};

/**
 * Verificar si una conversación tiene mensajes outbound
 */
export const hasOutboundMessages = async (conversationId: number): Promise<boolean> => {
  const result = await pool.query(
    `SELECT COUNT(*) as count FROM messages
     WHERE conversation_id = $1 AND direction = 'outbound'`,
    [conversationId]
  );
  return parseInt(result.rows[0].count) > 0;
};

/**
 * Eliminar lógicamente una conversación (soft delete) y cambiar a modo BOT
 */
export const deleteConversation = async (conversationId: number): Promise<Conversation> => {
  const result = await pool.query(
    `UPDATE conversations
     SET deleted_at = CURRENT_TIMESTAMP, 
         mode = 'BOT',
         human_handled = false,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING *`,
    [conversationId]
  );
  
  if (result.rowCount === 0) {
    throw new Error(`No se encontró la conversación con id ${conversationId} o ya está eliminada`);
  }
  
  return result.rows[0];
};

/**
 * Restaurar una conversación eliminada y ponerla en modo BOT
 * 
 * MULTITENANT: Esta función restaura conversaciones eliminadas cuando el usuario vuelve a escribir
 */
export const restoreConversation = async (
  conversationId: number
): Promise<Conversation> => {
  const result = await pool.query(
    `UPDATE conversations
     SET deleted_at = NULL, 
         mode = 'BOT', 
         human_handled = false,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND deleted_at IS NOT NULL
     RETURNING *`,
    [conversationId]
  );
  
  if (result.rowCount === 0) {
    throw new Error(`No se encontró la conversación eliminada con id ${conversationId}`);
  }
  
  return result.rows[0];
};