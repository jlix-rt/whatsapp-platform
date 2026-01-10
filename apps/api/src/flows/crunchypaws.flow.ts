import { sendText } from '../services/twilio.service';
import { getConversation, getOrCreateConversation, saveMessage, updateConversationMode, getStoreById, restoreConversation } from '../services/message.service';
import { Store } from '../services/message.service';

/**
 * Flow de manejo de mensajes para Crunchy Paws
 * 
 * MULTITENANT: Recibe storeId y obtiene el tenant completo para usar sus credenciales
 */
export const handleMessage = async (req: any, res: any, storeId: number) => {
  // Validar que req.body existe
  if (!req.body) {
    console.error('Error: req.body es undefined');
    return res.status(400).json({ error: 'Body requerido' });
  }

  const from = req.body.From;
  const body = (req.body.Body || '').trim();

  // Validar que From existe (requerido)
  if (!from) {
    console.error('Error: From no está presente en el body');
    return res.status(400).json({ error: 'From es requerido' });
  }

  // Extraer información de media (imágenes, videos, etc.)
  const numMedia = parseInt(req.body.NumMedia || '0');
  let mediaUrl: string | null = null;
  let mediaType: string | null = null;
  
  if (numMedia > 0 && req.body.MediaUrl0) {
    mediaUrl = req.body.MediaUrl0;
    mediaType = req.body.MediaContentType0 || null;
  }

  // Extraer información de ubicación
  const latitude = req.body.Latitude ? parseFloat(req.body.Latitude) : null;
  const longitude = req.body.Longitude ? parseFloat(req.body.Longitude) : null;

  // Obtener o crear conversación
  let conversation = await getConversation(storeId, from);
  if (!conversation) {
    conversation = await getOrCreateConversation(storeId, from);
  } else if (conversation.deleted_at) {
    // Si la conversación está eliminada, restaurarla y ponerla en modo BOT
    console.log(`♻️ Restaurando conversación eliminada ${conversation.id} para ${from}`);
    conversation = await restoreConversation(conversation.id);
  }
  
  // Guardar mensaje entrante con media y ubicación
  const savedMessage = await saveMessage(
    conversation.id, 
    'inbound', 
    body || (mediaUrl ? '[Imagen]' : latitude && longitude ? '[Ubicación]' : '[Sin texto]'), 
    req.body.MessageSid,
    mediaUrl,
    mediaType,
    latitude,
    longitude
  );
  
  // Log para debugging de media
  if (mediaUrl) {
    console.log(`📷 Mensaje con media guardado:`, {
      messageId: savedMessage.id,
      mediaUrl: mediaUrl.substring(0, 100) + '...',
      mediaType,
      conversationId: conversation.id
    });
  }

  // Obtener el tenant completo para usar sus credenciales de Twilio
  const tenant = await getStoreById(storeId);
  if (!tenant) {
    console.error(`❌ Error: Store con ID ${storeId} no encontrado`);
    return res.status(500).json({ error: 'Error interno: tenant no encontrado' });
  }

  // Si la conversación está en modo HUMAN, solo guardar y no responder
  if (conversation.mode === 'HUMAN') {
    console.log(`📝 Mensaje guardado (modo HUMAN) - Conversación ${conversation.id}`);
    return res.status(200).end();
  }

  // Modo BOT: enviar mensaje de bienvenida y cambiar a modo HUMAN
  if (conversation.mode === 'BOT') {
    const welcomeMessage = 'Hola, mucho gusto. Gracias por escribirnos. \nActualmente estamos trabajando en el canal de WhatsApp por lo que podemos demorarnos en contestar.\nTambién puedes escribirnos por instagram (@crunchypawsgt), facebook (Cruchy paws) o al WhatssApp +50258569667';
    
    // Enviar mensaje de bienvenida
    const sent = await sendText(from, welcomeMessage, tenant);
    await saveMessage(conversation.id, 'outbound', welcomeMessage);
    
    // Cambiar a modo HUMAN después de enviar el mensaje
    await updateConversationMode(conversation.id, 'HUMAN');
    
    console.log(`🤖 Mensaje de bienvenida enviado y conversación ${conversation.id} cambiada a modo HUMAN${sent ? '' : ' (simulado)'}`);
    return res.status(200).end();
  }

  res.status(200).end();
};
