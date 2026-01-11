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
      console.warn('Push messaging no está soportado');
      return false;
    }

    try {
      // Registrar el service worker
      const registration = await navigator.serviceWorker.register('/sw.js');
      this.swRegistration = registration;
      
      // Verificar si ya tenemos permisos
      const permission = await Notification.requestPermission();
      
      if (permission === 'granted') {
        // Suscribirse a notificaciones push
        await this.subscribe();
        return true;
      } else {
        console.warn('Permisos de notificación denegados');
        return false;
      }
    } catch (error) {
      console.error('Error inicializando notificaciones push:', error);
      return false;
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
    } catch (error) {
      console.error('Error suscribiéndose a notificaciones push:', error);
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
