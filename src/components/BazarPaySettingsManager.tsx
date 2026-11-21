import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Image as ImageIcon,
  QrCode,
  RefreshCw,
  Save,
  ShieldCheck,
  Trash2,
  Upload,
  Wallet,
} from 'lucide-react';
import {
  loadBazarPaySettings,
  saveBazarPaySettings,
  type BazarPaySettings,
} from '../utils/bazarpaySettings';
import { uploadFoodImageToCpanel } from '../utils/sqlSync';
import BanglaQrCard from './BanglaQrCard';

interface WalletSummary {
  ok: boolean;
  currency: string;
  totalSettledBdt: number;
  verifiedCount: number;
  unclaimedCount: number;
}

export default function BazarPaySettingsManager() {
  const [settings, setSettings] = useState<BazarPaySettings>(() => loadBazarPaySettings());
  const [uploading, setUploading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [walletSummary, setWalletSummary] = useState<WalletSummary | null>(null);
  const [loadingWallet, setLoadingWallet] = useState(false);

  const fetchWalletSummary = async () => {
    setLoadingWallet(true);
    try {
      let res = await fetch('/api/bazarpay/wallet/summary', { cache: 'no-store' });
      const ct = res.headers.get('content-type') || '';
      if (!res.ok || !ct.includes('application/json')) {
        res = await fetch('/api.php?action=bazarpay_wallet_summary', { cache: 'no-store' });
      }
      const data = await res.json().catch(() => null);
      if (data && data.ok) {
        setWalletSummary(data);
      }
    } catch {
      // Ignore network errors
    } finally {
      setLoadingWallet(false);
    }
  };

  useEffect(() => {
    fetchWalletSummary();
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'salma_bazarpay_settings') {
        setSettings(loadBazarPaySettings());
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const handleQrImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setStatusMsg(null);
    try {
      const res = await uploadFoodImageToCpanel(file);
      if (res.ok && res.imageUrl) {
        const next = saveBazarPaySettings({
          ...settings,
          banglaQrImageUrl: res.imageUrl,
        });
        setSettings(next);
        setStatusMsg({
          type: 'ok',
          text: 'আপনার অফিশিয়াল BazarPay Bangla QR ছবি সফলভাবে সেভ হয়েছে! এখন চেকআউটে সরাসরি এটিই দেখাবে।',
        });
      } else {
        setStatusMsg({ type: 'err', text: res.message || 'ছবি আপলোড করা যায়নি।' });
      }
    } catch {
      setStatusMsg({ type: 'err', text: 'QR ছবি আপলোড করতে সমস্যা হয়েছে।' });
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleRemoveQrImage = () => {
    const next = saveBazarPaySettings({
      ...settings,
      banglaQrImageUrl: '',
    });
    setSettings(next);
    setStatusMsg({ type: 'ok', text: 'আপলোড করা QR ছবি সরানো হয়েছে।' });
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const saved = saveBazarPaySettings(settings);
    setSettings(saved);
    setStatusMsg({
      type: 'ok',
      text: 'BazarPay Bangla QR ও রিসিভার নম্বর স্থায়ীভাবে ডাটাবেসে সেভ হয়েছে!',
    });
  };

  return (
    <div className="space-y-4 pb-6">
      <div className="bg-gradient-to-r from-emerald-700 via-emerald-600 to-teal-700 text-white rounded-2xl p-4 shadow-md">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold leading-tight">BazarPay ও Bangla QR সেটিংস</h2>
              <p className="text-[11px] text-emerald-100">
                BazarPay-এর আসল Bangla QR ছবি বা কোড এখানে সেভ করলে গ্রাহকরা চেকআউটে সরাসরি দেখতে পাবে
              </p>
            </div>
          </div>
          <ShieldCheck className="w-6 h-6 text-emerald-200 shrink-0" />
        </div>
      </div>

      {/* Live BazarPay Wallet Summary */}
      <div className="bg-white border border-emerald-200 rounded-2xl p-3.5 shadow-xs space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-extrabold text-emerald-900">
            <Wallet className="w-4 h-4 text-emerald-600" />
            <span>BazarPay লাইভ ওয়ালেট সামারি</span>
          </div>
          <button
            type="button"
            onClick={fetchWalletSummary}
            disabled={loadingWallet}
            className="text-[11px] font-bold text-emerald-700 hover:bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg flex items-center gap-1 cursor-pointer"
          >
            <RefreshCw className={`w-3 h-3 ${loadingWallet ? 'animate-spin' : ''}`} />
            <span>রিফ্রেশ</span>
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-2">
            <p className="text-[10px] text-gray-500 font-semibold">মোট সেটেলড</p>
            <p className="text-sm font-black text-emerald-700">৳ {walletSummary?.totalSettledBdt ?? 0}</p>
          </div>
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-2">
            <p className="text-[10px] text-gray-500 font-semibold">ভেরিফায়েড</p>
            <p className="text-sm font-black text-blue-700">{walletSummary?.verifiedCount ?? 0} টি</p>
          </div>
          <div className="bg-amber-50 border border-amber-100 rounded-xl p-2">
            <p className="text-[10px] text-gray-500 font-semibold">আনক্লেইমড</p>
            <p className="text-sm font-black text-amber-700">{walletSummary?.unclaimedCount ?? 0} টি</p>
          </div>
        </div>
      </div>

      {statusMsg && (
        <div
          className={`rounded-xl px-3.5 py-2.5 text-xs font-bold flex items-center gap-2 border ${
            statusMsg.type === 'ok'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-red-50 text-red-700 border-red-200'
          }`}
        >
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{statusMsg.text}</span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-4">
        {/* Step 1: Upload Official BazarPay Bangla QR Image */}
        <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-xs space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ImageIcon className="w-4 h-4 text-emerald-600" />
              <h3 className="text-xs font-extrabold text-gray-900">
                ১. BazarPay-এর Bangla QR ছবি আপলোড করুন (সবচেয়ে সহজ)
              </h3>
            </div>
            {settings.banglaQrImageUrl && (
              <button
                type="button"
                onClick={handleRemoveQrImage}
                className="text-[11px] font-bold text-red-600 hover:bg-red-50 px-2 py-1 rounded-lg flex items-center gap-1 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>মুছুন</span>
              </button>
            )}
          </div>
          <p className="text-[11px] text-gray-600 leading-relaxed">
            আপনার BazarPay ড্যাশবোর্ড বা ব্যাংক/MFS অ্যাপ থেকে পাওয়া আসল <b>Bangla QR</b>-এর ছবি/স্ক্রিনশট এখানে আপলোড করুন। এটি cPanel-এর <code className="font-mono bg-gray-100 px-1 rounded">uploads/</code> ফোল্ডার ও ডাটাবেসে স্থায়ীভাবে সেভ থাকবে।
          </p>

          <label className="flex items-center justify-center gap-2 w-full border-2 border-dashed border-emerald-300 bg-emerald-50/60 hover:bg-emerald-50 text-emerald-800 font-bold text-xs py-3 px-4 rounded-xl cursor-pointer transition">
            <Upload className="w-4 h-4" />
            <span>
              {uploading
                ? 'Bangla QR ছবি আপলোড হচ্ছে...'
                : settings.banglaQrImageUrl
                  ? 'নতুন Bangla QR ছবি পরিবর্তন করুন'
                  : 'BazarPay Bangla QR ছবি বেছে নিন (PNG / JPG)'}
            </span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={handleQrImageUpload}
              disabled={uploading}
              className="hidden"
            />
          </label>
        </div>

        {/* Step 2: Optional EMVCo Bangla QR Payload String */}
        <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-xs space-y-2">
          <label className="block text-xs font-extrabold text-gray-900">
            ২. অথবা অফিশিয়াল Bangla QR কোড টেক্সট পেস্ট করুন (ঐচ্ছিক)
          </label>
          <p className="text-[11px] text-gray-500">
            যদি BazarPay থেকে <code className="font-mono bg-gray-100 px-1 rounded">000201...</code> দিয়ে শুরু হওয়া Bangla QR টেক্সট স্ট্রিং পেয়ে থাকেন, সেটি এখানে বসালে স্বয়ংক্রিয়ভাবে হুবহু QR কোড তৈরি হয়ে যাবে।
          </p>
          <textarea
            rows={3}
            value={settings.banglaQrPayload}
            onChange={(e) => setSettings((prev) => ({ ...prev, banglaQrPayload: e.target.value }))}
            placeholder="00020101021126..."
            className="w-full border border-gray-300 focus:border-emerald-600 rounded-xl p-2.5 text-xs font-mono focus:outline-none"
          />
        </div>

        {/* Step 3: Receiver Numbers */}
        <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-xs space-y-3">
          <h3 className="text-xs font-extrabold text-gray-900">
            ৩. BazarPay রিসিভার নম্বরসমূহ
          </h3>
          <div className="grid grid-cols-2 gap-2.5">
            {(
              [
                { key: 'BKASH', label: 'bKash নম্বর' },
                { key: 'NAGAD', label: 'Nagad নম্বর' },
                { key: 'ROCKET', label: 'Rocket নম্বর' },
                { key: 'BANGLA_QR', label: 'Bangla QR নম্বর' },
              ] as const
            ).map((field) => (
              <div key={field.key}>
                <label className="block text-[10px] font-bold text-gray-600 mb-1">
                  {field.label}
                </label>
                <input
                  type="text"
                  value={settings.receiverNumbers[field.key]}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      receiverNumbers: {
                        ...prev.receiverNumbers,
                        [field.key]: e.target.value,
                      },
                    }))
                  }
                  className="w-full border border-gray-300 focus:border-emerald-600 rounded-lg px-2.5 py-2 text-xs font-mono focus:outline-none"
                />
              </div>
            ))}
          </div>
        </div>

        <button
          type="submit"
          className="w-full bg-gradient-to-r from-emerald-600 to-teal-700 hover:opacity-95 text-white font-extrabold text-sm py-3 rounded-xl shadow-md flex items-center justify-center gap-2 cursor-pointer"
        >
          <Save className="w-4 h-4" />
          <span>BazarPay ও Bangla QR সেটিংস সেভ করুন</span>
        </button>
      </form>

      {/* Live Preview of Customer Checkout View */}
      <div className="space-y-2">
        <p className="text-xs font-extrabold text-gray-700">
          লাইভ প্রিভিউ (গ্রাহক চেকআউট পেজে যেমন দেখবে):
        </p>
        <BanglaQrCard
          receiverNumber={settings.receiverNumbers.BANGLA_QR}
          amountBdt={450}
          orderId="PREVIEW-101"
          qrImageUrl={settings.banglaQrImageUrl}
          qrPayloadOverride={settings.banglaQrPayload}
        />
      </div>
    </div>
  );
}
