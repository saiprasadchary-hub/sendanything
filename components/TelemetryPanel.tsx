import React from 'react';

interface TelemetryPanelProps {
    rtt: number;
    chunkSize: number;
    theme: 'light' | 'dark';
}

export const TelemetryPanel: React.FC<TelemetryPanelProps> = ({ rtt, chunkSize, theme }) => {
    const textColor = theme === 'dark' ? 'text-slate-200' : 'text-slate-700';
    const bg = theme === 'dark' ? 'bg-slate-800/50 border-slate-700' : 'bg-white/50 border-slate-200';

    const qualityColor = rtt < 50 ? 'text-emerald-500' : rtt < 150 ? 'text-amber-500' : 'text-rose-500';

    return (
        <div className={`fixed top-20 left-4 z-40 p-3 rounded-lg border text-[10px] font-mono backdrop-blur-md flex flex-col gap-1 w-32 ${bg} ${textColor} transition-all`}>
            <div className="flex justify-between">
                <span>PING:</span>
                <span className={`font-black ${qualityColor} `}>{rtt}ms</span>
            </div>
            <div className="flex justify-between">
                <span>CHUNK:</span>
                <span className="font-bold">{(chunkSize / 1024).toFixed(0)}KB</span>
            </div>
        </div>
    );
};
