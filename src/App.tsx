/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Product, StockItem, Movement, AppSettings } from './types';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};
import {
  INITIAL_PRODUCTS,
  INITIAL_STOCK,
  INITIAL_MOVEMENTS
} from './data/mockProducts';
import MovementScreen from './components/MovementScreen';
import InventoryScreen from './components/InventoryScreen';
import SettingsScreen from './components/SettingsScreen';
import { loadStoredSettings } from './utils/settings';
import { playSuccessBeep, playErrorBuzzer } from './utils/audio';
import {
  ClipboardList,
  Archive,
  Zap,
  CheckCircle2,
  Database,
  Lock,
  Eye,
  EyeOff,
  X
} from 'lucide-react';

const APP_VERSION = '2.5.0';

const toIsoDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getTodayIsoDate = () => toIsoDate(new Date());

const matchesStockIdentity = (
  item: Pick<StockItem, 'productCode' | 'unit' | 'lot' | 'address' | 'manufacturingDate' | 'expirationDate' | 'noExpirationDate' | 'supplier' | 'invoiceNumber' | 'receivedDate' | 'notes'>,
  candidate: Pick<StockItem, 'productCode' | 'unit' | 'lot' | 'address' | 'manufacturingDate' | 'expirationDate' | 'noExpirationDate' | 'supplier' | 'invoiceNumber' | 'receivedDate' | 'notes'>
) =>
  item.productCode === candidate.productCode &&
  item.unit === candidate.unit &&
  item.lot === candidate.lot &&
  item.address === candidate.address &&
  (item.manufacturingDate || '') === (candidate.manufacturingDate || '') &&
  (item.expirationDate || '') === (candidate.expirationDate || '') &&
  Boolean(item.noExpirationDate) === Boolean(candidate.noExpirationDate) &&
  (item.supplier || '') === (candidate.supplier || '') &&
  (item.invoiceNumber || '') === (candidate.invoiceNumber || '') &&
  item.receivedDate === candidate.receivedDate &&
  (item.notes || '') === (candidate.notes || '');

const normalizeStockItem = (item: StockItem) => ({
  ...item,
  unit: item.unit || 'UN',
  quantity: Number(item.quantity) || 0,
  receivedQuantity: typeof item.receivedQuantity === 'number' ? item.receivedQuantity : Number(item.quantity) || 0,
  noExpirationDate: Boolean(item.noExpirationDate),
  supplier: item.supplier || undefined,
  invoiceNumber: item.invoiceNumber || undefined,
  checkerName: item.checkerName || undefined,
  receivedDate: item.receivedDate || item.manufacturingDate || getTodayIsoDate(),
  entryMethod: item.entryMethod || 'Conferencia',
  updatedAt: item.updatedAt || undefined,
  updatedBy: item.updatedBy || undefined,
  updateReason: item.updateReason || undefined,
  notes: item.notes || undefined,
});

const normalizeMovement = (movement: Movement) => ({
  ...movement,
  unit: movement.unit || 'UN',
  noExpirationDate: Boolean(movement.noExpirationDate),
  supplier: movement.supplier || undefined,
  invoiceNumber: movement.invoiceNumber || undefined,
  checkerName: movement.checkerName || undefined,
  receivedDate: movement.receivedDate || movement.timestamp.split('T')[0] || getTodayIsoDate(),
  entryMethod: movement.entryMethod || (movement.type === 'SAIDA' ? 'Saída' : 'Conferencia'),
  updatedAt: movement.updatedAt || undefined,
  updatedBy: movement.updatedBy || undefined,
  updateReason: movement.updateReason || undefined,
  notes: movement.notes || undefined,
});

export default function App() {
  const [activeScreen, setActiveScreen] = useState<'MOVIMENTACAO' | 'CONSULTA' | 'CONFIGURACAO'>('MOVIMENTACAO');
  const [settings, setSettings] = useState<AppSettings>(() => loadStoredSettings());

  const [products, setProducts] = useState<Product[]>(() => {
    const saved = localStorage.getItem('fast_stock_products');
    return saved ? JSON.parse(saved) : INITIAL_PRODUCTS;
  });

  const [stock, setStock] = useState<StockItem[]>(() => {
    const saved = localStorage.getItem('fast_stock_inventory');
    return saved ? JSON.parse(saved).map(normalizeStockItem) : INITIAL_STOCK.map(normalizeStockItem);
  });

  const [movements, setMovements] = useState<Movement[]>(() => {
    const saved = localStorage.getItem('fast_stock_movements');
    return saved ? JSON.parse(saved).map(normalizeMovement) : INITIAL_MOVEMENTS.map(normalizeMovement);
  });

  const [scannedCode, setScannedCode] = useState<string>('');
  const [notification, setNotification] = useState<{message: string, type: 'success' | 'info'} | null>(null);
  const [installPromptEvent, setInstallPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [hasActiveConference, setHasActiveConference] = useState(false);
  const [showConfigPasswordModal, setShowConfigPasswordModal] = useState(false);
  const [configPasswordInput, setConfigPasswordInput] = useState('');
  const [configPasswordError, setConfigPasswordError] = useState<string | null>(null);
  const [showPasswordText, setShowPasswordText] = useState(false);
  const configPasswordInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showConfigPasswordModal) {
      setTimeout(() => {
        configPasswordInputRef.current?.focus();
      }, 100);
    }
  }, [showConfigPasswordModal]);

  useEffect(() => {
    localStorage.setItem('fast_stock_products', JSON.stringify(products));
  }, [products]);

  useEffect(() => {
    localStorage.setItem('fast_stock_inventory', JSON.stringify(stock));
  }, [stock]);

  useEffect(() => {
    localStorage.setItem('fast_stock_movements', JSON.stringify(movements));
  }, [movements]);

  useEffect(() => {
    const beforeInstallPromptHandler = (event: Event) => {
      event.preventDefault();
      setInstallPromptEvent(event as BeforeInstallPromptEvent);
      setShowInstallBanner(true);
    };

    window.addEventListener('beforeinstallprompt', beforeInstallPromptHandler as EventListener);
    return () => {
      window.removeEventListener('beforeinstallprompt', beforeInstallPromptHandler as EventListener);
    };
  }, []);

  useEffect(() => {
    let buffer = '';
    let lastKeyTime = Date.now();

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.contentEditable === 'true';
      const isBarcodeSearchInput = target.id === 'barcode-search-input';

      if (isInput && !isBarcodeSearchInput) {
        return;
      }

      if (isBarcodeSearchInput) {
        return;
      }

      const currentTime = Date.now();
      const timeDiff = currentTime - lastKeyTime;
      lastKeyTime = currentTime;

      if (timeDiff > 100 && e.key !== 'Enter') {
        buffer = '';
      }

      if (e.key.length === 1 && /[a-zA-Z0-9]/.test(e.key)) {
        buffer += e.key;
      } else if (e.key === 'Enter') {
        if (buffer.length >= 4) {
          e.preventDefault();
          if (!hasActiveConference) {
            setActiveScreen('MOVIMENTACAO');
            showNotification('Informe o conferente e libere a conferência antes de bipar produtos.', 'info');
            buffer = '';
            return;
          }
          setActiveScreen('MOVIMENTACAO');
          setScannedCode(buffer);
          showNotification(`Scanner Bluetooth detectou código: ${buffer}`, 'success');
          buffer = '';
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, [hasActiveConference]);

  const showNotification = (message: string, type: 'success' | 'info' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => {
      setNotification(null);
    }, 4000);
  };

  const handleInstallApp = async () => {
    if (!installPromptEvent) return;
    installPromptEvent.prompt();
    const choiceResult = await installPromptEvent.userChoice;
    setInstallPromptEvent(null);
    setShowInstallBanner(false);
    if (choiceResult.outcome === 'accepted') {
      showNotification('Instalação aceita! Adicionado à tela inicial.', 'success');
    } else {
      showNotification('Instalação cancelada pelo usuário.', 'info');
    }
  };

  const handleAddProduct = (newProduct: Product) => {
    setProducts((prev) => {
      if (prev.some(p => p.code === newProduct.code)) return prev;
      return [newProduct, ...prev];
    });
    showNotification(`Produto "${newProduct.name}" cadastrado no banco de dados!`, 'success');
  };

  const handleUpdateProduct = (updatedProduct: Product, oldCode?: string) => {
    const targetCode = oldCode || updatedProduct.code;
    setProducts((prev) =>
      prev.map((p) => (p.code === targetCode ? updatedProduct : p))
    );
    setStock((prev) =>
      prev.map((item) => {
        if (item.productCode === targetCode) {
          return {
            ...item,
            productCode: updatedProduct.code,
            productName: updatedProduct.name
          };
        }
        return item;
      })
    );
    setMovements((prev) =>
      prev.map((mov) => {
        if (mov.productCode === targetCode) {
          return {
            ...mov,
            productCode: updatedProduct.code,
            productName: updatedProduct.name
          };
        }
        return mov;
      })
    );
  };

  const handleDeleteProduct = (productCode: string) => {
    setProducts((prev) => prev.filter((p) => p.code !== productCode));
  };

  const handleImportData = (
    importedProducts: Product[],
    importedStockEntries: (StockItem | Omit<StockItem, 'id'>)[]
  ) => {
    const mergedProductsMap = new Map<string, Product>();
    for (const p of products) {
      mergedProductsMap.set(p.code, p);
    }
    for (const ip of importedProducts) {
      mergedProductsMap.set(ip.code, ip);
    }
    const mergedProducts = Array.from(mergedProductsMap.values());
    setProducts(mergedProducts);

    if (importedStockEntries.length > 0) {
      const now = Date.now();
      let seq = 0;
      const updatedStock = [...stock];
      for (const entry of importedStockEntries) {
        const existingIdx = updatedStock.findIndex(
          (s) => s.productCode === entry.productCode && s.lot === entry.lot && s.address === entry.address
        );
        if (existingIdx >= 0) {
          updatedStock[existingIdx] = {
            ...updatedStock[existingIdx],
            quantity: updatedStock[existingIdx].quantity + entry.quantity,
            entryMethod: entry.entryMethod || updatedStock[existingIdx].entryMethod || 'Importação',
            updatedAt: entry.updatedAt || updatedStock[existingIdx].updatedAt,
            updatedBy: entry.updatedBy || updatedStock[existingIdx].updatedBy,
            updateReason: entry.updateReason || updatedStock[existingIdx].updateReason
          };
        } else {
          seq += 1;
          const entryWithId: StockItem = 'id' in entry && entry.id ? (entry as StockItem) : {
            id: `stock-import-${now}-${seq}`,
            ...entry,
            entryMethod: entry.entryMethod || 'Importação'
          };
          updatedStock.unshift(entryWithId);
        }
      }
      setStock(updatedStock);
    }
  };

  const handleAddMovement = (newMov: Omit<Movement, 'id' | 'timestamp'>) => {
    const timestamp = new Date().toISOString();
    const id = `mov-${Date.now()}`;
    const normalizedUnit: Movement['unit'] =
      newMov.unit === 'FD' || newMov.unit === 'CX' || newMov.unit === 'PCT' ? newMov.unit : 'UN';
    const movementWithMeta: Movement = { ...newMov, unit: normalizedUnit, id, timestamp };

    setMovements((prev) => [movementWithMeta, ...prev]);

    setStock((prevStock) => {
      const stockCopy = [...prevStock];

      if (newMov.type === 'ENTRADA') {
        const existingItemIndex = stockCopy.findIndex(
          (item) => matchesStockIdentity(item, movementWithMeta)
        );

        if (existingItemIndex > -1) {
          const existingItem = stockCopy[existingItemIndex];
          const nextQuantity = existingItem.quantity + newMov.quantity;
          const nextReceivedQuantity = (existingItem.receivedQuantity ?? existingItem.quantity) + newMov.quantity;
          stockCopy[existingItemIndex] = {
            ...existingItem,
            quantity: nextQuantity,
            receivedQuantity: nextReceivedQuantity,
            entryMethod: existingItem.entryMethod || 'Conferencia'
          };
        } else {
          stockCopy.push({
            id: `stock-${Date.now()}`,
            productCode: newMov.productCode,
            productName: newMov.productName,
            quantity: newMov.quantity,
            receivedQuantity: newMov.quantity,
            unit: normalizedUnit,
            lot: newMov.lot,
            manufacturingDate: newMov.manufacturingDate,
            expirationDate: newMov.expirationDate,
            noExpirationDate: newMov.noExpirationDate,
            address: newMov.address,
            supplier: newMov.supplier,
            invoiceNumber: newMov.invoiceNumber,
            checkerName: newMov.checkerName,
            receivedDate: newMov.receivedDate,
            entryMethod: newMov.entryMethod || 'Conferencia',
            updatedAt: newMov.updatedAt,
            updatedBy: newMov.updatedBy,
            updateReason: newMov.updateReason,
            notes: newMov.notes
          });
        }
      }

      return stockCopy;
    });

    // Sincroniza produto na Base de Dados caso ainda não exista
    setProducts((prev) => {
      if (prev.some((p) => p.code === newMov.productCode)) return prev;
      return [{ code: newMov.productCode, name: newMov.productName, category: 'Geral' }, ...prev];
    });
  };

  const handleDeleteMovement = (movementId: string) => {
    const movToCancel = movements.find(m => m.id === movementId);
    if (!movToCancel) return;

    const confirmed = window.confirm(
      `Deseja realmente ESTORNAR (cancelar) a movimentação de ${movToCancel.type} do produto "${movToCancel.productName}" (Qtd: ${movToCancel.quantity})?\nO estoque será recalculado.`
    );
    if (!confirmed) return;

    setMovements((prev) => prev.filter(m => m.id !== movementId));

    setStock((prevStock) => {
      const stockCopy = [...prevStock];

      const existingIndex = stockCopy.findIndex(
        (item) => matchesStockIdentity(item, movToCancel)
      );

      if (existingIndex > -1) {
        const currentQty = stockCopy[existingIndex].quantity;
        const remaining = Math.max(0, currentQty - movToCancel.quantity);
        if (remaining === 0) {
          stockCopy.splice(existingIndex, 1);
        } else {
          stockCopy[existingIndex] = { ...stockCopy[existingIndex], quantity: remaining };
        }
      }

      return stockCopy;
    });

    showNotification('Movimentação estornada com sucesso. Estoque atualizado!', 'info');
  };

  const handleStockTransfer = ({
    itemId,
    destination,
    quantity,
    expirationDate,
  }: {
    itemId: string;
    destination: string;
    quantity: number;
    expirationDate: string;
  }) => {
    const selectedItem = stock.find((item) => item.id === itemId);
    if (!selectedItem) return;

    const safeQuantity = Math.max(1, Math.min(quantity, selectedItem.quantity));
    const movementId = `mov-transfer-${Date.now()}`;
    const isBaixa = destination.trim().toLowerCase() === 'baixado';
    const today = getTodayIsoDate();

    if (isBaixa) {
      setStock((prevStock) => {
        if (safeQuantity >= selectedItem.quantity) {
          // Totalidade baixada: permanece no banco de dados com endereço "Baixado"
          return prevStock.map((item) => {
            if (item.id !== itemId) return item;
            return {
              ...item,
              address: 'Baixado',
              updatedAt: today,
              updateReason: 'Baixa de mercadoria',
            };
          });
        } else {
          // Baixa parcial: atualiza quantidade restante e cria registro baixado no banco de dados
          const updatedOriginal: StockItem = {
            ...selectedItem,
            quantity: selectedItem.quantity - safeQuantity,
            updatedAt: today,
            updateReason: `Baixa parcial de ${safeQuantity} ${selectedItem.unit}`,
          };
          const baixadoItem: StockItem = {
            ...selectedItem,
            id: `stock-baixado-${Date.now()}`,
            quantity: safeQuantity,
            receivedQuantity: safeQuantity,
            address: 'Baixado',
            updatedAt: today,
            updateReason: 'Baixa de mercadoria',
          };
          return prevStock.map((item) => (item.id === itemId ? updatedOriginal : item)).concat(baixadoItem);
        }
      });

      setMovements((prevMovements) => [
        {
          id: movementId,
          productCode: selectedItem.productCode,
          productName: selectedItem.productName,
          type: 'SAIDA',
          quantity: safeQuantity,
          unit: selectedItem.unit,
          lot: selectedItem.lot,
          manufacturingDate: selectedItem.manufacturingDate,
          expirationDate: expirationDate || selectedItem.expirationDate,
          noExpirationDate: !expirationDate,
          address: 'Baixado',
          supplier: selectedItem.supplier,
          invoiceNumber: selectedItem.invoiceNumber,
          checkerName: selectedItem.checkerName,
          receivedDate: selectedItem.receivedDate,
          timestamp: new Date().toISOString(),
          entryMethod: 'Saída',
          notes: `Baixa de mercadoria (${safeQuantity} ${selectedItem.unit})`,
        },
        ...prevMovements,
      ]);

      showNotification(`Baixa de ${safeQuantity} ${selectedItem.unit} registrada na base de dados.`, 'info');
      return;
    }

    // Transferência para outro local físico (ex: Geladeira, Estoque, etc.)
    setStock((prevStock) => {
      if (safeQuantity >= selectedItem.quantity) {
        return prevStock.map((item) => {
          if (item.id !== itemId) return item;
          return {
            ...item,
            address: destination,
            expirationDate: expirationDate || item.expirationDate,
            noExpirationDate: !expirationDate,
            updatedAt: today,
            updateReason: `Transferência para ${destination}`,
          };
        });
      } else {
        const remainingItem: StockItem = {
          ...selectedItem,
          quantity: selectedItem.quantity - safeQuantity,
          updatedAt: today,
          updateReason: `Transferência parcial para ${destination}`,
        };
        const transferredItem: StockItem = {
          ...selectedItem,
          id: `stock-transfer-${Date.now()}`,
          quantity: safeQuantity,
          receivedQuantity: safeQuantity,
          address: destination,
          expirationDate: expirationDate || selectedItem.expirationDate,
          noExpirationDate: !expirationDate,
          updatedAt: today,
          updateReason: `Transferido de ${selectedItem.address}`,
        };
        return prevStock.map((item) => (item.id === itemId ? remainingItem : item)).concat(transferredItem);
      }
    });

    setMovements((prevMovements) => [
      {
        id: movementId,
        productCode: selectedItem.productCode,
        productName: selectedItem.productName,
        type: 'SAIDA',
        quantity: safeQuantity,
        unit: selectedItem.unit,
        lot: selectedItem.lot,
        manufacturingDate: selectedItem.manufacturingDate,
        expirationDate: expirationDate || selectedItem.expirationDate,
        noExpirationDate: !expirationDate,
        address: destination,
        supplier: selectedItem.supplier,
        invoiceNumber: selectedItem.invoiceNumber,
        checkerName: selectedItem.checkerName,
        receivedDate: selectedItem.receivedDate,
        timestamp: new Date().toISOString(),
        notes: `Movimentação de ${selectedItem.address} para ${destination}`,
      },
      ...prevMovements,
    ]);

    showNotification(`Movimentação registrada para ${selectedItem.productName}.`, 'success');
  };

  const handleUpdateStockItem = (
    updatedItem: StockItem,
    audit: { checkerName: string; reason: string }
  ) => {
    const today = getTodayIsoDate();
    const enrichedItem: StockItem = {
      ...updatedItem,
      entryMethod: 'Edição',
      updatedAt: today,
      updatedBy: audit.checkerName,
      updateReason: audit.reason,
    };

    setStock((prev) =>
      prev.map((item) => (item.id === updatedItem.id ? enrichedItem : item))
    );

    // Synchronize product catalog description if changed
    setProducts((prev) => {
      const exists = prev.some((p) => p.code === updatedItem.productCode);
      if (exists) {
        return prev.map((p) =>
          p.code === updatedItem.productCode ? { ...p, name: updatedItem.productName } : p
        );
      }
      return [{ code: updatedItem.productCode, name: updatedItem.productName, category: 'Geral' }, ...prev];
    });

    // Record audit movement in history
    const movementId = `mov-edit-${Date.now()}`;
    setMovements((prev) => [
      {
        id: movementId,
        productCode: enrichedItem.productCode,
        productName: enrichedItem.productName,
        type: 'ENTRADA',
        quantity: enrichedItem.quantity,
        unit: enrichedItem.unit,
        lot: enrichedItem.lot,
        manufacturingDate: enrichedItem.manufacturingDate,
        expirationDate: enrichedItem.expirationDate,
        noExpirationDate: enrichedItem.noExpirationDate,
        address: enrichedItem.address,
        supplier: enrichedItem.supplier,
        invoiceNumber: enrichedItem.invoiceNumber,
        checkerName: enrichedItem.checkerName,
        receivedDate: enrichedItem.receivedDate,
        timestamp: new Date().toISOString(),
        entryMethod: 'Edição',
        updatedAt: today,
        updatedBy: audit.checkerName,
        updateReason: audit.reason,
        notes: `Alteração realizada por ${audit.checkerName}. Motivo: ${audit.reason}`,
      },
      ...prev,
    ]);

    showNotification(`Item "${enrichedItem.productName}" alterado com sucesso!`, 'success');
  };

  const handleDeleteStockItem = (stockItemId: string) => {
    const item = stock.find((s) => s.id === stockItemId);
    setStock((prev) => prev.filter((s) => s.id !== stockItemId));
    showNotification(`Item "${item?.productName || stockItemId}" removido da base.`, 'info');
  };

  const handleAddStockItem = (newItem: Omit<StockItem, 'id'>) => {
    const stockId = `stock-${Date.now()}`;
    const fullItem: StockItem = {
      ...newItem,
      id: stockId,
      entryMethod: newItem.entryMethod || 'Conferencia',
    };
    setStock((prev) => [fullItem, ...prev]);

    setProducts((prev) => {
      if (prev.some((p) => p.code === fullItem.productCode)) {
        return prev;
      }
      return [{ code: fullItem.productCode, name: fullItem.productName, category: 'Geral' }, ...prev];
    });

    const movementId = `mov-add-${Date.now()}`;
    setMovements((prev) => [
      {
        id: movementId,
        productCode: fullItem.productCode,
        productName: fullItem.productName,
        type: 'ENTRADA',
        quantity: fullItem.quantity,
        unit: fullItem.unit,
        lot: fullItem.lot,
        manufacturingDate: fullItem.manufacturingDate,
        expirationDate: fullItem.expirationDate,
        noExpirationDate: fullItem.noExpirationDate,
        address: fullItem.address,
        supplier: fullItem.supplier,
        invoiceNumber: fullItem.invoiceNumber,
        checkerName: fullItem.checkerName,
        receivedDate: fullItem.receivedDate,
        timestamp: new Date().toISOString(),
        entryMethod: fullItem.entryMethod || 'Conferencia',
        notes: 'Cadastro direto na base de dados',
      },
      ...prev,
    ]);

    showNotification(`Item "${fullItem.productName}" cadastrado com sucesso!`, 'success');
  };

  const handleUpdateSettings = (newSettings: AppSettings) => {
    setSettings(newSettings);
    localStorage.setItem('fast_stock_settings', JSON.stringify(newSettings));
  };

  const handleRestoreBackup = (data: {
    products: Product[];
    stock: StockItem[];
    movements: Movement[];
    settings?: AppSettings;
  }) => {
    setProducts(data.products);
    setStock(data.stock);
    setMovements(data.movements);
    localStorage.setItem('fast_stock_products', JSON.stringify(data.products));
    localStorage.setItem('fast_stock_inventory', JSON.stringify(data.stock));
    localStorage.setItem('fast_stock_movements', JSON.stringify(data.movements));
    if (data.settings) {
      setSettings(data.settings);
      localStorage.setItem('fast_stock_settings', JSON.stringify(data.settings));
    }
  };

  const handleResetDatabase = () => {
    localStorage.removeItem('fast_stock_products');
    localStorage.removeItem('fast_stock_inventory');
    localStorage.removeItem('fast_stock_movements');
    setProducts([]);
    setStock([]);
    setMovements([]);
    playSuccessBeep(true);
    showNotification('Base de dados limpa com sucesso!', 'info');
  };

  const handleConfirmConfigPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (configPasswordInput === settings.adminPassword) {
      playSuccessBeep(true);
      setShowConfigPasswordModal(false);
      setConfigPasswordInput('');
      setConfigPasswordError(null);
      setActiveScreen('CONFIGURACAO');
      showNotification('Acesso às configurações liberado com sucesso!', 'success');
    } else {
      playErrorBuzzer(true);
      setConfigPasswordError('Senha administrativa incorreta. Tente novamente.');
      if (configPasswordInputRef.current) {
        configPasswordInputRef.current.select();
      }
    }
  };

  const handleScreenChange = (screen: 'MOVIMENTACAO' | 'CONSULTA' | 'CONFIGURACAO') => {
    if (screen === activeScreen) {
      return;
    }

    if (screen !== 'MOVIMENTACAO' && hasActiveConference) {
      showNotification('Conclua a conferência atual antes de mudar de aba.', 'info');
      return;
    }

    if (screen === 'CONFIGURACAO') {
      setConfigPasswordInput('');
      setConfigPasswordError(null);
      setShowPasswordText(false);
      setShowConfigPasswordModal(true);
      return;
    }

    setActiveScreen(screen);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between select-none">
      <header className="bg-slate-900 text-white shadow-md border-b border-slate-800 shrink-0">
        <div className="max-w-4xl mx-auto px-4 py-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-600 p-2.5 rounded-xl text-white shadow-lg shadow-emerald-600/30 flex items-center justify-center">
              <Zap className="h-6 w-6 text-yellow-300 fill-yellow-300 shrink-0" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-sans font-black text-lg tracking-tight">
                  {settings.companyName || 'C4 Gestão'}
                </h1>
                <span className="text-[10px] bg-emerald-500/20 text-emerald-300 font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                  Módulo Conferência
                </span>
                <span className="text-[10px] text-white font-semibold tracking-wide">
                  v{APP_VERSION}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Registro e conferência rápida de entradas de mercadorias
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto bg-slate-50 pb-6">
        {showInstallBanner && (
          <div className="max-w-4xl mx-auto mt-4 px-4">
            <div className="bg-indigo-600 text-white rounded-3xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg shadow-indigo-600/20">
              <div>
                <p className="font-bold text-sm">Instale o aplicativo no tablet ou celular</p>
                <p className="text-xs text-indigo-100 mt-1">Use o botão abaixo para adicionar o C4 Gestão à tela inicial e acessar rapidamente offline.</p>
              </div>
              <button
                type="button"
                onClick={handleInstallApp}
                className="rounded-full bg-white text-indigo-700 px-4 py-2 text-xs font-bold uppercase tracking-wide shadow-sm hover:bg-slate-100 transition"
              >
                Instalar App
              </button>
            </div>
          </div>
        )}

        {notification && (
          <div className="max-w-md mx-auto mt-4 px-4">
            <div className={`p-3.5 rounded-xl text-xs font-semibold shadow-md flex items-center gap-2 animate-bounce ${
              notification.type === 'success'
                ? 'bg-emerald-600 text-white'
                : 'bg-indigo-600 text-white'
            }`}>
              <CheckCircle2 className="h-4.5 w-4.5 text-white shrink-0" />
              <span>{notification.message}</span>
            </div>
          </div>
        )}

        <div className="max-w-4xl mx-auto px-4 mt-4">
          <nav className="bg-white p-1.5 rounded-2xl border border-slate-200/80 shadow-sm grid grid-cols-3 gap-1">
            <button
              onClick={() => handleScreenChange('MOVIMENTACAO')}
              className={`py-3 px-2 rounded-xl font-bold text-xs sm:text-sm tracking-tight transition-all duration-150 flex flex-col sm:flex-row items-center justify-center gap-1.5 cursor-pointer ${
                activeScreen === 'MOVIMENTACAO'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/10'
                  : 'text-slate-600 hover:text-indigo-600 hover:bg-slate-50'
              }`}
            >
              <ClipboardList className="h-4 w-4 shrink-0" />
              <span>Registrar Entrada</span>
            </button>

            <button
              onClick={() => handleScreenChange('CONSULTA')}
              title={hasActiveConference ? 'Conclua a conferência atual para abrir esta aba.' : undefined}
              className={`py-3 px-2 rounded-xl font-bold text-xs sm:text-sm tracking-tight transition-all duration-150 flex flex-col sm:flex-row items-center justify-center gap-1.5 cursor-pointer ${
                activeScreen === 'CONSULTA'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/10'
                  : hasActiveConference
                    ? 'text-slate-300 bg-slate-50'
                    : 'text-slate-600 hover:text-indigo-600 hover:bg-slate-50'
              }`}
            >
              <Archive className="h-4 w-4 shrink-0" />
              <span>Consulta de Estoque</span>
            </button>

            <button
              onClick={() => handleScreenChange('CONFIGURACAO')}
              title={hasActiveConference ? 'Conclua a conferência atual para abrir esta aba.' : undefined}
              className={`py-3 px-2 rounded-xl font-bold text-xs sm:text-sm tracking-tight transition-all duration-150 flex flex-col sm:flex-row items-center justify-center gap-1.5 cursor-pointer ${
                activeScreen === 'CONFIGURACAO'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/10'
                  : hasActiveConference
                    ? 'text-slate-300 bg-slate-50'
                    : 'text-slate-600 hover:text-indigo-600 hover:bg-slate-50'
              }`}
            >
              <Database className="h-4 w-4 shrink-0" />
              <span>Banco de Dados</span>
            </button>
          </nav>
        </div>

        <div className="mt-4">
          {activeScreen === 'MOVIMENTACAO' && (
            <MovementScreen
              products={products}
              stock={stock}
              settings={settings}
              onAddMovement={handleAddMovement}
              onAddProduct={handleAddProduct}
              scannedCode={scannedCode}
              setScannedCode={setScannedCode}
              onConferenceStateChange={setHasActiveConference}
            />
          )}

          {activeScreen === 'CONSULTA' && (
            <InventoryScreen
              products={products}
              stock={stock}
              movements={movements}
              settings={settings}
              onDeleteMovement={handleDeleteMovement}
              onStockTransfer={handleStockTransfer}
              onUpdateStockItem={handleUpdateStockItem}
              onDeleteStockItem={handleDeleteStockItem}
            />
          )}

          {activeScreen === 'CONFIGURACAO' && (
            <SettingsScreen
              products={products}
              settings={settings}
              onAddProduct={handleAddProduct}
              onUpdateProduct={handleUpdateProduct}
              onDeleteProduct={handleDeleteProduct}
              onImportProducts={(newProducts) => {
                const map = new Map<string, Product>();
                products.forEach((p) => map.set(p.code, p));
                newProducts.forEach((p) => map.set(p.code, p));
                const merged = Array.from(map.values());
                setProducts(merged);
                showNotification(`${newProducts.length} produto(s) importado(s) na Base de Dados!`, 'success');
              }}
              onResetProducts={() => {
                setProducts([]);
                localStorage.removeItem('fast_stock_products');
                showNotification('Base de Dados de produtos limpa com sucesso!', 'info');
              }}
              onNotify={showNotification}
              onUpdateSettings={handleUpdateSettings}
            />
          )}
        </div>

        {/* Modal de Senha para Acesso ao Módulo de Configurações */}
        {showConfigPasswordModal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150"
            onClick={() => setShowConfigPasswordModal(false)}
          >
            <div
              className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-slate-100 space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2.5 text-slate-800">
                  <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
                    <Lock className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-slate-900">Acesso Restrito</h3>
                    <p className="text-[11px] text-slate-400">Módulo de Configuração</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowConfigPasswordModal(false)}
                  className="text-slate-400 hover:text-slate-600 p-1 rounded-lg transition"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <p className="text-xs text-slate-600 leading-relaxed">
                Digite a senha de administrador para acessar as configurações do sistema.
              </p>

              <form onSubmit={handleConfirmConfigPassword} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700">
                    Senha Administrativa
                  </label>
                  <div className="relative">
                    <input
                      ref={configPasswordInputRef}
                      type={showPasswordText ? 'text' : 'password'}
                      value={configPasswordInput}
                      onChange={(e) => {
                        setConfigPasswordInput(e.target.value);
                        if (configPasswordError) setConfigPasswordError(null);
                      }}
                      placeholder="Digite a senha..."
                      className="w-full pl-3.5 pr-10 py-2.5 text-sm rounded-xl border border-slate-200 bg-slate-50 focus:bg-white text-slate-800 focus:outline-none focus:border-indigo-500 font-medium transition"
                      id="config-password-input"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPasswordText(!showPasswordText)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                      title={showPasswordText ? 'Ocultar senha' : 'Ver senha'}
                    >
                      {showPasswordText ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>

                  {configPasswordError && (
                    <p className="text-xs text-rose-600 font-semibold pt-1">
                      {configPasswordError}
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowConfigPasswordModal(false)}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2 rounded-xl text-xs font-bold shadow-sm transition flex items-center gap-1.5 cursor-pointer"
                    id="btn-confirm-config-password"
                  >
                    <Lock className="h-3.5 w-3.5" />
                    Entrar
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
