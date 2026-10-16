import React, { useEffect, useState } from 'react';
import { KeyRound, LogIn, ShieldCheck, UserRound } from 'lucide-react';
import { ApiUser, getSetupStatus, loginUser, setupInitialAdmin } from '../services/api';

interface LoginScreenProps {
  onAuthenticated: (token: string, user: ApiUser) => void;
}

export default function LoginScreen({ onAuthenticated }: LoginScreenProps) {
  const [setupRequired, setSetupRequired] = useState(false);
  const [checkingSetup, setCheckingSetup] = useState(true);
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [setupCheckFailed, setSetupCheckFailed] = useState(false);

  const checkSetup = () => {
    setCheckingSetup(true);
    setSetupCheckFailed(false);
    setError('');
    getSetupStatus()
      .then((result) => setSetupRequired(result.setup_required))
      .catch((reason) => {
        setSetupCheckFailed(true);
        setError(reason instanceof Error ? reason.message : 'Não foi possível conectar à API.');
      })
      .finally(() => setCheckingSetup(false));
  };

  useEffect(() => { checkSetup(); }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const result = setupRequired
        ? await setupInitialAdmin({ full_name: fullName, username, password })
        : await loginUser(username, password);
      localStorage.setItem('c4_auth_token', result.access_token);
      onAuthenticated(result.access_token, result.user);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível entrar no sistema.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <section className="w-full max-w-md bg-white rounded-3xl p-6 sm:p-8 shadow-2xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="rounded-2xl bg-emerald-600 p-3 text-white"><ShieldCheck className="h-7 w-7" /></div>
          <div><h1 className="text-xl font-black text-slate-900">C4 Gestão</h1><p className="text-sm text-slate-500">Módulo Conferência 2.5</p></div>
        </div>
        {checkingSetup ? <p className="text-sm text-slate-600">Verificando configuração inicial...</p> : setupCheckFailed ? (
          <div className="space-y-4">
            <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>
            <button type="button" onClick={checkSetup} className="w-full rounded-xl bg-indigo-600 px-4 py-3 font-bold text-white hover:bg-indigo-500">Tentar novamente</button>
          </div>
        ) : (
          <>
            <h2 className="text-lg font-bold text-slate-800">{setupRequired ? 'Configurar administrador' : 'Entrar no sistema'}</h2>
            <p className="text-sm text-slate-500 mt-1 mb-5">{setupRequired ? 'Crie a primeira conta administrativa. Esta tela aparecerá apenas enquanto não houver usuários cadastrados.' : 'Informe seu usuário e senha para continuar.'}</p>
            <form onSubmit={submit} className="space-y-4">
              {setupRequired && <label className="block text-sm font-semibold text-slate-700">Nome completo<input required minLength={2} maxLength={150} value={fullName} onChange={e=>setFullName(e.target.value)} autoComplete="name" className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-3 font-normal outline-none focus:border-indigo-500" /></label>}
              <label className="block text-sm font-semibold text-slate-700">Usuário<input required minLength={3} maxLength={80} value={username} onChange={e=>setUsername(e.target.value)} autoComplete="username" className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-3 font-normal outline-none focus:border-indigo-500" /></label>
              <label className="block text-sm font-semibold text-slate-700">Senha<input required minLength={8} maxLength={128} type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete={setupRequired ? 'new-password' : 'current-password'} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-3 font-normal outline-none focus:border-indigo-500" /><span className="block mt-1 text-xs font-normal text-slate-500">Mínimo de 8 caracteres.</span></label>
              {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
              <button disabled={submitting} className="w-full flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 font-bold text-white hover:bg-indigo-500 disabled:opacity-60">{setupRequired ? <UserRound className="h-4 w-4"/> : <LogIn className="h-4 w-4"/>}{submitting ? 'Aguarde...' : setupRequired ? 'Criar administrador' : 'Entrar'}</button>
            </form>
          </>
        )}
      </section>
    </main>
  );
}
