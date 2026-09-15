export const STOCK_TEMPLATE_HEADERS = [
  'Codigo de barra',
  'Descricao',
  'Lote',
  'Fabricacao',
  'Vencimento',
  'Endereco',
  'Quantidade',
  'Un. Medida',
] as const;

export const DATABASE_EXPORT_HEADERS = [
  'Codigo de barra',
  'Descricao',
  'Quantidade',
  'Unidade',
  'Lote',
  'Fabricacao',
  'Vencimento',
  'Endereco',
  'Fornecedor',
  'Nota Fiscal',
  'Conferente',
  'Data de Entrada',
  'Metodo de Entrada',
  'Data de alteração',
  'Conferente',
  'Motivo'
] as const;

export const formatDateDisplay = (dateString?: string, noExpirationDate?: boolean): string => {
  if (noExpirationDate) return 'Sem validade';
  if (!dateString || dateString === 'N/A') return '';
  if (dateString.includes('/')) return dateString;
  try {
    if (dateString.includes('-')) {
      const parts = dateString.split('T')[0].split('-');
      if (parts.length === 3 && parts[0].length === 4) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
    }
    const d = new Date(dateString);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString('pt-BR');
    }
    return dateString;
  } catch {
    return dateString;
  }
};

export const MOVEMENT_EXPORT_HEADERS = [
  ...STOCK_TEMPLATE_HEADERS,
] as const;

export const STOCK_TEMPLATE_ALIASES: Record<(typeof STOCK_TEMPLATE_HEADERS)[number], string[]> = {
  'Codigo de barra': ['Codigo de barra', 'Codigo de barras', 'Codigo', 'Cod_Barras', 'EAN', 'Barcode'],
  Descricao: ['Descricao', 'Descricao Produto', 'Produto', 'Nome', 'Nome Produto'],
  Lote: ['Lote'],
  Fabricacao: ['Fabricacao', 'Data Fabricacao'],
  Vencimento: ['Vencimento', 'Validade', 'Data Validade'],
  Endereco: ['Endereco', 'Local', 'Localizacao'],
  Quantidade: ['Quantidade', 'Qtd', 'Estoque', 'Saldo'],
  'Un. Medida': ['Un. Medida', 'Unidade', 'Un', 'UM'],
};
