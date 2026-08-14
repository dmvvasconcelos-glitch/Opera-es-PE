/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx';
import { db, onSnapshot } from '../firebase';
import { collection, doc } from 'firebase/firestore';
import { Contract, PvfPrices, PvfKey, UserSession } from '../types';
import { PVF_LABELS, INITIAL_PRICES, INITIAL_CONTRACTS, formatCurrency } from '../data';
import { ContactCenterOS, ContactCenterPrices, PRESEEDED_CONTACT_CENTER } from './ContactCenterBilling';
import { ContractViewerModal } from './ContractViewerModal';
import { useCurrentMonthFilter, getAvailableMonths } from '../utils/monthUtils';
import {
  Scale,
  Phone,
  Headset,
  TrendingUp,
  CheckCircle2,
  PieChart,
  FileSpreadsheet,
  FileText,
  ChevronLeft,
  ChevronRight,
  ArrowUpRight,
  Info,
  Building2,
  FileCheck
} from 'lucide-react';

// Hardcoded Contract Limits as explicitly defined by contract rules
export const PVF_CONTRACT_LIMITS: Record<PvfKey, number> = {
  analogico: 12563,
  semFio: 10297,
  extensao: 3307,
  dBasico: 1214,
  dEspecial: 943,
  ipBasico: 793,
  fCabeca: 300,
  sMesa: 75,
  software: 216,
  virtual: 40,
};

export interface ContactCenterLimits {
  nmsBasico: number;
  nmsCritico: number;
  gravacaoBasica: number;
  gravacaoCritica: number;
  uraBasica: number;
  uraCritica: number;
}

export const CONTACT_CENTER_CONTRACT_LIMITS: ContactCenterLimits = {
  nmsBasico: 300,
  nmsCritico: 124,
  gravacaoBasica: 200,
  gravacaoCritica: 124,
  uraBasica: 81,
  uraCritica: 34,
};

export const CONTACT_CENTER_LABELS: Record<keyof ContactCenterLimits, string> = {
  nmsBasico: 'UCDA Básico',
  nmsCritico: 'UCDA Crítico',
  gravacaoBasica: 'Gravação Bás',
  gravacaoCritica: 'Gravação Crít',
  uraBasica: 'URA Básico',
  uraCritica: 'URA Crítico',
};

const DEFAULT_CC_PRICES: ContactCenterPrices = {
  nmsBasico: 440.86,
  nmsCritico: 460.97,
  gravacaoBasica: 71.84,
  gravacaoCritica: 78.64,
  uraBasica: 282.06,
  uraCritica: 303.01
};

interface SaldoContratoProps {
  user?: UserSession | null;
  pvfPrices?: PvfPrices;
  pvfContracts?: Contract[];
}

export default function SaldoContrato({
  user,
  pvfPrices = INITIAL_PRICES,
  pvfContracts = []
}: SaldoContratoProps) {
  // Period filter
  const [referenceMonth, setReferenceMonth] = useCurrentMonthFilter();
  const availableMonths = getAvailableMonths();
  const isZeroMonthSelected = referenceMonth === 'Janeiro/2026' || referenceMonth === 'Fevereiro/2026';

  // Navigation / View modes
  const [activeSubView, setActiveSubView] = useState<'consolidado' | 'pvf' | 'cc' | 'secretarias'>('consolidado');
  const [isContractModalOpen, setIsContractModalOpen] = useState(false);

  // Real-time Data states
  const [dbPvfRecords, setDbPvfRecords] = useState<Contract[]>([]);
  const [ccRecords, setCcRecords] = useState<ContactCenterOS[]>([]);
  const [currentPvfPrices, setCurrentPvfPrices] = useState<PvfPrices>(pvfPrices);
  const [currentCcPrices, setCurrentCcPrices] = useState<ContactCenterPrices>(DEFAULT_CC_PRICES);

  // Toast feedback
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);
  const showToast = (message: string, type: 'success' | 'info' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // 1. Sync PVF Prices
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'systemPrices', 'current'), (docSnap) => {
      if (docSnap.exists()) {
        setCurrentPvfPrices(docSnap.data() as PvfPrices);
      }
    }, (err) => console.warn("Fallback PVF prices:", err));
    return () => unsub();
  }, []);

  // 2. Sync Contact Center Prices
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'systemPrices', 'contactCenter'), (docSnap) => {
      if (docSnap.exists()) {
        setCurrentCcPrices(docSnap.data() as ContactCenterPrices);
      }
    }, (err) => console.warn("Fallback CC prices:", err));
    return () => unsub();
  }, []);

  // 3. Sync PVF Monthly Contracts in Real-Time
  useEffect(() => {
    const q = collection(db, 'pvfMonthlyContracts');
    const unsub = onSnapshot(q, (snapshot) => {
      const recordsMap = new Map<string, Contract>();
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        let originalId = data.id || '';
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
        recordsMap.set(mapKey, record);
      });
      const list = Array.from(recordsMap.values());
      setDbPvfRecords(list);
    }, (err) => {
      console.warn("Fallback PVF monthly contracts:", err);
      const cached = localStorage.getItem('pvf_monthly_offline_records');
      if (cached) {
        setDbPvfRecords(JSON.parse(cached));
      }
    });
    return () => unsub();
  }, []);

  // Sync to local storage for offline support
  useEffect(() => {
    if (dbPvfRecords.length > 0) {
      localStorage.setItem('pvf_monthly_offline_records', JSON.stringify(dbPvfRecords));
    }
  }, [dbPvfRecords]);

  // 4. Sync Contact Center Records in Real-Time
  useEffect(() => {
    const q = collection(db, 'contactCenterRecords');
    const unsub = onSnapshot(q, (snapshot) => {
      const list: ContactCenterOS[] = [];
      snapshot.forEach(docSnap => {
        list.push({ id: docSnap.id, ...docSnap.data() } as ContactCenterOS);
      });
      setCcRecords(list);
      if (list.length > 0) {
        localStorage.setItem('cc_monthly_offline_records', JSON.stringify(list));
      }
    }, (err) => {
      console.warn("Fallback CC records:", err);
      const cached = localStorage.getItem('cc_monthly_offline_records');
      if (cached) {
        setCcRecords(JSON.parse(cached));
      }
    });
    return () => unsub();
  }, []);

  // -------------------------------------------------------------
  // Filtered Records for Selected Month
  // -------------------------------------------------------------
  const basePvfContracts = useMemo(() => {
    return pvfContracts && pvfContracts.length > 0 ? pvfContracts : INITIAL_CONTRACTS;
  }, [pvfContracts]);

  const activePvfContracts = useMemo(() => {
    if (isZeroMonthSelected) return [];
    
    // Filter records in collection for current selected referenceMonth
    let monthFiltered = dbPvfRecords.filter(r => r.referenceMonth === referenceMonth);
    if (user && user.role === 'cliente') {
      const allowed = user.secretarias || [];
      monthFiltered = monthFiltered.filter(r => allowed.includes(r.secretaria));
    }

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
    const merged = basePvfContracts.map(c => {
      const custom = monthFiltered.find(r => r.id === c.id);
      if (custom) {
        return { ...c, ...custom };
      }
      return { ...c, referenceMonth };
    });

    // Include any newly created contracts in this month that don't exist in base contracts list
    const existingIds = new Set(basePvfContracts.map(c => c.id));
    let newCustomContracts = monthFiltered.filter(r => !existingIds.has(r.id));
    if (user && user.role === 'cliente') {
      const allowed = user.secretarias || [];
      newCustomContracts = newCustomContracts.filter(r => allowed.includes(r.secretaria));
    }

    const result = [...merged, ...newCustomContracts];
    if (user && user.role === 'cliente') {
      const allowed = user.secretarias || [];
      return result.filter(r => allowed.includes(r.secretaria));
    }
    return result;
  }, [dbPvfRecords, basePvfContracts, referenceMonth, isZeroMonthSelected, user]);

  const activeCcRecords = useMemo(() => {
    if (isZeroMonthSelected) return [];
    let list = ccRecords.filter(r => r.referenceMonth === referenceMonth);
    
    // Fallback to preseeded if collection is empty during initial load
    if (list.length === 0 && ccRecords.length === 0) {
      list = PRESEEDED_CONTACT_CENTER.map(r => ({ ...r, referenceMonth }));
    }

    if (user && user.role === 'cliente') {
      const allowed = user.secretarias || [];
      return list.filter(r => allowed.includes(r.secretaria));
    }
    return list;
  }, [ccRecords, referenceMonth, isZeroMonthSelected, user]);

  // -------------------------------------------------------------
  // Calculations: Ponto de Voz Fixo Items
  // -------------------------------------------------------------
  const pvfItemsData = useMemo(() => {
    const keys = Object.keys(PVF_CONTRACT_LIMITS) as PvfKey[];
    
    return keys.map(key => {
      const label = PVF_LABELS[key] || key;
      const unitPrice = currentPvfPrices[key] || 0;
      const limitQty = PVF_CONTRACT_LIMITS[key];
      const limitValue = limitQty * unitPrice;

      // Sum quantities across active contracts for this month
      const usedQty = activePvfContracts
        .filter(c => c.status === 'Ativo')
        .reduce((sum, c) => sum + Number(c.quantities?.[key] || 0), 0);
      
      const usedValue = usedQty * unitPrice;
      const availableQty = limitQty - usedQty;
      const availableValue = availableQty * unitPrice;
      const percentUsed = limitQty > 0 ? (usedQty / limitQty) * 100 : 0;

      let statusCategory: 'normal' | 'alerta' | 'critico' = 'normal';
      let statusLabel = 'Disponível';
      if (percentUsed >= 100) {
        statusCategory = 'critico';
        statusLabel = 'Esgotado';
      } else if (percentUsed >= 85) {
        statusCategory = 'critico';
        statusLabel = 'Crítico';
      } else if (percentUsed >= 65) {
        statusCategory = 'alerta';
        statusLabel = 'Atenção';
      }

      return {
        key,
        category: 'PVF' as const,
        label,
        unitPrice,
        limitQty,
        limitValue,
        usedQty,
        usedValue,
        availableQty,
        availableValue,
        percentUsed,
        statusCategory,
        statusLabel,
      };
    });
  }, [activePvfContracts, currentPvfPrices]);

  // -------------------------------------------------------------
  // Calculations: Contact Center Items
  // -------------------------------------------------------------
  const ccItemsData = useMemo(() => {
    const keys: (keyof ContactCenterLimits)[] = [
      'nmsBasico',
      'nmsCritico',
      'gravacaoBasica',
      'gravacaoCritica',
      'uraBasica',
      'uraCritica'
    ];

    return keys.map(key => {
      const label = CONTACT_CENTER_LABELS[key];
      const unitPrice = currentCcPrices[key] || 0;
      const limitQty = CONTACT_CENTER_CONTRACT_LIMITS[key];
      const limitValue = limitQty * unitPrice;

      // Sum quantities across active CC contracts
      const usedQty = activeCcRecords
        .filter(r => r.status === 'Ativo')
        .reduce((sum, r) => sum + Number(r[key] || 0), 0);

      const usedValue = usedQty * unitPrice;
      const availableQty = limitQty - usedQty;
      const availableValue = availableQty * unitPrice;
      const percentUsed = limitQty > 0 ? (usedQty / limitQty) * 100 : 0;

      let statusCategory: 'normal' | 'alerta' | 'critico' = 'normal';
      let statusLabel = 'Disponível';
      if (percentUsed >= 100) {
        statusCategory = 'critico';
        statusLabel = 'Esgotado';
      } else if (percentUsed >= 85) {
        statusCategory = 'critico';
        statusLabel = 'Crítico';
      } else if (percentUsed >= 65) {
        statusCategory = 'alerta';
        statusLabel = 'Atenção';
      }

      return {
        key,
        category: 'CC' as const,
        label,
        unitPrice,
        limitQty,
        limitValue,
        usedQty,
        usedValue,
        availableQty,
        availableValue,
        percentUsed,
        statusCategory,
        statusLabel,
      };
    });
  }, [activeCcRecords, currentCcPrices]);

  // -------------------------------------------------------------
  // Consolidated Totals (PVF, CC, and Grand PEII)
  // -------------------------------------------------------------
  const pvfTotals = useMemo(() => {
    let limitQty = 0;
    let limitVal = 0;
    let usedQty = 0;
    let usedVal = 0;

    pvfItemsData.forEach(item => {
      limitQty += item.limitQty;
      limitVal += item.limitValue;
      usedQty += item.usedQty;
      usedVal += item.usedValue;
    });

    const availableQty = limitQty - usedQty;
    const availableVal = limitVal - usedVal;
    const percentUsed = limitQty > 0 ? (usedQty / limitQty) * 100 : 0;

    return {
      limitQty,
      limitVal,
      usedQty,
      usedVal,
      availableQty,
      availableVal,
      percentUsed,
    };
  }, [pvfItemsData]);

  const ccTotals = useMemo(() => {
    let limitQty = 0;
    let limitVal = 0;
    let usedQty = 0;
    let usedVal = 0;

    ccItemsData.forEach(item => {
      limitQty += item.limitQty;
      limitVal += item.limitValue;
      usedQty += item.usedQty;
      usedVal += item.usedValue;
    });

    const availableQty = limitQty - usedQty;
    const availableVal = limitVal - usedVal;
    const percentUsed = limitQty > 0 ? (usedQty / limitQty) * 100 : 0;

    return {
      limitQty,
      limitVal,
      usedQty,
      usedVal,
      availableQty,
      availableVal,
      percentUsed,
    };
  }, [ccItemsData]);

  const grandTotals = useMemo(() => {
    const limitQty = pvfTotals.limitQty + ccTotals.limitQty;
    const limitVal = pvfTotals.limitVal + ccTotals.limitVal;
    const usedQty = pvfTotals.usedQty + ccTotals.usedQty;
    const usedVal = pvfTotals.usedVal + ccTotals.usedVal;
    const availableQty = limitQty - usedQty;
    const availableVal = limitVal - usedVal;
    const percentUsed = limitVal > 0 ? (usedVal / limitVal) * 100 : 0;

    return {
      limitQty,
      limitVal,
      usedQty,
      usedVal,
      availableQty,
      availableVal,
      percentUsed,
    };
  }, [pvfTotals, ccTotals]);

  // -------------------------------------------------------------
  // Item Lists for display
  // -------------------------------------------------------------
  const filteredPvfItems = pvfItemsData;
  const filteredCcItems = ccItemsData;

  // -------------------------------------------------------------
  // Secretarias Consumption Matrix
  // -------------------------------------------------------------
  const secretariasMatrix = useMemo(() => {
    const secMap = new Map<string, {
      secretaria: string;
      pvfQty: number;
      pvfVal: number;
      ccQty: number;
      ccVal: number;
      totalVal: number;
      contractCount: number;
    }>();

    // Sum PVF
    activePvfContracts.filter(c => c.status === 'Ativo').forEach(c => {
      const sec = c.secretaria || 'Não informada';
      const existing = secMap.get(sec) || {
        secretaria: sec,
        pvfQty: 0,
        pvfVal: 0,
        ccQty: 0,
        ccVal: 0,
        totalVal: 0,
        contractCount: 0
      };

      let cPvfQty = 0;
      let cPvfVal = 0;
      (Object.keys(PVF_CONTRACT_LIMITS) as PvfKey[]).forEach(k => {
        const q = Number(c.quantities?.[k] || 0);
        cPvfQty += q;
        cPvfVal += q * (currentPvfPrices[k] || 0);
      });

      existing.pvfQty += cPvfQty;
      existing.pvfVal += cPvfVal;
      existing.totalVal += cPvfVal;
      existing.contractCount += 1;
      secMap.set(sec, existing);
    });

    // Sum CC
    activeCcRecords.filter(r => r.status === 'Ativo').forEach(r => {
      const sec = r.secretaria || 'Não informada';
      const existing = secMap.get(sec) || {
        secretaria: sec,
        pvfQty: 0,
        pvfVal: 0,
        ccQty: 0,
        ccVal: 0,
        totalVal: 0,
        contractCount: 0
      };

      const nmsVal = (Number(r.nmsBasico || 0) * currentCcPrices.nmsBasico) + (Number(r.nmsCritico || 0) * currentCcPrices.nmsCritico);
      const gravVal = (Number(r.gravacaoBasica || 0) * currentCcPrices.gravacaoBasica) + (Number(r.gravacaoCritica || 0) * currentCcPrices.gravacaoCritica);
      const uraVal = (Number(r.uraBasica || 0) * currentCcPrices.uraBasica) + (Number(r.uraCritica || 0) * currentCcPrices.uraCritica);
      const totalCCVal = nmsVal + gravVal + uraVal;
      const totalCCQty = Number(r.nmsBasico || 0) + Number(r.nmsCritico || 0) + Number(r.gravacaoBasica || 0) + Number(r.gravacaoCritica || 0) + Number(r.uraBasica || 0) + Number(r.uraCritica || 0);

      existing.ccQty += totalCCQty;
      existing.ccVal += totalCCVal;
      existing.totalVal += totalCCVal;
      existing.contractCount += 1;
      secMap.set(sec, existing);
    });

    return Array.from(secMap.values()).sort((a, b) => b.totalVal - a.totalVal);
  }, [activePvfContracts, activeCcRecords, currentPvfPrices, currentCcPrices]);

  // -------------------------------------------------------------
  // Navigation Month Helpers
  // -------------------------------------------------------------
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

  // -------------------------------------------------------------
  // Export PDF Handler
  // -------------------------------------------------------------
  const exportPDF = () => {
    try {
      const doc = new jsPDF('l', 'mm', 'a4');

      // Top Banner
      doc.setFillColor(15, 23, 42); // slate-900
      doc.rect(0, 0, 297, 36, 'F');

      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text("MÉTODO TELECOM - CONTROLE DE SALDO DO CONTRATO PEII", 15, 14);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(203, 213, 225);
      doc.text(`Mês de Referência: ${referenceMonth} | Ponto de Voz Fixo & Contact Center`, 15, 21);
      doc.text(`Data de Emissão: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}`, 15, 27);

      doc.setFontSize(8.5);
      doc.setTextColor(148, 163, 184);
      doc.text("Gestor do Contrato: Auditoria PE II", 225, 14);
      doc.text("Status do Saldo: Auditado", 225, 20);

      // KPI Summary Box
      let y = 42;
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.3);
      doc.roundedRect(15, y, 267, 24, 3, 3, 'FD');

      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(15, 23, 42);
      doc.text("CONSOLIDADO DO CONTRATO (PVF + CONTACT CENTER)", 20, y + 6);
      doc.line(20, y + 8, 282, y + 8);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(71, 85, 105);
      doc.text(`Teto Contratado: ${formatCurrency(grandTotals.limitVal)} (${grandTotals.limitQty.toLocaleString('pt-BR')} itens)`, 20, y + 15);
      doc.text(`Saldo Utilizado: ${formatCurrency(grandTotals.usedVal)} (${grandTotals.usedQty.toLocaleString('pt-BR')} itens)`, 115, y + 15);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(2, 132, 199);
      doc.text(`Saldo Disponível: ${formatCurrency(grandTotals.availableVal)} (${grandTotals.percentUsed.toFixed(1)}% Consumido)`, 200, y + 15);

      // --- SECTION 1: Ponto de Voz Fixo Table ---
      y = 72;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(15, 23, 42);
      doc.text("1. PONTO DE VOZ FIXO (PVF) - SALDO E UTILIZAÇÃO", 15, y);

      y += 4;
      doc.setFillColor(241, 245, 249);
      doc.rect(15, y, 267, 7, 'F');
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(15, 23, 42);

      doc.text("ITEM / SERVIÇO", 17, y + 4.5);
      doc.text("TARIFA UNIT.", 60, y + 4.5, { align: 'right' });
      doc.text("QTD LIMITE", 90, y + 4.5, { align: 'right' });
      doc.text("VALOR LIMITE", 130, y + 4.5, { align: 'right' });
      doc.text("QTD USADA", 160, y + 4.5, { align: 'right' });
      doc.text("VALOR USADO", 195, y + 4.5, { align: 'right' });
      doc.text("QTD DISPONÍVEL", 225, y + 4.5, { align: 'right' });
      doc.text("VALOR DISPONÍVEL", 260, y + 4.5, { align: 'right' });
      doc.text("% USO", 278, y + 4.5, { align: 'right' });

      y += 7;

      pvfItemsData.forEach((item, idx) => {
        doc.setFillColor(idx % 2 === 0 ? 255 : 248, idx % 2 === 0 ? 255 : 250, idx % 2 === 0 ? 255 : 252);
        doc.rect(15, y, 267, 5.5, 'F');

        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        doc.setTextColor(51, 65, 85);

        doc.text(item.label, 17, y + 3.8);
        doc.text(formatCurrency(item.unitPrice).replace('R$', '').trim(), 60, y + 3.8, { align: 'right' });
        doc.text(item.limitQty.toLocaleString('pt-BR'), 90, y + 3.8, { align: 'right' });
        doc.text(formatCurrency(item.limitValue).replace('R$', '').trim(), 130, y + 3.8, { align: 'right' });
        doc.text(item.usedQty.toLocaleString('pt-BR'), 160, y + 3.8, { align: 'right' });
        doc.text(formatCurrency(item.usedValue).replace('R$', '').trim(), 195, y + 3.8, { align: 'right' });
        doc.text(item.availableQty.toLocaleString('pt-BR'), 225, y + 3.8, { align: 'right' });
        doc.text(formatCurrency(item.availableValue).replace('R$', '').trim(), 260, y + 3.8, { align: 'right' });
        doc.text(`${item.percentUsed.toFixed(1)}%`, 278, y + 3.8, { align: 'right' });

        y += 5.5;
      });

      // Total PVF Row
      doc.setFillColor(241, 245, 249);
      doc.rect(15, y, 267, 6.5, 'F');
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(15, 23, 42);
      doc.text("TOTAL PONTO DE VOZ FIXO", 17, y + 4.5);
      doc.text(pvfTotals.limitQty.toLocaleString('pt-BR'), 90, y + 4.5, { align: 'right' });
      doc.text(formatCurrency(pvfTotals.limitVal).replace('R$', '').trim(), 130, y + 4.5, { align: 'right' });
      doc.text(pvfTotals.usedQty.toLocaleString('pt-BR'), 160, y + 4.5, { align: 'right' });
      doc.text(formatCurrency(pvfTotals.usedVal).replace('R$', '').trim(), 195, y + 4.5, { align: 'right' });
      doc.text(pvfTotals.availableQty.toLocaleString('pt-BR'), 225, y + 4.5, { align: 'right' });
      doc.text(formatCurrency(pvfTotals.availableVal).replace('R$', '').trim(), 260, y + 4.5, { align: 'right' });
      doc.text(`${pvfTotals.percentUsed.toFixed(1)}%`, 278, y + 4.5, { align: 'right' });

      // --- SECTION 2: Contact Center Table ---
      y += 12;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(15, 23, 42);
      doc.text("2. CONTACT CENTER - SALDO E UTILIZAÇÃO", 15, y);

      y += 4;
      doc.setFillColor(241, 245, 249);
      doc.rect(15, y, 267, 7, 'F');
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(15, 23, 42);

      doc.text("ITEM / SERVIÇO", 17, y + 4.5);
      doc.text("TARIFA UNIT.", 60, y + 4.5, { align: 'right' });
      doc.text("QTD LIMITE", 90, y + 4.5, { align: 'right' });
      doc.text("VALOR LIMITE", 130, y + 4.5, { align: 'right' });
      doc.text("QTD USADA", 160, y + 4.5, { align: 'right' });
      doc.text("VALOR USADO", 195, y + 4.5, { align: 'right' });
      doc.text("QTD DISPONÍVEL", 225, y + 4.5, { align: 'right' });
      doc.text("VALOR DISPONÍVEL", 260, y + 4.5, { align: 'right' });
      doc.text("% USO", 278, y + 4.5, { align: 'right' });

      y += 7;

      ccItemsData.forEach((item, idx) => {
        doc.setFillColor(idx % 2 === 0 ? 255 : 248, idx % 2 === 0 ? 255 : 250, idx % 2 === 0 ? 255 : 252);
        doc.rect(15, y, 267, 5.5, 'F');

        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        doc.setTextColor(51, 65, 85);

        doc.text(item.label, 17, y + 3.8);
        doc.text(formatCurrency(item.unitPrice).replace('R$', '').trim(), 60, y + 3.8, { align: 'right' });
        doc.text(item.limitQty.toLocaleString('pt-BR'), 90, y + 3.8, { align: 'right' });
        doc.text(formatCurrency(item.limitValue).replace('R$', '').trim(), 130, y + 3.8, { align: 'right' });
        doc.text(item.usedQty.toLocaleString('pt-BR'), 160, y + 3.8, { align: 'right' });
        doc.text(formatCurrency(item.usedValue).replace('R$', '').trim(), 195, y + 3.8, { align: 'right' });
        doc.text(item.availableQty.toLocaleString('pt-BR'), 225, y + 3.8, { align: 'right' });
        doc.text(formatCurrency(item.availableValue).replace('R$', '').trim(), 260, y + 3.8, { align: 'right' });
        doc.text(`${item.percentUsed.toFixed(1)}%`, 278, y + 3.8, { align: 'right' });

        y += 5.5;
      });

      // Total CC Row
      doc.setFillColor(241, 245, 249);
      doc.rect(15, y, 267, 6.5, 'F');
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(15, 23, 42);
      doc.text("TOTAL CONTACT CENTER", 17, y + 4.5);
      doc.text(ccTotals.limitQty.toLocaleString('pt-BR'), 90, y + 4.5, { align: 'right' });
      doc.text(formatCurrency(ccTotals.limitVal).replace('R$', '').trim(), 130, y + 4.5, { align: 'right' });
      doc.text(ccTotals.usedQty.toLocaleString('pt-BR'), 160, y + 4.5, { align: 'right' });
      doc.text(formatCurrency(ccTotals.usedVal).replace('R$', '').trim(), 195, y + 4.5, { align: 'right' });
      doc.text(ccTotals.availableQty.toLocaleString('pt-BR'), 225, y + 4.5, { align: 'right' });
      doc.text(formatCurrency(ccTotals.availableVal).replace('R$', '').trim(), 260, y + 4.5, { align: 'right' });
      doc.text(`${ccTotals.percentUsed.toFixed(1)}%`, 278, y + 4.5, { align: 'right' });

      doc.save(`Saldo_Contrato_PEII_${referenceMonth.replace('/', '_')}.pdf`);
      showToast("Relatório PDF de Saldo do Contrato exportado com sucesso!");
    } catch (err) {
      console.error("Erro ao gerar PDF de saldo:", err);
      showToast("Falha ao gerar relatório PDF.", "error");
    }
  };

  // -------------------------------------------------------------
  // Export Excel Handler
  // -------------------------------------------------------------
  const exportExcel = () => {
    try {
      const wb = XLSX.utils.book_new();

      // Sheet 1: Resumo Consolidado
      const summaryData = [
        ['MÉTODO TELECOM - RELATÓRIO EXECUTIVO DE SALDO DE CONTRATO PEII'],
        ['Mês de Referência:', referenceMonth],
        ['Data de Emissão:', new Date().toLocaleDateString('pt-BR')],
        [''],
        ['RESUMO GERAL CONSOLIDADO'],
        ['Módulo', 'Qtd Limite', 'Valor Limite (R$)', 'Qtd Usada', 'Valor Usado (R$)', 'Qtd Disponível', 'Valor Disponível (R$)', '% Consumo'],
        [
          'Ponto de Voz Fixo (PVF)',
          pvfTotals.limitQty,
          pvfTotals.limitVal,
          pvfTotals.usedQty,
          pvfTotals.usedVal,
          pvfTotals.availableQty,
          pvfTotals.availableVal,
          `${pvfTotals.percentUsed.toFixed(2)}%`
        ],
        [
          'Contact Center',
          ccTotals.limitQty,
          ccTotals.limitVal,
          ccTotals.usedQty,
          ccTotals.usedVal,
          ccTotals.availableQty,
          ccTotals.availableVal,
          `${ccTotals.percentUsed.toFixed(2)}%`
        ],
        [
          'TOTAL CONTRATO PEII',
          grandTotals.limitQty,
          grandTotals.limitVal,
          grandTotals.usedQty,
          grandTotals.usedVal,
          grandTotals.availableQty,
          grandTotals.availableVal,
          `${grandTotals.percentUsed.toFixed(2)}%`
        ]
      ];

      const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
      wsSummary['!cols'] = [{ wch: 25 }, { wch: 14 }, { wch: 20 }, { wch: 14 }, { wch: 20 }, { wch: 14 }, { wch: 20 }, { wch: 14 }];
      XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumo Geral');

      // Sheet 2: Detalhes PVF
      const pvfRows = pvfItemsData.map(item => ({
        'ITEM / SERVIÇO': item.label,
        'TARIFA UNITÁRIA (R$)': item.unitPrice,
        'QTD LIMITE': item.limitQty,
        'VALOR LIMITE (R$)': item.limitValue,
        'QTD USADA': item.usedQty,
        'VALOR USADO (R$)': item.usedValue,
        'QTD DISPONÍVEL': item.availableQty,
        'VALOR DISPONÍVEL (R$)': item.availableValue,
        '% UTILIZAÇÃO': `${item.percentUsed.toFixed(2)}%`,
        'STATUS': item.statusLabel
      }));
      const wsPvf = XLSX.utils.json_to_sheet(pvfRows);
      wsPvf['!cols'] = [{ wch: 20 }, { wch: 18 }, { wch: 14 }, { wch: 18 }, { wch: 14 }, { wch: 18 }, { wch: 14 }, { wch: 18 }, { wch: 14 }, { wch: 14 }];
      XLSX.utils.book_append_sheet(wb, wsPvf, 'Saldo PVF');

      // Sheet 3: Detalhes Contact Center
      const ccRows = ccItemsData.map(item => ({
        'ITEM / SERVIÇO': item.label,
        'TARIFA UNITÁRIA (R$)': item.unitPrice,
        'QTD LIMITE': item.limitQty,
        'VALOR LIMITE (R$)': item.limitValue,
        'QTD USADA': item.usedQty,
        'VALOR USADO (R$)': item.usedValue,
        'QTD DISPONÍVEL': item.availableQty,
        'VALOR DISPONÍVEL (R$)': item.availableValue,
        '% UTILIZAÇÃO': `${item.percentUsed.toFixed(2)}%`,
        'STATUS': item.statusLabel
      }));
      const wsCc = XLSX.utils.json_to_sheet(ccRows);
      wsCc['!cols'] = [{ wch: 20 }, { wch: 18 }, { wch: 14 }, { wch: 18 }, { wch: 14 }, { wch: 18 }, { wch: 14 }, { wch: 18 }, { wch: 14 }, { wch: 14 }];
      XLSX.utils.book_append_sheet(wb, wsCc, 'Saldo Contact Center');

      XLSX.writeFile(wb, `Saldo_Contrato_PEII_${referenceMonth.replace('/', '_')}.xlsx`);
      showToast("Planilha Excel exportada com sucesso!");
    } catch (err) {
      console.error("Erro ao gerar Excel de saldo:", err);
      showToast("Falha ao exportar planilha.", "error");
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Feedback */}
      {toast && (
        <div className={`fixed top-5 right-5 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-lg border text-xs font-bold animate-slide-in ${
          toast.type === 'success' 
            ? 'bg-emerald-50 dark:bg-emerald-950/90 border-emerald-300 dark:border-emerald-700 text-emerald-900 dark:text-emerald-200' 
            : toast.type === 'error'
            ? 'bg-rose-50 dark:bg-rose-950/90 border-rose-300 dark:border-rose-700 text-rose-900 dark:text-rose-200'
            : 'bg-sky-50 dark:bg-sky-950/90 border-sky-300 dark:border-sky-700 text-sky-900 dark:text-sky-200'
        }`}>
          <Info className="h-4.5 w-4.5 shrink-0" />
          <span>{toast.message}</span>
        </div>
      )}

      {/* Header Banner - High contrast dark styling */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 p-6 text-white shadow-xl border border-zinc-800">
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-1.5 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-800/80 border border-zinc-700/80 text-[11px] font-bold text-sky-300 uppercase tracking-wider backdrop-blur-xs">
              <Scale className="h-3.5 w-3.5 text-sky-400" />
              <span>Controle de Saldo Contratual PE II</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white font-sans">
              Saldo do Contrato
            </h1>
            <p className="text-xs sm:text-sm text-zinc-300 font-sans leading-relaxed">
              Acompanhamento do saldo limite contratado, quantidades utilizadas e disponibilidade restante em itens e valores para <strong>Ponto de Voz Fixo</strong> e <strong>Contact Center</strong>.
            </p>
          </div>

          {/* Month Selector & Export Actions */}
          <div className="flex flex-wrap items-center gap-3 bg-zinc-900/80 p-3 rounded-xl border border-zinc-750/80 backdrop-blur-xs">
            <div className="flex items-center gap-1.5 bg-zinc-950 border border-zinc-700 px-3 py-1.5 rounded-lg text-white">
              <button
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
                onClick={handleNextMonth}
                className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white transition-colors cursor-pointer"
                title="Próximo Mês"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <button
              onClick={() => setIsContractModalOpen(true)}
              className="px-3.5 py-2 bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold rounded-lg shadow-sm flex items-center gap-1.5 transition-all cursor-pointer hover:scale-102 active:scale-98"
              title="Visualizar e baixar documento oficial do Contrato (SEI/GOVPE)"
            >
              <FileCheck className="h-4 w-4" />
              <span>Visualizar Contrato</span>
            </button>

            <button
              onClick={exportPDF}
              className="px-3.5 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-lg shadow-sm flex items-center gap-1.5 transition-all cursor-pointer hover:scale-102 active:scale-98"
              title="Exportar Relatório em PDF"
            >
              <FileText className="h-4 w-4" />
              <span>PDF</span>
            </button>

            <button
              onClick={exportExcel}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg shadow-sm flex items-center gap-1.5 transition-all cursor-pointer hover:scale-102 active:scale-98"
              title="Exportar Planilha Excel"
            >
              <FileSpreadsheet className="h-4 w-4" />
              <span>Excel</span>
            </button>
          </div>
        </div>
      </div>

      {/* Top Consolidated KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Teto Total do Contrato */}
        <div className="p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm flex flex-col justify-between transition-all hover:border-zinc-300 dark:hover:border-zinc-700">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Limite Contratual Total
            </span>
            <div className="p-2.5 rounded-xl bg-sky-50 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400 border border-sky-100 dark:border-sky-900/50">
              <Scale className="h-4.5 w-4.5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-xl sm:text-2xl font-black text-zinc-900 dark:text-zinc-100 font-mono">
              {formatCurrency(grandTotals.limitVal)}
            </div>
            <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 flex items-center gap-1 font-medium">
              <span>{grandTotals.limitQty.toLocaleString('pt-BR')} itens contratados (PVF + CC)</span>
            </div>
          </div>
        </div>

        {/* Card 2: Saldo Usado no Mês */}
        <div className="p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm flex flex-col justify-between transition-all hover:border-zinc-300 dark:hover:border-zinc-700">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Saldo Usado ({referenceMonth})
            </span>
            <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 border border-amber-100 dark:border-amber-900/50">
              <TrendingUp className="h-4.5 w-4.5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-xl sm:text-2xl font-black text-amber-600 dark:text-amber-400 font-mono">
              {formatCurrency(grandTotals.usedVal)}
            </div>
            <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 flex items-center justify-between font-medium">
              <span>{grandTotals.usedQty.toLocaleString('pt-BR')} itens faturados</span>
              <span className="font-bold text-amber-600 dark:text-amber-400">
                {grandTotals.percentUsed.toFixed(1)}% do limite
              </span>
            </div>
          </div>
        </div>

        {/* Card 3: Saldo Disponível Restante */}
        <div className="p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm flex flex-col justify-between transition-all hover:border-zinc-300 dark:hover:border-zinc-700">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Saldo Disponível Restante
            </span>
            <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/50">
              <CheckCircle2 className="h-4.5 w-4.5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-xl sm:text-2xl font-black text-emerald-600 dark:text-emerald-400 font-mono">
              {formatCurrency(grandTotals.availableVal)}
            </div>
            <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 flex items-center justify-between font-medium">
              <span>{grandTotals.availableQty.toLocaleString('pt-BR')} itens livres</span>
              <span className="font-bold text-emerald-600 dark:text-emerald-400">
                {(100 - grandTotals.percentUsed).toFixed(1)}% livre
              </span>
            </div>
          </div>
        </div>

        {/* Card 4: Distribuição PVF vs CC */}
        <div className="p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm flex flex-col justify-between transition-all hover:border-zinc-300 dark:hover:border-zinc-700">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Consumo por Módulo
            </span>
            <div className="p-2.5 rounded-xl bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 border border-purple-100 dark:border-purple-900/50">
              <PieChart className="h-4.5 w-4.5" />
            </div>
          </div>
          <div className="space-y-2 mt-2">
            <div>
              <div className="flex items-center justify-between text-[11px] font-bold">
                <span className="text-zinc-600 dark:text-zinc-300">Ponto de Voz Fixo</span>
                <span className="font-mono text-zinc-900 dark:text-zinc-100">{pvfTotals.percentUsed.toFixed(1)}%</span>
              </div>
              <div className="h-1.5 w-full bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden mt-1">
                <div 
                  className="h-full bg-sky-500 dark:bg-sky-400 rounded-full transition-all duration-500" 
                  style={{ width: `${Math.min(100, pvfTotals.percentUsed)}%` }} 
                />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between text-[11px] font-bold">
                <span className="text-zinc-600 dark:text-zinc-300">Contact Center</span>
                <span className="font-mono text-zinc-900 dark:text-zinc-100">{ccTotals.percentUsed.toFixed(1)}%</span>
              </div>
              <div className="h-1.5 w-full bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden mt-1">
                <div 
                  className="h-full bg-purple-500 dark:bg-purple-400 rounded-full transition-all duration-500" 
                  style={{ width: `${Math.min(100, ccTotals.percentUsed)}%` }} 
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Sub-Navigation Tabs Bar */}
      <div className="p-2 sm:p-2.5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800/80 shadow-xs">
        <div className="flex items-center justify-between gap-3">
          {/* Sub-View Tabs */}
          <div className="flex flex-wrap items-center gap-1.5 p-1 bg-zinc-100/80 dark:bg-zinc-950/60 rounded-xl border border-zinc-200/80 dark:border-zinc-800/80 backdrop-blur-xs w-full sm:w-auto">
            <button
              onClick={() => setActiveSubView('consolidado')}
              className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
                activeSubView === 'consolidado'
                  ? 'bg-white/90 dark:bg-white/[0.08] text-zinc-900 dark:text-zinc-100 shadow-xs border border-zinc-200/90 dark:border-white/10'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-500/[0.06] dark:hover:bg-white/[0.04]'
              }`}
            >
              <Scale className={`h-4 w-4 ${activeSubView === 'consolidado' ? 'text-sky-500 dark:text-sky-400' : 'text-zinc-400 dark:text-zinc-500'}`} />
              <span>Visão Consolidada</span>
            </button>

            <button
              onClick={() => setActiveSubView('pvf')}
              className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
                activeSubView === 'pvf'
                  ? 'bg-white/90 dark:bg-white/[0.08] text-zinc-900 dark:text-zinc-100 shadow-xs border border-zinc-200/90 dark:border-white/10'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-500/[0.06] dark:hover:bg-white/[0.04]'
              }`}
            >
              <Phone className={`h-4 w-4 ${activeSubView === 'pvf' ? 'text-sky-500 dark:text-sky-400' : 'text-zinc-400 dark:text-zinc-500'}`} />
              <span>Ponto de Voz Fixo (10 Itens)</span>
            </button>

            <button
              onClick={() => setActiveSubView('cc')}
              className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
                activeSubView === 'cc'
                  ? 'bg-white/90 dark:bg-white/[0.08] text-zinc-900 dark:text-zinc-100 shadow-xs border border-zinc-200/90 dark:border-white/10'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-500/[0.06] dark:hover:bg-white/[0.04]'
              }`}
            >
              <Headset className={`h-4 w-4 ${activeSubView === 'cc' ? 'text-purple-500 dark:text-purple-400' : 'text-zinc-400 dark:text-zinc-500'}`} />
              <span>Contact Center (6 Itens)</span>
            </button>

            <button
              onClick={() => setActiveSubView('secretarias')}
              className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
                activeSubView === 'secretarias'
                  ? 'bg-white/90 dark:bg-white/[0.08] text-zinc-900 dark:text-zinc-100 shadow-xs border border-zinc-200/90 dark:border-white/10'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-500/[0.06] dark:hover:bg-white/[0.04]'
              }`}
            >
              <Building2 className={`h-4 w-4 ${activeSubView === 'secretarias' ? 'text-brand dark:text-brand-light' : 'text-zinc-400 dark:text-zinc-500'}`} />
              <span>Uso por Órgão / Secretaria</span>
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 1. VISÃO CONSOLIDADA TAB                                 */}
      {/* ========================================================= */}
      {activeSubView === 'consolidado' && (
        <div className="space-y-6 animate-fade-in">
          {/* Comparative Summary Table between Modules */}
          <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800/80 overflow-hidden shadow-xs">
            <div className="p-4 sm:p-5 border-b border-zinc-200 dark:border-zinc-800/80 flex items-center justify-between bg-zinc-50/70 dark:bg-zinc-900/90">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-800 dark:text-zinc-200 font-sans">
                  Quadro Geral Comparativo de Saldo
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  Consolidação dos saldos de quantidades e valores por módulo contratual
                </p>
              </div>
              <span className="px-3 py-1 rounded-full bg-brand/10 dark:bg-brand/15 text-brand dark:text-brand-light text-[11px] font-bold border border-brand/20 dark:border-brand/30">
                Mês: {referenceMonth}
              </span>
            </div>

            <div className="table-scrollbar-fluid">
              <table className="w-full text-left text-xs">
                <thead className="bg-zinc-50/90 dark:bg-zinc-950/60 text-zinc-600 dark:text-zinc-400 font-bold uppercase tracking-wider text-[10px] border-b border-zinc-200 dark:border-zinc-800/80">
                  <tr>
                    <th className="py-3 px-4">Módulo de Faturamento</th>
                    <th className="py-3 px-4 text-right">Qtd Limite</th>
                    <th className="py-3 px-4 text-right">Valor Limite (R$)</th>
                    <th className="py-3 px-4 text-right">Qtd Usada</th>
                    <th className="py-3 px-4 text-right">Valor Usado (R$)</th>
                    <th className="py-3 px-4 text-right">Qtd Disponível</th>
                    <th className="py-3 px-4 text-right">Valor Disponível (R$)</th>
                    <th className="py-3 px-4 text-center">Consumo %</th>
                    <th className="py-3 px-4 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200/70 dark:divide-zinc-800/60 font-medium">
                  {/* Row PVF */}
                  <tr className="hover:bg-zinc-500/[0.04] dark:hover:bg-white/[0.03] transition-colors">
                    <td className="py-3.5 px-4 font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-2">
                      <Phone className="h-4 w-4 text-sky-500 dark:text-sky-400" />
                      <span>Ponto de Voz Fixo (PVF)</span>
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-semibold text-zinc-700 dark:text-zinc-300">
                      {pvfTotals.limitQty.toLocaleString('pt-BR')}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-semibold text-zinc-700 dark:text-zinc-300">
                      {formatCurrency(pvfTotals.limitVal)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-amber-600 dark:text-amber-400">
                      {pvfTotals.usedQty.toLocaleString('pt-BR')}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-amber-600 dark:text-amber-400">
                      {formatCurrency(pvfTotals.usedVal)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                      {pvfTotals.availableQty.toLocaleString('pt-BR')}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                      {formatCurrency(pvfTotals.availableVal)}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <div className="w-16 h-2 bg-zinc-200/70 dark:bg-zinc-800 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-sky-500 dark:bg-sky-400 rounded-full transition-all duration-500" 
                            style={{ width: `${Math.min(100, pvfTotals.percentUsed)}%` }} 
                          />
                        </div>
                        <span className="font-mono text-xs font-bold text-zinc-700 dark:text-zinc-300">
                          {pvfTotals.percentUsed.toFixed(1)}%
                        </span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <span className="inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-800/40">
                        Normal
                      </span>
                    </td>
                  </tr>

                  {/* Row CC */}
                  <tr className="hover:bg-zinc-500/[0.04] dark:hover:bg-white/[0.03] transition-colors">
                    <td className="py-3.5 px-4 font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-2">
                      <Headset className="h-4 w-4 text-purple-500 dark:text-purple-400" />
                      <span>Contact Center</span>
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-semibold text-zinc-700 dark:text-zinc-300">
                      {ccTotals.limitQty.toLocaleString('pt-BR')}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-semibold text-zinc-700 dark:text-zinc-300">
                      {formatCurrency(ccTotals.limitVal)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-amber-600 dark:text-amber-400">
                      {ccTotals.usedQty.toLocaleString('pt-BR')}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-amber-600 dark:text-amber-400">
                      {formatCurrency(ccTotals.usedVal)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                      {ccTotals.availableQty.toLocaleString('pt-BR')}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                      {formatCurrency(ccTotals.availableVal)}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <div className="w-16 h-2 bg-zinc-200/70 dark:bg-zinc-800 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-purple-500 dark:bg-purple-400 rounded-full transition-all duration-500" 
                            style={{ width: `${Math.min(100, ccTotals.percentUsed)}%` }} 
                          />
                        </div>
                        <span className="font-mono text-xs font-bold text-zinc-700 dark:text-zinc-300">
                          {ccTotals.percentUsed.toFixed(1)}%
                        </span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <span className="inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-800/40">
                        Normal
                      </span>
                    </td>
                  </tr>
                </tbody>
                <tfoot className="bg-zinc-100/90 dark:bg-zinc-950/80 font-bold border-t-2 border-zinc-300 dark:border-zinc-800 text-zinc-900 dark:text-zinc-200">
                  <tr>
                    <td className="py-3.5 px-4 text-xs font-bold uppercase">TOTAL CONTRATO PEII</td>
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-xs">
                      {grandTotals.limitQty.toLocaleString('pt-BR')}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-xs">
                      {formatCurrency(grandTotals.limitVal)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-xs text-amber-600 dark:text-amber-400">
                      {grandTotals.usedQty.toLocaleString('pt-BR')}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-xs text-amber-600 dark:text-amber-400">
                      {formatCurrency(grandTotals.usedVal)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-xs text-emerald-600 dark:text-emerald-400">
                      {grandTotals.availableQty.toLocaleString('pt-BR')}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-xs text-emerald-600 dark:text-emerald-400">
                      {formatCurrency(grandTotals.availableVal)}
                    </td>
                    <td className="py-3.5 px-4 text-center font-mono font-bold text-xs text-zinc-800 dark:text-zinc-200">
                      {grandTotals.percentUsed.toFixed(1)}%
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <span className="inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100/80 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300/80 dark:border-emerald-800/60">
                        Auditado
                      </span>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Side-by-side Top Items Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top PVF Items */}
            <div className="p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800/80 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800/80 pb-3">
                <div className="flex items-center gap-2">
                  <Phone className="h-4.5 w-4.5 text-sky-500 dark:text-sky-400" />
                  <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-800 dark:text-zinc-200">
                    Ponto de Voz Fixo - Principais Itens
                  </h4>
                </div>
                <button
                  onClick={() => setActiveSubView('pvf')}
                  className="text-xs text-brand dark:text-brand-light font-bold hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <span>Ver todos (10)</span>
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="space-y-3">
                {pvfItemsData.slice(0, 5).map(item => (
                  <div key={item.key} className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-200/80 dark:border-zinc-800/70 hover:bg-zinc-500/[0.04] dark:hover:bg-white/[0.03] transition-colors">
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span className="text-zinc-800 dark:text-zinc-200">{item.label}</span>
                      <span className="font-mono text-zinc-600 dark:text-zinc-400 font-semibold">
                        {item.usedQty.toLocaleString('pt-BR')} / {item.limitQty.toLocaleString('pt-BR')} ({item.percentUsed.toFixed(1)}%)
                      </span>
                    </div>
                    <div className="h-2 w-full bg-zinc-200/80 dark:bg-zinc-800 rounded-full overflow-hidden mt-2">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          item.percentUsed > 85 ? 'bg-rose-500 dark:bg-rose-400' : item.percentUsed > 65 ? 'bg-amber-500 dark:bg-amber-400' : 'bg-sky-500 dark:bg-sky-400'
                        }`}
                        style={{ width: `${Math.min(100, item.percentUsed)}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400 mt-2 font-medium">
                      <span>Tarifa: {formatCurrency(item.unitPrice)}</span>
                      <span className="font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                        Saldo: {item.availableQty.toLocaleString('pt-BR')} ({formatCurrency(item.availableValue)})
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Contact Center Items */}
            <div className="p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800/80 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800/80 pb-3">
                <div className="flex items-center gap-2">
                  <Headset className="h-4.5 w-4.5 text-purple-500 dark:text-purple-400" />
                  <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-800 dark:text-zinc-200">
                    Contact Center - Itens do Contrato
                  </h4>
                </div>
                <button
                  onClick={() => setActiveSubView('cc')}
                  className="text-xs text-brand dark:text-brand-light font-bold hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <span>Ver todos (6)</span>
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="space-y-3">
                {ccItemsData.map(item => (
                  <div key={item.key} className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-200/80 dark:border-zinc-800/70 hover:bg-zinc-500/[0.04] dark:hover:bg-white/[0.03] transition-colors">
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span className="text-zinc-800 dark:text-zinc-200">{item.label}</span>
                      <span className="font-mono text-zinc-600 dark:text-zinc-400 font-semibold">
                        {item.usedQty.toLocaleString('pt-BR')} / {item.limitQty.toLocaleString('pt-BR')} ({item.percentUsed.toFixed(1)}%)
                      </span>
                    </div>
                    <div className="h-2 w-full bg-zinc-200/80 dark:bg-zinc-800 rounded-full overflow-hidden mt-2">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          item.percentUsed > 85 ? 'bg-rose-500 dark:bg-rose-400' : item.percentUsed > 65 ? 'bg-amber-500 dark:bg-amber-400' : 'bg-purple-500 dark:bg-purple-400'
                        }`}
                        style={{ width: `${Math.min(100, item.percentUsed)}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400 mt-2 font-medium">
                      <span>Tarifa: {formatCurrency(item.unitPrice)}</span>
                      <span className="font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                        Saldo: {item.availableQty.toLocaleString('pt-BR')} ({formatCurrency(item.availableValue)})
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 2. PONTO DE VOZ FIXO DETAILED TAB                        */}
      {/* ========================================================= */}
      {activeSubView === 'pvf' && (
        <div className="space-y-6 animate-fade-in">
          <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800/80 overflow-hidden shadow-xs">
            <div className="p-4 sm:p-5 border-b border-zinc-200 dark:border-zinc-800/80 flex items-center justify-between bg-zinc-50/70 dark:bg-zinc-900/90">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-sky-50 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400 border border-sky-100 dark:border-sky-900/50 rounded-xl">
                  <Phone className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-800 dark:text-zinc-200 font-sans">
                    Saldo Detalhado: Ponto de Voz Fixo (PVF)
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    10 tipos de itens com limites contratuais, tarifas unitárias, consumo no mês e saldo
                  </p>
                </div>
              </div>
              <span className="text-xs font-mono font-bold text-zinc-600 dark:text-zinc-300">
                {filteredPvfItems.length} de 10 itens
              </span>
            </div>

            <div className="table-scrollbar-fluid">
              <table className="w-full text-left text-xs">
                <thead className="bg-zinc-50/90 dark:bg-zinc-950/60 text-zinc-600 dark:text-zinc-400 font-bold uppercase tracking-wider text-[10px] border-b border-zinc-200 dark:border-zinc-800/80">
                  <tr>
                    <th className="py-3 px-4">Item / Serviço</th>
                    <th className="py-3 px-4 text-right">Tarifa Unit. (R$)</th>
                    <th className="py-3 px-4 text-right">Qtd Limite</th>
                    <th className="py-3 px-4 text-right">Valor Limite (R$)</th>
                    <th className="py-3 px-4 text-right">Qtd Usada</th>
                    <th className="py-3 px-4 text-right">Valor Usado (R$)</th>
                    <th className="py-3 px-4 text-right">Qtd Disponível</th>
                    <th className="py-3 px-4 text-right">Valor Disponível (R$)</th>
                    <th className="py-3 px-4 text-center">Consumo %</th>
                    <th className="py-3 px-4 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200/70 dark:divide-zinc-800/60 font-medium">
                  {filteredPvfItems.map((item) => (
                    <tr key={item.key} className="hover:bg-zinc-500/[0.04] dark:hover:bg-white/[0.03] transition-colors">
                      <td className="py-3 px-4 font-bold text-zinc-800 dark:text-zinc-200">
                        {item.label}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-zinc-700 dark:text-zinc-300">
                        {formatCurrency(item.unitPrice)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-semibold text-zinc-800 dark:text-zinc-200">
                        {item.limitQty.toLocaleString('pt-BR')}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-zinc-700 dark:text-zinc-300">
                        {formatCurrency(item.limitValue)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-amber-600 dark:text-amber-400">
                        {item.usedQty.toLocaleString('pt-BR')}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-amber-600 dark:text-amber-400">
                        {formatCurrency(item.usedValue)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        {item.availableQty.toLocaleString('pt-BR')}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(item.availableValue)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <div className="w-16 h-2 bg-zinc-200/70 dark:bg-zinc-800 rounded-full overflow-hidden">
                            <div 
                              className={`h-full rounded-full transition-all duration-500 ${
                                item.percentUsed > 85 ? 'bg-rose-500 dark:bg-rose-400' : item.percentUsed > 65 ? 'bg-amber-500 dark:bg-amber-400' : 'bg-sky-500 dark:bg-sky-400'
                              }`} 
                              style={{ width: `${Math.min(100, item.percentUsed)}%` }} 
                            />
                          </div>
                          <span className="font-mono text-xs font-bold text-zinc-700 dark:text-zinc-300">
                            {item.percentUsed.toFixed(1)}%
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className={`inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                          item.statusCategory === 'critico'
                            ? 'bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-400 border border-rose-200/60 dark:border-rose-800/40'
                            : item.statusCategory === 'alerta'
                            ? 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400 border border-amber-200/60 dark:border-amber-800/40'
                            : 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-800/40'
                        }`}>
                          {item.statusLabel}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {filteredPvfItems.length === 0 && (
                    <tr>
                      <td colSpan={10} className="py-8 text-center text-zinc-400 dark:text-zinc-500">
                        Nenhum item encontrado.
                      </td>
                    </tr>
                  )}
                </tbody>
                <tfoot className="bg-zinc-100/90 dark:bg-zinc-950/80 font-bold border-t-2 border-zinc-300 dark:border-zinc-800 text-zinc-900 dark:text-zinc-200">
                  <tr>
                    <td className="py-3.5 px-4 text-xs font-bold uppercase">TOTAL PONTO DE VOZ FIXO</td>
                    <td className="py-3.5 px-4 text-right font-mono text-xs">-</td>
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-xs">
                      {pvfTotals.limitQty.toLocaleString('pt-BR')}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-xs">
                      {formatCurrency(pvfTotals.limitVal)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-xs text-amber-600 dark:text-amber-400">
                      {pvfTotals.usedQty.toLocaleString('pt-BR')}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-xs text-amber-600 dark:text-amber-400">
                      {formatCurrency(pvfTotals.usedVal)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-xs text-emerald-600 dark:text-emerald-400">
                      {pvfTotals.availableQty.toLocaleString('pt-BR')}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-xs text-emerald-600 dark:text-emerald-400">
                      {formatCurrency(pvfTotals.availableVal)}
                    </td>
                    <td className="py-3.5 px-4 text-center font-mono font-bold text-xs text-zinc-800 dark:text-zinc-200">
                      {pvfTotals.percentUsed.toFixed(1)}%
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <span className="inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100/80 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300/80 dark:border-emerald-800/60">
                        Auditado
                      </span>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 3. CONTACT CENTER DETAILED TAB                           */}
      {/* ========================================================= */}
      {activeSubView === 'cc' && (
        <div className="space-y-6 animate-fade-in">
          <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800/80 overflow-hidden shadow-xs">
            <div className="p-4 sm:p-5 border-b border-zinc-200 dark:border-zinc-800/80 flex items-center justify-between bg-zinc-50/70 dark:bg-zinc-900/90">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 border border-purple-100 dark:border-purple-900/50 rounded-xl">
                  <Headset className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-800 dark:text-zinc-200 font-sans">
                    Saldo Detalhado: Contact Center
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    6 tipos de serviços (UCDA, Gravação e URA) com limites, tarifas, consumo e saldo
                  </p>
                </div>
              </div>
              <span className="text-xs font-mono font-bold text-zinc-600 dark:text-zinc-300">
                {filteredCcItems.length} de 6 itens
              </span>
            </div>

            <div className="table-scrollbar-fluid">
              <table className="w-full text-left text-xs">
                <thead className="bg-zinc-50/90 dark:bg-zinc-950/60 text-zinc-600 dark:text-zinc-400 font-bold uppercase tracking-wider text-[10px] border-b border-zinc-200 dark:border-zinc-800/80">
                  <tr>
                    <th className="py-3 px-4">Item / Serviço</th>
                    <th className="py-3 px-4 text-right">Tarifa Unit. (R$)</th>
                    <th className="py-3 px-4 text-right">Qtd Limite</th>
                    <th className="py-3 px-4 text-right">Valor Limite (R$)</th>
                    <th className="py-3 px-4 text-right">Qtd Usada</th>
                    <th className="py-3 px-4 text-right">Valor Usado (R$)</th>
                    <th className="py-3 px-4 text-right">Qtd Disponível</th>
                    <th className="py-3 px-4 text-right">Valor Disponível (R$)</th>
                    <th className="py-3 px-4 text-center">Consumo %</th>
                    <th className="py-3 px-4 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200/70 dark:divide-zinc-800/60 font-medium">
                  {filteredCcItems.map((item) => (
                    <tr key={item.key} className="hover:bg-zinc-500/[0.04] dark:hover:bg-white/[0.03] transition-colors">
                      <td className="py-3 px-4 font-bold text-zinc-800 dark:text-zinc-200">
                        {item.label}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-zinc-700 dark:text-zinc-300">
                        {formatCurrency(item.unitPrice)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-semibold text-zinc-800 dark:text-zinc-200">
                        {item.limitQty.toLocaleString('pt-BR')}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-zinc-700 dark:text-zinc-300">
                        {formatCurrency(item.limitValue)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-amber-600 dark:text-amber-400">
                        {item.usedQty.toLocaleString('pt-BR')}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-amber-600 dark:text-amber-400">
                        {formatCurrency(item.usedValue)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        {item.availableQty.toLocaleString('pt-BR')}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(item.availableValue)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <div className="w-16 h-2 bg-zinc-200/70 dark:bg-zinc-800 rounded-full overflow-hidden">
                            <div 
                              className={`h-full rounded-full transition-all duration-500 ${
                                item.percentUsed > 85 ? 'bg-rose-500 dark:bg-rose-400' : item.percentUsed > 65 ? 'bg-amber-500 dark:bg-amber-400' : 'bg-purple-500 dark:bg-purple-400'
                              }`} 
                              style={{ width: `${Math.min(100, item.percentUsed)}%` }} 
                            />
                          </div>
                          <span className="font-mono text-xs font-bold text-zinc-700 dark:text-zinc-300">
                            {item.percentUsed.toFixed(1)}%
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className={`inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                          item.statusCategory === 'critico'
                            ? 'bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-400 border border-rose-200/60 dark:border-rose-800/40'
                            : item.statusCategory === 'alerta'
                            ? 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400 border border-amber-200/60 dark:border-amber-800/40'
                            : 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-800/40'
                        }`}>
                          {item.statusLabel}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {filteredCcItems.length === 0 && (
                    <tr>
                      <td colSpan={10} className="py-8 text-center text-zinc-400 dark:text-zinc-500">
                        Nenhum serviço encontrado.
                      </td>
                    </tr>
                  )}
                </tbody>
                <tfoot className="bg-zinc-100/90 dark:bg-zinc-950/80 font-bold border-t-2 border-zinc-300 dark:border-zinc-800 text-zinc-900 dark:text-zinc-200">
                  <tr>
                    <td className="py-3.5 px-4 text-xs font-bold uppercase">TOTAL CONTACT CENTER</td>
                    <td className="py-3.5 px-4 text-right font-mono text-xs">-</td>
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-xs">
                      {ccTotals.limitQty.toLocaleString('pt-BR')}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-xs">
                      {formatCurrency(ccTotals.limitVal)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-xs text-amber-600 dark:text-amber-400">
                      {ccTotals.usedQty.toLocaleString('pt-BR')}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-xs text-amber-600 dark:text-amber-400">
                      {formatCurrency(ccTotals.usedVal)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-xs text-emerald-600 dark:text-emerald-400">
                      {ccTotals.availableQty.toLocaleString('pt-BR')}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-xs text-emerald-600 dark:text-emerald-400">
                      {formatCurrency(ccTotals.availableVal)}
                    </td>
                    <td className="py-3.5 px-4 text-center font-mono font-bold text-xs text-zinc-800 dark:text-zinc-200">
                      {ccTotals.percentUsed.toFixed(1)}%
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <span className="inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100/80 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300/80 dark:border-emerald-800/60">
                        Auditado
                      </span>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 4. SECRETARIAS USAGE MATRIX TAB                          */}
      {/* ========================================================= */}
      {activeSubView === 'secretarias' && (
        <div className="space-y-6 animate-fade-in">
          <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800/80 overflow-hidden shadow-xs">
            <div className="p-4 sm:p-5 border-b border-zinc-200 dark:border-zinc-800/80 flex items-center justify-between bg-zinc-50/70 dark:bg-zinc-900/90">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-brand/10 dark:bg-brand/20 text-brand dark:text-brand-light border border-brand/20 dark:border-brand/30 rounded-xl">
                  <Building2 className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-800 dark:text-zinc-200 font-sans">
                    Utilização de Cotas por Órgão / Secretaria
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Demonstrativo de quanto cada secretaria está consumindo das cotas contratuais no mês
                  </p>
                </div>
              </div>
              <span className="text-xs font-mono font-bold text-zinc-600 dark:text-zinc-300">
                {secretariasMatrix.length} órgãos listados
              </span>
            </div>

            <div className="table-scrollbar-fluid">
              <table className="w-full text-left text-xs">
                <thead className="bg-zinc-50/90 dark:bg-zinc-950/60 text-zinc-600 dark:text-zinc-400 font-bold uppercase tracking-wider text-[10px] border-b border-zinc-200 dark:border-zinc-800/80">
                  <tr>
                    <th className="py-3 px-4">Secretaria / Órgão</th>
                    <th className="py-3 px-4 text-center">Contratos Ativos</th>
                    <th className="py-3 px-4 text-right">Qtd PVF</th>
                    <th className="py-3 px-4 text-right">Faturamento PVF (R$)</th>
                    <th className="py-3 px-4 text-right">Qtd Contact Center</th>
                    <th className="py-3 px-4 text-right">Faturamento CC (R$)</th>
                    <th className="py-3 px-4 text-right">Consumo Total (R$)</th>
                    <th className="py-3 px-4 text-center">% do Faturamento Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200/70 dark:divide-zinc-800/60 font-medium">
                  {secretariasMatrix.map((sec, idx) => {
                    const pctOfTotal = grandTotals.usedVal > 0 ? (sec.totalVal / grandTotals.usedVal) * 100 : 0;
                    return (
                      <tr key={sec.secretaria} className="hover:bg-zinc-500/[0.04] dark:hover:bg-white/[0.03] transition-colors">
                        <td className="py-3 px-4 font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-2">
                          <span className="text-zinc-400 dark:text-zinc-500 font-mono text-[11px] w-5">#{idx + 1}</span>
                          <span>{sec.secretaria}</span>
                        </td>
                        <td className="py-3 px-4 text-center font-mono text-zinc-700 dark:text-zinc-300">
                          {sec.contractCount}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-zinc-700 dark:text-zinc-300">
                          {sec.pvfQty.toLocaleString('pt-BR')}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-sky-600 dark:text-sky-400 font-bold">
                          {formatCurrency(sec.pvfVal)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-zinc-700 dark:text-zinc-300">
                          {sec.ccQty.toLocaleString('pt-BR')}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-purple-600 dark:text-purple-400 font-bold">
                          {formatCurrency(sec.ccVal)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-zinc-900 dark:text-zinc-100 font-black">
                          {formatCurrency(sec.totalVal)}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <div className="w-16 h-2 bg-zinc-200/70 dark:bg-zinc-800 rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-brand dark:bg-brand-light rounded-full transition-all duration-500" 
                                style={{ width: `${Math.min(100, pctOfTotal)}%` }} 
                              />
                            </div>
                            <span className="font-mono text-xs font-bold text-zinc-700 dark:text-zinc-300">
                              {pctOfTotal.toFixed(1)}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {secretariasMatrix.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-zinc-400 dark:text-zinc-500">
                        Nenhuma secretaria ou órgão encontrado.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Floating Contract Viewer Modal */}
      <ContractViewerModal
        isOpen={isContractModalOpen}
        onClose={() => setIsContractModalOpen(false)}
      />
    </div>
  );
}
