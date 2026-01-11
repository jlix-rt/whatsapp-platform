-- Migración: Crear tabla de contactos
-- Ejecutar este script si la tabla contacts no existe

-- Tabla de contactos
CREATE TABLE IF NOT EXISTS contacts (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  phone_number VARCHAR(50) NOT NULL,
  name TEXT,
  delivery_address TEXT,
  delivery_latitude DECIMAL(10, 8),
  delivery_longitude DECIMAL(11, 8),
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(store_id, phone_number)
);

-- Crear índice si no existe
CREATE INDEX IF NOT EXISTS idx_contacts_store_phone ON contacts(store_id, phone_number);

-- Crear índice para ubicaciones en mensajes si no existe
CREATE INDEX IF NOT EXISTS idx_messages_location ON messages(latitude, longitude) WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
