import type { StockItem } from '../types';

/**
 * Regras de quantidade do estoque.
 *
 * - QTD. NF (`invoiceQuantity`) e QTD. CONF. (`receivedQuantity`) são o histórico da ENTRADA do lote
 *   e só mudam quando uma nova entrada é somada ao mesmo registro.
 * - QTD. EST. (`quantity`) é o saldo atual do registro e é o único valor alterado por saídas.
 * - Quando um registro é dividido (saída/transferência parcial), o trecho movido vira um registro
 *   derivado (`originStockId`). Ele não é uma nova conferência nem uma nova nota: não carrega NF/CONF
 *   próprios, e o histórico permanece uma única vez no registro de origem.
 */

export interface EntryQuantities {
  quantity: number;
  invoiceQuantity?: number;
}

export const isDerivedStockItem = (item: Pick<StockItem, 'originStockId'>): boolean =>
  Boolean(item.originStockId);

/** Campos de QTD. NF / QTD. CONF. a exibir; `undefined` significa "não se aplica" ("-"). */
export const getHistoricalQuantities = (
  item: Pick<StockItem, 'originStockId' | 'entryMethod' | 'receivedQuantity' | 'invoiceQuantity'>
): { invoice?: number; conferred?: number } => {
  if (isDerivedStockItem(item) || item.entryMethod === 'Importação') return {};
  return {
    invoice: typeof item.invoiceQuantity === 'number' ? item.invoiceQuantity : undefined,
    conferred: typeof item.receivedQuantity === 'number' ? item.receivedQuantity : undefined,
  };
};

/** Soma uma nova entrada a um registro de lote existente (registros derivados nunca recebem entradas). */
export const applyEntryToItem = <T extends StockItem>(item: T, entry: EntryQuantities): T => ({
  ...item,
  quantity: item.quantity + entry.quantity,
  receivedQuantity: (item.receivedQuantity ?? item.quantity) + entry.quantity,
  // A NF só é comparável com a conferida se todas as entradas do lote a informaram.
  invoiceQuantity:
    typeof entry.invoiceQuantity === 'number' && typeof item.invoiceQuantity === 'number'
      ? item.invoiceQuantity + entry.invoiceQuantity
      : undefined,
});

export const createEntryItem = (
  base: Omit<StockItem, 'quantity' | 'receivedQuantity' | 'invoiceQuantity'>,
  entry: EntryQuantities
): StockItem => ({
  ...base,
  quantity: entry.quantity,
  receivedQuantity: entry.quantity,
  invoiceQuantity: entry.invoiceQuantity,
});

/**
 * Divide `movedQuantity` de um registro. O original só perde saldo (NF/CONF intactos);
 * o trecho movido vira registro derivado, apontando para o registro que guarda o histórico.
 */
export const splitStockItem = (
  item: StockItem,
  movedQuantity: number,
  newId: string,
  movedOverrides: Partial<StockItem>
): { remaining: StockItem; moved: StockItem } => ({
  remaining: { ...item, quantity: item.quantity - movedQuantity },
  moved: {
    ...item,
    ...movedOverrides,
    id: newId,
    quantity: movedQuantity,
    receivedQuantity: undefined,
    invoiceQuantity: undefined,
    originStockId: item.originStockId ?? item.id,
  },
});
