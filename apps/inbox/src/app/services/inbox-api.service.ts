import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface Store {
  id: string;
  name: string;
}

export interface Conversation {
  id: number;
  store_id: string;
  phone_number: string;
  mode: 'BOT' | 'HUMAN';
  human_handled: boolean;
  created_at: string;
  updated_at: string;
  message_count?: number;
  last_message?: string;
  last_message_direction?: 'inbound' | 'outbound';
}

export interface Message {
  id: number;
  conversation_id: number;
  direction: 'inbound' | 'outbound';
  body: string;
  twilio_message_sid?: string;
  media_url?: string | null;
  media_type?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  created_at: string;
}

export interface ReplyResponse {
  success: boolean;
  message: Message;
}

export interface Contact {
  id: number;
  store_id: number;
  phone_number: string;
  name: string | null;
  delivery_address: string | null;
  delivery_latitude: number | null;
  delivery_longitude: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Location {
  id: number;
  latitude: number;
  longitude: number;
  body: string;
  created_at: string;
}

@Injectable({
  providedIn: 'root'
})
export class InboxApiService {
  private apiUrl = environment.apiUrl + '/api';

  constructor(private http: HttpClient) {}

  getStores(): Observable<Store[]> {
    return this.http.get<Store[]>(`${this.apiUrl}/stores`);
  }

  getConversations(storeId: string): Observable<Conversation[]> {
    return this.http.get<Conversation[]>(`${this.apiUrl}/conversations?storeId=${storeId}`);
  }

  getMessages(conversationId: number, limit?: number, beforeId?: number): Observable<{ messages: Message[]; pagination: { total: number; limit: number; hasMore: boolean; oldestMessageId: number | null } }> {
    let url = `${this.apiUrl}/conversations/${conversationId}/messages`;
    const params: string[] = [];
    if (limit) {
      params.push(`limit=${limit}`);
    }
    if (beforeId) {
      params.push(`beforeId=${beforeId}`);
    }
    if (params.length > 0) {
      url += `?${params.join('&')}`;
    }
    return this.http.get<{ messages: Message[]; pagination: { total: number; limit: number; hasMore: boolean; oldestMessageId: number | null } }>(url);
  }

  replyToConversation(conversationId: number, text: string): Observable<ReplyResponse> {
    return this.http.post<ReplyResponse>(`${this.apiUrl}/conversations/${conversationId}/reply`, { text });
  }

  replyWithMedia(conversationId: number, file: File, text?: string): Observable<ReplyResponse> {
    const formData = new FormData();
    formData.append('file', file);
    if (text) {
      formData.append('text', text);
    }
    return this.http.post<ReplyResponse>(`${this.apiUrl}/conversations/${conversationId}/reply-with-media`, formData);
  }

  resetConversationToBot(conversationId: number): Observable<{ success: boolean; conversation: Conversation }> {
    return this.http.post<{ success: boolean; conversation: Conversation }>(
      `${this.apiUrl}/conversations/${conversationId}/reset-bot`,
      {}
    );
  }

  deleteConversation(conversationId: number): Observable<{ success: boolean; message: string }> {
    return this.http.delete<{ success: boolean; message: string }>(
      `${this.apiUrl}/conversations/${conversationId}`
    );
  }

  getContacts(): Observable<Contact[]> {
    return this.http.get<Contact[]>(`${this.apiUrl}/contacts`);
  }

  getContact(contactId: number): Observable<Contact> {
    return this.http.get<Contact>(`${this.apiUrl}/contacts/${contactId}`);
  }

  createContact(contact: Partial<Contact>): Observable<Contact> {
    return this.http.post<Contact>(`${this.apiUrl}/contacts`, contact);
  }

  updateContact(contactId: number, contact: Partial<Contact>): Observable<Contact> {
    return this.http.put<Contact>(`${this.apiUrl}/contacts/${contactId}`, contact);
  }

  deleteContact(contactId: number): Observable<{ success: boolean; message: string }> {
    return this.http.delete<{ success: boolean; message: string }>(
      `${this.apiUrl}/contacts/${contactId}`
    );
  }

  getConversationLocations(conversationId: number): Observable<Location[]> {
    return this.http.get<Location[]>(`${this.apiUrl}/conversations/${conversationId}/locations`);
  }

  saveConversationAsContact(conversationId: number, contact: Partial<Contact>): Observable<{ success: boolean; contact: Contact }> {
    return this.http.post<{ success: boolean; contact: Contact }>(
      `${this.apiUrl}/conversations/${conversationId}/save-as-contact`,
      contact
    );
  }
}

