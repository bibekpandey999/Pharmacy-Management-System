import React, { useState, useEffect, useMemo } from 'react';
import {
  Users,
  TrendingUp,
  AlertTriangle,
  ShoppingBag,
  Calendar,
  ArrowRight,
  Activity,
  CheckCircle,
  FileText,
  Loader2,
  PackageX,
} from 'lucide-react';
import { Patient, Sale } from '../types';
import { TRANSLATIONS } from '../translations';

// ==========================================
// CONFIG
// ==========================================

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const INVENTORY_URL = `${API_BASE}/api/inventory`;
const BILLS_URL = `${API_BASE}/api/bills`;

// Key used when the pharmacy logs in successfully (adjust if your login page uses a different key)
const PHARMACY_USER_STORAGE_KEY = 'user';

interface DashboardProps {
  patients: Patient[];
  /** @deprecated Medicines are now fetched directly from MongoDB inside this component; this prop is ignored. */
  medicines?: unknown[];
  /** @deprecated Sales/transactions are now fetched directly from MongoDB (bills) inside this component; this prop is ignored. */
  sales?: unknown[];
  lang: 'en' | 'ne';
  setView: (view: 'dashboard' | 'patients' | 'pos' | 'inventory' | 'billing') => void;
  setSelectedPatient: (patient: Patient | null) => void;
  onViewInvoice: (sale: Sale) => void;
}

// ==========================================
// TYPES — raw shapes returned by the Express + MongoDB backend
// ==========================================

interface RawInventoryItem {
  _id: string;
  medicineBrandName: string;
  genericMoleculeName: string;
  initialStockQty: number;
  reorderThresholdAlert: number;
  expirationDate: string | null;
  pharmacyId?: string;
}

interface MedicineStockRow {
  id: string;
  name: string;
  genericName: string;
  stock: number;
  reorderLevel: number;
  expiryDate: string;
  pharmacyId: string;
}

const mapRawToMedicineRow = (raw: RawInventoryItem): MedicineStockRow => ({
  id: raw._id,
  name: raw.medicineBrandName,
  genericName: raw.genericMoleculeName,
  stock: Number(raw.initialStockQty) || 0,
  reorderLevel: Number(raw.reorderThresholdAlert) || 0,
  expiryDate: raw.expirationDate || '',
  pharmacyId: raw.pharmacyId || '',
});


interface RawBillLine {
  _id: string;
  invoiceNo: string;
  billTo: string;
  paymentMethod: string;
  date: string;
  item: string;
  qty: number;
  rate: number;
  total: number;
  subtotal: number;
  taxablePostsubdiscountSubtotal: number;
  vATCollected: number;
  grandTotal: number;
  createdAt?: string;
  pharmacyId?: string;
  pharmacyName?: string;
  location?: string;
  panOrVat?: string;
}

interface InvoiceLineItem {
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

interface InvoiceRecord {
  invoiceNo: string;
  billTo: string;
  paymentMethod: string;
  date: string;
  items: InvoiceLineItem[];
  subtotal: number;
  taxableAmount: number;
  vatAmount: number;
  grandTotal: number;
  pharmacyId: string;
  pharmacyName: string;
  location: string;
  panOrVat: string;
}

// Group flat bill-line documents from MongoDB into one row per invoice
const groupBillLinesIntoInvoices = (lines: RawBillLine[]): InvoiceRecord[] => {
  const byInvoice = new Map<string, InvoiceRecord>();

  for (const line of lines) {
    const existing = byInvoice.get(line.invoiceNo);
    const lineItem: InvoiceLineItem = {
      name: line.item,
      quantity: Number(line.qty) || 0,
      unitPrice: Number(line.rate) || 0,
      totalPrice: Number(line.total) || 0,
    };

    if (existing) {
      existing.items.push(lineItem);
    } else {
     byInvoice.set(line.invoiceNo, {
  invoiceNo: line.invoiceNo,
  billTo: line.billTo,
  paymentMethod: line.paymentMethod,
  date: line.date || line.createdAt || new Date().toISOString(),
  items: [lineItem],
  subtotal: Number(line.subtotal) || 0,
  taxableAmount: Number(line.taxablePostsubdiscountSubtotal) || 0,
  vatAmount: Number(line.vATCollected) || 0,
  grandTotal: Number(line.grandTotal) || 0,
  pharmacyId: line.pharmacyId || '',
  pharmacyName: line.pharmacyName || '',
  location: line.location || '',
  panOrVat: line.panOrVat || '',
});
    }
  }

  return Array.from(byInvoice.values()).sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
};

// Convert an aggregated invoice into the Sale shape the invoice/print popup expects
const invoiceRecordToSale = (invoice: InvoiceRecord, patients: Patient[]): Sale => {
  const matchedPatient = patients.find((p) => p.fullName === invoice.billTo);
  const discount = Math.max(0, invoice.subtotal - invoice.taxableAmount);
  const vatRate = invoice.taxableAmount > 0 ? (invoice.vatAmount / invoice.taxableAmount) * 100 : 0;

  return {
    id: invoice.invoiceNo,
    createdAt: invoice.date,
    patientId: matchedPatient?.id || null,
    pharmacyName: invoice.pharmacyName,
    location: invoice.location,
    panOrVat: invoice.panOrVat,
    items: invoice.items.map((item) => ({
      medicineId: '',
      name: item.name,
      dosage: '',
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      totalPrice: item.totalPrice,
    })),
    subTotal: invoice.subtotal,
    discount,
    vatRate,
    vatAmount: invoice.vatAmount,
    grandTotal: invoice.grandTotal,
    paymentMethod: invoice.paymentMethod as Sale['paymentMethod'],
  } as Sale;
};
export default function Dashboard({
  patients, // NOTE: this comes from App.tsx, which fetches it live from MongoDB (GET /api/patients)
  lang,
  setView,
  setSelectedPatient,
  onViewInvoice,
}: DashboardProps) {
  const t = TRANSLATIONS[lang];

  const [time, setTime] = useState<Date>(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatDateTime = (date: Date) => {
    const options: Intl.DateTimeFormatOptions = {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    };
    return date.toLocaleDateString(lang === 'en' ? 'en-US' : 'ne-NP', options);
  };

  // Today's date, computed live (not hardcoded)
  const todayStr = new Date().toISOString().slice(0, 10);

  // ==========================================
  // LOGGED-IN PHARMACY ID — read once from localStorage
  // ==========================================
 const [pharmacyId, setPharmacyId] = useState<string>('');

  useEffect(() => {
  try {
    const raw = localStorage.getItem(PHARMACY_USER_STORAGE_KEY);
    if (raw) {
      const storedUser = JSON.parse(raw);
      setPharmacyId(String(storedUser?.id || ''));
    }
  } catch (err) {
    console.error('Failed to parse pharmacy user from localStorage:', err);
  }
}, []);

  // Helper: safely get a patient's display id (Mongo returns both id and _id)
  const getPatientId = (p: any): string => String(p?.id || p?._id || '');

  // Helper: safely get a patient's display name (Mongo/legacy field variants)
  const getPatientName = (p: any): string => p?.fullName || p?.name || 'Unknown';

  // Helper: safely get a patient's allergies as an array (Mongo may store as comma-string)
  const getPatientAllergies = (p: any): string[] => {
    if (Array.isArray(p?.allergies)) return p.allergies;
    if (typeof p?.drugSensitivities === 'string' && p.drugSensitivities !== 'None') {
      return p.drugSensitivities.split(', ');
    }
    return [];
  };

  // Patients scoped to the logged-in pharmacy only (client-side filter,
  // since /api/patients has no pharmacyId query support on the backend)
  const scopedPatients = useMemo(() => {
    if (!pharmacyId) return [];
    return patients.filter((p: any) => String(p?.pharmacyId || '') === pharmacyId);
  }, [patients, pharmacyId]);

  // ==========================================
  // LIVE MEDICINE INVENTORY (for Low Stock + Expiring Soon)
  // ==========================================
  const [medicineRows, setMedicineRows] = useState<MedicineStockRow[]>([]);
  const [inventoryLoading, setInventoryLoading] = useState(true);
  const [inventoryError, setInventoryError] = useState('');

  const fetchInventory = async (pid: string) => {
    setInventoryLoading(true);
    setInventoryError('');
    try {
      const res = await fetch(`${INVENTORY_URL}?pharmacyId=${encodeURIComponent(pid)}`);
      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.message || 'Failed to load inventory.');
      }
      // Extra client-side safety net in case backend filter is bypassed
      const scoped = (result.data || []).filter((item: RawInventoryItem) => item.pharmacyId === pid);
      setMedicineRows(scoped.map(mapRawToMedicineRow));
    } catch (err: any) {
      setInventoryError(err.message || 'Could not connect to the server.');
    } finally {
      setInventoryLoading(false);
    }
  };

  useEffect(() => {
    if (!pharmacyId) return;
    fetchInventory(pharmacyId);
  }, [pharmacyId]);

  // ==========================================
  // LIVE BILLING LEDGER (for Recent Pharmacy Transactions + Revenue/Sales stats)
  // ==========================================
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [billsLoading, setBillsLoading] = useState(true);
  const [billsError, setBillsError] = useState('');

  const fetchBills = async (pid: string) => {
    setBillsLoading(true);
    setBillsError('');
    try {
      const res = await fetch(`${BILLS_URL}?pharmacyId=${encodeURIComponent(pid)}`);
      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.message || 'Failed to load billing ledger.');
      }
      // Extra client-side safety net in case backend filter is bypassed
      const scoped = (result.data || []).filter((line: RawBillLine) => line.pharmacyId === pid);
      setInvoices(groupBillLinesIntoInvoices(scoped));
    } catch (err: any) {
      setBillsError(err.message || 'Could not connect to the server.');
    } finally {
      setBillsLoading(false);
    }
  };

  useEffect(() => {
    if (!pharmacyId) return;
    fetchBills(pharmacyId);
  }, [pharmacyId]);

  // Filter today's entities
  const todayInvoices = useMemo(() => invoices.filter((inv) => inv.date.startsWith(todayStr)), [invoices, todayStr]);
  const todayPatients = scopedPatients.filter((p) => ((p as any).createdAt || '').startsWith(todayStr));

  // Calculating stats
  const salesCount = todayInvoices.length;
  const totalRevenue = todayInvoices.reduce((sum, inv) => sum + inv.grandTotal, 0);
  const patientsCount = todayPatients.length;

  // Low stock counts (medicine stock <= reorderLevel), live from MongoDB
  const lowStockMeds = medicineRows.filter((m) => m.stock <= m.reorderLevel);
  const lowStockCount = lowStockMeds.length;

  // Medicines expiring within the next 90 days, live from MongoDB
  const expiringMeds = useMemo(() => {
    const limitDate = new Date();
    limitDate.setDate(limitDate.getDate() + 90);
    return medicineRows.filter((m) => {
      if (!m.expiryDate) return false;
      const expDate = new Date(m.expiryDate);
      return expDate <= limitDate;
    });
  }, [medicineRows]);

  // Recent transactions (top 5), live from MongoDB
  const recentInvoicesList = invoices.slice(0, 5);

  // If there's no pharmacyId in localStorage, the user isn't logged in — don't render pharmacy data
  if (!pharmacyId) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center space-y-2" id="dashboard-no-pharmacy">
        <AlertTriangle className="h-8 w-8 text-amber-500" />
        <p className="text-sm font-medium text-gray-700">
          {lang === 'en'
            ? 'No pharmacy session found. Please log in again.'
            : 'फार्मेसी सत्र फेला परेन। कृपया फेरि लगइन गर्नुहोस्।'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6" id="dashboard-container">
      {/* Title block */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-gray-100 pb-5" id="dashboard-header">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
            <Activity className="h-6 w-6 text-teal-600" id="activity-icon" />
            {t.statsOverview}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {t.location} • {lang === 'en' ? 'Live System Feed' : 'लाइभ फिड'}
          </p>
        </div>
        <div className="mt-3 sm:mt-0 px-4 py-2 bg-teal-50/60 rounded-full text-xs font-semibold text-teal-900 flex items-center gap-2 border border-teal-100/80 transition-all hover:bg-teal-50 shadow-xs" id="dashboard-date">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-teal-500"></span>
          </span>
          <Calendar className="h-3.5 w-3.5 text-teal-600 shrink-0" />
          <span className="font-mono text-xs">{formatDateTime(time)}</span>
        </div>
      </div>

      {/* Grid Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" id="stats-grid">
        {/* Total Revenue */}
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-xs flex items-center justify-between" id="stat-revenue">
          <div className="space-y-1">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">{t.revenue}</p>
            <h3 className="text-2xl font-bold text-gray-900">
              {billsLoading ? '...' : `NPR ${totalRevenue.toLocaleString('en-NP', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            </h3>
          </div>
          <div className="p-3 bg-teal-50 rounded-lg text-teal-600">
            <TrendingUp className="h-6 w-6" />
          </div>
        </div>

        {/* Sales Today */}
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-xs flex items-center justify-between" id="stat-sales">
          <div className="space-y-1">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">{t.totalSales}</p>
            <h3 className="text-2xl font-bold text-gray-900">{billsLoading ? '...' : salesCount}</h3>
            <p className="text-xs text-gray-400">{lang === 'en' ? 'Completed checkouts' : 'सफल बिलहरू'}</p>
          </div>
          <div className="p-3 bg-blue-50 rounded-lg text-blue-600">
            <ShoppingBag className="h-6 w-6" />
          </div>
        </div>

        {/* New Patients Today */}
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-xs flex items-center justify-between" id="stat-patients">
          <div className="space-y-1">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">{t.newPatients}</p>
            <h3 className="text-2xl font-bold text-gray-900">{patientsCount}</h3>
            <p className="text-xs text-gray-400">{lang === 'en' ? 'Walk-in & Regular' : 'दर्ता गरिएका'}</p>
          </div>
          <div className="p-3 bg-indigo-50 rounded-lg text-indigo-600">
            <Users className="h-6 w-6" />
          </div>
        </div>

        {/* Low Stock Alerts */}
        <button
          onClick={() => setView('inventory')}
          className="bg-white p-5 rounded-xl border border-gray-200 shadow-xs flex items-center justify-between hover:border-amber-300 transition-colors text-left w-full group"
          id="stat-low-stock"
        >
          <div className="space-y-1">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">{t.lowStockAlerts}</p>
            <h3 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              {inventoryLoading ? '...' : lowStockCount}
              {!inventoryLoading && lowStockCount > 0 && (
                <span className="inline-flex h-2.5 w-2.5 rounded-full bg-red-600 animate-ping" />
              )}
            </h3>
            <p className="text-xs text-amber-600 font-medium group-hover:underline flex items-center gap-1">
              {lang === 'en' ? 'Review & order drugs' : 'विवरण हेर्नुहोस्'} <ArrowRight className="h-3 w-3" />
            </p>
          </div>
          <div className={`p-3 rounded-lg ${lowStockCount > 0 ? 'bg-red-50 text-red-600' : 'bg-gray-50 text-gray-400'}`}>
            <AlertTriangle className="h-6 w-6" />
          </div>
        </button>
      </div>

      {/* Two column breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6" id="dashboard-detail-grid">
        {/* Left Column: Recent Transactions */}
        <div className="lg:col-span-8 bg-white rounded-xl border border-gray-200 shadow-xs p-5 space-y-4" id="recent-sales-card">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-bold text-gray-900 tracking-tight">{t.recentSales}</h2>
            <button
              onClick={() => setView('billing')}
              className="text-xs font-medium text-teal-600 hover:text-teal-700 hover:underline flex items-center gap-1"
            >
              {lang === 'en' ? 'View all invoices' : 'सबै बिल सूची'} <ArrowRight className="h-3 w-3" />
            </button>
          </div>

          <div className="overflow-x-auto" id="recent-sales-table-wrapper">
            <table className="min-w-full divide-y divide-gray-100 text-sm">
              <thead>
                <tr className="text-left text-xs font-medium text-gray-400 uppercase tracking-wider bg-gray-50">
                  <th className="px-4 py-3 rounded-l-lg">ID</th>
                  <th className="px-4 py-3">{lang === 'en' ? 'Customer/Patient' : 'बिरामी'}</th>
                  <th className="px-4 py-3">{lang === 'en' ? 'Payment' : 'भुक्तानी'}</th>
                  <th className="px-4 py-3 text-right">{lang === 'en' ? 'Amount' : 'रकम'}</th>
                  <th className="px-4 py-3 text-center rounded-r-lg">{lang === 'en' ? 'Invoice' : 'बिल'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100" id="recent-sales-table-body">
                {billsLoading ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                      <Loader2 className="h-5 w-5 mx-auto animate-spin mb-1" />
                      {lang === 'en' ? 'Loading transactions...' : 'लोड हुँदैछ...'}
                    </td>
                  </tr>
                ) : billsError ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-red-500">
                      <PackageX className="h-5 w-5 mx-auto mb-1" />
                      {billsError}
                      <button onClick={() => fetchBills(pharmacyId)} className="block mx-auto mt-1 text-teal-600 font-bold text-xs underline">
                        {lang === 'en' ? 'Retry' : 'फेरि प्रयास गर्नुहोस्'}
                      </button>
                    </td>
                  </tr>
                ) : recentInvoicesList.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                      {t.noSalesToday}
                    </td>
                  </tr>
                ) : (
                  recentInvoicesList.map((invoice) => {
                    const patient = scopedPatients.find((p) => getPatientName(p) === invoice.billTo);
                    return (
                      <tr key={invoice.invoiceNo} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3.5 font-mono text-xs text-gray-500">{invoice.invoiceNo}</td>
                        <td className="px-4 py-3.5">
                          {patient ? (
                            <div className="space-y-0.5">
                              <span className="font-medium text-gray-900">{getPatientName(patient)}</span>
                              <div className="flex gap-1.5 items-center">
                                <span className="text-[10px] font-mono text-gray-400 bg-gray-100 px-1 py-0.5 rounded">{getPatientId(patient)}</span>
                                {getPatientAllergies(patient).length > 0 && (
                                  <span className="text-[10px] bg-red-50 text-red-600 font-medium px-1 rounded">
                                    {lang === 'en' ? 'Allergies' : 'एलर्जी'}
                                  </span>
                                )}
                              </div>
                            </div>
                          ) : (
                            <span className="text-gray-400 font-medium italic">{invoice.billTo || t.walkIn}</span>
                          )}
                        </td>
                        <td className="px-4 py-3.5">
                          <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${
                            invoice.paymentMethod === 'Cash' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' :
                            invoice.paymentMethod === 'eSewa' ? 'bg-[#60bb46]/10 text-[#60bb46] font-bold border border-[#60bb46]/20' :
                            invoice.paymentMethod === 'Khalti' ? 'bg-[#5c2d91]/10 text-[#5c2d91] font-bold border border-[#5c2d91]/20' :
                            'bg-indigo-50 text-indigo-700 border border-indigo-100'
                          }`}>
                            {invoice.paymentMethod}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-right font-medium text-gray-900 font-mono">
                          NPR {invoice.grandTotal.toFixed(2)}
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          <button
                            onClick={() => onViewInvoice(invoiceRecordToSale(invoice, scopedPatients))}
                            className="p-1 text-gray-400 hover:text-teal-600 rounded transition-colors"
                            title="View Invoice"
                          >
                            <FileText className="h-4 w-4 mx-auto" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Column: Alerts & Actions */}
        <div className="lg:col-span-4 space-y-6" id="dashboard-sidebar">
          {/* Quick Shortcuts */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-xs p-5 space-y-3" id="quick-links-card">
            <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider">{lang === 'en' ? 'Quick Operations' : 'द्रुत कार्यहरू'}</h2>
            <div className="grid grid-cols-1 gap-2">
              <button
                onClick={() => { setSelectedPatient(null); setView('patients'); }}
                className="w-full py-2.5 px-3 bg-teal-600 hover:bg-teal-700 text-white font-medium rounded-lg text-sm flex items-center justify-between transition-colors shadow-xs"
              >
                <span>{lang === 'en' ? 'Register New Patient' : 'बिरामी दर्ता गर्नुहोस'}</span>
                <Users className="h-4 w-4" />
              </button>
              <button
                onClick={() => setView('pos')}
                className="w-full py-2.5 px-3 bg-white hover:bg-gray-50 text-teal-700 font-medium rounded-lg text-sm flex items-center justify-between transition-colors border border-gray-200"
              >
                <span>{lang === 'en' ? 'Open Pharmacy Cashier' : 'नयाँ औषधी बिक्री र बिल'}</span>
                <ShoppingBag className="h-4 w-4 text-teal-600" />
              </button>
              <button
                onClick={() => setView('inventory')}
                className="w-full py-2.5 px-3 bg-white hover:bg-gray-50 text-gray-700 font-medium rounded-lg text-sm flex items-center justify-between transition-colors border border-gray-200"
              >
                <span>{lang === 'en' ? 'Adjust Stock Levels' : 'स्टक मिलाउनुहोस'}</span>
                <AlertTriangle className="h-4 w-4 text-amber-500" />
              </button>
            </div>
          </div>

          {/* Expiring Medicine Alerts — live from MongoDB */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-xs p-5 space-y-4" id="expiring-meds-card">
            <h3 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              {t.expiringMedicines}
            </h3>

            {inventoryLoading ? (
              <div className="p-4 bg-gray-50 rounded-lg text-xs text-gray-500 border border-gray-100 flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>{lang === 'en' ? 'Loading inventory...' : 'लोड हुँदैछ...'}</span>
              </div>
            ) : inventoryError ? (
              <div className="p-4 bg-red-50 rounded-lg text-xs text-red-700 border border-red-100 space-y-1">
                <p className="flex items-center gap-2">
                  <PackageX className="h-4 w-4" />
                  {inventoryError}
                </p>
                <button onClick={() => fetchInventory(pharmacyId)} className="text-teal-600 font-bold underline">
                  {lang === 'en' ? 'Retry' : 'फेरि प्रयास गर्नुहोस्'}
                </button>
              </div>
            ) : expiringMeds.length === 0 ? (
              <div className="p-4 bg-green-50/50 rounded-lg text-xs text-green-700 border border-green-100 flex items-center gap-2">
                <CheckCircle className="h-4 w-4" />
                <span>{lang === 'en' ? 'No medicines expiring in the next 90 days.' : 'अर्को ९० दिनमा म्याद सकिने औषधि छैन।'}</span>
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[220px] overflow-y-auto pr-1" id="expiring-meds-list">
                {expiringMeds.map((med) => {
                  const daysLeft = Math.ceil((new Date(med.expiryDate).getTime() - new Date().getTime()) / (1000 * 3600 * 24));
                  return (
                    <div key={med.id} className="p-3 bg-amber-50/50 rounded-lg border border-amber-100 space-y-1">
                      <div className="flex justify-between items-start text-xs">
                        <span className="font-bold text-gray-900">{med.name}</span>
                        <span className="text-[10px] font-mono text-amber-700 bg-amber-100/60 px-1 py-0.2 rounded font-medium">
                          {daysLeft > 0 ? `${daysLeft} days` : 'Expired!'}
                        </span>
                      </div>
                      <div className="flex justify-between text-[11px] text-gray-500">
                        <span>{med.genericName}</span>
                        <span className="font-mono">{t.stockInHand}: {med.stock}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}