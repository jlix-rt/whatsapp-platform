import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

export interface PushSubscriptionData {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

@Injectable({
  providedIn: 'root'
})
export class PushNotificationService {
  private apiUrl = environment.apiUrl || 'http://localhost:3333';
  private swRegistration: ServiceWorkerRegistration | null = null;

  constructor(private http: HttpClient) {}

  /**
   * Inicializa el service worker y solicita permisos
   */
  async initialize(): Promise<boolean> {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      console.warn('⚠️ Push messaging no está soportado en este navegador');
      return false;
    }

    try {
      // Registrar el service worker
      const registration = await navigator.serviceWorker.register('/sw.js');
      this.swRegistration = registration;
      
      console.log('✅ Service Worker registrado:', registration.scope);
      
      // Verificar permisos actuales
      const currentPermission = Notification.permission;
      console.log('📱 Permiso de notificaciones actual:', currentPermission);
      
      if (currentPermission === 'granted') {
        // Ya tenemos permisos, verificar suscripción
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
          console.log('✅ Ya estás suscrito a notificaciones push');
          // Verificar que la suscripción esté en el servidor
          await this.verifySubscription(subscription);
        } else {
          console.log('📝 No hay suscripción activa, creando una nueva...');
          await this.subscribe();
        }
        return true;
      } else if (currentPermission === 'default') {
        // Solicitar permisos
        console.log('🔔 Solicitando permisos de notificación...');
        const permission = await Notification.requestPermission();
        
        if (permission === 'granted') {
          console.log('✅ Permisos concedidos, suscribiéndose...');
          await this.subscribe();
          return true;
        } else {
          console.warn('❌ Permisos de notificación denegados');
          return false;
        }
      } else {
        console.warn('❌ Permisos de notificación bloqueados. Debes habilitarlos manualmente en la configuración del navegador.');
        return false;
      }
    } catch (error) {
      console.error('❌ Error inicializando notificaciones push:', error);
      return false;
    }
  }

  /**
   * Verifica que la suscripción esté guardada en el servidor
   */
  private async verifySubscription(subscription: PushSubscription): Promise<void> {
    try {
      const subscriptionData: PushSubscriptionData = {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: this.arrayBufferToBase64(subscription.getKey('p256dh')!),
          auth: this.arrayBufferToBase64(subscription.getKey('auth')!)
        }
      };
      
      // Re-enviar la suscripción al servidor para asegurar que esté guardada
      await firstValueFrom(this.sendSubscriptionToServer(subscriptionData));
      console.log('✅ Suscripción verificada y guardada en el servidor');
    } catch (error) {
      console.error('⚠️ Error verificando suscripción:', error);
    }
  }

  /**
   * Suscribe al usuario a notificaciones push
   */
  private async subscribe(): Promise<void> {
    if (!this.swRegistration) {
      throw new Error('Service Worker no registrado');
    }

    try {
      const vapidKey = this.urlBase64ToUint8Array(environment.vapidPublicKey || '');
      const subscription = await this.swRegistration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidKey as any as BufferSource
      });

      console.log('✅ Suscripción creada:', subscription.endpoint);

      // Convertir la suscripción nativa a nuestro formato
      const p256dhKey = subscription.getKey('p256dh');
      const authKey = subscription.getKey('auth');
      
      if (!p256dhKey || !authKey) {
        throw new Error('No se pudieron obtener las claves de la suscripción');
      }

      const subscriptionData: PushSubscriptionData = {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: this.arrayBufferToBase64(p256dhKey),
          auth: this.arrayBufferToBase64(authKey)
        }
      };

      // Enviar la suscripción al backend
      await firstValueFrom(this.sendSubscriptionToServer(subscriptionData));
      console.log('✅ Suscripción guardada en el servidor');
    } catch (error) {
      console.error('❌ Error suscribiéndose a notificaciones push:', error);
      throw error;
    }
  }

  /**
   * Convierte ArrayBuffer a base64
   */
  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }

  /**
   * Envía la suscripción al servidor
   */
  private sendSubscriptionToServer(subscription: PushSubscriptionData): Observable<any> {
    return this.http.post(`${this.apiUrl}/api/push/subscribe`, {
      subscription: {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth
        }
      }
    });
  }

  /**
   * Convierte la clave pública VAPID de base64 a Uint8Array
   */
  private urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
      .replace(/\-/g, '+')
      .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const buffer = new ArrayBuffer(rawData.length);
    const outputArray = new Uint8Array(buffer);

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  /**
   * Verifica si las notificaciones están habilitadas
   */
  async isSubscribed(): Promise<boolean> {
    if (!this.swRegistration) {
      return false;
    }

    const subscription = await this.swRegistration.pushManager.getSubscription();
    return subscription !== null;
  }

  /**
   * Obtiene información de diagnóstico
   */
  async getDiagnosticInfo(): Promise<any> {
    const info: any = {
      supported: 'serviceWorker' in navigator && 'PushManager' in window,
      permission: Notification.permission,
      serviceWorkerRegistered: this.swRegistration !== null,
      subscribed: false,
      subscriptionEndpoint: null,
      vapidPublicKey: environment.vapidPublicKey ? 'Configurada' : 'No configurada'
    };

    if (this.swRegistration) {
      const subscription = await this.swRegistration.pushManager.getSubscription();
      if (subscription) {
        info.subscribed = true;
        info.subscriptionEndpoint = subscription.endpoint;
      }
    }

    return info;
  }

  /**
   * Cancela la suscripción
   */
  async unsubscribe(): Promise<void> {
    if (!this.swRegistration) {
      return;
    }

    const subscription = await this.swRegistration.pushManager.getSubscription();
    if (subscription) {
      await subscription.unsubscribe();
      // Notificar al backend que se canceló la suscripción
      await firstValueFrom(
        this.http.post(`${this.apiUrl}/api/push/unsubscribe`, {
          endpoint: subscription.endpoint
        })
      );
    }
  }
}
