import client from './client';

// Read-only AI training assistant. Grounded in the athlete's own recent
// training (planned vs. logged) on the backend.
export const chatWithAssistant = (messages) =>
  client.post('/assistant/chat', { messages });

export const getWeeklySummary = () =>
  client.post('/assistant/weekly-summary');

// Summarize a long conversation into a brief so the chat can continue cheaply.
export const compactConversation = (messages) =>
  client.post('/assistant/compact', { messages });
