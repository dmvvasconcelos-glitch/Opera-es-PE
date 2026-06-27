import React, { useState, useEffect } from 'react';
import { 
  Building2, 
  Users, 
  MapPin, 
  Phone, 
  DollarSign, 
  Plus, 
  Trash2, 
  Edit2, 
  Save, 
  Search, 
  Settings, 
  CheckCircle2, 
  AlertCircle,
  AlertTriangle,
  FileText,
  Bookmark,
  ShieldCheck,
  X,
  Compass,
  ArrowRight,
  TrendingUp,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, doc, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore';
import { Supplier, LpuItem, LpuSettings, UserSession } from '../types';

interface SuppliersManagementProps {
  currentUser: UserSession;
  activeSection?: 'parceiros' | 'lpu';
}

export default function SuppliersManagement({ currentUser, activeSection = 'parceiros' }: SuppliersManagementProps) {
  const isAdmin = currentUser.role === 'admin' || currentUser.role === 'analista';

  const [referenceMonth, setReferenceMonth] = useState('Junho/2026');
  const availableMonths = [
    'Janeiro/2026',
    'Fevereiro/2026',
    'Março/2026',
    'Abril/2026',
    'Maio/2026',
    'Junho/2026',
    'Julho/2026',
    'Agosto/2026',
    'Setembro/2026',
    'Outubro/2026',
    'Novembro/2026',
    'Dezembro/2026'
  ];

  // State for Suppliers
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierSearch, setSupplierSearch] = useState('');
  const [isEditingSupplier, setIsEditingSupplier] = useState(false);
  const [editingSupplierId, setEditingSupplierId] = useState<string | null>(null);
  const [showSupplierForm, setShowSupplierForm] = useState(false);
  
  // Supplier Form state
  const [supplierName, setSupplierName] = useState('');
  const [supplierCompany, setSupplierCompany] = useState('');
  const [supplierContact, setSupplierContact] = useState('');
  const [supplierCpf, setSupplierCpf] = useState('');
  const [supplierCnpj, setSupplierCnpj] = useState('');
  const [supplierAddress, setSupplierAddress] = useState('');
  const [supplierAreas, setSupplierAreas] = useState<string[]>([]);

  // State for LPU Items
  const [lpuItems, setLpuItems] = useState<LpuItem[]>([]);
  const [lpuSearch, setLpuSearch] = useState('');
  const [isEditingLpuItem, setIsEditingLpuItem] = useState(false);
  const [editingLpuItemId, setEditingLpuItemId] = useState<string | null>(null);
  const [showLpuForm, setShowLpuForm] = useState(false);

  // Lpu Form state
  const [lpuActivity, setLpuActivity] = useState('');
  const [lpuValue, setLpuValue] = useState('');
  const [lpuArea, setLpuArea] = useState<'RMR' | 'Interior' | 'Noronha' | 'Gestão'>('RMR');

  // Fixed LPU settings (Valor Quilometragem and Raio Quilometragem)
  const [lpuSettings, setLpuSettings] = useState<LpuSettings>({
    valorQuilometragem: '',
    raioQuilometragem: ''
  });
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  // Status/Toast messages
  const [notification, setNotification] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Deletion Confirmation States
  const [supplierToDelete, setSupplierToDelete] = useState<{ id: string; name: string } | null>(null);
  const [lpuItemToDelete, setLpuItemToDelete] = useState<{ id: string; name: string } | null>(null);

  // Real-time Firestore Sync for Suppliers
  useEffect(() => {
    const unsubSuppliers = onSnapshot(collection(db, 'suppliers'), (snapshot) => {
      const list: Supplier[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() } as Supplier);
      });
      // Sort by Name
      list.sort((a, b) => a.nome.localeCompare(b.nome));
      setSuppliers(list);
    }, (err) => {
      console.error("Erro ao sincronizar fornecedores:", err);
      handleFirestoreError(err, OperationType.GET, 'suppliers');
    });

    return () => unsubSuppliers();
  }, []);

  // Real-time Firestore Sync for LPU Items
  useEffect(() => {
    const unsubLpu = onSnapshot(collection(db, 'lpuItems'), (snapshot) => {
      const list: LpuItem[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() } as LpuItem);
      });
      // Sort by activity name
      list.sort((a, b) => a.atividade.localeCompare(b.atividade));
      setLpuItems(list);
    }, (err) => {
      console.error("Erro ao sincronizar LPU:", err);
      handleFirestoreError(err, OperationType.GET, 'lpuItems');
    });

    return () => unsubLpu();
  }, []);

  // Real-time Firestore Sync for Fixed LPU Settings
  useEffect(() => {
    const unsubSettings = onSnapshot(doc(db, 'lpuSettings', 'mileage'), (docSnap) => {
      if (docSnap.exists()) {
        setLpuSettings(docSnap.data() as LpuSettings);
      } else {
        // Default empty states
        setLpuSettings({
          valorQuilometragem: '',
          raioQuilometragem: ''
        });
      }
    }, (err) => {
      console.error("Erro ao sincronizar configurações LPU:", err);
    });

    return () => unsubSettings();
  }, []);

  // Utility to show notification
  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'success') => {
    setNotification({ text, type });
    setTimeout(() => setNotification(null), 4000);
  };

  // CPF Mask formatting helper
  const formatCPF = (val: string) => {
    const cleaned = val.replace(/\D/g, '');
    if (cleaned.length <= 11) {
      return cleaned
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
    }
    return val;
  };

  // CNPJ Mask formatting helper
  const formatCNPJ = (val: string) => {
    const cleaned = val.replace(/\D/g, '');
    if (cleaned.length <= 14) {
      return cleaned
        .replace(/^(\d{2})(\d)/, '$1.$2')
        .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
        .replace(/\.(\d{3})(\d)/, '.$1/$2')
        .replace(/(\d{4})(\d)/, '$1-$2');
    }
    return val;
  };

  // Reset supplier form fields
  const resetSupplierForm = () => {
    setSupplierName('');
    setSupplierCompany('');
    setSupplierContact('');
    setSupplierCpf('');
    setSupplierCnpj('');
    setSupplierAddress('');
    setSupplierAreas([]);
    setIsEditingSupplier(false);
    setEditingSupplierId(null);
    setShowSupplierForm(false);
  };

  // Submit Supplier
  const handleSubmitSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierName.trim()) {
      showToast("Por favor, informe o nome do parceiro.", "error");
      return;
    }

    const docId = editingSupplierId || `sup_${Date.now()}`;
    const supplierData: Supplier = {
      id: docId,
      nome: supplierName.trim(),
      empresa: supplierCompany.trim(),
      contato: supplierContact.trim(),
      cpf: supplierCpf.trim(),
      cnpj: supplierCnpj.trim(),
      endereco: supplierAddress.trim(),
      createdAt: new Date().toISOString(),
      areasAtuacao: supplierAreas
    };

    try {
      await setDoc(doc(db, 'suppliers', docId), supplierData);
      showToast(editingSupplierId ? "Parceiro atualizado com sucesso!" : "Parceiro cadastrado com sucesso!", "success");
      resetSupplierForm();
    } catch (err: any) {
      console.error("Erro ao salvar parceiro:", err);
      showToast("Erro ao salvar parceiro no Firestore.", "error");
    }
  };

  // Edit Supplier Trigger
  const handleEditSupplier = (sup: Supplier) => {
    setEditingSupplierId(sup.id);
    setSupplierName(sup.nome);
    setSupplierCompany(sup.empresa || '');
    setSupplierContact(sup.contato);
    setSupplierCpf(sup.cpf);
    setSupplierCnpj(sup.cnpj);
    setSupplierAddress(sup.endereco);
    setSupplierAreas(sup.areasAtuacao || []);
    setIsEditingSupplier(true);
    setShowSupplierForm(true);
    // Scroll smoothly to form
    setTimeout(() => {
      const element = document.getElementById('supplier-form-container');
      if (element) {
        element.scrollIntoView({ behavior: 'smooth' });
      }
    }, 100);
  };

  // Delete Supplier Trigger
  const handleDeleteSupplier = (id: string, name: string) => {
    setSupplierToDelete({ id, name });
  };

  // Confirm Delete Supplier
  const confirmDeleteSupplier = async () => {
    if (!supplierToDelete) return;
    try {
      await deleteDoc(doc(db, 'suppliers', supplierToDelete.id));
      showToast("Parceiro removido com sucesso!", "success");
    } catch (err: any) {
      console.error("Erro ao remover parceiro:", err);
      handleFirestoreError(err, OperationType.DELETE, `suppliers/${supplierToDelete.id}`);
      showToast("Erro ao remover parceiro.", "error");
    } finally {
      setSupplierToDelete(null);
    }
  };

  // Reset LPU form fields
  const resetLpuForm = () => {
    setLpuActivity('');
    setLpuValue('');
    setLpuArea('RMR');
    setIsEditingLpuItem(false);
    setEditingLpuItemId(null);
    setShowLpuForm(false);
  };

  // Submit LPU Item
  const handleSubmitLpuItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lpuActivity.trim()) {
      showToast("Informe o nome/tipo da atividade.", "error");
      return;
    }
    if (!lpuValue.trim() || isNaN(Number(lpuValue.replace(',', '.')))) {
      showToast("Informe um valor numérico válido para a atividade.", "error");
      return;
    }

    const docId = editingLpuItemId || `lpu_${Date.now()}`;
    const valueNum = Number(lpuValue.replace(',', '.'));

    const lpuData: LpuItem = {
      id: docId,
      atividade: lpuActivity.trim(),
      valor: valueNum,
      createdAt: new Date().toISOString(),
      area: lpuArea
    };

    try {
      await setDoc(doc(db, 'lpuItems', docId), lpuData);
      showToast(editingLpuItemId ? "Item de LPU atualizado!" : "Novo item de LPU cadastrado!", "success");
      resetLpuForm();
    } catch (err: any) {
      console.error("Erro ao salvar item LPU:", err);
      showToast("Erro ao salvar item de LPU.", "error");
    }
  };

  // Edit LPU Trigger
  const handleEditLpuItem = (item: LpuItem) => {
    setEditingLpuItemId(item.id);
    setLpuActivity(item.atividade);
    setLpuValue(String(item.valor).replace('.', ','));
    setLpuArea(item.area || 'RMR');
    setIsEditingLpuItem(true);
    setShowLpuForm(true);
    // Scroll smoothly to form
    setTimeout(() => {
      const element = document.getElementById('lpu-form-container');
      if (element) {
        element.scrollIntoView({ behavior: 'smooth' });
      }
    }, 100);
  };

  // Delete LPU Item Trigger
  const handleDeleteLpuItem = (id: string, name: string) => {
    setLpuItemToDelete({ id, name });
  };

  // Confirm Delete LPU Item
  const confirmDeleteLpuItem = async () => {
    if (!lpuItemToDelete) return;
    try {
      await deleteDoc(doc(db, 'lpuItems', lpuItemToDelete.id));
      showToast("Atividade removida com sucesso da LPU!", "success");
    } catch (err: any) {
      console.error("Erro ao remover item de LPU:", err);
      handleFirestoreError(err, OperationType.DELETE, `lpuItems/${lpuItemToDelete.id}`);
      showToast("Erro ao remover item da LPU.", "error");
    } finally {
      setLpuItemToDelete(null);
    }
  };

  // Save Pinned Settings (Valor Quilometragem & Raio Quilometragem)
  const handleSaveLpuSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingSettings(true);
    try {
      await setDoc(doc(db, 'lpuSettings', 'mileage'), lpuSettings);
      showToast("Informações fixadas de quilometragem salvas com sucesso!", "success");
    } catch (err: any) {
      console.error("Erro ao salvar configurações de quilometragem:", err);
      showToast("Erro ao salvar dados de quilometragem no Firestore.", "error");
    } finally {
      setIsSavingSettings(false);
    }
  };

  // Filtered Lists
  const filteredSuppliers = suppliers.filter(s => 
    s.nome.toLowerCase().includes(supplierSearch.toLowerCase()) ||
    (s.empresa && s.empresa.toLowerCase().includes(supplierSearch.toLowerCase())) ||
    s.contato.toLowerCase().includes(supplierSearch.toLowerCase()) ||
    s.cpf.toLowerCase().includes(supplierSearch.toLowerCase()) ||
    s.cnpj.toLowerCase().includes(supplierSearch.toLowerCase()) ||
    s.endereco.toLowerCase().includes(supplierSearch.toLowerCase())
  );

  const filteredLpuItems = lpuItems.filter(item => {
    if (item.area === 'Gestão' && currentUser.role !== 'admin') {
      return false;
    }
    return item.atividade.toLowerCase().includes(lpuSearch.toLowerCase());
  });

  const formatCurrencyValue = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  return (
    <div className="space-y-8 animate-fade-in" id="suppliers-management-root">
      
      {/* Toast Notification */}
      {notification && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3.5 rounded-xl border shadow-lg max-w-sm transition-all duration-300 animate-slide-up ${
          notification.type === 'success' 
            ? 'bg-emerald-950/90 text-emerald-200 border-emerald-800' 
            : notification.type === 'error'
              ? 'bg-rose-950/90 text-rose-200 border-rose-800'
              : 'bg-zinc-900/95 text-zinc-200 border-zinc-700'
        }`}>
          {notification.type === 'success' ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="h-5 w-5 text-rose-400 shrink-0" />
          )}
          <span className="text-xs font-medium font-sans leading-relaxed">{notification.text}</span>
          <button onClick={() => setNotification(null)} className="ml-auto text-zinc-400 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Title Header Card - Starlink Layout */}
      <div className="relative overflow-hidden rounded-3.5xl border border-zinc-200/80 dark:border-zinc-800/80 bg-white dark:bg-zinc-900 p-6 md:p-8 shadow-xs">
        <div className="absolute right-0 top-0 -mr-16 -mt-16 w-48 h-48 rounded-full bg-cyan-500/5 dark:bg-cyan-500/10 blur-3xl pointer-events-none" />
        <div className="absolute left-1/3 bottom-0 w-64 h-64 rounded-full bg-indigo-500/5 blur-3xl pointer-events-none" />
        
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-cyan-500/10 text-cyan-600 dark:bg-zinc-800 dark:text-cyan-405">
              <Building2 className="h-3 w-3 animate-pulse text-cyan-600" />
              {activeSection === 'parceiros' ? 'MÓDULO DE PARCEIROS' : 'MÓDULO LPU'}
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-zinc-900 dark:text-white font-sans flex items-center gap-2">
              {activeSection === 'parceiros' ? 'Cadastro de Parceiros' : 'LPU de Serviços'}
            </h1>
            <p className="text-zinc-500 dark:text-zinc-450 text-xs max-w-2xl leading-relaxed">
              {activeSection === 'parceiros' 
                ? 'Painel administrativo para cadastro e consulta de parceiros estratégicos, controle de CPF/CNPJ e informações de contato.' 
                : 'Tabelas de Preços Unitários (LPU) e configurações de quilometragem para atividades operacionais.'}
            </p>
          </div>
          
          {/* Month Selector on Right Side */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
            <div className="flex flex-col justify-center bg-zinc-50 dark:bg-zinc-950 px-5 py-3 rounded-2.5xl border border-zinc-200/50 dark:border-zinc-850/65 min-w-[220px]">
              <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest font-mono">Mês de Referência</span>
              <div className="relative mt-1">
                <select
                  value={referenceMonth}
                  onChange={(e) => setReferenceMonth(e.target.value)}
                  className="w-full bg-white dark:bg-zinc-900 border border-zinc-250 dark:border-zinc-800 rounded-xl px-3 py-1.5 text-xs font-bold text-zinc-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-cyan-500 appearance-none cursor-pointer pr-10 shadow-xs"
                >
                  {availableMonths.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3.5 top-2.5 h-4 w-4 text-zinc-400 pointer-events-none" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================== */}
      {/* SECTION 1: FIXED/PINNED KM METADATA FIELDS */}
      {/* ========================================== */}
      {activeSection === 'lpu' && (
        <div className="bg-white dark:bg-zinc-900 p-6 rounded-3xl border border-zinc-200/85 dark:border-zinc-800/85 shadow-xs">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="h-1.5 w-1.5 bg-amber-500 rounded-full animate-ping" />
            <h3 className="text-xs font-black uppercase tracking-widest text-zinc-700 dark:text-zinc-300 font-mono">
              Informações Fixadas da LPU (Quilometragem)
            </h3>
          </div>

          <form onSubmit={handleSaveLpuSettings} className="grid grid-cols-1 md:grid-cols-3 gap-5 items-end">
            <div className="space-y-1.5">
              <label className="block text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider font-sans">
                Valor Quilometragem (BRL)
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-zinc-405 dark:text-zinc-500 text-xs font-mono">
                  R$
                </span>
                <input
                  type="text"
                  disabled={!isAdmin}
                  placeholder="Ex: 2,50"
                  value={lpuSettings.valorQuilometragem}
                  onChange={(e) => setLpuSettings({ ...lpuSettings, valorQuilometragem: e.target.value })}
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 focus:border-brand dark:focus:border-zinc-700 focus:ring-1 focus:ring-brand rounded-xl pl-9 pr-3 py-2 text-xs text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 font-mono transition-all outline-none"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider font-sans">
                Raio Quilometragem (Km)
              </label>
              <div className="relative">
                <input
                  type="text"
                  disabled={!isAdmin}
                  placeholder="Ex: 50"
                  value={lpuSettings.raioQuilometragem}
                  onChange={(e) => setLpuSettings({ ...lpuSettings, raioQuilometragem: e.target.value })}
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 focus:border-brand dark:focus:border-zinc-700 focus:ring-1 focus:ring-brand rounded-xl px-3 py-2 text-xs text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 font-mono transition-all outline-none"
                />
                <span className="absolute inset-y-0 right-0 pr-3 flex items-center text-zinc-405 dark:text-zinc-500 text-[10px] font-bold uppercase font-mono">
                  KM
                </span>
              </div>
            </div>

            <div>
              {isAdmin ? (
                <button
                  type="submit"
                  disabled={isSavingSettings}
                  className="w-full md:w-auto bg-amber-500 hover:bg-amber-600 text-zinc-950 font-black text-xs uppercase tracking-wider py-2.5 px-6 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-amber-500/10 cursor-pointer transition-all duration-200"
                >
                  <Save className="h-4 w-4" />
                  {isSavingSettings ? 'Salvando...' : 'Salvar Quilometragem'}
                </button>
              ) : (
                <span className="text-[10px] text-zinc-500 italic block py-2.5 font-sans">
                  * Apenas administradores podem alterar essas informações.
                </span>
              )}
            </div>
          </form>
        </div>
      )}

      {/* ======================================================== */}
      {/* MAIN TWO-COLUMN LAYOUT: SUPPLIERS VS LPU DE ATIVIDADES    */}
      {/* ======================================================== */}
      <div className="w-full">
        
        {/* ==================== COLUMN 1: FORNECEDORES (7/12) ==================== */}
        {activeSection === 'parceiros' && (
          <div className="w-full space-y-6">
          <div className="bg-white dark:bg-zinc-900 p-6 rounded-3xl border border-zinc-200/85 dark:border-zinc-800/85 shadow-xs space-y-5">
            
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-150 dark:border-zinc-800/80">
                <div className="flex items-center gap-2.5">
                  <Users className="h-5 w-5 text-brand" />
                  <h2 className="text-base font-bold text-zinc-900 dark:text-white font-sans">Cadastro de Parceiros</h2>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 w-full sm:w-auto">
                  <div className="relative max-w-xs w-full">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400 dark:text-zinc-500" />
                    <input
                      type="text"
                      placeholder="Pesquisar parceiro..."
                      value={supplierSearch}
                      onChange={(e) => setSupplierSearch(e.target.value)}
                      className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 focus:border-brand rounded-xl pl-9 pr-3 py-2 text-xs text-zinc-800 dark:text-zinc-200 placeholder-zinc-455 dark:placeholder-zinc-500 transition-all outline-none font-sans"
                    />
                  </div>
                  {isAdmin && (
                    <button
                      onClick={() => {
                        setShowSupplierForm(!showSupplierForm);
                        if (showSupplierForm) {
                          resetSupplierForm();
                        }
                      }}
                      className="flex items-center justify-center gap-2 px-4 py-2 bg-brand hover:bg-brand/90 active:bg-brand/95 text-white text-xs font-black tracking-wide rounded-xl transition-all cursor-pointer shadow-md select-none whitespace-nowrap"
                    >
                      <Plus className="h-4 w-4 text-white" />
                      <span>CADASTRAR PARCEIRO</span>
                      {showSupplierForm ? (
                        <ChevronUp className="h-3.5 w-3.5 text-white" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5 text-white" />
                      )}
                    </button>
                  )}
                </div>
              </div>

              {/* Collapsible Register/Edit form card container */}
              {isAdmin && showSupplierForm && (
                <div 
                  id="supplier-form-container" 
                  className="bg-zinc-50/50 dark:bg-zinc-950/30 p-5 rounded-xl border border-zinc-150 dark:border-zinc-800/80 space-y-4 animate-slide-down"
                >
                  <div className="flex items-center justify-between border-b border-zinc-150 dark:border-zinc-800/80 pb-2">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-800 dark:text-zinc-100 font-sans flex items-center gap-1.5">
                      {isEditingSupplier ? <Edit2 className="h-3.5 w-3.5 text-amber-500" /> : <Plus className="h-3.5 w-3.5 text-brand" />}
                      {isEditingSupplier ? 'Editar Parceiro' : 'Cadastrar Novo Parceiro'}
                    </h3>
                    <button 
                      onClick={resetSupplierForm}
                      className="text-[10px] text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-white uppercase font-mono bg-zinc-200 dark:bg-zinc-800 px-2 py-1 rounded cursor-pointer"
                    >
                      Cancelar
                    </button>
                  </div>

                  <form onSubmit={handleSubmitSupplier} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Nome */}
                    <div className="space-y-1.5">
                      <label className="block text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
                        Nome / Razão Social <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="Ex: Método Telecomunicações S.A."
                        value={supplierName}
                        onChange={(e) => setSupplierName(e.target.value)}
                        className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 focus:border-brand outline-none transition-all font-sans"
                      />
                    </div>

                    {/* Empresa */}
                    <div className="space-y-1.5">
                      <label className="block text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
                        Empresa
                      </label>
                      <input
                        type="text"
                        placeholder="Ex: UM Telecom, Vectra, Starlink"
                        value={supplierCompany}
                        onChange={(e) => setSupplierCompany(e.target.value)}
                        className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 focus:border-brand outline-none transition-all font-sans"
                      />
                    </div>

                    {/* Contato */}
                    <div className="space-y-1.5">
                      <label className="block text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
                        Contato (Telefone / E-mail)
                      </label>
                      <input
                        type="text"
                        placeholder="Ex: (81) 98888-7777 ou comercial@metodo.com"
                        value={supplierContact}
                        onChange={(e) => setSupplierContact(e.target.value)}
                        className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 focus:border-brand outline-none transition-all font-sans"
                      />
                    </div>

                    {/* CNPJ */}
                    <div className="space-y-1.5">
                      <label className="block text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
                        CNPJ
                      </label>
                      <input
                        type="text"
                        placeholder="Ex: 00.000.000/0000-00"
                        value={supplierCnpj}
                        onChange={(e) => setSupplierCnpj(formatCNPJ(e.target.value))}
                        className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 focus:border-brand outline-none transition-all font-mono"
                      />
                    </div>

                    {/* CPF */}
                    <div className="space-y-1.5">
                      <label className="block text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
                        CPF
                      </label>
                      <input
                        type="text"
                        placeholder="Ex: 000.000.000-00"
                        value={supplierCpf}
                        onChange={(e) => setSupplierCpf(formatCPF(e.target.value))}
                        className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 focus:border-brand outline-none transition-all font-mono"
                      />
                    </div>

                    {/* Área de Atuação (Multi-seleção) */}
                    <div className="space-y-1.5 md:col-span-2">
                      <label className="block text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
                        Área de Atuação <span className="text-rose-500">*</span> (Selecione uma ou mais)
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {((currentUser.role === 'admin') ? ['RMR', 'Interior', 'Noronha', 'Gestão'] : ['RMR', 'Interior', 'Noronha']).map((area) => {
                          const isSelected = supplierAreas.includes(area);
                          return (
                            <button
                              key={area}
                              type="button"
                              onClick={() => {
                                if (isSelected) {
                                  setSupplierAreas(supplierAreas.filter(a => a !== area));
                                } else {
                                  setSupplierAreas([...supplierAreas, area]);
                                }
                              }}
                              className={`flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-xl border transition-all cursor-pointer select-none ${
                                isSelected
                                  ? 'bg-brand/10 border-brand text-brand dark:bg-brand/20 dark:border-brand/80'
                                  : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-700'
                              }`}
                            >
                              <div className={`w-3.5 h-3.5 rounded flex items-center justify-center border transition-all ${
                                isSelected 
                                  ? 'bg-brand border-brand text-white' 
                                  : 'border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800'
                              }`}>
                                {isSelected && (
                                  <svg className="w-2 h-2 fill-current text-white" viewBox="0 0 20 20">
                                    <path d="M0 11l2-2 5 5L18 3l2 2L7 18z"/>
                                  </svg>
                                )}
                              </div>
                              <span>{area}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Endereço */}
                    <div className="space-y-1.5 md:col-span-2">
                      <label className="block text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
                        Endereço Completo
                      </label>
                      <input
                        type="text"
                        placeholder="Ex: Av. Governador Agamenon Magalhães, 1200 - Recife/PE"
                        value={supplierAddress}
                        onChange={(e) => setSupplierAddress(e.target.value)}
                        className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 focus:border-brand outline-none transition-all font-sans"
                      />
                    </div>

                    {/* Submit Button */}
                    <div className="md:col-span-2 pt-2 flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={resetSupplierForm}
                        className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-350 text-xs font-bold rounded-xl transition-all cursor-pointer"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        className="bg-brand hover:opacity-95 text-white font-black text-xs uppercase tracking-wider py-2 px-4 rounded-xl flex items-center gap-2 cursor-pointer shadow-md transition-all duration-150"
                      >
                        <Save className="h-4 w-4 text-white" />
                        <span>{isEditingSupplier ? 'Salvar Alterações' : 'Salvar Parceiro'}</span>
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* Partner list table */}
              <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/20 dark:bg-zinc-950/20">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/50">
                      <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-sans">Parceiro</th>
                      <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-sans">Empresa</th>
                      <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-sans">CNPJ</th>
                      <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-sans">CPF</th>
                      <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-sans">Contato</th>
                      <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-sans">Endereço</th>
                      {isAdmin && <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-sans">Ações</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-150 dark:divide-zinc-800/50">
                    {filteredSuppliers.length === 0 ? (
                      <tr>
                        <td colSpan={isAdmin ? 7 : 6} className="px-4 py-10 text-center text-xs text-zinc-500 italic font-sans">
                          Nenhum parceiro registrado ou correspondente à busca.
                        </td>
                      </tr>
                    ) : (
                    filteredSuppliers.map((sup) => (
                      <tr key={sup.id} className="hover:bg-brand/5 dark:hover:bg-zinc-900/40 transition-colors group">
                        {/* Nome do Parceiro */}
                        <td className="px-4 py-3.5">
                          <span className="block text-xs font-bold text-zinc-800 dark:text-zinc-100 font-sans group-hover:text-brand transition-colors">
                            {sup.nome}
                          </span>
                          {sup.areasAtuacao && sup.areasAtuacao.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {sup.areasAtuacao.map((area) => (
                                <span key={area} className="text-[9px] px-1.5 py-0.5 font-bold uppercase rounded bg-brand/10 text-brand dark:bg-brand/20 shrink-0">
                                  {area}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>

                        {/* Empresa */}
                        <td className="px-4 py-3.5">
                          {sup.empresa ? (
                            <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300 font-sans">
                              {sup.empresa}
                            </span>
                          ) : (
                            <span className="text-[10px] text-zinc-400 italic font-sans">-</span>
                          )}
                        </td>

                        {/* CNPJ */}
                        <td className="px-4 py-3.5">
                          {sup.cnpj ? (
                            <span className="text-[10px] text-zinc-700 dark:text-zinc-300 font-mono">{sup.cnpj}</span>
                          ) : (
                            <span className="text-[10px] text-zinc-400 italic font-sans">-</span>
                          )}
                        </td>

                        {/* CPF */}
                        <td className="px-4 py-3.5">
                          {sup.cpf ? (
                            <span className="text-[10px] text-zinc-700 dark:text-zinc-300 font-mono">{sup.cpf}</span>
                          ) : (
                            <span className="text-[10px] text-zinc-400 italic font-sans">-</span>
                          )}
                        </td>

                        {/* Contato */}
                        <td className="px-4 py-3.5">
                          {sup.contato ? (
                            <div className="flex items-center gap-1.5 text-zinc-700 dark:text-zinc-300">
                              <Phone className="h-3 w-3 text-zinc-400 dark:text-zinc-500 shrink-0" />
                              <span className="text-[11px] font-medium font-sans leading-none">{sup.contato}</span>
                            </div>
                          ) : (
                            <span className="text-[10px] text-zinc-450 italic font-sans">-</span>
                          )}
                        </td>

                        {/* Endereço */}
                        <td className="px-4 py-3.5">
                          {sup.endereco ? (
                            <div className="flex items-start gap-1.5 text-zinc-600 dark:text-zinc-400">
                              <MapPin className="h-3 w-3 text-zinc-400 dark:text-zinc-500 mt-0.5 shrink-0" />
                              <span className="text-[10px] leading-snug font-sans max-w-[200px] block truncate" title={sup.endereco}>
                                {sup.endereco}
                              </span>
                            </div>
                          ) : (
                            <span className="text-[10px] text-zinc-450 italic font-sans">-</span>
                          )}
                        </td>

                        {/* Ações (Apenas admin) */}
                        {isAdmin && (
                          <td className="px-4 py-3.5 text-right">
                            <div className="inline-flex gap-1">
                              <button
                                onClick={() => handleEditSupplier(sup)}
                                className="p-1 text-zinc-400 dark:text-zinc-500 hover:text-brand dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800/80 rounded transition-all cursor-pointer"
                                title="Editar parceiro"
                              >
                                <Edit2 className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteSupplier(sup.id, sup.nome)}
                                className="p-1 text-zinc-400 dark:text-zinc-500 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/20 rounded transition-all cursor-pointer"
                                title="Remover parceiro"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                  </tbody>
                </table>
              </div>

            </div>
          </div>
        )}

        {/* ==================== COLUMN 2: LPU DE ATIVIDADES (5/12) ==================== */}
        {activeSection === 'lpu' && (
          <div className="w-full space-y-6">
          <div className="bg-white dark:bg-zinc-900 p-6 rounded-3xl border border-zinc-200/85 dark:border-zinc-800/85 shadow-xs space-y-5">
            
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-150 dark:border-zinc-800/80">
              <div className="flex items-center gap-2.5">
                <TrendingUp className="h-5 w-5 text-amber-500" />
                <h2 className="text-base font-bold text-zinc-900 dark:text-white font-sans">LPU de Serviços</h2>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 w-full sm:w-auto">
                <div className="relative max-w-[180px] w-full">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-zinc-400 dark:text-zinc-500" />
                  <input
                    type="text"
                    placeholder="Filtrar LPU..."
                    value={lpuSearch}
                    onChange={(e) => setLpuSearch(e.target.value)}
                    className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 focus:border-brand rounded-xl pl-8 pr-3 py-1.5 text-[11px] text-zinc-800 dark:text-zinc-200 placeholder-zinc-455 dark:placeholder-zinc-500 transition-all outline-none font-sans"
                  />
                </div>
                {isAdmin && (
                  <button
                    onClick={() => {
                      setShowLpuForm(!showLpuForm);
                      if (showLpuForm) {
                        resetLpuForm();
                      }
                    }}
                    className="flex items-center justify-center gap-2 px-4 py-2 bg-brand hover:bg-brand/90 active:bg-brand/95 text-white text-xs font-black tracking-wide rounded-xl transition-all cursor-pointer shadow-md select-none whitespace-nowrap"
                  >
                    <Plus className="h-4 w-4 text-white" />
                    <span>CADASTRAR ATIVIDADE</span>
                    {showLpuForm ? (
                      <ChevronUp className="h-3.5 w-3.5 text-white" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5 text-white" />
                    )}
                  </button>
                )}
              </div>
            </div>

            {/* Admin insert/update activity form */}
            {isAdmin && showLpuForm && (
              <div 
                id="lpu-form-container" 
                className="bg-zinc-50/50 dark:bg-zinc-950/30 p-4 rounded-xl border border-zinc-150 dark:border-zinc-800/80 space-y-4 animate-slide-down"
              >
                <div className="flex items-center justify-between border-b border-zinc-150 dark:border-zinc-800 pb-2">
                  <h3 className="text-[11px] font-black uppercase tracking-wider text-zinc-800 dark:text-zinc-100 font-mono flex items-center gap-1.5">
                    {isEditingLpuItem ? <Edit2 className="h-3.5 w-3.5 text-amber-500" /> : <Plus className="h-3.5 w-3.5 text-brand" />}
                    {isEditingLpuItem ? 'Editar Atividade LPU' : 'Nova Atividade LPU'}
                  </h3>
                  <button 
                    onClick={resetLpuForm}
                    className="text-[9px] text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-white uppercase font-mono bg-zinc-200 dark:bg-zinc-800 px-1.5 py-0.5 rounded cursor-pointer"
                  >
                    Cancelar
                  </button>
                </div>

                <form onSubmit={handleSubmitLpuItem} className="space-y-3.5">
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
                      Tipo de Atividade / Serviço <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: Instalação de Ponto de Rede Adicional"
                      value={lpuActivity}
                      onChange={(e) => setLpuActivity(e.target.value)}
                      className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 focus:border-brand outline-none transition-all font-sans"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
                      Preço Unitário (BRL) <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-zinc-405 dark:text-zinc-500 text-xs font-mono">
                        R$
                      </span>
                      <input
                        type="text"
                        required
                        placeholder="Ex: 150,00"
                        value={lpuValue}
                        onChange={(e) => setLpuValue(e.target.value)}
                        className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-9 pr-3 py-2 text-xs text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 focus:border-brand outline-none transition-all font-mono"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
                      Área Representada <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={lpuArea}
                      onChange={(e) => setLpuArea(e.target.value as 'RMR' | 'Interior' | 'Noronha' | 'Gestão')}
                      className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-800 dark:text-zinc-200 outline-none transition-all font-sans cursor-pointer"
                    >
                      <option value="RMR">RMR</option>
                      <option value="Interior">Interior</option>
                      <option value="Noronha">Noronha</option>
                      {currentUser.role === 'admin' && <option value="Gestão">Gestão</option>}
                    </select>
                  </div>

                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={resetLpuForm}
                      className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-350 text-xs font-bold rounded-xl transition-all cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="bg-brand hover:opacity-95 text-white font-black text-xs uppercase tracking-wider py-2 px-5 rounded-xl flex items-center gap-1.5 cursor-pointer shadow-md transition-all duration-150"
                    >
                      <Save className="h-3.5 w-3.5 text-white" />
                      <span>{isEditingLpuItem ? 'Salvar Alteração' : 'Adicionar à LPU'}</span>
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* List of LPU Items */}
            <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/20 dark:bg-zinc-950/20">
              <div className="max-h-[350px] overflow-y-auto divide-y divide-zinc-150 dark:divide-zinc-800/50">
                {filteredLpuItems.length === 0 ? (
                  <div className="p-8 text-center text-xs text-zinc-500 italic font-sans">
                    Nenhuma atividade cadastrada na LPU ainda.
                  </div>
                ) : (
                  filteredLpuItems.map((item) => (
                    <div key={item.id} className="p-3.5 flex items-center justify-between hover:bg-brand/5 dark:hover:bg-zinc-900/45 transition-colors group">
                      <div className="space-y-1 pr-4 min-w-0">
                        <span className="block text-xs font-bold text-zinc-800 dark:text-zinc-100 truncate font-sans">
                          {item.atividade}
                        </span>
                        {item.area && (
                          <span className="inline-block text-[9px] px-1.5 py-0.5 font-bold uppercase rounded bg-zinc-200 dark:bg-zinc-800 text-zinc-650 dark:text-zinc-300 mt-1">
                            Área: {item.area}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-xs font-black text-emerald-600 dark:text-emerald-400 font-mono">
                          {formatCurrencyValue(item.valor)}
                        </span>
                        
                        {/* Admin actions */}
                        {isAdmin && (
                          <div className="inline-flex gap-0.5 opacity-65 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => handleEditLpuItem(item)}
                              className="p-1 text-zinc-400 dark:text-zinc-500 hover:text-brand dark:hover:text-white rounded hover:bg-zinc-100 dark:hover:bg-zinc-800/50"
                              title="Editar valor"
                            >
                              <Edit2 className="h-3 w-3" />
                            </button>
                            <button
                              onClick={() => handleDeleteLpuItem(item.id, item.atividade)}
                              className="p-1 text-zinc-400 dark:text-zinc-500 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/20 rounded"
                              title="Remover da LPU"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>
          </div>
        )}

      </div>

      {/* Custom Confirmation Modal for Deleting Partner */}
      {supplierToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3.5xl max-w-sm w-full p-6 shadow-2xl animate-slide-in">
            <div className="flex items-center gap-3 text-rose-600 pb-3 border-b border-zinc-150 dark:border-zinc-800">
              <AlertTriangle className="h-5 w-5" />
              <h3 className="font-sans font-black text-sm text-zinc-900 dark:text-white uppercase tracking-wider">Confirmar Exclusão</h3>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-4 leading-relaxed font-sans">
              Você tem certeza que deseja realmente remover o parceiro <strong className="text-zinc-800 dark:text-zinc-200">"{supplierToDelete.name}"</strong>? Esta ação é irreversível e removerá permanentemente o cadastro.
            </p>
            <div className="flex items-center justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={() => setSupplierToDelete(null)}
                className="px-4 py-2 text-xs font-bold bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-750 text-zinc-655 dark:text-zinc-300 rounded-xl cursor-pointer transition-colors"
               >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmDeleteSupplier}
                className="px-5 py-2 text-xs font-black uppercase tracking-wider bg-rose-600 hover:bg-rose-750 text-white rounded-xl cursor-pointer transition-colors shadow-xs"
              >
                Remover
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Confirmation Modal for Deleting LPU Item */}
      {lpuItemToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3.5xl max-w-sm w-full p-6 shadow-2xl animate-slide-in">
            <div className="flex items-center gap-3 text-rose-600 pb-3 border-b border-zinc-150 dark:border-zinc-800">
              <AlertTriangle className="h-5 w-5" />
              <h3 className="font-sans font-black text-sm text-zinc-900 dark:text-white uppercase tracking-wider">Confirmar Exclusão LPU</h3>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-4 leading-relaxed font-sans">
              Você tem certeza que deseja remover a atividade <strong className="text-zinc-800 dark:text-zinc-200">"{lpuItemToDelete.name}"</strong> da LPU de Serviços? Esta ação é irreversível.
            </p>
            <div className="flex items-center justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={() => setLpuItemToDelete(null)}
                className="px-4 py-2 text-xs font-bold bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-750 text-zinc-655 dark:text-zinc-300 rounded-xl cursor-pointer transition-colors"
               >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmDeleteLpuItem}
                className="px-5 py-2 text-xs font-black uppercase tracking-wider bg-rose-600 hover:bg-rose-750 text-white rounded-xl cursor-pointer transition-colors shadow-xs"
              >
                Remover
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
