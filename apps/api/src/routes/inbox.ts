import { Router, Request, Response } from 'express';
// Importar tipos extendidos de Express
import '../types/express';
import { getConversations, getMessages } from '../services/message.service';
import { sendText } from '../services/twilio.service';
import { getOrCreateConversation, saveMessage, getConversationById } from '../services/message.service';

const router = Router();

/**
 * GET /inbox/conversations
 * 
 * Obtiene todas las conversaciones del tenant actual
 * 
 * MULTITENANT: Usa req.tenant.id para filtrar conversaciones automáticamente
 */
router.get('/conversations', async (req: Request, res: Response) => {
  try {
    // Validar que el tenant fue identificado por el middleware
    if (!req.tenant) {
      return res.status(400).json({ error: 'Tenant no identificado' });
    }

    const conversations = await getConversations(req.tenant.id);
    res.json(conversations);
  } catch (error) {
    console.error('Error obteniendo conversaciones:', error);
    res.status(500).json({ error: 'Error al obtener conversaciones' });
  }
});

/**
 * GET /inbox/messages/:conversationId
 * 
 * Obtiene los mensajes de una conversación específica
 * 
 * MULTITENANT: Valida que la conversación pertenece al tenant actual
 */
router.get('/messages/:conversationId', async (req: Request, res: Response) => {
  try {
    // Validar que el tenant fue identificado por el middleware
    if (!req.tenant) {
      return res.status(400).json({ error: 'Tenant no identificado' });
    }

    const conversationId = parseInt(req.params.conversationId);
    
    // Validar que la conversación pertenece al tenant actual
    const conversation = await getConversationById(conversationId);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversación no encontrada' });
    }
    
    if (conversation.store_id !== req.tenant.id) {
      return res.status(403).json({ error: 'No tienes acceso a esta conversación' });
    }

    const messages = await getMessages(conversationId);
    res.json(messages);
  } catch (error) {
    console.error('Error obteniendo mensajes:', error);
    res.status(500).json({ error: 'Error al obtener mensajes' });
  }
});

/**
 * POST /inbox/send
 * 
 * Envía un mensaje de texto a un número de teléfono
 * 
 * MULTITENANT: Usa req.tenant para crear la conversación y enviar el mensaje
 */
router.post('/send', async (req: Request, res: Response) => {
  try {
    // Validar que el tenant fue identificado por el middleware
    if (!req.tenant) {
      return res.status(400).json({ error: 'Tenant no identificado' });
    }

    const { phoneNumber, message } = req.body;

    if (!phoneNumber || !message) {
      return res.status(400).json({ error: 'phoneNumber y message son requeridos' });
    }

    // Crear o obtener conversación para el tenant actual
    const conversation = await getOrCreateConversation(req.tenant.id, phoneNumber);
    
    // Enviar mensaje usando las credenciales del tenant
    await sendText(phoneNumber, message, req.tenant);
    
    // Guardar mensaje
    await saveMessage(conversation.id, 'outbound', message);

    res.json({ success: true, conversationId: conversation.id });
  } catch (error) {
    console.error('Error enviando mensaje:', error);
    res.status(500).json({ error: 'Error al enviar mensaje' });
  }
});

export default router;

