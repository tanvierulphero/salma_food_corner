import React, { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { Download, QrCode } from 'lucide-react';
import { buildBanglaQrPayload } from '../utils/bazarpayPool';

interface BanglaQrCardProps {
  receiverNumber: string;
  amountBdt: number;
  orderId?: string;
  qrPayloadOverride?: string;
  compact?: boolean;
}

export default function BanglaQrCard({
  receiverNumber,
  amountBdt,
  orderId,
  qrPayloadOverride,
  compact = false,
}: BanglaQrCardProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');

  const qrString = useMemo(() => {
    if (qrPayloadOverride && qrPayloadOverride.trim().length > 0) {
      return qrPayloadOverride.trim();
    }
    return buildBanglaQrPayload({
      receiverNumber,
      amountBdt,
      orderId,
    });
  }, [qrPayloadOverride, receiverNumber, amountBdt, orderId]);

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(qrString, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: compact ? 180 : 220,
      color: {
        dark: '#064e3b',
        light: '#ffffff',
      },
    })
      .then((url) => {
        if (active) setQrDataUrl(url);
      })
      .catch(() => {
        if (active) setQrDataUrl('');
      });

    return () => {
      active = false;
    };
  }, [qrString, compact]);

  return (
    <div
      data-testid="bangla-qr-card"
      className="bg-white border border-emerald-200 rounded-2xl overflow-hidden shadow-xs"
    >
      <div className="bg-gradient-to-r from-emerald-700 via-emerald-600 to-red-600 px-3 py-1.5 flex items-center justify-between text-white">
        <div className="flex items-center gap-1.5">
          <QrCode className="w-4 h-4" />
          <span className="text-[11px] font-black tracking-wider uppercase">BANGLA QR</span>
        </div>
        <span className="text-[11px] font-extrabold bg-black/25 px-2 py-0.5 rounded-md">
          ৳ {amountBdt}
        </span>
      </div>

      <div className="p-3 flex flex-col items-center text-center gap-2">
        <div className="bg-white p-2 rounded-xl border-2 border-emerald-100 shadow-xs inline-flex items-center justify-center">
          {qrDataUrl ? (
            <img
              data-testid="bangla-qr-image"
              src={qrDataUrl}
              alt="Bangla QR Code"
              className={compact ? 'w-36 h-36 object-contain' : 'w-44 h-44 object-contain'}
            />
          ) : (
            <div
              className={`${compact ? 'w-36 h-36' : 'w-44 h-44'} flex flex-col items-center justify-center text-emerald-700 text-xs font-semibold`}
            >
              <QrCode className="w-8 h-8 animate-pulse mb-1" />
              <span>QR তৈরি হচ্ছে...</span>
            </div>
          )}
        </div>

        <p className="text-[11px] text-gray-600 leading-snug">
          যেকোনো ব্যাংক অ্যাপ বা bKash/Nagad/Rocket/Upay থেকে <b>Bangla QR</b> স্ক্যান করে <b>৳ {amountBdt}</b> পেমেন্ট করুন
        </p>

        {qrDataUrl && (
          <a
            href={qrDataUrl}
            download={`bangla-qr-${orderId || 'salma-food'}.png`}
            className="inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-3 py-1 rounded-lg transition"
          >
            <Download className="w-3.5 h-3.5" />
            <span>QR কোড সেভ করুন</span>
          </a>
        )}
      </div>
    </div>
  );
}
