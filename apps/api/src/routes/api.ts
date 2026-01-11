import { Router, Request, Response } from 'express';
// Importar tipos extendidos de Express
import '../types/express';
import { getConversations, getMessages, getConversationById, markConversationAsHandled, saveMessage, updateConversationMode, deleteConversation, getMessageById, getMessageCount } from '../services/message.service';
import { getStoreById } from '../services/message.service';
import { sendText, sendMedia } from '../services/twilio.service';
import { getContacts, getContactById, getContactByPhone, upsertContact, updateContact, deleteContact, getMessageLocations } from '../services/contact.service';
import { savePushSubscription, deletePushSubscription } from '../services/push-notification.service';
import multer from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import { pool } from '../db/pool';
import https from 'https';
import http from 'http';

const router = Router();

// Configurar multer para manejar archivos
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    // Preservar extensión del archivo original
    const ext = path.extname(file.originalname);
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // Límite de 10MB
  },
  fileFilter: (req, file, cb) => {
    // Permitir solo imágenes y PDFs
    const allowedMimes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
      'image/webp',
      'application/pdf'
    ];
    
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Tipo de archivo no permitido. Solo se permiten imágenes (JPEG, PNG, GIF, WEBP) y PDFs.'));
    }
  }
});

// Crear directorio de uploads si no existe
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

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
 * Obtiene los mensajes de una conversación específica con soporte de paginación
 * 
 * Query parameters:
 * - limit: Número máximo de mensajes a retornar (por defecto: 50)
 * - beforeId: ID del mensaje más antiguo a partir del cual cargar (para cargar mensajes anteriores)
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

    // Obtener parámetros de paginación
    // El límite por defecto se puede configurar en .env con MESSAGES_LIMIT (por defecto: 50)
    const defaultLimit = process.env.MESSAGES_LIMIT ? parseInt(process.env.MESSAGES_LIMIT) : 50;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : defaultLimit;
    const beforeId = req.query.beforeId ? parseInt(req.query.beforeId as string) : undefined;

    // Validar parámetros
    if (limit && (isNaN(limit) || limit < 1 || limit > 100)) {
      return res.status(400).json({ error: 'limit debe ser un número entre 1 y 100' });
    }

    if (beforeId && isNaN(beforeId)) {
      return res.status(400).json({ error: 'beforeId debe ser un número válido' });
    }

    const messages = await getMessages(conversationId, limit, undefined, beforeId);
    const totalCount = await getMessageCount(conversationId);
    const messagesWithMedia = messages.filter(m => m.media_url);
    
    // Determinar si hay más mensajes antiguos
    const hasMore = beforeId ? messages.length === limit : totalCount > messages.length;
    const oldestMessageId = messages.length > 0 ? messages[0].id : null;

    res.json({
      messages,
      pagination: {
        total: totalCount,
        limit,
        hasMore,
        oldestMessageId
      }
    });
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
    const updatedConversation = await updateConversationMode(numericId, 'HUMAN');

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
 * POST /api/conversations/:conversationId/reply-with-media
 * 
 * Responde a una conversación específica con un archivo adjunto (imagen o PDF)
 * 
 * MULTITENANT: Valida que la conversación pertenece al tenant actual
 * y usa las credenciales del tenant para enviar el mensaje
 */
router.post('/conversations/:conversationId/reply-with-media', upload.single('file'), async (req: Request, res: Response) => {
  try {
    // Validar que el tenant fue identificado por el middleware
    if (!req.tenant) {
      return res.status(400).json({ error: 'Tenant no identificado' });
    }

    const conversationId = parseInt(req.params.conversationId);
    const text = req.body.text || null; // Texto opcional
    const file = req.file;

    if (isNaN(conversationId)) {
      return res.status(400).json({ error: 'conversationId inválido' });
    }

    if (!file) {
      return res.status(400).json({ error: 'Archivo requerido' });
    }

    // Verificar que la conversación existe y pertenece al tenant actual
    const conversation = await getConversationById(conversationId);
    if (!conversation) {
      // Limpiar archivo si la conversación no existe
      if (file.path) {
        fs.unlinkSync(file.path);
      }
      return res.status(404).json({ error: 'Conversación no encontrada' });
    }

    // Validar que la conversación pertenece al tenant actual
    if (conversation.store_id !== req.tenant.id) {
      // Limpiar archivo si no tiene acceso
      if (file.path) {
        fs.unlinkSync(file.path);
      }
      return res.status(403).json({ error: 'No tienes acceso a esta conversación' });
    }

    // Validar que la conversación no esté eliminada
    if (conversation.deleted_at) {
      if (file.path) {
        fs.unlinkSync(file.path);
      }
      return res.status(404).json({ error: 'Conversación no encontrada' });
    }

    // Cambiar conversación a modo HUMAN
    const numericId = Number(conversationId);
    await updateConversationMode(numericId, 'HUMAN');

    // Crear URL pública del archivo
    // Construir la URL basándose en el request actual para que sea accesible públicamente
    // Usar x-forwarded-host si está disponible (cuando hay proxy reverso), sino usar host
    const forwardedHost = req.headers['x-forwarded-host'] as string;
    const host = forwardedHost || req.headers.host || 'localhost:3333';
    
    // Detectar protocolo: preferir x-forwarded-proto, luego verificar si la conexión es segura
    let protocol = 'http';
    if (req.headers['x-forwarded-proto']) {
      protocol = req.headers['x-forwarded-proto'] as string;
    } else if (req.secure || req.headers['x-forwarded-ssl'] === 'on') {
      protocol = 'https';
    }
    
    // Si API_URL está configurado, usarlo (debe ser una URL pública completa)
    // Si no, construir desde el request
    let baseUrl: string;
    if (process.env.API_URL) {
      baseUrl = process.env.API_URL;
    } else {
      // Construir URL desde el request
      baseUrl = `${protocol}://${host}`;
    }
    
    const mediaUrl = `${baseUrl}/api/uploads/${file.filename}`;

    // Enviar mensaje con media usando las credenciales del tenant
    await sendMedia(conversation.phone_number, text, mediaUrl, file.mimetype, req.tenant);

    // Guardar mensaje como outbound con media
    const message = await saveMessage(
      conversationId,
      'outbound',
      text || '[Archivo adjunto]',
      undefined,
      mediaUrl,
      file.mimetype
    );

    // Marcar conversación como manejada por humano
    await markConversationAsHandled(conversationId);

    res.json({
      success: true,
      message: {
        id: message.id,
        conversation_id: message.conversation_id,
        direction: message.direction,
        body: message.body,
        media_url: message.media_url,
        media_type: message.media_type,
        created_at: message.created_at
      }
    });
  } catch (error: any) {
    // Limpiar archivo en caso de error
    if (req.file?.path) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (e) {
        console.error('Error eliminando archivo temporal:', e);
      }
    }
    console.error('Error enviando respuesta con media:', error);
    res.status(500).json({ error: 'Error al enviar respuesta con media', message: error.message });
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
 * GET /api/uploads/:filename
 * 
 * Sirve archivos subidos temporalmente
 */
router.get('/uploads/:filename', (req: Request, res: Response) => {
  const filename = req.params.filename;
  const filePath = path.join(uploadsDir, filename);
  
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Archivo no encontrado' });
  }
  
  // Determinar content-type basado en extensión
  const ext = path.extname(filename).toLowerCase();
  const contentTypes: { [key: string]: string } = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.pdf': 'application/pdf'
  };
  
  const contentType = contentTypes[ext] || 'application/octet-stream';
  res.setHeader('Content-Type', contentType);
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  res.sendFile(filePath);
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
      console.error('❌ Tenant no identificado en proxy de media');
      return res.status(400).json({ error: 'Tenant no identificado' });
    }

    const messageId = parseInt(req.params.messageId);

    if (isNaN(messageId)) {
      console.error(`❌ messageId inválido: ${req.params.messageId}`);
      return res.status(400).json({ error: 'messageId inválido' });
    }

    // Obtener el mensaje
    const message = await getMessageById(messageId);
    if (!message) {
      console.error(`❌ Mensaje no encontrado: ${messageId}`);
      return res.status(404).json({ error: 'Mensaje no encontrado' });
    }

    // Validar que el mensaje tiene media_url
    if (!message.media_url) {
      console.error(`❌ Mensaje ${messageId} no tiene media_url`);
      return res.status(400).json({ error: 'El mensaje no tiene media' });
    }

    // Obtener la conversación para validar el tenant
    const conversation = await getConversationById(message.conversation_id);
    if (!conversation) {
      console.error(`❌ Conversación no encontrada: ${message.conversation_id}`);
      return res.status(404).json({ error: 'Conversación no encontrada' });
    }

    // Validar que la conversación pertenece al tenant actual
    if (conversation.store_id !== req.tenant.id) {
      console.error(`❌ Acceso denegado: conversation.store_id=${conversation.store_id}, req.tenant.id=${req.tenant.id}`);
      return res.status(403).json({ error: 'No tienes acceso a este mensaje' });
    }

    // Obtener las credenciales de Twilio del tenant
    const tenant = await getStoreById(req.tenant.id);
    if (!tenant || !tenant.twilio_account_sid || !tenant.twilio_auth_token) {
      console.error(`❌ Credenciales de Twilio no configuradas para tenant ${req.tenant.id}`);
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
      
      // Manejar redirecciones (301, 302, 307, 308)
      if (twilioRes.statusCode === 301 || twilioRes.statusCode === 302 || twilioRes.statusCode === 307 || twilioRes.statusCode === 308) {
        const location = twilioRes.headers.location;
        if (!location || typeof location !== 'string') {
          console.error(`❌ Redirección sin header Location: Status ${twilioRes.statusCode}`);
          return res.status(500).json({ error: 'Error: redirección sin Location header' });
        }
        
        
        // Parsear la URL de redirección
        const redirectUrl = new URL(location, message.media_url || undefined);
        const redirectIsHttps = redirectUrl.protocol === 'https:';
        const redirectHttpModule = redirectIsHttps ? https : http;
        
        // Hacer nueva solicitud a la URL de redirección
        const redirectOptions = {
          hostname: redirectUrl.hostname,
          port: redirectUrl.port || (redirectIsHttps ? 443 : 80),
          path: redirectUrl.pathname + redirectUrl.search,
          method: 'GET',
          headers: {
            'Authorization': `Basic ${auth}`
          }
        };
        
        const redirectRequest = redirectHttpModule.get(redirectOptions, (redirectRes) => {
          
          // Establecer headers de respuesta ANTES de hacer pipe
          res.setHeader('Content-Type', redirectRes.headers['content-type'] || message.media_type || 'image/jpeg');
          res.setHeader('Cache-Control', 'public, max-age=31536000');
          res.setHeader('Access-Control-Allow-Origin', '*');
          
          if (redirectRes.statusCode !== 200) {
            console.error(`❌ Error en redirección: Status ${redirectRes.statusCode}`);
            return res.status(redirectRes.statusCode || 500).json({ error: 'Error obteniendo media de Twilio' });
          }
          
          // Pipe la respuesta al cliente
          redirectRes.pipe(res);
          redirectRes.on('end', () => {
          });
        });
        
        redirectRequest.on('error', (error) => {
          console.error('❌ Error en redirección:', error);
          if (!res.headersSent) {
            res.status(500).json({ error: 'Error obteniendo media' });
          }
        });
        
        return;
      }
      
      // Establecer headers de respuesta ANTES de hacer pipe
      res.setHeader('Content-Type', twilioRes.headers['content-type'] || message.media_type || 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache por 1 año
      res.setHeader('Access-Control-Allow-Origin', '*'); // Permitir CORS para imágenes
      
      // Si hay error en la respuesta de Twilio
      if (twilioRes.statusCode !== 200) {
        console.error(`❌ Error obteniendo media de Twilio: Status ${twilioRes.statusCode}`);
        let errorBody = '';
        twilioRes.on('data', (chunk) => { errorBody += chunk.toString(); });
        twilioRes.on('end', () => {
          console.error(`❌ Cuerpo del error: ${errorBody}`);
          return res.status(twilioRes.statusCode || 500).json({ error: 'Error obteniendo media de Twilio' });
        });
        return;
      }

      // Pipe la respuesta de Twilio al cliente
      twilioRes.pipe(res);
    });

    twilioRequest.on('error', (error) => {
      console.error('❌ Error obteniendo media de Twilio:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Error obteniendo media' });
      }
    });

  } catch (error) {
    console.error('Error en proxy de media:', error);
    res.status(500).json({ error: 'Error al obtener media' });
  }
});

/**
 * GET /api/contacts
 * 
 * Obtener todos los contactos del tenant actual
 * 
 * MULTITENANT: Solo retorna contactos del tenant actual
 */
router.get('/contacts', async (req: Request, res: Response) => {
  try {
    if (!req.tenant) {
      return res.status(400).json({ error: 'Tenant no identificado' });
    }

    const contacts = await getContacts(req.tenant.id);
    res.json(contacts);
  } catch (error: any) {
    console.error('Error obteniendo contactos:', error);
    res.status(500).json({ error: 'Error al obtener contactos' });
  }
});

/**
 * GET /api/contacts/:contactId
 * 
 * Obtener un contacto específico
 * 
 * MULTITENANT: Valida que el contacto pertenece al tenant actual
 */
router.get('/contacts/:contactId', async (req: Request, res: Response) => {
  try {
    if (!req.tenant) {
      return res.status(400).json({ error: 'Tenant no identificado' });
    }

    const contactId = parseInt(req.params.contactId);
    if (isNaN(contactId)) {
      return res.status(400).json({ error: 'contactId inválido' });
    }

    const contact = await getContactById(contactId);
    if (!contact) {
      return res.status(404).json({ error: 'Contacto no encontrado' });
    }

    if (contact.store_id !== req.tenant.id) {
      return res.status(403).json({ error: 'No tienes acceso a este contacto' });
    }

    res.json(contact);
  } catch (error: any) {
    console.error('Error obteniendo contacto:', error);
    res.status(500).json({ error: 'Error al obtener contacto' });
  }
});

/**
 * POST /api/contacts
 * 
 * Crear o actualizar un contacto
 * 
 * MULTITENANT: Crea el contacto para el tenant actual
 */
router.post('/contacts', async (req: Request, res: Response) => {
  try {
    if (!req.tenant) {
      return res.status(400).json({ error: 'Tenant no identificado' });
    }

    const { phone_number, name, delivery_address, delivery_latitude, delivery_longitude, notes } = req.body;

    if (!phone_number) {
      return res.status(400).json({ error: 'phone_number es requerido' });
    }

    const contact = await upsertContact(
      req.tenant.id,
      phone_number,
      name || null,
      delivery_address || null,
      delivery_latitude || null,
      delivery_longitude || null,
      notes || null
    );

    res.json(contact);
  } catch (error: any) {
    console.error('Error creando/actualizando contacto:', error);
    res.status(500).json({ error: 'Error al crear/actualizar contacto', message: error.message });
  }
});

/**
 * PUT /api/contacts/:contactId
 * 
 * Actualizar un contacto existente
 * 
 * MULTITENANT: Valida que el contacto pertenece al tenant actual
 */
router.put('/contacts/:contactId', async (req: Request, res: Response) => {
  try {
    if (!req.tenant) {
      return res.status(400).json({ error: 'Tenant no identificado' });
    }

    const contactId = parseInt(req.params.contactId);
    if (isNaN(contactId)) {
      return res.status(400).json({ error: 'contactId inválido' });
    }

    const contact = await getContactById(contactId);
    if (!contact) {
      return res.status(404).json({ error: 'Contacto no encontrado' });
    }

    if (contact.store_id !== req.tenant.id) {
      return res.status(403).json({ error: 'No tienes acceso a este contacto' });
    }

    const { name, delivery_address, delivery_latitude, delivery_longitude, notes } = req.body;

    const updatedContact = await updateContact(
      contactId,
      name !== undefined ? name : null,
      delivery_address !== undefined ? delivery_address : null,
      delivery_latitude !== undefined ? delivery_latitude : null,
      delivery_longitude !== undefined ? delivery_longitude : null,
      notes !== undefined ? notes : null
    );

    res.json(updatedContact);
  } catch (error: any) {
    console.error('Error actualizando contacto:', error);
    res.status(500).json({ error: 'Error al actualizar contacto', message: error.message });
  }
});

/**
 * DELETE /api/contacts/:contactId
 * 
 * Eliminar un contacto
 * 
 * MULTITENANT: Valida que el contacto pertenece al tenant actual
 */
router.delete('/contacts/:contactId', async (req: Request, res: Response) => {
  try {
    if (!req.tenant) {
      return res.status(400).json({ error: 'Tenant no identificado' });
    }

    const contactId = parseInt(req.params.contactId);
    if (isNaN(contactId)) {
      return res.status(400).json({ error: 'contactId inválido' });
    }

    const contact = await getContactById(contactId);
    if (!contact) {
      return res.status(404).json({ error: 'Contacto no encontrado' });
    }

    if (contact.store_id !== req.tenant.id) {
      return res.status(403).json({ error: 'No tienes acceso a este contacto' });
    }

    await deleteContact(contactId);

    res.json({ success: true, message: 'Contacto eliminado exitosamente' });
  } catch (error: any) {
    console.error('Error eliminando contacto:', error);
    res.status(500).json({ error: 'Error al eliminar contacto', message: error.message });
  }
});

/**
 * GET /api/conversations/:conversationId/locations
 * 
 * Obtener ubicaciones recibidas en mensajes de una conversación
 * 
 * MULTITENANT: Valida que la conversación pertenece al tenant actual
 */
router.get('/conversations/:conversationId/locations', async (req: Request, res: Response) => {
  try {
    if (!req.tenant) {
      return res.status(400).json({ error: 'Tenant no identificado' });
    }

    const conversationId = parseInt(req.params.conversationId);
    if (isNaN(conversationId)) {
      return res.status(400).json({ error: 'conversationId inválido' });
    }

    const conversation = await getConversationById(conversationId);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversación no encontrada' });
    }

    if (conversation.store_id !== req.tenant.id) {
      return res.status(403).json({ error: 'No tienes acceso a esta conversación' });
    }

    const locations = await getMessageLocations(conversationId);
    res.json(locations);
  } catch (error: any) {
    console.error('Error obteniendo ubicaciones:', error);
    res.status(500).json({ error: 'Error al obtener ubicaciones' });
  }
});

/**
 * POST /api/conversations/:conversationId/save-as-contact
 * 
 * Guardar una conversación como contacto
 * 
 * MULTITENANT: Valida que la conversación pertenece al tenant actual
 */
router.post('/conversations/:conversationId/save-as-contact', async (req: Request, res: Response) => {
  try {
    if (!req.tenant) {
      return res.status(400).json({ error: 'Tenant no identificado' });
    }

    const conversationId = parseInt(req.params.conversationId);
    if (isNaN(conversationId)) {
      return res.status(400).json({ error: 'conversationId inválido' });
    }

    const conversation = await getConversationById(conversationId);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversación no encontrada' });
    }

    if (conversation.store_id !== req.tenant.id) {
      return res.status(403).json({ error: 'No tienes acceso a esta conversación' });
    }

    const { name, delivery_address, delivery_latitude, delivery_longitude, notes } = req.body;

    const contact = await upsertContact(
      req.tenant.id,
      conversation.phone_number,
      name || null,
      delivery_address || null,
      delivery_latitude || null,
      delivery_longitude || null,
      notes || null
    );

    res.json({ success: true, contact });
  } catch (error: any) {
    console.error('Error guardando como contacto:', error);
    res.status(500).json({ error: 'Error al guardar como contacto', message: error.message });
  }
});

// ============================================================================
// ENDPOINTS DE NOTIFICACIONES PUSH
// ============================================================================

/**
 * POST /api/push/subscribe
 * 
 * Guarda una suscripción push para enviar notificaciones
 */
router.post('/push/subscribe', async (req: Request, res: Response) => {
  try {
    const { subscription } = req.body;

    if (!subscription || !subscription.endpoint || !subscription.keys) {
      return res.status(400).json({ error: 'Suscripción inválida' });
    }

    await savePushSubscription(subscription);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error guardando suscripción push:', error);
    res.status(500).json({ error: 'Error al guardar suscripción', message: error.message });
  }
});

/**
 * DELETE /api/push/unsubscribe
 * 
 * Elimina una suscripción push
 * Nota: Express no parsea body en DELETE por defecto, así que usamos POST o leemos el body manualmente
 */
router.post('/push/unsubscribe', async (req: Request, res: Response) => {
  try {
    const { endpoint } = req.body;

    if (!endpoint) {
      return res.status(400).json({ error: 'Endpoint requerido' });
    }

    await deletePushSubscription(endpoint);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error eliminando suscripción push:', error);
    res.status(500).json({ error: 'Error al eliminar suscripción', message: error.message });
  }
});

/**
 * POST /api/push/test
 * 
 * Envía una notificación push de prueba a todas las suscripciones activas
 * Útil para verificar que las notificaciones funcionan correctamente
 */
router.post('/push/test', async (req: Request, res: Response) => {
  try {
    const { sendPushNotification } = await import('../services/push-notification.service');
    
    await sendPushNotification(
      '🧪 Prueba de notificación',
      'Si ves esta notificación, las notificaciones push están funcionando correctamente!',
      {
        conversationId: 0,
        phoneNumber: '+50200000000',
        url: '/inbox'
      }
    );

    res.json({ 
      success: true, 
      message: 'Notificación de prueba enviada a todas las suscripciones activas' 
    });
  } catch (error: any) {
    console.error('Error enviando notificación de prueba:', error);
    res.status(500).json({ error: 'Error al enviar notificación de prueba', message: error.message });
  }
});

export default router;

