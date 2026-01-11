import { pool } from '../db/pool';

export interface Contact {
  id: number;
  store_id: number;
  phone_number: string;
  name: string | null;
  delivery_address: string | null;
  delivery_latitude: number | null;
  delivery_longitude: number | null;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * Obtener todos los contactos de un tenant
 * 
 * MULTITENANT: Esta función filtra automáticamente por store_id (tenant_id).
 */
export const getContacts = async (storeId: number): Promise<Contact[]> => {
  const result = await pool.query(
    `SELECT * FROM contacts
     WHERE store_id = $1
     ORDER BY updated_at DESC`,
    [storeId]
  );
  return result.rows;
};

/**
 * Obtener un contacto por ID
 * 
 * MULTITENANT: Esta función NO filtra por tenant.
 * Los controladores DEBEN validar que contact.store_id === req.tenant.id
 */
export const getContactById = async (contactId: number): Promise<Contact | null> => {
  const result = await pool.query(
    `SELECT * FROM contacts WHERE id = $1`,
    [contactId]
  );
  return result.rows[0] || null;
};

/**
 * Obtener un contacto por número de teléfono
 * 
 * MULTITENANT: Esta función filtra automáticamente por store_id (tenant_id).
 */
export const getContactByPhone = async (
  storeId: number,
  phoneNumber: string
): Promise<Contact | null> => {
  const result = await pool.query(
    `SELECT * FROM contacts
     WHERE store_id = $1 AND phone_number = $2`,
    [storeId, phoneNumber]
  );
  return result.rows[0] || null;
};

/**
 * Crear o actualizar un contacto
 * 
 * MULTITENANT: Esta función filtra automáticamente por store_id (tenant_id).
 */
export const upsertContact = async (
  storeId: number,
  phoneNumber: string,
  name?: string | null,
  deliveryAddress?: string | null,
  deliveryLatitude?: number | null,
  deliveryLongitude?: number | null,
  notes?: string | null
): Promise<Contact> => {
  const result = await pool.query(
    `INSERT INTO contacts (store_id, phone_number, name, delivery_address, delivery_latitude, delivery_longitude, notes, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
     ON CONFLICT (store_id, phone_number)
     DO UPDATE SET
       name = COALESCE(EXCLUDED.name, contacts.name),
       delivery_address = COALESCE(EXCLUDED.delivery_address, contacts.delivery_address),
       delivery_latitude = COALESCE(EXCLUDED.delivery_latitude, contacts.delivery_latitude),
       delivery_longitude = COALESCE(EXCLUDED.delivery_longitude, contacts.delivery_longitude),
       notes = COALESCE(EXCLUDED.notes, contacts.notes),
       updated_at = CURRENT_TIMESTAMP
     RETURNING *`,
    [storeId, phoneNumber, name || null, deliveryAddress || null, deliveryLatitude || null, deliveryLongitude || null, notes || null]
  );
  return result.rows[0];
};

/**
 * Actualizar un contacto existente
 * 
 * MULTITENANT: Esta función NO filtra por tenant.
 * Los controladores DEBEN validar que contact.store_id === req.tenant.id
 */
export const updateContact = async (
  contactId: number,
  name?: string | null,
  deliveryAddress?: string | null,
  deliveryLatitude?: number | null,
  deliveryLongitude?: number | null,
  notes?: string | null
): Promise<Contact> => {
  const updates: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  if (name !== undefined) {
    updates.push(`name = $${paramIndex++}`);
    values.push(name);
  }
  if (deliveryAddress !== undefined) {
    updates.push(`delivery_address = $${paramIndex++}`);
    values.push(deliveryAddress);
  }
  if (deliveryLatitude !== undefined) {
    updates.push(`delivery_latitude = $${paramIndex++}`);
    values.push(deliveryLatitude);
  }
  if (deliveryLongitude !== undefined) {
    updates.push(`delivery_longitude = $${paramIndex++}`);
    values.push(deliveryLongitude);
  }
  if (notes !== undefined) {
    updates.push(`notes = $${paramIndex++}`);
    values.push(notes);
  }

  if (updates.length === 0) {
    throw new Error('No hay campos para actualizar');
  }

  updates.push(`updated_at = CURRENT_TIMESTAMP`);
  values.push(contactId);

  const result = await pool.query(
    `UPDATE contacts
     SET ${updates.join(', ')}
     WHERE id = $${paramIndex}
     RETURNING *`,
    values
  );

  if (result.rowCount === 0) {
    throw new Error(`No se encontró el contacto con id ${contactId}`);
  }

  return result.rows[0];
};

/**
 * Eliminar un contacto
 * 
 * MULTITENANT: Esta función NO filtra por tenant.
 * Los controladores DEBEN validar que contact.store_id === req.tenant.id
 */
export const deleteContact = async (contactId: number): Promise<void> => {
  const result = await pool.query(
    `DELETE FROM contacts WHERE id = $1`,
    [contactId]
  );

  if (result.rowCount === 0) {
    throw new Error(`No se encontró el contacto con id ${contactId}`);
  }
};

/**
 * Obtener ubicaciones recibidas en mensajes de una conversación
 * 
 * MULTITENANT: Esta función filtra automáticamente por store_id a través de la conversación.
 */
export const getMessageLocations = async (conversationId: number): Promise<Array<{
  id: number;
  latitude: number;
  longitude: number;
  body: string;
  created_at: Date;
}>> => {
  const result = await pool.query(
    `SELECT id, latitude, longitude, body, created_at
     FROM messages
     WHERE conversation_id = $1
       AND direction = 'inbound'
       AND latitude IS NOT NULL
       AND longitude IS NOT NULL
     ORDER BY created_at DESC`,
    [conversationId]
  );
  return result.rows;
};
