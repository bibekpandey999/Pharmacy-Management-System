import React, { useState, useEffect, useMemo } from 'react';
import {
  Database,
  Search,
  Plus,
  AlertTriangle,
  Calendar,
  X,
  Pencil,
  Trash2,
  Loader2,
  PackageX,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { TRANSLATIONS } from '../translations';

// ==========================================
// CONFIG
// ==========================================

const API_BASE = import.meta.env.VITE_API_URL || 'https://pharmacy-management-system-ni9u.onrender.com';
const INVENTORY_URL = `${API_BASE}/api/inventory`;

const CATEGORY_OPTIONS = ['Tablet', 'Capsule', 'Syrup', 'Injection', 'Ointment', 'Other'];

// Helper to safely read the logged-in pharmacy's ID from localStorage.
// Login stores the whole user object as a JSON string under the key "user":
// {"_id":"6a4d428e8f7fb3fb6111b927","id":"9898","pharmacyName":"Butwal","isAdmin":false}
// The pharmacy's ID to filter inventory by is the "id" field ("9898"), not "_id".
const getLoggedInPharmacyId = (): string => {
  try {
    const raw = localStorage.getItem('user');
    if (!raw) return '';
    const parsed = JSON.parse(raw);
    return parsed?.id ? String(parsed.id) : '';
  } catch {
    return '';
  }
};

// ==========================================
// TYPES (shape returned/expected by the Express + MongoDB backend)
// ==========================================

interface MedicineItem {
  _id: string;
  id: string;
  pharmacyId: string;
  medicineBrandName: string;
  genericMoleculeName: string;
  categoryType: string;
  dosageStrength: string;
  purchaseUnitCost: number;
  retailPrice: number;
  initialStockQty: number;
  reorderThresholdAlert: number;
  skuBarcodeReference: string;
  expirationDate: string | null;
  supplierDistributor: string;
  createdAt: string;
}

interface MedicineFormState {
  pharmacyId: string;
  medicineBrandName: string;
  genericMoleculeName: string;
  categoryType: string;
  dosageStrength: string;
  purchaseUnitCost: string;
  retailPrice: string;
  initialStockQty: string;
  reorderThresholdAlert: string;
  skuBarcodeReference: string;
  expirationDate: string;
  supplierDistributor: string;
}

const EMPTY_FORM: MedicineFormState = {
  pharmacyId: '',
  medicineBrandName: '',
  genericMoleculeName: '',
  categoryType: 'Tablet',
  dosageStrength: '',
  purchaseUnitCost: '',
  retailPrice: '',
  initialStockQty: '',
  reorderThresholdAlert: '10',
  skuBarcodeReference: '',
  expirationDate: '',
  supplierDistributor: '',
};

interface InventoryManagerProps {
  lang: 'en' | 'ne';
  currentUserRole: 'Receptionist' | 'Pharmacist' | 'Owner';
}

type ToastState = { message: string; type: 'success' | 'error' } | null;

export default function InventoryManager({ lang, currentUserRole }: InventoryManagerProps) {
  const t = TRANSLATIONS[lang];
  const canEditOrDelete = currentUserRole === 'Pharmacist' || currentUserRole === 'Owner';

  // Data state
  const [medicines, setMedicines] = useState<MedicineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  // List search & filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [stockFilter, setStockFilter] = useState<'All' | 'Low' | 'Expiring'>('All');

  // Selected item detail
  const [selectedMedicine, setSelectedMedicine] = useState<MedicineItem | null>(null);

  // Add / Edit modal
  const [showFormModal, setShowFormModal] = useState(false);
  const [formMode, setFormMode] = useState<'add' | 'edit'>('add');
  const [formData, setFormData] = useState<MedicineFormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  // Delete confirmation
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Toast
  const [toast, setToast] = useState<ToastState>(null);
  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 3000);
  };

  // ==========================================
  // DATA FETCHING
  // ==========================================

  const fetchMedicines = async () => {
    setLoading(true);
    setLoadError('');

    // Get the pharmacy ID from the logged-in user object in localStorage
    const pharmacyId = getLoggedInPharmacyId();

    if (!pharmacyId) {
      setLoadError(
        lang === 'en'
          ? 'No pharmacy ID found. Please log in again.'
          : 'फार्मेसी आईडी फेला परेन। कृपया फेरि लगइन गर्नुहोस्।'
      );
      setMedicines([]);
      setLoading(false);
      return;
    }

    try {
      // Ask the backend to filter by pharmacyId directly (server does the scoping)
      const url = `${INVENTORY_URL}?pharmacyId=${encodeURIComponent(pharmacyId)}`;
      const res = await fetch(url);
      const result = await res.json();

      if (!res.ok || !result.success) {
        throw new Error(result.message || 'Failed to load inventory.');
      }

      // Belt-and-suspenders: also filter client-side in case the backend
      // route hasn't been updated yet to respect ?pharmacyId=
      const scoped = (result.data || []).filter(
        (m: MedicineItem) => String(m.pharmacyId || '').trim() === String(pharmacyId).trim()
      );

      setMedicines(scoped);
    } catch (err: any) {
      setLoadError(err.message || 'Could not connect to the server.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMedicines();
  }, []);

  // ==========================================
  // FILTERING (derived, no extra effect needed)
  // ==========================================

  const filteredMeds = useMemo(() => {
    let result = medicines;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (m) =>
          m.medicineBrandName?.toLowerCase().includes(q) ||
          m.genericMoleculeName?.toLowerCase().includes(q) ||
          m.skuBarcodeReference?.toLowerCase().includes(q)
      );
    }

    if (selectedCategory !== 'All') {
      result = result.filter((m) => m.categoryType === selectedCategory);
    }

    if (stockFilter === 'Low') {
      result = result.filter((m) => m.initialStockQty <= m.reorderThresholdAlert);
    } else if (stockFilter === 'Expiring') {
      const today = new Date();
      const limit = new Date();
      limit.setDate(today.getDate() + 90);
      result = result.filter((m) => {
        if (!m.expirationDate) return false;
        const exp = new Date(m.expirationDate);
        return exp <= limit;
      });
    }

    return result;
  }, [searchQuery, selectedCategory, stockFilter, medicines]);

  // ==========================================
  // FORM HELPERS
  // ==========================================

  const handleFormChange = (field: keyof MedicineFormState, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const openAddModal = () => {
    setFormMode('add');
    setEditingId(null);
    // Pharmacy ID is auto-filled from the logged-in session, not typed by the user
    setFormData({ ...EMPTY_FORM, pharmacyId: getLoggedInPharmacyId() });
    setFormError('');
    setShowFormModal(true);
  };

  const openEditModal = (med: MedicineItem) => {
    setFormMode('edit');
    setEditingId(med._id);
    setFormData({
      pharmacyId: getLoggedInPharmacyId(), // always lock to current pharmacy, ignore whatever was on the record
      medicineBrandName: med.medicineBrandName || '',
      genericMoleculeName: med.genericMoleculeName || '',
      categoryType: med.categoryType || 'Tablet',
      dosageStrength: med.dosageStrength || '',
      purchaseUnitCost: med.purchaseUnitCost != null ? String(med.purchaseUnitCost) : '',
      retailPrice: med.retailPrice != null ? String(med.retailPrice) : '',
      initialStockQty: med.initialStockQty != null ? String(med.initialStockQty) : '',
      reorderThresholdAlert: med.reorderThresholdAlert != null ? String(med.reorderThresholdAlert) : '10',
      skuBarcodeReference: med.skuBarcodeReference || '',
      expirationDate: med.expirationDate ? med.expirationDate.slice(0, 10) : '',
      supplierDistributor: med.supplierDistributor || '',
    });
    setFormError('');
    setShowFormModal(true);
  };

  const closeModal = () => {
    setShowFormModal(false);
    setFormData(EMPTY_FORM);
    setEditingId(null);
    setFormError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.medicineBrandName.trim() || !formData.expirationDate) {
      setFormError('Brand name and expiration date are required.');
      return;
    }

    const currentPharmacyId = getLoggedInPharmacyId();
    if (!currentPharmacyId) {
      setFormError(
        lang === 'en'
          ? 'No pharmacy ID found in your session. Please log in again.'
          : 'तपाईंको सत्रमा फार्मेसी आईडी फेला परेन। कृपया फेरि लगइन गर्नुहोस्।'
      );
      return;
    }

    setSubmitting(true);
    setFormError('');

    const payload = {
      pharmacyId: currentPharmacyId, // always taken fresh from localStorage, never trusted from form state
      medicineBrandName: formData.medicineBrandName.trim(),
      genericMoleculeName: formData.genericMoleculeName.trim() || 'Unknown Molecule',
      categoryType: formData.categoryType,
      dosageStrength: formData.dosageStrength.trim() || 'N/A',
      purchaseUnitCost: Number(formData.purchaseUnitCost) || 0,
      retailPrice: Number(formData.retailPrice) || 0,
      initialStockQty: Number(formData.initialStockQty) || 0,
      reorderThresholdAlert: Number(formData.reorderThresholdAlert) || 10,
      skuBarcodeReference: formData.skuBarcodeReference.trim(),
      expirationDate: formData.expirationDate,
      supplierDistributor: formData.supplierDistributor.trim() || 'Unknown Supplier',
    };

    try {
      const url = formMode === 'edit' && editingId ? `${INVENTORY_URL}/${editingId}` : INVENTORY_URL;
      const method = formMode === 'edit' ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await res.json();

      if (!res.ok || !result.success) {
        throw new Error(result.message || 'Request failed.');
      }

      await fetchMedicines();
      showToast(
        formMode === 'edit' ? 'Medicine updated.' : 'Medicine added to inventory.',
        'success'
      );
      closeModal();
    } catch (err: any) {
      setFormError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ==========================================
  // DELETE
  // ==========================================

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const res = await fetch(`${INVENTORY_URL}/${id}`, { method: 'DELETE' });
      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.message || 'Delete failed.');
      }
      setMedicines((prev) => prev.filter((m) => m._id !== id));
      if (selectedMedicine?._id === id) setSelectedMedicine(null);
      showToast('Medicine deleted.', 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to delete medicine.', 'error');
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  };

  // ==========================================
  // RENDER HELPERS
  // ==========================================

  const daysToExpiry = (dateStr: string | null) => {
    if (!dateStr) return null;
    const exp = new Date(dateStr);
    return Math.ceil((exp.getTime() - new Date().getTime()) / (1000 * 3600 * 24));
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6" id="inventory-root">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-5 right-5 z-[60] flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-xs font-bold text-white animate-fade-in ${
            toast.type === 'success' ? 'bg-teal-600' : 'bg-red-600'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <XCircle className="h-4 w-4" />
          )}
          {toast.message}
        </div>
      )}

      {/* LEFT COLUMN: Inventory Grid List & Filter bar */}
      <div
        className="lg:col-span-8 bg-white rounded-xl border border-gray-200 shadow-xs p-5 flex flex-col space-y-4"
        id="inventory-list-card"
      >
        <div className="flex flex-col sm:flex-row justify-between sm:items-center pb-2 border-b border-gray-100 gap-3">
          <h2 className="text-lg font-bold text-gray-900 tracking-tight flex items-center gap-2">
            <Database className="h-5 w-5 text-teal-600" />
            {t.inventoryManagement}
          </h2>

          <button
            onClick={openAddModal}
            className="py-1.5 px-3 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs"
          >
            <Plus className="h-4 w-4" />
            {t.addMedicine}
          </button>
        </div>

        {/* Search and Filter Tabs */}
        <div className="flex flex-col sm:flex-row gap-3 text-xs" id="inventory-filters">
          <div className="relative flex-1" id="inv-search-group">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                lang === 'en'
                  ? 'Search by name, generic, or SKU...'
                  : 'औषधिको नाम वा जेनेरिक द्वारा खोज्नुहोस्...'
              }
              className="w-full pl-8 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-hidden"
            />
          </div>

          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg font-medium focus:outline-hidden text-gray-700"
          >
            <option value="All">{lang === 'en' ? 'All Categories' : 'सबै औषधी वर्गहरू'}</option>
            {CATEGORY_OPTIONS.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>

          <div className="flex bg-gray-100 p-0.5 rounded-lg border border-gray-200" id="stock-tabs">
            <button
              onClick={() => setStockFilter('All')}
              className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                stockFilter === 'All' ? 'bg-white text-gray-900 shadow-2xs font-bold' : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              {lang === 'en' ? 'All Stock' : 'सबै'}
            </button>
            <button
              onClick={() => setStockFilter('Low')}
              className={`px-3 py-1.5 rounded-md font-medium flex items-center gap-1.5 transition-colors ${
                stockFilter === 'Low' ? 'bg-amber-500 text-white shadow-2xs font-bold' : 'text-gray-500 hover:text-amber-600'
              }`}
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              <span>{lang === 'en' ? 'Low' : 'न्यून'}</span>
            </button>
            <button
              onClick={() => setStockFilter('Expiring')}
              className={`px-3 py-1.5 rounded-md font-medium flex items-center gap-1.5 transition-colors ${
                stockFilter === 'Expiring' ? 'bg-red-500 text-white shadow-2xs font-bold' : 'text-gray-500 hover:text-red-600'
              }`}
            >
              <Calendar className="h-3.5 w-3.5" />
              <span>{lang === 'en' ? 'Expiry' : 'म्याद'}</span>
            </button>
          </div>
        </div>

        {/* Medicines Inventory Table */}
        <div className="overflow-x-auto border border-gray-100 rounded-lg" id="inventory-table-wrapper">
          <table className="min-w-full divide-y divide-gray-100 text-xs">
            <thead>
              <tr className="text-left text-gray-400 uppercase tracking-wider bg-gray-50">
                <th className="px-4 py-3">{t.medicineName}</th>
                <th className="px-4 py-3 text-center">Category</th>
                <th className="px-4 py-3 text-right">In Stock</th>
                <th className="px-4 py-3 text-right">Retail (NPR)</th>
                <th className="px-4 py-3">Expiry Date</th>
                <th className="px-4 py-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100" id="inventory-table-body">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-gray-400">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
                    {lang === 'en' ? 'Loading inventory...' : 'लोड हुँदैछ...'}
                  </td>
                </tr>
              ) : loadError ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-red-500">
                    <PackageX className="h-6 w-6 mx-auto mb-2" />
                    {loadError}
                    <button
                      onClick={fetchMedicines}
                      className="block mx-auto mt-2 text-teal-600 font-bold underline"
                    >
                      {lang === 'en' ? 'Retry' : 'फेरि प्रयास गर्नुहोस्'}
                    </button>
                  </td>
                </tr>
              ) : filteredMeds.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-gray-400 italic">
                    {medicines.length === 0
                      ? lang === 'en'
                        ? 'No medicines in inventory yet. Add your first item to get started.'
                        : 'अहिले सम्म कुनै औषधी थपिएको छैन।'
                      : 'No medicine catalog matches filters.'}
                  </td>
                </tr>
              ) : (
                filteredMeds.map((med) => {
                  const isLow = med.initialStockQty <= med.reorderThresholdAlert;
                  const days = daysToExpiry(med.expirationDate);
                  const isExpiringSoon = days !== null && days <= 90;

                  return (
                    <tr
                      key={med._id}
                      onClick={() => setSelectedMedicine(med)}
                      className={`hover:bg-teal-50/10 cursor-pointer transition-colors ${
                        selectedMedicine?._id === med._id ? 'bg-teal-50/30' : ''
                      }`}
                    >
                      <td className="px-4 py-3.5">
                        <div className="space-y-0.5">
                          <span className="font-bold text-gray-900 block">{med.medicineBrandName}</span>
                          <span className="text-[10px] text-gray-400 block">
                            {med.genericMoleculeName} • {med.dosageStrength}
                          </span>
                          {isLow && (
                            <span className="inline-flex px-1.5 py-0.2 bg-amber-100 text-amber-800 text-[9px] font-bold rounded">
                              ⚠️ LOW STOCK ALERT
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-center font-medium text-gray-600">
                        {med.categoryType}
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono">
                        <span
                          className={`font-bold px-2 py-0.5 rounded ${
                            med.initialStockQty === 0
                              ? 'bg-red-100 text-red-700'
                              : isLow
                              ? 'bg-amber-100 text-amber-800'
                              : 'text-gray-900'
                          }`}
                        >
                          {med.initialStockQty} units
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono font-bold text-gray-900">
                        NPR {Number(med.retailPrice).toFixed(2)}
                      </td>
                      <td className="px-4 py-3.5">
                        <span
                          className={`font-mono text-[11px] ${
                            days !== null && days <= 0
                              ? 'text-red-600 font-bold bg-red-100 px-1 rounded'
                              : isExpiringSoon
                              ? 'text-amber-700 font-medium bg-amber-50 px-1 rounded'
                              : 'text-gray-600'
                          }`}
                        >
                          {med.expirationDate ? med.expirationDate.slice(0, 10) : '—'}
                          {isExpiringSoon && (
                            <span className="block text-[9px] text-gray-400 font-bold">
                              ({days !== null && days <= 0 ? 'Expired' : `${days} days left`})
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-center" onClick={(e) => e.stopPropagation()}>
                        {canEditOrDelete ? (
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => openEditModal(med)}
                              title={lang === 'en' ? 'Edit' : 'सम्पादन गर्नुहोस्'}
                              className="p-1.5 rounded-md hover:bg-teal-50 text-teal-600 transition-colors"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => setConfirmDeleteId(med._id)}
                              title={lang === 'en' ? 'Delete' : 'मेटाउनुहोस्'}
                              className="p-1.5 rounded-md hover:bg-red-50 text-red-500 transition-colors"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : (
                          <span className="text-[10px] text-gray-300">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* RIGHT COLUMN: Medicine Detail Panel */}
      <div className="lg:col-span-4 space-y-6" id="inventory-sidebar">
        {selectedMedicine ? (
          <div className="bg-white rounded-xl border border-gray-200 shadow-xs p-5 space-y-5">
            <div className="flex justify-between items-start border-b border-gray-100 pb-3">
              <div className="space-y-0.5">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                  {selectedMedicine.skuBarcodeReference || selectedMedicine._id}
                </span>
                <h3 className="text-base font-bold text-gray-900 leading-tight">
                  {selectedMedicine.medicineBrandName}
                </h3>
                <p className="text-xs text-teal-600 font-bold">{selectedMedicine.genericMoleculeName}</p>
              </div>
              <button
                onClick={() => setSelectedMedicine(null)}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <X className="h-4.5 w-4.5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs leading-relaxed" id="medicine-detail-box">
              <div className="p-2.5 bg-gray-50 rounded-lg">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                  Strength / Dosage
                </span>
                <span className="font-bold text-gray-800">{selectedMedicine.dosageStrength}</span>
              </div>
              <div className="p-2.5 bg-gray-50 rounded-lg">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                  Category
                </span>
                <span className="font-bold text-gray-800">{selectedMedicine.categoryType}</span>
              </div>
              <div className="p-2.5 bg-gray-50 rounded-lg">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                  Purchase Cost
                </span>
                <span className="font-bold text-gray-800 font-mono">
                  NPR {Number(selectedMedicine.purchaseUnitCost).toFixed(2)}
                </span>
              </div>
              <div className="p-2.5 bg-gray-50 rounded-lg">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                  Retail Price
                </span>
                <span className="font-bold text-gray-800 font-mono">
                  NPR {Number(selectedMedicine.retailPrice).toFixed(2)}
                </span>
              </div>
              <div className="p-2.5 bg-gray-50 rounded-lg">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                  In Stock
                </span>
                <span className="font-bold text-gray-800 font-mono">
                  {selectedMedicine.initialStockQty} units
                </span>
              </div>
              <div className="p-2.5 bg-gray-50 rounded-lg">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                  Reorder At
                </span>
                <span className="font-bold text-gray-800 font-mono">
                  {selectedMedicine.reorderThresholdAlert} units
                </span>
              </div>
              <div className="p-2.5 bg-gray-50 rounded-lg col-span-2">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                  Supplier / Distributor
                </span>
                <span className="font-bold text-gray-800 text-[11px]">
                  {selectedMedicine.supplierDistributor || 'Unknown Supplier'}
                </span>
              </div>
            </div>

            {canEditOrDelete ? (
              <div className="border-t border-gray-100 pt-4 flex gap-2">
                <button
                  onClick={() => openEditModal(selectedMedicine)}
                  className="flex-1 py-2 bg-teal-600 hover:bg-teal-700 text-white font-bold text-[11px] uppercase tracking-wider rounded-lg flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  {lang === 'en' ? 'Edit' : 'सम्पादन गर्नुहोस्'}
                </button>
                <button
                  onClick={() => setConfirmDeleteId(selectedMedicine._id)}
                  className="flex-1 py-2 bg-red-50 hover:bg-red-100 text-red-600 font-bold text-[11px] uppercase tracking-wider rounded-lg flex items-center justify-center gap-1.5 transition-colors border border-red-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {lang === 'en' ? 'Delete' : 'मेटाउनुहोस्'}
                </button>
              </div>
            ) : (
              <div className="border-t border-gray-100 pt-4">
                <div className="p-3 bg-red-50/50 rounded-lg border border-red-100 text-xs text-red-800">
                  <p className="font-bold">🔒 {lang === 'en' ? 'Action Restricted' : 'कार्य प्रतिबन्धित'}</p>
                  <p>{t.restrictedAction}</p>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 shadow-xs p-8 text-center space-y-2">
            <Database className="h-8 w-8 text-gray-300 mx-auto" />
            <p className="text-xs text-gray-400">
              {lang === 'en'
                ? 'Select a medicine from the list to view details.'
                : 'विवरण हेर्न औषधी छान्नुहोस्।'}
            </p>
          </div>
        )}

        {/* Low stock quick summary */}
        {!loading && !loadError && medicines.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-xs p-5 space-y-3">
            <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wider flex items-center gap-1.5 border-b border-gray-100 pb-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              {lang === 'en' ? 'Low Stock Watchlist' : 'न्यून मौज्दात सूची'}
            </h3>
            <div className="space-y-1.5 max-h-[180px] overflow-y-auto pr-1">
              {medicines.filter((m) => m.initialStockQty <= m.reorderThresholdAlert).length === 0 ? (
                <p className="text-[11px] text-gray-400 italic">
                  {lang === 'en' ? 'All stock levels look healthy.' : 'सबै मौज्दात राम्रो छ।'}
                </p>
              ) : (
                medicines
                  .filter((m) => m.initialStockQty <= m.reorderThresholdAlert)
                  .map((m) => (
                    <button
                      key={m._id}
                      onClick={() => setSelectedMedicine(m)}
                      className="w-full flex justify-between items-center text-[11px] p-2 bg-amber-50/50 hover:bg-amber-50 rounded-lg border border-amber-100 transition-colors"
                    >
                      <span className="font-bold text-gray-800 truncate">{m.medicineBrandName}</span>
                      <span className="font-mono font-bold text-amber-700">{m.initialStockQty} left</span>
                    </button>
                  ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* ADD / EDIT MEDICINE MODAL */}
      {showFormModal && (
        <div
          className="fixed inset-0 bg-gray-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in"
          id="medicine-form-modal"
        >
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl border border-gray-100 animate-scale-in max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-gray-100 pb-3">
              <h3 className="text-base font-bold text-gray-900 flex items-center gap-1.5">
                <Database className="h-5 w-5 text-teal-600" />
                {formMode === 'edit'
                  ? lang === 'en'
                    ? 'Edit Medicine'
                    : 'औषधी सम्पादन गर्नुहोस्'
                  : t.addMedicine}
              </h3>
              <button onClick={closeModal} className="p-1 text-gray-400 hover:text-gray-950">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 text-xs text-gray-700" id="medicine-form">
              {formError && (
                <div className="p-2.5 bg-red-50 border border-red-100 rounded-lg text-[11px] text-red-700 font-medium">
                  {formError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

                <div className="space-y-1">
                  <label className="font-bold text-gray-500 uppercase tracking-wider block">
                    Pharmacy ID
                  </label>
                  <input
                    type="text"
                    readOnly
                    disabled
                    value={formData.pharmacyId}
                    title={lang === 'en' ? 'Automatically set from your logged-in pharmacy account' : 'तपाईंको लगइन गरिएको फार्मेसी खाताबाट स्वचालित रूपमा सेट गरिएको'}
                    className="w-full px-3 py-2 bg-gray-100 border border-gray-200 rounded-lg text-xs text-gray-500 cursor-not-allowed"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-gray-500 uppercase tracking-wider block">
                    Medicine Brand Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.medicineBrandName}
                    onChange={(e) => handleFormChange('medicineBrandName', e.target.value)}
                    placeholder="e.g. Paracetamol 500mg"
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs focus:outline-hidden focus:bg-white"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-gray-500 uppercase tracking-wider block">
                    Generic Molecule Name
                  </label>
                  <input
                    type="text"
                    value={formData.genericMoleculeName}
                    onChange={(e) => handleFormChange('genericMoleculeName', e.target.value)}
                    placeholder="e.g. Paracetamol"
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs focus:outline-hidden focus:bg-white"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-gray-500 uppercase tracking-wider block">Category Type</label>
                  <select
                    value={formData.categoryType}
                    onChange={(e) => handleFormChange('categoryType', e.target.value)}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs focus:outline-hidden focus:bg-white"
                  >
                    {CATEGORY_OPTIONS.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-gray-500 uppercase tracking-wider block">Dosage Strength</label>
                  <input
                    type="text"
                    value={formData.dosageStrength}
                    onChange={(e) => handleFormChange('dosageStrength', e.target.value)}
                    placeholder="e.g. 500mg or 100ml"
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs focus:outline-hidden focus:bg-white"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-gray-500 uppercase tracking-wider block">
                    Purchase Unit Cost (NPR)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.purchaseUnitCost}
                    onChange={(e) => handleFormChange('purchaseUnitCost', e.target.value)}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs focus:outline-hidden font-mono font-bold text-gray-900"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-gray-500 uppercase tracking-wider block">
                    Retail Price (NPR)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.retailPrice}
                    onChange={(e) => handleFormChange('retailPrice', e.target.value)}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs focus:outline-hidden font-mono font-bold text-gray-900"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-gray-500 uppercase tracking-wider block">
                    Initial Stock Qty
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formData.initialStockQty}
                    onChange={(e) => handleFormChange('initialStockQty', e.target.value)}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs focus:outline-hidden font-mono text-gray-900"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-gray-500 uppercase tracking-wider block">
                    Reorder Threshold Alert
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formData.reorderThresholdAlert}
                    onChange={(e) => handleFormChange('reorderThresholdAlert', e.target.value)}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs focus:outline-hidden font-mono text-gray-900"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-gray-500 uppercase tracking-wider block">
                    SKU Barcode Reference
                  </label>
                  <input
                    type="text"
                    value={formData.skuBarcodeReference}
                    onChange={(e) => handleFormChange('skuBarcodeReference', e.target.value)}
                    placeholder="Auto-generated if empty"
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs focus:outline-hidden font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-gray-500 uppercase tracking-wider block">
                    Expiration Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.expirationDate}
                    onChange={(e) => handleFormChange('expirationDate', e.target.value)}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs focus:outline-hidden font-mono"
                  />
                </div>

                <div className="space-y-1 sm:col-span-2">
                  <label className="font-bold text-gray-500 uppercase tracking-wider block">
                    Supplier / Distributor
                  </label>
                  <input
                    type="text"
                    value={formData.supplierDistributor}
                    onChange={(e) => handleFormChange('supplierDistributor', e.target.value)}
                    placeholder="e.g. Nepal Pharma Distributors"
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={submitting}
                  className="px-5 py-2 bg-white hover:bg-gray-50 text-gray-700 text-xs font-bold uppercase tracking-wider rounded-lg border border-gray-200 disabled:opacity-50"
                >
                  {t.cancel}
                </button>
                <button
                  type="submit"
                  disabled={submitting || !formData.medicineBrandName || !formData.expirationDate}
                  className="px-6 py-2 bg-teal-600 hover:bg-teal-700 disabled:bg-gray-200 disabled:text-gray-400 text-white text-xs font-bold uppercase tracking-wider rounded-lg transition-colors shadow-xs flex items-center gap-2"
                >
                  {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {formMode === 'edit'
                    ? lang === 'en'
                      ? 'Save Changes'
                      : 'परिवर्तन सुरक्षित गर्नुहोस्'
                    : lang === 'en'
                    ? 'Add Item'
                    : 'थप्नुहोस्'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {confirmDeleteId && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 space-y-4 shadow-2xl border border-gray-100 animate-scale-in">
            <div className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              <h3 className="text-sm font-bold uppercase tracking-wider">
                {lang === 'en' ? 'Delete this medicine?' : 'यो औषधी मेटाउने हो?'}
              </h3>
            </div>
            <p className="text-xs text-gray-500">
              {lang === 'en'
                ? 'This will permanently remove it from your inventory. This cannot be undone.'
                : 'यो कार्य पूर्ववत गर्न सकिँदैन।'}
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setConfirmDeleteId(null)}
                disabled={deletingId === confirmDeleteId}
                className="px-4 py-2 bg-white hover:bg-gray-50 text-gray-700 text-xs font-bold uppercase tracking-wider rounded-lg border border-gray-200 disabled:opacity-50"
              >
                {t.cancel}
              </button>
              <button
                onClick={() => handleDelete(confirmDeleteId)}
                disabled={deletingId === confirmDeleteId}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold uppercase tracking-wider rounded-lg transition-colors flex items-center gap-2 disabled:opacity-70"
              >
                {deletingId === confirmDeleteId && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {lang === 'en' ? 'Delete' : 'मेटाउनुहोस्'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}