/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type PvfKey =
  | 'analogico'
  | 'semFio'
  | 'extensao'
  | 'dBasico'
  | 'dEspecial'
  | 'ipBasico'
  | 'fCabeca'
  | 'sMesa'
  | 'software'
  | 'virtual';

export interface PvfPrices {
  analogico: number;
  semFio: number;
  extensao: number;
  dBasico: number;
  dEspecial: number;
  ipBasico: number;
  fCabeca: number;
  sMesa: number;
  software: number;
  virtual: number;
}

export interface Contract {
  id: string;
  contrato: string;
  secretaria: string;
  quantities: Record<PvfKey, number>;
  status: 'Ativo' | 'Suspenso' | 'Encerrado';
  dataAssinatura: string;
  observacoes?: string;
  referenceMonth?: string;
}

export interface UserSession {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  isSimulated: boolean;
  role: 'admin' | 'editor' | 'viewer' | 'cliente';
  secretarias?: string[];
}

export type ActiveTab = 'dashboard' | 'contratos' | 'relatorios' | 'precos' | 'usuarios' | 'historico' | 'contact-center' | 'um-telecom' | 'vectra' | 'starlink';
