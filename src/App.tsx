/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Contract, PvfPrices, UserSession, ActiveTab } from './types';
import { INITIAL_CONTRACTS, INITIAL_PRICES, getContractPvfTotal, getContractValue, formatCurrency } from './data';
import { getStoredSession, clearSession } from './auth-sim';
import AuthWindow from './components/AuthWindow';
import Dashboard from './components/Dashboard';
import ContractTable from './components/ContractTable';
import UserManagement from './components/UserManagement';

import UmTelecomBilling from './components/UmTelecomBilling';
import VectraBilling from './components/VectraBilling';
import StarlinkBilling from './components/StarlinkBilling';
import ContactCenterBilling from './components/ContactCenterBilling';
import { db, handleFirestoreError, OperationType } from './firebase';
import { collection, doc, getDocs, getDoc, setDoc, deleteDoc, onSnapshot, writeBatch } from 'firebase/firestore';
import { 
  Building2, 
  TrendingUp, 
  LayoutDashboard, 
  TableProperties, 
  LogOut, 
  Sun, 
  Moon, 
  ShieldCheck, 
  Layers,
  Sparkles,
  HelpCircle,
  Database,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Phone,
  Headset,
  Activity,
  Award,
  Lock,
  Compass,
  Users,
  CalendarClock,
  Zap,
  Network,
  Globe
} from 'lucide-react';

export default function App() {
  // Authentication Session State
  const [user, setUser] = useState<UserSession | null>(null);
  
  // Contracts and pricing states
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [prices, setPrices] = useState<PvfPrices>(INITIAL_PRICES);
  
  // Custom states
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [darkMode, setDarkMode] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem('portal_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });
  
  // Collapsible Submenu states
  const [faturamentoPeiiOpen, setFaturamentoPeiiOpen] = useState(false);
  const [pontoVozFixoOpen, setPontoVozFixoOpen] = useState(true);
  const [contactCenterOpen, setContactCenterOpen] = useState(true);

  // Initialize and load persistent user, contracts and system prices
  useEffect(() => {
    // 1. Auth session load
    const storedUser = getStoredSession();
    if (storedUser) {
      setUser(storedUser);
    }

    // 2. Dark mode configuration load with system preference fallback
    try {
      const stored = localStorage.getItem('portal_gestao_dark');
      const isSystemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      const shouldUseDark = stored === 'true' || (stored === null && isSystemDark);
      
      if (shouldUseDark) {
        setDarkMode(true);
        document.documentElement.classList.add('dark');
      } else {
        setDarkMode(false);
        document.documentElement.classList.remove('dark');
      }
    } catch {
      setDarkMode(false);
    }

    // 3. Setup real-time Firestore sync
    let unsubContracts: (() => void) | null = null;
    let unsubPrices: (() => void) | null = null;
    let isActive = true;

    const setupFirestoreSync = () => {
      try {
        if (!isActive) return;

        // Subscribe Real-time Contracts
        unsubContracts = onSnapshot(collection(db, 'contracts'), async (snapshot) => {
          if (snapshot.empty) {
            if (snapshot.metadata.fromCache) {
              // Ignore empty snapshot from local cache to prevent default overwrites during connection phase
              return;
            }
            if (localStorage.getItem('portal_gestao_contracts_seeded') === 'true') {
              console.log("Database cleared of contracts by preference, skipping automatic seeding.");
              if (isActive) {
                setContracts([]);
                setIsInitializing(false);
              }
              return;
            }
            console.log("Sem contratos cadastrados no banco de dados, populando conjunto padrão...");
            try {
              const batch = writeBatch(db);
              INITIAL_CONTRACTS.forEach(c => {
                batch.set(doc(db, 'contracts', c.id), c);
              });
              await batch.commit();
              localStorage.setItem('portal_gestao_contracts_seeded', 'true');
            } catch (writeErr) {
              console.error("Falha ao injetar contratos padrões no Firestore:", writeErr);
            }
            return;
          }

          localStorage.setItem('portal_gestao_contracts_seeded', 'true');
          const list: Contract[] = [];
          snapshot.forEach(docSnap => {
            list.push(docSnap.data() as Contract);
          });
          list.sort((a, b) => a.id.localeCompare(b.id));
          if (isActive) {
            setContracts(list);
            setIsInitializing(false);
          }
        }, (error) => {
          console.error("Erro na leitura em tempo real dos contratos, usando local de fallback:", error);
          const storedContracts = localStorage.getItem('portal_gestao_contracts');
          if (storedContracts) {
            setContracts(JSON.parse(storedContracts));
          } else {
            setContracts(INITIAL_CONTRACTS);
          }
          if (isActive) {
            setIsInitializing(false);
          }
        });

        // Subscribe Real-time Prices
        unsubPrices = onSnapshot(doc(db, 'systemPrices', 'current'), async (docSnap) => {
          if (!docSnap.exists()) {
            if ((docSnap as any).metadata?.fromCache) {
              // Ignore if empty snapshot from local cache to prevent default overwrites during connection phase
              return;
            }
            console.log("Sem tabelas tarifárias no banco de dados, populando conjunto padrão...");
            try {
              await setDoc(doc(db, 'systemPrices', 'current'), INITIAL_PRICES);
            } catch (writeErr) {
              console.error("Falha ao salvar tarifas padrão no Firestore:", writeErr);
            }
            return;
          }
          if (isActive) {
            setPrices(docSnap.data() as PvfPrices);
          }
        }, (error) => {
          console.error("Erro na leitura das tarifas, usando local de fallback:", error);
          const storedPrices = localStorage.getItem('portal_gestao_prices');
          if (storedPrices) {
            setPrices(JSON.parse(storedPrices));
          } else {
            setPrices(INITIAL_PRICES);
          }
        });

      } catch (err) {
        console.error("Falha ao assinar Firestore, usando local de fallback:", err);
        const storedContracts = localStorage.getItem('portal_gestao_contracts');
        if (storedContracts) {
          setContracts(JSON.parse(storedContracts));
        } else {
          setContracts(INITIAL_CONTRACTS);
        }
        const storedPrices = localStorage.getItem('portal_gestao_prices');
        if (storedPrices) {
          setPrices(JSON.parse(storedPrices));
        } else {
          setPrices(INITIAL_PRICES);
        }
        if (isActive) {
          setIsInitializing(false);
        }
      }
    };

    setupFirestoreSync();

    return () => {
      isActive = false;
      if (unsubContracts) unsubContracts();
      if (unsubPrices) unsubPrices();
    };
  }, []);

  // Update classes and configurations for dark mode toggles
  const toggleDarkMode = () => {
    const newVal = !darkMode;
    setDarkMode(newVal);
    localStorage.setItem('portal_gestao_dark', String(newVal));
    if (newVal) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  // Sync state modifications of contracts
  const handleUpdateContracts = async (newContracts: Contract[]) => {
    const previousContracts = [...contracts];

    // Identify deleted contracts
    const currentIds = new Set(newContracts.map(c => c.id));
    const deletedContracts = contracts.filter(c => !currentIds.has(c.id));
    const updatedContracts = newContracts.filter(c => {
      const existing = contracts.find(orig => orig.id === c.id);
      if (!existing) return true;
      return JSON.stringify(existing) !== JSON.stringify(c);
    });

    // Optimistic UI state update
    setContracts(newContracts);
    localStorage.setItem('portal_gestao_contracts', JSON.stringify(newContracts));

    // Sync to Firestore
    try {
      for (const c of deletedContracts) {
        await deleteDoc(doc(db, 'contracts', c.id));
      }
      for (const c of updatedContracts) {
        await setDoc(doc(db, 'contracts', c.id), c);
      }
    } catch (err) {
      console.error("Erro ao sincronizar contratos no Firestore:", err);

      // Rollback optimistic state
      setContracts(previousContracts);
      localStorage.setItem('portal_gestao_contracts', JSON.stringify(previousContracts));

      try {
        handleFirestoreError(err, OperationType.WRITE, 'contracts');
      } catch (formattedErr) {
        console.error(formattedErr);
        throw formattedErr;
      }
      throw err;
    }
  };

  // Sync state modifications of unit prices
  const handleUpdatePrices = async (newPrices: PvfPrices) => {
    const previousPrices = { ...prices };

    // Optimistic UI state update
    setPrices(newPrices);
    localStorage.setItem('portal_gestao_prices', JSON.stringify(newPrices));

    try {
      await setDoc(doc(db, 'systemPrices', 'current'), newPrices);
    } catch (err) {
      console.error("Erro ao sincronizar tarifas no Firestore:", err);

      // Rollback optimistic state
      setPrices(previousPrices);
      localStorage.setItem('portal_gestao_prices', JSON.stringify(previousPrices));

      try {
        handleFirestoreError(err, OperationType.WRITE, 'systemPrices/current');
      } catch (formattedErr) {
        console.error(formattedErr);
        throw formattedErr;
      }
      throw err;
    }
  };

  // Logout session handler
  const handleLogout = () => {
    clearSession();
    setUser(null);
    setActiveTab('dashboard');
    setIsMobileSidebarOpen(false);
  };

  // Filter contracts for restricted client-level users
  const visibleContracts = useMemo(() => {
    if (user && user.role === 'cliente') {
      const allowed = user.secretarias || [];
      return contracts.filter(c => allowed.includes(c.secretaria));
    }
    return contracts;
  }, [contracts, user]);

  // Compute live high-level statistics for header quick stats
  const activeContractsCount = visibleContracts.filter(c => {
    const s = (c.status || '').trim().toLowerCase();
    return s === 'ativo' || s === 'ativa';
  }).length;

  const activePvfSum = visibleContracts.filter(c => {
    const s = (c.status || '').trim().toLowerCase();
    return s === 'ativo' || s === 'ativa';
  }).reduce((sum, c) => sum + getContractPvfTotal(c), 0);

  const activeBillingSum = visibleContracts.filter(c => {
    const s = (c.status || '').trim().toLowerCase();
    return s === 'ativo' || s === 'ativa';
  }).reduce((sum, c) => sum + getContractValue(c, prices), 0);

  if (isInitializing) {
    return (
      <div className="min-h-screen bg-[#f8fafc] dark:bg-zinc-950 flex flex-col items-center justify-center font-sans animate-fade-in">
        <div className="space-y-4 text-center">
          <div className="relative">
            <div className="h-12 w-12 rounded-full border-4 border-brand/20 border-t-brand animate-spin mx-auto"></div>
          </div>
          <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
            Carregando...
          </p>
        </div>
      </div>
    );
  }

  // Mandatory Authentication layer
  if (!user) {
    return <AuthWindow onLoginSuccess={(session) => setUser(session)} />;
  }

  // Sidebar navigation links descriptor
  const navigationItems = [
    {
      id: 'dashboard' as ActiveTab,
      label: 'Painel Gerencial',
      desc: 'Indicadores, KPI e métricas consolidado',
      icon: LayoutDashboard,
      badge: 'Geral'
    },
    {
      id: 'contratos' as ActiveTab,
      label: 'Faturamento PEII',
      desc: 'Cadastro e faturamento de PVFs',
      icon: TableProperties,
      badge: `${visibleContracts.length} Itens`
    },
    ...(user && user.role === 'admin' ? [{
      id: 'usuarios' as ActiveTab,
      label: 'Usuários',
      desc: 'Controle de contas e liberação',
      icon: Users,
      badge: 'Admin'
    }] : [])
  ];

  const getBreadcrumbTitle = () => {
    switch (activeTab) {
      case 'dashboard': return 'Painel Gerencial';
      case 'contratos': return 'Faturamento PVF';
      case 'historico': return 'Histórico de Faturamento';
      case 'usuarios': return 'Controle de Usuários';
      case 'contact-center': return 'Faturamento Contact Center';
      case 'um-telecom': return 'Faturamento Infra e Elétrica PCM';
      case 'vectra': return 'Faturamento Vectra';
      case 'starlink': return 'Implantação Starlink';
      default: return 'Portal';
    }
  };

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-gradient-to-br from-[#f8fafc] via-[#edf4fe] to-[#fdf4e3] dark:from-[#111113] dark:via-zinc-950 dark:to-[#0c0c0e] text-zinc-800 dark:text-zinc-100 flex transition-colors duration-200 font-sans">      {/* ======================================================== */}
      {/* 1. DESKTOP SIDEBAR (Static docked Sidebar)                 */}
      {/* ======================================================== */}
      <aside className={`hidden xl:flex xl:flex-col ${isSidebarCollapsed ? 'xl:w-20' : 'xl:w-64'} xl:fixed xl:inset-y-0 xl:left-0 bg-brand-deep dark:bg-zinc-950 border-r border-brand-border/20 dark:border-zinc-900 text-zinc-200 z-40 justify-between select-none shadow-xl transition-all duration-300 print:hidden`}>
        <div>
          {/* Brand area */}
          <div className={`px-4 py-5 border-b border-brand-border/10 dark:border-zinc-900 bg-brand-deep dark:bg-zinc-950 flex items-center ${isSidebarCollapsed ? 'justify-center' : 'justify-between'} gap-2`}>
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center overflow-hidden shadow-md shrink-0 transform hover:scale-105 transition-transform duration-200" title="Método Telecom">
                <div className="w-8 h-8 overflow-hidden flex items-center justify-center rounded-lg bg-transparent">
                  <img 
                    src="https://operacaointeligente.metodotelecom.com.br/data/logo2.png" 
                    alt="Método Telecom Logo" 
                    className="h-full w-full object-contain p-0.5 select-none pointer-events-none"
                    referrerPolicy="no-referrer"
                  />
                </div>
              </div>
              {!isSidebarCollapsed && (
                <div className="leading-tight animate-fade-in">
                  <span className="block text-sm font-black tracking-wider uppercase text-white font-sans">
                    OPERAÇÃO PE
                  </span>
                  <span className="text-[9px] text-zinc-400 font-mono font-bold block leading-none mt-1">
                    Método Telecom
                  </span>
                </div>
              )}
            </div>

            {/* Collapse toggle button */}
            <button
              onClick={() => {
                const newValue = !isSidebarCollapsed;
                setIsSidebarCollapsed(newValue);
                localStorage.setItem('portal_sidebar_collapsed', String(newValue));
              }}
              className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-400 hover:text-white transition-colors cursor-pointer shrink-0"
              title={isSidebarCollapsed ? "Expandir Menu" : "Recolher Menu"}
            >
              {isSidebarCollapsed ? (
                <ChevronRight className="h-4 w-4" />
              ) : (
                <ChevronLeft className="h-4 w-4" />
              )}
            </button>
          </div>

          {/* Navigation group */}
          <div className="px-4 py-6 flex flex-col gap-1.5 overflow-y-auto max-h-[calc(100vh-180px)] scrollbar-none">
            {/* Title / Section Category */}
            {!isSidebarCollapsed && (
              <span className="block px-3 text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">
                Menu Principal
              </span>
            )}

            {/* Painel Gerencial (Dashboard) */}
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center px-1' : 'gap-3 px-3'} py-2.5 rounded-xl text-left transition-all duration-200 cursor-pointer ${
                activeTab === 'dashboard'
                  ? 'bg-brand-medium/50 dark:bg-zinc-900 text-white font-bold shadow-md shadow-brand-deep/30'
                  : 'hover:bg-brand-medium/20 dark:hover:bg-zinc-900/40 text-zinc-300 hover:text-white'
              }`}
              title={isSidebarCollapsed ? "Painel Gerencial" : undefined}
            >
              <LayoutDashboard className={`h-4.5 w-4.5 shrink-0 ${activeTab === 'dashboard' ? 'text-brand-light dark:text-brand animate-pulse' : 'text-zinc-400'}`} />
              {!isSidebarCollapsed && <span className="text-xs">Painel Gerencial</span>}
            </button>

            {/* Faturamento PEII (Collapsible Menu Level 1) */}
            {!isSidebarCollapsed ? (
              <div className="space-y-1">
                <button
                  onClick={() => setFaturamentoPeiiOpen(!faturamentoPeiiOpen)}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left transition-all duration-200 hover:bg-brand-medium/20 dark:hover:bg-zinc-900/40 text-zinc-300 hover:text-white cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <TableProperties className="h-4.5 w-4.5 shrink-0 text-zinc-400" />
                    <span className="text-xs">Faturamento PEII</span>
                  </div>
                  {faturamentoPeiiOpen ? (
                    <ChevronDown className="h-3.5 w-3.5 text-zinc-400" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 text-zinc-400" />
                  )}
                </button>

                {/* Submenus of Faturamento PEII */}
                <AnimatePresence initial={false}>
                  {faturamentoPeiiOpen && (
                    <motion.div 
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25, ease: "easeInOut" }}
                      className="overflow-hidden pl-4 ml-2.5 border-l border-brand-border/20 dark:border-zinc-900 space-y-1.5 py-1"
                    >
                      {/* Ponto de Voz Fixo (Direct option) */}
                      <button
                        onClick={() => setActiveTab('contratos')}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-all duration-200 cursor-pointer ${
                          activeTab === 'contratos'
                            ? 'bg-brand/45 dark:bg-zinc-850 text-white font-bold'
                            : 'hover:bg-brand-medium/15 dark:hover:bg-zinc-900/35 text-zinc-350 hover:text-white'
                        }`}
                      >
                        <Phone className={`h-4 w-4 shrink-0 ${activeTab === 'contratos' ? 'text-brand-light dark:text-brand' : 'text-zinc-500'}`} />
                        <span className="text-xs">Ponto de Voz Fixo</span>
                      </button>

                      {/* Contact Center (Direct option) */}
                      <button
                        onClick={() => setActiveTab('contact-center')}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-all duration-200 cursor-pointer ${
                          activeTab === 'contact-center'
                            ? 'bg-brand/45 dark:bg-zinc-850 text-white font-bold'
                            : 'hover:bg-brand-medium/15 dark:hover:bg-zinc-900/35 text-zinc-350 hover:text-white'
                        }`}
                      >
                        <Headset className={`h-4 w-4 shrink-0 ${activeTab === 'contact-center' ? 'text-brand-light dark:text-brand' : 'text-zinc-500'}`} />
                        <span className="text-xs">Contact Center</span>
                      </button>

                      {/* Um Telecom (Direct option) */}
                      <button
                        onClick={() => setActiveTab('um-telecom')}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-all duration-200 cursor-pointer ${
                          activeTab === 'um-telecom'
                            ? 'bg-brand/45 dark:bg-zinc-850 text-white font-bold'
                            : 'hover:bg-brand-medium/15 dark:hover:bg-zinc-900/35 text-zinc-350 hover:text-white'
                        }`}
                      >
                        <Zap className={`h-4 w-4 shrink-0 ${activeTab === 'um-telecom' ? 'text-brand-light dark:text-brand' : 'text-zinc-500'}`} />
                        <span className="text-xs">Um Telecom</span>
                      </button>

                      {/* Implantação Starlink (Direct option) */}
                      <button
                        onClick={() => setActiveTab('starlink')}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-all duration-200 cursor-pointer ${
                          activeTab === 'starlink'
                            ? 'bg-brand/45 dark:bg-zinc-850 text-white font-bold'
                            : 'hover:bg-brand-medium/15 dark:hover:bg-zinc-900/35 text-zinc-350 hover:text-white'
                        }`}
                      >
                        <Globe className={`h-4 w-4 shrink-0 ${activeTab === 'starlink' ? 'text-brand-light dark:text-brand' : 'text-zinc-500'}`} />
                        <span className="text-xs">Starlink</span>
                      </button>

                      {/* Vectra (Direct option) */}
                      <button
                        onClick={() => setActiveTab('vectra')}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-all duration-200 cursor-pointer ${
                          activeTab === 'vectra'
                            ? 'bg-brand/45 dark:bg-zinc-850 text-white font-bold'
                            : 'hover:bg-brand-medium/15 dark:hover:bg-zinc-900/35 text-zinc-350 hover:text-white'
                        }`}
                      >
                        <Network className={`h-4 w-4 shrink-0 ${activeTab === 'vectra' ? 'text-brand-light dark:text-brand' : 'text-zinc-500'}`} />
                        <span className="text-xs flex items-center justify-between w-full">
                          <span>Vectra</span>
                          <span className="text-[8px] tracking-wide font-black bg-amber-500/10 text-amber-500 dark:text-amber-400 dark:bg-amber-500/15 px-1 py-0.5 rounded font-sans uppercase">Homolog.</span>
                        </span>
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              // Collapsed alternative flat submenu direct items, clean mapping
              <div className="flex flex-col gap-1.5 py-3 border-t border-b border-brand-border/10 dark:border-zinc-900 my-1">
                {/* Ponto de Voz Fixo (Phone icon) */}
                <button
                  onClick={() => setActiveTab('contratos')}
                  className={`w-full flex items-center justify-center py-2.5 rounded-xl transition-all duration-200 cursor-pointer ${
                    activeTab === 'contratos'
                      ? 'bg-brand-medium dark:bg-zinc-900 text-white shadow-sm'
                      : 'hover:bg-brand-medium/20 text-zinc-400 hover:text-white'
                  }`}
                  title="Ponto de Voz Fixo (PVF)"
                >
                  <Phone className={`h-4.5 w-4.5 ${activeTab === 'contratos' ? 'text-brand-light dark:text-brand animate-pulse' : 'text-zinc-400'}`} />
                </button>

                {/* Contact Center (Headset icon) */}
                <button
                  onClick={() => setActiveTab('contact-center')}
                  className={`w-full flex items-center justify-center py-2.5 rounded-xl transition-all duration-200 cursor-pointer ${
                    activeTab === 'contact-center'
                      ? 'bg-brand-medium dark:bg-zinc-900 text-white shadow-sm'
                      : 'hover:bg-brand-medium/20 text-zinc-400 hover:text-white'
                  }`}
                  title="Contact Center"
                >
                  <Headset className={`h-4.5 w-4.5 ${activeTab === 'contact-center' ? 'text-brand-light dark:text-brand animate-pulse' : 'text-zinc-400'}`} />
                </button>

                {/* Um Telecom (Zap icon) */}
                <button
                  onClick={() => setActiveTab('um-telecom')}
                  className={`w-full flex items-center justify-center py-2.5 rounded-xl transition-all duration-200 cursor-pointer ${
                    activeTab === 'um-telecom'
                      ? 'bg-brand-medium dark:bg-zinc-900 text-white shadow-sm'
                      : 'hover:bg-brand-medium/20 text-zinc-400 hover:text-white'
                  }`}
                  title="Um Telecom"
                >
                  <Zap className={`h-4.5 w-4.5 ${activeTab === 'um-telecom' ? 'text-brand-light dark:text-brand animate-pulse' : 'text-zinc-400'}`} />
                </button>

                {/* Starlink (Globe icon) */}
                <button
                  onClick={() => setActiveTab('starlink')}
                  className={`w-full flex items-center justify-center py-2.5 rounded-xl transition-all duration-200 cursor-pointer ${
                    activeTab === 'starlink'
                      ? 'bg-brand-medium dark:bg-zinc-900 text-white shadow-sm'
                      : 'hover:bg-brand-medium/20 text-zinc-400 hover:text-white'
                  }`}
                  title="Starlink"
                >
                  <Globe className={`h-4.5 w-4.5 ${activeTab === 'starlink' ? 'text-brand-light dark:text-brand animate-pulse' : 'text-zinc-400'}`} />
                </button>

                {/* Vectra (Network icon) */}
                <button
                  onClick={() => setActiveTab('vectra')}
                  className={`w-full flex items-center justify-center py-2.5 rounded-xl transition-all duration-200 cursor-pointer ${
                    activeTab === 'vectra'
                      ? 'bg-brand-medium dark:bg-zinc-900 text-white shadow-sm'
                      : 'hover:bg-brand-medium/20 text-zinc-400 hover:text-white'
                  }`}
                  title="Vectra"
                >
                  <Network className={`h-4.5 w-4.5 ${activeTab === 'vectra' ? 'text-brand-light dark:text-brand animate-pulse' : 'text-zinc-400'}`} />
                </button>
              </div>
            )}

            {/* Usuários (Admin) */}
            {user && user.role === 'admin' && (
              <button
                onClick={() => setActiveTab('usuarios')}
                className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center px-1' : 'gap-3 px-3'} py-2.5 rounded-xl text-left transition-all duration-200 cursor-pointer ${
                  activeTab === 'usuarios'
                    ? 'bg-brand-medium/50 dark:bg-zinc-900 text-white font-bold shadow-md shadow-brand-deep/30'
                    : 'hover:bg-brand-medium/20 dark:hover:bg-zinc-900/40 text-zinc-300 hover:text-white'
                }`}
                title={isSidebarCollapsed ? "Usuários" : undefined}
              >
                <Users className={`h-4.5 w-4.5 shrink-0 ${activeTab === 'usuarios' ? 'text-brand-light dark:text-brand' : 'text-zinc-400'}`} />
                {!isSidebarCollapsed && <span className="text-xs">Usuários</span>}
              </button>
            )}
          </div>
        </div>

        {/* User Card Profile details & controls at the base */}
        <div className={`p-4 border-t border-brand-border/10 dark:border-zinc-900/70 bg-brand-deep/95 dark:bg-zinc-950/80 ${isSidebarCollapsed ? 'space-y-4' : 'space-y-3'} print:hidden`}>
          <div className={`bg-brand-medium/30 dark:bg-zinc-900/40 p-3 rounded-xl border border-brand-border/10 dark:border-zinc-900/60 flex items-center ${isSidebarCollapsed ? 'justify-center' : 'gap-3'}`} title={`${user.displayName} (${user.role})`}>
            <div className="h-8 w-8 rounded-lg bg-brand dark:bg-zinc-800 border border-brand-light/10 text-white flex items-center justify-center font-black text-xs uppercase shrink-0">
              {user.displayName.substring(0, 2)}
            </div>
            {!isSidebarCollapsed && (
              <div className="min-w-0 flex-1 animate-fade-in">
                <span className="block text-xs font-bold text-white truncate leading-tight">
                  {user.displayName}
                </span>
                <span className="block text-[9px] text-zinc-400 truncate mt-0.5 font-mono">
                  {user.email}
                </span>
                <span className="inline-block mt-1 text-[8px] font-black uppercase tracking-wider px-1.5 py-0.2 bg-zinc-800 dark:bg-zinc-900 text-zinc-350 dark:text-zinc-404 border border-zinc-700/55 rounded font-mono">
                  {user.role}
                </span>
              </div>
            )}
          </div>

          <div className={`${isSidebarCollapsed ? 'flex flex-col gap-2' : 'grid grid-cols-2 gap-2'}`}>
            {/* Theme Toggle */}
            <button
              onClick={toggleDarkMode}
              className={`py-1.5 px-2 bg-brand-medium/20 hover:bg-brand-medium/45 dark:bg-zinc-900 dark:hover:bg-zinc-805 border border-brand-border/15 dark:border-zinc-800 hover:border-brand-medium rounded-lg transition-all cursor-pointer flex items-center justify-center text-brand-light dark:text-zinc-400 gap-1 text-[10px] ${isSidebarCollapsed ? 'w-full py-2' : ''}`}
              title="Alternar Tema"
            >
              {darkMode ? (
                <>
                  <Sun className="h-3.5 w-3.5 text-amber-500 animate-pulse" />
                  {!isSidebarCollapsed && <span>Claro</span>}
                </>
              ) : (
                <>
                  <Moon className="h-3.5 w-3.5" />
                  {!isSidebarCollapsed && <span>Escuro</span>}
                </>
              )}
            </button>

            {/* Logout button */}
            <button
              onClick={handleLogout}
              className={`py-1.5 px-2 bg-rose-950/20 hover:bg-rose-950/40 dark:bg-rose-950/10 dark:hover:bg-rose-950/25 border border-rose-900/15 dark:border-rose-900/10 text-rose-300 hover:text-rose-200 rounded-lg transition-all flex items-center justify-center cursor-pointer gap-1 text-[10px] ${isSidebarCollapsed ? 'w-full py-2' : ''}`}
              title="Sair do Portal"
            >
              <LogOut className="h-3.5 w-3.5" />
              {!isSidebarCollapsed && <span>Sair</span>}
            </button>
          </div>
        </div>
      </aside>

      {/* ======================================================== */}
      {/* 2. MOBILE DRAWER PANEL & OVERLAY LAYOUT                  */}
      {/* ======================================================== */}
      <AnimatePresence>
        {isMobileSidebarOpen && (
          <div className="fixed inset-0 z-50 xl:hidden flex">
            {/* Backdrop blur overlay with fade animation */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-xs"
              onClick={() => setIsMobileSidebarOpen(false)}
            />
            
            {/* Slider Drawer menu with spring slide animation */}
            <motion.div 
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 220 }}
              className="w-80 bg-zinc-950 border-r border-zinc-900 text-zinc-300 h-full flex flex-col justify-between relative z-50 shadow-2xl"
            >
              <div>
                {/* Drawer Header Brand area */}
                <div className="p-6 border-b border-zinc-900/80 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center overflow-hidden shadow-md shrink-0">
                      <div className="w-8 h-8 overflow-hidden flex items-center justify-center rounded-lg bg-transparent">
                        <img 
                          src="https://operacaointeligente.metodotelecom.com.br/data/logo2.png" 
                          alt="Método Telecom Logo" 
                          className="h-full w-full object-contain p-0.5 select-none pointer-events-none"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                    </div>
                    <div className="leading-tight">
                      <span className="block text-xs font-black tracking-tight uppercase text-white font-sans">
                        OPERAÇÃO PE
                      </span>
                      <span className="text-[9px] text-zinc-400 font-mono font-bold block leading-none mt-1">
                        Método Telecom
                      </span>
                    </div>
                  </div>
                  
                  <button
                    onClick={() => setIsMobileSidebarOpen(false)}
                    className="p-1.5 bg-zinc-900 hover:bg-zinc-800 rounded-lg text-zinc-404 hover:text-white cursor-pointer"
                  >
                    <X className="h-4.5 w-4.5" />
                  </button>
                </div>

                {/* Navigation lists */}
                <div className="px-4 py-6 space-y-6">
                  <div className="space-y-2">
                    <span className="block px-3 text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-3">
                      Módulos de Gestão
                    </span>
                    
                    <nav className="space-y-1.5">
                      {/* Painel Gerencial */}
                      <button
                        onClick={() => {
                          setActiveTab('dashboard');
                          setIsMobileSidebarOpen(false);
                        }}
                        className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-all cursor-pointer ${
                          activeTab === 'dashboard'
                            ? 'bg-zinc-900 text-white font-bold border-l-4 border-brand pl-2'
                            : 'hover:bg-zinc-900/40 text-zinc-404 hover:text-white'
                        }`}
                      >
                        <LayoutDashboard className={`h-4.5 w-4.5 shrink-0 ${activeTab === 'dashboard' ? 'text-brand' : 'text-zinc-500'}`} />
                        <span className="text-xs">Painel Gerencial</span>
                      </button>

                      {/* Faturamento PEII (Collapsible Menu Level 1) */}
                      <div className="space-y-1">
                        <button
                          onClick={() => setFaturamentoPeiiOpen(!faturamentoPeiiOpen)}
                          className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left transition-all hover:bg-zinc-900/40 text-zinc-400 hover:text-white cursor-pointer"
                        >
                          <div className="flex items-center gap-3">
                            <TableProperties className="h-4.5 w-4.5 shrink-0 text-zinc-500" />
                            <span className="text-xs">Faturamento PEII</span>
                          </div>
                          {faturamentoPeiiOpen ? (
                            <ChevronDown className="h-3.5 w-3.5 text-zinc-500" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5 text-zinc-500" />
                          )}
                        </button>

                        <AnimatePresence initial={false}>
                          {faturamentoPeiiOpen && (
                            <motion.div 
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.25, ease: "easeInOut" }}
                              className="overflow-hidden pl-4 ml-2 border-l border-zinc-800 space-y-1.5 py-1"
                            >
                              {/* Ponto de Voz Fixo (Direct option) */}
                              <button
                                onClick={() => {
                                  setActiveTab('contratos');
                                  setIsMobileSidebarOpen(false);
                                }}
                                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left transition-all cursor-pointer ${
                                  activeTab === 'contratos'
                                    ? 'bg-zinc-900 text-white font-bold'
                                    : 'hover:bg-zinc-900/30 text-zinc-404 hover:text-white'
                                }`}
                              >
                                <Phone className={`h-4 w-4 shrink-0 ${activeTab === 'contratos' ? 'text-brand' : 'text-zinc-550'}`} />
                                <span className="text-xs">Ponto de Voz Fixo</span>
                              </button>

                              {/* Contact Center (Direct option) */}
                              <button
                                onClick={() => {
                                  setActiveTab('contact-center');
                                  setIsMobileSidebarOpen(false);
                                }}
                                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left transition-all cursor-pointer ${
                                  activeTab === 'contact-center'
                                    ? 'bg-zinc-900 text-white font-bold'
                                    : 'hover:bg-zinc-900/30 text-zinc-404 hover:text-white'
                                }`}
                              >
                                <Headset className={`h-4 w-4 shrink-0 ${activeTab === 'contact-center' ? 'text-brand' : 'text-zinc-550'}`} />
                                <span className="text-xs">Contact Center</span>
                              </button>

                              {/* Um Telecom (Direct option) */}
                              <button
                                onClick={() => {
                                  setActiveTab('um-telecom');
                                  setIsMobileSidebarOpen(false);
                                }}
                                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left transition-all cursor-pointer ${
                                  activeTab === 'um-telecom'
                                    ? 'bg-zinc-900 text-white font-bold'
                                    : 'hover:bg-zinc-900/30 text-zinc-404 hover:text-white'
                                }`}
                              >
                                <Zap className={`h-4 w-4 shrink-0 ${activeTab === 'um-telecom' ? 'text-brand' : 'text-zinc-550'}`} />
                                <span className="text-xs">Um Telecom</span>
                              </button>

                              {/* Implantação Starlink (Direct option) */}
                              <button
                                onClick={() => {
                                  setActiveTab('starlink');
                                  setIsMobileSidebarOpen(false);
                                }}
                                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left transition-all cursor-pointer ${
                                  activeTab === 'starlink'
                                    ? 'bg-zinc-900 text-white font-bold'
                                    : 'hover:bg-zinc-900/30 text-zinc-404 hover:text-white'
                                }`}
                              >
                                <Globe className={`h-4 w-4 shrink-0 ${activeTab === 'starlink' ? 'text-brand' : 'text-zinc-550'}`} />
                                <span className="text-xs">Starlink</span>
                              </button>

                              {/* Vectra (Direct option) */}
                              <button
                                onClick={() => {
                                  setActiveTab('vectra');
                                  setIsMobileSidebarOpen(false);
                                }}
                                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left transition-all cursor-pointer ${
                                  activeTab === 'vectra'
                                    ? 'bg-zinc-900 text-white font-bold'
                                    : 'hover:bg-zinc-900/30 text-zinc-404 hover:text-white'
                                }`}
                              >
                                <Network className={`h-4 w-4 shrink-0 ${activeTab === 'vectra' ? 'text-brand' : 'text-zinc-550'}`} />
                                <span className="text-xs flex items-center justify-between w-full">
                                  <span>Vectra</span>
                                  <span className="text-[8px] bg-amber-500/10 text-amber-500 dark:text-amber-400 dark:bg-amber-500/15 px-1 py-0.5 rounded font-sans uppercase font-bold">Homolog.</span>
                                </span>
                              </button>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>

                      {/* Usuários */}
                      {user && user.role === 'admin' && (
                        <button
                          onClick={() => {
                            setActiveTab('usuarios');
                            setIsMobileSidebarOpen(false);
                          }}
                          className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-all cursor-pointer ${
                            activeTab === 'usuarios'
                              ? 'bg-zinc-900 text-white font-bold border-l-4 border-brand pl-2'
                              : 'hover:bg-zinc-900/40 text-zinc-404 hover:text-white'
                          }`}
                        >
                          <Users className={`h-4.5 w-4.5 shrink-0 ${activeTab === 'usuarios' ? 'text-brand' : 'text-zinc-500'}`} />
                          <span className="text-xs">Usuários</span>
                        </button>
                      )}
                    </nav>
                  </div>
                </div>
              </div>

              {/* Profile area & actions at drawer base */}
              <div className="p-4 border-t border-zinc-900 bg-zinc-950/80 space-y-3">
                <div className="bg-zinc-900/80 p-3 rounded-2xl border border-zinc-800/80 flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-zinc-800 border border-zinc-700/60 text-white flex items-center justify-center font-black text-xs uppercase shrink-0">
                    {user.displayName.substring(0, 2)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="block text-xs font-bold text-white truncate leading-tight">
                      {user.displayName}
                    </span>
                    <span className="block text-[9px] text-zinc-500 font-mono truncate leading-tight">
                      {user.email}
                    </span>
                    <span className="inline-block mt-1 text-[8px] font-black uppercase tracking-wider px-1.5 py-0.2 bg-zinc-800 text-zinc-404 border border-zinc-700/50 rounded font-mono">
                      {user.role}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <button
                    onClick={() => {
                      toggleDarkMode();
                      setIsMobileSidebarOpen(false);
                    }}
                    className="py-2.5 px-3 bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 text-zinc-400 font-semibold rounded-xl flex items-center justify-center gap-1 text-[10px] cursor-pointer"
                  >
                    {darkMode ? <Sun className="h-3.5 w-3.5 text-amber-500" /> : <Moon className="h-3.5 w-3.5" />}
                    <span>Alternar Tema</span>
                  </button>
                  <button
                    onClick={handleLogout}
                    className="py-2.5 px-3 bg-rose-950/20 hover:bg-rose-950/40 text-rose-300 font-semibold border border-rose-900/20 rounded-xl flex items-center justify-center gap-1 text-[10px] cursor-pointer"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    <span>Sair</span>
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ======================================================== */}
      {/* 3. MAIN WORKSPACE WRAPPER (Content view area)            */}
      {/* ======================================================== */}
      <div className={`flex-1 flex flex-col min-w-0 w-full max-w-full overflow-x-hidden ${isSidebarCollapsed ? 'xl:pl-20' : 'xl:pl-64'} print:pl-0 min-h-screen transition-all duration-300`}>
        
        {/* Mobile sticky top header bar to prevent title overlap */}
        <header className="xl:hidden flex items-center justify-between px-4 py-3 bg-white dark:bg-zinc-900 border-b border-zinc-200/80 dark:border-zinc-800 sticky top-0 z-30 print:hidden shadow-xs">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsMobileSidebarOpen(true)}
              className="p-2.5 bg-zinc-50 hover:bg-zinc-100 dark:bg-zinc-950 dark:hover:bg-zinc-850 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-600 dark:text-zinc-400 cursor-pointer"
              aria-label="Abrir menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="leading-tight">
              <span className="block text-xs font-black uppercase tracking-wider text-zinc-900 dark:text-white font-sans">
                {getBreadcrumbTitle()}
              </span>
              <span className="text-[9px] text-zinc-450 dark:text-zinc-500 font-mono block leading-none">
                Método Telecom
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-brand text-white flex items-center justify-center font-black text-xs uppercase shadow-inner">
              {user.displayName.substring(0, 2)}
            </div>
          </div>
        </header>

        {/* ======================================================== */}
        {/* CORE APPLICATION CONTENT WORKSPACE                       */}
        {/* ======================================================== */}
        <main className="flex-grow p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl w-full mx-auto print:p-0 print:max-w-none">
          
          {/* Render Active View Tab component accordingly with hardware-accelerated transitions */}
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="space-y-6"
            >
              {activeTab === 'dashboard' && <Dashboard contracts={visibleContracts} prices={prices} user={user} />}
              {activeTab === 'contratos' && (
                <ContractTable
                  contracts={visibleContracts}
                  prices={prices}
                  user={user}
                  onUpdatePrices={handleUpdatePrices}
                  onUpdateContracts={handleUpdateContracts}
                />
              )}

              {activeTab === 'usuarios' && user?.role === 'admin' && (
                <UserManagement />
              )}
              
              {activeTab === 'contact-center' && (
                <ContactCenterBilling />
              )}

              {activeTab === 'um-telecom' && (
                <UmTelecomBilling />
              )}

              {activeTab === 'vectra' && (
                <VectraBilling />
              )}

              {activeTab === 'starlink' && (
                <StarlinkBilling />
              )}
            </motion.div>
          </AnimatePresence>

        </main>

      </div>

    </div>
  );
}
