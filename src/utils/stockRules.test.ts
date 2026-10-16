import test from 'node:test';
import assert from 'node:assert/strict';
import type { StockItem } from '../types';
import { applyEntryToItem, createEntryItem, getHistoricalQuantities, splitStockItem } from './stockRules';
import { DATABASE_EXPORT_HEADERS, buildStockExportRow } from './stockTemplate';

const base = {
  id: 'stock-1',
  productCode: 'P1',
  productName: 'Produto 1',
  unit: 'UN' as const,
  lot: 'L1',
  address: 'ESTOQUE',
  receivedDate: '2026-01-10',
  entryMethod: 'Conferencia',
};

const entry = (quantity: number, invoiceQuantity?: number): StockItem =>
  createEntryItem(base as never, { quantity, invoiceQuantity });

test('entrada com NF: NF, CONF. e EST. separados (divergência preservada)', () => {
  const item = entry(6, 8);
  assert.deepEqual([item.invoiceQuantity, item.receivedQuantity, item.quantity], [8, 6, 6]);
  assert.deepEqual(getHistoricalQuantities(item), { invoice: 8, conferred: 6 });
});

test('entrada sem NF: NF indefinida, CONF. = quantidade da entrada', () => {
  const item = entry(5);
  assert.equal(item.invoiceQuantity, undefined);
  assert.deepEqual(getHistoricalQuantities(item), { invoice: undefined, conferred: 5 });
});

test('múltiplas entradas no mesmo lote somam NF, CONF. e EST.', () => {
  const item = applyEntryToItem(entry(6, 8), { quantity: 4, invoiceQuantity: 5 });
  assert.deepEqual([item.invoiceQuantity, item.receivedQuantity, item.quantity], [13, 10, 10]);
});

test('entrada sem NF num lote com NF descarta a NF somada (não comparável)', () => {
  const item = applyEntryToItem(entry(6, 8), { quantity: 4 });
  assert.equal(item.invoiceQuantity, undefined);
  assert.equal(item.receivedQuantity, 10);
});

test('saída/transferência parcial só reduz o saldo do original', () => {
  const original = entry(6, 8);
  const { remaining, moved } = splitStockItem(original, 2, 'stock-2', { address: 'GELADEIRA' });
  assert.deepEqual(
    [remaining.invoiceQuantity, remaining.receivedQuantity, remaining.quantity],
    [8, 6, 4]
  );
  assert.equal(moved.quantity, 2);
  assert.equal(moved.address, 'GELADEIRA');
  assert.equal(moved.originStockId, 'stock-1');
  assert.equal(moved.invoiceQuantity, undefined);
  assert.equal(moved.receivedQuantity, undefined);
  assert.deepEqual(getHistoricalQuantities(moved), {});
});

test('histórico total não é duplicado entre original e derivados', () => {
  const original = entry(10, 10);
  const first = splitStockItem(original, 3, 'stock-2', {});
  const second = splitStockItem(first.remaining, 2, 'stock-3', {});
  const items = [second.remaining, first.moved, second.moved];
  const conferred = items.reduce((sum, i) => sum + (getHistoricalQuantities(i).conferred ?? 0), 0);
  const stock = items.reduce((sum, i) => sum + i.quantity, 0);
  assert.equal(conferred, 10);
  assert.equal(stock, 10);
});

test('derivado de derivado aponta para o registro original', () => {
  const first = splitStockItem(entry(10, 10), 4, 'stock-2', {});
  const second = splitStockItem(first.moved, 1, 'stock-3', {});
  assert.equal(second.moved.originStockId, 'stock-1');
});

test('item importado não exibe NF/CONF.', () => {
  const imported = { ...entry(7), entryMethod: 'Importação' };
  assert.deepEqual(getHistoricalQuantities(imported), {});
});

test('exportação Excel: cada valor alinhado ao seu cabeçalho', () => {
  const item = entry(6, 8);
  const row = buildStockExportRow(item);
  assert.equal(row.length, DATABASE_EXPORT_HEADERS.length);
  const at = (header: string) => row[DATABASE_EXPORT_HEADERS.indexOf(header as never)];
  assert.equal(at('QTD. NF'), 8);
  assert.equal(at('QTD. CONF.'), 6);
  assert.equal(at('QTD. EST.'), 6);

  const { remaining, moved } = splitStockItem(item, 2, 'stock-2', {});
  const remRow = buildStockExportRow(remaining);
  const movRow = buildStockExportRow(moved);
  const col = (r: (string | number)[], h: string) => r[DATABASE_EXPORT_HEADERS.indexOf(h as never)];
  assert.deepEqual([col(remRow, 'QTD. NF'), col(remRow, 'QTD. CONF.'), col(remRow, 'QTD. EST.')], [8, 6, 4]);
  assert.deepEqual([col(movRow, 'QTD. NF'), col(movRow, 'QTD. CONF.'), col(movRow, 'QTD. EST.')], ['', '', 2]);

  const importedRow = buildStockExportRow({ ...entry(7), entryMethod: 'Importação' });
  assert.deepEqual(
    [col(importedRow, 'QTD. NF'), col(importedRow, 'QTD. CONF.'), col(importedRow, 'QTD. EST.')],
    ['', '', 7]
  );
});
