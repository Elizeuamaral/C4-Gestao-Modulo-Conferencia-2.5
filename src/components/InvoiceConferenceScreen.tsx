import React, { useEffect, useRef, useState } from 'react';
import {
  ApiInvoice,
  ApiLocation,
  ApiProduct,
  createInvoiceFromXml,
  listInvoices,
  listLocations,
  listProducts,
  conferInvoiceItem,
} from '../services/api';

type Props = { currentUserRole: 'ADMIN' | 'CONFERENTE' };

function readText(parent: Element | null, name: string): string {
  if (!parent) return '';
  const element = Array.from(parent.children).find((child) => child.localName === name);
  return element?.textContent?.trim() || '';
}

function parseXml(fileText: string) {
  const xml = new DOMParser().parseFromString(fileText, 'application/xml');
  if (xml.querySelector('parsererror')) throw new Error('O arquivo selecionado não é um XML válido.');
  const inf = Array.from(xml.getElementsByTagName('*')).find((element) => element.localName === 'infNFe');
  if (!inf) throw new Error('O XML não contém uma NF-e (infNFe).');
  const key = (inf.getAttribute('Id') || '').replace(/^NFe/, '');
  if (!/^\d{44}$/.test(key)) throw new Error('O XML não contém uma chave de acesso de 44 dígitos.');
  const ide = Array.from(inf.children).find((element) => element.localName === 'ide') || null;
  const emit = Array.from(inf.children).find((element) => element.localName === 'emit') || null;
  const dets = Array.from(inf.children).filter((element) => element.localName === 'det');
  const units: Record<string, 'UN' | 'FD' | 'CX' | 'PCT'> = {
    UN: 'UN', UND: 'UN', UNID: 'UN', UNIDADE: 'UN',
    CX: 'CX', CXA: 'CX', CAIXA: 'CX',
    FD: 'FD', FARDO: 'FD',
    PCT: 'PCT', PC: 'PCT', PACOTE: 'PCT',
  };
  const items = dets.map((det, index) => {
    const prod = Array.from(det.children).find((element) => element.localName === 'prod') || null;
    const code = readText(prod, 'cProd');
    const rawUnit = readText(prod, 'uCom').toUpperCase();
    const unit = units[rawUnit];
    const quantity = Number(readText(prod, 'qCom'));
    if (!code) throw new Error(`Item ${index + 1}: código de produto ausente no XML.`);
    if (!unit) throw new Error(`Item ${index + 1}: unidade "${rawUnit || '?'}" não suportada. Use FD, UN, CX ou PCT.`);
    if (!Number.isFinite(quantity) || quantity < 0) throw new Error(`Item ${index + 1}: quantidade inválida.`);
    return {
      product_code: code,
      product_description: readText(prod, 'xProd') || code,
      unit,
      invoice_quantity: quantity,
      invoice_lot: null,
      invoice_expiration_date: null,
      notes: null,
    };
  });
  if (!items.length) throw new Error('A NF-e não possui itens para conferência.');
  return {
    number: readText(ide, 'nNF'),
    series: readText(ide, 'serie') || null,
    access_key: key,
    supplier: readText(emit, 'xNome') || null,
    received_date: new Date().toISOString().slice(0, 10),
    notes: 'Importada de XML local. Não houve consulta automática à SEFAZ.',
    items,
  };
}

export default function InvoiceConferenceScreen({ currentUserRole }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [invoices, setInvoices] = useState<ApiInvoice[]>([]);
  const [locations, setLocations] = useState<ApiLocation[]>([]);
  const [products, setProducts] = useState<ApiProduct[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [lots, setLots] = useState<Record<string, string>>({});
  const [expirationDates, setExpirationDates] = useState<Record<string, string>>({});
  const [noExpirationDates, setNoExpirationDates] = useState<Record<string, boolean>>({});
  const [locationId, setLocationId] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const refresh = async (preferredId?: string) => {
    const [nextInvoices, nextLocations, nextProducts] = await Promise.all([
      listInvoices(), listLocations(), listProducts(),
    ]);
    setInvoices(nextInvoices);
    setLocations(nextLocations);
    setProducts(nextProducts);
    const nextId = preferredId || selectedId || nextInvoices[0]?.id || '';
    setSelectedId(nextId);
    if (!locationId && nextLocations[0]) setLocationId(nextLocations[0].id);
  };

  useEffect(() => {
    refresh().catch((reason) => setError(reason instanceof Error ? reason.message : 'Falha ao carregar NF-e.'));
    // Initial load only; refresh is called explicitly after mutations.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = invoices.find((invoice) => invoice.id === selectedId) || null;

  const importXml = async (file?: File) => {
    if (!file) return;
    setBusy(true); setError(''); setMessage('');
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error('O XML excede o limite de 5 MB.');
      const parsed = parseXml(await file.text());
      const created = await createInvoiceFromXml(parsed);
      await refresh(created.id);
      setMessage('XML importado e registrado para conferência. A chave foi lida do arquivo; não foi feita consulta à SEFAZ.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível importar o XML.');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const confer = async (item: ApiInvoice['items'][number]) => {
    if (!selected || !locationId) { setError('Cadastre/ative um local de estoque antes de conferir.'); return; }
    const raw = quantities[item.id] ?? (item.conferred_quantity === null ? '' : String(item.conferred_quantity));
    if (raw.trim() === '') { setError('Informe a quantidade que foi contada para este produto.'); return; }
    const quantity = Number(raw);
    if (!Number.isFinite(quantity) || quantity < 0) { setError('Informe uma quantidade conferida válida.'); return; }
    const lot = (lots[item.id] ?? '').trim();
    const expirationDate = expirationDates[item.id] ?? '';
    const noExpirationDate = noExpirationDates[item.id] ?? false;
    if (!lot) { setError('Informe o lote deste produto.'); return; }
    if (!noExpirationDate && !expirationDate) { setError('Informe o vencimento deste produto ou marque que ele não possui controle de validade.'); return; }
    setBusy(true); setError(''); setMessage('');
    try {
      await conferInvoiceItem(selected.id, item.id, {
        conferred_quantity: quantity,
        location_id: locationId,
        lot,
        expiration_date: noExpirationDate ? null : expirationDate,
        no_expiration_date: noExpirationDate,
        notes: null,
      });
      await refresh(selected.id);
      setMessage('Conferência do produto registrada.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Falha ao conferir o item.');
    } finally { setBusy(false); }
  };

  const productByCode = new Map<string, ApiProduct>(products.map((product): [string, ApiProduct] => [product.code.trim().toUpperCase(), product]));

  return (
    <section className="max-w-5xl mx-auto px-4 space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-black text-slate-900">Conferência de NF-e (XML)</h2>
        <p className="mt-1 text-sm text-slate-600">Importe o XML autorizado recebido da loja/fornecedor. A quantidade informada na nota e as divergências não são exibidas ao conferente; esses dados devem ficar restritos ao relatório autorizado.</p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <input ref={fileRef} type="file" accept=".xml,text/xml,application/xml" disabled={busy} onChange={(event) => importXml(event.target.files?.[0])} className="block max-w-full text-sm" />
          <button type="button" disabled={busy} onClick={() => refresh().catch((reason) => setError(String(reason)))} className="rounded-xl border px-4 py-2 text-sm font-bold disabled:opacity-50">Atualizar notas</button>
        </div>
        {message && <p role="status" className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
        {error && <p role="alert" className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <label className="block text-sm font-bold text-slate-700">Notas registradas</label>
        <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 p-3 text-sm">
          <option value="">Selecione uma NF-e</option>
          {invoices.map((invoice) => <option key={invoice.id} value={invoice.id}>NF {invoice.number}{invoice.series ? ` · Série ${invoice.series}` : ''} · {invoice.supplier || 'Fornecedor não identificado'}</option>)}
        </select>
        {selected && <>
          <div className="mt-4 grid gap-2 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-2">
            <p><strong>Nota:</strong> {selected.number} {selected.series ? `/ Série ${selected.series}` : ''}</p>
            <p><strong>Fornecedor:</strong> {selected.supplier || 'Não identificado'}</p>
            <p className="sm:col-span-2 break-all"><strong>Chave:</strong> {selected.access_key || 'Não informada'}</p>
            <p><strong>Produtos:</strong> {selected.items.length}</p>
          </div>
          <label className="mt-4 block text-sm font-semibold">Local de estoque
            <select value={locationId} onChange={(event) => setLocationId(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 p-2.5" disabled={!locations.length}>
              <option value="">Selecione local</option>
              {locations.map((location) => <option key={location.id} value={location.id}>{location.code} — {location.name}</option>)}
            </select>
          </label>
          <div className="mt-4 space-y-3">
            {selected.items.map((item) => {
              const product = productByCode.get(item.product_code.trim().toUpperCase());
              const alreadyConferred = item.status !== 'PENDENTE';
              const noExpirationDate = noExpirationDates[item.id] ?? false;
              return <article key={item.id} className="rounded-xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div><p className="font-bold text-slate-900">{item.product_description || item.product_code}</p><p className="text-xs text-slate-500">Código: {item.product_code} · Unidade {item.unit}</p><p className="text-xs">{product ? `Produto cadastrado: ${product.name}` : 'Produto ainda não localizado na base pelo código.'}</p></div>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="text-sm font-semibold">Quantidade contada
                    <input type="text" inputMode="numeric" pattern="[0-9]*" maxLength={10} value={quantities[item.id] ?? (item.conferred_quantity === null ? '' : String(item.conferred_quantity))} onChange={(event) => { const value = event.target.value.replace(/\D/g, '').slice(0, 10); setQuantities((previous) => ({ ...previous, [item.id]: value })); }} disabled={busy || alreadyConferred} className="mt-1 w-[10ch] max-w-full rounded-lg border border-slate-300 p-2" placeholder="0" aria-label="Quantidade inteira, até 10 dígitos" />
                  </label>
                  <label className="text-sm font-semibold">Lote
                    <input value={lots[item.id] ?? ''} onChange={(event) => setLots((previous) => ({ ...previous, [item.id]: event.target.value }))} disabled={busy || alreadyConferred} className="mt-1 w-full rounded-lg border border-slate-300 p-2" placeholder="Informe o lote deste produto" />
                  </label>
                  <div className="space-y-2">
                    <label className="block text-sm font-semibold">Vencimento
                      <input type="date" value={expirationDates[item.id] ?? ''} onChange={(event) => setExpirationDates((previous) => ({ ...previous, [item.id]: event.target.value }))} disabled={busy || alreadyConferred || noExpirationDate} className="mt-1 block w-full rounded-lg border border-slate-300 p-2" />
                    </label>
                    <label className="flex items-center gap-2 text-sm font-normal"><input type="checkbox" checked={noExpirationDate} onChange={(event) => setNoExpirationDates((previous) => ({ ...previous, [item.id]: event.target.checked }))} disabled={busy || alreadyConferred} /> Produto não tem vencimento</label>
                  </div>
                </div>
                <div className="mt-3">
                  <button type="button" disabled={busy || alreadyConferred || !product} onClick={() => confer(item)} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">{alreadyConferred ? 'Conferência registrada' : 'Registrar conferência do produto'}</button>
                </div>
              </article>;
            })}
          </div>
        </>}
      </div>
      <p className="text-xs text-slate-500">Acesso atual: {currentUserRole}. Quantidade da NF-e, divergência e saldo de estoque não são mostrados nesta tela de conferência.</p>
    </section>
  );
}
