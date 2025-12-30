-- ============================================================================
-- Ejemplo de configuración de tenants con credenciales de Twilio
-- ============================================================================
-- 
-- Este archivo muestra cómo configurar cada tenant con sus propias credenciales
-- de Twilio, permitiendo que cada uno use producción o sandbox según sea necesario.
--
-- IMPORTANTE: Reemplaza los valores de ejemplo con tus credenciales reales
-- ============================================================================

-- Crunchy Paws: Configuración para PRODUCCIÓN
UPDATE stores 
SET 
  twilio_account_sid = 'AC...',                    -- Reemplaza con tu Account SID de producción
  twilio_auth_token = '...',                      -- Reemplaza con tu Auth Token de producción
  whatsapp_from = 'whatsapp:+14155238886',        -- Reemplaza con tu número de WhatsApp de producción
  environment = 'production'
WHERE slug = 'crunchypaws';

-- DKape: Configuración para SANDBOX
UPDATE stores 
SET 
  twilio_account_sid = 'AC...',                    -- Reemplaza con tu Account SID de sandbox
  twilio_auth_token = '...',                      -- Reemplaza con tu Auth Token de sandbox
  whatsapp_from = 'whatsapp:+14155238886',        -- Reemplaza con tu número de WhatsApp de sandbox
  environment = 'sandbox'
WHERE slug = 'dkape';

-- ============================================================================
-- Verificar configuración
-- ============================================================================
-- Ejecuta esta consulta para verificar que los tenants están configurados:
--
-- SELECT slug, name, environment, 
--        CASE 
--          WHEN twilio_account_sid IS NOT NULL THEN 'Configurado' 
--          ELSE 'No configurado' 
--        END as credenciales,
--        whatsapp_from
-- FROM stores;
-- ============================================================================

-- ============================================================================
-- Notas importantes:
-- ============================================================================
-- 1. Si un tenant NO tiene credenciales configuradas en la BD, el sistema
--    usará las variables de entorno (.env) como fallback.
--
-- 2. El campo 'whatsapp_from' permite que cada tenant use un número diferente.
--    Esto es útil para tener producción y sandbox en el mismo sistema.
--
-- 3. El campo 'environment' es informativo y puede usarse para lógica adicional
--    si es necesario en el futuro.
--
-- 4. Prioridad de configuración:
--    a) Credenciales del tenant en la BD (tabla stores) - PRIORIDAD ALTA
--    b) Variables de entorno (.env) - FALLBACK
-- ============================================================================

