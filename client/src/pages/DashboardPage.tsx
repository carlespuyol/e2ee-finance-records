import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import { decrypt } from '../services/crypto';
import { DecryptedRecord, StoredEncryptedRecord } from '../types';
import RecordForm from '../components/RecordForm';
import RecordList from '../components/RecordList';

export default function DashboardPage() {
  const { auth, logout } = useAuth();
  const [records, setRecords] = useState<DecryptedRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchAndDecrypt = useCallback(async () => {
    if (!auth) return;
    setLoading(true);
    setError('');
    try {
      const { records: encrypted } = await api.getRecords(auth.token);
      const decrypted = await Promise.all(
        encrypted.map(async (r: StoredEncryptedRecord): Promise<DecryptedRecord> => {
          const plaintext = await decrypt(auth.cryptoKey, r.encryptedData, r.iv);
          const data = JSON.parse(plaintext);
          return { ...data, id: r.id, createdAt: r.createdAt };
        })
      );
      setRecords(decrypted);
    } catch (err: unknown) {
      const apiErr = err as { status?: number; message?: string };
      if (apiErr.status === 401) {
        logout();
        return;
      }
      setError('Failed to load records.');
    } finally {
      setLoading(false);
    }
  }, [auth, logout]);

  useEffect(() => {
    fetchAndDecrypt();
  }, [fetchAndDecrypt]);

  async function handleDelete(id: number) {
    if (!auth) return;
    try {
      await api.deleteRecord(auth.token, id);
      setRecords(prev => prev.filter(r => r.id !== id));
    } catch (err: unknown) {
      const apiErr = err as { status?: number };
      if (apiErr.status === 401) logout();
      else setError('Failed to delete record.');
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">

      {/* Sticky header */}
      <header className="border-b border-slate-800/60 bg-slate-950/70 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-indigo-500/15 rounded-lg flex items-center justify-center border border-indigo-500/25">
              <svg className="w-3.5 h-3.5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
              </svg>
            </div>
            <span className="font-semibold text-white text-sm tracking-tight">SecureVault</span>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500 hidden sm:block">{auth?.user.email}</span>
            <div className="w-px h-4 bg-slate-800 hidden sm:block" />
            <button
              onClick={logout}
              className="text-xs text-slate-500 hover:text-white transition-colors px-2.5 py-1.5 rounded-lg hover:bg-slate-800/60"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {error && (
          <div className="flex items-center gap-2.5 bg-red-500/8 border border-red-500/20 rounded-xl px-4 py-3">
            <svg className="w-4 h-4 text-red-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        <RecordForm onAdded={fetchAndDecrypt} />
        <RecordList records={records} loading={loading} onDelete={handleDelete} />
      </main>
    </div>
  );
}
