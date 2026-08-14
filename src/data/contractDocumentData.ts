export interface ContractAnnexItem {
  category: string;
  item: string;
  nivel: string;
  unidade: string;
  meses: number;
  qtdMensal: number;
  valorItem: number;
  valorMensal: number;
  valorGlobal: number;
}

export interface ContractSection {
  id: string;
  title: string;
  page: number;
  type: 'preamble' | 'clause' | 'annex' | 'signatures';
  content?: string;
  items?: string[];
  subsections?: {
    num: string;
    text: string;
    subItems?: string[];
  }[];
}

export const CONTRACT_METADATA = {
  number: '002/SAD/ATI/2026',
  processNumber: '0093.2026.AC-59.IN.0038.SAD.ATI',
  seiId: '81911164',
  crcCode: 'F183D9D0',
  contractingAuthority: 'SECRETARIA DE ADMINISTRAÇÃO DO ESTADO DE PERNAMBUCO - SAD',
  contractingAuthorityCnpj: '10.572.022/0001-80',
  technicalContractingAuthority: 'AGÊNCIA ESTADUAL DE TECNOLOGIA DA INFORMAÇÃO – ATI',
  technicalContractingAuthorityCnpj: '06.067.608/0001-10',
  contractor: 'CONSÓRCIO PECONECTADO II - LOTE 1',
  contractorCnpj: '65.273.429/0001/06',
  contractorLeader: '1TELECOM SERVIÇOS DE TECNOLOGIA EM INTERNET LTDA',
  contractorLeaderCnpj: '11.844.663/0001-09',
  contractorMember1: 'VECTRA CONSULTORIA E SERVIÇOS LTDA.',
  contractorMember1Cnpj: '41.249.921/0001-70',
  contractorMember2: 'MÉTODO TELECOMUNICAÇÕES E COMÉRCIO LTDA',
  contractorMember2Cnpj: '65.295.172/0001-85',
  startDate: '01/03/2026',
  durationMonths: 24,
  globalValue: 328549091.02,
  globalValueExtenso: 'Trezentos e vinte e oito milhões, quinhentos e quarenta e nove mil, noventa e um reais e dois centavos',
  signDate: '25/02/2026',
  documentDate: '02/03/2026',
  documentUrl: 'https://sei.pe.gov.br/sei/controlador.php?acao=documento_imprimir_web&acao_origem=arvore_visualizar&id_documento=93435635&infra_sistema=100000100&infra_unidade_atual=110000780&infra_hash=33c39958742b78ce13a8a30689b70b5558d0859942a2fa2b87d85317ad56ca01'
};

export const CONTRACT_ANNEX_DATA: ContractAnnexItem[] = [
  // SERVIÇO DO PONTO DE ROTEAMENTO DE TRÁFEGO MULTIDIGITAL - PRINCIPAL
  { category: 'Ponto de Roteamento Multidigital - Principal', item: 'Nível 1 - até 5,0 Gbps', nivel: 'Crítico', unidade: 'Mbps', meses: 2, qtdMensal: 5000, valorItem: 22.61, valorMensal: 113050.00, valorGlobal: 226100.00 },
  { category: 'Ponto de Roteamento Multidigital - Principal', item: 'Nível 2 - a partir de 5,0 Gbps até 10,0 Gbps', nivel: 'Crítico', unidade: 'Mbps', meses: 3, qtdMensal: 10000, valorItem: 17.29, valorMensal: 172900.00, valorGlobal: 518700.00 },
  { category: 'Ponto de Roteamento Multidigital - Principal', item: 'Nível 3 - a partir de 10,0 Gbps até 20,0 Gbps', nivel: 'Crítico', unidade: 'Mbps', meses: 5, qtdMensal: 20000, valorItem: 13.28, valorMensal: 265600.00, valorGlobal: 1328000.00 },
  { category: 'Ponto de Roteamento Multidigital - Principal', item: 'Nível 4 - a partir de 20,0 Gbps até 30,0 Gbps', nivel: 'Crítico', unidade: 'Mbps', meses: 10, qtdMensal: 30000, valorItem: 10.34, valorMensal: 310200.00, valorGlobal: 3102000.00 },
  { category: 'Ponto de Roteamento Multidigital - Principal', item: 'Nível 5 - a partir de 30,0 Gbps até 40,0 Gbps', nivel: 'Crítico', unidade: 'Mbps', meses: 4, qtdMensal: 40000, valorItem: 9.05, valorMensal: 362000.00, valorGlobal: 1448000.00 },

  // SERVIÇO DO PONTO DE ROTEAMENTO DE TRÁFEGO MULTIDIGITAL - BÁSICO
  { category: 'Ponto de Roteamento Multidigital - Básico', item: 'Nível A - (Fernando de Noronha) - Até 300 Mbps', nivel: 'Crítico', unidade: 'Mbps', meses: 11, qtdMensal: 300, valorItem: 1463.70, valorMensal: 439110.00, valorGlobal: 4830210.00 },
  { category: 'Ponto de Roteamento Multidigital - Básico', item: 'Nível B - (Fernando de Noronha) - acima de 300 Mbps Até 500 Mbps', nivel: 'Crítico', unidade: 'Mbps', meses: 13, qtdMensal: 500, valorItem: 1064.51, valorMensal: 532255.00, valorGlobal: 6919315.00 },
  { category: 'Ponto de Roteamento Multidigital - Básico', item: 'Nível 1 - até 500 Mbps', nivel: 'Crítico', unidade: 'Mbps', meses: 2, qtdMensal: 4500, valorItem: 19.95, valorMensal: 89775.00, valorGlobal: 179550.00 },
  { category: 'Ponto de Roteamento Multidigital - Básico', item: 'Nível 2 - acima de 500 Mbps até 1,0 Gbps', nivel: 'Crítico', unidade: 'Mbps', meses: 3, qtdMensal: 9000, valorItem: 15.96, valorMensal: 143640.00, valorGlobal: 430920.00 },
  { category: 'Ponto de Roteamento Multidigital - Básico', item: 'Nível 3 - acima 1,0Gbps até 2,0Gbps', nivel: 'Crítico', unidade: 'Mbps', meses: 5, qtdMensal: 20000, valorItem: 13.34, valorMensal: 266800.00, valorGlobal: 1334000.00 },
  { category: 'Ponto de Roteamento Multidigital - Básico', item: 'Nível 4 - acima de 2,0 Gbps até 3,0 Gbps', nivel: 'Crítico', unidade: 'Mbps', meses: 10, qtdMensal: 33000, valorItem: 10.63, valorMensal: 350790.00, valorGlobal: 3507900.00 },
  { category: 'Ponto de Roteamento Multidigital - Básico', item: 'Nível 5 - acima de 3,0 Gbps até 5,0 Gbps', nivel: 'Crítico', unidade: 'Mbps', meses: 4, qtdMensal: 55000, valorItem: 8.51, valorMensal: 468050.00, valorGlobal: 1872200.00 },

  // SERVIÇO DE SEGURANÇA DA REDE
  { category: 'Segurança da Rede (Antivirus, IPS, Firewall)', item: 'Nível 1 - até 5,0 Gbps', nivel: 'Crítico', unidade: 'Mbps', meses: 2, qtdMensal: 5000, valorItem: 73.17, valorMensal: 365850.00, valorGlobal: 731700.00 },
  { category: 'Segurança da Rede (Antivirus, IPS, Firewall)', item: 'Nível 2 - a partir de 5,0 Gbps até 10,0 Gbps', nivel: 'Crítico', unidade: 'Mbps', meses: 3, qtdMensal: 10000, valorItem: 53.21, valorMensal: 532100.00, valorGlobal: 1596300.00 },
  { category: 'Segurança da Rede (Antivirus, IPS, Firewall)', item: 'Nível 3 - a partir de 10,0 Gbps até 20,0 Gbps', nivel: 'Crítico', unidade: 'Mbps', meses: 5, qtdMensal: 20000, valorItem: 29.51, valorMensal: 590200.00, valorGlobal: 2951000.00 },
  { category: 'Segurança da Rede (Antivirus, IPS, Firewall)', item: 'Nível 4 - a partir de 20,0 Gbps até 30,0 Gbps', nivel: 'Crítico', unidade: 'Mbps', meses: 10, qtdMensal: 30000, valorItem: 21.54, valorMensal: 646200.00, valorGlobal: 6462000.00 },
  { category: 'Segurança da Rede (Antivirus, IPS, Firewall)', item: 'Nível 5 - a partir de 30,0 Gbps até 40,0 Gbps', nivel: 'Crítico', unidade: 'Mbps', meses: 4, qtdMensal: 40000, valorItem: 17.83, valorMensal: 713200.00, valorGlobal: 2852800.00 },

  // AUTENTICAÇÃO CENTRALIZADA
  { category: 'Autenticação Centralizada', item: 'Nível 1 - 60.000 usuários', nivel: 'Crítico', unidade: 'Unidade', meses: 4, qtdMensal: 1, valorItem: 46050.54, valorMensal: 46050.54, valorGlobal: 184202.16 },
  { category: 'Autenticação Centralizada', item: 'Nível 2 - 80.000 usuários', nivel: 'Crítico', unidade: 'Unidade', meses: 10, qtdMensal: 1, valorItem: 59865.70, valorMensal: 59865.70, valorGlobal: 598657.00 },
  { category: 'Autenticação Centralizada', item: 'Nível 3 - 120.000 usuários', nivel: 'Crítico', unidade: 'Unidade', meses: 10, qtdMensal: 1, valorItem: 77825.41, valorMensal: 77825.41, valorGlobal: 778254.10 },

  // SERVIÇO DE OPERAÇÃO INTEGRADA
  { category: 'Operação Integrada (Monitoramento)', item: 'Monitoramento dos Serviços de Voz (PVF)', nivel: 'Crítico', unidade: 'Unidade', meses: 24, qtdMensal: 29263, valorItem: 7.49, valorMensal: 219179.87, valorGlobal: 5260316.88 },
  { category: 'Operação Integrada (Monitoramento)', item: 'Monitoramento Dados, Internet I e II, PRTMs e LTE', nivel: 'Crítico', unidade: 'Unidade', meses: 24, qtdMensal: 1, valorItem: 497270.14, valorMensal: 497270.14, valorGlobal: 11934483.36 },
  { category: 'Operação Integrada (Monitoramento)', item: 'Monitoramento dos serviços de Rede sem Fio', nivel: 'Crítico', unidade: 'Unidade', meses: 24, qtdMensal: 3500, valorItem: 5.58, valorMensal: 19530.00, valorGlobal: 468720.00 },
  { category: 'Operação Integrada (Monitoramento)', item: 'Monitoramento de aplicações críticas', nivel: 'Crítico', unidade: 'Unidade', meses: 24, qtdMensal: 10, valorItem: 16028.09, valorMensal: 160280.90, valorGlobal: 3846741.60 },
  { category: 'Operação Integrada (Monitoramento)', item: 'Monitoramento dos Serviços de Segurança da Rede', nivel: 'Crítico', unidade: 'Unidade', meses: 24, qtdMensal: 1, valorItem: 307845.39, valorMensal: 307845.39, valorGlobal: 7388289.36 },
  { category: 'Operação Integrada (Monitoramento)', item: 'Monitoramento dos Serviços de Videomonitoramento', nivel: 'Crítico', unidade: 'Unidade', meses: 24, qtdMensal: 4000, valorItem: 24.58, valorMensal: 98320.00, valorGlobal: 2359680.00 },
  { category: 'Operação Integrada (Monitoramento)', item: 'Monitoração dos Serviços para Contact Center', nivel: 'Crítico', unidade: 'Unidade', meses: 24, qtdMensal: 620, valorItem: 28.63, valorMensal: 17750.60, valorGlobal: 426014.40 },
  { category: 'Operação Integrada (Monitoramento)', item: 'Operação do Sistema Gerencial da Rede PE-SIG', nivel: 'Crítico', unidade: 'Unidade', meses: 24, qtdMensal: 1, valorItem: 240314.72, valorMensal: 240314.72, valorGlobal: 5767553.28 },

  // ACESSO DEDICADO CONVERGENTE - ADC PRTM-PRINCIPAL
  { category: 'ADC - PRTM Principal', item: 'Velocidade de 10 Mbps (Básico)', nivel: 'Básico', unidade: 'Unidade', meses: 24, qtdMensal: 285, valorItem: 931.44, valorMensal: 265460.40, valorGlobal: 6371049.60 },
  { category: 'ADC - PRTM Principal', item: 'Velocidade de 10 Mbps (Crítico)', nivel: 'Crítico', unidade: 'Unidade', meses: 24, qtdMensal: 32, valorItem: 1086.46, valorMensal: 34766.72, valorGlobal: 834401.28 },
  { category: 'ADC - PRTM Principal', item: 'Velocidade de 20 Mbps (Básico)', nivel: 'Básico', unidade: 'Unidade', meses: 24, qtdMensal: 472, valorItem: 1178.94, valorMensal: 556459.68, valorGlobal: 13355032.32 },
  { category: 'ADC - PRTM Principal', item: 'Velocidade de 20 Mbps (Crítico)', nivel: 'Crítico', unidade: 'Unidade', meses: 24, qtdMensal: 66, valorItem: 1357.24, valorMensal: 89577.84, valorGlobal: 2149868.16 },
  { category: 'ADC - PRTM Principal', item: 'Velocidade de 40 Mbps (Básico)', nivel: 'Básico', unidade: 'Unidade', meses: 24, qtdMensal: 122, valorItem: 1463.70, valorMensal: 178571.40, valorGlobal: 4285713.60 },
  { category: 'ADC - PRTM Principal', item: 'Velocidade de 40 Mbps (Crítico)', nivel: 'Crítico', unidade: 'Unidade', meses: 24, qtdMensal: 14, valorItem: 1590.70, valorMensal: 22269.80, valorGlobal: 534475.20 },
  { category: 'ADC - PRTM Principal', item: 'Velocidade de 60 Mbps (Básico)', nivel: 'Básico', unidade: 'Unidade', meses: 24, qtdMensal: 74, valorItem: 1610.07, valorMensal: 119145.18, valorGlobal: 2859484.32 },
  { category: 'ADC - PRTM Principal', item: 'Velocidade de 60 Mbps (Crítico)', nivel: 'Crítico', unidade: 'Unidade', meses: 24, qtdMensal: 6, valorItem: 1861.13, valorMensal: 11166.78, valorGlobal: 268002.72 },
  { category: 'ADC - PRTM Principal', item: 'Velocidade de 80 Mbps (Básico)', nivel: 'Básico', unidade: 'Unidade', meses: 24, qtdMensal: 26, valorItem: 1645.09, valorMensal: 42772.34, valorGlobal: 1026536.16 },
  { category: 'ADC - PRTM Principal', item: 'Velocidade de 80 Mbps (Crítico)', nivel: 'Crítico', unidade: 'Unidade', meses: 24, qtdMensal: 7, valorItem: 1924.75, valorMensal: 13473.25, valorGlobal: 323358.00 },
  { category: 'ADC - PRTM Principal', item: 'Velocidade de 100 Mbps (Básico)', nivel: 'Básico', unidade: 'Unidade', meses: 24, qtdMensal: 245, valorItem: 2251.96, valorMensal: 551730.20, valorGlobal: 13241524.80 },
  { category: 'ADC - PRTM Principal', item: 'Velocidade de 100 Mbps (Crítico)', nivel: 'Crítico', unidade: 'Unidade', meses: 24, qtdMensal: 75, valorItem: 2634.81, valorMensal: 197610.75, valorGlobal: 4742658.00 },
  { category: 'ADC - PRTM Principal', item: 'Velocidade de 140 Mbps (Básico)', nivel: 'Básico', unidade: 'Unidade', meses: 24, qtdMensal: 3, valorItem: 2544.74, valorMensal: 7634.22, valorGlobal: 183221.28 },
  { category: 'ADC - PRTM Principal', item: 'Velocidade de 140 Mbps (Crítico)', nivel: 'Crítico', unidade: 'Unidade', meses: 24, qtdMensal: 4, valorItem: 2977.34, valorMensal: 11909.36, valorGlobal: 285824.64 },
  { category: 'ADC - PRTM Principal', item: 'Velocidade de 160 Mbps (Básico)', nivel: 'Básico', unidade: 'Unidade', meses: 24, qtdMensal: 2, valorItem: 2875.54, valorMensal: 5751.08, valorGlobal: 138025.92 },
  { category: 'ADC - PRTM Principal', item: 'Velocidade de 160 Mbps (Crítico)', nivel: 'Crítico', unidade: 'Unidade', meses: 24, qtdMensal: 4, valorItem: 3364.39, valorMensal: 13457.56, valorGlobal: 322981.44 },
  { category: 'ADC - PRTM Principal', item: 'Velocidade de 200 Mbps (Básico)', nivel: 'Básico', unidade: 'Unidade', meses: 24, qtdMensal: 100, valorItem: 3249.37, valorMensal: 324937.00, valorGlobal: 7798488.00 },
  { category: 'ADC - PRTM Principal', item: 'Velocidade de 200 Mbps (Crítico)', nivel: 'Crítico', unidade: 'Unidade', meses: 24, qtdMensal: 40, valorItem: 3801.76, valorMensal: 152070.40, valorGlobal: 3649689.60 },
  { category: 'ADC - PRTM Principal', item: 'Velocidade de 500 Mbps (Básico)', nivel: 'Básico', unidade: 'Unidade', meses: 24, qtdMensal: 60, valorItem: 3931.74, valorMensal: 235904.40, valorGlobal: 5661705.60 },
  { category: 'ADC - PRTM Principal', item: 'Velocidade de 500 Mbps (Crítico)', nivel: 'Crítico', unidade: 'Unidade', meses: 24, qtdMensal: 40, valorItem: 4600.14, valorMensal: 184005.60, valorGlobal: 4416134.40 },

  // ACESSO DEDICADO CONVERGENTE - ADC PRTMS-BÁSICOS
  { category: 'ADC - PRTMs Básicos', item: 'Velocidade de 10 Mbps (Básico)', nivel: 'Básico', unidade: 'Unidade', meses: 24, qtdMensal: 1024, valorItem: 975.04, valorMensal: 998440.96, valorGlobal: 23962583.04 },
  { category: 'ADC - PRTMs Básicos', item: 'Velocidade de 10 Mbps (Crítico)', nivel: 'Crítico', unidade: 'Unidade', meses: 24, qtdMensal: 40, valorItem: 1140.79, valorMensal: 45631.60, valorGlobal: 1095158.40 },
  { category: 'ADC - PRTMs Básicos', item: 'Velocidade de 20 Mbps (Básico)', nivel: 'Básico', unidade: 'Unidade', meses: 24, qtdMensal: 948, valorItem: 1210.87, valorMensal: 1147904.76, valorGlobal: 27549714.24 },
  { category: 'ADC - PRTMs Básicos', item: 'Velocidade de 20 Mbps (Crítico)', nivel: 'Crítico', unidade: 'Unidade', meses: 24, qtdMensal: 56, valorItem: 1425.10, valorMensal: 79805.60, valorGlobal: 1915334.40 },
  { category: 'ADC - PRTMs Básicos', item: 'Velocidade de 40 Mbps (Básico)', nivel: 'Básico', unidade: 'Unidade', meses: 24, qtdMensal: 227, valorItem: 1536.89, valorMensal: 348874.03, valorGlobal: 8372976.72 },
  { category: 'ADC - PRTMs Básicos', item: 'Velocidade de 40 Mbps (Crítico)', nivel: 'Crítico', unidade: 'Unidade', meses: 24, qtdMensal: 2, valorItem: 1670.23, valorMensal: 3340.46, valorGlobal: 80171.04 },
  { category: 'ADC - PRTMs Básicos', item: 'Velocidade de 60 Mbps (Básico)', nivel: 'Básico', unidade: 'Unidade', meses: 24, qtdMensal: 49, valorItem: 1689.90, valorMensal: 82805.10, valorGlobal: 1987322.40 },
  { category: 'ADC - PRTMs Básicos', item: 'Velocidade de 60 Mbps (Crítico)', nivel: 'Crítico', unidade: 'Unidade', meses: 24, qtdMensal: 2, valorItem: 1954.18, valorMensal: 3908.36, valorGlobal: 93800.64 },
  { category: 'ADC - PRTMs Básicos', item: 'Velocidade de 80 Mbps (Básico)', nivel: 'Básico', unidade: 'Unidade', meses: 24, qtdMensal: 10, valorItem: 1727.36, valorMensal: 17273.60, valorGlobal: 414566.40 },
  { category: 'ADC - PRTMs Básicos', item: 'Velocidade de 80 Mbps (Crítico)', nivel: 'Crítico', unidade: 'Unidade', meses: 24, qtdMensal: 3, valorItem: 2020.99, valorMensal: 6062.97, valorGlobal: 145511.28 },
  { category: 'ADC - PRTMs Básicos', item: 'Velocidade de 100 Mbps (Básico)', nivel: 'Básico', unidade: 'Unidade', meses: 24, qtdMensal: 400, valorItem: 2364.57, valorMensal: 945828.00, valorGlobal: 22699872.00 },
  { category: 'ADC - PRTMs Básicos', item: 'Velocidade de 100 Mbps (Crítico)', nivel: 'Crítico', unidade: 'Unidade', meses: 24, qtdMensal: 80, valorItem: 2766.54, valorMensal: 221323.20, valorGlobal: 5311756.80 },
  { category: 'ADC - PRTMs Básicos', item: 'Velocidade de 140 Mbps (Básico)', nivel: 'Básico', unidade: 'Unidade', meses: 24, qtdMensal: 1, valorItem: 2671.96, valorMensal: 2671.96, valorGlobal: 64127.04 },
  { category: 'ADC - PRTMs Básicos', item: 'Velocidade de 140 Mbps (Crítico)', nivel: 'Crítico', unidade: 'Unidade', meses: 24, qtdMensal: 1, valorItem: 3126.22, valorMensal: 3126.22, valorGlobal: 75029.28 },
  { category: 'ADC - PRTMs Básicos', item: 'Velocidade de 160 Mbps (Básico)', nivel: 'Básico', unidade: 'Unidade', meses: 24, qtdMensal: 1, valorItem: 3019.33, valorMensal: 3019.33, valorGlobal: 72463.92 },
  { category: 'ADC - PRTMs Básicos', item: 'Velocidade de 160 Mbps (Crítico)', nivel: 'Crítico', unidade: 'Unidade', meses: 24, qtdMensal: 1, valorItem: 3532.61, valorMensal: 3532.61, valorGlobal: 84782.64 },
  { category: 'ADC - PRTMs Básicos', item: 'Velocidade de 200 Mbps (Básico)', nivel: 'Básico', unidade: 'Unidade', meses: 24, qtdMensal: 10, valorItem: 3411.85, valorMensal: 34118.50, valorGlobal: 818844.00 },
  { category: 'ADC - PRTMs Básicos', item: 'Velocidade de 200 Mbps (Crítico)', nivel: 'Crítico', unidade: 'Unidade', meses: 24, qtdMensal: 10, valorItem: 3991.84, valorMensal: 39918.40, valorGlobal: 958041.60 },
  { category: 'ADC - PRTMs Básicos', item: 'Velocidade de 500 Mbps (Básico)', nivel: 'Básico', unidade: 'Unidade', meses: 24, qtdMensal: 10, valorItem: 4128.32, valorMensal: 41283.20, valorGlobal: 990796.80 },
  { category: 'ADC - PRTMs Básicos', item: 'Velocidade de 500 Mbps (Crítico)', nivel: 'Crítico', unidade: 'Unidade', meses: 24, qtdMensal: 10, valorItem: 4830.15, valorMensal: 48301.50, valorGlobal: 1159236.00 },

  // SERVIÇOS DE PONTOS DE VOZ FIXO - PVFS 2
  { category: 'Pontos de Voz Fixo (PVFS 2)', item: 'Aparelho de Voz Analógico', nivel: 'Básico', unidade: 'Unidade', meses: 24, qtdMensal: 12563, valorItem: 26.60, valorMensal: 334175.80, valorGlobal: 8020219.20 },
  { category: 'Pontos de Voz Fixo (PVFS 2)', item: 'Aparelho de Voz Sem Fio - EXTENSÃO', nivel: 'Básico', unidade: 'Unidade', meses: 24, qtdMensal: 3307, valorItem: 31.92, valorMensal: 105559.44, valorGlobal: 2533426.56 },
  { category: 'Pontos de Voz Fixo (PVFS 2)', item: 'Aparelho de Voz Sem Fio', nivel: 'Básico', unidade: 'Unidade', meses: 24, qtdMensal: 10297, valorItem: 29.26, valorMensal: 301290.22, valorGlobal: 7230965.28 },
  { category: 'Pontos de Voz Fixo (PVFS 2)', item: 'Aparelho de Voz Analógico com Fone de Cabeça', nivel: 'Básico', unidade: 'Unidade', meses: 24, qtdMensal: 300, valorItem: 25.18, valorMensal: 7554.00, valorGlobal: 181296.00 },
  { category: 'Pontos de Voz Fixo (PVFS 2)', item: 'Aparelho de Voz Digital Básico', nivel: 'Básico', unidade: 'Unidade', meses: 24, qtdMensal: 1214, valorItem: 44.24, valorMensal: 53707.36, valorGlobal: 1288976.64 },
  { category: 'Pontos de Voz Fixo (PVFS 2)', item: 'Software Mesa-Telefonista', nivel: 'Básico', unidade: 'Unidade', meses: 24, qtdMensal: 75, valorItem: 78.29, valorMensal: 5871.75, valorGlobal: 140922.00 },
  { category: 'Pontos de Voz Fixo (PVFS 2)', item: 'Aparelho de Voz IP Básico', nivel: 'Básico', unidade: 'Unidade', meses: 24, qtdMensal: 793, valorItem: 40.29, valorMensal: 31949.97, valorGlobal: 766799.28 },
  { category: 'Pontos de Voz Fixo (PVFS 2)', item: 'Aparelho de Voz Digital Especial', nivel: 'Básico', unidade: 'Unidade', meses: 24, qtdMensal: 943, valorItem: 56.04, valorMensal: 52845.72, valorGlobal: 1268297.28 },
  { category: 'Pontos de Voz Fixo (PVFS 2)', item: 'Software de Voz (PVF SOFTWARE)', nivel: 'Básico', unidade: 'Unidade', meses: 24, qtdMensal: 216, valorItem: 21.75, valorMensal: 4698.00, valorGlobal: 112752.00 },
  { category: 'Pontos de Voz Fixo (PVFS 2)', item: 'Virtualização de NIM (PVF VIRTUAL)', nivel: 'Básico', unidade: 'Unidade', meses: 24, qtdMensal: 40, valorItem: 2.80, valorMensal: 112.00, valorGlobal: 2688.00 },

  // INFRAESTRUTURA DE VOZ PARA CONTACT CENTER
  { category: 'Contact Center', item: 'Unidade Central DAC (Básico)', nivel: 'Básico', unidade: 'Unidade', meses: 24, qtdMensal: 300, valorItem: 440.86, valorMensal: 132258.00, valorGlobal: 3174192.00 },
  { category: 'Contact Center', item: 'Unidade Central DAC (Crítico)', nivel: 'Crítico', unidade: 'Unidade', meses: 24, qtdMensal: 124, valorItem: 460.97, valorMensal: 57160.28, valorGlobal: 1371846.72 },
  { category: 'Contact Center', item: 'Gravação Digital de Chamadas (Básico)', nivel: 'Básico', unidade: 'Unidade', meses: 24, qtdMensal: 200, valorItem: 71.84, valorMensal: 14368.00, valorGlobal: 344832.00 },
  { category: 'Contact Center', item: 'Gravação Digital de Chamadas (Crítico)', nivel: 'Crítico', unidade: 'Unidade', meses: 24, qtdMensal: 124, valorItem: 78.64, valorMensal: 9751.36, valorGlobal: 234032.64 },
  { category: 'Contact Center', item: 'Unidade de Resposta Audível - URA (Básico)', nivel: 'Básico', unidade: 'Unidade', meses: 24, qtdMensal: 81, valorItem: 282.06, valorMensal: 22846.86, valorGlobal: 548324.64 },
  { category: 'Contact Center', item: 'Unidade de Resposta Audível - URA (Crítico)', nivel: 'Crítico', unidade: 'Unidade', meses: 24, qtdMensal: 34, valorItem: 303.01, valorMensal: 10302.34, valorGlobal: 247256.16 },

  // SERVIÇO DE OPERAÇÃO SETORIAL
  { category: 'Operação Setorial', item: 'Provimento Básico (1.200 dispositivos)', nivel: 'Básico', unidade: 'Unidade', meses: 24, qtdMensal: 20, valorItem: 16441.91, valorMensal: 328838.20, valorGlobal: 7892116.80 },
  { category: 'Operação Setorial', item: 'Monitoramento Dispositivos de Dados e Imagens (50 disp)', nivel: 'Básico', unidade: 'Unidade', meses: 24, qtdMensal: 40, valorItem: 693.90, valorMensal: 27756.00, valorGlobal: 666144.00 },
  { category: 'Operação Setorial', item: 'Monitoramento de Aplicações Críticas', nivel: 'Básico', unidade: 'Unidade', meses: 24, qtdMensal: 20, valorItem: 16028.09, valorMensal: 320561.80, valorGlobal: 7693483.20 }
];

export const CONTRACT_CLAUSES = [
  {
    num: 'CLÁUSULA PRIMEIRA',
    title: 'DO OBJETO',
    text: 'Constitui objeto do presente CONTRATO a Contratação da pessoa jurídica CONSÓRCIO PECONECTADO II – LOTE I para a prestação de serviços de Rede Corporativa de Telemática - Serviços Fixos por meio de Inexigibilidade de licitação com fundamento no art. 74, caput da Lei nº 14.133/21, a fim de atender as necessidades do Governo do Estado de Pernambuco conforme as condições, especificações, quantidades e exigências contidas nos Estudos Técnicos Preliminares e no Termo de Referência.'
  },
  {
    num: 'CLÁUSULA SEGUNDA',
    title: 'DA DOCUMENTAÇÃO',
    text: 'São partes integrantes deste CONTRATO para todos os fins de direito, o processo relativo ao PROCESSO DE INEXIGIBILIDADE Nº 0093.2026.AC-59.IN.0038.SAD.ATI, e todos os seus anexos, assim como a proposta apresentada pela CONTRATADA.'
  },
  {
    num: 'CLÁUSULA TERCEIRA',
    title: 'DO PRAZO DE VIGÊNCIA E PRORROGAÇÃO',
    text: '3.1. O prazo de vigência do contrato será de 24 (vinte e quatro) meses, contados do dia 1º de março de 2026.\n\n3.2. O contrato poderá ser prorrogado, mediante termo aditivo, caso não seja concluída a transição dos serviços para o contrato decorrente do procedimento licitatório ordinário, mediante apresentação de justificativa técnica e cronograma atualizado que demonstrem a necessidade de prazo adicional.\n\n3.3. O contrato será automaticamente extinto, independentemente de notificação ou formalidade, na data em que for concluída a transição integral dos serviços para o contrato definitivo decorrente da licitação ordinária.'
  },
  {
    num: 'CLÁUSULA QUARTA',
    title: 'DO PREÇO',
    text: '4.1. A CONTRATANTE pagará a CONTRATADA o valor global de R$ 328.549.091,02 (Trezentos e vinte e oito milhões, quinhentos e quarenta e nove mil, noventa e um reais e dois centavos), conforme estabelecido na proposta, parte integrante deste CONTRATO.\n\n4.2. O valor do CONTRATO compreende os custos diretos e indiretos decorrentes de sua execução, incluindo tributos, encargos sociais, trabalhistas, previdenciários, fiscais e comerciais, seguros, despesas de administração, lucro, eventuais custos com transporte, frete e outras despesas correlatas necessárias ao cumprimento integral do objeto da contratação.\n\n4.3. Os valores indicados no subitem 4.1 são meramente estimativos e os pagamentos devidos à CONTRATADA serão feitos conforme medições dos fornecimentos efetivamente realizados, levando em consideração as particularidades das contratações centralizadas de gestão compartilhada.'
  },
  {
    num: 'CLÁUSULA QUINTA',
    title: 'DA DOTAÇÃO ORÇAMENTÁRIA',
    text: '5.1. Os recursos financeiros para fazer face as despesas da contratação do objeto desta licitação correrão por conta dos órgãos ou entidades que vierem a aderir a este CONTRATO, na qualidade de Intervenientes Aderentes, devendo os Programas de Trabalho e Elementos de Despesas constar nos respectivos termos de adesão e notas de empenho.\n\n5.2. As despesas decorrentes da instalação e operacionalização do Serviço de Telefonia Móvel, serão suportadas pelas dotações orçamentárias dos órgãos e entidades do Poder Executivo Estadual, ou a conta das disponibilidades orçamentárias e financeiras das entidades que não dependem do Tesouro Estadual.'
  },
  {
    num: 'CLÁUSULA SEXTA',
    title: 'DAS OBRIGAÇÕES DA CONTRATANTE',
    text: 'Apresenta as obrigações da Contratante Principal (Secretaria de Administração - SAD), da Contratante Técnica (Agência Estadual de Tecnologia da Informação - ATI) e dos Contratantes Aderentes (Secretarias e Órgãos Estaduais) para a gestão, dimensionamento físico-financeiro, atesto, recebimento e fiscalização dos serviços de telemática corporativa.'
  },
  {
    num: 'CLÁUSULA SÉTIMA',
    title: 'DAS OBRIGAÇÕES DA CONTRATADA',
    text: 'A CONTRATADA obriga-se a executar os serviços na forma e termos reportados no Termo de Referência e na sua proposta de preço, compreendendo infraestrutura gerencial, suporte técnico continuado, cumprimento estrito dos Níveis Mínimos de Serviços (NMS), implementação e gerenciamento IPv6/IPv4, emissão mensal de faturas com detalhamento FEBRABAN V3R0, ferramentas web de gestão de faturas, segurança, integridade e confidencialidade das comunicações.'
  },
  {
    num: 'CLÁUSULA OITAVA',
    title: 'DAS OBRIGAÇÕES PERTINENTES À LGPD',
    text: 'Estabelece as diretrizes de tratamento, rastreabilidade, confidencialidade, planos de resposta a incidentes e salvaguarda de dados pessoais operados no âmbito da Rede PE-CONECTADO II, em estrita conformidade com a Lei Geral de Proteção de Dados (Lei Federal nº 13.709/2018).'
  },
  {
    num: 'CLÁUSULA NONA',
    title: 'DA FISCALIZAÇÃO E DA GESTÃO DO CONTRATO',
    text: '9.1. As obrigações dos agentes responsáveis pela gestão e fiscalização da presente contratação estão detalhadas no Decreto Estadual nº 51.651/2021.\n\n9.4. A Gestão do contrato Mater ficará a cargo da CONTRATANTE Secretaria de Administração (SAD) e dos CONTRATANTES Aderentes dos contratos específicos.\n\n9.5. A Fiscalização do Contrato Mater ficará a cargo da SAD e da ATI, e a Fiscalização dos Contratos dos Aderentes ficará a cargo dos Órgãos Aderentes.'
  },
  {
    num: 'CLÁUSULA DÉCIMA',
    title: 'DAS MEDIÇÕES E DO RECEBIMENTO DOS SERVIÇOS',
    text: '10.1. Os indicadores utilizados para avaliação dos serviços prestados estão descritos no Adendo XI - Níveis Mínimos de Serviço (NMS) do Termo de Referência.\n\n10.3. Após a conferência dos quantitativos e valores apresentados, a CONTRATANTE atestará a medição mensal no prazo de 10 dias úteis contados do recebimento do relatório.\n\n10.5. Os serviços serão recebidos provisoriamente pelo fiscal no prazo de 3 dias, e definitivamente em igual período após análise técnica e administrativa.'
  },
  {
    num: 'CLÁUSULA DÉCIMA PRIMEIRA',
    title: 'DO PAGAMENTO',
    text: '11.1. O valor dos pagamentos será obtido mediante a aplicação dos preços unitários contratados às correspondentes quantidades de serviços efetivamente executados, aplicando-se eventual desconto ou glosa.\n\n11.2. O pagamento será feito diretamente pela CONTRATANTE, no prazo de até 30 (trinta) dias, por meio de ordem bancária para crédito em conta corrente da CONTRATADA, mediante atesto definitivo e regularidade fiscal e trabalhista.'
  },
  {
    num: 'CLÁUSULA DÉCIMA SEGUNDA',
    title: 'DA ALTERAÇÃO CONTRATUAL',
    text: '12.1. A CONTRATADA fica obrigada a aceitar, nas mesmas condições contratadas, os acréscimos ou supressões que se fizerem necessários no objeto, a critério exclusivo da CONTRATANTE, até o limite de 25% (vinte e cinco por cento) do valor inicial atualizado do CONTRATO.'
  },
  {
    num: 'CLÁUSULA DÉCIMA TERCEIRA',
    title: 'DA PREVISÃO DA SUBCONTRATAÇÃO',
    text: '13.1. Será permitida a subcontratação de parte do objeto ou de atividades acessórias e complementares, desde que não comprometa a economicidade ou qualidade do serviço, até o limite de 25% (vinte e cinco por cento) do valor total do contrato.'
  },
  {
    num: 'CLÁUSULA DÉCIMA QUARTA',
    title: 'DA GARANTIA DE EXECUÇÃO CONTRATUAL',
    text: '14.1. A CONTRATADA prestará garantia de execução contratual no percentual de 01% (um por cento) do valor total do CONTRATO, nos termos dos artigos 96 a 98 da Lei nº 14.133, de 2021.'
  },
  {
    num: 'CLÁUSULA DÉCIMA SEXTA',
    title: 'DAS INFRAÇÕES E SANÇÕES ADMINISTRATIVAS',
    text: 'Regulamenta as sanções de advertência, multas moratórias e compensatórias, impedimento de licitar e contratar com a Administração Estadual (de 6 a 18 meses ou 18 a 36 meses), e declaração de inidoneidade (de 3 a 6 anos) conforme Lei nº 14.133/2021 e Lei Anticorrupção nº 12.846/2013.'
  },
  {
    num: 'CLÁUSULA DÉCIMA NONA',
    title: 'DO REAJUSTE',
    text: '19.1. Os preços contratados são fixos e irreajustáveis no prazo de um ano, contado da data de elaboração da proposta.\n\n19.2. O preço do CONTRATO será reajustado em periodicidade anual utilizando-se o Índice Nacional de Preços ao Consumidor Amplo - IPCA (IBGE), nos termos da Lei Estadual nº 17.555/2021 e Decreto nº 52.153/2022.'
  },
  {
    num: 'CLÁUSULA VIGÉSIMA TERCEIRA',
    title: 'DA RESOLUÇÃO DE CONTROVÉRSIAS E DO FORO',
    text: '23.1. As controvérsias deverão ser preferencialmente submetidas à Câmara de Negociação, Conciliação e Mediação da Administração Pública Estadual (Lei Complementar nº 417/2019).\n\n23.2. Fica eleito o Foro da Comarca do Recife para dirimir os litígios decorrentes deste CONTRATO.'
  }
];

export const CONTRACT_SIGNATURES = [
  {
    name: 'Emilio Veludo Lopes',
    role: 'Secretário Executivo de Administração e Patrimônio (SAD/PE)',
    date: '25/02/2026 às 20:37',
    basis: 'art. 10º do Decreto nº 45.157/2017'
  },
  {
    name: 'Carlos Henrique de Sá Vasconcelos',
    role: 'Representante Governamental',
    date: '25/02/2026 às 20:43',
    basis: 'art. 10º do Decreto nº 45.157/2017'
  },
  {
    name: 'Frederico de Vasconcelos Pereira',
    role: 'Diretor Presidente (ATI/PE)',
    date: '25/02/2026 às 20:44',
    basis: 'art. 10º do Decreto nº 45.157/2017'
  },
  {
    name: 'Daniel dos Anjos de Oliveira Gomes',
    role: 'Diretor Vice Presidente (1Telecom / Consórcio PE Conectado II)',
    date: '26/02/2026 às 17:25',
    basis: 'art. 10º do Decreto nº 45.157/2017'
  },
  {
    name: 'Rui Augusto Gomes Filho',
    role: 'Diretor Presidente (1Telecom / Consórcio PE Conectado II)',
    date: '26/02/2026 às 18:33',
    basis: 'art. 10º do Decreto nº 45.157/2017'
  }
];
