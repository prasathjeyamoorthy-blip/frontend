import apiClient from './api';
import { loginForAccessToken } from '../main';

export async function login(username, password) {
  const response = await apiClient.post('/token', {
    username,
    password,
  });
  localStorage.setItem('access_token', response.data.access_token);
}

export async function logout() {
  localStorage.removeItem('access_token');
}