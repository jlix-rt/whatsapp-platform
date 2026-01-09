import { Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { InboxApiService, Store, Conversation, Message } from '../../services/inbox-api.service';

@Component({
  selector: 'app-inbox',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './inbox.component.html',
  styleUrls: ['./inbox.component.scss']
})
export class InboxComponent implements OnInit, OnDestroy, AfterViewChecked {
  @ViewChild('messagesList') messagesListRef!: ElementRef;

  stores: Store[] = [];
  selectedStoreId: string = '';
  conversations: Conversation[] = [];
  selectedConversation: Conversation | null = null;
  messages: Message[] = [];
  newMessage: string = '';
  loading: boolean = false;
  sending: boolean = false;
  resettingBot: boolean = false;
  deleting: boolean = false;
  
  private pollingInterval: any;
  private shouldScrollToBottom: boolean = false;

  constructor(private apiService: InboxApiService) {}

  ngOnInit() {
    this.loadStores();
  }

  ngOnDestroy() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
    }
  }

  loadStores() {
    this.apiService.getStores().subscribe({
      next: (stores) => {
        this.stores = stores;
        if (stores.length > 0) {
          this.selectedStoreId = stores[0].id;
          this.loadConversations();
        }
      },
      error: (error) => {
        console.error('Error cargando tiendas:', error);
      }
    });
  }

  loadConversations() {
    if (!this.selectedStoreId) return;

    this.loading = true;
    this.apiService.getConversations(this.selectedStoreId).subscribe({
      next: (conversations) => {
        // Debug: verificar que last_message_direction esté presente
        conversations.forEach(conv => {
          if (conv.phone_number === 'whatsapp:+50277777777') {
            console.log('🔍 Debug conversación +50277777777:', {
              id: conv.id,
              last_message: conv.last_message,
              last_message_direction: conv.last_message_direction,
              human_handled: conv.human_handled,
              isPending: this.isPending(conv)
            });
          }
        });
        this.conversations = conversations;
        this.loading = false;

        // Si hay conversaciones y ninguna está seleccionada, seleccionar la primera
        if (conversations.length > 0 && !this.selectedConversation) {
          this.selectConversation(conversations[0]);
        }

        // Si hay una conversación seleccionada, actualizar sus datos
        if (this.selectedConversation) {
          const updated = conversations.find(c => c.id === this.selectedConversation!.id);
          if (updated) {
            this.selectedConversation = updated;
          }
        }
      },
      error: (error) => {
        console.error('Error cargando conversaciones:', error);
        this.loading = false;
      }
    });
  }

  selectConversation(conversation: Conversation) {
    this.selectedConversation = conversation;
    this.messages = [];
    this.loadMessages();

    // Iniciar polling si no está activo
    if (!this.pollingInterval) {
      this.startPolling();
    }
  }

  ngAfterViewChecked() {
    if (this.shouldScrollToBottom) {
      this.scrollToBottom();
      this.shouldScrollToBottom = false;
    }
  }

  scrollToBottom() {
    if (this.messagesListRef) {
      const element = this.messagesListRef.nativeElement;
      element.scrollTop = element.scrollHeight;
    }
  }

  loadMessages() {
    if (!this.selectedConversation) return;

    this.apiService.getMessages(this.selectedConversation.id).subscribe({
      next: (messages) => {
        const previousLength = this.messages.length;
        this.messages = messages;
        // Scroll solo si hay nuevos mensajes
        if (messages.length > previousLength) {
          this.shouldScrollToBottom = true;
        }
      },
      error: (error) => {
        console.error('Error cargando mensajes:', error);
      }
    });
  }

  sendMessage() {
    if (!this.selectedConversation || !this.newMessage.trim() || this.sending) {
      return;
    }

    this.sending = true;
    this.apiService.replyToConversation(
      this.selectedConversation.id,
      this.newMessage.trim()
    ).subscribe({
      next: () => {
        this.newMessage = '';
        this.sending = false;
        // Recargar mensajes inmediatamente
        this.loadMessages();
        // Recargar conversaciones para actualizar last_message
        this.loadConversations();
        // Scroll al final después de enviar
        setTimeout(() => {
          this.shouldScrollToBottom = true;
        }, 100);
      },
      error: (error) => {
        console.error('Error enviando mensaje:', error);
        this.sending = false;
      }
    });
  }

  startPolling() {
    // Polling cada 5 segundos
    this.pollingInterval = setInterval(() => {
      if (this.selectedConversation) {
        this.loadMessages();
        this.loadConversations();
      }
    }, 5000);
  }

  formatDate(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Ahora';
    if (diffMins < 60) return `Hace ${diffMins}m`;
    if (diffHours < 24) return `Hace ${diffHours}h`;
    if (diffDays < 7) return `Hace ${diffDays}d`;
    
    return date.toLocaleDateString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  }

  formatTime(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleTimeString('es-ES', {
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  isPending(conversation: Conversation): boolean {
    // Una conversación está pendiente si el último mensaje es del usuario (inbound)
    
    // Verificar si tenemos la dirección del último mensaje desde el backend
    if (conversation.last_message_direction === 'inbound') {
      return true;
    }
    
    // Si no tenemos la dirección pero tenemos mensajes cargados para esta conversación, verificar el último mensaje
    if (this.selectedConversation?.id === conversation.id && this.messages.length > 0) {
      const lastMessage = this.messages[this.messages.length - 1];
      return lastMessage.direction === 'inbound';
    }
    
    // Si no hay información suficiente, no considerar como pendiente
    return false;
  }

  resetToBot() {
    if (!this.selectedConversation || this.resettingBot) {
      return;
    }

    if (!confirm('¿Estás seguro de que quieres regresar esta conversación al modo BOT? El bot responderá automáticamente cuando llegue un nuevo mensaje.')) {
      return;
    }

    this.resettingBot = true;
    this.apiService.resetConversationToBot(this.selectedConversation.id).subscribe({
      next: (response) => {
        if (response.success) {
          // Actualizar la conversación seleccionada con el nuevo modo
          this.selectedConversation!.mode = 'BOT';
          // Recargar conversaciones para actualizar la lista
          this.loadConversations();
        }
        this.resettingBot = false;
      },
      error: (error) => {
        console.error('Error reseteando a modo BOT:', error);
        alert('Error al regresar al modo BOT. Por favor intenta de nuevo.');
        this.resettingBot = false;
      }
    });
  }

  deleteConversation() {
    if (!this.selectedConversation || this.deleting) {
      return;
    }

    if (!confirm('¿Estás seguro de que quieres eliminar esta conversación? Esta acción no se puede deshacer.')) {
      return;
    }

    this.deleting = true;
    this.apiService.deleteConversation(this.selectedConversation.id).subscribe({
      next: (response) => {
        if (response.success) {
          // Limpiar la conversación seleccionada
          this.selectedConversation = null;
          this.messages = [];
          // Recargar conversaciones para actualizar la lista (la eliminada no aparecerá)
          this.loadConversations();
        }
        this.deleting = false;
      },
      error: (error) => {
        console.error('Error eliminando conversación:', error);
        alert('Error al eliminar la conversación. Por favor intenta de nuevo.');
        this.deleting = false;
      }
    });
  }

  copyCoordinates(latitude: number, longitude: number) {
    const coordinates = `${latitude},${longitude}`;
    navigator.clipboard.writeText(coordinates).then(() => {
      // Mostrar feedback visual (podrías usar un toast o alert)
      alert(`Coordenadas copiadas: ${coordinates}`);
    }).catch(err => {
      console.error('Error copiando coordenadas:', err);
      // Fallback: crear un input temporal para copiar
      const input = document.createElement('input');
      input.value = coordinates;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      alert(`Coordenadas copiadas: ${coordinates}`);
    });
  }
}

