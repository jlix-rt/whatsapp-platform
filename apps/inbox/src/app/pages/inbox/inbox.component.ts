import { Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewChecked, HostListener, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { InboxApiService, Store, Conversation, Message, Contact, Location } from '../../services/inbox-api.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-inbox',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './inbox.component.html',
  styleUrls: ['./inbox.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class InboxComponent implements OnInit, OnDestroy, AfterViewChecked {
  @ViewChild('messagesList') messagesListRef!: ElementRef;

  stores: Store[] = [];
  selectedStoreId: string = '';
  conversations: Conversation[] = [];
  selectedConversation: Conversation | null = null;
  messages: Message[] = [];
  newMessage: string = '';
  selectedFile: File | null = null;
  filePreview: string | null = null;
  loading: boolean = false;
  refreshing: boolean = false; // Para actualizaciones sin ocultar contenido
  sending: boolean = false;
  resettingBot: boolean = false;
  deleting: boolean = false;
  
  // Paginación de mensajes
  messagesLimit: number = environment.messagesLimit || 50; // Número de mensajes a cargar por vez (configurable en environment)
  hasMoreMessages: boolean = false;
  oldestMessageId: number | null = null;
  loadingMoreMessages: boolean = false;
  totalMessages: number = 0;
  showConversationsPanel: boolean = true; // Control de visibilidad del panel en móvil
  isUserSelection: boolean = false; // Indica si la selección fue hecha por el usuario
  userDeselected: boolean = false; // Indica si el usuario explícitamente deseleccionó una conversación
  
  // Modal de imagen
  showImageModal: boolean = false;
  modalImageUrl: string = '';
  imageZoom: number = 100;
  
  // Contactos y ubicaciones
  contacts: Contact[] = [];
  selectedContact: Contact | null = null;
  currentConversationContact: Contact | null = null; // Contacto asociado a la conversación actual
  showContactModal: boolean = false;
  contactName: string = '';
  contactNotes: string = '';
  showLocationsModal: boolean = false;
  locations: Location[] = [];
  selectedLocation: Location | null = null;
  
  private pollingInterval: any;
  private shouldScrollToBottom: boolean = false;
  private isUserAtBottom: boolean = true; // Indica si el usuario está viendo los últimos mensajes
  private isPrependingMessages: boolean = false; // Flag para indicar que se están agregando mensajes al inicio
  private scrollRestorationPending: boolean = false; // Flag para restaurar scroll después del render
  private previousScrollHeight: number = 0; // Altura del scroll antes de agregar mensajes
  private previousScrollTop: number = 0; // Posición del scroll antes de agregar mensajes
  private referenceMessageId: number | null = null; // ID del mensaje que el usuario estaba viendo
  private isRestoringScroll: boolean = false; // Flag para evitar interferencias durante la restauración
  private lastLoadMoreTime: number = 0; // Timestamp de la última carga para evitar múltiples cargas rápidas
  private scrollRestorationTimeout: any = null; // Timeout para la restauración del scroll

  constructor(
    private apiService: InboxApiService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.loadStores();
    this.loadContacts();
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
          // En localhost (desarrollo), seleccionar automáticamente "crunchypaws"
          if (!environment.production) {
            const crunchypawsStore = stores.find(store => store.id === 'crunchypaws' || store.name.toLowerCase().includes('crunchy'));
            if (crunchypawsStore) {
              this.selectedStoreId = crunchypawsStore.id;
            } else {
              // Si no se encuentra, usar la primera disponible
              this.selectedStoreId = stores[0].id;
            }
          } else {
            // En producción, usar la primera tienda
            this.selectedStoreId = stores[0].id;
          }
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
          // Debug removido
        });
        
        // Preservar la conversación seleccionada antes de actualizar
        const selectedId = this.selectedConversation?.id;
        
        this.conversations = conversations;
        this.loading = false;
        this.refreshing = false;

        // CRÍTICO: Si el usuario deseleccionó explícitamente, mantener el estado deseleccionado
        // y NO seleccionar ninguna conversación automáticamente
        if (this.userDeselected) {
          // Asegurarse de que no haya conversación seleccionada y que el panel esté visible
          this.selectedConversation = null;
          this.messages = [];
          this.showConversationsPanel = true;
          // NO continuar con el resto de la lógica para evitar selecciones automáticas
          return;
        }

        // Si hay una conversación seleccionada, actualizar sus datos sin perder la selección
        if (selectedId) {
          const updated = conversations.find(c => c.id === selectedId);
          if (updated) {
            // CRÍTICO: Preservar explícitamente showConversationsPanel durante actualizaciones automáticas
            // El panel solo se oculta cuando el usuario hace clic explícitamente (selectConversation)
            const previousPanelState = this.showConversationsPanel;
            this.selectedConversation = updated;
            // Restaurar el estado del panel si por alguna razón cambió
            this.showConversationsPanel = previousPanelState;
          } else {
            // Si la conversación fue eliminada, limpiar la selección
            this.selectedConversation = null;
            this.messages = [];
            this.isUserSelection = false;
            this.userDeselected = true; // Marcar como deseleccionado
            this.showConversationsPanel = true;
          }
        } else if (conversations.length > 0 && !this.selectedConversation) {
          // Si hay conversaciones y ninguna está seleccionada, seleccionar la primera
          // Solo si el usuario no ha deseleccionado explícitamente (ya verificamos arriba)
          this.selectedConversation = conversations[0];
          this.loadMessages();
          this.isUserSelection = false; // Selección automática
          // No ocultar panel en móvil para selección automática
          // El usuario puede seleccionar manualmente si lo desea
          if (!this.pollingInterval) {
            this.startPolling();
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
    this.isUserSelection = true; // Marcar como selección del usuario
    this.userDeselected = false; // El usuario seleccionó, así que ya no está deseleccionado
    
    // Cargar contacto asociado a esta conversación
    this.loadConversationContact();
    
    // Ocultar panel de conversaciones en móvil cuando el usuario selecciona explícitamente una conversación
    if (window.innerWidth <= 768) {
      this.showConversationsPanel = false;
    }

    // Iniciar polling si no está activo
    if (!this.pollingInterval) {
      this.startPolling();
    }
  }

  deselectConversation() {
    this.selectedConversation = null;
    this.messages = [];
    this.currentConversationContact = null;
    this.isUserSelection = false;
    this.userDeselected = true; // Marcar que el usuario explícitamente deseleccionó
    // Mostrar panel de conversaciones en móvil cuando se deselecciona
    this.showConversationsPanel = true;
  }

  ngAfterViewChecked() {
    // Evitar ejecutar si ya estamos restaurando el scroll
    if (this.isRestoringScroll) {
      return;
    }

    // Restaurar scroll después de agregar mensajes antiguos
    if (this.scrollRestorationPending && this.isPrependingMessages) {
      // Limpiar timeout anterior si existe
      if (this.scrollRestorationTimeout) {
        clearTimeout(this.scrollRestorationTimeout);
      }
      
      // Usar múltiples requestAnimationFrame para asegurar que el DOM esté completamente renderizado
      // Esto es crítico porque Angular puede necesitar múltiples ciclos para renderizar todos los elementos
      this.isRestoringScroll = true;
      
      // Doble requestAnimationFrame para asegurar que el DOM esté completamente actualizado
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          this.scrollRestorationTimeout = setTimeout(() => {
            this.restoreScrollPosition();
            // Limpiar flags después de restaurar
            this.scrollRestorationPending = false;
            this.isPrependingMessages = false;
            this.scrollRestorationTimeout = null;
            // El flag isRestoringScroll se limpia dentro de restoreScrollPosition
          }, 10); // Pequeño delay para asegurar que el DOM esté completamente actualizado
        });
      });
      return;
    }

    // Scroll al final solo si está habilitado y no estamos agregando mensajes antiguos
    // Y no estamos restaurando el scroll
    // IMPORTANTE: Verificar también scrollRestorationPending para evitar interferencias
    if (this.shouldScrollToBottom && 
        !this.isPrependingMessages && 
        !this.isRestoringScroll &&
        !this.scrollRestorationPending) {
      this.scrollToBottom();
      this.shouldScrollToBottom = false;
    }
  }

  /**
   * Restaura la posición del scroll después de agregar mensajes antiguos al inicio
   * Usa la diferencia de scrollHeight para mantener al usuario viendo el mismo mensaje
   */
  private restoreScrollPosition(): void {
    const element = this.messagesListRef?.nativeElement;
    if (!element || this.previousScrollHeight === 0 || this.previousScrollTop === 0) {
      this.isRestoringScroll = false;
      return;
    }

    // Calcular la nueva posición del scroll
    const newScrollHeight = element.scrollHeight;
    const scrollDifference = newScrollHeight - this.previousScrollHeight;
    
    // Solo restaurar si hay una diferencia significativa (más de 1px para evitar micro-ajustes)
    if (Math.abs(scrollDifference) > 1) {
      // CRÍTICO: Cuando se agregan mensajes al INICIO, el scrollTop debe aumentar
      // en la misma cantidad que aumentó el scrollHeight
      // Esto mantiene al usuario viendo el mismo mensaje visualmente
      const newScrollTop = this.previousScrollTop + scrollDifference;
      
      // Aplicar el nuevo scrollTop
      element.scrollTop = newScrollTop;
      
      // Verificar que el scroll se aplicó correctamente después del render
      // Usar múltiples frames para asegurar que el DOM esté completamente actualizado
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const currentScrollTop = element.scrollTop;
          const expectedScrollTop = this.previousScrollTop + scrollDifference;
          const difference = Math.abs(currentScrollTop - expectedScrollTop);
          
          // Si la diferencia es significativa (> 10px), reintentar
          if (difference > 10) {
            element.scrollTop = expectedScrollTop;
            
            // Última verificación después de otro frame
            requestAnimationFrame(() => {
              const finalScrollTop = element.scrollTop;
              const finalDifference = Math.abs(finalScrollTop - expectedScrollTop);
              if (finalDifference > 10) {
                console.warn('⚠️ [SCROLL] No se pudo restaurar completamente:', {
                  final: finalScrollTop,
                  expected: expectedScrollTop,
                  difference: finalDifference
                });
              }
              this.isRestoringScroll = false;
            });
          } else {
            this.isRestoringScroll = false;
          }
        });
      });
    } else {
      this.isRestoringScroll = false;
    }
  }

  /**
   * Guarda el estado actual del scroll antes de modificar los mensajes
   */
  private saveScrollState(): void {
    const element = this.messagesListRef?.nativeElement;
    if (!element || this.messages.length === 0) {
      this.previousScrollHeight = 0;
      this.previousScrollTop = 0;
      return;
    }

    // Guardar el estado ANTES de cualquier cambio
    this.previousScrollHeight = element.scrollHeight;
    this.previousScrollTop = element.scrollTop;
    
    // Guardar el ID del primer mensaje visible como referencia
    const firstVisibleMessage = this.getFirstVisibleMessage();
    this.referenceMessageId = firstVisibleMessage?.id || null;
  }

  /**
   * Obtiene el primer mensaje visible en el viewport
   */
  private getFirstVisibleMessage(): Message | null {
    const element = this.messagesListRef?.nativeElement;
    if (!element || this.messages.length === 0) return null;

    const scrollTop = element.scrollTop;
    const containerTop = element.getBoundingClientRect().top;
    
    // Buscar el primer mensaje que esté visible
    for (const message of this.messages) {
      const messageElement = element.querySelector(`[data-message-id="${message.id}"]`);
      if (messageElement) {
        const messageRect = messageElement.getBoundingClientRect();
        const messageTop = messageRect.top - containerTop + scrollTop;
        
        if (messageTop >= scrollTop - 50) { // 50px de margen
          return message;
        }
      }
    }

    return this.messages[0] || null;
  }

  scrollToBottom() {
    // No hacer scroll si estamos restaurando posición o cargando mensajes antiguos
    if (this.isRestoringScroll || this.scrollRestorationPending || this.isPrependingMessages) {
      return;
    }

    if (this.messagesListRef) {
      const element = this.messagesListRef.nativeElement;
      element.scrollTop = element.scrollHeight;
    }
  }

  loadMessages(loadMore: boolean = false, forceScrollToBottom: boolean = false) {
    if (!this.selectedConversation) return;

    // Si está cargando más mensajes, no hacer nada
    if (this.loadingMoreMessages) return;

    // Verificar si el usuario está al final antes de recargar (solo si no es carga inicial)
    // NO verificar si estamos restaurando el scroll para evitar interferencias
    // CRÍTICO: Verificar ANTES de hacer la petición para saber si debemos hacer scroll después
    const element = this.messagesListRef?.nativeElement;
    let wasUserAtBottom = this.isUserAtBottom; // Guardar el estado anterior
    
    if (!loadMore && element && this.messages.length > 0 && !this.isRestoringScroll && !this.scrollRestorationPending) {
      const scrollTop = element.scrollTop;
      const scrollHeight = element.scrollHeight;
      const clientHeight = element.clientHeight;
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
      
      // Considerar que está al final si está a menos de 100px del final
      // CRÍTICO: Actualizar el estado ANTES de hacer la petición
      this.isUserAtBottom = distanceFromBottom < 100;
    }

    // Si es carga inicial, resetear paginación
    if (!loadMore) {
      const previousScrollHeight = element?.scrollHeight || 0;
      const previousScrollTop = element?.scrollTop || 0;
      
      // CRÍTICO: Detectar si ya hay mensajes antiguos cargados
      // Si el usuario ha cargado mensajes antiguos, debemos preservarlos
      const hasOldMessagesLoaded = this.hasMoreMessages || this.oldestMessageId !== null;
      const isInitialLoad = this.messages.length === 0;
      
      this.loadingMoreMessages = true;
      const beforeId = undefined;

      this.apiService.getMessages(this.selectedConversation.id, this.messagesLimit, beforeId).subscribe({
        next: (response) => {
          // Guardar los IDs de los mensajes anteriores para detectar nuevos
          const previousMessageIds = new Set(this.messages.map(m => m.id));
          
          // CRÍTICO: Si ya hay mensajes antiguos cargados, preservarlos y solo agregar nuevos al final
          // Si es carga inicial, reemplazar todos los mensajes
          if (isInitialLoad || !hasOldMessagesLoaded) {
            // Carga inicial: reemplazar todos los mensajes
            this.messages = response.messages;
          } else {
            // Ya hay mensajes antiguos cargados: preservar los antiguos y agregar solo los nuevos al final
            const existingMessageIds = new Set(this.messages.map(m => m.id));
            const newMessages = response.messages.filter(m => !existingMessageIds.has(m.id));
            
            // Solo agregar mensajes nuevos al final, preservando los antiguos
            if (newMessages.length > 0) {
              this.messages = [...this.messages, ...newMessages];
            }
            
            // NO actualizar oldestMessageId ni hasMoreMessages porque ya están cargados
            // Solo actualizar totalMessages para reflejar el total real
            this.totalMessages = response.pagination.total;
            
            // Marcar para detección de cambios y salir temprano
            this.cdr.markForCheck();
            this.loadingMoreMessages = false;
            
            // Si hay mensajes nuevos, preservar el scroll
            if (newMessages.length > 0) {
              requestAnimationFrame(() => {
                setTimeout(() => {
                  if (this.isRestoringScroll || this.scrollRestorationPending) {
                    return;
                  }
                  
                  // Preservar posición del scroll
                  const newElement = this.messagesListRef?.nativeElement;
                  if (newElement && previousScrollHeight > 0 && previousScrollTop > 0) {
                    const newScrollHeight = newElement.scrollHeight;
                    const scrollDifference = newScrollHeight - previousScrollHeight;
                    
                    if (Math.abs(scrollDifference) > 1) {
                      const newScrollTop = previousScrollTop + scrollDifference;
                      newElement.scrollTop = newScrollTop;
                    }
                  }
                }, 0);
              });
            }
            
            return; // Salir temprano si ya hay mensajes antiguos cargados
          }
          
          // Actualizar información de paginación (solo si es carga inicial)
          this.hasMoreMessages = response.pagination.hasMore;
          this.oldestMessageId = response.pagination.oldestMessageId;
          this.totalMessages = response.pagination.total;
          
          // Detectar si hay mensajes nuevos (que no estaban antes)
          const newMessages = response.messages.filter(m => !previousMessageIds.has(m.id));
          const hasNewMessages = newMessages.length > 0;
          
          // CRÍTICO: Verificar nuevamente si el usuario está al final DESPUÉS de actualizar los mensajes
          // porque el scrollHeight puede haber cambiado
          const newElement = this.messagesListRef?.nativeElement;
          let currentIsUserAtBottom = this.isUserAtBottom;
          
          if (newElement && this.messages.length > 0) {
            const currentScrollTop = newElement.scrollTop;
            const currentScrollHeight = newElement.scrollHeight;
            const currentClientHeight = newElement.clientHeight;
            const currentDistanceFromBottom = currentScrollHeight - currentScrollTop - currentClientHeight;
            
            // Actualizar el estado basado en la posición ACTUAL después de actualizar los mensajes
            currentIsUserAtBottom = currentDistanceFromBottom < 100;
          }
          
          // CRÍTICO: Solo hacer scroll al final si:
          // 1. Es carga inicial (no hay mensajes previos) - pero solo si realmente no había mensajes antes
          // 2. El usuario estaba al final ANTES Y DESPUÉS de actualizar Y hay mensajes nuevos
          // 3. Se fuerza el scroll (por ejemplo, al enviar un mensaje)
          const wasInitialLoad = previousMessageIds.size === 0;
          
          // IMPORTANTE: Solo hacer scroll si el usuario estaba al final ANTES de la petición
          // Y sigue al final DESPUÉS de actualizar los mensajes
          // Esto evita que se mueva cuando el usuario está leyendo arriba
          const shouldScroll = wasInitialLoad || 
                              (this.isUserAtBottom && currentIsUserAtBottom && hasNewMessages) || 
                              forceScrollToBottom;
          
          // Marcar para detección de cambios (OnPush requiere esto)
          this.cdr.markForCheck();
          
          // Usar requestAnimationFrame para asegurar que el DOM se haya actualizado
          requestAnimationFrame(() => {
            setTimeout(() => {
              // No hacer scroll si estamos restaurando posición
              if (this.isRestoringScroll || this.scrollRestorationPending) {
                return;
              }
              
              if (shouldScroll) {
                // Solo hacer scroll si realmente debemos hacerlo
                this.shouldScrollToBottom = true;
              } else {
                // CRÍTICO: Preservar la posición del scroll cuando hay mensajes nuevos pero el usuario no está al final
                // Esto es especialmente importante durante el polling
                const newElement = this.messagesListRef?.nativeElement;
                if (newElement && previousScrollHeight > 0 && previousScrollTop > 0) {
                  const newScrollHeight = newElement.scrollHeight;
                  const scrollDifference = newScrollHeight - previousScrollHeight;
                  
                  // Solo ajustar si hay una diferencia significativa
                  if (Math.abs(scrollDifference) > 1) {
                    // Cuando hay mensajes nuevos pero el usuario está leyendo arriba,
                    // ajustar el scrollTop para mantener la misma posición visual
                    const newScrollTop = previousScrollTop + scrollDifference;
                    newElement.scrollTop = newScrollTop;
                  }
                }
              }
            }, 0);
          });
          
          this.loadingMoreMessages = false;
        },
        error: (error) => {
          console.error('Error cargando mensajes:', error);
          this.loadingMoreMessages = false;
        }
      });
    } else {
      // Cargar más mensajes antiguos (prepend al inicio)
      this.loadingMoreMessages = true;
      const beforeId = this.oldestMessageId ? this.oldestMessageId : undefined;
      
      // CRÍTICO: Guardar el estado del scroll ANTES de hacer la petición
      // Solo guardar si realmente hay un elemento y mensajes existentes
      const element = this.messagesListRef?.nativeElement;
      if (element && this.messages.length > 0) {
        // Guardar estado inmediatamente (sincrónico) antes de cualquier cambio
        // NO usar requestAnimationFrame aquí porque necesitamos los valores actuales
        this.previousScrollHeight = element.scrollHeight;
        this.previousScrollTop = element.scrollTop;
        
        // Guardar el ID del primer mensaje visible como referencia
        const firstVisibleMessage = this.getFirstVisibleMessage();
        this.referenceMessageId = firstVisibleMessage?.id || null;
        
        this.isPrependingMessages = true;
        this.scrollRestorationPending = true;
      } else {
        // Si no hay elemento o mensajes, no necesitamos restaurar scroll
        this.isPrependingMessages = false;
        this.scrollRestorationPending = false;
        this.previousScrollHeight = 0;
        this.previousScrollTop = 0;
      }

      this.apiService.getMessages(this.selectedConversation.id, this.messagesLimit, beforeId).subscribe({
        next: (response) => {
          // Validar que hay mensajes nuevos antes de agregar
          if (response.messages.length === 0) {
            this.hasMoreMessages = false;
            this.loadingMoreMessages = false;
            this.isPrependingMessages = false;
            this.scrollRestorationPending = false;
            this.cdr.markForCheck();
            return;
          }

          // Agregar mensajes antiguos al inicio del array
          this.messages = [...response.messages, ...this.messages];
          
          // Actualizar información de paginación
          this.hasMoreMessages = response.pagination.hasMore;
          this.oldestMessageId = response.pagination.oldestMessageId;
          this.totalMessages = response.pagination.total;
          
          // Marcar para detección de cambios (OnPush requiere esto)
          // Usar requestAnimationFrame para asegurar que el DOM se haya actualizado
          requestAnimationFrame(() => {
            this.cdr.markForCheck();
            // La restauración del scroll se hará en ngAfterViewChecked
            // después de que Angular renderice los nuevos elementos
          });
          
          this.loadingMoreMessages = false;
        },
        error: (error) => {
          console.error('Error cargando mensajes:', error);
          this.loadingMoreMessages = false;
          this.isPrependingMessages = false;
          this.scrollRestorationPending = false;
          this.isRestoringScroll = false;
          this.cdr.markForCheck();
        }
      });
    }
  }

  loadMoreMessages() {
    // Validaciones adicionales para evitar cargas innecesarias
    if (this.hasMoreMessages && 
        !this.loadingMoreMessages && 
        !this.isRestoringScroll &&
        !this.scrollRestorationPending) {
      this.loadMessages(true);
    }
  }

  onMessagesScroll(event: Event) {
    // Ignorar eventos de scroll durante la restauración para evitar interferencias
    if (this.isRestoringScroll || this.scrollRestorationPending) {
      return;
    }

    const element = event.target as HTMLElement;
    
    // Detectar si el usuario está al final del scroll
    const scrollTop = element.scrollTop;
    const scrollHeight = element.scrollHeight;
    const clientHeight = element.clientHeight;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    
    // Actualizar el estado de si el usuario está al final
    // Solo actualizar si no estamos restaurando el scroll
    if (!this.isRestoringScroll && !this.scrollRestorationPending) {
      this.isUserAtBottom = distanceFromBottom < 100;
    }
    
    // Si el usuario está cerca del inicio (top), cargar más mensajes
    // Agregar debounce para evitar múltiples cargas rápidas
    const now = Date.now();
    const timeSinceLastLoad = now - this.lastLoadMoreTime;
    
    // CRÍTICO: Solo cargar si realmente está cerca del top Y no está cargando
    // Aumentar el threshold para evitar cargas prematuras
    if (scrollTop < 200 && // Threshold aumentado a 200px
        this.hasMoreMessages && 
        !this.loadingMoreMessages && 
        !this.isRestoringScroll &&
        !this.scrollRestorationPending &&
        !this.isPrependingMessages &&
        timeSinceLastLoad > 500) { // Evitar cargar más de una vez cada 500ms
      this.lastLoadMoreTime = now;
      this.loadMoreMessages();
    }
  }

  sendMessage() {
    if (!this.selectedConversation || this.sending) {
      return;
    }

    // Validar que hay algo para enviar (texto o archivo)
    const hasText = this.newMessage.trim().length > 0;
    const hasFile = this.selectedFile !== null;

    if (!hasText && !hasFile) {
      return;
    }

    this.sending = true;

    // Si hay archivo, enviar con media
    if (hasFile && this.selectedFile) {
      this.apiService.replyWithMedia(
        this.selectedConversation.id,
        this.selectedFile,
        this.newMessage.trim() || undefined
      ).subscribe({
        next: () => {
          this.newMessage = '';
          this.clearFileSelection();
          this.sending = false;
          // Forzar scroll al final cuando se envía un archivo
          this.loadMessages(false, true);
          // Recargar conversaciones para actualizar last_message
          this.loadConversations();
        },
        error: (error) => {
          console.error('Error enviando mensaje con archivo:', error);
          this.sending = false;
        }
      });
    } else {
      // Enviar solo texto
      this.apiService.replyToConversation(
        this.selectedConversation.id,
        this.newMessage.trim()
      ).subscribe({
        next: () => {
          this.newMessage = '';
          this.sending = false;
          // Forzar scroll al final cuando se envía un mensaje de texto
          this.loadMessages(false, true);
          // Recargar conversaciones para actualizar last_message
          this.loadConversations();
        },
        error: (error) => {
          console.error('Error enviando mensaje:', error);
          this.sending = false;
        }
      });
    }
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      
      // Validar tipo de archivo
      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
      if (!allowedTypes.includes(file.type)) {
        alert('Tipo de archivo no permitido. Solo se permiten imágenes (JPEG, PNG, GIF, WEBP) y PDFs.');
        return;
      }

      // Validar tamaño (10MB máximo)
      const maxSize = 10 * 1024 * 1024; // 10MB
      if (file.size > maxSize) {
        alert('El archivo es demasiado grande. El tamaño máximo es 10MB.');
        return;
      }

      this.selectedFile = file;

      // Crear preview si es imagen
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => {
          this.filePreview = e.target?.result as string;
        };
        reader.readAsDataURL(file);
      } else {
        this.filePreview = null;
      }
    }
  }

  clearFileSelection() {
    this.selectedFile = null;
    this.filePreview = null;
    // Limpiar el input de archivo
    const fileInput = document.getElementById('file-input') as HTMLInputElement;
    if (fileInput) {
      fileInput.value = '';
    }
  }

  startPolling() {
    // Polling cada 5 segundos
    this.pollingInterval = setInterval(() => {
      if (this.selectedStoreId) {
        // Usar refreshing en lugar de loading para no ocultar el contenido
        // IMPORTANTE: No cambiar showConversationsPanel durante el polling
        // El panel solo se oculta cuando el usuario hace clic explícitamente
        this.loadConversations(false);
        if (this.selectedConversation) {
          // NO recargar mensajes durante polling si estamos restaurando scroll o cargando más mensajes
          // Esto evita interferencias con la paginación y el scroll del usuario
          if (!this.isRestoringScroll && 
              !this.scrollRestorationPending && 
              !this.loadingMoreMessages &&
              !this.isPrependingMessages) {
            // No forzar scroll al final durante polling, solo si el usuario está al final y hay nuevos mensajes
            this.loadMessages(false, false);
          }
        }
      }
    }, 5000);
  }
  
  // TrackBy function para optimizar el renderizado de la lista de conversaciones
  trackByConversationId(index: number, conversation: Conversation): number {
    return conversation.id;
  }

  // TrackBy function para optimizar el renderizado de la lista de mensajes
  // CRÍTICO: Usar el ID del mensaje, no el índice, para evitar re-renderizados innecesarios
  trackByMessageId(index: number, message: Message): number {
    return message.id;
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

  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
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
          // Limpiar la conversación seleccionada y mostrar panel
          this.selectedConversation = null;
          this.messages = [];
          this.isUserSelection = false;
          this.showConversationsPanel = true;
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
    if (event.key === 'Escape' && this.showContactModal) {
      this.closeContactModal();
    }
    if (event.key === 'Escape' && this.showLocationsModal) {
      this.closeLocationsModal();
    }
  }

  // ============================================================================
  // CONTACTOS
  // ============================================================================

  loadContacts() {
    this.apiService.getContacts().subscribe({
      next: (contacts) => {
        this.contacts = contacts;
        // Si hay una conversación seleccionada, actualizar su contacto
        if (this.selectedConversation) {
          this.loadConversationContact();
        }
      },
      error: (error) => {
        console.error('Error cargando contactos:', error);
      }
    });
  }

  loadConversationContact() {
    if (!this.selectedConversation) {
      this.currentConversationContact = null;
      return;
    }

    // Buscar contacto asociado a esta conversación
    const contact = this.contacts.find(c => c.phone_number === this.selectedConversation?.phone_number);
    this.currentConversationContact = contact || null;
  }

  getConversationDisplayName(conversation: Conversation): string {
    const contact = this.contacts.find(c => c.phone_number === conversation.phone_number);
    return contact?.name || conversation.phone_number;
  }

  openContactModal() {
    if (!this.selectedConversation) return;
    
    // Usar el contacto ya cargado o buscarlo
    const existingContact = this.currentConversationContact || 
      this.contacts.find(c => c.phone_number === this.selectedConversation?.phone_number);
    
    if (existingContact) {
      this.selectedContact = existingContact;
      this.contactName = existingContact.name || '';
      this.contactNotes = existingContact.notes || '';
      // Si tiene ubicación de entrega, cargarla también
      if (existingContact.delivery_latitude && existingContact.delivery_longitude) {
        // Buscar la ubicación en los mensajes recibidos
        this.apiService.getConversationLocations(this.selectedConversation.id).subscribe({
          next: (locations) => {
            const matchingLocation = locations.find(l => 
              Math.abs(l.latitude - existingContact.delivery_latitude!) < 0.0001 &&
              Math.abs(l.longitude - existingContact.delivery_longitude!) < 0.0001
            );
            if (matchingLocation) {
              this.selectedLocation = matchingLocation;
            }
          },
          error: () => {
            // Ignorar error, no es crítico
          }
        });
      }
    } else {
      this.selectedContact = null;
      this.contactName = '';
      this.contactNotes = '';
      this.selectedLocation = null;
    }
    this.showContactModal = true;
  }

  closeContactModal() {
    this.showContactModal = false;
    this.selectedContact = null;
    this.contactName = '';
    this.contactNotes = '';
    this.selectedLocation = null;
  }

  saveContact() {
    if (!this.selectedConversation) return;

    const contactData: Partial<Contact> = {
      name: this.contactName.trim() || null,
      notes: this.contactNotes.trim() || null,
      delivery_latitude: this.selectedLocation?.latitude || null,
      delivery_longitude: this.selectedLocation?.longitude || null,
      delivery_address: this.selectedLocation?.body || null
    };

    this.apiService.saveConversationAsContact(this.selectedConversation.id, contactData).subscribe({
      next: (response) => {
        const isUpdate = !!this.selectedContact;
        alert(isUpdate ? 'Contacto actualizado exitosamente' : 'Contacto guardado exitosamente');
        this.closeContactModal();
        this.loadContacts();
        // Recargar conversaciones para actualizar los nombres mostrados
        this.loadConversations(false);
      },
      error: (error) => {
        console.error('Error guardando contacto:', error);
        alert('Error al guardar contacto. Por favor intenta de nuevo.');
      }
    });
  }

  // ============================================================================
  // UBICACIONES
  // ============================================================================

  openLocationsModal() {
    if (!this.selectedConversation) return;

    this.apiService.getConversationLocations(this.selectedConversation.id).subscribe({
      next: (locations) => {
        this.locations = locations;
        this.showLocationsModal = true;
      },
      error: (error) => {
        console.error('Error cargando ubicaciones:', error);
        alert('Error al cargar ubicaciones');
      }
    });
  }

  closeLocationsModal() {
    this.showLocationsModal = false;
    this.selectedLocation = null;
  }

  selectLocation(location: Location) {
    this.selectedLocation = location;
    this.closeLocationsModal();
    // Si el modal de contacto está abierto, actualizar la ubicación
    if (this.showContactModal) {
      // La ubicación ya está seleccionada, se usará al guardar
    }
  }

  getGoogleMapsUrl(latitude: number, longitude: number): string {
    return `https://www.google.com/maps?q=${latitude},${longitude}`;
  }

  hasLocation(message: Message): boolean {
    return message.latitude !== null && message.latitude !== undefined &&
           message.longitude !== null && message.longitude !== undefined;
  }
}

