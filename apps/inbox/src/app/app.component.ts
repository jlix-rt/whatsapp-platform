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
      await this.pushNotificationService.initialize();
    } catch (error) {
      console.error('Error inicializando notificaciones push:', error);
    }
  }
}

