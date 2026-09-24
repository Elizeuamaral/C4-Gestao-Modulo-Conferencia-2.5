const API_BASE_URL = (import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');

export interface ApiProduct {
  id: string;
  code: string;
  name: string;
  category: string | null;
  min_stock: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

interface ProductListResponse {
  items: ApiProduct[];
  total: number;
  limit: number;
  offset: number;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  const body = await response.text();
  let data: unknown = null;
  if (body) {
    try { data = JSON.parse(body); } catch { data = body; }
  }

  if (!response.ok) {
    const detail =
      typeof data === 'object' && data !== null && 'detail' in data
        ? String((data as { detail: unknown }).detail)
        : `Erro HTTP ${response.status}`;
    throw new Error(detail);
  }

  return data as T;
}

export async function listProducts(): Promise<ApiProduct[]> {
  const response = await request<ProductListResponse>('/products?active=true&limit=200&offset=0');
  return response.items;
}

export function createProduct(payload: {
  code: string;
  name: string;
  category?: string;
  min_stock?: number;
}): Promise<ApiProduct> {
  return request<ApiProduct>('/products', {
    method: 'POST',
    body: JSON.stringify({
      code: payload.code,
      name: payload.name,
      category: payload.category || 'Geral',
      min_stock: payload.min_stock ?? 0,
      active: true,
    }),
  });
}

export function updateProduct(
  productId: string,
  payload: { code?: string; name?: string; category?: string; min_stock?: number },
): Promise<ApiProduct> {
  return request<ApiProduct>(`/products/${productId}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export function deactivateProduct(productId: string): Promise<ApiProduct> {
  return request<ApiProduct>(`/products/${productId}`, { method: 'DELETE' });
}
