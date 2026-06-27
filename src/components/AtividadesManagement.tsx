/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { db, handleFirestoreError, OperationType, cleanUndefined } from '../firebase';
import { collection, doc, onSnapshot, setDoc, deleteDoc, getDocs } from 'firebase/firestore';
import { Supplier, LpuItem, LpuSettings, UserSession } from '../types';
import { BRAZIL_STATES_AND_CITIES, estimateDistanceBetweenCities, loadAllCoordinates } from '../data/brazilCities';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import { 
  Activity, 
  Plus, 
  Trash2, 
  FileSpreadsheet, 
  FileDown, 
  FileText,
  Search, 
  AlertTriangle, 
  Calendar, 
  MapPin, 
  TrendingUp, 
  Layers, 
  DollarSign, 
  Clock, 
  CheckCircle,
  X,
  Sparkles,
  Info,
  ChevronDown,
  Edit2,
  Eye,
  Users
} from 'lucide-react';

interface OperationalActivity {
  id: string; // O.S number (7 digits)
  site: string;
  data: string;
  estado: string;
  cidade: string;
  origem: string;
  destino: string;
  atividadeLpuId: string;
  atividadeLpuNome: string;
  material: string;
  kmTotal: number;
  valorKm: number;
  valorMaterial: number;
  valorAtividade: number;
  valorTotal: number;
  parceiroId: string;
  parceiroNome: string;
  createdAt?: string;
  images?: string[];
  createdBy?: string;
  observacao?: string;
  status?: 'pendente' | 'validada';
}

interface AtividadesManagementProps {
  currentUser: UserSession;
}

export default function AtividadesManagement({ currentUser }: AtividadesManagementProps) {
  const isAdmin = currentUser.role === 'admin' || currentUser.role === 'editor' || currentUser.role === 'analista';
  const canWrite = isAdmin || currentUser.role === 'parceiro';

  const [referenceMonth, setReferenceMonth] = useState('Junho/2026');
  const [editingActivityId, setEditingActivityId] = useState<string | null>(null);

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

  const getReferenceMonthFromDate = (dateStr: string) => {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length < 2) return '';
    const year = parts[0];
    const monthInt = parseInt(parts[1], 10);
    const monthNames = [
      'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
      'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];
    if (monthInt >= 1 && monthInt <= 12) {
      return `${monthNames[monthInt - 1]}/${year}`;
    }
    return '';
  };

  // Core Data Collections States
  const [activities, setActivities] = useState<OperationalActivity[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [lpuItems, setLpuItems] = useState<LpuItem[]>([]);
  const [lpuSettings, setLpuSettings] = useState<LpuSettings>({
    valorQuilometragem: '0',
    raioQuilometragem: '0'
  });

  const isParceiro = currentUser.role === 'parceiro';

  // UI Flow States
  const [showForm, setShowForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPartnerFilter, setSelectedPartnerFilter] = useState(
    currentUser.role === 'parceiro' && currentUser.parceiroId ? currentUser.parceiroId : 'all'
  );
  const [notification, setNotification] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [activityToDelete, setActivityToDelete] = useState<OperationalActivity | null>(null);
  const [selectedViewActivity, setSelectedViewActivity] = useState<OperationalActivity | null>(null);
  const [selectedImageFull, setSelectedImageFull] = useState<string | null>(null);

  // Form Field States
  const [uploadedImages, setUploadedImages] = useState<string[]>([]);
  const [osInput, setOsInput] = useState('');
  const [siteInput, setSiteInput] = useState('');
  const [dataInput, setDataInput] = useState(new Date().toISOString().split('T')[0]);
  const [estadoInput, setEstadoInput] = useState('PE');
  const [cidadeInput, setCidadeInput] = useState('');
  const [origemInput, setOrigemInput] = useState('');
  const [destinoInput, setDestinoInput] = useState('');
  const [atividadeLpuIdInput, setAtividadeLpuIdInput] = useState('');
  const [materialInput, setMaterialInput] = useState('');
  const [valorMaterialInput, setValorMaterialInput] = useState('');
  const [parceiroIdInput, setParceiroIdInput] = useState(currentUser.role === 'parceiro' && currentUser.parceiroId ? currentUser.parceiroId : '');
  const [citiesFromApi, setCitiesFromApi] = useState<string[]>([]);
  const [loadingCities, setLoadingCities] = useState(false);
  const [customKmInput, setCustomKmInput] = useState('');
  const [observacaoInput, setObservacaoInput] = useState('');
  const [coordinatesLoaded, setCoordinatesLoaded] = useState(false);

  const userPartner = useMemo(() => {
    const targetPartnerId = isParceiro ? currentUser.parceiroId : parceiroIdInput;
    if (!targetPartnerId) return null;
    return suppliers.find(s => s.id === targetPartnerId) || null;
  }, [isParceiro, suppliers, currentUser.parceiroId, parceiroIdInput]);

  const isRmrOrNoronhaTecnico = useMemo(() => {
    if (!userPartner) return false;
    const areas = userPartner.areasAtuacao || [];
    return areas.includes('RMR') || areas.includes('Noronha');
  }, [userPartner]);

  // Autocomplete Suggestions Active States
  const [cidadeSuggestions, setCidadeSuggestions] = useState<string[]>([]);
  const [origemSuggestions, setOrigemSuggestions] = useState<string[]>([]);
  const [destinoSuggestions, setDestinoSuggestions] = useState<string[]>([]);
  const [showCidadeDropdown, setShowCidadeDropdown] = useState(false);
  const [showOrigemDropdown, setShowOrigemDropdown] = useState(false);
  const [showDestinoDropdown, setShowDestinoDropdown] = useState(false);

  // Form validation errors
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Sync Activities in real-time
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'operationalActivities'), (snapshot) => {
      const list: OperationalActivity[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() } as OperationalActivity);
      });
      // Sort newest dates first
      list.sort((a, b) => b.data.localeCompare(a.data) || b.id.localeCompare(a.id));
      setActivities(list);
    }, (err) => {
      console.error("Erro ao sincronizar atividades:", err);
      handleFirestoreError(err, OperationType.GET, 'operationalActivities');
    });
    return () => unsub();
  }, []);

  // Sync Suppliers (Parceiros) in real-time
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'suppliers'), (snapshot) => {
      const list: Supplier[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() } as Supplier);
      });
      list.sort((a, b) => a.nome.localeCompare(b.nome));
      setSuppliers(list);
    }, (err) => {
      console.error("Erro ao carregar parceiros:", err);
    });
    return () => unsub();
  }, []);

  // Sync LPU Items in real-time
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'lpuItems'), (snapshot) => {
      const list: LpuItem[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() } as LpuItem);
      });
      list.sort((a, b) => a.atividade.localeCompare(b.atividade));
      setLpuItems(list);
    }, (err) => {
      console.error("Erro ao carregar itens da LPU:", err);
    });
    return () => unsub();
  }, []);

  // Sync LPU Mileage Settings in real-time
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'lpuSettings', 'mileage'), (docSnap) => {
      if (docSnap.exists()) {
        setLpuSettings(docSnap.data() as LpuSettings);
      }
    }, (err) => {
      console.error("Erro ao sincronizar configurações LPU:", err);
    });
    return () => unsub();
  }, []);

  // Fetch coordinates on mount
  useEffect(() => {
    loadAllCoordinates().then(() => {
      setCoordinatesLoaded(true);
    });
  }, []);

  // Fetch all cities of selected state from public IBGE API
  useEffect(() => {
    if (!estadoInput) {
      setCitiesFromApi([]);
      return;
    }
    let isMounted = true;
    setLoadingCities(true);
    fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${estadoInput}/municipios`)
      .then(res => {
        if (!res.ok) throw new Error("Erro na API do IBGE");
        return res.json();
      })
      .then(data => {
        if (isMounted) {
          const names = data.map((c: any) => c.nome).sort((a: string, b: string) => a.localeCompare(b));
          setCitiesFromApi(names);
          setLoadingCities(false);
        }
      })
      .catch(err => {
        console.error("Erro ao carregar cidades do IBGE:", err);
        if (isMounted) {
          setCitiesFromApi([]);
          setLoadingCities(false);
        }
      });
    return () => {
      isMounted = false;
    };
  }, [estadoInput]);

  // Setup city auto-completes based on selected state & input typing
  const allCitiesInSelectedState = useMemo(() => {
    if (citiesFromApi.length > 0) {
      return citiesFromApi;
    }
    const list = BRAZIL_STATES_AND_CITIES[estadoInput] || [];
    return list.map(c => c.nome).sort((a, b) => a.localeCompare(b));
  }, [estadoInput, citiesFromApi]);

  const handleCidadeChange = (val: string) => {
    setCidadeInput(val);
    if (!val.trim()) {
      setCidadeSuggestions([]);
      setShowCidadeDropdown(false);
      return;
    }
    const filtered = allCitiesInSelectedState.filter(city => 
      city.toLowerCase().includes(val.toLowerCase())
    ).slice(0, 5);
    setCidadeSuggestions(filtered);
    setShowCidadeDropdown(filtered.length > 0);
  };

  const handleOrigemChange = (val: string) => {
    setOrigemInput(val);
    if (!val.trim()) {
      setOrigemSuggestions([]);
      setShowOrigemDropdown(false);
      return;
    }
    const filtered = allCitiesInSelectedState.filter(city => 
      city.toLowerCase().includes(val.toLowerCase())
    ).slice(0, 5);
    setOrigemSuggestions(filtered);
    setShowOrigemDropdown(filtered.length > 0);
  };

  const handleDestinoChange = (val: string) => {
    setDestinoInput(val);
    if (!val.trim()) {
      setDestinoSuggestions([]);
      setShowDestinoDropdown(false);
      return;
    }
    const filtered = allCitiesInSelectedState.filter(city => 
      city.toLowerCase().includes(val.toLowerCase())
    ).slice(0, 5);
    setDestinoSuggestions(filtered);
    setShowDestinoDropdown(filtered.length > 0);
  };



  const valorKmCalculated = useMemo(() => {
    if (isRmrOrNoronhaTecnico) return 0;
    const valorQuiloStr = lpuSettings.valorQuilometragem ? String(lpuSettings.valorQuilometragem).replace(',', '.') : '0';
    const raioQuiloStr = lpuSettings.raioQuilometragem ? String(lpuSettings.raioQuilometragem).replace(',', '.') : '0';
    
    const valorQuilometragem = parseFloat(valorQuiloStr) || 0;
    const raioQuilometragem = parseFloat(raioQuiloStr) || 0;

    const currentKmTotal = parseFloat(customKmInput) || 0;

    // Formula: (Km Total - Raio Quilometragem) * valorQuilometragem, clamping difference to 0 min
    const kmExcedente = Math.max(0, currentKmTotal - raioQuilometragem);
    return kmExcedente * valorQuilometragem;
  }, [customKmInput, lpuSettings, isRmrOrNoronhaTecnico]);

  const valorAtividadeCalculated = useMemo(() => {
    const selectedItem = lpuItems.find(item => item.id === atividadeLpuIdInput);
    return selectedItem ? selectedItem.valor : 0;
  }, [atividadeLpuIdInput, lpuItems]);

  const valorMaterialFloat = useMemo(() => {
    const normalized = valorMaterialInput.replace(',', '.');
    return parseFloat(normalized) || 0;
  }, [valorMaterialInput]);

  const valorTotalCalculated = useMemo(() => {
    // Formula: Valor KM + Valor Material + Valor Atividade
    return valorKmCalculated + valorMaterialFloat + valorAtividadeCalculated;
  }, [valorKmCalculated, valorMaterialFloat, valorAtividadeCalculated]);

  // Toast Helpers
  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'success') => {
    setNotification({ text, type });
    setTimeout(() => setNotification(null), 4000);
  };

  // Form submission handler
  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 800;
          const MAX_HEIGHT = 800;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
          resolve(dataUrl);
        };
        img.onerror = (err) => reject(err);
      };
      reader.onerror = (err) => reject(err);
    });
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const currentCount = uploadedImages.length;
    if (currentCount + files.length > 5) {
      showToast('Limite de 5 imagens atingido por atividade.', 'error');
      return;
    }

    showToast('Processando e comprimindo imagens...', 'info');
    const newImages: string[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const compressed = await compressImage(file);
        newImages.push(compressed);
      } catch (err) {
        console.error("Erro ao comprimir imagem:", err);
        showToast(`Erro ao carregar imagem: ${file.name}`, 'error');
      }
    }

    setUploadedImages(prev => [...prev, ...newImages]);
    showToast('Imagens adicionadas com sucesso!', 'success');
  };

  const removeUploadedImage = (index: number) => {
    setUploadedImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleAddActivity = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormErrors({});

    // 1. O.S Validation: Must be 7 numeric digits
    const osClean = osInput.trim();
    if (!/^\d{7}$/.test(osClean)) {
      setFormErrors(prev => ({ ...prev, os: 'O campo O.S deve conter exatamente 7 dígitos numéricos.' }));
      showToast('O.S inválida! Deve conter 7 dígitos numéricos.', 'error');
      return;
    }

    // 2. O.S Unique Constraint Checklist: Check duplicates in local synced activities
    const osExists = activities.some(act => act.id !== editingActivityId && act.id === osClean);
    if (osExists) {
      setFormErrors(prev => ({ ...prev, os: 'Já existe uma atividade cadastrada com este número de O.S.' }));
      alert(`Erro: A O.S de número ${osClean} já está cadastrada! Por favor use uma O.S diferente.`);
      showToast(`O.S ${osClean} já existe!`, 'error');
      return;
    }

    // General validation
    const errors: Record<string, string> = {};
    if (!siteInput.trim()) errors.site = 'O campo Site é obrigatório.';
    if (!dataInput) errors.data = 'A data é obrigatória.';
    if (!isRmrOrNoronhaTecnico) {
      if (!origemInput.trim()) errors.origem = 'A origem é obrigatória.';
      if (!destinoInput.trim()) errors.destino = 'O destino é obrigatório.';
    }
    if (!atividadeLpuIdInput) errors.atividadeLpu = 'A atividade LPU é obrigatória.';
    const actualParceiroId = currentUser.role === 'parceiro' && currentUser.parceiroId ? currentUser.parceiroId : parceiroIdInput;
    if (!actualParceiroId) errors.parceiro = 'Selecione um parceiro.';
    
    // Validate mandatory image upload (not required for Admin)
    if (currentUser.role !== 'admin' && (!uploadedImages || uploadedImages.length === 0)) {
      errors.images = 'Pelo menos uma imagem/comprovante do serviço deve ser anexada.';
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      showToast('Por favor, preencha todos os campos obrigatórios corretamente.', 'error');
      return;
    }

    const selectedPartner = suppliers.find(s => s.id === actualParceiroId);
    const selectedLpuItem = lpuItems.find(l => l.id === atividadeLpuIdInput);

    const existingActivity = activities.find(act => act.id === (editingActivityId || osClean));

    const newActivity: OperationalActivity = {
      id: osClean,
      site: siteInput.trim(),
      data: dataInput,
      estado: isRmrOrNoronhaTecnico ? 'PE' : estadoInput,
      cidade: isRmrOrNoronhaTecnico ? 'Isento' : destinoInput.trim(),
      origem: isRmrOrNoronhaTecnico ? 'Isento' : origemInput.trim(),
      destino: isRmrOrNoronhaTecnico ? 'Isento' : destinoInput.trim(),
      atividadeLpuId: atividadeLpuIdInput,
      atividadeLpuNome: selectedLpuItem ? selectedLpuItem.atividade : '',
      material: materialInput.trim(),
      kmTotal: isRmrOrNoronhaTecnico ? 0 : (parseFloat(customKmInput) || 0),
      valorKm: valorKmCalculated,
      valorMaterial: valorMaterialFloat,
      valorAtividade: valorAtividadeCalculated,
      valorTotal: valorTotalCalculated,
      parceiroId: actualParceiroId,
      parceiroNome: selectedPartner ? selectedPartner.nome : '',
      createdAt: existingActivity?.createdAt || new Date().toISOString(),
      images: uploadedImages,
      createdBy: existingActivity?.createdBy || currentUser.email || 'parceiro',
      observacao: observacaoInput.trim(),
      status: existingActivity?.status || 'pendente'
    };

    try {
      if (editingActivityId) {
        if (editingActivityId !== osClean) {
          await deleteDoc(doc(db, 'operationalActivities', editingActivityId));
        }
        await setDoc(doc(db, 'operationalActivities', osClean), cleanUndefined(newActivity));
        showToast('Atividade operacional atualizada com sucesso!', 'success');
      } else {
        await setDoc(doc(db, 'operationalActivities', osClean), cleanUndefined(newActivity));
        showToast('Atividade operacional registrada com sucesso!', 'success');
      }
      resetForm();
    } catch (err: any) {
      console.error('Erro ao salvar atividade:', err);
      handleFirestoreError(err, OperationType.WRITE, `operationalActivities/${osClean}`);
      showToast('Erro ao salvar no banco de dados.', 'error');
    }
  };

  const resetForm = () => {
    setOsInput('');
    setSiteInput('');
    setDataInput(new Date().toISOString().split('T')[0]);
    setEstadoInput('PE');
    setCidadeInput('');
    setOrigemInput('');
    setDestinoInput('');
    setAtividadeLpuIdInput('');
    setMaterialInput('');
    setValorMaterialInput('');
    setParceiroIdInput(currentUser.role === 'parceiro' && currentUser.parceiroId ? currentUser.parceiroId : '');
    setCustomKmInput('');
    setObservacaoInput('');
    setFormErrors({});
    setShowForm(false);
    setEditingActivityId(null);
    setUploadedImages([]);
  };

  const handleStartEdit = (act: OperationalActivity) => {
    setEditingActivityId(act.id);
    setOsInput(act.id);
    setSiteInput(act.site);
    setDataInput(act.data);
    setEstadoInput(act.estado);
    setOrigemInput(act.origem);
    setDestinoInput(act.destino);
    setAtividadeLpuIdInput(act.atividadeLpuId);
    setMaterialInput(act.material || '');
    setValorMaterialInput(String(act.valorMaterial || '').replace('.', ','));
    setParceiroIdInput(act.parceiroId);
    setCustomKmInput(String(act.kmTotal));
    setUploadedImages(act.images || []);
    setObservacaoInput(act.observacao || '');
    setShowForm(true);

    // Scroll smoothly to form section
    setTimeout(() => {
      document.getElementById('supplier-form-container')?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  // Deletion logic
  const triggerDelete = (act: OperationalActivity) => {
    setActivityToDelete(act);
  };

  const confirmDeleteActivity = async () => {
    if (!activityToDelete) return;
    try {
      await deleteDoc(doc(db, 'operationalActivities', activityToDelete.id));
      showToast(`Atividade O.S ${activityToDelete.id} removida!`, 'success');
    } catch (err: any) {
      console.error('Erro ao remover atividade:', err);
      showToast('Erro ao remover atividade.', 'error');
    } finally {
      setActivityToDelete(null);
    }
  };

  const handleValidateActivity = async (actId: string, currentStatus: string) => {
    try {
      const newStatus = currentStatus === 'validada' ? 'pendente' : 'validada';
      await setDoc(doc(db, 'operationalActivities', actId), { status: newStatus }, { merge: true });
      showToast(`Atividade O.S ${actId} ${newStatus === 'validada' ? 'validada com sucesso (aceite confirmado)' : 'marcada como pendente'}!`, 'success');
      
      // Update selectedViewActivity state dynamically if it is open
      setSelectedViewActivity(prev => {
        if (prev && prev.id === actId) {
          return { ...prev, status: newStatus };
        }
        return prev;
      });
    } catch (err: any) {
      console.error('Erro ao validar atividade:', err);
      showToast('Erro ao validar atividade.', 'error');
    }
  };

  // Text formatting
  const formatBRL = (val: number) => {
    return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  // Filtered List computations
  const monthActivities = useMemo(() => {
    return activities.filter(act => {
      // For Parceiro: they can see activities they created themselves OR activities designated for their assigned partner
      if (currentUser.role === 'parceiro') {
        const creatorEmail = act.createdBy?.toLowerCase().trim();
        const userEmail = currentUser.email?.toLowerCase().trim();
        const isCreator = creatorEmail && creatorEmail === userEmail;
        
        const hasMatchingPartner = currentUser.parceiroId && act.parceiroId === currentUser.parceiroId;
        
        if (!isCreator && !hasMatchingPartner) {
          return false;
        }
      }

      if (act.data) {
        const actMonth = getReferenceMonthFromDate(act.data);
        return actMonth === referenceMonth;
      }
      return false;
    });
  }, [activities, referenceMonth, currentUser]);

  const filteredActivities = useMemo(() => {
    return monthActivities.filter(act => {
      // Query filter
      const query = searchQuery.toLowerCase().trim();
      const matchesQuery = !query ? true : (
        act.id.toLowerCase().includes(query) ||
        act.site.toLowerCase().includes(query) ||
        act.cidade.toLowerCase().includes(query) ||
        act.origem.toLowerCase().includes(query) ||
        act.destino.toLowerCase().includes(query) ||
        act.atividadeLpuNome.toLowerCase().includes(query) ||
        act.parceiroNome.toLowerCase().includes(query)
      );

      // Partner dropdown filter
      const matchesPartner = selectedPartnerFilter === 'all' ? true : act.parceiroId === selectedPartnerFilter;

      return matchesQuery && matchesPartner;
    });
  }, [monthActivities, searchQuery, selectedPartnerFilter]);

  const selectedSupplier = useMemo(() => {
    if (selectedPartnerFilter === 'all') return null;
    return suppliers.find(s => s.id === selectedPartnerFilter) || null;
  }, [suppliers, selectedPartnerFilter]);

  // Excel Exporter implementation using SheetJS
  const exportExcel = () => {
    try {
      if (filteredActivities.length === 0) {
        showToast('Nenhuma atividade disponível para exportar.', 'error');
        return;
      }

      const headers = [
        'O.S',
        'Site',
        'Data',
        'Estado',
        'Cidade',
        'Origem',
        'Destino',
        'Atividade LPU',
        'Material',
        'KM Total',
        'Valor KM',
        'Valor Material',
        'Valor Atividade',
        'Valor Total',
        'Parceiro',
        'Observação'
      ];

      const rows = filteredActivities.map(act => [
        act.id,
        act.site,
        act.data ? new Date(act.data + 'T00:00:00').toLocaleDateString('pt-BR') : '',
        act.estado,
        act.cidade,
        act.origem,
        act.destino,
        act.atividadeLpuNome,
        act.material || '-',
        act.kmTotal,
        act.valorKm,
        act.valorMaterial,
        act.valorAtividade,
        act.valorTotal,
        act.parceiroNome,
        act.observacao || ''
      ]);

      const worksheetData = [headers, ...rows];
      const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
      const workbook = XLSX.utils.book_new();
      
      // Auto size columns nicely
      const maxColWidths = headers.map((h, i) => {
        let maxLen = h.length;
        rows.forEach(r => {
          const val = String(r[i] || '');
          if (val.length > maxLen) maxLen = val.length;
        });
        return { wch: maxLen + 3 };
      });
      worksheet['!cols'] = maxColWidths;

      XLSX.utils.book_append_sheet(workbook, worksheet, 'Atividades Operacionais');
      XLSX.writeFile(workbook, `Relatorio_Atividades_Operacionais_${new Date().toISOString().split('T')[0]}.xlsx`);
      showToast('Planilha Excel exportada com sucesso!', 'success');
    } catch (err) {
      console.error('Erro ao exportar Excel:', err);
      showToast('Erro ao exportar planilha.', 'error');
    }
  };

  // PDF Exporter implementation using jsPDF with auto-paging
  const exportPDF = () => {
    try {
      if (filteredActivities.length === 0) {
        showToast('Nenhuma atividade disponível para exportar.', 'error');
        return;
      }

      const docPdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      
      // Document metadata and colors
      docPdf.setFillColor(24, 24, 27); // zinc-900 / dark accent
      docPdf.rect(0, 0, 297, 30, 'F');

      docPdf.setTextColor(255, 255, 255);
      docPdf.setFont('helvetica', 'bold');
      docPdf.setFontSize(14);
      docPdf.text('MÉTODO TELECOM - SISTEMA DE GESTÃO', 15, 11);

      docPdf.setFont('helvetica', 'normal');
      docPdf.setFontSize(9);
      docPdf.setTextColor(212, 212, 216); // zinc-300
      docPdf.text('Relatório Consolidado de Atividades Operacionais e Faturamento', 15, 17);
      docPdf.text(`Filtrado por Parceiro: ${selectedPartnerFilter === 'all' ? 'Todos' : (suppliers.find(s => s.id === selectedPartnerFilter)?.nome || 'Filtro')}`, 15, 23);

      docPdf.setTextColor(255, 255, 255);
      docPdf.setFontSize(8);
      const emitDate = new Date().toLocaleString('pt-BR');
      docPdf.text(`Emitido em: ${emitDate}`, 220, 11);
      docPdf.text(`Total Registros: ${filteredActivities.length}`, 220, 17);

      let y = 40;

      // Table Header definitions
      docPdf.setFillColor(244, 244, 245); // zinc-100
      docPdf.rect(10, y, 277, 7, 'F');
      
      docPdf.setTextColor(39, 39, 42); // zinc-800
      docPdf.setFont('helvetica', 'bold');
      docPdf.setFontSize(7.5);

      // Col widths in MM (sum should fit within 277mm)
      const colWidths = {
        os: 15,
        site: 18,
        data: 18,
        cidade: 22,
        origem: 22,
        destino: 22,
        atividade: 40,
        km: 15,
        valKm: 20,
        valMat: 20,
        valAtiv: 20,
        valTot: 25,
        parceiro: 20
      };

      const startX = 12;
      docPdf.text('O.S', startX, y + 5);
      docPdf.text('Site', startX + colWidths.os, y + 5);
      docPdf.text('Data', startX + colWidths.os + colWidths.site, y + 5);
      docPdf.text('Cidade', startX + colWidths.os + colWidths.site + colWidths.data, y + 5);
      docPdf.text('Origem', startX + colWidths.os + colWidths.site + colWidths.data + colWidths.cidade, y + 5);
      docPdf.text('Destino', startX + colWidths.os + colWidths.site + colWidths.data + colWidths.cidade + colWidths.origem, y + 5);
      docPdf.text('Atividade LPU', startX + colWidths.os + colWidths.site + colWidths.data + colWidths.cidade + colWidths.origem + colWidths.destino, y + 5);
      
      const startCalculatedX = startX + colWidths.os + colWidths.site + colWidths.data + colWidths.cidade + colWidths.origem + colWidths.destino + colWidths.atividade;
      docPdf.text('KM Tot', startCalculatedX, y + 5);
      docPdf.text('Val KM', startCalculatedX + colWidths.km, y + 5);
      docPdf.text('Val Mat', startCalculatedX + colWidths.km + colWidths.valKm, y + 5);
      docPdf.text('Val Ativ', startCalculatedX + colWidths.km + colWidths.valKm + colWidths.valMat, y + 5);
      docPdf.text('Valor Total', startCalculatedX + colWidths.km + colWidths.valKm + colWidths.valMat + colWidths.valAtiv, y + 5);
      docPdf.text('Parceiro', startCalculatedX + colWidths.km + colWidths.valKm + colWidths.valMat + colWidths.valAtiv + colWidths.valTot, y + 5);

      // Setup list contents with pagination
      y += 11;
      docPdf.setFont('helvetica', 'normal');
      docPdf.setFontSize(7);
      docPdf.setTextColor(63, 63, 70); // zinc-700

      let runningTotal = 0;

      filteredActivities.forEach((act, idx) => {
        runningTotal += act.valorTotal;

        // Auto page break at height 185mm
        if (y > 185) {
          docPdf.addPage();
          y = 20;

          // Repeat Header on new page
          docPdf.setFillColor(244, 244, 245);
          docPdf.rect(10, y, 277, 7, 'F');
          docPdf.setTextColor(39, 39, 42);
          docPdf.setFont('helvetica', 'bold');
          docPdf.setFontSize(7.5);

          docPdf.text('O.S', startX, y + 5);
          docPdf.text('Site', startX + colWidths.os, y + 5);
          docPdf.text('Data', startX + colWidths.os + colWidths.site, y + 5);
          docPdf.text('Cidade', startX + colWidths.os + colWidths.site + colWidths.data, y + 5);
          docPdf.text('Origem', startX + colWidths.os + colWidths.site + colWidths.data + colWidths.cidade, y + 5);
          docPdf.text('Destino', startX + colWidths.os + colWidths.site + colWidths.data + colWidths.cidade + colWidths.origem, y + 5);
          docPdf.text('Atividade LPU', startX + colWidths.os + colWidths.site + colWidths.data + colWidths.cidade + colWidths.origem + colWidths.destino, y + 5);
          docPdf.text('KM Tot', startCalculatedX, y + 5);
          docPdf.text('Val KM', startCalculatedX + colWidths.km, y + 5);
          docPdf.text('Val Mat', startCalculatedX + colWidths.km + colWidths.valKm, y + 5);
          docPdf.text('Val Ativ', startCalculatedX + colWidths.km + colWidths.valKm + colWidths.valMat, y + 5);
          docPdf.text('Valor Total', startCalculatedX + colWidths.km + colWidths.valKm + colWidths.valMat + colWidths.valAtiv, y + 5);
          docPdf.text('Parceiro', startCalculatedX + colWidths.km + colWidths.valKm + colWidths.valMat + colWidths.valAtiv + colWidths.valTot, y + 5);

          y += 11;
          docPdf.setFont('helvetica', 'normal');
          docPdf.setFontSize(7);
          docPdf.setTextColor(63, 63, 70);
        }

        // Draw background zebra strips to maintain legibility
        if (idx % 2 === 0) {
          docPdf.setFillColor(250, 250, 250);
          docPdf.rect(10, y - 3.5, 277, 5.5, 'F');
        }

        // Write row columns
        docPdf.text(act.id, startX, y);
        
        // Truncate site text safely
        const siteTruncated = act.site.length > 10 ? act.site.substring(0, 10) + '..' : act.site;
        docPdf.text(siteTruncated, startX + colWidths.os, y);

        const formattedDate = act.data ? new Date(act.data + 'T00:00:00').toLocaleDateString('pt-BR') : '';
        docPdf.text(formattedDate, startX + colWidths.os + colWidths.site, y);

        const cidadeTruncated = act.cidade.length > 12 ? act.cidade.substring(0, 12) + '..' : act.cidade;
        docPdf.text(cidadeTruncated, startX + colWidths.os + colWidths.site + colWidths.data, y);

        const origemTruncated = act.origem.length > 12 ? act.origem.substring(0, 12) + '..' : act.origem;
        docPdf.text(origemTruncated, startX + colWidths.os + colWidths.site + colWidths.data + colWidths.cidade, y);

        const destinoTruncated = act.destino.length > 12 ? act.destino.substring(0, 12) + '..' : act.destino;
        docPdf.text(destinoTruncated, startX + colWidths.os + colWidths.site + colWidths.data + colWidths.cidade + colWidths.origem, y);

        const activityTruncated = act.atividadeLpuNome.length > 24 ? act.atividadeLpuNome.substring(0, 24) + '..' : act.atividadeLpuNome;
        docPdf.text(activityTruncated, startX + colWidths.os + colWidths.site + colWidths.data + colWidths.cidade + colWidths.origem + colWidths.destino, y);

        // Numeric fields
        docPdf.text(`${act.kmTotal} Km`, startCalculatedX, y);
        docPdf.text(formatBRL(act.valorKm), startCalculatedX + colWidths.km, y);
        docPdf.text(formatBRL(act.valorMaterial), startCalculatedX + colWidths.km + colWidths.valKm, y);
        docPdf.text(formatBRL(act.valorAtividade), startCalculatedX + colWidths.km + colWidths.valKm + colWidths.valMat, y);
        
        docPdf.setFont('helvetica', 'bold');
        docPdf.text(formatBRL(act.valorTotal), startCalculatedX + colWidths.km + colWidths.valKm + colWidths.valMat + colWidths.valAtiv, y);
        docPdf.setFont('helvetica', 'normal');

        const partnerTruncated = act.parceiroNome.length > 12 ? act.parceiroNome.substring(0, 12) + '..' : act.parceiroNome;
        docPdf.text(partnerTruncated, startCalculatedX + colWidths.km + colWidths.valKm + colWidths.valMat + colWidths.valAtiv + colWidths.valTot, y);

        // Separator line
        docPdf.setDrawColor(240, 240, 240);
        docPdf.line(10, y + 2, 287, y + 2);

        y += 6;
      });

      // Total Financial Box Summary
      if (y > 175) {
        docPdf.addPage();
        y = 20;
      }

      y += 4;
      docPdf.setFillColor(244, 244, 245);
      docPdf.roundedRect(180, y, 107, 15, 2, 2, 'F');
      
      docPdf.setTextColor(24, 24, 27);
      docPdf.setFont('helvetica', 'bold');
      docPdf.setFontSize(9);
      docPdf.text('CONSOLIDADO TOTAL FATURADO:', 185, y + 9);
      docPdf.setFontSize(11);
      docPdf.setTextColor(22, 163, 74); // emerald-600
      docPdf.text(formatBRL(runningTotal), 245, y + 9);

      docPdf.save(`Relatorio_Atividades_Faturamento_${new Date().toISOString().split('T')[0]}.pdf`);
      showToast('Relatório PDF exportado com sucesso!', 'success');
    } catch (err) {
      console.error('Erro ao exportar PDF:', err);
      showToast('Erro ao exportar PDF.', 'error');
    }
  };

  return (
    <div className="w-full space-y-6">
      
      {/* Toast Notification */}
      {notification && (
        <div className={`fixed bottom-5 right-5 z-50 p-4 rounded-xl shadow-lg border text-xs font-sans font-bold flex items-center gap-2.5 animate-slide-in ${
          notification.type === 'success' 
            ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/50' 
            : notification.type === 'error'
              ? 'bg-rose-50 dark:bg-rose-950/30 text-rose-800 dark:text-rose-400 border-rose-200 dark:border-rose-800/50'
              : 'bg-zinc-50 dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 border-zinc-200 dark:border-zinc-800'
        }`}>
          {notification.type === 'success' ? <CheckCircle className="h-4 w-4 text-emerald-500" /> : <AlertTriangle className="h-4 w-4 text-rose-500" />}
          <span>{notification.text}</span>
        </div>
      )}

      {/* Title Header Card */}
      <div className="relative overflow-hidden rounded-3.5xl border border-zinc-200/80 dark:border-zinc-800/80 bg-white dark:bg-zinc-900 p-6 md:p-8 shadow-xs">
        <div className="absolute right-0 top-0 -mr-16 -mt-16 w-48 h-48 rounded-full bg-cyan-500/5 dark:bg-cyan-500/10 blur-3xl pointer-events-none" />
        <div className="absolute left-1/3 bottom-0 w-64 h-64 rounded-full bg-indigo-500/5 blur-3xl pointer-events-none" />
        
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-cyan-500/10 text-cyan-600 dark:bg-zinc-800 dark:text-cyan-405">
              <Activity className="h-3 w-3 animate-pulse text-cyan-600" />
              Atividades Operacionais
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-zinc-900 dark:text-white font-sans flex items-center gap-2">
              Atividades Operacionais
            </h1>
            <p className="text-zinc-500 dark:text-zinc-450 text-xs max-w-2xl leading-relaxed">
              Controle, registro e auditoria de atividades de campo por O.S dos parceiros, integrando cálculos automatizados de quilometragem excedente e valores de atividades LPU.
            </p>
          </div>
          
          {/* Month Selector and Action Buttons */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
            <div className="flex flex-col justify-center bg-zinc-50 dark:bg-zinc-950 px-5 py-3 rounded-2.5xl border border-zinc-200/50 dark:border-zinc-850/65 min-w-[220px]">
              <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest font-mono">Mês de Referência</span>
              <div className="relative mt-1">
                <select
                  value={referenceMonth}
                  onChange={(e) => setReferenceMonth(e.target.value)}
                  className="w-full bg-white dark:bg-zinc-900 border border-zinc-250 dark:border-zinc-800 rounded-xl px-3 py-1.5 text-xs font-bold text-zinc-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-cyan-500 appearance-none cursor-pointer pr-10 shadow-xs"
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
                onClick={exportExcel}
                className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-[11px] font-black uppercase tracking-wider transition-all shadow-xs cursor-pointer active:scale-95 duration-150"
                title="Exportar dados filtrados para Microsoft Excel (.xlsx)"
              >
                <FileSpreadsheet className="h-4 w-4 text-white" />
                <span>Planilha Excel</span>
              </button>

              <button
                onClick={exportPDF}
                className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl text-[11px] font-black uppercase tracking-wider transition-all shadow-xs cursor-pointer active:scale-95 duration-150"
                title="Gerar e salvar relatório de faturamento em arquivo PDF"
              >
                <FileText className="h-4 w-4 text-white" />
                <span>Relatório PDF</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Statistics Cards - Starlink Layout */}
      <h2 className="text-xs font-black uppercase tracking-widest text-zinc-400 font-mono pl-1">
        Demonstrativo do Mês ({referenceMonth})
      </h2>

      <div className={`grid grid-cols-1 md:grid-cols-2 ${selectedSupplier ? 'lg:grid-cols-4' : 'lg:grid-cols-3'} gap-4`}>
        {/* Card 1: Total de Atividades */}
        <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200/85 dark:border-zinc-800/85 p-5 space-y-3 shadow-xs transition-all duration-300">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-cyan-600 dark:text-cyan-400 bg-cyan-500/10 dark:bg-cyan-500/20 px-2 py-0.5 rounded-md font-mono">
              TOTAL DE REGISTROS
            </span>
            <Layers className="h-4 w-4 text-zinc-400" />
          </div>
          <div>
            <span className="block text-[10px] text-zinc-400 font-bold uppercase tracking-wider font-mono">Total de Atividades</span>
            <span className="block text-xl font-black text-zinc-900 dark:text-white mt-0.5">
              {filteredActivities.length}
            </span>
            <span className="text-[11px] font-mono text-zinc-400 mt-1 block">
              {selectedPartnerFilter !== 'all' ? 'do parceiro selecionado' : 'atividades ativas'}
            </span>
          </div>
        </div>

        {/* Card 2: Custo no Período */}
        <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200/85 dark:border-zinc-800/85 p-5 space-y-3 shadow-xs transition-all duration-300">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 dark:bg-emerald-500/20 px-2 py-0.5 rounded-md font-mono">
              FINANCEIRO
            </span>
            <DollarSign className="h-4 w-4 text-zinc-400" />
          </div>
          <div>
            <span className="block text-[10px] text-zinc-400 font-bold uppercase tracking-wider font-mono">Custo no Período</span>
            <span className="block text-xl font-black text-emerald-600 dark:text-emerald-400 mt-0.5">
              {formatBRL(filteredActivities.reduce((sum, act) => sum + act.valorTotal, 0))}
            </span>
            <span className="text-[11px] font-mono text-zinc-400 mt-1 block">
              {selectedPartnerFilter !== 'all' ? 'faturamento do parceiro' : 'valor acumulado'}
            </span>
          </div>
        </div>

        {/* Card 3: Total Distância */}
        <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200/85 dark:border-zinc-800/85 p-5 space-y-3 shadow-xs transition-all duration-300">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-amber-600 dark:text-amber-450 bg-amber-500/10 dark:bg-amber-550/20 px-2 py-0.5 rounded-md font-mono">
              DESLOCAMENTO
            </span>
            <Clock className="h-4 w-4 text-zinc-400" />
          </div>
          <div>
            <span className="block text-[10px] text-zinc-400 font-bold uppercase tracking-wider font-mono">Total Distância</span>
            <span className="block text-xl font-black text-zinc-900 dark:text-white mt-0.5">
              {filteredActivities.reduce((sum, act) => sum + act.kmTotal, 0).toLocaleString('pt-BR')} Km
            </span>
            <span className="text-[11px] font-mono text-zinc-400 mt-1 block">
              {selectedPartnerFilter !== 'all' ? 'deslocamento do parceiro' : 'quilometragem rodada'}
            </span>
          </div>
        </div>

        {/* Card 4: Ficha do Parceiro Selecionado */}
        {selectedSupplier && (
          <div className="bg-zinc-950 text-white rounded-3xl border border-zinc-850 p-5 space-y-3 shadow-md relative overflow-hidden group transition-all duration-300 animate-fade-in">
            {/* Ambient subtle glow effect */}
            <div className="absolute -right-10 -top-10 w-32 h-32 bg-cyan-500/10 rounded-full blur-2xl group-hover:bg-cyan-500/20 transition-all duration-500" />
            
            <div className="flex items-center justify-between relative z-10">
              <span className="text-[10px] font-black text-cyan-400 bg-cyan-500/20 px-2.5 py-0.5 rounded-full font-mono uppercase tracking-wider">
                Dados do Parceiro
              </span>
              {currentUser.role !== 'parceiro' && (
                <button
                  onClick={() => setSelectedPartnerFilter('all')}
                  className="text-zinc-400 hover:text-white p-1 hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer"
                  title="Mostrar todos os parceiros"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <div className="space-y-2.5 relative z-10">
              <div>
                <span className="block text-[9px] text-zinc-400 font-bold uppercase tracking-wider font-mono">Nome / Razão Social</span>
                <span className="block text-sm font-black text-white leading-tight truncate" title={selectedSupplier.nome}>
                  {selectedSupplier.nome}
                </span>
                {selectedSupplier.empresa && (
                  <span className="inline-block text-[10px] bg-zinc-850 text-zinc-300 font-semibold px-2 py-0.5 rounded-md mt-1 font-mono border border-zinc-800">
                    {selectedSupplier.empresa}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 border-t border-zinc-800/60 pt-2 text-[10px]">
                <div>
                  <span className="block text-[8px] text-zinc-400 font-bold uppercase tracking-wider font-mono">CPF</span>
                  <span className="font-mono text-zinc-200">{selectedSupplier.cpf || 'Não informado'}</span>
                </div>
                <div>
                  <span className="block text-[8px] text-zinc-400 font-bold uppercase tracking-wider font-mono">CNPJ</span>
                  <span className="font-mono text-zinc-200">{selectedSupplier.cnpj || 'Não informado'}</span>
                </div>
              </div>

              <div className="border-t border-zinc-800/60 pt-2 space-y-1.5 text-[10.5px]">
                <div className="flex items-center gap-1.5 text-zinc-300">
                  <MapPin className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                  <span className="truncate" title={selectedSupplier.endereco || 'Endereço não cadastrado'}>
                    {selectedSupplier.endereco || 'Sem endereço'}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-zinc-300">
                  <span className="font-mono bg-zinc-850 text-cyan-400 text-[9px] px-1.5 py-0.5 rounded font-bold shrink-0 border border-zinc-850">CONTATO</span>
                  <span className="truncate font-semibold">{selectedSupplier.contato || 'Sem contato'}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Register / Creation Form */}
      {showForm && canWrite && (
        <div id="supplier-form-container" className="bg-white dark:bg-zinc-900 p-6 sm:p-8 rounded-3xl border border-zinc-200/85 dark:border-zinc-800/85 shadow-sm space-y-6 animate-slide-down">
          <div className="flex items-center justify-between pb-3 border-b border-zinc-150 dark:border-zinc-800">
            <h2 className="text-sm font-black font-mono uppercase tracking-wider text-zinc-800 dark:text-zinc-100 flex items-center gap-2">
              <Sparkles className="h-4.5 w-4.5 text-brand" />
              <span>{editingActivityId ? 'Editar Atividade de Campo' : 'Registrar Nova Atividade de Campo'}</span>
            </h2>
            <button 
              onClick={resetForm}
              className="text-zinc-400 hover:text-zinc-650 dark:hover:text-zinc-300 p-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg cursor-pointer transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <form onSubmit={handleAddActivity} className="space-y-6">
            
            {/* Top Operational Grid info */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-5">
              
              {/* O.S 7 Digits Input */}
              <div className="space-y-1.5">
                <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-mono">
                  Número O.S <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  maxLength={7}
                  placeholder="Ex: 1234567"
                  value={osInput}
                  onChange={(e) => setOsInput(e.target.value.replace(/\D/g, ''))}
                  className={`w-full bg-zinc-50 dark:bg-zinc-950 border ${
                    formErrors.os ? 'border-rose-500 focus:border-rose-500' : 'border-zinc-200 dark:border-zinc-800 focus:border-brand'
                  } rounded-xl px-3.5 py-2.5 text-xs text-zinc-800 dark:text-zinc-200 outline-none transition-all font-mono`}
                />
                <span className="text-[9px] text-zinc-400 font-sans block">Exatamente 7 dígitos numéricos</span>
                {formErrors.os && <p className="text-[9px] text-rose-500 font-semibold">{formErrors.os}</p>}
              </div>

              {/* Site */}
              <div className="space-y-1.5">
                <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-mono">
                  Site <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Ex: REC-01"
                  value={siteInput}
                  onChange={(e) => setSiteInput(e.target.value)}
                  className={`w-full bg-zinc-50 dark:bg-zinc-950 border ${
                    formErrors.site ? 'border-rose-500 focus:border-rose-500' : 'border-zinc-200 dark:border-zinc-800 focus:border-brand'
                  } rounded-xl px-3.5 py-2.5 text-xs text-zinc-800 dark:text-zinc-200 outline-none transition-all font-sans`}
                />
                {formErrors.site && <p className="text-[9px] text-rose-500 font-semibold">{formErrors.site}</p>}
              </div>

              {/* Data */}
              <div className="space-y-1.5">
                <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-mono">
                  Data <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Calendar className="absolute right-3.5 top-3 h-4 w-4 text-zinc-400 pointer-events-none" />
                  <input
                    type="date"
                    value={dataInput}
                    onChange={(e) => setDataInput(e.target.value)}
                    className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 focus:border-brand rounded-xl px-3.5 py-2.5 text-xs text-zinc-800 dark:text-zinc-200 outline-none transition-all font-sans"
                  />
                </div>
                {formErrors.data && <p className="text-[9px] text-rose-500 font-semibold">{formErrors.data}</p>}
              </div>

              {/* Parceiro */}
              <div className="space-y-1.5">
                <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-mono">
                  Parceiro Selecionado <span className="text-rose-500">*</span>
                </label>
                <select
                  value={parceiroIdInput}
                  onChange={(e) => setParceiroIdInput(e.target.value)}
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 focus:border-brand rounded-xl px-3.5 py-2.5 text-xs text-zinc-800 dark:text-zinc-200 outline-none transition-all font-sans cursor-pointer disabled:opacity-80"
                  disabled={currentUser.role === 'parceiro' && !!currentUser.parceiroId}
                >
                  {currentUser.role === 'parceiro' && currentUser.parceiroId ? (
                    suppliers.filter(s => s.id === currentUser.parceiroId).map(s => (
                      <option key={s.id} value={s.id}>{s.nome}</option>
                    ))
                  ) : (
                    <>
                      <option value="">Selecione um parceiro...</option>
                      {suppliers.map(s => (
                        <option key={s.id} value={s.id}>{s.nome}</option>
                      ))}
                    </>
                  )}
                </select>
                {formErrors.parceiro && <p className="text-[9px] text-rose-500 font-semibold">{formErrors.parceiro}</p>}
              </div>
            </div>

            {/* Location Autocomplete grid */}
            {!isRmrOrNoronhaTecnico && (
              <div className="bg-zinc-50/30 dark:bg-zinc-950/20 p-5 rounded-2xl border border-zinc-150 dark:border-zinc-850 space-y-4">
                <h3 className="text-[11px] font-black uppercase tracking-wider text-brand font-mono flex items-center gap-1.5">
                  <MapPin className="h-4 w-4 text-brand" />
                  <span>Localidade & Cálculo de Quilometragem</span>
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-5">
                  {/* Estado */}
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-mono">
                      Estado (Sigla) <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={estadoInput}
                      onChange={(e) => {
                        setEstadoInput(e.target.value);
                        setOrigemInput('');
                        setDestinoInput('');
                      }}
                      className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 focus:border-brand rounded-xl px-3.5 py-2.5 text-xs text-zinc-800 dark:text-zinc-200 outline-none transition-all font-sans cursor-pointer"
                    >
                      {Object.keys(BRAZIL_STATES_AND_CITIES).map(sigla => (
                        <option key={sigla} value={sigla}>{sigla}</option>
                      ))}
                    </select>
                  </div>

                  {/* Origem */}
                  <div className="space-y-1.5 relative">
                    <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-mono">
                      Cidade Origem <span className="text-rose-500">*</span> {loadingCities && <span className="text-[9px] text-brand lowercase font-normal">(carregando...)</span>}
                    </label>
                    <input
                      type="text"
                      placeholder="Origem..."
                      value={origemInput}
                      onChange={(e) => handleOrigemChange(e.target.value)}
                      onBlur={() => setTimeout(() => setShowOrigemDropdown(false), 200)}
                      className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 focus:border-brand rounded-xl px-3.5 py-2.5 text-xs text-zinc-800 dark:text-zinc-200 outline-none transition-all font-sans"
                    />
                    {showOrigemDropdown && (
                      <div className="absolute left-0 right-0 top-full mt-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-lg z-50 divide-y divide-zinc-100 dark:divide-zinc-850">
                        {origemSuggestions.map((city, i) => (
                          <button
                            key={i}
                            type="button"
                            onMouseDown={() => {
                              setOrigemInput(city);
                              setShowOrigemDropdown(false);
                            }}
                            className="w-full text-left px-3.5 py-2 text-xs hover:bg-zinc-100 dark:hover:bg-zinc-850 text-zinc-750 dark:text-zinc-300 font-sans transition-all cursor-pointer block"
                          >
                            {city}
                          </button>
                        ))}
                      </div>
                    )}
                    {formErrors.origem && <p className="text-[9px] text-rose-500 font-semibold">{formErrors.origem}</p>}
                  </div>

                  {/* Destino */}
                  <div className="space-y-1.5 relative">
                    <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-mono">
                      Cidade Destino <span className="text-rose-500">*</span> {loadingCities && <span className="text-[9px] text-brand lowercase font-normal">(carregando...)</span>}
                    </label>
                    <input
                      type="text"
                      placeholder="Destino..."
                      value={destinoInput}
                      onChange={(e) => handleDestinoChange(e.target.value)}
                      onBlur={() => setTimeout(() => setShowDestinoDropdown(false), 200)}
                      className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 focus:border-brand rounded-xl px-3.5 py-2.5 text-xs text-zinc-800 dark:text-zinc-200 outline-none transition-all font-sans"
                    />
                    {showDestinoDropdown && (
                      <div className="absolute left-0 right-0 top-full mt-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-lg z-50 divide-y divide-zinc-100 dark:divide-zinc-850">
                        {destinoSuggestions.map((city, i) => (
                          <button
                            key={i}
                            type="button"
                            onMouseDown={() => {
                              setDestinoInput(city);
                              setShowDestinoDropdown(false);
                            }}
                            className="w-full text-left px-3.5 py-2 text-xs hover:bg-zinc-100 dark:hover:bg-zinc-850 text-zinc-750 dark:text-zinc-300 font-sans transition-all cursor-pointer block"
                          >
                            {city}
                          </button>
                        ))}
                      </div>
                    )}
                    {formErrors.destino && <p className="text-[9px] text-rose-500 font-semibold">{formErrors.destino}</p>}
                  </div>

                  {/* Distância Total (Km) */}
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-mono">
                      KM Total (Ida/Volta) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="Km..."
                      value={customKmInput}
                      onChange={(e) => setCustomKmInput(e.target.value)}
                      className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 focus:border-brand rounded-xl px-3.5 py-2.5 text-xs text-zinc-800 dark:text-zinc-200 outline-none transition-all font-sans"
                    />
                  </div>
                </div>

                {/* Real-time calculated mileage stats banner */}
                <div className="bg-brand/5 dark:bg-zinc-900 p-3.5 rounded-xl border border-brand-border/10 dark:border-zinc-800 text-[11px] text-zinc-500 dark:text-zinc-400 flex flex-wrap gap-4 items-center justify-between font-mono">
                  <div className="flex items-center gap-1">
                    <Info className="h-4 w-4 text-brand" />
                    <span>Cálculos de Deslocamento Ajustáveis:</span>
                  </div>
                  <div className="flex gap-4">
                    <span>Distância Trajetória: <strong className="text-zinc-800 dark:text-zinc-100 font-black">{parseFloat(customKmInput) || 0} Km</strong></span>
                    <span>Raio Franquia Isento: <strong className="text-zinc-800 dark:text-zinc-100 font-black">{lpuSettings.raioQuilometragem || '0'} Km</strong></span>
                    <span>KM Reembolsável: <strong className="text-zinc-800 dark:text-zinc-100 font-black">{Math.max(0, (parseFloat(customKmInput) || 0) - (parseFloat(lpuSettings.raioQuilometragem) || 0))} Km</strong></span>
                  </div>
                </div>
              </div>
            )}

            {/* Financial information and LPU Activity selectors */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              
              {/* LPU Activity Selection */}
              <div className="space-y-1.5">
                <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-mono">
                  Atividade LPU Associada <span className="text-rose-500">*</span>
                </label>
                <select
                  value={atividadeLpuIdInput}
                  onChange={(e) => setAtividadeLpuIdInput(e.target.value)}
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 focus:border-brand rounded-xl px-3.5 py-2.5 text-xs text-zinc-800 dark:text-zinc-200 outline-none transition-all font-sans cursor-pointer"
                >
                  <option value="">Selecione a atividade LPU...</option>
                  {(() => {
                    const selectedPartnerId = currentUser.role === 'parceiro' && currentUser.parceiroId ? currentUser.parceiroId : parceiroIdInput;
                    const selectedPartner = suppliers.find(s => s.id === selectedPartnerId);
                    const partnerAreas = selectedPartner?.areasAtuacao || [];
                    
                    const filteredLpu = lpuItems.filter(item => {
                      if (item.area === 'Gestão') {
                        return currentUser.role === 'admin';
                      }
                      if (!selectedPartnerId) return true;
                      if (!item.area) return true;
                      return partnerAreas.includes(item.area);
                    });
                    
                    return filteredLpu.map(item => {
                      const label = isParceiro 
                        ? item.atividade 
                        : `${item.atividade} ${item.area ? `(${item.area})` : ''} - (${formatBRL(item.valor)})`;
                      return (
                        <option key={item.id} value={item.id}>
                          {label}
                        </option>
                      );
                    });
                  })()}
                </select>
                {formErrors.atividadeLpu && <p className="text-[9px] text-rose-500 font-semibold">{formErrors.atividadeLpu}</p>}
              </div>

              {/* Material Description text input */}
              <div className="space-y-1.5">
                <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-mono">
                  Descrição do Material
                </label>
                <input
                  type="text"
                  placeholder="Ex: Conector, Fita fusão, etc..."
                  value={materialInput}
                  onChange={(e) => setMaterialInput(e.target.value)}
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 focus:border-brand rounded-xl px-3.5 py-2.5 text-xs text-zinc-800 dark:text-zinc-200 outline-none transition-all font-sans"
                />
              </div>

              {/* Valor Material manual currency input */}
              <div className="space-y-1.5">
                <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-mono">
                  Valor Material (R$)
                </label>
                <input
                  type="text"
                  placeholder="Ex: 150,00"
                  value={valorMaterialInput}
                  onChange={(e) => setValorMaterialInput(e.target.value.replace(/[^0-9,]/g, ''))}
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 focus:border-brand rounded-xl px-3.5 py-2.5 text-xs text-zinc-800 dark:text-zinc-200 outline-none transition-all font-mono"
                />
              </div>
            </div>

            {/* Campo de Observação */}
            <div className="space-y-1.5">
              <label className="block text-[10px] font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-mono">
                Observações da Atividade
              </label>
              <textarea
                placeholder="Insira detalhes adicionais sobre o serviço, observações técnicas, ou notas de campo..."
                value={observacaoInput}
                onChange={(e) => setObservacaoInput(e.target.value)}
                rows={3}
                className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 focus:border-brand rounded-xl px-3.5 py-2.5 text-xs text-zinc-800 dark:text-zinc-200 outline-none transition-all font-sans resize-y min-h-[85px]"
              />
            </div>

            {/* Upload de Imagens */}
            <div className={`bg-zinc-50/30 dark:bg-zinc-950/20 p-5 rounded-2xl border ${formErrors.images ? 'border-rose-400/80 dark:border-rose-900/60 shadow-xs shadow-rose-100/10' : 'border-zinc-150 dark:border-zinc-850'} space-y-3`}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                <h3 className="text-[10px] font-black uppercase tracking-wider text-brand font-mono flex items-center gap-1.5">
                  <FileDown className="h-4 w-4 text-brand" />
                  <span>Anexar Imagens / Comprovantes {currentUser.role !== 'admin' && <span className="text-rose-500">*</span>}</span>
                </h3>
                {formErrors.images && (
                  <span className="text-[10px] text-rose-500 font-bold font-mono animate-pulse">{formErrors.images}</span>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Drag and Drop Zone */}
                <div className="border-2 border-dashed border-zinc-200 dark:border-zinc-800 hover:border-brand dark:hover:border-brand/50 rounded-2xl p-4 transition-all flex flex-col items-center justify-center text-center cursor-pointer bg-zinc-50/50 dark:bg-zinc-950/20 relative group min-h-[110px]">
                  <input
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <div className="space-y-1 select-none pointer-events-none">
                    <Plus className="h-6 w-6 text-zinc-400 group-hover:text-brand mx-auto transition-colors" />
                    <p className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                      Clique ou arraste imagens aqui
                    </p>
                    <p className="text-[10px] text-zinc-400">
                      PNG, JPG (Comprimido automaticamente)
                    </p>
                  </div>
                </div>

                {/* Preview list */}
                <div className="flex flex-wrap gap-2.5 max-h-[110px] overflow-y-auto p-1.5 border border-zinc-150 dark:border-zinc-850 rounded-2xl bg-zinc-50/20">
                  {uploadedImages.length === 0 ? (
                    <div className="w-full h-full flex items-center justify-center text-[10px] text-zinc-400 italic">
                      Nenhuma imagem anexada.
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {uploadedImages.map((img, idx) => (
                        <div key={idx} className="relative w-16 h-16 rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-800 group shadow-xs">
                          <img src={img} alt={`anexo-${idx}`} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          <button
                            type="button"
                            onClick={() => removeUploadedImage(idx)}
                            className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white cursor-pointer"
                          >
                            <X className="h-4 w-4 text-white" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Calculations and totals display row */}
            <div className="p-5 rounded-2xl bg-zinc-50/70 dark:bg-zinc-950/40 border border-zinc-200 dark:border-zinc-800/80 flex flex-col md:flex-row gap-6 items-center justify-between">
              <div className={`grid grid-cols-2 ${isRmrOrNoronhaTecnico ? 'md:grid-cols-3' : 'md:grid-cols-4'} gap-6 w-full md:w-auto`}>
                {!isRmrOrNoronhaTecnico && (
                  <div className="space-y-0.5">
                    <span className="text-[9px] font-bold text-zinc-450 dark:text-zinc-500 uppercase font-sans block">Valor Deslocamento KM</span>
                    <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200 font-mono">{formatBRL(valorKmCalculated)}</span>
                  </div>
                )}
                <div className="space-y-0.5">
                  <span className="text-[9px] font-bold text-zinc-450 dark:text-zinc-500 uppercase font-sans block">Valor Material</span>
                  <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200 font-mono">{formatBRL(valorMaterialFloat)}</span>
                </div>
                <div className="space-y-0.5">
                  <span className="text-[9px] font-bold text-zinc-450 dark:text-zinc-500 uppercase font-sans block">Valor Atividade LPU</span>
                  <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200 font-mono">{formatBRL(valorAtividadeCalculated)}</span>
                </div>
                <div className="space-y-0.5">
                  <span className="text-[9px] font-black text-brand uppercase font-sans block">Valor Total Consolidado</span>
                  <span className="text-sm font-black text-emerald-600 dark:text-emerald-400 font-mono">{formatBRL(valorTotalCalculated)}</span>
                </div>
              </div>

              <div className="flex gap-3 w-full md:w-auto shrink-0 justify-end">
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-5 py-2.5 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-750 text-zinc-700 dark:text-zinc-300 text-xs font-bold rounded-xl cursor-pointer transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-brand hover:opacity-95 text-white text-xs font-black uppercase tracking-wider rounded-xl cursor-pointer transition-all flex items-center gap-1.5 shadow-md"
                >
                  <Plus className="h-4 w-4" />
                  <span>{editingActivityId ? 'ATUALIZAR REGISTRO' : 'SALVAR REGISTRO'}</span>
                </button>
              </div>
            </div>

          </form>
        </div>
      )}

      {/* Main List & Table Operations Panel */}
      <div className="bg-white dark:bg-zinc-900 p-6 rounded-3xl border border-zinc-200/85 dark:border-zinc-800/85 shadow-xs space-y-5">
        
        {/* Search, Filter & Report Operations Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-wrap gap-3.5 items-center w-full md:w-auto">
            {/* Select filter of partners (suppliers) / Parceiros - Refined & Polished */}
            <div className="flex items-center gap-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-850 rounded-2xl px-4 py-2 w-full md:w-80 shadow-xs focus-within:ring-2 focus-within:ring-brand/20 focus-within:border-brand transition-all">
              <Users className="h-4.5 w-4.5 text-zinc-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="block text-[9px] font-bold text-zinc-400 uppercase tracking-wider font-mono">Filtrar por Parceiro</span>
                <div className="relative">
                  <select
                    id="partner-filter-dropdown"
                    value={selectedPartnerFilter}
                    onChange={(e) => setSelectedPartnerFilter(e.target.value)}
                    disabled={currentUser.role === 'parceiro' && !!currentUser.parceiroId}
                    className="w-full bg-transparent text-xs font-bold text-zinc-800 dark:text-zinc-100 outline-none cursor-pointer appearance-none disabled:opacity-80 pr-6 pt-0.5"
                  >
                    {currentUser.role === 'parceiro' && currentUser.parceiroId ? (
                      suppliers.filter(s => s.id === currentUser.parceiroId).map(s => (
                        <option key={s.id} value={s.id} className="bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200">{s.nome}</option>
                      ))
                    ) : (
                      <>
                        <option value="all" className="bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200">Todos os Parceiros</option>
                        {suppliers.map(s => (
                          <option key={s.id} value={s.id} className="bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200">{s.nome}</option>
                        ))}
                      </>
                    )}
                  </select>
                  <ChevronDown className="absolute right-0 top-1.5 h-3 w-3 text-zinc-400 pointer-events-none" />
                </div>
              </div>
            </div>

            {/* Active partner filter badge if selected */}
            {selectedPartnerFilter !== 'all' && currentUser.role !== 'parceiro' && (
              <button
                onClick={() => setSelectedPartnerFilter('all')}
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-brand/10 hover:bg-brand/15 text-brand text-[11px] font-bold rounded-full transition-all cursor-pointer border border-brand/20 active:scale-95"
              >
                <span>Limpar Filtro</span>
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          {/* Registrar Atividade Button */}
          <div className="flex gap-2.5 self-end md:self-auto shrink-0">
            {canWrite && (
              <button
                onClick={() => setShowForm(!showForm)}
                className="flex items-center gap-2 px-5 py-2 bg-brand hover:bg-brand/90 text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-sm select-none active:scale-95 duration-150 shrink-0 uppercase"
              >
                <Plus className="h-4 w-4" />
                <span>REGISTRAR ATIVIDADE</span>
                {showForm ? <X className="h-3.5 w-3.5 ml-1" /> : null}
              </button>
            )}
          </div>
        </div>

        {/* Database records list viewport */}
        <div className="overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/10 dark:bg-zinc-950/10">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-zinc-50/80 dark:bg-zinc-950/40 border-b border-zinc-250 dark:border-zinc-800 text-[10px] font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-mono">
                  <th className="px-4.5 py-3">O.S</th>
                  <th className="px-4.5 py-3">Site</th>
                  <th className="px-4.5 py-3">Data</th>
                  <th className="px-4.5 py-3">Estado</th>
                  <th className="px-4.5 py-3">Origem</th>
                  <th className="px-4.5 py-3">Destino</th>
                  <th className="px-4.5 py-3">Atividade LPU</th>
                  <th className="px-4.5 py-3">Material</th>
                  <th className="px-4.5 py-3 text-right">KM Total</th>
                  <th className="px-4.5 py-3 text-right">Valor KM</th>
                  <th className="px-4.5 py-3 text-right">Val Material</th>
                  <th className="px-4.5 py-3 text-right">Val Atividade</th>
                  <th className="px-4.5 py-3 text-right">Valor Total</th>
                  <th className="px-4.5 py-3">Parceiro</th>
                  <th className="px-4.5 py-3 text-center">Status</th>
                  <th className="px-4.5 py-3 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-150 dark:divide-zinc-800/60">
                {filteredActivities.length === 0 ? (
                  <tr>
                    <td colSpan={16} className="p-12 text-center text-xs text-zinc-500 italic font-sans">
                      Nenhuma atividade operacional encontrada para os filtros selecionados.
                    </td>
                  </tr>
                ) : (
                  filteredActivities.map((act) => (
                    <tr key={act.id} className="hover:bg-brand/5 dark:hover:bg-zinc-900/40 transition-colors">
                      <td className="px-4.5 py-3.5 text-xs font-black text-zinc-900 dark:text-white font-mono">{act.id}</td>
                      <td className="px-4.5 py-3.5 text-xs font-bold text-zinc-700 dark:text-zinc-300 font-sans">{act.site}</td>
                      <td className="px-4.5 py-3.5 text-xs text-zinc-655 dark:text-zinc-400 font-sans">
                        {act.data ? new Date(act.data + 'T00:00:00').toLocaleDateString('pt-BR') : '-'}
                      </td>
                      <td className="px-4.5 py-3.5 text-xs text-zinc-600 dark:text-zinc-400 font-mono">{act.estado}</td>
                      <td className="px-4.5 py-3.5 text-xs text-zinc-600 dark:text-zinc-400 font-sans truncate max-w-[120px]" title={act.origem}>{act.origem}</td>
                      <td className="px-4.5 py-3.5 text-xs text-zinc-600 dark:text-zinc-400 font-sans truncate max-w-[120px]" title={act.destino}>{act.destino}</td>
                      <td className="px-4.5 py-3.5 text-xs font-semibold text-zinc-800 dark:text-zinc-100 font-sans truncate max-w-[150px]" title={act.atividadeLpuNome}>
                        {act.atividadeLpuNome}
                      </td>
                      <td className="px-4.5 py-3.5 text-xs text-zinc-500 dark:text-zinc-400 font-sans truncate max-w-[120px]" title={act.material || '-'}>
                        {act.material || '-'}
                      </td>
                      <td className="px-4.5 py-3.5 text-xs text-right font-mono text-zinc-700 dark:text-zinc-300">{act.kmTotal} Km</td>
                      <td className="px-4.5 py-3.5 text-xs text-right font-mono text-zinc-700 dark:text-zinc-300">{formatBRL(act.valorKm)}</td>
                      <td className="px-4.5 py-3.5 text-xs text-right font-mono text-zinc-700 dark:text-zinc-300">{formatBRL(act.valorMaterial)}</td>
                      <td className="px-4.5 py-3.5 text-xs text-right font-mono text-zinc-700 dark:text-zinc-300">{formatBRL(act.valorAtividade)}</td>
                      <td className="px-4.5 py-3.5 text-xs text-right font-black text-emerald-600 dark:text-emerald-400 font-mono">
                        {formatBRL(act.valorTotal)}
                      </td>
                      <td className="px-4.5 py-3.5 text-xs font-sans truncate max-w-[130px]" title={act.parceiroNome}>
                        {currentUser.role !== 'parceiro' ? (
                          <button
                            onClick={() => setSelectedPartnerFilter(act.parceiroId)}
                            className="text-left font-bold text-brand hover:underline hover:text-brand/80 cursor-pointer transition-colors"
                            title={`Filtrar atividades do parceiro ${act.parceiroNome}`}
                          >
                            {act.parceiroNome}
                          </button>
                        ) : (
                          <span className="font-bold text-zinc-600 dark:text-zinc-300">{act.parceiroNome}</span>
                        )}
                      </td>
                      <td className="px-4.5 py-3.5 text-center whitespace-nowrap">
                        {act.status === 'validada' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/10 text-emerald-600 dark:bg-emerald-950/20 dark:text-emerald-400 border border-emerald-200/50 dark:border-emerald-900/30">
                            Validada
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500/10 text-amber-600 dark:bg-amber-950/20 dark:text-amber-400 border border-amber-200/50 dark:border-amber-900/30">
                            Pendente
                          </span>
                        )}
                      </td>
                      <td className="px-4.5 py-3.5 text-center shrink-0">
                        <div className="flex items-center justify-center gap-1.5">
                          {isAdmin && (
                            <button
                              onClick={() => handleValidateActivity(act.id, act.status || 'pendente')}
                              className={`p-1.5 rounded-lg cursor-pointer transition-all ${
                                act.status === 'validada'
                                  ? 'text-amber-500 hover:bg-amber-500/10'
                                  : 'text-emerald-600 hover:bg-emerald-500/10'
                              }`}
                              title={act.status === 'validada' ? 'Remover aceite (Marcar como Pendente)' : 'Dar aceite (Validar Atividade)'}
                            >
                              <CheckCircle className="h-4.5 w-4.5" />
                            </button>
                          )}
                          <button
                            onClick={() => setSelectedViewActivity(act)}
                            className="p-1.5 text-zinc-400 dark:text-zinc-500 hover:text-cyan-500 hover:bg-cyan-500/10 rounded-lg cursor-pointer transition-all"
                            title="Visualizar Informações da Atividade"
                          >
                            <Eye className="h-4.5 w-4.5" />
                          </button>
                          {(isAdmin || (currentUser.role === 'parceiro' && act.status !== 'validada' && act.createdBy?.toLowerCase().trim() === currentUser.email?.toLowerCase().trim())) && (
                            <>
                              <button
                                onClick={() => handleStartEdit(act)}
                                className="p-1.5 text-zinc-400 dark:text-zinc-500 hover:text-brand hover:bg-brand/10 rounded-lg cursor-pointer transition-all"
                                title="Editar Atividade"
                              >
                                <Edit2 className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => triggerDelete(act)}
                                className="p-1.5 text-zinc-400 dark:text-zinc-555 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/20 rounded-lg cursor-pointer transition-all"
                                title="Remover Registro de Atividade"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* Confirmation Modal for Deleting Activity */}
      {activityToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3.5xl max-w-sm w-full p-6 shadow-2xl animate-slide-in">
            <div className="flex items-center gap-3 text-rose-600 pb-3 border-b border-zinc-150 dark:border-zinc-800">
              <AlertTriangle className="h-5 w-5" />
              <h3 className="font-sans font-black text-sm text-zinc-900 dark:text-white uppercase tracking-wider">Confirmar Exclusão</h3>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-4 leading-relaxed font-sans">
              Você tem certeza que deseja realmente remover o registro de atividade da <strong className="text-zinc-800 dark:text-zinc-200">O.S {activityToDelete.id}</strong> ({activityToDelete.site})? Esta ação é irreversível e removerá os dados de faturamento do sistema.
            </p>
            <div className="flex items-center justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={() => setActivityToDelete(null)}
                className="px-4 py-2 text-xs font-bold bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-750 text-zinc-655 dark:text-zinc-300 rounded-xl cursor-pointer transition-colors"
               >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmDeleteActivity}
                className="px-5 py-2 text-xs font-black uppercase tracking-wider bg-rose-600 hover:bg-rose-750 text-white rounded-xl cursor-pointer transition-colors shadow-xs"
              >
                Remover
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Selected Activity Details Modal */}
      {selectedViewActivity && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3.5xl max-w-2xl w-full p-6 md:p-8 shadow-2xl animate-slide-in max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-zinc-150 dark:border-zinc-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-cyan-500/10 dark:bg-cyan-500/20 text-cyan-600 dark:text-cyan-450 rounded-xl">
                  <Eye className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-sans font-black text-sm text-zinc-900 dark:text-white uppercase tracking-wider">
                    Detalhes da Atividade
                  </h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] text-zinc-400 font-mono">O.S #{selectedViewActivity.id}</span>
                    {selectedViewActivity.status === 'validada' ? (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider bg-emerald-500/10 text-emerald-600 dark:bg-emerald-950/20 dark:text-emerald-400 border border-emerald-200/50 dark:border-emerald-900/30">
                        Validada
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider bg-amber-500/10 text-amber-600 dark:bg-amber-950/20 dark:text-amber-400 border border-amber-200/50 dark:border-amber-900/30">
                        Pendente
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <button 
                onClick={() => {
                  setSelectedViewActivity(null);
                  setSelectedImageFull(null);
                }}
                className="text-zinc-400 hover:text-zinc-650 dark:hover:text-zinc-300 p-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-xl cursor-pointer transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-6 space-y-6">
              {/* Main Details Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-zinc-50 dark:bg-zinc-950/30 p-4 rounded-2.5xl border border-zinc-150 dark:border-zinc-850">
                <div>
                  <span className="block text-[9px] text-zinc-400 font-bold uppercase tracking-wider font-mono">Site</span>
                  <span className="text-xs font-black text-zinc-850 dark:text-zinc-100 font-sans">{selectedViewActivity.site}</span>
                </div>
                <div>
                  <span className="block text-[9px] text-zinc-400 font-bold uppercase tracking-wider font-mono">Data</span>
                  <span className="text-xs font-bold text-zinc-700 dark:text-zinc-350 font-sans">
                    {selectedViewActivity.data ? new Date(selectedViewActivity.data + 'T00:00:00').toLocaleDateString('pt-BR') : '-'}
                  </span>
                </div>
                <div>
                  <span className="block text-[9px] text-zinc-400 font-bold uppercase tracking-wider font-mono">Estado</span>
                  <span className="text-xs font-bold text-zinc-700 dark:text-zinc-350 font-mono">{selectedViewActivity.estado}</span>
                </div>
                <div>
                  <span className="block text-[9px] text-zinc-400 font-bold uppercase tracking-wider font-mono">Parceiro</span>
                  <span className="text-xs font-black text-zinc-800 dark:text-zinc-200 font-sans">{selectedViewActivity.parceiroNome}</span>
                </div>
              </div>

              {/* Route Details */}
              <div className="space-y-2">
                <h4 className="text-[10px] font-black uppercase tracking-wider text-zinc-400 font-mono">Logística & Deslocamento</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="border border-zinc-150 dark:border-zinc-800/80 p-3.5 rounded-2xl bg-white dark:bg-zinc-900/50">
                    <span className="block text-[9px] text-zinc-400 font-bold uppercase tracking-wider font-mono">Origem</span>
                    <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200">{selectedViewActivity.origem}</span>
                  </div>
                  <div className="border border-zinc-150 dark:border-zinc-800/80 p-3.5 rounded-2xl bg-white dark:bg-zinc-900/50">
                    <span className="block text-[9px] text-zinc-400 font-bold uppercase tracking-wider font-mono">Destino</span>
                    <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200">{selectedViewActivity.destino}</span>
                  </div>
                  <div className="border border-zinc-150 dark:border-zinc-800/80 p-3.5 rounded-2xl bg-white dark:bg-zinc-900/50">
                    <span className="block text-[9px] text-zinc-400 font-bold uppercase tracking-wider font-mono">Quilometragem Total</span>
                    <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200 font-mono">{selectedViewActivity.kmTotal} Km</span>
                  </div>
                </div>
              </div>

              {/* Financial Breakdown */}
              <div className="space-y-2">
                <h4 className="text-[10px] font-black uppercase tracking-wider text-zinc-400 font-mono">Detalhamento de Faturamento</h4>
                <div className="divide-y divide-zinc-150 dark:divide-zinc-800/60 border border-zinc-200 dark:border-zinc-800 rounded-2.5xl overflow-hidden">
                  <div className="flex justify-between items-center px-4 py-3 bg-zinc-50/55 dark:bg-zinc-950/10 text-xs">
                    <span className="text-zinc-550 dark:text-zinc-400 font-medium">Atividade LPU: <strong className="text-zinc-700 dark:text-zinc-300 font-semibold">{selectedViewActivity.atividadeLpuNome}</strong></span>
                    <span className="font-mono font-bold text-zinc-800 dark:text-zinc-200">{formatBRL(selectedViewActivity.valorAtividade)}</span>
                  </div>
                  <div className="flex justify-between items-center px-4 py-3 bg-zinc-50/55 dark:bg-zinc-950/10 text-xs">
                    <span className="text-zinc-550 dark:text-zinc-400 font-medium">Reembolso de Deslocamento KM</span>
                    <span className="font-mono font-bold text-zinc-800 dark:text-zinc-200">{formatBRL(selectedViewActivity.valorKm)}</span>
                  </div>
                  <div className="flex justify-between items-center px-4 py-3 bg-zinc-50/55 dark:bg-zinc-950/10 text-xs">
                    <span className="text-zinc-550 dark:text-zinc-400 font-medium">Material: <strong className="text-zinc-700 dark:text-zinc-300 font-semibold">{selectedViewActivity.material || 'Nenhum material cadastrado'}</strong></span>
                    <span className="font-mono font-bold text-zinc-800 dark:text-zinc-200">{formatBRL(selectedViewActivity.valorMaterial)}</span>
                  </div>
                  <div className="flex justify-between items-center px-4.5 py-4 bg-brand/5 dark:bg-brand/10 text-sm font-black">
                    <span className="text-zinc-800 dark:text-white uppercase tracking-wider font-mono text-[11px]">Valor Consolidado</span>
                    <span className="font-mono text-emerald-600 dark:text-emerald-400 text-base">{formatBRL(selectedViewActivity.valorTotal)}</span>
                  </div>
                </div>
              </div>

              {/* Field Observações */}
              {selectedViewActivity.observacao && (
                <div className="space-y-2">
                  <h4 className="text-[10px] font-black uppercase tracking-wider text-zinc-400 font-mono">Observação / Notas de Campo</h4>
                  <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-950/30 border border-zinc-150 dark:border-zinc-850 text-xs text-zinc-700 dark:text-zinc-300 whitespace-pre-line leading-relaxed font-sans">
                    {selectedViewActivity.observacao}
                  </div>
                </div>
              )}

              {/* Attached Images */}
              <div className="space-y-2">
                <h4 className="text-[10px] font-black uppercase tracking-wider text-zinc-400 font-mono">Imagens / Comprovantes Anexados</h4>
                {!selectedViewActivity.images || selectedViewActivity.images.length === 0 ? (
                  <div className="p-6 text-center text-xs text-zinc-450 dark:text-zinc-500 italic border border-dashed border-zinc-200 dark:border-zinc-800 rounded-2.5xl bg-zinc-50/30 dark:bg-zinc-950/10">
                    Nenhuma imagem anexada a esta atividade.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {selectedViewActivity.images.map((img, idx) => (
                      <div 
                        key={idx} 
                        onClick={() => setSelectedImageFull(img)}
                        className="relative aspect-square rounded-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800 group shadow-sm cursor-zoom-in hover:brightness-95 transition-all"
                      >
                        <img src={img} alt={`Anexo ${idx + 1}`} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                          <span className="text-[10px] font-bold uppercase tracking-wider bg-black/60 px-2.5 py-1 rounded-lg">Clique para ampliar</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end mt-8 pt-4 border-t border-zinc-150 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => {
                  setSelectedViewActivity(null);
                  setSelectedImageFull(null);
                }}
                className="px-6 py-2.5 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-750 text-zinc-750 dark:text-zinc-250 text-xs font-bold rounded-xl cursor-pointer transition-all"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fullscreen Image Preview */}
      {selectedImageFull && (
        <div 
          className="fixed inset-0 z-55 flex items-center justify-center bg-black/90 p-4 backdrop-blur-md animate-fade-in cursor-zoom-out"
          onClick={() => setSelectedImageFull(null)}
        >
          <div className="relative max-w-4xl w-full max-h-[90vh] flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
            <img src={selectedImageFull} alt="Visualização em tamanho real" className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl" referrerPolicy="no-referrer" />
            <button 
              onClick={() => setSelectedImageFull(null)}
              className="absolute top-4 right-4 text-white hover:text-zinc-300 p-2 bg-black/50 hover:bg-black/80 rounded-full cursor-pointer transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
