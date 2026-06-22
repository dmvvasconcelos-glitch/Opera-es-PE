/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { DEFAULT_USERS, getStoredSession } from '../auth-sim';
import { db } from '../firebase';
import { collection, doc, onSnapshot, setDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import { 
  Users, 
  UserPlus, 
  ShieldCheck, 
  Trash2, 
  CheckCircle, 
  Clock, 
  AlertCircle, 
  User, 
  Mail, 
  KeyRound, 
  UserCheck, 
  Shield,
  Search,
  Check,
  X,
  Building2,
  Settings
} from 'lucide-react';

interface UserItem {
  email: string;
  password?: string;
  displayName: string;
  role: 'admin' | 'editor' | 'viewer' | 'cliente';
  status?: 'Ativo' | 'Pendente';
  secretarias?: string[];
  isFirstAccess?: boolean;
}

const AVAILABLE_SECRETARIAS = [
  'SEDUC - Secretaria de Educação',
  'SESAU - Secretaria de Saúde',
  'SSP - Secretaria de Segurança Pública',
  'SEFAZ - Secretaria da Fazenda',
  'SEPLAN - Secretaria de Planejamento',
  'SECULT - Secretaria de Cultura',
  'SEAD - Sec de Administração',
  'C.CIVIL - Casa Civil',
  'PGE - Procuradoria Geral',
  'SEMA - Secretaria de Meio Ambiente',
  'SEEL - Secretaria de Esportes',
  'SETUR - Secretaria de Turismo'
];

export default function UserManagement() {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Create User Form State
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<'admin' | 'editor' | 'cliente'>('editor');
  const [newStatus, setNewStatus] = useState<'Ativo' | 'Pendente'>('Ativo');
  const [newSelectedSecretapias, setNewSelectedSecretapias] = useState<string[]>([]);
  
  // Edit Secretariats Modal state
  const [editingSecretapiasUser, setEditingSecretapiasUser] = useState<UserItem | null>(null);
  const [editingUserSecretapias, setEditingUserSecretapias] = useState<string[]>([]);
  const [availableSecreteyList, setAvailableSecreteyList] = useState<string[]>(AVAILABLE_SECRETARIAS);
  
  // Messages state
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [deleteConfirmUser, setDeleteConfirmUser] = useState<UserItem | null>(null);

  // Reset Password State
  const [resetPasswordUser, setResetPasswordUser] = useState<UserItem | null>(null);
  const [provisionalPassword, setProvisionalPassword] = useState('');

  const currentUserSession = getStoredSession();
  const isCurrentUserAdmin = currentUserSession?.role === 'admin';

  const generateRandomPassword = () => {
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    setProvisionalPassword(`Operacao@${randomNum}`);
  };

  // Setup real-time listener for systemUsers
  useEffect(() => {
    const q = collection(db, 'systemUsers');
    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const list: UserItem[] = [];
      snapshot.forEach((docSnap) => {
        list.push(docSnap.data() as UserItem);
      });

      if (snapshot.empty) {
        if (snapshot.metadata?.fromCache) {
          // Ignore if empty snapshot from local cache to prevent default overwrites during connection phase
          return;
        }
        if (localStorage.getItem('system_users_seeded') === 'true') {
          console.log("Database cleared of system users by preference, skipping automatic seeding.");
          setUsers([]);
          return;
        }
        console.log("Sem usuários cadastrados no Firestore, populando conjunto padrão...");
        try {
          const batch = writeBatch(db);
          DEFAULT_USERS.forEach((usr) => {
            const docId = usr.email.toLowerCase().trim();
            batch.set(doc(db, 'systemUsers', docId), {
              ...usr,
              status: 'Ativo',
              secretarias: (usr as any).secretarias || []
            });
          });
          await batch.commit();
          localStorage.setItem('system_users_seeded', 'true');
        } catch (err) {
          console.error("Falha ao injetar usuários padrões:", err);
          setError("Erro ao inicializar base de dados de usuários.");
        }
        return;
      }

      localStorage.setItem('system_users_seeded', 'true');
      setUsers(list);
    }, (error) => {
      console.error("Erro na leitura em tempo real dos usuários:", error);
      setError("Sem permissão ou offline para sincronizar usuários.");
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    // Dynamically query unique secretariat names from contracts database
    try {
      const stored = localStorage.getItem('portal_gestao_contracts');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          const uniqueSecs = Array.from(new Set(parsed.map((c: any) => c.secretaria).filter(Boolean)));
          if (uniqueSecs.length > 0) {
            const merged = Array.from(new Set([...AVAILABLE_SECRETARIAS, ...uniqueSecs])).sort();
            setAvailableSecreteyList(merged);
          }
        }
      }
    } catch (e) {
      console.warn("Failed to gather dynamic secretariat names from contracts", e);
    }
  }, []);

  // Create user helper
  const handleCreateUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!newDisplayName.trim() || !newEmail.trim() || !newPassword.trim()) {
      setError('Por favor, preencha todos os campos.');
      return;
    }

    if (users.some(u => u.email.toLowerCase() === newEmail.toLowerCase().trim())) {
      setError('Já existe um usuário cadastrado com este e-mail.');
      return;
    }

    const newUser: UserItem = {
      displayName: newDisplayName.trim(),
      email: newEmail.trim().toLowerCase(),
      password: newPassword,
      role: newRole,
      status: newStatus,
      secretarias: newRole === 'cliente' ? newSelectedSecretapias : [],
      isFirstAccess: true
    };

    try {
      const docId = newUser.email.toLowerCase().trim();
      await setDoc(doc(db, 'systemUsers', docId), newUser);
      
      // Reset Form
      setNewDisplayName('');
      setNewEmail('');
      setNewPassword('');
      setNewRole('editor');
      setNewStatus('Ativo');
      setNewSelectedSecretapias([]);
      setShowCreateForm(false);
      setSuccess('Novo usuário criado e registrado com sucesso!');
      setTimeout(() => setSuccess(''), 4000);
    } catch (err) {
      console.error(err);
      setError('Falha ao gravar usuário no banco de dados.');
    }
  };

  // Update user secretarias array directly
  const handleUpdateUserSecretarias = async (email: string, secretarias: string[]) => {
    const userToUpdate = users.find(u => u.email === email);
    if (!userToUpdate) return;

    try {
      const docId = email.toLowerCase().trim();
      await setDoc(doc(db, 'systemUsers', docId), { ...userToUpdate, secretarias });
      setSuccess(`Secretarias do usuário atualizadas com sucesso!`);
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      console.error(err);
      setError('Falha ao atualizar secretarias no banco.');
    }
  };

  // Toggle user permission status (Liberar ou bloquear acesso)
  const handleToggleStatus = async (email: string) => {
    const userToUpdate = users.find(u => u.email === email);
    if (!userToUpdate) return;

    try {
      const docId = email.toLowerCase().trim();
      const currentStatus = userToUpdate.status || 'Ativo';
      const nextStatus = currentStatus === 'Ativo' ? 'Pendente' : 'Ativo';
      await setDoc(doc(db, 'systemUsers', docId), { ...userToUpdate, status: nextStatus });
      setSuccess(`Status do usuário atualizado com sucesso!`);
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      console.error(err);
      setError('Falha ao alterar status no banco.');
    }
  };

  // Change user level role directly
  const handleChangeRole = async (email: string, role: 'admin' | 'editor' | 'viewer' | 'cliente') => {
    const userToUpdate = users.find(u => u.email === email);
    if (!userToUpdate) return;

    try {
      const docId = email.toLowerCase().trim();
      await setDoc(doc(db, 'systemUsers', docId), { ...userToUpdate, role, secretarias: userToUpdate.secretarias || [] });
      setSuccess(`Permissões do usuário atualizadas para ${role.toUpperCase()}!`);
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      console.error(err);
      setError('Falha ao atualizar atribuição de cargo no banco.');
    }
  };

  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!resetPasswordUser) return;

    // Strict Admin check
    if (!isCurrentUserAdmin) {
      setError('Apenas usuários Administradores podem realizar essa alteração.');
      setResetPasswordUser(null);
      return;
    }

    if (!provisionalPassword.trim() || provisionalPassword.trim().length < 6) {
      setError('A senha provisória deve conter pelo menos 6 caracteres.');
      return;
    }

    try {
      const docId = resetPasswordUser.email.toLowerCase().trim();
      await setDoc(doc(db, 'systemUsers', docId), {
        ...resetPasswordUser,
        password: provisionalPassword.trim(),
        isFirstAccess: true
      });

      setSuccess(`Senha do usuário ${resetPasswordUser.displayName} foi resetada para "${provisionalPassword.trim()}" com sucesso!`);
      setResetPasswordUser(null);
      setProvisionalPassword('');
      setTimeout(() => setSuccess(''), 6000);
    } catch (err) {
      console.error(err);
      setError('Falha ao redefinir senha no banco de dados.');
    }
  };

  // Delete user trigger
  const handleDeleteUser = (email: string) => {
    if (email === 'admin@portal.com') {
      setError('O Administrador mestre (admin@portal.com) não pode ser removido.');
      return;
    }
    const found = users.find(u => u.email === email);
    if (found) {
      setDeleteConfirmUser(found);
    }
  };

  const handleConfirmDeleteUser = async () => {
    if (deleteConfirmUser) {
      const email = deleteConfirmUser.email;
      try {
        const docId = email.toLowerCase().trim();
        await deleteDoc(doc(db, 'systemUsers', docId));
        setSuccess('Usuário excluído do portal com sucesso.');
        setDeleteConfirmUser(null);
        setTimeout(() => setSuccess(''), 3000);
      } catch (err) {
        console.error(err);
        setError('Falha ao excluir usuário do banco de dados.');
      }
    }
  };

  // Filter list
  const filteredUsers = users.filter(u => 
    u.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6" id="user-management-section">
      {/* Upper header section */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4" id="user-mgmt-header">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight uppercase font-display text-zinc-90 w" id="user-management-title">
            Controle de Usuários e Permissões
          </h1>
          <p className="text-xs text-zinc-400">
            Criação de contas, liberação de acesso e atribuição de privilégios para o domínio Operação PE.
          </p>
        </div>

        <button
          id="btn-toggle-create-user"
          onClick={() => {
            setShowCreateForm(!showCreateForm);
            setError('');
          }}
          className="bg-brand hover:opacity-90 text-white text-xs font-bold py-2 px-4 rounded-xl flex items-center gap-2 shadow-md shadow-brand/10 transition-all cursor-pointer"
        >
          {showCreateForm ? <X className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
          <span>{showCreateForm ? 'Fechar Formulário' : 'Novo Usuário'}</span>
        </button>
      </div>

      {/* Success or Error banners */}
      {error && (
        <div className="p-4 bg-rose-50 dark:bg-rose-950/20 text-xs text-rose-600 dark:text-rose-400 rounded-2xl flex items-center gap-2.5 border border-rose-100 dark:border-rose-900/30" id="user-mgmt-error">
          <AlertCircle className="h-4 w-4 text-rose-500" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-950/20 text-xs text-emerald-600 dark:text-emerald-400 rounded-2xl flex items-center gap-2.5 border border-emerald-100 dark:border-emerald-900/30" id="user-mgmt-success">
          <ShieldCheck className="h-4 w-4 text-emerald-500" />
          <span>{success}</span>
        </div>
      )}

      {/* Create User Form Drawer/Card */}
      {showCreateForm && (
        <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm border-l-4 border-l-brand" id="create-user-card">
          <h3 className="font-bold text-sm uppercase text-zinc-800 dark:text-zinc-100 mb-4 flex items-center gap-2 font-display">
            <UserPlus className="h-4.5 w-4.5 text-brand" />
            Cadastrar Novo Membro / Técnico
          </h3>

          <form onSubmit={handleCreateUserSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-4" id="form-create-user">
            {/* Display Name */}
            <div className="space-y-1">
              <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider font-mono">
                Nome do Usuário / Órgão
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-zinc-405">
                  <User className="h-3.5 w-3.5" />
                </span>
                <input
                  id="input-new-username"
                  type="text"
                  placeholder="Carlos Souza (SAD)"
                  value={newDisplayName}
                  onChange={(e) => setNewDisplayName(e.target.value)}
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl py-2 pl-9 pr-3 text-xs text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-brand"
                  required
                />
              </div>
            </div>

            {/* Email */}
            <div className="space-y-1">
              <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider font-mono">
                E-mail Corporativo
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-zinc-405">
                  <Mail className="h-3.5 w-3.5" />
                </span>
                <input
                  id="input-new-email"
                  type="email"
                  placeholder="carlos.souza@sad.pe.gov.br"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl py-2 pl-9 pr-3 text-xs text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-brand"
                  required
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-1">
              <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider font-mono">
                Senha Proclamatória
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-zinc-405">
                  <KeyRound className="h-3.5 w-3.5" />
                </span>
                <input
                  id="input-new-password"
                  type="text"
                  placeholder="Senha de acesso..."
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl py-2 pl-9 pr-3 text-xs text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-brand"
                  required
                />
              </div>
            </div>

            {/* Level & Status Grid Item */}
            <div className="space-y-1 grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider font-mono mb-1">
                  Nível
                </label>
                <select
                  id="select-new-role"
                  value={newRole}
                  onChange={(e) => {
                    const r = e.target.value as any;
                    setNewRole(r);
                    if (r !== 'cliente') {
                      setNewSelectedSecretapias([]);
                    }
                  }}
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl py-2 px-2 text-xs text-zinc-800 dark:text-zinc-200 focus:outline-none"
                >
                  <option value="cliente">Cliente (Acesso Restrito)</option>
                  <option value="editor">Editor</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider font-mono mb-1">
                  Status
                </label>
                <select
                  id="select-new-status"
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value as any)}
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl py-2 px-2 text-xs text-zinc-800 dark:text-zinc-200 focus:outline-none"
                >
                  <option value="Ativo">Ativo</option>
                  <option value="Pendente">Pendente</option>
                </select>
              </div>
            </div>

            {newRole === 'cliente' && (
              <div className="md:col-span-4 space-y-2 border-t border-zinc-100 dark:border-zinc-800 pt-4" id="new-user-secretariats">
                <label className="block text-[10px] font-bold text-zinc-405 dark:text-zinc-400 uppercase tracking-wider font-mono">
                  Selecione as Secretarias permitidas para este Cliente: ({newSelectedSecretapias.length} selecionadas)
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-48 overflow-y-auto p-3.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl">
                  {availableSecreteyList.map(sec => {
                    const isChecked = newSelectedSecretapias.includes(sec);
                    return (
                      <label key={sec} className="flex items-center gap-2.5 p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-900 rounded-lg cursor-pointer text-[11px] transition-colors text-zinc-700 dark:text-zinc-300">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            if (isChecked) {
                              setNewSelectedSecretapias(newSelectedSecretapias.filter(s => s !== sec));
                            } else {
                              setNewSelectedSecretapias([...newSelectedSecretapias, sec]);
                            }
                          }}
                          className="rounded text-brand focus:ring-brand h-4 w-4"
                        />
                        <span className="truncate" title={sec}>{sec}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Submit button on full width on mobile or self-placement on desktop */}
            <div className="md:col-span-4 flex justify-end gap-3 pt-2">
              <button
                id="btn-cancel-create-user"
                type="button"
                onClick={() => setShowCreateForm(false)}
                className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300 text-xs font-bold rounded-xl transition"
              >
                Cancelar
              </button>
              <button
                id="btn-submit-create-user"
                type="submit"
                className="px-5 py-2 bg-brand hover:opacity-95 text-white text-xs font-bold rounded-xl shadow-md transition"
              >
                Registrar Usuário
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Main card list */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-150 dark:border-zinc-800 shadow-md overflow-hidden" id="users-table-card">
        
        {/* Table Top Controls */}
        <div className="p-5 bg-zinc-50/75 dark:bg-zinc-900/50 border-b border-zinc-150 dark:border-zinc-800 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="relative w-full sm:w-80">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-zinc-400">
              <Search className="h-4 w-4" />
            </span>
            <input
              id="input-search-users"
              type="text"
              placeholder="Buscar por nome ou e-mail..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-805 rounded-xl py-2 pl-10 pr-4 text-xs text-zinc-800 dark:text-zinc-200 placeholder-zinc-450 focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand transition-all"
            />
          </div>

          <div className="text-[11px] text-zinc-500 dark:text-zinc-450 font-mono font-bold uppercase tracking-wider bg-zinc-100 dark:bg-zinc-800/60 px-3.5 py-1.5 rounded-full border border-zinc-200/50 dark:border-zinc-700/40">
            Total cadastrado: <span className="text-brand dark:text-brand-light font-black">{users.length}</span> usuários
          </div>
        </div>

        {/* Users Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse" id="users-data-table">
            <thead>
              <tr className="bg-zinc-50/50 dark:bg-zinc-950/20 text-zinc-400 dark:text-zinc-500 text-[10px] font-bold uppercase tracking-widest border-b border-zinc-150 dark:border-zinc-800/80">
                <th className="py-4 px-6 font-mono">Nome Completo / Órgão</th>
                <th className="py-4 px-6 font-mono">E-mail Corporativo</th>
                <th className="py-4 px-6 font-mono">Nível de Acesso</th>
                <th className="py-4 px-6 font-mono text-center">Status</th>
                <th className="py-4 px-6 font-mono text-center">Permissão Ativa</th>
                <th className="py-4 px-6 font-mono text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60 text-xs">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-zinc-400 font-medium">
                    Nenhum usuário correspondente encontrado.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((item) => (
                  <tr key={item.email} className="hover:bg-zinc-50/40 dark:hover:bg-zinc-800/10 transition-colors group">
                    
                    {/* User display name */}
                    <td className="py-4 px-6 font-medium text-zinc-900 dark:text-zinc-100">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-brand/5 border border-brand/10 dark:bg-brand/10 text-brand dark:text-brand-light flex items-center justify-center font-bold text-xs uppercase font-mono transition-transform group-hover:scale-105 shadow-inner">
                          {item.displayName.substring(0, 2)}
                        </div>
                        <div className="flex flex-col">
                          <span className="font-semibold text-zinc-800 dark:text-zinc-150 text-xs transition-colors group-hover:text-brand dark:group-hover:text-brand-light">
                            {item.displayName}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Email */}
                    <td className="py-4 px-6 font-mono text-zinc-500 dark:text-zinc-400 font-medium text-xs">
                      {item.email}
                    </td>

                    {/* Role selector directly */}
                    <td className="py-4 px-6">
                      {item.email === 'admin@portal.com' ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-mono font-black tracking-wider bg-brand/10 text-brand dark:bg-brand/20 dark:text-brand-light border border-brand/20">
                          <Shield className="h-3.5 w-3.5" />
                          ADMIN GERAL
                        </span>
                      ) : (
                        <div className="space-y-1.5">
                          <div className="relative inline-block w-48">
                            <select
                              id={`select-role-${item.email}`}
                              value={item.role}
                              onChange={(e) => handleChangeRole(item.email, e.target.value as any)}
                              className="w-full bg-zinc-50 hover:bg-zinc-100 dark:bg-zinc-950 dark:hover:bg-zinc-900 border border-zinc-200 dark:border-zinc-850 rounded-xl py-1.5 px-3 text-[11px] font-bold font-mono text-zinc-700 dark:text-zinc-300 transition-colors focus:outline-none focus:ring-2 focus:ring-brand/20"
                            >
                              <option value="cliente">CLIENTE (RESTRITO)</option>
                              <option value="editor">EDITOR (CADASTRO)</option>
                              <option value="admin">ADMIN (ADMINISTRADOR)</option>
                            </select>
                          </div>
                          {item.role === 'cliente' && (
                            <div className="flex flex-col gap-1 text-[10px] font-mono font-medium max-w-[200px]">
                              <span className="text-zinc-405 dark:text-zinc-500 font-semibold leading-tight">
                                Secretarias: <span className="font-bold text-brand dark:text-brand-light">{(item.secretarias || []).length}</span> liberação/ões
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingSecretapiasUser(item);
                                  setEditingUserSecretapias(item.secretarias || []);
                                }}
                                className="flex items-center gap-1 text-[10px] text-brand hover:underline font-bold font-sans tracking-tight cursor-pointer"
                              >
                                <Settings className="h-3 w-3 shrink-0" />
                                <span>Liberar Secretarias</span>
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </td>

                    {/* Status Badge */}
                    <td className="py-4 px-6 text-center">
                      <div className="inline-flex justify-center w-full">
                        {item.status === 'Ativo' ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            Ativo
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-rose-500/10 text-rose-500 dark:text-rose-450 border border-rose-500/20">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                            Bloqueado
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Enable / Disable toggle switch */}
                    <td className="py-4 px-6 text-center">
                      <div className="inline-flex justify-center items-center w-full">
                        {item.email === 'admin@portal.com' ? (
                          <span className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest font-mono">Restrito</span>
                        ) : (
                          <button
                            id={`btn-toggle-status-${item.email}`}
                            onClick={() => handleToggleStatus(item.email)}
                            role="switch"
                            aria-checked={item.status === 'Ativo'}
                            className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-brand/20 ${
                              item.status === 'Ativo' ? 'bg-brand' : 'bg-zinc-200 dark:bg-zinc-800'
                            }`}
                            title={item.status === 'Ativo' ? 'Clique para Bloquear Acesso' : 'Clique para Liberar Acesso'}
                          >
                            <span
                              className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                                item.status === 'Ativo' ? 'translate-x-5' : 'translate-x-0'
                              }`}
                            />
                          </button>
                        )}
                      </div>
                    </td>

                    {/* Delete and Reset Password actions */}
                    <td className="py-4 px-6 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {isCurrentUserAdmin && (
                          <button
                            id={`btn-reset-password-trigger-${item.email}`}
                            onClick={() => {
                              setResetPasswordUser(item);
                              setProvisionalPassword('');
                            }}
                            className="p-1.5 text-zinc-400 hover:text-brand hover:bg-brand/10 dark:hover:bg-brand/25 rounded-lg cursor-pointer transition-colors inline-flex items-center justify-center"
                            title="Resetar senha provisória"
                          >
                            <KeyRound className="h-4.5 w-4.5" />
                          </button>
                        )}

                        {item.email === 'admin@portal.com' ? (
                          <span className="text-[10px] text-zinc-400 dark:text-zinc-550 uppercase font-mono font-bold tracking-wider">Imutável</span>
                        ) : (
                          <button
                            id={`btn-delete-user-${item.email}`}
                            onClick={() => handleDeleteUser(item.email)}
                            className="p-1.5 text-zinc-400 hover:text-rose-600 hover:bg-rose-500/10 dark:hover:bg-rose-500/25 rounded-lg cursor-pointer transition-colors inline-flex items-center justify-center"
                            title="Remover usuário completamente"
                          >
                            <Trash2 className="h-4.5 w-4.5" />
                          </button>
                        )}
                      </div>
                    </td>

                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

      </div>

      {/* Auxiliary informative help card */}
      <div className="bg-zinc-50 dark:bg-zinc-950/40 p-4 border border-zinc-200 dark:border-zinc-800 rounded-2xl" id="user-mgmt-info-panel">
        <h4 className="text-xs font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-widest font-display mb-1 flex items-center gap-1.5">
          <Shield className="h-3.5 w-3.5 text-brand" />
          Notas de Regulação Cadastral (Operação PE)
        </h4>
        <ul className="text-[11px] text-zinc-450 dark:text-zinc-508 list-disc list-inside space-y-1 leading-relaxed">
          <li><strong>Cliente (Acesso Restrito):</strong> Permite acessar dados de faturamento e relatórios apenas das secretarias explicitamente autorizadas pelo Admin.</li>
          <li><strong>Editor (Cadastro):</strong> Permite incluir novos contratos, observações e controle operacional dos PVFs.</li>
          <li><strong>Admin (Gestor Geral):</strong> Acesso ilimitado às tabelas, reajuste geral de tarifas e a esta central de credenciamento.</li>
          <li>Os usuários cadastrados ou alterados aqui são salvos instantaneamente e o login passa a respeitar imediatamente as novas liberações.</li>
        </ul>
      </div>

      {/* ========================================================================= */}
      {/* ================= CUSTOM CONFIRM DELETE USER MODAL ====================== */}
      {/* ========================================================================= */}
      {deleteConfirmUser && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 z-50 font-sans">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-sm rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-800 p-6 flex flex-col text-left transform scale-100 transition-all animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-sm font-black text-zinc-900 dark:text-zinc-100 uppercase tracking-wider mb-2 flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-rose-500 shrink-0" />
              Excluir Usuário
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-6 leading-relaxed">
              Tem certeza de que deseja remover o acesso do usuário <strong className="text-zinc-900 dark:text-zinc-200 font-bold">{deleteConfirmUser.displayName}</strong> (<span className="font-mono text-[11px]">{deleteConfirmUser.email}</span>)?
              <br />
              <span className="text-[11px] text-rose-500/90 mt-2 block font-semibold">Este usuário perderá o acesso às áreas restritas do Operação PE imediatamente.</span>
            </p>
            <div className="flex items-center justify-end gap-3 font-semibold text-xs">
              <button
                type="button"
                onClick={() => setDeleteConfirmUser(null)}
                className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-650 dark:text-zinc-350 rounded-xl transition-all cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteUser}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl shadow-md shadow-rose-500/10 transition-all cursor-pointer font-bold"
              >
                Confirmar Exclusão
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ================= EDIT USER SECRETARIAS MODAL =========================== */}
      {/* ========================================================================= */}
      {editingSecretapiasUser && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 z-50 font-sans">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-2xl rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-800 p-6 flex flex-col text-left transform scale-100 transition-all animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-sm font-black text-zinc-900 dark:text-zinc-100 uppercase tracking-wider mb-2 flex items-center gap-2">
              <Building2 className="h-5 w-5 text-brand shrink-0" />
              Liberar Secretarias - {editingSecretapiasUser.displayName}
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-4 leading-relaxed">
              Selecione quais secretarias o usuário <strong className="text-zinc-900 dark:text-zinc-200 font-bold">{editingSecretapiasUser.displayName}</strong> terá acesso aos dados de faturamento e relatórios.
            </p>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto p-4 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-850 rounded-xl mb-6">
              {availableSecreteyList.map(sec => {
                const isChecked = editingUserSecretapias.includes(sec);
                return (
                  <label key={sec} className="flex items-center gap-2.5 p-2 hover:bg-zinc-100 dark:hover:bg-zinc-900 rounded-xl cursor-pointer text-xs transition-colors text-zinc-700 dark:text-zinc-300">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => {
                        if (isChecked) {
                          setEditingUserSecretapias(editingUserSecretapias.filter(s => s !== sec));
                        } else {
                          setEditingUserSecretapias([...editingUserSecretapias, sec]);
                        }
                      }}
                      className="rounded text-brand focus:ring-brand h-4 w-4"
                    />
                    <span className="truncate" title={sec}>{sec}</span>
                  </label>
                );
              })}
            </div>

            <div className="flex items-center justify-end gap-3 font-semibold text-xs">
              <button
                type="button"
                onClick={() => setEditingSecretapiasUser(null)}
                className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-650 dark:text-zinc-350 rounded-xl transition-all cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  handleUpdateUserSecretarias(editingSecretapiasUser.email, editingUserSecretapias);
                  setEditingSecretapiasUser(null);
                }}
                className="px-5 py-2 bg-brand hover:opacity-95 text-white rounded-xl shadow-md transition-all cursor-pointer font-bold"
              >
                Salvar Liberações
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ================= RESET PASSWORD MODAL ================================== */}
      {/* ========================================================================= */}
      {resetPasswordUser && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 z-50 font-sans">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-md rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-800 p-6 flex flex-col text-left transform scale-100 transition-all animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-sm font-black text-zinc-900 dark:text-zinc-100 uppercase tracking-wider mb-2 flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-brand shrink-0" />
              Resetar Senha de Acesso
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-4 leading-relaxed">
              Defina uma senha provisória para o usuário <strong className="text-zinc-900 dark:text-zinc-200 font-bold">{resetPasswordUser.displayName}</strong> (<span className="font-mono text-[11px]">{resetPasswordUser.email}</span>).
              O usuário será obrigado a realizar a atualização de sua senha no próximo acesso.
            </p>

            <form onSubmit={handleResetPasswordSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-wider font-mono">
                  Senha Provisória
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-zinc-400">
                    <KeyRound className="h-4 w-4" />
                  </span>
                  <input
                    id="input-provisional-password"
                    type="text"
                    placeholder="Digite a nova senha provisória..."
                    value={provisionalPassword}
                    onChange={(e) => setProvisionalPassword(e.target.value)}
                    className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-850 rounded-xl py-2 pl-9 pr-3 text-xs text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-brand font-mono"
                    required
                    minLength={6}
                  />
                </div>
                <div className="flex justify-between items-center text-[10px] text-zinc-400 mt-1">
                  <span>Mínimo de 6 caracteres.</span>
                  <button
                    type="button"
                    onClick={generateRandomPassword}
                    className="text-brand hover:underline font-bold"
                  >
                    Gerar Senha Aleatória
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 font-semibold text-xs pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setResetPasswordUser(null);
                    setProvisionalPassword('');
                  }}
                  className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-650 dark:text-zinc-350 rounded-xl transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-brand hover:opacity-95 text-white rounded-xl shadow-md transition-all cursor-pointer font-bold"
                >
                  Confirmar Reset
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
