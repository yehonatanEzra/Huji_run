import client from './client';

// Read-only AI training assistant. Grounded in the athlete's own recent
// training (planned vs. logged) on the backend.
export const chatWithAssistant = (messages) =>
  client.post('/assistant/chat', { messages });

export const getWeeklySummary = () =>
  client.post('/assistant/weekly-summary');
