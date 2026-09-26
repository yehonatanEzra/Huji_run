import client from './client';

export const listTodos = () => client.get('/todos');
export const createTodo = (body) => client.post('/todos', body);
export const updateTodo = (id, body) => client.patch(`/todos/${id}`, body);
export const deleteTodo = (id) => client.delete(`/todos/${id}`);
export const clearCompletedTodos = () => client.delete('/todos/completed');
