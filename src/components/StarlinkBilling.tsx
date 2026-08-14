import React, { useState, useEffect, useMemo } from 'react';
import { 
  Globe, 
  Sparkles, 
  Satellite, 
  TrendingUp, 
  MapPin, 
  Radio, 
  AlertTriangle, 
  Plus, 
  Trash2, 
  Calendar, 
  FileText, 
  DollarSign, 
  Layers, 
  ChevronDown, 
  ChevronLeft,
  ChevronRight,
  X, 
  Edit2, 
  CheckCircle2, 
  Info,
  Wrench,
  Wifi,
  FileSpreadsheet,
  Sliders,
  ShieldAlert
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import { db, handleFirestoreError, OperationType, cleanUndefined, onSnapshot, getDoc, setDoc, deleteDoc, writeBatch } from '../firebase';
import { collection, doc } from 'firebase/firestore';
import { UserSession } from '../types';
import { useCurrentMonthFilter, getCurrentMonth, getAvailableMonths, PORTUGUESE_MONTHS } from '../utils/monthUtils';

interface StarlinkOS {
  id: string;
  referenceMonth: string;
  date: string;
  protocol: string;
  relatedOs?: string;
  sdm?: string;
  location: string;
  description: string;
  solution: 'Interior' | 'Noronha' | 'Ativação PCM';
  billingValue: number;
}

const CONSTANTS = {
  COST_INTERIOR: 1760.00,
  COST_NORONHA: 1820.00,
  COST_NOVO_PCM: 3500.00
};

const PRESEEDED_STARLINK_RECORDS: StarlinkOS[] = [
  {
    id: 'stk-preseed-1',
    referenceMonth: 'Junho/2026',
    date: '2026-06-02',
    protocol: '1205521',
    sdm: 'SDM-551020',
    location: 'Escola Padre Sertão (Cabrobó)',
    description: 'Ativação e alinhamento de antena de satélite mais homologação física',
    solution: 'Interior',
    billingValue: CONSTANTS.COST_INTERIOR
  },
  {
    id: 'stk-preseed-2',
    referenceMonth: 'Junho/2026',
    date: '2026-06-03',
    protocol: '1209014',
    sdm: 'SDM-551021',
    location: 'Unidade de Atendimento Noronha (Vila dos Remédios)',
    description: 'Recalibração do feedhorn de foco e ajuste lógico com satélite ativo',
    solution: 'Noronha',
    billingValue: CONSTANTS.COST_NORONHA
  },
  {
    id: 'stk-preseed-3',
    referenceMonth: 'Junho/2026',
    date: '2026-06-05',
    protocol: '1201139',
    sdm: 'SDM-551022',
    location: 'Escola Central Petrolina (Distrito Rural)',
    description: 'Infraestrutura extra do PCM e lançamento de ativação de modem redundante',
    solution: 'Ativação PCM',
    billingValue: CONSTANTS.COST_NOVO_PCM
  },
  {
    id: 'stk-preseed-4',
    referenceMonth: 'Junho/2026',
    date: '2026-06-12',
    protocol: '1203011',
    sdm: 'SDM-551023',
    location: 'Escola Municipal Solidária (Inajá)',
    description: 'Ativação do canal LEO do PECONECTADO II com fixação metálica em telhado',
    solution: 'Interior',
    billingValue: CONSTANTS.COST_INTERIOR
  }
];

export default function StarlinkBilling({ user }: { user?: UserSession | null }) {
  if (!user || (user.role !== 'admin' && user.role !== 'editor' && user.role !== 'viewer' && !user.allowedScreens?.includes('starlink'))) {
    return (
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-8 text-center space-y-4 max-w-md mx-auto my-12 shadow-xs">
        <div className="w-12 h-12 rounded-2xl bg-rose-500/10 text-rose-500 flex items-center justify-center mx-auto">
          <ShieldAlert className="h-6 w-6" />
        </div>
        <div className="space-y-1.5">
          <h3 className="text-lg font-black text-zinc-900 dark:text-white font-sans tracking-tight">Acesso Não Autorizado</h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 font-sans font-medium leading-relaxed">
            Seu perfil de usuário ({user?.role || 'convidado'}) não possui permissão para visualizar estas faturas e relatórios confidenciais de telecomunicações corporativas.
          </p>
        </div>
      </div>
    );
  }

  const [referenceMonth, setReferenceMonth] = useCurrentMonthFilter();
  const isZeroMonthSelected = referenceMonth === 'Janeiro/2026' || referenceMonth === 'Fevereiro/2026';
  const [records, setRecords] = useState<StarlinkOS[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Dynamic pricing state for Starlink
  const [starlinkPrices, setStarlinkPrices] = useState({
    costInterior: 1760.00,
    costNoronha: 1820.00,
    costNovoPCM: 3500.00
  });

  // Tariff adjustment configuration form states
  const [showConfig, setShowConfig] = useState(false);
  const [configCostInterior, setConfigCostInterior] = useState(1760.00);
  const [configCostNoronha, setConfigCostNoronha] = useState(1820.00);
  const [configCostNovoPCM, setConfigCostNovoPCM] = useState(3500.00);

  // Sync Starlink prices in real-time from Firestore systemPrices collection
  useEffect(() => {
    const unsubscribePrices = onSnapshot(doc(db, 'systemPrices', 'starlink'), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setStarlinkPrices({
          costInterior: Number(data.costInterior) || 1760.00,
          costNoronha: Number(data.costNoronha) || 1820.00,
          costNovoPCM: Number(data.costNovoPCM) || 3500.00
        });
      }
    });
    return () => unsubscribePrices();
  }, []);

  // Update configuration form states when settings panel opens or active price updates
  useEffect(() => {
    if (showConfig) {
      setConfigCostInterior(starlinkPrices.costInterior);
      setConfigCostNoronha(starlinkPrices.costNoronha);
      setConfigCostNovoPCM(starlinkPrices.costNovoPCM);
    }
  }, [showConfig, starlinkPrices]);

  // Form Controls
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submittingId, setSubmittingId] = useState<string | null>(null);

  // Form Fields
  const [formDate, setFormDate] = useState(() => {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  });
  const [formProtocol, setFormProtocol] = useState('');
  const [formRelatedOs, setFormRelatedOs] = useState('');
  const [formLocation, setFormLocation] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formSolution, setFormSolution] = useState<'Interior' | 'Noronha' | 'Ativação PCM'>('Interior');
  const [formReferenceMonth, setFormReferenceMonth] = useState(getCurrentMonth);
  const [formBillingValue, setFormBillingValue] = useState<number>(1760.00);

  // Sync form defaults with page-level referenceMonth
  useEffect(() => {
    if (!editingId) {
      setFormReferenceMonth(referenceMonth);
    }
  }, [referenceMonth, editingId]);

  // Derive real-time duplicate warning for protocol number validation within the target month
  const duplicateWarning = useMemo(() => {
    const cleanInput = formProtocol.trim();
    if (!cleanInput) return null;
    const normalized = cleanInput.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    const found = records.find(
      (r) => r.id !== editingId && 
             r.id !== submittingId &&
             r.referenceMonth === formReferenceMonth &&
             (r.protocol || '').trim().replace(/[^a-zA-Z0-9]/g, '').toLowerCase() === normalized
    );
    if (found) {
      return `Protocolo ${found.protocol} já cadastrado no mês ${found.referenceMonth} (${found.location}).`;
    }
    return null;
  }, [formProtocol, formReferenceMonth, records, editingId, submittingId]);

  // Count protocol occurrences per reference month for warning badges in tables
  const protocolCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    records.forEach((r) => {
      const protoKey = (r.protocol || '').trim().replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      if (protoKey) {
        const fullKey = `${r.referenceMonth}_${protoKey}`;
        counts[fullKey] = (counts[fullKey] || 0) + 1;
      }
    });
    return counts;
  }, [records]);

  // Sync form default pricing when solution changes (unless in edit mode with a loaded value)
  useEffect(() => {
    if (!editingId) {
      if (formSolution === 'Interior') setFormBillingValue(starlinkPrices.costInterior);
      else if (formSolution === 'Noronha') setFormBillingValue(starlinkPrices.costNoronha);
      else if (formSolution === 'Ativação PCM') setFormBillingValue(starlinkPrices.costNovoPCM);
    }
  }, [formSolution, starlinkPrices, editingId]);

  // Toast Notification
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'info' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Load initially or from Firestore
  useEffect(() => {
    setIsLoading(true);
    const collectionRef = collection(db, 'starlinkRecords');
    const unsubscribe = onSnapshot(collectionRef, async (snapshot) => {
      const dbRecords: StarlinkOS[] = [];
      snapshot.forEach((docSnap) => {
        dbRecords.push({ id: docSnap.id, ...docSnap.data() } as StarlinkOS);
      });

      if (snapshot.empty) {
        if (snapshot.metadata?.fromCache) {
          // Ignore if empty snapshot from local cache to prevent default overwrites during connection phase
          return;
        }

        if (localStorage.getItem('starlink_seeded_v1') === 'true') {
          console.log("Database cleared of Starlink records by preference, skipping automatic seeding.");
          setRecords([]);
          setIsLoading(false);
          return;
        }

        let isAlreadySeededDB = false;
        try {
          const seedMetaDoc = await getDoc(doc(db, 'test', 'seeding_metadata'));
          if (seedMetaDoc.exists() && seedMetaDoc.data()?.starlink === true) {
            isAlreadySeededDB = true;
          }
        } catch (smErr) {
          console.warn("Could not retrieve remote seeding metadata for Starlink:", smErr);
        }

        if (isAlreadySeededDB) {
          console.log("Database cleared of Starlink records by preference, skipping automatic seeding.");
          setRecords([]);
          setIsLoading(false);
          localStorage.setItem('starlink_seeded_v1', 'true');
          return;
        }
        // Seed the preseeded mock entries to Firestore if there is nothing in it yet
        try {
          localStorage.setItem('starlink_seeded_v1', 'true');
          const batch = writeBatch(db);
          PRESEEDED_STARLINK_RECORDS.forEach((item) => {
            batch.set(doc(db, 'starlinkRecords', item.id), item);
          });
          
          // Save seeding indication to DB as well
          const seedMetaRef = doc(db, 'test', 'seeding_metadata');
          batch.set(seedMetaRef, { starlink: true }, { merge: true });

          await batch.commit();
        } catch (error) {
          console.error("Error seeding Starlink records to Firestore:", error);
        }
      } else {
        localStorage.setItem('starlink_seeded_v1', 'true');
        setRecords(dbRecords);
        localStorage.setItem('starlink_records', JSON.stringify(dbRecords));
      }
      setIsLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'starlinkRecords');
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Months lists
  const availableMonths = getAvailableMonths();

  const handlePrevMonth = () => {
    const idx = availableMonths.indexOf(referenceMonth);
    if (idx > 0) {
      setReferenceMonth(availableMonths[idx - 1]);
    }
  };

  const handleNextMonth = () => {
    const idx = availableMonths.indexOf(referenceMonth);
    if (idx < availableMonths.length - 1) {
      setReferenceMonth(availableMonths[idx + 1]);
    }
  };

  // Active records for currently selected month
  const activeRecords = useMemo(() => {
    if (isZeroMonthSelected) return [];
    return records
      .filter(r => r.referenceMonth === referenceMonth)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [records, referenceMonth, isZeroMonthSelected]);

  // Statistics and Calculations
  const stats = useMemo(() => {
    if (isZeroMonthSelected) {
      return {
        countInterior: 0,
        costInterior: 0,
        countNoronha: 0,
        costNoronha: 0,
        countPCM: 0,
        costPCM: 0,
        grandTotal: 0,
        totalCount: 0
      };
    }
    let countInterior = 0;
    let costInterior = 0;
    let countNoronha = 0;
    let costNoronha = 0;
    let countPCM = 0;
    let costPCM = 0;

    activeRecords.forEach(r => {
      if (r.solution === 'Interior') {
        countInterior++;
        costInterior += r.billingValue;
      } else if (r.solution === 'Noronha') {
        countNoronha++;
        costNoronha += r.billingValue;
      } else if (r.solution === 'Ativação PCM') {
        countPCM++;
        costPCM += r.billingValue;
      }
    });

    const grandTotal = costInterior + costNoronha + costPCM;

    return {
      countInterior,
      costInterior,
      countNoronha,
      costNoronha,
      countPCM,
      costPCM,
      grandTotal,
      totalCount: activeRecords.length
    };
  }, [activeRecords, isZeroMonthSelected]);

  // Pricing helper
  const getPricing = (sol: 'Interior' | 'Noronha' | 'Ativação PCM') => {
    if (sol === 'Interior') return starlinkPrices.costInterior;
    if (sol === 'Noronha') return starlinkPrices.costNoronha;
    return starlinkPrices.costNovoPCM;
  };

  // Form Submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formProtocol.trim()) {
      showToast("Número do Protocolo é obrigatório.", "error");
      return;
    }
    if (!/^\d{7}$/.test(formProtocol.trim())) {
      showToast("O Protocolo deve conter exatamente 7 dígitos numéricos.", "error");
      return;
    }
    if (!formLocation.trim()) {
      showToast("LOCAL é obrigatório.", "error");
      return;
    }
    if (!formDescription.trim()) {
      showToast("A descrição do serviço é obrigatória.", "error");
      return;
    }

    // Prevenir protocolo duplicado no mesmo mês de referência
    const normalizedNew = formProtocol.trim().replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    const duplicateRecord = records.find(
      r => r.id !== editingId && 
           r.id !== submittingId &&
           r.referenceMonth === formReferenceMonth && 
           (r.protocol || '').trim().replace(/[^a-zA-Z0-9]/g, '').toLowerCase() === normalizedNew
    );
    if (duplicateRecord) {
      showToast(
        `Impossível cadastrar: Protocolo ${formProtocol.trim()} já existe no mês ${formReferenceMonth} (${duplicateRecord.location}).`,
        "error"
      );
      return;
    }

    const value = Number(formBillingValue) || 0;

    if (editingId) {
      // Editing Mode
      setSubmittingId(editingId);
      const updatedRecord: StarlinkOS = {
        id: editingId,
        referenceMonth: formReferenceMonth,
        date: formDate,
        protocol: formProtocol,
        relatedOs: formRelatedOs,
        location: formLocation,
        description: formDescription,
        solution: formSolution,
        billingValue: value
      };
      setIsLoading(true);
      setDoc(doc(db, 'starlinkRecords', editingId), cleanUndefined(updatedRecord))
        .then(() => {
          showToast("Ordem de serviço atualizada com sucesso!");
          const targetMonth = formReferenceMonth || referenceMonth;
          if (targetMonth !== referenceMonth) {
            setReferenceMonth(targetMonth);
          }
          setEditingId(null);
          resetForm(targetMonth);
        })
        .catch((error) => {
          handleFirestoreError(error, OperationType.WRITE, `starlinkRecords/${editingId}`);
          showToast("Erro ao atualizar no banco de dados.", "error");
        })
        .finally(() => {
          setIsLoading(false);
          setSubmittingId(null);
        });
    } else {
      // Creation Mode
      const newId = `stk-${Date.now()}`;
      setSubmittingId(newId);
      const newOS: StarlinkOS = {
        id: newId,
        referenceMonth: formReferenceMonth,
        date: formDate,
        protocol: formProtocol,
        relatedOs: formRelatedOs,
        location: formLocation,
        description: formDescription,
        solution: formSolution,
        billingValue: value
      };
      setIsLoading(true);
      setDoc(doc(db, 'starlinkRecords', newId), cleanUndefined(newOS))
        .then(() => {
          showToast("Nova ordem de serviço cadastrada com sucesso!");
          const targetMonth = formReferenceMonth || referenceMonth;
          if (targetMonth !== referenceMonth) {
            setReferenceMonth(targetMonth);
          }
          resetForm(targetMonth);
        })
        .catch((error) => {
          handleFirestoreError(error, OperationType.WRITE, `starlinkRecords/${newId}`);
          showToast("Erro ao cadastrar no banco de dados.", "error");
        })
        .finally(() => {
          setIsLoading(false);
          setSubmittingId(null);
        });
    }
  };

  const resetForm = (overrideMonth?: string) => {
    const activeRefMonth = overrideMonth || referenceMonth;
    setFormProtocol('');
    setFormRelatedOs('');
    setFormLocation('');
    setFormDescription('');
    setFormSolution('Interior');
    setFormReferenceMonth(activeRefMonth);
    setFormBillingValue(starlinkPrices.costInterior);
    setShowForm(false);
    setEditingId(null);
    setSubmittingId(null);
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await setDoc(doc(db, 'systemPrices', 'starlink'), {
        costInterior: Number(configCostInterior),
        costNoronha: Number(configCostNoronha),
        costNovoPCM: Number(configCostNovoPCM),
        updatedAt: new Date().toISOString()
      }, { merge: true });
      showToast("Configurações da Starlink salvas com sucesso!", "success");
      setShowConfig(false);
    } catch (err) {
      console.error("Erro ao salvar config Starlink:", err);
      showToast("Falha ao salvar as configurações.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const startEdit = (os: StarlinkOS) => {
    setEditingId(os.id);
    setFormDate(os.date);
    setFormProtocol(os.protocol);
    setFormRelatedOs(os.relatedOs || '');
    setFormLocation(os.location);
    setFormDescription(os.description);
    setFormSolution(os.solution);
    setFormReferenceMonth(os.referenceMonth);
    setFormBillingValue(os.billingValue);
    setShowForm(true);

    // Scroll smoothly to form section
    setTimeout(() => {
      document.getElementById('starlink-os-form')?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const [osToDelete, setOsToDelete] = useState<string | null>(null);

  const handleDelete = (id: string) => {
    setOsToDelete(id);
  };

  const confirmDelete = () => {
    if (!osToDelete) return;
    setIsLoading(true);
    deleteDoc(doc(db, 'starlinkRecords', osToDelete))
      .then(() => {
        showToast("Ordem de serviço removida.");
        setOsToDelete(null);
      })
      .catch((error) => {
        handleFirestoreError(error, OperationType.DELETE, `starlinkRecords/${osToDelete}`);
        showToast("Erro ao remover do banco de dados.", "error");
      })
      .finally(() => {
        setIsLoading(false);
      });
  };

  const formatBRL = (val: number) => {
    return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  // Excel Export Handler
  const exportToExcel = () => {
    try {
      const wb = XLSX.utils.book_new();

      const summaryData = [
        ['DEMONSTRATIVO DE FATURAMENTO - IMPLANTAÇÃO STARLINK'],
        ['Mês de Referência:', referenceMonth],
        ['Data de Emissão:', new Date().toLocaleDateString('pt-BR')],
        [''],
        ['RESUMO DO PERÍODO'],
        ['Categoria', 'Quantidade', 'Valor Unitário', 'Valor Total'],
        ['Starlink Interior', stats.countInterior, formatBRL(starlinkPrices.costInterior), formatBRL(stats.costInterior)],
        ['Starlink Noronha', stats.countNoronha, formatBRL(starlinkPrices.costNoronha), formatBRL(stats.costNoronha)],
        ['Novas Ativações PCM', stats.countPCM, formatBRL(starlinkPrices.costNovoPCM), formatBRL(stats.costPCM)],
        ['FATURAMENTO TOTAL ACUMULADO', '', '', formatBRL(stats.grandTotal)]
      ];

      const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
      wsSummary['!cols'] = [{ wch: 32 }, { wch: 15 }, { wch: 15 }, { wch: 15 }];
      XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumo do Mês');

      if (activeRecords.length > 0) {
        const rows = activeRecords.map(r => ({
          'DATA': r.date ? new Date(r.date + 'T00:00:00').toLocaleDateString('pt-BR') : '',
          'PROTOCOLO': r.protocol,
          'O.S RELACIONADA': r.relatedOs || '',
          'LOCAL': r.location,
          'DESCRIÇÃO DO SERVIÇO': r.description,
          'SOLUÇÃO': r.solution,
          'FATURAMENTO': formatBRL(r.billingValue)
        }));
        const wsDetail = XLSX.utils.json_to_sheet(rows);
        wsDetail['!cols'] = [{ wch: 12 }, { wch: 15 }, { wch: 20 }, { wch: 30 }, { wch: 45 }, { wch: 20 }, { wch: 15 }];
        XLSX.utils.book_append_sheet(wb, wsDetail, 'Ordem de Serviços Detalhado');
      }

      XLSX.writeFile(wb, `Faturamento_Starlink_${referenceMonth.replace('/', '_')}.xlsx`);
      showToast("Planilha Excel exportada com sucesso!");
    } catch (err) {
      console.error(err);
      showToast("Erro ao exportar Planilha.", "error");
    }
  };

  // PDF Export Handler
  const exportToPDF = () => {
    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

      // Title header
      doc.setFillColor(24, 24, 27); // zinc-900 / dark color (matching Um Telecom)
      doc.rect(0, 0, 210, 40, 'F');

      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text("OPERAÇÃO PE - IMPLANTAÇÃO STARLINK", 15, 15);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(228, 228, 231); // zinc-200
      doc.text("Relatório Consolidado de Faturamento - Um Telecom", 15, 21);
      doc.text(`Período de Referência: ${referenceMonth}`, 15, 27);

      const emitDate = new Date().toLocaleDateString('pt-BR');
      doc.setFontSize(8);
      doc.setTextColor(161, 161, 170); // zinc-400
      doc.text(`Gerado em: ${emitDate}`, 150, 15);
      doc.text("Empresa: Método Telecom", 150, 21);
      doc.text("Status: Auditado & Fechado", 150, 27);

      let y = 50;

      // Overview Card
      doc.setFillColor(240, 253, 250); // cyan-50
      doc.roundedRect(15, y, 180, 45, 3, 3, 'F');

      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(21, 94, 117); // cyan-800
      doc.text("RESUMO FINANCEIRO DE FECHAMENTO", 20, y + 8);

      doc.setDrawColor(165, 243, 252); // cyan-200
      doc.setLineWidth(0.2);
      doc.line(20, y + 11, 190, y + 11);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      doc.setTextColor(55, 65, 81);

      doc.text(`Starlink Interior (${stats.countInterior} OS):`, 20, y + 18);
      doc.setFont("helvetica", "bold");
      doc.text(formatBRL(stats.costInterior), 150, y + 18);

      doc.setFont("helvetica", "normal");
      doc.text(`Starlink Noronha (${stats.countNoronha} OS):`, 20, y + 24);
      doc.setFont("helvetica", "bold");
      doc.text(formatBRL(stats.costNoronha), 150, y + 24);

      doc.setFont("helvetica", "normal");
      doc.text(`Novas Ativações PCM (${stats.countPCM} OS):`, 20, y + 30);
      doc.setFont("helvetica", "bold");
      doc.text(formatBRL(stats.costPCM), 150, y + 30);

      doc.line(20, y + 34, 190, y + 34);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text("TOTAL GERAL A FATURAR:", 20, y + 40);
      doc.text(formatBRL(stats.grandTotal), 150, y + 40);

      y += 58;

      // Table Title
      doc.setTextColor(17, 24, 39);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text("DETALHAMENTO DE ORDENS DE SERVIÇO", 15, y);
      doc.line(15, y + 2, 195, y + 2);

      y += 8;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(75, 85, 99);
      doc.text("Data", 15, y);
      doc.text("Protocolo", 28, y);
      doc.text("OS Rel.", 43, y);
      doc.text("Local", 58, y);
      doc.text("Solução", 95, y);
      doc.text("Faturamento", 125, y);
      doc.text("Descrição do Serviço", 150, y);

      doc.line(15, y + 2, 195, y + 2);
      y += 6;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(17, 24, 39);

      if (activeRecords.length === 0) {
        doc.text("Nenhuma ordem de serviço cadastrada neste mês.", 15, y);
      } else {
        activeRecords.forEach(r => {
          if (y > 270) {
            doc.addPage();
            y = 20;

            doc.setFont("helvetica", "bold");
            doc.setFontSize(8);
            doc.setTextColor(75, 85, 99);
            doc.text("Data", 15, y);
            doc.text("Protocolo", 28, y);
            doc.text("OS Rel.", 43, y);
            doc.text("Local", 58, y);
            doc.text("Soluço", 95, y);
            doc.text("Faturamento", 125, y);
            doc.text("Descrição do Serviço", 150, y);
            doc.line(15, y + 2, 195, y + 2);
            y += 6;
          }

          const localFormatted = r.location.length > 20 ? r.location.substring(0, 18) + '..' : r.location;
          const descFormatted = r.description.length > 24 ? r.description.substring(0, 22) + '..' : r.description;

          doc.setFont("helvetica", "bold");
          const ptDate = r.date ? new Date(r.date + 'T00:00:00').toLocaleDateString('pt-BR') : '-';
          doc.text(ptDate, 15, y);
          doc.text(r.protocol, 28, y);
          doc.text(r.relatedOs || '-', 43, y);
          doc.setFont("helvetica", "normal");
          doc.text(localFormatted, 58, y);
          doc.text(r.solution, 95, y);
          doc.setFont("helvetica", "bold");
          doc.text(formatBRL(r.billingValue), 125, y);
          doc.setFont("helvetica", "normal");
          doc.text(descFormatted, 150, y);

          y += 6.5;
        });
      }

      doc.save(`Faturamento_Starlink_PE_II_${referenceMonth.replace('/', '_')}.pdf`);
      showToast("Relatório PDF de Starlink gerado!");
    } catch (err) {
      console.error(err);
      showToast("Erro ao exportar PDF.", "error");
    }
  };

  return (
    <div className="space-y-6 animate-fade-in text-zinc-900 dark:text-zinc-100">
      
      {/* Toast Alert Banner */}
      {toast && (
        <div className="fixed top-5 right-5 z-50 flex items-center gap-3 px-4 py-3.5 rounded-2xl shadow-xl border bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 animate-slide-in">
          {toast.type === 'success' && <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />}
          {toast.type === 'info' && <Info className="h-5 w-5 text-blue-500 shrink-0" />}
          {toast.type === 'error' && <AlertTriangle className="h-5 w-5 text-rose-500 shrink-0" />}
          <span className="text-xs font-bold font-sans text-zinc-900 dark:text-zinc-100">{toast.message}</span>
        </div>
      )}

      {/* Custom Confirmation Modal for Deleting */}
      {osToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/60 backdrop-blur-xs animate-fade-in text-sans">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3.5xl max-w-sm w-full p-6 shadow-2xl animate-slide-in">
            <div className="flex items-center gap-3 text-cyan-600 pb-3 border-b border-zinc-150 dark:border-zinc-800">
              <AlertTriangle className="h-5 w-5 text-rose-500" />
              <h3 className="font-sans font-black text-sm text-zinc-900 dark:text-white uppercase tracking-wider">Confirmar Exclusão</h3>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-4 leading-relaxed font-sans">
              Você tem certeza que deseja realmente excluir esta ordem de serviço Starlink? Esta ação é irreversível.
            </p>
            <div className="flex items-center justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={() => setOsToDelete(null)}
                className="px-4 py-2 text-xs font-bold bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-750 text-zinc-655 dark:text-zinc-300 rounded-xl cursor-pointer transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                className="px-5 py-2 text-xs font-black uppercase tracking-wider bg-rose-600 hover:bg-rose-700 text-white rounded-xl cursor-pointer transition-colors shadow-xs"
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header Banner - High contrast dark styling */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 p-6 text-white shadow-xl border border-zinc-800">
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-1.5 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-800/80 border border-zinc-700/80 text-[11px] font-bold text-sky-300 uppercase tracking-wider backdrop-blur-xs">
              <Satellite className="h-3.5 w-3.5 text-sky-400" />
              <span>IMPLANTAÇÃO STARLINK</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white font-sans flex items-center gap-2.5">
              <Satellite className="h-7 w-7 text-sky-400" />
              <span>Implantação Starlink - Um Telecom</span>
            </h1>
            <p className="text-xs sm:text-sm text-zinc-300 font-sans leading-relaxed">
              Implantação de Starlink destinadas ao atendimento de escolas do projeto PECONECTADO II.
            </p>
          </div>

          {/* Month Selector & Export Actions */}
          <div className="flex flex-wrap items-center gap-3 bg-zinc-900/80 p-3 rounded-xl border border-zinc-750/80 backdrop-blur-xs">
            <div className="flex items-center gap-1.5 bg-zinc-950 border border-zinc-700 px-3 py-1.5 rounded-lg text-white">
              <button
                type="button"
                onClick={handlePrevMonth}
                className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white transition-colors cursor-pointer"
                title="Mês Anterior"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>

              <select
                value={referenceMonth}
                onChange={(e) => setReferenceMonth(e.target.value)}
                className="bg-transparent text-xs font-bold tracking-wide focus:outline-hidden cursor-pointer text-white px-2 py-0.5 text-center"
              >
                {availableMonths.map((m) => (
                  <option key={m} value={m} className="bg-zinc-900 text-white">
                    {m}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={handleNextMonth}
                className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white transition-colors cursor-pointer"
                title="Próximo Mês"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <button
              type="button"
              onClick={() => setShowConfig(!showConfig)}
              className="flex items-center gap-2 px-3.5 py-2 bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-850 text-white rounded-lg text-xs font-bold transition-all shadow-md cursor-pointer duration-150 border border-zinc-700"
              title="Ajustar Tarifas Contratuais"
            >
              <Sliders className="h-4 w-4" />
              <span>Ajustar Tarifas</span>
            </button>

            <button
              type="button"
              onClick={exportToExcel}
              className="flex items-center gap-2 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all shadow-md cursor-pointer duration-150"
              title="Exportar dados para Excel (.xlsx)"
            >
              <FileSpreadsheet className="h-4 w-4" />
              <span>Planilha Excel</span>
            </button>

            <button
              type="button"
              onClick={exportToPDF}
              className="flex items-center gap-2 px-3.5 py-2 bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white rounded-lg text-xs font-bold transition-all shadow-md cursor-pointer duration-150"
              title="Exportar demonstrativo em PDF"
            >
              <FileText className="h-4 w-4" />
              <span>Relatório PDF</span>
            </button>
          </div>
        </div>
      </div>

      {/* Dynamic Tariff Config Panel for Starlink */}
      {showConfig && (
        <form onSubmit={handleSaveConfig} className="bg-zinc-50 dark:bg-zinc-950 p-6 rounded-3.5xl border border-zinc-200 dark:border-zinc-800/80 space-y-6 animate-slide-in">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Sliders className="h-5 w-5 text-cyan-600" />
              <div>
                <h3 className="text-sm font-black text-zinc-900 dark:text-zinc-50 uppercase tracking-wider">Ajustar Tarifas & Parâmetros (Starlink)</h3>
                <p className="text-xs text-zinc-400">Edite as tarifas de implantação da Starlink para o projeto PECONECTADO II</p>
              </div>
            </div>
            <button 
              type="button" 
              onClick={() => setShowConfig(false)} 
              className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-xl text-zinc-400 hover:text-zinc-655 transition-colors cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="space-y-1">
              <label className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider font-mono">Custo Starlink Interior (R$)</label>
              <input
                type="number"
                step="0.01"
                value={configCostInterior}
                onChange={(e) => setConfigCostInterior(Number(e.target.value))}
                className="w-full bg-white dark:bg-zinc-900 border border-zinc-250 dark:border-zinc-800 rounded-xl px-3.5 py-2.5 text-xs font-bold text-zinc-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-cyan-500"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider font-mono">Custo Starlink Noronha (R$)</label>
              <input
                type="number"
                step="0.01"
                value={configCostNoronha}
                onChange={(e) => setConfigCostNoronha(Number(e.target.value))}
                className="w-full bg-white dark:bg-zinc-900 border border-zinc-250 dark:border-zinc-800 rounded-xl px-3.5 py-2.5 text-xs font-bold text-zinc-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-cyan-500"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider font-mono">Custo Ativação PCM / Novo PCM (R$)</label>
              <input
                type="number"
                step="0.01"
                value={configCostNovoPCM}
                onChange={(e) => setConfigCostNovoPCM(Number(e.target.value))}
                className="w-full bg-white dark:bg-zinc-900 border border-zinc-250 dark:border-zinc-800 rounded-xl px-3.5 py-2.5 text-xs font-bold text-zinc-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-cyan-500"
              />
            </div>
          </div>

          <div className="flex items-center gap-3 justify-end pt-2 border-t border-zinc-200 dark:border-zinc-850">
            <button
              type="button"
              onClick={() => setShowConfig(false)}
              className="px-4 py-2 rounded-xl text-xs font-bold text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200/50 dark:hover:bg-zinc-900/50 transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-5 py-2 bg-cyan-600 text-white font-bold rounded-xl text-xs flex items-center gap-2 hover:opacity-90 active:scale-95 transition-all cursor-pointer shadow-xs"
            >
              <Sliders className="h-3.5 w-3.5" />
              <span>{isLoading ? 'Salvando...' : 'Salvar Alterações'}</span>
            </button>
          </div>
        </form>
      )}

      {/* Statistics Cards - Very similar to Um Telecom dashboard */}
      <h2 className="text-xs font-black uppercase tracking-widest text-zinc-400 font-mono pl-1">
        Demonstrativo Starlink do Mês ({referenceMonth})
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Starlink Interior */}
        <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200/85 dark:border-zinc-800/85 p-5 space-y-3 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-cyan-600 dark:text-cyan-400 bg-cyan-500/10 dark:bg-cyan-500/20 px-2 py-0.5 rounded-md font-mono">
              VALOR: {formatBRL(starlinkPrices.costInterior)}
            </span>
            <Globe className="h-4 w-4 text-zinc-400" />
          </div>
          <div>
            <span className="block text-[10px] text-zinc-400 font-bold uppercase tracking-wider font-mono">Starlink Interior</span>
            <span className="block text-xl font-black text-zinc-900 dark:text-white mt-0.5">
              {formatBRL(stats.costInterior)}
            </span>
            <span className="text-[11px] font-mono text-zinc-400 mt-1 block">
              {stats.countInterior} ordens ativas
            </span>
          </div>
        </div>

        {/* Card 2: Starlink Noronha */}
        <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200/85 dark:border-zinc-800/85 p-5 space-y-3 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-amber-600 dark:text-amber-450 bg-amber-500/10 dark:bg-amber-550/20 px-2 py-0.5 rounded-md font-mono">
              VALOR: {formatBRL(starlinkPrices.costNoronha)}
            </span>
            <TrendingUp className="h-4 w-4 text-zinc-400" />
          </div>
          <div>
            <span className="block text-[10px] text-zinc-400 font-bold uppercase tracking-wider font-mono">Starlink Noronha</span>
            <span className="block text-xl font-black text-zinc-900 dark:text-white mt-0.5">
              {formatBRL(stats.costNoronha)}
            </span>
            <span className="text-[11px] font-mono text-zinc-400 mt-1 block">
              {stats.countNoronha} ordens ativas
            </span>
          </div>
        </div>

        {/* Card 3: Ativação Nova PCM */}
        <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200/85 dark:border-zinc-800/85 p-5 space-y-3 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-purple-600 dark:text-purple-400 bg-purple-500/10 dark:bg-purple-500/20 px-2 py-0.5 rounded-md font-mono">
              VALOR: {formatBRL(starlinkPrices.costNovoPCM)}
            </span>
            <Wrench className="h-4 w-4 text-zinc-400" />
          </div>
          <div>
            <span className="block text-[10px] text-zinc-400 font-bold uppercase tracking-wider font-mono">Ativações PCM</span>
            <span className="block text-xl font-black text-zinc-900 dark:text-white mt-0.5">
              {formatBRL(stats.costPCM)}
            </span>
            <span className="text-[11px] font-mono text-zinc-400 mt-1 block">
              {stats.countPCM} ativações registradas
            </span>
          </div>
        </div>

        {/* Card 4: Faturamento Total */}
        <div className="bg-cyan-600 dark:bg-cyan-750 text-white rounded-3xl border border-cyan-500 p-5 space-y-3 shadow-lg shadow-cyan-500/15">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 bg-white/20 text-white rounded font-mono">
              FATURAMENTO TOTAL
            </span>
            <DollarSign className="h-4.5 w-4.5 text-white/80 shrink-0" />
          </div>
          <div>
            <span className="block text-[10px] text-white/75 font-bold uppercase tracking-wider font-mono">Total Geral Acumulado</span>
            <span className="block text-2xl font-black text-white leading-tight mt-1">
              {formatBRL(stats.grandTotal)}
            </span>
            <span className="text-[10px] text-white/80 leading-relaxed mt-1 block font-mono">
              Total ({stats.totalCount} atendimentos)
            </span>
          </div>
        </div>
      </div>

      {/* Add New OS Button & Form Section */}
      <div id="starlink-os-form" className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-black text-zinc-850 dark:text-zinc-150 uppercase tracking-wider">
            Painel Operacional
          </h2>
          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 px-4 py-2 bg-cyan-650 hover:bg-cyan-700 bg-cyan-600 text-white rounded-xl text-xs font-bold font-sans transition-all active:scale-95 duration-100 cursor-pointer shadow-xs"
            >
              <Plus className="h-4 w-4" />
              <span>Cadastrar Nova O.S</span>
            </button>
          )}
        </div>

        {showForm && (
          <form 
            onSubmit={handleSubmit}
            className="bg-white dark:bg-zinc-900 rounded-3.5xl border border-zinc-200/80 dark:border-zinc-800/80 p-5 md:p-6 space-y-5 animate-slide-in shadow-md"
          >
            <div className="flex items-center justify-between pb-3 border-b border-zinc-150 dark:border-zinc-800">
              <div className="flex items-center gap-2 text-cyan-600">
                <Satellite className="h-5 w-5" />
                <h3 className="font-bold text-sm text-zinc-900 dark:text-white">
                  {editingId ? 'Editar Ordem de Serviço Starlink' : 'Lançar Nova Ordem de Serviço Starlink'}
                </h3>
              </div>
              <button
                type="button"
                onClick={resetForm}
                className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-655 rounded-lg cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {/* Field 1: DATA */}
              <div>
                <label className="block text-[11px] font-black uppercase text-zinc-400 tracking-wider mb-1.5 font-mono">
                  DATA do Atendimento
                </label>
                <div className="relative">
                  <input
                    type="date"
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    required
                    className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-250 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs font-bold text-zinc-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-cyan-500"
                  />
                </div>
              </div>

              {/* Field 2: PROTOCOLO */}
              <div>
                <label className="block text-[11px] font-black uppercase text-zinc-400 tracking-wider mb-1.5 font-mono flex items-center justify-between">
                  <span>PROTOCOLO / Nº OS (7 DÍGITOS)</span>
                  {duplicateWarning && (
                    <span className="text-rose-500 font-bold text-[9px] uppercase tracking-normal">⚠️ Duplicado</span>
                  )}
                </label>
                <input
                  type="text"
                  maxLength={7}
                  placeholder="Ex: 1234567"
                  value={formProtocol}
                  onChange={(e) => setFormProtocol(e.target.value.replace(/\D/g, '').slice(0, 7))}
                  required
                  className={`w-full bg-zinc-50 dark:bg-zinc-950 border rounded-xl px-3 py-2 text-xs font-bold text-zinc-800 dark:text-white focus:outline-none focus:ring-1 ${
                    duplicateWarning
                      ? 'border-rose-500 text-rose-600 focus:ring-rose-500 bg-rose-50/20 dark:bg-rose-950/20'
                      : 'border-zinc-250 dark:border-zinc-800 focus:ring-cyan-500'
                  }`}
                />
                {duplicateWarning && (
                  <p className="text-[10px] font-bold text-rose-500 mt-1 flex items-start gap-1 leading-tight">
                    <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
                    <span>{duplicateWarning}</span>
                  </p>
                )}
              </div>

              {/* Field 2.2: O.S Relacionada */}
              <div>
                <label className="block text-[11px] font-black uppercase text-zinc-400 tracking-wider mb-1.5 font-mono">
                  O.S Relacionada
                </label>
                <input
                  type="text"
                  placeholder="Ex: OS-1234"
                  value={formRelatedOs}
                  onChange={(e) => setFormRelatedOs(e.target.value)}
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-250 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs font-bold text-zinc-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-cyan-500"
                />
              </div>

              {/* Field 3: LOCAL */}
              <div>
                <label className="block text-[11px] font-black uppercase text-zinc-400 tracking-wider mb-1.5 font-mono">
                  LOCAL (Município / Unidade)
                </label>
                <input
                  type="text"
                  placeholder="Ex: Escola Central (Inajá)"
                  value={formLocation}
                  onChange={(e) => setFormLocation(e.target.value)}
                  required
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-250 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs font-bold text-zinc-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-cyan-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {/* Field 4: SOLUÇÃO / CLASSIFICAÇÃO */}
              <div>
                <label className="block text-[11px] font-black uppercase text-zinc-400 tracking-wider mb-1.5 font-mono">
                  SOLUÇÃO CONTRATUAL
                </label>
                <div className="relative">
                  <select
                    value={formSolution}
                    onChange={(e) => setFormSolution(e.target.value as any)}
                    className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-250 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs font-bold text-zinc-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-cyan-500 appearance-none cursor-pointer pr-10"
                  >
                    <option value="Interior">Starlink Interior ({formatBRL(starlinkPrices.costInterior)})</option>
                    <option value="Noronha">Starlink Noronha ({formatBRL(starlinkPrices.costNoronha)})</option>
                    <option value="Ativação PCM">Ativação PCM ({formatBRL(starlinkPrices.costNovoPCM)})</option>
                  </select>
                  <ChevronDown className="absolute right-3.5 top-3 h-4 w-4 text-zinc-400 pointer-events-none" />
                </div>
              </div>

              {/* Field 4.5: VALOR DE FATURAMENTO */}
              <div>
                <label className="block text-[11px] font-black uppercase text-zinc-400 tracking-wider mb-1.5 font-mono">
                  VALOR DE FATURAMENTO (R$)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Ex: 1760.00"
                  value={formBillingValue}
                  onChange={(e) => setFormBillingValue(parseFloat(e.target.value) || 0)}
                  required
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-250 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs font-bold text-zinc-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-cyan-500"
                />
              </div>

              {/* Field 4.6: MÊS DE REFERÊNCIA */}
              <div>
                <label className="block text-[11px] font-black uppercase text-zinc-400 tracking-wider mb-1.5 font-mono">
                  MÊS DE REFERÊNCIA
                </label>
                <div className="relative">
                  <select
                    value={formReferenceMonth}
                    onChange={(e) => setFormReferenceMonth(e.target.value)}
                    className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-250 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs font-bold text-zinc-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-cyan-500 appearance-none cursor-pointer pr-10"
                  >
                    {availableMonths.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3.5 top-3 h-4 w-4 text-zinc-400 pointer-events-none" />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-5">
              {/* Field 5: DESCRIÇÃO DO SERVIÇO */}
              <div>
                <label className="block text-[11px] font-black uppercase text-zinc-400 tracking-wider mb-1.5 font-mono">
                  DESCRIÇÃO DETALHADA DO SERVIÇO
                </label>
                <input
                  type="text"
                  placeholder="Descreva de forma concisa o que foi feito..."
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  required
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-250 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs font-bold text-zinc-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-cyan-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-750 text-zinc-600 dark:text-zinc-300 rounded-xl text-xs font-bold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={!!duplicateWarning || isLoading}
                className={`px-5 py-2 bg-cyan-650 hover:bg-cyan-700 bg-cyan-600 text-white rounded-xl text-xs font-black uppercase tracking-wider ${
                  duplicateWarning || isLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer active:scale-95'
                }`}
              >
                {isLoading ? 'Salvando...' : editingId ? 'Salvar Alterações' : 'Cadastrar OS'}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Main Table Starlink OS */}
      <div className="bg-white dark:bg-zinc-900 rounded-3.5xl border border-zinc-200/80 dark:border-zinc-800/80 p-6 space-y-4 shadow-xs relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-zinc-150 dark:border-zinc-800 pb-4 gap-2">
          <div className="space-y-1">
            <h3 className="font-bold text-zinc-900 dark:text-white text-sm">
              Implantação e Homologação - Starlink
            </h3>
          </div>
          <span className="text-[10px] font-bold tracking-wider font-mono text-cyan-600 bg-cyan-500/10 px-2 py-0.5 rounded-md self-start sm:self-auto uppercase">
            AMBIENTE ATIVO
          </span>
        </div>

        {/* Live List Table of OS */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-zinc-150 dark:border-zinc-800 text-[10px] font-bold uppercase font-mono text-zinc-400 tracking-wider">
                <th className="py-3 px-2">DATA</th>
                <th className="py-3 px-2">PROTOCOLO</th>
                <th className="py-3 px-2">O.S Relacionada</th>
                <th className="py-3 px-2">LOCAL</th>
                <th className="py-3 px-2">DESCRIÇÃO DO SERVIÇO</th>
                <th className="py-3 px-2">SOLUÇÃO</th>
                <th className="py-3 px-2 text-right">FATURAMENTO</th>
                <th className="py-3 px-2 text-center">AÇÕES</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100/60 dark:divide-zinc-800/50">
              {activeRecords.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-xs text-zinc-400 font-sans">
                    Nenhuma ordem de serviço cadastrada para este mês de referência.
                  </td>
                </tr>
              ) : (
                activeRecords.map(item => (
                  <tr key={item.id} className="text-zinc-600 dark:text-zinc-350 hover:bg-zinc-50/50 dark:hover:bg-zinc-950/20 transition-colors">
                    {/* DATA */}
                    <td className="py-3.5 px-2 text-xs font-semibold text-zinc-800 dark:text-white font-mono">
                      {item.date ? new Date(item.date + 'T00:00:00').toLocaleDateString('pt-BR') : '-'}
                    </td>

                    {/* PROTOCOLO */}
                    <td className="py-3.5 px-2 font-mono text-xs font-bold text-zinc-400">
                      <div className="flex items-center gap-1.5">
                        <span>{item.protocol}</span>
                        {protocolCounts[`${item.referenceMonth}_${(item.protocol || '').trim().replace(/[^a-zA-Z0-9]/g, '').toLowerCase()}`] > 1 && (
                          <span className="inline-flex items-center gap-1 text-[9px] font-bold text-rose-600 dark:text-rose-400 bg-rose-500/10 border border-rose-500/20 px-1.5 py-0.5 rounded-md font-mono" title="Este protocolo aparece mais de uma vez no mesmo mês de referência!">
                            <AlertTriangle className="h-3 w-3 text-rose-500 shrink-0" />
                            <span>DUPLICADO</span>
                          </span>
                        )}
                      </div>
                    </td>

                    {/* O.S Relacionada */}
                    <td className="py-3.5 px-2 font-mono text-xs font-bold text-zinc-400">
                      {item.relatedOs || '-'}
                    </td>

                    {/* LOCAL */}
                    <td className="py-3.5 px-2 text-xs font-bold text-zinc-700 dark:text-zinc-300">
                      {item.location}
                    </td>

                    {/* DESCRIÇÃO DO SERVIÇO */}
                    <td className="py-3.5 px-2 text-xs text-zinc-500 dark:text-zinc-400 max-w-sm break-words">
                      {item.description}
                    </td>

                    {/* SOLUÇÃO */}
                    <td className="py-3.5 px-2 text-xs">
                      <span className={`inline-block text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${
                        item.solution === 'Interior' 
                          ? 'bg-cyan-550/10 text-cyan-600 dark:text-cyan-400 bg-cyan-500/10'
                          : item.solution === 'Noronha'
                            ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                            : 'bg-purple-500/10 text-purple-600 dark:text-purple-400 bg-purple-500/10'
                      }`}>
                        {item.solution}
                      </span>
                    </td>

                    {/* FATURAMENTO */}
                    <td className="py-3.5 px-2 text-xs text-right font-mono font-black text-zinc-800 dark:text-white">
                      {formatBRL(item.billingValue)}
                    </td>

                    {/* AÇÕES */}
                    <td className="py-3.5 px-2 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => startEdit(item)}
                          className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-cyan-500 rounded transition-all cursor-pointer"
                          title="Editar OS"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(item.id)}
                          className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-rose-500 rounded transition-all cursor-pointer"
                          title="Remover OS"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Warning notification about integration status */}
        <div className="mt-4 p-4 rounded-2xl bg-cyan-500/5 border border-cyan-500/10 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-cyan-600 shrink-0 mt-0.5 animate-bounce" />
          <div className="space-y-1">
            <h4 className="text-xs font-bold text-zinc-900 dark:text-white">Regras de Faturamento Starlink - Um Telecom</h4>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed font-sans">
              Starlink no projeto PECONECTADO II são acompanhadas na tabela acima. O valor de implantação para o Interior de Pernambuco é fixado em {formatBRL(starlinkPrices.costInterior)}, no Arquipélago de Fernando de Noronha é fixado em {formatBRL(starlinkPrices.costNoronha)}, e com abertura de nova ativação física PCM são calculados em {formatBRL(starlinkPrices.costNovoPCM)}.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
