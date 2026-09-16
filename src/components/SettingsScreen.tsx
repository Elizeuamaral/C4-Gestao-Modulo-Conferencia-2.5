/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { Product, AppSettings } from '../types';
import { playSuccessBeep, playErrorBuzzer } from '../utils/audio';
import {
  Database,
  Plus,
  Search,
  Upload,
  Download,
  Trash2,
  Edit2,
  Lock,
  Key,
  AlertCircle,
  CheckCircle2,
  X,
  Barcode,
  Eye,
  EyeOff,
  ShieldCheck,
  CalendarClock
} from 'lucide-react';

interface SettingsScreenProps {
  products: Product[];
  settings: AppSettings;
  onAddProduct: (product: Product) => void;
  onUpdateProduct: (product: Product, oldCode?: string) => void;
  onDeleteProduct: (productCode: string) => void;
  onImportProducts: (products: Product[]) => void;
  onResetProducts: () => void;
  onNotify: (message: string, type: 'success' | 'info') => void;
  onUpdateSettings?: (newSettings: AppSettings) => void;
}

export default function SettingsScreen({
  products,
  settings,
  onAddProduct,
  onUpdateProduct,
  onDeleteProduct,
  onImportProducts,
  onResetProducts,
  onNotify,
  onUpdateSettings
}: SettingsScreenProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Modal: Add / Edit Product
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [productCodeInput, setProductCodeInput] = useState('');
  const [productNameInput, setProductNameInput] = useState('');
  const [productModalError, setProductModalError] = useState<string | null>(null);

  // Modal: Delete confirmation
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);

  // Modal: Clear Database confirmation
  const [isConfirmResetModalOpen, setIsConfirmResetModalOpen] = useState(false);

  // Modal: Change Password
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [currentPasswordInput, setCurrentPasswordInput] = useState('');
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [confirmPasswordInput, setConfirmPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [showPasswordText, setShowPasswordText] = useState(false);

  // Configuração de período de vencimento para o filtro da Consulta de Estoque
  const [criticalExpiryInput, setCriticalExpiryInput] = useState<number>(settings?.criticalExpiryDays ?? 30);
  const [warningExpiryInput, setWarningExpiryInput] = useState<number>(settings?.warningExpiryDays ?? 90);
  const [safeExpiryInput, setSafeExpiryInput] = useState<number>(
    settings?.safeExpiryDays ?? settings?.warningExpiryDays ?? 90
  );
  const [isExpirySaved, setIsExpirySaved] = useState(false);

  React.useEffect(() => {
    if (settings?.criticalExpiryDays !== undefined) {
      setCriticalExpiryInput(settings.criticalExpiryDays);
    }
    if (settings?.warningExpiryDays !== undefined) {
      setWarningExpiryInput(settings.warningExpiryDays);
    }
    if (settings?.safeExpiryDays !== undefined) {
      setSafeExpiryInput(settings.safeExpiryDays);
    } else if (settings?.warningExpiryDays !== undefined) {
      setSafeExpiryInput(settings.warningExpiryDays);
    }
  }, [settings?.criticalExpiryDays, settings?.warningExpiryDays, settings?.safeExpiryDays]);

  const handleWarningChange = (val: number) => {
    setWarningExpiryInput(val);
    setSafeExpiryInput(val); // Sincroniza Seguros (> X dias)
    if (criticalExpiryInput >= val && val > 1) {
      setCriticalExpiryInput(Math.max(1, val - 1));
    }
  };

  const handleSafeChange = (val: number) => {
    setSafeExpiryInput(val);
    setWarningExpiryInput(val); // Sincroniza Alerta (<= X dias)
    if (criticalExpiryInput >= val && val > 1) {
      setCriticalExpiryInput(Math.max(1, val - 1));
    }
  };

  const handleCriticalChange = (val: number) => {
    setCriticalExpiryInput(val);
    if (val >= warningExpiryInput) {
      setWarningExpiryInput(val + 1);
      setSafeExpiryInput(val + 1);
    }
  };

  const handleSaveExpiryPeriod = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const criticalVal = Math.max(1, Math.min(365, Number(criticalExpiryInput) || 30));
    const warningVal = Math.max(criticalVal + 1, Math.min(730, Number(warningExpiryInput) || 90));
    const safeVal = Math.max(criticalVal + 1, Math.min(730, Number(safeExpiryInput) || warningVal));

    const updatedSettings: AppSettings = {
      ...settings,
      criticalExpiryDays: criticalVal,
      warningExpiryDays: warningVal,
      safeExpiryDays: safeVal,
    };

    if (onUpdateSettings) {
      onUpdateSettings(updatedSettings);
    } else {
      localStorage.setItem('fast_stock_settings', JSON.stringify(updatedSettings));
    }

    playSuccessBeep();
    setIsExpirySaved(true);
    onNotify(`Opções de vencimento atualizadas com sucesso!`, 'success');
    setTimeout(() => setIsExpirySaved(false), 2500);
  };

  const handleResetExpiryDefaults = () => {
    setCriticalExpiryInput(30);
    setWarningExpiryInput(90);
    setSafeExpiryInput(90);

    const updatedSettings: AppSettings = {
      ...settings,
      criticalExpiryDays: 30,
      warningExpiryDays: 90,
      safeExpiryDays: 90,
    };

    if (onUpdateSettings) {
      onUpdateSettings(updatedSettings);
    } else {
      localStorage.setItem('fast_stock_settings', JSON.stringify(updatedSettings));
    }

    playSuccessBeep();
    setIsExpirySaved(true);
    onNotify('Opções restauradas para o padrão: 30d, 90d e 90d!', 'info');
    setTimeout(() => setIsExpirySaved(false), 2500);
  };

  // Filtered products list
  const filteredProducts = products.filter((p) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      p.code.toLowerCase().includes(q) ||
      p.name.toLowerCase().includes(q)
    );
  });

  // Open modal to add new product
  const handleOpenAddProduct = () => {
    setEditingProduct(null);
    setProductCodeInput('');
    setProductNameInput('');
    setProductModalError(null);
    setIsProductModalOpen(true);
  };

  // Open modal to edit existing product
  const handleOpenEditProduct = (product: Product) => {
    setEditingProduct(product);
    setProductCodeInput(product.code);
    setProductNameInput(product.name);
    setProductModalError(null);
    setIsProductModalOpen(true);
  };

  // Save product (add or update)
  const handleSaveProduct = (e: React.FormEvent) => {
    e.preventDefault();
    setProductModalError(null);

    const cleanCode = productCodeInput.trim().toUpperCase();
    const cleanName = productNameInput.trim();

    if (!cleanCode) {
      setProductModalError('O código de barras é obrigatório.');
      playErrorBuzzer();
      return;
    }

    if (!cleanName) {
      setProductModalError('A descrição do produto é obrigatória.');
      playErrorBuzzer();
      return;
    }

    // Check duplicate code if adding new or if code changed
    if (!editingProduct || editingProduct.code !== cleanCode) {
      const existing = products.find((p) => p.code === cleanCode);
      if (existing) {
        setProductModalError(`Já existe um produto com o código "${cleanCode}" (${existing.name}).`);
        playErrorBuzzer();
        return;
      }
    }

    if (editingProduct) {
      onUpdateProduct(
        {
          ...editingProduct,
          code: cleanCode,
          name: cleanName,
          category: editingProduct.category || 'Geral'
        },
        editingProduct.code
      );
      onNotify(`Produto "${cleanName}" atualizado com sucesso!`, 'success');
    } else {
      onAddProduct({
        code: cleanCode,
        name: cleanName,
        category: 'Geral'
      });
      onNotify(`Produto "${cleanName}" cadastrado na Base de Dados!`, 'success');
    }

    playSuccessBeep();
    setIsProductModalOpen(false);
  };

  // Confirm delete single product
  const handleConfirmDeleteProduct = () => {
    if (!productToDelete) return;
    onDeleteProduct(productToDelete.code);
    playSuccessBeep();
    onNotify(`Produto "${productToDelete.name}" removido da Base de Dados.`, 'info');
    setProductToDelete(null);
  };

  // Export Base de Dados (Only Código de Barras and Descrição)
  const handleExportExcel = () => {
    try {
      const wb = XLSX.utils.book_new();
      const headers = ['Código de Barras', 'Descrição'];
      const rows = products.map((p) => [p.code, p.name]);

      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      XLSX.utils.book_append_sheet(wb, ws, 'Base de Produtos');
      const filename = `base_produtos_${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(wb, filename);

      playSuccessBeep();
      onNotify(`Base exportada com sucesso! (${products.length} produtos)`, 'success');
    } catch (err) {
      console.error('Erro ao exportar base de dados:', err);
      onNotify('Falha ao exportar arquivo Excel.', 'info');
      playErrorBuzzer();
    }
  };

  // Import Base de Dados (Excel .xlsx, .xls ou .csv)
  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1 });

        if (!data || data.length === 0) {
          onNotify('O arquivo selecionado está vazio.', 'info');
          playErrorBuzzer();
          return;
        }

        // Detect header row
        let codeIdx = 0;
        let nameIdx = 1;
        let startRow = 0;

        const firstRow = data[0] || [];
        const isHeader = firstRow.some((cell) => {
          const val = String(cell || '').toLowerCase();
          return (
            val.includes('cód') ||
            val.includes('cod') ||
            val.includes('barra') ||
            val.includes('ean') ||
            val.includes('desc') ||
            val.includes('nome') ||
            val.includes('prod')
          );
        });

        if (isHeader) {
          startRow = 1;
          firstRow.forEach((cell, idx) => {
            const val = String(cell || '').toLowerCase().trim();
            if (
              val.includes('cód') ||
              val.includes('cod') ||
              val.includes('barra') ||
              val.includes('ean') ||
              val === 'codigo' ||
              val === 'code'
            ) {
              codeIdx = idx;
            } else if (
              val.includes('desc') ||
              val.includes('nome') ||
              val.includes('prod') ||
              val === 'descricao' ||
              val === 'description' ||
              val === 'name'
            ) {
              nameIdx = idx;
            }
          });
        }

        const importedProducts: Product[] = [];
        for (let i = startRow; i < data.length; i++) {
          const row = data[i];
          if (!row || row.length === 0) continue;

          const rawCode = String(row[codeIdx] ?? '').trim();
          const rawName = String(row[nameIdx] ?? '').trim();

          if (!rawCode || !rawName) continue;

          importedProducts.push({
            code: rawCode.toUpperCase(),
            name: rawName,
            category: 'Geral'
          });
        }

        if (importedProducts.length === 0) {
          onNotify('Nenhum produto válido encontrado na planilha.', 'info');
          playErrorBuzzer();
          return;
        }

        onImportProducts(importedProducts);
        playSuccessBeep();
      } catch (err) {
        console.error('Erro ao ler planilha:', err);
        onNotify('Erro ao processar arquivo da planilha.', 'info');
        playErrorBuzzer();
      } finally {
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    };

    reader.readAsBinaryString(file);
  };

  // Open password modal
  const handleOpenPasswordModal = () => {
    setCurrentPasswordInput('');
    setNewPasswordInput('');
    setConfirmPasswordInput('');
    setPasswordError(null);
    setPasswordSuccess(null);
    setShowPasswordText(false);
    setIsPasswordModalOpen(true);
  };

  // Save new admin password
  const handleSaveNewPassword = (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);

    const activeAdminPassword = settings?.adminPassword || '@Maral22';
    if (currentPasswordInput !== activeAdminPassword) {
      setPasswordError('A senha atual digitada está incorreta.');
      playErrorBuzzer();
      return;
    }

    if (!newPasswordInput.trim()) {
      setPasswordError('A nova senha não pode ser vazia.');
      playErrorBuzzer();
      return;
    }

    if (newPasswordInput.trim().length < 3) {
      setPasswordError('A nova senha deve ter no mínimo 3 caracteres.');
      playErrorBuzzer();
      return;
    }

    if (newPasswordInput !== confirmPasswordInput) {
      setPasswordError('A confirmação não coincide com a nova senha digitada.');
      playErrorBuzzer();
      return;
    }

    const updatedSettings: AppSettings = {
      ...settings,
      adminPassword: newPasswordInput.trim()
    };

    if (onUpdateSettings) {
      onUpdateSettings(updatedSettings);
    } else {
      localStorage.setItem('fast_stock_settings', JSON.stringify(updatedSettings));
    }

    playSuccessBeep();
    setPasswordSuccess('Senha alterada com sucesso!');
    onNotify('Senha do Banco de Dados alterada com sucesso!', 'success');

    setTimeout(() => {
      setIsPasswordModalOpen(false);
      setCurrentPasswordInput('');
      setNewPasswordInput('');
      setConfirmPasswordInput('');
      setPasswordSuccess(null);
      setPasswordError(null);
    }, 1200);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 space-y-6 pb-12 animate-in fade-in duration-200 font-sans">
      {/* Hidden File Input for Excel Import */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
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
                  Base de Dados — Produtos
                </h2>
                <span className="text-[10px] bg-indigo-100 text-indigo-800 font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                  Módulo Administrativo
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                Catálogo mestre com <strong>Código de Barras</strong> e <strong>Descrição</strong> consultado na entrada de mercadorias
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleOpenAddProduct}
              className="bg-indigo-600 hover:bg-indigo-500 text-white px-3.5 py-2.5 rounded-xl text-xs font-bold shadow-sm transition flex items-center gap-1.5 cursor-pointer"
              title="Cadastrar novo produto na Base de Dados"
              id="btn-add-product"
            >
              <Plus className="h-4 w-4" />
              <span>Novo Produto</span>
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="bg-slate-800 hover:bg-slate-700 text-white px-3.5 py-2.5 rounded-xl text-xs font-bold shadow-sm transition flex items-center gap-1.5 cursor-pointer"
              title="Importar planilha com Código de Barras e Descrição (.xlsx, .xls, .csv)"
              id="btn-import-database"
            >
              <Upload className="h-4 w-4" />
              <span>Importar Base</span>
            </button>

            <button
              type="button"
              onClick={handleExportExcel}
              className="bg-emerald-600 hover:bg-emerald-500 text-white px-3.5 py-2.5 rounded-xl text-xs font-bold shadow-sm transition flex items-center gap-1.5 cursor-pointer"
              title="Exportar planilha Excel (.xlsx) com Código de Barras e Descrição"
              id="btn-export-database"
            >
              <Download className="h-4 w-4" />
              <span>Exportar Base</span>
            </button>

            <button
              type="button"
              onClick={handleOpenPasswordModal}
              className="bg-amber-500 hover:bg-amber-600 text-white px-3.5 py-2.5 rounded-xl text-xs font-bold shadow-sm transition flex items-center gap-1.5 cursor-pointer"
              title="Trocar a senha de acesso administrativo ao Banco de Dados"
              id="btn-change-database-password"
            >
              <Key className="h-4 w-4" />
              <span>Trocar Senha</span>
            </button>

            <button
              type="button"
              onClick={() => setIsConfirmResetModalOpen(true)}
              className="border border-rose-200 text-rose-600 hover:bg-rose-50 px-3 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer"
              title="Apagar todos os produtos cadastrados e começar base limpa"
              id="btn-reset-database"
            >
              <Trash2 className="h-4 w-4" />
              <span>Limpar Base</span>
            </button>
          </div>
        </div>

        {/* Search Bar & Counter */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por código de barras ou descrição do produto..."
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:border-indigo-500 focus:bg-white transition-all"
              id="input-search-database"
            />
          </div>

          <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
            <span className="text-xs text-slate-500 font-medium">
              Total: <strong>{filteredProducts.length}</strong> de <strong>{products.length}</strong> produtos
            </span>
          </div>
        </div>
      </div>

      {/* Configuração das Opções de Validade (Direto no campo conforme a imagem) */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4" id="panel-config-vencimento">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              PRÉVIA EXATA DAS OPÇÕES NO FILTRO DE VALIDADE:
            </span>
            {isExpirySaved && (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200 animate-in fade-in">
                <CheckCircle2 className="h-3 w-3 text-emerald-600" /> Salvo com sucesso!
              </span>
            )}
          </div>

          {/* Seletor idêntico à imagem anexa com campos para inserção dos valores */}
          <div className="inline-flex flex-col bg-white border border-slate-300 rounded-lg shadow-xs overflow-hidden min-w-[280px]">
            {/* Opção 1: Urgentes */}
            <div className="text-xs font-medium text-slate-800 px-3 py-1.5 flex items-center justify-between gap-3 hover:bg-slate-50 transition">
              <span className="whitespace-nowrap">Urgentes (&le;</span>
              <div className="flex items-center gap-1">
                <input
                  id="input-inline-critical-expiry"
                  type="number"
                  min={1}
                  max={365}
                  value={criticalExpiryInput}
                  onChange={(e) => handleCriticalChange(Number(e.target.value))}
                  className="w-14 px-1.5 py-0.5 text-center font-bold text-xs bg-slate-50 border border-slate-300 rounded focus:border-indigo-500 focus:bg-white focus:outline-none transition"
                  title="Dias para vencimento urgente"
                />
                <span className="text-slate-600 font-normal">dias)</span>
              </div>
            </div>

            {/* Opção 2: Alerta (destacado em azul como na imagem) */}
            <div className="text-xs font-semibold text-blue-900 bg-blue-100/90 border-y border-blue-200 px-3 py-1.5 flex items-center justify-between gap-3">
              <span className="whitespace-nowrap">Alerta (&le;</span>
              <div className="flex items-center gap-1">
                <input
                  id="input-inline-warning-expiry"
                  type="number"
                  min={criticalExpiryInput + 1}
                  max={730}
                  value={warningExpiryInput}
                  onChange={(e) => handleWarningChange(Number(e.target.value))}
                  className="w-14 px-1.5 py-0.5 text-center font-bold text-xs bg-white border border-blue-400 text-blue-900 rounded focus:border-blue-600 focus:outline-none transition"
                  title="Dias para alerta (sincroniza com seguros)"
                />
                <span className="text-blue-900 font-semibold">dias)</span>
              </div>
            </div>

            {/* Opção 3: Seguros */}
            <div className="text-xs font-medium text-slate-800 px-3 py-1.5 flex items-center justify-between gap-3 hover:bg-slate-50 transition">
              <span className="whitespace-nowrap">Seguros (&gt;</span>
              <div className="flex items-center gap-1">
                <input
                  id="input-inline-safe-expiry"
                  type="number"
                  min={criticalExpiryInput + 1}
                  max={730}
                  value={safeExpiryInput}
                  onChange={(e) => handleSafeChange(Number(e.target.value))}
                  className="w-14 px-1.5 py-0.5 text-center font-bold text-xs bg-slate-50 border border-slate-300 rounded focus:border-indigo-500 focus:bg-white focus:outline-none transition"
                  title="Dias para seguros (sincroniza com alerta)"
                />
                <span className="text-slate-600 font-normal">dias)</span>
              </div>
            </div>
          </div>
        </div>

        {/* Botões à direita */}
        <div className="flex items-center gap-2 flex-wrap self-start md:self-center pt-2 md:pt-0">
          <button
            type="button"
            onClick={handleResetExpiryDefaults}
            className="px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-xl text-xs font-bold transition shadow-xs cursor-pointer"
            title="Restaurar padrão: 30d, 90d e 90d"
            id="btn-reset-expiry-defaults"
          >
            Restaurar Padrão
          </button>
          <button
            type="button"
            onClick={() => handleSaveExpiryPeriod()}
            className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-xl text-xs font-bold shadow-sm transition flex items-center gap-1.5 cursor-pointer"
            id="btn-save-all-expiry-options"
          >
            <CheckCircle2 className="h-4 w-4" />
            <span>Salvar Todas as Opções</span>
          </button>
        </div>
      </div>

      {/* Tabela da Base de Dados (Somente Código de Barra e Descrição) */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        {filteredProducts.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="p-3 bg-slate-100 text-slate-400 rounded-2xl w-fit mx-auto">
              <Barcode className="h-8 w-8" />
            </div>
            <p className="text-sm font-bold text-slate-700">Nenhum produto cadastrado na Base de Dados</p>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              Cadastre novos produtos manualmente pelo botão <strong>Novo Produto</strong> ou importe uma planilha com Código de Barras e Descrição.
            </p>
            <button
              type="button"
              onClick={handleOpenAddProduct}
              className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-sm transition inline-flex items-center gap-1.5 cursor-pointer mt-2"
            >
              <Plus className="h-4 w-4" />
              <span>Cadastrar Primeiro Produto</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[11px]">
                  <th className="py-3 px-4 w-52 sm:w-64">Código de Barras</th>
                  <th className="py-3 px-4">Descrição do Produto</th>
                  <th className="py-3 px-4 w-28 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredProducts.map((product) => (
                  <tr
                    key={product.code}
                    className="hover:bg-slate-50/60 transition-colors"
                    id={`product-row-${product.code}`}
                  >
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <Barcode className="h-4 w-4 text-indigo-500 shrink-0" />
                        <span className="font-mono font-bold text-slate-900 text-xs bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">
                          {product.code}
                        </span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-bold text-slate-800 text-sm">
                      {product.name}
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleOpenEditProduct(product)}
                          className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition cursor-pointer"
                          title="Editar código ou descrição"
                          id={`btn-edit-product-${product.code}`}
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setProductToDelete(product)}
                          className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                          title="Excluir produto da base de dados"
                          id={`btn-delete-product-${product.code}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: Novo / Editar Produto */}
      {isProductModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150"
          onClick={() => setIsProductModalOpen(false)}
        >
          <div
            className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5 text-slate-800">
                <div className="p-2.5 rounded-xl bg-indigo-50 text-indigo-600">
                  <Barcode className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900">
                    {editingProduct ? 'Editar Produto' : 'Cadastrar Novo Produto'}
                  </h3>
                  <p className="text-xs text-slate-400">
                    Base de Dados com Código de Barras e Descrição
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsProductModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {productModalError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                <span>{productModalError}</span>
              </div>
            )}

            <form onSubmit={handleSaveProduct} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Código de Barras *
                </label>
                <input
                  type="text"
                  value={productCodeInput}
                  onChange={(e) => setProductCodeInput(e.target.value)}
                  placeholder="Ex: 7891234567890"
                  required
                  autoFocus
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 bg-slate-50 focus:bg-white text-slate-800 font-mono font-bold focus:outline-none focus:border-indigo-500"
                  id="input-modal-product-code"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Descrição do Produto *
                </label>
                <input
                  type="text"
                  value={productNameInput}
                  onChange={(e) => setProductNameInput(e.target.value)}
                  placeholder="Ex: Arroz Branco Tipo 1 5kg"
                  required
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 bg-slate-50 focus:bg-white text-slate-800 font-bold focus:outline-none focus:border-indigo-500"
                  id="input-modal-product-name"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsProductModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-xl text-xs font-bold shadow-sm transition flex items-center gap-1.5 cursor-pointer"
                  id="btn-save-product-modal"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  <span>{editingProduct ? 'Salvar Alterações' : 'Cadastrar Produto'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Confirmar Exclusão de Produto Individual */}
      {productToDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150"
          onClick={() => setProductToDelete(null)}
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
                <h3 className="font-bold text-base text-slate-900">Excluir Produto da Base</h3>
                <p className="text-xs text-slate-400">Esta ação remove o produto do catálogo</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Deseja realmente excluir o produto{' '}
              <strong className="text-slate-900 font-bold">"{productToDelete.name}"</strong> (Código: <span className="font-mono font-bold">{productToDelete.code}</span>) da Base de Dados?
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setProductToDelete(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteProduct}
                className="bg-rose-600 hover:bg-rose-500 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-sm transition cursor-pointer"
                id="btn-confirm-delete-product"
              >
                Sim, Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Confirmar Limpeza da Base de Dados */}
      {isConfirmResetModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150"
          onClick={() => setIsConfirmResetModalOpen(false)}
        >
          <div
            className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 text-slate-800 border-b border-slate-100 pb-3">
              <div className="p-2.5 rounded-xl bg-rose-50 text-rose-600">
                <AlertCircle className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-bold text-base text-slate-900">Limpar Base de Dados</h3>
                <p className="text-xs text-rose-600 font-medium">Atenção: Ação irreversível</p>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-bold text-slate-800">
                Deseja excluir a base de dados mesmo?
              </p>
              <p className="text-xs text-slate-600 leading-relaxed">
                Esta ação irá apagar todos os produtos cadastrados na Base de Dados.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsConfirmResetModalOpen(false)}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition cursor-pointer"
                id="btn-cancel-reset-database"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsConfirmResetModalOpen(false);
                  onResetProducts();
                }}
                className="bg-rose-600 hover:bg-rose-500 text-white px-5 py-2.5 rounded-xl text-xs font-bold shadow-sm transition flex items-center gap-1.5 cursor-pointer"
                id="btn-confirm-reset-database"
              >
                <Trash2 className="h-4 w-4" />
                <span>Sim, Excluir Base</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Alteração de Senha do Banco de Dados */}
      {isPasswordModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150"
          onClick={() => setIsPasswordModalOpen(false)}
        >
          <div
            className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5 text-slate-800">
                <div className="p-2.5 rounded-xl bg-amber-50 text-amber-600">
                  <Lock className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900">Alterar Senha do Banco de Dados</h3>
                  <p className="text-xs text-slate-400">Defina uma nova senha para o acesso administrativo</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsPasswordModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {passwordSuccess && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs rounded-xl flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                <span>{passwordSuccess}</span>
              </div>
            )}

            {passwordError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                <span>{passwordError}</span>
              </div>
            )}

            <form onSubmit={handleSaveNewPassword} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Senha Atual *
                </label>
                <div className="relative">
                  <input
                    type={showPasswordText ? 'text' : 'password'}
                    value={currentPasswordInput}
                    onChange={(e) => setCurrentPasswordInput(e.target.value)}
                    placeholder="Digite a senha atual do administrador"
                    required
                    className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 bg-slate-50 focus:bg-white text-slate-800 focus:outline-none focus:border-indigo-500 font-medium"
                    id="input-current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasswordText(!showPasswordText)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    title={showPasswordText ? 'Ocultar senha' : 'Ver senha'}
                  >
                    {showPasswordText ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Nova Senha *
                </label>
                <input
                  type={showPasswordText ? 'text' : 'password'}
                  value={newPasswordInput}
                  onChange={(e) => setNewPasswordInput(e.target.value)}
                  placeholder="Digite a nova senha (mínimo 3 caracteres)"
                  required
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 bg-slate-50 focus:bg-white text-slate-800 focus:outline-none focus:border-indigo-500 font-medium"
                  id="input-new-password"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Confirmar Nova Senha *
                </label>
                <input
                  type={showPasswordText ? 'text' : 'password'}
                  value={confirmPasswordInput}
                  onChange={(e) => setConfirmPasswordInput(e.target.value)}
                  placeholder="Confirme a nova senha"
                  required
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 bg-slate-50 focus:bg-white text-slate-800 focus:outline-none focus:border-indigo-500 font-medium"
                  id="input-confirm-new-password"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsPasswordModalOpen(false)}
                  className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl shadow-sm transition flex items-center gap-1.5 cursor-pointer"
                  id="btn-submit-save-password"
                >
                  <ShieldCheck className="h-4 w-4" />
                  <span>Salvar Nova Senha</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
