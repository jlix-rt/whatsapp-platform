import { Router, Request, Response } from 'express';
// Importar tipos extendidos de Express
import '../types/express';
import { getConversations, getMessages, getConversationById, markConversationAsHandled, saveMessage, updateConversationMode, deleteConversation, getMessageById } from '../services/message.service';
import { getStoreById } from '../services/message.service';
import { sendText } from '../services/twilio.service';
import { pool } from '../db/pool';
import https from 'https';
import http from 'http';

const router = Router();

/**
 * GET /api/stores
 * 
 * Lista todas las tiendas desde la base de datos
 * 
 * MULTITENANT: Este endpoint puede ser útil para administración,
 * pero en producción debería estar protegido o removido
 */
router.get('/stores', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT slug as id, name, twilio_account_sid, twilio_auth_token, whatsapp_from, environment 
       FROM stores ORDER BY id ASC`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error obteniendo tiendas:', error);
    res.status(500).json({ error: 'Error al obtener tiendas' });
  }
});

/**
 * GET /api/conversations
 * 
 * Lista las conversaciones del tenant actual
 * 
 * MULTITENANT: Usa req.tenant.id para filtrar conversaciones automáticamente
 * Ya no requiere storeId como query parameter
 */
router.get('/conversations', async (req: Request, res: Response) => {
  try {
    // Validar que el tenant fue identificado por el middleware
    if (!req.tenant) {
      return res.status(400).json({ error: 'Tenant no identificado' });
    }

    // Usar el ID del tenant actual para filtrar conversaciones
    const conversations = await getConversations(req.tenant.id);
    res.json(conversations);
  } catch (error) {
    console.error('Error obteniendo conversaciones:', error);
    res.status(500).json({ error: 'Error al obtener conversaciones' });
  }
});

/**
 * GET /api/conversations/:conversationId/messages
 * 
 * Obtiene los mensajes de una conversación específica
 * 
 * MULTITENANT: Valida que la conversación pertenece al tenant actual
 */
router.get('/conversations/:conversationId/messages', async (req: Request, res: Response) => {
  try {
    // Validar que el tenant fue identificado por el middleware
    if (!req.tenant) {
      return res.status(400).json({ error: 'Tenant no identificado' });
    }

    const conversationId = parseInt(req.params.conversationId);
    
    if (isNaN(conversationId)) {
      return res.status(400).json({ error: 'conversationId inválido' });
    }

    // Verificar que la conversación existe y pertenece al tenant actual
    const conversation = await getConversationById(conversationId);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversación no encontrada' });
    }

    // Validar que la conversación pertenece al tenant actual
    if (conversation.store_id !== req.tenant.id) {
      return res.status(403).json({ error: 'No tienes acceso a esta conversación' });
    }

    // Validar que la conversación no esté eliminada
    if (conversation.deleted_at) {
      return res.status(404).json({ error: 'Conversación no encontrada' });
    }

    const messages = await getMessages(conversationId);
    
    // Log para debugging de mensajes con media
    const messagesWithMedia = messages.filter(m => m.media_url);
    if (messagesWithMedia.length > 0) {
      console.log(`📷 Mensajes con media encontrados: ${messagesWithMedia.length}`, 
        messagesWithMedia.map(m => ({ id: m.id, media_url: m.media_url?.substring(0, 50), media_type: m.media_type }))
      );
    }
    
    res.json(messages);
  } catch (error) {
    console.error('Error obteniendo mensajes:', error);
    res.status(500).json({ error: 'Error al obtener mensajes' });
  }
});

/**
 * POST /api/conversations/:conversationId/reply
 * 
 * Responde a una conversación específica
 * 
 * MULTITENANT: Valida que la conversación pertenece al tenant actual
 * y usa las credenciales del tenant para enviar el mensaje
 */
router.post('/conversations/:conversationId/reply', async (req: Request, res: Response) => {
  try {
    // Validar que el tenant fue identificado por el middleware
    if (!req.tenant) {
      return res.status(400).json({ error: 'Tenant no identificado' });
    }

    const conversationId = parseInt(req.params.conversationId);
    const { text } = req.body;

    if (isNaN(conversationId)) {
      return res.status(400).json({ error: 'conversationId inválido' });
    }

    if (!text || typeof text !== 'string' || text.trim() === '') {
      return res.status(400).json({ error: 'text es requerido y debe ser una cadena no vacía' });
    }

    // Verificar que la conversación existe y pertenece al tenant actual
    const conversation = await getConversationById(conversationId);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversación no encontrada' });
    }

    // Validar que la conversación pertenece al tenant actual
    if (conversation.store_id !== req.tenant.id) {
      return res.status(403).json({ error: 'No tienes acceso a esta conversación' });
    }

    // Validar que la conversación no esté eliminada
    if (conversation.deleted_at) {
      return res.status(404).json({ error: 'Conversación no encontrada' });
    }

    // Asegurar que conversationId sea un número válido
    const numericId = Number(conversationId);
    if (isNaN(numericId) || numericId <= 0) {
      return res.status(400).json({ error: `conversationId inválido: ${conversationId}` });
    }

    // Cambiar conversación a modo HUMAN ANTES de enviar el mensaje
    // Esto desactiva el bot para esta conversación inmediatamente
    console.log(`🔄 Intentando cambiar conversación ${numericId} a modo HUMAN (modo actual: ${conversation.mode})`);
    const updatedConversation = await updateConversationMode(numericId, 'HUMAN');
    console.log(`✅ Conversación ${numericId} cambiada a modo HUMAN (modo anterior: ${conversation.mode}, modo nuevo: ${updatedConversation.mode})`);

    // Enviar mensaje usando las credenciales del tenant
    await sendText(conversation.phone_number, text.trim(), req.tenant);

    // Guardar mensaje como outbound
    const message = await saveMessage(conversationId, 'outbound', text.trim());

    // Marcar conversación como manejada por humano
    await markConversationAsHandled(conversationId);

    res.json({
      success: true,
      message: {
        id: message.id,
        conversation_id: message.conversation_id,
        direction: message.direction,
        body: message.body,
        created_at: message.created_at
      }
    });
  } catch (error) {
    console.error('Error enviando respuesta:', error);
    res.status(500).json({ error: 'Error al enviar respuesta' });
  }
});

/**
 * POST /api/conversations/:conversationId/reset-bot
 * 
 * Resetea una conversación a modo BOT
 * 
 * MULTITENANT: Valida que la conversación pertenece al tenant actual
 */
router.post('/conversations/:conversationId/reset-bot', async (req: Request, res: Response) => {
  try {
    // Validar que el tenant fue identificado por el middleware
    if (!req.tenant) {
      return res.status(400).json({ error: 'Tenant no identificado' });
    }

    const conversationId = parseInt(req.params.conversationId);

    if (isNaN(conversationId)) {
      return res.status(400).json({ error: 'conversationId inválido' });
    }

    // Verificar que la conversación existe y pertenece al tenant actual
    const conversation = await getConversationById(conversationId);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversación no encontrada' });
    }

    // Validar que la conversación pertenece al tenant actual
    if (conversation.store_id !== req.tenant.id) {
      return res.status(403).json({ error: 'No tienes acceso a esta conversación' });
    }

    // Validar que la conversación no esté eliminada
    if (conversation.deleted_at) {
      return res.status(404).json({ error: 'Conversación no encontrada' });
    }

    // Cambiar conversación a modo BOT
    const updatedConversation = await updateConversationMode(conversationId, 'BOT');

    console.log(`🤖 Conversación ${conversationId} reseteada a modo BOT`);

    res.json({
      success: true,
      conversation: {
        id: updatedConversation.id,
        mode: updatedConversation.mode,
        store_id: updatedConversation.store_id,
        phone_number: updatedConversation.phone_number
      }
    });
  } catch (error) {
    console.error('Error reseteando bot:', error);
    res.status(500).json({ error: 'Error al resetear bot' });
  }
});

/**
 * DELETE /api/conversations/:conversationId
 * 
 * Elimina lógicamente una conversación (soft delete)
 * 
 * MULTITENANT: Valida que la conversación pertenece al tenant actual
 */
router.delete('/conversations/:conversationId', async (req: Request, res: Response) => {
  try {
    // Validar que el tenant fue identificado por el middleware
    if (!req.tenant) {
      return res.status(400).json({ error: 'Tenant no identificado' });
    }

    const conversationId = parseInt(req.params.conversationId);

    if (isNaN(conversationId)) {
      return res.status(400).json({ error: 'conversationId inválido' });
    }

    // Verificar que la conversación existe y pertenece al tenant actual
    const conversation = await getConversationById(conversationId);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversación no encontrada' });
    }

    // Validar que la conversación pertenece al tenant actual
    if (conversation.store_id !== req.tenant.id) {
      return res.status(403).json({ error: 'No tienes acceso a esta conversación' });
    }

    // Verificar que la conversación no esté ya eliminada
    if (conversation.deleted_at) {
      return res.status(400).json({ error: 'La conversación ya está eliminada' });
    }

    // Eliminar lógicamente la conversación
    const deletedConversation = await deleteConversation(conversationId);

    console.log(`🗑️ Conversación ${conversationId} eliminada lógicamente`);

    res.json({
      success: true,
      message: 'Conversación eliminada exitosamente'
    });
  } catch (error: any) {
    console.error('Error eliminando conversación:', error);
    if (error.message && error.message.includes('ya está eliminada')) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Error al eliminar conversación' });
  }
});

/**
 * GET /api/messages/:messageId/media
 * 
 * Proxy para servir imágenes de Twilio con autenticación
 * 
 * MULTITENANT: Valida que el mensaje pertenece al tenant actual
 */
router.get('/messages/:messageId/media', async (req: Request, res: Response) => {
  try {
    // Validar que el tenant fue identificado por el middleware
    if (!req.tenant) {
      return res.status(400).json({ error: 'Tenant no identificado' });
    }

    const messageId = parseInt(req.params.messageId);

    if (isNaN(messageId)) {
      return res.status(400).json({ error: 'messageId inválido' });
    }

    // Obtener el mensaje
    const message = await getMessageById(messageId);
    if (!message) {
      return res.status(404).json({ error: 'Mensaje no encontrado' });
    }

    // Validar que el mensaje tiene media_url
    if (!message.media_url) {
      return res.status(400).json({ error: 'El mensaje no tiene media' });
    }

    // Obtener la conversación para validar el tenant
    const conversation = await getConversationById(message.conversation_id);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversación no encontrada' });
    }

    // Validar que la conversación pertenece al tenant actual
    if (conversation.store_id !== req.tenant.id) {
      return res.status(403).json({ error: 'No tienes acceso a este mensaje' });
    }

    // Obtener las credenciales de Twilio del tenant
    const tenant = await getStoreById(req.tenant.id);
    if (!tenant || !tenant.twilio_account_sid || !tenant.twilio_auth_token) {
      return res.status(500).json({ error: 'Credenciales de Twilio no configuradas' });
    }

    // Crear autenticación básica para Twilio
    const auth = Buffer.from(`${tenant.twilio_account_sid}:${tenant.twilio_auth_token}`).toString('base64');

    // Determinar si es HTTP o HTTPS
    const url = new URL(message.media_url);
    const isHttps = url.protocol === 'https:';
    const httpModule = isHttps ? https : http;

    // Hacer la solicitud a Twilio con autenticación
    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method: 'GET',
      headers: {
        'Authorization': `Basic ${auth}`
      }
    };

    const twilioRequest = httpModule.get(options, (twilioRes) => {
      // Establecer headers de respuesta
      res.setHeader('Content-Type', message.media_type || 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache por 1 año
      res.setHeader('Access-Control-Allow-Origin', '*'); // Permitir CORS para imágenes
      
      // Si hay error en la respuesta de Twilio
      if (twilioRes.statusCode !== 200) {
        console.error(`❌ Error obteniendo media de Twilio: Status ${twilioRes.statusCode}`);
        return res.status(twilioRes.statusCode || 500).json({ error: 'Error obteniendo media de Twilio' });
      }

      // Pipe la respuesta de Twilio al cliente
      twilioRes.pipe(res);
    });

    twilioRequest.on('error', (error) => {
      console.error('❌ Error obteniendo media de Twilio:', error);
      res.status(500).json({ error: 'Error obteniendo media' });
    });

  } catch (error) {
    console.error('Error en proxy de media:', error);
    res.status(500).json({ error: 'Error al obtener media' });
  }
});

export default router;

