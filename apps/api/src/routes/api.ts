import { Router, Request, Response } from 'express';
// Importar tipos extendidos de Express
import '../types/express';
import { getConversations, getMessages, getConversationById, markConversationAsHandled, saveMessage, updateConversationMode, deleteConversation, getMessageById } from '../services/message.service';
import { getStoreById } from '../services/message.service';
import { sendText, sendMedia } from '../services/twilio.service';
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
    // En producción, esto debería subirse a un servicio de almacenamiento (S3, Cloudinary, etc.)
    // Por ahora, usaremos una URL local que será servida por el servidor
    const baseUrl = process.env.API_URL || `http://localhost:${process.env.PORT || 3333}`;
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
    console.log(`🖼️ Solicitud de media recibida: messageId=${req.params.messageId}`);
    
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

    console.log(`🔄 Descargando media de Twilio: ${url.hostname}${url.pathname}`);

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
      console.log(`📥 Respuesta de Twilio recibida: Status ${twilioRes.statusCode}, Content-Type: ${twilioRes.headers['content-type']}`);
      
      // Manejar redirecciones (301, 302, 307, 308)
      if (twilioRes.statusCode === 301 || twilioRes.statusCode === 302 || twilioRes.statusCode === 307 || twilioRes.statusCode === 308) {
        const location = twilioRes.headers.location;
        if (!location || typeof location !== 'string') {
          console.error(`❌ Redirección sin header Location: Status ${twilioRes.statusCode}`);
          return res.status(500).json({ error: 'Error: redirección sin Location header' });
        }
        
        console.log(`🔄 Siguiendo redirección a: ${location}`);
        
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
          console.log(`📥 Respuesta de redirección: Status ${redirectRes.statusCode}, Content-Type: ${redirectRes.headers['content-type']}`);
          
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
            console.log(`✅ Media enviada exitosamente para mensaje ${messageId}`);
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
      twilioRes.on('end', () => {
        console.log(`✅ Media enviada exitosamente para mensaje ${messageId}`);
      });
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

export default router;

