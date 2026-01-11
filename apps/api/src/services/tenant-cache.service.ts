import { Store, getStoreBySlug, getAllStores } from './message.service';

/**
 * Servicio de caché para tenants
 * 
 * Optimiza el rendimiento evitando consultas repetidas a la base de datos
 * para obtener información de tenants que no cambia frecuentemente.
 * 
 * Los datos se cargan una vez al inicializar el servicio y se mantienen en memoria.
 * Si es necesario actualizar el caché, se puede llamar a refreshCache().
 */
class TenantCacheService {
  private cache: Map<string, Store> = new Map();
  private initialized: boolean = false;

  /**
   * Inicializa el caché cargando todos los tenants de la base de datos
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      console.log('📦 [TENANT CACHE] Caché ya inicializado');
      return;
    }

    try {
      console.log('📦 [TENANT CACHE] Inicializando caché de tenants...');
      const stores = await getAllStores();
      
      this.cache.clear();
      stores.forEach(store => {
        this.cache.set(store.slug, store);
      });

      this.initialized = true;
      console.log(`✅ [TENANT CACHE] Caché inicializado con ${stores.length} tenant(s):`, 
        stores.map(s => s.slug).join(', '));
      
      // Log de credenciales (sin mostrar valores sensibles)
      stores.forEach(store => {
        console.log(`   📊 [TENANT CACHE] ${store.slug}:`, {
          id: store.id,
          name: store.name,
          hasTwilioAccountSid: !!store.twilio_account_sid,
          hasTwilioAuthToken: !!store.twilio_auth_token,
          hasWhatsappFrom: !!store.whatsapp_from,
          environment: store.environment
        });
      });
    } catch (error: any) {
      console.error('❌ [TENANT CACHE] Error inicializando caché:', error);
      throw error;
    }
  }

  /**
   * Obtiene un tenant del caché por su slug
   * Si no está en caché, consulta la BD y actualiza el caché
   */
  async getTenant(slug: string): Promise<Store | null> {
    // Si el caché está inicializado y tiene el tenant, retornarlo
    if (this.initialized && this.cache.has(slug)) {
      return this.cache.get(slug)!;
    }

    // Si no está en caché, consultar BD y actualizar caché
    console.log(`📦 [TENANT CACHE] Tenant '${slug}' no encontrado en caché, consultando BD...`);
    const store = await getStoreBySlug(slug);
    
    if (store) {
      this.cache.set(slug, store);
      console.log(`✅ [TENANT CACHE] Tenant '${slug}' agregado al caché`);
    }
    
    return store;
  }

  /**
   * Actualiza el caché de un tenant específico
   * Útil cuando se actualiza información del tenant en la BD
   */
  async refreshTenant(slug: string): Promise<void> {
    console.log(`🔄 [TENANT CACHE] Actualizando caché para tenant '${slug}'...`);
    const store = await getStoreBySlug(slug);
    
    if (store) {
      this.cache.set(slug, store);
      console.log(`✅ [TENANT CACHE] Tenant '${slug}' actualizado en caché`);
    } else {
      // Si el tenant ya no existe, removerlo del caché
      this.cache.delete(slug);
      console.log(`🗑️  [TENANT CACHE] Tenant '${slug}' removido del caché (no existe en BD)`);
    }
  }

  /**
   * Refresca todo el caché recargando todos los tenants
   */
  async refreshCache(): Promise<void> {
    console.log('🔄 [TENANT CACHE] Refrescando todo el caché...');
    this.initialized = false;
    await this.initialize();
  }

  /**
   * Verifica si el caché está inicializado
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Obtiene todos los tenants del caché
   */
  getAllTenants(): Store[] {
    return Array.from(this.cache.values());
  }

  /**
   * Limpia el caché (útil para testing)
   */
  clear(): void {
    this.cache.clear();
    this.initialized = false;
    console.log('🗑️  [TENANT CACHE] Caché limpiado');
  }
}

// Exportar instancia singleton
export const tenantCache = new TenantCacheService();
