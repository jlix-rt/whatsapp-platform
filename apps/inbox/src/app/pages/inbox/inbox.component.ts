import { Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewChecked, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { InboxApiService, Store, Conversation, Message } from '../../services/inbox-api.service';
import { environment } from '../../../environments/environment';

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
  refreshing: boolean = false; // Para actualizaciones sin ocultar contenido
  sending: boolean = false;
  resettingBot: boolean = false;
  deleting: boolean = false;
  
  // Modal de imagen
  showImageModal: boolean = false;
  modalImageUrl: string = '';
  imageZoom: number = 100;
  
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
          this.loadConversations(true); // Primera carga, mostrar loading
        }
      },
      error: (error) => {
        console.error('Error cargando tiendas:', error);
      }
    });
  }

  loadConversations(showLoading: boolean = false) {
    if (!this.selectedStoreId) return;

    // Solo mostrar loading completo si es la primera carga o se solicita explícitamente
    if (showLoading || this.conversations.length === 0) {
      this.loading = true;
    } else {
      // Para actualizaciones, usar refreshing para no ocultar el contenido
      this.refreshing = true;
    }

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
        
        // Preservar la conversación seleccionada antes de actualizar
        const selectedId = this.selectedConversation?.id;
        
        this.conversations = conversations;
        this.loading = false;
        this.refreshing = false;

        // Si hay conversaciones y ninguna está seleccionada, seleccionar la primera
        if (conversations.length > 0 && !this.selectedConversation) {
          this.selectConversation(conversations[0]);
        }

        // Si hay una conversación seleccionada, actualizar sus datos sin perder la selección
        if (selectedId) {
          const updated = conversations.find(c => c.id === selectedId);
          if (updated) {
            // Actualizar la referencia manteniendo la misma instancia si es posible
            this.selectedConversation = updated;
          } else {
            // Si la conversación fue eliminada, limpiar la selección
            this.selectedConversation = null;
            this.messages = [];
          }
        }
      },
      error: (error) => {
        console.error('Error cargando conversaciones:', error);
        this.loading = false;
        this.refreshing = false;
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

  deselectConversation() {
    this.selectedConversation = null;
    this.messages = [];
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
        
        // Log para debugging de mensajes con media
        const messagesWithMedia = messages.filter(m => m.media_url);
        if (messagesWithMedia.length > 0) {
          console.log('📷 Mensajes con media recibidos en frontend:', 
            messagesWithMedia.map(m => ({ 
              id: m.id, 
              media_url: m.media_url?.substring(0, 50), 
              media_type: m.media_type,
              hasId: !!m.id
            }))
          );
        }
        
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
      if (this.selectedStoreId) {
        // Usar refreshing en lugar de loading para no ocultar el contenido
        this.loadConversations(false);
        if (this.selectedConversation) {
          this.loadMessages();
        }
      }
    }, 5000);
  }
  
  // TrackBy function para optimizar el renderizado de la lista
  trackByConversationId(index: number, conversation: Conversation): number {
    return conversation.id;
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
          // Recargar conversaciones para actualizar la lista (sin ocultar contenido)
          this.loadConversations(false);
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
          // Recargar conversaciones para actualizar la lista (la eliminada no aparecerá, sin ocultar contenido)
          this.loadConversations(false);
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

  getMediaProxyUrl(messageId: number): string {
    if (!messageId) {
      console.warn('⚠️ getMediaProxyUrl llamado sin messageId');
      return '';
    }
    // Usar el endpoint proxy del backend en lugar de la URL directa de Twilio
    // En producción, environment.apiUrl puede estar vacío, así que usar la misma lógica que inbox-api.service
    const baseUrl = environment.apiUrl || '';
    const proxyUrl = `${baseUrl}/api/messages/${messageId}/media`;
    console.log('🔗 getMediaProxyUrl:', { messageId, baseUrl, proxyUrl });
    return proxyUrl;
  }

  handleImageError(event: any, message: Message) {
    console.error('Error cargando imagen:', event);
    console.error('Mensaje:', message);
    console.error('URL intentada:', this.getMediaProxyUrl(message.id));
    // Opcional: mostrar una imagen placeholder o mensaje de error
    event.target.style.display = 'none';
  }

  openImageModal(messageId: number) {
    this.modalImageUrl = this.getMediaProxyUrl(messageId);
    this.imageZoom = 100;
    this.showImageModal = true;
    // Prevenir scroll del body cuando el modal está abierto
    document.body.style.overflow = 'hidden';
  }

  closeImageModal() {
    this.showImageModal = false;
    this.modalImageUrl = '';
    this.imageZoom = 100;
    // Restaurar scroll del body
    document.body.style.overflow = '';
  }

  zoomIn() {
    this.imageZoom = Math.min(this.imageZoom + 25, 300);
  }

  zoomOut() {
    this.imageZoom = Math.max(this.imageZoom - 25, 50);
  }

  resetZoom() {
    this.imageZoom = 100;
  }

  // Cerrar modal con ESC
  @HostListener('document:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape' && this.showImageModal) {
      this.closeImageModal();
    }
  }
}

