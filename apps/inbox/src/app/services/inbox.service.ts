import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface Conversation {
  id: number;
  store_id: string;
  phone_number: string;
  created_at: string;
  updated_at: string;
  message_count?: number;
  last_message?: string;
}

export interface Message {
  id: number;
  conversation_id: number;
  direction: 'inbound' | 'outbound';
  body: string;
  twilio_message_sid?: string;
  created_at: string;
}

@Injectable({
  providedIn: 'root'
})
export class InboxService {
  private apiUrl = environment.apiUrl; // Remover /api para obtener la base URL

  constructor(private http: HttpClient) {}

  getConversations(): Observable<Conversation[]> {
    return this.http.get<Conversation[]>(`${this.apiUrl}/inbox/conversations`);
  }

  getMessages(conversationId: number): Observable<Message[]> {
    return this.http.get<Message[]>(`${this.apiUrl}/inbox/messages/${conversationId}`);
  }

  sendMessage(phoneNumber: string, message: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/inbox/send`, {
      phoneNumber,
      message
    });
  }
}

