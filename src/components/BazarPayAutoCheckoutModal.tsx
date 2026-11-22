import React, { useEffect, useRef, useState } from 'react';
import { Check, CheckCircle2, Copy, Loader2, ShieldCheck, X } from 'lucide-react';
import {
  createBazarPayPayment,
  DEFAULT_BAZARPAY_RECEIVER_NUMBERS,
  getBazarPayPayment,
  verifyBazarPayOrder,
  type BazarPayPaymentSession,
  type BazarPayReceiverNumbers,
} from '../utils/bazarpayClient';
import { resolveBanglaQrImageUrl } from '../utils/bazarpaySettings';
import type { BazarPayGateway } from '../utils/bazarpayPool';

export interface BazarPayAutoCheckoutModalProps {
  isOpen: boolean;
  orderId: string;
  amountBdt: number;
  customerName?: string;
  existingPaymentId?: string;
  banglaQrImageUrl?: string;
  receiverNumbers?: Partial<BazarPayReceiverNumbers>;
  onClose: () => void;
  onSuccess: (session: BazarPayPaymentSession) => void;
}

const GATEWAY_CONFIG: Record<
  BazarPayGateway,
  {
    label: string;
    sublabel: string;
    ussd?: string;
    activeClass: string;
    inactiveClass: string;
    borderClass: string;
    textClass: string;
    btnClass: string;
  }
> = {
  BKASH: {
    label: 'বিকাশ',
    sublabel: 'সেন্ড মানি',
    ussd: '*247#',
    activeClass: 'border-[#E2136E] bg-[#E2136E] text-white',
    inactiveClass: 'border-[#E2136E] bg-white text-[#E2136E] hover:bg-[#E2136E]/5',
    borderClass: 'border-2 border-[#E2136E]',
    textClass: 'text-[#E2136E]',
    btnClass: 'bg-[#E2136E] hover:opacity-95 text-white',
  },
  NAGAD: {
    label: 'নগদ',
    sublabel: 'সেন্ড মানি',
    ussd: '*167#',
    activeClass: 'border-[#F6921E] bg-[#F6921E] text-white',
    inactiveClass: 'border-[#F6921E] bg-white text-[#F6921E] hover:bg-[#F6921E]/5',
    borderClass: 'border-2 border-[#F6921E]',
    textClass: 'text-[#F6921E]',
    btnClass: 'bg-[#F6921E] hover:opacity-95 text-white',
  },
  ROCKET: {
    label: 'রকেট',
    sublabel: 'সেন্ড মানি',
    ussd: '*322#',
    activeClass: 'border-[#8C3494] bg-[#8C3494] text-white',
    inactiveClass: 'border-[#8C3494] bg-white text-[#8C3494] hover:bg-[#8C3494]/5',
    borderClass: 'border-2 border-[#8C3494]',
    textClass: 'text-[#8C3494]',
    btnClass: 'bg-[#8C3494] hover:opacity-95 text-white',
  },
  BANGLA_QR: {
    label: 'বাংলা QR',
    sublabel: 'স্ক্যান পে',
    activeClass: 'border-[#006A4E] bg-[#006A4E] text-white',
    inactiveClass: 'border-[#006A4E] bg-white text-[#006A4E] hover:bg-[#006A4E]/5',
    borderClass: 'border-2 border-[#006A4E]',
    textClass: 'text-[#006A4E]',
    btnClass: 'bg-[#006A4E] hover:opacity-95 text-white',
  },
};

const GATEWAY_ORDER: BazarPayGateway[] = ['BKASH', 'NAGAD', 'ROCKET', 'BANGLA_QR'];

export default function BazarPayAutoCheckoutModal({
  isOpen,
  orderId,
  amountBdt,
  customerName = 'Customer',
  existingPaymentId,
  banglaQrImageUrl,
  receiverNumbers,
  onClose,
  onSuccess,
}: BazarPayAutoCheckoutModalProps) {
  // No Default Method — User Chooses & Pays
  const [selectedGateway, setSelectedGateway] = useState<BazarPayGateway | null>(null);
  const [paymentId, setPaymentId] = useState<string>(existingPaymentId || '');
  const [paidSession, setPaidSession] = useState<BazarPayPaymentSession | null>(null);
  const [copied, setCopied] = useState(false);
  const [manualTrx, setManualTrx] = useState('');
  const [manualChecking, setManualChecking] = useState(false);
  const [manualError, setManualError] = useState('');
  const [numbers, setNumbers] = useState<BazarPayReceiverNumbers>({
    ...DEFAULT_BAZARPAY_RECEIVER_NUMBERS,
    ...(receiverNumbers || {}),
  });

  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;
  const firedSuccessRef = useRef(false);

  const resolvedQrUrl = resolveBanglaQrImageUrl(banglaQrImageUrl);

  // Reset modal state on open and register pending session on server
  useEffect(() => {
    if (!isOpen) return;
    setSelectedGateway(null);
    setPaidSession(null);
    setCopied(false);
    setManualTrx('');
    setManualError('');
    firedSuccessRef.current = false;

    if (existingPaymentId) {
      setPaymentId(existingPaymentId);
      return;
    }

    let active = true;
    createBazarPayPayment({
      orderId,
      amountBdt,
      customerName,
    }).then((res) => {
      if (!active) return;
      if (res.receiverNumbers) {
        setNumbers((prev) => ({ ...prev, ...res.receiverNumbers }));
      }
      if (res.ok && res.paymentId) {
        setPaymentId(res.paymentId);
      } else {
        setPaymentId(orderId);
      }
    });

    return () => {
      active = false;
    };
  }, [isOpen, orderId, amountBdt, customerName, existingPaymentId]);

  // Auto-poll every 3 seconds until BazarPay Android App pushes the SMS TrxID
  useEffect(() => {
    if (!isOpen || !paymentId || paidSession) return;
    let active = true;

    const checkStatus = async () => {
      try {
        const st = await getBazarPayPayment(paymentId);
        if (!active) return;
        if (st.ok && (st.paid || st.session?.status === 'PAID') && st.session) {
          setPaidSession(st.session);
          if (!firedSuccessRef.current) {
            firedSuccessRef.current = true;
            onSuccessRef.current(st.session);
          }
        }
      } catch {
        // Ignore transient network errors while polling
      }
    };

    checkStatus();
    const timer = window.setInterval(checkStatus, 3000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [isOpen, paymentId, paidSession]);

  if (!isOpen) return null;

  const activeMeta = selectedGateway ? GATEWAY_CONFIG[selectedGateway] : null;
  const activeNumber = selectedGateway
    ? numbers[selectedGateway] || DEFAULT_BAZARPAY_RECEIVER_NUMBERS[selectedGateway]
    : '';

  const handleCopyNumber = () => {
    if (navigator.clipboard && activeNumber) {
      navigator.clipboard.writeText(activeNumber).catch(() => {});
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const handleManualVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTrx = manualTrx.trim().toUpperCase();
    setManualError('');
    if (!cleanTrx) {
      setManualError('দয়া করে TrxID লিখুন।');
      return;
    }
    setManualChecking(true);
    try {
      const res = await verifyBazarPayOrder({
        orderId,
        paymentId: paymentId || undefined,
        trxId: cleanTrx,
        amountBdt,
      });
      if (!res.paid) {
        setManualError(res.message || 'TrxID যাচাই করা যায়নি।');
        return;
      }
      const verifiedSession: BazarPayPaymentSession = {
        paymentId: paymentId || orderId,
        orderId: res.orderId || orderId,
        amountBdt: Number(res.amountBdt || amountBdt),
        customerName,
        gateway: res.gateway || selectedGateway || 'BKASH',
        status: 'PAID',
        trxId: res.trxId || cleanTrx,
        receiverNumbers: numbers,
        createdAt: Date.now(),
        paidAt: Date.now(),
      };
      setPaidSession(verifiedSession);
      if (!firedSuccessRef.current) {
        firedSuccessRef.current = true;
        onSuccessRef.current(verifiedSession);
      }
    } finally {
      setManualChecking(false);
    }
  };

  return (
    <div
      data-testid="bazarpay-auto-modal"
      role="dialog"
      aria-modal="true"
      aria-label="BazarPay Auto-Verify Checkout"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
    >
      <div className="relative max-h-[92vh] w-full max-w-[420px] overflow-y-auto rounded-2xl bg-white p-5 text-center shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close BazarPay Modal"
          className="absolute top-3.5 right-3.5 rounded-full p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>

        <h3 className="m-0 mb-1 text-xl font-extrabold text-[#006A4E]">
          Pay ৳{amountBdt}
        </h3>
        <p className="m-0 mb-3 text-xs text-gray-600">
          Order: <span className="font-mono font-bold text-gray-800">{orderId}</span> • পেমেন্ট মাধ্যম নির্বাচন করুন
        </p>

        {/* 2x2 Gateway Grid — No Default Method Selected */}
        <div className="mb-3 grid grid-cols-2 gap-2">
          {GATEWAY_ORDER.map((gw) => {
            const cfg = GATEWAY_CONFIG[gw];
            const isSelected = selectedGateway === gw;
            return (
              <button
                key={gw}
                type="button"
                data-gw={gw}
                onClick={() => {
                  setSelectedGateway(gw);
                  setCopied(false);
                }}
                className={`rounded-[10px] border-2 px-2.5 py-2.5 font-bold transition cursor-pointer ${
                  isSelected ? cfg.activeClass : cfg.inactiveClass
                }`}
              >
                <span className="block text-sm leading-tight">{cfg.label}</span>
                <span className="block text-[11px] font-medium opacity-90">{cfg.sublabel}</span>
              </button>
            );
          })}
        </div>

        {/* Dynamic Payment Instructions Area */}
        {!selectedGateway ? (
          <div
            data-testid="bazarpay-modal-placeholder"
            className="rounded-xl border border-dashed border-gray-300 bg-gray-50/60 p-3.5 text-[13px] font-medium text-gray-600"
          >
            👆 পেমেন্ট করতে উপরের যেকোনো একটি মাধ্যম ক্লিক করুন
          </div>
        ) : selectedGateway === 'BANGLA_QR' ? (
          <div
            data-testid="bazarpay-modal-qr-panel"
            className="rounded-xl border-2 border-[#006A4E] bg-white p-3.5 text-center"
          >
            <p className="m-0 mb-2 text-xs font-extrabold text-[#006A4E]">
              বাংলা QR স্ক্যান করে ৳{amountBdt} পেমেন্ট করুন
            </p>
            <div className="flex justify-center">
              <img
                data-testid="bazarpay-modal-qr-image"
                src={resolvedQrUrl}
                alt="Bangla QR"
                referrerPolicy="no-referrer"
                className="h-[200px] w-[200px] rounded-[10px] border border-[#006A4E] bg-white p-1 object-contain"
              />
            </div>
            <p className="mt-2 mb-0 text-[11px] text-gray-600">
              bKash / Nagad / Rocket / যেকোনো ব্যাংক অ্যাপ দিয়ে স্ক্যান করে ৳{amountBdt} পেমেন্ট করুন
            </p>
          </div>
        ) : (
          activeMeta && (
            <div
              data-testid="bazarpay-modal-mfs-panel"
              className={`rounded-xl bg-white p-3.5 text-center ${activeMeta.borderClass}`}
            >
              <p className={`m-0 mb-1.5 text-xs font-extrabold ${activeMeta.textClass}`}>
                {activeMeta.label} পার্সোনাল নম্বর — সেন্ড মানি (Send Money)
              </p>
              <div className="my-1.5 font-mono text-xl font-black tracking-wide text-gray-900">
                {activeNumber}
              </div>
              <button
                type="button"
                onClick={handleCopyNumber}
                className={`mb-2 inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-bold transition cursor-pointer ${activeMeta.btnClass}`}
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copied ? '✅ নম্বর কপি হয়েছে' : 'নম্বর কপি করুন'}</span>
              </button>
              <p className="m-0 text-xs leading-relaxed text-gray-700">
                {activeMeta.label} অ্যাপ বা <b>{activeMeta.ussd}</b> থেকে এই পার্সোনাল নম্বরে{' '}
                <b>৳{amountBdt} সেন্ড মানি (Send Money)</b> করুন।
              </p>
            </div>
          )
        )}

        {/* Live 3-Second Auto-Poll Status Banner */}
        {paidSession ? (
          <div
            data-testid="bazarpay-auto-verified-msg"
            className="mt-3 rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-xs font-extrabold text-[#006A4E]"
          >
            <div className="flex items-center justify-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>
                ✅ পেমেন্ট অটো-ভেরিফাই সম্পন্ন! TrxID: {paidSession.trxId || 'PAID'}
              </span>
            </div>
          </div>
        ) : (
          <p
            data-testid="bazarpay-auto-poll-msg"
            className="my-2.5 flex items-center justify-center gap-1.5 text-[13px] font-bold text-[#006A4E]"
          >
            <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
            <span>⏳ টাকা পাঠালেই অটোমেটিক ভেরিফাই হয়ে পেমেন্ট সম্পন্ন হবে...</span>
          </p>
        )}

        {/* Optional Instant Manual TrxID Verification */}
        {!paidSession && (
          <form onSubmit={handleManualVerify} className="mt-2 border-t border-gray-100 pt-2.5">
            <div className="flex gap-1.5">
              <input
                type="text"
                value={manualTrx}
                onChange={(e) => {
                  setManualTrx(e.target.value);
                  setManualError('');
                }}
                placeholder="অথবা SMS TrxID দিন (ঐচ্ছিক)"
                className="flex-1 rounded-lg border border-gray-200 px-2.5 py-1.5 font-mono text-xs uppercase focus:border-[#006A4E] focus:outline-none"
              />
              <button
                type="submit"
                disabled={manualChecking}
                className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-[#006A4E] px-3 py-1.5 text-[11px] font-bold text-white hover:opacity-95 disabled:opacity-60 cursor-pointer"
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                <span>{manualChecking ? 'যাচাই...' : 'ভেরিফাই'}</span>
              </button>
            </div>
            {manualError && (
              <p className="mt-1.5 mb-0 text-[11px] font-bold text-red-600">{manualError}</p>
            )}
          </form>
        )}

        <button
          type="button"
          onClick={onClose}
          className="mt-2.5 inline-block rounded-lg px-4 py-1.5 text-xs font-semibold text-gray-500 transition hover:bg-gray-100 hover:text-gray-800 cursor-pointer"
        >
          {paidSession ? 'সম্পন্ন (বন্ধ করুন)' : 'Close'}
        </button>
      </div>
    </div>
  );
}
