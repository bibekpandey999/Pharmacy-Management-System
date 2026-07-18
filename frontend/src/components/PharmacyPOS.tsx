import React, { useState, useEffect, useMemo } from 'react';
import {
  Search,
  ShoppingCart,
  User,
  Trash2,
  Plus,
  Minus,
  QrCode,
  CheckCircle,
  X,
  Printer,
  AlertCircle,
  Clock,
  Database,
  Loader2,
  PackageX,
} from 'lucide-react';
import { Patient, Sale, SaleItem } from '../types';
import { TRANSLATIONS } from '../translations';

// ==========================================
// CONFIG
// ==========================================

const API_BASE = import.meta.env.VITE_API_URL || 'https://pharmacy-management-system-ni9u.onrender.com';
const INVENTORY_URL = `${API_BASE}/api/inventory`;
const BILLS_URL = `${API_BASE}/api/bills`;
const DEFAULT_VAT_RATE = 13;

// Helper to safely read the logged-in pharmacy's ID from localStorage.
// Login stores the whole user object as a JSON string under the key "user":
// {"_id":"6a4d428e8f7fb3fb6111b927","id":"9898","pharmacyName":"Butwal","isAdmin":false}
// The pharmacy's ID to filter/stamp records with is the "id" field ("9898"), not "_id".
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

// Reads the full pharmacy profile (name, location, PAN/VAT) that was stored
// in localStorage at login time by the /api/auth/login route. Those fields
// were originally entered once at account creation (/api/admin/users) and
// are returned as-is by the login response — never re-typed at POS time.
interface LoggedInPharmacyProfile {
  pharmacyName: string;
  location: string;
  panOrVat: string;
}

const getLoggedInPharmacyProfile = (): LoggedInPharmacyProfile => {
  try {
    const raw = localStorage.getItem('user');
    if (!raw) return { pharmacyName: '', location: '', panOrVat: '' };
    const parsed = JSON.parse(raw);
    return {
      pharmacyName: parsed?.pharmacyName ? String(parsed.pharmacyName) : '',
      location: parsed?.location ? String(parsed.location) : '',
      // Login response doesn't currently include PanOrVat — this reads it
      // defensively in case it's added later, and falls back to '' otherwise.
      panOrVat: parsed?.PanOrVat ? String(parsed.PanOrVat) : (parsed?.panOrVat ? String(parsed.panOrVat) : ''),
    };
  } catch {
    return { pharmacyName: '', location: '', panOrVat: '' };
  }
};

// ==========================================
// TYPES
// ==========================================

// Raw shape returned by the Express + MongoDB backend
interface RawInventoryItem {
  _id: string;
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
}

// Friendly shape used throughout this component's UI logic
interface MedicineItem {
  id: string;
  pharmacyId: string;
  name: string;
  genericName: string;
  category: string;
  dosage: string;
  stock: number;
  unitPrice: number;
  costPrice: number;
  reorderLevel: number;
  sku: string;
  expiryDate: string;
  supplierId: string;
}

const mapRawToMedicine = (raw: RawInventoryItem): MedicineItem => ({
  id: raw._id,
  pharmacyId: raw.pharmacyId || '',
  name: raw.medicineBrandName,
  genericName: raw.genericMoleculeName,
  category: raw.categoryType,
  dosage: raw.dosageStrength,
  stock: Number(raw.initialStockQty) || 0,
  unitPrice: Number(raw.retailPrice) || 0,
  costPrice: Number(raw.purchaseUnitCost) || 0,
  reorderLevel: Number(raw.reorderThresholdAlert) || 0,
  sku: raw.skuBarcodeReference || '',
  expiryDate: raw.expirationDate || '',
  supplierId: raw.supplierDistributor || '',
});

interface PharmacyPOSProps {
  /** @deprecated Medicines are now fetched directly from MongoDB inside this component; this prop is ignored. */
  medicines?: unknown[];
  patients: Patient[];
  onSaleCompleted: () => void;
  lang: 'en' | 'ne';
  currentUserRole: 'Receptionist' | 'Pharmacist' | 'Owner';
  patientShortcut: Patient | null;
  clearPatientShortcut: () => void;
  onViewInvoice: (sale: Sale) => void;
}

export default function PharmacyPOS({
  patients,
  onSaleCompleted,
  lang,
  currentUserRole,
  patientShortcut,
  clearPatientShortcut,
}: PharmacyPOSProps) {
  const t = TRANSLATIONS[lang];

  // Pharmacy ID pulled from the logged-in session — never manually typed
  const [pharmacyId, setPharmacyIdState] = useState<string>(getLoggedInPharmacyId());

  // Full pharmacy profile (name, location, PAN/VAT) — read once from
  // localStorage rather than re-parsing it on every render/JSX access.
  const [pharmacyProfile] = useState<LoggedInPharmacyProfile>(getLoggedInPharmacyProfile());

  // Live medicine catalog, sourced straight from MongoDB (scoped to this pharmacy)
  const [medicines, setMedicines] = useState<MedicineItem[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState('');

  // Linking a Patient to the sale
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [patientSearchQuery, setPatientSearchQuery] = useState('');
  const [showPatientResults, setShowPatientResults] = useState(false);

  useEffect(() => {
    if (patientShortcut) {
      setSelectedPatient(patientShortcut);
      clearPatientShortcut();
    }
  }, [patientShortcut]);

  // POS State
  const [medicineSearchQuery, setMedicineSearchQuery] = useState('');
  const [cart, setCart] = useState<SaleItem[]>([]);
  const [discountInput, setDiscountInput] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<Sale['paymentMethod']>('Cash');
  const [barcodeInput, setBarcodeInput] = useState('');
  const [vatRate] = useState(DEFAULT_VAT_RATE);
  const [unregisteredName, setUnregisteredName] = useState('');

  // Status/Result states
  const [errorMessage, setErrorMessage] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [finalizedSale, setFinalizedSale] = useState<Sale | null>(null);
  const [isFinalizing, setIsFinalizing] = useState(false);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 3000);
  };

  // Whichever name will actually be billed — a selected registered patient,
  // or manually typed walk-in text. Used to gate the checkout button and
  // to stamp the sale/receipt with the correct name either way.
  const billingName = selectedPatient?.fullName || unregisteredName.trim();
  const hasBillingName = billingName.length > 0;

  // ==========================================
  // FETCH MEDICINE CATALOG FROM MONGODB — scoped to the logged-in pharmacy
  // ==========================================

  const fetchMedicines = async () => {
    setCatalogLoading(true);
    setCatalogError('');

    const currentPharmacyId = getLoggedInPharmacyId();
    setPharmacyIdState(currentPharmacyId);

    if (!currentPharmacyId) {
      setCatalogError(
        lang === 'en'
          ? 'No pharmacy ID found. Please log in again.'
          : 'फार्मेसी आईडी फेला परेन। कृपया फेरि लगइन गर्नुहोस्।'
      );
      setMedicines([]);
      setCatalogLoading(false);
      return;
    }

    try {
      const url = `${INVENTORY_URL}?pharmacyId=${encodeURIComponent(currentPharmacyId)}`;
      const res = await fetch(url);
      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.message || 'Failed to load medicine catalog.');
      }

      // Belt-and-suspenders: also filter client-side in case the backend
      // route hasn't been updated yet to respect ?pharmacyId=
      const scoped = (result.data || [])
        .filter((raw: RawInventoryItem) => String(raw.pharmacyId || '').trim() === String(currentPharmacyId).trim())
        .map(mapRawToMedicine);

      setMedicines(scoped);
    } catch (err: any) {
      setCatalogError(err.message || 'Could not connect to the server.');
    } finally {
      setCatalogLoading(false);
    }
  };

  useEffect(() => {
    fetchMedicines();
  }, []);

  // Live filter medicines (derived, no extra state/effect needed)
  const filteredMedicines = useMemo(() => {
    if (!medicineSearchQuery.trim()) {
      return medicines.filter((m) => m.stock > 0);
    }
    const q = medicineSearchQuery.toLowerCase().trim();
    return medicines.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.genericName.toLowerCase().includes(q) ||
        m.category.toLowerCase().includes(q) ||
        m.sku.includes(q)
    );
  }, [medicineSearchQuery, medicines]);

  // Simulate Barcode scanner matches
  const handleBarcodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!barcodeInput.trim()) return;

    const matchedMed = medicines.find((m) => m.sku === barcodeInput.trim());
    if (matchedMed) {
      if (matchedMed.stock <= 0) {
        setErrorMessage(`${matchedMed.name} is completely out of stock!`);
        setTimeout(() => setErrorMessage(''), 4000);
      } else {
        addToCart(matchedMed);
      }
    } else {
      setErrorMessage(`No medicine found matching SKU "${barcodeInput}"`);
      setTimeout(() => setErrorMessage(''), 4000);
    }
    setBarcodeInput('');
  };

  // Cart operations
  const addToCart = (med: MedicineItem) => {
    setErrorMessage('');
    const existingIndex = cart.findIndex((item) => item.medicineId === med.id);

    if (existingIndex > -1) {
      const currentQty = cart[existingIndex].quantity;
      if (currentQty + 1 > med.stock) {
        setErrorMessage(`${t.cannotExceedStock} Max available: ${med.stock}`);
        setTimeout(() => setErrorMessage(''), 4000);
        return;
      }

      const updatedCart = [...cart];
      updatedCart[existingIndex].quantity += 1;
      updatedCart[existingIndex].totalPrice = updatedCart[existingIndex].quantity * med.unitPrice;
      setCart(updatedCart);
    } else {
      if (med.stock < 1) {
        setErrorMessage(`${t.insufficientStock} Current: ${med.stock}`);
        return;
      }
      const newItem: SaleItem = {
        medicineId: med.id,
        name: med.name,
        dosage: med.dosage,
        quantity: 1,
        unitPrice: med.unitPrice,
        totalPrice: med.unitPrice,
      };
      setCart([...cart, newItem]);
    }
  };

  const updateQuantity = (medId: string, delta: number) => {
    setErrorMessage('');
    const matchedMed = medicines.find((m) => m.id === medId);
    if (!matchedMed) return;

    const updatedCart = cart
      .map((item) => {
        if (item.medicineId === medId) {
          const nextQty = item.quantity + delta;
          if (nextQty <= 0) return null;
          if (nextQty > matchedMed.stock) {
            setErrorMessage(`${t.cannotExceedStock} Max: ${matchedMed.stock}`);
            setTimeout(() => setErrorMessage(''), 4000);
            return item;
          }
          return {
            ...item,
            quantity: nextQty,
            totalPrice: nextQty * item.unitPrice,
          };
        }
        return item;
      })
      .filter(Boolean) as SaleItem[];

    setCart(updatedCart);
  };

  const removeFromCart = (medId: string) => {
    setCart(cart.filter((item) => item.medicineId !== medId));
  };

  // Math Calculations
  const subTotal = cart.reduce((sum, item) => sum + item.totalPrice, 0);
  const discountAmount = Math.min(discountInput, subTotal);
  const taxableAmount = Math.max(0, subTotal - discountAmount);
  const vatAmount = taxableAmount * (vatRate / 100);
  const grandTotal = taxableAmount + vatAmount;

  // Patient link list filtering — only offer patients belonging to this same pharmacy
  const filteredPatients = patients.filter((p) => {
    const belongsToThisPharmacy = String((p as any).pharmacyId || '').trim() === String(pharmacyId).trim();
    const matchesQuery =
      p.fullName.toLowerCase().includes(patientSearchQuery.toLowerCase()) ||
      p.phone.includes(patientSearchQuery) ||
      p.id.toLowerCase().includes(patientSearchQuery.toLowerCase());
    return belongsToThisPharmacy && matchesQuery;
  });

  // ==========================================
  // CHECKOUT — Finalize Sale & Print Invoice
  // ==========================================
  // Payment method buttons only ever call setPaymentMethod(...) below in the JSX —
  // they never trigger a save. Clicking THIS button is the only thing that finalizes
  // the sale: it saves the bill to MongoDB, then opens the invoice/receipt popup.
  // The button is disabled entirely unless a registered patient is selected OR a
  // walk-in name has been typed — see the `disabled` prop on the button in the JSX.
  const handleCheckout = () => {
    if (cart.length === 0 || isFinalizing) return;
    setErrorMessage('');

    if (!hasBillingName) {
      setErrorMessage(
        lang === 'en'
          ? 'Please select a registered patient or enter a walk-in name before finalizing the sale.'
          : 'बिल बनाउनु अघि दर्ता भएको बिरामी छान्नुहोस् वा नाम लेख्नुहोस्।'
      );
      return;
    }

    const currentPharmacyId = getLoggedInPharmacyId();
    if (!currentPharmacyId) {
      setErrorMessage(
        lang === 'en'
          ? 'No pharmacy ID found in your session. Please log in again.'
          : 'तपाईंको सत्रमा फार्मेसी आईडी फेला परेन। कृपया फेरि लगइन गर्नुहोस्।'
      );
      return;
    }

    for (const item of cart) {
      const med = medicines.find((m) => m.id === item.medicineId);
      if (!med || med.stock < item.quantity) {
        setErrorMessage(`${t.insufficientStock} "${item.name}" only has ${med?.stock ?? 0} left.`);
        return;
      }
    }

    commitSale(currentPharmacyId);
  };

  // Push the stock reduction from this sale back to MongoDB so the catalog stays accurate.
  // Best-effort: a sync failure doesn't block the sale, but the user is warned.
  const syncStockAfterSale = async (soldItems: SaleItem[]) => {
    try {
      const results = await Promise.all(
        soldItems.map(async (item) => {
          const med = medicines.find((m) => m.id === item.medicineId);
          if (!med) return true;
          const newQty = Math.max(0, med.stock - item.quantity);

          const payload = {
            pharmacyId: med.pharmacyId,
            medicineBrandName: med.name,
            genericMoleculeName: med.genericName,
            categoryType: med.category,
            dosageStrength: med.dosage,
            purchaseUnitCost: med.costPrice,
            retailPrice: med.unitPrice,
            initialStockQty: newQty,
            reorderThresholdAlert: med.reorderLevel,
            skuBarcodeReference: med.sku,
            expirationDate: med.expiryDate,
            supplierDistributor: med.supplierId,
          };

          const res = await fetch(`${INVENTORY_URL}/${med.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          const result = await res.json();
          return res.ok && result.success;
        })
      );

      if (results.some((ok) => !ok)) {
        showToast('Sale saved, but some stock levels may not have synced.', 'error');
      }

      // Refresh from source of truth
      await fetchMedicines();
    } catch {
      showToast('Sale saved, but stock could not be synced to the server.', 'error');
    }
  };

  // Persist the bill to MongoDB via POST /api/bills.
  // The backend stores one bill document per line item (item, qty, rate, total),
  // so every cart line is written as its own row, all sharing the same invoiceNo
  // and the same header-level totals (subtotal / tax / grand total).
  //
  // pharmacyName / location / panOrVat are read from the logged-in session
  // (set once at account creation via /api/admin/users, returned at login via
  // /api/auth/login, and cached in localStorage) — never typed at POS time.
  const saveBillToDatabase = async (sale: Sale, soldItems: SaleItem[], billToName: string, billPharmacyId: string) => {
    try {
      const results = await Promise.all(
        soldItems.map((item) =>
          fetch(BILLS_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              pharmacyName: pharmacyProfile.pharmacyName,
              location: pharmacyProfile.location,
              panOrVat: pharmacyProfile.panOrVat,
              invoiceNo: sale.id,
              pharmacyId: billPharmacyId, // always the logged-in pharmacy's ID, never user-entered
              billTo: billToName,
              paymentMethod: sale.paymentMethod,
              date: sale.createdAt,
              item: item.name,
              qty: item.quantity,
              rate: item.unitPrice,
              total: item.totalPrice,
              subtotal: sale.subTotal,
              taxablePostsubdiscountSubtotal: sale.subTotal - sale.discount,
              vATCollected: sale.vatAmount,
              grandTotal: sale.grandTotal,
            }),
          }).then((res) =>
            res.json().then((data) => ({ ok: res.ok, success: Boolean(data?.success) }))
          )
        )
      );

      return results.every((r) => r.ok && r.success);
    } catch (err) {
      console.error('🔴 Bill save failed:', err);
      return false;
    }
  };

  // Build the sale, save it to MongoDB, then show the invoice popup.
  const commitSale = async (billPharmacyId: string) => {
    const soldItems = cart;
    // billingName is guaranteed non-empty here because handleCheckout already
    // blocked the call otherwise — this is the single source of truth for the
    // name that goes on both the DB record and the printed receipt.
    const billToName = billingName;

    const newSale: Sale = {
      id: `INV-${Date.now()}`,
      createdAt: new Date().toISOString(),
      patientId: selectedPatient?.id || null,
      patientName: billToName,
      pharmacyId: billPharmacyId,
      items: cart,
      subTotal,
      discount: discountAmount,
      vatRate,
      vatAmount,
      grandTotal,
      paymentMethod,
    } as Sale;

    setIsFinalizing(true);
    const saved = await saveBillToDatabase(newSale, soldItems, billToName, billPharmacyId);
    setIsFinalizing(false);

    // Show the invoice/bill popup regardless, but let the user know if the DB write failed
    setFinalizedSale(newSale);
    showToast(
      saved
        ? t.posSuccess || 'Sale completed and saved successfully.'
        : 'Sale completed, but saving the bill to the database failed.',
      saved ? 'success' : 'error'
    );

    setCart([]);
    setDiscountInput(0);
    setSelectedPatient(null);
    setUnregisteredName('');

    await syncStockAfterSale(soldItems);
    onSaleCompleted();
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6" id="pos-root">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-5 right-5 z-[60] flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-xs font-bold text-white animate-fade-in ${
            toast.type === 'success' ? 'bg-teal-600' : 'bg-red-600'
          }`}
        >
          {toast.message}
        </div>
      )}

      {/* LEFT: Cart / Checkout Panel (5 columns) */}
      <div className="lg:col-span-5 bg-white rounded-xl border border-gray-200 shadow-xs p-5 flex flex-col space-y-4" id="pos-cart-panel">

        {/* Read-only pharmacy badge — auto-filled from the logged-in session */}
        <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
          <span className="text-[10px] uppercase font-bold text-gray-400">Pharmacy ID:</span>
          <span className="flex-1 px-3 py-1 bg-gray-100 border border-gray-200 rounded-lg text-xs font-mono font-bold text-gray-600">
            {pharmacyId || (lang === 'en' ? 'Not logged in' : 'लगइन गरिएको छैन')}
          </span>
        </div>

        <div className="flex justify-between items-center border-b border-gray-100 pb-3" id="cart-header">
          <h2 className="text-lg font-bold text-gray-900 tracking-tight flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-teal-600" />
            {t.cart}
          </h2>
          <span className="bg-teal-50 text-teal-700 px-2.5 py-0.5 rounded-full text-xs font-bold font-mono">
            {cart.reduce((sum, item) => sum + item.quantity, 0)} items
          </span>
        </div>

        {/* Dynamic linked patient block */}
        <div className="p-3.5 bg-gray-50 rounded-xl border border-gray-200 space-y-2 relative" id="patient-link-block">
          {selectedPatient ? (
            <div className="flex items-center justify-between" id="linked-patient-info">
              <div className="space-y-0.5">
                <span className="text-[10px] uppercase font-bold text-gray-400 block tracking-wider">
                  {lang === 'en' ? 'Linked Patient' : 'जोडिएको बिरामी'}
                </span>
                <span className="font-bold text-teal-900 text-sm">{selectedPatient.fullName}</span>
                <span className="text-xs text-gray-500 block">
                  {selectedPatient.phone} • {selectedPatient.address.split(',')[0]}
                </span>
                {selectedPatient.allergies.length > 0 && (
                  <span className="inline-flex px-1.5 py-0.5 bg-red-100 text-red-700 rounded text-[9px] font-extrabold border border-red-200 mt-1 uppercase">
                    ⚠️ {lang === 'en' ? 'Allergies' : 'एलर्जी'}: {selectedPatient.allergies.join(', ')}
                  </span>
                )}
              </div>
              <button
                onClick={() => setSelectedPatient(null)}
                className="p-1.5 hover:bg-gray-200 rounded-full text-gray-400 hover:text-red-500 transition-colors"
                title="Remove Patient"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="space-y-2" id="patient-link-form">
              <div className="flex justify-between items-center">
                <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider block">{t.walkIn}</span>
                <span className="text-xs text-gray-400 font-medium">Click below to link regular patient</span>
              </div>
              <div className="relative">
                <User className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  value={patientSearchQuery}
                  onChange={(e) => {
                    setPatientSearchQuery(e.target.value);
                    setShowPatientResults(true);
                  }}
                  onFocus={() => setShowPatientResults(true)}
                  placeholder={lang === 'en' ? 'Search & Link Patient...' : 'बिरामी खोजेर जोड्नुहोस्...'}
                  className="w-full pl-9 pr-4 py-1.5 bg-white border border-gray-200 rounded-lg text-xs focus:outline-hidden"
                />

                {showPatientResults && patientSearchQuery && (
                  <div
                    className="absolute left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-35 max-h-48 overflow-y-auto divide-y divide-gray-100"
                    id="patient-dropdown"
                  >
                    {filteredPatients.length === 0 ? (
                      <div className="p-3 text-xs text-gray-400 italic text-center">No patient found</div>
                    ) : (
                      filteredPatients.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            setSelectedPatient(p);
                            setPatientSearchQuery('');
                            setShowPatientResults(false);
                            setUnregisteredName('');
                          }}
                          className="w-full text-left p-2.5 hover:bg-teal-50/50 flex items-center justify-between text-xs transition-colors"
                        >
                          <div>
                            <span className="font-bold text-gray-900">{p.fullName}</span>
                            <span className="text-[9px] text-gray-400 ml-1.5 font-mono">({p.id})</span>
                          </div>
                          <span className="text-[10px] text-gray-500">{p.phone}</span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Manual Name Input for Unregistered Patients */}
              <div className="relative">
                <input
                  type="text"
                  value={unregisteredName}
                  onChange={(e) => setUnregisteredName(e.target.value)}
                  placeholder={lang === 'en' ? 'Or enter walk-in name...' : 'वा नाम टाइप गर्नुहोस्...'}
                  className="w-full px-3 py-1.5 bg-white border border-dashed border-gray-300 rounded-lg text-xs"
                />
              </div>

              {!hasBillingName && (
                <p className="text-[10px] text-amber-600 font-medium flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {lang === 'en'
                    ? 'Select a registered patient or type a name to enable checkout.'
                    : 'बिल बनाउन बिरामी छान्नुहोस् वा नाम लेख्नुहोस्।'}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Live warnings & Error messages banner */}
        {errorMessage && (
          <div className="p-3 bg-red-50 border border-red-200 text-xs text-red-800 rounded-lg flex items-center gap-2 animate-pulse" id="pos-error-banner">
            <AlertCircle className="h-4.5 w-4.5 text-red-600 shrink-0" />
            <p className="font-medium">{errorMessage}</p>
          </div>
        )}

        {/* Running Cart items list */}
        <div className="flex-1 overflow-y-auto max-h-[250px] min-h-[140px] space-y-2 pr-1" id="cart-items-list">
          {cart.length === 0 ? (
            <div className="text-center py-10 space-y-2 text-gray-400">
              <ShoppingCart className="h-8 w-8 mx-auto stroke-1" />
              <p className="text-xs">{t.emptyCart}</p>
            </div>
          ) : (
            cart.map((item) => (
              <div
                key={item.medicineId}
                className="p-3 bg-white border border-gray-200 rounded-lg flex items-center justify-between text-xs hover:border-teal-100 transition-all shadow-xs"
              >
                <div className="space-y-0.5 max-w-[170px]">
                  <p className="font-bold text-gray-900 leading-tight">{item.name}</p>
                  <p className="text-[10px] text-gray-400">{item.dosage}</p>
                  <p className="text-[10px] font-mono text-teal-600 font-semibold">NPR {item.unitPrice.toFixed(2)}</p>
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex items-center border border-gray-200 rounded-md bg-gray-50" id={`qty-controls-${item.medicineId}`}>
                    <button type="button" onClick={() => updateQuantity(item.medicineId, -1)} className="p-1 hover:bg-gray-100 text-gray-500 hover:text-gray-900">
                      <Minus className="h-3 w-3" />
                    </button>
                    <span className="px-2 font-mono font-bold text-gray-900 text-xs bg-white min-w-[20px] text-center">
                      {item.quantity}
                    </span>
                    <button type="button" onClick={() => updateQuantity(item.medicineId, 1)} className="p-1 hover:bg-gray-100 text-gray-500 hover:text-gray-900">
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>

                  <button type="button" onClick={() => removeFromCart(item.medicineId)} className="p-1 text-gray-400 hover:text-red-500 rounded hover:bg-gray-50">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="text-right font-mono font-bold text-gray-900 min-w-[65px]">
                  NPR {item.totalPrice.toFixed(2)}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Calculation Summary Footer */}
        <div className="border-t border-gray-100 pt-3.5 space-y-2 text-xs text-gray-500" id="cart-summary">
          <div className="flex justify-between">
            <span>{t.subTotal}</span>
            <span className="font-mono text-gray-900 font-medium">NPR {subTotal.toFixed(2)}</span>
          </div>

          <div className="flex justify-between items-center">
            <span>{t.discount}</span>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-gray-400 font-mono">Input:</span>
              <input
                type="number"
                min="0"
                max={subTotal}
                value={discountInput === 0 ? '' : discountInput}
                onChange={(e) => setDiscountInput(Number(e.target.value))}
                className="w-16 px-1.5 py-0.5 bg-gray-50 border border-gray-200 rounded-sm text-right font-mono text-xs focus:outline-hidden text-gray-900 font-bold"
                placeholder="0"
              />
            </div>
          </div>

          <div className="flex justify-between">
            <span>{t.taxableAmount}</span>
            <span className="font-mono text-gray-900 font-medium">NPR {taxableAmount.toFixed(2)}</span>
          </div>

          <div className="flex justify-between">
            <span>
              {t.vat} ({vatRate}%)
            </span>
            <span className="font-mono text-gray-900 font-medium">NPR {vatAmount.toFixed(2)}</span>
          </div>

          <div className="flex justify-between border-t border-dashed border-gray-200 pt-2 text-sm text-gray-900 font-bold" id="cart-grand-total">
            <span>{t.grandTotal}</span>
            <span className="font-mono text-teal-700 text-base">
              NPR {grandTotal.toLocaleString('en-NP', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        {/* Payment Method Select — this ONLY records which method was used.
            It never triggers a save; only the Finalize button below does that. */}
        <div className="space-y-1.5 border-t border-gray-100 pt-3.5" id="payment-selection">
          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">{t.payMethod}</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setPaymentMethod('Cash')}
              className={`py-2 px-3 border rounded-lg font-medium text-xs text-left transition-all ${
                paymentMethod === 'Cash' ? 'bg-teal-50 text-teal-800 border-teal-300 ring-1 ring-teal-200' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              💵 {t.cash}
            </button>
            <button
              type="button"
              onClick={() => setPaymentMethod('eSewa')}
              className={`py-2 px-3 border rounded-lg font-bold text-xs text-left transition-all ${
                paymentMethod === 'eSewa'
                  ? 'bg-[#60bb46]/10 text-[#4c9b36] border-[#60bb46]/40 ring-1 ring-[#60bb46]/20'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              🟢 eSewa (F1 Wallet)
            </button>
            <button
              type="button"
              onClick={() => setPaymentMethod('Khalti')}
              className={`py-2 px-3 border rounded-lg font-bold text-xs text-left transition-all ${
                paymentMethod === 'Khalti'
                  ? 'bg-[#5c2d91]/10 text-[#492275] border-[#5c2d91]/40 ring-1 ring-[#5c2d91]/20'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              🟣 Khalti Wallet
            </button>
            <button
              type="button"
              onClick={() => setPaymentMethod('IME Pay')}
              className={`py-2 px-3 border rounded-lg font-bold text-xs text-left transition-all ${
                paymentMethod === 'IME Pay' ? 'bg-red-50 text-red-800 border-red-300 ring-1 ring-red-200' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              🔴 IME Pay Wallet
            </button>
          </div>
        </div>

        {/* Finalize Sale & Print Invoice — saves the bill to MongoDB, then shows the invoice popup.
            Disabled unless cart has items AND a billing name exists (either a selected
            registered patient or a manually typed walk-in name). */}
        <button
          onClick={handleCheckout}
          disabled={cart.length === 0 || isFinalizing || !hasBillingName}
          className="w-full py-3 bg-teal-600 hover:bg-teal-700 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed text-white text-sm font-bold rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2"
          id="checkout-submit-btn"
          title={!hasBillingName ? (lang === 'en' ? 'Select a patient or enter a walk-in name first' : 'पहिले बिरामी छान्नुहोस् वा नाम लेख्नुहोस्') : undefined}
        >
          {isFinalizing ? (
            <>
              <Loader2 className="h-4.5 w-4.5 animate-spin" />
              {lang === 'en' ? 'Saving Bill...' : 'बिल सेभ हुँदैछ...'}
            </>
          ) : (
            <>
              <CheckCircle className="h-4.5 w-4.5" />
              {t.checkout}
            </>
          )}
        </button>
      </div>

      {/* RIGHT: Product Search & Grid Catalog (7 columns) */}
      <div className="lg:col-span-7 bg-white rounded-xl border border-gray-200 shadow-xs p-5 flex flex-col space-y-4" id="pos-catalog-panel">
        {/* Double row searching: Search + barcode simulation */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" id="catalog-search-rows">
          <div className="relative" id="medicine-search-group">
            <Search className="absolute left-3 top-2.5 h-4.5 w-4.5 text-gray-400" />
            <input
              type="text"
              value={medicineSearchQuery}
              onChange={(e) => setMedicineSearchQuery(e.target.value)}
              placeholder={t.barcodeSearch}
              className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs placeholder-gray-400 focus:outline-hidden"
            />
          </div>

          <form onSubmit={handleBarcodeSubmit} className="relative" id="barcode-scan-sim">
            <QrCode className="absolute left-3 top-2.5 h-4.5 w-4.5 text-teal-600" />
            <input
              type="text"
              value={barcodeInput}
              onChange={(e) => setBarcodeInput(e.target.value)}
              placeholder={lang === 'en' ? 'Simulate Barcode Scan (Type SKU & Enter)...' : 'बारकोड स्क्यान सिमुलेसन (Enter थिच्नुहोस्)...'}
              className="w-full pl-9 pr-4 py-2 bg-teal-50/30 border border-teal-200 rounded-lg text-xs placeholder-teal-600 focus:outline-hidden focus:ring-1 focus:ring-teal-500 font-mono text-teal-900 font-bold"
            />
          </form>
        </div>

        {/* Inventory Items grid list — sourced live from MongoDB, scoped to this pharmacy */}
      <div className="flex-1 overflow-y-auto max-h-[580px] grid grid-cols-1 sm:grid-cols-2 auto-rows-min content-start gap-3 pr-1" id="medicine-catalog-grid">
          {catalogLoading ? (
            <div className="col-span-2 text-center py-20 text-gray-400 space-y-2">
              <Loader2 className="h-8 w-8 mx-auto animate-spin" />
              <p className="text-sm font-medium">{lang === 'en' ? 'Loading medicine catalog...' : 'लोड हुँदैछ...'}</p>
            </div>
          ) : catalogError ? (
            <div className="col-span-2 text-center py-20 text-red-500 space-y-2">
              <PackageX className="h-8 w-8 mx-auto" />
              <p className="text-sm font-medium">{catalogError}</p>
              <button onClick={fetchMedicines} className="text-teal-600 font-bold text-xs underline">
                {lang === 'en' ? 'Retry' : 'फेरि प्रयास गर्नुहोस्'}
              </button>
            </div>
          ) : filteredMedicines.length === 0 ? (
            <div className="col-span-2 text-center py-20 text-gray-400 space-y-2">
              <Database className="h-10 w-10 mx-auto stroke-1" />
              <p className="text-sm font-medium">
                {medicines.length === 0
                  ? lang === 'en'
                    ? 'No medicines in inventory yet. Add stock from the Inventory tab.'
                    : 'अहिले सम्म कुनै औषधी थपिएको छैन।'
                  : 'No available medicines match your search criteria.'}
              </p>
            </div>
          ) : (
            filteredMedicines.map((med) => {
              const inCartItem = cart.find((item) => item.medicineId === med.id);
              const remainingStock = med.stock - (inCartItem?.quantity ?? 0);

              return (
                <button
                  key={med.id}
                  onClick={() => addToCart(med)}
                  disabled={remainingStock <= 0}
                  className={`p-3.5 text-left border rounded-xl flex flex-col justify-between transition-all group ${
                    remainingStock <= 0
                      ? 'bg-gray-50 border-gray-100 cursor-not-allowed opacity-60'
                      : inCartItem
                      ? 'bg-teal-50/20 border-teal-300 ring-1 ring-teal-200'
                      : 'bg-white border-gray-200 hover:border-gray-300 shadow-2xs hover:shadow-xs'
                  }`}
                  id={`med-card-${med.id}`}
                >
                  <div className="space-y-1 w-full">
                    <div className="flex justify-between items-start">
                      <span className="font-bold text-gray-900 group-hover:text-teal-700 transition-colors text-sm truncate max-w-[170px]">
                        {med.name}
                      </span>
                      <span className="text-[10px] text-gray-400 bg-gray-100 px-1 rounded font-mono font-medium">{med.category}</span>
                    </div>
                    <div className="flex justify-between text-[11px] text-gray-500">
                      <span className="truncate max-w-[130px]">{med.genericName}</span>
                      <span>{med.dosage}</span>
                    </div>
                  </div>

                  <div className="flex justify-between items-end mt-4 border-t border-gray-50 pt-2.5 w-full">
                    <div className="space-y-0.5">
                      <span className="text-[10px] text-gray-400 block uppercase tracking-wider">
                        {lang === 'en' ? 'RETAIL PRICE' : 'मूल्य'}
                      </span>
                      <span className="font-mono font-bold text-gray-900 text-sm">NPR {med.unitPrice.toFixed(2)}</span>
                    </div>

                    <div className="text-right">
                      {remainingStock <= 0 ? (
                        <span className="px-2 py-0.5 bg-red-100 text-red-700 text-[10px] font-bold rounded">Out of Stock</span>
                      ) : (
                        <span
                          className={`px-2 py-0.5 text-[10px] rounded font-medium ${
                            remainingStock <= med.reorderLevel ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {remainingStock} {lang === 'en' ? 'left' : 'बाँकी'}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* POS SUCCESS & INVOICE PRINT VIEW POPUP */}
      {finalizedSale && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in" id="invoice-modal">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-6 shadow-2xl border border-gray-100 animate-scale-in">
            <div className="flex justify-between items-center border-b border-gray-100 pb-3">
              <span className="font-bold text-gray-900 flex items-center gap-1.5 text-sm">
                <CheckCircle className="h-5 w-5 text-emerald-600" />
                {lang === 'en' ? 'Sale Completed Successfully' : 'बिक्री सफलतापूर्वक सम्पन्न भयो'}
              </span>
              <button onClick={() => setFinalizedSale(null)} className="p-1 text-gray-400 hover:text-gray-950">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div
              className="p-5 border border-gray-300 rounded-xl bg-[#fafafa] font-sans text-xs text-gray-800 space-y-4 shadow-inner max-h-[400px] overflow-y-auto"
              id="printable-receipt"
            >
              <div className="text-center space-y-1 pb-3 border-b border-gray-300 border-dashed">
                <h3 className="text-base font-bold text-gray-950 uppercase tracking-tight">
                  {pharmacyProfile.pharmacyName || (lang === 'en' ? 'Pharmacy' : 'फार्मेसी')}
                </h3>
                {pharmacyProfile.location && (
                  <p className="text-[10px] text-gray-500">{pharmacyProfile.location}</p>
                )}
                {pharmacyProfile.panOrVat && (
                  <p className="font-semibold text-[10px]">
                    {lang === 'en' ? 'PAN/VAT: ' : 'प्यान/भ्याट: '}{pharmacyProfile.panOrVat}
                  </p>
                )}
                <h4 className="text-xs font-extrabold text-gray-950 uppercase border-y border-gray-200 py-1 tracking-wider mt-2">{t.invoice}</h4>
              </div>

              <div className="grid grid-cols-2 gap-y-1 border-b border-gray-200 pb-2 leading-relaxed">
                <div>
                  Invoice No: <span className="font-mono font-bold text-gray-950">{finalizedSale.id}</span>
                </div>
                <div className="text-right">
                  Date: <span className="font-mono">{new Date(finalizedSale.createdAt).toLocaleString()}</span>
                </div>

                {/* Billed To — works for both a registered patient AND a manually typed walk-in name,
                    since we now store the resolved name directly on the sale as patientName. */}
                <div className="col-span-2">
                  {t.receiptTo}:{' '}
                  <span className="font-bold text-gray-900">
                    {finalizedSale.patientName ||
                      (finalizedSale.patientId
                        ? patients.find((p) => p.id === finalizedSale.patientId)?.fullName
                        : null) ||
                      'N/A'}
                  </span>
                  {finalizedSale.patientId && (
                    <span className="text-[10px] text-gray-500 font-mono ml-1">({finalizedSale.patientId})</span>
                  )}
                </div>

                <div className="col-span-2">
                  Payment Method: <span className="font-semibold text-gray-950">{finalizedSale.paymentMethod}</span>
                </div>
              </div>

              <table className="w-full text-[11px] leading-relaxed">
                <thead>
                  <tr className="border-b border-gray-300 font-bold text-gray-950 text-left">
                    <th className="pb-1">Item</th>
                    <th className="pb-1 text-center">Qty</th>
                    <th className="pb-1 text-right">Rate</th>
                    <th className="pb-1 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 border-b border-gray-300">
                  {finalizedSale.items.map((item, idx) => (
                    <tr key={idx} className="py-1">
                      <td className="py-1">
                        <p className="font-bold text-gray-950">{item.name}</p>
                        <p className="text-[9px] text-gray-500">{item.dosage}</p>
                      </td>
                      <td className="py-1 text-center font-mono">{item.quantity}</td>
                      <td className="py-1 text-right font-mono">NPR {item.unitPrice.toFixed(2)}</td>
                      <td className="py-1 text-right font-mono">NPR {item.totalPrice.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="space-y-1 text-[11px] text-gray-700 max-w-[200px] ml-auto">
                <div className="flex justify-between">
                  <span>Subtotal:</span>
                  <span className="font-mono">NPR {finalizedSale.subTotal.toFixed(2)}</span>
                </div>
                {finalizedSale.discount > 0 && (
                  <div className="flex justify-between text-red-600">
                    <span>Discount:</span>
                    <span className="font-mono">-NPR {finalizedSale.discount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between font-medium">
                  <span>Taxable Post-Discount Subtotal:</span>
                  <span className="font-mono">NPR {(finalizedSale.subTotal - finalizedSale.discount).toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>VAT Collected ({finalizedSale.vatRate}%):</span>
                  <span className="font-mono">NPR {finalizedSale.vatAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between border-t border-gray-400 pt-1 text-xs text-gray-950 font-bold">
                  <span>GRAND TOTAL:</span>
                  <span className="font-mono text-teal-700">NPR {finalizedSale.grandTotal.toFixed(2)}</span>
                </div>
              </div>

              <div className="pt-8 flex justify-between items-end border-t border-dashed border-gray-300">
                <div className="text-center font-bold text-[9px] text-gray-400 border-t border-gray-300 pt-1 w-24">Customer Sign</div>
                <div className="text-center italic text-[10px] text-gray-500">{t.thankYou}</div>
                <div className="text-center font-bold text-[9px] text-gray-400 border-t border-gray-300 pt-1 w-24">{t.authorizedSign}</div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setFinalizedSale(null)}
                className="px-5 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs font-bold uppercase tracking-wider rounded-lg transition-colors border border-gray-200"
              >
                {lang === 'en' ? 'Close Counter' : 'काउन्टर बन्द गर्नुहोस्'}
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="px-6 py-2 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold uppercase tracking-wider rounded-lg transition-colors shadow-xs flex items-center gap-1.5"
              >
                <Printer className="h-4 w-4" />
                {lang === 'en' ? 'Print Reciept' : 'बिल प्रिन्ट गर्नुहोस्'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}