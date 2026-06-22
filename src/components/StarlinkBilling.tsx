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
  X, 
  Edit2, 
  CheckCircle2, 
  Info,
  Wrench,
  Wifi,
  FileSpreadsheet
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, doc, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore';

interface StarlinkOS {
  id: string;
  referenceMonth: string;
  date: string;
  protocol: string;
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
    location: 'Escola Municipal Solidária (Inajá)',
    description: 'Ativação do canal LEO do PECONECTADO II com fixação metálica em telhado',
    solution: 'Interior',
    billingValue: CONSTANTS.COST_INTERIOR
  }
];

export default function StarlinkBilling() {
  const [referenceMonth, setReferenceMonth] = useState('Junho/2026');
  const isZeroMonthSelected = referenceMonth === 'Janeiro/2026' || referenceMonth === 'Fevereiro/2026';
  const [records, setRecords] = useState<StarlinkOS[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Form Controls
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form Fields
  const [formDate, setFormDate] = useState(() => {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  });
  const [formProtocol, setFormProtocol] = useState('');
  const [formLocation, setFormLocation] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formSolution, setFormSolution] = useState<'Interior' | 'Noronha' | 'Ativação PCM'>('Interior');
  const [formReferenceMonth, setFormReferenceMonth] = useState('Junho/2026');
  const [formBillingValue, setFormBillingValue] = useState<number>(1760.00);

  // Sync form defaults with page-level referenceMonth
  useEffect(() => {
    if (!editingId) {
      setFormReferenceMonth(referenceMonth);
    }
  }, [referenceMonth, editingId]);

  // Sync form default pricing when solution changes (unless in edit mode with a loaded value)
  useEffect(() => {
    if (!editingId) {
      if (formSolution === 'Interior') setFormBillingValue(1760.00);
      else if (formSolution === 'Noronha') setFormBillingValue(1820.00);
      else if (formSolution === 'Ativação PCM') setFormBillingValue(3500.00);
    }
  }, [formSolution, editingId]);

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
        // Seed the preseeded mock entries to Firestore if there is nothing in it yet
        try {
          for (const item of PRESEEDED_STARLINK_RECORDS) {
            await setDoc(doc(db, 'starlinkRecords', item.id), item);
          }
          localStorage.setItem('starlink_seeded_v1', 'true');
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
    if (sol === 'Interior') return CONSTANTS.COST_INTERIOR;
    if (sol === 'Noronha') return CONSTANTS.COST_NORONHA;
    return CONSTANTS.COST_NOVO_PCM;
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

    // Prevenir protocolo duplicado
    const isDuplicate = records.some(r => r.id !== editingId && r.protocol.trim() === formProtocol.trim());
    if (isDuplicate) {
      showToast("Já existe uma ordem de serviço cadastrada com este Protocolo.", "error");
      return;
    }

    const value = Number(formBillingValue) || 0;

    if (editingId) {
      // Editing Mode
      const updatedRecord: StarlinkOS = {
        id: editingId,
        referenceMonth: formReferenceMonth,
        date: formDate,
        protocol: formProtocol,
        location: formLocation,
        description: formDescription,
        solution: formSolution,
        billingValue: value
      };
      setIsLoading(true);
      setDoc(doc(db, 'starlinkRecords', editingId), updatedRecord)
        .then(() => {
          showToast("Ordem de serviço atualizada com sucesso!");
          setEditingId(null);
          resetForm();
        })
        .catch((error) => {
          handleFirestoreError(error, OperationType.WRITE, `starlinkRecords/${editingId}`);
          showToast("Erro ao atualizar no banco de dados.", "error");
        })
        .finally(() => {
          setIsLoading(false);
        });
    } else {
      // Creation Mode
      const newId = `stk-${Date.now()}`;
      const newOS: StarlinkOS = {
        id: newId,
        referenceMonth: formReferenceMonth,
        date: formDate,
        protocol: formProtocol,
        location: formLocation,
        description: formDescription,
        solution: formSolution,
        billingValue: value
      };
      setIsLoading(true);
      setDoc(doc(db, 'starlinkRecords', newId), newOS)
        .then(() => {
          showToast("Nova ordem de serviço cadastrada com sucesso!");
          resetForm();
        })
        .catch((error) => {
          handleFirestoreError(error, OperationType.WRITE, `starlinkRecords/${newId}`);
          showToast("Erro ao cadastrar no banco de dados.", "error");
        })
        .finally(() => {
          setIsLoading(false);
        });
    }
  };

  const resetForm = () => {
    setFormProtocol('');
    setFormLocation('');
    setFormDescription('');
    setFormSolution('Interior');
    setFormReferenceMonth(referenceMonth);
    setFormBillingValue(1760.00);
    setShowForm(false);
    setEditingId(null);
  };

  const startEdit = (os: StarlinkOS) => {
    setEditingId(os.id);
    setFormDate(os.date);
    setFormProtocol(os.protocol);
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
        ['Starlink Interior', stats.countInterior, formatBRL(CONSTANTS.COST_INTERIOR), formatBRL(stats.costInterior)],
        ['Starlink Noronha', stats.countNoronha, formatBRL(CONSTANTS.COST_NORONHA), formatBRL(stats.costNoronha)],
        ['Novas Ativações PCM', stats.countPCM, formatBRL(CONSTANTS.COST_NOVO_PCM), formatBRL(stats.costPCM)],
        ['FATURAMENTO TOTAL ACUMULADO', '', '', formatBRL(stats.grandTotal)]
      ];

      const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
      wsSummary['!cols'] = [{ wch: 32 }, { wch: 15 }, { wch: 15 }, { wch: 15 }];
      XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumo do Mês');

      if (activeRecords.length > 0) {
        const rows = activeRecords.map(r => ({
          'DATA': r.date ? new Date(r.date + 'T00:00:00').toLocaleDateString('pt-BR') : '',
          'PROTOCOLO': r.protocol,
          'LOCAL': r.location,
          'DESCRIÇÃO DO SERVIÇO': r.description,
          'SOLUÇÃO': r.solution,
          'FATURAMENTO': formatBRL(r.billingValue)
        }));
        const wsDetail = XLSX.utils.json_to_sheet(rows);
        wsDetail['!cols'] = [{ wch: 12 }, { wch: 15 }, { wch: 30 }, { wch: 45 }, { wch: 20 }, { wch: 15 }];
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
      doc.text("Data", 17, y);
      doc.text("Protocolo", 35, y);
      doc.text("Local", 52, y);
      doc.text("Solução", 95, y);
      doc.text("Faturamento", 135, y);
      doc.text("Descrição do Serviço", 163, y);

      doc.line(15, y + 2, 195, y + 2);
      y += 6;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(17, 24, 39);

      if (activeRecords.length === 0) {
        doc.text("Nenhuma ordem de serviço cadastrada neste mês.", 17, y);
      } else {
        activeRecords.forEach(r => {
          if (y > 270) {
            doc.addPage();
            y = 20;

            doc.setFont("helvetica", "bold");
            doc.setFontSize(8);
            doc.setTextColor(75, 85, 99);
            doc.text("Data", 17, y);
            doc.text("Protocolo", 35, y);
            doc.text("Local", 52, y);
            doc.text("Soluço", 95, y);
            doc.text("Faturamento", 135, y);
            doc.text("Descrição do Serviço", 163, y);
            doc.line(15, y + 2, 195, y + 2);
            y += 6;
          }

          const localFormatted = r.location.length > 20 ? r.location.substring(0, 18) + '..' : r.location;
          const descFormatted = r.description.length > 18 ? r.description.substring(0, 16) + '..' : r.description;

          doc.setFont("helvetica", "bold");
          const ptDate = r.date ? new Date(r.date + 'T00:00:00').toLocaleDateString('pt-BR') : '-';
          doc.text(ptDate, 17, y);
          doc.text(r.protocol, 35, y);
          doc.setFont("helvetica", "normal");
          doc.text(localFormatted, 52, y);
          doc.text(r.solution, 95, y);
          doc.setFont("helvetica", "bold");
          doc.text(formatBRL(r.billingValue), 135, y);
          doc.setFont("helvetica", "normal");
          doc.text(descFormatted, 163, y);

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

      {/* Title Header Card */}
      <div className="relative overflow-hidden rounded-3.5xl border border-zinc-200/80 dark:border-zinc-800/80 bg-white dark:bg-zinc-900 p-6 md:p-8 shadow-xs">
        <div className="absolute right-0 top-0 -mr-16 -mt-16 w-48 h-48 rounded-full bg-cyan-500/5 dark:bg-cyan-500/10 blur-3xl pointer-events-none" />
        <div className="absolute left-1/3 bottom-0 w-64 h-64 rounded-full bg-indigo-500/5 blur-3xl pointer-events-none" />
        
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-cyan-500/10 text-cyan-600 dark:bg-zinc-800 dark:text-cyan-405">
              <Satellite className="h-3 w-3 animate-spin text-cyan-600" />
              Implantação Starlink
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-zinc-900 dark:text-white font-sans flex items-center gap-2">
              Implantação Starlink - Um Telecom
            </h1>
            <p className="text-zinc-500 dark:text-zinc-400 text-sm max-w-2xl leading-relaxed">
              Implantação de Starlink destinadas ao atendimento de escolas do projeto PECONECTADO II.
            </p>
          </div>
          
          {/* Month Selector and Action Buttons */}
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

            <div className="flex flex-row sm:flex-col gap-2 shrink-0">
              <button
                onClick={exportToExcel}
                className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-605 hover:bg-emerald-700 bg-emerald-600 text-white rounded-2xl text-[11px] font-black uppercase tracking-wider transition-all shadow-xs cursor-pointer active:scale-95 duration-150"
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

      {/* Statistics Cards - Very similar to Um Telecom dashboard */}
      <h2 className="text-xs font-black uppercase tracking-widest text-zinc-400 font-mono pl-1">
        Demonstrativo Starlink do Mês ({referenceMonth})
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Starlink Interior */}
        <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200/85 dark:border-zinc-800/85 p-5 space-y-3 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-cyan-600 dark:text-cyan-400 bg-cyan-500/10 dark:bg-cyan-500/20 px-2 py-0.5 rounded-md font-mono">
              VALOR: R$ 1.760,00
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
              VALOR: R$ 1.820,00
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
              VALOR: R$ 3.500,00
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

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
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
                <label className="block text-[11px] font-black uppercase text-zinc-400 tracking-wider mb-1.5 font-mono">
                  PROTOCOLO / Nº OS (7 DÍGITOS)
                </label>
                <input
                  type="text"
                  maxLength={7}
                  placeholder="Ex: 1234567"
                  value={formProtocol}
                  onChange={(e) => setFormProtocol(e.target.value.replace(/\D/g, '').slice(0, 7))}
                  required
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
                    <option value="Interior">Starlink Interior (R$ 1.760,00)</option>
                    <option value="Noronha">Starlink Noronha (R$ 1.820,00)</option>
                    <option value="Ativação PCM">Ativação PCM (R$ 3.500,00)</option>
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
                className="px-5 py-2 bg-cyan-650 hover:bg-cyan-700 bg-cyan-600 text-white rounded-xl text-xs font-black uppercase tracking-wider cursor-pointer"
              >
                {editingId ? 'Salvar Alterações' : 'Cadastrar OS'}
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
                  <td colSpan={7} className="py-8 text-center text-xs text-zinc-400 font-sans">
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
                      {item.protocol}
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
              Starlink no projeto PECONECTADO II são acompanhadas na tabela acima. O valor de implantação para o Interior de Pernambuco é fixado em R$ 1.760,00, no Arquipélago de Fernando de Noronha é fixado em R$ 1.820,00, e com abertura de nova ativação física PCM são calculados em R$ 3.500,00.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
