import client from './client';

// Admin-only management of the AI coach's prompt store. The AI reads prompts
// from the DB at runtime and falls back to hardcoded defaults when a key has no
// row — so editing here tunes the assistant without a code deploy.

export const listPrompts = () =>
  client.get('/admin/prompts');

export const updatePrompt = (key, content) =>
  client.put(`/admin/prompts/${key}`, { content });

// Reset a prompt to its hardcoded default (deletes the DB row).
export const resetPrompt = (key) =>
  client.delete(`/admin/prompts/${key}`);
