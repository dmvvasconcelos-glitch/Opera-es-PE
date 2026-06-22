/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { Contract, PvfPrices, PvfKey } from '../types';
import { PVF_LABELS, getContractPvfTotal, getContractValue, formatCurrency } from '../data';
import { 
  FileText, 
  Check, 
  Download, 
  Printer, 
  Plus, 
  Settings2, 
  SlidersHorizontal,
  Building,
  TableProperties,
  ArrowUpDown
} from 'lucide-react';

interface CustomReportProps {
  contracts: Contract[];
  prices: PvfPrices;
}

export default function CustomReport({ contracts, prices }: CustomReportProps) {
  // Report Configuration States
  const [reportTitle, setReportTitle] = useState('Relatório Consolidado de PVFs e Contratos');
  const [reportSub, setReportSub] = useState('Análise detalhada de faturamento por órgão do poder executivo estadual');
  const [selectedStatusList, setSelectedStatusList] = useState<string[]>(['Ativo', 'Suspenso']);
  const [selectedSecs, setSelectedSecs] = useState<string[]>([]);
  const [selectedColumns, setSelectedColumns] = useState<string[]>([
    'contrato',
    'secretaria',
    'status',
    'analogico',
    'semFio',
    'extensao',
    'ipBasico',
    'software',
    'qtdPvf',
    'valorTotal'
  ]);
  const [groupBy, setGroupBy] = useState<'none' | 'secretaria' | 'status'>('none');

  // List of all columns for customized reports
  const ALL_REPORT_COLUMNS = [
    { key: 'contrato', label: 'ID Contrato' },
    { key: 'secretaria', label: 'Secretaria/Órgão' },
    { key: 'status', label: 'Situação' },
    ...Object.entries(PVF_LABELS).map(([k, label]) => ({ key: k, label })),
    { key: 'qtdPvf', label: 'Volume PVFs Total' },
    { key: 'valorTotal', label: 'Mensal Total (R$)' }
  ];

  // List of unique secretarias
  const uniqueSecretarias = useMemo(() => {
    return Array.from(new Set(contracts.map(c => c.secretaria.split(' - ')[0]))).sort();
  }, [contracts]);

  const handleStatusToggle = (status: string) => {
    setSelectedStatusList(prev => 
      prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]
    );
  };

  const handleSecToggle = (sec: string) => {
    setSelectedSecs(prev => 
      prev.includes(sec) ? prev.filter(s => s !== sec) : [...prev, sec]
    );
  };

  const handleColumnToggle = (colKey: string) => {
    setSelectedColumns(prev => 
      prev.includes(colKey) ? prev.filter(c => c !== colKey) : [...prev, colKey]
    );
  };

  // 2. Generating report data based on parameters
  const reportData = useMemo(() => {
    // Filter base
    let base = contracts.filter(c => {
      // Status filter
      const matchesStatus = selectedStatusList.includes(c.status);
      
      // Sec filter (if any checked)
      const matchesSec = selectedSecs.length === 0 || selectedSecs.some(s => c.secretaria.startsWith(s));

      return matchesStatus && matchesSec;
    });

    if (groupBy === 'none') {
      return base.map(c => ({
        ...c,
        calculatedTotal: getContractValue(c, prices),
        calculatedPvfQty: getContractPvfTotal(c)
      }));
    }

    // Grouping calculations
    const groups: Record<string, typeof base> = {};
    base.forEach(c => {
      const gKey = groupBy === 'secretaria' ? c.secretaria.split(' - ')[0] : c.status;
      if (!groups[gKey]) {
        groups[gKey] = [];
      }
      groups[gKey].push(c);
    });

    // Formatting as grouped visual table elements
    return Object.entries(groups).map(([groupTitle, list]) => {
      const gQty: Record<PvfKey, number> = {
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

      list.forEach(item => {
        Object.keys(gQty).forEach(k => {
          const key = k as PvfKey;
          gQty[key] += item.quantities[key] || 0;
        });
      });

      const totalQty = Object.values(gQty).reduce((a, b) => a + b, 0);
      const totalVal = list.reduce((acc, item) => acc + getContractValue(item, prices), 0);

      return {
        isGroupHeader: true,
        groupTitle,
        count: list.length,
        quantities: gQty,
        calculatedPvfQty: totalQty,
        calculatedTotal: totalVal,
        items: list.map(item => ({
          ...item,
          calculatedTotal: getContractValue(item, prices),
          calculatedPvfQty: getContractPvfTotal(item)
        }))
      };
    });

  }, [contracts, prices, selectedStatusList, selectedSecs, groupBy]);

  // Aggregate values for the report footer
  const reportSummary = useMemo(() => {
    let rawItems: Contract[] = [];
    
    contracts.forEach(c => {
      const matchesStatus = selectedStatusList.includes(c.status);
      const matchesSec = selectedSecs.length === 0 || selectedSecs.some(s => c.secretaria.startsWith(s));
      if (matchesStatus && matchesSec) {
        rawItems.push(c);
      }
    });

    const sumQty = rawItems.reduce((acc, c) => acc + getContractPvfTotal(c), 0);
    const sumVal = rawItems.reduce((acc, c) => acc + getContractValue(c, prices), 0);

    return {
      totalContracts: rawItems.length,
      totalPvfQty: sumQty,
      totalBillingValue: sumVal
    };
  }, [contracts, prices, selectedStatusList, selectedSecs]);

  // Download Report layout as Excel CSV
  const downloadCustomCsv = () => {
    try {
      const colHeaders = ALL_REPORT_COLUMNS
        .filter(c => selectedColumns.includes(c.key))
        .map(c => c.label);

      let csvRows = [
        [reportTitle],
        [reportSub],
        ['Gerado em: ' + new Date().toLocaleDateString('pt-BR') + ' ' + new Date().toLocaleTimeString('pt-BR')],
        [],
        colHeaders.join(';')
      ];

      if (groupBy === 'none') {
        const rows = (reportData as any[]).map(item => {
          return ALL_REPORT_COLUMNS
            .filter(c => selectedColumns.includes(c.key))
            .map(c => {
              if (c.key === 'contrato') return item.contrato;
              if (c.key === 'secretaria') return item.secretaria;
              if (c.key === 'status') return item.status;
              if (c.key === 'qtdPvf') return item.calculatedPvfQty;
              if (c.key === 'valorTotal') return item.calculatedTotal.toFixed(2);
              return item.quantities[c.key as PvfKey] || 0;
            });
        });
        csvRows.push(...rows.map(r => r.join(';')));
      } else {
        // Grouped
        (reportData as any[]).forEach(g => {
          csvRows.push([`>>> GRUPO: ${g.groupTitle} (${g.count} contratos)`]);
          
          const itemRows = g.items.map((item: any) => {
            return ALL_REPORT_COLUMNS
              .filter(c => selectedColumns.includes(c.key))
              .map(c => {
                if (c.key === 'contrato') return item.contrato;
                if (c.key === 'secretaria') return item.secretaria;
                if (c.key === 'status') return item.status;
                if (c.key === 'qtdPvf') return item.calculatedPvfQty;
                if (c.key === 'valorTotal') return item.calculatedTotal.toFixed(2);
                return item.quantities[c.key as PvfKey] || 0;
              });
          });
          csvRows.push(...itemRows.map((r: any) => r.join(';')));

          // Group Subtotals
          const subtotalRow = ALL_REPORT_COLUMNS
            .filter(c => selectedColumns.includes(c.key))
            .map(c => {
              if (c.key === 'contrato') return 'SUBTOTAL DO GRUPO';
              if (c.key === 'qtdPvf') return g.calculatedPvfQty;
              if (c.key === 'valorTotal') return g.calculatedTotal.toFixed(2);
              if (['secretaria', 'status'].includes(c.key)) return '-';
              return g.quantities[c.key as PvfKey] || 0;
            });
          csvRows.push(subtotalRow.join(';'));
          csvRows.push([]);
        });
      }

      // Add Footer Summary
      csvRows.push([]);
      csvRows.push(['RESUMO DO RELATÓRIO']);
      csvRows.push([`Contratos selecionados:;${reportSummary.totalContracts}`]);
      csvRows.push([`Ponto de Voz Fixo (PVFs) Total:;${reportSummary.totalPvfQty}`]);
      csvRows.push([`Billing Mensal Consolidado:;R$ ${reportSummary.totalBillingValue.toFixed(2)}`]);

      const csvContent = csvRows.map(row => (Array.isArray(row) ? row.join(';') : row)).join('\n');
      const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `relatorio_customizado_${Date.now()}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch {
      alert('Erro ao exportar relatório customizado.');
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Configuration Hub panel */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-2xl shadow-xs p-6 space-y-6">
        <div className="flex items-center gap-2">
          <Settings2 className="h-5 w-5 text-emerald-600" />
          <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider">
            Painel de Customização de Relatórios Estaduais
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs text-zinc-600 dark:text-zinc-400">
          
          {/* Controls 1: Metadata titles & group */}
          <div className="space-y-4">
            <span className="font-bold text-zinc-500 uppercase tracking-widest block border-b pb-1 dark:border-zinc-800">
              🏷️ Identificação e Agrupamento
            </span>
            <div>
              <label className="block mb-1 text-zinc-400 font-medium">Título do Relatório</label>
              <input
                type="text"
                value={reportTitle}
                onChange={(e) => setReportTitle(e.target.value)}
                className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 px-3 py-2 rounded-xl text-zinc-850 dark:text-zinc-200 focus:outline-none"
              />
            </div>
            <div>
              <label className="block mb-1 text-zinc-400 font-medium">Subtítulo ou Notas de Escopo</label>
              <input
                type="text"
                value={reportSub}
                onChange={(e) => setReportSub(e.target.value)}
                className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 px-3 py-2 rounded-xl text-zinc-850 dark:text-zinc-200 focus:outline-none"
              />
            </div>
            <div>
              <label className="block mb-1 text-zinc-400 font-medium">Agrupar por Atributo</label>
              <select
                value={groupBy}
                onChange={(e) => setGroupBy(e.target.value as any)}
                className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 px-3 py-2 rounded-xl text-zinc-850 dark:text-zinc-200 focus:outline-none"
              >
                <option value="none">Sem agrupamento (Lista corrida)</option>
                <option value="secretaria">Órgão / Secretaria</option>
                <option value="status">Situação de Atividade (Status)</option>
              </select>
            </div>
          </div>

          {/* Controls 2: Secretaria scope & status scope */}
          <div className="space-y-4">
            <span className="font-bold text-zinc-500 uppercase tracking-widest block border-b pb-1 dark:border-zinc-800">
              🏢 Escopo de Órgãos Estaduais e Status
            </span>
            
            <div className="space-y-2">
              <label className="block text-zinc-400 font-medium">Filtrar por Status</label>
              <div className="flex gap-2">
                {['Ativo', 'Suspenso', 'Encerrado'].map(st => {
                  const check = selectedStatusList.includes(st);
                  return (
                    <button
                      key={st}
                      onClick={() => handleStatusToggle(st)}
                      className={`flex-1 py-1 px-2.5 rounded-lg border text-center font-bold font-mono text-[10px] transition-all ${
                        check 
                         ? 'bg-emerald-600 text-white border-emerald-600' 
                         : 'bg-zinc-50 dark:bg-zinc-950 text-zinc-500 border-zinc-200 dark:border-zinc-800'
                      }`}
                    >
                      {st}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-zinc-400 font-medium">Incluir Unidades de Secretaria (Vazio para todas)</label>
              <div className="max-h-24 overflow-y-auto border border-zinc-150 dark:border-zinc-800 p-2 rounded-lg bg-zinc-50 dark:bg-zinc-950 grid grid-cols-2 gap-1.5">
                {uniqueSecretarias.map(sec => {
                  const isChecked = selectedSecs.includes(sec);
                  return (
                    <button
                      key={sec}
                      onClick={() => handleSecToggle(sec)}
                      className={`text-left p-1 rounded text-[10px] flex items-center justify-between font-mono ${
                        isChecked 
                          ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-bold' 
                          : 'hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-650'
                      }`}
                    >
                      <span className="truncate">{sec}</span>
                      {isChecked && <Check className="h-3 w-3 text-emerald-600" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Controls 3: Column toggle array selector */}
          <div className="space-y-4">
            <span className="font-bold text-zinc-500 uppercase tracking-widest block border-b pb-1 dark:border-zinc-800">
              📊 Seleção de Colunas de Visualização
            </span>
            <div className="grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto border border-zinc-150 dark:border-zinc-800 p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-950">
              {ALL_REPORT_COLUMNS.map(col => {
                const isChecked = selectedColumns.includes(col.key);
                return (
                  <button
                    key={col.key}
                    onClick={() => handleColumnToggle(col.key)}
                    className={`flex items-center justify-between p-1.5 rounded text-[10px] text-left transition-all ${
                      isChecked 
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-extrabold' 
                        : 'text-zinc-450 hover:bg-zinc-100 dark:hover:bg-zinc-900'
                    }`}
                  >
                    <span className="truncate">{col.label}</span>
                    <div className={`h-3.5 w-3.5 rounded border flex items-center justify-center shrink-0 ${
                      isChecked ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-zinc-300 dark:border-zinc-800'
                    }`}>
                      {isChecked && <Check className="h-2 w-2" />}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Global trigger outputs */}
        <div className="pt-4 border-t border-zinc-100 dark:border-zinc-850 flex flex-wrap items-center justify-between gap-4">
          <div className="text-xs text-zinc-400">
            Escopo: <strong className="text-zinc-700 dark:text-zinc-200">{reportSummary.totalContracts}</strong> contratos integrados, somando <strong className="text-zinc-700 dark:text-zinc-200">{reportSummary.totalPvfQty}</strong> PVFs e faturamento consolidado de <strong className="text-emerald-600">{formatCurrency(reportSummary.totalBillingValue)}/mês</strong>.
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-4 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-850 border border-zinc-250 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 text-xs font-bold rounded-xl transition-all"
            >
              <Printer className="h-4 w-4" />
              <span>Imprimir Relatório</span>
            </button>
            
            <button
              onClick={downloadCustomCsv}
              className="flex items-center gap-1.5 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-md shadow-emerald-500/10 transition-all"
            >
              <Download className="h-4 w-4" />
              <span>Exportar Excel (Customizado)</span>
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================== */}
      {/* ===================== REPORT PREVIEW ===================== */}
      {/* ========================================================== */}
      <div id="section-to-print" className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-850 p-8 rounded-3xl shadow-sm space-y-6 printable-report">
        
        {/* Report Top Header block */}
        <div className="text-center space-y-2 border-b border-zinc-200 pb-6 dark:border-zinc-800">
          <div className="inline-flex items-center gap-1 px-3 py-1 bg-zinc-100 dark:bg-zinc-900 rounded-full text-[10px] font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
            📖 Relatório Gerencial Customizado
          </div>
          <h1 className="text-lg font-black text-zinc-950 dark:text-zinc-55 text-center">
            {reportTitle || 'Relatório de Faturamento'}
          </h1>
          <p className="text-xs text-zinc-400 max-w-lg mx-auto leading-relaxed">
            {reportSub || 'Análise consolidada por modelo de contratação'}
          </p>
          <div className="text-[10px] text-zinc-450 pt-2 font-mono flex items-center justify-center gap-4">
            <span>Emitido por: {new Date().toLocaleDateString('pt-BR')}</span>
            <span>Estabilidade de Tarifas: Vigente</span>
          </div>
        </div>

        {/* Report Active Table preview */}
        <div className="overflow-x-auto text-xs">
          
          {groupBy === 'none' ? (
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b-2 border-zinc-300 dark:border-zinc-800 text-left font-bold text-zinc-550">
                  {ALL_REPORT_COLUMNS.filter(c => selectedColumns.includes(c.key)).map(c => (
                    <th key={c.key} className="p-2 py-3 uppercase tracking-wider text-[10px] font-bold font-mono">
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-150 dark:divide-zinc-800/60 font-mono">
                {(reportData as any[]).map((contract, idx) => (
                  <tr key={contract.id || idx} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/40">
                    {ALL_REPORT_COLUMNS.filter(c => selectedColumns.includes(c.key)).map(col => {
                      if (col.key === 'contrato') return <td key={col.key} className="p-2 font-bold font-sans">{contract.contrato}</td>;
                      if (col.key === 'secretaria') return <td key={col.key} className="p-2 font-sans max-w-[200px] truncate cursor-help hover:text-brand dark:hover:text-brand-light transition-colors" title={contract.secretaria}>{contract.secretaria}</td>;
                      if (col.key === 'status') return <td key={col.key} className="p-2 font-bold text-[9px]">{contract.status}</td>;
                      if (col.key === 'qtdPvf') return <td key={col.key} className="p-2 text-center font-bold">{contract.calculatedPvfQty}</td>;
                      if (col.key === 'valorTotal') return <td key={col.key} className="p-2 text-right font-black text-zinc-800 dark:text-zinc-200">{formatCurrency(contract.calculatedTotal)}</td>;
                      
                      const qVal = contract.quantities[col.key as PvfKey];
                      return <td key={col.key} className="p-2 text-center">{qVal === 0 ? '-' : qVal}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            
            // AGROUPED COMPILATION
            <div className="space-y-6">
              {(reportData as any[]).map((group, groupIdx) => (
                <div key={groupIdx} className="space-y-2">
                  <div className="bg-zinc-100 dark:bg-zinc-900 p-2 px-3 rounded-lg flex items-center justify-between font-bold text-[11px] text-zinc-700 dark:text-zinc-355 border-l-4 border-emerald-500">
                    <span className="uppercase font-sans font-black">🏢 {group.groupTitle}</span>
                    <span className="font-mono text-[10px]">{group.count} contratos agrupados</span>
                  </div>

                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b border-zinc-200 dark:border-zinc-800 text-left font-bold text-zinc-400">
                        {ALL_REPORT_COLUMNS.filter(c => selectedColumns.includes(c.key)).map(c => (
                          <th key={c.key} className="p-2 uppercase tracking-wider text-[9px] font-bold font-mono">
                            {c.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-850/60 font-mono text-[11px]">
                      {group.items.map((item: any, itemIdx: number) => (
                        <tr key={itemIdx} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/20 text-zinc-600 dark:text-zinc-400">
                          {ALL_REPORT_COLUMNS.filter(c => selectedColumns.includes(c.key)).map(col => {
                            if (col.key === 'contrato') return <td key={col.key} className="p-2 font-bold font-sans text-zinc-900 dark:text-zinc-200">{item.contrato}</td>;
                            if (col.key === 'secretaria') return <td key={col.key} className="p-2 font-sans overflow-hidden truncate max-w-[200px] cursor-help hover:text-brand dark:hover:text-brand-light transition-colors" title={item.secretaria}>{item.secretaria}</td>;
                            if (col.key === 'status') return <td key={col.key} className="p-2 text-[9px]">{item.status}</td>;
                            if (col.key === 'qtdPvf') return <td key={col.key} className="p-2 text-center font-bold">{item.calculatedPvfQty}</td>;
                            if (col.key === 'valorTotal') return <td key={col.key} className="p-2 text-right font-semibold text-zinc-800 dark:text-zinc-300">{formatCurrency(item.calculatedTotal)}</td>;
                            
                            const qVal = item.quantities[col.key as PvfKey];
                            return <td key={col.key} className="p-2 text-center">{qVal === 0 ? '-' : qVal}</td>;
                          })}
                        </tr>
                      ))}
                      
                      {/* Subtotal representing group sums */}
                      <tr className="bg-emerald-50/20 dark:bg-zinc-900/40 font-bold border-t-2 border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100">
                        {ALL_REPORT_COLUMNS.filter(c => selectedColumns.includes(c.key)).map(col => {
                          if (col.key === 'contrato') return <td key={col.key} className="p-2 font-sans font-bold">SUBTOTAL GRUPO</td>;
                          if (col.key === 'secretaria' || col.key === 'status') return <td key={col.key} className="p-2 text-zinc-400">-</td>;
                          if (col.key === 'qtdPvf') return <td key={col.key} className="p-2 text-center text-emerald-700 dark:text-emerald-400 font-black">{group.calculatedPvfQty}</td>;
                          if (col.key === 'valorTotal') return <td key={col.key} className="p-2 text-right text-emerald-800 dark:text-emerald-300 font-black text-[12px]">{formatCurrency(group.calculatedTotal)}</td>;
                          
                          const qSum = group.quantities[col.key as PvfKey] || 0;
                          return <td key={col.key} className="p-2 text-center font-extrabold">{qSum === 0 ? '-' : qSum}</td>;
                        })}
                      </tr>
                    </tbody>
                  </table>
                </div>
              ))}
            </div>

          )}

          {/* Report Footer Summary Card block */}
          <div className="border-t-2 border-zinc-900 dark:border-zinc-800 mt-8 pt-6">
            <div className="bg-zinc-50 dark:bg-zinc-900 p-6 rounded-2xl border border-zinc-150 dark:border-zinc-800 flex flex-col sm:flex-row justify-between items-center gap-4">
              <div className="space-y-1 text-center sm:text-left">
                <span className="font-extrabold text-[10px] uppercase text-zinc-400 tracking-wider">Resultado Consolidado</span>
                <div className="text-[10px] text-zinc-500 font-mono">
                  Escopo e parâmetros aplicados nos filtros e colunas selecionadas acima.
                </div>
              </div>

              <div className="flex flex-wrap justify-center gap-6 font-mono font-bold">
                <div className="text-center p-2 bg-white dark:bg-zinc-950 px-4 rounded-xl border border-zinc-100 dark:border-zinc-800/80">
                  <div className="text-[9px] uppercase text-zinc-400 font-medium">Contratos</div>
                  <div className="text-sm text-zinc-900 dark:text-zinc-100">{reportSummary.totalContracts}</div>
                </div>

                <div className="text-center p-2 bg-white dark:bg-zinc-950 px-4 rounded-xl border border-zinc-100 dark:border-zinc-800/80">
                  <div className="text-[9px] uppercase text-zinc-400 font-medium">Volume PVF Total</div>
                  <div className="text-sm text-emerald-600 font-black">{reportSummary.totalPvfQty}</div>
                </div>

                <div className="text-center p-2 bg-white dark:bg-zinc-950 px-4 rounded-xl border border-zinc-100 dark:border-zinc-800/80">
                  <div className="text-[9px] uppercase text-emerald-850 font-medium">Faturamento Total</div>
                  <div className="text-sm text-emerald-600 font-black">{formatCurrency(reportSummary.totalBillingValue)}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Signature margins for physical printable document */}
          <div className="hidden printable-only pt-16 grid grid-cols-2 gap-12 font-sans">
            <div className="text-center border-t border-zinc-400 pt-2 space-y-1">
              <div className="text-xs font-bold text-zinc-800">Assinatura de Homologação</div>
              <div className="text-[10px] text-zinc-400">Analista Responsável pelo Faturamento</div>
            </div>
            <div className="text-center border-t border-zinc-400 pt-2 space-y-1">
              <div className="text-xs font-bold text-zinc-800">Visto da Administração Pública</div>
              <div className="text-[10px] text-zinc-400">Diretor de Tecnologia e Comunicação</div>
            </div>
          </div>

        </div>

      </div>

    </div>
  );
}
