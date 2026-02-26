import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import { encrypt } from '../services/crypto';
import { FinanceRecord } from '../types';

interface Props {
  onAdded: () => void;
}

type FormState = Record<keyof FinanceRecord, string>;

function defaultForm(): FormState {
  return {
    productName: '',
    price: '',
    seller: '',
    salesPerson: '',
    time: new Date().toISOString().slice(0, 16),
  };
}

export default function RecordForm({ onAdded }: Props) {
  const { auth, logout } = useAuth();
  const [form, setForm] = useState<FormState>(defaultForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!auth) return;
    setSaving(true);
    setError('');
    setSuccess(false);

    try {
      const record: FinanceRecord = {
        productName: form.productName.trim(),
        price: parseFloat(form.price) || 0,
        seller: form.seller.trim(),
        salesPerson: form.salesPerson.trim(),
        time: new Date(form.time).toISOString(),
      };

      // Encrypt the entire record as a single JSON blob — no plaintext fields reach the server
      const { ciphertext, iv } = await encrypt(auth.cryptoKey, JSON.stringify(record));
      await api.createRecord(auth.token, ciphertext, iv);

      setForm(defaultForm());
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
      onAdded();
    } catch (err: unknown) {
      const apiErr = err as { status?: number; message?: string };
      if (apiErr.status === 401) logout();
      else setError(apiErr.message || 'Failed to save record');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="bg-slate-900/60 backdrop-blur-sm border border-slate-800 rounded-2xl p-6 shadow-xl">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-8 h-8 bg-emerald-500/15 rounded-lg flex items-center justify-center border border-emerald-500/25">
          <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        </div>
        <div>
          <h2 className="text-base font-semibold text-white">Add Finance Record</h2>
          <p className="text-xs text-slate-500 mt-0.5">Encrypted before leaving your browser</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Field label="Product Name" name="productName" type="text"
          value={form.productName} onChange={handleChange} required placeholder="e.g. MacBook Pro" maxLength={200} />
        <Field label="Price" name="price" type="number"
          value={form.price} onChange={handleChange} required placeholder="0.00" min="0" step="0.01" />
        <Field label="Seller" name="seller" type="text"
          value={form.seller} onChange={handleChange} required placeholder="e.g. Apple Store" maxLength={200} />
        <Field label="Sales Person" name="salesPerson" type="text"
          value={form.salesPerson} onChange={handleChange} required placeholder="e.g. John Smith" maxLength={200} />
        <Field label="Date & Time" name="time" type="datetime-local"
          value={form.time} onChange={handleChange} required />

        <div className="flex items-end">
          <button
            type="submit"
            disabled={saving}
            className="w-full bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium py-3 px-4 rounded-xl transition-all duration-200 flex items-center justify-center gap-2 text-sm shadow-lg shadow-emerald-500/15"
          >
            {saving ? (
              <>
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Encrypting…
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                </svg>
                Encrypt & Save
              </>
            )}
          </button>
        </div>
      </form>

      {success && (
        <div className="mt-4 flex items-center gap-2.5 bg-emerald-500/8 border border-emerald-500/20 rounded-xl px-4 py-3">
          <svg className="w-4 h-4 text-emerald-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-emerald-400 text-sm">Record encrypted and saved.</p>
        </div>
      )}

      {error && (
        <div className="mt-4 flex items-center gap-2.5 bg-red-500/8 border border-red-500/20 rounded-xl px-4 py-3">
          <svg className="w-4 h-4 text-red-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}
    </section>
  );
}

function Field(props: { label: string; name: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  const { label, name, ...inputProps } = props;
  return (
    <div>
      <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">
        {label}
      </label>
      <input
        name={name}
        {...inputProps}
        className="w-full bg-slate-950/50 border border-slate-800 rounded-xl px-4 py-3 text-white text-sm placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500/60 transition-all"
      />
    </div>
  );
}
