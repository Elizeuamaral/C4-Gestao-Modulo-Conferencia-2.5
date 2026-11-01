const DEFAULT_API_BASE_URL = `${window.location.protocol}//${window.location.hostname}:8000`;
const API_BASE_URL = (import.meta.env.VITE_API_URL || DEFAULT_API_BASE_URL).replace(/\/$/, '');

const AUTH_TOKEN_KEY = 'c4_auth_token';
export const AUTH_EXPIRED_EVENT = 'c4-auth-expired';

// sessionStorage is discarded when the app/tab is closed, so reopening requires a new login.
// Tokens left in localStorage by earlier versions are removed and never reused.
export function getAuthToken(): string | null {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  return sessionStorage.getItem(AUTH_TOKEN_KEY);
}

export function setAuthToken(token: string): void {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  sessionStorage.setItem(AUTH_TOKEN_KEY, token);
}

export function clearAuthToken(): void {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  sessionStorage.removeItem(AUTH_TOKEN_KEY);
}

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
  let response: Response;
  const token = getAuthToken();

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
    });
  } catch (error) {
    console.error(`Falha de conexão com a API: ${API_BASE_URL}${path}`, error);
    throw new Error(
      `Não foi possível conectar ao servidor C4 Gestão em ${API_BASE_URL}. Verifique se a API está em execução e acessível pela rede.`
    );
  }

  const body = await response.text();
  let data: unknown = null;
  if (body) {
    try {
      data = JSON.parse(body);
    } catch {
      data = body;
    }
  }

  if (!response.ok) {
    if (response.status === 401 && token && path !== '/auth/login') {
      clearAuthToken();
      window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
    }
    if (response.status === 404 && path.startsWith('/auth/') && (data === null || (typeof data === 'object' && (data as { detail?: unknown }).detail === 'Not Found'))) {
      throw new Error(
        `A API em ${API_BASE_URL} não possui as rotas de autenticação. Reinicie o backend com a versão atual do projeto.`
      );
    }
    const detail =
      typeof data === 'object' && data !== null && 'detail' in data
        ? String((data as { detail: unknown }).detail)
        : `Erro HTTP ${response.status}`;
    throw new Error(detail);
  }

  return data as T;
}

export async function listProducts(): Promise<ApiProduct[]> {
  const pageSize = 200;
  const products: ApiProduct[] = [];
  let offset = 0;

  while (true) {
    const response = await request<ProductListResponse>(
      `/products?active=true&limit=${pageSize}&offset=${offset}`
    );

    products.push(...response.items);

    if (products.length >= response.total || response.items.length < pageSize) {
      break;
    }

    offset += pageSize;
  }

  return products;
}

export async function listAllProducts(): Promise<ApiProduct[]> {
  const pageSize = 200;
  const inactiveProducts: ApiProduct[] = [];
  let offset = 0;

  while (true) {
    const response = await request<ProductListResponse>(
      `/products?active=false&limit=${pageSize}&offset=${offset}`
    );

    inactiveProducts.push(...response.items);

    if (inactiveProducts.length >= response.total || response.items.length < pageSize) {
      break;
    }

    offset += pageSize;
  }

  return [...await listProducts(), ...inactiveProducts];
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
  payload: { code?: string; name?: string; category?: string; min_stock?: number; active?: boolean },
): Promise<ApiProduct> {
  return request<ApiProduct>(`/products/${productId}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export function deactivateProduct(productId: string): Promise<ApiProduct> {
  return request<ApiProduct>(`/products/${productId}`, { method: 'DELETE' });
}


export interface ApiUser {
  id: string;
  full_name: string;
  username: string;
  role: 'ADMIN' | 'CONFERENTE';
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: 'bearer';
  user: ApiUser;
}

export async function getSetupStatus(): Promise<{ setup_required: boolean }> {
  return request('/auth/setup-status');
}

export async function loginUser(username: string, password: string): Promise<AuthResponse> {
  return request('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
}

export async function setupInitialAdmin(payload: {
  full_name: string;
  username: string;
  password: string;
}): Promise<AuthResponse> {
  return request('/auth/setup-admin', { method: 'POST', body: JSON.stringify(payload) });
}

export async function getCurrentUser(): Promise<ApiUser> {
  return request('/auth/me');
}

export async function logoutUser(): Promise<void> {
  await request('/auth/logout', { method: 'POST' });
}

export async function listUsers(includeInactive = true): Promise<ApiUser[]> {
  return request(`/auth/users?include_inactive=${includeInactive}`);
}

export async function createUser(payload: {
  full_name: string; username: string; password: string; role: 'ADMIN' | 'CONFERENTE';
}): Promise<ApiUser> {
  return request('/auth/users', { method: 'POST', body: JSON.stringify(payload) });
}

export async function updateUser(userId: string, payload: {
  full_name?: string; role?: 'ADMIN' | 'CONFERENTE';
}): Promise<ApiUser> {
  return request(`/auth/users/${userId}`, { method: 'PUT', body: JSON.stringify(payload) });
}

export async function resetUserPassword(userId: string, newPassword: string): Promise<void> {
  await request(`/auth/users/${userId}/reset-password`, {
    method: 'POST', body: JSON.stringify({ new_password: newPassword }),
  });
}

export async function setUserActive(userId: string, active: boolean): Promise<ApiUser> {
  return request(`/auth/users/${userId}/${active ? 'activate' : 'deactivate'}`, { method: 'POST' });
}

export async function changeOwnPassword(currentPassword: string, newPassword: string): Promise<void> {
  await request('/auth/me/password', {
    method: 'PUT', body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  });
}


export interface ApiLocation {
  id: string;
  code: string;
  name: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ApiInvoiceItem {
  id: string;
  invoice_id: string;
  line_number: number;
  product_id: string | null;
  product_code: string;
  product_description: string | null;
  unit: string;
  invoice_quantity: number;
  invoice_lot: string | null;
  invoice_expiration_date: string | null;
  status: string;
  conferred_quantity: number | null;
  divergence_quantity: number | null;
  conferred_by_user_id: string | null;
  conferred_at: string | null;
  stock_item_id: string | null;
  entry_movement_id: string | null;
  current_stock_quantity: number | null;
  notes: string | null;
}

export interface ApiInvoice {
  id: string;
  number: string;
  series: string | null;
  access_key: string | null;
  supplier: string | null;
  received_date: string | null;
  status: string;
  notes: string | null;
  created_by_user_id: string | null;
  conferred_by_user_id: string | null;
  conferred_at: string | null;
  created_at: string;
  updated_at: string;
  items: ApiInvoiceItem[];
}

export async function listLocations(): Promise<ApiLocation[]> {
  const response = await request<{ items: ApiLocation[]; total: number; limit: number; offset: number }>(
    '/locations?active=true&limit=200&offset=0',
  );
  return response.items;
}

export async function listInvoices(): Promise<ApiInvoice[]> {
  const response = await request<{ items: ApiInvoice[]; total: number; limit: number; offset: number }>(
    '/invoices?limit=200&offset=0',
  );
  return response.items;
}

export function createInvoiceFromXml(payload: {
  number: string;
  series: string | null;
  access_key: string;
  supplier: string | null;
  received_date: string;
  notes: string;
  items: Array<{
    product_code: string;
    product_description: string;
    unit: 'FD' | 'UN' | 'CX' | 'PCT';
    invoice_quantity: number;
    invoice_lot: string | null;
    invoice_expiration_date: string | null;
    notes: string | null;
  }>;
}): Promise<ApiInvoice> {
  return request<ApiInvoice>('/invoices', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function conferInvoiceItem(invoiceId: string, itemId: string, payload: {
  conferred_quantity: number;
  location_id: string;
  lot: string | null;
  manufacturing_date?: string | null;
  expiration_date: string | null;
  no_expiration_date: boolean;
  notes: string | null;
}): Promise<ApiInvoiceItem> {
  return request<ApiInvoiceItem>(`/invoices/${encodeURIComponent(invoiceId)}/items/${encodeURIComponent(itemId)}/confer`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
