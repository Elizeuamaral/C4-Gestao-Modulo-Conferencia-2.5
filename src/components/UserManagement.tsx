import React, { useEffect, useState } from 'react';
import { ApiUser, changeOwnPassword, clearAuthToken, createUser, listUsers, resetUserPassword, setUserActive, updateUser } from '../services/api';
import { KeyRound, Pencil, Plus, RefreshCw, ShieldCheck, UserRound, UserX } from 'lucide-react';

interface Props { currentUser: ApiUser; onNotify: (message: string, type: 'success' | 'info') => void; }

export default function UserManagement({ currentUser, onNotify }: Props) {
  const [users, setUsers] = useState<ApiUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<ApiUser | null>(null);
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'ADMIN' | 'CONFERENTE'>('CONFERENTE');
  const [saving, setSaving] = useState(false);
  const [passwordUser, setPasswordUser] = useState<ApiUser | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [ownPasswordOpen, setOwnPasswordOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [ownNewPassword, setOwnNewPassword] = useState('');

  const reload = async () => {
    setLoading(true); setError('');
    try { setUsers(await listUsers(true)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Falha ao carregar usuários.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void reload(); }, []);

  const resetForm = () => { setEditing(null); setFullName(''); setUsername(''); setPassword(''); setRole('CONFERENTE'); };
  const startEdit = (user: ApiUser) => { setEditing(user); setFullName(user.full_name); setUsername(user.username); setRole(user.role); setPassword(''); };
  const saveUser = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true); setError('');
    try {
      if (editing) await updateUser(editing.id, { full_name: fullName.trim(), role });
      else await createUser({ full_name: fullName.trim(), username: username.trim(), password, role });
      await reload(); resetForm(); onNotify(editing ? 'Usuário atualizado.' : 'Usuário criado.', 'success');
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível salvar o usuário.'); }
    finally { setSaving(false); }
  };
  const saveResetPassword = async (event: React.FormEvent) => {
    event.preventDefault(); if (!passwordUser) return;
    try { await resetUserPassword(passwordUser.id, newPassword); setPasswordUser(null); setNewPassword(''); onNotify('Senha redefinida. A pessoa deverá entrar novamente.', 'success'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível redefinir a senha.'); }
  };
  const toggleActive = async (user: ApiUser) => {
    try { await setUserActive(user.id, !user.active); await reload(); onNotify(user.active ? 'Usuário inativado.' : 'Usuário reativado.', 'success'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível alterar o usuário.'); }
  };
  const saveOwnPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    try { await changeOwnPassword(currentPassword, ownNewPassword); clearAuthToken(); window.location.reload(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível alterar a senha.'); }
  };

  return <section className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200 shadow-sm space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-black text-slate-800 flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-indigo-600"/>Usuários e acesso</h2><p className="text-sm text-slate-500 mt-1">Gerencie contas, perfis, senhas e acesso ao C4 Gestão.</p></div><button type="button" onClick={()=>setOwnPasswordOpen(v=>!v)} className="rounded-xl border px-3 py-2 text-sm font-semibold flex items-center gap-2"><KeyRound className="h-4 w-4"/>Trocar minha senha</button></div>
    {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
    {ownPasswordOpen && <form onSubmit={saveOwnPassword} className="grid gap-3 sm:grid-cols-3 rounded-xl bg-slate-50 p-4"><input required type="password" minLength={8} placeholder="Senha atual" value={currentPassword} onChange={e=>setCurrentPassword(e.target.value)} className="rounded-lg border p-2 text-sm"/><input required type="password" minLength={8} placeholder="Nova senha (mín. 8)" value={ownNewPassword} onChange={e=>setOwnNewPassword(e.target.value)} className="rounded-lg border p-2 text-sm"/><button className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-bold text-white">Atualizar senha</button></form>}
    <form onSubmit={saveUser} className="grid gap-3 rounded-xl border border-slate-200 p-4 sm:grid-cols-2">
      <h3 className="sm:col-span-2 font-bold text-slate-700">{editing ? 'Editar usuário' : 'Criar usuário'}</h3>
      <input required minLength={2} maxLength={150} placeholder="Nome completo" value={fullName} onChange={e=>setFullName(e.target.value)} className="rounded-lg border p-2.5 text-sm"/>
      <input required={!editing} disabled={!!editing} minLength={3} maxLength={80} placeholder="Nome de usuário (login)" value={username} onChange={e=>setUsername(e.target.value)} className="rounded-lg border p-2.5 text-sm disabled:bg-slate-100"/>
      {!editing && <input required type="password" minLength={8} maxLength={128} placeholder="Senha inicial (mínimo 8)" value={password} onChange={e=>setPassword(e.target.value)} className="rounded-lg border p-2.5 text-sm"/>}
      <select value={role} onChange={e=>setRole(e.target.value as 'ADMIN'|'CONFERENTE')} className="rounded-lg border p-2.5 text-sm"><option value="CONFERENTE">Conferente</option><option value="ADMIN">Administrador</option></select>
      <div className="sm:col-span-2 flex gap-2"><button disabled={saving} className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"><Plus className="inline h-4 w-4 mr-1"/>{saving?'Salvando...':editing?'Salvar alterações':'Criar usuário'}</button>{editing && <button type="button" onClick={resetForm} className="rounded-lg border px-4 py-2.5 text-sm font-semibold">Cancelar</button>}</div>
    </form>
    <div className="space-y-2"><div className="flex items-center justify-between"><h3 className="font-bold text-slate-700">Usuários cadastrados</h3><button type="button" onClick={()=>void reload()} className="text-sm font-semibold text-indigo-600"><RefreshCw className="inline h-3.5 w-3.5 mr-1"/>Atualizar</button></div>
      {loading ? <p className="text-sm text-slate-500">Carregando usuários...</p> : users.length===0 ? <p className="text-sm text-slate-500">Nenhum usuário ativo.</p> : users.map(user=><div key={user.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-slate-100 p-3"><div className="min-w-0"><p className="font-bold text-slate-800">{user.full_name} {user.id===currentUser.id && <span className="text-xs text-indigo-600">(você)</span>}</p><p className="text-xs text-slate-500">@{user.username} · {user.role==='ADMIN'?'Administrador':'Conferente'} · {user.active?'Ativo':'Inativo'}</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={()=>startEdit(user)} className="rounded-lg border px-2.5 py-2 text-xs font-semibold"><Pencil className="inline h-3.5 w-3.5 mr-1"/>Editar</button><button type="button" onClick={()=>{setPasswordUser(user);setNewPassword('');}} className="rounded-lg border px-2.5 py-2 text-xs font-semibold"><KeyRound className="inline h-3.5 w-3.5 mr-1"/>Redefinir senha</button><button type="button" disabled={user.id===currentUser.id} onClick={()=>void toggleActive(user)} className="rounded-lg border border-rose-200 px-2.5 py-2 text-xs font-semibold text-rose-700 disabled:opacity-40"><UserX className="inline h-3.5 w-3.5 mr-1"/>{user.active?'Inativar':'Reativar'}</button></div></div>)}
    </div>
    {passwordUser && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"><form onSubmit={saveResetPassword} className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-5 shadow-2xl"><h3 className="font-bold text-slate-800">Redefinir senha — {passwordUser.full_name}</h3><input required autoFocus type="password" minLength={8} maxLength={128} placeholder="Nova senha (mínimo 8)" value={newPassword} onChange={e=>setNewPassword(e.target.value)} className="w-full rounded-lg border p-3 text-sm"/><div className="flex gap-2"><button className="flex-1 rounded-lg bg-indigo-600 p-2.5 text-sm font-bold text-white">Salvar senha</button><button type="button" onClick={()=>setPasswordUser(null)} className="rounded-lg border px-3 text-sm">Cancelar</button></div></form></div>}
  </section>;
}
