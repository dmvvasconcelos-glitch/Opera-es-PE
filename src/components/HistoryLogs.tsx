import React, { useEffect, useState, useMemo } from 'react';
import { 
  collection, 
  getDocs, 
  query, 
  orderBy,
  doc,
  deleteDoc
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { 
  Calendar, 
  User, 
  DollarSign, 
  Layers, 
  Search, 
  ArrowLeft, 
  CalendarClock, 
  Printer, 
  RefreshCw, 
  TrendingUp, 
  ChevronsUpDown,
  Building,
  CheckCircle,
  FileText,
  Download,
  Trash2
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import { formatCurrency, PVF_LABELS } from '../data';
import { PvfKey, UserSession } from '../types';

interface ContractSnapshot {
  id: string;
  contrato: string;
  secretaria: string;
  quantities: Record<string, number>;
  status: string;
  dataAssinatura?: string;
}

interface BillingSnapshotDoc {
  id: string;
  referenceMonth: string;
  savedAt: any;
  savedBy: string;
  totalPvfCount: number;
  totalBilling: number;
  contracts: ContractSnapshot[];
  prices: Record<string, number>;
  createdAt?: any;
}

interface HistoryLogsProps {
  user?: UserSession | null;
}

export default function HistoryLogs({ user }: HistoryLogsProps) {
  const [snapshots, setSnapshots] = useState<BillingSnapshotDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSnapshot, setSelectedSnapshot] = useState<BillingSnapshotDoc | null>(null);
  const [snapshotToDelete, setSnapshotToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const getSnapshotContractValue = (c: any, prices: Record<string, number>) => {
    let val = 0;
    if (!c.quantities) return 0;
    Object.entries(c.quantities).forEach(([key, q]) => {
      const price = prices[key] || 0;
      val += Number(q || 0) * price;
    });
    return val;
  };

  const getSnapshotPvfTotal = (c: any) => {
    if (!c.quantities) return 0;
    return Object.values(c.quantities).reduce((acc: number, curr: any) => acc + Number(curr || 0), 0);
  };

  const processedSnapshots = useMemo(() => {
    if (user && user.role === 'cliente') {
      const allowed = user.secretarias || [];
      return snapshots.map(snap => {
        const filteredContracts = (snap.contracts || []).filter(c => allowed.includes(c.secretaria));
        const totalBilling = filteredContracts.reduce((acc, c) => {
          if (c.status === 'Ativo') {
            return acc + getSnapshotContractValue(c, snap.prices || {});
          }
          return acc;
        }, 0);
        const totalPvfCount = filteredContracts.reduce((acc, c) => {
          if (c.status === 'Ativo') {
            return acc + getSnapshotPvfTotal(c);
          }
          return acc;
        }, 0);
        return {
          ...snap,
          contracts: filteredContracts,
          totalBilling,
          totalPvfCount
        };
      });
    }
    return snapshots;
  }, [snapshots, user]);

  const processedSelectedSnapshot = useMemo(() => {
    if (!selectedSnapshot) return null;
    if (user && user.role === 'cliente') {
      const allowed = user.secretarias || [];
      const filteredContracts = (selectedSnapshot.contracts || []).filter(c => allowed.includes(c.secretaria));
      const totalBilling = filteredContracts.reduce((acc, c) => {
        if (c.status === 'Ativo') {
          return acc + getSnapshotContractValue(c, selectedSnapshot.prices || {});
        }
        return acc;
      }, 0);
      const totalPvfCount = filteredContracts.reduce((acc, c) => {
        if (c.status === 'Ativo') {
          return acc + getSnapshotPvfTotal(c);
        }
        return acc;
      }, 0);
      return {
        ...selectedSnapshot,
        contracts: filteredContracts,
        totalBilling,
        totalPvfCount
      };
    }
    return selectedSnapshot;
  }, [selectedSnapshot, user]);

  const handleDeleteConfirm = async () => {
    if (!snapshotToDelete) return;
    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, 'monthlyBillingSnapshots', snapshotToDelete));
      
      // Update local state by removing the deleted snapshot
      setSnapshots(prev => prev.filter(s => s.id !== snapshotToDelete));
      
      // If we are currently viewing the deleted snapshot, deselect it
      if (selectedSnapshot?.id === snapshotToDelete) {
        setSelectedSnapshot(null);
      }
      
      setSnapshotToDelete(null);
    } catch (err) {
      console.error("Erro ao apagar snapshot:", err);
      try {
        handleFirestoreError(err, OperationType.DELETE, `monthlyBillingSnapshots/${snapshotToDelete}`);
      } catch (formattedErr) {
        console.error("Erro formatado do Firestore:", formattedErr);
      }
      alert("Erro ao apagar o faturamento salvo. Verifique suas permissões no banco de dados.");
    } finally {
      setIsDeleting(false);
    }
  };

  const fetchSnapshots = async () => {
    setLoading(true);
    setError(null);
    try {
      const q = query(
        collection(db, 'monthlyBillingSnapshots'), 
        orderBy('createdAt', 'desc')
      );
      const querySnapshot = await getDocs(q);
      const docs: BillingSnapshotDoc[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        docs.push({
          id: doc.id,
          referenceMonth: data.referenceMonth,
          savedAt: data.savedAt,
          savedBy: data.savedBy,
          totalPvfCount: data.totalPvfCount,
          totalBilling: data.totalBilling,
          contracts: data.contracts || [],
          prices: data.prices || {},
          createdAt: data.createdAt
        });
      });
      setSnapshots(docs);
    } catch (err) {
      console.error("Erro no fetch de snapshots:", err);
      // Log/throw standard FirestoreErrorInfo to help the platform diagnose if any security permission issues persist
      try {
        handleFirestoreError(err, OperationType.LIST, 'monthlyBillingSnapshots');
      } catch (formattedErr) {
        console.error("Erro formatado do Firestore:", formattedErr);
      }
      setError('Erro ao carregar os dados salvos do Firestore. Verifique se as permissões e conexões estão ativas.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSnapshots();
  }, []);

  const handlePrint = () => {
    window.focus();
    window.print();
  };

  const handleDownloadPDF = () => {
    const snap = processedSelectedSnapshot;
    if (!snap) return;
    
    const activeContractsCount = snap.contracts.filter(c => c.status === 'Ativo').length;
    const doc = new jsPDF();
    
    // Header brand banner
    doc.setFillColor(30, 41, 59); // zinc-800
    doc.rect(0, 0, 210, 36, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('MÉTODO TELECOMUNICAÇÕES - PECONECTADO II', 15, 14);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Faturamento Consolidado - Mês de Referência: ${snap.referenceMonth}`, 15, 22);
    
    doc.setFontSize(8);
    doc.setTextColor(156, 163, 175);
    doc.text('Histórico de Faturamento Arquivado Automatizado para Auditoria e Conferência', 15, 29);
    
    // Audit logs metadata section
    let y = 46;
    doc.setFillColor(244, 244, 245);
    doc.rect(15, y, 180, 24, 'F');
    doc.setDrawColor(228, 228, 230);
    doc.rect(15, y, 180, 24, 'D');
    
    doc.setTextColor(113, 113, 122);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('AUDITORIA DE CRIAÇÃO E PROCESSAMENTO', 20, y + 6);
    
    doc.setTextColor(39, 39, 42);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`Operador Responsável: ${snap.savedBy}`, 20, y + 13);
    doc.text(`Data e Hora do Registro: ${formatDateTime(snap.savedAt, snap.createdAt)}`, 20, y + 19);
    
    // Summary metrics indicators cards
    y = 78;
    doc.setTextColor(30, 41, 59);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('RESUMO DE DADOS FINANCEIROS', 15, y);
    
    const cardWidth = 57;
    const cardGap = 4;
    const cardHeight = 22;
    
    // Card 1: Total PVF Count
    doc.setFillColor(238, 242, 255); // Indigo BG
    doc.rect(15, y + 4, cardWidth, cardHeight, 'F');
    doc.setDrawColor(199, 210, 254);
    doc.rect(15, y + 4, cardWidth, cardHeight, 'D');
    doc.setTextColor(67, 56, 202);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.text('TOTAL DE RECURSOS (PVFs)', 18, y + 10);
    doc.setFontSize(11);
    doc.text(`${snap.totalPvfCount} PVFs`, 18, y + 18);
    
    // Card 2: Active Contracts
    doc.setFillColor(254, 243, 199); // Amber BG
    doc.rect(15 + cardWidth + cardGap, y + 4, cardWidth, cardHeight, 'F');
    doc.setDrawColor(253, 230, 138);
    doc.rect(15 + cardWidth + cardGap, y + 4, cardWidth, cardHeight, 'D');
    doc.setTextColor(180, 83, 9);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.text('CONTRATOS ATIVOS', 15 + cardWidth + cardGap + 3, y + 10);
    doc.setFontSize(11);
    doc.text(`${activeContractsCount} contratos`, 15 + cardWidth + cardGap + 3, y + 18);
    
    // Card 3: Total Billing
    doc.setFillColor(209, 250, 229); // Emerald BG
    doc.rect(15 + (cardWidth + cardGap) * 2, y + 4, cardWidth, cardHeight, 'F');
    doc.setDrawColor(167, 243, 208);
    doc.rect(15 + (cardWidth + cardGap) * 2, y + 4, cardWidth, cardHeight, 'D');
    doc.setTextColor(4, 120, 87);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.text('FATURAMENTO DA VERSÃO', 15 + (cardWidth + cardGap) * 2 + 3, y + 10);
    doc.setFontSize(11);
    doc.text(`${formatCurrency(snap.totalBilling)}`, 15 + (cardWidth + cardGap) * 2 + 3, y + 18);
    
    // Member Contracts list header
    y = 112;
    doc.setTextColor(30, 41, 59);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('RELAÇÃO DE CONTRATOS INTEGRANTES', 15, y);
    
    doc.setFillColor(30, 41, 59);
    doc.rect(15, y + 4, 180, 7, 'F'); // height 7 instead of 8
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.text('CÓDIGO/CONTRATO', 18, y + 8.5);
    doc.text('SECRETARIA / ORGÃO BENEFICIÁRIO', 50, y + 8.5);
    doc.text('PVFS', 140, y + 8.5);
    doc.text('FATURAMENTO', 154, y + 8.5);
    doc.text('STATUS', 182, y + 8.5);
    
    y = y + 15.5; // Start contents rows safely past the header bar (112 + 15.5 = 127.5)
    
    snap.contracts.forEach((c, index) => {
      if (y > 270) {
        doc.addPage();
        y = 20;
        
        doc.setFillColor(30, 41, 59);
        doc.rect(15, y, 180, 7, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.text('CÓDIGO/CONTRATO', 18, y + 4.5);
        doc.text('SECRETARIA / ORGÃO BENEFICIÁRIO', 50, y + 4.5);
        doc.text('PVFS', 140, y + 4.5);
        doc.text('FATURAMENTO', 154, y + 4.5);
        doc.text('STATUS', 182, y + 4.5);
        
        y = y + 11.5;
      }
      
      if (index % 2 === 0) {
        doc.setFillColor(248, 250, 252);
        doc.rect(15, y - 4, 180, 5.5, 'F'); // more compact row background height: 5.5
      }
      
      doc.setDrawColor(241, 245, 249);
      doc.line(15, y + 1.8, 195, y + 1.8);
      
      const pvfCount = Object.values(c.quantities).reduce((acc: number, q: any) => acc + Number(q || 0), 0);
      const faturamento = Object.entries(c.quantities).reduce((acc: number, [key, qty]: [string, any]) => {
        const unitPrice = snap.prices[key] || 0;
        return acc + (Number(qty || 0) * Number(unitPrice));
      }, 0);
      
      doc.setTextColor(30, 41, 59);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.text(c.contrato, 18, y);
      
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(71, 85, 105);
      const secName = c.secretaria.length > 55 ? c.secretaria.substring(0, 52) + '...' : c.secretaria; // Expanded to 55 chars
      doc.text(secName, 50, y);
      
      doc.setFont('helvetica', 'bold');
      doc.text(`${pvfCount}`, 140, y);
      
      doc.setTextColor(4, 120, 87);
      doc.text(formatCurrency(faturamento), 154, y);
      
      if (c.status === 'Ativo') {
        doc.setTextColor(16, 185, 129);
      } else if (c.status === 'Suspenso') {
        doc.setTextColor(245, 158, 11);
      } else {
        doc.setTextColor(113, 113, 122);
      }
      doc.setFont('helvetica', 'bold');
      doc.text(c.status, 182, y);
      
      y += 6.5; // compact row step: 6.5
    });
    
    // Tabela de tarifas aplicadas
    if (y > 230) {
      doc.addPage();
      y = 20;
    } else {
      y += 10;
    }
    
    doc.setTextColor(30, 41, 59);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('TARIFAS UNITÁRIAS APLICADAS (TABELA DE PREÇOS)', 15, y);
    
    y += 4;
    const tariffKeys = Object.entries(snap.prices);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    
    tariffKeys.forEach(([k, val], idx) => {
      const isCol2 = idx >= 5;
      const itemX = isCol2 ? 105 : 18;
      const itemY = y + (idx % 5) * 6;
      
      const label = PVF_LABELS[k as PvfKey] || k;
      doc.setTextColor(100, 116, 139);
      doc.setFont('helvetica', 'normal');
      doc.text(`${label}:`, itemX, itemY);
      
      doc.setTextColor(4, 120, 87);
      doc.setFont('helvetica', 'bold');
      doc.text(formatCurrency(Number(val)), itemX + 45, itemY);
    });
    
    y += 36;
    if (y > 255) {
      doc.addPage();
      y = 30;
    }
    
    // Verification Signatures Unit
    doc.setDrawColor(156, 163, 175);
    doc.line(20, y + 10, 90, y + 10);
    doc.line(120, y + 10, 190, y + 10);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(107, 114, 128);
    doc.text('Operador Responsável pela Emissão', 20, y + 14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(55, 65, 81);
    doc.text(snap.savedBy, 20, y + 18);
    
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(107, 114, 128);
    doc.text('Representante Método Telecom', 120, y + 14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(55, 65, 81);
    doc.text('PECONECTADO II', 120, y + 18);
    
    doc.save(`Relatorio_Faturamento_${snap.referenceMonth.replace('/', '-')}.pdf`);
  };

  const filteredSnapshots = processedSnapshots.filter(s => 
    s.referenceMonth.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.savedBy.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Helper to format ISO date-time string or Firestore Timestamp to localized pt-BR style with hour
  const formatDateTime = (savedAtVal: any, createdAtVal?: any) => {
    try {
      let d: Date | null = null;

      // Try parsing from savedAtVal
      if (savedAtVal) {
        if (typeof savedAtVal === 'object') {
          if (typeof savedAtVal.toDate === 'function') {
            d = savedAtVal.toDate();
          } else if (savedAtVal.seconds !== undefined) {
            d = new Date(savedAtVal.seconds * 1000);
          }
        } else if (typeof savedAtVal === 'string') {
          d = new Date(savedAtVal);
        }
      }

      // Fallback to createdAt if savedAtVal was invalid or not found
      if ((!d || isNaN(d.getTime())) && createdAtVal) {
        if (typeof createdAtVal === 'object') {
          if (typeof createdAtVal.toDate === 'function') {
            d = createdAtVal.toDate();
          } else if (createdAtVal.seconds !== undefined) {
            d = new Date(createdAtVal.seconds * 1000);
          }
        } else if (typeof createdAtVal === 'string') {
          d = new Date(createdAtVal);
        }
      }

      // Ultimate fallback: current date if everything else is missing
      if (!d || isNaN(d.getTime())) {
        d = new Date();
      }

      // Format utilizing America/Sao_Paulo timeZone to prevent any server/local offset errors for Brazilian users
      const dateStr = d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
      const timeStr = d.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
      
      return `${dateStr} às ${timeStr}`;
    } catch {
      return String(savedAtVal || 'Data indisponível');
    }
  };

  if (selectedSnapshot) {
    const snap = processedSelectedSnapshot;
    if (!snap) {
      return (
        <div className="bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 p-6 rounded-2xl text-center text-xs font-bold space-y-3">
          <p>Você não possui acesso às secretarias integrantes desta memória de faturamento.</p>
          <button 
            onClick={() => setSelectedSnapshot(null)} 
            className="px-4 py-1.5 bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 rounded-xl transition-all hover:opacity-90 font-semibold"
          >
            Voltar ao Histórico
          </button>
        </div>
      );
    }
    const activeContractsCount = snap.contracts.filter(c => c.status === 'Ativo').length;

    // Detailed View of a snapshot
    return (
      <div className="space-y-6 animate-in fade-in duration-300">
        {/* Navigation & Actions bar */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-zinc-150 dark:border-zinc-800 shadow-xs print:hidden">
          <button 
            onClick={() => setSelectedSnapshot(null)}
            className="group flex items-center gap-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-bold text-xs py-2 px-3.5 rounded-xl border border-zinc-200 dark:border-zinc-700 transition-all cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4 group-hover:-translate-x-0.5 transition-transform" />
            <span>Voltar ao Histórico</span>
          </button>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            {user?.role === 'admin' && (
              <button 
                onClick={() => setSnapshotToDelete(snap.id)}
                className="flex items-center gap-2 bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs py-2.5 px-4 rounded-xl shadow-md shadow-rose-500/10 hover:shadow-lg transition-all active:scale-98 cursor-pointer"
              >
                <Trash2 className="h-4 w-4" />
                <span>Apagar Memória</span>
              </button>
            )}
            <button 
              onClick={handleDownloadPDF}
              className="flex items-center gap-2 bg-brand hover:bg-brand-light text-white font-extrabold text-xs py-2.5 px-4 rounded-xl shadow-md shadow-brand/10 hover:shadow-lg transition-all active:scale-98 cursor-pointer"
            >
              <Download className="h-4 w-4" />
              <span>Baixar Relatório (PDF)</span>
            </button>
          </div>
        </div>

        {/* Core printable content sheet */}
        <div id="section-to-print" className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 sm:p-8 space-y-6 shadow-sm print:border-none print:shadow-none print:p-0">
          
          {/* Header */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-5 border-b border-zinc-150 dark:border-zinc-800 print:pb-3">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="inline-block bg-brand/10 text-brand border border-brand/20 text-[9px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-md">
                  PECONECTADO II
                </span>
                <span className="inline-block bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-250/20 text-[9px] font-bold uppercase tracking-widest px-2.5 py-0.5 rounded-md">
                  Histórico Arquivado
                </span>
              </div>
              <h1 className="text-xl sm:text-2xl font-black text-zinc-950 dark:text-zinc-50 tracking-tight font-display uppercase">
                Faturamento Consolidado - {snap.referenceMonth}
              </h1>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                Visualizando versão de faturamento travada no sistema.
              </p>
            </div>

            {/* Audit log details card */}
            <div className="bg-zinc-50 dark:bg-zinc-950/40 p-4 rounded-2xl border border-zinc-150 dark:border-zinc-805 text-xs text-zinc-650 dark:text-zinc-450 space-y-1.5 min-w-[240px] shadow-2xs">
              <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-[9px] text-zinc-400 pb-1 border-b border-zinc-200/50 dark:border-zinc-800/50">
                <CalendarClock className="h-3.5 w-3.5 text-zinc-400" />
                <span>Dados de Auditoria</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Registrado por:</span>
                <strong className="text-zinc-900 dark:text-zinc-200 font-bold">{snap.savedBy}</strong>
              </div>
              <div className="flex items-center justify-between">
                <span>Salvo em:</span>
                <strong className="text-zinc-900 dark:text-zinc-200 font-mono font-bold">
                  {formatDateTime(snap.savedAt, snap.createdAt)}
                </strong>
              </div>
            </div>
          </div>

          {/* Metrics summary card grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-indigo-50/50 dark:bg-indigo-950/15 border border-indigo-100/50 dark:border-indigo-900/30 p-5 rounded-2xl flex justify-between items-center hover:scale-[1.02] hover:shadow-md hover:bg-indigo-50/80 dark:hover:bg-indigo-950/25 dark:hover:border-indigo-850 hover:border-indigo-200 transition-all duration-300 transform select-none cursor-default">
              <div className="space-y-1">
                <span className="text-xs text-zinc-400 font-bold uppercase tracking-wider block">Total de Pontos (PVFs)</span>
                <span className="text-2xl font-black font-mono text-zinc-900 dark:text-indigo-200 block">
                  {snap.totalPvfCount} <span className="text-xs font-bold text-zinc-400 dark:text-zinc-500">PVFs</span>
                </span>
              </div>
              <div className="p-3 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-xl">
                <Layers className="h-6 w-6" />
              </div>
            </div>

            <div className="bg-amber-50/50 dark:bg-amber-950/15 border border-amber-100/50 dark:border-amber-900/30 p-5 rounded-2xl flex justify-between items-center hover:scale-[1.02] hover:shadow-md hover:bg-amber-50/80 dark:hover:bg-amber-950/25 dark:hover:border-amber-850 hover:border-amber-200 transition-all duration-300 transform select-none cursor-default">
              <div className="space-y-1">
                <span className="text-xs text-zinc-400 font-bold uppercase tracking-wider block">Contratos Ativos</span>
                <span className="text-2xl font-black font-mono text-amber-800 dark:text-amber-400 block">
                  {activeContractsCount} <span className="text-xs font-bold text-zinc-450 dark:text-zinc-550">Ativos</span>
                </span>
              </div>
              <div className="p-3 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-xl">
                <Building className="h-6 w-6" />
              </div>
            </div>

            <div className="bg-emerald-50/50 dark:bg-emerald-950/15 border border-emerald-100/50 dark:border-indigo-900/30 p-5 rounded-2xl flex justify-between items-center hover:scale-[1.02] hover:shadow-md hover:bg-indigo-50/80 dark:hover:bg-indigo-950/25 dark:hover:border-indigo-850 hover:border-indigo-200 transition-all duration-300 transform select-none cursor-default">
              <div className="space-y-1">
                <span className="text-xs text-zinc-400 font-bold uppercase tracking-wider block">Faturamento Mensal</span>
                <span className="text-2xl font-black font-mono text-emerald-800 dark:text-emerald-400 block">
                  {formatCurrency(snap.totalBilling)}
                </span>
              </div>
              <div className="p-3 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-xl">
                <DollarSign className="h-6 w-6" />
              </div>
            </div>
          </div>

          {/* Detailed table of contracts snapshot */}
          <div className="space-y-3">
            <h3 className="text-xs font-black uppercase text-zinc-500 dark:text-zinc-400 tracking-widest">
              Contratos Integrantes do Faturamento
            </h3>

            <div className="border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-2xs bg-zinc-50/20">
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-brand-deep text-white font-bold text-[10px] uppercase tracking-wider">
                    <tr>
                      <th className="py-2.5 px-3.5 w-32">Código</th>
                      <th className="py-2.5 px-3.5">Secretaria / Beneficiário</th>
                      <th className="py-2.5 px-3 uppercase text-right w-24">Pontos PVF</th>
                      <th className="py-2.5 px-3.5 text-right w-32">Faturamento</th>
                      <th className="py-2.5 px-3.5 text-center w-28">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                    {snap.contracts.map((c) => {
                      const pvfCount = Object.values(c.quantities).reduce((acc: number, q: any) => acc + Number(q || 0), 0);
                      const faturamento = Object.entries(c.quantities).reduce((acc: number, [key, qty]: [string, any]) => {
                        const unitPrice = snap.prices[key] || 0;
                        return acc + (Number(qty || 0) * Number(unitPrice));
                      }, 0);

                      return (
                        <tr key={c.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-850/20 text-zinc-700 dark:text-zinc-300">
                          <td className="py-2 px-3.5 font-black font-mono text-zinc-950 dark:text-zinc-100">{c.contrato}</td>
                          <td className="py-2 px-3.5 font-semibold text-zinc-900 dark:text-zinc-150">{c.secretaria}</td>
                          <td className="py-2 px-3 text-right font-black font-mono text-zinc-900 dark:text-zinc-300">{pvfCount}</td>
                          <td className="py-2 px-3.5 text-right font-black font-mono text-emerald-800 dark:text-emerald-400">{formatCurrency(faturamento)}</td>
                          <td className="py-2 px-3.5 text-center">
                            <span className={`inline-block text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded ${
                              c.status === 'Ativo' 
                                ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 border border-emerald-200/50' 
                                : c.status === 'Suspenso'
                                ? 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400 border border-amber-200/40'
                                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border border-zinc-200/30'
                            }`}>
                              {c.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Unit prices reference snapshot */}
          <div className="space-y-3 pt-2">
            <h3 className="text-xs font-black uppercase text-zinc-500 dark:text-zinc-400 tracking-widest">
              Tabela de Tarifas Aplicadas na Época
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-5 lg:grid-cols-10 gap-2">
              {Object.entries(snap.prices).map(([key, val]) => (
                <div key={key} className="bg-zinc-50 dark:bg-zinc-950 p-2.5 rounded-xl border border-zinc-150 dark:border-zinc-805 text-center shadow-3xs">
                  <span className="block text-[8px] font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 truncate" title={PVF_LABELS[key as PvfKey] || key}>
                    {PVF_LABELS[key as PvfKey] || key}
                  </span>
                  <span className="block text-xs font-black text-emerald-705 dark:text-emerald-400 font-mono mt-1">
                    {formatCurrency(Number(val))}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Print Signatures Block */}
          <div className="hidden print:flex flex-row justify-between items-end pt-20 pb-4 text-center text-[10px] text-zinc-500 font-mono">
            <div className="w-[200px] border-t border-zinc-400 pt-1.5">
              <span>Gestor Responsável</span>
              <p className="font-bold text-zinc-805 dark:text-zinc-300 mt-1">{snap.savedBy}</p>
            </div>
            <div className="w-[200px] border-t border-zinc-400 pt-1.5">
              <span>Método Telecomunicações</span>
              <p className="font-bold text-zinc-805 dark:text-zinc-300 mt-1">PECONECTADO II</p>
            </div>
          </div>
        </div>

        {snapshotToDelete && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-805 rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-xl">
              <div className="p-3 bg-rose-50 dark:bg-rose-950/30 text-rose-650 dark:text-rose-400 rounded-2xl w-fit">
                <Trash2 className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-black text-zinc-900 dark:text-zinc-50 uppercase tracking-tight">
                  Apagar Memória de Faturamento?
                </h3>
                <p className="text-xs text-zinc-505 dark:text-zinc-400 leading-relaxed">
                  Tem certeza que deseja remover este registro de faturamento do histórico? Esta ação é irreversível e o faturamento salvo não poderá ser recuperado.
                </p>
              </div>
              <div className="flex gap-2.5 pt-2 font-sans">
                <button
                  onClick={() => setSnapshotToDelete(null)}
                  disabled={isDeleting}
                  className="flex-1 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-805 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 font-extrabold text-xs py-2.5 rounded-xl transition cursor-pointer disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleDeleteConfirm}
                  disabled={isDeleting}
                  className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs py-2.5 rounded-xl transition shadow-md shadow-rose-500/10 cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {isDeleting ? (
                    <>
                      <RefreshCw className="h-3 w-3 animate-spin" />
                      <span>Apagando...</span>
                    </>
                  ) : (
                    <span>Sim, Apagar</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      
      {/* Intro Dashboard Overview */}
      <div className="bg-white dark:bg-zinc-900 aspect-none p-5 sm:p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-lg font-black text-zinc-900 dark:text-zinc-50 tracking-tight flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-indigo-500 animate-pulse" />
            <span>Consultas e Históricos de Faturamento</span>
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-xl">
            Tire snapshots mensais auditáveis para registrar os faturamentos garantidos da Método Telecom. Consultas e auditorias seguras integradas diretamente com o banco de dados.
          </p>
        </div>

        <button 
          onClick={fetchSnapshots}
          className="self-start md:self-auto flex items-center gap-1.5 bg-zinc-55 hover:bg-zinc-100 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 hover:text-zinc-900 dark:hover:text-white border border-zinc-200/80 dark:border-zinc-700 px-3.5 py-2.5 rounded-xl text-xs font-bold shadow-2xs transition-all cursor-pointer whitespace-nowrap"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin text-indigo-500' : ''}`} />
          <span>Atualizar</span>
        </button>
      </div>

      {/* Main filter / search list */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xs border border-zinc-200 dark:border-zinc-800 p-5">
        
        {/* Search header bar */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6">
          <div className="w-full sm:w-80 relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
            <input 
              type="text" 
              placeholder="Filtrar por mês ou usuário..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-850 rounded-xl py-2.5 pl-10 pr-4 text-xs text-zinc-800 dark:text-zinc-200 placeholder-zinc-450 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 transition-all font-medium"
            />
          </div>

          <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
            {filteredSnapshots.length} snapshot(s) encontrado(s)
          </div>
        </div>

        {/* Database records render list */}
        {loading ? (
          <div className="py-16 text-center space-y-3">
            <RefreshCw className="h-8 w-8 text-indigo-500 animate-spin mx-auto" />
            <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">Buscando backups de faturamentos no banco de dados...</p>
          </div>
        ) : error ? (
          <div className="py-12 px-4 text-center bg-red-50/50 dark:bg-red-950/15 border border-red-150 dark:border-red-950/30 rounded-2xl text-red-600 dark:text-red-400 max-w-xl mx-auto space-y-2">
            <p className="text-xs font-bold uppercase tracking-widest font-mono">Falha de Comunicação</p>
            <p className="text-xs leading-relaxed">{error}</p>
          </div>
        ) : filteredSnapshots.length === 0 ? (
          <div className="py-16 border-2 border-dashed border-zinc-150 dark:border-zinc-800 rounded-3xl text-center max-w-md mx-auto space-y-3 p-6 bg-zinc-50/30">
            <div className="p-3 bg-zinc-100 dark:bg-zinc-850 rounded-2xl w-fit mx-auto text-zinc-400">
              <CalendarClock className="h-6 w-6" />
            </div>
            <h4 className="text-xs font-black uppercase text-zinc-900 dark:text-zinc-200 tracking-wider">Histórico Vazio</h4>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
              Não há salvamentos de faturação arquivados para {searchTerm ? 'este filtro' : 'o sistema ainda'}. Salve dados mensais novos usando a opção "Salvar Faturamento" na aba de Contratos Corporativa.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredSnapshots.map((item) => (
              <div 
                key={item.id} 
                onClick={() => setSelectedSnapshot(item)}
                className="bg-zinc-50/30 hover:bg-zinc-50 dark:bg-zinc-950/30 dark:hover:bg-zinc-950/70 border border-zinc-150 hover:border-indigo-500/50 dark:border-zinc-850 dark:hover:border-indigo-500/40 p-5 rounded-2xl cursor-pointer hover:shadow-xs transition-all flex flex-col justify-between group h-full"
              >
                <div className="space-y-4">
                  {/* Top Header Card */}
                  <div className="flex justify-between items-start gap-2">
                    <div className="space-y-0.5">
                      <span className="text-[10px] uppercase font-bold text-indigo-700 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 rounded border border-indigo-150/40">
                        {item.referenceMonth}
                      </span>
                      <h4 className="text-sm font-black text-zinc-900 dark:text-zinc-50 mt-1.5 uppercase font-display tracking-tight group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                        Memória de Faturamento
                      </h4>
                    </div>
                    
                    <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                      {user?.role === 'admin' && (
                        <button
                          onClick={() => setSnapshotToDelete(item.id)}
                          title="Apagar Memória de Faturamento"
                          className="p-2 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/30 dark:hover:bg-rose-900/40 text-rose-650 dark:text-rose-400 rounded-xl border border-rose-200/55 dark:border-rose-900/30 hover:scale-105 transition-all shadow-3xs cursor-pointer flex items-center justify-center font-sans"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <span className="p-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-400 dark:text-zinc-500 group-hover:scale-105 transition-transform shadow-3xs">
                        <FileText className="h-4 w-4" />
                      </span>
                    </div>
                  </div>

                  {/* Summary Metric Rows */}
                  <div className="grid grid-cols-2 gap-2 text-xs py-3.5 border-y border-zinc-200/50 dark:border-zinc-800/50">
                    <div>
                      <span className="text-[8px] font-bold text-zinc-400 uppercase tracking-widest block">Total Pontos</span>
                      <span className="font-extrabold text-zinc-800 dark:text-zinc-200 flex items-center gap-1 font-mono mt-0.5">
                        <Layers className="h-3 w-3 text-indigo-500/75" />
                        <span>{item.totalPvfCount} PVFs</span>
                      </span>
                    </div>
                    <div>
                      <span className="text-[8px] font-bold text-zinc-400 uppercase tracking-widest block">Faturamento</span>
                      <span className="font-extrabold text-emerald-700 dark:text-emerald-400 flex items-center gap-1 font-mono mt-0.5">
                        <DollarSign className="h-3 w-3 text-emerald-500" />
                        <span>{formatCurrency(item.totalBilling)}</span>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Footer Auditor data */}
                <div className="flex items-center gap-2 text-[10px] text-zinc-400 dark:text-zinc-550 pt-4 mt-auto">
                  <span className="h-6 w-6 rounded-md bg-zinc-100 dark:bg-zinc-900 border border-zinc-200/40 dark:border-zinc-800 flex items-center justify-center shrink-0 uppercase font-black text-[9px] text-zinc-500 font-mono">
                    {item.savedBy.substring(0, 2)}
                  </span>
                  <div className="leading-tight min-w-0 flex-grow">
                    <span className="block font-bold text-zinc-700 dark:text-zinc-350 truncate">{item.savedBy}</span>
                    <span className="block font-mono text-[8px] mt-0.5 truncate">{formatDateTime(item.savedAt, item.createdAt)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

      </div>

      {snapshotToDelete && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-805 rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-xl">
            <div className="p-3 bg-rose-50 dark:bg-rose-950/30 text-rose-650 dark:text-rose-400 rounded-2xl w-fit">
              <Trash2 className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-black text-zinc-900 dark:text-zinc-50 uppercase tracking-tight">
                Apagar Memória de Faturamento?
              </h3>
              <p className="text-xs text-zinc-505 dark:text-zinc-400 leading-relaxed">
                Tem certeza que deseja remover este registro de faturamento do histórico? Esta ação é irreversível e o faturamento salvo não poderá ser recuperado.
              </p>
            </div>
            <div className="flex gap-2.5 pt-2 font-sans">
              <button
                onClick={() => setSnapshotToDelete(null)}
                disabled={isDeleting}
                className="flex-1 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-805 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 font-extrabold text-xs py-2.5 rounded-xl transition cursor-pointer disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleDeleteConfirm}
                disabled={isDeleting}
                className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs py-2.5 rounded-xl transition shadow-md shadow-rose-500/10 cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {isDeleting ? (
                  <>
                    <RefreshCw className="h-3 w-3 animate-spin" />
                    <span>Apagando...</span>
                  </>
                ) : (
                  <span>Sim, Apagar</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
