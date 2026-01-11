import * as dotenv from 'dotenv';
import * as path from 'path';
import express from 'express';
// Importar tipos de Express extendidos (debe estar antes de otros imports)
import './types/express';
import webhookRoutes from './routes/webhook';
import inboxRoutes from './routes/inbox';
import authRoutes from './routes/auth';
import apiRoutes from './routes/api';
import { initSchema } from './db/pool';
import { tenantMiddleware, optionalTenantMiddleware } from './middleware/tenant.middleware';
import { corsMiddleware } from './middleware/cors.middleware';

// Variables de entorno ya cargadas en pool.ts

const app = express();

// ============================================================================
// MIDDLEWARE DE CORS DINÁMICO Y SEGURO
// ============================================================================
// Permite requests desde:
// - *.inbox.tiendasgt.com (producción)
// - *.tiendasgt.com (producción)
// - http://localhost:4200 (desarrollo)
// - Requests sin Origin (Twilio / server-to-server)
app.use(corsMiddleware);

// IMPORTANTE: Los middlewares de body parsing deben ir ANTES de las rutas
// Twilio envía datos como application/x-www-form-urlencoded
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
// También soportar JSON para testing
app.use(express.json({ limit: '10mb' }));

// Middleware de logging para debug (después del body parsing)
app.use((req, res, next) => {
  if (req.url.startsWith('/webhook')) {
    console.log('📨 Webhook recibido:', {
      method: req.method,
      url: req.url,
      contentType: req.headers['content-type'],
      hasBody: !!req.body,
      bodyKeys: req.body ? Object.keys(req.body) : 'no body',
      bodySample: req.body ? JSON.stringify(req.body).substring(0, 200) : 'no body'
    });
  }
  next();
});

// ============================================================================
// MIDDLEWARE MULTITENANT
// ============================================================================
// Aplicar middleware de tenant a todas las rutas EXCEPTO health check
// El middleware extrae el tenant_id del subdominio y valida que existe
// El tenant se adjunta al request como req.tenant para uso en controladores
app.use((req, res, next) => {
  // Health check no requiere tenant
  if (req.path === '/health') {
    return next();
  }
  
  // Endpoints de uploads no requieren tenant (Twilio necesita acceso público)
  if (req.path.startsWith('/api/uploads/')) {
    return next();
  }
  
  // Todas las demás rutas requieren tenant
  // El middleware usa x-forwarded-host (de nginx) o host como fallback
  return tenantMiddleware(req, res, next);
});

// Rutas
app.use('/webhook', webhookRoutes);
app.use('/inbox', inboxRoutes);
app.use('/auth', authRoutes);
app.use('/api', apiRoutes);

// Health check sin tenant (para monitoreo)
app.get('/health', (_, res) => res.send('OK'));

const PORT = process.env.PORT || 3333;

// Inicializar esquema y luego iniciar servidor
initSchema().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 WhatsApp API corriendo en puerto ${PORT}`);
    console.log(`🏪 Modo multitenant: Identificación por subdominio`);
    console.log(`   Ejemplo: crunchypaws.inbox.tiendasgt.com → tenant_id = "crunchypaws"`);
  });
}).catch((error) => {
  console.error('Error inicializando aplicación:', error);
  process.exit(1);
});

