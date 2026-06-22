/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { jsPDF } from 'jspdf';
import { Contract, PvfPrices, PvfKey, UserSession } from '../types';
import { PVF_LABELS, getContractPvfTotal, getContractValue, formatCurrency } from '../data';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, doc, setDoc, deleteDoc, onSnapshot, serverTimestamp, getDocs } from 'firebase/firestore';
import { 
  Search, 
  Filter, 
  RotateCcw, 
  Download, 
  ArrowUpDown, 
  Check, 
  X, 
  Edit2, 
  Plus, 
  Trash2, 
  FileSpreadsheet, 
  FileText,
  HelpCircle,
  TrendingUp,
  LayoutGrid,
  Settings,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  AlertCircle,
  Eye,
  Camera,
  Archive,
  ChevronDown,
  Phone,
  ArrowUpRight,
  ArrowDownRight,
  Layers,
  Building2,
  DollarSign
} from 'lucide-react';

const mapMonthToAscii = (month: string) => {
  return month
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '_');
};

interface ContractTableProps {
  contracts: Contract[];
  prices: PvfPrices;
  user: UserSession | null;
  onUpdatePrices: (prices: PvfPrices) => void;
  onUpdateContracts: (contracts: Contract[]) => void;
}

export default function ContractTable({
  contracts,
  prices,
  user,
  onUpdatePrices,
  onUpdateContracts,
}: ContractTableProps) {
  // UI States
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSecretaria, setSelectedSecretaria] = useState('');
  const [isOrganDropdownOpen, setIsOrganDropdownOpen] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState('');
  const [minTotalValue, setMinTotalValue] = useState<number | ''>('');
  const [maxTotalValue, setMaxTotalValue] = useState<number | ''>('');
  const [isSubmittingContract, setIsSubmittingContract] = useState(false);
  const [isDeletingContract, setIsDeletingContract] = useState(false);
  
  // Sorting State
  const [sortField, setSortField] = useState<string>('secretaria');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);

  // Editing Unit Price Inline
  const [isEditingPrices, setIsEditingPrices] = useState(false);
  const [tempPrices, setTempPrices] = useState<PvfPrices>({ ...prices });

  // Creation/Edit Modal States
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingContract, setEditingContract] = useState<Contract | null>(null);
  const [formContractKey, setFormContractKey] = useState('');
  const [formSecretaria, setFormSecretaria] = useState('');
  const [formStatus, setFormStatus] = useState<'Ativo' | 'Suspenso' | 'Encerrado'>('Ativo');
  const [formQuantities, setFormQuantities] = useState<Record<PvfKey, number>>({
    analogico: 0,
    semFio: 0,
    extensao: 0,
    dBasico: 0,
    dEspecial: 0,
    ipBasico: 0,
    fCabeca: 0,
    sMesa: 0,
    software: 0,
    virtual: 0,
  });
  const [formObservacoes, setFormObservacoes] = useState('');
  const [formError, setFormError] = useState('');

  // Summary Printable Client Modal States
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [summaryContract, setSummaryContract] = useState<Contract | null>(null);
  const [deleteConfirmContract, setDeleteConfirmContract] = useState<Contract | null>(null);

  // Month Selection and Syncing
  const [referenceMonth, setReferenceMonth] = useState('Junho/2026');
  const [dbPvfRecords, setDbPvfRecords] = useState<Contract[]>([]);
  const isZeroMonthSelected = referenceMonth === 'Janeiro/2026' || referenceMonth === 'Fevereiro/2026';

  // Month replication states
  const [showReplicateModal, setShowReplicateModal] = useState(false);
  const [replicateSourceMonth, setReplicateSourceMonth] = useState('Maio/2026');
  const [replicateTargetMonth, setReplicateTargetMonth] = useState('Junho/2026');
  const [isReplicating, setIsReplicating] = useState(false);

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

  // Snapshot Saving States in Firebase
  const [showSaveSnapshotModal, setShowSaveSnapshotModal] = useState(false);
  const [selectedRefMonth, setSelectedRefMonth] = useState(() => {
    const months = [
      'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
      'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];
    const now = new Date();
    return `${months[now.getMonth()]}/${now.getFullYear()}`;
  });
  const [saverName, setSaverName] = useState(user?.displayName || '');
  const [savingSnapshot, setSavingSnapshot] = useState(false);
  const [saveSnapshotError, setSaveSnapshotError] = useState<string | null>(null);

  // Sync reference month selector selection to snapshot modal
  useEffect(() => {
    if (referenceMonth) {
      setSelectedRefMonth(referenceMonth);
    }
  }, [referenceMonth]);

  // Firestore sync for pvfMonthlyContracts
  useEffect(() => {
    const q = collection(db, 'pvfMonthlyContracts');
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const recordsMap = new Map<string, Contract>();
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        let originalId = data.id || '';
        // Clean prefix ending with "-C-" or general month/year pattern from data.id
        const cDashIdx = originalId.indexOf('-C-');
        if (cDashIdx !== -1) {
          originalId = originalId.substring(cDashIdx + 1);
        } else if (originalId.includes('-')) {
          const firstDash = originalId.indexOf('-');
          const prefix = originalId.substring(0, firstDash);
          if (prefix.includes('_') && /[0-9]/.test(prefix)) {
            originalId = originalId.substring(firstDash + 1);
          }
        }

        // Fallback to docSnap.id if originalId is empty
        if (!originalId) {
          const docId = docSnap.id;
          const docCDashIdx = docId.indexOf('-C-');
          if (docCDashIdx !== -1) {
            originalId = docId.substring(docCDashIdx + 1);
          } else {
            const firstDash = docId.indexOf('-');
            if (firstDash !== -1) {
              originalId = docId.substring(firstDash + 1);
            } else {
              originalId = docId;
            }
          }
        }
        
        const record = { ...data, id: originalId } as Contract;
        const refMonthKey = (record.referenceMonth || '').toLowerCase().trim();
        const mapKey = `${refMonthKey}-${originalId}`;
        
        // Let it naturally overwrite so that lowercase mapMonthToAscii documents
        // (which are returned later in alphabetical sort order than uppercase 'Maio' documents)
        // will take precedence and represent the latest customized user settings.
        recordsMap.set(mapKey, record);
      });
      const records = Array.from(recordsMap.values());
      setDbPvfRecords(records);
    }, (error) => {
      console.error("Erro no onSnapshot do pvfMonthlyContracts:", error);
      // Offline fallback
      const cached = localStorage.getItem('pvf_monthly_offline_records');
      if (cached) {
        setDbPvfRecords(JSON.parse(cached));
      }
    });
    return () => unsubscribe();
  }, []);



  // Sync to local storage for offline support
  useEffect(() => {
    if (dbPvfRecords.length > 0) {
      localStorage.setItem('pvf_monthly_offline_records', JSON.stringify(dbPvfRecords));
    }
  }, [dbPvfRecords]);

  // Active contracts for the selected reference month (falling back to default contracts list if not customized yet)
  const activeContractsForMonth = useMemo(() => {
    if (isZeroMonthSelected) return [];
    
    // Filter records in collection for the current selected referenceMonth
    const monthFiltered = dbPvfRecords.filter(r => r.referenceMonth === referenceMonth);
    
    const isFutureMonth = [
      'Julho/2026',
      'Agosto/2026',
      'Setembro/2026',
      'Outubro/2026',
      'Novembro/2026',
      'Dezembro/2026'
    ].includes(referenceMonth);

    if (isFutureMonth && monthFiltered.length === 0) {
      return [];
    }

    // Merge base contracts with customized variables from Firestore for this specific month
    const merged = contracts.map(c => {
      const custom = monthFiltered.find(r => r.id === c.id);
      if (custom) {
        return { ...c, ...custom };
      }
      return { ...c, referenceMonth };
    });

    // Also include any newly created contracts in this month that don't exist in base contracts list
    const existingIds = new Set(contracts.map(c => c.id));
    const newCustomContracts = monthFiltered.filter(r => !existingIds.has(r.id));

    return [...merged, ...newCustomContracts];
  }, [dbPvfRecords, contracts, referenceMonth, isZeroMonthSelected]);

  // Current PVF statistics for selected month
  const currentBillingVal = useMemo(() => {
    if (isZeroMonthSelected) return 0;
    return activeContractsForMonth
      .filter(c => c.status === 'Ativo')
      .reduce((acc, c) => acc + getContractValue(c, prices), 0);
  }, [activeContractsForMonth, prices, isZeroMonthSelected]);

  const currentPvfsCount = useMemo(() => {
    if (isZeroMonthSelected) return 0;
    return activeContractsForMonth
      .filter(c => c.status === 'Ativo')
      .reduce((acc, c) => acc + getContractPvfTotal(c), 0);
  }, [activeContractsForMonth, isZeroMonthSelected]);

  const currentActiveContractCount = useMemo(() => {
    if (isZeroMonthSelected) return 0;
    return activeContractsForMonth.filter(c => c.status === 'Ativo').length;
  }, [activeContractsForMonth, isZeroMonthSelected]);

  // Previous month PVF statistics and calculations for comparison cards
  const previousMonthStr = useMemo(() => {
    const idx = availableMonths.indexOf(referenceMonth);
    return idx > 0 ? availableMonths[idx - 1] : '';
  }, [referenceMonth]);

  const previousMonthContracts = useMemo(() => {
    if (!previousMonthStr) return [];
    if (previousMonthStr === 'Janeiro/2026' || previousMonthStr === 'Fevereiro/2026') return [];

    const monthFiltered = dbPvfRecords.filter(r => r.referenceMonth === previousMonthStr);
    
    // Merge base contracts with customized variables from Firestore for the previous month
    const merged = contracts.map(c => {
      const custom = monthFiltered.find(r => r.id === c.id);
      if (custom) {
        return { ...c, ...custom };
      }
      return { ...c, referenceMonth: previousMonthStr };
    });

    // Also include newly created contracts
    const existingIds = new Set(contracts.map(c => c.id));
    const newCustomContracts = monthFiltered.filter(r => !existingIds.has(r.id));

    return [...merged, ...newCustomContracts];
  }, [dbPvfRecords, contracts, previousMonthStr]);

  const findMatchingPvfPrevContract = (currentContract: Contract) => {
    if (!previousMonthContracts || previousMonthContracts.length === 0) return null;
    return previousMonthContracts.find(r => r.id === currentContract.id) || 
      previousMonthContracts.find(r => r.contrato?.trim() === currentContract.contrato?.trim()) || null;
  };

  const previousBillingVal = useMemo(() => {
    if (!previousMonthStr || previousMonthStr === 'Janeiro/2026' || previousMonthStr === 'Fevereiro/2026') return 0;
    return previousMonthContracts
      .filter(c => c.status === 'Ativo')
      .reduce((acc, c) => acc + getContractValue(c, prices), 0);
  }, [previousMonthContracts, previousMonthStr, prices]);

  const previousPvfsCount = useMemo(() => {
    if (!previousMonthStr || previousMonthStr === 'Janeiro/2026' || previousMonthStr === 'Fevereiro/2026') return 0;
    return previousMonthContracts
      .filter(c => c.status === 'Ativo')
      .reduce((acc, c) => acc + getContractPvfTotal(c), 0);
  }, [previousMonthContracts, previousMonthStr]);

  const previousActiveContractCount = useMemo(() => {
    if (!previousMonthStr || previousMonthStr === 'Janeiro/2026' || previousMonthStr === 'Fevereiro/2026') return 0;
    return previousMonthContracts.filter(c => c.status === 'Ativo').length;
  }, [previousMonthContracts, previousMonthStr]);

  // Comparison metrics for UI display
  const billingComparison = useMemo(() => {
    const currentVal = currentBillingVal;
    const previousVal = previousBillingVal;
    const diff = currentVal - previousVal;
    const percent = previousVal > 0 ? (diff / previousVal) * 100 : 0;
    let direction: 'up' | 'down' | 'stable' = 'stable';
    if (diff > 0.01) direction = 'up';
    else if (diff < -0.01) direction = 'down';

    return {
      current: currentVal,
      previous: previousVal,
      diff,
      percent,
      direction,
      hasPrevious: !!previousMonthStr,
      previousLabel: previousMonthStr
    };
  }, [currentBillingVal, previousBillingVal, previousMonthStr]);

  const pvfsComparison = useMemo(() => {
    const currentVal = currentPvfsCount;
    const previousVal = previousPvfsCount;
    const diff = currentVal - previousVal;
    const percent = previousVal > 0 ? (diff / previousVal) * 100 : 0;
    let direction: 'up' | 'down' | 'stable' = 'stable';
    if (diff > 0) direction = 'up';
    else if (diff < 0) direction = 'down';

    return {
      current: currentVal,
      previous: previousVal,
      diff,
      percent,
      direction,
      hasPrevious: !!previousMonthStr,
      previousLabel: previousMonthStr
    };
  }, [currentPvfsCount, previousPvfsCount, previousMonthStr]);

  const contractsComparison = useMemo(() => {
    const currentVal = currentActiveContractCount;
    const previousVal = previousActiveContractCount;
    const diff = currentVal - previousVal;
    const percent = previousVal > 0 ? (diff / previousVal) * 100 : 0;
    let direction: 'up' | 'down' | 'stable' = 'stable';
    if (diff > 0) direction = 'up';
    else if (diff < 0) direction = 'down';

    return {
      current: currentVal,
      previous: previousVal,
      diff,
      percent,
      direction,
      hasPrevious: !!previousMonthStr,
      previousLabel: previousMonthStr
    };
  }, [currentActiveContractCount, previousActiveContractCount, previousMonthStr]);

  // Info alerts
  const [notification, setNotification] = useState<{ type: 'success' | 'info'; message: string } | null>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowSummaryModal(false);
        setSummaryContract(null);
        setShowFormModal(false);
        setDeleteConfirmContract(null);
        setShowSaveSnapshotModal(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const showNotification = (message: string, type: 'success' | 'info' = 'success') => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 4000);
  };

  useEffect(() => {
    if (user?.displayName) {
      setSaverName(user.displayName);
    }
  }, [user]);

  const handleSaveSnapshot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRefMonth.trim()) {
      setSaveSnapshotError('O mês de referência é obrigatório.');
      return;
    }
    if (!saverName.trim()) {
      setSaveSnapshotError('O nome do usuário é obrigatório.');
      return;
    }

    setSavingSnapshot(true);
    setSaveSnapshotError(null);

    try {
      const totalPvfCount = activeContractsForMonth.reduce((acc: number, c) => {
        return acc + (Object.values(c.quantities).reduce((a: number, b: any) => a + (Number(b) || 0), 0) as number);
      }, 0);

      const totalBilling = activeContractsForMonth.reduce((acc: number, c) => {
        return acc + Object.entries(c.quantities).reduce((sum: number, [key, qty]) => {
          return sum + (Number(qty) * (prices[key as PvfKey] || 0));
        }, 0);
      }, 0);

      const sanitizedMonth = selectedRefMonth.replace(/[^a-zA-Z0-9_\-]/g, '_');
      const snapshotId = `ref_${sanitizedMonth}_${Date.now()}`;
      const docRef = doc(db, 'monthlyBillingSnapshots', snapshotId);

      const snapshotData = {
        referenceMonth: selectedRefMonth,
        savedAt: new Date().toISOString(),
        savedBy: saverName,
        totalPvfCount,
        totalBilling,
        contracts: activeContractsForMonth.map(c => ({
          id: c.id,
          contrato: c.contrato,
          secretaria: c.secretaria,
          quantities: c.quantities,
          status: c.status,
          dataAssinatura: c.dataAssinatura || '',
        })),
        prices: prices,
        createdAt: serverTimestamp()
      };

      await setDoc(docRef, snapshotData);
      showNotification(`Memória de faturamento para ${selectedRefMonth} salva com sucesso!`, 'success');
      setShowSaveSnapshotModal(false);
    } catch (err) {
      console.error("Erro ao gravar snapshot no Firestore:", err);
      try {
        handleFirestoreError(err, OperationType.CREATE, `monthlyBillingSnapshots/ref_${selectedRefMonth.replace(/[^a-zA-Z0-9_\-]/g, '_')}`);
      } catch (formattedErr) {
        console.error("Erro formatado do Firestore:", formattedErr);
      }
      setSaveSnapshotError('Erro ao gravar dados no Firestore. Verifique suas regras ou conexão de rede.');
    } finally {
      setSavingSnapshot(false);
    }
  };

  // Get list of unique secretarias for filter select
  const secretariasList = useMemo(() => {
    const list = activeContractsForMonth.map(c => c.secretaria.split(' - ')[0]);
    return Array.from(new Set(list)).sort();
  }, [activeContractsForMonth]);

  const organAutocompleteOptions = useMemo(() => {
    const query = selectedSecretaria.toLowerCase().trim();
    
    // Get unique list of secretariats/departments
    const allSecs: string[] = Array.from(new Set(activeContractsForMonth.map(c => c.secretaria))).sort() as string[];
    
    if (!query) {
      // If query is empty, show up to 6 unique secretariats as quick suggestions
      return allSecs.slice(0, 6).map(sec => ({
        type: 'Secretaria' as const,
        value: sec
      }));
    }
    
    // Filter matching secretariats
    const matchedSecs = allSecs
      .filter(sec => sec.toLowerCase().includes(query))
      .slice(0, 5)
      .map(sec => ({ type: 'Secretaria' as const, value: sec }));
      
    // Filter matching contracts
    const matchedContracts = activeContractsForMonth
      .filter(c => c.contrato.toLowerCase().includes(query))
      .slice(0, 5)
      .map(c => ({ type: 'Contrato' as const, value: c.contrato }));
      
    return [...matchedSecs, ...matchedContracts];
  }, [activeContractsForMonth, selectedSecretaria]);

  // Handle Sort Change
  const handleSort = (field: string) => {
    const isAsc = sortField === field && sortDirection === 'asc';
    setSortDirection(isAsc ? 'desc' : 'asc');
    setSortField(field);
  };

  // Check if current user has edit permission
  const canModify = user && (user.role === 'admin' || user.role === 'editor');

  // Reset Filters helper
  const handleResetFilters = () => {
    setSearchTerm('');
    setSelectedSecretaria('');
    setSelectedStatus('');
    setMinTotalValue('');
    setMaxTotalValue('');
    setCurrentPage(1);
    showNotification('Filtros redefinidos para os padrões.', 'info');
  };

  // Inline pricing edits save
  const handleSavePrices = () => {
    onUpdatePrices(tempPrices);
    setIsEditingPrices(false);
    showNotification('Valores unitários salvos e faturamento recalculado!');
  };

  const handleCancelPrices = () => {
    setTempPrices({ ...prices });
    setIsEditingPrices(false);
  };

  const handlePriceChange = (key: PvfKey, valStr: string) => {
    const val = parseFloat(valStr);
    setTempPrices(prev => ({
      ...prev,
      [key]: isNaN(val) ? 0 : val
    }));
  };

  // Open creation modal
  const handleOpenCreateModal = () => {
    setEditingContract(null);
    setFormContractKey('');
    setFormSecretaria('');
    setFormStatus('Ativo');
    setFormQuantities({
      analogico: 0,
      semFio: 0,
      extensao: 0,
      dBasico: 0,
      dEspecial: 0,
      ipBasico: 0,
      fCabeca: 0,
      sMesa: 0,
      software: 0,
      virtual: 0,
    });
    setFormObservacoes('');
    setFormError('');
    setShowFormModal(true);
  };

  // Open edit modal
  const handleOpenEditModal = (contract: Contract) => {
    setEditingContract(contract);
    setFormContractKey(contract.contrato);
    setFormSecretaria(contract.secretaria);
    setFormStatus(contract.status);
    setFormQuantities({ ...contract.quantities });
    setFormObservacoes(contract.observacoes || '');
    setFormError('');
    setShowFormModal(true);
  };

  // Open client summary modal
  const handleOpenSummaryModal = (contract: Contract) => {
    setSummaryContract(contract);
    setShowSummaryModal(true);
  };

  // Handle contract delete trigger
  const handleDeleteContract = (contract: Contract) => {
    setDeleteConfirmContract(contract);
  };

  const handleConfirmDelete = async () => {
    if (deleteConfirmContract) {
      const name = deleteConfirmContract.contrato;
      setIsDeletingContract(true);
      try {
        const docId = `${mapMonthToAscii(referenceMonth)}-${deleteConfirmContract.id}`;
        
        // Find if this month already has active records in database
        const monthFiltered = dbPvfRecords.filter(r => r.referenceMonth === referenceMonth);
        if (monthFiltered.length === 0) {
          // Pre-warm month: write all other contracts of this month to pvfMonthlyContracts
          const otherContracts = activeContractsForMonth.filter(c => c.id !== deleteConfirmContract.id);
          for (const item of otherContracts) {
            const itemDocId = `${mapMonthToAscii(referenceMonth)}-${item.id}`;
            await setDoc(doc(db, 'pvfMonthlyContracts', itemDocId), {
              ...item,
              referenceMonth
            });
          }
        } else {
          // Delete individual contract from custom month
          await deleteDoc(doc(db, 'pvfMonthlyContracts', docId));
        }

        showNotification(`Contrato "${name}" removido com sucesso.`);
        setDeleteConfirmContract(null);
      } catch (err) {
        console.error("Erro ao remover contrato:", err);
        showNotification("Erro ao remover contrato do Firestore. Verifique as permissões.", "info");
      } finally {
        setIsDeletingContract(false);
      }
    }
  };

  // Submit contract form
  const handleSaveContractForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formContractKey.trim() || !formSecretaria.trim()) {
      setFormError('Por favor, preencha os campos de Contrato e Secretaria.');
      return;
    }

    setIsSubmittingContract(true);
    setFormError('');

    try {
      if (editingContract) {
        // Modify
        const docId = `${mapMonthToAscii(referenceMonth)}-${editingContract.id}`;
        const updatedContract = {
          ...editingContract,
          contrato: formContractKey,
          secretaria: formSecretaria,
          status: formStatus,
          quantities: formQuantities,
          observacoes: formObservacoes,
          referenceMonth
        };

        const monthFiltered = dbPvfRecords.filter(r => r.referenceMonth === referenceMonth);
        if (monthFiltered.length === 0) {
          // Pre-warm month of reference
          for (const item of activeContractsForMonth) {
            const itemDocId = `${mapMonthToAscii(referenceMonth)}-${item.id}`;
            const isEditingItem = item.id === editingContract.id;
            await setDoc(doc(db, 'pvfMonthlyContracts', itemDocId), isEditingItem ? updatedContract : {
              ...item,
              referenceMonth
            });
          }
        } else {
          // Update in-place
          await setDoc(doc(db, 'pvfMonthlyContracts', docId), updatedContract);
        }
        showNotification('Contrato atualizado com sucesso!');
      } else {
        // Create new
        const newId = `C-${Date.now().toString().slice(-3)}`;
        const newContract: Contract = {
          id: newId,
          contrato: formContractKey,
          secretaria: formSecretaria,
          status: formStatus,
          quantities: formQuantities,
          dataAssinatura: new Date().toLocaleDateString('pt-BR'),
          observacoes: formObservacoes,
          referenceMonth
        };
        const docId = `${mapMonthToAscii(referenceMonth)}-${newId}`;

        const monthFiltered = dbPvfRecords.filter(r => r.referenceMonth === referenceMonth);
        if (monthFiltered.length === 0) {
          // Pre-warm month with items
          for (const item of activeContractsForMonth) {
            const itemDocId = `${mapMonthToAscii(referenceMonth)}-${item.id}`;
            await setDoc(doc(db, 'pvfMonthlyContracts', itemDocId), {
              ...item,
              referenceMonth
            });
          }
        }
        await setDoc(doc(db, 'pvfMonthlyContracts', docId), newContract);
        showNotification('Novo contrato registrado com sucesso!');
      }
      setShowFormModal(false);
    } catch (err) {
      console.error("Erro ao gravar contrato:", err);
      // Give readable feedback to users
      const errorMsg = err instanceof Error ? err.message : String(err);
      if (errorMsg.includes("PERMISSION_DENIED") || errorMsg.includes("regras de segurança")) {
        setFormError("Erro de permissão no Firestore. Garanta que o contrato atende aos requisitos.");
      } else {
        setFormError("Erro ao gravar dados no Firestore. Verifique as regras ou conexão de rede.");
      }
      showNotification("Falha ao salvar contrato no banco de dados.", "info");
    } finally {
      setIsSubmittingContract(false);
    }
  };

  // Replication handler: duplicates PVF table from source month to target month
  const handleReplicateContracts = async () => {
    if (replicateSourceMonth === replicateTargetMonth) {
      showNotification('O mês de origem e o mês de destino devem ser diferentes.', 'info');
      return;
    }

    setIsReplicating(true);
    try {
      // 1. Filter dbPvfRecords for the source month
      const sourceMonthFiltered = dbPvfRecords.filter(r => r.referenceMonth === replicateSourceMonth);
      
      // Calculate final actual records for source month (combining base contracts and Firestore custom/new ones)
      const sourceActiveContracts = contracts.map(c => {
        const custom = sourceMonthFiltered.find(r => r.id === c.id);
        if (custom) {
          return { ...c, ...custom };
        }
        return { ...c, referenceMonth: replicateSourceMonth };
      });

      const existingIds = new Set(contracts.map(c => c.id));
      const sourceNewCustomContracts = sourceMonthFiltered.filter(r => !existingIds.has(r.id));
      const tempAllSourceContracts = [...sourceActiveContracts, ...sourceNewCustomContracts];

      // 2. Perform write / duplicate documents to target month
      for (const contract of tempAllSourceContracts) {
        const targetDocId = `${mapMonthToAscii(replicateTargetMonth)}-${contract.id}`;
        const replicatedContract = {
          ...contract,
          id: contract.id, // preserve the core id
          referenceMonth: replicateTargetMonth
        };
        try {
          await setDoc(doc(db, 'pvfMonthlyContracts', targetDocId), replicatedContract);
        } catch (innerErr) {
          handleFirestoreError(innerErr, OperationType.WRITE, `pvfMonthlyContracts/${targetDocId}`);
        }
      }

      showNotification(`Dados de ${replicateSourceMonth} replicados para ${replicateTargetMonth} com sucesso!`);
      // Update view to the new target month so the user sees the newly copied data immediately!
      setReferenceMonth(replicateTargetMonth);
      setCurrentPage(1);
      setShowReplicateModal(false);
    } catch (err) {
      console.error("Erro total na replicação:", err);
      showNotification("Falha ao replicar contratos no Firestore.", "info");
    } finally {
      setIsReplicating(false);
    }
  };

  // Apply search and advanced filters
  const filteredContracts = useMemo(() => {
    return activeContractsForMonth.filter(contract => {
      // Search
      const textToSearch = `${contract.contrato} ${contract.secretaria} ${contract.observacoes || ''}`.toLowerCase();
      const matchesSearch = textToSearch.includes(searchTerm.toLowerCase());

      // Secretaria ou Contrato
      const matchesSecretaria = !selectedSecretaria || 
        contract.secretaria.toLowerCase().includes(selectedSecretaria.toLowerCase()) ||
        contract.contrato.toLowerCase().includes(selectedSecretaria.toLowerCase());

      // Status
      const matchesStatus = !selectedStatus || contract.status === selectedStatus;

      // Val total calculation
      const totalVal = getContractValue(contract, prices);
      const matchesMinVal = minTotalValue === '' || totalVal >= (minTotalValue as number);
      const matchesMaxVal = maxTotalValue === '' || totalVal <= (maxTotalValue as number);

      return matchesSearch && matchesSecretaria && matchesStatus && matchesMinVal && matchesMaxVal;
    });
  }, [activeContractsForMonth, searchTerm, selectedSecretaria, selectedStatus, minTotalValue, maxTotalValue, prices]);

  // Memoize column totals based on filtered items
  const columnTotals = useMemo(() => {
    const totals: Record<PvfKey, number> = {
      analogico: 0,
      semFio: 0,
      extensao: 0,
      dBasico: 0,
      dEspecial: 0,
      ipBasico: 0,
      fCabeca: 0,
      sMesa: 0,
      software: 0,
      virtual: 0,
    };
    let totalPvfQty = 0;
    let grandTotalVal = 0;

    filteredContracts.forEach(c => {
      Object.keys(totals).forEach(k => {
        const key = k as PvfKey;
        const qty = c.quantities[key] || 0;
        totals[key] += qty;
      });
      totalPvfQty += getContractPvfTotal(c);
      grandTotalVal += getContractValue(c, prices);
    });

    return {
      pvfTotals: totals,
      totalPvfQty,
      grandTotalVal,
    };
  }, [filteredContracts, prices]);

  // Apply sorting
  const sortedAndFilteredContracts = useMemo(() => {
    const sorted = [...filteredContracts];
    sorted.sort((a, b) => {
      let aVal: any = '';
      let bVal: any = '';

      if (sortField === 'contrato') {
        aVal = a.contrato;
        bVal = b.contrato;
      } else if (sortField === 'secretaria') {
        aVal = a.secretaria;
        bVal = b.secretaria;
      } else if (sortField === 'status') {
        aVal = a.status;
        bVal = b.status;
      } else if (sortField === 'qtdPvf') {
        aVal = getContractPvfTotal(a);
        bVal = getContractPvfTotal(b);
      } else if (sortField === 'valorTotal') {
        aVal = getContractValue(a, prices);
        bVal = getContractValue(b, prices);
      } else {
        // Specific PVF model key
        aVal = a.quantities[sortField as PvfKey] || 0;
        bVal = b.quantities[sortField as PvfKey] || 0;
      }

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDirection === 'asc' 
          ? aVal.localeCompare(bVal, 'pt-BR') 
          : bVal.localeCompare(aVal, 'pt-BR');
      } else {
        return sortDirection === 'asc' 
          ? (aVal as number) - (bVal as number)
          : (bVal as number) - (aVal as number);
      }
    });

    return sorted;
  }, [filteredContracts, sortField, sortDirection, prices]);

  // Apply pagination
  const paginatedContracts = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return sortedAndFilteredContracts.slice(startIndex, startIndex + pageSize);
  }, [sortedAndFilteredContracts, currentPage, pageSize]);

  const totalPages = Math.ceil(sortedAndFilteredContracts.length / pageSize) || 1;

  // Handle page size change
  const handlePageSizeChange = (valStr: string) => {
    setPageSize(parseInt(valStr));
    setCurrentPage(1);
  };

  // Excel (CSV) export
  const exportToExcel = () => {
    try {
      const formatCurrencyForExcel = (val: number): string => {
        const formatted = formatCurrency(val).replace(/\s/g, ' ');
        return `"${formatted}"`;
      };

      // Create headers
      const headers = [
        'Contrato',
        'Secretaria',
        'Status',
        ...Object.values(PVF_LABELS),
        'Qtd PVF Total',
        'Valor Total (BRL)'
      ];

      // Format first row as Unit Prices
      const firstRowCsv = [
        'VALOR UNITARIO',
        'Referência Base de Preços',
        '-',
        ...Object.keys(PVF_LABELS).map(k => formatCurrencyForExcel(prices[k as PvfKey])),
        '-',
        '-'
      ];

      // Sort contracts alphabetically by "Secretaria"
      const sortedContractsForExcel = [...filteredContracts].sort((a, b) => {
        const secA = a.secretaria || '';
        const secB = b.secretaria || '';
        return secA.localeCompare(secB, 'pt', { sensitivity: 'base' });
      });

      const dataRows = sortedContractsForExcel.map(contract => {
        const qtyTotal = getContractPvfTotal(contract);
        const valTotal = getContractValue(contract, prices);
        
        const prev = findMatchingPvfPrevContract(contract);
        let statusStr = contract.status;
        let qtyTotalStr: string | number = qtyTotal;
        let valTotalStr = formatCurrencyForExcel(valTotal);
        let rowMarker = '';

        if (prev) {
          let hasDiff = false;
          if (contract.status !== prev.status) {
            statusStr = `${contract.status} (ant: ${prev.status})`;
            hasDiff = true;
          }
          if (qtyTotal !== getContractPvfTotal(prev)) {
            qtyTotalStr = `${qtyTotal} (ant: ${getContractPvfTotal(prev)})`;
            hasDiff = true;
          }
          const prevVal = getContractValue(prev, prices);
          if (Math.abs(valTotal - prevVal) > 0.01) {
            valTotalStr = `"${formatCurrency(valTotal).replace(/\s/g, ' ')} (ant: ${formatCurrency(prevVal).replace(/\s/g, ' ')})"`;
            hasDiff = true;
          }
          
          Object.keys(PVF_LABELS).forEach(k => {
            const currentQty = contract.quantities[k as PvfKey] || 0;
            const prevQty = prev.quantities[k as PvfKey] || 0;
            if (currentQty !== prevQty) {
              hasDiff = true;
            }
          });

          if (hasDiff) {
            rowMarker = '[ALTERADO] ';
          }
        }

        return [
          `"${rowMarker}${contract.contrato}"`,
          `"${contract.secretaria}"`,
          `"${statusStr}"`,
          ...Object.keys(PVF_LABELS).map(k => {
            const currentQty = contract.quantities[k as PvfKey] || 0;
            const prevQty = prev ? (prev.quantities[k as PvfKey] || 0) : 0;
            if (prev && currentQty !== prevQty) {
              return `"${currentQty} (ant: ${prevQty})"`;
            }
            return currentQty;
          }),
          `"${qtyTotalStr}"`,
          valTotalStr
        ];
      });

      const csvContent = [
        headers.join(';'),
        firstRowCsv.join(';'),
        ...dataRows.map(row => row.join(';'))
      ].join('\n');

      // Add UTF-8 BOM to ensure Excel opens accents correctly
      const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', 'gestao_contratos_faturamento.csv');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showNotification('Tabela exportada para Excel (.csv) com sucesso!');
    } catch (e) {
      alert('Erro ao exportar arquivo.');
    }
  };

  // PDF Export of overall report using jsPDF library
  const exportToPdf = () => {
    try {
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      const primaryColor = [43, 138, 139]; // #2b8a8b
      const darkColor = [11, 35, 36]; // #0b2324
      const lightBg = [237, 253, 253]; // #edfdfd
      
      // Header banner
      doc.setFillColor(darkColor[0], darkColor[1], darkColor[2]);
      doc.rect(0, 0, 210, 40, 'F');
      
      // Logo text
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(20);
      doc.text('MÉTODO TELECOM', 15, 18);
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(180, 220, 220);
      doc.text('SISTEMA DE GESTÃO DE CONTRATOS E FATURAMENTO - PECONECTADO II', 15, 25);
      doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}`, 15, 31);
      
      // Report Title
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.setTextColor(darkColor[0], darkColor[1], darkColor[2]);
      doc.text('Relatório Geral de Faturamento Mensal', 15, 52);
      
      // Divider line
      doc.setDrawColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.setLineWidth(0.6);
      doc.line(15, 55, 195, 55);
      
      // Column headers
      doc.setFillColor(lightBg[0], lightBg[1], lightBg[2]);
      doc.rect(15, 60, 180, 8, 'F');
      
      doc.setTextColor(darkColor[0], darkColor[1], darkColor[2]);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.text('CONTRATO', 17, 65);
      doc.text('SECRETARIA / ÓRGÃO', 47, 65);
      doc.text('STATUS', 132, 65);
      doc.text('QTD PVF', 152, 65);
      doc.text('VALOR TOTAL', 172, 65);
      
      let y = 73;
      let totalAmt = 0;
      let count = 0;
      
      sortedAndFilteredContracts.forEach((contract) => {
        if (y > 270) {
          doc.addPage();
          // Redraw table headers on new page
          doc.setFillColor(lightBg[0], lightBg[1], lightBg[2]);
          doc.rect(15, 15, 180, 8, 'F');
          doc.setTextColor(darkColor[0], darkColor[1], darkColor[2]);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8.5);
          doc.text('CONTRATO', 17, 20);
          doc.text('SECRETARIA / ÓRGÃO', 47, 20);
          doc.text('STATUS', 132, 20);
          doc.text('QTD PVF', 152, 20);
          doc.text('VALOR TOTAL', 172, 20);
          y = 28;
        }
        
        const valTotal = getContractValue(contract, prices);
        totalAmt += valTotal;
        count++;
        
        // Find previous contract
        const prev = findMatchingPvfPrevContract(contract);
        let isRowEdited = false;
        let isStatusEdited = false;
        let isQtyTotalEdited = false;
        let isValTotalEdited = false;

        if (prev) {
          const hasQtyDiff = Object.keys(PVF_LABELS).some(k => (contract.quantities[k as PvfKey] || 0) !== (prev.quantities[k as PvfKey] || 0));
          if (hasQtyDiff || contract.status !== prev.status) {
            isRowEdited = true;
          }
          if (contract.status !== prev.status) isStatusEdited = true;
          if (getContractPvfTotal(contract) !== getContractPvfTotal(prev)) isQtyTotalEdited = true;
          if (Math.abs(valTotal - getContractValue(prev, prices)) > 0.01) isValTotalEdited = true;
        }

        // Draw background
        if (isRowEdited) {
          doc.setFillColor(254, 243, 199); // soft amber highlight (#fef3c7)
          doc.rect(15, y - 4, 180, 6.5, 'F');
        } else if (count % 2 === 0) {
          doc.setFillColor(248, 250, 252);
          doc.rect(15, y - 4, 180, 6.5, 'F');
        }
        
        doc.setTextColor(50, 50, 50);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.text(contract.contrato, 17, y);
        
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        let secName = contract.secretaria;
        doc.text(secName, 47, y);
        
        if (isStatusEdited && prev) {
          doc.setTextColor(180, 83, 9); // Amber text
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7.5);
          doc.text(`${contract.status} (${prev.status.substring(0,3)})`, 132, y);
        } else {
          doc.setTextColor(50, 50, 50);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8);
          doc.text(contract.status, 132, y);
        }
        
        const totalPvfQty = getContractPvfTotal(contract);
        if (isQtyTotalEdited && prev) {
          doc.setTextColor(180, 83, 9); // Amber text
          doc.setFont('helvetica', 'bold');
          doc.text(`${totalPvfQty} (${getContractPvfTotal(prev)})`, 154, y);
        } else {
          doc.setTextColor(50, 50, 50);
          doc.setFont('helvetica', 'normal');
          doc.text(String(totalPvfQty), 154, y);
        }
        
        if (isValTotalEdited && prev) {
          doc.setTextColor(180, 83, 9); // Amber text
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(6.5);
          doc.text(`${formatCurrency(valTotal)} (ant: ${formatCurrency(getContractValue(prev, prices))})`, 166, y);
          doc.setFontSize(8);
        } else {
          doc.setTextColor(50, 50, 50);
          doc.setFont('helvetica', 'bold');
          doc.text(formatCurrency(valTotal), 172, y);
        }
        
        // Divider line
        doc.setDrawColor(240, 240, 240);
        doc.setLineWidth(0.1);
        doc.line(15, y + 2.5, 195, y + 2.5);
        
        y += 6.5;
      });
      
      // Total summary row at the bottom
      if (y > 260) {
        doc.addPage();
        y = 20;
      }
      
      doc.setDrawColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.setLineWidth(0.5);
      doc.line(15, y + 1, 195, y + 1);
      
      doc.setFillColor(lightBg[0], lightBg[1], lightBg[2]);
      doc.rect(15, y + 2.5, 180, 14, 'F');
      
      doc.setTextColor(darkColor[0], darkColor[1], darkColor[2]);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.text(`Total de Contratos: ${count}`, 20, y + 11);
      
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10.5);
      const finalTotalText = `Faturamento Geral Mensal: ${formatCurrency(totalAmt)}`;
      doc.text(finalTotalText, 110, y + 11);
      
      doc.save('gestao_contratos_faturamento.pdf');
      showNotification('Relatório PDF exportado com sucesso!');
    } catch (err) {
      console.error("PDF generation failed:", err);
      showNotification('Falha ao exportar PDF. Tente novamente.', 'info');
    }
  };

  // PDF Export of single contract invoice summary using jsPDF library
  const exportSingleContractInvoiceToPdf = (contract: Contract) => {
    try {
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      const primaryColor = [43, 138, 139]; // #2b8a8b
      const darkColor = [11, 35, 36]; // #0b2324
      const lightBg = [237, 253, 253]; // #edfdfd
      
      // Header Banner
      doc.setFillColor(darkColor[0], darkColor[1], darkColor[2]);
      doc.rect(0, 0, 210, 45, 'F');
      
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(22);
      doc.text('MÉTODO TELECOM', 15, 18);
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(180, 220, 220);
      doc.text('PECONECTADO II', 15, 26);
      doc.text(`Criação da Memória: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}`, 15, 32);
      
      // Grand Total faturamento box in header
      const totalVal = getContractValue(contract, prices);
      doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.rect(130, 10, 65, 25, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.text('FATURAMENTO MENSAL (BRL)', 133, 16);
      doc.setFontSize(13);
      doc.text(formatCurrency(totalVal), 133, 27);
      
      // Title
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.setTextColor(darkColor[0], darkColor[1], darkColor[2]);
      doc.text('MEMÓRIA DETALHADA DE FATURAMENTO', 15, 57);
      
      // Divider
      doc.setDrawColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.setLineWidth(0.6);
      doc.line(15, 60, 195, 60);
      
      // Metadata section
      doc.setFillColor(248, 250, 252);
      doc.rect(15, 65, 180, 22, 'F');
      
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(120, 120, 120);
      doc.text('CONTRATO', 20, 71);
      doc.text('STATUS', 75, 71);
      doc.text('SECRETARIA', 115, 71);
      
      doc.setTextColor(darkColor[0], darkColor[1], darkColor[2]);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text(contract.contrato, 20, 79);
      doc.text(contract.status.toUpperCase(), 75, 79);
      
      let secName = contract.secretaria;
      doc.setFontSize(8);
      const splitSecName = doc.splitTextToSize(secName, 75);
      doc.text(splitSecName, 115, 77);
      
      // Line item list header
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(darkColor[0], darkColor[1], darkColor[2]);
      doc.text('Detalhamento de Ponto de Voz Fixo', 15, 96);
      
      // Table Header row
      doc.setFillColor(darkColor[0], darkColor[1], darkColor[2]);
      doc.rect(15, 100, 180, 8, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.text('TIPO DE LINHA (PVF)', 18, 105);
      doc.text('QUANTIDADE', 95, 105);
      doc.text('TARIFA UNIT.', 130, 105);
      doc.text('VALOR TOTAL (BRL)', 163, 105);
      
      let y = 114;
      let rowCount = 0;
      
      Object.keys(PVF_LABELS).forEach((k) => {
        const key = k as PvfKey;
        const qty = contract.quantities[key] || 0;
        if (qty === 0) return; // Only show rows with non-zero quantity
        
        const unitPrice = prices[key] || 0;
        const subtotal = qty * unitPrice;
        rowCount++;
        
        if (rowCount % 2 === 0) {
          doc.setFillColor(248, 250, 252);
          doc.rect(15, y - 4, 180, 6, 'F');
        }
        
        doc.setTextColor(40, 40, 40);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.text(PVF_LABELS[key], 18, y);
        
        doc.setFont('helvetica', 'bold');
        doc.text(String(qty), 98, y);
        
        doc.setFont('helvetica', 'normal');
        doc.text(formatCurrency(unitPrice), 130, y);
        
        doc.setFont('helvetica', 'bold');
        doc.text(formatCurrency(subtotal), 163, y);
        
        // Row bottom border
        doc.setDrawColor(240, 240, 240);
        doc.setLineWidth(0.1);
        doc.line(15, y + 2, 195, y + 2);
        
        y += 6;
      });
      
      // Total memo box at bottom
      y += 10;
      doc.setFillColor(lightBg[0], lightBg[1], lightBg[2]);
      doc.rect(15, y, 180, 14, 'F');
      
      doc.setDrawColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.setLineWidth(0.3);
      doc.rect(15, y, 180, 14);
      
      doc.setTextColor(darkColor[0], darkColor[1], darkColor[2]);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.text('VALOR TOTAL DA MEMÓRIA DE FATURAMENTO:', 20, y + 8.5);
      
      doc.setFontSize(11);
      doc.text(formatCurrency(totalVal), 160, y + 8.5);
      
      const cleanContratoName = contract.contrato.replace(/\s+/g, '_');
      doc.save(`faturamento_${cleanContratoName}.pdf`);
      showNotification(`Memória PDF de "${contract.contrato}" gerada com sucesso.`);
    } catch (err) {
      console.error("Single PDF generation failed:", err);
      showNotification('Falha ao exportar PDF. Tente novamente.', 'info');
    }
  };

  return (
    <div className="space-y-6">
      {/* Notifications */}
      {notification && (
        <div className={`fixed bottom-5 right-5 z-50 p-4 rounded-xl shadow-2xl flex items-center gap-3 animate-bounce transition-all ${
          notification.type === 'success' 
            ? 'bg-emerald-600 text-white' 
            : 'bg-indigo-600 text-white'
        }`}>
          {notification.type === 'success' ? <Check className="h-5 w-5" /> : <TrendingUp className="h-5 w-5" />}
          <span className="font-medium text-sm">{notification.message}</span>
        </div>
      )}

      {/* Header card with subtle layout background */}
      <div className="relative overflow-hidden rounded-3.5xl border border-zinc-200/80 dark:border-zinc-800/80 bg-white dark:bg-zinc-900 p-6 md:p-8 shadow-xs">
        <div className="absolute right-0 top-0 -mr-16 -mt-16 w-48 h-48 rounded-full bg-brand/5 dark:bg-brand/10 blur-3xl pointer-events-none" />
        <div className="absolute left-1/3 bottom-0 w-64 h-64 rounded-full bg-cyan-500/5 blur-3xl pointer-events-none" />
        
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-brand/15 text-brand dark:bg-zinc-800 dark:text-brand-light">
              <Phone className="h-3 w-3 text-brand" />
              PECONECTADO II
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-zinc-900 dark:text-white font-sans flex items-center gap-2">
              <Phone className="h-7 w-7 text-brand" />
              Faturamento Ponto de Voz Fixo
            </h1>
            <p className="text-zinc-500 dark:text-zinc-400 text-sm max-w-2xl leading-relaxed">
              Demonstrativo consolidado de faturamento por contratos e controle de Ponto de Voz Fixo (PVFs).
            </p>
          </div>
          
          {/* Controls Box: Month Selector and Action Buttons */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
            <div className="flex flex-col justify-center bg-zinc-50 dark:bg-zinc-950 px-5 py-3 rounded-2.5xl border border-zinc-200/50 dark:border-zinc-850/65 min-w-[220px]">
              <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest font-mono">Mês de Referência</span>
              <div className="relative mt-1">
                <select
                  value={referenceMonth}
                  onChange={(e) => {
                    setReferenceMonth(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full bg-white dark:bg-zinc-900 border border-zinc-250 dark:border-zinc-800 rounded-xl px-3 py-1.5 text-xs font-bold text-zinc-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-brand appearance-none cursor-pointer pr-10 shadow-xs"
                >
                  {availableMonths.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3.5 top-2.5 h-4 w-4 text-zinc-400 pointer-events-none" />
              </div>
            </div>

            <div className="flex flex-row sm:flex-col gap-2 shrink-0">
              <button
                onClick={exportToExcel}
                className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-[11px] font-black uppercase tracking-wider transition-all shadow-xs cursor-pointer active:scale-95 duration-150"
              >
                <FileSpreadsheet className="h-4 w-4 text-white" />
                <span>Planilha Excel</span>
              </button>
              <button
                onClick={exportToPdf}
                className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl text-[11px] font-black uppercase tracking-wider transition-all shadow-xs cursor-pointer active:scale-95 duration-150"
              >
                <FileText className="h-4 w-4 text-white" />
                <span>Relatório PDF</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* PVF KPI CARDS GRID */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" id="pvf-kpi-cards">
      
        {/* KPI 1: Faturamento Ativo Total */}
        <div className="bg-gradient-to-br from-brand/5 via-white to-white dark:bg-gradient-to-br dark:from-zinc-900 dark:via-zinc-900/45 dark:to-emerald-950/30 w-full rounded-2xl shadow-sm border border-brand/10 dark:border-emerald-500/20 p-5 flex items-start justify-between relative overflow-hidden group hover:shadow-md dark:hover:border-emerald-500/45 transition-all border-l-4 border-l-brand dark:border-l-emerald-500 font-sans" id="pvf-kpi-faturamento-mensal">
          <div className="space-y-2">
            <span className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider block">Faturamento Mensal</span>
            <div className="text-2xl font-black text-zinc-900 dark:text-zinc-50 font-mono text-nowrap">
              {formatCurrency(currentBillingVal)}
            </div>
            <span className="text-[10px] text-brand dark:text-emerald-400 font-bold bg-brand/10 dark:bg-emerald-950/40 px-2 py-0.5 rounded-md inline-flex items-center gap-0.5 border border-brand/20 dark:border-emerald-500/20">
              <ArrowUpRight className="h-3 w-3" />
              <span>Garantido em contratos</span>
            </span>
          </div>
          <div className="p-3 bg-brand/10 dark:bg-emerald-950/50 text-brand dark:text-emerald-400 rounded-xl group-hover:scale-105 transition-transform border border-brand/20 dark:border-emerald-500/20">
            <DollarSign className="h-5 w-5" />
          </div>
        </div>

        {/* KPI 2: Desempenho Mensal */}
        <div className={`w-full rounded-2xl shadow-sm p-4.5 flex items-start justify-between relative overflow-hidden group hover:shadow-md transition-all border border-l-4 font-sans ${
          billingComparison.direction === 'up'
            ? 'bg-gradient-to-br from-emerald-50/10 via-white to-white dark:bg-none dark:bg-zinc-900 border-emerald-100/70 dark:border-emerald-500/20 border-l-emerald-500 dark:border-l-emerald-500 shadow-emerald-500/5'
            : billingComparison.direction === 'down'
            ? 'bg-gradient-to-br from-rose-50/10 via-white to-white dark:bg-none dark:bg-zinc-900 border-rose-100/70 dark:border-rose-500/20 border-l-rose-500 dark:border-l-rose-500 shadow-rose-500/5'
            : 'bg-gradient-to-br from-zinc-50/20 via-white to-white dark:bg-none dark:bg-zinc-900 border-zinc-200/50 dark:border-zinc-800 border-l-zinc-400 dark:border-l-zinc-600'
        }`} id="pvf-kpi-faturamento-comparativo">
          <div className="space-y-2 w-full pr-1">
            <span className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider block">Desempenho Mensal</span>
            
            {billingComparison.hasPrevious ? (
              <>
                <div className="text-2xl font-black font-mono text-zinc-900 dark:text-zinc-50 flex items-baseline gap-1">
                  <span>{billingComparison.percent >= 0 ? '+' : ''}{billingComparison.percent.toFixed(1)}%</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md inline-flex items-center gap-0.5 border ${
                    billingComparison.direction === 'up'
                      ? 'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-100 dark:border-emerald-500/20'
                      : billingComparison.direction === 'down'
                      ? 'text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border-rose-100 dark:border-rose-500/20'
                      : 'text-zinc-600 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800'
                  }`}>
                    {billingComparison.direction === 'up' ? <ArrowUpRight className="h-3 w-3" /> : billingComparison.direction === 'down' ? <ArrowDownRight className="h-3 w-3" /> : null}
                    <span className="truncate">
                      {billingComparison.direction === 'stable' ? 'Estável' : `${billingComparison.direction === 'up' ? '+' : '-'}${formatCurrency(Math.abs(billingComparison.diff))}`} vs {billingComparison.previousLabel}
                    </span>
                  </span>
                </div>
              </>
            ) : (
              <>
                <div className="text-[14px] font-bold text-zinc-400 dark:text-zinc-500 font-sans py-1">
                  Sem Histórico
                </div>
                <span className="text-[9px] text-zinc-500 dark:text-zinc-400 font-semibold bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded-md inline-block border border-zinc-200 dark:border-zinc-800">
                  Sem mês de comparação anterior
                </span>
              </>
            )}
          </div>
          
          <div className={`p-3 rounded-xl group-hover:scale-105 transition-transform border ${
            billingComparison.direction === 'up'
              ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 border-emerald-100/40 dark:border-emerald-500/20'
              : billingComparison.direction === 'down'
              ? 'bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 border-rose-100/40 dark:border-rose-500/20'
              : 'bg-zinc-50 dark:bg-zinc-950/50 text-zinc-500 dark:text-zinc-400 border-zinc-200/50 dark:border-zinc-700/20'
          }`}>
            <TrendingUp className="h-5 w-5" />
          </div>
        </div>

        {/* KPI 3: PVFs em Operação */}
        <div className="bg-gradient-to-br from-[#e0e7ff]/30 via-white to-white dark:bg-gradient-to-br dark:from-zinc-900 dark:via-zinc-900/45 dark:to-indigo-950/30 w-full rounded-2xl shadow-sm border border-indigo-100/70 dark:border-indigo-500/20 p-5 flex items-start justify-between relative overflow-hidden group hover:shadow-md dark:hover:indigo-500/45 transition-all border-l-4 border-l-indigo-500 dark:border-l-indigo-500 font-sans" id="pvf-kpi-pvfs-ativos">
          <div className="space-y-2">
            <span className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider block">PVFs em Operação</span>
            <div className="text-2xl font-black text-zinc-900 dark:text-zinc-50 font-mono">
              {currentPvfsCount} <span className="text-sm font-medium text-zinc-400">pontos</span>
            </div>
            {pvfsComparison.hasPrevious ? (
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md inline-flex items-center gap-1 border ${
                pvfsComparison.direction === 'up'
                  ? 'text-indigo-700 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 border-indigo-100 dark:border-indigo-500/20 font-sans'
                  : pvfsComparison.direction === 'down'
                  ? 'text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border-rose-100 dark:border-rose-500/20'
                  : 'text-zinc-600 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800'
              }`}>
                {pvfsComparison.direction === 'up' ? <ArrowUpRight className="h-3 w-3" /> : pvfsComparison.direction === 'down' ? <ArrowDownRight className="h-3 w-3" /> : null}
                <span>
                  {pvfsComparison.diff > 0 ? `+${pvfsComparison.diff}` : pvfsComparison.diff} {pvfsComparison.diff > 0 ? 'aumento' : pvfsComparison.diff < 0 ? 'redução' : 'estável'} vs {pvfsComparison.previousLabel}
                </span>
              </span>
            ) : (
              <span className="text-[10px] text-zinc-500 dark:text-zinc-400 font-semibold bg-zinc-50 dark:bg-zinc-850/40 px-2 py-0.5 rounded-md inline-block border border-zinc-200 dark:border-zinc-805">
                Sem histórico anterior
              </span>
            )}
          </div>
          <div className="p-3 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 rounded-xl group-hover:scale-105 transition-transform border border-indigo-100/40 dark:border-indigo-500/20">
            <Layers className="h-5 w-5" />
          </div>
        </div>

        {/* KPI 4: Contratos Ativos */}
        <div className="bg-gradient-to-br from-[#cffafe]/30 via-white to-white dark:bg-gradient-to-br dark:from-zinc-900 dark:via-zinc-900/45 dark:to-cyan-950/30 w-full rounded-2xl shadow-sm border border-cyan-100/70 dark:border-cyan-500/20 p-5 flex items-start justify-between relative overflow-hidden group hover:shadow-md dark:hover:cyan-500/45 transition-all border-l-4 border-l-cyan-500 dark:border-l-cyan-500 font-sans" id="pvf-kpi-contratos-ativos">
          <div className="space-y-2">
            <span className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider block">Contratos Ativos</span>
            <div className="text-2xl font-black text-zinc-900 dark:text-zinc-50 font-mono">
              {currentActiveContractCount} <span className="text-sm font-medium text-zinc-400">ativos</span>
            </div>
            {contractsComparison.hasPrevious ? (
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md inline-flex items-center gap-1 border ${
                contractsComparison.direction === 'up'
                  ? 'text-cyan-700 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-950/40 border-cyan-100 dark:border-cyan-500/20'
                  : contractsComparison.direction === 'down'
                  ? 'text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border-rose-100 dark:border-rose-500/20'
                  : 'text-zinc-650 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-805'
              }`}>
                {contractsComparison.direction === 'up' ? <ArrowUpRight className="h-3 w-3" /> : contractsComparison.direction === 'down' ? <ArrowDownRight className="h-3 w-3" /> : null}
                <span>
                  {contractsComparison.diff > 0 ? `+${contractsComparison.diff}` : contractsComparison.diff} {contractsComparison.diff > 0 ? 'aumento' : contractsComparison.diff < 0 ? 'redução' : 'estável'} vs {contractsComparison.previousLabel}
                </span>
              </span>
            ) : (
              <span className="text-[10px] text-zinc-500 dark:text-zinc-400 font-semibold bg-zinc-50 dark:bg-zinc-850/40 px-2 py-0.5 rounded-md inline-block border border-zinc-200 dark:border-zinc-805">
                Sem histórico anterior
              </span>
            )}
          </div>
          <div className="p-3 bg-cyan-50 dark:bg-cyan-950/50 text-cyan-600 dark:text-cyan-400 rounded-xl group-hover:scale-105 transition-transform border border-cyan-100/40 dark:border-cyan-500/20">
            <Building2 className="h-5 w-5" />
          </div>
        </div>

      </div>

      {/* FILTER & ACTIONS BAR */}
      <div className="bg-zinc-50 dark:bg-zinc-950 p-4.5 rounded-3xl border border-zinc-200 dark:border-zinc-850/65 flex flex-col gap-4">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
          
          {/* Search Input Filter */}
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-3.5 h-4 w-4 text-zinc-400" />
            <input
              type="text"
              value={selectedSecretaria}
              onChange={(e) => { setSelectedSecretaria(e.target.value); setCurrentPage(1); setIsOrganDropdownOpen(true); }}
              onFocus={() => setIsOrganDropdownOpen(true)}
              onBlur={() => setTimeout(() => setIsOrganDropdownOpen(false), 200)}
              placeholder="Pesquisar por contrato ou secretaria..."
              className="w-full bg-white dark:bg-zinc-900 border border-zinc-250 dark:border-zinc-800 rounded-xl pl-10 pr-10 py-2.5 text-xs font-semibold text-zinc-800 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-brand shadow-2xs"
            />
            {selectedSecretaria && (
              <button
                onClick={() => { setSelectedSecretaria(''); setCurrentPage(1); }}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 p-0.5 text-zinc-400 hover:text-zinc-650 rounded-full cursor-pointer"
                type="button"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}

            {isOrganDropdownOpen && organAutocompleteOptions.length > 0 && (
              <div className="absolute left-0 right-0 mt-1 max-h-52 overflow-y-auto bg-white dark:bg-zinc-900 border border-zinc-250 dark:border-zinc-800 rounded-xl shadow-lg z-50 divide-y divide-zinc-50 dark:divide-zinc-800 w-full">
                {organAutocompleteOptions.map((opt, idx) => (
                  <div
                    key={idx}
                    onMouseDown={() => {
                      setSelectedSecretaria(opt.value);
                      setCurrentPage(1);
                      setIsOrganDropdownOpen(false);
                    }}
                    className="px-3 py-2 text-[11px] hover:bg-sky-50 dark:hover:bg-zinc-805 cursor-pointer flex items-center justify-between transition-colors pointer-events-auto"
                  >
                    <span className="font-bold text-zinc-800 dark:text-zinc-200 truncate pr-2">
                      {opt.value}
                    </span>
                    <span className={`text-[8px] px-1.5 py-0.5 rounded-md font-bold uppercase ${
                      opt.type === 'Contrato' 
                        ? 'bg-sky-50 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400' 
                        : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400'
                    }`}>
                      {opt.type}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Action buttons list */}
          <div className="flex items-center gap-2.5 self-end lg:self-auto">
            {canModify && (
              <button
                onClick={() => {
                  const idx = availableMonths.indexOf(referenceMonth);
                  if (idx > 0) {
                    setReplicateSourceMonth(availableMonths[idx - 1]);
                  } else {
                    setReplicateSourceMonth('Maio/2026');
                  }
                  setReplicateTargetMonth(referenceMonth);
                  setShowReplicateModal(true);
                }}
                className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl text-xs font-extrabold shadow-md transition-all cursor-pointer whitespace-nowrap font-sans"
              >
                <Layers className="h-4 w-4 text-white" />
                <span>Replicar Mês</span>
              </button>
            )}
            {/* Cadastrar/Novo Contrato button */}
            {canModify && (
              <button
                onClick={handleOpenCreateModal}
                className="flex items-center gap-1.5 bg-brand hover:bg-brand-medium text-white px-4 py-2.5 rounded-xl text-xs font-extrabold shadow-md transition-all cursor-pointer whitespace-nowrap font-sans"
              >
                <Plus className="h-4 w-4 text-white" />
                <span>Novo Contrato</span>
              </button>
            )}
          </div>

        </div>
      </div>


      {/* Main Table Structure (Responsive Screen Split) */}
      <div id="section-to-print" className="bg-white dark:bg-zinc-900 rounded-2xl shadow-md border border-zinc-200 dark:border-zinc-800 overflow-hidden">
        
        {/* ================= DESKTOP VIEW: HORIZONTAL SCROLLING TABLE ================= */}
        <div className="hidden lg:block overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm whitespace-nowrap">
            <thead className="bg-[#edfdfd] dark:bg-zinc-800/55 border-b-2 border-brand-light/45 dark:border-zinc-800">
              <tr>
                <th onClick={() => handleSort('contrato')} className="py-2 px-2 font-extrabold text-[11px] text-zinc-755 dark:text-zinc-300 uppercase tracking-wider cursor-pointer hover:bg-zinc-200/50 dark:hover:bg-zinc-800 transition-colors">
                  <div className="flex items-center gap-1">
                    Contrato <ArrowUpDown className="h-3 w-3" />
                  </div>
                </th>
                <th onClick={() => handleSort('secretaria')} className="py-2 px-2 font-extrabold text-[11px] text-zinc-755 dark:text-zinc-300 uppercase tracking-wider cursor-pointer hover:bg-zinc-200/50 dark:hover:bg-zinc-805 transition-colors min-w-[140px]">
                  <div className="flex items-center gap-1 text-center">
                    Secretaria <ArrowUpDown className="h-3 w-3" />
                  </div>
                </th>
                <th onClick={() => handleSort('status')} className="py-2 px-2 font-extrabold text-[11px] text-zinc-755 dark:text-zinc-300 uppercase tracking-wider cursor-pointer hover:bg-zinc-200/50 dark:hover:bg-zinc-800 transition-colors">
                  <div className="flex items-center gap-1">
                    Status <ArrowUpDown className="h-3 w-3" />
                  </div>
                </th>
                
                {/* Dynamic PVF Cost-type columns */}
                {Object.keys(PVF_LABELS).map((k) => (
                  <th key={k} onClick={() => handleSort(k)} className="py-1.5 px-1 font-extrabold text-[11px] text-zinc-755 dark:text-zinc-300 uppercase tracking-wider cursor-pointer hover:bg-zinc-200/50 dark:hover:bg-zinc-800 text-center transition-colors">
                    <div className="flex items-center justify-center gap-0.5">
                      {PVF_LABELS[k as PvfKey]} <ArrowUpDown className="h-3 w-3" />
                    </div>
                  </th>
                ))}

                <th onClick={() => handleSort('qtdPvf')} className="py-2 px-1.5 font-extrabold text-[11px] text-zinc-755 dark:text-zinc-300 uppercase tracking-wider cursor-pointer hover:bg-zinc-200/50 dark:hover:bg-zinc-800 text-center transition-colors">
                  <div className="flex items-center justify-center gap-0.5">
                    Qtd PVF <ArrowUpDown className="h-3 w-3" />
                  </div>
                </th>
                <th onClick={() => handleSort('valorTotal')} className="py-2 px-2 font-extrabold text-[11px] text-emerald-800 dark:text-emerald-450 uppercase tracking-wider cursor-pointer hover:bg-zinc-200/50 dark:hover:bg-zinc-800 text-right transition-colors">
                  <div className="flex items-center justify-end gap-1">
                    Valor Total <ArrowUpDown className="h-3 w-3" />
                  </div>
                </th>
                <th className="py-2 px-2 font-extrabold text-[11px] text-zinc-755 dark:text-zinc-300 uppercase tracking-wider text-center">Ações</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              
              {/* ================= FIRST ROW: GENERAL UNIT PRICES (MANDATORY REQUIREMENT) ================= */}
              <tr className="bg-sky-50 dark:bg-sky-950/20 font-bold border-b-2 border-sky-200 dark:border-sky-900/60">
                <td className="py-1.5 px-2 text-sky-900 dark:text-sky-400 text-[11px] font-mono font-bold tracking-wider">
                  TARIFAS
                </td>
                <td className="py-1.5 px-2 text-zinc-700 dark:text-zinc-400 text-xs italic">
                  Preço Base do PVF (BRL)
                </td>
                <td className="py-1.5 px-2 text-center">
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-sky-600 dark:bg-sky-500 text-white font-mono shadow-sm">
                    Vigente
                  </span>
                </td>

                {/* Render Unit Prices in cells */}
                {Object.keys(PVF_LABELS).map((k) => {
                  const key = k as PvfKey;
                  return (
                    <td key={k} className="py-1 px-1 text-center border-l border-r border-sky-100/30 dark:border-sky-900/20">
                      {isEditingPrices ? (
                        <div className="flex items-center justify-center max-w-[70px] mx-auto bg-white dark:bg-zinc-950 rounded border border-sky-500 focus-within:ring-1 focus-within:ring-sky-500">
                          <span className="text-[10px] font-mono text-zinc-400 pl-1">R$</span>
                          <input
                            type="number"
                            step="0.01"
                            value={tempPrices[key]}
                            onChange={(e) => handlePriceChange(key, e.target.value)}
                            className="w-full bg-transparent text-center text-xs p-0.5 font-mono focus:outline-none dark:text-zinc-100"
                          />
                        </div>
                      ) : (
                        <div className="font-mono text-xs text-sky-900 dark:text-sky-305 whitespace-nowrap">
                          {formatCurrency(prices[key])}
                        </div>
                      )}
                    </td>
                  );
                })}

                <td className="py-1.5 px-2 font-mono text-center text-[10px] text-zinc-400 italic">
                  Multiplicador
                </td>
                <td className="py-1.5 px-2 font-mono text-right text-[10px] text-sky-850 dark:text-sky-300">
                  Total de Itens
                </td>
                
                {canModify && (
                  <td className="py-1.5 px-2 text-center">
                    {isEditingPrices ? (
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={handleSavePrices}
                          title="Confirmar Tarifas"
                          className="p-0.5 px-2 bg-sky-600 hover:bg-sky-700 text-white text-[10px] font-medium rounded shadow-sm flex items-center gap-0.5"
                        >
                          <Check className="h-2.5 w-2.5" />
                          <span>Salvar</span>
                        </button>
                        <button
                          onClick={handleCancelPrices}
                          title="Cancelar"
                          className="p-0.5 px-1.5 bg-zinc-400 hover:bg-zinc-500 text-white text-[10px] font-medium rounded"
                        >
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setTempPrices({ ...prices });
                          setIsEditingPrices(true);
                        }}
                        className="flex items-center gap-1 mx-auto text-[10px] px-2 py-0.5 bg-white hover:bg-sky-100 dark:bg-zinc-800 border border-sky-300 dark:border-sky-850 text-sky-700 dark:text-sky-400 font-bold rounded shadow-sm transition-all"
                      >
                        <Settings className="h-2.5 w-2.5" />
                        <span>Alterar Tarifas</span>
                      </button>
                    )}
                  </td>
                )}
              </tr>

              {/* ================= STANDARD CONTRACT ROWS ================= */}
              {paginatedContracts.length === 0 ? (
                <tr>
                  <td colSpan={16} className="text-center p-12 text-zinc-400 dark:text-zinc-650 italic">
                    <p className="flex justify-center mb-2"><AlertCircle className="h-8 w-8 text-zinc-300" /></p>
                    {['Julho/2026', 'Agosto/2026', 'Setembro/2026', 'Outubro/2026', 'Novembro/2026', 'Dezembro/2026'].includes(referenceMonth) ? (
                      <div>
                        <p className="font-bold text-zinc-600 dark:text-zinc-300 not-italic text-sm">Nenhum dado cadastrado para este mês futuro.</p>
                        <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-1">Utilize o botão <strong className="text-emerald-600 dark:text-emerald-400 font-extrabold font-sans">"Replicar Mês"</strong> no topo para importar a tabela faturamento de outro mês de referência.</p>
                      </div>
                    ) : (
                      "Nenhum contrato encontrado com os filtros atuais."
                    )}
                  </td>
                </tr>
              ) : (
                paginatedContracts.map((contract) => {
                  const qtyTotal = getContractPvfTotal(contract);
                  const valTotal = getContractValue(contract, prices);
                  
                  const prevContract = findMatchingPvfPrevContract(contract);
                  const changedKeys: string[] = [];
                  let isStatusChanged = false;
                  let isQtyTotalChanged = false;
                  let isValTotalChanged = false;

                  if (prevContract) {
                    Object.keys(PVF_LABELS).forEach(k => {
                      if ((contract.quantities[k as PvfKey] || 0) !== (prevContract.quantities[k as PvfKey] || 0)) {
                        changedKeys.push(k);
                      }
                    });
                    if (contract.status !== prevContract.status) {
                      isStatusChanged = true;
                    }
                    if (getContractPvfTotal(contract) !== getContractPvfTotal(prevContract)) {
                      isQtyTotalChanged = true;
                    }
                    if (Math.abs(getContractValue(contract, prices) - getContractValue(prevContract, prices)) > 0.01) {
                      isValTotalChanged = true;
                    }
                  }

                  const isRowEdited = changedKeys.length > 0 || isStatusChanged || isQtyTotalChanged || isValTotalChanged;
                  const prevMonthAbbr = previousMonthStr ? previousMonthStr.split('/')[0] : 'ant.';
                  
                  return (
                    <tr 
                      key={contract.id} 
                      className={`transition-colors border-l-4 ${
                        isRowEdited 
                          ? 'bg-amber-50/70 hover:bg-amber-100/90 dark:bg-amber-950/20 dark:hover:bg-amber-900/40 border-l-amber-550' 
                          : 'odd:bg-[#f6fcfb] hover:bg-[#e4f5f5] dark:odd:bg-transparent dark:hover:bg-zinc-800/40 border-l-transparent'
                      }`}
                    >
                      <td className="py-1.5 px-2 font-bold text-zinc-900 dark:text-zinc-100 font-mono text-xs">
                        <div className="flex flex-col">
                          <span>{contract.contrato}</span>
                          {isRowEdited && (
                            <span className="text-[8px] bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 font-bold px-1 rounded max-w-fit mt-0.5">
                              Alt.
                            </span>
                          )}
                        </div>
                      </td>
                      <td 
                        className="py-1.5 px-2 text-zinc-950 dark:text-zinc-50 font-bold text-xs max-w-[170px] truncate cursor-help hover:text-brand dark:hover:text-brand-light transition-colors"
                        title={contract.secretaria}
                      >
                        {contract.secretaria}
                      </td>
                      <td className="py-1.5 px-2">
                        <div className="flex flex-col items-center">
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold ${
                            contract.status === 'Ativo' 
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-450'
                              : contract.status === 'Suspenso'
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400'
                              : 'bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-400'
                          }`}>
                            {contract.status}
                          </span>
                          {isStatusChanged && prevContract && (
                            <span className="text-[8px] text-amber-600 dark:text-amber-400 font-bold mt-0.5" title="Valor do mês anterior">
                              ({prevMonthAbbr}: {prevContract.status})
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Display contract quantities of lines */}
                      {Object.keys(PVF_LABELS).map((k) => {
                        const qty = contract.quantities[k as PvfKey] || 0;
                        const isFieldChanged = changedKeys.includes(k);
                        const prevQty = prevContract ? (prevContract.quantities[k as PvfKey] || 0) : 0;
                        return (
                          <td 
                            key={k} 
                            className={`py-1.5 px-1 font-mono text-center text-xs transition-all ${
                              isFieldChanged 
                                ? 'bg-amber-100/40 dark:bg-amber-905/10 font-bold text-amber-950 dark:text-amber-200 border border-amber-300/40 rounded' 
                                : 'text-zinc-700 dark:text-zinc-400'
                            }`}
                          >
                            <div className="flex flex-col items-center justify-center">
                              <span>{qty === 0 ? <span className="text-zinc-300 dark:text-zinc-700">-</span> : qty}</span>
                              {isFieldChanged && (
                                <span className="text-[8px] text-amber-600 dark:text-amber-400 font-black mt-0.5" title={`Mês anterior (${prevMonthAbbr}): ${prevQty}`}>
                                  ({prevQty})
                                </span>
                              )}
                            </div>
                          </td>
                        );
                      })}

                      <td className={`py-1.5 px-1 font-mono font-semibold text-center text-xs bg-zinc-50/30 dark:bg-zinc-850/20 ${isQtyTotalChanged ? 'text-amber-600 dark:text-amber-450 font-black' : 'text-zinc-900 dark:text-zinc-100'}`}>
                        <div className="flex flex-col items-center">
                          <span>{qtyTotal}</span>
                          {isQtyTotalChanged && prevContract && (
                            <span className="text-[8px] text-zinc-550 dark:text-zinc-400 font-bold mt-0.5" title="Mês anterior">
                              ({getContractPvfTotal(prevContract)})
                            </span>
                          )}
                        </div>
                      </td>
                      <td className={`py-1.5 px-2 font-mono font-black text-right text-xs pr-3 ${isValTotalChanged ? 'text-amber-600 dark:text-amber-450 bg-amber-500/5' : 'text-emerald-600 dark:text-emerald-400'}`}>
                        <div className="flex flex-col items-end">
                          <span>{formatCurrency(valTotal)}</span>
                          {isValTotalChanged && prevContract && (
                            <span className="text-[8px] text-zinc-550 dark:text-zinc-400 font-bold mt-0.5" title="Mês anterior">
                              ({formatCurrency(getContractValue(prevContract, prices))})
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-1 px-1.5 text-center">
                        <div className="inline-flex items-center gap-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-0.5 rounded-lg">
                          <button
                            onClick={() => handleOpenSummaryModal(contract)}
                            title="Visualizar Resumo p/ Cliente (Print)"
                            className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded text-emerald-600 dark:text-emerald-400 transition-colors"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                          {canModify && (
                            <>
                              <button
                                onClick={() => handleOpenEditModal(contract)}
                                title="Editar Contrato"
                                className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded text-sky-600 dark:text-sky-400 transition-colors"
                              >
                                <Edit2 className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteContract(contract)}
                                title="Excluir"
                                className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded text-red-500 hover:text-red-600 transition-colors"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}

              {/* ================= TOTALS OVERVIEW ROWS ================= */}
              {filteredContracts.length > 0 && (
                <>
                  {/* Row 1: Quantities Counter for Numeric Columns */}
                  <tr className="bg-zinc-100/60 dark:bg-zinc-800/40 font-black border-t-2 border-zinc-200 dark:border-zinc-750">
                    <td colSpan={3} className="py-1.5 px-2 text-[11px] font-black text-zinc-900 dark:text-zinc-100 uppercase tracking-wider text-left pl-2">
                      Soma das Quantidades
                    </td>
                    {Object.keys(PVF_LABELS).map((k) => {
                      const key = k as PvfKey;
                      const val = columnTotals.pvfTotals[key];
                      return (
                        <td key={k} className="py-1 px-1 font-mono font-black text-center text-[10px] text-zinc-900 dark:text-zinc-100 bg-zinc-100/30 dark:bg-zinc-850/10">
                          {val === 0 ? <span className="text-zinc-300 dark:text-zinc-700">-</span> : val}
                        </td>
                      );
                    })}
                    <td className="py-1 px-1 font-mono font-extrabold text-center text-[11px] bg-zinc-250 dark:bg-zinc-700/65 text-zinc-950 dark:text-zinc-50">
                      {columnTotals.totalPvfQty}
                    </td>
                    <td className="py-1.5 px-2 font-mono font-black text-right text-xs pr-3 text-zinc-300 dark:text-zinc-700">
                      -
                    </td>
                    <td className="py-1.5 px-2"></td>
                  </tr>

                  {/* Row 2: Financial/BRL calculated Counter (Quantities multiplied by Unit Price) */}
                  <tr className="bg-blue-50 dark:bg-blue-950/10 font-bold border-t border-blue-200 dark:border-blue-900/30">
                    <td colSpan={3} className="py-1.5 px-2 text-[11px] font-black text-blue-900 dark:text-blue-400 uppercase tracking-wider text-left pl-2">
                      Subtotais (Qtd × Tarifa)
                    </td>
                    {Object.keys(PVF_LABELS).map((k) => {
                      const key = k as PvfKey;
                      const colQty = columnTotals.pvfTotals[key];
                      const unitPrice = prices[key] || 0;
                      const colTotalVal = colQty * unitPrice;
                      return (
                        <td key={k} className="py-1 px-1 font-mono font-black text-center text-xs text-blue-700 dark:text-blue-405 bg-blue-50/25 dark:bg-blue-950/10 whitespace-nowrap">
                          {colTotalVal === 0 ? (
                            <span className="text-blue-200/50 dark:text-blue-950/50">-</span>
                          ) : (
                            formatCurrency(colTotalVal)
                          )}
                        </td>
                      );
                    })}
                    <td className="py-1 px-1 font-mono font-bold text-center text-[11px] text-zinc-300 bg-blue-50/20 dark:bg-blue-950/5">
                      -
                    </td>
                    <td className="py-1.5 px-2 font-mono font-black text-right text-xs text-emerald-600 dark:text-emerald-400 pr-3 bg-emerald-100/25 dark:bg-emerald-950/20">
                      {formatCurrency(columnTotals.grandTotalVal)}
                    </td>
                    <td className="py-1.5 px-2"></td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>


        {/* ============================================================================== */}
        {/* ================== MOBILE VIEW: TRANSFORMS LINES INTO CARDS ================== */}
        {/* ============================================================================== */}
        <div className="lg:hidden p-4 space-y-4">
          
          {/* Mobile Tariff reference display */}
          <div className="bg-sky-50 dark:bg-sky-950/20 rounded-xl p-4 border border-sky-100 dark:border-sky-900/30">
            <div className="flex items-center justify-between mb-3 border-b border-sky-150 dark:border-sky-900/40 pb-2">
              <span className="text-xs font-bold text-sky-850 dark:text-sky-400">TARIFAR GLOBAL VIGENTE (R$)</span>
              {canModify && (
                <button
                  onClick={() => setIsEditingPrices(!isEditingPrices)}
                  className="text-[11px] bg-white dark:bg-zinc-850 px-2 py-1 rounded border border-sky-300 dark:border-sky-800 text-sky-700 dark:text-sky-400 font-semibold"
                >
                  {isEditingPrices ? 'Fechar' : 'Editar'}
                </button>
              )}
            </div>
            
            {isEditingPrices ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  {Object.keys(PVF_LABELS).map((k) => {
                    const key = k as PvfKey;
                    return (
                      <div key={k} className="flex flex-col">
                        <span className="text-[10px] text-zinc-500">{PVF_LABELS[key]}</span>
                        <input
                          type="number"
                          step="0.01"
                          value={tempPrices[key]}
                          onChange={(e) => handlePriceChange(key, e.target.value)}
                          className="bg-white dark:bg-zinc-950 px-2 py-1 border border-zinc-200 dark:border-zinc-800 rounded text-xs font-mono font-bold dark:text-zinc-100"
                        />
                      </div>
                    );
                  })}
                </div>
                <button
                  onClick={handleSavePrices}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs py-2 rounded-lg"
                >
                  Salvar Novas Tarifas
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 font-mono text-xs text-center text-zinc-700 dark:text-sky-305">
                {Object.keys(PVF_LABELS).map((k) => {
                  const key = k as PvfKey;
                  return (
                    <div key={k} className="bg-white/50 dark:bg-zinc-950/30 p-1.5 rounded border border-sky-100/30 dark:border-sky-950/10">
                      <div className="text-[9px] text-zinc-400 dark:text-zinc-500 uppercase">{PVF_LABELS[key]}</div>
                      <div className="font-bold">{formatCurrency(prices[key]).replace('R$', '').trim()}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Standard Contracts as Mobile Cards */}
          {paginatedContracts.length === 0 ? (
            <div className="text-center py-12 text-zinc-400 italic">
              Nenhum registro encontrado.
            </div>
          ) : (
            paginatedContracts.map((contract) => {
              const qtyTotal = getContractPvfTotal(contract);
              const valTotal = getContractValue(contract, prices);
              
              return (
                <div 
                  key={contract.id}
                  className="bg-zinc-55 hover:bg-zinc-50 dark:bg-zinc-950 dark:hover:bg-zinc-900 border border-zinc-100 dark:border-zinc-800/80 rounded-xl p-4 shadow-sm space-y-3 transition-colors"
                >
                  {/* Card Header */}
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-mono font-black text-sm text-zinc-900 dark:text-zinc-100">
                        {contract.contrato}
                      </div>
                      <div 
                        className="text-xs text-zinc-950 dark:text-zinc-50 font-bold cursor-help hover:text-brand dark:hover:text-brand-light transition-colors"
                        title={contract.secretaria}
                      >
                        {contract.secretaria}
                      </div>
                    </div>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${
                      contract.status === 'Ativo' 
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400'
                        : contract.status === 'Suspenso'
                        ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400'
                        : 'bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-400'
                    }`}>
                      {contract.status}
                    </span>
                  </div>

                  {/* Quantities display as a dense mini-grid */}
                  <div className="border-t border-b border-zinc-100 dark:border-zinc-800/60 py-2.5">
                    <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-semibold uppercase tracking-wider block mb-1.5">
                      Detalhamento de Linhas (PVFs)
                    </span>
                    <div className="grid grid-cols-2 xs:grid-cols-3 gap-2">
                      {Object.keys(PVF_LABELS).map((k) => {
                        const key = k as PvfKey;
                        const qty = contract.quantities[key] || 0;
                        if (qty === 0) return null; // skip zeros on mobile cards to keep it clean
                        return (
                          <div key={k} className="bg-zinc-50 dark:bg-zinc-900/60 p-1.5 rounded border border-zinc-100 dark:border-zinc-800/40 flex justify-between items-center text-xs font-mono">
                            <span className="text-zinc-500 dark:text-zinc-400 truncate pr-1">{PVF_LABELS[key]}</span>
                            <span className="font-bold text-zinc-800 dark:text-zinc-200">{qty}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Totals & Actions */}
                  <div className="flex items-center justify-between pt-1">
                    <div className="flex items-baseline gap-2">
                      <div className="text-xs font-mono text-zinc-400">
                        {qtyTotal} PVFs
                      </div>
                      <div className="text-sm font-mono font-bold text-emerald-700 dark:text-emerald-400">
                        {formatCurrency(valTotal)}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleOpenSummaryModal(contract)}
                        className="flex items-center gap-1 text-[11px] px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 dark:bg-zinc-850 dark:hover:bg-zinc-800 text-emerald-800 dark:text-emerald-300 border border-emerald-100 dark:border-zinc-750 font-semibold rounded-lg"
                        title="Resumo para Cliente"
                      >
                        <Eye className="h-3 w-3" />
                        <span>Resumo</span>
                      </button>
                      {canModify && (
                        <>
                          <button
                            onClick={() => handleOpenEditModal(contract)}
                            className="flex items-center gap-1 text-[11px] px-2.5 py-1.5 bg-zinc-50 hover:bg-zinc-100 dark:bg-zinc-850 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-750 font-medium rounded-lg"
                          >
                            <Edit2 className="h-3 w-3" />
                            <span>Editar</span>
                          </button>
                           <button
                             onClick={() => handleDeleteContract(contract)}
                             className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-850 rounded-lg text-rose-500 hover:text-rose-600 border border-transparent hover:border-zinc-200 dark:hover:border-zinc-800"
                           >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}

        </div>

        {/* ================================================================ */}
        {/* ========================== PAGINATION ========================== */}
        {/* ================================================================ */}
        <div className="bg-zinc-50/90 dark:bg-zinc-800/30 border-t border-zinc-200 dark:border-zinc-800/80 p-4 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs">
          <div className="flex items-center gap-3 text-zinc-650 dark:text-zinc-400">
            <span>
              Mostrando <strong className="text-zinc-800 dark:text-zinc-200">{paginatedContracts.length}</strong> de{' '}
              <strong className="text-zinc-800 dark:text-zinc-200">{sortedAndFilteredContracts.length}</strong> registros
            </span>
            <span className="hidden sm:inline-block">|</span>
            <div className="flex items-center gap-1.5">
              <span>Linhas por página:</span>
              <select
                value={pageSize}
                onChange={(e) => handlePageSizeChange(e.target.value)}
                className="bg-white dark:bg-zinc-900 border border-zinc-250 dark:border-zinc-800 rounded px-1.5 py-0.5 text-zinc-700 dark:text-zinc-350 focus:outline-none"
              >
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-850 focus:outline-none hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-450 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            
            <div className="flex items-center gap-1 font-medium font-mono text-zinc-650 px-2">
              Pág. <span className="text-zinc-900 dark:text-zinc-150">{currentPage}</span> / {totalPages}
            </div>

            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-850 focus:outline-none hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-450 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* ====================== REGISTER & EDIT CONTRACT MODAL ===================== */}
      {/* ========================================================================= */}
      {showFormModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white dark:bg-zinc-900 rounded-3xl shadow-xl border border-zinc-100 dark:border-zinc-855 w-full max-w-2xl transform scale-100 transition-transform">
            <div className="p-5 border-b border-zinc-100 dark:border-zinc-800 flex justify-between items-center bg-zinc-50/50 dark:bg-zinc-850/20 rounded-t-3xl">
              <div>
                <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                  {editingContract ? 'Editar Contrato existente' : 'Novo Registro de Contrato'}
                </h3>
                <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">
                  Preencha as informações para calcular o faturamento.
                </p>
              </div>
              <button 
                onClick={() => setShowFormModal(false)}
                className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-600 rounded-full transition-colors"
               >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveContractForm} className="p-5 space-y-4">
              {formError && (
                <div className="p-3 bg-red-50 dark:bg-red-950/20 text-xs text-red-600 dark:text-red-400 rounded-lg flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-1">
                  <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-1">
                    Código do Contrato *
                  </label>
                  <input
                    type="text"
                    placeholder="ex: 36000"
                    value={formContractKey}
                    onChange={(e) => setFormContractKey(e.target.value)}
                    required
                    className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800/80 px-3 py-2 rounded-xl text-xs text-zinc-800 dark:text-zinc-150 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                <div className="sm:col-span-1">
                  <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-1">
                    Órgão / Secretaria *
                  </label>
                  <input
                    type="text"
                    placeholder="ex: SEDUC - Sec de Educação"
                    value={formSecretaria}
                    onChange={(e) => setFormSecretaria(e.target.value)}
                    required
                    className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800/80 px-3 py-2 rounded-xl text-xs text-zinc-800 dark:text-zinc-150 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                <div className="sm:col-span-1">
                  <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-1">
                    Status do Vínculo
                  </label>
                  <select
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value as any)}
                    className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800/80 px-3 py-2 rounded-xl text-xs text-zinc-805 dark:text-zinc-150 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    <option value="Ativo">🟢 Ativo</option>
                    <option value="Suspenso">🟡 Suspenso</option>
                    <option value="Encerrado">🔴 Encerrado</option>
                  </select>
                </div>
              </div>

              {/* Quantities Form Subgrid */}
              <div className="border-t border-zinc-100 dark:border-zinc-800/60 pt-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                  <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest block">
                    Quantidades de Pontos por Modelo (PVF)
                  </span>
                  <span className="self-start sm:self-auto bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-350 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg border border-indigo-150 dark:border-indigo-900/60 inline-flex items-center gap-1.5 font-mono shadow-xs animate-in fade-in duration-300">
                    <span className="h-2 w-2 rounded-full bg-indigo-500 animate-pulse"></span>
                    Total de PVFs: <strong className="text-zinc-900 dark:text-indigo-200 font-black">{Object.entries(formQuantities).reduce((acc: number, [_, qty]) => acc + (qty as number), 0)}</strong>
                  </span>
                </div>
                
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  {Object.keys(PVF_LABELS).map((k) => {
                    const key = k as PvfKey;
                    return (
                      <div key={k} className="bg-zinc-50 dark:bg-zinc-950 p-2 rounded-xl border border-zinc-200/40 dark:border-zinc-800/50">
                        <label className="block text-[10px] text-zinc-400 dark:text-zinc-500 font-bold truncate mb-1">
                          {PVF_LABELS[key]}
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={formQuantities[key]}
                          onChange={(e) => {
                            const val = parseInt(e.target.value);
                            setFormQuantities(prev => ({
                              ...prev,
                              [key]: isNaN(val) ? 0 : val
                            }));
                          }}
                          className="w-full bg-transparent border-none text-xs font-mono font-semibold focus:outline-none text-zinc-800 dark:text-zinc-150 placeholder-zinc-300"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-1">
                  Observações de Contrato (Opcional)
                </label>
                <textarea
                  rows={2}
                  placeholder="Informações adicionais, prazos ou pendências administrativas..."
                  value={formObservacoes}
                  onChange={(e) => setFormObservacoes(e.target.value)}
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800/80 px-3 py-2 rounded-xl text-xs text-zinc-800 dark:text-zinc-150 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div className="p-4 bg-emerald-50/50 dark:bg-emerald-950/20 rounded-xl flex items-center justify-between text-xs font-mono">
                <span className="text-emerald-800 dark:text-emerald-400 font-medium">Faturamento Estimado:</span>
                <span className="font-bold text-emerald-900 dark:text-emerald-300 text-sm">
                  {formatCurrency(
                    Object.entries(formQuantities).reduce((acc: number, [key, qty]) => acc + (qty as number) * (prices[key as PvfKey] || 0), 0)
                  )}
                </span>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-zinc-100 dark:border-zinc-800">
                <button
                  type="button"
                  disabled={isSubmittingContract}
                  onClick={() => setShowFormModal(false)}
                  className="px-4 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400 rounded-xl text-xs transition-colors disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingContract}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-500/10 transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
                >
                  {isSubmittingContract ? (
                    <>
                      <span className="h-3 w-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                      Salvando...
                    </>
                  ) : (
                    'Salvar Alterações'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ================= CLIENT PRINT & SCREENSHOT PREVIEW SUMMARY =============== */}
      {/* ========================================================================= */}
      {showSummaryModal && summaryContract && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 z-50 print-modal-overlay font-sans">
          <div className="bg-white dark:bg-zinc-90 w-full max-w-lg rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-800 flex flex-col overflow-hidden transform scale-100 transition-transform">
            
            {/* Header / Actions - Hidden on normal browser printing */}
            <div className="p-2 bg-zinc-50 dark:bg-zinc-90 w-full border-b border-zinc-100 dark:border-zinc-800 flex justify-between items-center print:hidden shrink-0">
              <div className="flex items-center gap-1.5 text-brand-deep dark:text-zinc-200 font-bold text-[11px] font-display">
                <Camera className="h-3.5 w-3.5 text-brand" />
                <span>Método Telecom • PECONECTADO II</span>
              </div>
              <button 
                onClick={() => { setShowSummaryModal(false); setSummaryContract(null); }}
                className="p-1 px-2.5 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-650 dark:text-zinc-350 rounded-lg text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1"
              >
                <X className="h-3 w-3" />
                <span>Fechar</span>
              </button>
            </div>
 
            {/* Print Area Start */}
            <div className="p-4 bg-white text-zinc-900 flex-1 min-h-0 overflow-y-auto" id="print-area">
              <div className="space-y-3">
                
                {/* Header Row: Title & Total Badge */}
                <div className="flex flex-row justify-between items-center border-b border-zinc-150 pb-2 gap-2">
                  <div>
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="inline-block bg-zinc-100 text-zinc-650 border border-zinc-200/60 text-[8px] font-bold uppercase tracking-widest px-1.5 py-0.2 rounded font-sans">
                        MÉTODO TELECOM
                      </span>
                      <span className="inline-block bg-brand/10 text-brand border border-brand/20 text-[8px] font-extrabold uppercase tracking-widest px-1.5 py-0.2 rounded">
                        PECONECTADO II
                      </span>
                    </div>
                    <h4 className="text-sm font-extrabold text-zinc-950 tracking-tight uppercase font-display">
                      Memória de Faturamento
                    </h4>
                    <div className="text-[8px] text-zinc-400 font-mono mt-0.5 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-brand"></span>
                      <span>Gerado em: {new Date().toLocaleDateString('pt-BR')}</span>
                    </div>
                  </div>
 
                  {/* Highlighted Value Card */}
                  <div className="bg-brand-deep text-white rounded-xl py-1.5 px-3 shadow-sm border border-brand-border relative overflow-hidden text-right min-w-[150px] shrink-0">
                    <div className="relative">
                      <span className="block text-[7px] text-brand-light font-black uppercase tracking-wider">
                        FATURAMENTO MENSAL
                      </span>
                      <span className="block text-base font-black font-mono text-zinc-100 mt-0.5">
                        {formatCurrency(getContractValue(summaryContract, prices))}
                      </span>
                    </div>
                  </div>
                </div>
 
                {/* Grid Metadata Infobar */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-zinc-50 p-3 rounded-xl border border-zinc-100">
                  <div>
                    <span className="block text-[8px] text-zinc-400 font-bold uppercase tracking-wider">Contrato</span>
                    <span className="text-xs font-black text-zinc-950 font-mono block mt-0.5">{summaryContract.contrato}</span>
                  </div>
                  <div className="sm:col-span-2">
                    <span className="block text-[8px] text-zinc-400 font-bold uppercase tracking-wider">Secretaria</span>
                    <span className="text-xs font-bold text-zinc-900 block mt-0.5 break-words" title={summaryContract.secretaria}>
                      {summaryContract.secretaria}
                    </span>
                  </div>
                </div>
 
                {/* Detailed Table Section */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center px-0.5">
                    <span className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider">
                      Detalhamento de Ponto de Voz Fixo
                    </span>
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-black bg-brand/10 text-brand uppercase tracking-widest border border-brand/20">
                      {summaryContract.status}
                    </span>
                  </div>
 
                  <div className="border border-zinc-200/80 rounded-xl overflow-hidden shadow-2xs">
                    <table className="w-full text-[11px] text-left">
                      <thead className="bg-brand-deep text-white font-bold">
                        <tr>
                          <th className="py-2 px-3 text-left">Tipo de Linha (PVF)</th>
                          <th className="py-2 px-3 text-center w-12">Qtd</th>
                          <th className="py-2 px-3 text-right w-24">Tarifa Unit.</th>
                          <th className="py-2 px-3 text-right w-24 font-black">Valor Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-150">
                        {Object.keys(PVF_LABELS).map((k) => {
                          const key = k as PvfKey;
                          const qty = summaryContract.quantities[key] || 0;
                          const unitPrice = prices[key] || 0;
                          const subtotal = qty * unitPrice;

                          // Only show non-zero quantities to keep card clean
                          if (qty === 0) return null;

                          return (
                            <tr key={k} className="hover:bg-zinc-50/50 transition-colors">
                              <td className="py-1.5 px-3 font-semibold text-zinc-900">
                                {PVF_LABELS[key]}
                              </td>
                              <td className="py-1.5 px-3 text-center font-mono font-bold text-zinc-900 bg-zinc-50/20">
                                {qty}
                              </td>
                              <td className="py-1.5 px-3 text-right font-mono text-zinc-500 whitespace-nowrap">
                                {formatCurrency(unitPrice)}
                              </td>
                              <td className="py-1.5 px-3 text-right font-mono font-black text-brand-orange whitespace-nowrap">
                                {formatCurrency(subtotal)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

              </div>

            </div>
            {/* Print Area End */}

            {/* Print helper buttons - Hidden on normal printing */}
            <div className="p-4 bg-zinc-50 dark:bg-zinc-850 border-t border-zinc-150 dark:border-zinc-805 flex items-center justify-between gap-3 print:hidden shrink-0">
              <div className="flex items-center gap-1.5 ml-auto">
                <button
                  onClick={() => summaryContract && exportSingleContractInvoiceToPdf(summaryContract)}
                  className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl text-xs font-bold shadow-md shadow-emerald-600/10 transition-all cursor-pointer whitespace-nowrap"
                >
                  <FileText className="h-3.5 w-3.5" />
                  <span>Salvar em PDF</span>
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ================= SAVE MONTH SNAPSHOT MODAL ============================= */}
      {/* ========================================================================= */}
      {showSaveSnapshotModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 z-50 font-sans">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-sm rounded-[24px] shadow-2xl border border-zinc-250 dark:border-zinc-800 flex flex-col text-left overflow-hidden transform scale-100 transition-all">
            
            {/* Modal Header */}
            <div className="p-5 pb-4 border-b border-zinc-150 dark:border-zinc-805/60 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-950/20">
              <h3 className="text-sm font-black text-zinc-900 dark:text-zinc-100 uppercase tracking-wide flex items-center gap-2">
                <Archive className="h-4.5 w-4.5 text-indigo-500" />
                <span>Salvar Faturamento Mensal</span>
              </h3>
              <button
                onClick={() => setShowSaveSnapshotModal(false)}
                className="p-1 px-2.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-all cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveSnapshot}>
              <div className="p-5 space-y-4">
                
                {saveSnapshotError && (
                  <div className="p-3 bg-rose-50/50 dark:bg-rose-950/15 border border-rose-150 dark:border-rose-900/30 rounded-xl text-xs text-rose-650 dark:text-rose-400 font-semibold leading-normal">
                    {saveSnapshotError}
                  </div>
                )}

                {/* Pre-calculated stats box */}
                <div className="bg-indigo-50/40 dark:bg-indigo-950/10 p-3.5 border border-indigo-100/50 dark:border-indigo-900/20 rounded-2xl grid grid-cols-2 gap-35">
                  <div className="space-y-0.5">
                    <span className="text-[8px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest block">Volume Pontos (PVFs)</span>
                    <strong className="text-xs font-black font-mono text-indigo-700 dark:text-indigo-400 block">
                      {activeContractsForMonth.reduce((acc: number, c) => acc + (Object.values(c.quantities).reduce((a: number, b: any) => a + (Number(b) || 0), 0) as number), 0)} PVFs
                    </strong>
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-[8px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest block">Faturamento Geral</span>
                    <strong className="text-xs font-black font-mono text-emerald-700 dark:text-emerald-400 block">
                      {formatCurrency(activeContractsForMonth.reduce((acc: number, c) => acc + Object.entries(c.quantities).reduce((sum: number, [key, qty]) => sum + (Number(qty) * (prices[key as PvfKey] || 0)), 0), 0))}
                    </strong>
                  </div>
                </div>

                <div className="space-y-3 pt-1">
                  {/* Reference Month picker container */}
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase text-zinc-400 dark:text-zinc-500 tracking-widest block">Mês de Referência</label>
                    <div className="flex gap-2">
                      <select
                        value={selectedRefMonth}
                        onChange={(e) => setSelectedRefMonth(e.target.value)}
                        className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200/80 dark:border-zinc-850 rounded-xl px-3 py-2 text-xs font-medium text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500/40"
                      >
                        {(() => {
                          const months = [
                            'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
                            'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
                          ];
                          const currentYear = new Date().getFullYear();
                          const years = [currentYear - 1, currentYear, currentYear + 1];
                          const options: string[] = [];
                          
                          years.forEach(y => {
                            months.forEach(m => {
                              options.push(`${m}/${y}`);
                            });
                          });
                          
                          return options.map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                          ));
                        })()}
                      </select>

                      <input 
                        type="text"
                        placeholder="Ou digite..."
                        value={selectedRefMonth}
                        onChange={(e) => setSelectedRefMonth(e.target.value)}
                        className="w-28 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200/80 dark:border-zinc-850 rounded-xl px-2.5 py-2 text-xs text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500/40 font-semibold"
                      />
                    </div>
                  </div>

                  {/* Account / User Name Field */}
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase text-zinc-400 dark:text-zinc-500 tracking-widest block">Nome do Usuário Responsável</label>
                    <input 
                      type="text" 
                      required
                      placeholder="Identifique-se..."
                      value={saverName}
                      onChange={(e) => setSaverName(e.target.value)}
                      className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200/80 dark:border-zinc-850 rounded-xl p-2.5 text-xs font-semibold text-zinc-800 dark:text-zinc-200 placeholder-zinc-450 focus:outline-none focus:ring-1 focus:ring-indigo-500/40"
                    />
                  </div>
                </div>

              </div>

              {/* Action buttons footer */}
              <div className="p-4 bg-zinc-50 dark:bg-zinc-850 border-t border-zinc-150 dark:border-zinc-805 flex justify-end gap-2.5 font-semibold text-xs shrink-0 bg-zinc-50/50">
                <button
                  type="button"
                  disabled={savingSnapshot}
                  onClick={() => setShowSaveSnapshotModal(false)}
                  className="px-3.5 py-2.5 bg-white border border-zinc-205 dark:bg-zinc-800 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-650 dark:text-zinc-350 rounded-xl transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingSnapshot}
                  className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-xl shadow-md border border-indigo-700 transition-all font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  {savingSnapshot ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Salvando...</span>
                    </>
                  ) : (
                    <>
                      <Archive className="h-4 w-4" />
                      <span>Salvar</span>
                    </>
                  )}
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ================= CUSTOM CONFIRM DELETE MODAL =========================== */}
      {/* ========================================================================= */}
      {/* ====================== REPLICATE MONTH MODAL ============================= */}
      {/* ========================================================================= */}
      {showReplicateModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto font-sans">
          <div className="bg-white dark:bg-zinc-900 rounded-3xl shadow-xl border border-zinc-100 dark:border-zinc-855 w-full max-w-lg transform scale-100 transition-transform">
            <div className="p-5 border-b border-zinc-100 dark:border-zinc-800 flex justify-between items-center bg-zinc-50/50 dark:bg-zinc-850/20 rounded-t-3xl">
              <div>
                <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                  <Layers className="h-5 w-5 text-emerald-600" />
                  Replicar Dados Mensais
                </h3>
                <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">
                  Replique todos os contratos, quantidades de ramais e serviços de um mês para o outro.
                </p>
              </div>
              <button 
                onClick={() => setShowReplicateModal(false)}
                className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-600 rounded-full transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-900/30 p-3 rounded-xl flex items-start gap-2.5">
                <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <span className="text-[11px] text-amber-805 dark:text-amber-350 leading-relaxed font-semibold">
                  Atenção: A replicação irá copiar todos os contratos ativos, quantidades e observações do mês de origem para o mês de destino, sobrescrevendo quaisquer faturamentos ou personalizações já existentes no mês de destino.
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-1">
                    Mês de Origem (Copiar de)
                  </label>
                  <select
                    value={replicateSourceMonth}
                    onChange={(e) => setReplicateSourceMonth(e.target.value)}
                    className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-250 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs font-bold text-zinc-850 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-brand cursor-pointer"
                  >
                    {availableMonths.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-1">
                    Mês de Destino (Aplicar em)
                  </label>
                  <select
                    value={replicateTargetMonth}
                    onChange={(e) => setReplicateTargetMonth(e.target.value)}
                    className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-250 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs font-bold text-zinc-850 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-brand cursor-pointer"
                  >
                    {availableMonths.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800 flex justify-end gap-3 text-xs font-bold">
                <button
                  type="button"
                  disabled={isReplicating}
                  onClick={() => setShowReplicateModal(false)}
                  className="px-4 py-2.5 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-650 dark:text-zinc-350 rounded-xl transition-all cursor-pointer disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={isReplicating}
                  onClick={handleReplicateContracts}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-450 text-white rounded-xl shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  {isReplicating ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Replicando...</span>
                    </>
                  ) : (
                    <>
                      <Check className="h-4 w-4" />
                      <span>Iniciar Replicação</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {deleteConfirmContract && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 z-50 font-sans">
          <div className="bg-white dark:bg-zinc-900 w-full max-w-sm rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-800 p-6 flex flex-col text-left transform scale-100 transition-all">
            <h3 className="text-sm font-black text-zinc-900 dark:text-zinc-100 uppercase tracking-wider mb-2 flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-rose-500 shrink-0" />
              Confirmar Exclusão
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-6 leading-relaxed">
              Tem certeza de que deseja excluir o contrato <strong className="text-zinc-900 dark:text-zinc-200 font-bold font-mono">{deleteConfirmContract.contrato}</strong>? 
              <br />
              <span className="text-[11px] text-zinc-400 mt-1 block">Esta ação removerá todos os faturamentos associados a este contrato e não poderá ser desfeita.</span>
            </p>
            <div className="flex items-center justify-end gap-3 font-semibold text-xs">
              <button
                type="button"
                disabled={isDeletingContract}
                onClick={() => setDeleteConfirmContract(null)}
                className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-650 dark:text-zinc-350 rounded-xl transition-all cursor-pointer disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isDeletingContract}
                onClick={handleConfirmDelete}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl shadow-md shadow-rose-500/10 transition-all cursor-pointer font-bold disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                {isDeletingContract ? (
                  <>
                    <span className="h-3 w-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                    Excluindo...
                  </>
                ) : (
                  'Confirmar Exclusão'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
