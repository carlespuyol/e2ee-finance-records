import { DecryptedRecord } from '../types';

interface Props {
  records: DecryptedRecord[];
  loading: boolean;
  onDelete: (id: number) => void;
}

export default function RecordList({ records, loading, onDelete }: Props) {
  return (
    <section className="bg-slate-900/60 backdrop-blur-sm border border-slate-800 rounded-2xl p-6 shadow-xl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-violet-500/15 rounded-lg flex items-center justify-center border border-violet-500/25">
            <svg className="w-4 h-4 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
            </svg>
          </div>
          <div>
            <h2 className="text-base font-semibold text-white">Finance Records</h2>
            <p className="text-xs text-slate-500 mt-0.5">Decrypted locally in your browser</p>
          </div>
        </div>
        {!loading && records.length > 0 && (
          <span className="text-xs text-slate-500 bg-slate-800/60 border border-slate-700/50 rounded-lg px-2.5 py-1">
            {records.length} {records.length === 1 ? 'record' : 'records'}
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <svg className="animate-spin w-5 h-5 text-indigo-400" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="text-slate-500 text-sm">Decrypting records…</p>
        </div>
      ) : records.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center gap-4">
          <div className="w-12 h-12 bg-slate-800/60 rounded-xl flex items-center justify-center border border-slate-700/50">
            <svg className="w-5 h-5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
          </div>
          <div>
            <p className="text-slate-400 text-sm font-medium">No records yet</p>
            <p className="text-slate-600 text-xs mt-1">Add your first finance record above</p>
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto -mx-6 px-6">
          <table className="w-full min-w-[640px]">
            <thead>
              <tr className="border-b border-slate-800/80">
                {['Product', 'Price', 'Seller', 'Sales Person', 'Date', ''].map(h => (
                  <th
                    key={h}
                    className="text-left text-xs font-medium text-slate-600 uppercase tracking-wider pb-3 pr-6 last:pr-0"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {records.map(r => (
                <tr key={r.id} className="group">
                  <td className="py-3.5 pr-6 text-sm font-medium text-white">{r.productName}</td>
                  <td className="py-3.5 pr-6 text-sm text-slate-300 tabular-nums">
                    ${Number(r.price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="py-3.5 pr-6 text-sm text-slate-400">{r.seller}</td>
                  <td className="py-3.5 pr-6 text-sm text-slate-400">{r.salesPerson}</td>
                  <td className="py-3.5 pr-6 text-sm text-slate-500 tabular-nums whitespace-nowrap">
                    {new Date(r.time).toLocaleString(undefined, {
                      year: 'numeric', month: 'short', day: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </td>
                  <td className="py-3.5">
                    <button
                      onClick={() => onDelete(r.id)}
                      title="Delete record"
                      className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-slate-600 hover:text-red-400 transition-all duration-150 p-1.5 rounded-lg hover:bg-red-400/10"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
