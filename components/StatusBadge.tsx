import React from 'react';
import { ConnectionStatus } from '../types';
import { LoadingIcon, CheckIcon, XIcon } from './Icons';

interface StatusBadgeProps {
    status: ConnectionStatus;
    theme: 'light' | 'dark';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, theme }) => {
    const configs: Record<ConnectionStatus, { label: string; color: string; icon?: React.ReactNode }> = {
        disconnected: { label: 'Offline', color: theme === 'dark' ? 'text-slate-400 border-slate-500/20' : 'text-slate-500 border-slate-200' },
        connecting: { label: 'Pairing...', color: 'text-blue-500 border-blue-500/30 animate-pulse', icon: <LoadingIcon className="w-3 h-3" /> },
        waiting: { label: 'Waiting for Peer', color: 'text-amber-500 border-amber-500/30', icon: <div className="w-1.5 h-1.5 rounded-full animate-pulse bg-amber-400" /> },
        'sender-connected': { label: 'Ready', color: 'text-blue-500 border-blue-500/30', icon: <CheckIcon className="w-3 h-3" /> },
        'receiver-connected': { label: 'Peer Found', color: 'text-indigo-500 border-indigo-500/30', icon: <CheckIcon className="w-3 h-3" /> },
        established: { label: 'Secured Link', color: 'text-emerald-500 border-emerald-500/30', icon: <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" /> },
        reconnecting: { label: 'Reconnecting...', color: 'text-orange-500 border-orange-500/30 animate-pulse', icon: <LoadingIcon className="w-3 h-3" /> },
        error: { label: 'Failed', color: 'text-rose-500 border-rose-500/30', icon: <XIcon className="w-3 h-3" /> }
    };

    const config = configs[status];

    return (
        <div className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest flex items-center gap-2 border transition-all ${config.color} bg-white/5`}>
            {config.icon}
            {config.label}
        </div>
    );
};
