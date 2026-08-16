import { 
  collection, 
  doc, 
  setDoc, 
  getDocs, 
  onSnapshot, 
  query, 
  orderBy, 
  limit, 
  deleteDoc 
} from 'firebase/firestore';
import { db, cleanUndefined, handleFirestoreError, OperationType } from '../firebase';
import { TariffAuditLog, TariffChangeItem, TariffModuleId, UserSession } from '../types';

export interface RecordTariffChangeParams {
  moduleId: TariffModuleId;
  moduleName: string;
  action?: 'update' | 'reset';
  user?: UserSession | null;
  oldValues: Record<string, number>;
  newValues: Record<string, number>;
  labelsMap: Record<string, string>;
  currencyMap?: Record<string, boolean>;
  unitMap?: Record<string, string>;
  notes?: string;
}

/**
 * Compare old and new values and record a visual audit log if changes occurred
 */
export async function recordTariffChange({
  moduleId,
  moduleName,
  action = 'update',
  user,
  oldValues,
  newValues,
  labelsMap,
  currencyMap = {},
  unitMap = {},
  notes
}: RecordTariffChangeParams): Promise<TariffAuditLog | null> {
  try {
    const changes: TariffChangeItem[] = [];

    // Collect all keys from newValues and oldValues
    const allKeys = Array.from(new Set([...Object.keys(oldValues), ...Object.keys(newValues)]));

    for (const key of allKeys) {
      const oldVal = Number(oldValues[key] ?? 0);
      const newVal = Number(newValues[key] ?? 0);

      // Check if value actually changed (with precision tolerance for floats)
      if (Math.abs(oldVal - newVal) > 0.0001 || action === 'reset') {
        const diff = Number((newVal - oldVal).toFixed(2));
        const diffPercent = oldVal !== 0 
          ? Number(((diff / oldVal) * 100).toFixed(2)) 
          : (newVal !== 0 ? 100 : 0);

        changes.push({
          key,
          label: labelsMap[key] || key,
          oldValue: oldVal,
          newValue: newVal,
          diff,
          diffPercent,
          isCurrency: currencyMap[key] !== false,
          unit: unitMap[key] || (currencyMap[key] === false ? 'un' : 'R$')
        });
      }
    }

    // If no values actually changed and not a reset, do not create empty log
    if (changes.length === 0 && action !== 'reset') {
      return null;
    }

    const now = new Date();
    const logId = `tlog_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const logEntry: TariffAuditLog = {
      id: logId,
      moduleId,
      moduleName,
      action,
      timestamp: now.toISOString(),
      formattedDate: now.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      }),
      userEmail: user?.email || 'admin@peconectado.pe.gov.br',
      userName: user?.displayName || user?.email?.split('@')[0] || 'Administrador do Sistema',
      userRole: user?.role || 'admin',
      changes,
      notes: notes || undefined
    };

    const docRef = doc(db, 'tariffAuditLogs', logId);
    await setDoc(docRef, cleanUndefined(logEntry));

    // Also cache in localStorage for instant offline access
    try {
      const existing = JSON.parse(localStorage.getItem('portal_tariff_audit_logs') || '[]');
      const updated = [logEntry, ...existing.filter((l: TariffAuditLog) => l.id !== logId)].slice(0, 100);
      localStorage.setItem('portal_tariff_audit_logs', JSON.stringify(updated));
    } catch {
      // ignore local storage errors
    }

    return logEntry;
  } catch (err) {
    console.error('Erro ao registrar histórico de tarifas:', err);
    try {
      handleFirestoreError(err, OperationType.CREATE, 'tariffAuditLogs');
    } catch (e) {
      console.warn('Firestore error handled:', e);
    }
    return null;
  }
}

/**
 * Subscribe to tariff audit logs in real-time
 */
export function subscribeTariffLogs(
  callback: (logs: TariffAuditLog[]) => void,
  moduleId?: TariffModuleId
): () => void {
  try {
    const colRef = collection(db, 'tariffAuditLogs');
    const q = query(colRef, orderBy('timestamp', 'desc'), limit(150));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const logs: TariffAuditLog[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data() as TariffAuditLog;
          if (!moduleId || data.moduleId === moduleId) {
            logs.push({ id: docSnap.id, ...data });
          }
        });
        callback(logs);
      },
      (err) => {
        console.error('Erro ao escutar histórico de tarifas em tempo real:', err);
        // Fallback to local storage
        try {
          const localLogs: TariffAuditLog[] = JSON.parse(localStorage.getItem('portal_tariff_audit_logs') || '[]');
          const filtered = moduleId ? localLogs.filter(l => l.moduleId === moduleId) : localLogs;
          callback(filtered);
        } catch {
          callback([]);
        }
      }
    );

    return unsubscribe;
  } catch (err) {
    console.error('Erro ao configurar listener de logs:', err);
    return () => {};
  }
}
