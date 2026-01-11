import { sendText } from '../services/twilio.service';
import { getConversation, getOrCreateConversation, saveMessage, getStoreById, restoreConversation } from '../services/message.service';
import { Store } from '../services/message.service';
import { notifyBotMessage } from '../services/push-notification.service';

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
  

  // Obtener el tenant completo para usar sus credenciales de Twilio
  const tenant = await getStoreById(storeId);
  if (!tenant) {
    console.error(`❌ Error: Store con ID ${storeId} no encontrado`);
    return res.status(500).json({ error: 'Error interno: tenant no encontrado' });
  }

  // Si la conversación está en modo HUMAN, solo guardar y no responder
  if (conversation.mode === 'HUMAN') {
    return res.status(200).end();
  }

  // Modo BOT: enviar notificación push y luego responder automáticamente
  if (conversation.mode === 'BOT') {
    // Enviar notificación push para alertar que hay un mensaje en modo BOT
    try {
      await notifyBotMessage(
        conversation.id,
        from,
        body || (mediaUrl ? '[Imagen]' : latitude && longitude ? '[Ubicación]' : '[Sin texto]'),
        tenant.name
      );
    } catch (error) {
      // No fallar si las notificaciones push fallan
      console.error('Error enviando notificación push:', error);
    }
    const welcomeMessage = 'Hola, mucho gusto. Gracias por escribirnos. \nActualmente estamos trabajando en el canal de WhatsApp por lo que podemos demorarnos en contestar.\nTambién puedes escribirnos por instagram (@crunchypawsgt), facebook (Cruchy paws) o al WhatssApp +50258569667';
    
    // Enviar mensaje de bienvenida
    const sent = await sendText(from, welcomeMessage, tenant);
    await saveMessage(conversation.id, 'outbound', welcomeMessage);
    
    // NO cambiar a modo HUMAN aquí - la conversación permanece en BOT
    // Solo se cambiará a HUMAN cuando un humano responda manualmente desde el inbox
    
    return res.status(200).end();
  }

  res.status(200).end();
};
