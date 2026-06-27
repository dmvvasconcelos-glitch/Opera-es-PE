/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { UserSession } from '../types';
import { DEFAULT_USERS, saveSession } from '../auth-sim';
import { collection, doc, getDocs, getDoc, setDoc, writeBatch } from 'firebase/firestore';
import { db, cleanUndefined } from '../firebase';
import { 
  Lock, 
  Mail, 
  User, 
  ShieldAlert, 
  ArrowRight, 
  KeyRound, 
  BookOpen, 
  Eye, 
  EyeOff, 
  Settings, 
  Database,
  Chrome
} from 'lucide-react';

interface AuthWindowProps {
  onLoginSuccess: (session: UserSession) => void;
  initialMessage?: string;
}

export default function AuthWindow({ onLoginSuccess, initialMessage }: AuthWindowProps) {
  const [isLoginView, setIsLoginView] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [selectedRole, setSelectedRole] = useState<'admin' | 'editor' | 'cliente' | 'parceiro' | 'analista'>('admin');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pendingSessionUser, setPendingSessionUser] = useState<any>(null);
  const [infoMessage, setInfoMessage] = useState(initialMessage || '');

  useEffect(() => {
    if (initialMessage) {
      setInfoMessage(initialMessage);
    }
  }, [initialMessage]);

  // Synchronize systemUsers initialization if not done yet
  useEffect(() => {
    const checkAndSeedUsers = async () => {
      try {
        const q = collection(db, 'systemUsers');
        const snapshot = await getDocs(q);
        if (snapshot.empty) {
          let isAlreadySeededDB = false;
          try {
            const seedMetaDoc = await getDoc(doc(db, 'test', 'seeding_metadata'));
            if (seedMetaDoc.exists() && seedMetaDoc.data()?.systemUsers === true) {
              isAlreadySeededDB = true;
            }
          } catch (smErr) {
            console.warn("Could not check remote seeding metadata in AuthWindow:", smErr);
          }

          if (isAlreadySeededDB || localStorage.getItem('system_users_seeded') === 'true') {
            console.log("Database cleared of system users, skipping auto-seed.");
            localStorage.setItem('system_users_seeded', 'true');
            return;
          }
          console.log("Seeding systemUsers inside AuthWindow...");
          const batch = writeBatch(db);
          DEFAULT_USERS.forEach((usr) => {
            const docId = usr.email.toLowerCase().trim();
            batch.set(doc(db, 'systemUsers', docId), {
              ...usr,
              status: 'Ativo',
              secretarias: (usr as any).secretarias || []
            });
          });

          // Save seeding indication to DB as well
          const seedMetaRef = doc(db, 'test', 'seeding_metadata');
          batch.set(seedMetaRef, { systemUsers: true }, { merge: true });

          await batch.commit();
          localStorage.setItem('system_users_seeded', 'true');
        } else {
          localStorage.setItem('system_users_seeded', 'true');
        }
      } catch (err) {
        console.error("Error checking or seeding users in AuthWindow:", err);
      }
    };
    checkAndSeedUsers();
  }, []);

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setInfoMessage('');

    if (!email.trim() || !password.trim()) {
      setError('Por favor, preencha todos os campos obrigatórios.');
      return;
    }

    setLoading(true);
    const docId = email.trim().toLowerCase();

    try {
      if (isLoginView) {
        // Real-time Firestore authenticated user match
        const userDocRef = doc(db, 'systemUsers', docId);
        const userDoc = await getDoc(userDocRef);

        if (!userDoc.exists()) {
          setError('E-mail não cadastrado no portal. Utilize as credenciais de demonstração ou efetue um pré-cadastro.');
          setLoading(false);
          return;
        }

        const matched = userDoc.data();

        if (matched.password !== password) {
          setError('Senha incorreta. Por favor, tente novamente.');
          setLoading(false);
          return;
        }

        if (matched.status === 'Pendente') {
          setError('Solicitação de acesso pendente de aprovação por um Administrador do sistema.');
          setLoading(false);
          return;
        }

        // Robust check: Ensure any non-demo account is forced to change password on first access
        const isDemoAccount = ['admin@portal.com', 'editor@portal.com', 'cliente@portal.com'].includes(matched.email.toLowerCase().trim());
        const needsFirstAccessChange = !isDemoAccount && (matched.isFirstAccess !== false);

        if (needsFirstAccessChange) {
          setPendingSessionUser({
            docId,
            email: matched.email,
            displayName: matched.displayName,
            role: matched.role || 'cliente',
            secretarias: matched.secretarias || [],
            parceiroId: matched.parceiroId || undefined,
            parceiroNome: matched.parceiroNome || undefined
          });
          setIsChangingPassword(true);
          setPassword('');
          setLoading(false);
          return;
        }

        // Save last login timestamp in Firestore
        const nowStr = new Date().toLocaleString('pt-BR');
        try {
          await setDoc(doc(db, 'systemUsers', docId), cleanUndefined({
            ...matched,
            lastLogin: nowStr
          }));
        } catch (dbErr) {
          console.warn("Failed to update lastLogin column in Firestore:", dbErr);
        }

        // Save and callback
        const session: UserSession = {
          uid: `USR-${Math.floor(Math.random() * 100000)}`,
          email: matched.email,
          displayName: matched.displayName,
          isSimulated: true,
          role: matched.role || 'cliente',
          secretarias: matched.secretarias || [],
          parceiroId: matched.parceiroId || undefined,
          parceiroNome: matched.parceiroNome || undefined
        };
        
        saveSession(session);
        onLoginSuccess(session);
      } else {
        // Registration with Firestore persistence
        if (!displayName.trim()) {
          setError('Por favor, informe seu nome corporativo completo.');
          setLoading(false);
          return;
        }

        const userDocRef = doc(db, 'systemUsers', docId);
        const userDoc = await getDoc(userDocRef);

        if (userDoc.exists()) {
          setError('Este e-mail já está cadastrado no sistema.');
          setLoading(false);
          return;
        }

        const newUser = {
          email: email.trim().toLowerCase(),
          password,
          displayName: displayName.trim(),
          role: selectedRole,
          status: 'Pendente', // Pending approval by admin so they can test status toggling
          secretarias: [],
          isFirstAccess: true
        };

        await setDoc(userDocRef, cleanUndefined(newUser));
        setSuccess('Cadastro realizado no Portal de Telecom com sucesso! Sua solicitação está pendente de liberação. Redirecionando...');
        
        setTimeout(() => {
          setIsLoginView(true);
          setPassword('');
          setSuccess('');
        }, 2500);
      }
    } catch (err: any) {
      console.error(err);
      setError('Ocorreu um erro ao conectar com o banco de dados. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordChangeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!newPassword.trim() || !confirmPassword.trim()) {
      setError('Por favor, preencha todos os campos.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('As senhas informadas não coincidem.');
      return;
    }

    // Require min 8 chars, letters, numbers, and at least one special char
    if (newPassword.length < 8) {
      setError('A senha deve conter no mínimo 8 caracteres.');
      return;
    }
    if (!/[a-zA-Z]/.test(newPassword)) {
      setError('A senha deve conter pelo menos uma letra.');
      return;
    }
    if (!/[0-9]/.test(newPassword)) {
      setError('A senha deve conter pelo menos um número.');
      return;
    }
    if (!/[!@#$%^&*(),.?":{}|<>_+\-\[\]\\\/~`';]/.test(newPassword)) {
      setError('A senha deve conter pelo menos um caractere especial (ex: !, @, #, $, %, etc.).');
      return;
    }

    if (!pendingSessionUser) {
      setError('Sessão inválida. Por favor, reinicie seu processo de autenticação.');
      setIsChangingPassword(false);
      return;
    }

    setLoading(true);

    try {
      const userDocRef = doc(db, 'systemUsers', pendingSessionUser.docId);
      
      const userDoc = await getDoc(userDocRef);
      if (!userDoc.exists()) {
        setError('Usuário correspondente não foi localizado.');
        setLoading(false);
        return;
      }
      
      const currentData = userDoc.data();
      const updatedUser = {
        ...currentData,
        password: newPassword,
        isFirstAccess: false,
        lastLogin: new Date().toLocaleString('pt-BR')
      };

      await setDoc(userDocRef, cleanUndefined(updatedUser));

      setSuccess('Senha atualizada com sucesso! Inicializando sua sessão no painel...');

      const session: UserSession = {
        uid: `USR-${Math.floor(Math.random() * 100000)}`,
        email: pendingSessionUser.email,
        displayName: pendingSessionUser.displayName,
        isSimulated: true,
        role: pendingSessionUser.role,
        secretarias: pendingSessionUser.secretarias,
        parceiroId: pendingSessionUser.parceiroId,
        parceiroNome: pendingSessionUser.parceiroNome
      };

      setTimeout(() => {
        saveSession(session);
        onLoginSuccess(session);
      }, 1500);

    } catch (err: any) {
      console.error(err);
      setError('Erro de persistência de dados. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#061213] via-[#0b2324] to-[#123c3d] flex flex-col items-center justify-center p-4 font-sans">
      
      {/* Container holding form and logo details */}
      <div className="w-full max-w-4xl bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-zinc-150 dark:border-zinc-800 flex flex-col md:flex-row overflow-hidden">
        {/* Left pane: Portal logo and layout */}
        <div className="md:w-5/12 bg-[#071d1e] p-8 flex flex-col justify-between items-center text-center text-white relative min-h-[300px] md:min-h-[420px]">
          
          {/* Faded grid effect background */}
          <div className="absolute inset-0 bg-radial-gradient from-brand/10 to-transparent pointer-events-none opacity-45"></div>
          
          {/* Top portion: Acesso Restrito */}
          <div className="relative z-10 mt-2">
            <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-brand/20 border border-brand/30 rounded-full text-[10px] font-bold uppercase tracking-widest text-brand-light animate-pulse">
              <KeyRound className="h-3.5 w-3.5" />
              <span>Acesso Restrito</span>
            </div>
          </div>
 
          {/* Center portion: Big centered logo */}
          <div className="relative z-10 flex-1 flex items-center justify-center my-6">
            <img 
              src="https://chamados.metodotelecom.com.br/public/img/lg1.png" 
              alt="Método Telecom Logo" 
              className="h-16 w-auto object-contain select-none transition-transform duration-300 hover:scale-105 filter drop-shadow-[0_6px_16px_rgba(43,138,139,0.4)]"
              referrerPolicy="no-referrer"
            />
          </div>

          {/* Bottom spacer to maintain symmetry */}
          <div className="relative z-10 w-full h-2"></div>
        </div>
 
        {/* Right pane: Auth Form */}
        <div className="flex-1 p-8 md:p-12 space-y-6 bg-white dark:bg-zinc-900/95">

          {isChangingPassword ? (
            <div className="space-y-6">
              <div>
                <h3 className="font-extrabold text-[#0e3a3c] dark:text-zinc-50 text-lg tracking-tight uppercase font-display">
                  Primeiro Acesso - Alterar Senha
                </h3>
                <p className="text-xs text-zinc-400 mt-1 font-sans">
                  Por razões de segurança, é obrigatório redefinir sua senha inicial no primeiro acesso.
                </p>
              </div>

              <form onSubmit={handlePasswordChangeSubmit} className="space-y-4">
                {error && (
                  <div className="p-3 bg-rose-50 dark:bg-rose-950/20 text-xs text-rose-600 dark:text-rose-400 rounded-xl flex items-center gap-2.5 border border-rose-100 dark:border-rose-900/30 font-sans">
                    <ShieldAlert className="h-4 w-4 text-rose-500 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                {success && (
                  <div className="p-3 bg-teal-50 dark:bg-teal-950/20 border border-teal-500/20 text-xs text-teal-600 dark:text-teal-400 rounded-xl font-medium font-sans animate-pulse">
                    {success}
                  </div>
                )}

                <div className="bg-zinc-50 dark:bg-zinc-950 p-4 rounded-xl border border-zinc-150 dark:border-zinc-850/80 space-y-2 text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed font-sans">
                  <span className="font-bold text-zinc-800 dark:text-zinc-200 block uppercase tracking-wider font-mono text-[10px]">
                    Requisitos mínimos da nova senha:
                  </span>
                  <ul className="list-disc pl-4 space-y-1">
                    <li>Ao menos <strong>8 caracteres</strong> de comprimento</li>
                    <li>Presença de <strong>letras</strong> e de <strong>números</strong></li>
                    <li>Ao menos um <strong>caractere especial</strong> (ex: <code className="font-mono bg-zinc-200 dark:bg-zinc-850 px-1 py-0.5 rounded text-zinc-850 dark:text-zinc-150">! @ # $ % &amp; * _ -</code>)</li>
                  </ul>
                </div>

                <div className="space-y-1">
                  <label className="block text-[11px] font-semibold text-zinc-400 uppercase tracking-wider font-mono">
                    Nova Senha
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-zinc-400">
                      <Lock className="h-4 w-4" />
                    </span>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Nova senha..."
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                      className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-150 dark:border-zinc-850 rounded-xl py-2 pl-9 pr-10 text-xs text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-brand focus:border-brand dark:focus:ring-brand"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-zinc-400 hover:text-zinc-650"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="block text-[11px] font-semibold text-zinc-400 uppercase tracking-wider font-mono">
                    Confirmar Nova Senha
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-zinc-400">
                      <KeyRound className="h-4 w-4" />
                    </span>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Confirmar nova senha..."
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-150 dark:border-zinc-850 rounded-xl py-2 pl-9 pr-10 text-xs text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-brand focus:border-brand dark:focus:ring-brand"
                    />
                  </div>
                </div>

                <div className="flex gap-2.5 pt-2 font-sans">
                  <button
                    type="button"
                    onClick={() => {
                      setIsChangingPassword(false);
                      setNewPassword('');
                      setConfirmPassword('');
                      setPendingSessionUser(null);
                      setError('');
                    }}
                    className="flex-1 py-1.5 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-750 text-zinc-700 dark:text-zinc-250 rounded-xl text-xs font-bold transition-all text-center cursor-pointer"
                  >
                    Voltar
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-2 bg-[#2b8a8b] hover:opacity-90 disabled:opacity-50 text-white text-xs font-bold py-2 rounded-xl flex items-center justify-center gap-1.5 shadow-md shadow-brand/10 transition-all cursor-pointer font-sans"
                  >
                    <span>{loading ? 'Processando...' : 'Salvar Senha'}</span>
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <>
              <div className="flex justify-between items-center pb-2">
                <div>
                  <h3 className="font-extrabold text-lg text-brand-deep dark:text-zinc-50 tracking-tight uppercase font-display">
                    OPERAÇÃO PE
                  </h3>
                  <p className="text-xs text-zinc-400">
                    Informe credenciais autorizadas.
                  </p>
                </div>
              </div>
     
              {/* Form container */}
              <form onSubmit={handleAuthSubmit} className="space-y-4">
                
                {infoMessage && (
                  <div className="p-3 bg-amber-50 dark:bg-amber-950/20 text-xs text-amber-700 dark:text-amber-400 rounded-xl flex items-start gap-2.5 border border-amber-250 dark:border-amber-900/40">
                    <ShieldAlert className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                    <div className="flex-1 text-left leading-relaxed">
                      <span>{infoMessage}</span>
                    </div>
                  </div>
                )}

                {error && (
                  <div className="p-3 bg-rose-50 dark:bg-rose-950/20 text-xs text-rose-600 dark:text-rose-400 rounded-xl flex items-center gap-2.5 border border-rose-100 dark:border-rose-900/30">
                    <ShieldAlert className="h-4 w-4 text-rose-500" />
                    <span>{error}</span>
                  </div>
                )}
     
                {success && (
                  <div className="p-3 bg-zinc-50 dark:bg-zinc-950 border border-brand/30 text-xs text-brand rounded-xl font-medium">
                    {success}
                  </div>
                )}
     
                {!isLoginView && (
                  <div className="space-y-1">
                    <label className="block text-[11px] font-semibold text-zinc-400 uppercase tracking-wider font-mono">
                      Nome Completo / Órgão Responsável
                    </label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-zinc-400">
                        <User className="h-4 w-4" />
                      </span>
                      <input
                        type="text"
                        placeholder="ex: Dr. Carlos Oliveira (SEDUC)"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        required
                        className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl py-2 pl-9 pr-4 text-xs text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-brand focus:border-brand dark:focus:ring-brand"
                      />
                    </div>
                  </div>
                )}
     
                <div className="space-y-1">
                  <label className="block text-[11px] font-semibold text-zinc-400 uppercase tracking-wider font-mono">
                    E-mail
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-zinc-400">
                      <Mail className="h-4 w-4" />
                    </span>
                    <input
                      type="email"
                      placeholder="Seu email institucional..."
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-150 dark:border-zinc-850 rounded-xl py-2 pl-9 pr-4 text-xs text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-brand focus:border-brand dark:focus:ring-brand"
                    />
                  </div>
                </div>
     
                <div className="space-y-1">
                  <label className="block text-[11px] font-semibold text-zinc-400 uppercase tracking-wider font-mono">
                    Senha
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-zinc-400">
                      <Lock className="h-4 w-4" />
                    </span>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Informe sua senha..."
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-150 dark:border-zinc-850 rounded-xl py-2 pl-9 pr-10 text-xs text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-brand focus:border-brand dark:focus:ring-brand"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-zinc-400 hover:text-zinc-650"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
     
                {!isLoginView && (
                  <div className="space-y-1">
                    <label className="block text-[11px] font-semibold text-zinc-400 uppercase tracking-wider font-mono">
                      Nível de Acesso (Desejado)
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {[
                        { key: 'admin', label: 'Gestor (Admin)' },
                        { key: 'editor', label: 'Cadastro' },
                        { key: 'cliente', label: 'Cliente (Restrito)' },
                        { key: 'parceiro', label: 'Parceiro' },
                        { key: 'analista', label: 'Analista' },
                      ].map(lvl => (
                        <button
                          key={lvl.key}
                          type="button"
                          onClick={() => setSelectedRole(lvl.key as any)}
                          className={`py-1.5 px-2 rounded-lg text-center text-[10px] font-bold border transition-all cursor-pointer ${
                            selectedRole === lvl.key 
                              ? 'bg-brand border-brand text-white' 
                              : 'bg-zinc-50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900'
                          }`}
                        >
                          {lvl.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
     
                <button
                  type="submit"
                  className="w-full bg-brand hover:opacity-90 text-white text-xs font-bold py-2.5 rounded-xl flex items-center justify-center gap-1.5 shadow-md shadow-brand/10 transition-all mt-4 cursor-pointer"
                >
                  <span>{isLoginView ? 'Autenticar Acesso' : 'Efetuar pré-cadastro'}</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              </form>
            </>
          )}

        </div>
 
      </div>
 
    </div>
  );
}
