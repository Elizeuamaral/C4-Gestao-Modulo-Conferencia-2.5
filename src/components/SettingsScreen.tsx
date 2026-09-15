/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { Product, StockItem, Movement, AppSettings } from '../types';
import { playSuccessBeep, playErrorBuzzer } from '../utils/audio';
import { DATABASE_EXPORT_HEADERS, formatDateDisplay } from '../utils/stockTemplate';
import {
  Database,
  Upload,
  Download,
  Plus,
  Trash2,
  Edit3,
  Search,
  CheckCircle2,
  AlertCircle,
  X,
  RotateCcw,
  UserCheck,
  Calendar,
  Tag,
  MapPin,
  FileText,
  Filter
} from 'lucide-react';

interface SettingsScreenProps {
  stock: StockItem[];
  products: Product[];
  movements: Movement[];
  settings: AppSettings;
  onUpdateStockItem: (updatedItem: StockItem, audit: { checkerName: string; reason: string }) => void;
  onDeleteStockItem: (stockItemId: string) => void;
  onAddStockItem: (newItem: Omit<StockItem, 'id'>) => void;
  onImportData: (importedProducts: Product[], importedStockEntries: StockItem[]) => void;
  onRestoreBackup: (data: {
    products: Product[];
    stock: StockItem[];
    movements: Movement[];
    settings?: AppSettings;
  }) => void;
  onResetDatabase: () => void;
  onNotify: (message: string, type?: 'success' | 'info') => void;
}

const normalizeText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

export default function SettingsScreen({
  stock,
  products,
  movements,
  settings,
  onUpdateStockItem,
  onDeleteStockItem,
  onAddStockItem,
  onImportData,
  onRestoreBackup,
  onResetDatabase,
  onNotify
}: SettingsScreenProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [methodFilter, setMethodFilter] = useState<'TODOS' | 'Conferencia' | 'Edição' | 'Importação'>('TODOS');
  
  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<StockItem | null>(null);
  const [itemToDelete, setItemToDelete] = useState<StockItem | null>(null);

  // Form states for Add / Edit
  const [formProductCode, setFormProductCode] = useState('');
  const [formProductName, setFormProductName] = useState('');
  const [formQuantity, setFormQuantity] = useState(1);
  const [formUnit, setFormUnit] = useState<'UN' | 'FD' | 'CX' | 'PCT'>('UN');
  const [formLot, setFormLot] = useState('');
  const [formManufacturingDate, setFormManufacturingDate] = useState('');
  const [formExpirationDate, setFormExpirationDate] = useState('');
  const [formNoExpirationDate, setFormNoExpirationDate] = useState(false);
  const [formAddress, setFormAddress] = useState('ESTOQUE');
  const [formSupplier, setFormSupplier] = useState('');
  const [formInvoiceNumber, setFormInvoiceNumber] = useState('');
  const [formCheckerName, setFormCheckerName] = useState('');
  const [formReceivedDate, setFormReceivedDate] = useState('');

  // Required audit fields for edits
  const [auditModifierName, setAuditModifierName] = useState('');
  const [auditReason, setAuditReason] = useState('Conferência');
  const [formError, setFormError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Filtered stock items
  const filteredStock = stock.filter((item) => {
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !q ||
      item.productCode.toLowerCase().includes(q) ||
      item.productName.toLowerCase().includes(q) ||
      item.lot.toLowerCase().includes(q) ||
      item.address.toLowerCase().includes(q) ||
      (item.supplier && item.supplier.toLowerCase().includes(q)) ||
      (item.invoiceNumber && item.invoiceNumber.toLowerCase().includes(q)) ||
      (item.checkerName && item.checkerName.toLowerCase().includes(q)) ||
      (item.updatedBy && item.updatedBy.toLowerCase().includes(q)) ||
      (item.updateReason && item.updateReason.toLowerCase().includes(q));

    const itemMethod = item.entryMethod || 'Conferencia';
    const matchesMethod = methodFilter === 'TODOS' || itemMethod === methodFilter;

    return matchesSearch && matchesMethod;
  });

  // Open modal to add item
  const handleOpenAddModal = () => {
    const today = new Date().toISOString().split('T')[0];
    setFormProductCode('');
    setFormProductName('');
    setFormQuantity(1);
    setFormUnit('UN');
    setFormLot('');
    setFormManufacturingDate(today);
    setFormExpirationDate('');
    setFormNoExpirationDate(false);
    setFormAddress('ESTOQUE');
    setFormSupplier('');
    setFormInvoiceNumber('');
    setFormCheckerName(settings?.checkers?.[0] || 'Tito');
    setFormReceivedDate(today);
    setAuditModifierName('');
    setAuditReason('');
    setFormError(null);
    setIsAddModalOpen(true);
  };

  // Open modal to edit item
  const handleOpenEditModal = (item: StockItem) => {
    setEditingItem(item);
    setFormProductCode(item.productCode);
    setFormProductName(item.productName);
    setFormQuantity(item.quantity);
    setFormUnit(item.unit);
    setFormLot(item.lot);
    setFormManufacturingDate(item.manufacturingDate || '');
    setFormExpirationDate(item.expirationDate || '');
    setFormNoExpirationDate(!!item.noExpirationDate);
    setFormAddress(item.address);
    setFormSupplier(item.supplier || '');
    setFormInvoiceNumber(item.invoiceNumber || '');
    setFormCheckerName(item.checkerName || '');
    setFormReceivedDate(item.receivedDate || '');
    
    // Default modifier name from checkers list or empty
    setAuditModifierName(settings?.checkers?.[0] || 'Paulo');
    setAuditReason(item.updateReason || 'Conferência');
    setFormError(null);
  };

  // Save Add or Edit
  const handleSaveItem = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = formProductCode.trim();
    const cleanName = formProductName.trim();

    if (!cleanCode) {
      setFormError('Informe o código de barras do produto.');
      return;
    }
    if (!cleanName) {
      setFormError('Informe a descrição do produto.');
      return;
    }
    if (formQuantity <= 0) {
      setFormError('A quantidade deve ser maior que zero.');
      return;
    }

    if (editingItem) {
      // Must provide modifier conferente and reason
      const modifier = auditModifierName.trim();
      const reason = auditReason.trim();

      if (!modifier) {
        setFormError('Informe o nome do conferente que está alterando o produto.');
        return;
      }
      if (!reason) {
        setFormError('Informe o motivo da alteração.');
        return;
      }

      onUpdateStockItem(
        {
          ...editingItem,
          productCode: cleanCode,
          productName: cleanName,
          quantity: formQuantity,
          unit: formUnit,
          lot: formLot.trim() || 'S/LOTE',
          manufacturingDate: formManufacturingDate || undefined,
          expirationDate: formExpirationDate || undefined,
          noExpirationDate: formNoExpirationDate,
          address: formAddress.trim() || 'ESTOQUE',
          supplier: formSupplier.trim() || undefined,
          invoiceNumber: formInvoiceNumber.trim() || undefined,
          checkerName: formCheckerName.trim() || editingItem.checkerName,
          receivedDate: formReceivedDate || editingItem.receivedDate,
        },
        {
          checkerName: modifier,
          reason
        }
      );
      setEditingItem(null);
      playSuccessBeep();
    } else {
      // Adding new stock item
      onAddStockItem({
        productCode: cleanCode,
        productName: cleanName,
        quantity: formQuantity,
        receivedQuantity: formQuantity,
        unit: formUnit,
        lot: formLot.trim() || 'S/LOTE',
        manufacturingDate: formManufacturingDate || undefined,
        expirationDate: formExpirationDate || undefined,
        noExpirationDate: formNoExpirationDate,
        address: formAddress.trim() || 'ESTOQUE',
        supplier: formSupplier.trim() || undefined,
        invoiceNumber: formInvoiceNumber.trim() || undefined,
        checkerName: formCheckerName.trim() || 'Conferente',
        receivedDate: formReceivedDate || new Date().toISOString().split('T')[0],
        entryMethod: 'Conferencia'
      });
      setIsAddModalOpen(false);
      playSuccessBeep();
    }
  };

  // Confirm delete item
  const handleConfirmDelete = () => {
    if (!itemToDelete) return;
    onDeleteStockItem(itemToDelete.id);
    setItemToDelete(null);
    playSuccessBeep();
  };

  // Export Base de Dados (Exact 16 columns matching user's image)
  const handleExportDatabaseExcel = () => {
    try {
      const wb = XLSX.utils.book_new();

      const headers = [...DATABASE_EXPORT_HEADERS];
      const rows = stock.map((item) => [
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
      XLSX.utils.book_append_sheet(wb, ws, 'Base de Dados - Estoque');

      const dateStr = new Date().toISOString().split('T')[0];
      XLSX.writeFile(wb, `base_de_dados_estoque_${dateStr}.xlsx`);
      playSuccessBeep();
      onNotify('Base de dados exportada para Excel com sucesso!', 'success');
    } catch {
      playErrorBuzzer();
      onNotify('Erro ao exportar base de dados.', 'info');
    }
  };

  // Import file (Excel or JSON)
  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const fileName = file.name.toLowerCase();

      if (fileName.endsWith('.json')) {
        const text = await file.text();
        const json = JSON.parse(text);
        if (!json.stock && !json.products) {
          throw new Error('Arquivo JSON inválido.');
        }
        onRestoreBackup(json);
        playSuccessBeep();
        onNotify('Base de dados restaurada com sucesso!', 'success');
      } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rawRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });

        if (rawRows.length < 2) {
          throw new Error('A planilha está vazia ou sem cabeçalhos.');
        }

        const headerRow = (rawRows[0] as unknown[]).map((h) => normalizeText(String(h || '')));
        const codeIdx = headerRow.findIndex((h) => h.includes('codigo') || h.includes('ean') || h.includes('bar'));
        const nameIdx = headerRow.findIndex((h) => h.includes('descricao') || h.includes('produto') || h.includes('nome'));
        const qtyIdx = headerRow.findIndex((h) => h.includes('quantidade') || h.includes('qtd') || h.includes('saldo'));
        const unitIdx = headerRow.findIndex((h) => h.includes('unidade') || h.includes('un'));
        const lotIdx = headerRow.findIndex((h) => h.includes('lote'));
        const fabIdx = headerRow.findIndex((h) => h.includes('fabricacao') || h.includes('fab'));
        const expIdx = headerRow.findIndex((h) => h.includes('vencimento') || h.includes('validade'));
        const addrIdx = headerRow.findIndex((h) => h.includes('endereco') || h.includes('local'));
        const supIdx = headerRow.findIndex((h) => h.includes('fornecedor'));
        const invIdx = headerRow.findIndex((h) => h.includes('nota') || h.includes('nf'));
        
        // Conferente 1 (Entrada) and Conferente 2 (Alteração)
        const conferenteIndices: number[] = [];
        headerRow.forEach((h, idx) => {
          if (h.includes('conferente')) conferenteIndices.push(idx);
        });
        const checkerIdx = conferenteIndices.length > 0 ? conferenteIndices[0] : -1;
        const updaterIdx = conferenteIndices.length > 1 ? conferenteIndices[1] : -1;

        const dateEntryIdx = headerRow.findIndex((h) => h.includes('data de entrada') || h.includes('entrada'));
        const methodIdx = headerRow.findIndex((h) => h.includes('metodo') || h.includes('metodo de entrada'));
        const dateUpdateIdx = headerRow.findIndex((h) => h.includes('data de alteracao') || h.includes('alteracao'));
        const reasonIdx = headerRow.findIndex((h) => h.includes('motivo'));

        if (codeIdx === -1 || nameIdx === -1) {
          throw new Error('A planilha precisa ter colunas de "Codigo de barra" e "Descricao".');
        }

        const importedProducts: Product[] = [];
        const importedStock: StockItem[] = [];
        const now = Date.now();

        for (let i = 1; i < rawRows.length; i++) {
          const row = rawRows[i] as unknown[];
          const code = String(row[codeIdx] ?? '').trim();
          const name = String(row[nameIdx] ?? '').trim();

          if (!code || !name) continue;

          importedProducts.push({
            code,
            name,
            category: 'Geral'
          });

          const rawQty = row[qtyIdx];
          const qty = typeof rawQty === 'number' ? Math.max(1, Math.round(rawQty)) : Math.max(1, parseInt(String(rawQty || '1'), 10) || 1);
          const rawUnit = String(row[unitIdx] ?? 'UN').trim().toUpperCase();
          const unit: StockItem['unit'] = rawUnit === 'FD' || rawUnit === 'CX' || rawUnit === 'PCT' ? rawUnit : 'UN';
          const lot = String(row[lotIdx] ?? 'IMPORTADO').trim() || 'IMPORTADO';
          const address = String(row[addrIdx] ?? 'ESTOQUE').trim() || 'ESTOQUE';
          const supplier = supIdx !== -1 ? String(row[supIdx] ?? '').trim() : undefined;
          const invoice = invIdx !== -1 ? String(row[invIdx] ?? '').trim() : undefined;
          const checker = checkerIdx !== -1 ? String(row[checkerIdx] ?? '').trim() : undefined;
          const receivedDate = dateEntryIdx !== -1 ? String(row[dateEntryIdx] ?? '').trim() : new Date().toISOString().split('T')[0];
          const entryMethod = methodIdx !== -1 ? String(row[methodIdx] ?? '').trim() || 'Importação' : 'Importação';
          const updatedAt = dateUpdateIdx !== -1 ? String(row[dateUpdateIdx] ?? '').trim() : undefined;
          const updatedBy = updaterIdx !== -1 ? String(row[updaterIdx] ?? '').trim() : undefined;
          const updateReason = reasonIdx !== -1 ? String(row[reasonIdx] ?? '').trim() : undefined;

          importedStock.push({
            id: `stock-import-${now}-${i}`,
            productCode: code,
            productName: name,
            quantity: qty,
            receivedQuantity: qty,
            unit,
            lot,
            address,
            supplier,
            invoiceNumber: invoice,
            checkerName: checker,
            receivedDate,
            entryMethod,
            updatedAt,
            updatedBy,
            updateReason
          });
        }

        if (importedStock.length === 0 && importedProducts.length === 0) {
          throw new Error('Nenhuma linha válida encontrada para importação.');
        }

        onImportData(importedProducts, importedStock);
        playSuccessBeep();
        onNotify(`Importação concluída: ${importedStock.length} itens carregados na base de dados!`, 'success');
      } else {
        throw new Error('Formato inválido. Selecione um arquivo Excel (.xlsx, .xls) ou JSON.');
      }
    } catch (err) {
      playErrorBuzzer();
      const msg = err instanceof Error ? err.message : 'Erro ao importar arquivo.';
      onNotify(msg, 'info');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 space-y-6 pb-12 animate-in fade-in duration-200 font-sans">
      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls,.json"
        className="hidden"
        onChange={handleFileSelected}
      />

      {/* Main Database Header & Action Bar */}
      <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200/80 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-5">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl">
              <Database className="h-7 w-7" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-black text-slate-800 tracking-tight">
                  Base de Dados — Estoque Atual
                </h2>
                <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                  Vinculada ao Histórico
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                Rastreabilidade completa com método de entrada, conferente de entrada e responsável por alterações
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2.5 rounded-xl text-xs font-bold shadow-sm transition flex items-center gap-1.5 cursor-pointer"
              title="Importar base de dados de planilha Excel (.xlsx)"
              id="btn-import-database"
            >
              <Upload className="h-4 w-4" />
              <span>Importar Base de Dados</span>
            </button>

            <button
              type="button"
              onClick={handleExportDatabaseExcel}
              className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2.5 rounded-xl text-xs font-bold shadow-sm transition flex items-center gap-1.5 cursor-pointer"
              title="Exportar base de dados para planilha Excel (.xlsx) com as 16 colunas"
              id="btn-export-database"
            >
              <Download className="h-4 w-4" />
              <span>Exportar Base de Dados</span>
            </button>
          </div>
        </div>
      </div>

      {/* Search, Filter and Actions Bar */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Pesquisar por código, descrição, lote, endereço, fornecedor, conferente ou motivo..."
              className="w-full pl-10 pr-4 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 bg-slate-50 focus:bg-white text-slate-800 focus:outline-none focus:border-indigo-500 transition"
              id="search-database-input"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs">
              <Filter className="h-3.5 w-3.5 text-slate-400" />
              <select
                value={methodFilter}
                onChange={(e) => setMethodFilter(e.target.value as any)}
                className="bg-transparent font-bold text-slate-700 focus:outline-none cursor-pointer"
                id="select-method-filter"
              >
                <option value="TODOS">Todos os Métodos</option>
                <option value="Conferencia">Conferência</option>
                <option value="Edição">Edição</option>
                <option value="Importação">Importação</option>
              </select>
            </div>

            <button
              type="button"
              onClick={handleOpenAddModal}
              className="bg-indigo-600 hover:bg-indigo-500 text-white px-3.5 py-2 rounded-xl text-xs font-bold shadow-xs transition flex items-center gap-1.5 cursor-pointer"
              id="btn-add-item-database"
            >
              <Plus className="h-4 w-4" />
              <span>Novo Registro</span>
            </button>

            <button
              type="button"
              onClick={onResetDatabase}
              className="border border-rose-200 text-rose-600 hover:bg-rose-50 px-3 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer"
              title="Apagar todos os dados e começar base limpa"
              id="btn-reset-database-screen"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Limpar Base</span>
            </button>
          </div>
        </div>

        {/* Full 16-Column Database Table */}
        <div className="overflow-x-auto">
          {filteredStock.length === 0 ? (
            <div className="py-12 px-4 text-center">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
                <Database className="h-6 w-6" />
              </div>
              <p className="text-sm font-bold text-slate-700">
                {stock.length === 0
                  ? 'A base de dados de estoque está vazia'
                  : 'Nenhum registro encontrado para a busca'}
              </p>
              <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                {stock.length === 0
                  ? 'Realize entradas no Módulo de Entrada, importe uma planilha Excel ou adicione um registro manual.'
                  : 'Tente buscar por outro termo ou remova o filtro de método de entrada.'}
              </p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/90 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider whitespace-nowrap">
                  <th className="py-3 px-3">Codigo de barra</th>
                  <th className="py-3 px-3">Descricao</th>
                  <th className="py-3 px-3 text-center">Quantidade</th>
                  <th className="py-3 px-2 text-center">Unidade</th>
                  <th className="py-3 px-3">Lote</th>
                  <th className="py-3 px-3">Fabricacao</th>
                  <th className="py-3 px-3">Vencimento</th>
                  <th className="py-3 px-3">Endereco</th>
                  <th className="py-3 px-3">Fornecedor</th>
                  <th className="py-3 px-3">Nota Fiscal</th>
                  <th className="py-3 px-3">Conferente</th>
                  <th className="py-3 px-3">Data de Entrada</th>
                  <th className="py-3 px-3 text-center">Metodo de Entrada</th>
                  <th className="py-3 px-3">Data de alteração</th>
                  <th className="py-3 px-3">Conferente</th>
                  <th className="py-3 px-3">Motivo</th>
                  <th className="py-3 px-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredStock.map((item) => {
                  const method = item.entryMethod || 'Conferencia';
                  const isEdited = method === 'Edição';

                  return (
                    <tr
                      key={item.id}
                      className={`hover:bg-slate-50/80 transition-colors whitespace-nowrap ${
                        isEdited ? 'bg-amber-50/20' : ''
                      }`}
                    >
                      <td className="py-3 px-3 font-mono font-bold text-slate-800">
                        {item.productCode}
                      </td>
                      <td className="py-3 px-3 font-semibold text-slate-800 max-w-[200px] truncate" title={item.productName}>
                        {item.productName}
                      </td>
                      <td className="py-3 px-3 text-center font-bold text-slate-900">
                        {item.quantity}
                      </td>
                      <td className="py-3 px-2 text-center font-bold text-slate-600">
                        {item.unit}
                      </td>
                      <td className="py-3 px-3 font-mono text-slate-700">
                        {item.lot}
                      </td>
                      <td className="py-3 px-3 font-mono text-slate-600">
                        {formatDateDisplay(item.manufacturingDate) || '-'}
                      </td>
                      <td className="py-3 px-3 font-mono text-slate-600">
                        {item.noExpirationDate ? (
                          <span className="text-slate-400">Sem validade</span>
                        ) : (
                          formatDateDisplay(item.expirationDate) || '-'
                        )}
                      </td>
                      <td className="py-3 px-3">
                        <span className={`px-2 py-0.5 rounded-md font-mono text-[11px] font-bold ${
                          item.address?.trim().toLowerCase() === 'baixado'
                            ? 'bg-rose-100 text-rose-800 border border-rose-200'
                            : 'bg-slate-100 text-slate-700'
                        }`}>
                          {item.address}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-slate-600">
                        {item.supplier || '-'}
                      </td>
                      <td className="py-3 px-3 font-mono text-slate-600">
                        {item.invoiceNumber || '-'}
                      </td>
                      <td className="py-3 px-3 font-medium text-slate-700">
                        {item.checkerName || '-'}
                      </td>
                      <td className="py-3 px-3 font-mono text-slate-600">
                        {formatDateDisplay(item.receivedDate) || '-'}
                      </td>
                      <td className="py-3 px-3 text-center">
                        {isEdited ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 font-bold text-[10px] border border-amber-200">
                            <Edit3 className="h-3 w-3" />
                            Edição
                          </span>
                        ) : method === 'Importação' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-bold text-[10px] border border-emerald-200">
                            <Upload className="h-3 w-3" />
                            Importação
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-100 text-blue-800 font-bold text-[10px] border border-blue-200">
                            <CheckCircle2 className="h-3 w-3" />
                            Conferencia
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 font-mono text-slate-600">
                        {formatDateDisplay(item.updatedAt) || ''}
                      </td>
                      <td className="py-3 px-3 font-bold text-slate-800">
                        {item.updatedBy || ''}
                      </td>
                      <td className="py-3 px-3 text-slate-600 italic">
                        {item.updateReason || ''}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => handleOpenEditModal(item)}
                            className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                            title="Editar este registro no banco de dados"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setItemToDelete(item)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                            title="Excluir este registro"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer info */}
        {filteredStock.length > 0 && (
          <div className="p-3 bg-slate-50/60 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-2">
            <span>
              Exibindo <strong>{filteredStock.length}</strong> de <strong>{stock.length}</strong> registros do estoque atual
            </span>
            <span className="text-[11px] text-slate-400">
              Colunas em total conformidade com o padrão da base de dados do sistema
            </span>
          </div>
        )}
      </div>

      {/* Modal: Add or Edit Item in Database */}
      {(isAddModalOpen || editingItem) && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150 overflow-y-auto"
          onClick={() => {
            setIsAddModalOpen(false);
            setEditingItem(null);
          }}
        >
          <div
            className="bg-white rounded-2xl max-w-2xl w-full p-5 sm:p-6 shadow-2xl border border-slate-100 space-y-4 my-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 rounded-xl bg-indigo-50 text-indigo-600">
                  {editingItem ? <Edit3 className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900">
                    {editingItem ? 'Alterar Item no Banco de Dados' : 'Adicionar Novo Item ao Estoque'}
                  </h3>
                  <p className="text-xs text-slate-400">
                    {editingItem
                      ? 'O método de entrada será registrado como "Edição" com auditoria do conferente alterador'
                      : 'Cadastrar novo item diretamente na base de estoque'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsAddModalOpen(false);
                  setEditingItem(null);
                }}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveItem} className="space-y-4">
              {/* Product Code and Name */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Código de Barra
                  </label>
                  <input
                    type="text"
                    value={formProductCode}
                    onChange={(e) => setFormProductCode(e.target.value)}
                    placeholder="Ex: 7891000120114"
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-slate-50 focus:bg-white text-slate-800 font-mono font-medium focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Descrição do Produto
                  </label>
                  <input
                    type="text"
                    value={formProductName}
                    onChange={(e) => setFormProductName(e.target.value)}
                    placeholder="Ex: Leite Integral Longa Vida 1L"
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-slate-50 focus:bg-white text-slate-800 font-medium focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* Quantity, Unit, Lot, Address */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Quantidade
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={formQuantity}
                    onChange={(e) => setFormQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-slate-50 focus:bg-white text-slate-800 font-bold focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Unidade
                  </label>
                  <select
                    value={formUnit}
                    onChange={(e) => setFormUnit(e.target.value as any)}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-slate-50 focus:bg-white text-slate-800 font-bold focus:outline-none focus:border-indigo-500"
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
                    value={formLot}
                    onChange={(e) => setFormLot(e.target.value)}
                    placeholder="Ex: L-MK45"
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-slate-50 focus:bg-white text-slate-800 font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Endereço
                  </label>
                  <input
                    type="text"
                    value={formAddress}
                    onChange={(e) => setFormAddress(e.target.value)}
                    placeholder="Ex: Geladeira, Estoque"
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-slate-50 focus:bg-white text-slate-800 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* Manufacturing & Expiration Dates */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Data de Fabricação
                  </label>
                  <input
                    type="date"
                    value={formManufacturingDate}
                    onChange={(e) => setFormManufacturingDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-slate-50 focus:bg-white text-slate-800 font-mono focus:outline-none focus:border-indigo-500"
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
                        checked={formNoExpirationDate}
                        onChange={(e) => setFormNoExpirationDate(e.target.checked)}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-0"
                      />
                      Sem validade
                    </label>
                  </div>
                  <input
                    type="date"
                    disabled={formNoExpirationDate}
                    value={formExpirationDate}
                    onChange={(e) => setFormExpirationDate(e.target.value)}
                    className={`w-full px-3 py-2 text-sm rounded-xl border border-slate-200 font-mono focus:outline-none focus:border-indigo-500 ${
                      formNoExpirationDate ? 'bg-slate-100 text-slate-400' : 'bg-slate-50 focus:bg-white text-slate-800'
                    }`}
                  />
                </div>
              </div>

              {/* Supplier, Invoice, Initial Checker */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Fornecedor
                  </label>
                  <input
                    type="text"
                    value={formSupplier}
                    onChange={(e) => setFormSupplier(e.target.value)}
                    placeholder="Ex: Ambev"
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-slate-50 focus:bg-white text-slate-800 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Nota Fiscal
                  </label>
                  <input
                    type="text"
                    value={formInvoiceNumber}
                    onChange={(e) => setFormInvoiceNumber(e.target.value)}
                    placeholder="Ex: 12549"
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-slate-50 focus:bg-white text-slate-800 font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Conferente (Entrada)
                  </label>
                  <input
                    type="text"
                    value={formCheckerName}
                    onChange={(e) => setFormCheckerName(e.target.value)}
                    placeholder="Ex: Tito, Joao"
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-slate-50 focus:bg-white text-slate-800 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* Audit Trail Fields (Only shown on Edit to identify who altered and why) */}
              {editingItem && (
                <div className="p-4 rounded-xl bg-amber-50 border border-amber-200/80 space-y-3">
                  <div className="flex items-center gap-2 text-amber-800 font-bold text-xs uppercase tracking-wider">
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
                        value={auditModifierName}
                        onChange={(e) => setAuditModifierName(e.target.value)}
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
                        value={auditReason}
                        onChange={(e) => setAuditReason(e.target.value)}
                        placeholder="Ex: Conferência, Ajuste de validade..."
                        className="w-full px-3 py-2 text-sm rounded-xl border border-amber-300 bg-white text-slate-900 font-medium focus:outline-none focus:border-amber-500"
                      />
                    </div>
                  </div>
                  <p className="text-[11px] text-amber-700">
                    O <strong>Método de Entrada</strong> deste item será automaticamente atualizado para <strong>"Edição"</strong> com a data atual ({new Date().toLocaleDateString('pt-BR')}).
                  </p>
                </div>
              )}

              {formError && (
                <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center gap-1.5">
                  <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setIsAddModalOpen(false);
                    setEditingItem(null);
                  }}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2 rounded-xl text-xs font-bold shadow-sm transition cursor-pointer"
                >
                  {editingItem ? 'Confirmar Alteração' : 'Cadastrar Item'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Confirm Delete Item */}
      {itemToDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150"
          onClick={() => setItemToDelete(null)}
        >
          <div
            className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-slate-100 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 text-slate-800">
              <div className="p-2.5 rounded-xl bg-rose-50 text-rose-600">
                <Trash2 className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-slate-900">Excluir Item do Estoque</h3>
                <p className="text-[11px] text-slate-400 font-mono">{itemToDelete.productCode} — Lote: {itemToDelete.lot}</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Deseja realmente remover o registro de{' '}
              <strong className="text-slate-900 font-bold">"{itemToDelete.productName}"</strong> ({itemToDelete.quantity} {itemToDelete.unit}) da base de dados?
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setItemToDelete(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="bg-rose-600 hover:bg-rose-500 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-sm transition cursor-pointer"
              >
                Sim, Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
