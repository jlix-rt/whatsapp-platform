import { Router, Request, Response } from 'express';
// Importar tipos extendidos de Express
import '../types/express';
import { handleMessage as handleCrunchypaws } from '../flows/crunchypaws.flow';
import { handleMessage as handleDkape } from '../flows/dkape.flow';

const router = Router();

/**
 * POST /webhook/whatsapp
 * 
 * Endpoint para recibir webhooks de WhatsApp Business API (Twilio)
 * 
 * MULTITENANT: El tenant se identifica automáticamente desde el subdominio
 * mediante el middleware tenant.middleware.ts y está disponible como req.tenant
 */
router.post('/whatsapp', async (req: Request, res: Response) => {
  // Validar que el tenant fue identificado por el middleware
  if (!req.tenant) {
    return res.status(400).json({ error: 'Tenant no identificado' });
  }

  const tenant = req.tenant;
  
  
  try {
    // Determinar qué flow usar basado en el slug del tenant
    if (tenant.slug === 'crunchypaws') {
      await handleCrunchypaws(req, res, tenant.id);
    } else if (tenant.slug === 'dkape') {
      await handleDkape(req, res, tenant.id);
    } else {
      // Flow genérico para otras tiendas (usar crunchypaws como default)
      await handleCrunchypaws(req, res, tenant.id);
    }
  } catch (error) {
    console.error('Error en webhook:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

export default router;

