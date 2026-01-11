import { Component, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { PushNotificationService } from './services/push-notification.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit {
  title = 'whatsapp-inbox';

  constructor(private pushNotificationService: PushNotificationService) {}

  async ngOnInit() {
    // Inicializar notificaciones push cuando la app se carga
    try {
      const initialized = await this.pushNotificationService.initialize();
      if (initialized) {
        // Mostrar información de diagnóstico en la consola
        const diagnosticInfo = await this.pushNotificationService.getDiagnosticInfo();
        console.log('📊 Estado de notificaciones push:', diagnosticInfo);
      }
    } catch (error) {
      console.error('Error inicializando notificaciones push:', error);
    }
  }
}

