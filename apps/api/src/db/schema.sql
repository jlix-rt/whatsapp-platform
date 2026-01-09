-- Tabla de tiendas
CREATE TABLE IF NOT EXISTS stores (
  id SERIAL PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  twilio_account_sid TEXT,
  twilio_auth_token TEXT,
  whatsapp_from TEXT,
  environment TEXT CHECK (environment IN ('sandbox', 'production'))
);

-- Migración: agregar campos de Twilio si no existen
DO $$ 
BEGIN
  -- Agregar twilio_account_sid si no existe
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'stores' 
                 AND column_name = 'twilio_account_sid') THEN
    ALTER TABLE stores ADD COLUMN twilio_account_sid TEXT;
  END IF;
  
  -- Agregar twilio_auth_token si no existe
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'stores' 
                 AND column_name = 'twilio_auth_token') THEN
    ALTER TABLE stores ADD COLUMN twilio_auth_token TEXT;
  END IF;
  
  -- Agregar whatsapp_from si no existe
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'stores' 
                 AND column_name = 'whatsapp_from') THEN
    ALTER TABLE stores ADD COLUMN whatsapp_from TEXT;
  END IF;
  
  -- Agregar environment si no existe
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'stores' 
                 AND column_name = 'environment') THEN
    ALTER TABLE stores ADD COLUMN environment TEXT CHECK (environment IN ('sandbox', 'production'));
  END IF;
END $$;

-- Insertar tiendas por defecto si no existen
INSERT INTO stores (slug, name)
VALUES
  ('crunchypaws', 'Crunchy Paws'),
  ('dkape', 'DKape')
ON CONFLICT (slug) DO NOTHING;

-- Tabla de conversaciones
CREATE TABLE IF NOT EXISTS conversations (
  id SERIAL PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  phone_number VARCHAR(50) NOT NULL,
  mode VARCHAR(10) NOT NULL DEFAULT 'BOT' CHECK (mode IN ('BOT', 'HUMAN')),
  human_handled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(store_id, phone_number)
);

-- Migración: cambiar store_id de VARCHAR a INTEGER si es necesario
DO $$ 
BEGIN
  -- Cambiar tipo de columna store_id si es VARCHAR
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'conversations' 
    AND column_name = 'store_id' 
    AND data_type = 'character varying'
  ) THEN
    -- Primero eliminar la constraint UNIQUE si existe
    ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_store_id_phone_number_key;
    
    -- Migrar datos: convertir slugs a IDs
    -- Nota: Esto asume que los valores actuales son slugs válidos
    UPDATE conversations c
    SET store_id = s.id
    FROM stores s
    WHERE c.store_id::text = s.slug;
    
    -- Cambiar el tipo de columna
    ALTER TABLE conversations ALTER COLUMN store_id TYPE INTEGER USING store_id::integer;
    
    -- Recrear la constraint UNIQUE
    ALTER TABLE conversations ADD CONSTRAINT conversations_store_id_phone_number_key UNIQUE(store_id, phone_number);
    
    -- Agregar FK si no existe
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints 
      WHERE table_name = 'conversations' 
      AND constraint_name = 'conversations_store_id_fkey'
    ) THEN
      ALTER TABLE conversations ADD CONSTRAINT conversations_store_id_fkey 
        FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE;
    END IF;
  END IF;
  
  -- Agregar FK si la tabla ya existe pero no tiene la constraint
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE table_name = 'conversations' 
    AND constraint_name = 'conversations_store_id_fkey'
  ) THEN
    ALTER TABLE conversations ADD CONSTRAINT conversations_store_id_fkey 
      FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE;
  END IF;
  
  -- Actualizar el tamaño del campo phone_number si ya existe
  IF EXISTS (SELECT 1 FROM information_schema.columns 
             WHERE table_name = 'conversations' 
             AND column_name = 'phone_number' 
             AND character_maximum_length < 50) THEN
    ALTER TABLE conversations ALTER COLUMN phone_number TYPE VARCHAR(50);
  END IF;
  
  -- Agregar columna mode si no existe
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'conversations' 
                 AND column_name = 'mode') THEN
    ALTER TABLE conversations ADD COLUMN mode VARCHAR(10) NOT NULL DEFAULT 'BOT';
    ALTER TABLE conversations ADD CONSTRAINT conversations_mode_check CHECK (mode IN ('BOT', 'HUMAN'));
  END IF;
  
  -- Agregar columna human_handled si no existe
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'conversations' 
                 AND column_name = 'human_handled') THEN
    ALTER TABLE conversations ADD COLUMN human_handled BOOLEAN NOT NULL DEFAULT false;
  END IF;
  
  -- Agregar columna deleted_at si no existe (para soft delete)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'conversations' 
                 AND column_name = 'deleted_at') THEN
    ALTER TABLE conversations ADD COLUMN deleted_at TIMESTAMP NULL;
  END IF;
END $$;

-- Tabla de mensajes
CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  direction VARCHAR(10) NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  body TEXT NOT NULL,
  twilio_message_sid VARCHAR(100),
  media_url TEXT,
  media_type VARCHAR(50),
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Migración: agregar campos de media y ubicación si no existen
DO $$ 
BEGIN
  -- Agregar media_url si no existe
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'messages' 
                 AND column_name = 'media_url') THEN
    ALTER TABLE messages ADD COLUMN media_url TEXT;
  END IF;
  
  -- Agregar media_type si no existe
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'messages' 
                 AND column_name = 'media_type') THEN
    ALTER TABLE messages ADD COLUMN media_type VARCHAR(50);
  END IF;
  
  -- Agregar latitude si no existe
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'messages' 
                 AND column_name = 'latitude') THEN
    ALTER TABLE messages ADD COLUMN latitude DECIMAL(10, 8);
  END IF;
  
  -- Agregar longitude si no existe
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'messages' 
                 AND column_name = 'longitude') THEN
    ALTER TABLE messages ADD COLUMN longitude DECIMAL(11, 8);
  END IF;
END $$;

-- Índices para mejorar rendimiento
CREATE INDEX IF NOT EXISTS idx_conversations_store_phone ON conversations(store_id, phone_number);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);

