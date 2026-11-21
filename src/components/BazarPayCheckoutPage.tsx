import React, { useEffect, useState } from 'react';
import { ShieldCheck, CheckCircle2, AlertCircle, Copy, Check, ArrowLeft } from 'lucide-react';
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
import BanglaQrCard from './BanglaQrCard';

interface BazarPayCheckoutPageProps {
  paymentId: string;
}

const GATEWAYS: Array<{ key: 'BKASH' | 'NAGAD' | 'ROCKET' | 'BANGLA_QR'; label: string }> = [
  { key: 'BKASH', label: 'bKash' },
  { key: 'NAGAD', label: 'Nagad' },
  { key: 'ROCKET', label: 'Rocket' },
  { key: 'BANGLA_QR', label: 'Bangla QR' },
];

export default function BazarPayCheckoutPage({ paymentId }: BazarPayCheckoutPageProps) {
  const [session, setSession] = useState<BazarPayPaymentSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [selectedGateway, setSelectedGateway] = useState<'BKASH' | 'NAGAD' | 'ROCKET' | 'BANGLA_QR'>('BKASH');
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
        const gw = String(res.session.gateway || 'BKASH').toUpperCase();
        if (gw === 'BKASH' || gw === 'NAGAD' || gw === 'ROCKET' || gw === 'BANGLA_QR') {
          setSelectedGateway(gw);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [paymentId]);

  const receiverNumbers = {
    ...DEFAULT_BAZARPAY_RECEIVER_NUMBERS,
    ...(session?.receiverNumbers || {}),
    ...bazarPaySettings.receiverNumbers,
  };
  const activeNumber = receiverNumbers[selectedGateway] || DEFAULT_BAZARPAY_RECEIVER_NUMBERS.BKASH;

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
              gateway: res.gateway || selectedGateway,
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
        <div className="bg-gradient-to-r from-emerald-700 to-emerald-600 text-white p-4 flex items-center justify-between">
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
              <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h2 className="text-lg font-extrabold text-gray-900">পেমেন্ট সফলভাবে ভেরিফাই হয়েছে!</h2>
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3.5 text-left text-xs space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-gray-600">অর্ডার আইডি:</span>
                  <span className="font-mono font-bold text-gray-900">{session.orderId}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">পরিমাণ:</span>
                  <span className="font-extrabold text-emerald-700">৳ {session.amountBdt}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">গেটওয়ে:</span>
                  <span className="font-bold text-gray-800">{session.gateway}</span>
                </div>
                {session.trxId && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">TrxID:</span>
                    <span className="font-mono font-bold text-emerald-800">{session.trxId}</span>
                  </div>
                )}
              </div>
              <a
                href="/"
                className="inline-block w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-xl text-sm shadow"
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
                  <p className="text-xl font-black text-emerald-700">৳ {session.amountBdt}</p>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-[11px] font-bold text-gray-700">BazarPay গেটওয়ে নির্বাচন করুন</label>
                <div className="grid grid-cols-4 gap-1.5">
                  {GATEWAYS.map((gw) => (
                    <button
                      key={gw.key}
                      type="button"
                      onClick={() => setSelectedGateway(gw.key)}
                      className={`py-2 px-1.5 rounded-xl border text-[11px] font-bold transition cursor-pointer ${
                        selectedGateway === gw.key
                          ? 'border-emerald-600 bg-emerald-50 text-emerald-800 ring-2 ring-emerald-200'
                          : 'border-gray-200 bg-white text-gray-600'
                      }`}
                    >
                      {gw.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3.5 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-[11px] font-semibold text-gray-600">BazarPay {selectedGateway} নম্বর:</p>
                    <p className="text-base font-mono font-black text-red-600 tracking-wide">{activeNumber}</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="bg-white hover:bg-emerald-100 border border-emerald-300 text-emerald-800 px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer"
                  >
                    {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied ? 'কপি হয়েছে' : 'কপি'}</span>
                  </button>
                </div>
                <p className="text-[11px] text-gray-600 leading-relaxed">
                  উপরের নম্বরে <b>৳ {session.amountBdt}</b> সেন্ড মানি/পেমেন্ট করে SMS-এ পাওয়া <b>TrxID</b> নিচে বসান।
                </p>
                {selectedGateway === 'BANGLA_QR' && (
                  <BanglaQrCard
                    receiverNumber={activeNumber}
                    amountBdt={session.amountBdt}
                    orderId={session.orderId}
                    qrImageUrl={bazarPaySettings.banglaQrImageUrl}
                    qrPayloadOverride={bazarPaySettings.banglaQrPayload || session.banglaQrPayload}
                  />
                )}
              </div>

              <form onSubmit={handleVerify} className="space-y-3">
                <input
                  type="text"
                  placeholder="ট্রানজেকশন আইডি (যেমন: 9J4K2L)"
                  value={trxId}
                  onChange={(e) => {
                    setTrxId(e.target.value);
                    setVerifyError('');
                  }}
                  className="w-full border-2 border-emerald-200 focus:border-emerald-600 rounded-xl p-3 text-sm font-mono uppercase focus:outline-none"
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
                  className="w-full bg-gradient-to-r from-emerald-600 to-emerald-700 hover:opacity-95 disabled:opacity-60 text-white font-bold py-3 rounded-xl text-sm shadow-lg cursor-pointer"
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
