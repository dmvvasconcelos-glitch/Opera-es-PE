/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Contract, PvfPrices, UserSession, ActiveTab } from './types';
import { INITIAL_CONTRACTS, INITIAL_PRICES, getContractPvfTotal, getContractValue, formatCurrency } from './data';
import { getStoredSession, clearSession, saveSession } from './auth-sim';
import AuthWindow from './components/AuthWindow';
import Dashboard from './components/Dashboard';
import ContractTable from './components/ContractTable';
import UserManagement from './components/UserManagement';
import SuppliersManagement from './components/SuppliersManagement';
import AtividadesManagement from './components/AtividadesManagement';

import UmTelecomBilling from './components/UmTelecomBilling';
import VectraBilling from './components/VectraBilling';
import StarlinkBilling from './components/StarlinkBilling';
import ContactCenterBilling from './components/ContactCenterBilling';
import SaldoContrato from './components/SaldoContrato';
import { db, handleFirestoreError, OperationType, cleanUndefined, onSnapshot, getDocs, getDoc, setDoc, deleteDoc, writeBatch, onQuotaExceeded } from './firebase';
import { collection, doc } from 'firebase/firestore';
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
  Scale,
  Activity,
  Award,
  Lock,
  Compass,
  Users,
  CalendarClock,
  Zap,
  Network,
  Globe,
  AlertCircle,
  Clock,
  ShieldAlert,
  WifiOff
} from 'lucide-react';

const getRoleLabel = (role: string) => {
  switch (role) {
    case 'admin': return 'Administrador';
    case 'editor': return 'Editor';
    case 'cliente': return 'Cliente';
    case 'parceiro': return 'Parceiro';
    case 'analista': return 'Analista';
    case 'viewer': return 'Visualizador';
    default: return role;
  }
};

const ALL_TABS: ActiveTab[] = [
  'dashboard',
  'contratos',
  'contact-center',
  'saldo-contrato',
  'um-telecom',
  'starlink',
  'vectra',
  'parceiros',
  'lpu',
  'atividades',
  'usuarios'
];

export default function App() {
  // Authentication Session State
  const [user, setUser] = useState<UserSession | null>(null);
  const [sessionExpiredMessage, setSessionExpiredMessage] = useState<string>('');
  const [quotaExceeded, setQuotaExceeded] = useState(false);
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  const [isOffline, setIsOffline] = useState(typeof navigator !== 'undefined' ? !navigator.onLine : false);

  // Listen to browser online/offline status
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Listen to live ticking time
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Listen to Firestore Quota Exceeded events
  useEffect(() => {
    return onQuotaExceeded(setQuotaExceeded);
  }, []);

  const isScreenAllowed = useCallback((screenId: string) => {
    if (!user) return false;
    
    if (user.allowedScreens) {
      return user.allowedScreens.includes(screenId);
    }
    
    // Default role-based visibility
    if (user.role === 'admin') return true;
    if (user.role === 'analista') {
      return ['parceiros', 'lpu', 'atividades'].includes(screenId);
    }
    if (user.role === 'parceiro') {
      return screenId === 'atividades';
    }
    if (user.role === 'cliente') {
      return ['dashboard', 'contratos', 'contact-center', 'saldo-contrato'].includes(screenId);
    }
    // For others (editor, viewer)
    if (screenId === 'usuarios' || screenId === 'parceiros' || screenId === 'lpu') {
      return false;
    }
    if (user.role === 'editor' && screenId === 'atividades') {
      return false;
    }
    return true;
  }, [user]);
  
  // Inactivity timeout tracking
  const lastActivityRef = useRef<number>(Date.now());
  const updateActivityTime = useCallback(() => {
    lastActivityRef.current = Date.now();
  }, []);
  
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
  const [fornecedoresOpen, setFornecedoresOpen] = useState(false);

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

            let isAlreadySeededDB = false;
            try {
              const seedMetaDoc = await getDoc(doc(db, 'test', 'seeding_metadata'));
              if (seedMetaDoc.exists() && seedMetaDoc.data()?.contracts === true) {
                isAlreadySeededDB = true;
              }
            } catch (smErr) {
              console.warn("Could not retrieve remote seeding metadata for Contracts:", smErr);
            }

            if (isAlreadySeededDB) {
              console.log("Database cleared of contracts by preference, skipping automatic seeding.");
              if (isActive) {
                setContracts([]);
                setIsInitializing(false);
              }
              localStorage.setItem('portal_gestao_contracts_seeded', 'true');
              return;
            }
            console.log("Sem contratos cadastrados no banco de dados, populando conjunto padrão...");
            try {
              localStorage.setItem('portal_gestao_contracts_seeded', 'true');
              const batch = writeBatch(db);
              INITIAL_CONTRACTS.forEach(c => {
                batch.set(doc(db, 'contracts', c.id), c);
              });
              
              const seedMetaRef = doc(db, 'test', 'seeding_metadata');
              batch.set(seedMetaRef, { contracts: true }, { merge: true });

              await batch.commit();
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
          localStorage.setItem('portal_gestao_contracts', JSON.stringify(list));
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

        // Pre-verify and seed system prices safely if absolutely missing from database (online/getDoc check)
        const pricesDocRef = doc(db, 'systemPrices', 'current');
        if (localStorage.getItem('portal_gestao_prices_seeded') !== 'true') {
          getDoc(pricesDocRef).then(async (docSnap) => {
            if (!docSnap.exists() && isActive) {
              console.log("Sem tabelas tarifárias no banco de dados (verificado via getDoc), populando conjunto padrão...");
              try {
                localStorage.setItem('portal_gestao_prices_seeded', 'true');
                await setDoc(pricesDocRef, INITIAL_PRICES);
              } catch (writeErr) {
                console.error("Falha ao salvar tarifas padrão no Firestore via getDoc:", writeErr);
              }
            } else {
              localStorage.setItem('portal_gestao_prices_seeded', 'true');
            }
          }).catch((err) => {
            console.warn("Erro ao ler tarifas atuais no pre-check getDoc:", err);
          });
        }

        // Subscribe Real-time Prices
        unsubPrices = onSnapshot(pricesDocRef, (docSnap) => {
          if (!docSnap.exists()) {
            return;
          }
          if (isActive) {
            const data = docSnap.data() as PvfPrices;
            setPrices(data);
            localStorage.setItem('portal_gestao_prices', JSON.stringify(data));
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

  // Redirect to first allowed screen if the active tab is not allowed
  useEffect(() => {
    if (user) {
      const isAllowed = isScreenAllowed(activeTab);
      if (!isAllowed) {
        const firstAllowed = ALL_TABS.find(tab => isScreenAllowed(tab));
        const targetTab = firstAllowed || 'dashboard';
        if (targetTab !== activeTab) {
          setActiveTab(targetTab);
        }
      }
    }
  }, [user, activeTab, isScreenAllowed]);

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
    if (user) {
      const emailDocId = user.email.trim().toLowerCase();
      setDoc(doc(db, 'systemUsers', emailDocId), {
        lastActiveAt: ""
      }, { merge: true }).catch(() => {});
    }
    clearSession();
    setUser(null);
    setActiveTab('dashboard');
    setIsMobileSidebarOpen(false);
  };

  // Synchronize active user presence & last login timestamps in real-time
  const lastPresenceWriteRef = useRef<number>(0);

  useEffect(() => {
    if (!user) {
      return;
    }

    let active = true;
    const emailKey = user.email.trim().toLowerCase();
    const userDocRef = doc(db, 'systemUsers', emailKey);

    const updatePresence = async (isInitialSetup: boolean = false) => {
      try {
        if (!active) return;
        const nowMs = Date.now();
        const lastSessionWrite = Number(sessionStorage.getItem(`presence_write_${emailKey}`) || '0');
        // Prevent frequent Firestore write quota exhaustion! Write at most once every 5 minutes (300,000 ms) per tab session
        if (nowMs - lastSessionWrite < 300000 && nowMs - lastPresenceWriteRef.current < 300000) {
          return;
        }

        const docSnap = await getDoc(userDocRef);
        if (!active) return;

        const nowStr = new Date().toLocaleString('pt-BR');
        const nowIso = new Date().toISOString();
        if (docSnap.exists()) {
          const currentData = docSnap.data();
          await setDoc(userDocRef, cleanUndefined({
            ...currentData,
            lastLogin: isInitialSetup ? nowStr : (currentData.lastLogin || nowStr),
            lastActiveAt: nowIso
          }), { merge: true });
          lastPresenceWriteRef.current = Date.now();
          try { sessionStorage.setItem(`presence_write_${emailKey}`, String(Date.now())); } catch {}

          if (!active) return;

          if (isInitialSetup) {
            const updatedUser: UserSession = {
              ...user,
              displayName: currentData.displayName || user.displayName,
              role: currentData.role || user.role,
              secretarias: currentData.secretarias || user.secretarias,
              parceiroId: currentData.parceiroId || user.parceiroId,
              parceiroNome: currentData.parceiroNome || user.parceiroNome,
              allowedScreens: currentData.allowedScreens || undefined,
              editableScreens: currentData.editableScreens || undefined,
            };
            if (JSON.stringify(updatedUser) !== JSON.stringify(user)) {
              setUser(updatedUser);
              saveSession(updatedUser);
            }
          }
        } else {
          // Keep a robust fallback profile inside Firestore
          await setDoc(userDocRef, cleanUndefined({
            email: user.email,
            displayName: user.displayName,
            role: user.role,
            status: 'Ativo',
            secretarias: user.secretarias || [],
            lastLogin: nowStr,
            lastActiveAt: nowIso
          }), { merge: true });
          lastPresenceWriteRef.current = Date.now();
          try { sessionStorage.setItem(`presence_write_${emailKey}`, String(Date.now())); } catch {}
        }
      } catch (err) {
        console.warn("Falha ao sincronizar presença no Firestore (cota ou offline):", err);
      }
    };

    // Run on initial mount or session restore with true flag
    updatePresence(true);

    // Heartbeat every 5 minutes instead of 20 seconds to prevent quota limits
    const interval = setInterval(() => {
      const msSinceLastActivity = Date.now() - lastActivityRef.current;
      // Only keep updating if we have been active in the last 15 minutes
      if (msSinceLastActivity < 15 * 60 * 1000) {
        updatePresence(false);
      }
    }, 300000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [user?.email]);

  // Automated 30-minute inactivity session tracking
  useEffect(() => {
    if (!user) {
      return;
    }

    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
    const onActivity = () => {
      updateActivityTime();
    };

    events.forEach((eventName) => {
      window.addEventListener(eventName, onActivity, { passive: true });
    });

    // Reset baseline timestamp upon user login
    lastActivityRef.current = Date.now();

    const checkInterval = setInterval(() => {
      const msSinceLastActivity = Date.now() - lastActivityRef.current;
      // 30 minutes in milliseconds = 30 * 60 * 1000 = 1,800,000 ms
      if (msSinceLastActivity >= 30 * 60 * 1000) {
        console.warn('Inactivity limit reached: logging out user...');
        handleLogout();
        setSessionExpiredMessage('Sua sessão foi encerrada automaticamente por inatividade nos últimos 30 minutos. Por favor, faça login novamente.');
      }
    }, 10000); // Check every 10 seconds

    return () => {
      events.forEach((eventName) => {
        window.removeEventListener(eventName, onActivity);
      });
      clearInterval(checkInterval);
    };
  }, [user, updateActivityTime]);

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
    return (
      <AuthWindow 
        onLoginSuccess={(session) => {
          setUser(session);
          setSessionExpiredMessage('');
          setActiveTab('dashboard');
        }} 
        initialMessage={sessionExpiredMessage}
      />
    );
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
      case 'contact-center': return 'Faturamento Contact Center';
      case 'saldo-contrato': return 'Saldo de Contrato';
      case 'historico': return 'Histórico de Faturamento';
      case 'um-telecom': return 'Faturamento Infra e Elétrica PCM';
      case 'vectra': return 'Faturamento Vectra';
      case 'starlink': return 'Implantação Starlink';
      case 'parceiros': return 'Cadastro de Parceiros';
      case 'lpu': return 'LPU de Serviços';
      case 'atividades': return 'Atividades Operacionais';
      default: return 'Portal';
    }
  };

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-gradient-to-br from-[#f8fafc] via-[#edf4fe] to-[#fdf4e3] dark:from-[#111113] dark:via-zinc-950 dark:to-[#0c0c0e] text-zinc-800 dark:text-zinc-100 flex transition-colors duration-200 font-sans">      {/* ======================================================== */}
      {/* 1. DESKTOP SIDEBAR (Static docked Sidebar)                 */}
      {/* ======================================================== */}
      <aside className={`hidden lg:flex lg:flex-col ${isSidebarCollapsed ? 'lg:w-20' : 'lg:w-64'} lg:fixed lg:inset-y-0 lg:left-0 bg-brand-deep dark:bg-zinc-950 border-r border-brand-border/20 dark:border-zinc-900 text-zinc-200 z-40 justify-between select-none shadow-xl transition-all duration-300 print:hidden h-screen max-h-screen overflow-hidden`}>
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {/* Brand area */}
          <div className={`px-4 py-5 border-b border-brand-border/10 dark:border-zinc-900 bg-brand-deep dark:bg-zinc-950 flex items-center ${isSidebarCollapsed ? 'justify-center' : 'justify-between'} gap-2 shrink-0`}>
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
                  <div className="flex items-center gap-1.5 mt-1.5 animate-fade-in">
                    <span className={`w-1.5 h-1.5 rounded-full ${isOffline ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`} />
                    <span className="text-[8px] text-zinc-400/80 font-mono font-bold uppercase tracking-wider">
                      {isOffline ? 'Cache Local' : 'Online'}
                    </span>
                  </div>
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
          <div className="px-4 py-6 flex flex-col gap-1.5 overflow-y-auto flex-1 min-h-0 scrollbar-none">
            {user?.role === 'parceiro' && !user?.allowedScreens ? (
              <button
                onClick={() => setActiveTab('atividades')}
                className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center px-1' : 'gap-3 px-3'} py-2.5 rounded-xl text-left transition-all duration-200 cursor-pointer ${
                  activeTab === 'atividades'
                    ? 'bg-brand-medium/50 dark:bg-zinc-900 text-white font-bold shadow-md shadow-brand-deep/30'
                    : 'hover:bg-brand-medium/20 dark:hover:bg-zinc-900/40 text-zinc-300 hover:text-white'
                }`}
                title={isSidebarCollapsed ? "Atividades" : undefined}
              >
                <Activity className={`h-4.5 w-4.5 shrink-0 ${activeTab === 'atividades' ? 'text-brand-light dark:text-brand animate-pulse' : 'text-zinc-400'}`} />
                {!isSidebarCollapsed && <span className="text-xs font-bold">Atividades Operacionais</span>}
              </button>
            ) : (
              <>
                {/* Title / Section Category */}
                {!isSidebarCollapsed && isScreenAllowed('dashboard') && (
                  <span className="block px-3 text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1">
                    Menu Principal
                  </span>
                )}

                {/* Painel Gerencial (Dashboard) */}
                {isScreenAllowed('dashboard') && (
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
                )}

                {/* Faturamento PEII (Collapsible Menu Level 1) */}
                {(isScreenAllowed('contratos') || isScreenAllowed('contact-center') || isScreenAllowed('um-telecom') || isScreenAllowed('starlink') || isScreenAllowed('vectra')) && (!isSidebarCollapsed ? (
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

                    <AnimatePresence initial={false}>
                      {faturamentoPeiiOpen && (
                        <motion.div 
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.25, ease: "easeInOut" }}
                          className="overflow-hidden pl-4 ml-2.5 border-l border-brand-border/20 dark:border-zinc-900 space-y-1.5 py-1"
                        >
                          {isScreenAllowed('contratos') && (
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
                          )}

                          {isScreenAllowed('contact-center') && (
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
                          )}

                          {isScreenAllowed('um-telecom') && (
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
                          )}

                          {isScreenAllowed('starlink') && (
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
                          )}

                          {isScreenAllowed('vectra') && (
                            <button
                              onClick={() => setActiveTab('vectra')}
                              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-all duration-200 cursor-pointer ${
                                activeTab === 'vectra'
                                  ? 'bg-brand/45 dark:bg-zinc-850 text-white font-bold'
                                  : 'hover:bg-brand-medium/15 dark:hover:bg-zinc-900/35 text-zinc-350 hover:text-white'
                              }`}
                            >
                              <Network className={`h-4 w-4 shrink-0 ${activeTab === 'vectra' ? 'text-brand-light dark:text-brand' : 'text-zinc-500'}`} />
                              <span className="text-xs">Vectra</span>
                            </button>
                          )}

                          {isScreenAllowed('saldo-contrato') && (
                            <button
                              onClick={() => setActiveTab('saldo-contrato')}
                              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-all duration-200 cursor-pointer ${
                                activeTab === 'saldo-contrato'
                                  ? 'bg-brand/45 dark:bg-zinc-850 text-white font-bold'
                                  : 'hover:bg-brand-medium/15 dark:hover:bg-zinc-900/35 text-zinc-350 hover:text-white'
                              }`}
                            >
                              <Scale className={`h-4 w-4 shrink-0 ${activeTab === 'saldo-contrato' ? 'text-brand-light dark:text-brand' : 'text-zinc-500'}`} />
                              <span className="text-xs">Saldo Contrato</span>
                            </button>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ) : (
                  <div className="flex flex-col gap-1.5 py-3 border-t border-b border-brand-border/10 dark:border-zinc-900 my-1">
                    {isScreenAllowed('contratos') && (
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
                    )}

                    {isScreenAllowed('contact-center') && (
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
                    )}

                    {isScreenAllowed('um-telecom') && (
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
                    )}

                    {isScreenAllowed('starlink') && (
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
                    )}

                    {isScreenAllowed('vectra') && (
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
                    )}

                    {isScreenAllowed('saldo-contrato') && (
                      <button
                        onClick={() => setActiveTab('saldo-contrato')}
                        className={`w-full flex items-center justify-center py-2.5 rounded-xl transition-all duration-200 cursor-pointer ${
                          activeTab === 'saldo-contrato'
                            ? 'bg-brand-medium dark:bg-zinc-900 text-white shadow-sm'
                            : 'hover:bg-brand-medium/20 text-zinc-400 hover:text-white'
                        }`}
                        title="Saldo do Contrato"
                      >
                        <Scale className={`h-4.5 w-4.5 ${activeTab === 'saldo-contrato' ? 'text-brand-light dark:text-brand animate-pulse' : 'text-zinc-400'}`} />
                      </button>
                    )}
                  </div>
                ))}

            {/* Fornecedores & LPU (Collapsible Menu Level 1) */}
            {(isScreenAllowed('parceiros') || isScreenAllowed('lpu') || isScreenAllowed('atividades')) && (!isSidebarCollapsed ? (
              <div className="space-y-1">
                <button
                  onClick={() => setFornecedoresOpen(!fornecedoresOpen)}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left transition-all duration-200 hover:bg-brand-medium/20 dark:hover:bg-zinc-900/40 text-zinc-300 hover:text-white cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <Building2 className="h-4.5 w-4.5 shrink-0 text-zinc-400" />
                    <span className="text-xs">Fornecedores & LPU</span>
                  </div>
                  {fornecedoresOpen ? (
                    <ChevronDown className="h-3.5 w-3.5 text-zinc-400" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 text-zinc-400" />
                  )}
                </button>

                {/* Submenus of Fornecedores */}
                <AnimatePresence initial={false}>
                  {fornecedoresOpen && (
                    <motion.div 
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25, ease: "easeInOut" }}
                      className="overflow-hidden pl-4 ml-2.5 border-l border-brand-border/20 dark:border-zinc-900 space-y-1.5 py-1"
                    >
                      {/* Parceiros (Cadastro de Parceiros) */}
                      {isScreenAllowed('parceiros') && (
                        <button
                          onClick={() => setActiveTab('parceiros')}
                          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-all duration-200 cursor-pointer ${
                            activeTab === 'parceiros'
                              ? 'bg-brand/45 dark:bg-zinc-850 text-white font-bold'
                              : 'hover:bg-brand-medium/15 dark:hover:bg-zinc-900/35 text-zinc-350 hover:text-white'
                          }`}
                        >
                          <Users className={`h-4 w-4 shrink-0 ${activeTab === 'parceiros' ? 'text-brand-light dark:text-brand' : 'text-zinc-500'}`} />
                          <span className="text-xs">Parceiros</span>
                        </button>
                      )}

                      {/* LPU (LPU de Serviços) */}
                      {isScreenAllowed('lpu') && (
                        <button
                          onClick={() => setActiveTab('lpu')}
                          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-all duration-200 cursor-pointer ${
                            activeTab === 'lpu'
                              ? 'bg-brand/45 dark:bg-zinc-850 text-white font-bold'
                              : 'hover:bg-brand-medium/15 dark:hover:bg-zinc-900/35 text-zinc-350 hover:text-white'
                          }`}
                        >
                          <TrendingUp className={`h-4 w-4 shrink-0 ${activeTab === 'lpu' ? 'text-brand-light dark:text-brand' : 'text-zinc-500'}`} />
                          <span className="text-xs">LPU de Serviços</span>
                        </button>
                      )}

                      {/* Atividades */}
                      {isScreenAllowed('atividades') && (
                        <button
                          onClick={() => setActiveTab('atividades')}
                          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-all duration-200 cursor-pointer ${
                            activeTab === 'atividades'
                              ? 'bg-brand/45 dark:bg-zinc-850 text-white font-bold'
                              : 'hover:bg-brand-medium/15 dark:hover:bg-zinc-900/35 text-zinc-350 hover:text-white'
                          }`}
                        >
                          <Activity className={`h-4 w-4 shrink-0 ${activeTab === 'atividades' ? 'text-brand-light dark:text-brand' : 'text-zinc-500'}`} />
                          <span className="text-xs">Atividades</span>
                        </button>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              // Collapsed alternative flat submenu direct items, clean mapping
              <div className="flex flex-col gap-1.5 py-3 border-t border-b border-brand-border/10 dark:border-zinc-900 my-1">
                {/* Parceiros */}
                {isScreenAllowed('parceiros') && (
                  <button
                    onClick={() => setActiveTab('parceiros')}
                    className={`w-full flex items-center justify-center py-2.5 rounded-xl transition-all duration-205 cursor-pointer ${
                      activeTab === 'parceiros'
                        ? 'bg-brand-medium dark:bg-zinc-900 text-white shadow-sm'
                        : 'hover:bg-brand-medium/20 text-zinc-400 hover:text-white'
                    }`}
                    title="Parceiros"
                  >
                    <Users className={`h-4.5 w-4.5 ${activeTab === 'parceiros' ? 'text-brand-light dark:text-brand animate-pulse' : 'text-zinc-400'}`} />
                  </button>
                )}

                {/* LPU de Serviços */}
                {isScreenAllowed('lpu') && (
                  <button
                    onClick={() => setActiveTab('lpu')}
                    className={`w-full flex items-center justify-center py-2.5 rounded-xl transition-all duration-205 cursor-pointer ${
                      activeTab === 'lpu'
                        ? 'bg-brand-medium dark:bg-zinc-900 text-white shadow-sm'
                        : 'hover:bg-brand-medium/20 text-zinc-400 hover:text-white'
                    }`}
                    title="LPU de Serviços"
                  >
                    <TrendingUp className={`h-4.5 w-4.5 ${activeTab === 'lpu' ? 'text-brand-light dark:text-brand animate-pulse' : 'text-zinc-400'}`} />
                  </button>
                )}

                {/* Atividades */}
                {isScreenAllowed('atividades') && (
                  <button
                    onClick={() => setActiveTab('atividades')}
                    className={`w-full flex items-center justify-center py-2.5 rounded-xl transition-all duration-205 cursor-pointer ${
                      activeTab === 'atividades'
                        ? 'bg-brand-medium dark:bg-zinc-900 text-white shadow-sm'
                        : 'hover:bg-brand-medium/20 text-zinc-400 hover:text-white'
                    }`}
                    title="Atividades"
                  >
                    <Activity className={`h-4.5 w-4.5 ${activeTab === 'atividades' ? 'text-brand-light dark:text-brand animate-pulse' : 'text-zinc-400'}`} />
                  </button>
                )}
              </div>
            ))}
              </>
            )}

            {/* Usuários (Admin) */}
            {isScreenAllowed('usuarios') && (
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
        <div className={`p-4 border-t border-brand-border/10 dark:border-zinc-900/70 bg-brand-deep/95 dark:bg-zinc-950/80 ${isSidebarCollapsed ? 'space-y-4' : 'space-y-3'} print:hidden shrink-0`}>
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
                  {getRoleLabel(user.role)}
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
          <div className="fixed inset-0 z-50 lg:hidden flex">
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
              className="w-80 bg-zinc-950 border-r border-zinc-900 text-zinc-300 h-full flex flex-col justify-between relative z-50 shadow-2xl overflow-hidden"
            >
              <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                {/* Drawer Header Brand area */}
                <div className="p-6 border-b border-zinc-900/80 flex items-center justify-between shrink-0">
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
                      <div className="flex items-center gap-1 mt-1 animate-fade-in">
                        <span className={`w-1.5 h-1.5 rounded-full ${isOffline ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`} />
                        <span className="text-[8px] text-zinc-500 font-mono font-bold uppercase tracking-wider">
                          {isOffline ? 'Cache Local' : 'Online'}
                        </span>
                      </div>
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
                <div className="px-4 py-6 space-y-6 overflow-y-auto flex-1 min-h-0 scrollbar-none">
                  <div className="space-y-2">
                    <span className="block px-3 text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-3">
                      Módulos de Gestão
                    </span>
                    
                    <nav className="space-y-1.5">
                      {user?.role === 'parceiro' && !user?.allowedScreens ? (
                        <button
                          onClick={() => {
                            setIsMobileSidebarOpen(false);
                            setActiveTab('atividades');
                          }}
                          className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-all cursor-pointer ${
                            activeTab === 'atividades'
                              ? 'bg-zinc-900 text-white font-bold border-l-4 border-brand pl-2'
                              : 'hover:bg-zinc-900/40 text-zinc-404 hover:text-white'
                          }`}
                        >
                          <Activity className={`h-4.5 w-4.5 shrink-0 ${activeTab === 'atividades' ? 'text-brand' : 'text-zinc-500'}`} />
                          <span className="text-xs">Atividades Operacionais</span>
                        </button>
                      ) : (
                        <>
                          {/* Painel Gerencial */}
                          {isScreenAllowed('dashboard') && (
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
                          )}

                          {/* Faturamento PEII (Collapsible Menu Level 1) */}
                          {(isScreenAllowed('contratos') || isScreenAllowed('contact-center') || isScreenAllowed('um-telecom') || isScreenAllowed('starlink') || isScreenAllowed('vectra')) && (
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
                                    {isScreenAllowed('contratos') && (
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
                                    )}

                                    {isScreenAllowed('contact-center') && (
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
                                    )}

                                    {isScreenAllowed('um-telecom') && (
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
                                    )}

                                    {isScreenAllowed('starlink') && (
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
                                    )}

                                    {isScreenAllowed('vectra') && (
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
                                        <span className="text-xs">Vectra</span>
                                      </button>
                                    )}

                                    {isScreenAllowed('saldo-contrato') && (
                                      <button
                                        onClick={() => {
                                          setActiveTab('saldo-contrato');
                                          setIsMobileSidebarOpen(false);
                                        }}
                                        className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left transition-all cursor-pointer ${
                                          activeTab === 'saldo-contrato'
                                            ? 'bg-zinc-900 text-white font-bold'
                                            : 'hover:bg-zinc-900/30 text-zinc-404 hover:text-white'
                                        }`}
                                      >
                                        <Scale className={`h-4 w-4 shrink-0 ${activeTab === 'saldo-contrato' ? 'text-brand' : 'text-zinc-550'}`} />
                                        <span className="text-xs">Saldo Contrato</span>
                                      </button>
                                    )}
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          )}

                          {/* Fornecedores & LPU (Mobile Collapsible) */}
                          {(isScreenAllowed('parceiros') || isScreenAllowed('lpu') || isScreenAllowed('atividades')) && (
                            <div className="space-y-1">
                              <button
                                onClick={() => setFornecedoresOpen(!fornecedoresOpen)}
                                className="w-full flex items-center justify-between px-3 py-3 rounded-xl text-left transition-all hover:bg-zinc-900/40 text-zinc-400 hover:text-white cursor-pointer"
                              >
                                <div className="flex items-center gap-3">
                                  <Building2 className="h-4.5 w-4.5 shrink-0 text-zinc-500" />
                                  <span className="text-xs">Fornecedores & LPU</span>
                                </div>
                                {fornecedoresOpen ? (
                                  <ChevronDown className="h-3.5 w-3.5 text-zinc-500" />
                                ) : (
                                  <ChevronRight className="h-3.5 w-3.5 text-zinc-500" />
                                )}
                              </button>

                              <AnimatePresence initial={false}>
                                {fornecedoresOpen && (
                                  <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: "auto", opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.2 }}
                                    className="overflow-hidden pl-4 ml-2.5 border-l border-zinc-800 space-y-1.5 py-1"
                                  >
                                    {isScreenAllowed('parceiros') && (
                                      <button
                                        onClick={() => {
                                          setActiveTab('parceiros');
                                          setIsMobileSidebarOpen(false);
                                        }}
                                        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-all cursor-pointer ${
                                          activeTab === 'parceiros'
                                            ? 'bg-zinc-900 text-white font-bold'
                                            : 'hover:bg-zinc-900/40 text-zinc-404 hover:text-white'
                                        }`}
                                      >
                                        <Users className={`h-4 w-4 shrink-0 ${activeTab === 'parceiros' ? 'text-brand' : 'text-zinc-500'}`} />
                                        <span className="text-xs">Parceiros</span>
                                      </button>
                                    )}

                                    {isScreenAllowed('lpu') && (
                                      <button
                                        onClick={() => {
                                          setIsMobileSidebarOpen(false);
                                          setActiveTab('lpu');
                                        }}
                                        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-all cursor-pointer ${
                                          activeTab === 'lpu'
                                            ? 'bg-zinc-900 text-white font-bold'
                                            : 'hover:bg-zinc-900/40 text-zinc-404 hover:text-white'
                                        }`}
                                      >
                                        <TrendingUp className={`h-4 w-4 shrink-0 ${activeTab === 'lpu' ? 'text-brand' : 'text-zinc-500'}`} />
                                        <span className="text-xs">LPU de Serviços</span>
                                      </button>
                                    )}

                                    {isScreenAllowed('atividades') && (
                                      <button
                                        onClick={() => {
                                          setIsMobileSidebarOpen(false);
                                          setActiveTab('atividades');
                                        }}
                                        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-all cursor-pointer ${
                                          activeTab === 'atividades'
                                            ? 'bg-zinc-900 text-white font-bold'
                                            : 'hover:bg-zinc-900/40 text-zinc-550 hover:text-white'
                                        }`}
                                      >
                                        <Activity className={`h-4 w-4 shrink-0 ${activeTab === 'atividades' ? 'text-brand' : 'text-zinc-550'}`} />
                                        <span className="text-xs">Atividades</span>
                                      </button>
                                    )}
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          )}
                        </>
                      )}

                      {/* Usuários */}
                      {isScreenAllowed('usuarios') && (
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
              <div className="p-4 border-t border-zinc-900 bg-zinc-950/80 space-y-3 shrink-0">
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
                      {getRoleLabel(user.role)}
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
      <div className={`flex-1 flex flex-col min-w-0 w-full max-w-full overflow-x-hidden ${isSidebarCollapsed ? 'lg:pl-20' : 'lg:pl-64'} print:pl-0 min-h-screen transition-all duration-300`}>
        
        {/* Persistent top header bar visible on all screen sizes for all users */}
        <header className="flex items-center justify-between px-4 sm:px-6 py-3 bg-white dark:bg-zinc-900 border-b border-zinc-200/80 dark:border-zinc-800 sticky top-0 z-30 print:hidden shadow-xs">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsMobileSidebarOpen(true)}
              className="lg:hidden p-2.5 bg-zinc-50 hover:bg-zinc-100 dark:bg-zinc-950 dark:hover:bg-zinc-850 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-600 dark:text-zinc-400 cursor-pointer"
              aria-label="Abrir menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="leading-tight">
              <span className="block text-xs sm:text-sm font-black uppercase tracking-wider text-zinc-900 dark:text-white font-sans">
                {getBreadcrumbTitle()}
              </span>
              <span className="text-[9px] text-zinc-450 dark:text-zinc-500 font-mono block leading-none">
                Método Telecom
              </span>
              <div className="flex items-center gap-1 mt-1 animate-fade-in">
                <span className={`w-1.5 h-1.5 rounded-full ${isOffline ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`} />
                <span className="text-[8px] text-zinc-400 dark:text-zinc-500 font-mono font-bold uppercase tracking-wider">
                  {isOffline ? 'Offline' : 'Online'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={toggleDarkMode}
              className="px-2.5 py-1.5 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 text-xs font-bold shadow-2xs"
              title="Alternar Tema (Claro / Escuro)"
            >
              {darkMode ? (
                <>
                  <Sun className="h-4 w-4 text-amber-500 animate-pulse shrink-0" />
                  <span className="hidden sm:inline">Claro</span>
                </>
              ) : (
                <>
                  <Moon className="h-4 w-4 text-zinc-700 dark:text-zinc-300 shrink-0" />
                  <span className="hidden sm:inline">Escuro</span>
                </>
              )}
            </button>
            <button
              onClick={handleLogout}
              className="px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/20 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 text-xs font-bold shadow-2xs"
              title="Sair do Portal"
            >
              <LogOut className="h-4 w-4 shrink-0" />
              <span>Sair</span>
            </button>
            <div className="h-8 w-8 rounded-lg bg-brand text-white flex items-center justify-center font-black text-xs uppercase shadow-inner ml-1 shrink-0" title={`${user.displayName} (${getRoleLabel(user.role)})`}>
              {user.displayName.substring(0, 2)}
            </div>
          </div>
        </header>

        {/* ======================================================== */}
        {/* CORE APPLICATION CONTENT WORKSPACE                       */}
        {/* ======================================================== */}
        <main className="flex-grow p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl w-full mx-auto print:p-0 print:max-w-none">
          
          {quotaExceeded && (
            <div id="quota-exceeded-banner" className="bg-amber-500/10 dark:bg-amber-500/15 border border-amber-500/35 rounded-2xl p-4.5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xs select-none">
              <div className="flex items-start gap-3.5">
                <AlertCircle className="h-6 w-6 text-amber-600 dark:text-amber-500 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="text-sm font-black text-amber-800 dark:text-amber-400 font-sans tracking-tight">
                    Limite de Cota do Banco de Dados Atingido (Spark Plan)
                  </h4>
                  <p className="text-xs text-amber-700/90 dark:text-amber-500/90 leading-relaxed font-sans font-medium">
                    O portal atingiu o limite gratuito de leitura diária do Firestore (50 mil leituras/dia) e está operando temporariamente em <strong>modo de contingência offline local</strong>. Todas as funcionalidades de consulta e edição permanecem utilizáveis com persistência no navegador, e serão sincronizadas quando a cota resetar amãna.
                  </p>
                </div>
              </div>
              <a 
                href="https://console.firebase.google.com/project/gen-lang-client-0536991907/firestore/databases/ai-studio-058f0539-1167-4858-81f8-f962175f4994/data?openUpgradeDialog=true" 
                target="_blank" 
                rel="noreferrer"
                className="px-4 py-2.5 bg-amber-600 hover:bg-amber-700 dark:bg-amber-500 dark:hover:bg-amber-600 text-white dark:text-zinc-950 font-extrabold text-xs rounded-xl shadow-md transition-all whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer hover:scale-102 active:scale-98 select-none"
              >
                <Database className="h-4 w-4" />
                <span>Console do Banco</span>
              </a>
            </div>
          )}

          {isOffline && !quotaExceeded && (
            <div id="offline-mode-banner" className="bg-zinc-100 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-2xs select-none animate-fade-in">
              <div className="flex items-start gap-3">
                <WifiOff className="h-5 w-5 text-zinc-500 dark:text-zinc-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="text-xs font-black text-zinc-800 dark:text-zinc-200 uppercase tracking-wider font-sans">
                    Navegação em Modo Cache Local Ativo
                  </h4>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed font-sans font-medium">
                    O portal perdeu contato temporário com o servidor ou está operando offline. Não se preocupe: você pode continuar visualizando, editando e gerando relatórios normalmente. Todas as alterações serão sincronizadas com o banco de dados Firebase assim que a conexão for restabelecida.
                  </p>
                </div>
              </div>
              <div className="px-3 py-1 bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-extrabold text-[10px] uppercase tracking-wider rounded-lg whitespace-nowrap shrink-0">
                Operando em Cache
              </div>
            </div>
          )}

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
              {activeTab === 'dashboard' && user?.role !== 'parceiro' && isScreenAllowed('dashboard') && <Dashboard contracts={visibleContracts} prices={prices} user={user} onSelectTab={(tab) => setActiveTab(tab as any)} />}
              {activeTab === 'contratos' && isScreenAllowed('contratos') && (
                <ContractTable
                  contracts={visibleContracts}
                  prices={prices}
                  user={user}
                  onUpdatePrices={handleUpdatePrices}
                  onUpdateContracts={handleUpdateContracts}
                />
              )}

              {activeTab === 'usuarios' && user?.role === 'admin' && isScreenAllowed('usuarios') && (
                <UserManagement currentUser={user} />
              )}
              
              {activeTab === 'parceiros' && isScreenAllowed('parceiros') && (
                <SuppliersManagement currentUser={user} activeSection="parceiros" />
              )}
              
              {activeTab === 'lpu' && isScreenAllowed('lpu') && (
                <SuppliersManagement currentUser={user} activeSection="lpu" />
              )}

              {activeTab === 'atividades' && isScreenAllowed('atividades') && (
                <AtividadesManagement currentUser={user} />
              )}
              
              {activeTab === 'contact-center' && isScreenAllowed('contact-center') && (
                <ContactCenterBilling user={user} />
              )}

              {activeTab === 'saldo-contrato' && isScreenAllowed('saldo-contrato') && (
                <SaldoContrato user={user} pvfPrices={prices} pvfContracts={contracts} />
              )}

              {activeTab === 'um-telecom' && isScreenAllowed('um-telecom') && (
                <UmTelecomBilling user={user} />
              )}

              {activeTab === 'vectra' && isScreenAllowed('vectra') && (
                <VectraBilling user={user} />
              )}

              {activeTab === 'starlink' && isScreenAllowed('starlink') && (
                <StarlinkBilling user={user} />
              )}
            </motion.div>
          </AnimatePresence>

        </main>

      </div>

    </div>
  );
}
