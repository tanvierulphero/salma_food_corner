import React, { useEffect, useState } from 'react';
import { ShieldCheck, CheckCircle2, AlertCircle, Copy, Check, ArrowLeft, Loader2 } from 'lucide-react';
import {
  DEFAULT_BAZARPAY_RECEIVER_NUMBERS,
  getBazarPayPayment,
  verifyBazarPayOrder,
  type BazarPayPaymentSession,
} from '../utils/bazarpayClient';
import {
  BAZARPAY_SETTINGS_KEY,
  loadBazarPaySettings,
  type BazarPaySettings,
} from '../utils/bazarpaySettings';
import type { BazarPayGateway } from '../utils/bazarpayPool';
import BanglaQrCard from './BanglaQrCard';

interface BazarPayCheckoutPageProps {
  paymentId: string;
}

const GATEWAYS: Array<{
  key: BazarPayGateway;
  label: string;
  sublabel: string;
  ussd?: string;
  activeClass: string;
  inactiveClass: string;
  borderClass: string;
  textClass: string;
  btnClass: string;
}> = [
  {
    key: 'BKASH',
    label: 'বিকাশ',
    sublabel: 'সেন্ড মানি',
    ussd: '*247#',
    activeClass: 'border-[#E2136E] bg-[#E2136E] text-white',
    inactiveClass: 'border-[#E2136E] bg-white text-[#E2136E]',
    borderClass: 'border-2 border-[#E2136E]',
    textClass: 'text-[#E2136E]',
    btnClass: 'bg-[#E2136E] text-white',
  },
  {
    key: 'NAGAD',
    label: 'নগদ',
    sublabel: 'সেন্ড মানি',
    ussd: '*167#',
    activeClass: 'border-[#F6921E] bg-[#F6921E] text-white',
    inactiveClass: 'border-[#F6921E] bg-white text-[#F6921E]',
    borderClass: 'border-2 border-[#F6921E]',
    textClass: 'text-[#F6921E]',
    btnClass: 'bg-[#F6921E] text-white',
  },
  {
    key: 'ROCKET',
    label: 'রকেট',
    sublabel: 'সেন্ড মানি',
    ussd: '*322#',
    activeClass: 'border-[#8C3494] bg-[#8C3494] text-white',
    inactiveClass: 'border-[#8C3494] bg-white text-[#8C3494]',
    borderClass: 'border-2 border-[#8C3494]',
    textClass: 'text-[#8C3494]',
    btnClass: 'bg-[#8C3494] text-white',
  },
  {
    key: 'BANGLA_QR',
    label: 'বাংলা QR',
    sublabel: 'স্ক্যান পে',
    activeClass: 'border-[#006A4E] bg-[#006A4E] text-white',
    inactiveClass: 'border-[#006A4E] bg-white text-[#006A4E]',
    borderClass: 'border-2 border-[#006A4E]',
    textClass: 'text-[#006A4E]',
    btnClass: 'bg-[#006A4E] text-white',
  },
];

export default function BazarPayCheckoutPage({ paymentId }: BazarPayCheckoutPageProps) {
  const [session, setSession] = useState<BazarPayPaymentSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [selectedGateway, setSelectedGateway] = useState<BazarPayGateway | null>(null);
  const [trxId, setTrxId] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState('');
  const [copied, setCopied] = useState(false);
  const [bazarPaySettings, setBazarPaySettings] = useState<BazarPaySettings>(() =>
    loadBazarPaySettings()
  );

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === BAZARPAY_SETTINGS_KEY) {
        setBazarPaySettings(loadBazarPaySettings());
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError('');
    getBazarPayPayment(paymentId)
      .then((res) => {
        if (!active) return;
        if (!res.ok || !res.session) {
          setLoadError(res.error || 'পেমেন্ট সেশন পাওয়া যায়নি।');
          return;
        }
        setSession(res.session);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [paymentId]);

  // Auto-poll every 3 seconds until Android Bridge webhook auto-verifies the payment
  useEffect(() => {
    if (!session || session.status === 'PAID') return;
    let active = true;
    const timer = window.setInterval(async () => {
      try {
        const st = await getBazarPayPayment(paymentId);
        if (!active) return;
        if (st.ok && (st.paid || st.session?.status === 'PAID') && st.session) {
          setSession(st.session);
        }
      } catch {
        // Ignore transient polling failures
      }
    }, 3000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [paymentId, session?.status]);

  const receiverNumbers = {
    ...DEFAULT_BAZARPAY_RECEIVER_NUMBERS,
    ...(session?.receiverNumbers || {}),
    ...bazarPaySettings.receiverNumbers,
  };
  const activeMeta = selectedGateway ? GATEWAYS.find((g) => g.key === selectedGateway) || null : null;
  const activeNumber = selectedGateway
    ? receiverNumbers[selectedGateway] || DEFAULT_BAZARPAY_RECEIVER_NUMBERS.BKASH
    : DEFAULT_BAZARPAY_RECEIVER_NUMBERS.BKASH;

  const handleCopy = () => {
    if (navigator.clipboard && activeNumber) {
      navigator.clipboard.writeText(activeNumber).catch(() => {});
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session) return;
    const cleanTrx = trxId.trim().toUpperCase();
    setVerifyError('');
    if (!cleanTrx) {
      setVerifyError('দয়া করে পেমেন্টের TrxID লিখুন।');
      return;
    }

    setVerifying(true);
    try {
      const res = await verifyBazarPayOrder({
        orderId: session.orderId,
        paymentId: session.paymentId,
        trxId: cleanTrx,
        amountBdt: session.amountBdt,
      });
      if (!res.paid) {
        setVerifyError(res.message || 'TrxID যাচাই করা যায়নি।');
        return;
      }
      setSession((prev) =>
        prev
          ? {
              ...prev,
              status: 'PAID',
              trxId: res.trxId || cleanTrx,
              gateway: res.gateway || selectedGateway || 'BKASH',
              paidAt: Date.now(),
            }
          : prev
      );
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-950 via-gray-900 to-red-950 flex items-center justify-center p-4">
      <div className="max-w-[430px] w-full bg-white rounded-3xl shadow-2xl overflow-hidden border border-emerald-200">
        <div className="bg-gradient-to-r from-[#006A4E] to-emerald-600 text-white p-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base font-extrabold leading-tight">BazarPay Checkout</h1>
              <p className="text-[11px] text-emerald-100">সালমা ফুড কর্ণার, গাজীপুর</p>
            </div>
          </div>
          <a
            href="/"
            className="text-xs font-bold bg-white/15 hover:bg-white/25 px-2.5 py-1.5 rounded-lg flex items-center gap-1 transition"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>হোম</span>
          </a>
        </div>

        <div className="p-5 space-y-4">
          {loading ? (
            <div className="py-12 text-center text-sm text-gray-500 font-semibold">
              পেমেন্ট সেশন লোড হচ্ছে...
            </div>
          ) : loadError || !session ? (
            <div className="py-8 text-center space-y-3">
              <AlertCircle className="w-10 h-10 text-red-500 mx-auto" />
              <p className="text-sm font-bold text-gray-800">{loadError || 'পেমেন্ট সেশন পাওয়া যায়নি।'}</p>
              <a
                href="/"
                className="inline-block bg-red-600 text-white text-xs font-bold px-4 py-2 rounded-xl"
              >
                ওয়েবসাইটে ফিরে যান
              </a>
            </div>
          ) : session.status === 'PAID' ? (
            <div className="py-6 text-center space-y-3">
              <div className="w-14 h-14 rounded-full bg-emerald-100 text-[#006A4E] flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h2 className="text-lg font-extrabold text-gray-900">পেমেন্ট অটো-ভেরিফাই সম্পন্ন!</h2>
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3.5 text-left text-xs space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-gray-600">অর্ডার আইডি:</span>
                  <span className="font-mono font-bold text-gray-900">{session.orderId}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">পরিমাণ:</span>
                  <span className="font-extrabold text-[#006A4E]">৳ {session.amountBdt}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">গেটওয়ে:</span>
                  <span className="font-bold text-gray-800">{session.gateway}</span>
                </div>
                {session.trxId && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">TrxID:</span>
                    <span className="font-mono font-bold text-[#006A4E]">{session.trxId}</span>
                  </div>
                )}
              </div>
              <a
                href="/"
                className="inline-block w-full bg-[#006A4E] hover:opacity-95 text-white font-bold py-3 rounded-xl text-sm shadow"
              >
                ওয়েবসাইটে ফিরে যান
              </a>
            </div>
          ) : (
            <>
              <div className="bg-gray-50 border border-gray-200 rounded-2xl p-3.5 flex items-center justify-between">
                <div>
                  <p className="text-[11px] text-gray-500">অর্ডার: <b className="font-mono text-gray-800">{session.orderId}</b></p>
                  <p className="text-xs font-bold text-gray-800 mt-0.5">{session.customerName}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-gray-500">প্রদেয় টাকা</p>
                  <p className="text-xl font-black text-[#006A4E]">৳ {session.amountBdt}</p>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-[11px] font-bold text-gray-700 text-center">
                  পেমেন্ট মাধ্যম নির্বাচন করুন
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {GATEWAYS.map((gw) => (
                    <button
                      key={gw.key}
                      type="button"
                      data-gw={gw.key}
                      onClick={() => {
                        setSelectedGateway(gw.key);
                        setCopied(false);
                      }}
                      className={`py-2.5 px-2 rounded-xl border-2 text-center font-bold transition cursor-pointer ${
                        selectedGateway === gw.key ? gw.activeClass : gw.inactiveClass
                      }`}
                    >
                      <span className="block text-sm leading-tight">{gw.label}</span>
                      <span className="block text-[11px] font-medium opacity-90">{gw.sublabel}</span>
                    </button>
                  ))}
                </div>
              </div>

              {!selectedGateway ? (
                <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-3.5 text-center text-xs font-semibold text-gray-600">
                  👆 পেমেন্ট করতে উপরের যেকোনো একটি মাধ্যম ক্লিক করুন
                </div>
              ) : selectedGateway === 'BANGLA_QR' ? (
                <BanglaQrCard
                  receiverNumber={activeNumber}
                  amountBdt={session.amountBdt}
                  orderId={session.orderId}
                  qrImageUrl={bazarPaySettings.banglaQrImageUrl}
                  qrPayloadOverride={bazarPaySettings.banglaQrPayload}
                />
              ) : (
                activeMeta && (
                  <div className={`rounded-2xl bg-white p-4 text-center space-y-2 ${activeMeta.borderClass}`}>
                    <p className={`text-xs font-extrabold ${activeMeta.textClass}`}>
                      {activeMeta.label} পার্সোনাল নম্বর (সেন্ড মানি)
                    </p>
                    <p className="text-xl font-mono font-black text-gray-900 tracking-wide">
                      {activeNumber}
                    </p>
                    <button
                      type="button"
                      onClick={handleCopy}
                      className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${activeMeta.btnClass}`}
                    >
                      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copied ? '✅ কপি হয়েছে' : 'নম্বর কপি করুন'}</span>
                    </button>
                    <p className="text-xs text-gray-700 leading-relaxed">
                      {activeMeta.label} অ্যাপ বা <b>{activeMeta.ussd}</b> থেকে এই পার্সোনাল নম্বরে{' '}
                      <b>৳{session.amountBdt} সেন্ড মানি (Send Money)</b> করুন।
                    </p>
                  </div>
                )
              )}

              <p className="text-center text-xs font-bold text-[#006A4E] flex items-center justify-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                <span>⏳ টাকা পাঠালেই অটোমেটিক ভেরিফাই হয়ে যাবে...</span>
              </p>

              <form onSubmit={handleVerify} className="space-y-2.5 border-t border-gray-100 pt-3">
                <input
                  type="text"
                  placeholder="অথবা ট্রানজেকশন আইডি (যেমন: 9J4K2L)"
                  value={trxId}
                  onChange={(e) => {
                    setTrxId(e.target.value);
                    setVerifyError('');
                  }}
                  className="w-full border-2 border-emerald-200 focus:border-[#006A4E] rounded-xl p-3 text-sm font-mono uppercase focus:outline-none"
                />

                {verifyError && (
                  <div className="text-xs font-bold text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2 flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{verifyError}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={verifying}
                  className="w-full bg-gradient-to-r from-[#006A4E] to-emerald-700 hover:opacity-95 disabled:opacity-60 text-white font-bold py-3 rounded-xl text-sm shadow-lg cursor-pointer"
                >
                  {verifying ? 'BazarPay যাচাই হচ্ছে...' : `৳ ${session.amountBdt} পেমেন্ট ভেরিফাই করুন`}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
