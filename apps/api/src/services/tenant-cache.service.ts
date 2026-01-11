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
      return;
    }

    try {
      const stores = await getAllStores();
      
      this.cache.clear();
      stores.forEach(store => {
        this.cache.set(store.slug, store);
      });

      this.initialized = true;
      
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
    const store = await getStoreBySlug(slug);
    
    if (store) {
      this.cache.set(slug, store);
    }
    
    return store;
  }

  /**
   * Actualiza el caché de un tenant específico
   * Útil cuando se actualiza información del tenant en la BD
   */
  async refreshTenant(slug: string): Promise<void> {
    const store = await getStoreBySlug(slug);
    
    if (store) {
      this.cache.set(slug, store);
    } else {
      // Si el tenant ya no existe, removerlo del caché
      this.cache.delete(slug);
    }
  }

  /**
   * Refresca todo el caché recargando todos los tenants
   */
  async refreshCache(): Promise<void> {
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
  }
}

// Exportar instancia singleton
export const tenantCache = new TenantCacheService();
