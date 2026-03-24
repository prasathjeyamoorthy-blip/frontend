import apiClient from './api';

export async function getProducts() {
  try {
    const response = await apiClient.get('/products/');
    return response.data;
  } catch (error) {
    throw error;
  }
}