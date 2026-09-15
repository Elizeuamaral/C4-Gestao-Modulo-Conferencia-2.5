/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Product, StockItem, Movement } from '../types';
import { playSuccessBeep, playErrorBuzzer } from '../utils/audio';
import { 
  PlusCircle, 
  Barcode, 
  Calendar, 
  Package, 
  MapPin, 
  CornerDownRight, 
  ClipboardCheck, 
  RotateCcw,
  Plus,
  Layers,
  Truck,
  FileText,
  Check,
  Trash2,
  User
} from 'lucide-react';
import { STOCK_LOCATIONS } from '../data/mockProducts';
import { STOCK_TEMPLATE_HEADERS } from '../utils/stockTemplate';
import { AppSettings } from '../types';

interface MovementScreenProps {
  products: Product[];
  stock: StockItem[];
  settings?: AppSettings;
  onAddMovement: (movement: Omit<Movement, 'id' | 'timestamp'>) => void;
  onAddProduct: (product: Product) => void;
  // This state is shared so we can control scanning from parent
  scannedCode: string;
  setScannedCode: (code: string) => void;
  onConferenceStateChange: (hasActiveConference: boolean) => void;
}

type PendingMovementEntry = Omit<Movement, 'id' | 'timestamp' | 'supplier' | 'invoiceNumber'> & {
  queueId: string;
};

export default function MovementScreen({
  products,
  stock,
  settings,
  onAddMovement,
  onAddProduct,
  scannedCode,
  setScannedCode,
  onConferenceStateChange
}: MovementScreenProps) {
  const type = 'ENTRADA';
  const defaultInitialAddress = settings?.defaultAddress || 'ESTOQUE';
  const getTodayIsoDate = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  const getDaysUntilExpiration = (dateValue: string) => {
    const [year, month, day] = dateValue.split('-').map(Number);
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const targetStart = new Date(year, month - 1, day).getTime();
    return Math.round((targetStart - todayStart) / (1000 * 3600 * 24));
  };
  const formatDisplayDate = (dateValue?: string) => {
    if (!dateValue) return '-';
    const [year, month, day] = dateValue.split('-');
    if (year && month && day) {
      return `${day}/${month}/${year}`;
    }
    return dateValue;
  };
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  
  // Form fields
  const [productName, setProductName] = useState('');
  const [quantity, setQuantity] = useState<number>(1);
  const [unit, setUnit] = useState<'FD' | 'UN' | 'CX' | 'PCT'>('UN');
  const [lot, setLot] = useState('');
  const [manufacturingDate, setManufacturingDate] = useState('');
  const [expirationDate, setExpirationDate] = useState('');
  const [noExpirationDate, setNoExpirationDate] = useState(false);
  const [address, setAddress] = useState(defaultInitialAddress);
  const [supplier, setSupplier] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [checkerName, setCheckerName] = useState('');
  const [isConferenceStarted, setIsConferenceStarted] = useState(false);
  const [receivedDate, setReceivedDate] = useState(getTodayIsoDate());
  const [notes, setNotes] = useState('');

  // UI state
  const [isNewProduct, setIsNewProduct] = useState(false);
  const [showProductSuggestions, setShowProductSuggestions] = useState(false);
  const [keepFocus, setKeepFocus] = useState(true);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showEntryConfirmationModal, setShowEntryConfirmationModal] = useState(false);
  const [pendingEntries, setPendingEntries] = useState<PendingMovementEntry[]>([]);

  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const checkerInputRef = useRef<HTMLInputElement>(null);
  const lastInputTimeRef = useRef(0);
  const scannerTypingRef = useRef(false);
  const suggestionTimeoutRef = useRef<number | null>(null);

  // Focus management
  useEffect(() => {
    if (!isConferenceStarted && checkerInputRef.current) {
      checkerInputRef.current.focus();
      return;
    }

    if (keepFocus && barcodeInputRef.current) {
      barcodeInputRef.current.focus();
    }
  }, [isConferenceStarted, keepFocus, successMessage]);

  // Handle incoming scan from the simulated barcode panel or physical entry
  useEffect(() => {
    if (scannedCode) {
      if (!isConferenceStarted) {
        setErrorMessage('Informe o conferente e clique em "Liberar conferência" antes de bipar produtos.');
        playErrorBuzzer();
        setScannedCode('');
        if (checkerInputRef.current) {
          checkerInputRef.current.focus();
        }
        return;
      }

      handleProductCodeLookup(scannedCode, 'scanner');
      setScannedCode(''); // Reset trigger
    }
  }, [isConferenceStarted, scannedCode, setScannedCode]);

  useEffect(() => {
    onConferenceStateChange(isConferenceStarted || pendingEntries.length > 0);
  }, [isConferenceStarted, onConferenceStateChange, pendingEntries.length]);

  // Product lookup logic
  const handleProductCodeLookup = (code: string, source: 'manual' | 'scanner' = 'manual') => {
    const found = products.find(p => p.code === code || p.name.toLowerCase() === code.toLowerCase());
    scannerTypingRef.current = source === 'scanner';
    setShowProductSuggestions(false);
    if (suggestionTimeoutRef.current) {
      window.clearTimeout(suggestionTimeoutRef.current);
      suggestionTimeoutRef.current = null;
    }
    
    if (found) {
      // If the scanned product is already the selected one, increment the quantity
      if (selectedProduct && selectedProduct.code === found.code) {
        setQuantity(q => q + 1);
        if (source === 'scanner') {
          setSearchQuery('');
        }
      } else {
        setSelectedProduct(found);
        setProductName(found.name);
        setIsNewProduct(false);
        setSearchQuery(source === 'scanner' ? '' : found.code);
        setQuantity(1);
        
        // Preset empty fields for new entrance batch
        setLot('');
        setExpirationDate('');
        setNoExpirationDate(false);
        setManufacturingDate('');
        setUnit('UN');
        setAddress(defaultInitialAddress);
        setReceivedDate(getTodayIsoDate());
        setNotes('');
        setShowEntryConfirmationModal(false);
      }
      playSuccessBeep();
      setErrorMessage(null);
    } else {
      // Product not found in database. Enable creation of new product.
      setSelectedProduct(null);
      setProductName('');
      setIsNewProduct(true);
      setSearchQuery(code);
      setLot('');
      setExpirationDate('');
      setNoExpirationDate(false);
      setManufacturingDate('');
      setUnit('UN');
      setAddress('ESTOQUE');
      setQuantity(1);
      setShowEntryConfirmationModal(false);
      playErrorBuzzer();
      setErrorMessage(`Código "${code}" não cadastrado. Digite o nome para cadastrar.`);
    }

    // Keep focus strictly on the barcode input for rapid scanner bips
    setTimeout(() => {
      if (barcodeInputRef.current) {
        barcodeInputRef.current.focus();
      }
    }, 20);
  };

  // Handle text field changes in the search/barcode input
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const now = Date.now();
    const interval = now - lastInputTimeRef.current;
    lastInputTimeRef.current = now;

    const grewBy = value.length - searchQuery.length;
    if (grewBy > 0 && interval > 0 && interval < 35) {
      scannerTypingRef.current = true;
    } else if (interval > 120 || grewBy <= 0 || value.length === 0) {
      scannerTypingRef.current = false;
    }

    setSearchQuery(value);
    if (suggestionTimeoutRef.current) {
      window.clearTimeout(suggestionTimeoutRef.current);
      suggestionTimeoutRef.current = null;
    }

    if (!value.trim()) {
      setSelectedProduct(null);
      setProductName('');
      setIsNewProduct(false);
      setShowProductSuggestions(false);
      return;
    }

    if (!scannerTypingRef.current) {
      setSelectedProduct(null);
      setProductName('');
      setIsNewProduct(false);
      setErrorMessage(null);
    }

    setShowProductSuggestions(true);
  };

  const selectSuggestedProduct = (product: Product) => {
    handleProductCodeLookup(product.code);
    setShowProductSuggestions(false);
  };

  // Physical Bluetooth Scanner or Keyboard scanner: usually ends with enter
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const now = Date.now();
    const interval = now - lastInputTimeRef.current;
    if (e.key.length === 1) {
      scannerTypingRef.current = interval > 0 && interval < 50;
    } else if (e.key === 'Backspace' || e.key === 'Delete') {
      scannerTypingRef.current = false;
    }
    lastInputTimeRef.current = now;

    if (e.key === 'Enter') {
      e.preventDefault();
      if (suggestionTimeoutRef.current) {
        window.clearTimeout(suggestionTimeoutRef.current);
        suggestionTimeoutRef.current = null;
      }

      if (!scannerTypingRef.current && showProductSuggestions && suggestions.length > 0) {
        selectSuggestedProduct(suggestions[0]);
        return;
      }

      setShowProductSuggestions(false);
      const currentValue = e.currentTarget.value.trim();
      if (currentValue) {
        handleProductCodeLookup(currentValue, scannerTypingRef.current ? 'scanner' : 'manual');
      }
    }
  };

  const resetCurrentEntryFields = () => {
    setSearchQuery('');
    setSelectedProduct(null);
    setProductName('');
    setQuantity(1);
    setLot('');
    setManufacturingDate('');
    setExpirationDate('');
    setNoExpirationDate(false);
    setUnit('UN');
    setAddress(defaultInitialAddress);
    setReceivedDate(getTodayIsoDate());
    setNotes('');
    setIsNewProduct(false);
    setShowProductSuggestions(false);
    if (barcodeInputRef.current) barcodeInputRef.current.focus();
  };

  const handleClearForm = () => {
    resetCurrentEntryFields();
    setSupplier('');
    setInvoiceNumber('');
    setErrorMessage(null);
    setSuccessMessage(null);
    setShowProductSuggestions(false);
    setShowEntryConfirmationModal(false);
    setPendingEntries([]);
    scannerTypingRef.current = false;
    if (suggestionTimeoutRef.current) {
      window.clearTimeout(suggestionTimeoutRef.current);
      suggestionTimeoutRef.current = null;
    }
  };

  const handleStartConference = () => {
    const normalizedCheckerName = checkerName.trim();

    if (!normalizedCheckerName) {
      setErrorMessage('Informe o nome do conferente para liberar a conferência.');
      playErrorBuzzer();
      if (checkerInputRef.current) {
        checkerInputRef.current.focus();
      }
      return;
    }

    setCheckerName(normalizedCheckerName);
    setIsConferenceStarted(true);
    setErrorMessage(null);
    setSuccessMessage(`Conferência liberada para ${normalizedCheckerName}.`);
  };

  const handleAddToQueue = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const code = searchQuery.trim() || selectedProduct?.code?.trim() || '';
    if (!code) {
      setErrorMessage('Por favor, digite ou bipe um código de barras.');
      playErrorBuzzer();
      return;
    }

    if (!productName.trim()) {
      setErrorMessage('O nome do produto é obrigatório.');
      playErrorBuzzer();
      return;
    }

    if (quantity <= 0) {
      setErrorMessage('A quantidade deve ser maior que zero.');
      playErrorBuzzer();
      return;
    }

    if (!unit) {
      setErrorMessage('A unidade é obrigatória.');
      playErrorBuzzer();
      return;
    }

    if (!noExpirationDate && !expirationDate) {
      setErrorMessage('A data de vencimento é obrigatória.');
      playErrorBuzzer();
      return;
    }

    if (!receivedDate) {
      setErrorMessage('A data de recebimento é obrigatória.');
      playErrorBuzzer();
      return;
    }

    // Process new product registration if needed
    if (isNewProduct) {
      const newProduct: Product = {
        code,
        name: productName.trim(),
        category: 'Geral',
      };
      onAddProduct(newProduct);
      setIsNewProduct(false);
    }

    setPendingEntries((prev) => [{
      queueId: `queue-${Date.now()}-${prev.length + 1}`,
      productCode: code,
      productName: productName.trim(),
      type,
      quantity,
      unit,
      lot: lot.trim().toUpperCase(),
      manufacturingDate: manufacturingDate || undefined,
      expirationDate: noExpirationDate ? undefined : expirationDate,
      noExpirationDate,
      address: address.trim().toUpperCase(),
      checkerName: checkerName.trim(),
      receivedDate,
      notes: notes.trim() || undefined,
    }, ...prev]);

    playSuccessBeep();
    setSuccessMessage(`Item "${productName.trim()}" adicionado na lista de conferência.`);
    resetCurrentEntryFields();
  };

  const handleOpenEntryConfirmation = () => {
    setErrorMessage(null);
    setSuccessMessage(null);
    if (pendingEntries.length === 0) {
      setErrorMessage('Adicione ao menos um item na lista antes de confirmar a entrada.');
      playErrorBuzzer();
      return;
    }
    setShowEntryConfirmationModal(true);
  };

  const handleConfirmBatchEntry = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!isConferenceStarted || !checkerName.trim()) {
      setErrorMessage('Informe o conferente para iniciar a conferência.');
      playErrorBuzzer();
      return;
    }

    if (!supplier.trim()) {
      setErrorMessage('O fornecedor é obrigatório.');
      playErrorBuzzer();
      return;
    }

    if (!invoiceNumber.trim()) {
      setErrorMessage('O número da nota é obrigatório.');
      playErrorBuzzer();
      return;
    }

    for (const entry of pendingEntries) {
      onAddMovement({
        productCode: entry.productCode,
        productName: entry.productName,
        type: entry.type,
        quantity: entry.quantity,
        unit: entry.unit,
        lot: entry.lot,
        manufacturingDate: entry.manufacturingDate,
        expirationDate: entry.expirationDate,
        noExpirationDate: entry.noExpirationDate,
        address: entry.address,
        supplier: supplier.trim(),
        invoiceNumber: invoiceNumber.trim().toUpperCase(),
        checkerName: entry.checkerName,
        receivedDate: entry.receivedDate,
        entryMethod: 'Conferencia',
        notes: entry.notes,
      });
    }

    const totalItems = pendingEntries.length;
    setPendingEntries([]);
    setSupplier('');
    setInvoiceNumber('');
    setCheckerName('');
    setIsConferenceStarted(false);
    setShowEntryConfirmationModal(false);
    setSuccessMessage(`Sucesso! ${totalItems} item(ns) foram registrados no estoque.`);
    playSuccessBeep();

    // Flash success message auto-hide
    setTimeout(() => {
      setSuccessMessage(null);
    }, 4000);
  };

  const handleRemoveQueuedItem = (queueId: string) => {
    setPendingEntries((prev) => prev.filter((entry) => entry.queueId !== queueId));
  };

  // Filter products for dropdown suggestion
  const suggestions = searchQuery.trim() 
    ? products.filter(p => 
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
        p.code.includes(searchQuery)
      ).slice(0, 5)
    : [];

  const getQueueColumnValue = (entry: PendingMovementEntry, header: (typeof STOCK_TEMPLATE_HEADERS)[number]) => {
    switch (header) {
      case 'Codigo de barra':
        return entry.productCode;
      case 'Descricao':
        return entry.productName;
      case 'Lote':
        return entry.lot || '-';
      case 'Fabricacao':
        return formatDisplayDate(entry.manufacturingDate);
      case 'Vencimento':
        return entry.noExpirationDate ? 'Sem validade' : formatDisplayDate(entry.expirationDate);
      case 'Endereco':
        return entry.address || '-';
      case 'Quantidade':
        return entry.quantity;
      case 'Un. Medida':
        return entry.unit;
      default:
        return '-';
    }
  };

  const getQueueCellClass = (header: (typeof STOCK_TEMPLATE_HEADERS)[number]) => {
    if (header === 'Codigo de barra' || header === 'Lote' || header === 'Endereco') {
      return 'font-mono text-slate-600';
    }
    if (header === 'Quantidade') {
      return 'text-right font-semibold text-slate-800';
    }
    if (header === 'Descricao') {
      return 'text-slate-700';
    }
    if (header === 'Un. Medida') {
      return 'font-semibold text-slate-700';
    }
    return 'text-slate-600';
  };

  return (
    <div className="max-w-4xl mx-auto p-4 font-sans">
      {/* Header Title */}
      <div className="mb-6">
        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          <PlusCircle className="h-6 w-6 text-emerald-600" />
          Registrar Entrada de Mercadoria
        </h2>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-md overflow-hidden">
        {/* Status Messages */}
        {successMessage && (
          <div className="bg-emerald-500 text-white p-4 font-medium flex items-center justify-between text-sm animate-fade-in" id="success-banner">
            <div className="flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5 shrink-0" />
              <span>{successMessage}</span>
            </div>
            <button onClick={() => setSuccessMessage(null)} className="text-white hover:text-emerald-100 font-bold ml-2">✕</button>
          </div>
        )}

        {errorMessage && (
          <div className="bg-rose-500 text-white p-4 font-medium flex items-center justify-between text-sm animate-fade-in" id="error-banner">
            <div className="flex items-center gap-2">
              <span className="bg-rose-600 p-1 rounded-full">⚠️</span>
              <span>{errorMessage}</span>
            </div>
            <button onClick={() => setErrorMessage(null)} className="text-white hover:text-rose-100 font-bold ml-2">✕</button>
          </div>
        )}

        <form onSubmit={handleAddToQueue} className="p-6 space-y-6">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
              <div className="space-y-2">
                <label className="block text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                  <User className="h-4 w-4 text-indigo-500" />
                  Conferente
                </label>
                <input
                  ref={checkerInputRef}
                  type="text"
                  value={checkerName}
                  onChange={(e) => setCheckerName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !isConferenceStarted) {
                      e.preventDefault();
                      handleStartConference();
                    }
                  }}
                  placeholder="Digite o nome do conferente"
                  disabled={isConferenceStarted}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white font-medium text-slate-800 focus:outline-none focus:border-indigo-500 disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed"
                  id="checker-name-input"
                />
              </div>

              <button
                type="button"
                onClick={handleStartConference}
                disabled={isConferenceStarted}
                className="h-12 rounded-xl bg-indigo-600 px-4 text-sm font-bold text-white transition-colors hover:bg-indigo-500 disabled:bg-emerald-600 disabled:hover:bg-emerald-600 disabled:cursor-not-allowed"
                id="btn-start-conference"
              >
                {isConferenceStarted ? 'Conferência liberada' : 'Liberar conferência'}
              </button>
            </div>
            {!isConferenceStarted && settings?.checkers && settings.checkers.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-200/60">
                <span className="text-[11px] font-bold text-slate-500 mr-1">Conferentes cadastrados:</span>
                {settings.checkers.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCheckerName(c)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all ${
                      checkerName === c
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                        : 'bg-white border-slate-200 text-slate-700 hover:border-indigo-300 hover:text-indigo-600'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            )}
            <p className="mt-2 text-xs text-slate-500">
              O bip dos produtos só é liberado após informar o conferente. O campo fica bloqueado até concluir a conferência com fornecedor e nota.
            </p>
          </div>

          {/* STEP 1: Search / Bip Barcode */}
          <div className="space-y-2 relative">
            <label className="block text-sm font-semibold text-slate-700 flex justify-between items-center">
              <span className="flex items-center gap-1.5">
                <Barcode className="h-4 w-4 text-indigo-500" />
                1. Bipar Código de Barras ou Digitar Código/Nome
              </span>
              <div className="flex items-center gap-1.5 text-xs text-slate-400 font-normal">
                <input
                  type="checkbox"
                  id="keep-focus"
                  checked={keepFocus}
                  onChange={(e) => setKeepFocus(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5"
                />
                <label htmlFor="keep-focus" className="cursor-pointer">Manter foco automático</label>
              </div>
            </label>

            <div className="relative">
              <input
                ref={barcodeInputRef}
                type="text"
                value={searchQuery}
                onChange={handleSearchChange}
                onKeyDown={handleKeyDown}
                onFocus={() => {
                  if (searchQuery.trim()) {
                    setShowProductSuggestions(true);
                  }
                }}
                placeholder="Bipe o código com o leitor Bluetooth ou digite aqui..."
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                disabled={!isConferenceStarted}
                className={`w-full px-4 py-3.5 rounded-xl border-2 font-mono text-base placeholder:text-slate-400 focus:outline-none focus:ring-4 transition-all duration-200 ${
                  isNewProduct 
                    ? 'border-amber-400 focus:border-amber-500 focus:ring-amber-50' 
                    : selectedProduct 
                      ? 'border-emerald-500 focus:border-emerald-600 focus:ring-emerald-50' 
                      : 'border-slate-200 focus:border-indigo-500 focus:ring-indigo-50'
                } disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed`}
                id="barcode-search-input"
              />
              
              {searchQuery && (
                <button
                  type="button"
                  onClick={handleClearForm}
                  className="absolute right-3 top-3.5 text-slate-400 hover:text-slate-600 bg-slate-100 hover:bg-slate-200 p-1 rounded-full transition-colors"
                >
                  <RotateCcw className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Suggestions Dropdown */}
            {showProductSuggestions && suggestions.length > 0 && (
              <div className="absolute z-10 w-full bg-white border border-slate-200 rounded-xl shadow-xl mt-1 overflow-hidden divide-y divide-slate-100">
                {suggestions.map((p) => (
                  <button
                    key={p.code}
                    type="button"
                    onClick={() => selectSuggestedProduct(p)}
                    className="w-full px-4 py-3 text-left hover:bg-indigo-50 flex items-center justify-between transition-colors"
                  >
                    <div>
                      <span className="font-semibold text-slate-800 text-sm block">{p.name}</span>
                      <span className="text-xs text-slate-400 font-mono">Cód: {p.code}</span>
                    </div>
                    {p.category && (
                      <span className="text-xs bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full font-medium">
                        {p.category}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* STEP 2: Product Name Confirmation */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 md:items-end">
            <div className="space-y-2 md:col-span-8">
              <label className="block text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                <Package className="h-4 w-4 text-indigo-500" />
                Nome do Produto
              </label>
              <input
                type="text"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                placeholder={isNewProduct ? 'Insira o nome do novo produto...' : 'Selecione ou bipe um produto'}
                disabled={!isConferenceStarted || (selectedProduct !== null && !isNewProduct)}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 font-medium text-slate-800 focus:outline-none focus:border-indigo-500 disabled:opacity-75 disabled:cursor-not-allowed"
                id="product-name-input"
              />
              {isNewProduct && (
                <span className="text-xs text-amber-600 font-semibold flex items-center gap-1 animate-pulse">
                  <Plus className="h-3 w-3" /> Novo produto será cadastrado automaticamente ao adicionar na lista.
                </span>
              )}
            </div>

            {/* Quantity */}
            <div className="space-y-2 md:col-span-2">
              <label className="flex items-center justify-center gap-1.5 text-sm font-semibold text-slate-700">
                <Layers className="h-4 w-4 text-indigo-500" />
                Quantidade
              </label>
              <div className="relative mx-auto w-full">
                <button
                  type="button"
                  disabled={!isConferenceStarted}
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  className="absolute left-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg bg-slate-100 text-slate-700 font-bold transition-colors hover:bg-slate-200 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  -
                </button>
                <input
                  type="number"
                  id="qty-input"
                  min="1"
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                  disabled={!isConferenceStarted}
                  className="h-12 w-full rounded-xl border border-slate-200 bg-white px-12 text-center text-lg font-semibold text-slate-800 focus:outline-none focus:border-indigo-500 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                />
                <button
                  type="button"
                  disabled={!isConferenceStarted}
                  onClick={() => setQuantity(quantity + 1)}
                  className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg bg-slate-100 text-slate-700 font-bold transition-colors hover:bg-slate-200 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  +
                </button>
              </div>
            </div>

            <div className="space-y-2 md:col-span-2">
              <label className="block text-center text-sm font-semibold text-slate-700">Unidade</label>
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value as 'FD' | 'UN' | 'CX' | 'PCT')}
                disabled={!isConferenceStarted}
                className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-center font-medium text-slate-800 focus:outline-none focus:border-indigo-500 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                id="unit-select"
              >
                <option value="FD">FD</option>
                <option value="UN">UN</option>
                <option value="CX">CX</option>
                <option value="PCT">PCT</option>
              </select>
            </div>
          </div>

          {/* STEP 3: Lot, Expiration, Manufacturing, Address and Receipt Details */}
          <div className="bg-slate-50 rounded-xl p-5 border border-slate-100 space-y-4">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 mb-2">
              <Calendar className="h-4 w-4 text-slate-400" />
              Detalhamento da Mercadoria
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Lot */}
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-600">Número do Lote</label>
                <input
                  type="text"
                  value={lot}
                  onChange={(e) => setLot(e.target.value.toUpperCase())}
                  placeholder="Campo bloqueado"
                  disabled
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 font-mono text-slate-600 uppercase bg-slate-100 cursor-not-allowed"
                  id="lot-input"
                />
              </div>

              {/* Manufacturing Date */}
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-600">Fabricação</label>
                <input
                  type="date"
                  value={manufacturingDate}
                  onChange={(e) => setManufacturingDate(e.target.value)}
                  disabled
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 font-sans text-slate-600 bg-slate-100 cursor-not-allowed"
                  id="mfg-date-input"
                />
              </div>

              {/* Expiration Date */}
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-600 flex justify-between">
                  <span>Vencimento</span>
                  {expirationDate && (
                    <span className="text-[10px] text-amber-600 font-semibold font-mono animate-pulse">
                      {(() => {
                        const daysRemaining = getDaysUntilExpiration(expirationDate);
                        const threshold = settings?.criticalExpiryDays ?? 25;
                        return daysRemaining >= 0 && daysRemaining <= threshold ? 'FIFO Crítico!' : '';
                      })()}
                    </span>
                  )}
                </label>
                <input
                  type="date"
                  value={expirationDate}
                  onChange={(e) => {
                    setExpirationDate(e.target.value);
                    if (e.target.value) {
                      setNoExpirationDate(false);
                    }
                  }}
                  disabled={!isConferenceStarted || noExpirationDate}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-indigo-500 font-sans text-slate-800 bg-white disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                  id="exp-date-input"
                />
                <label className="mt-2 inline-flex items-center gap-2 text-xs font-semibold text-slate-600">
                  <input
                    type="checkbox"
                    checked={noExpirationDate}
                    disabled={!isConferenceStarted}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setNoExpirationDate(checked);
                      if (checked) {
                        setExpirationDate('');
                      }
                    }}
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 disabled:cursor-not-allowed"
                    id="no-expiration-checkbox"
                  />
                  Item sem validade
                </label>
              </div>
            </div>

            {/* Storage Address */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-600 flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5 text-indigo-500" />
                  Local de Armazenamento (Endereço no Estoque)
                </label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value.toUpperCase())}
                  placeholder="Campo bloqueado"
                  disabled
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 font-mono text-slate-600 uppercase bg-slate-100 cursor-not-allowed"
                  id="address-input"
                  list="stock-location-options"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-600">Data de Lançamento</label>
                <input
                  type="date"
                  value={receivedDate}
                  disabled
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 font-sans text-slate-800 bg-slate-100 cursor-not-allowed"
                  id="received-date-input"
                />
              </div>
            </div>

            <datalist id="stock-location-options">
              {(settings?.locations && settings.locations.length > 0 ? settings.locations : STOCK_LOCATIONS).map((location) => (
                <option key={location} value={location} />
              ))}
            </datalist>

          </div>

          {/* Notes */}
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-slate-700">Observações adicionais</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex: Nota fiscal, Fornecedor X, Operador fulano..."
              disabled={!isConferenceStarted}
              className="w-full px-4 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-500 text-slate-800 bg-white disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
              id="notes-input"
            />
          </div>

          <button
            type="submit"
            disabled={!isConferenceStarted}
            className="w-full py-3 rounded-xl text-white font-bold text-base transition-all duration-200 shadow-md flex items-center justify-center gap-2 active:scale-95 cursor-pointer bg-indigo-600 hover:bg-indigo-500 shadow-indigo-100 disabled:bg-slate-300 disabled:hover:bg-slate-300 disabled:cursor-not-allowed"
            id="btn-adicionar-lista-conferencia"
          >
            <Check className="h-5 w-5" />
            OK - ADICIONAR NA LISTA
          </button>
        </form>

        <div className="px-6 pb-6 space-y-4">
          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <div className="bg-slate-50 px-4 py-2 text-xs font-bold text-slate-500 uppercase tracking-wider">
              Lista de conferência ({pendingEntries.length})
            </div>
            {pendingEntries.length === 0 ? (
              <div className="px-4 py-6 text-sm text-slate-500 text-center">
                Nenhum item lançado. Bipe o produto e clique em OK para adicionar na lista.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-white border-b border-slate-200 text-slate-500">
                    <tr>
                      {STOCK_TEMPLATE_HEADERS.map((header) => (
                        <th
                          key={header}
                          className={`px-3 py-2 font-semibold ${header === 'Quantidade' ? 'text-right' : 'text-left'}`}
                        >
                          {header}
                        </th>
                      ))}
                      <th className="px-3 py-2 text-center font-semibold">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pendingEntries.map((entry) => (
                      <tr key={entry.queueId} className="hover:bg-slate-50">
                        {STOCK_TEMPLATE_HEADERS.map((header) => (
                          <td key={`${entry.queueId}-${header}`} className={`px-3 py-2 ${getQueueCellClass(header)}`}>
                            {getQueueColumnValue(entry, header)}
                          </td>
                        ))}
                        <td className="px-3 py-2 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveQueuedItem(entry.queueId)}
                            className="inline-flex items-center justify-center rounded-md p-1.5 text-rose-600 hover:bg-rose-50"
                            title="Remover item da lista"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={handleOpenEntryConfirmation}
            className="w-full py-4 rounded-xl text-white font-bold text-lg transition-all duration-200 shadow-md flex items-center justify-center gap-2 active:scale-95 cursor-pointer bg-emerald-600 hover:bg-emerald-500 shadow-emerald-100 disabled:bg-slate-300 disabled:cursor-not-allowed"
            id="btn-salvar-movimentacao"
            disabled={pendingEntries.length === 0}
          >
            <CornerDownRight className="h-5 w-5" />
            CONFIRMAR ENTRADA EM ESTOQUE
          </button>
        </div>
      </div>

      {showEntryConfirmationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl border border-slate-200">
            <h3 className="text-base font-bold text-slate-800 mb-4">Confirmar entrada em estoque</h3>
            <p className="text-xs text-slate-500 mb-4">Serão registrados {pendingEntries.length} item(ns) da lista de conferência.</p>
            <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              <span className="font-semibold text-slate-700">Conferente:</span> {checkerName}
            </div>
            <form onSubmit={handleConfirmBatchEntry} className="space-y-4">
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-600 flex items-center gap-1">
                  <Truck className="h-3.5 w-3.5 text-indigo-500" />
                  Fornecedor
                </label>
                <input
                  type="text"
                  value={supplier}
                  onChange={(e) => setSupplier(e.target.value)}
                  placeholder="Nome do fornecedor"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-indigo-500 text-slate-800 bg-white"
                  id="supplier-input"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-600 flex items-center gap-1">
                  <FileText className="h-3.5 w-3.5 text-indigo-500" />
                  Numero da Nota
                </label>
                <input
                  type="text"
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value.toUpperCase())}
                  placeholder="NF-12345"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-indigo-500 font-mono text-slate-800 uppercase bg-white"
                  id="invoice-number-input"
                />
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowEntryConfirmationModal(false)}
                  className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-500 transition-colors"
                >
                  OK
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
