import client from './client';

// AI running-coach assistant. Conversations are persisted server-side; the model
// is grounded in the athlete's own training and can pull deeper history via tools
// (premium). Read-only — it never changes workouts, logs, or plans.

// Send a chat message. Pass conversationId to continue, or null to start fresh.
export const sendMessage = (message, conversationId = null) =>
  client.post('/assistant/chat', { message, conversation_id: conversationId });

export const listConversations = () =>
  client.get('/assistant/conversations');

export const getMessages = (conversationId) =>
  client.get(`/assistant/conversations/${conversationId}/messages`);

export const deleteConversation = (conversationId) =>
  client.delete(`/assistant/conversations/${conversationId}`);

// Tier + remaining free messages (for the banner).
export const getStatus = () =>
  client.get('/assistant/status');

// Notebook (premium): persistent memory the coach carries across conversations.
export const getNotebook = () =>
  client.get('/assistant/notebook');

export const saveNotebook = (content) =>
  client.put('/assistant/notebook', { content });

// "Update with AI": rewrite the notebook from a conversation.
export const rewriteNotebook = (conversationId) =>
  client.post('/assistant/notebook/rewrite', { conversation_id: conversationId });
