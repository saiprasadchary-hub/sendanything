import React, { useEffect, useRef } from 'react';

interface ParticleCanvasProps {
    theme: 'light' | 'dark' | 'neon' | 'hyper';
    speed: number; // Current transfer speed in bytes/sec
}

class Particle {
    x: number;
    y: number;
    size: number;
    speedX: number;
    speedY: number;
    color: string;

    constructor(w: number, h: number, theme: 'light' | 'dark' | 'neon' | 'hyper') {
        this.x = Math.random() * w;
        this.y = Math.random() * h;
        this.size = Math.random() * 2;
        this.speedX = (Math.random() - 0.5) * 0.5;
        this.speedY = (Math.random() - 0.5) * 0.5;

        if (theme === 'neon') this.color = `rgba(0, 255, 0, ${Math.random() * 0.5})`;
        else if (theme === 'hyper') this.color = `rgba(59, 130, 246, ${Math.random() * 0.5})`;
        else if (theme === 'dark') this.color = `rgba(100, 150, 255, ${Math.random() * 0.5})`;
        else this.color = `rgba(0, 0, 0, ${Math.random() * 0.2})`;
    }

    update(w: number, h: number, speed: number) {
        // Warp speed effect: particles move faster and towards center based on transfer speed
        const speedFactor = 1 + (speed / (1024 * 1024)) * 5; // Scale speed effect

        this.x += this.speedX * speedFactor;
        this.y += this.speedY * speedFactor;

        if (this.x > w) this.x = 0;
        else if (this.x < 0) this.x = w;
        if (this.y > h) this.y = 0;
        else if (this.y < 0) this.y = h;
    }

    draw(ctx: CanvasRenderingContext2D) {
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
    }
}

export const ParticleCanvas: React.FC<ParticleCanvasProps> = ({ theme, speed }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const animationRef = useRef<number>(0);
    const particlesRef = useRef<Particle[]>([]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const resize = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
            initParticles(canvas.width, canvas.height);
        };

        const initParticles = (w: number, h: number) => {
            const count = theme === 'neon' ? 150 : 100;
            particlesRef.current = [];
            for (let i = 0; i < count; i++) {
                particlesRef.current.push(new Particle(w, h, theme));
            }
        };

        window.addEventListener('resize', resize);
        resize();

        const animate = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            particlesRef.current.forEach(p => {
                p.update(canvas.width, canvas.height, speed);
                p.draw(ctx);
            });
            animationRef.current = requestAnimationFrame(animate);
        };

        animate();

        return () => {
            window.removeEventListener('resize', resize);
            cancelAnimationFrame(animationRef.current);
        };
    }, [theme]); // Re-init on theme change

    // Update particle colors without re-init if possible? No, simplest to re-gen on theme change.
    // But we need to update speed live without re-init.
    // The animate loop closes over 'speed' prop? No, useEffect runs once.
    // We need a ref for speed.

    const speedRef = useRef(speed);
    useEffect(() => { speedRef.current = speed; }, [speed]);

    // We need to rewrite the animate loop to use the ref, otherwise it uses stale closure
    useEffect(() => {
        // This effect handles the animation loop separately from init
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const animate = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            particlesRef.current.forEach(p => {
                p.update(canvas.width, canvas.height, speedRef.current);
                p.draw(ctx);
            });
            animationRef.current = requestAnimationFrame(animate);
        };
        animate();
        return () => cancelAnimationFrame(animationRef.current);
    }, [theme]); // Re-bind loop when particles get reset by theme


    return (
        <canvas
            ref={canvasRef}
            className="fixed inset-0 z-0 pointer-events-none"
            style={{ opacity: theme === 'neon' ? 0.8 : 0.4 }}
        />
    );
};
