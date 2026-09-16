/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Product {
  code: string; // Barcode or unique product code
  name: string;
  category?: string;
  minStock?: number;
}

export interface StockItem {
  id: string; // Unique combination of product, lot, address, and expiry
  productCode: string;
  productName: string;
  quantity: number;
  receivedQuantity?: number;
  unit: 'FD' | 'UN' | 'CX' | 'PCT';
  lot: string;
  manufacturingDate?: string;
  expirationDate?: string;
  noExpirationDate?: boolean;
  address: string; // Storage address, e.g., "PR-A1-N2" (Prateleira A1, Nível 2)
  supplier?: string;
  invoiceNumber?: string;
  checkerName?: string;
  receivedDate: string;
  entryMethod?: string; // 'Conferencia' | 'Edição' | 'Importação'
  updatedAt?: string; // Data de alteração
  updatedBy?: string; // Conferente que alterou
  updateReason?: string; // Motivo da alteração
  notes?: string;
}

export interface Movement {
  id: string;
  productCode: string;
  productName: string;
  type: 'ENTRADA' | 'SAIDA';
  quantity: number;
  unit: 'FD' | 'UN' | 'CX' | 'PCT';
  lot: string;
  manufacturingDate?: string;
  expirationDate?: string;
  noExpirationDate?: boolean;
  address: string;
  supplier?: string;
  invoiceNumber?: string;
  checkerName?: string;
  receivedDate: string;
  timestamp: string;
  entryMethod?: string;
  updatedAt?: string;
  updatedBy?: string;
  updateReason?: string;
  notes?: string;
}

export interface AppSettings {
  companyName: string;
  defaultAddress: string;
  locations: string[];
  checkers: string[];
  soundBeepEnabled: boolean;
  soundAlertEnabled: boolean;
  criticalExpiryDays: number;
  warningExpiryDays?: number;
  safeExpiryDays?: number;
  adminPassword: string;
}

