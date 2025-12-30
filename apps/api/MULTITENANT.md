# Sistema Multitenant - Documentación

## Resumen

Este backend ha sido refactorizado para funcionar como un sistema multitenant basado en subdominios. Un solo proceso y una sola base de datos manejan múltiples tiendas, identificadas automáticamente por el subdominio del request.

## Arquitectura

### Identificación del Tenant

El tenant se identifica automáticamente desde el subdominio del request:

- **crunchypaws.inbox.tiendasgt.com** → `tenant_id = "crunchypaws"`
- **dkape.inbox.tiendasgt.com** → `tenant_id = "dkape"`

El subdominio se extrae de:
1. `req.headers['x-forwarded-host']` (cuando hay proxy reverso como nginx)
2. `req.headers.host` (fallback directo)

### Middleware de Tenant

El middleware `tenant.middleware.ts` se ejecuta en todas las rutas (excepto `/health`) y:

1. Extrae el `tenant_id` del subdominio
2. Valida que el tenant existe en la base de datos
3. Adjunta el objeto `Store` completo al request como `req.tenant`

### Aislamiento de Datos

Todas las consultas a la base de datos filtran automáticamente por `store_id` (que corresponde al `tenant_id`):

- Las conversaciones están vinculadas a un `store_id`
- Los mensajes están vinculados a conversaciones, que a su vez están vinculadas a un `store_id`
- Los controladores validan que las conversaciones pertenecen al tenant actual antes de permitir acceso

## Estructura de Archivos

```
apps/api/src/
├── middleware/
│   └── tenant.middleware.ts      # Middleware que identifica y valida el tenant
├── types/
│   └── express.d.ts              # Extensión de tipos para req.tenant
├── routes/
│   ├── webhook.ts                # Webhooks de WhatsApp (usa req.tenant)
│   ├── inbox.ts                  # Endpoints del inbox (usa req.tenant)
│   └── api.ts                    # API REST (usa req.tenant)
├── services/
│   ├── message.service.ts        # Servicio de mensajes (filtra por tenant)
│   └── twilio.service.ts         # Servicio de Twilio (usa credenciales del tenant)
└── flows/
    ├── crunchypaws.flow.ts       # Flow específico de Crunchy Paws
    └── dkape.flow.ts             # Flow específico de DKape
```

## Uso en Controladores

### Ejemplo Básico

```typescript
router.get('/conversations', async (req: Request, res: Response) => {
  // Validar que el tenant fue identificado por el middleware
  if (!req.tenant) {
    return res.status(400).json({ error: 'Tenant no identificado' });
  }

  // Usar req.tenant.id para filtrar conversaciones
  const conversations = await getConversations(req.tenant.id);
  res.json(conversations);
});
```

### Validación de Acceso a Conversaciones

Cuando se accede a una conversación específica, siempre validar que pertenece al tenant:

```typescript
router.get('/conversations/:conversationId/messages', async (req: Request, res: Response) => {
  if (!req.tenant) {
    return res.status(400).json({ error: 'Tenant no identificado' });
  }

  const conversation = await getConversationById(conversationId);
  if (!conversation) {
    return res.status(404).json({ error: 'Conversación no encontrada' });
  }

  // IMPORTANTE: Validar que la conversación pertenece al tenant actual
  if (conversation.store_id !== req.tenant.id) {
    return res.status(403).json({ error: 'No tienes acceso a esta conversación' });
  }

  const messages = await getMessages(conversationId);
  res.json(messages);
});
```

## Credenciales de Twilio por Tenant

Cada tenant puede tener sus propias credenciales de Twilio almacenadas en la base de datos:

- `twilio_account_sid`
- `twilio_auth_token`
- `whatsapp_from` (número de WhatsApp específico del tenant)
- `environment` ('sandbox' o 'production')

**Prioridad de configuración:**
1. **Credenciales del tenant en la base de datos** (tabla `stores`) - **PRIORIDAD ALTA**
2. **Variables de entorno globales** (`.env`) - **FALLBACK**

### Configuración para Producción vs Sandbox

**Ejemplo: Crunchy Paws en producción, DKape en sandbox**

```sql
-- Crunchy Paws: Producción
UPDATE stores 
SET twilio_account_sid = 'AC...',
    twilio_auth_token = '...',
    whatsapp_from = 'whatsapp:+14155238886',  -- Número de producción
    environment = 'production'
WHERE slug = 'crunchypaws';

-- DKape: Sandbox
UPDATE stores 
SET twilio_account_sid = 'AC...',
    twilio_auth_token = '...',
    whatsapp_from = 'whatsapp:+14155238886',  -- Número de sandbox (puede ser diferente)
    environment = 'sandbox'
WHERE slug = 'dkape';
```

**Variables de entorno (.env) como fallback:**

```env
# Credenciales globales (usadas si el tenant no tiene credenciales propias)
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
WHATSAPP_FROM=whatsapp:+14155238886
```

**Nota:** El campo `whatsapp_from` en la tabla `stores` permite que cada tenant use un número diferente. Si un tenant no tiene `whatsapp_from` configurado, se usa `WHATSAPP_FROM` del `.env`.

### Uso en Servicios

```typescript
// Enviar mensaje usando las credenciales del tenant
// El servicio automáticamente usa whatsapp_from del tenant si está configurado,
// o WHATSAPP_FROM del .env como fallback
await sendText(phoneNumber, message, req.tenant);
```

### Logging

El servicio loguea qué número se está usando y de dónde viene:

```
📱 Enviando mensaje desde: whatsapp:+14155238886 (fuente: base de datos (tenant), tenant: crunchypaws)
📱 Enviando mensaje desde: whatsapp:+14155238886 (fuente: variables de entorno (.env), tenant: dkape)
```

## Configuración

### Variables de Entorno

El archivo `.env` solo debe contener variables comunes:

```env
# Base de datos (compartida por todos los tenants)
DB_HOST=localhost
DB_PORT=5432
DB_NAME=whatsapp_api
DB_USER=postgres
DB_PASSWORD=

# Credenciales de Twilio (fallback si el tenant no tiene credenciales propias)
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
WHATSAPP_FROM=

# Puerto del servidor
PORT=3333
```

### Base de Datos

La tabla `stores` contiene la información de cada tenant:

```sql
CREATE TABLE stores (
  id SERIAL PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,              -- tenant_id (ej: "crunchypaws")
  name TEXT NOT NULL,
  twilio_account_sid TEXT,                -- Credenciales opcionales del tenant
  twilio_auth_token TEXT,
  whatsapp_from TEXT,
  environment TEXT CHECK (environment IN ('sandbox', 'production'))
);
```

## Agregar un Nuevo Tenant

Para agregar un nuevo tenant:

1. **Insertar en la base de datos:**
   ```sql
   INSERT INTO stores (slug, name) VALUES ('nuevatienda', 'Nueva Tienda');
   ```

2. **Configurar credenciales (opcional):**
   ```sql
   UPDATE stores 
   SET twilio_account_sid = '...',
       twilio_auth_token = '...',
       whatsapp_from = 'whatsapp:+...'
   WHERE slug = 'nuevatienda';
   ```

3. **Configurar DNS:**
   - Agregar subdominio: `nuevatienda.inbox.tiendasgt.com`
   - Apuntar al mismo servidor donde corre el backend

4. **Configurar nginx (si aplica):**
   - No es necesario cambiar la configuración de nginx
   - El backend identifica el tenant automáticamente desde el subdominio

**¡Eso es todo!** No necesitas:
- Levantar un nuevo proceso
- Configurar un nuevo puerto
- Crear una nueva base de datos
- Modificar código del backend

## Flujos de Mensajes

Cada tenant puede tener su propio flow de mensajes. Los flows se determinan en `webhook.ts`:

```typescript
if (tenant.slug === 'crunchypaws') {
  await handleCrunchypaws(req, res, tenant.id);
} else if (tenant.slug === 'dkape') {
  await handleDkape(req, res, tenant.id);
} else {
  // Flow genérico para otras tiendas
  await handleCrunchypaws(req, res, tenant.id);
}
```

Para agregar un nuevo flow:

1. Crear `flows/nuevatienda.flow.ts`
2. Importar en `webhook.ts`
3. Agregar condición en el switch

## Seguridad

### Validaciones Implementadas

1. **Middleware de Tenant:** Valida que el tenant existe antes de procesar cualquier request
2. **Validación de Conversaciones:** Los controladores validan que las conversaciones pertenecen al tenant actual
3. **Aislamiento de Datos:** Todas las consultas filtran por `store_id`

### Recomendaciones

- En producción, proteger el endpoint `/api/stores` (solo para administración)
- Considerar agregar autenticación adicional si es necesario
- Monitorear logs para detectar intentos de acceso no autorizados

## Debugging

### Logs del Middleware

El middleware loguea el tenant identificado en modo desarrollo:

```
🏪 Tenant identificado: crunchypaws (ID: 1)
```

### Verificar Tenant en Request

En cualquier controlador, puedes verificar el tenant:

```typescript
console.log('Tenant actual:', req.tenant?.slug);
console.log('Tenant ID:', req.tenant?.id);
```

## Preguntas Frecuentes

### ¿Qué pasa si el subdominio no tiene formato correcto?

El middleware retorna un error 400 con el mensaje: "Subdominio inválido. Formato esperado: {tenant_id}.inbox.tiendasgt.com"

### ¿Qué pasa si el tenant no existe en la base de datos?

El middleware retorna un error 404 con el mensaje: "Tienda con slug '{tenant_id}' no encontrada"

### ¿Puedo usar el mismo número de WhatsApp para múltiples tenants?

Sí, pero cada tenant puede tener su propio número configurado en `whatsapp_from`. Si no está configurado, se usa la variable de entorno global.

### ¿Cómo funciona en desarrollo local?

En desarrollo local, puedes usar:
- `localhost:3333` (sin tenant, solo para `/health`)
- `crunchypaws.localhost:3333` (con tenant)

El middleware detecta el subdominio incluso en desarrollo.

