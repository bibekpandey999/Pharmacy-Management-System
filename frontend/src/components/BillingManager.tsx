import React, { useState, useEffect, useMemo } from 'react';
import {
  FileText,
  Search,
  Settings,
  AlertOctagon,
  Activity,
  Percent,
  Loader2,
  PackageX,
  Database,
} from 'lucide-react';
import { Sale, Patient } from '../types';
import { TRANSLATIONS } from '../translations';
import { LocalDB } from '../db';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const BILLS_URL = `${API_BASE}/api/bills`;

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

interface BillingManagerProps {
  sales: Sale[];
  patients: Patient[];
  lang: 'en' | 'ne';
  currentUserRole: 'Receptionist' | 'Pharmacist' | 'Owner';
  onBillingUpdated: () => void;
  onViewInvoice: (sale: Sale) => void;
}

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
  pharmacyId: string;
  pharmacyName?: string;
  location?: string;
  panOrVat?: string;
  createdAt?: string;
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

export default function BillingManager({
  patients,
  lang,
  currentUserRole,
  onViewInvoice,
}: BillingManagerProps) {
  const t = TRANSLATIONS[lang];
  const [pharmacyId, setPharmacyId] = useState<string>(getLoggedInPharmacyId());
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [billsLoading, setBillsLoading] = useState(true);
  const [billsError, setBillsError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [vatRateInput, setVatRateInput] = useState<number>(13);
  const [vatRateSuccessMsg, setVatRateSuccessMsg] = useState('');

  useEffect(() => {
    const settings = LocalDB.getSettings();
    if (settings) {
      setVatRateInput(settings.vatRate);
    }
  }, []);

  const fetchBills = async () => {
    setBillsLoading(true);
    setBillsError('');

    const currentPharmacyId = getLoggedInPharmacyId();
    setPharmacyId(currentPharmacyId);

    if (!currentPharmacyId) {
      setBillsError(
        lang === 'en'
          ? 'No pharmacy ID found. Please log in again.'
          : 'फार्मेसी आईडी फेला परेन। कृपया फेरि लगइन गर्नुहोस्।'
      );
      setInvoices([]);
      setBillsLoading(false);
      return;
    }

    try {
      const url = `${BILLS_URL}?pharmacyId=${encodeURIComponent(currentPharmacyId)}`;
      const res = await fetch(url);
      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.message || 'Failed to load billing ledger.');
      }

      const scopedLines = (result.data || []).filter(
        (line: RawBillLine) => String(line.pharmacyId || '').trim() === String(currentPharmacyId).trim()
      );

      setInvoices(groupBillLinesIntoInvoices(scopedLines));
    } catch (err: any) {
      setBillsError(err.message || 'Could not connect to the server.');
    } finally {
      setBillsLoading(false);
    }
  };

  useEffect(() => {
    fetchBills();
  }, []);

  const filteredInvoices = useMemo(() => {
    if (!searchQuery.trim()) return invoices;
    const q = searchQuery.toLowerCase().trim();
    return invoices.filter((inv) => {
      const patient = patients.find((p) => p.fullName === inv.billTo);
      return (
        inv.invoiceNo.toLowerCase().includes(q) ||
        inv.billTo.toLowerCase().includes(q) ||
        (patient && patient.id.toLowerCase().includes(q))
      );
    });
  }, [searchQuery, invoices, patients]);

  const todayStr = new Date().toISOString().slice(0, 10);
  const todaysInvoices = invoices.filter((inv) => inv.date.startsWith(todayStr));

  const cashToday = todaysInvoices.filter((s) => s.paymentMethod === 'Cash').reduce((sum, s) => sum + s.grandTotal, 0);
  const esewaToday = todaysInvoices.filter((s) => s.paymentMethod === 'eSewa').reduce((sum, s) => sum + s.grandTotal, 0);
  const khaltiToday = todaysInvoices.filter((s) => s.paymentMethod === 'Khalti').reduce((sum, s) => sum + s.grandTotal, 0);
  const imeToday = todaysInvoices.filter((s) => s.paymentMethod === 'IME Pay').reduce((sum, s) => sum + s.grandTotal, 0);

  const totalTaxableToday = todaysInvoices.reduce((sum, s) => sum + s.taxableAmount, 0);
  const totalVatToday = todaysInvoices.reduce((sum, s) => sum + s.vatAmount, 0);

  const handleUpdateVATRate = (e: React.FormEvent) => {
    e.preventDefault();
    setVatRateSuccessMsg('');

    if (currentUserRole !== 'Owner') return;

    LocalDB.saveSettings({ vatRate: vatRateInput });
    setVatRateSuccessMsg(lang === 'en' ? 'Central VAT Rate updated successfully for new bills.' : 'केन्द्रीय भ्याट दर सफलतापूर्वक अद्यावधिक गरियो।');
    setTimeout(() => setVatRateSuccessMsg(''), 4000);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6" id="billing-root">
      <div className="lg:col-span-8 space-y-6" id="billing-ledger-card">
        <div className="bg-white rounded-xl border border-gray-200 shadow-xs p-5 space-y-4" id="daily-summary-ledger">
          <h2 className="text-base font-bold text-gray-900 tracking-tight flex items-center gap-1.5 uppercase">
            <Activity className="h-5 w-5 text-teal-600" />
            {t.dailySummary}
          </h2>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4" id="daily-summary-grid">
            <div className="p-4 bg-gray-50 border border-gray-150 rounded-xl space-y-1">
              <span className="text-[10px] uppercase font-bold text-gray-400 block tracking-wider">💵 CASH RECONC.</span>
              <p className="font-mono font-bold text-gray-900 text-sm">NPR {cashToday.toFixed(2)}</p>
            </div>
            <div className="p-4 bg-gray-50 border border-gray-150 rounded-xl space-y-1">
              <span className="text-[10px] uppercase font-bold text-[#60bb46] block tracking-wider">🟢 eSewa Total</span>
              <p className="font-mono font-bold text-gray-900 text-sm">NPR {esewaToday.toFixed(2)}</p>
            </div>
            <div className="p-4 bg-gray-50 border border-gray-150 rounded-xl space-y-1">
              <span className="text-[10px] uppercase font-bold text-[#5c2d91] block tracking-wider">🟣 Khalti Total</span>
              <p className="font-mono font-bold text-gray-900 text-sm">NPR {khaltiToday.toFixed(2)}</p>
            </div>
            <div className="p-4 bg-gray-50 border border-gray-150 rounded-xl space-y-1">
              <span className="text-[10px] uppercase font-bold text-red-500 block tracking-wider">🔴 IME Pay Total</span>
              <p className="font-mono font-bold text-gray-900 text-sm">NPR {imeToday.toFixed(2)}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-gray-100 pt-3 text-xs text-gray-600" id="daily-vat-summary">
            <div className="flex justify-between items-center p-3.5 bg-teal-50/20 border border-teal-100 rounded-xl">
              <span className="font-bold text-teal-800 uppercase tracking-wider text-[10px]">{lang === 'en' ? 'Taxable Revenue' : 'कर योग्य कुल संकलन'}</span>
              <span className="font-mono font-bold text-gray-900">NPR {totalTaxableToday.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center p-3.5 bg-indigo-50/20 border border-indigo-100 rounded-xl">
              <span className="font-bold text-indigo-800 uppercase tracking-wider text-[10px]">{t.vatCollected} (VAT)</span>
              <span className="font-mono font-bold text-teal-700">NPR {totalVatToday.toFixed(2)}</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-xs p-5 space-y-4" id="invoices-ledger-panel">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center pb-2 border-b border-gray-100 gap-3">
            <h2 className="text-base font-bold text-gray-900 tracking-tight flex items-center gap-2">
              <FileText className="h-5 w-5 text-teal-600" />
              {t.invoiceList}
            </h2>
            {billsLoading ? null : (
              <button onClick={fetchBills} className="text-[11px] font-bold text-teal-600 hover:text-teal-700 uppercase tracking-wider">
                {lang === 'en' ? 'Refresh' : 'ताजा गर्नुहोस्'}
              </button>
            )}
          </div>

          <div className="relative text-xs" id="invoice-search-group">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={lang === 'en' ? 'Search by Invoice No, Patient ID, or Patient Name...' : 'बिल नम्बर वा बिरामीको नाम हाल्नुहोस्...'}
              className="w-full pl-8 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-hidden"
            />
          </div>

          <div className="overflow-x-auto border border-gray-100 rounded-lg" id="invoice-ledger-table-wrapper">
            <table className="min-w-full divide-y divide-gray-100 text-xs">
              <thead>
                <tr className="text-left text-gray-400 uppercase tracking-wider bg-gray-50">
                  <th className="px-4 py-3">Invoice ID</th>
                  <th className="px-4 py-3">{lang === 'en' ? 'Patient Client' : 'बिरामी'}</th>
                  <th className="px-4 py-3">{lang === 'en' ? 'Method' : 'भुक्तानी'}</th>
                  <th className="px-4 py-3 text-right">{t.taxableAmount}</th>
                  <th className="px-4 py-3 text-right">VAT</th>
                  <th className="px-4 py-3 text-right">Total Invoice</th>
                  <th className="px-4 py-3 text-center">{t.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100" id="invoice-ledger-table-body">
                {billsLoading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-gray-400">
                      <Loader2 className="h-6 w-6 mx-auto animate-spin mb-2" />
                      {lang === 'en' ? 'Loading billing ledger...' : 'लोड हुँदैछ...'}
                    </td>
                  </tr>
                ) : billsError ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-red-500">
                      <PackageX className="h-6 w-6 mx-auto mb-2" />
                      <p>{billsError}</p>
                      <button onClick={fetchBills} className="text-teal-600 font-bold text-xs underline mt-1">
                        {lang === 'en' ? 'Retry' : 'फेरि प्रयास गर्नुहोस्'}
                      </button>
                    </td>
                  </tr>
                ) : filteredInvoices.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-gray-400 italic">
                      <Database className="h-6 w-6 mx-auto mb-2 stroke-1" />
                      No invoices match criteria.
                    </td>
                  </tr>
                ) : (
                  filteredInvoices.map((invoice) => {
                    const pat = patients.find((p) => p.fullName === invoice.billTo);

                    return (
                      <tr key={invoice.invoiceNo} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-4 py-3.5 font-mono text-gray-500 font-bold">{invoice.invoiceNo}</td>
                        <td className="px-4 py-3.5">
                          {pat ? (
                            <div className="space-y-0.5">
                              <span className="font-bold text-gray-900">{pat.fullName}</span>
                              <span className="text-[10px] text-gray-400 block font-mono">({pat.id})</span>
                            </div>
                          ) : (
                            <span className="text-gray-400 italic">{invoice.billTo || t.walkIn}</span>
                          )}
                        </td>
                        <td className="px-4 py-3.5">
                          <span className={`inline-flex px-1.5 py-0.2 rounded font-bold text-[10px] uppercase border ${
                            invoice.paymentMethod === 'Cash' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' :
                            invoice.paymentMethod === 'eSewa' ? 'bg-[#60bb46]/10 text-[#4c9b36] border-[#60bb46]/30' :
                            'bg-indigo-50 text-indigo-700 border-indigo-200'
                          }`}>
                            {invoice.paymentMethod}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-right font-mono">
                          NPR {invoice.taxableAmount.toFixed(2)}
                        </td>
                        <td className="px-4 py-3.5 text-right font-mono">
                          NPR {invoice.vatAmount.toFixed(2)}
                        </td>
                        <td className="px-4 py-3.5 text-right font-mono font-bold text-teal-700 font-semibold">
                          NPR {invoice.grandTotal.toFixed(2)}
                        </td>
                       <td className="px-4 py-3.5 text-center">
                       <button
                         onClick={() => onViewInvoice(invoiceRecordToSale(invoice, patients))}
                         className="p-1 hover:bg-gray-100 rounded text-gray-500 hover:text-teal-600"
                         title="View/Print Thermal Invoice"
                       >
                         <FileText className="h-4 w-4" />
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
      </div>

      <div className="lg:col-span-4 space-y-6" id="billing-sidebar">
        <div className="bg-white rounded-xl border border-gray-200 shadow-xs p-5 space-y-4" id="vat-config-panel">
          <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider flex items-center gap-1.5 border-b border-gray-100 pb-2">
            <Settings className="h-4.5 w-4.5 text-gray-400" />
            {t.vatRateConfig}
          </h3>

          {currentUserRole !== 'Owner' ? (
            <div className="p-4 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-900 space-y-1">
              <p className="font-bold flex items-center gap-1">
                <AlertOctagon className="h-4 w-4 text-amber-600" />
                🔒 Gated Setting
              </p>
              <p>Only the **Clinic Owner** role is authorized to adjust tax/VAT percentage settings. Please change your active role in the header toggle.</p>
            </div>
          ) : (
            <form onSubmit={handleUpdateVATRate} className="space-y-4 text-xs text-gray-700" id="vat-rate-form">
              {vatRateSuccessMsg && (
                <p className="text-xs text-green-600 font-bold bg-green-50 p-2 border border-green-200 rounded-lg">{vatRateSuccessMsg}</p>
              )}

              <div className="space-y-1">
                <label className="font-bold text-gray-500 uppercase tracking-wider block">{t.appliedRate}</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type="number"
                      min="0"
                      max="40"
                      required
                      value={vatRateInput}
                      onChange={(e) => setVatRateInput(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg font-mono font-bold text-gray-950 text-sm focus:outline-hidden"
                    />
                    <Percent className="absolute right-3 top-2.5 h-4 w-4 text-gray-400" />
                  </div>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-bold uppercase tracking-wider"
                  >
                    Apply
                  </button>
                </div>
              </div>

              <div className="p-3 bg-teal-50/50 rounded-lg text-teal-800 space-y-1 border border-teal-100/50 leading-relaxed">
                <p className="font-bold flex items-center gap-1">
                  <Percent className="h-4.5 w-4.5 text-teal-600" />
                  VAT Math Audit Note:
                </p>
                <p>{t.vatSettingWarning}</p>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}