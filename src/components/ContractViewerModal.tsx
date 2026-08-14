import React, { useState, useMemo, useRef } from 'react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  X,
  Download,
  Printer,
  Maximize2,
  Minimize2,
  FileText,
  Search,
  CheckCircle2,
  ShieldCheck,
  Building2,
  FileSpreadsheet,
  ExternalLink,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Layers,
  Scale,
  DollarSign,
  Info
} from 'lucide-react';
import {
  CONTRACT_METADATA,
  CONTRACT_CLAUSES,
  CONTRACT_ANNEX_DATA,
  CONTRACT_SIGNATURES
} from '../data/contractDocumentData';
import { formatCurrency } from '../data';

interface ContractViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ContractViewerModal: React.FC<ContractViewerModalProps> = ({
  isOpen,
  onClose
}) => {
  const [activeTab, setActiveTab] = useState<'document' | 'clauses' | 'annex' | 'signatures'>('document');
  const [searchTerm, setSearchTerm] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(100);
  const [isExporting, setIsExporting] = useState(false);
  const modalContentRef = useRef<HTMLDivElement>(null);

  // Filtered annex items based on search
  const filteredAnnex = useMemo(() => {
    if (!searchTerm.trim()) return CONTRACT_ANNEX_DATA;
    const query = searchTerm.toLowerCase();
    return CONTRACT_ANNEX_DATA.filter(item =>
      item.category.toLowerCase().includes(query) ||
      item.item.toLowerCase().includes(query) ||
      item.nivel.toLowerCase().includes(query) ||
      item.unidade.toLowerCase().includes(query)
    );
  }, [searchTerm]);

  // Filtered clauses based on search
  const filteredClauses = useMemo(() => {
    if (!searchTerm.trim()) return CONTRACT_CLAUSES;
    const query = searchTerm.toLowerCase();
    return CONTRACT_CLAUSES.filter(c =>
      c.num.toLowerCase().includes(query) ||
      c.title.toLowerCase().includes(query) ||
      c.text.toLowerCase().includes(query)
    );
  }, [searchTerm]);

  if (!isOpen) return null;

  // Handle PDF Export using jsPDF
  const handleDownloadPDF = () => {
    try {
      setIsExporting(true);
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      // Page 1: Header & Preamble
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(30, 41, 59);
      doc.text('ESTADO DE PERNAMBUCO', 105, 15, { align: 'center' });
      doc.setFontSize(10);
      doc.text('SECRETARIA DE ADMINISTRAÇÃO - SAD / AGÊNCIA ESTADUAL DE TECNOLOGIA DA INFORMAÇÃO - ATI', 105, 20, { align: 'center' });
      doc.setFontSize(9);
      doc.setTextColor(71, 85, 105);
      doc.text(`CONTRATO Nº ${CONTRACT_METADATA.number} - PROCESSO ${CONTRACT_METADATA.processNumber}`, 105, 25, { align: 'center' });

      doc.setDrawColor(203, 213, 225);
      doc.line(14, 28, 196, 28);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(30, 41, 59);

      const preamble = `CONTRATO Nº ${CONTRACT_METADATA.number}, QUE ENTRE SI CELEBRAM O ESTADO DE PERNAMBUCO, ATRAVÉS DA SECRETARIA DE ADMINISTRAÇÃO - SAD, A AGÊNCIA ESTADUAL DE TECNOLOGIA DA INFORMAÇÃO - ATI E O ${CONTRACT_METADATA.contractor}, EM DECORRÊNCIA DO PROCESSO DE INEXIGIBILIDADE Nº ${CONTRACT_METADATA.processNumber}.

CONTRATANTE: ${CONTRACT_METADATA.contractingAuthority} (CNPJ ${CONTRACT_METADATA.contractingAuthorityCnpj}).
CONTRATANTE TÉCNICA: ${CONTRACT_METADATA.technicalContractingAuthority} (CNPJ ${CONTRACT_METADATA.technicalContractingAuthorityCnpj}).
CONTRATADA: ${CONTRACT_METADATA.contractor} (CNPJ ${CONTRACT_METADATA.contractorCnpj}), constituído pelas empresas:
- ${CONTRACT_METADATA.contractorLeader} (Líder - CNPJ ${CONTRACT_METADATA.contractorLeaderCnpj})
- ${CONTRACT_METADATA.contractorMember1} (CNPJ ${CONTRACT_METADATA.contractorMember1Cnpj})
- ${CONTRACT_METADATA.contractorMember2} (CNPJ ${CONTRACT_METADATA.contractorMember2Cnpj})

VALOR GLOBAL CONTRATADO: ${formatCurrency(CONTRACT_METADATA.globalValue)} (${CONTRACT_METADATA.globalValueExtenso}).
VIGÊNCIA: ${CONTRACT_METADATA.durationMonths} meses a contar de ${CONTRACT_METADATA.startDate}.`;

      const splitPreamble = doc.splitTextToSize(preamble, 182);
      doc.text(splitPreamble, 14, 34);

      let currentY = 34 + splitPreamble.length * 4.2;

      // Add main clauses
      CONTRACT_CLAUSES.slice(0, 7).forEach((clause) => {
        if (currentY > 260) {
          doc.addPage();
          currentY = 20;
        }

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(14, 116, 144);
        doc.text(`${clause.num} - ${clause.title}`, 14, currentY);
        currentY += 4.5;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(51, 65, 85);
        const splitText = doc.splitTextToSize(clause.text, 182);
        doc.text(splitText, 14, currentY);
        currentY += splitText.length * 3.8 + 4;
      });

      // Page for Annex Tables
      doc.addPage();
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(30, 41, 59);
      doc.text('ANEXO ÚNICO - TABELA GERAL DE QUANTITATIVOS E PREÇOS', 105, 15, { align: 'center' });
      doc.setFontSize(8.5);
      doc.setTextColor(71, 85, 105);
      doc.text(`Valor Global: ${formatCurrency(CONTRACT_METADATA.globalValue)}`, 105, 20, { align: 'center' });

      const tableData = CONTRACT_ANNEX_DATA.map(item => [
        item.category,
        item.item,
        item.nivel,
        item.unidade,
        item.qtdMensal.toLocaleString('pt-BR'),
        formatCurrency(item.valorItem),
        formatCurrency(item.valorMensal),
        formatCurrency(item.valorGlobal)
      ]);

      autoTable(doc, {
        startY: 25,
        head: [['Categoria', 'Item / Serviço', 'Nível', 'Und', 'Qtd Mensal', 'Vlr Unit (s/ ICMS)', 'Vlr Mensal', 'Vlr Global']],
        body: tableData,
        theme: 'striped',
        headStyles: {
          fillColor: [15, 23, 42],
          textColor: [255, 255, 255],
          fontSize: 7,
          fontStyle: 'bold',
          halign: 'left'
        },
        bodyStyles: {
          fontSize: 6.5,
          textColor: [30, 41, 59]
        },
        columnStyles: {
          0: { cellWidth: 32 },
          1: { cellWidth: 46 },
          2: { cellWidth: 14 },
          3: { cellWidth: 12 },
          4: { cellWidth: 18, halign: 'right' },
          5: { cellWidth: 20, halign: 'right' },
          6: { cellWidth: 20, halign: 'right' },
          7: { cellWidth: 20, halign: 'right' }
        },
        styles: {
          cellPadding: 1.5,
          overflow: 'linebreak'
        }
      });

      // Signatures Page
      doc.addPage();
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(30, 41, 59);
      doc.text('ASSINATURAS ELETRÔNICAS - SISTEMA ELETRÔNICO DE INFORMAÇÕES (SEI/GOVPE)', 105, 20, { align: 'center' });

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.text(`Documento SEI nº ${CONTRACT_METADATA.seiId} | Código CRC: ${CONTRACT_METADATA.crcCode}`, 105, 26, { align: 'center' });

      let sigY = 40;
      CONTRACT_SIGNATURES.forEach(sig => {
        doc.setDrawColor(226, 232, 240);
        doc.setFillColor(248, 250, 252);
        doc.roundedRect(14, sigY, 182, 18, 2, 2, 'FD');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(15, 23, 42);
        doc.text(`Assinado eletronicamente por: ${sig.name}`, 18, sigY + 6);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(71, 85, 105);
        doc.text(`${sig.role} | Data: ${sig.date} (${sig.basis})`, 18, sigY + 12);

        sigY += 23;
      });

      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text('A autenticidade deste documento pode ser conferida no site http://sei.pe.gov.br com código verificador 81911164 e CRC F183D9D0.', 14, sigY + 10);

      doc.save(`Contrato_${CONTRACT_METADATA.number.replace(/[^a-zA-Z0-9]/g, '_')}_PE_CONECTADO_II.pdf`);
    } catch (err) {
      console.error("Erro ao gerar PDF:", err);
    } finally {
      setIsExporting(false);
    }
  };

  // Handle formatted print dialog
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 md:p-6 bg-black/80 backdrop-blur-md animate-fade-in overflow-y-auto">
      <div
        ref={modalContentRef}
        className={`relative flex flex-col w-full bg-zinc-900 border border-zinc-700/80 rounded-2xl shadow-2xl overflow-hidden transition-all duration-200 ${
          isFullscreen ? 'fixed inset-0 rounded-none z-50 h-screen max-w-none' : 'max-w-6xl max-h-[92vh] h-[900px]'
        }`}
      >
        {/* Top Action & Navigation Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 px-5 py-4 bg-zinc-950 border-b border-zinc-800 text-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-400">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black tracking-tight text-white flex items-center gap-2">
                  <span>Contrato Nº {CONTRACT_METADATA.number}</span>
                </h2>
                <span className="hidden sm:inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 uppercase tracking-wider">
                  Vigente (24 Meses)
                </span>
              </div>
              <p className="text-xs text-zinc-400 flex items-center gap-2 font-mono">
                <span>Inexigibilidade: {CONTRACT_METADATA.processNumber}</span>
                <span className="text-zinc-600">•</span>
                <span>SEI: {CONTRACT_METADATA.seiId}</span>
              </p>
            </div>
          </div>

          {/* Quick Action Tools: Search, Zoom, Download, Print, Fullscreen, Close */}
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
            {/* Search within document */}
            <div className="relative w-full sm:w-48 md:w-56">
              <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input
                type="text"
                placeholder="Buscar cláusula ou item..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-7 py-1.5 text-xs rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-200 placeholder-zinc-500 focus:outline-hidden focus:border-sky-400 transition-colors"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Download Official PDF */}
            <button
              onClick={handleDownloadPDF}
              disabled={isExporting}
              className="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-bold rounded-lg shadow-sm flex items-center gap-1.5 transition-all cursor-pointer hover:scale-102 active:scale-98"
              title="Baixar Contrato em PDF"
            >
              <Download className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{isExporting ? 'Gerando...' : 'Baixar PDF'}</span>
            </button>

            {/* Print Official Format */}
            <button
              onClick={handlePrint}
              className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white text-xs font-bold rounded-lg border border-zinc-700 transition-colors cursor-pointer"
              title="Imprimir Documento"
            >
              <Printer className="h-4 w-4" />
            </button>

            {/* Fullscreen Toggle */}
            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white text-xs font-bold rounded-lg border border-zinc-700 transition-colors cursor-pointer"
              title={isFullscreen ? 'Restaurar Tamanho' : 'Tela Cheia'}
            >
              {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>

            {/* Close Modal */}
            <button
              onClick={onClose}
              className="p-1.5 bg-zinc-800 hover:bg-rose-600 text-zinc-400 hover:text-white rounded-lg border border-zinc-700 hover:border-rose-500 transition-colors cursor-pointer ml-1"
              title="Fechar Visualizador"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 px-4 py-2 bg-zinc-950/60 border-b border-zinc-800 overflow-x-auto text-xs shrink-0">
          <button
            onClick={() => setActiveTab('document')}
            className={`px-3.5 py-1.5 rounded-lg font-bold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'document'
                ? 'bg-zinc-800 text-white shadow-xs border border-zinc-700'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
            }`}
          >
            <Layers className="h-3.5 w-3.5 text-sky-400" />
            <span>Documento Completo (SEI)</span>
          </button>

          <button
            onClick={() => setActiveTab('clauses')}
            className={`px-3.5 py-1.5 rounded-lg font-bold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'clauses'
                ? 'bg-zinc-800 text-white shadow-xs border border-zinc-700'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
            }`}
          >
            <Scale className="h-3.5 w-3.5 text-amber-400" />
            <span>Cláusulas Contratuais</span>
          </button>

          <button
            onClick={() => setActiveTab('annex')}
            className={`px-3.5 py-1.5 rounded-lg font-bold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'annex'
                ? 'bg-zinc-800 text-white shadow-xs border border-zinc-700'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
            }`}
          >
            <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-400" />
            <span>Anexo Único - Preços e Quantitativos</span>
          </button>

          <button
            onClick={() => setActiveTab('signatures')}
            className={`px-3.5 py-1.5 rounded-lg font-bold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'signatures'
                ? 'bg-zinc-800 text-white shadow-xs border border-zinc-700'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
            }`}
          >
            <ShieldCheck className="h-3.5 w-3.5 text-purple-400" />
            <span>Assinaturas & Autenticidade</span>
          </button>

          {/* Quick Summary Pill on right */}
          <div className="ml-auto hidden md:flex items-center gap-3 text-[11px] text-zinc-400 pr-2">
            <span className="font-mono text-zinc-300 font-bold">
              Valor Global: {formatCurrency(CONTRACT_METADATA.globalValue)}
            </span>
          </div>
        </div>

        {/* Document Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8 bg-zinc-950/40 space-y-6 text-zinc-200">
          {/* TAB 1: OFFICIAL SEI DOCUMENT VIEW (PAGES) */}
          {activeTab === 'document' && (
            <div className="max-w-4xl mx-auto space-y-8">
              {/* PAGE 1: PREAMBLE & INITIAL CLAUSES */}
              <div className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 p-6 sm:p-10 rounded-2xl shadow-xl border border-zinc-200 dark:border-zinc-800 space-y-6 font-serif">
                {/* Government Header */}
                <div className="flex flex-col sm:flex-row items-center justify-between pb-6 border-b border-zinc-200 dark:border-zinc-800 gap-4 text-center sm:text-left font-sans">
                  <div>
                    <div className="text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                      Estado de Pernambuco
                    </div>
                    <div className="text-base font-black text-zinc-900 dark:text-zinc-100">
                      Secretaria de Administração - SAD
                    </div>
                    <div className="text-xs text-zinc-500 dark:text-zinc-400">
                      Agência Estadual de Tecnologia da Informação - ATI
                    </div>
                  </div>
                  <div className="text-right font-sans">
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-sky-50 dark:bg-sky-950/80 border border-sky-200 dark:border-sky-800 text-sky-700 dark:text-sky-300 text-xs font-bold">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      <span>SEI/GOVPE - {CONTRACT_METADATA.seiId}</span>
                    </div>
                  </div>
                </div>

                {/* Title and Identification */}
                <div className="text-center space-y-2 py-2">
                  <h3 className="text-sm sm:text-base font-black tracking-tight uppercase leading-relaxed text-zinc-900 dark:text-zinc-100 font-sans">
                    CONTRATO Nº {CONTRACT_METADATA.number}, QUE ENTRE SI CELEBRAM O ESTADO DE PERNAMBUCO, ATRAVÉS DA SECRETARIA DE ADMINISTRAÇÃO - SAD, A AGÊNCIA ESTADUAL DE TECNOLOGIA DA INFORMAÇÃO E O CONSÓRCIO PECONECTADO II - LOTE 1, EM DECORRÊNCIA DO PROCESSO DE INEXIGIBILIDADE Nº {CONTRACT_METADATA.processNumber}
                  </h3>
                </div>

                {/* Formal Preamble */}
                <div className="text-xs sm:text-sm text-justify leading-relaxed space-y-4 text-zinc-800 dark:text-zinc-300 font-sans">
                  <p>
                    O <strong>ESTADO DE PERNAMBUCO</strong>, através da <strong>SECRETARIA DE ADMINISTRAÇÃO DO ESTADO DE PERNAMBUCO</strong>, inscrita no CNPJ (MF) sob o nº <strong>10.572.022/0001-80</strong>, com sede na Avenida Engenheiro Antônio de Góes, nº 194, Bairro Pina, Recife/PE, CEP 51010-000, neste ato representada por seu Secretário Executivo de Administração e Patrimônio, <strong>EMILIO VELUDO LOPES</strong>, designado pelo Ato nº 497, de 30/01/2026, publicado no DOE-PE do dia 07/02/2026, no uso dos poderes que lhe são conferidos pela Portaria SAD nº 1.000/2014, doravante denominada simplesmente <strong>CONTRATANTE</strong>, e a <strong>AGÊNCIA ESTADUAL DE TECNOLOGIA DA INFORMAÇÃO – ATI</strong>, autarquia estadual criada pela Lei Complementar n° 049 de 31 de janeiro de 2003, regulamentada através do Decreto Estadual n° 26.264 de 23 de dezembro de 2003, inscrita no CNPJ (MF) sob o n° <strong>06.067.608/0001-10</strong>, com sede na Av. Rio Capibaribe, n°147, São José, Recife/PE, CEP 50020-080, neste ato representado por seu Diretor Presidente, <strong>FREDERICO DE VASCONCELOS PEREIRA</strong>, na qualidade de <strong>CONTRATANTE TÉCNICA</strong>, e o <strong>CONSÓRCIO PE CONECTADO - LOTE 1</strong>, inscrito no CNPJ sob n.º <strong>65.273.429/0001/06</strong>, constituído pelas empresas <strong>1TELECOM SERVIÇOS DE TECNOLOGIA EM INTERNET LTDA</strong> (Líder, CNPJ 11.844.663/0001-09), representado pelo Diretor Presidente <strong>RUI AUGUSTO GOMES FILHO</strong> e Diretor Vice Presidente <strong>DANIEL DOS ANJOS DE OLIVEIRA GOMES</strong>, pela empresa <strong>VECTRA CONSULTORIA E SERVIÇOS LTDA.</strong> (CNPJ 41.249.921/0001-70), e pela empresa <strong>MÉTODO TELECOMUNICAÇÕES E COMÉRCIO LTDA</strong> (CNPJ 65.295.172/0001-85), doravante designado simplesmente <strong>CONTRATADO</strong>, celebram o presente CONTRATO mediante as cláusulas e condições seguintes:
                  </p>
                </div>

                {/* Clauses Preview */}
                <div className="space-y-6 pt-4 border-t border-zinc-200 dark:border-zinc-800 font-sans">
                  {filteredClauses.map((clause, idx) => (
                    <div key={idx} className="space-y-1.5 p-3 rounded-xl bg-zinc-50 dark:bg-zinc-950/50 border border-zinc-200/80 dark:border-zinc-800/80">
                      <div className="text-xs font-black text-sky-700 dark:text-sky-400 uppercase tracking-wide">
                        {clause.num} - {clause.title}
                      </div>
                      <div className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed whitespace-pre-line">
                        {clause.text}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* ANNEX SUMMARY CALLOUT */}
              <div className="p-6 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-white font-bold text-sm">
                    <FileSpreadsheet className="h-4 w-4 text-emerald-400" />
                    <span>Anexo Único do Contrato (Tabela Geral de Preços e Serviços)</span>
                  </div>
                  <button
                    onClick={() => setActiveTab('annex')}
                    className="text-xs font-bold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 cursor-pointer"
                  >
                    <span>Ver tabela completa ({CONTRACT_ANNEX_DATA.length} itens)</span>
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
                <p className="text-xs text-zinc-400">
                  Compreende os quantitativos e tarifas negociadas para <strong>Ponto de Voz Fixo (PVF)</strong>, <strong>Contact Center</strong>, <strong>Roteamento Multidigital</strong>, <strong>Segurança da Rede</strong>, <strong>Operação Integrada</strong> e <strong>Acessos Dedicados</strong> totalizando o valor global de <strong>{formatCurrency(CONTRACT_METADATA.globalValue)}</strong>.
                </p>
              </div>

              {/* ELECTRONIC SIGNATURES BLOCK */}
              <div className="p-6 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 space-y-4 font-sans">
                <div className="flex items-center gap-2 pb-3 border-b border-zinc-200 dark:border-zinc-800">
                  <ShieldCheck className="h-5 w-5 text-purple-500" />
                  <h4 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                    Assinaturas Eletrônicas SEI/GOVPE
                  </h4>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {CONTRACT_SIGNATURES.map((sig, idx) => (
                    <div key={idx} className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-200 dark:border-zinc-800 text-xs space-y-1">
                      <div className="flex items-center gap-1.5 font-bold text-zinc-900 dark:text-zinc-100">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                        <span>{sig.name}</span>
                      </div>
                      <div className="text-[11px] text-zinc-500 dark:text-zinc-400">{sig.role}</div>
                      <div className="text-[10px] text-zinc-400 font-mono">Assinado em: {sig.date}</div>
                    </div>
                  ))}
                </div>

                <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800 text-[11px] text-zinc-500 dark:text-zinc-400 flex flex-col sm:flex-row items-center justify-between gap-2">
                  <span>Código Verificador: <strong>{CONTRACT_METADATA.seiId}</strong> | Código CRC: <strong>{CONTRACT_METADATA.crcCode}</strong></span>
                  <a
                    href={CONTRACT_METADATA.documentUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-sky-500 hover:text-sky-400 font-bold"
                  >
                    <span>Verificar Autenticidade no SEI/PE</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: DETAILED CLAUSES VIEW */}
          {activeTab === 'clauses' && (
            <div className="max-w-4xl mx-auto space-y-4">
              <div className="p-4 rounded-xl bg-zinc-900/90 border border-zinc-800 flex items-center justify-between text-xs text-zinc-300">
                <span className="font-bold flex items-center gap-2">
                  <Scale className="h-4 w-4 text-amber-400" />
                  <span>Índice de Cláusulas Contratuais (Total: {CONTRACT_CLAUSES.length} Cláusulas)</span>
                </span>
                {searchTerm && (
                  <span className="text-zinc-400 font-mono">Filtrando por "{searchTerm}"</span>
                )}
              </div>

              <div className="space-y-4">
                {filteredClauses.map((clause, idx) => (
                  <div
                    key={idx}
                    className="p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs space-y-2 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-sky-600 dark:text-sky-400 uppercase tracking-wider">
                        {clause.num}
                      </span>
                      <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
                        {clause.title}
                      </span>
                    </div>
                    <p className="text-xs sm:text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed whitespace-pre-line font-sans pt-1">
                      {clause.text}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: ANNEX DETAILED TABLE OF PRICES & QUANTITIES */}
          {activeTab === 'annex' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <FileSpreadsheet className="h-4 w-4 text-emerald-400" />
                    <span>Anexo Único - Discriminação de Serviços, Quantidades e Preços</span>
                  </h3>
                  <p className="text-xs text-zinc-400">
                    Contrato nº {CONTRACT_METADATA.number} • Valores unitários e totais sem ICMS (Vigência: 24 Meses)
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="px-3 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-mono text-xs font-bold">
                    Total Global: {formatCurrency(CONTRACT_METADATA.globalValue)}
                  </div>
                </div>
              </div>

              {/* Table Container */}
              <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm overflow-hidden">
                <div className="table-scrollbar-fluid overflow-x-auto max-h-[600px]">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-zinc-50/90 dark:bg-zinc-950/80 text-zinc-600 dark:text-zinc-400 font-bold uppercase tracking-wider text-[10px] border-b border-zinc-200 dark:border-zinc-800/80 sticky top-0 z-10 backdrop-blur-xs">
                      <tr>
                        <th className="py-3 px-4">Categoria</th>
                        <th className="py-3 px-4">Item / Serviço</th>
                        <th className="py-3 px-3">Nível</th>
                        <th className="py-3 px-3">Und</th>
                        <th className="py-3 px-3 text-center">Meses</th>
                        <th className="py-3 px-3 text-right">Qtd Mensal</th>
                        <th className="py-3 px-3 text-right">Vlr Unitário (s/ ICMS)</th>
                        <th className="py-3 px-3 text-right">Vlr Mensal Total</th>
                        <th className="py-3 px-4 text-right">Valor Global (24m)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200/70 dark:divide-zinc-800/60 font-medium">
                      {filteredAnnex.map((item, idx) => (
                        <tr
                          key={idx}
                          className="hover:bg-zinc-500/[0.04] dark:hover:bg-white/[0.03] transition-colors"
                        >
                          <td className="py-2.5 px-4 font-bold text-zinc-800 dark:text-zinc-200">
                            {item.category}
                          </td>
                          <td className="py-2.5 px-4 text-zinc-700 dark:text-zinc-300">
                            {item.item}
                          </td>
                          <td className="py-2.5 px-3">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              item.nivel === 'Crítico'
                                ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20'
                                : 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20'
                            }`}>
                              {item.nivel}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-zinc-500 dark:text-zinc-400 font-mono text-[11px]">
                            {item.unidade}
                          </td>
                          <td className="py-2.5 px-3 text-center font-mono text-zinc-600 dark:text-zinc-400">
                            {item.meses}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-zinc-800 dark:text-zinc-200">
                            {item.qtdMensal.toLocaleString('pt-BR')}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-zinc-600 dark:text-zinc-400">
                            {formatCurrency(item.valorItem)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-zinc-800 dark:text-zinc-200">
                            {formatCurrency(item.valorMensal)}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                            {formatCurrency(item.valorGlobal)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: SIGNATURES & AUTHENTICITY */}
          {activeTab === 'signatures' && (
            <div className="max-w-4xl mx-auto space-y-6">
              <div className="p-6 rounded-2xl bg-zinc-900 border border-zinc-800 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-400">
                    <ShieldCheck className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">
                      Autenticidade e Assinaturas Eletrônicas SEI
                    </h3>
                    <p className="text-xs text-zinc-400">
                      Processo de Inexigibilidade nº {CONTRACT_METADATA.processNumber}
                    </p>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-300 space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                    <span className="text-zinc-500">Documento SEI nº:</span>
                    <span className="font-bold text-white">{CONTRACT_METADATA.seiId}</span>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                    <span className="text-zinc-500">Código CRC:</span>
                    <span className="font-bold text-emerald-400">{CONTRACT_METADATA.crcCode}</span>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                    <span className="text-zinc-500">Fundamento Legal:</span>
                    <span className="text-zinc-300">Art. 10º do Decreto Estadual nº 45.157/2017</span>
                  </div>
                </div>
              </div>

              {/* Signatures List */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400 px-1">
                  Signatários do Instrumento Contratual
                </h4>
                {CONTRACT_SIGNATURES.map((sig, idx) => (
                  <div
                    key={idx}
                    className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500 shrink-0">
                        <CheckCircle2 className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                          {sig.name}
                        </div>
                        <div className="text-xs text-zinc-500 dark:text-zinc-400">
                          {sig.role}
                        </div>
                      </div>
                    </div>
                    <div className="text-left sm:text-right text-xs">
                      <div className="text-zinc-700 dark:text-zinc-300 font-mono font-semibold">
                        {sig.date}
                      </div>
                      <div className="text-[11px] text-zinc-400">
                        {sig.basis}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer info bar */}
        <div className="px-5 py-3 bg-zinc-950 border-t border-zinc-800 text-xs text-zinc-400 flex flex-col sm:flex-row items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 text-[11px]">
            <Info className="h-3.5 w-3.5 text-sky-400" />
            <span>Documento oficial registrado no SEI/GOVPE • Vigência de 01/03/2026 a 28/02/2028</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleDownloadPDF}
              className="text-xs font-bold text-sky-400 hover:text-sky-300 flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Baixar Arquivo Completo</span>
            </button>
            <span className="text-zinc-600">•</span>
            <button
              onClick={onClose}
              className="text-xs font-bold text-zinc-400 hover:text-white cursor-pointer"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
