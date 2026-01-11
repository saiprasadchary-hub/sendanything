import React, { useEffect, useRef } from 'react';

interface SpeedGraphProps {
    speed: number; // bytes per second
    theme: 'light' | 'dark';
}

export const SpeedGraph: React.FC<SpeedGraphProps> = ({ speed, theme }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const historyRef = useRef<number[]>(new Array(60).fill(0)); // Keep last 60 points
    const animationRef = useRef<number>(0);

    useEffect(() => {
        // Shift history and add new point (convert to Mbps for better scale)
        const mbps = (speed * 8) / (1024 * 1024);
        historyRef.current.push(mbps);
        if (historyRef.current.length > 60) historyRef.current.shift();
    }, [speed]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const draw = () => {
            const { width, height } = canvas;
            ctx.clearRect(0, 0, width, height);

            const data = historyRef.current;
            const max = Math.max(...data, 1); // Avoid div by zero, min 1 Mbps scale
            const step = width / (data.length - 1);

            // Gradient
            const gradient = ctx.createLinearGradient(0, 0, 0, height);
            gradient.addColorStop(0, theme === 'dark' ? 'rgba(59, 130, 246, 0.5)' : 'rgba(59, 130, 246, 0.4)');
            gradient.addColorStop(1, theme === 'dark' ? 'rgba(59, 130, 246, 0.0)' : 'rgba(59, 130, 246, 0.0)');

            // Path
            ctx.beginPath();
            ctx.moveTo(0, height);

            data.forEach((val, i) => {
                const x = i * step;
                const y = height - (val / max) * height * 0.9; // Use 90% height max
                ctx.lineTo(x, y);
            });

            ctx.lineTo(width, height);
            ctx.closePath();

            ctx.fillStyle = gradient;
            ctx.fill();

            // Line
            ctx.beginPath();
            data.forEach((val, i) => {
                const x = i * step;
                const y = height - (val / max) * height * 0.9;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            });
            ctx.strokeStyle = '#3b82f6';
            ctx.lineWidth = 2;
            ctx.stroke();

            animationRef.current = requestAnimationFrame(draw);
        };

        draw();
        return () => cancelAnimationFrame(animationRef.current);
    }, [theme]); // Re-init loop if theme changes (for gradient)

    return (
        <div className={`w-full h-24 rounded-xl overflow-hidden relative border ${theme === 'dark' ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'} mb-4`}>
            <canvas ref={canvasRef} width={300} height={100} className="w-full h-full" />
            <div className={`absolute top-2 left-2 text-[9px] font-black uppercase tracking-widest opacity-50 pointer-events-none`}>
                Network Activity
            </div>
            <div className={`absolute bottom-2 right-2 text-xs font-bold tabular-nums text-blue-500`}>
                {((speed * 8) / (1024 * 1024)).toFixed(1)} Mbps
            </div>
        </div>
    );
};
