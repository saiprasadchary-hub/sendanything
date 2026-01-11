import React from 'react';
import QRCode from 'react-qr-code';

interface QRCodeDisplayProps {
    url: string;
    theme: 'light' | 'dark';
}

export const QRCodeDisplay: React.FC<QRCodeDisplayProps> = ({ url, theme }) => {
    return (
        <div className={`p-4 rounded-2xl bg-white shadow-xl inline-block`}>
            <div style={{ height: "auto", margin: "0 auto", maxWidth: 128, width: "100%" }}>
                <QRCode
                    size={256}
                    style={{ height: "auto", maxWidth: "100%", width: "100%" }}
                    value={url}
                    viewBox={`0 0 256 256`}
                    fgColor="#000000"
                    bgColor="#FFFFFF"
                />
            </div>
        </div>
    );
};
