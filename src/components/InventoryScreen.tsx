/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { Product, StockItem, Movement, AppSettings } from '../types';
import { formatDateDisplay, DATABASE_EXPORT_HEADERS } from '../utils/stockTemplate';
import { 
  Search, 
  Archive, 
  Clock, 
  MapPin, 
  Download,
  Edit3,
  ArrowRightLeft,
  UserCheck,
  CheckCircle2,
  X,
  AlertCircle,
  Filter,
  ChevronDown,
  Trash2
} from 'lucide-react';

interface InventoryScreenProps {
  products: Product[];
  stock: StockItem[];
  movements?: Movement[];
  settings?: AppSettings;
  onDeleteMovement?: (movementId: string) => void;
  onStockTransfer?: (payload: {
    itemId: string;
    destination: string;
    quantity: number;
    expirationDate: string;
  }) => void;
  onUpdateStockItem?: (
    updatedItem: StockItem,
    audit: { checkerName: string; reason: string }
  ) => void;
  onDeleteStockItem?: (id: string) => void;
}

export default function InventoryScreen({
  products,
  stock,
  movements = [],
  settings,
  onDeleteMovement,
  onStockTransfer,
  onUpdateStockItem,
  onDeleteStockItem
}: InventoryScreenProps) {
  const [itemToDelete, setItemToDelete] = useState<StockItem | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [expirationStatusFilter, setExpirationStatusFilter] = useState<
    'TODOS' | 'URGENTE' | 'SEGURO' | 'VENCIDO' | 'ALERTA' | 'SEM_VENC'
  >('TODOS');
  const [addressFilter, setAddressFilter] = useState<string>('TODOS');
  const [methodFilter, setMethodFilter] = useState<'TODOS' | 'Conferencia' | 'Edição' | 'Importação'>('TODOS');
  
  // Transfer modal
  const [selectedTransferItem, setSelectedTransferItem] = useState<StockItem | null>(null);
  const [transferDestination, setTransferDestination] = useState('ESTOQUE');
  const [transferQuantity, setTransferQuantity] = useState(1);
  const [transferExpirationDate, setTransferExpirationDate] = useState('');

  // Edit stock item modal
  const [editingItem, setEditingItem] = useState<StockItem | null>(null);
  const [editQuantity, setEditQuantity] = useState(1);
  const [editUnit, setEditUnit] = useState<'UN' | 'FD' | 'CX' | 'PCT'>('UN');
  const [editLot, setEditLot] = useState('');
  const [editManufacturingDate, setEditManufacturingDate] = useState('');
  const [editExpirationDate, setEditExpirationDate] = useState('');
  const [editNoExpirationDate, setEditNoExpirationDate] = useState(false);
  const [editAddress, setEditAddress] = useState('ESTOQUE');
  const [editSupplier, setEditSupplier] = useState('');
  const [editInvoiceNumber, setEditInvoiceNumber] = useState('');
  const [editModifierName, setEditModifierName] = useState('');
  const [editReason, setEditReason] = useState('Conferência');
  const [editError, setEditError] = useState<string | null>(null);

  const openTransferModal = (item: StockItem) => {
    setSelectedTransferItem(item);
    setTransferDestination('ESTOQUE');
    setTransferQuantity(Math.min(1, item.quantity || 1));
    setTransferExpirationDate(item.expirationDate || '');
  };

  const confirmTransfer = () => {
    if (!selectedTransferItem || !onStockTransfer) return;
    const quantity = Math.max(1, Math.min(Number(transferQuantity) || 1, selectedTransferItem.quantity));

    if (!transferExpirationDate) {
      window.alert('Informe a data de vencimento da movimentação para registrar a saída.');
      return;
    }

    onStockTransfer({
      itemId: selectedTransferItem.id,
      destination: transferDestination,
      quantity,
      expirationDate: transferExpirationDate,
    });
    setSelectedTransferItem(null);
    setTransferDestination('ESTOQUE');
    setTransferQuantity(1);
    setTransferExpirationDate('');
  };

  const openEditModal = (item: StockItem) => {
    setEditingItem(item);
    setEditQuantity(item.quantity);
    setEditUnit(item.unit);
    setEditLot(item.lot);
    setEditManufacturingDate(item.manufacturingDate || '');
    setEditExpirationDate(item.expirationDate || '');
    setEditNoExpirationDate(!!item.noExpirationDate);
    setEditAddress(item.address);
    setEditSupplier(item.supplier || '');
    setEditInvoiceNumber(item.invoiceNumber || '');
    setEditModifierName(settings?.checkers?.[0] || 'Paulo');
    setEditReason(item.updateReason || 'Conferência');
    setEditError(null);
  };

  const confirmEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem || !onUpdateStockItem) return;

    const modifier = editModifierName.trim();
    const reason = editReason.trim();

    if (!modifier) {
      setEditError('Informe o nome do conferente responsável pela alteração.');
      return;
    }
    if (!reason) {
      setEditError('Informe o motivo da alteração.');
      return;
    }
    if (editQuantity <= 0) {
      setEditError('A quantidade deve ser maior que zero.');
      return;
    }

    onUpdateStockItem(
      {
        ...editingItem,
        quantity: editQuantity,
        unit: editUnit,
        lot: editLot.trim() || 'S/LOTE',
        manufacturingDate: editManufacturingDate || undefined,
        expirationDate: editExpirationDate || undefined,
        noExpirationDate: editNoExpirationDate,
        address: editAddress.trim() || 'ESTOQUE',
        supplier: editSupplier.trim() || undefined,
        invoiceNumber: editInvoiceNumber.trim() || undefined,
      },
      {
        checkerName: modifier,
        reason
      }
    );

    setEditingItem(null);
  };

  const getExpirationStatusKey = (item: Pick<StockItem, 'expirationDate' | 'noExpirationDate'>) => {
    if (item.noExpirationDate || !item.expirationDate) {
      return 'SEM_VENC' as const;
    }

    const daysRemaining = Math.ceil(
      (new Date(item.expirationDate).getTime() - Date.now()) / (1000 * 3600 * 24)
    );

    if (daysRemaining < 0) return 'VENCIDO' as const;
    const criticalThreshold = settings?.criticalExpiryDays ?? 30;
    const warningThreshold = settings?.warningExpiryDays ?? 90;
    const safeThreshold = settings?.safeExpiryDays ?? warningThreshold;
    if (daysRemaining <= criticalThreshold) return 'URGENTE' as const;
    if (daysRemaining <= warningThreshold) return 'ALERTA' as const;
    if (daysRemaining > safeThreshold) return 'SEGURO' as const;
    return 'SEGURO' as const;
  };

  // Base ativa de estoque: oculta itens baixados ou com quantidade zerada
  const activeStock = stock.filter((item) => {
    const isBaixado = (item.address && item.address.trim().toLowerCase() === 'baixado') || item.quantity <= 0;
    return !isBaixado;
  });

  const availableAddresses = Array.from(
    new Set(activeStock.map((item) => item.address).filter(Boolean))
  ).sort();

  const filteredStock = activeStock.filter((item) => {
    const normalizedSearch = searchQuery.toLowerCase().trim();
    const matchesSearch = 
      !normalizedSearch ||
      item.productName.toLowerCase().includes(normalizedSearch) ||
      item.productCode.includes(searchQuery) ||
      item.lot.toLowerCase().includes(normalizedSearch) ||
      item.address.toLowerCase().includes(normalizedSearch) ||
      (item.supplier && item.supplier.toLowerCase().includes(normalizedSearch)) ||
      (item.invoiceNumber && item.invoiceNumber.toLowerCase().includes(normalizedSearch)) ||
      (item.checkerName && item.checkerName.toLowerCase().includes(normalizedSearch)) ||
      (item.updatedBy && item.updatedBy.toLowerCase().includes(normalizedSearch)) ||
      (item.updateReason && item.updateReason.toLowerCase().includes(normalizedSearch));
    
    const matchesExpirationStatus =
      expirationStatusFilter === 'TODOS' || getExpirationStatusKey(item) === expirationStatusFilter;

    const matchesAddress =
      addressFilter === 'TODOS' || item.address === addressFilter;

    const itemMethod = item.entryMethod || 'Conferencia';
    const matchesMethod =
      methodFilter === 'TODOS' || itemMethod === methodFilter;

    return matchesSearch && matchesExpirationStatus && matchesAddress && matchesMethod;
  });

  const formatDateTime = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
    } catch {
      return isoString;
    }
  };

  const getExpirationStatus = (item: Pick<StockItem, 'expirationDate' | 'noExpirationDate'>) => {
    if (item.noExpirationDate) {
      return {
        warningBg: 'bg-slate-100 text-slate-700',
        warningText: 'Sem venc.',
        alertColor: 'text-slate-500 font-medium',
      };
    }

    if (!item.expirationDate) {
      return {
        warningBg: 'bg-slate-100 text-slate-500',
        warningText: 'N/A',
        alertColor: 'text-slate-400',
      };
    }

    const daysRemaining = Math.ceil(
      (new Date(item.expirationDate).getTime() - Date.now()) / (1000 * 3600 * 24)
    );

    if (daysRemaining < 0) {
      return {
        warningBg: 'bg-rose-100 text-rose-800',
        warningText: `Vencido (${Math.abs(daysRemaining)}d atrás)`,
        alertColor: 'text-rose-600 font-bold',
      };
    }

    const criticalThreshold = settings?.criticalExpiryDays ?? 30;
    const warningThreshold = settings?.warningExpiryDays ?? 90;
    const safeThreshold = settings?.safeExpiryDays ?? warningThreshold;
    if (daysRemaining <= criticalThreshold) {
      return {
        warningBg: 'bg-amber-100 text-amber-900 border border-amber-300',
        warningText: `Urgente (${daysRemaining}d)`,
        alertColor: 'text-amber-700 font-bold',
      };
    }

    if (daysRemaining <= warningThreshold) {
      return {
        warningBg: 'bg-yellow-50 text-yellow-800 border border-yellow-200',
        warningText: `Alerta (${daysRemaining}d)`,
        alertColor: 'text-yellow-700 font-medium',
      };
    }

    return {
      warningBg: 'bg-emerald-50 text-emerald-700',
      warningText: `Seguro (${daysRemaining}d)`,
      alertColor: 'text-emerald-600',
    };
  };

  // Export to Excel with full 16 columns matching base de dados
  const exportToExcelOrCSV = () => {
    const wb = XLSX.utils.book_new();
    const headers = [...DATABASE_EXPORT_HEADERS];
    const rows = filteredStock.map(item => [
      item.productCode,
      item.productName,
      item.quantity,
      item.unit,
      item.lot,
      formatDateDisplay(item.manufacturingDate),
      item.noExpirationDate ? 'Sem validade' : formatDateDisplay(item.expirationDate),
      item.address,
      item.supplier || '',
      item.invoiceNumber || '',
      item.checkerName || '',
      formatDateDisplay(item.receivedDate),
      item.entryMethod || 'Conferencia',
      formatDateDisplay(item.updatedAt) || '',
      item.updatedBy || '',
      item.updateReason || ''
    ]);

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    XLSX.utils.book_append_sheet(wb, ws, 'Estoque Atual');
    XLSX.writeFile(wb, `estoque_atual_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div className="max-w-7xl mx-auto p-4 space-y-4">
      {/* Search and Combobox Filters Card */}
      <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-xl bg-indigo-50 text-indigo-600">
              <Archive className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-slate-800">
                Consulta de Estoque Atual
              </h2>
              <p className="text-xs text-slate-400">
                Visualize, filtre e gerencie os itens e lotes ativos no estoque
              </p>
            </div>
          </div>

          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar produto, lote, endereço, conferente..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:border-indigo-500 focus:bg-white transition-all"
              id="input-inventory-search"
            />
          </div>
        </div>

        {/* Combobox Filters Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3 text-xs">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="text-slate-400 font-bold flex items-center gap-1 text-xs">
              <Filter className="h-3.5 w-3.5 text-slate-500" />
              Filtros:
            </span>

            {/* Combobox 1: Validade */}
            <div className="relative">
              <select
                value={expirationStatusFilter}
                onChange={(e) => setExpirationStatusFilter(e.target.value as any)}
                className="appearance-none bg-slate-100 hover:bg-slate-200/80 text-slate-800 font-bold px-3 py-2 pr-8 rounded-xl text-xs border border-slate-200 focus:outline-none focus:border-indigo-500 focus:bg-white transition cursor-pointer"
                id="combobox-validade"
              >
                <option value="TODOS">Validade: Todas as Opções</option>
                <option value="URGENTE">Urgentes (≤ {settings?.criticalExpiryDays ?? 30} dias)</option>
                <option value="ALERTA">Alerta (≤ {settings?.warningExpiryDays ?? 90} dias)</option>
                <option value="SEGURO">Seguros (&gt; {settings?.safeExpiryDays ?? settings?.warningExpiryDays ?? 90} dias)</option>
                <option value="VENCIDO">Vencidos</option>
                <option value="SEM_VENC">Sem Vencimento</option>
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500 pointer-events-none" />
            </div>

            {/* Combobox 2: Endereço */}
            <div className="relative">
              <select
                value={addressFilter}
                onChange={(e) => setAddressFilter(e.target.value)}
                className="appearance-none bg-slate-100 hover:bg-slate-200/80 text-slate-800 font-bold px-3 py-2 pr-8 rounded-xl text-xs border border-slate-200 focus:outline-none focus:border-indigo-500 focus:bg-white transition cursor-pointer"
                id="combobox-endereco"
              >
                <option value="TODOS">Endereço: Todos</option>
                {availableAddresses.map((addr) => (
                  <option key={addr} value={addr}>
                    Local: {addr}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500 pointer-events-none" />
            </div>

            {/* Combobox 3: Método / Origem */}
            <div className="relative">
              <select
                value={methodFilter}
                onChange={(e) => setMethodFilter(e.target.value as any)}
                className="appearance-none bg-slate-100 hover:bg-slate-200/80 text-slate-800 font-bold px-3 py-2 pr-8 rounded-xl text-xs border border-slate-200 focus:outline-none focus:border-indigo-500 focus:bg-white transition cursor-pointer"
                id="combobox-metodo"
              >
                <option value="TODOS">Método: Todos</option>
                <option value="Conferencia">Conferência</option>
                <option value="Edição">Edição</option>
                <option value="Importação">Importação</option>
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500 pointer-events-none" />
            </div>

            {/* Reset Filters */}
            {(expirationStatusFilter !== 'TODOS' || addressFilter !== 'TODOS' || methodFilter !== 'TODOS' || searchQuery) && (
              <button
                type="button"
                onClick={() => {
                  setExpirationStatusFilter('TODOS');
                  setAddressFilter('TODOS');
                  setMethodFilter('TODOS');
                  setSearchQuery('');
                }}
                className="text-slate-400 hover:text-slate-700 font-semibold px-2 py-1 text-[11px] rounded-lg hover:bg-slate-100 transition flex items-center gap-1 cursor-pointer"
              >
                <X className="h-3 w-3" />
                Limpar filtros
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={exportToExcelOrCSV}
            className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
            id="btn-export-csv"
            title="Exportar dados para Excel (.xlsx) com padrão oficial da base de dados"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Exportar Excel</span>
          </button>
        </div>
      </div>

      {/* Tabela de Estoque Atual */}
      <div className="space-y-3">
          {filteredStock.length === 0 ? (
            <div className="bg-white border border-slate-100 rounded-2xl p-12 text-center shadow-sm">
              <p className="text-slate-400 font-medium text-base mb-2">Nenhuma mercadoria encontrada em estoque.</p>
              <p className="text-slate-400 text-xs">Experimente limpar a busca ou registrar novas entradas na tela anterior.</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold text-[11px] uppercase tracking-wider font-mono">
                      <th className="py-3 px-4 font-semibold">Produto / Código</th>
                      <th className="py-3 px-3 font-semibold">Lote</th>
                      <th className="py-3 px-3 font-semibold">Vencimento</th>
                      <th className="py-3 px-3 font-semibold">Endereço</th>
                      <th className="py-3 px-3 font-semibold">Método / Origem</th>
                      <th className="py-3 px-3 font-semibold">Situação</th>
                      <th className="py-3 px-4 font-semibold text-right">Qtd</th>
                      <th className="py-3 px-3 font-semibold text-center">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700 text-sm">
                    {filteredStock.map((item) => {
                      const { warningBg, warningText, alertColor } = getExpirationStatus(item);
                      const isEdited = item.entryMethod === 'Edição';

                      return (
                        <tr 
                          key={item.id} 
                          className={`hover:bg-slate-50/50 transition-colors ${isEdited ? 'bg-amber-50/20' : ''}`}
                          id={`stock-row-${item.id}`}
                        >
                          <td className="py-3 px-4">
                            <div className="font-bold text-slate-800 text-sm">{item.productName}</div>
                            <div className="text-[11px] text-slate-400 font-mono">Cód: {item.productCode}</div>
                            {item.supplier && (
                              <div className="text-[10px] text-slate-500 mt-0.5">
                                Forn: {item.supplier} {item.invoiceNumber ? `| NF: ${item.invoiceNumber}` : ''}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-3 font-mono text-xs text-slate-600 font-bold whitespace-nowrap">
                            {item.lot}
                          </td>
                          <td className={`py-3 px-3 font-mono text-xs whitespace-nowrap ${alertColor}`}>
                            {formatDateDisplay(item.expirationDate, item.noExpirationDate)}
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap">
                            <span className="font-mono text-slate-700 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded text-[11px] font-bold uppercase flex items-center gap-1 w-fit">
                              <MapPin className="h-3 w-3 text-indigo-500 shrink-0" />
                              {item.address}
                            </span>
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap">
                            {isEdited ? (
                              <div>
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 border border-amber-200">
                                  <Edit3 className="h-2.5 w-2.5" />
                                  Edição
                                </span>
                                {item.updatedBy && (
                                  <div className="text-[10px] text-slate-500 mt-0.5 font-medium">
                                    Por <strong>{item.updatedBy}</strong> {item.updatedAt ? `em ${formatDateDisplay(item.updatedAt)}` : ''}
                                    {item.updateReason ? ` (${item.updateReason})` : ''}
                                  </div>
                                )}
                              </div>
                            ) : item.entryMethod === 'Importação' ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 border border-emerald-200">
                                Importação
                              </span>
                            ) : (
                              <div>
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-blue-100 text-blue-800 border border-blue-200">
                                  <CheckCircle2 className="h-2.5 w-2.5" />
                                  Conferencia
                                </span>
                                {item.checkerName && (
                                  <div className="text-[10px] text-slate-400 mt-0.5">
                                    Conferido por: {item.checkerName}
                                  </div>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap">
                            <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded ${warningBg}`}>
                              {warningText}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right font-bold font-mono text-sm whitespace-nowrap text-slate-800">
                            <div>{item.quantity} {item.unit}</div>
                            <div className="text-[10px] text-slate-400 font-medium">
                              {item.receivedQuantity && item.receivedQuantity !== item.quantity ? `${item.receivedQuantity} recebidos` : 'Total ativo'}
                            </div>
                          </td>
                          <td className="py-3 px-3 text-center whitespace-nowrap">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                type="button"
                                onClick={() => openEditModal(item)}
                                className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                                title="Alterar dados do produto no estoque (Auditoria / Edição)"
                              >
                                <Edit3 className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => openTransferModal(item)}
                                className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                                title="Movimentar ou transferir item"
                              >
                                <ArrowRightLeft className="h-4 w-4" />
                              </button>
                              {onDeleteStockItem && (
                                <button
                                  type="button"
                                  onClick={() => setItemToDelete(item)}
                                  className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                                  title="Remover item do estoque"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

      {/* Modal: Edit Item in Estoque Atual with Audit Logging */}
      {editingItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150 overflow-y-auto"
          onClick={() => setEditingItem(null)}
        >
          <div
            className="bg-white rounded-2xl max-w-2xl w-full p-5 sm:p-6 shadow-2xl border border-slate-100 space-y-4 my-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 rounded-xl bg-amber-50 text-amber-600">
                  <Edit3 className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900">
                    Alterar Produto em Estoque
                  </h3>
                  <p className="text-xs text-slate-400">
                    Ao salvar, o método de entrada será marcado como <strong>"Edição"</strong> com auditoria de quem alterou
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={confirmEdit} className="space-y-4">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/60">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Produto Selecionado</p>
                <h4 className="text-base font-black text-slate-900 mt-0.5">{editingItem.productName}</h4>
                <p className="text-xs font-mono text-slate-500">Código de barra: {editingItem.productCode}</p>
              </div>

              {/* Quantity, Unit, Lot, Address */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Quantidade *
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={editQuantity}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => setEditQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-white text-slate-800 font-bold focus:outline-none focus:border-indigo-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Unidade
                  </label>
                  <select
                    value={editUnit}
                    onChange={(e) => setEditUnit(e.target.value as any)}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-white text-slate-800 font-bold focus:outline-none focus:border-indigo-500"
                  >
                    <option value="UN">UN</option>
                    <option value="FD">FD</option>
                    <option value="CX">CX</option>
                    <option value="PCT">PCT</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Lote
                  </label>
                  <input
                    type="text"
                    value={editLot}
                    onChange={(e) => setEditLot(e.target.value)}
                    placeholder="Ex: L-MK45"
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-white text-slate-800 font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Endereço
                  </label>
                  <input
                    type="text"
                    value={editAddress}
                    onChange={(e) => setEditAddress(e.target.value)}
                    placeholder="Ex: Estoque, Geladeira"
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-white text-slate-800 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* Manufacturing & Expiry */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Data de Fabricação
                  </label>
                  <input
                    type="date"
                    value={editManufacturingDate}
                    onChange={(e) => setEditManufacturingDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-white text-slate-800 font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-slate-700">
                      Data de Vencimento
                    </label>
                    <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editNoExpirationDate}
                        onChange={(e) => setEditNoExpirationDate(e.target.checked)}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-0"
                      />
                      Sem validade
                    </label>
                  </div>
                  <input
                    type="date"
                    disabled={editNoExpirationDate}
                    value={editExpirationDate}
                    onChange={(e) => setEditExpirationDate(e.target.value)}
                    className={`w-full px-3 py-2 text-sm rounded-xl border border-slate-200 font-mono focus:outline-none focus:border-indigo-500 ${
                      editNoExpirationDate ? 'bg-slate-100 text-slate-400' : 'bg-white text-slate-800'
                    }`}
                  />
                </div>
              </div>

              {/* Supplier & Invoice */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Fornecedor
                  </label>
                  <input
                    type="text"
                    value={editSupplier}
                    onChange={(e) => setEditSupplier(e.target.value)}
                    placeholder="Ex: Ambev"
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-white text-slate-800 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Nota Fiscal
                  </label>
                  <input
                    type="text"
                    value={editInvoiceNumber}
                    onChange={(e) => setEditInvoiceNumber(e.target.value)}
                    placeholder="Ex: 12549"
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-white text-slate-800 font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* Audit Trail Box (Rastreabilidade - Quem alterou e Motivo) */}
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 space-y-3">
                <div className="flex items-center gap-2 text-amber-900 font-bold text-xs uppercase tracking-wider">
                  <UserCheck className="h-4 w-4" />
                  <span>Rastreabilidade da Alteração (Auditoria)</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-amber-900 mb-1">
                      Conferente que está alterando *
                    </label>
                    <input
                      type="text"
                      value={editModifierName}
                      onChange={(e) => setEditModifierName(e.target.value)}
                      placeholder="Ex: Paulo"
                      className="w-full px-3 py-2 text-sm rounded-xl border border-amber-300 bg-white text-slate-900 font-bold focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-amber-900 mb-1">
                      Motivo da Alteração *
                    </label>
                    <input
                      type="text"
                      value={editReason}
                      onChange={(e) => setEditReason(e.target.value)}
                      placeholder="Ex: Conferência, Ajuste de validade, Correção de lote..."
                      className="w-full px-3 py-2 text-sm rounded-xl border border-amber-300 bg-white text-slate-900 font-medium focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>

                <p className="text-[11px] text-amber-800">
                  Esta alteração identificará o item como <strong>"Edição"</strong> na base de dados com a data de hoje ({new Date().toLocaleDateString('pt-BR')}), registrando que foi alterado por <strong>{editModifierName || '...'}</strong>.
                </p>
              </div>

              {editError && (
                <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center gap-1.5">
                  <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                  <span>{editError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingItem(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="bg-amber-600 hover:bg-amber-500 text-white px-5 py-2 rounded-xl text-xs font-bold shadow-sm transition cursor-pointer"
                >
                  Salvar Alteração
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Transfer / Movimentação */}
      {selectedTransferItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="mb-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-600">Movimentação de estoque</p>
              <h3 className="mt-1 text-xl font-black text-slate-800">{selectedTransferItem.productName}</h3>
              <p className="text-xs text-slate-500">
                Recebido: {selectedTransferItem.receivedQuantity ?? selectedTransferItem.quantity} {selectedTransferItem.unit} / Restante: {selectedTransferItem.quantity} {selectedTransferItem.unit}
              </p>
            </div>

            <div className="space-y-4">
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-600">Destino</label>
                <select
                  value={transferDestination}
                  onChange={(e) => setTransferDestination(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800 focus:outline-none focus:border-indigo-500"
                >
                  {(settings?.locations && settings.locations.length > 0
                    ? settings.locations
                    : ['ESTOQUE', 'GELADEIRA', 'CAMARA', 'PRATELEIRA']
                  ).map((loc) => (
                    <option key={loc} value={loc}>
                      {loc}
                    </option>
                  ))}
                  <option value="Baixado">Baixado</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-600">Quantidade movimentada</label>
                <input
                  type="number"
                  min={1}
                  max={selectedTransferItem.quantity}
                  value={transferQuantity}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => setTransferQuantity(Math.min(selectedTransferItem.quantity, Math.max(1, Number(e.target.value) || 1)))}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800 focus:outline-none focus:border-indigo-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-600">Data de vencimento movimentada</label>
                <input
                  type="date"
                  value={transferExpirationDate}
                  onChange={(e) => setTransferExpirationDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSelectedTransferItem(null)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmTransfer}
                className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-500"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Confirmar Exclusão de Item de Estoque */}
      {itemToDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150"
          onClick={() => setItemToDelete(null)}
        >
          <div
            className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 text-slate-800 border-b border-slate-100 pb-3">
              <div className="p-2.5 rounded-xl bg-rose-50 text-rose-600">
                <Trash2 className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-bold text-base text-slate-900">Remover do Estoque</h3>
                <p className="text-xs text-slate-400">Exclusão do registro no estoque ativo</p>
              </div>
            </div>

            <div className="text-xs text-slate-600 leading-relaxed space-y-1">
              <p>
                Deseja realmente remover o registro de{' '}
                <strong className="text-slate-900 font-bold">{itemToDelete.productName}</strong> do estoque?
              </p>
              <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200/60 text-[11px] font-mono space-y-0.5">
                <div>Código: <span className="font-bold">{itemToDelete.productCode}</span></div>
                <div>Lote: <span className="font-bold">{itemToDelete.lot}</span></div>
                <div>Quantidade: <span className="font-bold">{itemToDelete.quantity} {itemToDelete.unit}</span></div>
                <div>Endereço: <span className="font-bold">{itemToDelete.address}</span></div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setItemToDelete(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  if (itemToDelete && onDeleteStockItem) {
                    onDeleteStockItem(itemToDelete.id);
                  }
                  setItemToDelete(null);
                }}
                className="bg-rose-600 hover:bg-rose-500 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-sm transition cursor-pointer"
              >
                Sim, Remover
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
