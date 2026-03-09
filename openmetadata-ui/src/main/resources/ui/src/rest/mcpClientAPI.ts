/*
 *  Copyright 2024 Collate.
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *  http://www.apache.org/licenses/LICENSE-2.0
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

import { AxiosResponse } from 'axios';
import APIClient from './index';

export interface McpConversation {
  id: string;
  user: { id: string; name: string; type: string };
  createdAt: number;
  updatedAt: number;
  title?: string;
  messageCount: number;
  mcpMessages?: McpMessage[];
}

export interface TextMessage {
  type: 'plain' | 'markdown';
  message: string;
}

export interface ToolCallInfo {
  name: string;
  input?: Record<string, unknown>;
  result?: Record<string, unknown>;
}

export interface MessageBlock {
  type: 'Generic';
  textMessage?: TextMessage;
  tools?: ToolCallInfo[];
}

export interface TokenUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export interface McpMessage {
  id: string;
  conversationId: string;
  sender: 'human' | 'assistant';
  index: number;
  timestamp: number;
  content?: MessageBlock[];
  tokens?: TokenUsage;
}

export interface ChatRequest {
  conversationId?: string;
  message: string;
}

export interface ChatResponse {
  conversationId: string;
  message: McpMessage;
}

const BASE = '/mcp-client';

export const sendChatMessage = async (
  request: ChatRequest
): Promise<ChatResponse> => {
  const response = await APIClient.post<
    ChatRequest,
    AxiosResponse<ChatResponse>
  >(`${BASE}/chat`, request);

  return response.data;
};

export const createConversation = async (
  title?: string
): Promise<McpConversation> => {
  const response = await APIClient.post<
    { title?: string },
    AxiosResponse<McpConversation>
  >(`${BASE}/conversations`, { title });

  return response.data;
};

export const listConversations = async (
  limit = 20,
  offset = 0
): Promise<{ data: McpConversation[]; paging: { total: number } }> => {
  const response = await APIClient.get<{
    data: McpConversation[];
    paging: { total: number };
  }>(`${BASE}/conversations`, {
    params: { limit, offset },
  });

  return response.data;
};

export const getConversation = async (
  id: string
): Promise<McpConversation> => {
  const response = await APIClient.get<McpConversation>(
    `${BASE}/conversations/${id}`
  );

  return response.data;
};

export const deleteConversation = async (id: string): Promise<void> => {
  await APIClient.delete(`${BASE}/conversations/${id}`);
};

export const listMessages = async (
  conversationId: string,
  limit = 50,
  offset = 0
): Promise<{ data: McpMessage[] }> => {
  const response = await APIClient.get<{ data: McpMessage[] }>(
    `${BASE}/conversations/${conversationId}/messages`,
    {
      params: { limit, offset },
    }
  );

  return response.data;
};
