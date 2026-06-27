/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { UserSession } from '../types';
import { 
  collection, 
  doc, 
  setDoc, 
  deleteDoc, 
  onSnapshot, 
  writeBatch,
  serverTimestamp,
  getDocs,
  getDoc
} from 'firebase/firestore';
import { 
  Search, 
  Filter, 
  RotateCcw, 
  Download, 
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
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  AlertCircle,
  Eye,
  Headset,
  Building,
  DollarSign,
  Layers
} from 'lucide-react';

// Interfaces
export interface ContactCenterOS {
  id: string;
  contrato: string;
  secretaria: string;
  referenceMonth: string;
  status: 'Ativo' | 'Suspenso' | 'Cancelado' | 'Pendente';
  nmsBasico: number;
  nmsCritico: number;
  gravacaoBasica: number;
  gravacaoCritica: number;
  uraBasica: number;
  uraCritica: number;
  observacoes?: string;
  dataAssinatura?: string;
}

export interface ContactCenterPrices {
  nmsBasico: number;
  nmsCritico: number;
  gravacaoBasica: number;
  gravacaoCritica: number;
  uraBasica: number;
  uraCritica: number;
}

// Default prices
const DEFAULT_CC_PRICES: ContactCenterPrices = {
  nmsBasico: 440.86,
  nmsCritico: 460.97,
  gravacaoBasica: 71.84,
  gravacaoCritica: 78.64,
  uraBasica: 282.06,
  uraCritica: 303.01
};

// Initial Mock Records
const PRESEEDED_CONTACT_CENTER: ContactCenterOS[] = [
  {
    id: 'cc-preseed-1',
    contrato: 'CT-2026/041',
    secretaria: 'Secretaria de Educação (SEE)',
    referenceMonth: 'Junho/2026',
    status: 'Ativo',
    nmsBasico: 10,
    nmsCritico: 5,
    gravacaoBasica: 15,
    gravacaoCritica: 5,
    uraBasica: 8,
    uraCritica: 4,
    observacoes: 'Contrato prioritário para rede de escolas integradas.',
    dataAssinatura: '2026-06-01'
  },
  {
    id: 'cc-preseed-2',
    contrato: 'CT-2026/089',
    secretaria: 'Secretaria de Saúde (SES)',
    referenceMonth: 'Junho/2026',
    status: 'Ativo',
    nmsBasico: 6,
    nmsCritico: 8,
    gravacaoBasica: 12,
    gravacaoCritica: 10,
    uraBasica: 5,
    uraCritica: 6,
    observacoes: 'Atendimento do SAMU e Central de Regulação de Leitos.',
    dataAssinatura: '2026-06-02'
  },
  {
    id: 'cc-preseed-3',
    contrato: 'CT-2026/012',
    secretaria: 'Secretaria da Fazenda (SEFAZ)',
    referenceMonth: 'Junho/2026',
    status: 'Ativo',
    nmsBasico: 4,
    nmsCritico: 2,
    gravacaoBasica: 6,
    gravacaoCritica: 2,
    uraBasica: 4,
    uraCritica: 2,
    observacoes: 'Atendimento integrado de arrecadação fiscal portal.',
    dataAssinatura: '2026-06-03'
  },
  {
    id: 'cc-preseed-4',
    contrato: 'CT-2026/115',
    secretaria: 'Secretaria de Defesa Social (SDS)',
    referenceMonth: 'Junho/2026',
    status: 'Suspenso',
    nmsBasico: 2,
    nmsCritico: 0,
    gravacaoBasica: 2,
    gravacaoCritica: 0,
    uraBasica: 2,
    uraCritica: 0,
    observacoes: 'Atendimento de suporte administrativo regional.',
    dataAssinatura: '2026-06-04'
  }
];

interface ContactCenterBillingProps {
  user?: UserSession | null;
}

export default function ContactCenterBilling({ user }: ContactCenterBillingProps = {}) {
  const canModify = user && (user.role === 'admin' || user.role === 'editor');

  // Page Core State
  const [records, setRecords] = useState<ContactCenterOS[]>([]);
  const [prices, setPrices] = useState<ContactCenterPrices>(DEFAULT_CC_PRICES);
  const [referenceMonth, setReferenceMonth] = useState('Junho/2026');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);

  // Month replication states
  const [showReplicateModal, setShowReplicateModal] = useState(false);
  const [replicateSourceMonth, setReplicateSourceMonth] = useState('Maio/2026');
  const [replicateTargetMonth, setReplicateTargetMonth] = useState('Junho/2026');
  const [isReplicating, setIsReplicating] = useState(false);

  // Filters State
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSecretaria, setSelectedSecretaria] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');

  // Editing Tariffs Inline
  const [isEditingPrices, setIsEditingPrices] = useState(false);
  const [tempPrices, setTempPrices] = useState<ContactCenterPrices>({ ...DEFAULT_CC_PRICES });

  // Creation/Edit Modal State
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingRecord, setEditingRecord] = useState<ContactCenterOS | null>(null);
  const [formContrato, setFormContrato] = useState('');
  const [formSecretaria, setFormSecretaria] = useState('');
  const [formStatus, setFormStatus] = useState<'Ativo' | 'Suspenso' | 'Cancelado' | 'Pendente'>('Ativo');
  const [formNmsBasico, setFormNmsBasico] = useState<number>(0);
  const [formNmsCritico, setFormNmsCritico] = useState<number>(0);
  const [formGravacaoBasica, setFormGravacaoBasica] = useState<number>(0);
  const [formGravacaoCritica, setFormGravacaoCritica] = useState<number>(0);
  const [formUraBasica, setFormUraBasica] = useState<number>(0);
  const [formUraCritica, setFormUraCritica] = useState<number>(0);
  const [formObservacoes, setFormObservacoes] = useState('');
  const [formReferenceMonth, setFormReferenceMonth] = useState('Junho/2026');
  const [formDate, setFormDate] = useState(() => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  });

  // Delete Confirmation State
  const [recordToDelete, setRecordToDelete] = useState<ContactCenterOS | null>(null);

  // Toast Notification
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'info' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Synchronize dynamic prices from Firestore document systemPrices/contactCenter
  useEffect(() => {
    const pricesDocRef = doc(db, 'systemPrices', 'contactCenter');
    const unsub = onSnapshot(pricesDocRef, async (docSnap) => {
      if (docSnap.exists()) {
        const fetchedPrices = docSnap.data() as ContactCenterPrices;
        setPrices(fetchedPrices);
        setTempPrices(fetchedPrices);
      } else {
        if ((docSnap as any).metadata?.fromCache) {
          // Ignore if empty snapshot from local cache to prevent default overwrites during connection phase
          return;
        }
        // Initialize document with defaults
        try {
          await setDoc(pricesDocRef, DEFAULT_CC_PRICES);
          setPrices(DEFAULT_CC_PRICES);
          setTempPrices(DEFAULT_CC_PRICES);
        } catch (err) {
          setIsLoading(false);
          handleFirestoreError(err, OperationType.WRITE, 'systemPrices/contactCenter');
        }
      }
    }, (error) => {
      setIsLoading(false);
      handleFirestoreError(error, OperationType.GET, 'systemPrices/contactCenter');
    });

    return () => unsub();
  }, []);

  // Synchronize records from Firestore collection contactCenterRecords
  useEffect(() => {
    setIsLoading(true);
    const colRef = collection(db, 'contactCenterRecords');
    const unsub = onSnapshot(colRef, async (snapshot) => {
      const list: ContactCenterOS[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() } as ContactCenterOS);
      });

      const targetMonths = [
        'Março/2026',
        'Abril/2026',
        'Maio/2026'
      ];

      const mapMonthToAscii = (month: string) => {
        return month
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]/g, '-');
      };

      if (snapshot.empty) {
        if (snapshot.metadata?.fromCache) {
          // Ignore if empty snapshot from local cache to prevent default overwrites during connection phase
          return;
        }

        let isAlreadySeededDB = false;
        try {
          const seedMetaDoc = await getDoc(doc(db, 'test', 'seeding_metadata'));
          if (seedMetaDoc.exists() && seedMetaDoc.data()?.contactCenter === true) {
            isAlreadySeededDB = true;
          }
        } catch (smErr) {
          console.warn("Could not retrieve remote seeding metadata for CC:", smErr);
        }

        const isSeeded = isAlreadySeededDB || localStorage.getItem('cc_seeded_v6') === 'true';
        if (isSeeded) {
          setRecords([]);
          setIsLoading(false);
          localStorage.setItem('cc_seeded_v6', 'true');
          localStorage.setItem('cc_replicated_v6', 'true');
          return;
        }

        // Auto-seed preseeded mock contents + direct replication from June to March-May
        try {
          const batch = writeBatch(db);
          
          // Seed source June records
          PRESEEDED_CONTACT_CENTER.forEach((item) => {
            const docRef = doc(db, 'contactCenterRecords', item.id);
            batch.set(docRef, item);
          });

          // Seed replicated target months
          PRESEEDED_CONTACT_CENTER.forEach((juneRec) => {
            targetMonths.forEach((m) => {
              const cleanId = juneRec.id.replace('cc-preseed-', '').replace('cc-', '');
              const safeId = `cc-auto-${cleanId}-${mapMonthToAscii(m)}`;
              const replicatedRecord: ContactCenterOS = {
                ...juneRec,
                id: safeId,
                referenceMonth: m
              };
              const docRef = doc(db, 'contactCenterRecords', safeId);
              batch.set(docRef, replicatedRecord);
            });
          });

          // Save seeding indication to DB as well
          const seedMetaRef = doc(db, 'test', 'seeding_metadata');
          batch.set(seedMetaRef, { contactCenter: true }, { merge: true });

          await batch.commit();
          localStorage.setItem('cc_seeded_v6', 'true');
          localStorage.setItem('cc_replicated_v6', 'true');
        } catch (e) {
          console.error("Erro ao popular banco de dados de Contact Center:", e);
          setIsLoading(false);
        }
      } else {
        // Enforce direct db auto-replication if not already run in this client session scope
        const hasReplicated = localStorage.getItem('cc_replicated_v6') === 'true';
        if (!hasReplicated) {
          try {
            const juneRecords = list.filter(r => r.referenceMonth === 'Junho/2026');
            const source = juneRecords.length > 0 ? juneRecords : PRESEEDED_CONTACT_CENTER.filter(r => r.referenceMonth === 'Junho/2026');

            const batch = writeBatch(db);
            
            // Delete existing records in target months to overwrite cleanly
            const existingInTargetMonths = list.filter(r => targetMonths.includes(r.referenceMonth));
            existingInTargetMonths.forEach((oldRec) => {
              // Only delete if it's not one of the old invalid IDs that we can't delete anyway
              if (/^[a-zA-Z0-9_\-]+$/.test(oldRec.id)) {
                batch.delete(doc(db, 'contactCenterRecords', oldRec.id));
              }
            });

            // Replicate June records to targeted months
            source.forEach((juneRec) => {
              targetMonths.forEach((m) => {
                const cleanId = juneRec.id.replace('cc-preseed-', '').replace('cc-', '');
                const safeId = `cc-auto-${cleanId}-${mapMonthToAscii(m)}`;
                const replicatedRecord: ContactCenterOS = {
                  ...juneRec,
                  id: safeId,
                  referenceMonth: m
                };
                batch.set(doc(db, 'contactCenterRecords', safeId), replicatedRecord);
              });
            });

            await batch.commit();
            localStorage.setItem('cc_replicated_v6', 'true');
          } catch (e) {
            console.error("Erro ao auto-replicar dados diretamente no Firestore:", e);
          }
        }
        localStorage.setItem('cc_seeded_v6', 'true');
        setRecords(list);
      }
      setIsLoading(false);
    }, (error) => {
      setIsLoading(false);
      handleFirestoreError(error, OperationType.GET, 'contactCenterRecords');
    });

    return () => unsub();
  }, []);



  // Sync form default reference month when selected outer month changes
  useEffect(() => {
    if (!editingRecord) {
      setFormReferenceMonth(referenceMonth);
    }
  }, [referenceMonth, editingRecord]);

  // Months List
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

  const isZeroMonthSelected = referenceMonth === 'Janeiro/2026' || referenceMonth === 'Fevereiro/2026';

  // Sub-formulas for Billing Values
  const getRecordNmsValue = (r: ContactCenterOS, p: ContactCenterPrices) => {
    return (Number(r.nmsBasico) * Number(p.nmsBasico)) + (Number(r.nmsCritico) * Number(p.nmsCritico));
  };

  const getRecordGravacaoValue = (r: ContactCenterOS, p: ContactCenterPrices) => {
    return (Number(r.gravacaoBasica) * Number(p.gravacaoBasica)) + (Number(r.gravacaoCritica) * Number(p.gravacaoCritica));
  };

  const getRecordUraValue = (r: ContactCenterOS, p: ContactCenterPrices) => {
    return (Number(r.uraBasica) * Number(p.uraBasica)) + (Number(r.uraCritica) * Number(p.uraCritica));
  };

  const getRecordTotalValue = (r: ContactCenterOS, p: ContactCenterPrices) => {
    return getRecordNmsValue(r, p) + getRecordGravacaoValue(r, p) + getRecordUraValue(r, p);
  };

  const formatBRL = (val: number) => {
    return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  // Active records for currently selected month
  const monthRecords = useMemo(() => {
    if (isZeroMonthSelected) return [];
    const baseRecords = records.filter(r => r.referenceMonth === referenceMonth);
    if (user && user.role === 'cliente') {
      const allowed = user.secretarias || [];
      return baseRecords.filter(r => allowed.includes(r.secretaria));
    }
    return baseRecords;
  }, [records, referenceMonth, isZeroMonthSelected, user]);

  // Previous month records for comparison
  const previousMonthStr = useMemo(() => {
    const idx = availableMonths.indexOf(referenceMonth);
    return idx > 0 ? availableMonths[idx - 1] : '';
  }, [referenceMonth, availableMonths]);

  const previousMonthRecords = useMemo(() => {
    if (!previousMonthStr) return [];
    if (previousMonthStr === 'Janeiro/2026' || previousMonthStr === 'Fevereiro/2026') return [];
    const baseRecords = records.filter(r => r.referenceMonth === previousMonthStr);
    if (user && user.role === 'cliente') {
      const allowed = user.secretarias || [];
      return baseRecords.filter(r => allowed.includes(r.secretaria));
    }
    return baseRecords;
  }, [records, previousMonthStr, user]);

  const findMatchingCcPrevRecord = (currentRecord: ContactCenterOS) => {
    if (!previousMonthRecords || previousMonthRecords.length === 0) return null;
    let match = previousMonthRecords.find(r => r.contrato?.trim() === currentRecord.contrato?.trim());
    if (match) return match;
    match = previousMonthRecords.find(r => r.secretaria?.trim() === currentRecord.secretaria?.trim());
    if (match) return match;
    const cleanCurrentId = currentRecord.id.replace(/cc-(preseed|auto)-/g, '').split('-')[0];
    return previousMonthRecords.find(r => r.id.replace(/cc-(preseed|auto)-/g, '').split('-')[0] === cleanCurrentId) || null;
  };

  // Unique lists of secretarias for filter select
  const uniqueSecretariasList = useMemo(() => {
    const set = new Set<string>();
    let baseRecords = records;
    if (user && user.role === 'cliente') {
      const allowed = user.secretarias || [];
      baseRecords = baseRecords.filter(r => allowed.includes(r.secretaria));
    }
    baseRecords.forEach(r => {
      if (r.secretaria) set.add(r.secretaria);
    });
    return Array.from(set).sort();
  }, [records, user]);

  // Apply search & advanced selectors
  const filteredRecords = useMemo(() => {
    return monthRecords.filter(r => {
      const matchSearch = `${r.contrato} ${r.secretaria} ${r.observacoes || ''}`
        .toLowerCase()
        .includes(searchTerm.toLowerCase());
      const matchSec = !selectedSecretaria || r.secretaria === selectedSecretaria;
      const matchStat = !selectedStatus || r.status === selectedStatus;
      return matchSearch && matchSec && matchStat;
    });
  }, [monthRecords, searchTerm, selectedSecretaria, selectedStatus]);

  // Dashboard Stats Calculations
  const stats = useMemo(() => {
    if (isZeroMonthSelected) {
      return {
        totalContracts: 0,
        activeContractsCount: 0,
        uniqueSecretarias: 0,
        totalNms: 0,
        totalGravacao: 0,
        totalUra: 0,
        grandTotalValue: 0
      };
    }

    const activeContracts = monthRecords.filter(r => r.status === 'Ativo');
    const secretariasSet = new Set<string>();
    monthRecords.forEach(r => {
      if (r.secretaria) secretariasSet.add(r.secretaria);
    });

    let totalNms = 0;
    let totalGravacao = 0;
    let totalUra = 0;
    let grandTotalValue = 0;

    // Sum using filtered/visible records or all records of the month? Usually, the dashboard visualizes current month selections
    monthRecords.forEach(r => {
      totalNms += Number(r.nmsBasico || 0) + Number(r.nmsCritico || 0);
      totalGravacao += Number(r.gravacaoBasica || 0) + Number(r.gravacaoCritica || 0);
      totalUra += Number(r.uraBasica || 0) + Number(r.uraCritica || 0);
      grandTotalValue += getRecordTotalValue(r, prices);
    });

    return {
      totalContracts: monthRecords.length,
      activeContractsCount: activeContracts.length,
      uniqueSecretarias: secretariasSet.size,
      totalNms,
      totalGravacao,
      totalUra,
      grandTotalValue
    };
  }, [monthRecords, prices, isZeroMonthSelected]);

  // Footer Sum & Value Calculations based on FILTERED records
  const footerCalculations = useMemo(() => {
    let sumNmsBasico = 0;
    let sumNmsCritico = 0;
    let sumGravacaoBasica = 0;
    let sumGravacaoCritica = 0;
    let sumUraBasica = 0;
    let sumUraCritica = 0;

    filteredRecords.forEach(r => {
      sumNmsBasico += Number(r.nmsBasico || 0);
      sumNmsCritico += Number(r.nmsCritico || 0);
      sumGravacaoBasica += Number(r.gravacaoBasica || 0);
      sumGravacaoCritica += Number(r.gravacaoCritica || 0);
      sumUraBasica += Number(r.uraBasica || 0);
      sumUraCritica += Number(r.uraCritica || 0);
    });

    const valNmsBasico = sumNmsBasico * prices.nmsBasico;
    const valNmsCritico = sumNmsCritico * prices.nmsCritico;
    const valGravacaoBasica = sumGravacaoBasica * prices.gravacaoBasica;
    const valGravacaoCritica = sumGravacaoCritica * prices.gravacaoCritica;
    const valUraBasica = sumUraBasica * prices.uraBasica;
    const valUraCritica = sumUraCritica * prices.uraCritica;

    const valTotalNms = valNmsBasico + valNmsCritico;
    const valTotalGravacao = valGravacaoBasica + valGravacaoCritica;
    const valTotalUra = valUraBasica + valUraCritica;
    const grandMonthlyTotal = valTotalNms + valTotalGravacao + valTotalUra;

    return {
      sumNmsBasico,
      sumNmsCritico,
      sumGravacaoBasica,
      sumGravacaoCritica,
      sumUraBasica,
      sumUraCritica,
      valNmsBasico,
      valNmsCritico,
      valGravacaoBasica,
      valGravacaoCritica,
      valUraBasica,
      valUraCritica,
      valTotalNms,
      valTotalGravacao,
      valTotalUra,
      grandMonthlyTotal
    };
  }, [filteredRecords, prices]);

  // Inline pricing edits save
  const handleSavePrices = async () => {
    try {
      await setDoc(doc(db, 'systemPrices', 'contactCenter'), tempPrices);
      setPrices(tempPrices);
      setIsEditingPrices(false);
      showToast('Novas tarifas em vigor de Contact Center salvas no Banco de Dados!');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'systemPrices/contactCenter');
    }
  };

  const handleCancelPrices = () => {
    setTempPrices({ ...prices });
    setIsEditingPrices(false);
  };

  const handlePriceChange = (key: keyof ContactCenterPrices, value: string) => {
    const numeric = parseFloat(value) || 0;
    setTempPrices(prev => ({ ...prev, [key]: numeric }));
  };

  // Reset Filters
  const handleResetFilters = () => {
    setSearchTerm('');
    setSelectedSecretaria('');
    setSelectedStatus('');
    showToast('Filtros de busca redefinidos para os padrões.', 'info');
  };

  // Save Record (Add / Edit)
  const handleSaveRecord = async (e: React.FormEvent) => {
    e.preventDefault();

    const cleanContrato = formContrato.trim();
    const cleanSecretaria = formSecretaria.trim();

    if (!cleanContrato) {
      showToast("Título do Contrato é obrigatório", "error");
      return;
    }
    if (!/^\d{6}$/.test(cleanContrato)) {
      showToast("O contrato de Contact Center deve conter exatamente 6 dígitos numéricos.", "error");
      return;
    }
    if (!cleanSecretaria) {
      showToast("Nome da Secretaria é obrigatório", "error");
      return;
    }

    const recordId = editingRecord ? editingRecord.id : `cc-${Date.now()}`;
    const newRecord: ContactCenterOS = {
      id: recordId,
      contrato: cleanContrato,
      secretaria: cleanSecretaria,
      referenceMonth: formReferenceMonth,
      status: formStatus,
      nmsBasico: Number(formNmsBasico) || 0,
      nmsCritico: Number(formNmsCritico) || 0,
      gravacaoBasica: Number(formGravacaoBasica) || 0,
      gravacaoCritica: Number(formGravacaoCritica) || 0,
      uraBasica: Number(formUraBasica) || 0,
      uraCritica: Number(formUraCritica) || 0,
      observacoes: formObservacoes.trim(),
      dataAssinatura: formDate
    };

    try {
      await setDoc(doc(db, 'contactCenterRecords', recordId), newRecord);
      showToast(editingRecord ? "Contrato atualizado com sucesso!" : "Novo contrato inserido de Contact Center!");
      setShowFormModal(false);
      resetForm();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `contactCenterRecords/${recordId}`);
    }
  };

  // Prepare Forms for Add
  const handleOpenAddModal = () => {
    setEditingRecord(null);
    setFormContrato('');
    setFormSecretaria('');
    setFormStatus('Ativo');
    setFormNmsBasico(0);
    setFormNmsCritico(0);
    setFormGravacaoBasica(0);
    setFormGravacaoCritica(0);
    setFormUraBasica(0);
    setFormUraCritica(0);
    setFormObservacoes('');
    setFormReferenceMonth(referenceMonth);
    const today = new Date();
    setFormDate(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`);
    setShowFormModal(true);
  };

  // Prepare Forms for Edit
  const handleOpenEditModal = (rec: ContactCenterOS) => {
    setEditingRecord(rec);
    setFormContrato(rec.contrato);
    setFormSecretaria(rec.secretaria);
    setFormStatus(rec.status);
    setFormNmsBasico(rec.nmsBasico);
    setFormNmsCritico(rec.nmsCritico);
    setFormGravacaoBasica(rec.gravacaoBasica);
    setFormGravacaoCritica(rec.gravacaoCritica);
    setFormUraBasica(rec.uraBasica);
    setFormUraCritica(rec.uraCritica);
    setFormObservacoes(rec.observacoes || '');
    setFormReferenceMonth(rec.referenceMonth);
    setFormDate(rec.dataAssinatura || '');
    setShowFormModal(true);
  };

  const resetForm = () => {
    setEditingRecord(null);
    setFormContrato('');
    setFormSecretaria('');
    setFormStatus('Ativo');
    setFormNmsBasico(0);
    setFormNmsCritico(0);
    setFormGravacaoBasica(0);
    setFormGravacaoCritica(0);
    setFormUraBasica(0);
    setFormUraCritica(0);
    setFormObservacoes('');
    setFormReferenceMonth(referenceMonth);
  };

  // Handle Delete Contract
  const handleDeleteRecord = async () => {
    if (!recordToDelete) return;

    try {
      await deleteDoc(doc(db, 'contactCenterRecords', recordToDelete.id));
      showToast(`Contrato ${recordToDelete.contrato} excluído permanentemente.`);
      setRecordToDelete(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `contactCenterRecords/${recordToDelete.id}`);
    }
  };

  // Replication handler: duplicates CC contracts from source month to target month
  const handleReplicateContracts = async () => {
    if (replicateSourceMonth === replicateTargetMonth) {
      showToast('O mês de origem e o mês de destino devem ser diferentes.', 'info');
      return;
    }

    setIsReplicating(true);
    try {
      // 1. Get source records
      const sourceMonthRecords = records.filter(r => r.referenceMonth === replicateSourceMonth);
      if (sourceMonthRecords.length === 0) {
        showToast(`Nenhum contrato encontrado no mês de origem: ${replicateSourceMonth}`, 'info');
        setIsReplicating(false);
        return;
      }

      const mapMonthToAsciiLocal = (monthStr: string) => {
        return monthStr
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]/g, '-');
      };

      const batch = writeBatch(db);

      // 2. Delete existing records in the target month to overwrite cleanly
      const existingInTarget = records.filter(r => r.referenceMonth === replicateTargetMonth);
      existingInTarget.forEach((rec) => {
        batch.delete(doc(db, 'contactCenterRecords', rec.id));
      });

      // 3. Write replicated contracts to target month using stable constructed IDs
      sourceMonthRecords.forEach((srcRec) => {
        const cleanId = srcRec.id
          .replace('cc-preseed-', '')
          .replace('cc-auto-', '')
          .replace(new RegExp(`-${mapMonthToAsciiLocal(replicateSourceMonth)}$`), '');
        const targetDocId = `cc-auto-${cleanId}-${mapMonthToAsciiLocal(replicateTargetMonth)}`;

        const replicatedRecord: ContactCenterOS = {
          ...srcRec,
          id: targetDocId,
          referenceMonth: replicateTargetMonth
        };
        batch.set(doc(db, 'contactCenterRecords', targetDocId), replicatedRecord);
      });

      await batch.commit();

      showToast(`Dados de ${replicateSourceMonth} replicados para ${replicateTargetMonth} com sucesso!`);
      // Update view to the new target month so the user sees the newly copied data immediately!
      setReferenceMonth(replicateTargetMonth);
      setShowReplicateModal(false);
    } catch (err) {
      console.error("Erro total na replicação Contact Center:", err);
      showToast("Falha ao replicar contratos no Banco de Dados.", "error");
    } finally {
      setIsReplicating(false);
    }
  };

  // Export to Excel Workbook
  const exportToExcel = () => {
    try {
      const wb = XLSX.utils.book_new();

      const summaryData = [
        ['DEMONSTRATIVO DE FATURAMENTO - CONTACT CENTER DIGITAL'],
        ['Mês de Referência:', referenceMonth],
        ['Data de Emissão:', new Date().toLocaleDateString('pt-BR')],
        [''],
        ['RESUMO DE INDICADORES DO MÊS'],
        ['Indicador', 'Valor / Quantidade'],
        ['Contratos Cadastrados (Mes)', stats.totalContracts],
        ['Órgãos Unificados Atendidos', stats.uniqueSecretarias],
        ['Total Linhas / Canais NMS', stats.totalNms],
        ['Total Canais Gravação Digital', stats.totalGravacao],
        ['Total Portas URA NMS', stats.totalUra],
        ['FATURAMENTO COMPLETO ESTIMADO', formatBRL(stats.grandTotalValue)],
        [''],
        ['TARIFAS UNITÁRIAS VIGENTES'],
        ['Serviço', 'Básico', 'Crítico'],
        ['Unidade Central CAC (NMS)', formatBRL(prices.nmsBasico), formatBRL(prices.nmsCritico)],
        ['Gravação Digital', formatBRL(prices.gravacaoBasica), formatBRL(prices.gravacaoCritica)],
        ['U.R.A. (Resposta Audível)', formatBRL(prices.uraBasica), formatBRL(prices.uraCritica)]
      ];

      const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
      wsSummary['!cols'] = [{ wch: 35 }, { wch: 20 }, { wch: 20 }];
      XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumo Executivo');

      if (filteredRecords.length > 0) {
        const rows = filteredRecords.map(r => {
          const prev = findMatchingCcPrevRecord(r);
          
          let contractStr = r.contrato;
          let statusStr = r.status;
          let nmsBasicoStr: string | number = r.nmsBasico;
          let nmsCriticoStr: string | number = r.nmsCritico;
          let gravBasicaStr: string | number = r.gravacaoBasica;
          let gravCriticaStr: string | number = r.gravacaoCritica;
          let uraBasicaStr: string | number = r.uraBasica;
          let uraCriticaStr: string | number = r.uraCritica;
          let totalStr = formatBRL(getRecordTotalValue(r, prices));

          if (prev) {
            let hasDiff = false;
            if (r.status !== prev.status) {
              statusStr = `${r.status} (ant: ${prev.status})`;
              hasDiff = true;
            }
            if (r.nmsBasico !== prev.nmsBasico) {
              nmsBasicoStr = `${r.nmsBasico} (ant: ${prev.nmsBasico})`;
              hasDiff = true;
            }
            if (r.nmsCritico !== prev.nmsCritico) {
              nmsCriticoStr = `${r.nmsCritico} (ant: ${prev.nmsCritico})`;
              hasDiff = true;
            }
            if (r.gravacaoBasica !== prev.gravacaoBasica) {
              gravBasicaStr = `${r.gravacaoBasica} (ant: ${prev.gravacaoBasica})`;
              hasDiff = true;
            }
            if (r.gravacaoCritica !== prev.gravacaoCritica) {
              gravCriticaStr = `${r.gravacaoCritica} (ant: ${prev.gravacaoCritica})`;
              hasDiff = true;
            }
            if (r.uraBasica !== prev.uraBasica) {
              uraBasicaStr = `${r.uraBasica} (ant: ${prev.uraBasica})`;
              hasDiff = true;
            }
            if (r.uraCritica !== prev.uraCritica) {
              uraCriticaStr = `${r.uraCritica} (ant: ${prev.uraCritica})`;
              hasDiff = true;
            }
            
            const currentTot = getRecordTotalValue(r, prices);
            const prevTot = getRecordTotalValue(prev, prices);
            if (Math.abs(currentTot - prevTot) > 0.01) {
              totalStr = `${formatBRL(currentTot)} (ant: ${formatBRL(prevTot)})`;
              hasDiff = true;
            }

            if (hasDiff) {
              contractStr = `[ALTERADO] ${r.contrato}`;
            }
          }

          return {
            'CONTRATO': contractStr,
            'SECRETARIA': r.secretaria,
            'STATUS': statusStr,
            'NMS BÁSICO': nmsBasicoStr,
            'NMS CRÍTICO': nmsCriticoStr,
            'VALOR NMS': formatBRL(getRecordNmsValue(r, prices)),
            'GRAVAÇÃO BÁSICO': gravBasicaStr,
            'GRAVAÇÃO CRÍTICO': gravCriticaStr,
            'VALOR GRAVAÇÃO': formatBRL(getRecordGravacaoValue(r, prices)),
            'URA BÁSICO': uraBasicaStr,
            'URA CRÍTICO': uraCriticaStr,
            'VALOR URA': formatBRL(getRecordUraValue(r, prices)),
            'MENSAL TOTAL': totalStr,
            'OBSERVAÇÕES': r.observacoes || ''
          };
        });
        const wsDetail = XLSX.utils.json_to_sheet(rows);
        wsDetail['!cols'] = [
          { wch: 15 }, { wch: 32 }, { wch: 12 }, 
          { wch: 12 }, { wch: 12 }, { wch: 15 }, 
          { wch: 12 }, { wch: 12 }, { wch: 15 }, 
          { wch: 12 }, { wch: 12 }, { wch: 15 }, 
          { wch: 18 }, { wch: 30 }
        ];
        XLSX.utils.book_append_sheet(wb, wsDetail, 'Contratos Ativos');
      }

      XLSX.writeFile(wb, `Faturamento_Contact_Center_${referenceMonth.replace('/', '_')}.xlsx`);
      showToast("Planilha Excel de Contact Center exportada!");
    } catch (err) {
      console.error(err);
      showToast("Erro ao exportar Planilha.", "error");
    }
  };

  // Export to PDF Report
  const exportToPDF = () => {
    try {
      const doc = new jsPDF('l', 'mm', 'a4');

      // Title header canvas
      doc.setFillColor(15, 23, 42); // slate-900 / dark high contrast
      doc.rect(0, 0, 297, 40, 'F');

      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text("PORTAL DO GESTOR PE II - CONTACT CENTER", 15, 16);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      doc.setTextColor(203, 213, 225); // slate-300
      doc.text("Relatório Consolidado de Faturamento Omnichannel & Canais Digitais", 15, 22);
      doc.text(`Períodos de Cobrança: ${referenceMonth}`, 15, 28);

      const emitDate = new Date().toLocaleDateString('pt-BR');
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184); // slate-400
      doc.text(`Gerado em: ${emitDate}`, 235, 16);
      doc.text("Gestor Responsável: Auditoria PE II", 235, 22);
      doc.text("Status Fiscal: Auditado", 235, 28);

      let y = 48;

      // Overview Box Row
      doc.setFillColor(248, 250, 252); // slate-50
      doc.setDrawColor(226, 232, 240); // slate-200
      doc.setLineWidth(0.3);
      doc.roundedRect(15, y, 267, 34, 3, 3, 'FD');

      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(15, 23, 42); 
      doc.text("RESUMO EXECUTIVO INTEGRADO", 20, y + 8);

      doc.line(20, y + 11, 282, y + 11);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(71, 85, 105);
      doc.text(`Total de Contratos: ${stats.totalContracts} cadastrados`, 22, y + 18);
      doc.text(`Órgãos Atendidos: ${stats.uniqueSecretarias} secretarias`, 22, y + 23);
      doc.text(`Total Canais NMS: ${stats.totalNms} ativos`, 22, y + 28);

      doc.text(`Registo Canais Gravação: ${stats.totalGravacao} licenças`, 110, y + 18);
      doc.text(`Portas de URA Faturamento: ${stats.totalUra} canais`, 110, y + 23);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(2, 132, 199); // brand colors
      doc.text(`CONSOLIDADO FINAL: ${formatBRL(stats.grandTotalValue)}`, 185, y + 23);

      y = 90;

      // Render table headers manually
      doc.setFillColor(241, 245, 249); // slate-100
      doc.rect(15, y, 267, 8, 'F');

      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(15, 23, 42);

      doc.text("CONTRATO", 17, y + 5);
      doc.text("SECRETARIA", 42, y + 5);
      doc.text("STATUS", 102, y + 5);
      doc.text("NMS BAS", 122, y + 5);
      doc.text("NMS CRI", 137, y + 5);
      doc.text("VAL NMS", 152, y + 5);
      doc.text("GRA BAS", 172, y + 5);
      doc.text("GRA CRI", 187, y + 5);
      doc.text("VAL GRA", 202, y + 5);
      doc.text("URA BAS", 222, y + 5);
      doc.text("URA CRI", 237, y + 5);
      doc.text("VAL URA", 252, y + 5);
      doc.text("MENSAL TOT", 267, y + 5);

      y += 8;

      // Table records
      filteredRecords.forEach((r, idx) => {
        if (y > 185) {
          doc.addPage();
          y = 20;
        }

        const prev = findMatchingCcPrevRecord(r);
        let isRowEdited = false;
        let isStatusEdited = false;
        let isNmsBasEdited = false;
        let isNmsCriEdited = false;
        let isGravBasEdited = false;
        let isGravCriEdited = false;
        let isUraBasEdited = false;
        let isUraCriEdited = false;
        let isValTotalEdited = false;

        if (prev) {
          if (r.status !== prev.status) {
            isStatusEdited = true;
            isRowEdited = true;
          }
          if (r.nmsBasico !== prev.nmsBasico) {
            isNmsBasEdited = true;
            isRowEdited = true;
          }
          if (r.nmsCritico !== prev.nmsCritico) {
            isNmsCriEdited = true;
            isRowEdited = true;
          }
          if (r.gravacaoBasica !== prev.gravacaoBasica) {
            isGravBasEdited = true;
            isRowEdited = true;
          }
          if (r.gravacaoCritica !== prev.gravacaoCritica) {
            isGravCriEdited = true;
            isRowEdited = true;
          }
          if (r.uraBasica !== prev.uraBasica) {
            isUraBasEdited = true;
            isRowEdited = true;
          }
          if (r.uraCritica !== prev.uraCritica) {
            isUraCriEdited = true;
            isRowEdited = true;
          }
          if (Math.abs(getRecordTotalValue(r, prices) - getRecordTotalValue(prev, prices)) > 0.01) {
            isValTotalEdited = true;
            isRowEdited = true;
          }
        }

        if (isRowEdited) {
          doc.setFillColor(254, 243, 199); // soft amber highlight
        } else if (idx % 2 === 0) {
          doc.setFillColor(255, 255, 255);
        } else {
          doc.setFillColor(248, 250, 252); // zebra
        }
        doc.rect(15, y, 267, 6.5, 'F');

        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        doc.setTextColor(51, 65, 85);

        // Draw Contrato
        if (isRowEdited) {
          doc.setFont("helvetica", "bold");
          doc.setTextColor(180, 83, 9);
          doc.text(`* ${r.contrato}`, 17, y + 4.5);
        } else {
          doc.setFont("helvetica", "normal");
          doc.setTextColor(51, 65, 85);
          doc.text(r.contrato, 17, y + 4.5);
        }

        doc.setFont("helvetica", "normal");
        doc.setTextColor(51, 65, 85);
        doc.text(r.secretaria.slice(0, 32), 42, y + 4.5);

        // Status
        if (isStatusEdited && prev) {
          doc.setFont("helvetica", "bold");
          doc.setTextColor(180, 83, 9);
          doc.text(`${r.status} (${prev.status.substring(0,3)})`, 102, y + 4.5);
        } else {
          doc.setFont("helvetica", "normal");
          doc.setTextColor(51, 65, 85);
          doc.text(r.status, 102, y + 4.5);
        }

        // Nms Básico
        if (isNmsBasEdited && prev) {
          doc.setFont("helvetica", "bold");
          doc.setTextColor(180, 83, 9);
          doc.text(`${r.nmsBasico} (${prev.nmsBasico})`, 125, y + 4.5, { align: 'center' });
        } else {
          doc.setFont("helvetica", "normal");
          doc.setTextColor(51, 65, 85);
          doc.text(String(r.nmsBasico), 125, y + 4.5, { align: 'center' });
        }

        // Nms Crítico
        if (isNmsCriEdited && prev) {
          doc.setFont("helvetica", "bold");
          doc.setTextColor(180, 83, 9);
          doc.text(`${r.nmsCritico} (${prev.nmsCritico})`, 140, y + 4.5, { align: 'center' });
        } else {
          doc.setFont("helvetica", "normal");
          doc.setTextColor(51, 65, 85);
          doc.text(String(r.nmsCritico), 140, y + 4.5, { align: 'center' });
        }

        doc.setTextColor(51, 65, 85);
        doc.text(formatBRL(getRecordNmsValue(r, prices)).replace('R$', '').trim(), 167, y + 4.5, { align: 'right' });

        // Gravação Básico
        if (isGravBasEdited && prev) {
          doc.setFont("helvetica", "bold");
          doc.setTextColor(180, 83, 9);
          doc.text(`${r.gravacaoBasica} (${prev.gravacaoBasica})`, 175, y + 4.5, { align: 'center' });
        } else {
          doc.setFont("helvetica", "normal");
          doc.setTextColor(51, 65, 85);
          doc.text(String(r.gravacaoBasica), 175, y + 4.5, { align: 'center' });
        }

        // Gravação Crítico
        if (isGravCriEdited && prev) {
          doc.setFont("helvetica", "bold");
          doc.setTextColor(180, 83, 9);
          doc.text(`${r.gravacaoCritica} (${prev.gravacaoCritica})`, 190, y + 4.5, { align: 'center' });
        } else {
          doc.setFont("helvetica", "normal");
          doc.setTextColor(51, 65, 85);
          doc.text(String(r.gravacaoCritica), 190, y + 4.5, { align: 'center' });
        }

        doc.setTextColor(51, 65, 85);
        doc.text(formatBRL(getRecordGravacaoValue(r, prices)).replace('R$', '').trim(), 217, y + 4.5, { align: 'right' });

        // Ura Básico
        if (isUraBasEdited && prev) {
          doc.setFont("helvetica", "bold");
          doc.setTextColor(180, 83, 9);
          doc.text(`${r.uraBasica} (${prev.uraBasica})`, 225, y + 4.5, { align: 'center' });
        } else {
          doc.setFont("helvetica", "normal");
          doc.setTextColor(51, 65, 85);
          doc.text(String(r.uraBasica), 225, y + 4.5, { align: 'center' });
        }

        // Ura Crítico
        if (isUraCriEdited && prev) {
          doc.setFont("helvetica", "bold");
          doc.setTextColor(180, 83, 9);
          doc.text(`${r.uraCritica} (${prev.uraCritica})`, 240, y + 4.5, { align: 'center' });
        } else {
          doc.setFont("helvetica", "normal");
          doc.setTextColor(51, 65, 85);
          doc.text(String(r.uraCritica), 240, y + 4.5, { align: 'center' });
        }

        doc.setTextColor(51, 65, 85);
        doc.text(formatBRL(getRecordUraValue(r, prices)).replace('R$', '').trim(), 267, y + 4.5, { align: 'right' });

        // Total
        if (isValTotalEdited && prev) {
          doc.setFont("helvetica", "bold");
          doc.setTextColor(180, 83, 9);
          doc.text(formatBRL(getRecordTotalValue(r, prices)).replace('R$', '').trim(), 280, y + 4.5, { align: 'right' });
        } else {
          doc.setFont("helvetica", "bold");
          doc.setTextColor(51, 65, 85);
          doc.text(formatBRL(getRecordTotalValue(r, prices)).replace('R$', '').trim(), 280, y + 4.5, { align: 'right' });
        }

        y += 6.5;
      });

      // Total Line
      doc.setFillColor(241, 245, 249);
      doc.rect(15, y, 267, 7, 'F');
      doc.setFont("helvetica", "bold");
      doc.text("TOTAL GERAL", 17, y + 4.5);
      doc.text(String(footerCalculations.sumNmsBasico), 125, y + 4.5, { align: 'center' });
      doc.text(String(footerCalculations.sumNmsCritico), 140, y + 4.5, { align: 'center' });
      doc.text(formatBRL(footerCalculations.valTotalNms).replace('R$', '').trim(), 167, y + 4.5, { align: 'right' });
      doc.text(String(footerCalculations.sumGravacaoBasica), 175, y + 4.5, { align: 'center' });
      doc.text(String(footerCalculations.sumGravacaoCritica), 190, y + 4.5, { align: 'center' });
      doc.text(formatBRL(footerCalculations.valTotalGravacao).replace('R$', '').trim(), 217, y + 4.5, { align: 'right' });
      doc.text(String(footerCalculations.sumUraBasica), 225, y + 4.5, { align: 'center' });
      doc.text(String(footerCalculations.sumUraCritica), 240, y + 4.5, { align: 'center' });
      doc.text(formatBRL(footerCalculations.valTotalUra).replace('R$', '').trim(), 267, y + 4.5, { align: 'right' });
      doc.text(formatBRL(footerCalculations.grandMonthlyTotal).replace('R$', '').trim(), 280, y + 4.5, { align: 'right' });

      doc.save(`Faturamento_Contact_Center_${referenceMonth.replace('/', '_')}.pdf`);
      showToast("Relatórigo PDF de Contact Center gerado com sucesso!");
    } catch (err) {
      console.error(err);
      showToast("Erro ao exportar PDF.", "error");
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Toast Feedback */}
      {toast && (
        <div className={`fixed top-5 right-5 z-55 flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-lg border text-xs font-bold animate-slide-in ${
          toast.type === 'success' 
            ? 'bg-emerald-50 dark:bg-emerald-950/80 border-emerald-250 text-emerald-850 dark:text-emerald-400' 
            : toast.type === 'error'
            ? 'bg-rose-50 dark:bg-rose-950/80 border-rose-250 text-rose-850 dark:text-rose-400'
            : 'bg-sky-50 dark:bg-sky-950/80 border-sky-250 text-sky-850 dark:text-sky-400'
        }`}>
          <AlertCircle className="h-4.5 w-4.5 shrink-0" />
          <span>{toast.message}</span>
        </div>
      )}

      {/* Header card with subtle layout background */}
      <div className="relative overflow-hidden rounded-3.5xl border border-zinc-200/80 dark:border-zinc-800/80 bg-white dark:bg-zinc-900 p-6 md:p-8 shadow-xs">
        <div className="absolute right-0 top-0 -mr-16 -mt-16 w-48 h-48 rounded-full bg-brand/5 dark:bg-brand/10 blur-3xl pointer-events-none" />
        <div className="absolute left-1/3 bottom-0 w-64 h-64 rounded-full bg-cyan-500/5 blur-3xl pointer-events-none" />
        
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-brand/15 text-brand dark:bg-zinc-800 dark:text-brand-light">
              <Headset className="h-3 w-3 text-brand" />
              PECONECTADO II
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-zinc-900 dark:text-white font-sans flex items-center gap-2">
              <Headset className="h-7 w-7 text-brand" />
              Faturamento Contact Center
            </h1>
            <p className="text-zinc-500 dark:text-zinc-400 text-sm max-w-2xl leading-relaxed">
              Módulo unificado para controle de ramais inteligentes, serviços de distribuição de chamadas (NMS), Gravação Digital e URA.
            </p>
          </div>
          
          {/* Controls Box: Month Selector and Action Buttons */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
            <div className="flex flex-col justify-center bg-zinc-50 dark:bg-zinc-950 px-5 py-3 rounded-2.5xl border border-zinc-200/50 dark:border-zinc-850/65 min-w-[220px]">
              <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest font-mono">Mês de Referência</span>
              <div className="relative mt-1">
                <select
                  value={referenceMonth}
                  onChange={(e) => setReferenceMonth(e.target.value)}
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
                onClick={exportToPDF}
                className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl text-[11px] font-black uppercase tracking-wider transition-all shadow-xs cursor-pointer active:scale-95 duration-150"
              >
                <FileText className="h-4 w-4 text-white" />
                <span>Relatório PDF</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* DASHBOARD CARD INDICATORS */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
        {/* Card 1: Total Contratos */}
        <div className="bg-white dark:bg-zinc-900 rounded-2.5xl border border-zinc-200 dark:border-zinc-805 p-4.5 space-y-1 shadow-xs hover:shadow-md transition-all duration-200">
          <span className="block text-[10px] text-zinc-400 font-bold uppercase tracking-wider font-mono">Total de Contratos</span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl sm:text-2xl font-black tracking-tight text-zinc-800 dark:text-zinc-100">{isZeroMonthSelected ? 0 : stats.totalContracts}</span>
          </div>
          <span className="block text-[9px] text-emerald-500 font-bold font-mono">
            {isZeroMonthSelected ? "0" : stats.activeContractsCount} Contratos Ativos
          </span>
        </div>

        {/* Card 2: Total Secretarias */}
        <div className="bg-white dark:bg-zinc-900 rounded-2.5xl border border-zinc-200 dark:border-zinc-805 p-4.5 space-y-1 shadow-xs hover:shadow-md transition-all duration-200">
          <span className="block text-[10px] text-zinc-400 font-bold uppercase tracking-wider font-mono">Total de Secretarias</span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl sm:text-2xl font-black tracking-tight text-zinc-800 dark:text-zinc-100">{isZeroMonthSelected ? 0 : stats.uniqueSecretarias}</span>
          </div>
          <span className="block text-[9px] text-zinc-400 font-medium font-mono">Órgãos Cadastrados</span>
        </div>

        {/* Card 3: Total NMS */}
        <div className="bg-white dark:bg-zinc-900 rounded-2.5xl border border-zinc-200 dark:border-zinc-805 p-4.5 space-y-1 shadow-xs hover:shadow-md transition-all duration-200">
          <span className="block text-[10px] text-zinc-400 font-bold uppercase tracking-wider font-mono">Total NMS</span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl sm:text-2xl font-black tracking-tight text-zinc-800 dark:text-zinc-100">{isZeroMonthSelected ? 0 : stats.totalNms}</span>
          </div>
          <span className="block text-[9px] text-zinc-450 font-medium font-mono">Central NMS</span>
        </div>

        {/* Card 4: Total Gravação */}
        <div className="bg-white dark:bg-zinc-900 rounded-2.5xl border border-zinc-200 dark:border-zinc-805 p-4.5 space-y-1 shadow-xs hover:shadow-md transition-all duration-200">
          <span className="block text-[10px] text-zinc-400 font-bold uppercase tracking-wider font-mono">Total Gravação</span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl sm:text-2xl font-black tracking-tight text-zinc-800 dark:text-zinc-100">{isZeroMonthSelected ? 0 : stats.totalGravacao}</span>
          </div>
          <span className="block text-[9px] text-zinc-450 font-medium font-mono">Licenças Digitais</span>
        </div>

        {/* Card 5: Total URA */}
        <div className="bg-white dark:bg-zinc-900 rounded-2.5xl border border-zinc-200 dark:border-zinc-805 p-4.5 space-y-1 shadow-xs hover:shadow-md transition-all duration-200">
          <span className="block text-[10px] text-zinc-400 font-bold uppercase tracking-wider font-mono">Total URA</span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl sm:text-2xl font-black tracking-tight text-zinc-800 dark:text-zinc-100">{isZeroMonthSelected ? 0 : stats.totalUra}</span>
          </div>
          <span className="block text-[9px] text-zinc-450 font-medium font-mono">Resposta Audível</span>
        </div>

        {/* Card 6: Valor Mensal Total (Destaque) */}
        <div className="col-span-2 lg:col-span-1 bg-brand text-white dark:bg-zinc-900 dark:border-brand/40 border dark:border rounded-2xl p-4 flex flex-col justify-center shadow-md shadow-brand/10 hover:shadow-2xl transition-all duration-200">
          <span className="block text-[10px] text-cyan-100 dark:text-brand font-black uppercase tracking-wider font-mono">Valor Mensal Total</span>
          <span className="text-xl sm:text-2xl font-black tracking-tight leading-none truncate block mt-1">
            {formatBRL(stats.grandTotalValue)}
          </span>
          <span className="block text-[8px] text-cyan-200 dark:text-zinc-400 font-bold font-mono mt-1 uppercase">
            Faturamento Contact Center
          </span>
        </div>
      </div>

      {/* FILTER & ACTIONS BAR */}
      <div className="bg-zinc-50 dark:bg-zinc-950 p-4.5 rounded-3xl border border-zinc-200 dark:border-zinc-850/65 flex flex-col gap-4">
        
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
          
          {/* Search Inputs */}
          <div className="flex-1 flex flex-col sm:flex-row items-stretch gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-zinc-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Pesquisar por contrato ou secretaria..."
                className="w-full bg-white dark:bg-zinc-900 border border-zinc-250 dark:border-zinc-800 rounded-xl pl-10 pr-4 py-2 text-xs font-semibold text-zinc-800 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-brand shadow-2xs"
              />
            </div>

            {/* Reset Filters button */}
            {searchTerm && (
              <button
                onClick={handleResetFilters}
                className="flex items-center justify-center p-2.5 bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-800 dark:hover:bg-zinc-750 text-zinc-700 dark:text-zinc-300 rounded-xl transition-all font-sans cursor-pointer shrink-0"
                title="Limpar Filtros"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Action buttons list */}
          {canModify && (
            <div className="flex items-center gap-2.5 self-end lg:self-auto flex-wrap">
              {/* Replicar Mês button */}
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

              {/* Cadastrar button */}
              <button
                onClick={handleOpenAddModal}
                className="flex items-center gap-1.5 bg-brand hover:bg-brand-medium text-white px-4 py-2.5 rounded-xl text-xs font-extrabold shadow-md transition-all cursor-pointer whitespace-nowrap font-sans"
              >
                <Plus className="h-4 w-4 text-white" />
                <span>Adicionar Contrato</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* DETAILED DATA TABLE */}
      <div className="bg-white dark:bg-zinc-900 rounded-3xl shadow-sm border border-zinc-200 dark:border-zinc-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm whitespace-nowrap">
            
            {/* Header Columns */}
            <thead className="bg-[#edfdfd] dark:bg-zinc-800/75 border-b-2 border-brand-medium/35 dark:border-zinc-800 select-none">
              <tr>
                <th className="py-3 px-4 font-black text-[11px] text-zinc-700 dark:text-zinc-300 uppercase tracking-wider font-mono">Contrato</th>
                <th className="py-3 px-4 font-black text-[11px] text-zinc-700 dark:text-zinc-300 uppercase tracking-wider font-mono min-w-[170px]">Secretaria</th>
                <th className="py-3 px-4 font-black text-[11px] text-zinc-700 dark:text-zinc-300 uppercase tracking-wider font-mono text-center">Status</th>
                
                {/* NMS Group */}
                <th className="py-3 px-2 font-black text-[11px] text-sky-800 dark:text-sky-400 bg-sky-500/5 uppercase tracking-wider font-mono text-center border-l border-zinc-200 dark:border-zinc-850/60">NMS Básico</th>
                <th className="py-3 px-2 font-black text-[11px] text-sky-800 dark:text-sky-400 bg-sky-500/5 uppercase tracking-wider font-mono text-center">NMS Crítico</th>
                <th className="py-3 px-3 font-black text-[11px] text-sky-900 dark:text-sky-305 bg-sky-500/10 uppercase tracking-wider font-mono text-right pr-4">Valor NMS</th>

                {/* Gravação Group */}
                <th className="py-3 px-2 font-black text-[11px] text-emerald-800 dark:text-emerald-450 bg-emerald-500/5 uppercase tracking-wider font-mono text-center border-l border-zinc-200 dark:border-zinc-850/60">Gravação Bás.</th>
                <th className="py-3 px-2 font-black text-[11px] text-emerald-800 dark:text-emerald-450 bg-emerald-500/5 uppercase tracking-wider font-mono text-center">Gravação Crít.</th>
                <th className="py-3 px-3 font-black text-[11px] text-emerald-950 dark:text-emerald-305 bg-emerald-500/10 uppercase tracking-wider font-mono text-right pr-4">Valor Gravação</th>

                {/* URA Group */}
                <th className="py-3 px-2 font-black text-[11px] text-indigo-805 dark:text-indigo-400 bg-indigo-500/5 uppercase tracking-wider font-mono text-center border-l border-zinc-200 dark:border-zinc-850/60">URA Básico</th>
                <th className="py-3 px-2 font-black text-[11px] text-indigo-805 dark:text-indigo-400 bg-indigo-500/5 uppercase tracking-wider font-mono text-center">URA Crítico</th>
                <th className="py-3 px-3 font-black text-[11px] text-indigo-900 dark:text-indigo-305 bg-indigo-500/10 uppercase tracking-wider font-mono text-right pr-4">Valor URA</th>

                {/* Totals & Actions */}
                <th className="py-3 px-4 font-black text-[11px] text-brand uppercase tracking-wider font-mono text-right pr-5 border-l border-brand/20">Valor Mensal Total</th>
                <th className="py-3 px-4 font-black text-[11px] text-zinc-700 dark:text-zinc-300 uppercase tracking-wider font-mono text-center">
                  {canModify ? 'Ações' : 'Acesso'}
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800/80">
              
              {/* ================= FIRST TARIFF ROW (TARIFAS UNITÁRIAS) ================= */}
              <tr className="bg-sky-500/5 dark:bg-sky-950/20 font-bold border-b-2 border-sky-300/50 dark:border-sky-900">
                <td className="py-2.5 px-4 text-sky-700 dark:text-sky-400 text-xs font-mono font-bold tracking-wider">
                  TARIFAS UNITÁRIAS
                </td>
                <td className="py-2.5 px-4 text-zinc-500 dark:text-zinc-400 text-xs italic">
                  Preço Base do Serviço (BRL)
                </td>
                <td className="py-2.5 px-4 text-center">
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-brand text-white font-mono shadow-xs select-none">
                    Vigente
                  </span>
                </td>

                {/* NMS Básico Tariff Cell */}
                <td className="py-1.5 px-2 text-center border-l border-zinc-200 dark:border-zinc-850">
                  {isEditingPrices ? (
                    <input
                      type="number"
                      step="0.01"
                      value={tempPrices.nmsBasico}
                      onChange={(e) => handlePriceChange('nmsBasico', e.target.value)}
                      className="w-[80px] bg-white dark:bg-zinc-950 text-center text-xs p-1 rounded border border-brand/55 font-mono shadow-inner text-zinc-800 dark:text-white"
                    />
                  ) : (
                    <span className="font-mono text-xs text-sky-850 dark:text-sky-400">{formatBRL(prices.nmsBasico)}</span>
                  )}
                </td>

                {/* NMS Crítico Tariff Cell */}
                <td className="py-1.5 px-2 text-center">
                  {isEditingPrices ? (
                    <input
                      type="number"
                      step="0.01"
                      value={tempPrices.nmsCritico}
                      onChange={(e) => handlePriceChange('nmsCritico', e.target.value)}
                      className="w-[80px] bg-white dark:bg-zinc-950 text-center text-xs p-1 rounded border border-brand/55 font-mono shadow-inner text-zinc-800 dark:text-white"
                    />
                  ) : (
                    <span className="font-mono text-xs text-sky-850 dark:text-sky-400">{formatBRL(prices.nmsCritico)}</span>
                  )}
                </td>

                {/* Blank Val NMS column */}
                <td className="py-1.5 px-3 bg-zinc-50/50 dark:bg-zinc-900/10 text-center text-zinc-300 font-mono text-xs">-</td>

                {/* Gravação básica Tariff Cell */}
                <td className="py-1.5 px-2 text-center border-l border-zinc-200 dark:border-zinc-850">
                  {isEditingPrices ? (
                    <input
                      type="number"
                      step="0.01"
                      value={tempPrices.gravacaoBasica}
                      onChange={(e) => handlePriceChange('gravacaoBasica', e.target.value)}
                      className="w-[80px] bg-white dark:bg-zinc-950 text-center text-xs p-1 rounded border border-brand/55 font-mono shadow-inner text-zinc-800 dark:text-white"
                    />
                  ) : (
                    <span className="font-mono text-xs text-emerald-850 dark:text-emerald-400">{formatBRL(prices.gravacaoBasica)}</span>
                  )}
                </td>

                {/* Gravação crítica Tariff Cell */}
                <td className="py-1.5 px-2 text-center">
                  {isEditingPrices ? (
                    <input
                      type="number"
                      step="0.01"
                      value={tempPrices.gravacaoCritica}
                      onChange={(e) => handlePriceChange('gravacaoCritica', e.target.value)}
                      className="w-[80px] bg-white dark:bg-zinc-950 text-center text-xs p-1 rounded border border-brand/55 font-mono shadow-inner text-zinc-800 dark:text-white"
                    />
                  ) : (
                    <span className="font-mono text-xs text-emerald-850 dark:text-emerald-400">{formatBRL(prices.gravacaoCritica)}</span>
                  )}
                </td>

                {/* Blank Val Gravação column */}
                <td className="py-1.5 px-3 bg-zinc-50/50 dark:bg-zinc-900/10 text-center text-zinc-300 font-mono text-xs">-</td>

                {/* URA Básico Tariff Cell */}
                <td className="py-1.5 px-2 text-center border-l border-zinc-200 dark:border-zinc-850">
                  {isEditingPrices ? (
                    <input
                      type="number"
                      step="0.01"
                      value={tempPrices.uraBasica}
                      onChange={(e) => handlePriceChange('uraBasica', e.target.value)}
                      className="w-[80px] bg-white dark:bg-zinc-950 text-center text-xs p-1 rounded border border-brand/55 font-mono shadow-inner text-zinc-800 dark:text-white"
                    />
                  ) : (
                    <span className="font-mono text-xs text-indigo-850 dark:text-indigo-405">{formatBRL(prices.uraBasica)}</span>
                  )}
                </td>

                {/* URA Crítico Tariff Cell */}
                <td className="py-1.5 px-2 text-center">
                  {isEditingPrices ? (
                    <input
                      type="number"
                      step="0.01"
                      value={tempPrices.uraCritica}
                      onChange={(e) => handlePriceChange('uraCritica', e.target.value)}
                      className="w-[80px] bg-white dark:bg-zinc-950 text-center text-xs p-1 rounded border border-brand/55 font-mono shadow-inner text-zinc-800 dark:text-white"
                    />
                  ) : (
                    <span className="font-mono text-xs text-indigo-850 dark:text-indigo-405">{formatBRL(prices.uraCritica)}</span>
                  )}
                </td>

                {/* Blank Val URA column */}
                <td className="py-1.5 px-3 bg-zinc-50/50 dark:bg-zinc-900/10 text-center text-zinc-300 font-mono text-xs">-</td>

                {/* Blank Monthly Total Tariff cell */}
                <td className="py-1.5 px-4 text-center border-l border-brand/20 bg-brand/5">-</td>

                {/* Save/Edit Pricing Buttons */}
                <td className="py-1.5 px-4 text-center">
                  {isEditingPrices ? (
                    <div className="flex items-center justify-center gap-1.5 animate-slide-in">
                      <button
                        onClick={handleSavePrices}
                        className="p-1 px-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold rounded flex items-center gap-0.5 shadow-xs cursor-pointer"
                        title="Salvar Novas Tarifas"
                      >
                        <Check className="h-3 w-3" />
                        <span>Salvar</span>
                      </button>
                      <button
                        onClick={handleCancelPrices}
                        className="p-1 px-1.5 bg-zinc-400 hover:bg-zinc-500 text-white text-[10px] font-bold rounded shadow-xs cursor-pointer"
                        title="Cancelar"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : canModify ? (
                    <button
                      onClick={() => setIsEditingPrices(true)}
                      className="inline-flex items-center gap-1 mx-auto text-[10px] px-2 py-1 bg-white hover:bg-sky-50 dark:bg-zinc-800 border border-sky-300 dark:border-zinc-700 text-sky-700 dark:text-sky-400 font-bold rounded-lg shadow-2xs transition-all pointer cursor-pointer"
                    >
                      <Settings className="h-3 w-3" />
                      <span>Alterar Tarifas</span>
                    </button>
                  ) : (
                    <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-bold uppercase font-mono tracking-wider flex items-center justify-center gap-1 select-none">
                      <ShieldCheck className="h-3 w-3 text-brand-medium" />
                      Leitura
                    </span>
                  )}
                </td>
              </tr>

              {/* ================= STANDARD ACTIVE CONTRACT ROWS ================= */}
              {isLoading ? (
                <tr>
                  <td colSpan={14} className="text-center p-14 text-zinc-450 italic">
                    <p className="flex justify-center mb-1.5"><RotateCcw className="h-6 w-6 text-brand animate-spin" /></p>
                    Sincronizando com o banco de dados...
                  </td>
                </tr>
              ) : isZeroMonthSelected ? (
                <tr>
                  <td colSpan={14} className="text-center p-14 text-zinc-450 dark:text-zinc-500 italic">
                    <p className="flex justify-center mb-2"><AlertCircle className="h-7 w-7 text-amber-500" /></p>
                    Em conformidade regulamentar, faturamentos para {referenceMonth} estão fixados em R$ 0,00.
                  </td>
                </tr>
              ) : filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={14} className="text-center p-14 text-zinc-450 dark:text-zinc-650 italic">
                    <p className="flex justify-center mb-2"><AlertCircle className="h-8 w-8 text-zinc-350" /></p>
                    {['Julho/2026', 'Agosto/2026', 'Setembro/2026', 'Outubro/2026', 'Novembro/2026', 'Dezembro/2026'].includes(referenceMonth) ? (
                      <div>
                        <p className="font-bold text-zinc-600 dark:text-zinc-350 not-italic text-sm">Nenhum dado cadastrado para este mês futuro.</p>
                        <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-1">Utilize o botão <strong className="text-emerald-600 dark:text-emerald-400 font-extrabold font-sans">"Replicar Mês"</strong> no topo para importar a tabela faturamento de outro mês de referência.</p>
                      </div>
                    ) : (
                      "Nenhum contrato de Contact Center encontrado com os filtros selecionados."
                    )}
                  </td>
                </tr>
              ) : (
                filteredRecords.map((r) => {
                  const valNmsCount = getRecordNmsValue(r, prices);
                  const valGravCount = getRecordGravacaoValue(r, prices);
                  const valUraCount = getRecordUraValue(r, prices);
                  const valTotalCount = getRecordTotalValue(r, prices);
                  const isSelected = selectedRowId === r.id;

                  // Comparison with previous month
                  const prevRecord = findMatchingCcPrevRecord(r);
                  const changedCcKeys: string[] = [];
                  let isCcStatusChanged = false;
                  let isCcValTotalChanged = false;

                  if (prevRecord) {
                    const fields = ['nmsBasico', 'nmsCritico', 'gravacaoBasica', 'gravacaoCritica', 'uraBasica', 'uraCritica'];
                    fields.forEach(f => {
                      if (Number(r[f as keyof ContactCenterOS] || 0) !== Number(prevRecord[f as keyof ContactCenterOS] || 0)) {
                        changedCcKeys.push(f);
                      }
                    });
                    if (r.status !== prevRecord.status) {
                      isCcStatusChanged = true;
                    }
                    if (Math.abs(valTotalCount - getRecordTotalValue(prevRecord, prices)) > 0.01) {
                      isCcValTotalChanged = true;
                    }
                  }

                  const isCcRowEdited = changedCcKeys.length > 0 || isCcStatusChanged || isCcValTotalChanged;
                  const prevMonthAbbr = previousMonthStr ? previousMonthStr.split('/')[0] : 'ant.';

                  return (
                    <tr 
                      key={r.id} 
                      onClick={() => setSelectedRowId(isSelected ? null : r.id)}
                      className={`transition-colors cursor-pointer select-none border-l-4 ${
                        isSelected 
                          ? 'bg-amber-100/40 dark:bg-amber-950/35 border-l-amber-500 border-r-4 border-r-amber-400' 
                          : isCcRowEdited 
                          ? 'bg-amber-50/70 hover:bg-amber-100/90 dark:bg-amber-950/20 dark:hover:bg-amber-900/40 border-l-amber-500' 
                          : 'odd:bg-[#fcfdfe] hover:bg-[#eaf5f8] dark:odd:bg-transparent dark:hover:bg-zinc-850/40 border-l-transparent'
                      }`}
                    >
                      {/* Contrato */}
                      <td className="py-2.5 px-4 font-bold text-zinc-950 dark:text-zinc-100 font-mono text-xs">
                        <div className="flex flex-col">
                          <span>{r.contrato}</span>
                          {isCcRowEdited && (
                            <span className="text-[8px] bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 font-bold px-1 rounded max-w-fit mt-0.5">
                              Alt.
                            </span>
                          )}
                        </div>
                      </td>
                      
                      {/* Secretaria */}
                      <td 
                        className="py-2.5 px-4 text-zinc-900 dark:text-zinc-350 font-bold text-xs max-w-[210px] truncate"
                        title={r.secretaria}
                      >
                        {r.secretaria}
                      </td>

                      {/* Status Badges */}
                      <td className="py-2.5 px-4 text-center">
                        <div className="flex flex-col items-center justify-center">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${
                            r.status === 'Ativo' 
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200/50'
                              : r.status === 'Suspenso'
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-200/50'
                              : r.status === 'Cancelado'
                              ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-450 border border-rose-200/50'
                              : 'bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-400 border border-sky-200/50'
                          }`}>
                            {r.status}
                          </span>
                          {isCcStatusChanged && prevRecord && (
                            <span className="text-[8px] text-amber-600 dark:text-amber-400 font-bold mt-0.5">
                              ({prevMonthAbbr}: {prevRecord.status})
                            </span>
                          )}
                        </div>
                      </td>

                      {/* NMS Básico */}
                      <td className={`py-2 px-2 text-center font-mono text-xs border-l border-zinc-200/75 dark:border-zinc-800/80 ${changedCcKeys.includes('nmsBasico') ? 'bg-amber-100/40 dark:bg-amber-905/10 font-black border border-amber-300/40 text-amber-900 dark:text-amber-200' : 'text-zinc-700 dark:text-zinc-400 bg-sky-500/2'}`}>
                        <div className="flex flex-col items-center justify-center">
                          <span>{r.nmsBasico === 0 ? <span className="text-zinc-300 dark:text-zinc-700">-</span> : r.nmsBasico}</span>
                          {changedCcKeys.includes('nmsBasico') && prevRecord && (
                            <span className="text-[8px] text-amber-600 dark:text-amber-400 font-bold">
                              ({prevRecord.nmsBasico})
                            </span>
                          )}
                        </div>
                      </td>

                      {/* NMS Crítico */}
                      <td className={`py-2 px-2 text-center font-mono text-xs ${changedCcKeys.includes('nmsCritico') ? 'bg-amber-100/40 dark:bg-amber-905/10 font-black border border-amber-300/40 text-amber-900 dark:text-amber-200' : 'text-zinc-700 dark:text-zinc-400 bg-sky-500/2'}`}>
                        <div className="flex flex-col items-center justify-center">
                          <span>{r.nmsCritico === 0 ? <span className="text-zinc-300 dark:text-zinc-700">-</span> : r.nmsCritico}</span>
                          {changedCcKeys.includes('nmsCritico') && prevRecord && (
                            <span className="text-[8px] text-amber-600 dark:text-amber-400 font-bold">
                              ({prevRecord.nmsCritico})
                            </span>
                          )}
                        </div>
                      </td>

                      {/* VALOR NMS */}
                      <td className="py-2 px-3 text-right font-mono text-xs font-semibold text-sky-700 dark:text-sky-450 bg-sky-550/5">
                        {valNmsCount === 0 ? <span className="text-zinc-300 dark:text-zinc-700">-</span> : formatBRL(valNmsCount)}
                      </td>

                      {/* Gravação Básico */}
                      <td className={`py-2 px-2 text-center font-mono text-xs border-l border-zinc-200/75 dark:border-zinc-800/80 ${changedCcKeys.includes('gravacaoBasica') ? 'bg-amber-100/40 dark:bg-amber-905/10 font-black border border-amber-300/40 text-amber-900 dark:text-amber-200' : 'text-zinc-700 dark:text-zinc-400 bg-emerald-500/2'}`}>
                        <div className="flex flex-col items-center justify-center">
                          <span>{r.gravacaoBasica === 0 ? <span className="text-zinc-300 dark:text-zinc-700">-</span> : r.gravacaoBasica}</span>
                          {changedCcKeys.includes('gravacaoBasica') && prevRecord && (
                            <span className="text-[8px] text-amber-600 dark:text-amber-400 font-bold">
                              ({prevRecord.gravacaoBasica})
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Gravação Crítico */}
                      <td className={`py-2 px-2 text-center font-mono text-xs ${changedCcKeys.includes('gravacaoCritica') ? 'bg-amber-100/40 dark:bg-amber-905/10 font-black border border-amber-300/40 text-amber-900 dark:text-amber-200' : 'text-zinc-700 dark:text-zinc-400 bg-emerald-500/2'}`}>
                        <div className="flex flex-col items-center justify-center">
                          <span>{r.gravacaoCritica === 0 ? <span className="text-zinc-300 dark:text-zinc-700">-</span> : r.gravacaoCritica}</span>
                          {changedCcKeys.includes('gravacaoCritica') && prevRecord && (
                            <span className="text-[8px] text-amber-600 dark:text-amber-400 font-bold">
                              ({prevRecord.gravacaoCritica})
                            </span>
                          )}
                        </div>
                      </td>

                      {/* VALOR GRAVAÇÃO */}
                      <td className="py-2 px-3 text-right font-mono text-xs font-semibold text-emerald-700 dark:text-emerald-450 bg-emerald-550/5">
                        {valGravCount === 0 ? <span className="text-zinc-300 dark:text-zinc-700">-</span> : formatBRL(valGravCount)}
                      </td>

                      {/* URA Básico */}
                      <td className={`py-2 px-2 text-center font-mono text-xs border-l border-zinc-200/75 dark:border-zinc-800/80 ${changedCcKeys.includes('uraBasica') ? 'bg-amber-100/40 dark:bg-amber-905/10 font-black border border-amber-300/40 text-amber-900 dark:text-amber-200' : 'text-zinc-700 dark:text-zinc-400 bg-indigo-500/2'}`}>
                        <div className="flex flex-col items-center justify-center">
                          <span>{r.uraBasica === 0 ? <span className="text-zinc-300 dark:text-zinc-700">-</span> : r.uraBasica}</span>
                          {changedCcKeys.includes('uraBasica') && prevRecord && (
                            <span className="text-[8px] text-amber-600 dark:text-amber-400 font-bold">
                              ({prevRecord.uraBasica})
                            </span>
                          )}
                        </div>
                      </td>

                      {/* URA Crítico */}
                      <td className={`py-2 px-2 text-center font-mono text-xs ${changedCcKeys.includes('uraCritica') ? 'bg-amber-100/40 dark:bg-amber-905/10 font-black border border-amber-300/40 text-amber-900 dark:text-amber-200' : 'text-zinc-700 dark:text-zinc-400 bg-indigo-500/2'}`}>
                        <div className="flex flex-col items-center justify-center">
                          <span>{r.uraCritica === 0 ? <span className="text-zinc-300 dark:text-zinc-700">-</span> : r.uraCritica}</span>
                          {changedCcKeys.includes('uraCritica') && prevRecord && (
                            <span className="text-[8px] text-amber-600 dark:text-amber-400 font-bold">
                              ({prevRecord.uraCritica})
                            </span>
                          )}
                        </div>
                      </td>

                      {/* VALOR URA */}
                      <td className="py-2 px-3 text-right font-mono text-xs font-semibold text-indigo-700 dark:text-indigo-450 bg-indigo-550/5">
                        {valUraCount === 0 ? <span className="text-zinc-300 dark:text-zinc-700">-</span> : formatBRL(valUraCount)}
                      </td>

                      {/* VALOR MENSAL TOTAL */}
                      <td className={`py-2.5 px-4 font-mono font-black text-right text-xs bg-emerald-50/10 dark:bg-emerald-900/10 border-l border-brand/20 pr-5 ${isCcValTotalChanged ? 'text-amber-600 dark:text-amber-450 bg-amber-500/5' : 'text-emerald-600 dark:text-emerald-400'}`}>
                        <div className="flex flex-col items-end justify-center">
                          <span>{formatBRL(valTotalCount)}</span>
                          {isCcValTotalChanged && prevRecord && (
                            <span className="text-[8px] text-zinc-550 dark:text-zinc-400 font-bold mt-0.5">
                              ({formatBRL(getRecordTotalValue(prevRecord, prices))})
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-2 px-4 text-center">
                        {canModify ? (
                          <div className="flex items-center justify-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => handleOpenEditModal(r)}
                              title="Editar O.S."
                              className="p-1 cursor-pointer hover:bg-zinc-150 dark:hover:bg-zinc-800 rounded-lg text-emerald-600 transition-colors"
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => setRecordToDelete(r)}
                              title="Deletar Contrato"
                              className="p-1 cursor-pointer hover:bg-zinc-150 dark:hover:bg-zinc-800 rounded-lg text-rose-500 transition-colors"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setSelectedRowId(isSelected ? null : r.id)}
                            title="Visualizar Detalhes"
                            className="p-1 mx-auto text-zinc-400 hover:text-brand-medium rounded-lg transition-colors cursor-pointer flex items-center justify-center"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}

              {/* ================= FOOTER ROW 1: SOMA DAS QUANTIDADES ================= */}
              {!isZeroMonthSelected && filteredRecords.length > 0 && (
                <tr className="bg-zinc-50 dark:bg-zinc-950 font-bold text-zinc-800 dark:text-zinc-300 border-t-2 border-zinc-300 dark:border-zinc-800">
                  <td className="py-2 px-4 text-xs font-black uppercase tracking-wider font-sans">
                    SOMA DAS QUANTIDADES
                  </td>
                  <td className="py-2 px-4 italic text-[11px] text-zinc-400">Totais Unitários</td>
                  <td className="py-2 px-4"></td>

                  {/* NMS quant sums */}
                  <td className="py-2 px-2 text-center font-mono text-xs">{footerCalculations.sumNmsBasico}</td>
                  <td className="py-2 px-2 text-center font-mono text-xs">{footerCalculations.sumNmsCritico}</td>
                  <td className="py-2 px-3 bg-zinc-100/50 dark:bg-zinc-900/40"></td>

                  {/* Gravação quant sums */}
                  <td className="py-2 px-2 text-center font-mono text-xs">{footerCalculations.sumGravacaoBasica}</td>
                  <td className="py-2 px-2 text-center font-mono text-xs">{footerCalculations.sumGravacaoCritica}</td>
                  <td className="py-2 px-3 bg-zinc-100/50 dark:bg-zinc-900/40"></td>

                  {/* URA quant sums */}
                  <td className="py-2 px-2 text-center font-mono text-xs">{footerCalculations.sumUraBasica}</td>
                  <td className="py-2 px-2 text-center font-mono text-xs">{footerCalculations.sumUraCritica}</td>
                  <td className="py-2 px-3 bg-zinc-100/50 dark:bg-zinc-900/40"></td>

                  <td className="py-2 px-4 font-mono font-black text-right text-xs pr-5 bg-[#edfcf9] dark:bg-zinc-900 border-l border-brand/20">
                    {footerCalculations.sumNmsBasico + footerCalculations.sumNmsCritico + footerCalculations.sumGravacaoBasica + footerCalculations.sumGravacaoCritica + footerCalculations.sumUraBasica + footerCalculations.sumUraCritica} ITENS
                  </td>
                  <td className="py-2 px-4"></td>
                </tr>
              )}

              {/* ================= FOOTER ROW 2: SUBTOTAL FINANCEIRO ================= */}
              {!isZeroMonthSelected && filteredRecords.length > 0 && (
                <tr className="bg-sky-50 dark:bg-sky-950/20 font-black text-sky-850 dark:text-sky-350 border-t border-sky-100 dark:border-sky-900">
                  <td className="py-2.5 px-4 text-xs font-black uppercase tracking-wider font-sans">
                    SUBTOTAL FINANCEIRO
                  </td>
                  <td className="py-2.5 px-4 italic text-[11px] text-zinc-500">Calculado Aut.</td>
                  <td className="py-2.5 px-4"></td>

                  {/* NMS cost subtotal */}
                  <td className="py-2 px-2 text-center font-mono text-[10px] text-zinc-400">{formatBRL(footerCalculations.valNmsBasico).replace('R$', '').trim()}</td>
                  <td className="py-2 px-2 text-center font-mono text-[10px] text-zinc-400">{formatBRL(footerCalculations.valNmsCritico).replace('R$', '').trim()}</td>
                  <td className="py-2 px-3 text-right font-mono text-xs bg-sky-500/10">{formatBRL(footerCalculations.valTotalNms)}</td>

                  {/* Gravação cost subtotal */}
                  <td className="py-2 px-2 text-center font-mono text-[10px] text-zinc-400">{formatBRL(footerCalculations.valGravacaoBasica).replace('R$', '').trim()}</td>
                  <td className="py-2 px-2 text-center font-mono text-[10px] text-zinc-400">{formatBRL(footerCalculations.valGravacaoCritica).replace('R$', '').trim()}</td>
                  <td className="py-2 px-3 text-right font-mono text-xs bg-emerald-500/10 text-emerald-800 dark:text-emerald-450">{formatBRL(footerCalculations.valTotalGravacao)}</td>

                  {/* URA cost subtotal */}
                  <td className="py-2 px-2 text-center font-mono text-[10px] text-zinc-400">{formatBRL(footerCalculations.valUraBasica).replace('R$', '').trim()}</td>
                  <td className="py-2 px-2 text-center font-mono text-[10px] text-zinc-400">{formatBRL(footerCalculations.valUraCritica).replace('R$', '').trim()}</td>
                  <td className="py-2 px-3 text-right font-mono text-xs bg-indigo-500/10 text-indigo-800 dark:text-indigo-400">{formatBRL(footerCalculations.valTotalUra)}</td>

                  <td className="py-2.5 px-4 font-mono font-black text-right text-xs pr-5 bg-brand text-white dark:bg-emerald-950 dark:text-emerald-400 border-l border-brand/20">
                    {formatBRL(footerCalculations.grandMonthlyTotal)}
                  </td>
                  <td className="py-2.5 px-4"></td>
                </tr>
              )}

            </tbody>
          </table>
        </div>
      </div>

      {/* RATING INFORMATION ACCORDION CARD */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-5 rounded-3xl space-y-3 shadow-xs">
        <div className="flex items-center gap-2 text-brand">
          <HelpCircle className="h-5 w-5" />
          <h4 className="text-xs font-bold text-zinc-900 dark:text-white uppercase tracking-wider font-mono">Regras de Faturamento e Licenças</h4>
        </div>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed font-sans">
          Em conformidade com a regulamentação do projeto estadual <span className="text-zinc-900 dark:text-white font-bold">PECONECTADO II</span>, o faturamento do Contact Center é apurado segundo as seguintes métricas de serviços:
        </p>
        <ul className="grid grid-cols-1 md:grid-cols-3 gap-4 text-[11px] text-zinc-650 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-950 p-4 rounded-2xl border border-zinc-200/50 dark:border-zinc-850/60 font-medium">
          <li className="space-y-1">
            <span className="font-bold text-zinc-800 dark:text-zinc-200 uppercase tracking-wide block">📞 Canais (NMS)</span>
            Atendimento unificado básico ou de alta criticidade. <br />
            - Básico: <strong>R$ 440,86</strong> / canal <br />
            - Crítico: <strong>R$ 460,97</strong> / canal
          </li>
          <li className="space-y-1">
            <span className="font-bold text-zinc-800 dark:text-zinc-200 uppercase tracking-wide block">🎙️ Gravação Digital</span>
            Gravações para históricos de chamadas. <br />
            - Básico: <strong>R$ 71,84</strong> / licença <br />
            - Crítico: <strong>R$ 78,64</strong> / licença
          </li>
          <li className="space-y-1">
            <span className="font-bold text-zinc-800 dark:text-zinc-200 uppercase tracking-wide block">🤖 Unidade de Resposta (URA)</span>
            Filas interativas com menus de navegação inteligentes pré-gravadas. <br />
            - Básico: <strong>R$ 282,06</strong> / porta <br />
            - Crítico: <strong>R$ 303,01</strong> / porta
          </li>
        </ul>
      </div>

      {/* ================= CRUD FORM MODAL (ADD / EDIT) ================= */}
      {showFormModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/60 backdrop-blur-xs animate-fade-in">
          <div className="w-full max-w-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-850 rounded-4xl shadow-2xl p-6 md:p-8 space-y-6 animate-scale-in">
            
            <div className="flex items-center justify-between pb-3.5 border-b border-zinc-150 dark:border-zinc-800">
              <div className="flex items-center gap-2 text-brand">
                <Headset className="h-5.5 w-5.5" />
                <h3 className="font-black text-sm text-zinc-950 dark:text-white uppercase tracking-wider font-mono">
                  {editingRecord ? 'Editar Contrato Contact Center' : 'Lançar Novo Contrato de Contact Center'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowFormModal(false)}
                className="p-1 cursor-pointer text-zinc-400 hover:text-zinc-650 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveRecord} className="space-y-5">
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Contrato Key */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 font-mono block">Identificação Contrato / Nº (6 dígitos)</label>
                  <input
                    type="text"
                    required
                    maxLength={6}
                    placeholder="Ex: 123456"
                    value={formContrato}
                    onChange={(e) => setFormContrato(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-250 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs font-bold text-zinc-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-brand font-mono"
                  />
                </div>

                {/* Secretaria Nome */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 font-mono block">Secretaria / Órgão</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Secretaria de Saúde (SES)"
                    value={formSecretaria}
                    onChange={(e) => setFormSecretaria(e.target.value)}
                    className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-250 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs font-bold text-zinc-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-brand"
                  />
                </div>

                {/* Status Selector */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 font-mono block">Status Atual</label>
                  <div className="relative">
                    <select
                      value={formStatus}
                      onChange={(e) => setFormStatus(e.target.value as any)}
                      className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-250 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs font-bold text-zinc-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-brand appearance-none cursor-pointer pr-10"
                    >
                      <option value="Ativo">🟢 Ativo</option>
                      <option value="Suspenso">🟡 Suspenso</option>
                      <option value="Cancelado">🔴 Cancelado</option>
                      <option value="Pendente">🔵 Pendente</option>
                    </select>
                    <ChevronDown className="absolute right-3.5 top-3 h-4 w-4 text-zinc-400 pointer-events-none" />
                  </div>
                </div>

                {/* Month Selector for Form */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 font-mono block">Mês de Referência</label>
                  <div className="relative">
                    <select
                      value={formReferenceMonth}
                      onChange={(e) => setFormReferenceMonth(e.target.value)}
                      className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-250 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs font-bold text-zinc-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-brand appearance-none cursor-pointer pr-10"
                    >
                      {availableMonths.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3.5 top-3 h-4 w-4 text-zinc-400 pointer-events-none" />
                  </div>
                </div>
              </div>

              {/* Quantities Matrix Segment */}
              <div className="space-y-3 bg-zinc-50 dark:bg-zinc-950 p-4 rounded-2.5xl border border-zinc-200/60 dark:border-zinc-850/70">
                <span className="block text-[10px] font-black uppercase text-zinc-400 tracking-wider font-mono">
                  Quantitativos de Canais / Licenças
                </span>
                
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {/* NMS basic */}
                  <div className="space-y-1 text-slate-800 dark:text-slate-300">
                    <label className="text-[9.5px] font-bold text-zinc-400 uppercase font-mono">NMS Básico</label>
                    <input
                      type="number"
                      min="0"
                      value={formNmsBasico}
                      onChange={(e) => setFormNmsBasico(parseInt(e.target.value) || 0)}
                      className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs font-mono font-bold text-zinc-850 dark:text-white"
                    />
                  </div>

                  {/* NMS crítico */}
                  <div className="space-y-1">
                    <label className="text-[9.5px] font-bold text-zinc-400 uppercase font-mono">NMS Crítico</label>
                    <input
                      type="number"
                      min="0"
                      value={formNmsCritico}
                      onChange={(e) => setFormNmsCritico(parseInt(e.target.value) || 0)}
                      className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs font-mono font-bold text-zinc-850 dark:text-white"
                    />
                  </div>

                  {/* Gravação básica */}
                  <div className="space-y-1">
                    <label className="text-[9.5px] font-bold text-zinc-400 uppercase font-mono">Gravação Básica</label>
                    <input
                      type="number"
                      min="0"
                      value={formGravacaoBasica}
                      onChange={(e) => setFormGravacaoBasica(parseInt(e.target.value) || 0)}
                      className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs font-mono font-bold text-zinc-850 dark:text-white"
                    />
                  </div>

                  {/* Gravação crítica */}
                  <div className="space-y-1">
                    <label className="text-[9.5px] font-bold text-zinc-400 uppercase font-mono">Gravação Crítica</label>
                    <input
                      type="number"
                      min="0"
                      value={formGravacaoCritica}
                      onChange={(e) => setFormGravacaoCritica(parseInt(e.target.value) || 0)}
                      className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs font-mono font-bold text-zinc-850 dark:text-white"
                    />
                  </div>

                  {/* URA básica */}
                  <div className="space-y-1">
                    <label className="text-[9.5px] font-bold text-zinc-400 uppercase font-mono">URA Básica</label>
                    <input
                      type="number"
                      min="0"
                      value={formUraBasica}
                      onChange={(e) => setFormUraBasica(parseInt(e.target.value) || 0)}
                      className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs font-mono font-bold text-zinc-850 dark:text-white"
                    />
                  </div>

                  {/* URA crítica */}
                  <div className="space-y-1">
                    <label className="text-[9.5px] font-bold text-zinc-400 uppercase font-mono">URA Crítica</label>
                    <input
                      type="number"
                      min="0"
                      value={formUraCritica}
                      onChange={(e) => setFormUraCritica(parseInt(e.target.value) || 0)}
                      className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs font-mono font-bold text-zinc-850 dark:text-white"
                    />
                  </div>
                </div>
              </div>

              {/* Data & Observacoes */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <div className="md:col-span-1 space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 font-mono block">Data de Assinatura</label>
                  <input
                    type="date"
                    required
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-250 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs font-bold text-zinc-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-brand"
                  />
                </div>
                <div className="md:col-span-2 space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 font-mono block">Observações do Contrato</label>
                  <input
                    type="text"
                    placeholder="Notas fiscais, links, identificador extra de auditoria..."
                    value={formObservacoes}
                    onChange={(e) => setFormObservacoes(e.target.value)}
                    className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-250 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs font-bold text-zinc-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-brand"
                  />
                </div>
              </div>

              {/* Footer buttons row */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-150 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowFormModal(false)}
                  className="px-5 py-2.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-250 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-xl text-xs font-bold hover:text-zinc-950 transition-all font-sans cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-brand hover:bg-brand-medium text-white rounded-xl text-xs font-extrabold shadow-md hover:shadow-lg transition-all font-sans cursor-pointer uppercase tracking-wider"
                >
                  {editingRecord ? 'Salvar Alterações' : 'Registrar Contrato'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* ====================== REPLICATE MONTH MODAL ============================= */}
      {showReplicateModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto font-sans">
          <div className="bg-white dark:bg-zinc-900 rounded-3xl shadow-xl border border-zinc-100 dark:border-zinc-855 w-full max-w-lg transform scale-100 transition-transform">
            <div className="p-5 border-b border-zinc-100 dark:border-zinc-800 flex justify-between items-center bg-zinc-50/50 dark:bg-zinc-850/20 rounded-t-3xl">
              <div>
                <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5 bg-transparent">
                  <Layers className="h-5 w-5 text-emerald-600" />
                  Replicar Dados Mensais - Contact Center
                </h3>
                <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">
                  Replique todas as O.S., canais de atendimento e serviços de um mês para o outro.
                </p>
              </div>
              <button 
                onClick={() => setShowReplicateModal(false)}
                className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-600 rounded-full transition-colors"
                type="button"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-left">
              <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-900/30 p-3 rounded-xl flex items-start gap-2.5">
                <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <span className="text-[11px] text-amber-805 dark:text-amber-350 leading-relaxed font-semibold">
                  Atenção: A replicação irá copiar todos os contratos ativos, quantidades de canais (NMS, Gravação e URA) e observações do mês de origem para o mês de destino, sobrescrevendo quaisquer faturamentos ou personalizações já existentes no mês de destino de Contact Center.
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

      {/* ================= PURGE CONFIRM MODAL (DELETE) ================= */}
      {recordToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/60 backdrop-blur-xs animate-fade-in">
          <div className="w-full max-w-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-850 rounded-3xl p-6 space-y-5 animate-scale-in shadow-2xl">
            <div className="flex items-center gap-3 text-rose-500">
              <AlertCircle className="h-6 w-6 shrink-0" />
              <h3 className="text-base font-black uppercase tracking-wide font-mono">Confirmar Exclusão de Contrato</h3>
            </div>
            
            <p className="text-xs text-zinc-500 dark:text-zinc-450 leading-relaxed">
              Você tem certeza que deseja realmente excluir permanentemente o contrato <strong className="text-zinc-900 dark:text-white font-mono">{recordToDelete.contrato}</strong> ({recordToDelete.secretaria})? Essa ação é de caráter irreversível e removerá todos os faturamentos vinculados do portal.
            </p>

            <div className="flex items-center justify-end gap-3 pt-3">
              <button
                type="button"
                onClick={() => setRecordToDelete(null)}
                className="px-4 py-2 hover:bg-zinc-105 dark:hover:bg-zinc-800 border border-zinc-250 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-xl text-xs font-bold font-sans cursor-pointer"
              >
                Cancelar Exclusão
              </button>
              <button
                type="button"
                onClick={handleDeleteRecord}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all font-sans cursor-pointer"
              >
                SIM, EXCLUIR DEFINITIVAMENTE
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
