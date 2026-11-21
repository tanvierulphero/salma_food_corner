import React, { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { Download, QrCode } from 'lucide-react';
import { buildBanglaQrPayload } from '../utils/bazarpayPool';
import { resolveBanglaQrImageUrl } from '../utils/bazarpaySettings';

interface BanglaQrCardProps {
  receiverNumber: string;
  amountBdt: number;
  orderId?: string;
  qrImageUrl?: string;
  qrPayloadOverride?: string;
  compact?: boolean;
}

export default function BanglaQrCard({
  receiverNumber,
  amountBdt,
  orderId,
  qrImageUrl,
  qrPayloadOverride,
  compact = false,
}: BanglaQrCardProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [remoteImgFailed, setRemoteImgFailed] = useState(false);

  const officialImageSrc = useMemo(
    () => resolveBanglaQrImageUrl(qrImageUrl, qrPayloadOverride),
    [qrImageUrl, qrPayloadOverride]
  );

  useEffect(() => {
    setRemoteImgFailed(false);
  }, [officialImageSrc]);

  const activeCustomImageSrc = remoteImgFailed ? '' : officialImageSrc;
  const hasCustomPayload = Boolean(qrPayloadOverride && qrPayloadOverride.trim().length > 0);

  const qrString = useMemo(() => {
    if (hasCustomPayload && qrPayloadOverride) {
      return qrPayloadOverride.trim();
    }
    return buildBanglaQrPayload({
      receiverNumber,
      amountBdt,
      orderId,
    });
  }, [hasCustomPayload, qrPayloadOverride, receiverNumber, amountBdt, orderId]);

  useEffect(() => {
    if (activeCustomImageSrc) {
      setQrDataUrl('');
      return;
    }
    let active = true;
    QRCode.toDataURL(qrString, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 220,
      color: {
        dark: '#006A4E',
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
  }, [activeCustomImageSrc, qrString]);

  const displayImageSrc = activeCustomImageSrc || qrDataUrl;

  return (
    <div
      data-testid="bangla-qr-card"
      className="mx-auto w-full max-w-[360px] rounded-[14px] border-2 border-[#006A4E] bg-white p-4 text-center shadow-xs"
    >
      <h3 className="m-0 mb-2 text-base font-extrabold text-[#006A4E]">
        Scan Bangla QR to Pay
      </h3>

      <div className="flex justify-center">
        {displayImageSrc ? (
          <img
            data-testid="bangla-qr-image"
            src={displayImageSrc}
            alt="Bangla QR"
            referrerPolicy="no-referrer"
            onError={() => {
              if (activeCustomImageSrc) {
                setRemoteImgFailed(true);
              }
            }}
            className={`${
              compact ? 'h-[200px] w-[200px] sm:h-[220px] sm:w-[220px]' : 'h-[220px] w-[220px]'
            } rounded-[10px] border border-[#006A4E] bg-white p-1.5 object-contain`}
          />
        ) : (
          <div className="flex h-[220px] w-[220px] flex-col items-center justify-center rounded-[10px] border border-[#006A4E] text-xs font-semibold text-[#006A4E]">
            <QrCode className="mb-1 h-8 w-8 animate-pulse" />
            <span>QR তৈরি হচ্ছে...</span>
          </div>
        )}
      </div>

      <p className="mt-2 mb-0 text-[12px] leading-snug text-[#444444]">
        bKash / Nagad / Rocket / যেকোনো ব্যাংক অ্যাপ দিয়ে স্ক্যান করে TrxID দিন
      </p>

      {displayImageSrc && (
        <div className="mt-2.5 flex justify-center">
          <a
            href={displayImageSrc}
            download={`bangla-qr-${orderId || 'salma-food'}.png`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-bold text-[#006A4E] transition hover:bg-emerald-100"
          >
            <Download className="h-3.5 w-3.5" />
            <span>QR কোড সেভ করুন</span>
          </a>
        </div>
      )}
    </div>
  );
}
