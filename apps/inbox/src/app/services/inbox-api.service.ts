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
  created_at: string;
}

export interface ReplyResponse {
  success: boolean;
  message: Message;
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

  getMessages(conversationId: number): Observable<Message[]> {
    return this.http.get<Message[]>(`${this.apiUrl}/conversations/${conversationId}/messages`);
  }

  replyToConversation(conversationId: number, text: string): Observable<ReplyResponse> {
    return this.http.post<ReplyResponse>(`${this.apiUrl}/conversations/${conversationId}/reply`, { text });
  }

  resetConversationToBot(conversationId: number): Observable<{ success: boolean; conversation: Conversation }> {
    return this.http.post<{ success: boolean; conversation: Conversation }>(
      `${this.apiUrl}/conversations/${conversationId}/reset-bot`,
      {}
    );
  }
}

