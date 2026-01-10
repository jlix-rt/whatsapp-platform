-- Script para insertar 10 chats de prueba con números de Guatemala (+502)
-- Ejecutar este script después de haber ejecutado schema.sql

-- Obtener el ID de la primera tienda (asumiendo que existe)
-- Si no existe, usar el ID 1 por defecto
DO $$
DECLARE
    store_id_val INTEGER;
BEGIN
    -- Obtener el ID de la primera tienda (Crunchy Paws)
    SELECT id INTO store_id_val FROM stores WHERE slug = 'crunchypaws' LIMIT 1;
    
    -- Si no existe, usar el ID 1
    IF store_id_val IS NULL THEN
        store_id_val := 1;
    END IF;

    -- Insertar 10 conversaciones con números de Guatemala (+502)
    -- Usar ON CONFLICT para evitar duplicados si se ejecuta múltiples veces
    
    INSERT INTO conversations (store_id, phone_number, mode, human_handled, created_at, updated_at)
    VALUES
        (store_id_val, 'whatsapp:+50212345678', 'BOT', false, NOW() - INTERVAL '5 days', NOW() - INTERVAL '2 hours'),
        (store_id_val, 'whatsapp:+50223456789', 'HUMAN', true, NOW() - INTERVAL '4 days', NOW() - INTERVAL '1 hour'),
        (store_id_val, 'whatsapp:+50234567890', 'BOT', false, NOW() - INTERVAL '3 days', NOW() - INTERVAL '30 minutes'),
        (store_id_val, 'whatsapp:+50245678901', 'BOT', false, NOW() - INTERVAL '2 days', NOW() - INTERVAL '15 minutes'),
        (store_id_val, 'whatsapp:+50256789012', 'HUMAN', false, NOW() - INTERVAL '1 day', NOW() - INTERVAL '5 minutes'),
        (store_id_val, 'whatsapp:+50267890123', 'BOT', false, NOW() - INTERVAL '6 hours', NOW() - INTERVAL '10 minutes'),
        (store_id_val, 'whatsapp:+50278901234', 'BOT', false, NOW() - INTERVAL '4 hours', NOW() - INTERVAL '8 minutes'),
        (store_id_val, 'whatsapp:+50289012345', 'HUMAN', true, NOW() - INTERVAL '3 hours', NOW() - INTERVAL '3 minutes'),
        (store_id_val, 'whatsapp:+50290123456', 'BOT', false, NOW() - INTERVAL '2 hours', NOW() - INTERVAL '1 minute'),
        (store_id_val, 'whatsapp:+50201234567', 'BOT', false, NOW() - INTERVAL '1 hour', NOW())
    ON CONFLICT (store_id, phone_number) DO NOTHING;

    -- Insertar mensajes para cada conversación
    -- Conversación 1: +50212345678
    INSERT INTO messages (conversation_id, direction, body, created_at)
    SELECT c.id, 'inbound', 'Hola, tengo una pregunta sobre sus productos', NOW() - INTERVAL '2 hours'
    FROM conversations c
    WHERE c.phone_number = 'whatsapp:+50212345678' AND c.store_id = store_id_val
    LIMIT 1;
    
    INSERT INTO messages (conversation_id, direction, body, created_at)
    SELECT c.id, 'outbound', '¡Hola! Claro, con mucho gusto te ayudo. ¿Qué producto te interesa?', NOW() - INTERVAL '1 hour 55 minutes'
    FROM conversations c
    WHERE c.phone_number = 'whatsapp:+50212345678' AND c.store_id = store_id_val
    LIMIT 1;

    -- Conversación 2: +50223456789
    INSERT INTO messages (conversation_id, direction, body, created_at)
    SELECT c.id, 'inbound', 'Buenos días, quiero hacer un pedido', NOW() - INTERVAL '1 hour'
    FROM conversations c
    WHERE c.phone_number = 'whatsapp:+50223456789' AND c.store_id = store_id_val
    LIMIT 1;
    
    INSERT INTO messages (conversation_id, direction, body, created_at)
    SELECT c.id, 'outbound', 'Buenos días! Perfecto, ¿qué productos necesitas?', NOW() - INTERVAL '55 minutes'
    FROM conversations c
    WHERE c.phone_number = 'whatsapp:+50223456789' AND c.store_id = store_id_val
    LIMIT 1;

    -- Conversación 3: +50234567890
    INSERT INTO messages (conversation_id, direction, body, created_at)
    SELECT c.id, 'inbound', '¿Tienen productos disponibles?', NOW() - INTERVAL '30 minutes'
    FROM conversations c
    WHERE c.phone_number = 'whatsapp:+50234567890' AND c.store_id = store_id_val
    LIMIT 1;

    -- Conversación 4: +50245678901
    INSERT INTO messages (conversation_id, direction, body, created_at)
    SELECT c.id, 'inbound', 'Hola, necesito información sobre precios', NOW() - INTERVAL '15 minutes'
    FROM conversations c
    WHERE c.phone_number = 'whatsapp:+50245678901' AND c.store_id = store_id_val
    LIMIT 1;
    
    INSERT INTO messages (conversation_id, direction, body, created_at)
    SELECT c.id, 'outbound', 'Te puedo ayudar con eso. ¿Qué producto te interesa?', NOW() - INTERVAL '12 minutes'
    FROM conversations c
    WHERE c.phone_number = 'whatsapp:+50245678901' AND c.store_id = store_id_val
    LIMIT 1;

    -- Conversación 5: +50256789012
    INSERT INTO messages (conversation_id, direction, body, created_at)
    SELECT c.id, 'inbound', '¿Cuál es el horario de atención?', NOW() - INTERVAL '5 minutes'
    FROM conversations c
    WHERE c.phone_number = 'whatsapp:+50256789012' AND c.store_id = store_id_val
    LIMIT 1;

    -- Conversación 6: +50267890123
    INSERT INTO messages (conversation_id, direction, body, created_at)
    SELECT c.id, 'inbound', 'Quiero cancelar mi pedido', NOW() - INTERVAL '10 minutes'
    FROM conversations c
    WHERE c.phone_number = 'whatsapp:+50267890123' AND c.store_id = store_id_val
    LIMIT 1;
    
    INSERT INTO messages (conversation_id, direction, body, created_at)
    SELECT c.id, 'outbound', 'Entiendo. ¿Podrías darme el número de tu pedido?', NOW() - INTERVAL '8 minutes'
    FROM conversations c
    WHERE c.phone_number = 'whatsapp:+50267890123' AND c.store_id = store_id_val
    LIMIT 1;

    -- Conversación 7: +50278901234
    INSERT INTO messages (conversation_id, direction, body, created_at)
    SELECT c.id, 'inbound', 'Hola, ¿tienen envío a la capital?', NOW() - INTERVAL '8 minutes'
    FROM conversations c
    WHERE c.phone_number = 'whatsapp:+50278901234' AND c.store_id = store_id_val
    LIMIT 1;

    -- Conversación 8: +50289012345
    INSERT INTO messages (conversation_id, direction, body, created_at)
    SELECT c.id, 'inbound', 'Buenas tardes, tengo un problema con mi pedido', NOW() - INTERVAL '3 minutes'
    FROM conversations c
    WHERE c.phone_number = 'whatsapp:+50289012345' AND c.store_id = store_id_val
    LIMIT 1;
    
    INSERT INTO messages (conversation_id, direction, body, created_at)
    SELECT c.id, 'outbound', 'Lamento el inconveniente. ¿Podrías contarme qué pasó?', NOW() - INTERVAL '2 minutes'
    FROM conversations c
    WHERE c.phone_number = 'whatsapp:+50289012345' AND c.store_id = store_id_val
    LIMIT 1;

    -- Conversación 9: +50290123456
    INSERT INTO messages (conversation_id, direction, body, created_at)
    SELECT c.id, 'inbound', '¿Aceptan pagos en efectivo?', NOW() - INTERVAL '1 minute'
    FROM conversations c
    WHERE c.phone_number = 'whatsapp:+50290123456' AND c.store_id = store_id_val
    LIMIT 1;

    -- Conversación 10: +50201234567
    INSERT INTO messages (conversation_id, direction, body, created_at)
    SELECT c.id, 'inbound', 'Hola, quiero hacer una consulta', NOW()
    FROM conversations c
    WHERE c.phone_number = 'whatsapp:+50201234567' AND c.store_id = store_id_val
    LIMIT 1;

    RAISE NOTICE '✅ Se insertaron 10 conversaciones de prueba con números de Guatemala (+502)';
END $$;
