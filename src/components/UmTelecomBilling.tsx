import React, { useState, useEffect, useMemo } from 'react';
import { 
  Zap, 
  Wrench, 
  Plus, 
  Trash2, 
  Building, 
  Calendar, 
  AlertTriangle, 
  CheckCircle2, 
  Info, 
  FileText, 
  ChevronDown, 
  Layers, 
  DollarSign, 
  Activity, 
  TrendingUp, 
  HelpCircle,
  Edit,
  X,
  FileSpreadsheet,
  Search
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, doc, setDoc, deleteDoc, onSnapshot, getDoc, writeBatch } from 'firebase/firestore';

interface UmTelecomRecord {
  id: string;
  referenceMonth: string;
  category: 'eletrica' | 'manutencao_pcm' | 'ativacao_pcm';
  type: 'basica' | 'critica' | null;
  osNumber: string;
  date: string;
  location: string;
  notes: string;
  solution?: string;
}

const CONSTANTS = {
  FRANCHISE_BASE_COST: 19939.75,
  LIMIT_BASICA: 10,
  LIMIT_CRITICA: 5,
  COST_EXCEDENTE: 1499.35,
  COST_MANUTENCAO: 1102.35,
  COST_ATIVACAO: 2548.75
};

// Realistic mock records to preseed when there is no data in Firestore for the chosen month
const PRESEEDED_RECORDS: UmTelecomRecord[] = [
  {
    id: 'umseed-1',
    referenceMonth: 'Junho/2026',
    category: 'eletrica',
    type: 'basica',
    osNumber: 'OS-EL-1001',
    date: '2026-06-01',
    location: 'SEE Central (Almoxarifado)',
    notes: 'Substituição de estabilizador queimado na rede de computadores principal',
    solution: 'Substituído por estabilizador novo de 1kVA de alto rendimento'
  },
  {
    id: 'umseed-2',
    referenceMonth: 'Junho/2026',
    category: 'eletrica',
    type: 'basica',
    osNumber: 'OS-EL-1002',
    date: '2026-06-03',
    location: 'Seduc Núcleo Especial',
    notes: 'Instalação de estabilizador novo de 1kVA no laboratório',
    solution: 'Fiação elétrica ajustada e estabilizador de 1kVA integrado com sucesso'
  },
  {
    id: 'umseed-3',
    referenceMonth: 'Junho/2026',
    category: 'eletrica',
    type: 'critica',
    osNumber: 'OS-EL-2001',
    date: '2026-06-04',
    location: 'SEFAZ Sede Central (Datacenter)',
    notes: 'Substituição preventiva de nobreak corporativo após queda de tensão',
    solution: 'Instalado nobreak APC senoidal redundante e realizada recarga das baterias'
  },
  {
    id: 'umseed-4',
    referenceMonth: 'Junho/2026',
    category: 'eletrica',
    type: 'basica',
    osNumber: 'OS-EL-1003',
    date: '2026-06-05',
    location: 'SES Central de Vacinas',
    notes: 'Instalação emergencial de estabilizador auxiliar de energia',
    solution: 'Instalado estabilizador SMS no rack de monitoração de frios'
  },
  {
    id: 'umseed-5',
    referenceMonth: 'Junho/2026',
    category: 'manutencao_pcm',
    type: null,
    osNumber: 'OS-PCM-4001',
    date: '2026-06-07',
    location: 'Regional de Saúde Metropolitana',
    notes: 'Manutenção periódica sob demanda nas baterias e módulo GSM do PCM',
    solution: 'Verificação técnica geral, troca preventiva de cabos oxidados e reset do módulo GSM'
  },
  {
    id: 'umseed-6',
    referenceMonth: 'Junho/2026',
    category: 'ativacao_pcm',
    type: null,
    osNumber: 'OS-PCM-5001',
    date: '2026-06-11',
    location: 'SEE Escola Estadual de Referência',
    notes: 'Implantação completa de nova estação de PCM e homologação técnica',
    solution: 'Cabeamento estruturado infra, teste de isolação galvânica e fixação de barramentos'
  }
];

export default function UmTelecomBilling() {
  const [referenceMonth, setReferenceMonth] = useState('Junho/2026');
  const [dbRecords, setDbRecords] = useState<UmTelecomRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Tab control inside inside Um Telecom view
  const [activeSubTab, setActiveSubTab] = useState<'eletrica' | 'manutencao_pcm' | 'ativacao_pcm'>('eletrica');
  const [tableSearchQuery, setTableSearchQuery] = useState('');

  // Form states
  const [showAddForm, setShowAddForm] = useState(false);
  const [formCategory, setFormCategory] = useState<'eletrica' | 'manutencao_pcm' | 'ativacao_pcm'>('eletrica');
  const [formEletricaType, setFormEletricaType] = useState<'basica' | 'critica'>('basica');
  const [formOsNumber, setFormOsNumber] = useState('');
  const [formDate, setFormDate] = useState(() => {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  });
  const [formLocation, setFormLocation] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formSolution, setFormSolution] = useState('');
  const [formReferenceMonth, setFormReferenceMonth] = useState('Junho/2026');
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const [deleteRecordId, setDeleteRecordId] = useState<string | null>(null);
  
  const isZeroMonthSelected = referenceMonth === 'Janeiro/2026' || referenceMonth === 'Fevereiro/2026';
  
  // Dropdown for type selection when registering new ticket
  const [isCreateDropdownOpen, setIsCreateDropdownOpen] = useState(false);

  // Toast notification
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'info' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Setup Firestore listener for umTelecomRecords with auto-seeding
  useEffect(() => {
    setIsLoading(true);
    const collectionRef = collection(db, 'umTelecomRecords');
    
    const unsubscribe = onSnapshot(collectionRef, async (snapshot) => {
      const records: UmTelecomRecord[] = [];
      snapshot.forEach((docSnap) => {
        records.push({ id: docSnap.id, ...docSnap.data() } as UmTelecomRecord);
      });

      if (snapshot.empty) {
        if (snapshot.metadata?.fromCache) {
          // Ignore if empty snapshot from local cache to prevent default overwrites during connection phase
          return;
        }

        let isAlreadySeededDB = false;
        try {
          const seedMetaDoc = await getDoc(doc(db, 'test', 'seeding_metadata'));
          if (seedMetaDoc.exists() && seedMetaDoc.data()?.umtelecom === true) {
            isAlreadySeededDB = true;
          }
        } catch (smErr) {
          console.warn("Could not retrieve remote seeding metadata for Um Telecom:", smErr);
        }

        if (isAlreadySeededDB || localStorage.getItem('umtelecom_seeded_v1') === 'true') {
          console.log("Database cleared of Um Telecom records by preference, skipping automatic seeding.");
          setDbRecords([]);
          setIsLoading(false);
          localStorage.setItem('umtelecom_seeded_v1', 'true');
          return;
        }
        console.log("Sem registros do Um Telecom no banco de dados, populando conjunto padrão do Um Telecom...");
        try {
          // Seed the PRESEEDED_RECORDS to Firestore if there are no records yet
          const batch = writeBatch(db);
          PRESEEDED_RECORDS.forEach((item) => {
            batch.set(doc(db, 'umTelecomRecords', item.id), item);
          });
          
          // Save seeding indication to DB as well
          const seedMetaRef = doc(db, 'test', 'seeding_metadata');
          batch.set(seedMetaRef, { umtelecom: true }, { merge: true });

          await batch.commit();
          localStorage.setItem('umtelecom_seeded_v1', 'true');
          return;
        } catch (writeErr) {
          console.error("Falha ao injetar chamados padrões do Um Telecom no Firestore:", writeErr);
        }
      }

      localStorage.setItem('umtelecom_seeded_v1', 'true');
      setDbRecords(records);
      setIsLoading(false);
    }, (error) => {
      console.error("Erro no listen do Firestore (usando fallback local):", error);
      // Try reading from localStorage as fallback
      const cached = localStorage.getItem('umTelecom_offline_records');
      if (cached) {
        setDbRecords(JSON.parse(cached));
      }
      setIsLoading(false);
      showToast("Modo Offline: Dados salvos localmente.", "info");
      
      // Mandatory Firestore Security/Permission Error handler
      handleFirestoreError(error, OperationType.LIST, 'umTelecomRecords');
    });

    return () => unsubscribe();
  }, []);

  // Sync to local storage for foolproof offline capabilities
  useEffect(() => {
    if (dbRecords.length > 0) {
      localStorage.setItem('umTelecom_offline_records', JSON.stringify(dbRecords));
    }
  }, [dbRecords]);

  // Sync form default reference month with page-level referenceMonth
  useEffect(() => {
    if (!editingRecordId) {
      setFormReferenceMonth(referenceMonth);
    }
  }, [referenceMonth, editingRecordId]);

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

  // Records filtered for current reference month loaded cleanly from Firestore
  const activeRecords = useMemo(() => {
    if (isZeroMonthSelected) return [];
    return dbRecords.filter(r => r.referenceMonth === referenceMonth);
  }, [dbRecords, referenceMonth, isZeroMonthSelected]);

  // Chronologically sort Elétrica records to strictly allocate Franchise Slot vs Excedent billing!
  const basicEletricaRecords = useMemo(() => {
    return activeRecords
      .filter(r => r.category === 'eletrica' && r.type === 'basica')
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [activeRecords]);

  const criticalEletricaRecords = useMemo(() => {
    return activeRecords
      .filter(r => r.category === 'eletrica' && r.type === 'critica')
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [activeRecords]);

  // Maintenance and activations
  const maintenanceRecords = useMemo(() => {
    return activeRecords
      .filter(r => r.category === 'manutencao_pcm')
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [activeRecords]);

  const activationRecords = useMemo(() => {
    return activeRecords
      .filter(r => r.category === 'ativacao_pcm')
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [activeRecords]);

  // Filtered lists specifically for table search representation, so calculation results are completely unmodified
  const filteredBasicEletricaRecords = useMemo(() => {
    if (!tableSearchQuery.trim()) return basicEletricaRecords;
    const query = tableSearchQuery.toLowerCase().trim();
    return basicEletricaRecords.filter(r => 
      (r.osNumber && r.osNumber.toLowerCase().includes(query)) ||
      (r.location && r.location.toLowerCase().includes(query))
    );
  }, [basicEletricaRecords, tableSearchQuery]);

  const filteredCriticalEletricaRecords = useMemo(() => {
    if (!tableSearchQuery.trim()) return criticalEletricaRecords;
    const query = tableSearchQuery.toLowerCase().trim();
    return criticalEletricaRecords.filter(r => 
      (r.osNumber && r.osNumber.toLowerCase().includes(query)) ||
      (r.location && r.location.toLowerCase().includes(query))
    );
  }, [criticalEletricaRecords, tableSearchQuery]);

  const filteredMaintenanceRecords = useMemo(() => {
    if (!tableSearchQuery.trim()) return maintenanceRecords;
    const query = tableSearchQuery.toLowerCase().trim();
    return maintenanceRecords.filter(r => 
      (r.osNumber && r.osNumber.toLowerCase().includes(query)) ||
      (r.location && r.location.toLowerCase().includes(query))
    );
  }, [maintenanceRecords, tableSearchQuery]);

  const filteredActivationRecords = useMemo(() => {
    if (!tableSearchQuery.trim()) return activationRecords;
    const query = tableSearchQuery.toLowerCase().trim();
    return activationRecords.filter(r => 
      (r.osNumber && r.osNumber.toLowerCase().includes(query)) ||
      (r.location && r.location.toLowerCase().includes(query))
    );
  }, [activationRecords, tableSearchQuery]);

  // Calculations
  const calcResults = useMemo(() => {
    if (isZeroMonthSelected) {
      return {
        basicCount: 0,
        criticalCount: 0,
        excessBasica: 0,
        excessCritica: 0,
        totalExcess: 0,
        valueExcess: 0,
        maintenanceCount: 0,
        valueMaintenance: 0,
        activationCount: 0,
        valueActivations: 0,
        grandTotal: 0
      };
    }
    const basicCount = basicEletricaRecords.length;
    const criticalCount = criticalEletricaRecords.length;

    const excessBasica = Math.max(0, basicCount - CONSTANTS.LIMIT_BASICA);
    const excessCritica = Math.max(0, criticalCount - CONSTANTS.LIMIT_CRITICA);
    const totalExcess = excessBasica + excessCritica;
    const valueExcess = totalExcess * CONSTANTS.COST_EXCEDENTE;

    const maintenanceCount = maintenanceRecords.length;
    const valueMaintenance = maintenanceCount * CONSTANTS.COST_MANUTENCAO;

    const activationCount = activationRecords.length;
    const valueActivations = activationCount * CONSTANTS.COST_ATIVACAO;

    const grandTotal = CONSTANTS.FRANCHISE_BASE_COST + valueExcess + valueMaintenance + valueActivations;

    return {
      basicCount,
      criticalCount,
      excessBasica,
      excessCritica,
      totalExcess,
      valueExcess,
      maintenanceCount,
      valueMaintenance,
      activationCount,
      valueActivations,
      grandTotal
    };
  }, [basicEletricaRecords, criticalEletricaRecords, maintenanceRecords, activationRecords, isZeroMonthSelected]);

  // Format currency helper
  const formatBRL = (val: number) => {
    return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  // Excel Export Handler
  const exportToExcel = () => {
    try {
      const wb = XLSX.utils.book_new();

      // 1. Executive Summary Sheet
      const summaryData = [
        ['RELATÓRIO EXECUTIVO DE FATURAMENTO - UM TELECOM'],
        ['Mês de Referência:', referenceMonth],
        ['Data de Emissão:', new Date().toLocaleDateString('pt-BR')],
        [''],
        ['DEMONSTRATIVO FINANCEIRO CONSOLIDADO'],
        ['Item de Faturamento', 'Quantidade', 'Valor Unitário', 'Valor Total'],
        ['Preço Fixo Mensal (Franquia Infra PCM)', '1', formatBRL(CONSTANTS.FRANCHISE_BASE_COST), formatBRL(CONSTANTS.FRANCHISE_BASE_COST)],
        ['Excedentes O.S Elétrica Básica', calcResults.excessBasica, formatBRL(CONSTANTS.COST_EXCEDENTE), formatBRL(calcResults.excessBasica * CONSTANTS.COST_EXCEDENTE)],
        ['Excedentes O.S Elétrica Crítica', calcResults.excessCritica, formatBRL(CONSTANTS.COST_EXCEDENTE), formatBRL(calcResults.excessCritica * CONSTANTS.COST_EXCEDENTE)],
        ['Manutenções PCM sob Demanda', calcResults.maintenanceCount, formatBRL(CONSTANTS.COST_MANUTENCAO), formatBRL(calcResults.valueMaintenance)],
        ['Novas Ativações de Canal PCM', calcResults.activationCount, formatBRL(CONSTANTS.COST_ATIVACAO), formatBRL(calcResults.valueActivations)],
        ['VALOR TOTAL A FATURAR', '', '', formatBRL(calcResults.grandTotal)],
        [''],
        ['INDICADORES E COBERTURA DE FRANQUIAS'],
        ['Categoria de Chamado', 'Volume Registrado', 'Limite da Franquia', 'Volume Excedente'],
        ['O.S Elétrica Básica', calcResults.basicCount, `${CONSTANTS.LIMIT_BASICA} CH`, calcResults.excessBasica],
        ['O.S Elétrica Crítica', calcResults.criticalCount, `${CONSTANTS.LIMIT_CRITICA} CH`, calcResults.excessCritica],
        ['Manutenções PCM', calcResults.maintenanceCount, 'Sem limite', 'Sob demanda'],
        ['Novas Ativações PCM', calcResults.activationCount, 'Sem limite', 'Sob demanda']
      ];

      const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
      wsSummary['!cols'] = [{ wch: 42 }, { wch: 18 }, { wch: 18 }, { wch: 18 }];
      XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumo Executivo');

      // 2. O.S Elétrica Sheet
      const combinedEletrica = [...basicEletricaRecords, ...criticalEletricaRecords]
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      if (combinedEletrica.length > 0) {
        const eletricaRows = combinedEletrica.map((r) => {
          const isBasic = r.type === 'basica';
          const arr = isBasic ? basicEletricaRecords : criticalEletricaRecords;
          const limit = isBasic ? CONSTANTS.LIMIT_BASICA : CONSTANTS.LIMIT_CRITICA;
          const posIndex = arr.indexOf(r);
          const isExcess = posIndex >= limit;
          
          return {
            'Data': r.date ? new Date(r.date + 'T00:00:00').toLocaleDateString('pt-BR') : '',
            'Protocolo': r.osNumber,
            'Localização': r.location,
            'Tipo de O.S': isBasic ? 'Elétrica Básica' : 'Elétrica Crítica',
            'Descrição do Serviço': r.notes,
            'Solução Aplicada': r.solution || 'Problema elétrico resolvido.',
            'Faturamento': isExcess ? 'Excedente (Tarifado R$ 1.499,35)' : 'Franquia (Incluso)'
          };
        });
        const wsEletrica = XLSX.utils.json_to_sheet(eletricaRows);
        wsEletrica['!cols'] = [{ wch: 12 }, { wch: 12 }, { wch: 15 }, { wch: 18 }, { wch: 45 }, { wch: 35 }, { wch: 30 }];
        XLSX.utils.book_append_sheet(wb, wsEletrica, 'Chamados Elétrica');
      }

      // 3. Manutenções PCM Sheet
      if (maintenanceRecords.length > 0) {
        const maintenanceRows = maintenanceRecords.map(r => ({
          'Data': r.date ? new Date(r.date + 'T00:00:00').toLocaleDateString('pt-BR') : '',
          'Protocolo': r.osNumber,
          'Localização': r.location,
          'Detalhamento Técnico': r.notes,
          'Solução Aplicada': r.solution || 'Reparo concluído.',
          'Valor Unitário': formatBRL(CONSTANTS.COST_MANUTENCAO),
          'Faturamento': 'Tarifado sob Demanda'
        }));
        const wsMaintenance = XLSX.utils.json_to_sheet(maintenanceRows);
        wsMaintenance['!cols'] = [{ wch: 12 }, { wch: 12 }, { wch: 15 }, { wch: 45 }, { wch: 35 }, { wch: 18 }, { wch: 22 }];
        XLSX.utils.book_append_sheet(wb, wsMaintenance, 'Manutenções PCM');
      }

      // 4. Novas Ativações Sheet
      if (activationRecords.length > 0) {
        const activationRows = activationRecords.map(r => ({
          'Data': r.date ? new Date(r.date + 'T00:00:00').toLocaleDateString('pt-BR') : '',
          'Protocolo': r.osNumber,
          'Localização': r.location,
          'Detalhamento Técnico': r.notes,
          'Solução Aplicada': r.solution || 'Terminal PCM ativado com sucesso.',
          'Valor Unitário': formatBRL(CONSTANTS.COST_ATIVACAO),
          'Faturamento': 'Nova Ativação Estrutural'
        }));
        const wsActivation = XLSX.utils.json_to_sheet(activationRows);
        wsActivation['!cols'] = [{ wch: 12 }, { wch: 12 }, { wch: 15 }, { wch: 45 }, { wch: 35 }, { wch: 18 }, { wch: 25 }];
        XLSX.utils.book_append_sheet(wb, wsActivation, 'Novas Ativações');
      }

      XLSX.writeFile(wb, `Faturamento_UmTelecom_${referenceMonth.replace('/', '_')}.xlsx`);
      showToast("Planilha Excel exportada com sucesso!");
    } catch (err) {
      console.error("Erro ao gerar Excel:", err);
      showToast("Erro ao exportar planilha Excel.", "error");
    }
  };

  // PDF Executive Report Handler
  const exportToPDF = () => {
    try {
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      // Header Banner
      doc.setFillColor(24, 24, 27); // zinc-900 / dark color
      doc.rect(0, 0, 210, 40, 'F');

      // Title Text
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text("UM TELECOM - INFRAESTRUTURA PCM", 15, 15);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(228, 228, 231); // zinc-200
      doc.text("Relatório Executivo Consolidado de Faturamento", 15, 21);
      doc.text(`Período de Referência: ${referenceMonth}`, 15, 27);

      doc.setFontSize(8);
      doc.setTextColor(161, 161, 170); // zinc-400
      const issueDate = new Date().toLocaleDateString('pt-BR', { 
        day: '2-digit', 
        month: '2-digit', 
        year: 'numeric', 
        hour: '2-digit', 
        minute: '2-digit' 
      });
      doc.text(`Gerado em: ${issueDate}`, 145, 15);
      doc.text("Empresa: Método Telecom", 145, 21);
      doc.text("Status: Auditado & Fechado", 145, 27);

      // Current drawing Y coordinate
      let y = 52;

      // 1. Financial demonstrative block
      doc.setFillColor(244, 244, 245); // zinc-100
      doc.roundedRect(15, y, 180, 52, 3, 3, 'F');
      
      doc.setTextColor(24, 24, 27);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text("DEMONSTRATIVO FINANCEIRO CONSOLIDADO DO MÊS", 20, y + 8);
      
      doc.setLineWidth(0.2);
      doc.setDrawColor(212, 212, 216); // zinc-300
      doc.line(20, y + 11, 190, y + 11);

      // items
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(63, 63, 70); // zinc-700
      
      doc.text("1. Franquia de Infraestrutura Fixa Mensal (Preço Base):", 20, y + 18);
      doc.setFont("helvetica", "bold");
      doc.text(formatBRL(CONSTANTS.FRANCHISE_BASE_COST), 150, y + 18);

      doc.setFont("helvetica", "normal");
      doc.text(`2. Excedentes O.S Elétrica Básica e Crítica (${calcResults.totalExcess} CH):`, 20, y + 24);
      doc.setFont("helvetica", "bold");
      doc.text(formatBRL(calcResults.valueExcess), 150, y + 24);

      doc.setFont("helvetica", "normal");
      doc.text(`3. Eventos de Manutenção sob Demanda (${calcResults.maintenanceCount} eventos):`, 20, y + 30);
      doc.setFont("helvetica", "bold");
      doc.text(formatBRL(calcResults.valueMaintenance), 150, y + 30);

      doc.setFont("helvetica", "normal");
      doc.text(`4. Novas Ativações Estruturais Canal PCM (${calcResults.activationCount} eventos):`, 20, y + 36);
      doc.setFont("helvetica", "bold");
      doc.text(formatBRL(calcResults.valueActivations), 150, y + 36);

      // line of grand total
      doc.setDrawColor(212, 212, 216);
      doc.line(20, y + 40, 190, y + 40);

      doc.setTextColor(18, 117, 184); // #1275B8 brand color
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text("VALOR TOTAL A FATURAR:", 20, y + 46);
      doc.text(formatBRL(calcResults.grandTotal), 150, y + 46);

      y += 64;

      // 2. Coberturas and limit overview block
      doc.setTextColor(24, 24, 27);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text("COBERTURA DE FRANQUIAS E SLOTS DE CONSUMO", 15, y);

      doc.line(15, y + 2, 195, y + 2);

      y += 8;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(113, 113, 122);
      doc.text("Categoria Contratada", 18, y);
      doc.text("Chamados Registrados", 90, y);
      doc.text("Limite da Franquia", 130, y);
      doc.text("Excedentes", 165, y);

      doc.line(15, y + 2, 195, y + 2);
      
      y += 7;
      doc.setFont("helvetica", "normal");
      doc.setTextColor(39, 39, 42);
      doc.text("O.S Elétrica Básica (CH Mínimos)", 18, y);
      doc.text(`${calcResults.basicCount} CH`, 90, y);
      doc.text(`${CONSTANTS.LIMIT_BASICA} CH`, 130, y);
      
      if (calcResults.excessBasica > 0) {
        doc.setTextColor(225, 29, 72); // rose-600
        doc.setFont("helvetica", "bold");
      }
      doc.text(`${calcResults.excessBasica} CH`, 165, y);
      doc.setTextColor(39, 39, 42);
      doc.setFont("helvetica", "normal");

      y += 6;
      doc.setTextColor(39, 39, 42);
      doc.setFont("helvetica", "normal");
      doc.text("O.S Elétrica Crítica (CH Emergência)", 18, y);
      doc.text(`${calcResults.criticalCount} CH`, 90, y);
      doc.text(`${CONSTANTS.LIMIT_CRITICA} CH`, 130, y);
      
      if (calcResults.excessCritica > 0) {
        doc.setTextColor(225, 29, 72); // rose-600
        doc.setFont("helvetica", "bold");
      }
      doc.text(`${calcResults.excessCritica} CH`, 165, y);
      doc.setTextColor(39, 39, 42);
      doc.setFont("helvetica", "normal");

      y += 8;
      doc.line(15, y, 195, y);

      y += 12;

      // 3. Technical reports table
      doc.setTextColor(24, 24, 27);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text("RASTREABILIDADE DE CHAMADOS E ATENDIMENTOS NO MÊS", 15, y);
      
      doc.line(15, y + 2, 195, y + 2);
      y += 8;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(113, 113, 122);
      doc.text("Data", 18, y);
      doc.text("Protocolo", 35, y);
      doc.text("Localização", 55, y);
      doc.text("Serviço Executado & Solução Aplicada", 90, y);
      
      doc.line(15, y + 2, 195, y + 2);
      y += 6;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(39, 39, 42);

      const sortedRecords = [...activeRecords].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      
      if (sortedRecords.length === 0) {
        doc.text("Nenhum chamado de manutenção cadastrado para o mês especificado.", 18, y);
        y += 10;
      } else {
        for (let i = 0; i < sortedRecords.length; i++) {
          if (y > 265) {
            doc.addPage();
            y = 20;

            doc.setFont("helvetica", "bold");
            doc.setFontSize(8);
            doc.setTextColor(113, 113, 122);
            doc.text("UM TELECOM - INFRAESTRUTURA PCM - DETALHAMENTO DE ATENDIMENTOS (Cont.)", 15, y);
            doc.line(15, y + 2, 195, y + 2);
            y += 8;

            doc.setFont("helvetica", "bold");
            doc.text("Data", 18, y);
            doc.text("Protocolo", 35, y);
            doc.text("Localização", 55, y);
            doc.text("Serviço Executado & Solução Aplicada", 90, y);
            doc.line(15, y + 2, 195, y + 2);
            y += 6;
            
            doc.setFont("helvetica", "normal");
            doc.setFontSize(7.5);
            doc.setTextColor(39, 39, 42);
          }

          const r = sortedRecords[i];
          const categoryTag = r.category === 'eletrica' 
            ? `[Elétrica ${r.type === 'basica' ? 'Básica' : 'Crítica'}]` 
            : r.category === 'manutencao_pcm' ? '[Manut. PCM]' : '[Ativação]';
          
          const rawDate = r.date ? new Date(r.date + 'T00:00:00') : null;
          const dateStr = rawDate ? rawDate.toLocaleDateString('pt-BR') : '-';
          
          doc.setFont("helvetica", "bold");
          doc.text(dateStr, 18, y);
          doc.text(r.osNumber, 35, y);
          doc.text(r.location.substring(0, 16), 55, y);
          
          doc.setFont("helvetica", "normal");
          const descAndSol = `${categoryTag} ${r.notes} | ${r.solution || 'Concluído com sucesso.'}`;
          const maxChar = 75;
          const displayDesc = descAndSol.length > maxChar ? descAndSol.substring(0, maxChar) + '...' : descAndSol;
          doc.text(displayDesc, 90, y);

          y += 5.5;
        }
      }

      doc.save(`Relatorio_Faturamento_UmTelecom_${referenceMonth.replace('/', '_')}.pdf`);
      showToast("Relatório executivo PDF exportado com sucesso!");
    } catch (err) {
      console.error("Erro ao gerar PDF:", err);
      showToast("Erro ao exportar relatório PDF.", "error");
    }
  };

  // Save or update record (supports editing and adding)
  const handleSaveRecord = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formOsNumber.trim()) {
      showToast("Número do Protocolo é obrigatório.", "error");
      return;
    }
    if (formOsNumber.length !== 7) {
      showToast("O Protocolo deve conter exatamente 7 dígitos numéricos.", "error");
      return;
    }
    if (!formLocation.trim()) {
      showToast("LOCAL do Serviço é obrigatório.", "error");
      return;
    }

    // Check for duplicate protocol/OS number (preventing duplicate OS in systems)
    const isDuplicate = dbRecords.some(r => r.id !== editingRecordId && r.osNumber.trim() === formOsNumber.trim());
    if (isDuplicate) {
      showToast("Já existe um chamado cadastrado com este Protocolo técnico.", "error");
      return;
    }

    const uniqueId = editingRecordId || `um-telecom-${Date.now()}`;
    const newRecord: UmTelecomRecord = {
      id: uniqueId,
      referenceMonth: formReferenceMonth,
      category: formCategory,
      type: formCategory === 'eletrica' ? formEletricaType : null,
      osNumber: formOsNumber,
      date: formDate,
      location: formLocation,
      notes: formNotes || (formCategory === 'eletrica' 
        ? (formEletricaType === 'basica' ? 'Instalação ou substituição de estabilizador' : 'Instalação ou substituição de nobreak')
        : formCategory === 'manutencao_pcm' 
          ? 'Manutenção no PCM sob demanda' 
          : 'Nova ativação de PCM'),
      solution: formSolution || (formCategory === 'eletrica'
        ? 'Problema elétrico resolvido.'
        : formCategory === 'manutencao_pcm'
          ? 'Reparo concluído.'
          : 'Terminal PCM ativado com sucesso.')
    };

    try {
      // 1. Save to Firestore
      await setDoc(doc(db, 'umTelecomRecords', uniqueId), newRecord);

      if (editingRecordId) {
        showToast("Chamado atualizado com sucesso!", "success");
      } else {
        showToast("Chamado cadastrado com sucesso!", "success");
      }
      
      // Reset form fields
      setFormOsNumber('');
      setFormLocation('');
      setFormNotes('');
      setFormSolution('');
      setFormReferenceMonth(referenceMonth);
      setEditingRecordId(null);
      setShowAddForm(false);
    } catch (err) {
      console.error("Falha ao salvar no Firestore (usando fallback local):", err);
      
      let updatedRecords = [...dbRecords];
      if (editingRecordId) {
        updatedRecords = updatedRecords.map(r => r.id === editingRecordId ? newRecord : r);
        showToast("Atualizado localmente no navegador.", "info");
      } else {
        updatedRecords = [...updatedRecords, newRecord];
        showToast("Gravado localmente no navegador.", "info");
      }

      setDbRecords(updatedRecords);
      
      setFormOsNumber('');
      setFormLocation('');
      setFormNotes('');
      setFormSolution('');
      setFormReferenceMonth(referenceMonth);
      setEditingRecordId(null);
      setShowAddForm(false);

      // Mandatory Firestore Security/Permission Error handler
      handleFirestoreError(err, OperationType.WRITE, `umTelecomRecords/${uniqueId}`);
    }
  };

  const handleEditRecord = (record: UmTelecomRecord) => {
    setEditingRecordId(record.id);
    setFormCategory(record.category);
    setFormEletricaType(record.type || 'basica');
    setFormOsNumber(record.osNumber);
    setFormDate(record.date);
    setFormLocation(record.location);
    setFormNotes(record.notes);
    setFormSolution(record.solution || '');
    setFormReferenceMonth(record.referenceMonth);
    setShowAddForm(true);
    
    // Smooth scroll to the form section
    setTimeout(() => {
      const element = document.getElementById('new-ticket-form-section');
      if (element) {
        element.scrollIntoView({ behavior: 'smooth' });
      } else {
        window.scrollTo({ top: 350, behavior: 'smooth' });
      }
    }, 100);
  };

  // Delete record
  const handleDeleteRecord = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'umTelecomRecords', id));
      showToast("Chamado excluído com sucesso.");
    } catch (err) {
      console.error("Erro ao apagar:", err);
      setDbRecords(prev => prev.filter(r => r.id !== id));
      showToast("Apagado do cache local.");
      handleFirestoreError(err, OperationType.DELETE, `umTelecomRecords/${id}`);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in text-zinc-800 dark:text-zinc-100">
      
      {/* Toast Alert Banner */}
      {toast && (
        <div className="fixed top-5 right-5 z-50 flex items-center gap-3 px-4 py-3.5 rounded-2xl shadow-xl border bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 animate-slide-in">
          {toast.type === 'success' && <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />}
          {toast.type === 'info' && <Info className="h-5 w-5 text-blue-500 shrink-0" />}
          {toast.type === 'error' && <AlertTriangle className="h-5 w-5 text-rose-500 shrink-0" />}
          <span className="text-xs font-bold font-sans text-zinc-900 dark:text-zinc-100">{toast.message}</span>
        </div>
      )}

      {/* Title Header Card */}
      <div className="relative overflow-hidden rounded-3.5xl border border-zinc-200/80 dark:border-zinc-800/80 bg-white dark:bg-zinc-900 p-6 md:p-8 shadow-xs">
        <div className="absolute right-0 top-0 -mr-16 -mt-16 w-48 h-48 rounded-full bg-brand/5 dark:bg-brand/10 blur-3xl pointer-events-none" />
        <div className="absolute left-1/3 bottom-0 w-64 h-64 rounded-full bg-umtelecom/5 blur-3xl pointer-events-none" />
        
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-umtelecom/10 text-umtelecom dark:bg-zinc-800 dark:text-brand-light">
              <Zap className="h-3 w-3 animate-pulse text-umtelecom" />
              Um Telecom
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-zinc-900 dark:text-white font-sans flex items-center gap-2">
              Faturamento Infra e Elétrica PCM
            </h1>
            <p className="text-zinc-500 dark:text-zinc-400 text-sm max-w-2xl leading-relaxed">
              Consolidação de faturamento de manutenção elétrica estrutural e infraestrutura física de estações PCM.
            </p>
          </div>
          
          {/* Reference Month Selector & Export Controls */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
            {/* Reference Month Selector */}
            <div className="flex flex-col justify-center bg-zinc-50 dark:bg-zinc-950 px-5 py-3 rounded-2.5xl border border-zinc-200/50 dark:border-zinc-850/65 min-w-[220px]">
              <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest font-mono">Mês de Referência</span>
              <div className="relative mt-1">
                <select
                  value={referenceMonth}
                  onChange={(e) => setReferenceMonth(e.target.value)}
                  className="w-full bg-white dark:bg-zinc-900 border border-zinc-250 dark:border-zinc-800 rounded-xl px-3 py-1.5 text-xs font-bold text-zinc-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-umtelecom appearance-none cursor-pointer pr-10 shadow-xs"
                >
                  {availableMonths.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3.5 top-2.5 h-4 w-4 text-zinc-400 pointer-events-none" />
              </div>
            </div>

            {/* Export Buttons Group */}
            <div className="flex flex-row sm:flex-col gap-2 shrink-0">
              <button
                onClick={exportToExcel}
                className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-[11px] font-black uppercase tracking-wider transition-all shadow-xs cursor-pointer active:scale-95 duration-150"
                id="btn-export-excel"
              >
                <FileSpreadsheet className="h-4 w-4 text-white" />
                <span>Planilha Excel</span>
              </button>
              <button
                onClick={exportToPDF}
                className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl text-[11px] font-black uppercase tracking-wider transition-all shadow-xs cursor-pointer active:scale-95 duration-150"
                id="btn-export-pdf"
              >
                <FileText className="h-4 w-4 text-white" />
                <span>Relatório PDF</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Financial Overview Cards Grid */}
      <h2 className="text-xs font-black uppercase tracking-widest text-zinc-400 font-mono pl-1">
        Demonstrativo Consolidado do Mês ({referenceMonth})
      </h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Card 1: Franquia Básica Contratada */}
        <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200/85 dark:border-zinc-800/85 p-5 space-y-3 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 dark:bg-emerald-500/20 px-2 py-0.5 rounded-md font-mono">
              PREÇO FIXO MENSAL
            </span>
            <Layers className="h-4 w-4 text-zinc-400" />
          </div>
          <div>
            <span className="block text-[10px] text-zinc-400 font-bold uppercase tracking-wider font-mono">Franquia Infra PCM</span>
            <span className="block text-xl font-black text-zinc-900 dark:text-white mt-0.5">
              {formatBRL(CONSTANTS.FRANCHISE_BASE_COST)}
            </span>
            <p className="text-[10.5px] text-zinc-400 mt-1 lines-clamp-2">
              Franquia de 10 Básicas & 5 Críticas incluídas.
            </p>
          </div>
        </div>

        {/* Card 2: Excedentes de Elétrica */}
        <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200/85 dark:border-zinc-800/85 p-5 space-y-3 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 dark:bg-amber-500/20 px-2 py-0.5 rounded-md font-mono">
              R$ 1.499,35 / CH
            </span>
            <TrendingUp className="h-4 w-4 text-zinc-400" />
          </div>
          <div>
            <span className="block text-[10px] text-zinc-400 font-bold uppercase tracking-wider font-mono">Excedentes Elétrica</span>
            <span className="block text-xl font-black text-zinc-900 dark:text-white mt-0.5">
              {formatBRL(calcResults.valueExcess)}
            </span>
            <span className="text-[11px] font-mono text-zinc-400 mt-1 block">
              {calcResults.totalExcess} chamados excedentes
            </span>
          </div>
        </div>

        {/* Card 3: Manutenção sob Demanda */}
        <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200/85 dark:border-zinc-800/85 p-5 space-y-3 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-blue-600 dark:text-blue-450 bg-blue-500/10 dark:bg-blue-500/20 px-2 py-0.5 rounded-md font-mono">
              R$ 1.102,35 / UN
            </span>
            <Wrench className="h-4 w-4 text-zinc-400" />
          </div>
          <div>
            <span className="block text-[10px] text-zinc-400 font-bold uppercase tracking-wider font-mono">Manutenções PCM</span>
            <span className="block text-xl font-black text-zinc-900 dark:text-white mt-0.5">
              {formatBRL(calcResults.valueMaintenance)}
            </span>
            <span className="text-[11px] font-mono text-zinc-400 mt-1 block">
              {calcResults.maintenanceCount} eventos sob demanda
            </span>
          </div>
        </div>

        {/* Card 4: Novas Ativações de PCM */}
        <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200/85 dark:border-zinc-800/85 p-5 space-y-3 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-violet-600 dark:text-violet-400 bg-violet-500/10 dark:bg-violet-500/20 px-2 py-0.5 rounded-md font-mono">
              R$ 2.548,75 / UN
            </span>
            <Activity className="h-4 w-4 text-zinc-400" />
          </div>
          <div>
            <span className="block text-[10px] text-zinc-400 font-bold uppercase tracking-wider font-mono">Novas Ativações PCM</span>
            <span className="block text-xl font-black text-zinc-900 dark:text-white mt-0.5">
              {formatBRL(calcResults.valueActivations)}
            </span>
            <span className="text-[11px] font-mono text-zinc-400 mt-1 block">
              {calcResults.activationCount} ativações PCM
            </span>
          </div>
        </div>

        {/* Card 5: Grand Final Total */}
        <div className="bg-umtelecom text-white rounded-3xl border border-umtelecom-hover/80 p-5 space-y-3 shadow-lg shadow-umtelecom/15">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 bg-white/20 text-white rounded font-mono">
              FATURAMENTO TOTAL
            </span>
            <DollarSign className="h-4.5 w-4.5 text-white/80 shrink-0" />
          </div>
          <div>
            <span className="block text-[10px] text-white/75 font-bold uppercase tracking-wider font-mono">Total Geral do Mês</span>
            <span className="block text-2xl font-black text-white leading-tight mt-1">
              {formatBRL(calcResults.grandTotal)}
            </span>
            <span className="text-[10px] text-white/80 leading-relaxed mt-1 block font-mono">
              Total (Um Telecom)
            </span>
          </div>
        </div>
      </div>

      {/* Interactive Franchise Allocation Status */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 bg-white dark:bg-zinc-900 p-5 rounded-3xl border border-zinc-200/80 dark:border-zinc-800/85">
        
        {/* Elétrica Básica limits info */}
        <div className="space-y-3.5 p-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="p-1 px-1.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-350 text-[10px] font-bold font-mono">LIMIT: 10</span>
              <h3 className="text-xs font-black text-zinc-900 dark:text-white uppercase tracking-wider">O.S Elétrica Básica</h3>
            </div>
            <span className="text-xs font-mono font-bold">
              {calcResults.basicCount} / {CONSTANTS.LIMIT_BASICA}
            </span>
          </div>
          
          {/* Custom progress bar */}
          <div className="w-full bg-zinc-100 dark:bg-zinc-950 h-3.5 rounded-full overflow-hidden border border-zinc-200/40 dark:border-zinc-850/40 flex">
            {/* Filled green progress part */}
            <div 
              className={`h-full transition-all duration-500 ${calcResults.basicCount > CONSTANTS.LIMIT_BASICA ? 'bg-amber-500' : 'bg-emerald-500'}`}
              style={{ width: `${Math.min(100, (calcResults.basicCount / CONSTANTS.LIMIT_BASICA) * 100)}%` }}
            />
            {/* Excess red progress part if appropriate */}
            {calcResults.basicCount > CONSTANTS.LIMIT_BASICA && (
              <div 
                className="h-full bg-rose-500 animate-pulse transition-all duration-500"
                style={{ width: `${Math.min(100, ((calcResults.basicCount - CONSTANTS.LIMIT_BASICA) / CONSTANTS.LIMIT_BASICA) * 100)}%` }}
              />
            )}
          </div>
          
          <div className="flex items-center justify-between text-[11px] text-zinc-400">
            <span className="leading-tight">Instalação ou substituição de estabilizador</span>
            {calcResults.excessBasica > 0 && (
              <span className="text-rose-500 font-bold font-mono">+{calcResults.excessBasica} excedentes</span>
            )}
          </div>
        </div>

        {/* Elétrica Crítica limits info */}
        <div className="space-y-3.5 p-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="p-1 px-1.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-350 text-[10px] font-bold font-mono">LIMIT: 5</span>
              <h3 className="text-xs font-black text-zinc-900 dark:text-white uppercase tracking-wider">O.S Elétrica Crítica</h3>
            </div>
            <span className="text-xs font-mono font-bold">
              {calcResults.criticalCount} / {CONSTANTS.LIMIT_CRITICA}
            </span>
          </div>

          {/* Custom progress bar */}
          <div className="w-full bg-zinc-100 dark:bg-zinc-950 h-3.5 rounded-full overflow-hidden border border-zinc-200/40 dark:border-zinc-850/40 flex">
            <div 
              className={`h-full transition-all duration-500 ${calcResults.criticalCount > CONSTANTS.LIMIT_CRITICA ? 'bg-amber-500' : 'bg-emerald-500'}`}
              style={{ width: `${Math.min(100, (calcResults.criticalCount / CONSTANTS.LIMIT_CRITICA) * 100)}%` }}
            />
            {calcResults.criticalCount > CONSTANTS.LIMIT_CRITICA && (
              <div 
                className="h-full bg-rose-500 animate-pulse transition-all duration-500"
                style={{ width: `${Math.min(100, ((calcResults.criticalCount - CONSTANTS.LIMIT_CRITICA) / CONSTANTS.LIMIT_CRITICA) * 100)}%` }}
              />
            )}
          </div>

          <div className="flex items-center justify-between text-[11px] text-zinc-400">
            <span className="leading-tight">Instalação ou substituição de nobreak</span>
            {calcResults.excessCritica > 0 && (
              <span className="text-rose-500 font-bold font-mono">+{calcResults.excessCritica} excedentes</span>
            )}
          </div>
        </div>
      </div>

      {/* Main Operations Area with Tabs */}
      <div className="bg-white dark:bg-zinc-900 rounded-3.5xl border border-zinc-200/80 dark:border-zinc-800/80 shadow-xs overflow-hidden">
        
        {/* Sub Header tabs for PCM details */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between border-b border-zinc-150 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/20 p-2 sm:px-6 gap-4">
          <div className="flex items-center overflow-x-auto gap-1 scrollbar-none py-1">
            
            {/* Tab 1: Elétrica */}
            <button
              onClick={() => {
                setActiveSubTab('eletrica');
                setFormCategory('eletrica');
              }}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                activeSubTab === 'eletrica'
                  ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-950 shadow-sm'
                  : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-150/60 dark:hover:bg-zinc-855'
              }`}
            >
              <Zap className="h-3.5 w-3.5 shrink-0" />
              <span>O.S. de Elétrica</span>
              <span className="bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-400 text-[10px] px-1.5 py-0.2 rounded-full font-mono">
                {basicEletricaRecords.length + criticalEletricaRecords.length}
              </span>
            </button>

            {/* Tab 2: PCM Manutenção */}
            <button
              onClick={() => {
                setActiveSubTab('manutencao_pcm');
                setFormCategory('manutencao_pcm');
              }}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                activeSubTab === 'manutencao_pcm'
                  ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-950 shadow-sm'
                  : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-150/60 dark:hover:bg-zinc-855'
              }`}
            >
              <Wrench className="h-3.5 w-3.5 shrink-0" />
              <span>Manutenção PCM</span>
              <span className="bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-400 text-[10px] px-1.5 py-0.2 rounded-full font-mono">
                {maintenanceRecords.length}
              </span>
            </button>

            {/* Tab 3: PCM Ativações */}
            <button
              onClick={() => {
                setActiveSubTab('ativacao_pcm');
                setFormCategory('ativacao_pcm');
              }}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                activeSubTab === 'ativacao_pcm'
                  ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-950 shadow-sm'
                  : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-150/60 dark:hover:bg-zinc-855'
              }`}
            >
              <Activity className="h-3.5 w-3.5 shrink-0" />
              <span>Novas Ativações</span>
              <span className="bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-400 text-[10px] px-1.5 py-0.2 rounded-full font-mono">
                {activationRecords.length}
              </span>
            </button>
          </div>

          {/* Quick Actions (Cadastrar Novo) with dropdown to choose each type */}
          <div className="relative">
            <button
              onClick={() => setIsCreateDropdownOpen(!isCreateDropdownOpen)}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-umtelecom hover:bg-umtelecom-hover active:bg-umtelecom-active text-white text-xs font-black tracking-wide rounded-xl transition-all cursor-pointer shadow-md select-none"
            >
              <Plus className="h-4 w-4 text-white" />
              <span>CADASTRAR CHAMADO (POR TIPO)</span>
              <ChevronDown className={`h-3.5 w-3.5 text-white transition-transform duration-200 ${isCreateDropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {isCreateDropdownOpen && (
              <>
                <div 
                  className="fixed inset-0 z-40" 
                  onClick={() => setIsCreateDropdownOpen(false)}
                />
                <div className="absolute right-0 mt-2 w-72 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-xl z-50 overflow-hidden divide-y divide-zinc-100 dark:divide-zinc-850 animate-fade-in">
                  
                  <div className="p-2.5 space-y-1">
                    <span className="block px-3 py-1.5 text-[9px] font-bold text-zinc-400 uppercase tracking-widest font-mono">Selecione o Tipo</span>
                    
                    <button
                      type="button"
                      onClick={() => {
                        setFormCategory('eletrica');
                        setFormEletricaType('basica');
                        setShowAddForm(true);
                        setIsCreateDropdownOpen(false);
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left hover:bg-zinc-50 dark:hover:bg-zinc-850 text-xs font-bold text-zinc-700 dark:text-zinc-200 transition-all cursor-pointer"
                    >
                      <span className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0">
                        <Zap className="h-4 w-4" />
                      </span>
                      <div>
                        <span className="block font-black text-zinc-950 dark:text-white">🔌 Elétrica Básica</span>
                        <span className="block text-[10px] text-zinc-400 font-normal">Estabilizador de Energia</span>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setFormCategory('eletrica');
                        setFormEletricaType('critica');
                        setShowAddForm(true);
                        setIsCreateDropdownOpen(false);
                      }}
                      className="w-full flex items-center gap-3 px-3 py-1.5 rounded-xl text-left hover:bg-zinc-50 dark:hover:bg-zinc-850 text-xs font-bold text-zinc-700 dark:text-zinc-200 transition-all cursor-pointer"
                    >
                      <span className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 shrink-0">
                        <Zap className="h-4 w-4 animate-pulse" />
                      </span>
                      <div>
                        <span className="block font-black text-zinc-950 dark:text-white">⚡ Elétrica Crítica</span>
                        <span className="block text-[10px] text-zinc-400 font-normal">Nobreak Corporativo</span>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setFormCategory('manutencao_pcm');
                        setShowAddForm(true);
                        setIsCreateDropdownOpen(false);
                      }}
                      className="w-full flex items-center gap-3 px-3 py-1.5 rounded-xl text-left hover:bg-zinc-50 dark:hover:bg-zinc-850 text-xs font-bold text-zinc-700 dark:text-zinc-200 transition-all cursor-pointer"
                    >
                      <span className="p-1.5 rounded-lg bg-umtelecom/10 text-umtelecom dark:text-brand-light shrink-0">
                        <Wrench className="h-4 w-4" />
                      </span>
                      <div>
                        <span className="block font-black text-zinc-950 dark:text-white">🔧 Manutenção PCM</span>
                        <span className="block text-[10px] text-zinc-400 font-normal">Reparo corretivo sob demanda</span>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setFormCategory('ativacao_pcm');
                        setShowAddForm(true);
                        setIsCreateDropdownOpen(false);
                      }}
                      className="w-full flex items-center gap-3 px-3 py-1.5 rounded-xl text-left hover:bg-zinc-50 dark:hover:bg-zinc-850 text-xs font-bold text-zinc-700 dark:text-zinc-200 transition-all cursor-pointer"
                    >
                      <span className="p-1.5 rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400 shrink-0">
                        <Activity className="h-4 w-4" />
                      </span>
                      <div>
                        <span className="block font-black text-zinc-950 dark:text-white">🚀 Nova Ativação PCM</span>
                        <span className="block text-[10px] text-zinc-400 font-normal">Instalação e homologação</span>
                      </div>
                    </button>

                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Dynamic Expandable Form to Add/Register/Edit Calls */}
        {showAddForm && (
          <div id="new-ticket-form-section" className="bg-zinc-50/75 dark:bg-zinc-950/45 p-6 border-b border-zinc-150 dark:border-zinc-800 transition-all duration-300 animate-slide-down">
            <h3 className="font-black text-sm text-zinc-900 dark:text-white uppercase tracking-wider mb-4 flex items-center gap-2">
              <Layers className="h-4.5 w-4.5 text-umtelecom" />
              {editingRecordId ? 'Editar Registro de Chamado' : 'Novo Registro - Cadastro de Chamado'}
            </h3>
            
            <form onSubmit={handleSaveRecord} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 md:grid-cols-5 gap-4">
                
                {/* Tipo de Chamado / Categoria */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 font-mono">Tipo do Chamado (Cada Tipo)</label>
                  <select
                    value={formCategory}
                    onChange={(e) => {
                      const cat = e.target.value as 'eletrica' | 'manutencao_pcm' | 'ativacao_pcm';
                      setFormCategory(cat);
                    }}
                    className="w-full bg-white dark:bg-zinc-900 border border-zinc-250 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs font-bold text-zinc-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-umtelecom"
                  >
                    <option value="eletrica">🔌 Auditoria Elétrica</option>
                    <option value="manutencao_pcm">🔧 Manutenção PCM</option>
                    <option value="ativacao_pcm">⚡ Nova Ativação PCM</option>
                  </select>
                </div>

                {/* If Category is Elétrica, select 'Básica' or 'Crítica' */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 font-mono">Subtipo / Classificação</label>
                  {formCategory === 'eletrica' ? (
                    <select
                      value={formEletricaType}
                      onChange={(e) => setFormEletricaType(e.target.value as 'basica' | 'critica')}
                      className="w-full bg-white dark:bg-zinc-900 border border-zinc-250 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs font-bold text-zinc-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-umtelecom"
                    >
                      <option value="basica">Básica (Estabilizador)</option>
                      <option value="critica">Crítica (Nobreak)</option>
                    </select>
                  ) : (
                    <select
                      disabled
                      className="w-full bg-zinc-100 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-850 rounded-xl px-3 py-2 text-xs font-bold text-zinc-400 dark:text-zinc-600 cursor-not-allowed"
                    >
                      <option>Não aplicável</option>
                    </select>
                  )}
                </div>

                {/* Reference Month Input */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 font-mono">Mês de Referência</label>
                  <div className="relative">
                    <select
                      value={formReferenceMonth}
                      onChange={(e) => setFormReferenceMonth(e.target.value)}
                      className="w-full bg-white dark:bg-zinc-900 border border-zinc-250 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs font-bold text-zinc-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-umtelecom appearance-none cursor-pointer pr-10"
                    >
                      {availableMonths.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-2.5 h-4 w-4 text-zinc-400 pointer-events-none" />
                  </div>
                </div>

                {/* Date Input */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 font-mono">Data do Serviço</label>
                  <div className="relative">
                    <input
                      type="date"
                      value={formDate}
                      onChange={(e) => setFormDate(e.target.value)}
                      required
                      className="w-full bg-white dark:bg-zinc-900 border border-zinc-250 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs font-bold text-zinc-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-umtelecom"
                    />
                    <Calendar className="absolute right-3 top-2.5 h-4 w-4 text-zinc-400 pointer-events-none" />
                  </div>
                </div>

                {/* OS Protocol Number */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 font-mono">
                    Protocolo
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: 1234567"
                    value={formOsNumber}
                    onChange={(e) => {
                      const cleanVal = e.target.value.replace(/\D/g, '');
                      setFormOsNumber(cleanVal);
                    }}
                    required
                    maxLength={7}
                    className="w-full bg-white dark:bg-zinc-900 border border-zinc-250 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs font-bold text-zinc-800 dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-umtelecom"
                  />
                </div>

              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                
                {/* Location Department */}
                <div className="space-y-1.5 md:col-span-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 font-mono">LOCAL</label>
                  <input
                    type="text"
                    placeholder="Ex: SEE Escola Integral"
                    value={formLocation}
                    onChange={(e) => setFormLocation(e.target.value)}
                    required
                    className="w-full bg-white dark:bg-zinc-900 border border-zinc-250 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs font-bold text-zinc-800 dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-umtelecom"
                  />
                </div>

                {/* Notes / Details */}
                <div className="space-y-1.5 md:col-span-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 font-mono">Observações / Detalhes</label>
                  <input
                    type="text"
                    placeholder="Substituição ou instalação corretiva..."
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.target.value)}
                    className="w-full bg-white dark:bg-zinc-900 border border-zinc-250 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs font-medium text-zinc-800 dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-umtelecom"
                  />
                </div>

                {/* Solução Aplicada */}
                <div className="space-y-1.5 md:col-span-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 font-mono">Solução Aplicada</label>
                  <input
                    type="text"
                    placeholder="Ex: Dispositivo testado e em funcionamento"
                    value={formSolution}
                    onChange={(e) => setFormSolution(e.target.value)}
                    className="w-full bg-white dark:bg-zinc-900 border border-zinc-250 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs font-medium text-zinc-800 dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-umtelecom"
                  />
                </div>

                {/* Actions buttons */}
                <div className="flex gap-2 justify-end md:col-span-1 pb-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddForm(false);
                      setEditingRecordId(null);
                      setFormLocation('');
                      setFormOsNumber('');
                      setFormNotes('');
                      setFormSolution('');
                      setFormReferenceMonth(referenceMonth);
                    }}
                    className="px-4 py-2 bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-xl text-xs font-black cursor-pointer shadow-xs whitespace-nowrap hover:bg-zinc-300 dark:hover:bg-zinc-750 transition-all font-sans"
                  >
                    CANCELAR
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-umtelecom hover:bg-umtelecom-hover text-white rounded-xl text-xs font-black cursor-pointer shadow-sm whitespace-nowrap transition-all font-sans"
                  >
                    {editingRecordId ? 'ATUALIZAR' : 'SALVAR'}
                  </button>
                </div>

              </div>
            </form>
          </div>
        )}

        {/* List Content and Tables Area */}
        <div className="p-4 sm:p-6 space-y-6">
          
          {/* Campo de Busca por Protocolo e Local */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-zinc-50 dark:bg-zinc-950 p-4 rounded-2xl border border-zinc-150 dark:border-zinc-850/60 shadow-xs">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-zinc-400" />
              <input
                id="umtelecom-search-input"
                type="text"
                placeholder="Pesquisar por protocolo ou local..."
                value={tableSearchQuery}
                onChange={(e) => setTableSearchQuery(e.target.value)}
                className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl py-2 pl-10 pr-10 text-xs text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-umtelecom font-sans"
              />
              {tableSearchQuery && (
                <button
                  type="button"
                  onClick={() => setTableSearchQuery('')}
                  className="absolute right-3 top-2.5 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors cursor-pointer"
                  title="Limpar pesquisa"
                >
                  ✕
                </button>
              )}
            </div>
            <div className="text-[10px] text-zinc-400 dark:text-zinc-500 font-mono font-bold uppercase tracking-wider self-center text-right">
              {tableSearchQuery ? 'Filtrando resultados nesta tabela' : 'Buscando em todos os chamados'}
            </div>
          </div>
          
          {/* TAB 1: REGISTROS DE ELÉTRICA (BÁSICA E CRÍTICA) */}
          {activeSubTab === 'eletrica' && (
            <div className="space-y-5">
              
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-zinc-100 dark:border-zinc-850 pb-4">
                <div className="space-y-1">
                  <h3 className="font-bold text-zinc-900 dark:text-white text-sm">Controle de Chamados de Elétrica PCM</h3>
                  <p className="text-xs text-zinc-450 dark:text-zinc-500">
                    O.Ss Básicas (Limite 10) e O.Ss Críticas (Limite 5) incluídas no pacote de franquia. Excedentes são tarifadas à R$ 1.499,35 cada.
                  </p>
                </div>
                
                {/* Statistics panel */}
                <div className="flex gap-4">
                  <div className="bg-zinc-50 dark:bg-zinc-950 p-3 rounded-2xl border border-zinc-150 dark:border-zinc-850/70 text-center">
                    <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest block font-mono">Básicas Usadas</span>
                    <span className="text-sm font-black font-mono block mt-0.5">{calcResults.basicCount} / 10</span>
                  </div>
                  <div className="bg-zinc-50 dark:bg-zinc-950 p-3 rounded-2xl border border-zinc-150 dark:border-zinc-850/70 text-center">
                    <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest block font-mono">Críticas Usadas</span>
                    <span className="text-sm font-black font-mono block mt-0.5">{calcResults.criticalCount} / 5</span>
                  </div>
                  <div className="bg-zinc-50 dark:bg-zinc-950 p-3 rounded-2xl border border-zinc-150 dark:border-zinc-850/70 text-center">
                    <span className="text-[9px] font-bold text-rose-500 uppercase tracking-widest block font-mono">Excedente Total</span>
                    <span className="text-sm font-black font-mono text-rose-500 block mt-0.5">+{calcResults.totalExcess}</span>
                  </div>
                </div>
              </div>

              {filteredBasicEletricaRecords.length === 0 && filteredCriticalEletricaRecords.length === 0 ? (
                <div className="text-center py-12 bg-zinc-50 dark:bg-zinc-950 rounded-3xl border border-zinc-200/50 dark:border-zinc-850/40">
                  <Zap className="h-10 w-10 mx-auto text-zinc-300 dark:text-zinc-700 animate-bounce" />
                  <h4 className="mt-4 font-bold text-zinc-800 dark:text-zinc-200">Sem chamados localizados</h4>
                  <p className="text-xs text-zinc-450 dark:text-zinc-500 max-w-sm mx-auto mt-1 leading-relaxed">
                    {tableSearchQuery 
                      ? 'Nenhum chamado de elétrica corresponde aos termos de pesquisa fornecidos.' 
                      : 'Não foram localizados chamados de elétrica para este mês de referência. Clique em "CADASTRAR CHAMADO" para registrar.'}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-zinc-100 dark:border-zinc-800">
                  <table className="w-full min-w-[950px] text-left border-collapse">
                    <thead>
                      <tr className="bg-zinc-50 dark:bg-zinc-950 text-[10px] font-black uppercase tracking-wider text-zinc-400 font-mono border-b border-zinc-150 dark:border-zinc-800">
                        <th className="p-4">Data</th>
                        <th className="p-4">Protocolo</th>
                        <th className="p-4">Classificação</th>
                        <th className="p-4">LOCAL</th>
                        <th className="p-4 w-[180px] max-w-[180px]">Descrição do Serviço</th>
                        <th className="p-4 w-[180px] max-w-[180px]">Solução</th>
                        <th className="p-4 text-center">Faturamento</th>
                        <th className="p-4 text-center">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-850 text-xs">
                      {/* 1. Basic Eletrica Rows */}
                      {filteredBasicEletricaRecords.map((record, index) => {
                        const isExcess = index >= CONSTANTS.LIMIT_BASICA;
                        return (
                          <tr key={record.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-950/20 transition-all">
                            <td className="p-4 font-bold font-mono text-zinc-500 whitespace-nowrap">
                              {new Date(record.date).toLocaleDateString('pt-BR', {timeZone: 'UTC'})}
                            </td>
                            <td className="p-4 font-bold text-zinc-900 dark:text-white font-mono whitespace-nowrap">
                              {record.osNumber}
                            </td>
                            <td className="p-4 whitespace-nowrap">
                              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md font-bold uppercase text-[9px] bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-mono">
                                🔌 Elétrica Básica
                              </span>
                            </td>
                            <td className="p-4 font-bold text-zinc-700 dark:text-zinc-300">
                              {record.location}
                            </td>
                            <td className="p-4 text-zinc-450 dark:text-zinc-400 max-w-[180px] truncate" title={record.notes}>
                              {record.notes}
                            </td>
                            <td className="p-4 text-zinc-650 dark:text-zinc-300 font-medium max-w-[180px] truncate" title={record.solution || 'Problema elétrico resolvido.'}>
                              {record.solution || 'Problema elétrico resolvido.'}
                            </td>
                            <td className="p-4 text-center whitespace-nowrap">
                              {isExcess ? (
                                <span className="inline-flex flex-col text-right">
                                  <span className="text-[9px] font-bold text-rose-500 font-mono uppercase bg-rose-500/10 px-1.5 py-0.5 rounded-md">
                                    EXCEDENTE #{index + 1}
                                  </span>
                                  <span className="text-rose-500 font-bold font-mono mt-1 block">
                                    +{formatBRL(CONSTANTS.COST_EXCEDENTE)}
                                  </span>
                                </span>
                              ) : (
                                <span className="inline-flex flex-col text-right">
                                  <span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 font-mono uppercase bg-emerald-500/10 px-1.5 py-0.5 rounded-md">
                                    FRANQUIA {index + 1}/10
                                  </span>
                                  <span className="text-zinc-400 font-medium font-mono mt-1 block">
                                    R$ 0,00
                                  </span>
                                </span>
                              )}
                            </td>
                            <td className="p-4 text-center">
                              <div className="flex items-center justify-center gap-1.5">
                                <button
                                  onClick={() => handleEditRecord(record)}
                                  className="p-1.5 text-zinc-450 hover:text-umtelecom hover:bg-umtelecom/10 dark:hover:bg-umtelecom/20 rounded-lg transition-all cursor-pointer"
                                  title="Editar"
                                >
                                  <Edit className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={() => setDeleteRecordId(record.id)}
                                  className="p-1.5 text-zinc-450 hover:text-rose-600 hover:bg-rose-500/5 dark:hover:bg-rose-550/10 rounded-lg transition-all cursor-pointer"
                                  title="Excluir"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}

                      {/* 2. Critical Eletrica Rows */}
                      {filteredCriticalEletricaRecords.map((record, index) => {
                        const isExcess = index >= CONSTANTS.LIMIT_CRITICA;
                        return (
                          <tr key={record.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-950/20 transition-all">
                            <td className="p-4 font-bold font-mono text-zinc-500 whitespace-nowrap">
                              {new Date(record.date).toLocaleDateString('pt-BR', {timeZone: 'UTC'})}
                            </td>
                            <td className="p-4 font-bold text-zinc-900 dark:text-white font-mono whitespace-nowrap">
                              {record.osNumber}
                            </td>
                            <td className="p-4 whitespace-nowrap">
                              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md font-bold uppercase text-[9px] bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 font-mono">
                                ⚡ Elétrica Crítica
                              </span>
                            </td>
                            <td className="p-4 font-bold text-zinc-700 dark:text-zinc-300">
                              {record.location}
                            </td>
                            <td className="p-4 text-zinc-450 dark:text-zinc-400 max-w-[180px] truncate" title={record.notes}>
                              {record.notes}
                            </td>
                            <td className="p-4 text-zinc-650 dark:text-zinc-300 font-medium max-w-[180px] truncate" title={record.solution || 'Problema elétrico resolvido.'}>
                              {record.solution || 'Problema elétrico resolvido.'}
                            </td>
                            <td className="p-4 text-center whitespace-nowrap">
                              {isExcess ? (
                                <span className="inline-flex flex-col text-right">
                                  <span className="text-[9px] font-bold text-rose-500 font-mono uppercase bg-rose-500/10 px-1.5 py-0.5 rounded-md">
                                    EXCEDENTE #{index + 1}
                                  </span>
                                  <span className="text-rose-500 font-bold font-mono mt-1 block">
                                    +{formatBRL(CONSTANTS.COST_EXCEDENTE)}
                                  </span>
                                </span>
                              ) : (
                                <span className="inline-flex flex-col text-right">
                                  <span className="text-[9px] font-bold text-umtelecom dark:text-brand-light font-mono uppercase bg-umtelecom/10 px-1.5 py-0.5 rounded-md">
                                    FRANQUIA {index + 1}/5
                                  </span>
                                  <span className="text-zinc-400 font-medium font-mono mt-1 block">
                                    R$ 0,00
                                  </span>
                                </span>
                              )}
                            </td>
                            <td className="p-4 text-center">
                              <div className="flex items-center justify-center gap-1.5">
                                <button
                                  onClick={() => handleEditRecord(record)}
                                  className="p-1.5 text-zinc-450 hover:text-umtelecom hover:bg-umtelecom/10 dark:hover:bg-umtelecom/20 rounded-lg transition-all cursor-pointer"
                                  title="Editar"
                                >
                                  <Edit className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={() => setDeleteRecordId(record.id)}
                                  className="p-1.5 text-zinc-450 hover:text-rose-600 hover:bg-rose-500/5 dark:hover:bg-rose-550/10 rounded-lg transition-all cursor-pointer"
                                  title="Excluir"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: MANUTENÇÃO NO PCM SOB DEMANDA */}
          {activeSubTab === 'manutencao_pcm' && (
            <div className="space-y-5">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-zinc-100 dark:border-zinc-850 pb-4">
                <div className="space-y-1">
                  <h3 className="font-bold text-zinc-900 dark:text-white text-sm">Controle de Manutenção de PCM (Sob Demanda)</h3>
                  <p className="text-xs text-zinc-450 dark:text-zinc-500">
                    Ocorrências de reparos, reinstalações ou chamados corretivos por solicitação técnica especial. Valor tabelado de R$ 1.102,35 por atendimento.
                  </p>
                </div>
                
                <div className="bg-zinc-50 dark:bg-zinc-950 p-3 px-5 rounded-2xl border border-zinc-150 dark:border-zinc-850/70 text-right shrink-0">
                  <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest block font-mono">Consolidado do Mês</span>
                  <span className="text-sm font-black font-mono block mt-0.5 text-umtelecom dark:text-brand-light">
                    {formatBRL(calcResults.valueMaintenance)}
                  </span>
                </div>
              </div>

              {filteredMaintenanceRecords.length === 0 ? (
                <div className="text-center py-12 bg-zinc-50 dark:bg-zinc-950 rounded-3xl border border-zinc-200/50 dark:border-zinc-850/40">
                  <Wrench className="h-10 w-10 mx-auto text-zinc-300 dark:text-zinc-700" />
                  <h4 className="mt-4 font-bold text-zinc-800 dark:text-zinc-200">Sem manutenções localizadas</h4>
                  <p className="text-xs text-zinc-450 dark:text-zinc-500 max-w-sm mx-auto mt-1 leading-relaxed">
                    {tableSearchQuery 
                      ? 'Nenhuma manutenção corresponde aos termos de pesquisa fornecidos.' 
                      : 'Não foram registradas ocorrências de manutenção na estação PCM para este mês de referência. Clique em "CADASTRAR CHAMADO" para registrar.'}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-zinc-100 dark:border-zinc-800">
                  <table className="w-full min-w-[950px] text-left border-collapse">
                    <thead>
                      <tr className="bg-zinc-50 dark:bg-zinc-950 text-[10px] font-black uppercase tracking-wider text-zinc-400 font-mono border-b border-zinc-150 dark:border-zinc-800">
                        <th className="p-4">Data</th>
                        <th className="p-4">Protocolo</th>
                        <th className="p-4">LOCAL</th>
                        <th className="p-4 w-[180px] max-w-[180px]">Detalhamento Técnico</th>
                        <th className="p-4 w-[180px] max-w-[180px]">Solução</th>
                        <th className="p-4 text-right">Valor Unitário</th>
                        <th className="p-4 text-center">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-850 text-xs">
                      {filteredMaintenanceRecords.map((record, index) => (
                        <tr key={record.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-950/20 transition-all">
                          <td className="p-4 font-bold font-mono text-zinc-500 whitespace-nowrap">
                            {new Date(record.date).toLocaleDateString('pt-BR', {timeZone: 'UTC'})}
                          </td>
                          <td className="p-4 font-bold text-zinc-900 dark:text-white font-mono whitespace-nowrap">
                            {record.osNumber}
                          </td>
                          <td className="p-4 font-bold text-zinc-700 dark:text-zinc-300">
                            {record.location}
                          </td>
                          <td className="p-4 text-zinc-450 dark:text-zinc-400 max-w-[180px] truncate" title={record.notes}>
                            {record.notes}
                          </td>
                          <td className="p-4 text-zinc-650 dark:text-zinc-300 font-medium max-w-[180px] truncate" title={record.solution || 'Reparo concluído.'}>
                            {record.solution || 'Reparo concluído.'}
                          </td>
                          <td className="p-4 text-right font-bold font-mono text-umtelecom dark:text-brand-light whitespace-nowrap">
                            {formatBRL(CONSTANTS.COST_MANUTENCAO)}
                          </td>
                          <td className="p-4 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                onClick={() => handleEditRecord(record)}
                                className="p-1.5 text-zinc-450 hover:text-umtelecom hover:bg-umtelecom/10 dark:hover:bg-umtelecom/20 rounded-lg transition-all cursor-pointer"
                                title="Editar"
                              >
                                <Edit className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => setDeleteRecordId(record.id)}
                                className="p-1.5 text-zinc-450 hover:text-rose-600 hover:bg-rose-500/5 dark:hover:bg-rose-550/10 rounded-lg transition-all cursor-pointer"
                                title="Excluir"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: NOVAS ATIVAÇÕES DE PCM */}
          {activeSubTab === 'ativacao_pcm' && (
            <div className="space-y-5">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-zinc-100 dark:border-zinc-850 pb-4">
                <div className="space-y-1">
                  <h3 className="font-bold text-zinc-900 dark:text-white text-sm">Controle de Novas Ativações de PCM</h3>
                  <p className="text-xs text-zinc-450 dark:text-zinc-500">
                    Ativações, implantações estruturais e instalações físicas de novos terminais PCM, e remanejamentos internos. Valor tabelado de R$ 2.548,75 por atividade.
                  </p>
                </div>
                
                <div className="bg-zinc-50 dark:bg-zinc-950 p-3 px-5 rounded-2xl border border-zinc-150 dark:border-zinc-850/70 text-right shrink-0">
                  <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest block font-mono">Consolidado do Mês</span>
                  <span className="text-sm font-black font-mono block mt-0.5 text-violet-600 dark:text-violet-400">
                    {formatBRL(calcResults.valueActivations)}
                  </span>
                </div>
              </div>

              {filteredActivationRecords.length === 0 ? (
                <div className="text-center py-12 bg-zinc-50 dark:bg-zinc-950 rounded-3xl border border-zinc-200/50 dark:border-zinc-850/40">
                  <Activity className="h-10 w-10 mx-auto text-zinc-300 dark:text-zinc-700" />
                  <h4 className="mt-4 font-bold text-zinc-800 dark:text-zinc-200">Sem ativações localizadas</h4>
                  <p className="text-xs text-zinc-450 dark:text-zinc-500 max-w-sm mx-auto mt-1 leading-relaxed">
                    {tableSearchQuery 
                      ? 'Nenhuma ativação corresponde aos termos de pesquisa fornecidos.' 
                      : 'Não foram registradas novas ativações do terminal PCM para este mês de referência. Clique em "CADASTRAR CHAMADO" para registrar.'}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-zinc-100 dark:border-zinc-800">
                  <table className="w-full min-w-[950px] text-left border-collapse">
                    <thead>
                      <tr className="bg-zinc-50 dark:bg-zinc-950 text-[10px] font-black uppercase tracking-wider text-zinc-400 font-mono border-b border-zinc-150 dark:border-zinc-800">
                        <th className="p-4">Data</th>
                        <th className="p-4">Protocolo</th>
                        <th className="p-4">LOCAL</th>
                        <th className="p-4 w-[180px] max-w-[180px]">Detalhamento Técnico</th>
                        <th className="p-4 w-[180px] max-w-[180px]">Solução</th>
                        <th className="p-4 text-right">Valor Unitário</th>
                        <th className="p-4 text-center">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-850 text-xs">
                      {filteredActivationRecords.map((record, index) => (
                        <tr key={record.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-950/20 transition-all">
                          <td className="p-4 font-bold font-mono text-zinc-500 whitespace-nowrap">
                            {new Date(record.date).toLocaleDateString('pt-BR', {timeZone: 'UTC'})}
                          </td>
                          <td className="p-4 font-bold text-zinc-900 dark:text-white font-mono whitespace-nowrap">
                            {record.osNumber}
                          </td>
                          <td className="p-4 font-bold text-zinc-700 dark:text-zinc-300">
                            {record.location}
                          </td>
                          <td className="p-4 text-zinc-450 dark:text-zinc-400 max-w-[180px] truncate" title={record.notes}>
                            {record.notes}
                          </td>
                          <td className="p-4 text-zinc-650 dark:text-zinc-300 font-medium max-w-[180px] truncate" title={record.solution || 'Terminal PCM ativado com sucesso.'}>
                            {record.solution || 'Terminal PCM ativado com sucesso.'}
                          </td>
                          <td className="p-4 text-right font-bold font-mono text-violet-600 dark:text-violet-400 whitespace-nowrap">
                            {formatBRL(CONSTANTS.COST_ATIVACAO)}
                          </td>
                          <td className="p-4 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                onClick={() => handleEditRecord(record)}
                                className="p-1.5 text-zinc-450 hover:text-umtelecom hover:bg-umtelecom/10 dark:hover:bg-umtelecom/20 rounded-lg transition-all cursor-pointer"
                                title="Editar"
                              >
                                <Edit className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => setDeleteRecordId(record.id)}
                                className="p-1.5 text-zinc-450 hover:text-rose-600 hover:bg-rose-500/5 dark:hover:bg-rose-550/10 rounded-lg transition-all cursor-pointer"
                                title="Excluir"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

        </div>
      </div>

      {/* Visual Delete Confirmation Modal to avoid browser sandboxing constraints */}
      {deleteRecordId && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-zinc-950/65 backdrop-blur-xs">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 max-w-sm w-full shadow-2xl animate-scale-up">
            <div className="flex items-center gap-3 text-rose-500 mb-3">
              <AlertTriangle className="h-6 w-6" />
              <h4 className="font-extrabold text-sm uppercase tracking-wider font-sans">Confirmar Exclusão</h4>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-6 leading-relaxed">
              Tem certeza que deseja apagar este chamado? Esta ação não pode ser desfeita.
            </p>
            <div className="flex justify-end gap-2.5">
              <button
                onClick={() => setDeleteRecordId(null)}
                className="px-4 py-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-750 text-zinc-700 dark:text-zinc-300 rounded-xl text-xs font-black transition-all cursor-pointer"
              >
                CANCELAR
              </button>
              <button
                onClick={() => {
                  if (deleteRecordId) {
                    handleDeleteRecord(deleteRecordId);
                    setDeleteRecordId(null);
                  }
                }}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white rounded-xl text-xs font-black transition-all cursor-pointer shadow-md shadow-rose-500/10"
              >
                CONFIRMAR
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
