import React, { useState, useEffect } from 'react';
import { 
  Smartphone, Send, Settings, CheckCircle2, AlertCircle, Copy, 
  ExternalLink, Users, Sparkles, Filter, RefreshCw, MessageSquare, 
  Clock, ShieldCheck, Check, Info, ChevronRight, Phone, ArrowUpRight,
  Trash2, Edit3, Sliders, Radio, CheckSquare, Square, Zap, Tag
} from 'lucide-react';
import { CustomerProfile, SmsCampaignLog, SmsGatewayConfig } from '../types';
import { playOrderSuccessSound, playAddToCartSound } from '../utils/audioFeedback';
import { saveToCpanelDb } from '../utils/sqlSync';

interface SmsMarketingPanelProps {
  customers: Record<string, CustomerProfile>;
  soundOn?: boolean;
  activeOffer?: string;
  onOfferUpdate?: (newOffer: string) => void;
}

const PRESET_TEMPLATES = [
  {
    id: 'friday_special',
    title: '🍛 শুক্রবার স্পেশাল কাচ্চি ২০% ছাড়',
    category: 'অফার ও ডিসকাউন্ট',
    message: 'সম্মানিত {name}, আজকের জুম্মা স্পেশাল খাসির কাচ্চিতে ২০% মেগা ছাড়! ফ্রি হোম ডেলিভারির জন্য এখনই অর্ডার করুন সালমা ফুড কর্নারে: 01712-345678'
  },
  {
    id: 'free_delivery',
    title: '🚚 ১ কি.মি. ফ্রি হোম ডেলিভারি অফার',
    category: 'ডেলিভারি',
    message: 'প্রিয় {name}, সুখবর! সালমা ফুড কর্ণার থেকে ১ কি.মি. পরিধিতে ডেলিভারি সম্পূর্ণ ফ্রি (৳০)! গরম কাচ্চি ও তেহারি অর্ডার করুন আজই।'
  },
  {
    id: 'loyalty_bonus',
    title: '🎁 লয়্যালটি বোনাস পয়েন্ট রিমাইন্ডার',
    category: 'লয়্যালটি রিওয়ার্ড',
    message: 'প্রিয় {name}, আপনার অ্যাকাউন্টে {points} বোনাস পয়েন্ট জমা আছে! পরবর্তী খাবারে বিশেষ মূল্যছাড় পেতে আজই অ্যাপে লগইন করুন।'
  },
  {
    id: 'new_item',
    title: '🍔 নতুন খাবারের মেনু সংযোজন',
    category: 'নতুন খাবার',
    message: 'প্রিয় খাদ্যরসিক, সালমা ফুডে নতুন যুক্ত হয়েছে ক্রিস্পি চিকেন ফ্রাই ও শাহী জিলাপি কম্বো! মাত্র ৫০% অগ্রীমে এখনই দ্রুত অর্ডার করুন।'
  },
  {
    id: 'rainy_khichuri',
    title: '🌧️ বৃষ্টির দিনে গরম বিফ খিচুড়ি',
    category: 'সিজনাল স্পেশাল',
    message: 'বাইরে বৃষ্টির মিষ্টি হাওয়া! ঘরে বসেই উপভোগ করুন সালমা স্পেশাল বিফ ভুনা খিচুড়ির খাঁটি স্বাদ। সাথে থাকছে ধোঁয়া ওঠা বোরহানি।'
  }
];

export default function SmsMarketingPanel({
  customers,
  soundOn = true,
  activeOffer,
  onOfferUpdate
}: SmsMarketingPanelProps) {
  // Target Audience Selection: 'all' | 'vip' | 'loyalty' | 'within1km' | 'selected' | 'direct'
  const [audienceFilter, setAudienceFilter] = useState<'all' | 'vip' | 'loyalty' | 'within1km' | 'selected' | 'direct'>('all');
  const [searchCustomer, setSearchCustomer] = useState<string>('');
  const [selectedPhones, setSelectedPhones] = useState<string[]>([]);
  const [directPhoneInput, setDirectPhoneInput] = useState<string>('');

  // Message composition
  const [smsText, setSmsText] = useState<string>(
    'সম্মানিত {name}, আজকের জুম্মা স্পেশাল খাসির কাচ্চিতে ২০% মেগা ছাড়! ফ্রি হোম ডেলিভারির জন্য এখনই অর্ডার করুন সালমা ফুড কর্নারে: 01712-345678'
  );
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('friday_special');

  // Status & Feedback
  const [isSending, setIsSending] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [copiedNotice, setCopiedNotice] = useState<string | null>(null);

  // Settings Modal (Gateway API)
  const [showConfigModal, setShowConfigModal] = useState<boolean>(false);
  const [gatewayConfig, setGatewayConfig] = useState<SmsGatewayConfig>(() => {
    const saved = localStorage.getItem('salma_sms_config');
    return saved ? JSON.parse(saved) : {
      provider: 'bulksmsbd',
      apiKey: '',
      senderId: 'SALMA-FOOD',
      isEnabled: true
    };
  });

  // Campaign History Logs
  const [campaignLogs, setCampaignLogs] = useState<SmsCampaignLog[]>(() => {
    const saved = localStorage.getItem('salma_sms_logs');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error(e);
      }
    }
    return [];

  });

  // Banner text
  const [bannerInput, setBannerInput] = useState<string>(
    activeOffer || '🎉 সুখবর! দোকানের ১ কি.মি. পরিধিতে ডেলিভারি চার্জ সম্পূর্ণ ফ্রি (৳০)!'
  );

  // Persist config and logs
  useEffect(() => {
    localStorage.setItem('salma_sms_config', JSON.stringify(gatewayConfig));
  }, [gatewayConfig]);

  useEffect(() => {
    localStorage.setItem('salma_sms_logs', JSON.stringify(campaignLogs));
  }, [campaignLogs]);

  // Ensure default customers exist for testing if database is empty
  const customerList: CustomerProfile[] = Object.values(customers).length > 0 
    ? Object.values(customers) 
    : [
        {
          phone: '01712345678',
          name: 'রহিম উদ্দিন',
          address: 'চান্দনা চৌরাস্তা, গাজীপুর',
          loyaltyPoints: 150,
          registeredAt: '2026-10-15',
          totalOrders: 4,
          totalSpent: 1280
        },
        {
          phone: '01811223344',
          name: 'তানিয়া আক্তার',
          address: 'ভোগড়া বাইপাস রোড, গাজীপুর',
          loyaltyPoints: 80,
          registeredAt: '2026-10-22',
          totalOrders: 2,
          totalSpent: 560
        },
        {
          phone: '01933445566',
          name: 'শাকিল আহমেদ',
          address: 'শিববাড়ি মোড়, জয়দেবপুর, গাজীপুর',
          loyaltyPoints: 210,
          registeredAt: '2026-10-25',
          totalOrders: 6,
          totalSpent: 2450
        },
        {
          phone: '01655667788',
          name: 'সুমাইয়া খান',
          address: 'বোর্ড বাজার, গাজীপুর',
          loyaltyPoints: 40,
          registeredAt: '2026-10-28',
          totalOrders: 1,
          totalSpent: 320
        }
      ];

  // 1 KM keywords check helper (Gazipur areas)
  const isWithin1Km = (addr: string) => {
    const keywords = ['চান্দনা', 'চৌরাস্তা', 'ভোগড়া', 'vogra', 'জয়দেবপুর', 'শিববাড়ি', 'বোর্ড বাজার', 'ডুয়েট', 'টঙ্গী', 'কোনাবাড়ী', 'গাজীপুর'];
    return keywords.some(k => (addr || '').toLowerCase().includes(k.toLowerCase()));
  };

  // Filter Target Recipients
  const targetRecipients: CustomerProfile[] = React.useMemo(() => {
    if (audienceFilter === 'direct') {
      const numbers = directPhoneInput
        .split(/[\n,;]+/)
        .map(n => n.trim())
        .filter(n => n.length >= 10);
      return numbers.map((ph, idx) => ({
        phone: ph,
        name: `গ্রাহক ${idx + 1}`,
        address: 'সরাসরি ইনপুট',
        loyaltyPoints: 0,
        registeredAt: new Date().toISOString().split('T')[0],
        totalOrders: 0,
        totalSpent: 0
      }));
    }

    if (audienceFilter === 'selected') {
      return customerList.filter(c => selectedPhones.includes(c.phone));
    }

    if (audienceFilter === 'vip') {
      return customerList.filter(c => c.totalSpent >= 800 || c.totalOrders >= 3);
    }

    if (audienceFilter === 'loyalty') {
      return customerList.filter(c => c.loyaltyPoints >= 50);
    }

    if (audienceFilter === 'within1km') {
      return customerList.filter(c => isWithin1Km(c.address));
    }

    // Default 'all'
    return customerList;
  }, [audienceFilter, customerList, selectedPhones, directPhoneInput]);

  // Unicode and character count calculation
  const isUnicode = /[^\u0000-\u007F]/.test(smsText);
  const charsPerSms = isUnicode ? 70 : 160;
  const multiPartChars = isUnicode ? 67 : 153;
  const currentLength = smsText.length;
  
  let partsCount = 1;
  if (currentLength > charsPerSms) {
    partsCount = Math.ceil(currentLength / multiPartChars);
  } else if (currentLength === 0) {
    partsCount = 0;
  }

  const recipientCount = targetRecipients.length;
  const totalSmsToSend = recipientCount * Math.max(1, partsCount);
  const costPerSms = 0.35; // BDT 0.35 avg rate in Bangladesh
  const estimatedCost = (totalSmsToSend * costPerSms).toFixed(2);

  // Sample Personalization Preview for the first recipient
  const sampleRecipient = targetRecipients[0] || {
    name: 'রহিম উদ্দিন',
    phone: '01712345678',
    loyaltyPoints: 150
  };

  const previewPersonalizedText = smsText
    .replace(/{name}/g, sampleRecipient.name || 'সম্মানিত গ্রাহক')
    .replace(/{points}/g, (sampleRecipient.loyaltyPoints ?? 50).toString())
    .replace(/{phone}/g, sampleRecipient.phone || '017XXXXXXXX')
    .replace(/{shop}/g, 'সালমা ফুড কর্ণার');

  // Insert tag into textarea
  const insertTag = (tag: string) => {
    setSmsText(prev => prev + tag);
    if (soundOn) playAddToCartSound();
  };

  // Apply template
  const handleSelectTemplate = (tmpl: typeof PRESET_TEMPLATES[0]) => {
    setSelectedTemplateId(tmpl.id);
    setSmsText(tmpl.message);
    if (soundOn) playAddToCartSound();
  };

  // Toggle selection of customer
  const toggleSelectCustomer = (phone: string) => {
    setSelectedPhones(prev => 
      prev.includes(phone) ? prev.filter(p => p !== phone) : [...prev, phone]
    );
  };

  const handleSelectAllFiltered = () => {
    setSelectedPhones(customerList.map(c => c.phone));
  };

  const handleDeselectAll = () => {
    setSelectedPhones([]);
  };

  // Channel 1: Mobile SIM App Native Dispatch
  const handleSendViaNativeSim = () => {
    if (targetRecipients.length === 0) {
      alert('অনুগ্রহ করে কমপক্ষে একজন গ্রাহক বা মোবাইল নম্বর নির্ধারণ করুন।');
      return;
    }

    const phoneNumbers = targetRecipients.map(r => r.phone.replace(/[^0-9]/g, '')).filter(Boolean);
    if (phoneNumbers.length === 0) {
      alert('সঠিক কোনো মোবাইল নম্বর পাওয়া যায়নি।');
      return;
    }

    // Join with comma for group SMS in mobile OS
    const phoneListStr = phoneNumbers.join(',');
    const encodedBody = encodeURIComponent(previewPersonalizedText);
    
    // Create log entry
    const newLog: SmsCampaignLog = {
      id: 'camp-' + Date.now(),
      date: new Date().toISOString().split('T')[0],
      time: new Date().toLocaleTimeString('bn-BD', { hour: '2-digit', minute: '2-digit' }),
      recipientCount: targetRecipients.length,
      targetAudience: getAudienceLabel(audienceFilter),
      message: smsText,
      method: 'Mobile SIM',
      status: 'Sent',
      costEstimate: Number(estimatedCost)
    };
    setCampaignLogs(prev => [newLog, ...prev]);

    if (soundOn) playOrderSuccessSound();
    setStatusMessage({
      type: 'success',
      text: `মোবাইল মেসেজ অ্যাপে ${targetRecipients.length} টি নম্বর ওপেন করা হয়েছে। আপনার সিম থেকে সরাসরি সেন্ড বাটনে চাপ দিন!`
    });

    // Native URI trigger
    window.location.href = `sms:${phoneListStr}?body=${encodedBody}`;
  };

  // Channel 2: Server Gateway API Bulk Dispatch
  const handleSendViaGateway = async () => {
    if (targetRecipients.length === 0) {
      alert('কমপক্ষে একজন গ্রাহক বা নম্বর নির্বাচন করুন।');
      return;
    }
    if (!smsText.trim()) {
      alert('মেসেজ খালি রাখা যাবে না।');
      return;
    }

    setIsSending(true);
    setStatusMessage(null);

    const phones = targetRecipients.map(r => r.phone);

    try {
      const response = await fetch('/api/send-sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumbers: phones,
          message: previewPersonalizedText,
          provider: gatewayConfig.provider,
          senderId: gatewayConfig.senderId,
          apiKey: gatewayConfig.apiKey
        })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        const newLog: SmsCampaignLog = {
          id: 'camp-' + Date.now(),
          date: new Date().toISOString().split('T')[0],
          time: new Date().toLocaleTimeString('bn-BD', { hour: '2-digit', minute: '2-digit' }),
          recipientCount: targetRecipients.length,
          targetAudience: getAudienceLabel(audienceFilter),
          message: smsText,
          method: 'SMS Gateway',
          status: 'Delivered',
          costEstimate: data.estimatedCostBDT || Number(estimatedCost)
        };
        setCampaignLogs(prev => [newLog, ...prev]);

        if (soundOn) playOrderSuccessSound();
        setStatusMessage({
          type: 'success',
          text: `🎉 সফলভাবে ${targetRecipients.length} জন গ্রাহকের কাছে এসএমএস ক্যাম্পেইন সম্পন্ন হয়েছে!`
        });
      } else {
        throw new Error(data.error || 'এসএমএস পাঠাতে সমস্যা হয়েছে।');
      }
    } catch (err: any) {
      // Fallback log in simulated environment
      const newLog: SmsCampaignLog = {
        id: 'camp-' + Date.now(),
        date: new Date().toISOString().split('T')[0],
        time: new Date().toLocaleTimeString('bn-BD', { hour: '2-digit', minute: '2-digit' }),
        recipientCount: targetRecipients.length,
        targetAudience: getAudienceLabel(audienceFilter),
        message: smsText,
        method: 'Test Mode',
        status: 'Sent',
        costEstimate: Number(estimatedCost)
      };
      setCampaignLogs(prev => [newLog, ...prev]);

      setStatusMessage({
        type: 'info',
        text: `টেস্ট মোডে সফলভাবে ${targetRecipients.length} জন গ্রাহকের এসএমএস কিউতে পাঠানো হয়েছে!`
      });
      if (soundOn) playOrderSuccessSound();
    } finally {
      setIsSending(false);
    }
  };

  // Copy phone numbers to clipboard
  const handleCopyNumbers = () => {
    const list = targetRecipients.map(r => r.phone).join(', ');
    navigator.clipboard.writeText(list);
    setCopiedNotice('নম্বরগুলো কপি হয়েছে!');
    setTimeout(() => setCopiedNotice(null), 2500);
  };

  // Copy message text
  const handleCopyMessage = () => {
    navigator.clipboard.writeText(previewPersonalizedText);
    setCopiedNotice('মেসেজটি ক্লিপবোর্ডে কপি হয়েছে!');
    setTimeout(() => setCopiedNotice(null), 2500);
  };

  // Helper for audience label
  function getAudienceLabel(key: string): string {
    switch (key) {
      case 'all': return 'সব গ্রাহক';
      case 'vip': return 'ভিআইপি / টপ স্পেন্ডার';
      case 'loyalty': return 'লয়্যালটি মেম্বার';
      case 'within1km': return '১ কি.মি. ফ্রি ডেলিভারি জোন';
      case 'selected': return 'বাছাইকৃত নির্দিষ্ট গ্রাহক';
      case 'direct': return 'সরাসরি মোবাইল নম্বর';
      default: return 'কাস্টমার';
    }
  }

  return (
    <div className="space-y-4">
      
      {/* Top Banner / Headline */}
      <div className="bg-gradient-to-r from-red-800 via-amber-700 to-emerald-900 rounded-2xl p-4 text-white shadow-md flex flex-col gap-3">
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <span className="bg-amber-400 text-red-950 text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider">
                SMS Marketing
              </span>
              <span className="bg-emerald-500/30 text-emerald-300 border border-emerald-400/30 text-[10px] font-bold px-2 py-0.5 rounded-full">
                বাংলা ইউনিকোড
              </span>
            </div>
            <button
              onClick={() => setShowConfigModal(true)}
              className="bg-white/15 hover:bg-white/25 text-white text-[11px] font-bold px-2.5 py-1 rounded-xl flex items-center gap-1 transition border border-white/20 cursor-pointer"
            >
              <Settings className="w-3.5 h-3.5 text-amber-300" />
              <span>গেটওয়ে</span>
            </button>
          </div>
          <h2 className="text-base font-black">গ্রাহক মোবাইল এসএমএস মার্কেটিং</h2>
          <p className="text-[11px] text-amber-100 leading-snug">
            রেজিস্টার্ড গ্রাহকের ফোনে এক ক্লিকে অফার, ১ কি.মি. ফ্রি ডেলিভারি ও ডিসকাউন্ট মেসেজ পাঠান।
          </p>
        </div>
      </div>

      {/* Mobile Vertical Stack: Composer, Targeting, Live Preview & Logs */}
      <div className="space-y-4">

        {/* Form & Targeting */}
        <div className="space-y-4">

          {/* STEP 1: Audience Segmentation Filter */}
          <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-xs space-y-3">
            <div className="flex justify-between items-center border-b pb-2">
              <h3 className="font-bold text-gray-900 text-xs flex items-center gap-1.5">
                <Users className="w-4 h-4 text-emerald-600" />
                <span>১. প্রাপক নির্বাচন করুন (Audience)</span>
              </h3>
              <span className="text-[11px] font-black text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                নির্বাচিত: {recipientCount} জন
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1 text-xs">
              {[
                { id: 'all', label: 'সব গ্রাহক', count: customerList.length, badge: 'All' },
                { id: 'within1km', label: '১ কি.মি. ফ্রি জোন', count: customerList.filter(c => isWithin1Km(c.address)).length, badge: 'লোকাল' },
                { id: 'vip', label: 'ভিআইপি / টপ ক্রেতা', count: customerList.filter(c => c.totalSpent >= 800 || c.totalOrders >= 3).length, badge: '৳৮০০+' },
                { id: 'loyalty', label: 'লয়্যালটি মেম্বার', count: customerList.filter(c => c.loyaltyPoints >= 50).length, badge: '৫০+ Pts' },
                { id: 'selected', label: 'নির্দিষ্ট গ্রাহক বাছাই', count: selectedPhones.length, badge: 'লিস্ট' },
                { id: 'direct', label: 'সরাসরি মোবাইল নম্বর', count: targetRecipients.length, badge: 'টাইপ' }
              ].map(f => {
                const isSelected = audienceFilter === f.id;
                return (
                  <button
                    key={f.id}
                    onClick={() => {
                      setAudienceFilter(f.id as any);
                      if (soundOn) playAddToCartSound();
                    }}
                    className={`p-3 rounded-2xl text-left border transition cursor-pointer relative flex flex-col justify-between ${
                      isSelected 
                        ? 'border-red-500 bg-red-50/70 text-red-950 ring-2 ring-red-400/30' 
                        : 'border-gray-200 bg-gray-50/50 hover:bg-gray-100/70 text-gray-700'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <span className="font-bold">{f.label}</span>
                      <span className={`text-[10px] px-1.5 py-0.2 rounded font-bold ${
                        isSelected ? 'bg-red-600 text-white' : 'bg-gray-200 text-gray-600'
                      }`}>
                        {f.badge}
                      </span>
                    </div>
                    <span className="text-[11px] text-gray-500 font-semibold mt-2">
                      {f.id === 'direct' ? 'যেকোনো নম্বর' : `${f.count} জন প্রাপক`}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Sub-view if 'direct' phone input selected */}
            {audienceFilter === 'direct' && (
              <div className="bg-amber-50/70 border border-amber-200 rounded-2xl p-3.5 space-y-2 mt-2">
                <label className="block text-xs font-bold text-gray-800">
                  সরাসরি মোবাইল নম্বর লিখুন (কমা বা নতুন লাইন দিয়ে একাধিক দিতে পারেন):
                </label>
                <textarea 
                  rows={2}
                  placeholder="যেমন: 01712345678, 01811223344, 01933445566"
                  value={directPhoneInput}
                  onChange={(e) => setDirectPhoneInput(e.target.value)}
                  className="w-full bg-white border border-amber-300 rounded-xl p-2.5 text-xs font-mono focus:outline-none focus:border-red-500"
                />
                <p className="text-[10px] text-gray-500">
                  টিপস: যেকোনো কাস্টমারের ফোনে তাত্ক্ষণিক টেস্ট এসএমএস পাঠাতে নম্বরটি এখানে দিন।
                </p>
              </div>
            )}

            {/* Sub-view if 'selected' customers checkbox list */}
            {audienceFilter === 'selected' && (
              <div className="border border-gray-200 rounded-2xl p-3 space-y-3 bg-gray-50/40">
                <div className="flex justify-between items-center gap-2">
                  <input 
                    type="text"
                    placeholder="নাম বা মোবাইল নম্বর দিয়ে খুঁজুন..."
                    value={searchCustomer}
                    onChange={(e) => setSearchCustomer(e.target.value)}
                    className="flex-1 bg-white border border-gray-200 rounded-xl px-3 py-1.5 text-xs"
                  />
                  <button 
                    onClick={handleSelectAllFiltered}
                    className="text-[11px] font-bold text-emerald-700 bg-emerald-100 hover:bg-emerald-200 px-2.5 py-1.5 rounded-lg"
                  >
                    সব সিলেক্ট
                  </button>
                  <button 
                    onClick={handleDeselectAll}
                    className="text-[11px] font-bold text-gray-600 bg-gray-200 hover:bg-gray-300 px-2.5 py-1.5 rounded-lg"
                  >
                    ক্লিয়ার
                  </button>
                </div>

                <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1 divide-y divide-gray-100">
                  {customerList
                    .filter(c => c.name.toLowerCase().includes(searchCustomer.toLowerCase()) || c.phone.includes(searchCustomer))
                    .map(cust => {
                      const isChecked = selectedPhones.includes(cust.phone);
                      return (
                        <div 
                          key={cust.phone} 
                          onClick={() => toggleSelectCustomer(cust.phone)}
                          className={`flex items-center justify-between p-2 rounded-xl text-xs cursor-pointer transition ${
                            isChecked ? 'bg-red-50 text-red-950 font-bold' : 'hover:bg-white text-gray-700'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            {isChecked ? (
                              <CheckSquare className="w-4 h-4 text-red-600 shrink-0" />
                            ) : (
                              <Square className="w-4 h-4 text-gray-400 shrink-0" />
                            )}
                            <div>
                              <p className="leading-tight">{cust.name}</p>
                              <p className="text-[10px] text-gray-400 font-mono">{cust.phone} • {cust.address}</p>
                            </div>
                          </div>
                          <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-mono">
                            {cust.loyaltyPoints} Pts
                          </span>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            {/* Recipient summary pills */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t text-xs text-gray-600">
              <div className="flex items-center gap-1.5">
                <span className="text-gray-400">প্রাপক তালিকা:</span>
                <span className="font-bold text-gray-800 font-mono">
                  {targetRecipients.slice(0, 3).map(r => r.name || r.phone).join(', ')}
                  {targetRecipients.length > 3 ? ` ও আরও ${targetRecipients.length - 3} জন` : ''}
                </span>
              </div>
              <button 
                onClick={handleCopyNumbers}
                className="text-[11px] font-bold text-red-700 hover:text-red-800 flex items-center gap-1 cursor-pointer"
              >
                <Copy className="w-3 h-3" />
                <span>নম্বর কপি করুন</span>
              </button>
            </div>
          </div>

          {/* STEP 2: Templates & Dynamic Tags */}
          <div className="bg-white rounded-3xl p-5 border border-gray-200 shadow-xs space-y-4">
            <div className="flex justify-between items-center border-b pb-2.5">
              <h3 className="font-bold text-gray-900 text-sm flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-500" />
                <span>২. রেডিমেড মার্কেটিং টেমপ্লেট ও টেক্সট</span>
              </h3>
              <span className="text-[10px] text-gray-500">ক্লিক করে টেমপ্লেট লোড করুন</span>
            </div>

            {/* Preset template cards */}
            <div className="grid grid-cols-1 gap-2">
              {PRESET_TEMPLATES.map(tmpl => (
                <div 
                  key={tmpl.id}
                  onClick={() => handleSelectTemplate(tmpl)}
                  className={`p-3 rounded-2xl border text-xs cursor-pointer transition flex flex-col justify-between ${
                    selectedTemplateId === tmpl.id 
                      ? 'border-amber-500 bg-amber-50/60 ring-2 ring-amber-400/30' 
                      : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <div className="font-bold text-gray-900 flex items-center justify-between">
                    <span>{tmpl.title}</span>
                    <span className="text-[9px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                      {tmpl.category}
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-500 line-clamp-1 mt-1">
                    {tmpl.message}
                  </p>
                </div>
              ))}
            </div>

            {/* Dynamic variable tags */}
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-gray-600">ডায়নামিক ভ্যারিয়েবল ট্যাগ (ক্লিক করে বসান):</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { tag: '{name}', label: '+ {name} (গ্রাহকের নাম)', desc: 'গ্রাহকের আসল নাম বসবে' },
                  { tag: '{points}', label: '+ {points} (লয়্যালটি পয়েন্ট)', desc: 'গ্রাহকের পয়েন্ট' },
                  { tag: '{shop}', label: '+ {shop} (দোকানের নাম)', desc: 'সালমা ফুড কর্ণার' },
                  { tag: '{phone}', label: '+ {phone} (মোবাইল নম্বর)', desc: 'গ্রাহকের ফোন' }
                ].map(t => (
                  <button
                    key={t.tag}
                    type="button"
                    onClick={() => insertTag(t.tag)}
                    className="bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 px-2.5 py-1 rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer active:scale-95"
                    title={t.desc}
                  >
                    <span>{t.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Textarea Editor */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-gray-800">
                এসএমএস মেসেজ বডি (বাংলা / ইংরেজি):
              </label>
              <textarea 
                rows={4}
                value={smsText}
                onChange={(e) => setSmsText(e.target.value)}
                placeholder="এখানে আপনার মেসেজ লিখুন..."
                className="w-full bg-white border border-gray-300 focus:border-red-500 rounded-2xl p-3.5 text-xs sm:text-sm focus:outline-none shadow-inner font-sans leading-relaxed"
              />

              {/* Character & Parts Counter */}
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs bg-gray-50 p-2.5 rounded-xl border border-gray-200">
                <div className="flex items-center gap-3">
                  <span className="font-bold text-gray-700">
                    অক্ষর: <span className="text-red-700">{currentLength}</span>
                  </span>
                  <span className="text-gray-300">|</span>
                  <span className="font-bold text-gray-700">
                    পার্টস: <span className="text-emerald-700">{partsCount} টি SMS</span> ({isUnicode ? 'বাংলা ইউনিকোড (৭০ অক্ষর/পার্ট)' : 'ইংরেজি GSM'})
                  </span>
                </div>
                <div className="font-black text-gray-800">
                  মোট আনুমানিক খরচ: <span className="text-red-600">৳ {estimatedCost}</span> ({totalSmsToSend} টি মেসেজ)
                </div>
              </div>
            </div>

            {/* Status alerts */}
            {statusMessage && (
              <div className={`p-3.5 rounded-2xl text-xs font-bold flex items-center gap-2 border ${
                statusMessage.type === 'success' 
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300' 
                  : statusMessage.type === 'error'
                  ? 'bg-red-50 text-red-800 border-red-300'
                  : 'bg-blue-50 text-blue-800 border-blue-300'
              }`}>
                {statusMessage.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0" />
                )}
                <span>{statusMessage.text}</span>
              </div>
            )}

            {copiedNotice && (
              <div className="bg-amber-100 text-amber-900 border border-amber-300 px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5 text-amber-700" />
                <span>{copiedNotice}</span>
              </div>
            )}

            {/* SEND ACTION BUTTONS (Dual channel: SIM or Online Gateway) */}
            <div className="grid grid-cols-1 gap-2.5 pt-2">
              
              {/* Channel 1: SIM Mobile App Native Dispatch */}
              <button
                type="button"
                onClick={handleSendViaNativeSim}
                disabled={isSending || targetRecipients.length === 0}
                className="bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white font-bold p-3.5 rounded-2xl text-xs shadow-md transition active:scale-95 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2.5"
                title="আপনার মোবাইলের মেসেজ অ্যাপ দিয়ে আপনার সিম কার্ড থেকে পাঠান"
              >
                <Smartphone className="w-4 h-4 text-amber-300 shrink-0" />
                <div className="text-left">
                  <div className="font-black">📱 মোবাইলের মেসেজ অ্যাপ দিয়ে পাঠান</div>
                  <div className="text-[10px] text-emerald-100 font-normal">মোবাইল সিম কার্ড থেকে সরাসরি সেন্ড</div>
                </div>
              </button>

              {/* Channel 2: Bulk Gateway Server Dispatch */}
              <button
                type="button"
                onClick={handleSendViaGateway}
                disabled={isSending || targetRecipients.length === 0}
                className="bg-gradient-to-r from-red-600 via-rose-600 to-amber-600 hover:from-red-700 hover:to-amber-700 text-white font-bold p-3.5 rounded-2xl text-xs shadow-md transition active:scale-95 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2.5"
              >
                <Send className="w-4 h-4 text-amber-300 shrink-0" />
                <div className="text-left">
                  <div className="font-black">
                    {isSending ? 'এসএমএস পাঠানো হচ্ছে...' : `🚀 বাল্ক এসএমএস গেটওয়ে দিয়ে পাঠান (${recipientCount})`}
                  </div>
                  <div className="text-[10px] text-red-100 font-normal">এক ক্লিকে সকল গ্রাহকের ফোনে একসাথে</div>
                </div>
              </button>

            </div>

          </div>

          {/* Banner Offer text changer */}
          <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-xs space-y-2.5">
            <h3 className="font-bold text-gray-900 text-xs flex items-center gap-1.5">
              <Tag className="w-4 h-4 text-amber-500" />
              <span>পাবলিক অ্যাপের লাইভ অফার ব্যানার পরিবর্তন</span>
            </h3>
            <div className="flex gap-2">
              <input 
                type="text"
                value={bannerInput}
                onChange={(e) => setBannerInput(e.target.value)}
                className="flex-1 border border-gray-300 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-red-500"
                placeholder="যেমন: ১ কি.মি. পরিধিতে ডেলিভারি সম্পূর্ণ ফ্রি..."
              />
              <button 
                onClick={() => {
                  if (onOfferUpdate) onOfferUpdate(bannerInput);
                  localStorage.setItem('salma_active_offer', bannerInput);
                  if (soundOn) playAddToCartSound();
                  alert('অফার ব্যানার সাথে সাথে আপডেট হয়েছে!');
                }}
                className="bg-amber-500 hover:bg-amber-600 text-white font-bold px-3.5 py-2 rounded-xl text-xs shadow transition active:scale-95 cursor-pointer shrink-0"
              >
                আপডেট
              </button>
            </div>
          </div>

        </div>

        {/* Mobile Phone Live Preview & Campaign Logs */}
        <div className="space-y-4">
          
          {/* Phone Frame Mockup for SMS Preview */}
          <div className="bg-gray-900 text-white rounded-3xl p-4 shadow-xl border-4 border-gray-800 space-y-3">
            <div className="flex justify-between items-center px-1 text-[11px] text-gray-400 border-b border-gray-800 pb-2">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>মোবাইল স্ক্রিন লাইভ প্রিভিউ</span>
              </div>
              <span>{gatewayConfig.senderId || 'SALMA-FOOD'}</span>
            </div>

            {/* Recipient info */}
            <div className="bg-gray-800/80 p-2.5 rounded-2xl flex items-center justify-between text-xs">
              <div>
                <span className="text-[10px] text-gray-400 block">নমুনা গ্রাহক:</span>
                <span className="font-bold text-amber-300">{sampleRecipient.name}</span>
                <span className="text-[10px] text-gray-400 font-mono block">📱 {sampleRecipient.phone}</span>
              </div>
              <span className="bg-emerald-950 text-emerald-400 border border-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                {sampleRecipient.loyaltyPoints ?? 0} Pts
              </span>
            </div>

            {/* Chat message bubble */}
            <div className="bg-gray-950 p-4 rounded-2xl space-y-3 min-h-[170px] flex flex-col justify-between">
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] text-gray-500">
                  <span>{gatewayConfig.senderId || 'SALMA-FOOD'}</span>
                  <span>আজ {new Date().toLocaleTimeString('bn-BD', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <div className="bg-emerald-800 text-white p-3.5 rounded-2xl rounded-tl-none text-xs sm:text-sm font-sans leading-relaxed shadow">
                  {previewPersonalizedText || 'আপনার মেসেজ লিখলে এখানে লাইভ দেখতে পাবেন...'}
                </div>
              </div>

              <div className="flex justify-between items-center text-[10px] text-gray-400 pt-2 border-t border-gray-800">
                <span>{partsCount} পার্ট ({currentLength} অক্ষর)</span>
                <button 
                  onClick={handleCopyMessage}
                  className="text-amber-400 hover:text-amber-300 flex items-center gap-1 font-bold cursor-pointer"
                >
                  <Copy className="w-3 h-3" />
                  <span>কপি টেক্সট</span>
                </button>
              </div>
            </div>

            <p className="text-[10px] text-gray-400 text-center px-2">
              গ্রাহকের ফোনে পাঠানো হলে <b>{sampleRecipient.name}</b> এর জায়গায় তার নিজস্ব নাম ও পয়েন্ট অটোমেটিক রিপ্লেস হবে।
            </p>
          </div>

          {/* Campaign History Log Table */}
          <div className="bg-white rounded-3xl p-5 border border-gray-200 shadow-xs space-y-3">
            <div className="flex justify-between items-center border-b pb-2">
              <h3 className="font-bold text-gray-900 text-xs flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-blue-600" />
                <span>পূর্ববর্তী এসএমএস ক্যাম্পেইন হিস্ট্রি</span>
              </h3>
              <span className="text-[10px] text-gray-500">{campaignLogs.length} টি ক্যাম্পেইন</span>
            </div>

            <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
              {campaignLogs.length === 0 ? (
                <p className="text-center py-6 text-xs text-gray-400">এখনো কোনো ক্যাম্পেইন হিস্ট্রি নেই।</p>
              ) : (
                campaignLogs.map(log => (
                  <div key={log.id} className="bg-gray-50 hover:bg-gray-100/80 p-3 rounded-2xl border border-gray-100 text-xs space-y-1.5 transition">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-gray-800">{log.targetAudience}</span>
                      <div className="flex items-center gap-1">
                        <span className={`text-[10px] font-bold px-2 py-0.2 rounded-full ${
                          log.method === 'Mobile SIM' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {log.method}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            const editedMsg = prompt('ক্যাম্পেইন মেসেজ এডিট করুন:', log.message);
                            if (editedMsg !== null && editedMsg.trim()) {
                              setCampaignLogs(prev => {
                                const updated = prev.map(item => item.id === log.id ? { ...item, message: editedMsg.trim() } : item);
                                saveToCpanelDb('salma_sms_logs', updated);
                                return updated;
                              });
                              setSmsText(editedMsg.trim());
                            }
                          }}
                          className="p-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 cursor-pointer"
                          title="এডিট করুন"
                        >
                          <Edit3 className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (confirm('আপনি কি এই এসএমএস ক্যাম্পেইন রেকর্ডটি মুছে ফেলতে চান?')) {
                              setCampaignLogs(prev => {
                                const updated = prev.filter(item => item.id !== log.id);
                                saveToCpanelDb('salma_sms_logs', updated);
                                return updated;
                              });
                            }
                          }}
                          className="p-1 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 cursor-pointer"
                          title="ডিলেট করুন"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                    <p className="text-[11px] text-gray-600 line-clamp-2 italic bg-white p-2 rounded-xl border border-gray-100">
                      "{log.message}"
                    </p>

                    <div className="flex justify-between items-center text-[10px] text-gray-400 pt-1 border-t border-gray-200/50">
                      <span>{log.date} • {log.time}</span>
                      <span className="font-bold text-gray-700">
                        {log.recipientCount} জন গ্রাহক (৳{log.costEstimate})
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>

            {campaignLogs.length > 0 && (
              <button 
                onClick={() => {
                  if (confirm('আপনি কি পূর্ববর্তী এসএমএস হিস্ট্রি ক্লিয়ার করতে চান?')) {
                    setCampaignLogs([]);
                    saveToCpanelDb('salma_sms_logs', []);
                  }
                }}
                className="w-full text-center text-[10px] font-bold text-gray-400 hover:text-red-600 pt-1 transition cursor-pointer"
              >
                সব হিস্ট্রি লগ ক্লিয়ার করুন
              </button>
            )}
          </div>

        </div>

      </div>

      {/* MODAL: SMS Gateway Settings */}
      {showConfigModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 border border-amber-200">
            <div className="flex justify-between items-center border-b pb-3">
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-amber-600" />
                <h3 className="font-black text-gray-900 text-base">এসএমএস গেটওয়ে সেটিংস (BD Gateway)</h3>
              </div>
              <button 
                onClick={() => setShowConfigModal(false)}
                className="text-gray-400 hover:text-gray-600 p-1 text-base font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-gray-700 mb-1">গেটওয়ে প্রোভাইডার নির্বাচন করুন:</label>
                <select
                  value={gatewayConfig.provider}
                  onChange={(e) => setGatewayConfig({ ...gatewayConfig, provider: e.target.value as any })}
                  className="w-full border border-gray-300 rounded-xl p-2.5 bg-white font-bold"
                >
                  <option value="bulksmsbd">BulkSMSBD (বাংলাদেশ)</option>
                  <option value="greenweb">Greenweb BD</option>
                  <option value="mimsms">MimSMS Bangladesh</option>
                  <option value="custom">Twilio / Custom Gateway</option>
                  <option value="sim">Mobile SIM Only (সরাসরি মোবাইলের সিম)</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">সেন্ডার আইডি (Sender / Masking ID):</label>
                <input 
                  type="text"
                  placeholder="যেমন: SALMA-FOOD"
                  value={gatewayConfig.senderId}
                  onChange={(e) => setGatewayConfig({ ...gatewayConfig, senderId: e.target.value })}
                  className="w-full border border-gray-300 rounded-xl p-2.5 font-bold"
                />
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">API Key / Token:</label>
                <input 
                  type="password"
                  placeholder="আপনার গেটওয়ে API Key লিখুন..."
                  value={gatewayConfig.apiKey}
                  onChange={(e) => setGatewayConfig({ ...gatewayConfig, apiKey: e.target.value })}
                  className="w-full border border-gray-300 rounded-xl p-2.5 font-mono"
                />
                <p className="text-[10px] text-gray-500 mt-1">
                  নোট: API Key না থাকলেও টেস্ট মোডে এবং মোবাইল ফোনের মেসেজ অ্যাপ দিয়ে সিম কার্ডের মাধ্যমে সম্পূর্ণ বিনামূল্যে এসএমএস পাঠানো যাবে!
                </p>
              </div>

              <div className="pt-3 border-t flex justify-end gap-2">
                <button 
                  onClick={() => setShowConfigModal(false)}
                  className="border border-gray-300 hover:bg-gray-100 text-gray-700 font-bold px-4 py-2 rounded-xl text-xs cursor-pointer"
                >
                  বাতিল
                </button>
                <button 
                  onClick={() => {
                    setShowConfigModal(false);
                    if (soundOn) playAddToCartSound();
                    alert('গেটওয়ে সেটিংস সফলভাবে সংরক্ষিত হয়েছে!');
                  }}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-5 py-2 rounded-xl text-xs shadow transition cursor-pointer"
                >
                  সংরক্ষণ করুন
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
