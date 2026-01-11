import React, { useState, useEffect } from 'react';
import { FileIcon, ImageFileIcon } from './Icons';

interface FileItem {
    file: File;
    path?: string;
}

interface FilePreviewProps {
    files: FileItem[];
    onRemove: (index: number) => void;
    theme: 'light' | 'dark';
}

export const FilePreview: React.FC<FilePreviewProps> = ({ files, onRemove, theme }) => {
    return (
        <div className="flex flex-col gap-2">
            {files.map((item, index) => (
                <div key={index} className={`relative flex items-center p-3 rounded-xl border ${theme === 'dark'
                    ? 'bg-slate-800 border-slate-700 text-slate-300'
                    : 'bg-white border-slate-200 text-slate-600'
                    }`}>
                    <div className="flex-shrink-0 mr-3">
                        {item.file.type.startsWith('image/') ? <ImageFileIcon className="w-8 h-8 opacity-80" /> : <FileIcon className="w-8 h-8 opacity-80" />}
                    </div>
                    <div className="flex-1 min-w-0 pr-8">
                        <p className="text-xs font-bold truncate">{item.file.name}</p>
                        <p className="text-[10px] opacity-60 uppercase tracking-wider">{item.path || 'Root'}</p>
                    </div>
                    <button
                        onClick={() => onRemove(index)}
                        className={`absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full hover:bg-white/10 transition-colors`}
                    >
                        <span className="sr-only">Remove</span>
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                    {/* Size Badge */}
                    <div className={`absolute -top-2 -right-2 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border ${theme === 'dark' ? 'bg-slate-700 border-slate-600 text-slate-400' :
                        'bg-slate-100 border-slate-200 text-slate-500'
                        }`}>
                        {(item.file.size / 1024 / 1024).toFixed(1)} MB
                    </div>
                </div>
            ))}
            {files.length === 0 && (
                <div className={`text-center py-8 opacity-50 text-xs uppercase tracking-widest font-bold ${theme === 'dark' ? 'text-slate-500' :
                    'text-slate-400'
                    }`}>
                    No files selected
                </div>
            )}
        </div>
    );
};

