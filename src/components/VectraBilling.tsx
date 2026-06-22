import React, { useState, useEffect, useMemo } from 'react';
import { 
  Network, 
  Sparkles, 
  Activity, 
  Zap, 
  ShieldCheck, 
  Clock, 
  Signal, 
  Database, 
  AlertCircle,
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
import { collection, doc, setDoc, deleteDoc, onSnapshot, writeBatch } from 'firebase/firestore';

interface VectraOS {
  id: string;
  referenceMonth: string;
  date: string;
  protocol: string;
  location: string;
  description: string;
  category: 'wifi' | 'utm';
  solution: string;
}

// Programmatic realistic mock generator
const generateMockRecords = (): VectraOS[] => {
  const result: VectraOS[] = [];
  
  // 65 Wifi records (crossing the 63 limit by 2 to demonstrate overage)
  for (let i = 1; i <= 65; i++) {
    const dayNum = (i % 28) + 1;
    const day = String(dayNum).padStart(2, '0');
    result.push({
      id: `preseed-wifi-${i}`,
      referenceMonth: 'Junho/2026',
      date: `2026-06-${day}`,
      protocol: String(1200000 + i),
      location: `Escola Estadual ${['Antônio Farias', 'Guedes Alcoforado', 'Nossa Senhora', 'Cabrobó Centro', 'Sertão Feliz', 'Agrestina Alta'][i % 6]}`,
      description: 'Manutenção técnica de antena de ponto de acesso Wifi e homologação de sinal',
      category: 'wifi',
      solution: 'Substituição de patch cord CAT6 danificado, reset físico do roteador e aferição lógica'
    });
  }

  // 15 UTM records (fully within the 74 limit to show under/in-franchise usage)
  for (let i = 1; i <= 15; i++) {
    const dayNum = (i % 28) + 1;
    const day = String(dayNum).padStart(2, '0');
    result.push({
      id: `preseed-utm-${i}`,
      referenceMonth: 'Junho/2026',
      date: `2026-06-${day}`,
      protocol: String(3400000 + i),
      location: `Gerência Regional ${['Recife Centro', 'Agreste Caruaru', 'Sertão Petrolina', 'Zona da Mata Goiana'][i % 4]}`,
      description: 'Varredura e manutenção corretiva de firewall de segurança de borda UTM',
      category: 'utm',
      solution: 'Revisão das regras NAT, aplicação de patch de segurança contra vulnerabilidades e carga de firmware'
    });
  }

  return result;
};

export default function VectraBilling() {
  const [referenceMonth, setReferenceMonth] = useState('Junho/2026');
  const isZeroMonthSelected = referenceMonth === 'Janeiro/2026' || referenceMonth === 'Fevereiro/2026';
  const [records, setRecords] = useState<VectraOS[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState<'all' | 'wifi' | 'utm'>('all');

  const [vectraPrices, setVectraPrices] = useState({
    limitWifi: 63,
    baseCostWifi: 0.0,
    excedenteWifi: 0.0,
    limitUtm: 74,
    baseCostUtm: 0.0,
    excedenteUtm: 0.0
  });

  const [showConfig, setShowConfig] = useState(false);
  const [configLimitWifi, setConfigLimitWifi] = useState(63);
  const [configBaseCostWifi, setConfigBaseCostWifi] = useState(0.0);
  const [configExcedenteWifi, setConfigExcedenteWifi] = useState(0.0);
  const [configLimitUtm, setConfigLimitUtm] = useState(74);
  const [configBaseCostUtm, setConfigBaseCostUtm] = useState(0.0);
  const [configExcedenteUtm, setConfigExcedenteUtm] = useState(0.0);

  useEffect(() => {
    setConfigLimitWifi(vectraPrices.limitWifi);
    setConfigBaseCostWifi(vectraPrices.baseCostWifi);
    setConfigExcedenteWifi(vectraPrices.excedenteWifi);
    setConfigLimitUtm(vectraPrices.limitUtm);
    setConfigBaseCostUtm(vectraPrices.baseCostUtm);
    setConfigExcedenteUtm(vectraPrices.excedenteUtm);
  }, [vectraPrices]);

  // Load pricing configuration from Firestore or initialize to 0
  useEffect(() => {
    const pricesDocRef = doc(db, 'systemPrices', 'vectra');
    const unsubscribe = onSnapshot(pricesDocRef, async (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setVectraPrices({
          limitWifi: Number(data.limitWifi ?? 63),
          baseCostWifi: Number(data.baseCostWifi ?? 0.0),
          excedenteWifi: Number(data.excedenteWifi ?? 0.0),
          limitUtm: Number(data.limitUtm ?? 74),
          baseCostUtm: Number(data.baseCostUtm ?? 0.0),
          excedenteUtm: Number(data.excedenteUtm ?? 0.0)
        });
      } else {
        const defaultZero = {
          limitWifi: 63,
          baseCostWifi: 0.0,
          excedenteWifi: 0.0,
          limitUtm: 74,
          baseCostUtm: 0.0,
          excedenteUtm: 0.0
        };
        try {
          await setDoc(pricesDocRef, defaultZero);
        } catch (e) {
          console.error("Error setting default zeroed Vectra prices:", e);
        }
        setVectraPrices(defaultZero);
      }
    });

    return () => unsubscribe();
  }, []);

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const pricesDocRef = doc(db, 'systemPrices', 'vectra');
      await setDoc(pricesDocRef, {
        limitWifi: Number(configLimitWifi) || 0,
        baseCostWifi: Number(configBaseCostWifi) || 0,
        excedenteWifi: Number(configExcedenteWifi) || 0,
        limitUtm: Number(configLimitUtm) || 0,
        baseCostUtm: Number(configBaseCostUtm) || 0,
        excedenteUtm: Number(configExcedenteUtm) || 0
      });
      showToast("Configurações do Contrato Vectra atualizadas com sucesso!");
      setShowConfig(false);
    } catch (err) {
      console.error("Error setting Vectra prices:", err);
      showToast("Erro ao salvar configurações do contrato.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  // Form states
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [osToDelete, setOsToDelete] = useState<string | null>(null);

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
  const [formCategory, setFormCategory] = useState<'wifi' | 'utm'>('wifi');
  const [formSolution, setFormSolution] = useState('');
  const [formReferenceMonth, setFormReferenceMonth] = useState('Junho/2026');

  // Sync form default reference month with page-level referenceMonth
  useEffect(() => {
    if (!editingId) {
      setFormReferenceMonth(referenceMonth);
    }
  }, [referenceMonth, editingId]);

  // Toast Notification
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'info' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Load initially or from Firestore
  useEffect(() => {
    setIsLoading(true);
    const collectionRef = collection(db, 'vectraRecords');
    const unsubscribe = onSnapshot(collectionRef, async (snapshot) => {
      const dbRecords: VectraOS[] = [];
      snapshot.forEach((docSnap) => {
        dbRecords.push({ id: docSnap.id, ...docSnap.data() } as VectraOS);
      });

      if (snapshot.empty) {
        if (localStorage.getItem('vectra_seeded_v1') === 'true') {
          console.log("Database cleared of Vectra records by preference, skipping automatic seeding.");
          setRecords([]);
          setIsLoading(false);
          return;
        }
        // Seed the preselected mock entries to Firestore using writeBatch
        try {
          const batch = writeBatch(db);
          const generated = generateMockRecords();
          generated.forEach((item) => {
            const docRef = doc(db, 'vectraRecords', item.id);
            batch.set(docRef, item);
          });
          await batch.commit();
          localStorage.setItem('vectra_seeded_v1', 'true');
        } catch (error) {
          console.error("Error seeding Vectra records to Firestore:", error);
        }
      } else {
        localStorage.setItem('vectra_seeded_v1', 'true');
        setRecords(dbRecords);
        localStorage.setItem('vectra_billing_records', JSON.stringify(dbRecords));
      }
      setIsLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'vectraRecords');
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

  // Active records for currently selected month, sorted chronologically for exact franchise-overage index mapping
  const monthRecords = useMemo(() => {
    if (isZeroMonthSelected) return [];
    return records.filter(r => r.referenceMonth === referenceMonth);
  }, [records, referenceMonth, isZeroMonthSelected]);

  const wifiSorted = useMemo(() => {
    return monthRecords
      .filter(r => r.category === 'wifi')
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [monthRecords]);

  const utmSorted = useMemo(() => {
    return monthRecords
      .filter(r => r.category === 'utm')
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [monthRecords]);

  // Combined records for list output (honoring filter tabs)
  const filteredRecordsToDisplay = useMemo(() => {
    if (activeSubTab === 'wifi') return wifiSorted;
    if (activeSubTab === 'utm') return utmSorted;

    // Concat both sorted lists so the index inside their respective arrays can still be evaluated
    return [...wifiSorted, ...utmSorted].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [wifiSorted, utmSorted, activeSubTab]);

  // Statistics and Calculations
  const stats = useMemo(() => {
    if (isZeroMonthSelected) {
      return {
        wifiCount: 0,
        utmCount: 0,
        excessWifi: 0,
        excessUtm: 0,
        costExcessWifi: 0,
        costExcessUtm: 0,
        totalWifiCost: 0,
        totalUtmCost: 0,
        grandTotal: 0,
        totalExcessCount: 0,
        totalExcessCost: 0,
        totalCount: 0
      };
    }
    const wifiCount = wifiSorted.length;
    const utmCount = utmSorted.length;

    const excessWifi = Math.max(0, wifiCount - vectraPrices.limitWifi);
    const excessUtm = Math.max(0, utmCount - vectraPrices.limitUtm);

    const costExcessWifi = excessWifi * vectraPrices.excedenteWifi;
    const costExcessUtm = excessUtm * vectraPrices.excedenteUtm;

    const totalWifiCost = vectraPrices.baseCostWifi + costExcessWifi;
    const totalUtmCost = vectraPrices.baseCostUtm + costExcessUtm;

    const grandTotal = totalWifiCost + totalUtmCost;

    return {
      wifiCount,
      utmCount,
      excessWifi,
      excessUtm,
      costExcessWifi,
      costExcessUtm,
      totalWifiCost,
      totalUtmCost,
      grandTotal,
      totalExcessCount: excessWifi + excessUtm,
      totalExcessCost: costExcessWifi + costExcessUtm,
      totalCount: wifiCount + utmCount
    };
  }, [wifiSorted, utmSorted, isZeroMonthSelected, vectraPrices]);

  // Form Submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const cleanProtocol = formProtocol.trim();
    if (!cleanProtocol) {
      showToast("Número do Protocolo é obrigatório.", "error");
      return;
    }
    if (!/^\d{7}$/.test(cleanProtocol)) {
      showToast("O protocolo deve conter exatamente 7 dígitos numéricos.", "error");
      return;
    }

    if (!formLocation.trim()) {
      showToast("Localização é obrigatória.", "error");
      return;
    }
    if (!formDescription.trim()) {
      showToast("Descrição do serviço é obrigatória.", "error");
      return;
    }
    if (!formSolution.trim()) {
      showToast("Solução aplicada é obrigatória.", "error");
      return;
    }

    // Prevenir protocolo duplicado
    const isDuplicate = records.some(r => r.id !== editingId && r.protocol.trim() === cleanProtocol);
    if (isDuplicate) {
      showToast("Já existe uma ordem de serviço cadastrada com este Protocolo.", "error");
      return;
    }

    if (editingId) {
      // Editing Mode
      const updatedRecord: VectraOS = {
        id: editingId,
        referenceMonth: formReferenceMonth,
        date: formDate,
        protocol: cleanProtocol,
        location: formLocation,
        description: formDescription,
        category: formCategory,
        solution: formSolution
      };
      setIsLoading(true);
      setDoc(doc(db, 'vectraRecords', editingId), updatedRecord)
        .then(() => {
          showToast("Ordem de serviço atualizada com sucesso!");
          setEditingId(null);
          resetForm();
        })
        .catch((error) => {
          handleFirestoreError(error, OperationType.WRITE, `vectraRecords/${editingId}`);
          showToast("Erro ao atualizar no banco de dados.", "error");
        })
        .finally(() => {
          setIsLoading(false);
        });
    } else {
      // Creation Mode
      const newId = `vec-${Date.now()}`;
      const newOS: VectraOS = {
        id: newId,
        referenceMonth: formReferenceMonth,
        date: formDate,
        protocol: cleanProtocol,
        location: formLocation,
        description: formDescription,
        category: formCategory,
        solution: formSolution
      };
      setIsLoading(true);
      setDoc(doc(db, 'vectraRecords', newId), newOS)
        .then(() => {
          showToast("Nova ordem de serviço cadastrada com sucesso!");
          resetForm();
        })
        .catch((error) => {
          handleFirestoreError(error, OperationType.WRITE, `vectraRecords/${newId}`);
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
    setFormSolution('');
    setFormCategory('wifi');
    setFormReferenceMonth(referenceMonth);
    setShowForm(false);
    setEditingId(null);
  };

  const startEdit = (os: VectraOS) => {
    setEditingId(os.id);
    setFormDate(os.date);
    setFormProtocol(os.protocol);
    setFormLocation(os.location);
    setFormDescription(os.description);
    setFormCategory(os.category);
    setFormSolution(os.solution);
    setFormReferenceMonth(os.referenceMonth);
    setShowForm(true);

    // Scroll smoothly to form section
    setTimeout(() => {
      document.getElementById('vectra-os-form')?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const handleDelete = (id: string) => {
    setOsToDelete(id);
  };

  const confirmDelete = () => {
    if (!osToDelete) return;
    setIsLoading(true);
    deleteDoc(doc(db, 'vectraRecords', osToDelete))
      .then(() => {
        showToast("Ordem de serviço Vectra removida.");
        setOsToDelete(null);
      })
      .catch((error) => {
        handleFirestoreError(error, OperationType.DELETE, `vectraRecords/${osToDelete}`);
        showToast("Erro ao remover do banco de dados.", "error");
      })
      .finally(() => {
        setIsLoading(false);
      });
  };

  const formatBRL = (val: number) => {
    return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  // Check if a specific record is excess
  const isRecordExcedent = (item: VectraOS) => {
    if (item.category === 'wifi') {
      const idx = wifiSorted.findIndex(r => r.id === item.id);
      return idx >= vectraPrices.limitWifi;
    } else {
      const idx = utmSorted.findIndex(r => r.id === item.id);
      return idx >= vectraPrices.limitUtm;
    }
  };

  // Excel Export Handler
  const exportToExcel = () => {
    try {
      const wb = XLSX.utils.book_new();

      const summaryData = [
        ['OPERAÇÃO PE - RELATÓRIO DE FATURAMENTO VECTRA'],
        ['Mês de Referência:', referenceMonth],
        ['Data de Emissão:', new Date().toLocaleDateString('pt-BR')],
        [''],
        ['RESUMO DE AUDITORIA E FRANQUIAS'],
        ['Item de Faturamento', 'Limite Franquia', 'Quantidade Registrada', 'Quantidade Excedente', 'Valor Base Franquia', 'Valor Total Faturado'],
        [
          'Manutenção Ponto de Acesso - Wifi', 
          `${vectraPrices.limitWifi} OS`, 
          stats.wifiCount, 
          stats.excessWifi, 
          formatBRL(vectraPrices.baseCostWifi), 
          formatBRL(stats.totalWifiCost)
        ],
        [
          'Manutenção UTM de Segurança', 
          `${vectraPrices.limitUtm} OS`, 
          stats.utmCount, 
          stats.excessUtm, 
          formatBRL(vectraPrices.baseCostUtm), 
          formatBRL(stats.totalUtmCost)
        ],
        ['VALOR TOTAL A FATURAR', '', '', '', '', formatBRL(stats.grandTotal)]
      ];

      const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
      wsSummary['!cols'] = [{ wch: 35 }, { wch: 18 }, { wch: 22 }, { wch: 22 }, { wch: 22 }, { wch: 22 }];
      XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumo do Periodo');

      // Wifi Details Table
      if (wifiSorted.length > 0) {
        const rows = wifiSorted.map((r, i) => ({
          'DATA': r.date ? new Date(r.date + 'T00:00:00').toLocaleDateString('pt-BR') : '',
          'PROTOCOLO': r.protocol,
          'LOCAL': r.location,
          'CATEGORIA': 'Manutenção Wifi',
          'DESCRIÇÃO': r.description,
          'SOLUÇÃO': r.solution,
          'EXCEDENTE?': i >= vectraPrices.limitWifi ? 'Sim' : 'Não (Incluso na Franquia)',
          'VALOR UNITÁRIO EXCEDENTE': i >= vectraPrices.limitWifi ? formatBRL(vectraPrices.excedenteWifi) : 'R$ 0,00'
        }));
        const wsDetail = XLSX.utils.json_to_sheet(rows);
        wsDetail['!cols'] = [{ wch: 12 }, { wch: 15 }, { wch: 30 }, { wch: 18 }, { wch: 45 }, { wch: 45 }, { wch: 25 }, { wch: 25 }];
        XLSX.utils.book_append_sheet(wb, wsDetail, 'Chamados Wifi');
      }

      // UTM Details Table
      if (utmSorted.length > 0) {
        const rows = utmSorted.map((r, i) => ({
          'DATA': r.date ? new Date(r.date + 'T00:00:00').toLocaleDateString('pt-BR') : '',
          'PROTOCOLO': r.protocol,
          'LOCAL': r.location,
          'CATEGORIA': 'Manutenção UTM',
          'DESCRIÇÃO': r.description,
          'SOLUÇÃO': r.solution,
          'EXCEDENTE?': i >= vectraPrices.limitUtm ? 'Sim' : 'Não (Incluso na Franquia)',
          'VALOR UNITÁRIO EXCEDENTE': i >= vectraPrices.limitUtm ? formatBRL(vectraPrices.excedenteUtm) : 'R$ 0,00'
        }));
        const wsDetail = XLSX.utils.json_to_sheet(rows);
        wsDetail['!cols'] = [{ wch: 12 }, { wch: 15 }, { wch: 30 }, { wch: 18 }, { wch: 45 }, { wch: 45 }, { wch: 25 }, { wch: 25 }];
        XLSX.utils.book_append_sheet(wb, wsDetail, 'Chamados UTM');
      }

      XLSX.writeFile(wb, `Faturamento_Vectra_${referenceMonth.replace('/', '_')}.xlsx`);
      showToast("Planilha Excel da Vectra exportada!");
    } catch (err) {
      console.error(err);
      showToast("Erro ao exportar planilha.", "error");
    }
  };

  // PDF Export Handler
  const exportToPDF = () => {
    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

      // Title header banner matching Um Telecom
      doc.setFillColor(24, 24, 27); // zinc-900 / dark color
      doc.rect(0, 0, 210, 40, 'F');

      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text("VECTRA - INFRAESTRUTURA DE REDES", 15, 15);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(228, 228, 231); // zinc-200
      doc.text("Relatório de Auditoria e Faturamento de Contrato", 15, 21);
      doc.text(`Período de Referência: ${referenceMonth}`, 15, 27);

      const emitDate = new Date().toLocaleDateString('pt-BR');
      doc.setFontSize(8);
      doc.setTextColor(161, 161, 170); // zinc-400
      doc.text(`Gerado em: ${emitDate}`, 150, 15);
      doc.text("Empresa: Método Telecom", 150, 21);
      doc.text("Status: Auditado & Fechado", 150, 27);

      let y = 50;

      // Executive Financial summary layout
      doc.setFillColor(244, 244, 245); // zinc-100
      doc.roundedRect(15, y, 180, 52, 3, 3, 'F');

      doc.setTextColor(24, 24, 27);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text("DEMONSTRATIVO FINANCEIRO CONSOLIDADO VECTRA", 20, y + 8);

      doc.setDrawColor(212, 212, 216); // zinc-300
      doc.setLineWidth(0.2);
      doc.line(20, y + 11, 190, y + 11);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(63, 63, 70); // zinc-700

      // Wifi Franquia & Overage
      doc.text(`1. Franquia AP Wifi (${vectraPrices.limitWifi} chamados inclusos):`, 20, y + 18);
      doc.setFont("helvetica", "bold");
      doc.text(formatBRL(vectraPrices.baseCostWifi), 150, y + 18);

      doc.setFont("helvetica", "normal");
      doc.text(`- Excedentes AP Wifi (${stats.excessWifi} chamados faturados):`, 20, y + 24);
      doc.setFont("helvetica", "bold");
      doc.text(formatBRL(stats.costExcessWifi), 150, y + 24);

      // UTM Franquia & Overage
      doc.setFont("helvetica", "normal");
      doc.text(`2. Franquia UTM (${vectraPrices.limitUtm} chamados inclusos):`, 20, y + 31);
      doc.setFont("helvetica", "bold");
      doc.text(formatBRL(vectraPrices.baseCostUtm), 150, y + 31);

      doc.setFont("helvetica", "normal");
      doc.text(`- Excedentes UTM (${stats.excessUtm} chamados faturados):`, 20, y + 37);
      doc.setFont("helvetica", "bold");
      doc.text(formatBRL(stats.costExcessUtm), 150, y + 37);

      doc.line(20, y + 41, 190, y + 41);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(24, 24, 27);
      doc.text("TOTAL GERAL A FATURAR VECTRA:", 20, y + 47);
      doc.text(formatBRL(stats.grandTotal), 150, y + 47);

      y += 63;

      // Table detailing selected O.S
      doc.setTextColor(17, 24, 39);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text("DETALHAMENTO DE ORDENS DE SERVIÇO VECTRA", 15, y);
      doc.line(15, y + 2, 195, y + 2);

      y += 8;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(75, 85, 99);
      doc.text("Data", 17, y);
      doc.text("Protocolo", 35, y);
      doc.text("Local", 52, y);
      doc.text("Categoria", 95, y);
      doc.text("Faturamento", 132, y);
      doc.text("Descrição do Serviço", 163, y);

      doc.line(15, y + 2, 195, y + 2);
      y += 6;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(17, 24, 39);

      if (filteredRecordsToDisplay.length === 0) {
        doc.text("Nenhuma ordem de serviço cadastrada neste filtro.", 17, y);
      } else {
        // Show first 30 in PDF to avoid excessive length unless needed
        const listToRender = filteredRecordsToDisplay.slice(0, 32);
        listToRender.forEach(r => {
          if (y > 275) {
            doc.addPage();
            y = 20;

            doc.setFont("helvetica", "bold");
            doc.setFontSize(7.5);
            doc.setTextColor(75, 85, 99);
            doc.text("Data", 17, y);
            doc.text("Protocolo", 35, y);
            doc.text("Local", 52, y);
            doc.text("Categoria", 95, y);
            doc.text("Faturamento", 132, y);
            doc.text("Descrição do Serviço", 163, y);
            doc.line(15, y + 2, 195, y + 2);
            y += 6;
          }

          const localFormatted = r.location.length > 20 ? r.location.substring(0, 18) + '..' : r.location;
          const descFormatted = r.description.length > 18 ? r.description.substring(0, 16) + '..' : r.description;
          const isExcess = isRecordExcedent(r);

          doc.setFont("helvetica", "bold");
          const ptDate = r.date ? new Date(r.date + 'T00:00:00').toLocaleDateString('pt-BR') : '-';
          doc.text(ptDate, 17, y);
          doc.text(r.protocol, 35, y);
          doc.setFont("helvetica", "normal");
          doc.text(localFormatted, 52, y);
          doc.text(r.category === 'wifi' ? 'Manut. Wifi' : 'Manut. UTM', 95, y);
          
          doc.setFont("helvetica", "bold");
          if (isExcess) {
            doc.setTextColor(185, 28, 28); // red
            const excValue = r.category === 'wifi' ? vectraPrices.excedenteWifi : vectraPrices.excedenteUtm;
            doc.text("Excedente UI " + formatBRL(excValue).replace('R$', '').trim(), 132, y);
          } else {
            doc.setTextColor(21, 128, 61); // green
            doc.text("Franquia (Incluso)", 132, y);
          }
          doc.setTextColor(17, 24, 39);

          doc.setFont("helvetica", "normal");
          doc.text(descFormatted, 163, y);

          y += 6.2;
        });

        if (filteredRecordsToDisplay.length > 32) {
          y += 4;
          doc.setFont("helvetica", "italic");
          doc.setFontSize(7);
          doc.text(`* E mais ${filteredRecordsToDisplay.length - 32} chamados omitidos por motivos de espaço. Consulte a planilha Excel completa.`, 17, y);
        }
      }

      doc.save(`Faturamento_Vectra_PE_II_${referenceMonth.replace('/', '_')}.pdf`);
      showToast("Relatério PDF consolidado gerado!");
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3.5xl max-w-sm w-full p-6 shadow-2xl animate-slide-in">
            <div className="flex items-center gap-3 text-[#B6202F] pb-3 border-b border-zinc-150 dark:border-zinc-800">
              <AlertTriangle className="h-5 w-5" />
              <h3 className="font-sans font-black text-sm text-zinc-900 dark:text-white uppercase tracking-wider">Confirmar Exclusão</h3>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-4 leading-relaxed font-sans">
              Você tem certeza que deseja realmente excluir esta ordem de serviço Vectra? Esta ação é irreversível.
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
                className="px-5 py-2 text-xs font-black uppercase tracking-wider bg-[#B6202F] hover:bg-[#a01c29] text-white rounded-xl cursor-pointer transition-colors shadow-xs"
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header Banner Card with Vectra styling */}
      <div className="relative overflow-hidden rounded-3.5xl border border-zinc-200/80 dark:border-zinc-800/80 bg-white dark:bg-zinc-900 p-6 md:p-8 shadow-xs">
        <div className="absolute right-0 top-0 -mr-16 -mt-16 w-48 h-48 rounded-full bg-[#B6202F]/5 dark:bg-[#B6202F]/10 blur-3xl pointer-events-none" />
        <div className="absolute left-1/3 bottom-0 w-64 h-64 rounded-full bg-[#B6202F]/5 blur-3xl pointer-events-none" />
        
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-[#B6202F]/10 text-[#B6202F] dark:bg-zinc-850 dark:text-[#df3c4e]">
              <Network className="h-3 w-3 animate-pulse text-[#B6202F]" />
              Manutenção Vectra
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-zinc-900 dark:text-white font-sans flex items-center gap-2">
              Faturamento Manutenção Wifi e UTM
            </h1>
            <p className="text-zinc-500 dark:text-zinc-400 text-sm max-w-2xl leading-relaxed">
              Consolidação de faturamento de manutenção de rede Wifi e UTM.
            </p>
          </div>
          
          {/* Controls Box */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
            <div className="flex flex-col justify-center bg-zinc-50 dark:bg-zinc-950 px-5 py-3 rounded-2.5xl border border-zinc-200/50 dark:border-zinc-850/65 min-w-[220px]">
              <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest font-mono">Mês de Referência</span>
              <div className="relative mt-1">
                <select
                  value={referenceMonth}
                  onChange={(e) => setReferenceMonth(e.target.value)}
                  className="w-full bg-white dark:bg-zinc-900 border border-zinc-250 dark:border-zinc-800 rounded-xl px-3 py-1.5 text-xs font-bold text-zinc-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-[#B6202F] appearance-none cursor-pointer pr-10 shadow-xs"
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
              <button
                onClick={() => setShowConfig(!showConfig)}
                className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 bg-zinc-850 hover:bg-zinc-750 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-white rounded-2xl text-[11px] font-black uppercase tracking-wider transition-all shadow-xs cursor-pointer active:scale-95 duration-150"
              >
                <Wrench className="h-4 w-4 text-white" />
                <span>{showConfig ? 'Fechar Tarifas' : 'Ajustar Tarifas'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Dynamic Rate Adjustment Card Form */}
      {showConfig && (
        <form onSubmit={handleSaveConfig} className="bg-white dark:bg-zinc-900 border border-amber-250 dark:border-amber-900/35 rounded-3.5xl p-6 shadow-md animate-slide-in relative overflow-hidden space-y-5">
          <div className="absolute right-0 top-0 -mr-12 -mt-12 w-24 h-24 rounded-full bg-amber-500/5 blur-xl pointer-events-none" />
          
          <div className="flex items-center gap-2 pb-2 border-b border-zinc-100 dark:border-zinc-800/60">
            <Wrench className="h-4 w-4 text-amber-500" />
            <h3 className="font-sans font-black text-xs text-zinc-900 dark:text-white uppercase tracking-wider">
              Ajustar Tarifas de Homologação (Contrato Vectra)
            </h3>
          </div>
          
          <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
            Configure as regras de franquia, limites de ordens de serviço (OS) e os respectivos valores financeiros. Os valores iniciam zerados pré-homologação e serão atualizados e consolidados em tempo real no dashboard.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Secção Wifi */}
            <div className="space-y-4 p-4 rounded-2.5xl bg-zinc-50/50 dark:bg-zinc-950/40 border border-zinc-200/50 dark:border-zinc-850/50">
              <h4 className="text-xs font-black text-zinc-800 dark:text-zinc-200 uppercase tracking-wider pb-1 border-b border-zinc-150 dark:border-zinc-800/50">
                Ponto de Acesso Wifi
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="block text-[10px] text-zinc-400 font-bold uppercase">Limite Franquia</label>
                  <input
                    type="number"
                    value={configLimitWifi}
                    onChange={(e) => setConfigLimitWifi(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full bg-white dark:bg-zinc-900 border border-zinc-250 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs font-bold text-zinc-850 dark:text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <label className="block text-[10px] text-zinc-400 font-bold uppercase">Custo Base Franquia (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={configBaseCostWifi}
                    onChange={(e) => setConfigBaseCostWifi(Math.max(0, parseFloat(e.target.value) || 0))}
                    className="w-full bg-white dark:bg-zinc-900 border border-zinc-250 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs font-bold text-zinc-850 dark:text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="block text-[10px] text-zinc-400 font-bold uppercase">Valor OS Excedente (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  value={configExcedenteWifi}
                  onChange={(e) => setConfigExcedenteWifi(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="w-full bg-white dark:bg-zinc-900 border border-zinc-250 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs font-bold text-zinc-850 dark:text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
              </div>
            </div>

            {/* Secção UTM */}
            <div className="space-y-4 p-4 rounded-2.5xl bg-zinc-50/50 dark:bg-zinc-950/40 border border-zinc-200/50 dark:border-zinc-850/50">
              <h4 className="text-xs font-black text-zinc-800 dark:text-zinc-200 uppercase tracking-wider pb-1 border-b border-zinc-150 dark:border-zinc-800/50">
                Segurança UTM
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="block text-[10px] text-zinc-400 font-bold uppercase">Limite Franquia</label>
                  <input
                    type="number"
                    value={configLimitUtm}
                    onChange={(e) => setConfigLimitUtm(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full bg-white dark:bg-zinc-900 border border-zinc-250 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs font-bold text-zinc-850 dark:text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <label className="block text-[10px] text-zinc-400 font-bold uppercase">Custo Base Franquia (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={configBaseCostUtm}
                    onChange={(e) => setConfigBaseCostUtm(Math.max(0, parseFloat(e.target.value) || 0))}
                    className="w-full bg-white dark:bg-zinc-900 border border-zinc-250 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs font-bold text-zinc-850 dark:text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="block text-[10px] text-zinc-400 font-bold uppercase">Valor OS Excedente (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  value={configExcedenteUtm}
                  onChange={(e) => setConfigExcedenteUtm(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="w-full bg-white dark:bg-zinc-900 border border-zinc-250 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs font-bold text-zinc-850 dark:text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-100 dark:border-zinc-800/55 text-right">
            <button
              type="button"
              onClick={() => setShowConfig(false)}
              className="px-4 py-2 text-xs font-bold bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-805 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-xl cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-5 py-2 text-xs font-black uppercase tracking-wider bg-amber-500 hover:bg-amber-600 text-white rounded-xl cursor-pointer transition-all active:scale-95 shadow-xs flex items-center justify-center gap-2 disabled:opacity-55"
            >
              <CheckCircle2 className="h-4 w-4" />
              <span>Salvar Tarifas</span>
            </button>
          </div>
        </form>
      )}

      {/* Summary Franchise Indicators */}
      <h2 className="text-xs font-black uppercase tracking-widest text-zinc-400 font-mono pl-1">
        Consolas de Franquia do Contrato ({referenceMonth})
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: AP Wifi Base Contract */}
        <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200/85 dark:border-zinc-800/85 p-5 space-y-3 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-[#B6202F] dark:text-[#df3c4e] bg-[#B6202F]/10 dark:bg-[#B6202F]/20 px-2 py-0.5 rounded-md font-mono">
              Wifi (Limite: {vectraPrices.limitWifi} OS)
            </span>
            <Wifi className="h-4 w-4 text-zinc-400" />
          </div>
          <div>
            <span className="block text-[10px] text-zinc-400 font-bold uppercase tracking-wider font-mono">Ponto de Acesso Wifi</span>
            <span className="block text-lg font-black text-zinc-900 dark:text-white mt-0.5">
              {formatBRL(vectraPrices.baseCostWifi)}
            </span>
            <span className="text-[11px] font-mono text-zinc-400 mt-1 block leading-relaxed">
              <strong>{stats.wifiCount}</strong> chamados regist.
              {stats.excessWifi > 0 && <span className="text-rose-500 font-bold ml-1">({stats.excessWifi} excedent.)</span>}
            </span>
          </div>
        </div>

        {/* Card 2: UTM Base Contract */}
        <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200/85 dark:border-zinc-800/85 p-5 space-y-3 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-sky-600 dark:text-sky-400 bg-sky-500/10 dark:bg-sky-500/20 px-2 py-0.5 rounded-md font-mono">
              UTM (Limite: {vectraPrices.limitUtm} OS)
            </span>
            <ShieldCheck className="h-4 w-4 text-zinc-400" />
          </div>
          <div>
            <span className="block text-[10px] text-zinc-400 font-bold uppercase tracking-wider font-mono">Manutenção UTM</span>
            <span className="block text-lg font-black text-zinc-900 dark:text-white mt-0.5">
              {formatBRL(vectraPrices.baseCostUtm)}
            </span>
            <span className="text-[11px] font-mono text-zinc-400 mt-1 block leading-relaxed">
              <strong>{stats.utmCount}</strong> chamados regist.
              {stats.excessUtm > 0 && <span className="text-rose-500 font-bold ml-1">({stats.excessUtm} excedent.)</span>}
            </span>
          </div>
        </div>

        {/* Card 3: Excedentes Faturados */}
        <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200/85 dark:border-zinc-800/85 p-5 space-y-3 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400 bg-rose-500/10 dark:bg-rose-500/20 px-2 py-0.5 rounded-md font-mono">
              Wifi Exc: {formatBRL(vectraPrices.excedenteWifi)} | UTM: {formatBRL(vectraPrices.excedenteUtm)}
            </span>
            <Zap className="h-4 w-4 text-rose-500" />
          </div>
          <div>
            <span className="block text-[10px] text-zinc-400 font-bold uppercase tracking-wider font-mono">Tickets Excedentes</span>
            <span className={`block text-lg font-black mt-0.5 ${stats.totalExcessCost > 0 ? 'text-rose-600' : 'text-zinc-900 dark:text-white'}`}>
              {formatBRL(stats.totalExcessCost)}
            </span>
            <span className="text-[11px] font-mono text-zinc-400 mt-1 block leading-relaxed">
              {stats.totalExcessCount} OS avulsas taxadas
            </span>
          </div>
        </div>

        {/* Card 4: Faturamento Total */}
        <div className="bg-[#B6202F] dark:bg-[#901621] text-white rounded-3xl border border-[#B6202F] p-5 space-y-3 shadow-lg shadow-[#B6202F]/15">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 bg-white/20 text-white rounded font-mono">
              TOTAL CONTRATO
            </span>
            <DollarSign className="h-4.5 w-4.5 text-white/80 shrink-0" />
          </div>
          <div>
            <span className="block text-[10px] text-white/75 font-bold uppercase tracking-wider font-mono">Valor Total Acumulado</span>
            <span className="block text-2xl font-black text-white leading-tight mt-1">
              {formatBRL(stats.grandTotal)}
            </span>
            <span className="text-[10px] text-white/80 leading-relaxed mt-1 block font-mono">
              Total ({stats.totalCount} atendimentos)
            </span>
          </div>
        </div>
      </div>

      {/* OS Form section */}
      <div id="vectra-os-form" className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-black text-zinc-850 dark:text-zinc-150 uppercase tracking-wider">
            Painel Operacional Vectra
          </h2>
          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 px-4 py-2 bg-[#B6202F] hover:bg-[#a01c29] text-white rounded-xl text-xs font-bold font-sans transition-all active:scale-95 duration-100 cursor-pointer shadow-xs"
            >
              <Plus className="h-4 w-4" />
              <span>Cadastrar Nova O.S. Vectra</span>
            </button>
          )}
        </div>

        {showForm && (
          <form 
            onSubmit={handleSubmit}
            className="bg-white dark:bg-zinc-900 rounded-3.5xl border border-zinc-200/80 dark:border-zinc-800/80 p-5 md:p-6 space-y-5 animate-slide-in shadow-md"
          >
            <div className="flex items-center justify-between pb-3 border-b border-zinc-150 dark:border-zinc-800">
              <div className="flex items-center gap-2 text-[#B6202F]">
                <Network className="h-5 w-5" />
                <h3 className="font-bold text-sm text-zinc-900 dark:text-white">
                  {editingId ? 'Editar Ordem de Serviço Vectra' : 'Lançar Nova Ordem de Serviço Vectra'}
                </h3>
              </div>
              <button
                type="button"
                onClick={resetForm}
                className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-[#B6202F] rounded-lg cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
              {/* DATE */}
              <div>
                <label className="block text-[11px] font-black uppercase text-zinc-400 tracking-wider mb-1.5 font-mono">
                  Data do Atendimento
                </label>
                <input
                  type="date"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  required
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-250 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs font-bold text-zinc-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-[#B6202F]"
                />
              </div>

              {/* MÊS DE REFERÊNCIA */}
              <div>
                <label className="block text-[11px] font-black uppercase text-zinc-400 tracking-wider mb-1.5 font-mono">
                  MÊS DE REFERÊNCIA
                </label>
                <div className="relative">
                  <select
                    value={formReferenceMonth}
                    onChange={(e) => setFormReferenceMonth(e.target.value)}
                    className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-250 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs font-bold text-zinc-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-[#B6202F] appearance-none cursor-pointer pr-10"
                  >
                    {availableMonths.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3.5 top-3 h-4 w-4 text-zinc-400 pointer-events-none" />
                </div>
              </div>

              {/* PROTOCOLO */}
              <div>
                <label className="block text-[11px] font-black uppercase text-zinc-400 tracking-wider mb-1.5 font-mono">
                  PROTOCOLO / Nº OS (7 DÍGITOS)
                </label>
                <input
                  type="text"
                  maxLength={7}
                  placeholder="Ex: 1234567"
                  value={formProtocol}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '');
                    setFormProtocol(val);
                  }}
                  required
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-250 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs font-bold text-zinc-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-[#B6202F]"
                />
              </div>

              {/* LOCAL */}
              <div>
                <label className="block text-[11px] font-black uppercase text-zinc-400 tracking-wider mb-1.5 font-mono">
                  LOCALIZAÇÃO
                </label>
                <input
                  type="text"
                  placeholder="Ex: Escola Guedes Alcoforado"
                  value={formLocation}
                  onChange={(e) => setFormLocation(e.target.value)}
                  required
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-250 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs font-bold text-zinc-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-[#B6202F]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {/* CATEGORY */}
              <div className="md:col-span-1">
                <label className="block text-[11px] font-black uppercase text-zinc-400 tracking-wider mb-1.5 font-mono">
                  CATEGORIA DE CONTRATO
                </label>
                <div className="relative">
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value as 'wifi' | 'utm')}
                    className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-250 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs font-bold text-zinc-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-[#B6202F] appearance-none cursor-pointer pr-10"
                  >
                    <option value="wifi">Ponto de Acesso - Wifi (Franquia de 63)</option>
                    <option value="utm">Manutenção UTM (Franquia de 74)</option>
                  </select>
                  <ChevronDown className="absolute right-3.5 top-3 h-4 w-4 text-zinc-400 pointer-events-none" />
                </div>
              </div>

              {/* DESCRIPTION */}
              <div className="md:col-span-2">
                <label className="block text-[11px] font-black uppercase text-zinc-400 tracking-wider mb-1.5 font-mono">
                  DESCRIÇÃO DO SERVIÇO
                </label>
                <input
                  type="text"
                  placeholder="Instalação, alinhamento ou varredura técnica..."
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  required
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-250 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs font-bold text-zinc-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-[#B6202F]"
                />
              </div>
            </div>

            {/* SOLUTION */}
            <div>
              <label className="block text-[11px] font-black uppercase text-zinc-400 tracking-wider mb-1.5 font-mono">
                SOLUÇÃO TÉCNICA APLICADA
              </label>
              <input
                type="text"
                placeholder="Excedente ou franquia detalhamento de reparo executado..."
                value={formSolution}
                onChange={(e) => setFormSolution(e.target.value)}
                required
                className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-250 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs font-bold text-zinc-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-[#B6202F]"
              />
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
                className="px-5 py-2 bg-[#B6202F] hover:bg-[#a01c29] text-white rounded-xl text-xs font-black uppercase tracking-wider cursor-pointer"
              >
                {editingId ? 'Salvar Alterações' : 'Cadastrar OS'}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Main Table Card with category tabs similar to Um Telecom */}
      <div className="bg-white dark:bg-zinc-900 rounded-3.5xl border border-zinc-200/80 dark:border-zinc-800/80 p-6 space-y-4 shadow-xs relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-zinc-150 dark:border-zinc-800 pb-4 gap-4">
          <div className="space-y-1">
            <h3 className="font-bold text-zinc-900 dark:text-white text-sm">
              Demonstrativo Analítico de Chamados Vectra
            </h3>
            <p className="text-[11px] text-zinc-450 dark:text-zinc-550 font-mono">
              LISTAGEM DE ATENDIMENTOS E CLASSIFICAÇÃO
            </p>
          </div>
          
          <div className="flex items-center bg-zinc-50 dark:bg-zinc-950 p-1 rounded-xl border border-zinc-200/80 dark:border-zinc-850/80">
            <button
              onClick={() => setActiveSubTab('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeSubTab === 'all' 
                  ? 'bg-white dark:bg-zinc-900 text-[#B6202F] shadow-xs' 
                  : 'text-zinc-450 hover:text-zinc-905 dark:hover:text-white'
              }`}
            >
              Todos ({stats.totalCount})
            </button>
            <button
              onClick={() => setActiveSubTab('wifi')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeSubTab === 'wifi' 
                  ? 'bg-white dark:bg-zinc-900 text-[#B6202F] shadow-xs' 
                  : 'text-zinc-450 hover:text-zinc-905 dark:hover:text-white'
              }`}
            >
              Wifi ({stats.wifiCount})
            </button>
            <button
              onClick={() => setActiveSubTab('utm')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeSubTab === 'utm' 
                  ? 'bg-white dark:bg-zinc-900 text-[#B6202F] shadow-xs' 
                  : 'text-zinc-450 hover:text-zinc-905 dark:hover:text-white'
              }`}
            >
              UTM ({stats.utmCount})
            </button>
          </div>
        </div>

        {/* Table representation */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-zinc-150 dark:border-zinc-800 text-[10px] font-bold uppercase font-mono text-zinc-400 tracking-wider">
                <th className="py-3 px-2">DATA</th>
                <th className="py-3 px-2">PROTOCOLO</th>
                <th className="py-3 px-2">LOCAL</th>
                <th className="py-3 px-2">DESCRIÇÃO DO SERVIÇO</th>
                <th className="py-3 px-2">CATEGORIA</th>
                <th className="py-3 px-2">SOLUÇÃO</th>
                <th className="py-3 px-2 text-right">EXCEDENTE?</th>
                <th className="py-3 px-2 text-right">FATURAMENTO</th>
                <th className="py-3 px-2 text-center">AÇÕES</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100/60 dark:divide-zinc-800/50">
              {filteredRecordsToDisplay.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-xs text-zinc-400 font-sans">
                    Nenhuma ordem de serviço cadastrada neste filtro ou mês de referência.
                  </td>
                </tr>
              ) : (
                filteredRecordsToDisplay.map(item => {
                  const isExcess = isRecordExcedent(item);
                  return (
                    <tr key={item.id} className="text-zinc-600 dark:text-zinc-350 hover:bg-zinc-50/50 dark:hover:bg-zinc-950/20 transition-colors">
                      {/* DATA */}
                      <td className="py-3 px-2 text-xs font-semibold text-zinc-800 dark:text-white font-mono whitespace-nowrap">
                        {item.date ? new Date(item.date + 'T00:00:00').toLocaleDateString('pt-BR') : '-'}
                      </td>

                      {/* PROTOCOLO */}
                      <td className="py-3 px-2 font-mono text-xs font-bold text-zinc-400">
                        {item.protocol}
                      </td>

                      {/* LOCAL */}
                      <td className="py-3 px-2 text-xs font-bold text-zinc-700 dark:text-zinc-300">
                        {item.location}
                      </td>

                      {/* DESCRIÇÃO */}
                      <td className="py-3 px-2 text-xs text-zinc-500 dark:text-zinc-400 max-w-[200px] truncate" title={item.description}>
                        {item.description}
                      </td>

                      {/* CATEGORIA */}
                      <td className="py-3 px-2 text-xs">
                        <span className={`inline-block text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${
                          item.category === 'wifi' 
                            ? 'bg-[#B6202F]/10 text-[#B6202F]'
                            : 'bg-sky-500/10 text-sky-600'
                        }`}>
                          {item.category === 'wifi' ? 'Wifi' : 'UTM'}
                        </span>
                      </td>

                      {/* SOLUÇÃO */}
                      <td className="py-3 px-2 text-xs text-zinc-500 dark:text-zinc-400 max-w-[200px] truncate" title={item.solution}>
                        {item.solution}
                      </td>

                      {/* EXCEDENTE? */}
                      <td className="py-3 px-2 text-xs text-right font-medium">
                        {isExcess ? (
                          <span className="text-rose-600 dark:text-rose-400 font-bold">Sim</span>
                        ) : (
                          <span className="text-emerald-600 dark:text-emerald-400">Não</span>
                        )}
                      </td>

                      {/* FATURAMENTO */}
                      <td className="py-3 px-2 text-xs text-right font-mono font-black text-zinc-800 dark:text-white">
                        {isExcess ? formatBRL(item.category === 'wifi' ? vectraPrices.excedenteWifi : vectraPrices.excedenteUtm) : formatBRL(0)}
                      </td>

                      {/* ACTIONS */}
                      <td className="py-3 px-2 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => startEdit(item)}
                            className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-[#B6202F] rounded transition-all cursor-pointer"
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
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Warning rules panel */}
        <div className="mt-4 p-4 rounded-2xl bg-[#B6202F]/5 border border-[#B6202F]/10 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-[#B6202F] shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="text-xs font-bold text-zinc-900 dark:text-white">Regras de Franquia e Excedentes - Contrato Vectra</h4>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed font-sans">
              O faturamento da Vectra obedece aos limites de chamados contratados:
              A franquia mensal de <strong>Manutenção Ponto de Acesso - Wifi</strong> é de <strong>{vectraPrices.limitWifi} chamados</strong> ao custo fixo de <strong>{formatBRL(vectraPrices.baseCostWifi)}</strong>, e a franquia de <strong>Manutenção UTM</strong> é de <strong>{vectraPrices.limitUtm} chamados</strong> ao custo fixo de <strong>{formatBRL(vectraPrices.baseCostUtm)}</strong>.
              Cada chamado adicional (excedente) verificado em auditoria física é tarifado no valor unitário complementar de <strong>{formatBRL(vectraPrices.excedenteWifi)}</strong> (Wifi) ou <strong>{formatBRL(vectraPrices.excedenteUtm)}</strong> (UTM).
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
