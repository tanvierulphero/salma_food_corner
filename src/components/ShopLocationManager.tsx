import React, { useState, useEffect } from 'react';
import { 
  MapPin, Navigation, Compass, Crosshair, CheckCircle2, AlertCircle, 
  ExternalLink, Sparkles, RefreshCw, Save, Sliders, Info, ShieldCheck, 
  Map, Phone, Building, ArrowUpRight, Check, Search, Eye,
  Edit3, Trash2, Plus, X, RotateCcw
} from 'lucide-react';
import { ShopLocationConfig, DEFAULT_SHOP_LOCATION } from '../types';
import { playAddToCartSound, playOrderSuccessSound } from '../utils/audioFeedback';

export interface PresetHub {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  landmark: string;
  zoneName: string;
  nearbyAreas: string[];
}

interface ShopLocationManagerProps {
  soundOn?: boolean;
  onLocationUpdate?: (newConfig: ShopLocationConfig) => void;
}

// Default Popular Food Hubs Presets in Dhaka
export const DEFAULT_PRESET_HUBS: PresetHub[] = [
  {
    id: 'hub-dhanmondi-32',
    name: 'ধানমন্ডি ৩২ (বর্তমান ডিফল্ট)',
    address: 'বাড়ি #১২, ধানমন্ডি ৩২ (রাসেল স্কয়ার মোড়), ঢাকা-১২০৯',
    lat: 23.7512,
    lng: 90.3770,
    landmark: 'রাসেল স্কয়ার ও ৩২ নম্বর ব্রিজ মোড়',
    zoneName: 'ধানমন্ডি',
    nearbyAreas: ['ধানমন্ডি ৩২', 'রাসেল স্কয়ার', 'সোবহানবাগ', 'শুক্রাবাদ', 'কলাবাগান', 'পান্থপথ পশ্চিম', 'ধানমন্ডি লেক']
  },
  {
    id: 'hub-gulshan-2',
    name: 'গুলশান ২ সার্কেল',
    address: 'রোড #৪৫, প্লট #১২, গুলশান ২ সার্কেল, ঢাকা-১২১২',
    lat: 23.7925,
    lng: 90.4078,
    landmark: 'গুলশান ২ চত্বর ও নাভানা টাওয়ার',
    zoneName: 'গুলশান',
    nearbyAreas: ['গুলশান ২', 'গুলশান ১', 'বনানী', 'বারিধারা', 'শাহজাদপুর']
  },
  {
    id: 'hub-mirpur-10',
    name: 'মিরপুর ১০ গোলচত্বর',
    address: 'মিরপুর ১০ গোলচত্বর মোড়, মেইন রোড, ঢাকা-১২১৬',
    lat: 23.8070,
    lng: 90.3687,
    landmark: 'মেট্রোরেল স্টেশন ও ফায়ার সার্ভিস সংলগ্ন',
    zoneName: 'মিরপুর',
    nearbyAreas: ['মিরপুর ১০', 'মিরপুর ১১', 'মিরপুর ২', 'কাজীপাড়া', 'শেওড়াপাড়া', 'সেনপাড়া']
  },
  {
    id: 'hub-uttara-3',
    name: 'উত্তরা সেক্টর ৩ (রবীন্দ্র সরণি)',
    address: 'রোড #৭, সেক্টর ৩, রবীন্দ্র সরণি, উত্তরা, ঢাকা-১২৩০',
    lat: 23.8703,
    lng: 90.3872,
    landmark: 'রবীন্দ্র সরণি ও ফ্রেন্ডস ক্লাব মাঠ',
    zoneName: 'উত্তরা',
    nearbyAreas: ['উত্তরা ৩', 'উত্তরা ১', 'উত্তরা ৪', 'জসিমউদ্দীন মোড়', 'আজমপুর']
  },
  {
    id: 'hub-bailey-road',
    name: 'বেইলি রোড ফুড স্ট্রিট',
    address: 'নাট্যমঞ্চ সংলগ্ন, বেইলি রোড, শান্তিনগর, ঢাকা-১০০০',
    lat: 23.7410,
    lng: 90.4060,
    landmark: 'মহিলা সমিতি মঞ্চ ও সিদ্ধেশ্বরী মোড়',
    zoneName: 'বেইলি রোড',
    nearbyAreas: ['বেইলি রোড', 'শান্তিনগর', 'কাকরাইল', 'মগবাজার', 'সিদ্ধেশ্বরী']
  },
  {
    id: 'hub-puran-dhaka',
    name: 'পুরান ঢাকা (চকবাজার ও নাজিরাবাজার)',
    address: 'চক সার্কুলার রোড, চকবাজার মোড়, ঢাকা-১২১১',
    lat: 23.7180,
    lng: 90.3980,
    landmark: 'চকবাজার শাহী মসজিদ ও নাজিরাবাজার মোড়',
    zoneName: 'পুরান ঢাকা',
    nearbyAreas: ['চকবাজার', 'নাজিরাবাজার', 'লালবাগ', 'আরমানিটোলা', 'মৌলভীবাজার']
  },
  {
    id: 'hub-mohammadpur',
    name: 'মোহাম্মদপুর টাউন হল ও রিং রোড',
    address: 'গজনবী রোড, টাউন হল মার্কেট মোড়, মোহাম্মদপুর, ঢাকা-১২০৭',
    lat: 23.7580,
    lng: 90.3620,
    landmark: 'টাউন হল মার্কেট ও কৃষি মার্কেট সংলগ্ন',
    zoneName: 'মোহাম্মদপুর',
    nearbyAreas: ['মোহাম্মদপুর', 'টাউন হল', 'রিং রোড', 'নূরজাহান রোড', 'শিয়ার মসজিদ', 'আসাদগেট']
  }
];

// Haversine distance calculator
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

export default function ShopLocationManager({
  soundOn = true,
  onLocationUpdate
}: ShopLocationManagerProps) {
  // Load saved shop location or default
  const [config, setConfig] = useState<ShopLocationConfig>(() => {
    const saved = localStorage.getItem('salma_shop_location');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error(e);
      }
    }
    return DEFAULT_SHOP_LOCATION;
  });

  // GPS Auto-detect state
  const [isLocating, setIsLocating] = useState<boolean>(false);
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [saveSuccessNotice, setSaveSuccessNotice] = useState<boolean>(false);

  // Free delivery area input string
  const [areasInput, setAreasInput] = useState<string>(() => {
    return (config.nearbyAreas || []).join(', ');
  });

  // Distance Tester Simulator
  const [testLat, setTestLat] = useState<string>('23.7540');
  const [testLng, setTestLng] = useState<string>('90.3795');
  const [testAddress, setTestAddress] = useState<string>('সোবহানবাগ মসজিদ রোড, ঢাকা');
  const [testDistance, setTestDistance] = useState<number | null>(null);

  // Sync to localStorage
  const handleSaveLocation = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    
    // Parse nearby areas
    const areasArray = areasInput
      .split(/[,;\n]+/)
      .map(a => a.trim())
      .filter(Boolean);

    const updatedConfig: ShopLocationConfig = {
      ...config,
      nearbyAreas: areasArray.length > 0 ? areasArray : config.nearbyAreas
    };

    localStorage.setItem('salma_shop_location', JSON.stringify(updatedConfig));
    setConfig(updatedConfig);

    // Notify public app via storage event
    window.dispatchEvent(new StorageEvent('storage', {
      key: 'salma_shop_location',
      newValue: JSON.stringify(updatedConfig)
    }));

    if (onLocationUpdate) {
      onLocationUpdate(updatedConfig);
    }

    if (soundOn) playOrderSuccessSound();
    setSaveSuccessNotice(true);
    setTimeout(() => setSaveSuccessNotice(false), 4000);
  };

  // Live GPS Fetch using device geolocation
  const handleDetectCurrentGPS = () => {
    if (!navigator.geolocation) {
      setGpsError('আপনার ব্রাউজারে Geolocation সাপোর্ট নেই।');
      return;
    }

    setIsLocating(true);
    setGpsError(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsLocating(false);
        const { latitude, longitude, accuracy } = pos.coords;
        setGpsAccuracy(Math.round(accuracy));

        setConfig(prev => ({
          ...prev,
          lat: parseFloat(latitude.toFixed(6)),
          lng: parseFloat(longitude.toFixed(6))
        }));

        if (soundOn) playAddToCartSound();
      },
      (err) => {
        setIsLocating(false);
        console.warn('GPS error:', err);
        setGpsError('GPS লোকেশন পেতে ব্যর্থ হয়েছে। ব্রাউজারে লোকেশন পারমিশন এলাউ করুন অথবা ম্যানুয়ালি অক্ষাংশ ও দ্রাঘিমাংশ লিখুন।');
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  };

  // Presets state persisted in localStorage
  const [presetHubs, setPresetHubs] = useState<PresetHub[]>(() => {
    const saved = localStorage.getItem('salma_location_presets');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch (e) {
        console.error(e);
      }
    }
    return DEFAULT_PRESET_HUBS;
  });

  const savePresetHubs = (newHubs: PresetHub[]) => {
    setPresetHubs(newHubs);
    localStorage.setItem('salma_location_presets', JSON.stringify(newHubs));
  };

  // Preset modal state
  const [isPresetModalOpen, setIsPresetModalOpen] = useState(false);
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);
  const [presetForm, setPresetForm] = useState<{
    name: string;
    address: string;
    lat: number;
    lng: number;
    landmark: string;
    zoneName: string;
    nearbyAreasText: string;
  }>({
    name: '',
    address: '',
    lat: 23.7512,
    lng: 90.3770,
    landmark: '',
    zoneName: '',
    nearbyAreasText: ''
  });
  const [presetModalGpsLoading, setPresetModalGpsLoading] = useState(false);

  const handleOpenAddPreset = () => {
    setEditingPresetId(null);
    setPresetForm({
      name: '',
      address: '',
      lat: config.lat,
      lng: config.lng,
      landmark: '',
      zoneName: '',
      nearbyAreasText: ''
    });
    setIsPresetModalOpen(true);
  };

  const handleOpenEditPreset = (hub: PresetHub, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingPresetId(hub.id);
    setPresetForm({
      name: hub.name,
      address: hub.address,
      lat: hub.lat,
      lng: hub.lng,
      landmark: hub.landmark,
      zoneName: hub.zoneName,
      nearbyAreasText: (hub.nearbyAreas || []).join(', ')
    });
    setIsPresetModalOpen(true);
  };

  const handleDeletePreset = (hubId: string, hubName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(`আপনি কি "${hubName}" প্রি-সেট এলাকাটি মুছে ফেলতে চান?`)) {
      const filtered = presetHubs.filter(h => h.id !== hubId);
      savePresetHubs(filtered);
      if (soundOn) playAddToCartSound();
    }
  };

  const handleResetDefaultPresets = () => {
    if (window.confirm('আপনি কি পূর্বনির্ধারিত ৭টি ঢাকা ফুড হাব রিস্টোর করতে চান?')) {
      savePresetHubs(DEFAULT_PRESET_HUBS);
      if (soundOn) playAddToCartSound();
    }
  };

  const handleSavePresetForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!presetForm.name.trim()) {
      alert('অনুগ্রহ করে এলাকার নাম দিন');
      return;
    }
    const areas = presetForm.nearbyAreasText
      .split(/[,;\n]+/)
      .map(s => s.trim())
      .filter(Boolean);

    if (editingPresetId) {
      const updated = presetHubs.map(h => {
        if (h.id === editingPresetId) {
          return {
            ...h,
            name: presetForm.name.trim(),
            address: presetForm.address.trim(),
            lat: Number(presetForm.lat),
            lng: Number(presetForm.lng),
            landmark: presetForm.landmark.trim(),
            zoneName: presetForm.zoneName.trim() || presetForm.name.trim(),
            nearbyAreas: areas.length > 0 ? areas : [presetForm.name.trim()]
          };
        }
        return h;
      });
      savePresetHubs(updated);
    } else {
      const newHub: PresetHub = {
        id: 'hub-' + Date.now(),
        name: presetForm.name.trim(),
        address: presetForm.address.trim(),
        lat: Number(presetForm.lat),
        lng: Number(presetForm.lng),
        landmark: presetForm.landmark.trim(),
        zoneName: presetForm.zoneName.trim() || presetForm.name.trim(),
        nearbyAreas: areas.length > 0 ? areas : [presetForm.name.trim()]
      };
      savePresetHubs([...presetHubs, newHub]);
    }

    setIsPresetModalOpen(false);
    if (soundOn) playOrderSuccessSound();
  };

  const handlePresetGpsDetect = () => {
    if (!navigator.geolocation) {
      alert('আপনার ডিভাইসে GPS সমর্থন নেই');
      return;
    }
    setPresetModalGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPresetModalGpsLoading(false);
        setPresetForm(prev => ({
          ...prev,
          lat: parseFloat(pos.coords.latitude.toFixed(6)),
          lng: parseFloat(pos.coords.longitude.toFixed(6))
        }));
        if (soundOn) playAddToCartSound();
      },
      (err) => {
        setPresetModalGpsLoading(false);
        alert('GPS লোকেশন পাওয়া যায়নি: ' + err.message);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // Preset Selection
  const handleSelectPreset = (hub: PresetHub) => {
    setConfig(prev => ({
      ...prev,
      name: prev.name,
      address: hub.address,
      lat: hub.lat,
      lng: hub.lng,
      landmark: hub.landmark,
      zoneName: hub.zoneName,
      nearbyAreas: hub.nearbyAreas
    }));
    setAreasInput(hub.nearbyAreas.join(', '));
    if (soundOn) playAddToCartSound();
  };

  // Run Distance Simulator
  const handleRunTest = () => {
    const latNum = parseFloat(testLat);
    const lngNum = parseFloat(testLng);
    if (isNaN(latNum) || isNaN(lngNum)) {
      alert('সঠিক টেস্ট অক্ষাংশ ও দ্রাঘিমাংশ দিন।');
      return;
    }
    const dist = calculateDistance(config.lat, config.lng, latNum, lngNum);
    setTestDistance(dist);
    if (soundOn) playAddToCartSound();
  };

  // Google Maps URL for current shop
  const googleMapsUrl = `https://www.google.com/maps?q=${config.lat},${config.lng}`;

  return (
    <div className="space-y-4">
      
      {/* Top Header Card */}
      <div className="bg-gradient-to-r from-emerald-800 via-teal-700 to-red-900 rounded-2xl p-4 text-white shadow-md space-y-3">
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <span className="bg-amber-400 text-emerald-950 text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider">
              Shop Location
            </span>
            <span className="bg-emerald-500/30 text-emerald-200 border border-emerald-400/30 text-[10px] font-bold px-2 py-0.5 rounded-full">
              GPS & ফ্রি ডেলিভারি জোন
            </span>
          </div>
          <h2 className="text-base font-black">দোকানের অবস্থান ও ১ কি.মি. ফ্রি ডেলিভারি জোন</h2>
          <p className="text-[11px] text-emerald-100 leading-snug">
            দোকানের GPS স্থানাঙ্ক সেট করুন। এর ওপর ভিত্তি করে চারপাশের ১ কি.মি. এলাকার গ্রাহকদের স্বয়ংক্রিয়ভাবে ফ্রি ডেলিভারি (৳০) দেওয়া হবে।
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <a
            href={googleMapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-white/15 hover:bg-white/25 text-white text-xs font-bold py-2 px-3 rounded-xl flex items-center justify-center gap-1.5 transition border border-white/20"
          >
            <ExternalLink className="w-3.5 h-3.5 text-amber-300" />
            <span>গুগল ম্যাপে দেখুন</span>
          </a>
          <button
            onClick={handleSaveLocation}
            className="bg-amber-400 hover:bg-amber-300 text-red-950 text-xs font-black py-2 px-3 rounded-xl flex items-center justify-center gap-1.5 shadow transition active:scale-95 cursor-pointer"
          >
            <Save className="w-3.5 h-3.5 text-red-950" />
            <span>সংরক্ষণ করুন</span>
          </button>
        </div>
      </div>

      {saveSuccessNotice && (
        <div className="bg-emerald-50 border-2 border-emerald-400 text-emerald-900 p-3.5 rounded-2xl text-xs font-bold flex items-center gap-2.5 shadow-sm">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>✓ দোকানের অবস্থান ও ডেলিভারি জোন সফলভাবে আপডেট হয়েছে! কাস্টমার অ্যাপে সাথে সাথে কার্যকর হয়েছে।</span>
        </div>
      )}

      {/* Main Mobile Vertical Stack */}
      <div className="space-y-4">

        {/* GPS & Form Section */}
        <div className="space-y-4">

          {/* Quick GPS Auto-Detect Button Card */}
          <div className="bg-gradient-to-r from-emerald-50 via-teal-50 to-white rounded-3xl p-5 border border-emerald-300 shadow-xs space-y-3">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="font-black text-gray-900 text-sm sm:text-base flex items-center gap-2">
                  <Navigation className="w-5 h-5 text-emerald-600" />
                  <span>তাত্ক্ষণিক GPS অটো-ডিটেক্ট (আমার বর্তমান অবস্থান)</span>
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  আপনি রেস্টুরেন্টে অবস্থানকালে এই বাটনে চাপ দিলে আপনার মোবাইলের সঠিক GPS স্থানাঙ্ক অটোমেটিক বসে যাবে।
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="button"
                onClick={handleDetectCurrentGPS}
                disabled={isLocating}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2.5 rounded-2xl text-xs shadow transition active:scale-95 cursor-pointer flex items-center gap-2 disabled:opacity-50"
              >
                <Crosshair className={`w-4 h-4 ${isLocating ? 'animate-spin' : ''}`} />
                <span>{isLocating ? 'GPS নির্ণয় হচ্ছে...' : '📍 বর্তমান মোবাইল GPS থেকে লোকেশন নিন'}</span>
              </button>

              {gpsAccuracy !== null && (
                <span className="text-xs font-semibold text-emerald-700 bg-emerald-100 border border-emerald-300 px-3 py-1 rounded-full">
                  ✓ GPS নির্ভুলতা: ±{gpsAccuracy} মিটার
                </span>
              )}
            </div>

            {gpsError && (
              <div className="bg-red-50 text-red-700 p-2.5 rounded-xl text-xs font-bold flex items-center gap-2 border border-red-200">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{gpsError}</span>
              </div>
            )}
          </div>

          {/* Preset Popular Food Hubs in Dhaka (Editable) */}
          <div className="bg-white rounded-3xl p-5 border border-gray-200 shadow-xs space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2.5">
              <div>
                <h3 className="font-bold text-gray-900 text-sm flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  <span>জনপ্রিয় ঢাকা ফুড হাব প্রি-সেট (১ ক্লিকে সেট করুন)</span>
                </h3>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  যে কোনো এলাকায় ট্যাপ করে সেট করুন, অথবা পেনসিল ✏️ আইকনে চাপ দিয়ে এডিট বা নতুন এলাকা যোগ করুন।
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleOpenAddPreset}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-1.5 rounded-xl flex items-center gap-1 shadow-xs transition active:scale-95 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>নতুন এলাকা যোগ</span>
                </button>
                <button
                  type="button"
                  onClick={handleResetDefaultPresets}
                  title="ডিফল্ট ৭টি ফুড হাব রিস্টোর করুন"
                  className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
                <span className="text-[11px] font-bold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                  {presetHubs.length}টি এলাকা
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              {presetHubs.map(hub => {
                const isCurrent = Math.abs(config.lat - hub.lat) < 0.001 && Math.abs(config.lng - hub.lng) < 0.001;
                return (
                  <div
                    key={hub.id}
                    className={`p-3 rounded-2xl border transition relative flex flex-col justify-between ${
                      isCurrent 
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-950 ring-2 ring-emerald-400/40 font-bold' 
                        : 'border-gray-200 hover:border-gray-300 bg-gray-50/60 hover:bg-white text-gray-700'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold line-clamp-1 text-gray-900 text-xs">{hub.name}</span>
                          {isCurrent && (
                            <span className="bg-emerald-600 text-white text-[9px] px-1.5 py-0.5 rounded-full font-bold shrink-0">
                              বর্তমান ডিফল্ট
                            </span>
                          )}
                        </div>
                        {hub.address && (
                          <p className="text-[10px] text-gray-500 line-clamp-1 mt-0.5">{hub.address}</p>
                        )}
                        <span className="text-[10px] text-gray-400 font-mono block mt-1">
                          {hub.lat.toFixed(4)}, {hub.lng.toFixed(4)}
                        </span>
                      </div>

                      {/* Edit and Delete Buttons */}
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={(e) => handleOpenEditPreset(hub, e)}
                          title="এই এলাকাটি এডিট করুন"
                          className="p-1.5 text-blue-600 hover:text-blue-700 hover:bg-blue-100/70 rounded-lg transition cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleDeletePreset(hub.id, hub.name, e)}
                          title="মুছে ফেলুন"
                          className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-100/70 rounded-lg transition cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="mt-2.5 pt-2 border-t border-gray-200/70 flex items-center justify-between">
                      <span className="text-[10px] text-gray-500 font-medium truncate max-w-[140px]">
                        {hub.landmark ? `📍 ${hub.landmark}` : (hub.zoneName ? `জোন: ${hub.zoneName}` : 'ঢাকা')}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleSelectPreset(hub)}
                        className={`text-[11px] font-bold px-2.5 py-1 rounded-xl transition active:scale-95 cursor-pointer flex items-center gap-1 ${
                          isCurrent
                            ? 'bg-emerald-600 text-white shadow-2xs'
                            : 'bg-white hover:bg-emerald-50 text-emerald-800 border border-emerald-300 shadow-2xs'
                        }`}
                      >
                        {isCurrent ? (
                          <>
                            <Check className="w-3 h-3" />
                            <span>সক্রিয় আছে</span>
                          </>
                        ) : (
                          <span>১-ক্লিকে সেট</span>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Form: Shop Details & Coordinates Editor */}
          <form onSubmit={handleSaveLocation} className="bg-white rounded-3xl p-5 sm:p-6 border border-gray-200 shadow-xs space-y-4">
            <div className="flex justify-between items-center border-b pb-3">
              <h3 className="font-bold text-gray-900 text-sm sm:text-base flex items-center gap-2">
                <Building className="w-4 h-4 text-red-600" />
                <span>দোকানের বিবরণ ও কোঅর্ডিনেট (Coordinates)</span>
              </h3>
              <span className="text-xs text-gray-400">সরাসরি পরিবর্তনযোগ্য</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-bold text-gray-700 mb-1">দোকানের নাম *</label>
                <input 
                  type="text"
                  value={config.name}
                  onChange={(e) => setConfig({ ...config, name: e.target.value })}
                  className="w-full border border-gray-300 rounded-xl p-2.5 text-xs font-bold"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">যোগাযোগের মোবাইল নম্বর</label>
                <input 
                  type="text"
                  value={config.phone || ''}
                  onChange={(e) => setConfig({ ...config, phone: e.target.value })}
                  placeholder="01712-345678"
                  className="w-full border border-gray-300 rounded-xl p-2.5 text-xs font-mono"
                />
              </div>
            </div>

            <div className="text-xs">
              <label className="block font-bold text-gray-700 mb-1">দোকানের পূর্ণাঙ্গ ঠিকানা *</label>
              <textarea 
                rows={2}
                value={config.address}
                onChange={(e) => setConfig({ ...config, address: e.target.value })}
                className="w-full border border-gray-300 rounded-xl p-2.5 text-xs leading-relaxed"
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-bold text-gray-700 mb-1">নিকটস্থ প্রধান ল্যান্ডমার্ক</label>
                <input 
                  type="text"
                  value={config.landmark || ''}
                  onChange={(e) => setConfig({ ...config, landmark: e.target.value })}
                  placeholder="যেমন: রাসেল স্কয়ার ও লেক মোড়"
                  className="w-full border border-gray-300 rounded-xl p-2.5 text-xs"
                />
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">এলাকা / জোন (Zone Name)</label>
                <input 
                  type="text"
                  value={config.zoneName || ''}
                  onChange={(e) => setConfig({ ...config, zoneName: e.target.value })}
                  placeholder="যেমন: ধানমন্ডি"
                  className="w-full border border-gray-300 rounded-xl p-2.5 text-xs"
                />
              </div>
            </div>

            {/* Coordinates Lat / Lng */}
            <div className="bg-gray-50 p-4 rounded-2xl border border-gray-200 space-y-3">
              <div className="flex justify-between items-center">
                <span className="font-bold text-gray-900 text-xs flex items-center gap-1.5">
                  <Compass className="w-4 h-4 text-emerald-600" />
                  <span>GPS স্থানাঙ্ক (Latitude & Longitude)</span>
                </span>
                <span className="text-[10px] text-gray-400">ম্যাপের কেন্দ্রবিন্দু</span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                <div>
                  <label className="block text-gray-600 mb-1 font-bold">অক্ষাংশ (Latitude) *</label>
                  <input 
                    type="number"
                    step="0.000001"
                    value={config.lat}
                    onChange={(e) => setConfig({ ...config, lat: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-white border border-gray-300 rounded-xl p-2 font-bold text-gray-800"
                    required
                  />
                </div>

                <div>
                  <label className="block text-gray-600 mb-1 font-bold">দ্রাঘিমাংশ (Longitude) *</label>
                  <input 
                    type="number"
                    step="0.000001"
                    value={config.lng}
                    onChange={(e) => setConfig({ ...config, lng: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-white border border-gray-300 rounded-xl p-2 font-bold text-gray-800"
                    required
                  />
                </div>
              </div>
            </div>

            {/* Free Radius & Standard Fee Controls */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-bold">
                  <span className="text-gray-700">ফ্রি ডেলিভারি পরিধি:</span>
                  <span className="text-emerald-700 font-black">{config.freeRadiusKm} কি.মি.</span>
                </div>
                <input 
                  type="range"
                  min="0.5"
                  max="5.0"
                  step="0.5"
                  value={config.freeRadiusKm}
                  onChange={(e) => setConfig({ ...config, freeRadiusKm: parseFloat(e.target.value) })}
                  className="w-full accent-emerald-600 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-gray-400">
                  <span>০.৫ কি.মি.</span>
                  <span>১ কি.মি. (আদর্শ)</span>
                  <span>৩ কি.মি.</span>
                  <span>৫ কি.মি.</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-bold">
                  <span className="text-gray-700">বহির্ভূত এলাকার ডেলিভারি ফি:</span>
                  <span className="text-red-600 font-black">৳ {config.standardFee}</span>
                </div>
                <input 
                  type="range"
                  min="30"
                  max="150"
                  step="10"
                  value={config.standardFee}
                  onChange={(e) => setConfig({ ...config, standardFee: parseInt(e.target.value) })}
                  className="w-full accent-red-600 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-gray-400">
                  <span>৳৩০</span>
                  <span>৳৬০ (স্ট্যান্ডার্ড)</span>
                  <span>৳১০০</span>
                  <span>৳১৫০</span>
                </div>
              </div>
            </div>

            {/* Keyword / Area Names string */}
            <div className="text-xs space-y-1">
              <label className="block font-bold text-gray-700">
                ফ্রি ডেলিভারি এলাকার কী-ওয়ার্ড / মহল্লার নাম (কমা দিয়ে লিখুন):
              </label>
              <textarea 
                rows={2}
                value={areasInput}
                onChange={(e) => setAreasInput(e.target.value)}
                placeholder="যেমন: ধানমন্ডি ৩২, সোবহানবাগ, শুক্রাবাদ, কলাবাগান..."
                className="w-full border border-gray-300 rounded-xl p-2.5 text-xs font-sans"
              />
              <p className="text-[10px] text-gray-400">
                কাস্টমার যখন অর্ডারে এই এলাকাগুলোর নাম লিখবে, সে স্বয়ংক্রিয়ভাবে ফ্রি ডেলিভারি চার্জ পাবে।
              </p>
            </div>

            <button
              type="submit"
              className="w-full bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white font-bold py-3 rounded-2xl text-xs sm:text-sm shadow-md transition active:scale-95 cursor-pointer flex items-center justify-center gap-2"
            >
              <Save className="w-4 h-4 text-amber-300" />
              <span>দোকানের অবস্থান ও নিয়মাবলী সংরক্ষণ করুন (Save Location)</span>
            </button>
          </form>

        </div>

        {/* Visual Radar & Coverage Tester */}
        <div className="space-y-4">
          
          {/* Visual Radar Card */}
          <div className="bg-gray-900 text-white rounded-3xl p-5 shadow-xl border-4 border-gray-800 space-y-4">
            <div className="flex justify-between items-center border-b border-gray-800 pb-2.5 text-xs">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping"></span>
                <span className="font-bold">লাইভ রাডার কভারেজ জোন</span>
              </div>
              <span className="text-[11px] text-amber-300 font-mono font-bold">
                রেডিয়াস: {config.freeRadiusKm} km
              </span>
            </div>

            {/* SVG Visual Radar Representation */}
            <div className="relative aspect-square max-w-[280px] mx-auto bg-gray-950 rounded-full border-2 border-emerald-500/40 flex items-center justify-center overflow-hidden shadow-inner p-4">
              {/* Concentric distance circles */}
              <div className="absolute inset-4 rounded-full border border-emerald-500/20"></div>
              <div className="absolute inset-12 rounded-full border border-emerald-500/30"></div>
              <div className="absolute inset-20 rounded-full border border-dashed border-emerald-500/40"></div>

              {/* Crosshair lines */}
              <div className="absolute inset-x-0 top-1/2 h-px bg-emerald-500/20"></div>
              <div className="absolute inset-y-0 left-1/2 w-px bg-emerald-500/20"></div>

              {/* Free delivery green aura */}
              <div 
                className="absolute rounded-full bg-emerald-500/20 border-2 border-emerald-400 shadow-[0_0_25px_rgba(16,185,129,0.4)] animate-pulse flex items-center justify-center"
                style={{ width: `${Math.min(92, config.freeRadiusKm * 50)}%`, height: `${Math.min(92, config.freeRadiusKm * 50)}%` }}
              >
                <span className="text-[9px] text-emerald-300 font-black tracking-widest uppercase bg-black/60 px-1.5 py-0.5 rounded-full border border-emerald-400/40">
                  ফ্রি জোন (৳০)
                </span>
              </div>

              {/* Center Shop Pin */}
              <div className="relative z-10 flex flex-col items-center">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-red-600 to-amber-500 text-white flex items-center justify-center shadow-lg border-2 border-white animate-bounce">
                  <MapPin className="w-5 h-5 fill-white text-red-600" />
                </div>
                <span className="text-[10px] font-black bg-black/80 px-2 py-0.5 rounded-md mt-1 border border-white/20 text-white whitespace-nowrap">
                  {config.name}
                </span>
              </div>

              {/* Distance markings */}
              <span className="absolute top-2 left-1/2 -translate-x-1/2 text-[9px] text-emerald-400 font-mono">
                উত্তর (N)
              </span>
              <span className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[9px] text-gray-500 font-mono">
                {config.freeRadiusKm} কি.মি. পরিধি
              </span>
            </div>

            {/* Details Box */}
            <div className="bg-gray-800/80 p-3.5 rounded-2xl text-xs space-y-1.5 border border-gray-700">
              <div className="flex justify-between items-center">
                <span className="text-gray-400">বর্তমান অবস্থান:</span>
                <span className="font-bold text-amber-300">{config.zoneName || 'লোকাল জোন'}</span>
              </div>
              <p className="text-[11px] text-gray-300 font-medium leading-relaxed">
                📍 {config.address}
              </p>
              <div className="flex justify-between items-center text-[10px] font-mono text-gray-400 pt-1 border-t border-gray-700">
                <span>Lat: {config.lat}</span>
                <span>Lng: {config.lng}</span>
              </div>
            </div>
          </div>

          {/* Delivery Fee & Distance Simulator (গ্রাহক দূরত্ব যাচাই টুল) */}
          <div className="bg-white rounded-3xl p-5 border border-gray-200 shadow-xs space-y-3">
            <div className="flex justify-between items-center border-b pb-2">
              <h3 className="font-bold text-gray-900 text-xs flex items-center gap-1.5">
                <Compass className="w-4 h-4 text-emerald-600" />
                <span>গ্রাহক দূরত্ব ও ফি সিমুলেটর (Distance Tester)</span>
              </h3>
              <span className="text-[10px] text-gray-400">পরীক্ষা করুন</span>
            </div>

            <p className="text-[11px] text-gray-500">
              যেকোনো সম্ভাব্য গ্রাহকের ঠিকানা বা স্থানাঙ্ক দিয়ে টেস্ট করুন সে ফ্রি ডেলিভারি পাবে কি না:
            </p>

            <div className="space-y-2 text-xs">
              <div>
                <label className="block text-gray-600 mb-1 font-bold">গ্রাহকের ঠিকানা</label>
                <input 
                  type="text"
                  value={testAddress}
                  onChange={(e) => setTestAddress(e.target.value)}
                  className="w-full border border-gray-300 rounded-xl p-2 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-2 font-mono">
                <div>
                  <label className="block text-[11px] text-gray-500">কাস্টমার Lat</label>
                  <input 
                    type="text"
                    value={testLat}
                    onChange={(e) => setTestLat(e.target.value)}
                    className="w-full border border-gray-300 rounded-xl p-2 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-gray-500">কাস্টমার Lng</label>
                  <input 
                    type="text"
                    value={testLng}
                    onChange={(e) => setTestLng(e.target.value)}
                    className="w-full border border-gray-300 rounded-xl p-2 text-xs"
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={handleRunTest}
                className="w-full bg-gray-800 hover:bg-black text-white font-bold py-2 rounded-xl text-xs transition cursor-pointer flex items-center justify-center gap-1"
              >
                <Search className="w-3.5 h-3.5" />
                <span>দূরত্ব ও ডেলিভারি ফি হিসেব করুন</span>
              </button>

              {testDistance !== null && (
                <div className={`p-3 rounded-2xl border text-xs font-bold space-y-1 mt-2 ${
                  testDistance <= config.freeRadiusKm
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                    : 'bg-red-50 border-red-300 text-red-900'
                }`}>
                  <div className="flex justify-between items-center">
                    <span>দোকান থেকে দূরত্ব:</span>
                    <span className="font-mono text-sm">{testDistance} কি.মি.</span>
                  </div>
                  <div className="flex justify-between items-center pt-1 border-t border-black/10">
                    <span>ডেলিভারি চার্জ:</span>
                    <span className="text-sm font-black">
                      {testDistance <= config.freeRadiusKm ? 'সম্পূর্ণ ফ্রি (৳০) ✓' : `৳ ${config.standardFee} (স্ট্যান্ডার্ড)`}
                    </span>
                  </div>
                  <p className="text-[10px] font-normal mt-1 opacity-80">
                    {testDistance <= config.freeRadiusKm 
                      ? `✓ গ্রাহক দোকানের ${config.freeRadiusKm} কি.মি. ফ্রি ডেলিভারি পরিধির মধ্যে রয়েছে।`
                      : `⚠ গ্রাহক ফ্রি জোনের বাইরে অবস্থান করছে, স্ট্যান্ডার্ড ডেলিভারি চার্জ প্রযোজ্য হবে।`}
                  </p>
                </div>
              )}
            </div>
          </div>

        </div>

      </div>

      {/* Add / Edit Preset Modal */}
      {isPresetModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-5 sm:p-6 shadow-2xl border border-gray-100 max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95">
            <div className="flex justify-between items-center pb-3 border-b border-gray-200">
              <h3 className="font-bold text-gray-900 text-base flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-500" />
                <span>{editingPresetId ? 'প্রি-সেট এলাকা এডিট করুন' : 'নতুন প্রি-সেট এলাকা যোগ করুন'}</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsPresetModalOpen(false)}
                className="text-gray-400 hover:text-gray-700 p-1.5 rounded-full hover:bg-gray-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSavePresetForm} className="space-y-3.5 pt-4 text-xs">
              <div>
                <label className="block font-bold text-gray-700 mb-1">এলাকার নাম / টাইটেল *</label>
                <input
                  type="text"
                  required
                  value={presetForm.name}
                  onChange={e => setPresetForm({ ...presetForm, name: e.target.value })}
                  placeholder="যেমন: ধানমন্ডি ৩২, গুলশান ২, মিরপুর ১০"
                  className="w-full border border-gray-300 rounded-xl p-2.5 font-bold focus:border-emerald-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">সম্পূর্ণ ঠিকানা</label>
                <input
                  type="text"
                  value={presetForm.address}
                  onChange={e => setPresetForm({ ...presetForm, address: e.target.value })}
                  placeholder="বাড়ি, রাস্তা, থানা, ঢাকা"
                  className="w-full border border-gray-300 rounded-xl p-2.5 focus:border-emerald-500 focus:outline-hidden"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">অক্ষাংশ (Latitude) *</label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={presetForm.lat}
                    onChange={e => setPresetForm({ ...presetForm, lat: parseFloat(e.target.value) || 0 })}
                    className="w-full border border-gray-300 rounded-xl p-2.5 font-mono focus:border-emerald-500 focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block font-bold text-gray-700 mb-1">দ্রাঘিমাংশ (Longitude) *</label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={presetForm.lng}
                    onChange={e => setPresetForm({ ...presetForm, lng: parseFloat(e.target.value) || 0 })}
                    className="w-full border border-gray-300 rounded-xl p-2.5 font-mono focus:border-emerald-500 focus:outline-hidden"
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={handlePresetGpsDetect}
                disabled={presetModalGpsLoading}
                className="w-full bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold py-2.5 px-3 rounded-xl flex items-center justify-center gap-2 transition cursor-pointer text-xs"
              >
                <Crosshair className={`w-4 h-4 text-emerald-600 ${presetModalGpsLoading ? 'animate-spin' : ''}`} />
                <span>{presetModalGpsLoading ? 'GPS রিড হচ্ছে...' : '📍 বর্তমান মোবাইল GPS থেকে স্থানাঙ্ক নিন'}</span>
              </button>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">ল্যান্ডমার্ক / পরিচিত স্থান</label>
                  <input
                    type="text"
                    value={presetForm.landmark}
                    onChange={e => setPresetForm({ ...presetForm, landmark: e.target.value })}
                    placeholder="যেমন: রাসেল স্কয়ার মোড়"
                    className="w-full border border-gray-300 rounded-xl p-2.5 focus:border-emerald-500 focus:outline-hidden"
                  />
                </div>
                <div>
                  <label className="block font-bold text-gray-700 mb-1">জোন নাম</label>
                  <input
                    type="text"
                    value={presetForm.zoneName}
                    onChange={e => setPresetForm({ ...presetForm, zoneName: e.target.value })}
                    placeholder="যেমন: ধানমন্ডি"
                    className="w-full border border-gray-300 rounded-xl p-2.5 focus:border-emerald-500 focus:outline-hidden"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">১ কি.মি. ফ্রি ডেলিভারি এলাকা সমূহ (কমা দিয়ে লিখুন)</label>
                <textarea
                  rows={2}
                  value={presetForm.nearbyAreasText}
                  onChange={e => setPresetForm({ ...presetForm, nearbyAreasText: e.target.value })}
                  placeholder="যেমন: ধানমন্ডি ৩২, রাসেল স্কয়ার, শুক্রাবাদ, সোবহানবাগ"
                  className="w-full border border-gray-300 rounded-xl p-2.5 focus:border-emerald-500 focus:outline-hidden"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsPresetModalOpen(false)}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-2.5 rounded-xl transition cursor-pointer"
                >
                  বাতিল
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 rounded-xl shadow transition cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Save className="w-4 h-4" />
                  <span>সংরক্ষণ করুন</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
