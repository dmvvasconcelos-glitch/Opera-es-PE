import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  History, 
  X, 
  Search, 
  Filter, 
  TrendingUp, 
  TrendingDown, 
  Calendar, 
  User, 
  ShieldCheck, 
  Phone, 
  Headset, 
  Network, 
  Satellite, 
  Shield, 
  Layers, 
  RefreshCw, 
  Clock, 
  ArrowRight, 
  FileSpreadsheet, 
  FileText, 
  ChevronDown, 
  ChevronUp, 
  AlertCircle,
  Tag
} from 'lucide-react';
import { TariffAuditLog, TariffModuleId, UserSession } from '../types';
import { subscribeTariffLogs } from '../services/tariffAudit';

interface TariffHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultModule?: TariffModuleId | 'all';
  user?: UserSession | null;
}

const MODULE_CONFIG: Record<TariffModuleId, { name: string; icon: React.ComponentType<{ className?: string }>; color: string; bg: string; border: string }> = {
  pvf: {
    name: 'Pontos de Voz (PVF)',
    icon: Phone,
    color: 'text-indigo-400',
    bg: 'bg-indigo-950/40',
    border: 'border-indigo-800/60'
  },
  contactCenter: {
    name: 'Contact Center',
    icon: Headset,
    color: 'text-sky-400',
    bg: 'bg-sky-950/40',
    border: 'border-sky-800/60'
  },
  umtelecom: {
    name: 'Manutenção Um Telecom',
    icon: Network,
    color: 'text-amber-400',
    bg: 'bg-amber-950/40',
    border: 'border-amber-800/60'
  },
  starlink: {
    name: 'Implantação Starlink',
    icon: Satellite,
    color: 'text-cyan-400',
    bg: 'bg-cyan-950/40',
    border: 'border-cyan-800/60'
  },
  vectra: {
    name: 'Manutenção Vectra',
    icon: Shield,
    color: 'text-emerald-400',
    bg: 'bg-emerald-950/40',
    border: 'border-emerald-800/60'
  }
};

export default function TariffHistoryModal({
  isOpen,
  onClose,
  defaultModule = 'all',
  user
}: TariffHistoryModalProps) {
  const [logs, setLogs] = useState<TariffAuditLog[]>([]);
  const [selectedModule, setSelectedModule] = useState<TariffModuleId | 'all'>(defaultModule);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedLogIds, setExpandedLogIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);

  // Sync defaultModule prop when opened
  useEffect(() => {
    if (isOpen) {
      setSelectedModule(defaultModule);
    }
  }, [isOpen, defaultModule]);

  // Real-time subscription to logs
  useEffect(() => {
    if (!isOpen) return;
    setIsLoading(true);
    const unsubscribe = subscribeTariffLogs((fetchedLogs) => {
      setLogs(fetchedLogs);
      // Auto expand first 3 entries for high visibility
      const firstIds = new Set(fetchedLogs.slice(0, 3).map(l => l.id));
      setExpandedLogIds(firstIds);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [isOpen]);

  const toggleExpand = (id: string) => {
    setExpandedLogIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const expandAll = () => {
    setExpandedLogIds(new Set(filteredLogs.map(l => l.id)));
  };

  const collapseAll = () => {
    setExpandedLogIds(new Set());
  };

  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      if (selectedModule !== 'all' && log.moduleId !== selectedModule) {
        return false;
      }
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase().trim();
        const matchesUser = (log.userName || '').toLowerCase().includes(query) ||
                            (log.userEmail || '').toLowerCase().includes(query);
        const matchesModule = (log.moduleName || '').toLowerCase().includes(query);
        const matchesItems = (log.changes || []).some(c => (c.label || '').toLowerCase().includes(query));
        return matchesUser || matchesModule || matchesItems;
      }
      return true;
    });
  }, [logs, selectedModule, searchTerm]);

  // High-level statistics
  const stats = useMemo(() => {
    const total = filteredLogs.length;
    const latest = filteredLogs[0] || null;
    const moduleCounts: Record<string, number> = {};
    logs.forEach(l => {
      moduleCounts[l.moduleName] = (moduleCounts[l.moduleName] || 0) + 1;
    });
    let topModule = 'Nenhum';
    let topCount = 0;
    Object.entries(moduleCounts).forEach(([m, c]) => {
      if (c > topCount) {
        topCount = c;
        topModule = m;
      }
    });

    return {
      total,
      latest,
      topModule,
      topCount
    };
  }, [filteredLogs, logs]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto bg-zinc-950/80 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 12 }}
          transition={{ duration: 0.2 }}
          className="relative w-full max-w-4xl max-h-[90vh] flex flex-col bg-zinc-900 border border-zinc-750/90 rounded-2.5xl shadow-2xl overflow-hidden text-zinc-100"
        >
          {/* MODAL HEADER */}
          <div className="flex items-center justify-between px-6 py-4.5 bg-gradient-to-r from-zinc-950 via-zinc-900 to-zinc-950 border-b border-zinc-800 shrink-0">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-brand/10 border border-brand/25 text-brand">
                <History className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-black text-white tracking-tight flex items-center gap-2 font-display">
                  <span>Histórico de Alterações de Tarifas</span>
                  <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 border border-zinc-700">
                    {filteredLogs.length} registro{filteredLogs.length === 1 ? '' : 's'}
                  </span>
                </h2>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Registro visual de auditoria de valores unitários e parâmetros contratuais do PECONECTADO II.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-xl transition-colors cursor-pointer"
              title="Fechar Histórico"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* KPI STATS BAR */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 px-6 py-3.5 bg-zinc-950/60 border-b border-zinc-800/80 shrink-0">
            <div className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl bg-zinc-900/80 border border-zinc-800">
              <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                <Layers className="h-4 w-4" />
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Total de Revisões</div>
                <div className="text-sm font-black text-white font-mono">{stats.total} alterações</div>
              </div>
            </div>

            <div className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl bg-zinc-900/80 border border-zinc-800">
              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <Clock className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Última Modificação</div>
                <div className="text-xs font-bold text-zinc-200 truncate">
                  {stats.latest ? `${stats.latest.userName} (${stats.latest.formattedDate?.split(' ')[0]})` : 'Sem registros'}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl bg-zinc-900/80 border border-zinc-800">
              <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
                <TrendingUp className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Módulo Mais Atualizado</div>
                <div className="text-xs font-bold text-zinc-200 truncate">
                  {stats.topModule} ({stats.topCount})
                </div>
              </div>
            </div>
          </div>

          {/* FILTERS & SEARCH CONTROLS */}
          <div className="p-4 sm:px-6 sm:py-3.5 bg-zinc-900/90 border-b border-zinc-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shrink-0">
            {/* Module Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-thin">
              <button
                type="button"
                onClick={() => setSelectedModule('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
                  selectedModule === 'all'
                    ? 'bg-brand text-white shadow-md shadow-brand/20 font-black'
                    : 'bg-zinc-800/80 text-zinc-300 hover:bg-zinc-750 hover:text-white border border-zinc-700/60'
                }`}
              >
                Todos ({logs.length})
              </button>

              {(Object.keys(MODULE_CONFIG) as TariffModuleId[]).map(modId => {
                const conf = MODULE_CONFIG[modId];
                const count = logs.filter(l => l.moduleId === modId).length;
                const isSelected = selectedModule === modId;
                const Icon = conf.icon;

                return (
                  <button
                    key={modId}
                    type="button"
                    onClick={() => setSelectedModule(modId)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shrink-0 cursor-pointer ${
                      isSelected
                        ? 'bg-zinc-100 text-zinc-950 font-black shadow-md'
                        : 'bg-zinc-800/80 text-zinc-300 hover:bg-zinc-750 hover:text-white border border-zinc-700/60'
                    }`}
                  >
                    <Icon className={`h-3.5 w-3.5 ${isSelected ? 'text-zinc-950' : conf.color}`} />
                    <span>{conf.name}</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${isSelected ? 'bg-zinc-300 text-zinc-900' : 'bg-zinc-900 text-zinc-400'}`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Search Input & Expand/Collapse */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1 sm:w-56">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400 pointer-events-none" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Buscar usuário, item..."
                  className="w-full pl-9 pr-3 py-1.5 bg-zinc-950 border border-zinc-750 rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-brand"
                />
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => setSearchTerm('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white text-xs"
                  >
                    ×
                  </button>
                )}
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={expandAll}
                  className="px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-750 text-zinc-300 hover:text-white rounded-lg text-[11px] font-bold border border-zinc-700 transition-colors"
                  title="Expandir todos"
                >
                  Expandir
                </button>
                <button
                  type="button"
                  onClick={collapseAll}
                  className="px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-750 text-zinc-300 hover:text-white rounded-lg text-[11px] font-bold border border-zinc-700 transition-colors"
                  title="Recolher todos"
                >
                  Recolher
                </button>
              </div>
            </div>
          </div>

          {/* LOGS TIMELINE LIST */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3.5">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-16 text-zinc-400">
                <RefreshCw className="h-8 w-8 animate-spin text-brand mb-3" />
                <p className="text-sm font-medium">Carregando histórico de auditoria...</p>
              </div>
            ) : filteredLogs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-zinc-400 text-center px-4 bg-zinc-950/40 border border-dashed border-zinc-800 rounded-2xl">
                <History className="h-10 w-10 text-zinc-600 mb-3" />
                <h3 className="text-base font-bold text-zinc-200">Nenhum registro de alteração encontrado</h3>
                <p className="text-xs text-zinc-500 mt-1 max-w-sm">
                  {searchTerm 
                    ? `Nenhuma alteração corresponde aos termos "${searchTerm}".`
                    : 'Assim que um usuário administrador ou editor ajustar os valores unitários das tarifas, o log detalhado será exibido aqui.'}
                </p>
              </div>
            ) : (
              filteredLogs.map((log) => {
                const isExpanded = expandedLogIds.has(log.id);
                const conf = MODULE_CONFIG[log.moduleId] || {
                  name: log.moduleName,
                  icon: Layers,
                  color: 'text-brand-light',
                  bg: 'bg-brand/10',
                  border: 'border-brand/30'
                };
                const Icon = conf.icon;
                const isReset = log.action === 'reset';

                return (
                  <div
                    key={log.id}
                    className={`rounded-2xl border transition-all ${
                      isExpanded 
                        ? 'bg-zinc-950/90 border-zinc-700 shadow-lg' 
                        : 'bg-zinc-950/40 hover:bg-zinc-950/70 border-zinc-800/80'
                    }`}
                  >
                    {/* Log Card Header */}
                    <div
                      onClick={() => toggleExpand(log.id)}
                      className="p-4 sm:p-4.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer select-none"
                    >
                      <div className="flex items-start sm:items-center gap-3.5">
                        <div className={`p-2.5 rounded-xl ${conf.bg} border ${conf.border} ${conf.color} shrink-0 mt-0.5 sm:mt-0`}>
                          <Icon className="h-5 w-5" />
                        </div>

                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-black text-white">{log.moduleName}</span>
                            
                            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                              isReset 
                                ? 'bg-amber-950/60 border-amber-800/80 text-amber-300' 
                                : 'bg-emerald-950/60 border-emerald-800/80 text-emerald-300'
                            }`}>
                              {isReset ? 'Tarifas Restauradas' : 'Tarifas Atualizadas'}
                            </span>

                            <span className="text-xs font-mono font-bold text-zinc-400 px-2 py-0.5 rounded-md bg-zinc-900 border border-zinc-800">
                              {log.changes.length} {log.changes.length === 1 ? 'item alterado' : 'itens alterados'}
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-400 mt-1 font-sans">
                            <span className="flex items-center gap-1 text-zinc-300 font-medium">
                              <User className="h-3.5 w-3.5 text-zinc-500" />
                              <span>{log.userName}</span>
                              <span className="text-[10px] text-zinc-500">({log.userRole || 'admin'})</span>
                            </span>

                            <span className="text-zinc-600">•</span>

                            <span className="flex items-center gap-1 font-mono text-zinc-400">
                              <Clock className="h-3.5 w-3.5 text-zinc-500" />
                              <span>{log.formattedDate || new Date(log.timestamp).toLocaleString('pt-BR')}</span>
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-zinc-850">
                        <span className="text-xs font-bold text-brand flex items-center gap-1">
                          <span>{isExpanded ? 'Ocultar Detalhes' : 'Ver Detalhes'}</span>
                          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </span>
                      </div>
                    </div>

                    {/* Expanded Detail Panel */}
                    {isExpanded && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="px-4 sm:px-5 pb-4.5 pt-1 border-t border-zinc-800/80"
                      >
                        <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-2 font-mono flex items-center gap-1.5">
                          <Tag className="h-3.5 w-3.5 text-brand" />
                          <span>Detalhamento dos Itens Alterados:</span>
                        </div>

                        <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900/60">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-zinc-950/80 text-[10px] font-extrabold uppercase tracking-wider text-zinc-400 border-b border-zinc-800">
                              <tr>
                                <th className="px-3.5 py-2">Item / Parâmetro</th>
                                <th className="px-3.5 py-2 text-right">Valor Anterior</th>
                                <th className="px-3.5 py-2 text-center w-8"></th>
                                <th className="px-3.5 py-2 text-right">Novo Valor</th>
                                <th className="px-3.5 py-2 text-right">Variação</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-800/60 font-mono">
                              {log.changes.map((item, idx) => {
                                const isPositive = item.diff > 0;
                                const isNegative = item.diff < 0;
                                const isZero = item.diff === 0;
                                const isCurr = item.isCurrency !== false;

                                const formatVal = (val: number) => {
                                  if (isCurr) {
                                    return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                                  }
                                  return `${val.toLocaleString('pt-BR')} ${item.unit || 'un'}`;
                                };

                                return (
                                  <tr key={idx} className="hover:bg-zinc-800/30 transition-colors">
                                    <td className="px-3.5 py-2.5 font-sans font-semibold text-zinc-200">
                                      {item.label}
                                    </td>
                                    <td className="px-3.5 py-2.5 text-right text-zinc-400 line-through decoration-zinc-600">
                                      {formatVal(item.oldValue)}
                                    </td>
                                    <td className="px-1 py-2.5 text-center text-zinc-600">
                                      <ArrowRight className="h-3.5 w-3.5 mx-auto text-zinc-500" />
                                    </td>
                                    <td className="px-3.5 py-2.5 text-right font-black text-white">
                                      {formatVal(item.newValue)}
                                    </td>
                                    <td className="px-3.5 py-2.5 text-right font-bold">
                                      {isZero ? (
                                        <span className="text-zinc-500 text-[11px] font-sans">Sem alteração</span>
                                      ) : (
                                        <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md ${
                                          isPositive 
                                            ? 'bg-emerald-950/70 text-emerald-400 border border-emerald-800/50' 
                                            : 'bg-amber-950/70 text-amber-400 border border-amber-800/50'
                                        }`}>
                                          {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                                          <span>
                                            {isPositive ? '+' : ''}{isCurr ? item.diff.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : `${item.diff} ${item.unit || 'un'}`}
                                            {' '}({isPositive ? '+' : ''}{item.diffPercent}%)
                                          </span>
                                        </span>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>

                        {log.notes && (
                          <div className="mt-2.5 px-3 py-2 rounded-lg bg-zinc-950/80 border border-zinc-800 text-xs text-zinc-400">
                            <span className="font-bold text-zinc-300">Observações: </span>
                            {log.notes}
                          </div>
                        )}
                      </motion.div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* MODAL FOOTER */}
          <div className="flex items-center justify-between px-6 py-3.5 bg-zinc-950 border-t border-zinc-800 shrink-0">
            <div className="text-xs text-zinc-500">
              Registros imutáveis gravados com carimbo de data e hora do servidor.
            </div>

            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm"
            >
              Fechar
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
