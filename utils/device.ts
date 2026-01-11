export const isMobile = (): boolean => {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
};

let wakeLock: any = null;

export const requestWakeLock = async () => {
    try {
        if ('wakeLock' in navigator) {
            // @ts-ignore - TS might not know about wakeLock yet
            wakeLock = await navigator.wakeLock.request('screen');
            console.log('Wake Lock active');
        }
    } catch (err: any) {
        // Silently ignore errors when page is not visible (background tab)
        if (err?.name !== 'NotAllowedError') {
            console.error('Wake Lock failed:', err);
        }
    }
};

export const releaseWakeLock = async () => {
    try {
        if (wakeLock) {
            await wakeLock.release();
            wakeLock = null;
            console.log('Wake Lock released');
        }
    } catch (err) {
        console.error('Release Wake Lock failed:', err);
    }
};
