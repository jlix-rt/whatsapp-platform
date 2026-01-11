import { sendText } from '../services/twilio.service';
import { getConversation, getOrCreateConversation, saveMessage, updateConversationMode, getStoreById, restoreConversation } from '../services/message.service';
import { Store } from '../services/message.service';

/**
 * Flow de manejo de mensajes para DKape
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

  // Obtener o crear conversación
  let conversation = await getConversation(storeId, from);
  if (!conversation) {
    conversation = await getOrCreateConversation(storeId, from);
  } else if (conversation.deleted_at) {
    // Si la conversación está eliminada, restaurarla y ponerla en modo BOT
    conversation = await restoreConversation(conversation.id);
  }
  
  // Guardar mensaje entrante
  await saveMessage(conversation.id, 'inbound', body, req.body.MessageSid);

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

  // Modo BOT: responder automáticamente
  if (conversation.mode === 'BOT') {
    // Si el usuario responde "2", cambiar a modo HUMAN
    if (body === '2') {
      await updateConversationMode(conversation.id, 'HUMAN');
      const responseMessage = 'Alguien se comunicará contigo en breve';
      const sent = await sendText(from, responseMessage, tenant);
      await saveMessage(conversation.id, 'outbound', responseMessage);
      return res.status(200).end();
    }

    // Responder con el menú automático
    const menuMessage = '¿Qué deseas hacer?\n1. Hacer pedido\n2. Hablar con una persona';
    const sent = await sendText(from, menuMessage, tenant);
    await saveMessage(conversation.id, 'outbound', menuMessage);
    return res.status(200).end();
  }

  res.status(200).end();
};
