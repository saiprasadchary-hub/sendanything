import React from 'react';
import { HistoryItem } from '../types';

interface TransferHistoryProps {
    history: HistoryItem[];
    theme: 'light' | 'dark';
    onClear: () => void;
    formatSize: (bytes: number) => string;
    onDownload?: (item: HistoryItem) => void;
    canDownload?: (item: HistoryItem) => boolean;
}

export const TransferHistory: React.FC<TransferHistoryProps> = ({ history, theme, onClear, formatSize, onDownload, canDownload }) => {
    const isDark = theme === 'dark';

    return (
        <div className={`pt-4 sm:pt-6 border-t ${isDark ? 'border-slate-700/50' : 'border-slate-200'}`}>
            <div className="flex items-center justify-between mb-4 sm:mb-6">
                <h3 className={`text-[9px] font-black uppercase tracking-[0.2em] ${isDark ? 'text-slate-500' : 'text-slate-400'} flex items-center gap-2`}>
                    Transfer History
                </h3>
                <button onClick={onClear} className={`text-[8px] font-black hover:opacity-70 transition-opacity uppercase tracking-widest px-2 py-1 rounded-lg border text-rose-500 bg-rose-500/5 border-rose-500/10`}>Clear</button>
            </div>
            <div className="space-y-3 max-h-40 sm:max-h-56 overflow-y-auto pr-1 no-scrollbar">
                {history.map(item => (
                    <div key={item.id} className={`p-3 sm:p-4 rounded-xl sm:rounded-2xl border flex items-center justify-between group transition-all hover:translate-x-1 ${isDark ? 'bg-slate-800/30 border-slate-700/40 hover:bg-slate-800/50' : 'bg-white border-slate-200 shadow-sm hover:shadow-md'}`}>
                        <div className="min-w-0 flex-1 mr-4">
                            <div className="flex items-center gap-2 mb-1">
                                <span className={`text-[7px] font-black uppercase tracking-tighter px-1.5 py-0.5 rounded ${item.type === 'sent' ? 'bg-blue-500/10 text-blue-500 border border-blue-500/20' : 'bg-purple-500/10 text-purple-500 border border-purple-500/20'}`}>
                                    {item.type}
                                </span>
                                <span className={`text-[9px] font-bold ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{new Date(item.timestamp).toLocaleDateString()}</span>
                            </div>
                            <div className={`text-xs sm:text-sm font-bold truncate w-full ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                                {item.files.length} {item.files.length === 1 ? 'file' : 'files'}
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className={`text-[10px] sm:text-[11px] font-black tabular-nums ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{formatSize(item.totalSize)}</div>
                            {canDownload && canDownload(item) && (
                                <button
                                    onClick={(e) => { e.stopPropagation(); onDownload && onDownload(item); }}
                                    className={`p-1.5 rounded-lg transition-colors ${isDark ? 'bg-slate-700 hover:bg-slate-600 text-blue-400' : 'bg-blue-50 hover:bg-blue-100 text-blue-600'}`}
                                    title="Download Again"
                                >
                                    <svg className="w-3 h-3 rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 10l7 7m0 0l7-7m-7 7V3" /></svg>
                                </button>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
