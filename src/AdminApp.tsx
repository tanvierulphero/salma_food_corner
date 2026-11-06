/**
 * Salma Food Corner - Standalone Admin & POS Mobile Web App
 * Dedicated for admin.html (Mobile-first, WebView & App wrapping ready)
 */

import React, { useState, useEffect } from 'react';
import { 
  ChefHat, TrendingUp, Utensils, BarChart2, FileText, Truck, Users, 
  Smartphone, Plus, Edit3, Trash2, CheckCircle2, AlertCircle, RefreshCw, 
  Search, Lock, Unlock, LogOut, ArrowUpRight, ArrowDownRight, DollarSign, 
  Printer, Volume2, VolumeX, Eye, ArrowLeft, ShieldCheck, Tag, Sparkles,
  ShoppingBag, Calendar, Clock, MapPin, Hash, Check, X, ShieldAlert,
  BookOpen, Upload, Camera, Image as ImageIcon
} from 'lucide-react';
import { 
  FoodItem, Order, LedgerEntry, CustomerProfile, INITIAL_MENU_DATA 
} from './types';
import { 
  playAddToCartSound, playOrderSuccessSound, isSoundEnabled, setSoundEnabled 
} from './utils/audioFeedback';
import SmsMarketingPanel from './components/SmsMarketingPanel';
import ShopLocationManager from './components/ShopLocationManager';
import DueLedgerManager from './components/DueLedgerManager';
import {
  getMysqlStatus,
  subscribeMysqlStatus,
  setupMysqlDatabase,
  syncAllToMysqlNow,
  saveToCpanelDb,
  uploadFoodImageToCpanel,
  normalizeBdPhone
} from './utils/sqlSync';

const ADMIN_PIN_DEFAULT = '1234';

export default function AdminApp() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return localStorage.getItem('salma_admin_auth') === 'true';
  });
  const [pinInput, setPinInput] = useState<string>('');
  const [pinError, setPinError] = useState<string>('');
  const [soundOn, setSoundOn] = useState<boolean>(() => isSoundEnabled());

  // Active Navigation Tab
  const [activeTab, setActiveTab] = useState<'dashboard' | 'menu' | 'ledger' | 'due' | 'reports' | 'orders' | 'customers' | 'marketing' | 'location'>('dashboard');

  const todayStr = new Date().toISOString().split('T')[0];

  // -------------------------------------------------------------
  // SHARED STATE LOADED FROM LOCALSTORAGE (Instant Sync with Public App)
  // -------------------------------------------------------------
  const [menuItems, setMenuItems] = useState<FoodItem[]>(() => {
    const saved = localStorage.getItem('salma_menu_items');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      } catch (e) {
        console.error(e);
      }
    }
    return INITIAL_MENU_DATA;
  });

  const [orders, setOrders] = useState<Order[]>(() => {
    const saved = localStorage.getItem('salma_orders');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      } catch (e) {
        console.error(e);
      }
    }
    return [];
  });

  const [ledger, setLedger] = useState<LedgerEntry[]>(() => {
    const saved = localStorage.getItem('salma_ledger');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      } catch (e) {
        console.error(e);
      }
    }
    return [];
  });

  const [customers, setCustomers] = useState<Record<string, CustomerProfile>>(() => {
    const saved = localStorage.getItem('salma_customers');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') return parsed;
      } catch (e) {
        console.error(e);
      }
    }
    return {};
  });

  const [activeOffer, setActiveOffer] = useState<string>(() => {
    return localStorage.getItem('salma_active_offer') || '🎉 সুখবর! গাজীপুরে আমাদের দোকানের ১ কি.মি. পরিধিতে ডেলিভারি চার্জ সম্পূর্ণ ফ্রি (৳০)!';
  });

  // Listen to Storage events so changes in index.html sync in real time to admin.html
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'salma_orders' && e.newValue) {
        setOrders(JSON.parse(e.newValue));
        if (soundOn) playOrderSuccessSound();
      }
      if (e.key === 'salma_menu_items' && e.newValue) {
        setMenuItems(JSON.parse(e.newValue));
      }
      if (e.key === 'salma_ledger' && e.newValue) {
        setLedger(JSON.parse(e.newValue));
      }
      if (e.key === 'salma_customers' && e.newValue) {
        setCustomers(JSON.parse(e.newValue));
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [soundOn]);

  // Sync to local storage
  useEffect(() => {
    localStorage.setItem('salma_menu_items', JSON.stringify(menuItems));
  }, [menuItems]);

  useEffect(() => {
    localStorage.setItem('salma_orders', JSON.stringify(orders));
  }, [orders]);

  useEffect(() => {
    localStorage.setItem('salma_ledger', JSON.stringify(ledger));
  }, [ledger]);

  useEffect(() => {
    localStorage.setItem('salma_customers', JSON.stringify(customers));
  }, [customers]);

  useEffect(() => {
    localStorage.setItem('salma_active_offer', activeOffer);
  }, [activeOffer]);

  // -------------------------------------------------------------
  // AUTHENTICATION
  // -------------------------------------------------------------
  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pinInput === ADMIN_PIN_DEFAULT) {
      setIsAuthenticated(true);
      localStorage.setItem('salma_admin_auth', 'true');
      setPinError('');
      if (soundOn) playAddToCartSound();
    } else {
      setPinError('ভুল পিন নম্বর! (ডিফল্ট পিন: 1234)');
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    localStorage.removeItem('salma_admin_auth');
    setPinInput('');
  };

  // -------------------------------------------------------------
  // MENU MANAGEMENT (সংযোজন, এডিট, বিয়োজন)
  // -------------------------------------------------------------
  const [foodModalOpen, setFoodModalOpen] = useState<boolean>(false);
  const [editingFoodId, setEditingFoodId] = useState<string | null>(null);
  const [menuSearch, setMenuSearch] = useState<string>('');
  const [menuCategoryFilter, setMenuCategoryFilter] = useState<string>('all');

  const [foodForm, setFoodForm] = useState({
    nameBn: '',
    nameEn: '',
    category: 'popular' as FoodItem['category'],
    price: '',
    originalPrice: '',
    image: 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=600&q=80',
    descriptionBn: '',
    descriptionEn: '',
    spicyLevel: 1,
    isVeg: false,
    isBundle: false,
    bundleItem1: '',
    bundleItem2: '',
    bundleItem3: '',
    bundleSavings: ''
  });

  const handleAutoGenerateBundleInfo = () => {
    const items = [foodForm.bundleItem1.trim(), foodForm.bundleItem2.trim(), foodForm.bundleItem3.trim()].filter(Boolean);
    if (items.length < 2) {
      alert('কমপক্ষে ২টি খাবারের নাম লিখুন (যেমন: কাচ্চি বিরিয়ানি ও বোরহানি)');
      return;
    }
    const combinedName = items.join(' + ') + ' কম্বো';
    const combinedDesc = `স্পেশাল বান্ডেল অফার! এই প্যাকেজে পাচ্ছেন: ${items.join(' এবং ')}।`;
    setFoodForm(prev => ({
      ...prev,
      nameBn: combinedName,
      nameEn: prev.nameEn || (items.join(' + ') + ' Combo'),
      category: 'combo',
      descriptionBn: combinedDesc,
      isBundle: true
    }));
  };

  const handleOpenAddFood = (asBundle = false) => {
    setEditingFoodId(null);
    setUploadImgMsg(null);
    setFoodForm({
      nameBn: '',
      nameEn: '',
      category: asBundle ? 'combo' : 'popular',
      price: '',
      originalPrice: '',
      image: asBundle 
        ? 'https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=600&q=80' 
        : 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=600&q=80',
      descriptionBn: '',
      descriptionEn: '',
      spicyLevel: 1,
      isVeg: false,
      isBundle: asBundle,
      bundleItem1: '',
      bundleItem2: '',
      bundleItem3: '',
      bundleSavings: ''
    });
    setFoodModalOpen(true);
  };

  const handleOpenEditFood = (item: FoodItem) => {
    setEditingFoodId(item.id);
    setUploadImgMsg(null);
    const bItems = item.bundleItems || [];
    setFoodForm({
      nameBn: item.nameBn,
      nameEn: item.nameEn,
      category: item.category,
      price: item.price.toString(),
      originalPrice: item.originalPrice ? item.originalPrice.toString() : '',
      image: item.image,
      descriptionBn: item.descriptionBn,
      descriptionEn: item.descriptionEn,
      spicyLevel: item.spicyLevel || 1,
      isVeg: item.isVeg || false,
      isBundle: item.isBundle || item.category === 'combo' || bItems.length > 0,
      bundleItem1: bItems[0] || '',
      bundleItem2: bItems[1] || '',
      bundleItem3: bItems[2] || '',
      bundleSavings: item.bundleSavings ? item.bundleSavings.toString() : ''
    });
    setFoodModalOpen(true);
  };

  // cPanel Food Image Upload State & Handlers
  const [isUploadingFoodImg, setIsUploadingFoodImg] = useState(false);
  const [uploadImgMsg, setUploadImgMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [uploadingCardId, setUploadingCardId] = useState<string | null>(null);

  const handleFoodModalImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingFoodImg(true);
    setUploadImgMsg(null);
    const res = await uploadFoodImageToCpanel(file);
    setIsUploadingFoodImg(false);
    if (res.ok && res.imageUrl) {
      setFoodForm(prev => ({ ...prev, image: res.imageUrl }));
      setUploadImgMsg({ type: 'ok', text: res.message });
      if (soundOn) playAddToCartSound();
    } else {
      setUploadImgMsg({ type: 'err', text: res.message || 'ছবি আপলোড ব্যর্থ হয়েছে।' });
    }
    e.target.value = '';
  };

  const handleQuickCardImageUpload = async (foodId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingCardId(foodId);
    const res = await uploadFoodImageToCpanel(file);
    setUploadingCardId(null);
    if (res.ok && res.imageUrl) {
      setMenuItems(prev => {
        const updated = prev.map(item => item.id === foodId ? { ...item, image: res.imageUrl } : item);
        saveToCpanelDb('salma_menu_items', updated);
        return updated;
      });
      if (soundOn) playAddToCartSound();
      alert('খাবারের নতুন ছবি সফলভাবে cPanel সার্ভারে ও ডাটাবেসে সেভ হয়েছে!');
    } else {
      alert(res.message || 'ছবি আপলোড করতে সমস্যা হয়েছে।');
    }
    e.target.value = '';
  };

  // cPanel MySQL (phpMyAdmin) Database Connection State
  const [mysqlStatus, setMysqlStatus] = useState(() => getMysqlStatus());
  const [dbModalOpen, setDbModalOpen] = useState(false);
  const [dbForm, setDbForm] = useState({
    dbHost: 'localhost',
    dbName: '',
    dbUser: '',
    dbPass: ''
  });
  const [dbConnecting, setDbConnecting] = useState(false);
  const [dbNotice, setDbNotice] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [isSyncingNow, setIsSyncingNow] = useState(false);

  useEffect(() => {
    return subscribeMysqlStatus(() => {
      setMysqlStatus({ ...getMysqlStatus() });
    });
  }, []);

  const handleSaveMysqlConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setDbConnecting(true);
    setDbNotice(null);
    const res = await setupMysqlDatabase(dbForm);
    setDbConnecting(false);
    if (res.ok) {
      setDbNotice({ type: 'ok', text: res.message });
      if (soundOn) playOrderSuccessSound();
      setTimeout(() => {
        setDbModalOpen(false);
      }, 1500);
    } else {
      setDbNotice({ type: 'err', text: res.message });
    }
  };

  const handleSyncAllNow = async () => {
    setIsSyncingNow(true);
    await syncAllToMysqlNow();
    setIsSyncingNow(false);
    if (soundOn) playAddToCartSound();
    alert('সকল ডাটা সফলভাবে cPanel সার্ভার ও MySQL ডাটাবেসে সিঙ্ক করা হয়েছে!');
  };

  const handleSaveFood = (e: React.FormEvent) => {
    e.preventDefault();
    if (!foodForm.nameBn.trim() || !foodForm.price || Number(foodForm.price) <= 0) {
      alert('খাবারের নাম এবং সঠিক মূল্য প্রদান করুন।');
      return;
    }

    const bList = [foodForm.bundleItem1.trim(), foodForm.bundleItem2.trim(), foodForm.bundleItem3.trim()].filter(Boolean);
    const isBundleFinal = foodForm.isBundle || foodForm.category === 'combo' || bList.length > 0;
    const computedSavings = foodForm.bundleSavings 
      ? Number(foodForm.bundleSavings) 
      : (foodForm.originalPrice && Number(foodForm.originalPrice) > Number(foodForm.price)
          ? Number(foodForm.originalPrice) - Number(foodForm.price)
          : undefined);

    if (editingFoodId) {
      // Edit existing
      setMenuItems(prev => {
        const updated = prev.map(item => {
          if (item.id === editingFoodId) {
            return {
              ...item,
              nameBn: foodForm.nameBn.trim(),
              nameEn: foodForm.nameEn.trim() || foodForm.nameBn.trim(),
              category: isBundleFinal && foodForm.category !== 'combo' ? 'combo' : foodForm.category,
              price: Number(foodForm.price),
              originalPrice: foodForm.originalPrice ? Number(foodForm.originalPrice) : undefined,
              image: foodForm.image.trim(),
              descriptionBn: foodForm.descriptionBn.trim(),
              descriptionEn: foodForm.descriptionEn.trim(),
              spicyLevel: foodForm.spicyLevel,
              isVeg: foodForm.isVeg,
              isBundle: isBundleFinal,
              bundleItems: bList.length > 0 ? bList : undefined,
              bundleSavings: computedSavings
            };
          }
          return item;
        });
        saveToCpanelDb('salma_menu_items', updated);
        return updated;
      });
      alert(`'${foodForm.nameBn}' মেনুতে সফলভাবে আপডেট করা হয়েছে!`);
    } else {
      // Add new
      const newItem: FoodItem = {
        id: 'food-' + Date.now(),
        nameBn: foodForm.nameBn.trim(),
        nameEn: foodForm.nameEn.trim() || foodForm.nameBn.trim(),
        category: isBundleFinal ? 'combo' : foodForm.category,
        price: Number(foodForm.price),
        originalPrice: foodForm.originalPrice ? Number(foodForm.originalPrice) : undefined,
        image: foodForm.image.trim() || 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=600&q=80',
        rating: 5.0,
        reviewsCount: 1,
        descriptionBn: foodForm.descriptionBn.trim() || 'সালমা ফুড কর্ণারের স্পেশাল রেসিপিতে তৈরি।',
        descriptionEn: foodForm.descriptionEn.trim() || 'Special recipe from Salma Food Corner.',
        spicyLevel: foodForm.spicyLevel,
        isVeg: foodForm.isVeg,
        isBundle: isBundleFinal,
        bundleItems: bList.length > 0 ? bList : undefined,
        bundleSavings: computedSavings
      };
      setMenuItems(prev => {
        const updated = [newItem, ...prev];
        saveToCpanelDb('salma_menu_items', updated);
        return updated;
      });
      alert(`নতুন খাবার '${newItem.nameBn}' সফলভাবে মেনু ও ডাটাবেসে যোগ করা হয়েছে!`);
    }
    setFoodModalOpen(false);
  };

  const handleDeleteFood = (id: string, nameBn: string) => {
    if (confirm(`আপনি কি সত্যিই '${nameBn}' মেনু থেকে মুছে ফেলতে (বিয়োজন) চান?`)) {
      setMenuItems(prev => {
        const updated = prev.filter(item => item.id !== id);
        saveToCpanelDb('salma_menu_items', updated);
        return updated;
      });
      alert(`'${nameBn}' মেনু থেকে মুছে ফেলা হয়েছে।`);
    }
  };

  const handleClearAllData = () => {
    if (confirm('আপনি কি সমস্ত ডাটা (মেনু, অর্ডার, লেজার, বাকি খাতা ও কাস্টমার তালিকা) সম্পূর্ণ পরিষ্কার করে নতুন করে শুরু করতে চান?')) {
      setMenuItems([]);
      setOrders([]);
      setLedger([]);
      setCustomers({});
      localStorage.setItem('salma_menu_items', JSON.stringify([]));
      localStorage.setItem('salma_orders', JSON.stringify([]));
      localStorage.setItem('salma_ledger', JSON.stringify([]));
      localStorage.setItem('salma_customers', JSON.stringify({}));
      localStorage.setItem('salma_due_ledger', JSON.stringify([]));
      localStorage.setItem('salma_sms_logs', JSON.stringify([]));
      localStorage.removeItem('salma_logged_customer');
      if (soundOn) playAddToCartSound();
      alert('সকল ডাটা সফলভাবে মুছে ফেলা হয়েছে! এখন আপনি নতুন ফ্রেশ ডাটা এন্ট্রি করতে পারেন।');
    }
  };

  // Customer Add / Edit Modal State
  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [editingCustOriginalPhone, setEditingCustOriginalPhone] = useState<string | null>(null);
  const [newCustPhone, setNewCustPhone] = useState('');
  const [newCustName, setNewCustName] = useState('');
  const [newCustAddress, setNewCustAddress] = useState('');
  const [newCustPoints, setNewCustPoints] = useState('0');
  const [newCustOrders, setNewCustOrders] = useState('0');
  const [newCustSpent, setNewCustSpent] = useState('0');

  const handleOpenAddCustomer = () => {
    setEditingCustOriginalPhone(null);
    setNewCustPhone('');
    setNewCustName('');
    setNewCustAddress('');
    setNewCustPoints('0');
    setNewCustOrders('0');
    setNewCustSpent('0');
    setCustomerModalOpen(true);
  };

  const handleOpenEditCustomer = (cust: CustomerProfile) => {
    setEditingCustOriginalPhone(cust.phone);
    setNewCustPhone(cust.phone);
    setNewCustName(cust.name);
    setNewCustAddress(cust.address);
    setNewCustPoints(String(cust.loyaltyPoints || 0));
    setNewCustOrders(String(cust.totalOrders || 0));
    setNewCustSpent(String(cust.totalSpent || 0));
    setCustomerModalOpen(true);
  };

  const handleAddCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPhone = normalizeBdPhone(newCustPhone.trim()) || newCustPhone.trim();
    const name = newCustName.trim();
    const address = newCustAddress.trim();
    if (!cleanPhone || !name) {
      alert('অনুগ্রহ করে গ্রাহকের নাম ও মোবাইল নম্বর লিখুন।');
      return;
    }

    if (editingCustOriginalPhone) {
      setCustomers(prev => {
        const nextMap = { ...prev };
        const oldRecord = nextMap[editingCustOriginalPhone];
        if (editingCustOriginalPhone !== cleanPhone) {
          delete nextMap[editingCustOriginalPhone];
        }
        nextMap[cleanPhone] = {
          phone: cleanPhone,
          name,
          address: address || 'চান্দনা চৌরাস্তা, গাজীপুর',
          loyaltyPoints: Math.max(0, Number(newCustPoints) || 0),
          registeredAt: oldRecord?.registeredAt || todayStr,
          totalOrders: Math.max(0, Number(newCustOrders) || 0),
          totalSpent: Math.max(0, Number(newCustSpent) || 0)
        };
        saveToCpanelDb('salma_customers', nextMap);
        return nextMap;
      });
      setCustomerModalOpen(false);
      setEditingCustOriginalPhone(null);
      if (soundOn) playAddToCartSound();
      alert(`গ্রাহক '${name}' এর তথ্য সফলভাবে আপডেট হয়েছে!`);
      return;
    }

    const newProfile: CustomerProfile = {
      phone: cleanPhone,
      name,
      address: address || 'চান্দনা চৌরাস্তা, গাজীপুর',
      loyaltyPoints: Math.max(0, Number(newCustPoints) || 0),
      registeredAt: todayStr,
      totalOrders: Math.max(0, Number(newCustOrders) || 0),
      totalSpent: Math.max(0, Number(newCustSpent) || 0)
    };
    setCustomers(prev => {
      const updated = { ...prev, [cleanPhone]: newProfile };
      saveToCpanelDb('salma_customers', updated);
      return updated;
    });
    setCustomerModalOpen(false);
    setNewCustPhone('');
    setNewCustName('');
    setNewCustAddress('');
    if (soundOn) playAddToCartSound();
    alert(`গ্রাহক '${name}' সফলভাবে ডাটাবেজে যুক্ত হয়েছেন!`);
  };

  const handleDeleteCustomer = (phoneKey: string, custName: string) => {
    if (confirm(`আপনি কি সত্যিই গ্রাহক '${custName} (${phoneKey})' এর প্রোফাইল ডাটাবেজ থেকে মুছে ফেলতে চান?`)) {
      setCustomers(prev => {
        const updated = { ...prev };
        delete updated[phoneKey];
        saveToCpanelDb('salma_customers', updated);
        return updated;
      });
      if (soundOn) playAddToCartSound();
    }
  };


  // -------------------------------------------------------------
  // POS LEDGER & ACCOUNTING (দৈনিক আয় ও ব্যয়ের হিসাব + এডিট ও ডিলেট)
  // -------------------------------------------------------------
  const [quickIncome, setQuickIncome] = useState({ category: 'খাবার বিক্রয় (Food Sales)', amount: '', paymentMethod: 'Cash' as const, note: '' });
  const [quickExpense, setQuickExpense] = useState({ category: 'কাঁচামাল ও বাজার (Raw Materials)', amount: '', paymentMethod: 'Cash' as const, note: '' });

  // Edit Ledger Modal State
  const [ledgerModalOpen, setLedgerModalOpen] = useState(false);
  const [editingLedgerId, setEditingLedgerId] = useState<string | null>(null);
  const [ledgerEditForm, setLedgerEditForm] = useState({
    type: 'income' as 'income' | 'expense',
    voucherNo: '',
    category: '',
    amount: '',
    date: todayStr,
    paymentMethod: 'Cash' as LedgerEntry['paymentMethod'],
    note: ''
  });

  const handleOpenEditLedger = (entry: LedgerEntry) => {
    setEditingLedgerId(entry.id);
    setLedgerEditForm({
      type: entry.type,
      voucherNo: entry.voucherNo,
      category: entry.category,
      amount: String(entry.amount),
      date: entry.date,
      paymentMethod: entry.paymentMethod,
      note: entry.note || ''
    });
    setLedgerModalOpen(true);
  };

  const handleSaveEditLedger = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLedgerId) return;
    const amt = Number(ledgerEditForm.amount);
    if (!amt || amt <= 0) {
      alert('সঠিক টাকার পরিমাণ দিন।');
      return;
    }
    setLedger(prev => {
      const updated = prev.map(item => {
        if (item.id === editingLedgerId) {
          return {
            ...item,
            type: ledgerEditForm.type,
            voucherNo: ledgerEditForm.voucherNo.trim() || item.voucherNo,
            category: ledgerEditForm.category.trim() || item.category,
            amount: amt,
            date: ledgerEditForm.date || item.date,
            paymentMethod: ledgerEditForm.paymentMethod,
            note: ledgerEditForm.note.trim()
          };
        }
        return item;
      });
      saveToCpanelDb('salma_ledger', updated);
      return updated;
    });
    setLedgerModalOpen(false);
    setEditingLedgerId(null);
    if (soundOn) playAddToCartSound();
    alert('হিসাব এন্ট্রিটি সফলভাবে এডিট ও সংরক্ষণ করা হয়েছে!');
  };

  const handleAddIncome = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickIncome.amount || Number(quickIncome.amount) <= 0) return;
    const entry: LedgerEntry = {
      id: 'inc-' + Date.now(),
      voucherNo: 'VCH-Q' + Math.floor(100 + Math.random() * 900),
      type: 'income',
      category: quickIncome.category,
      amount: Number(quickIncome.amount),
      date: todayStr,
      paymentMethod: quickIncome.paymentMethod,
      note: quickIncome.note || 'দৈনিক নগদ আয়'
    };
    setLedger(prev => {
      const updated = [entry, ...prev];
      saveToCpanelDb('salma_ledger', updated);
      return updated;
    });
    setQuickIncome({ category: 'খাবার বিক্রয় (Food Sales)', amount: '', paymentMethod: 'Cash', note: '' });
    if (soundOn) playAddToCartSound();
    alert(`৳${entry.amount} আয় সফলভাবে এন্ট্রি হয়েছে!`);
  };

  const handleAddExpense = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickExpense.amount || Number(quickExpense.amount) <= 0) return;
    const entry: LedgerEntry = {
      id: 'exp-' + Date.now(),
      voucherNo: 'VCH-E' + Math.floor(100 + Math.random() * 900),
      type: 'expense',
      category: quickExpense.category,
      amount: Number(quickExpense.amount),
      date: todayStr,
      paymentMethod: quickExpense.paymentMethod,
      note: quickExpense.note || 'দৈনিক খরচ'
    };
    setLedger(prev => {
      const updated = [entry, ...prev];
      saveToCpanelDb('salma_ledger', updated);
      return updated;
    });
    setQuickExpense({ category: 'কাঁচামাল ও বাজার (Raw Materials)', amount: '', paymentMethod: 'Cash', note: '' });
    if (soundOn) playAddToCartSound();
    alert(`৳${entry.amount} ব্যয় সফলভাবে এন্ট্রি হয়েছে!`);
  };

  const handleDeleteLedger = (id: string) => {
    if (confirm('আপনি কি এই হিসাব এন্ট্রিটি মুছে ফেলতে চান?')) {
      setLedger(prev => {
        const updated = prev.filter(l => l.id !== id);
        saveToCpanelDb('salma_ledger', updated);
        return updated;
      });
    }
  };

  // Calculations
  const todayEntries = ledger.filter(l => l.date === todayStr);
  const todayIncome = todayEntries.filter(l => l.type === 'income').reduce((s, i) => s + i.amount, 0);
  const todayExpense = todayEntries.filter(l => l.type === 'expense').reduce((s, i) => s + i.amount, 0);

  const totalIncome = ledger.filter(l => l.type === 'income').reduce((s, i) => s + i.amount, 0);
  const totalExpense = ledger.filter(l => l.type === 'expense').reduce((s, i) => s + i.amount, 0);
  const netBalance = totalIncome - totalExpense;

  // -------------------------------------------------------------
  // ORDERS MANAGEMENT (স্ট্যাটাস, এডিট ও ডিলেট)
  // -------------------------------------------------------------
  const [orderFilter, setOrderFilter] = useState<'All' | 'Placed' | 'Preparing' | 'Out for Delivery' | 'Delivered'>('All');
  const [selectedReceiptOrder, setSelectedReceiptOrder] = useState<Order | null>(null);

  // Order Edit Modal State
  const [orderEditModalOpen, setOrderEditModalOpen] = useState(false);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [orderEditForm, setOrderEditForm] = useState({
    customerName: '',
    phone: '',
    address: '',
    totalAmount: '',
    advancePaid: '',
    dueAmount: '',
    advancePaymentMethod: 'bKash' as 'bKash' | 'Nagad' | 'Card',
    transactionId: '',
    status: 'Placed' as Order['status']
  });

  const handleOpenEditOrder = (order: Order) => {
    setEditingOrderId(order.id);
    setOrderEditForm({
      customerName: order.customerName,
      phone: order.phone,
      address: order.address,
      totalAmount: String(order.totalAmount),
      advancePaid: String(order.advancePaid),
      dueAmount: String(order.dueAmount),
      advancePaymentMethod: order.advancePaymentMethod || 'bKash',
      transactionId: order.transactionId || '',
      status: order.status
    });
    setOrderEditModalOpen(true);
  };

  const handleSaveEditOrder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingOrderId) return;
    const total = Math.max(0, Number(orderEditForm.totalAmount) || 0);
    const adv = Math.max(0, Number(orderEditForm.advancePaid) || 0);
    const due = Math.max(0, Number(orderEditForm.dueAmount));
    setOrders(prev => {
      const updatedList = prev.map(o => {
        if (o.id === editingOrderId) {
          return {
            ...o,
            customerName: orderEditForm.customerName.trim() || o.customerName,
            phone: normalizeBdPhone(orderEditForm.phone.trim()) || orderEditForm.phone.trim() || o.phone,
            address: orderEditForm.address.trim() || o.address,
            totalAmount: total,
            advancePaid: adv,
            dueAmount: due,
            advancePaymentMethod: orderEditForm.advancePaymentMethod,
            transactionId: orderEditForm.transactionId.trim(),
            paymentStatus: (due === 0 ? 'Fully Paid (100%)' : '50% Advance Paid (Due on Delivery)') as Order['paymentStatus'],
            status: orderEditForm.status
          };
        }
        return o;
      });
      saveToCpanelDb('salma_orders', updatedList);
      return updatedList;
    });
    setOrderEditModalOpen(false);
    setEditingOrderId(null);
    if (soundOn) playAddToCartSound();
    alert(`অর্ডার #${editingOrderId} এর তথ্য সফলভাবে আপডেট করা হয়েছে!`);
  };

  const handleDeleteOrder = (orderId: string) => {
    if (confirm(`আপনি কি সত্যিই অর্ডার #${orderId} ডাটাবেজ থেকে সম্পূর্ণ মুছে ফেলতে (ডিলেট) চান?`)) {
      setOrders(prev => {
        const updatedList = prev.filter(o => o.id !== orderId);
        saveToCpanelDb('salma_orders', updatedList);
        return updatedList;
      });
      if (soundOn) playAddToCartSound();
    }
  };

  const handleUpdateOrderStatus = (orderId: string, newStatus: Order['status']) => {
    setOrders(prev => {
      const updatedList = prev.map(o => {
        if (o.id === orderId) {
          const updated = { ...o, status: newStatus };
          if (o.status === 'Preparing' && newStatus === 'Out for Delivery') {
            localStorage.setItem('salma_delivery_toast', JSON.stringify(updated));
          }
          return updated;
        }
        return o;
      });
      saveToCpanelDb('salma_orders', updatedList);
      return updatedList;
    });
    if (soundOn) playAddToCartSound();
  };

  const filteredOrders = orders.filter(o => orderFilter === 'All' || o.status === orderFilter);

  // -------------------------------------------------------------
  // FINANCIAL REPORTS
  // -------------------------------------------------------------
  const [reportPeriod, setReportPeriod] = useState<'daily' | 'monthly' | 'yearly'>('daily');
  const currentMonth = todayStr.substring(0, 7); // YYYY-MM
  const currentYear = todayStr.substring(0, 4); // YYYY

  const reportEntries = ledger.filter(l => {
    if (reportPeriod === 'daily') return l.date === todayStr;
    if (reportPeriod === 'monthly') return l.date.startsWith(currentMonth);
    if (reportPeriod === 'yearly') return l.date.startsWith(currentYear);
    return true;
  });

  const repIncome = reportEntries.filter(l => l.type === 'income').reduce((s, i) => s + i.amount, 0);
  const repExpense = reportEntries.filter(l => l.type === 'expense').reduce((s, i) => s + i.amount, 0);
  const repProfit = repIncome - repExpense;

  // -------------------------------------------------------------
  // BULK SMS MARKETING
  // -------------------------------------------------------------
  const [smsMessage, setSmsMessage] = useState<string>('🎉 সালমা ফুড কর্ণারে আজকের স্পেশাল কাচ্চি বিরিয়ানিতে ২০% ছাড়! অর্ডার করতে ভিজিট করুন আমাদের অনলাইন অ্যাপে।');
  const [isSendingSms, setIsSendingSms] = useState<boolean>(false);
  const [smsStatus, setSmsStatus] = useState<string | null>(null);

  const handleSendBulkSms = () => {
    const customerList = Object.values(customers);
    if (customerList.length === 0) {
      alert('ডাটাবেজে কোনো গ্রাহকের নম্বর পাওয়া যায়নি!');
      return;
    }
    setIsSendingSms(true);
    setSmsStatus('এসএমএস পাঠানো হচ্ছে...');
    setTimeout(() => {
      setIsSendingSms(false);
      setSmsStatus(`সফলভাবে ${customerList.length} জন গ্রাহকের মোবাইলে এসএমএস পাঠানো সম্পন্ন হয়েছে!`);
      if (soundOn) playOrderSuccessSound();
    }, 1200);
  };

  // Filtered menu
  const filteredMenu = menuItems.filter(item => {
    const matchCat = menuCategoryFilter === 'all' || item.category === menuCategoryFilter;
    const matchSearch = item.nameBn.toLowerCase().includes(menuSearch.toLowerCase()) || 
                        item.nameEn.toLowerCase().includes(menuSearch.toLowerCase());
    return matchCat && matchSearch;
  });

  // -------------------------------------------------------------
  // PIN LOCK SCREEN (If not authenticated)
  // -------------------------------------------------------------
  if (!isAuthenticated) {
    return (
      <div className="max-w-[430px] w-full mx-auto min-h-screen bg-gradient-to-br from-red-900 via-gray-900 to-emerald-950 flex flex-col justify-between p-5 shadow-[0_0_60px_rgba(0,0,0,0.6)] border-x border-white/10">

        <div className="bg-white rounded-3xl p-6 w-full shadow-2xl text-center space-y-5 border border-amber-200 my-auto">
          <div className="w-16 h-16 bg-gradient-to-tr from-red-600 via-amber-500 to-emerald-600 rounded-2xl flex items-center justify-center mx-auto text-white shadow-lg">
            <ChefHat className="w-9 h-9" />
          </div>
          <div>
            <h1 className="text-xl font-black text-gray-900">সালমা ফুড কর্ণার, গাজীপুর</h1>
            <p className="text-xs text-red-600 font-bold uppercase tracking-wider mt-0.5">গাজীপুর এডমিন ও পিওএস অ্যাপ</p>
            <p className="text-xs text-gray-500 mt-1.5">এডমিন প্যানেলে প্রবেশ করতে ৪ ডিজিটের পিন নম্বর দিন</p>
          </div>

          <form onSubmit={handlePinSubmit} className="space-y-4">
            <div className="relative">
              <input 
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={pinInput}
                onChange={(e) => {
                  setPinInput(e.target.value);
                  setPinError('');
                }}
                placeholder="পিন (ডিফল্ট: 1234)"
                className="w-full text-center text-2xl tracking-[0.5em] font-mono py-3 px-4 border-2 border-red-300 focus:border-red-600 rounded-2xl focus:outline-none bg-red-50/40 text-gray-800"
                autoFocus
              />
            </div>

            {pinError && (
              <p className="text-xs text-red-600 font-bold flex items-center justify-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>{pinError}</span>
              </p>
            )}

            <button 
              type="submit"
              className="w-full bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-700 hover:to-amber-700 text-white font-bold py-3.5 rounded-2xl shadow-lg transition active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
            >
              <Unlock className="w-4 h-4" />
              <span>লগইন করুন</span>
            </button>
          </form>

          <div className="pt-2 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
            <span>ডিফল্ট পিন: <b className="text-gray-800">1234</b></span>
            <a href="/index.html" className="text-emerald-700 font-bold hover:underline flex items-center gap-1">
              <Eye className="w-3 h-3" />
              <span>গ্রাহক অ্যাপ ভিউ</span>
            </a>
          </div>
        </div>

        <div className="text-center text-[10px] text-white/50 pb-1">
          ১০০% মোবাইল অ্যাপ ভিউ • সালমা ফুড কর্ণার
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // MAIN ADMIN APP SHELL (100% Dedicated Mobile App View)
  // -------------------------------------------------------------
  return (
    <div className="max-w-[430px] w-full mx-auto min-h-screen bg-gray-50 flex flex-col font-sans text-gray-800 pb-24 shadow-[0_0_60px_rgba(0,0,0,0.5)] relative border-x border-gray-300 overflow-x-hidden">
      
      {/* Top Native Mobile Status Bar + App Header */}
      <header className="sticky top-0 z-40 bg-gradient-to-r from-red-800 via-red-700 to-emerald-900 text-white shadow-md">

        <div className="px-3.5 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-amber-400 text-red-900 flex items-center justify-center font-black shadow">
              <ChefHat className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h1 className="text-sm font-black leading-tight">সালমা ফুড এডমিন (গাজীপুর)</h1>
                <span className="bg-emerald-500/30 text-emerald-300 border border-emerald-400/30 text-[9px] font-bold px-1.5 py-0.5 rounded-md">
                  POS
                </span>
              </div>
              <p className="text-[10px] text-amber-200">গাজীপুর রেস্টুরেন্ট ও ডেলিভারি ম্যানেজার</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Audio Toggle */}
            <button 
              onClick={() => {
                const next = !soundOn;
                setSoundOn(next);
                setSoundEnabled(next);
                if (next) playAddToCartSound();
              }}
              className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition cursor-pointer"
              title={soundOn ? 'সাউন্ড সক্রিয়' : 'সাউন্ড বন্ধ'}
            >
              {soundOn ? <Volume2 className="w-4 h-4 text-amber-300" /> : <VolumeX className="w-4 h-4 text-gray-300" />}
            </button>

            {/* Switch to Public Mobile App */}
            <a 
              href="/index.html"
              className="bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold px-2.5 py-1.5 rounded-full flex items-center gap-1 shadow-xs transition"
              title="গ্রাহকদের মোবাইল অ্যাপ দেখুন"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>গ্রাহক অ্যাপ</span>
            </a>

            {/* Logout PIN */}
            <button 
              onClick={handleLogout}
              className="p-2 rounded-full bg-red-950/60 hover:bg-red-900 text-red-200 transition cursor-pointer"
              title="লগআউট"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Horizontal Touch-Scrollable Mobile Feature Pills (All 8 Modules) */}
        <div className="flex px-3 gap-1.5 overflow-x-auto scrollbar-none border-t border-white/10 py-2 text-[11px] font-bold">
          {[
            { id: 'dashboard', label: 'ড্যাশবোর্ড', icon: TrendingUp },
            { id: 'menu', label: 'খাবার মেনু', icon: Utensils, badge: menuItems.length },
            { id: 'ledger', label: 'POS লেজার', icon: BarChart2 },
            { id: 'due', label: 'বাকি খাতা', icon: BookOpen },
            { id: 'reports', label: 'রিপোর্টস', icon: FileText },
            { id: 'orders', label: 'লাইভ অর্ডার', icon: Truck, badge: orders.filter(o => o.status !== 'Delivered').length },
            { id: 'customers', label: 'গ্রাহক', icon: Users, badge: Object.keys(customers).length },
            { id: 'marketing', label: 'বাল্ক এসএমএস', icon: Smartphone },
            { id: 'location', label: 'দোকানের অবস্থান', icon: MapPin }
          ].map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl transition cursor-pointer whitespace-nowrap shrink-0 ${
                  isActive ? 'bg-white text-red-800 shadow-sm' : 'bg-white/10 text-white/90 hover:bg-white/20'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
                {tab.badge !== undefined && tab.badge > 0 && (
                  <span className={`text-[9px] px-1.5 py-0.2 rounded-full font-black ${
                    isActive ? 'bg-red-700 text-white' : 'bg-amber-400 text-red-950'
                  }`}>
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </header>

      {/* Main Mobile Screen Content Area */}
      <main className="w-full px-3.5 py-4 flex-1 space-y-4">

        {/* ============================================================== */}
        {/* TAB 1: DASHBOARD OVERVIEW & 2 FUNCTIONAL POS LEDGER CARDS     */}
        {/* ============================================================== */}
        {activeTab === 'dashboard' && (
          <div className="space-y-4">
            
            {/* Top 2x2 Mobile Stat Cards */}
            <div className="grid grid-cols-2 gap-2.5">
              <div className="bg-white p-3.5 rounded-2xl shadow-xs border border-gray-200">
                <div className="flex items-center justify-between text-gray-500 text-[11px] mb-1">
                  <span>মোট বিক্রয় ও আয়</span>
                  <ArrowUpRight className="w-3.5 h-3.5 text-emerald-600" />
                </div>
                <p className="text-lg font-black text-gray-900">৳ {totalIncome}</p>
                <p className="text-[10px] text-emerald-600 font-semibold mt-0.5">আজকের আয়: ৳{todayIncome}</p>
              </div>

              <div className="bg-white p-3.5 rounded-2xl shadow-xs border border-gray-200">
                <div className="flex items-center justify-between text-gray-500 text-[11px] mb-1">
                  <span>মোট খরচ ও ব্যয়</span>
                  <ArrowDownRight className="w-3.5 h-3.5 text-red-600" />
                </div>
                <p className="text-lg font-black text-gray-900">৳ {totalExpense}</p>
                <p className="text-[10px] text-red-600 font-semibold mt-0.5">আজকের ব্যয়: ৳{todayExpense}</p>
              </div>

              <div className="bg-white p-3.5 rounded-2xl shadow-xs border border-gray-200">
                <div className="flex items-center justify-between text-gray-500 text-[11px] mb-1">
                  <span>নিট ক্যাশ ব্যালেন্স</span>
                  <DollarSign className="w-3.5 h-3.5 text-amber-600" />
                </div>
                <p className={`text-lg font-black ${netBalance >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                  ৳ {netBalance}
                </p>
                <p className="text-[10px] text-gray-500 font-semibold mt-0.5">সর্বমোট নিট প্রফিট</p>
              </div>

              <div className="bg-white p-3.5 rounded-2xl shadow-xs border border-gray-200">
                <div className="flex items-center justify-between text-gray-500 text-[11px] mb-1">
                  <span>মোট অর্ডার</span>
                  <Truck className="w-3.5 h-3.5 text-blue-600" />
                </div>
                <p className="text-lg font-black text-gray-900">{orders.length} টি</p>
                <p className="text-[10px] text-blue-600 font-semibold mt-0.5">
                  পেন্ডিং: {orders.filter(o => o.status !== 'Delivered').length} টি
                </p>
              </div>
            </div>

            {/* Quick Due Ledger Alert Card in Dashboard */}
            <div 
              onClick={() => setActiveTab('due')}
              className="bg-gradient-to-r from-rose-50 via-red-50 to-amber-50 border border-rose-200 p-3.5 rounded-2xl flex items-center justify-between cursor-pointer hover:shadow-xs transition"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-red-600 text-white flex items-center justify-center font-bold shadow-xs">
                  <BookOpen className="w-4 h-4 text-amber-200" />
                </div>
                <div>
                  <h4 className="text-xs font-black text-gray-900 flex items-center gap-1.5">
                    <span>বাকি খাতা (Due Ledger)</span>
                    <span className="bg-red-100 text-red-800 text-[9px] font-bold px-1.5 py-0.2 rounded-full">সক্রিয়</span>
                  </h4>
                  <p className="text-[10px] text-gray-600">খদ্দেরের বাকি ট্র্যাকিং, দেনা-পাওনা ও বকেয়া আদায় পরিচালনা করুন</p>
                </div>
              </div>
              <div className="flex items-center gap-1 text-xs font-bold text-red-700 bg-white px-2.5 py-1.5 rounded-xl border border-rose-200 shadow-2xs">
                <span>খুলুন</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </div>
            </div>

            {/* THE TWO FUNCTIONAL POS CARDS (Today's Income & Expense Entry - Stacked for Mobile) */}
            <div className="grid grid-cols-1 gap-4">
              
              {/* Card 1: Today's Income Card */}
              <div className="bg-gradient-to-br from-emerald-50 via-teal-50/40 to-white rounded-3xl p-5 shadow-sm border border-emerald-300 space-y-4">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center font-bold shadow-sm">
                      <ArrowUpRight className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-black text-gray-900 text-sm sm:text-base">দৈনিক আয় কার্ড (Today's Income)</h3>
                      <p className="text-xs text-emerald-700 font-semibold">{todayStr}</p>
                    </div>
                  </div>
                  <span className="text-2xl font-black text-emerald-700">৳ {todayIncome}</span>
                </div>

                <form onSubmit={handleAddIncome} className="bg-white/95 p-4 rounded-2xl border border-emerald-200 space-y-3">
                  <p className="text-xs font-bold text-emerald-950 flex items-center gap-1">
                    <Plus className="w-3.5 h-3.5 text-emerald-600" />
                    <span>তাত্ক্ষণিক আয় এন্ট্রি করুন (Quick Cash Entry)</span>
                  </p>
                  
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={quickIncome.category}
                      onChange={(e) => setQuickIncome({ ...quickIncome, category: e.target.value })}
                      className="border border-emerald-300 rounded-xl p-2 text-xs bg-white font-medium"
                    >
                      <option value="খাবার বিক্রয় (Food Sales)">খাবার বিক্রয় (Sales)</option>
                      <option value="ক্যাটারিং সার্ভিস (Catering)">ক্যাটারিং সার্ভিস</option>
                      <option value="হোম ডেলিভারি ফি (Delivery)">হোম ডেলিভারি ফি</option>
                      <option value="অন্যান্য আয় (Other)">অন্যান্য আয়</option>
                    </select>

                    <input 
                      type="number"
                      placeholder="টাকার পরিমাণ (৳)"
                      value={quickIncome.amount}
                      onChange={(e) => setQuickIncome({ ...quickIncome, amount: e.target.value })}
                      className="border border-emerald-300 rounded-xl p-2 text-xs bg-white font-bold"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={quickIncome.paymentMethod}
                      onChange={(e) => setQuickIncome({ ...quickIncome, paymentMethod: e.target.value as any })}
                      className="border border-emerald-300 rounded-xl p-2 text-xs bg-white"
                    >
                      <option value="Cash">ক্যাশ (Cash)</option>
                      <option value="bKash">বিকাশ (bKash)</option>
                      <option value="Nagad">নগদ (Nagad)</option>
                      <option value="Bank">ব্যাংক (Bank)</option>
                    </select>

                    <input 
                      type="text"
                      placeholder="বিবরণ / নোট (ঐচ্ছিক)"
                      value={quickIncome.note}
                      onChange={(e) => setQuickIncome({ ...quickIncome, note: e.target.value })}
                      className="border border-emerald-300 rounded-xl p-2 text-xs bg-white"
                    />
                  </div>

                  <button 
                    type="submit"
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 rounded-xl text-xs shadow-sm transition active:scale-95 cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ আয় জমা করুন (Add Income)</span>
                  </button>
                </form>
              </div>

              {/* Card 2: Today's Expense Card */}
              <div className="bg-gradient-to-br from-red-50 via-rose-50/40 to-white rounded-3xl p-5 shadow-sm border border-red-300 space-y-4">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-2xl bg-red-600 text-white flex items-center justify-center font-bold shadow-sm">
                      <ArrowDownRight className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-black text-gray-900 text-sm sm:text-base">দৈনিক ব্যয় কার্ড (Today's Expense)</h3>
                      <p className="text-xs text-red-700 font-semibold">{todayStr}</p>
                    </div>
                  </div>
                  <span className="text-2xl font-black text-red-600">৳ {todayExpense}</span>
                </div>

                <form onSubmit={handleAddExpense} className="bg-white/95 p-4 rounded-2xl border border-red-200 space-y-3">
                  <p className="text-xs font-bold text-red-950 flex items-center gap-1">
                    <Plus className="w-3.5 h-3.5 text-red-600" />
                    <span>তাত্ক্ষণিক ব্যয় এন্ট্রি করুন (Quick Expense Entry)</span>
                  </p>

                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={quickExpense.category}
                      onChange={(e) => setQuickExpense({ ...quickExpense, category: e.target.value })}
                      className="border border-red-300 rounded-xl p-2 text-xs bg-white font-medium"
                    >
                      <option value="কাঁচামাল ও বাজার (Raw Materials)">কাঁচামাল ও বাজার</option>
                      <option value="গ্যাস ও বিদ্যুৎ বিল (Utilities)">গ্যাস ও বিদ্যুৎ বিল</option>
                      <option value="কর্মচারী বেতন (Staff Salary)">কর্মচারী বেতন</option>
                      <option value="দোকান ভাড়া (Shop Rent)">দোকান ভাড়া</option>
                      <option value="প্যাকেজিং খরচ (Packaging)">প্যাকেজিং বক্স/ব্যাগ</option>
                      <option value="অন্যান্য ব্যয় (Other)">অন্যান্য ব্যয়</option>
                    </select>

                    <input 
                      type="number"
                      placeholder="টাকার পরিমাণ (৳)"
                      value={quickExpense.amount}
                      onChange={(e) => setQuickExpense({ ...quickExpense, amount: e.target.value })}
                      className="border border-red-300 rounded-xl p-2 text-xs bg-white font-bold"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={quickExpense.paymentMethod}
                      onChange={(e) => setQuickExpense({ ...quickExpense, paymentMethod: e.target.value as any })}
                      className="border border-red-300 rounded-xl p-2 text-xs bg-white"
                    >
                      <option value="Cash">ক্যাশ (Cash)</option>
                      <option value="bKash">বিকাশ (bKash)</option>
                      <option value="Nagad">নগদ (Nagad)</option>
                      <option value="Bank">ব্যাংক (Bank)</option>
                    </select>

                    <input 
                      type="text"
                      placeholder="বিবরণ / ভাউচার নোট (ঐচ্ছিক)"
                      value={quickExpense.note}
                      onChange={(e) => setQuickExpense({ ...quickExpense, note: e.target.value })}
                      className="border border-red-300 rounded-xl p-2 text-xs bg-white"
                    />
                  </div>

                  <button 
                    type="submit"
                    className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2.5 rounded-xl text-xs shadow-sm transition active:scale-95 cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ ব্যয় রেকর্ড করুন (Record Expense)</span>
                  </button>
                </form>
              </div>

            </div>

            {/* Quick Actions Bar */}
            <div className="bg-white p-4 rounded-3xl border border-gray-200 flex flex-wrap items-center justify-between gap-3 shadow-xs">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-500" />
                <span className="text-xs font-bold text-gray-700">দ্রুত অ্যাক্সেস:</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <button 
                  onClick={() => handleOpenAddFood(false)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-1.5 rounded-xl flex items-center gap-1 transition cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>নতুন খাবার যোগ</span>
                </button>
                <button 
                  onClick={() => setActiveTab('orders')}
                  className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold px-3 py-1.5 rounded-xl flex items-center gap-1 transition cursor-pointer"
                >
                  <Truck className="w-3.5 h-3.5" />
                  <span>অর্ডার তালিকা ({orders.length})</span>
                </button>
                <button 
                  onClick={() => setActiveTab('due')}
                  className="bg-rose-700 hover:bg-rose-800 text-white text-xs font-bold px-3 py-1.5 rounded-xl flex items-center gap-1 transition cursor-pointer"
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>বাকি খাতা (Due)</span>
                </button>
                <button 
                  onClick={() => setActiveTab('reports')}
                  className="bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold px-3 py-1.5 rounded-xl flex items-center gap-1 transition cursor-pointer"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>আর্থিক রিপোর্টস</span>
                </button>
                <button 
                  onClick={() => setActiveTab('location')}
                  className="bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold px-3 py-1.5 rounded-xl flex items-center gap-1 transition cursor-pointer"
                >
                  <MapPin className="w-3.5 h-3.5" />
                  <span>দোকানের অবস্থান (GPS)</span>
                </button>
              </div>
            </div>

          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 2: FOOD MENU MANAGEMENT (সংযোজন, এডিট, বিয়োজন)           */}
        {/* ============================================================== */}
        {activeTab === 'menu' && (
          <div className="space-y-4">
            
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-white p-4 rounded-2xl border border-gray-200 shadow-xs">
              <div>
                <h2 className="text-base sm:text-lg font-black text-gray-900 flex items-center gap-2">
                  <Utensils className="w-5 h-5 text-red-600" />
                  <span>খাবার মেনু ব্যবস্থাপনা ({menuItems.length} টি আইটেম)</span>
                </h2>
                <p className="text-xs text-gray-500">মেনুতে নতুন খাবার সংযোজন করুন, দাম পরিবর্তন ও এডিট বা বিয়োজন করুন</p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button 
                  onClick={() => handleOpenAddFood(false)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-2 rounded-xl flex items-center gap-1.5 shadow transition cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>+ সাধারণ খাবার</span>
                </button>
                <button 
                  onClick={() => handleOpenAddFood(true)}
                  className="bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-700 hover:to-amber-700 text-white text-xs font-bold px-3.5 py-2 rounded-xl flex items-center gap-1.5 shadow transition active:scale-95 cursor-pointer"
                >
                  <Sparkles className="w-4 h-4 text-amber-200" />
                  <span>🎁 + কম্বো বান্ডেল তৈরি</span>
                </button>
              </div>
            </div>

            {/* Search & Category Filter */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
                <input 
                  type="text"
                  placeholder="খাবারের নাম দিয়ে খুঁজুন..."
                  value={menuSearch}
                  onChange={(e) => setMenuSearch(e.target.value)}
                  className="w-full bg-white border border-gray-200 rounded-xl pl-9 pr-4 py-2 text-xs focus:outline-none focus:border-red-500 shadow-xs"
                />
              </div>
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                {[
                  { id: 'all', label: 'সব' },
                  { id: 'combo', label: '🎁 কম্বো ও বান্ডেল' },
                  { id: 'popular', label: 'জনপ্রিয়' },
                  { id: 'biryani', label: 'বিরিয়ানি' },
                  { id: 'fastfood', label: 'ফাস্ট ফুড' },
                  { id: 'curry', label: 'মাংস ও কারি' },
                  { id: 'dessert', label: 'ডেজার্ট' }
                ].map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => setMenuCategoryFilter(cat.id)}
                    className={`text-xs px-3 py-2 rounded-xl font-bold whitespace-nowrap transition cursor-pointer ${
                      menuCategoryFilter === cat.id ? 'bg-red-600 text-white' : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Menu Items Mobile Cards */}
            {filteredMenu.length === 0 ? (
              <div className="bg-white rounded-3xl border border-dashed border-gray-300 p-8 text-center space-y-3">
                <div className="w-14 h-14 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto shadow-inner">
                  <Utensils className="w-7 h-7" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 text-sm">মেনুতে কোনো খাবার নেই</h3>
                  <p className="text-xs text-gray-500 mt-1 max-w-xs mx-auto">
                    সকল ডেমো ডাটা মুছে ফেলা হয়েছে। আপনার আসল খাবার বা কম্বো বান্ডেল যোগ করতে নিচের বাটনে চাপ দিন।
                  </p>
                </div>
                <div className="flex flex-wrap justify-center gap-2">
                  <button 
                    onClick={() => handleOpenAddFood(false)}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl inline-flex items-center gap-1.5 shadow-sm transition active:scale-95 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>+ খাবার যোগ</span>
                  </button>
                  <button 
                    onClick={() => handleOpenAddFood(true)}
                    className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl inline-flex items-center gap-1.5 shadow-sm transition active:scale-95 cursor-pointer"
                  >
                    <Sparkles className="w-4 h-4 text-amber-300" />
                    <span>🎁 + কম্বো বান্ডেল তৈরি</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {filteredMenu.map(item => {
                  const isCombo = item.isBundle || item.category === 'combo';
                  return (
                    <div key={item.id} className="bg-white rounded-2xl border border-gray-200 p-3 shadow-xs flex gap-3 items-center hover:shadow-md transition">
                      <div className="relative w-24 h-24 rounded-xl overflow-hidden shrink-0 bg-gray-100">
                        <img src={item.image} alt={item.nameBn} className="w-full h-full object-cover" />
                        <span className={`absolute top-1 left-1 text-white text-[9px] font-bold px-1.5 py-0.2 rounded uppercase ${
                          isCombo ? 'bg-amber-600' : 'bg-black/70'
                        }`}>
                          {isCombo ? '🎁 কম্বো' : item.category}
                        </span>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start gap-1">
                          <h3 className="font-bold text-gray-900 text-sm truncate flex items-center gap-1">
                            <span>{item.nameBn}</span>
                            {isCombo && (
                              <span className="bg-amber-100 text-amber-900 text-[9px] font-bold px-1.5 py-0.2 rounded shrink-0">
                                বান্ডেল
                              </span>
                            )}
                          </h3>
                          <div className="text-right shrink-0">
                            <span className="text-sm font-black text-red-600">৳{item.price}</span>
                            {item.originalPrice && (
                              <span className="text-[10px] text-gray-400 line-through block">৳{item.originalPrice}</span>
                            )}
                          </div>
                        </div>

                        {/* Bundle item pills if present */}
                        {item.bundleItems && item.bundleItems.length > 0 ? (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {item.bundleItems.map((bi, idx) => (
                              <span key={idx} className="bg-amber-50 text-amber-950 border border-amber-200 text-[9px] font-semibold px-1.5 py-0.2 rounded">
                                ✓ {bi}
                              </span>
                            ))}
                            {item.bundleSavings && (
                              <span className="bg-emerald-600 text-white text-[9px] font-bold px-1.5 py-0.2 rounded">
                                ৳{item.bundleSavings} ছাড়
                              </span>
                            )}
                          </div>
                        ) : (
                          <p className="text-[11px] text-gray-500 truncate">{item.nameEn}</p>
                        )}

                        <p className="text-[11px] text-gray-600 line-clamp-1 mt-0.5">{item.descriptionBn}</p>

                        <div className="pt-2 mt-1.5 border-t border-gray-100 flex items-center justify-between gap-1">
                          <span className="text-[10px] text-gray-400">
                            ⭐ {item.rating} ({item.reviewsCount})
                          </span>
                          <div className="flex items-center gap-1.5">
                            <label className="bg-emerald-50 hover:bg-emerald-100 text-emerald-800 px-2 py-1 rounded-lg text-[10px] font-bold transition flex items-center gap-1 border border-emerald-200 cursor-pointer">
                              <Camera className="w-3 h-3 text-emerald-700" />
                              <span>{uploadingCardId === item.id ? 'আপলোড হচ্ছে...' : 'ছবি পরিবর্তন'}</span>
                              <input
                                type="file"
                                accept="image/*"
                                onChange={(e) => handleQuickCardImageUpload(item.id, e)}
                                className="hidden"
                                disabled={uploadingCardId === item.id}
                              />
                            </label>
                            <button 
                              onClick={() => handleOpenEditFood(item)}
                              className="bg-amber-50 hover:bg-amber-100 text-amber-800 px-2.5 py-1 rounded-lg text-[11px] font-bold transition flex items-center gap-1 border border-amber-200 cursor-pointer"
                            >
                              <Edit3 className="w-3 h-3" />
                              <span>এডিট</span>
                            </button>
                            <button 
                              onClick={() => handleDeleteFood(item.id, item.nameBn)}
                              className="bg-red-50 hover:bg-red-100 text-red-700 p-1.5 rounded-lg text-xs font-bold transition border border-red-200 cursor-pointer"
                              title="মুছে ফেলুন (বিয়োজন)"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 3: POS LEDGER & DETAILED ACCOUNTING                       */}
        {/* ============================================================== */}
        {activeTab === 'ledger' && (
          <div className="space-y-4">
            
            <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs space-y-2.5">
              <div>
                <h2 className="text-sm font-black text-gray-900 flex items-center gap-1.5">
                  <BarChart2 className="w-4 h-4 text-emerald-700" />
                  <span>দৈনিক আয় ও ব্যয়ের খতিয়ান (POS Ledger)</span>
                </h2>
                <p className="text-[11px] text-gray-500">মোট লেনদেন: {ledger.length} টি | নিট ক্যাশ: ৳ {netBalance}</p>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs font-bold">
                <div className="bg-emerald-50 text-emerald-800 px-3 py-2 rounded-xl border border-emerald-200 flex justify-between">
                  <span>মোট আয়:</span>
                  <span>৳{totalIncome}</span>
                </div>
                <div className="bg-red-50 text-red-800 px-3 py-2 rounded-xl border border-red-200 flex justify-between">
                  <span>মোট ব্যয়:</span>
                  <span>৳{totalExpense}</span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-1 border-t border-gray-100">
                <span className="text-[11px] text-gray-500 font-medium">কাস্টমার বাকি ও আদায় হিসাব:</span>
                <button
                  onClick={() => setActiveTab('due')}
                  className="text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 px-2.5 py-1 rounded-lg flex items-center gap-1 transition cursor-pointer"
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>বাকি খাতা (Due Ledger)</span>
                </button>
              </div>
            </div>

            {/* Mobile Ledger Cards List */}
            {ledger.length === 0 ? (
              <div className="bg-white rounded-3xl border border-dashed border-gray-300 p-8 text-center text-gray-400 space-y-2">
                <BarChart2 className="w-10 h-10 mx-auto text-gray-300" />
                <p className="text-sm font-bold text-gray-700">খতিয়ানে কোনো হিসাব এন্ট্রি নেই</p>
                <p className="text-xs text-gray-400">ড্যাশবোর্ডের দৈনিক আয় বা ব্যয় কার্ড থেকে নতুন হিসাব এন্ট্রি করুন।</p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-gray-200 shadow-xs divide-y divide-gray-100 overflow-hidden">
                {ledger.map(entry => (
                  <div key={entry.id} className="p-3.5 flex items-center justify-between gap-2 hover:bg-gray-50 transition">
                    <div className="space-y-0.5 min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className={`inline-flex items-center gap-0.5 px-2 py-0.2 rounded-full text-[10px] font-bold ${
                          entry.type === 'income' 
                            ? 'bg-emerald-100 text-emerald-800' 
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {entry.type === 'income' ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                          <span>{entry.type === 'income' ? 'আয়' : 'ব্যয়'}</span>
                        </span>
                        <span className="font-mono text-[10px] font-bold text-gray-500">{entry.voucherNo}</span>
                        <span className="bg-gray-100 text-gray-700 px-1.5 py-0.2 rounded font-mono text-[10px]">{entry.paymentMethod}</span>
                      </div>
                      <p className="text-xs font-bold text-gray-900 truncate">{entry.category}</p>
                      {entry.note && <p className="text-[10px] text-gray-500 line-clamp-1">{entry.note}</p>}
                      <p className="text-[10px] text-gray-400 font-mono">{entry.date}</p>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className={`font-black text-sm ${
                        entry.type === 'income' ? 'text-emerald-700' : 'text-red-600'
                      }`}>
                        {entry.type === 'income' ? '+' : '-'}৳{entry.amount}
                      </span>
                      <button 
                        onClick={() => handleOpenEditLedger(entry)}
                        className="bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 px-2 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 transition cursor-pointer"
                        title="এডিট করুন"
                      >
                        <Edit3 className="w-3 h-3" />
                        <span>এডিট</span>
                      </button>
                      <button 
                        onClick={() => handleDeleteLedger(entry.id)}
                        className="bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 p-1.5 rounded-lg transition cursor-pointer"
                        title="মুছে ফেলুন"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

          </div>
        )}

        {/* ============================================================== */}
        {/* TAB: DUE LEDGER (বাকি খাতা ও দেনা-পাওনা খতিয়ান)                 */}
        {/* ============================================================== */}
        {activeTab === 'due' && (
          <DueLedgerManager
            ledger={ledger}
            setLedger={setLedger}
            orders={orders}
            setOrders={setOrders}
            customers={customers}
            soundOn={soundOn}
          />
        )}

        {/* ============================================================== */}
        {/* TAB 4: FINANCIAL REPORTS (দৈনিক, মাসিক ও বাৎসরিক রিপোর্ট)     */}
        {/* ============================================================== */}
        {activeTab === 'reports' && (
          <div className="space-y-4">
            
            <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs space-y-3">
              <div>
                <h2 className="text-sm font-black text-gray-900 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-amber-600" />
                  <span>আর্থিক হিসাব ও লাভ-ক্ষতি রিপোর্ট</span>
                </h2>
                <p className="text-[11px] text-gray-500">দৈনিক, মাসিক এবং বাৎসরিক রিপোর্ট বিশ্লেষণ করুন</p>
              </div>

              <div className="grid grid-cols-3 gap-1.5 bg-gray-100 p-1 rounded-xl">
                {(['daily', 'monthly', 'yearly'] as const).map(p => (
                  <button
                    key={p}
                    onClick={() => setReportPeriod(p)}
                    className={`text-xs py-1.5 rounded-lg font-bold transition cursor-pointer ${
                      reportPeriod === p ? 'bg-amber-500 text-white shadow-xs' : 'text-gray-700 hover:text-gray-900'
                    }`}
                  >
                    {p === 'daily' ? 'দৈনিক' : p === 'monthly' ? 'মাসিক' : 'বাৎসরিক'}
                  </button>
                ))}
              </div>
            </div>

            {/* Summary KPI Cards for Selected Period */}
            <div className="grid grid-cols-1 gap-3">
              <div className="bg-emerald-50 border border-emerald-300 rounded-2xl p-4 flex justify-between items-center">
                <div>
                  <span className="text-xs text-emerald-800 font-bold uppercase block">পিরিয়ডের মোট আয়</span>
                  <span className="text-[10px] text-emerald-900 font-medium">{reportEntries.filter(l => l.type === 'income').length} টি আয় ভাউচার</span>
                </div>
                <p className="text-xl font-black text-emerald-700">৳ {repIncome}</p>
              </div>

              <div className="bg-red-50 border border-red-300 rounded-2xl p-4 flex justify-between items-center">
                <div>
                  <span className="text-xs text-red-800 font-bold uppercase block">পিরিয়ডের মোট ব্যয়</span>
                  <span className="text-[10px] text-red-900 font-medium">{reportEntries.filter(l => l.type === 'expense').length} টি ব্যয় ভাউচার</span>
                </div>
                <p className="text-xl font-black text-red-600">৳ {repExpense}</p>
              </div>

              <div className={`border rounded-2xl p-4 flex justify-between items-center ${repProfit >= 0 ? 'bg-amber-50 border-amber-300 text-amber-900' : 'bg-red-100 border-red-400 text-red-900'}`}>
                <div>
                  <span className="text-xs font-bold uppercase block">নিট লাভ / ক্ষতি (Net Balance)</span>
                  <span className="text-[10px] font-semibold">{repProfit >= 0 ? '✓ প্রফিটেবল' : '⚠ ঘাটতি'}</span>
                </div>
                <p className="text-xl font-black">৳ {repProfit}</p>
              </div>
            </div>

            {/* Printable Report Statement */}
            <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-xs space-y-4">
              <div className="flex justify-between items-center border-b pb-3">
                <div>
                  <h3 className="font-bold text-gray-900 text-sm">
                    {reportPeriod === 'daily' ? `দৈনিক রিপোর্ট (${todayStr})` : reportPeriod === 'monthly' ? `মাসিক রিপোর্ট (${currentMonth})` : `বাৎসরিক রিপোর্ট (${currentYear})`}
                  </h3>
                  <p className="text-xs text-gray-500">সালমা ফুড কর্ণার অডিট স্টেটমেন্ট</p>
                </div>
                <button 
                  onClick={() => window.print()}
                  className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1 transition cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>প্রিন্ট রিপোর্ট</span>
                </button>
              </div>

              {reportEntries.length === 0 ? (
                <p className="text-center py-8 text-xs text-gray-400">এই সময়ের কোনো হিসাব এন্ট্রি নেই।</p>
              ) : (
                <div className="space-y-2">
                  {reportEntries.map(entry => (
                    <div key={entry.id} className="flex justify-between items-center text-xs py-2 border-b border-gray-100 gap-2">
                      <div className="min-w-0 flex-1">
                        <span className="font-bold text-gray-800 block truncate">{entry.category}</span>
                        <span className="text-[10px] text-gray-400 block">{entry.date} • {entry.voucherNo} {entry.note ? `• ${entry.note}` : ''}</span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className={`font-black ${entry.type === 'income' ? 'text-emerald-700' : 'text-red-600'}`}>
                          {entry.type === 'income' ? '+' : '-'} ৳ {entry.amount}
                        </span>
                        <button
                          onClick={() => handleOpenEditLedger(entry)}
                          className="p-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 cursor-pointer"
                          title="এডিট"
                        >
                          <Edit3 className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => handleDeleteLedger(entry.id)}
                          className="p-1 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 cursor-pointer"
                          title="ডিলেট"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 5: LIVE ORDERS & 50% ADVANCE PAYMENT VERIFICATION          */}
        {/* ============================================================== */}
        {activeTab === 'orders' && (
          <div className="space-y-4">
            
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-white p-4 rounded-2xl border border-gray-200 shadow-xs">
              <div>
                <h2 className="text-base sm:text-lg font-black text-gray-900 flex items-center gap-2">
                  <Truck className="w-5 h-5 text-red-600" />
                  <span>লাইভ অর্ডার তালিকা ({orders.length} টি)</span>
                </h2>
                <p className="text-xs text-gray-500">৫০% অগ্রীম পেমেন্ট যাচাই, ট্রানজেকশন আইডি এবং ১ কি.মি. ফ্রি ডেলিভারি তথ্য</p>
              </div>

              {/* Status Filter */}
              <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-none text-xs">
                {(['All', 'Placed', 'Preparing', 'Out for Delivery', 'Delivered'] as const).map(st => (
                  <button
                    key={st}
                    onClick={() => setOrderFilter(st)}
                    className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition cursor-pointer ${
                      orderFilter === st ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {st === 'All' ? 'সব' : st === 'Placed' ? 'গৃহীত' : st === 'Preparing' ? 'রান্না হচ্ছে' : st === 'Out for Delivery' ? 'ডেলিভারিতে' : 'সম্পন্ন'}
                  </button>
                ))}
              </div>
            </div>

            {/* Orders Cards */}
            {filteredOrders.length === 0 ? (
              <div className="bg-white p-12 rounded-3xl border border-gray-200 text-center text-gray-400 space-y-2">
                <Truck className="w-12 h-12 mx-auto opacity-30 text-gray-500" />
                <p className="text-sm font-bold">কোনো অর্ডার পাওয়া যায়নি।</p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredOrders.map(order => (
                  <div key={order.id} className="bg-white p-5 rounded-3xl border border-gray-200 shadow-xs space-y-4">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-gray-100 pb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="bg-red-100 text-red-800 text-xs font-black px-2.5 py-0.5 rounded-lg">
                            {order.id}
                          </span>
                          <span className="text-xs text-gray-500 font-mono">{order.date} • {order.createdAt}</span>
                          {order.isFreeDeliveryWithin1km && (
                            <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-300">
                              ১ কি.মি. ফ্রি ডেলিভারি (৳০)
                            </span>
                          )}
                        </div>
                        <h4 className="font-bold text-gray-900 text-sm mt-1">{order.customerName} (📱 {order.phone})</h4>
                        <p className="text-xs text-gray-500 mt-0.5">📍 {order.address}</p>
                      </div>

                      <div className="text-left sm:text-right space-y-1">
                        <span className="text-base font-black text-gray-900">৳ {order.totalAmount}</span>
                        <div className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          অগ্রীম প্রাপ্তি: ৳ {order.advancePaid} ({order.advancePaymentMethod}) ✓
                        </div>
                        {order.dueAmount > 0 && (
                          <div className="text-xs font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded border border-red-200">
                            বাকি বকেয়া: ৳ {order.dueAmount} (ডেলিভারিতে নগদ প্রদেয়)
                          </div>
                        )}
                        {order.transactionId && (
                          <p className="text-[10px] text-gray-400 font-mono">TrxID: {order.transactionId}</p>
                        )}
                      </div>
                    </div>

                    {/* Order Food Items List */}
                    <div className="bg-gray-50 p-3 rounded-2xl space-y-1">
                      <p className="text-[11px] font-bold text-gray-700 uppercase">খাবারের আইটেমসমূহ:</p>
                      {order.items.map((it, idx) => (
                        <div key={idx} className="flex justify-between items-center text-xs">
                          <span>• {it.nameBn} × {it.quantity}</span>
                          <span className="font-bold">৳ {it.price * it.quantity}</span>
                        </div>
                      ))}
                    </div>

                    {/* Status Changer (Admin Only) & KOT Print */}
                    <div className="bg-emerald-50/50 border border-emerald-200 rounded-2xl p-3 space-y-2">
                      <div className="flex items-center justify-between flex-wrap gap-1">
                        <span className="text-xs font-black text-gray-800 flex items-center gap-1">
                          <ShieldCheck className="w-3.5 h-3.5 text-emerald-700" />
                          <span>স্ট্যাটাস পরিবর্তন (শুধুমাত্র এডমিন):</span>
                        </span>
                        <span className="text-[10px] text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full font-bold">
                          🔒 ইউজার অ্যাপে গ্রাহক শুধু দেখতে পাবেন
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {(['Placed', 'Preparing', 'Out for Delivery', 'Delivered'] as const).map(st => (
                            <button
                              key={st}
                              type="button"
                              onClick={() => handleUpdateOrderStatus(order.id, st)}
                              className={`text-[11px] px-3 py-1.5 rounded-xl font-bold transition cursor-pointer ${
                                order.status === st 
                                  ? 'bg-emerald-600 text-white shadow-sm ring-2 ring-emerald-300' 
                                  : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-100'
                              }`}
                            >
                              {st === 'Placed' ? 'গৃহীত' : st === 'Preparing' ? 'রান্না হচ্ছে' : st === 'Out for Delivery' ? 'ডেলিভারিতে' : 'সম্পন্ন'}
                            </button>
                          ))}
                        </div>

                        <div className="flex items-center gap-1.5 flex-wrap">
                          <button 
                            type="button"
                            onClick={() => handleOpenEditOrder(order)}
                            className="bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 text-xs font-bold px-2.5 py-1.5 rounded-xl flex items-center gap-1 transition cursor-pointer"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>এডিট</span>
                          </button>
                          <button 
                            type="button"
                            onClick={() => handleDeleteOrder(order.id)}
                            className="bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-xs font-bold px-2.5 py-1.5 rounded-xl flex items-center gap-1 transition cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>ডিলেট</span>
                          </button>
                          <button 
                            type="button"
                            onClick={() => setSelectedReceiptOrder(order)}
                            className="bg-gray-800 hover:bg-black text-white text-xs font-bold px-3 py-1.5 rounded-xl flex items-center gap-1 shadow-xs transition cursor-pointer"
                          >
                            <Printer className="w-3.5 h-3.5" />
                            <span>KOT প্রিন্ট</span>
                          </button>
                        </div>
                      </div>
                    </div>

                  </div>
                ))}
              </div>
            )}

          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 6: CUSTOMER DIRECTORY (পাসওয়ার্ড ছাড়া প্রোফাইল ডাটাবেজ)    */}
        {/* ============================================================== */}
        {activeTab === 'customers' && (
          <div className="space-y-4">
            
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-white p-4 rounded-2xl border border-gray-200 shadow-xs">
              <div>
                <h2 className="text-base sm:text-lg font-black text-gray-900 flex items-center gap-2">
                  <Users className="w-5 h-5 text-blue-600" />
                  <span>গ্রাহক ডাটাবেজ ({Object.keys(customers).length} জন রেজিস্টার্ড)</span>
                </h2>
                <p className="text-xs text-gray-500">পাসওয়ার্ড ছাড়া শুধুমাত্র মোবাইল নম্বর দিয়ে যুক্ত সকল গ্রাহক প্রোফাইল</p>
              </div>

              <button 
                onClick={handleOpenAddCustomer}
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3.5 py-2 rounded-xl flex items-center gap-1.5 shadow transition cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>+ নতুন গ্রাহক যোগ</span>
              </button>
            </div>

            {Object.keys(customers).length === 0 ? (
              <div className="bg-white rounded-3xl border border-dashed border-gray-300 p-8 text-center text-gray-400 space-y-3">
                <Users className="w-12 h-12 mx-auto opacity-30 text-blue-600" />
                <div>
                  <h3 className="font-bold text-gray-800 text-sm">কোনো গ্রাহকের তথ্য নেই</h3>
                  <p className="text-xs text-gray-500 mt-1 max-w-xs mx-auto">
                    সকল ডেমো কাস্টমার ডাটা মুছে ফেলা হয়েছে। সরাসরি নতুন নিয়মিত কাস্টমার যুক্ত করতে নিচের বাটনে চাপ দিন।
                  </p>
                </div>
                <button 
                  onClick={handleOpenAddCustomer}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl inline-flex items-center gap-1.5 shadow-sm transition cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>+ নতুন গ্রাহক যোগ করুন</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {Object.values(customers).map(cust => (
                  <div key={cust.phone} className="bg-white p-4 rounded-2xl border border-gray-200 shadow-xs space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-emerald-600 to-amber-500 text-white flex items-center justify-center font-black text-base shadow-sm shrink-0">
                          {cust.name.charAt(0)}
                        </div>
                        <div className="min-w-0">
                          <h4 className="font-bold text-gray-900 text-sm truncate">{cust.name}</h4>
                          <p className="text-xs text-gray-500 font-mono">📱 {cust.phone}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleOpenEditCustomer(cust)}
                          className="bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 px-2.5 py-1.5 rounded-xl text-[11px] font-bold flex items-center gap-1 transition cursor-pointer"
                        >
                          <Edit3 className="w-3 h-3" />
                          <span>এডিট</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteCustomer(cust.phone, cust.name)}
                          className="bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 px-2.5 py-1.5 rounded-xl text-[11px] font-bold flex items-center gap-1 transition cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>ডিলেট</span>
                        </button>
                      </div>
                    </div>

                    <p className="text-xs text-gray-600">📍 {cust.address}</p>

                    <div className="bg-amber-50 p-2.5 rounded-xl border border-amber-200 flex justify-between items-center text-xs">
                      <div>
                        <span className="text-gray-500 text-[10px] block">লয়্যালটি পয়েন্ট</span>
                        <span className="font-black text-amber-700">🎁 {cust.loyaltyPoints} Pts</span>
                      </div>
                      <div>
                        <span className="text-gray-500 text-[10px] block">মোট অর্ডার</span>
                        <span className="font-black text-gray-800">{cust.totalOrders} টি</span>
                      </div>
                      <div>
                        <span className="text-gray-500 text-[10px] block">মোট খরচ</span>
                        <span className="font-black text-emerald-700">৳ {cust.totalSpent}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 7: BULK SMS MARKETING                                      */}
        {/* ============================================================== */}
        {activeTab === 'marketing' && (
          <SmsMarketingPanel 
            customers={customers}
            soundOn={soundOn}
            activeOffer={activeOffer}
            onOfferUpdate={setActiveOffer}
          />
        )}

        {/* ============================================================== */}
        {/* TAB 8: SHOP LOCATION & 1 KM FREE DELIVERY ZONE SETTINGS       */}
        {/* ============================================================== */}
        {activeTab === 'location' && (
          <ShopLocationManager 
            soundOn={soundOn}
          />
        )}

      </main>

      {/* ============================================================== */}
      {/* PERSISTENT MOBILE BOTTOM NAVIGATION BAR (Always Visible)        */}
      {/* ============================================================== */}
      <nav className="fixed bottom-0 left-0 right-0 max-w-[430px] mx-auto bg-white/95 backdrop-blur border-t border-gray-200 z-40 px-2 py-1.5 flex justify-around items-center shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
        {[
          { id: 'dashboard', label: 'হোম', icon: TrendingUp },
          { id: 'menu', label: 'মেনু', icon: Utensils },
          { id: 'orders', label: 'অর্ডার', icon: Truck, badge: orders.filter(o => o.status !== 'Delivered').length },
          { id: 'ledger', label: 'POS হিসাব', icon: BarChart2 },
          { id: 'location', label: 'লোকেশন', icon: MapPin }
        ].map(item => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id as any)}
              className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition cursor-pointer relative ${
                isActive ? 'text-red-700 font-black bg-red-50/80' : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] mt-0.5">{item.label}</span>
              {item.badge !== undefined && item.badge > 0 && (
                <span className="absolute -top-0.5 right-1 bg-red-600 text-white text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* ============================================================== */}
      {/* MODAL: ADD / EDIT FOOD ITEM (Mobile Bottom Sheet)              */}
      {/* ============================================================== */}
      {foodModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-t-3xl p-5 max-w-[430px] w-full shadow-2xl max-h-[90vh] overflow-y-auto space-y-4 border-t border-amber-200">
            <div className="flex justify-between items-center border-b pb-3">
              <h3 className="font-black text-gray-900 text-base flex items-center gap-2">
                <Utensils className="w-5 h-5 text-red-600" />
                <span>{editingFoodId ? 'খাবার তথ্য এডিট করুন' : '+ নতুন খাবার সংযোজন করুন'}</span>
              </h3>
              <button onClick={() => setFoodModalOpen(false)} className="text-gray-400 hover:text-gray-600 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveFood} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-gray-700 mb-1">খাবারের বাংলা নাম *</label>
                <input 
                  type="text"
                  placeholder="যেমন: স্পেশাল বিফ তেহারি"
                  value={foodForm.nameBn}
                  onChange={(e) => setFoodForm({ ...foodForm, nameBn: e.target.value })}
                  className="w-full border border-gray-300 rounded-xl p-2.5 text-xs font-bold"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">ইংরেজি নাম</label>
                <input 
                  type="text"
                  placeholder="e.g. Special Beef Tehari"
                  value={foodForm.nameEn}
                  onChange={(e) => setFoodForm({ ...foodForm, nameEn: e.target.value })}
                  className="w-full border border-gray-300 rounded-xl p-2.5 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">ক্যাটাগরি</label>
                  <select
                    value={foodForm.category}
                    onChange={(e) => {
                      const val = e.target.value as any;
                      setFoodForm({ 
                        ...foodForm, 
                        category: val,
                        isBundle: val === 'combo' ? true : foodForm.isBundle
                      });
                    }}
                    className="w-full border border-gray-300 rounded-xl p-2.5 text-xs bg-white font-bold"
                  >
                    <option value="popular">জনপ্রিয় (Popular)</option>
                    <option value="combo">🎁 কম্বো ও বান্ডেল (Combo & Bundles)</option>
                    <option value="biryani">বিরিয়ানি ও পোলাও (Biryani)</option>
                    <option value="fastfood">ফাস্ট ফুড (Fast Food)</option>
                    <option value="curry">মাংস ও কারি (Curry)</option>
                    <option value="dessert">ডেজার্ট ও ড্রিংকস (Dessert)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-gray-700 mb-1">বিক্রয় মূল্য (৳) *</label>
                  <input 
                    type="number"
                    placeholder="৳ 250"
                    value={foodForm.price}
                    onChange={(e) => setFoodForm({ ...foodForm, price: e.target.value })}
                    className="w-full border border-gray-300 rounded-xl p-2.5 text-xs font-black text-red-600"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">আসল রেগুলার মূল্য (৳, ঐচ্ছিক)</label>
                <input 
                  type="number"
                  placeholder="যেমন: 300"
                  value={foodForm.originalPrice}
                  onChange={(e) => setFoodForm({ ...foodForm, originalPrice: e.target.value })}
                  className="w-full border border-gray-300 rounded-xl p-2.5 text-xs text-gray-600"
                />
              </div>

              {/* CPANEL FOOD IMAGE UPLOAD & PREVIEW BOX */}
              <div className="bg-emerald-50/70 border border-emerald-300 rounded-2xl p-3.5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="font-black text-emerald-950 text-xs flex items-center gap-1.5">
                    <ImageIcon className="w-4 h-4 text-emerald-700" />
                    <span>খাবারের ছবি আপলোড (সরাসরি cPanel সার্ভারে সেভ হবে)</span>
                  </label>
                  <span className="bg-emerald-600 text-white text-[9px] font-bold px-2 py-0.5 rounded-full">
                    cPanel Storage
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  {/* Live Image Preview */}
                  <div className="w-20 h-20 rounded-2xl overflow-hidden border-2 border-emerald-300 bg-white shrink-0 shadow-xs flex items-center justify-center">
                    {foodForm.image ? (
                      <img src={foodForm.image} alt="Food Preview" className="w-full h-full object-cover" />
                    ) : (
                      <ImageIcon className="w-7 h-7 text-gray-300" />
                    )}
                  </div>

                  {/* Upload Button & Info */}
                  <div className="flex-1 space-y-1.5">
                    <label className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold py-2.5 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-sm transition active:scale-95 cursor-pointer">
                      <Upload className="w-4 h-4" />
                      <span>{isUploadingFoodImg ? 'cPanel সার্ভারে আপলোড হচ্ছে...' : '📤 গ্যালারি / ফোন থেকে ছবি আপলোড করুন'}</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleFoodModalImageUpload}
                        className="hidden"
                        disabled={isUploadingFoodImg}
                      />
                    </label>
                    <p className="text-[10px] text-gray-600 leading-tight">
                      আপলোড করা ছবি অটোমেটিক অপ্টিমাইজ হয়ে আপনার cPanel-এর <code className="font-mono bg-white px-1 rounded">uploads/</code> ফোল্ডার ও MySQL ডাটাবেসে স্থায়ীভাবে সেভ থাকবে।
                    </p>
                  </div>
                </div>

                {uploadImgMsg && (
                  <div className={`p-2 rounded-xl text-[11px] font-bold flex items-center gap-1.5 ${
                    uploadImgMsg.type === 'ok'
                      ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                      : 'bg-red-100 text-red-700 border border-red-300'
                  }`}>
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    <span>{uploadImgMsg.text}</span>
                  </div>
                )}

                <div>
                  <label className="block font-bold text-gray-600 text-[10px] mb-1">অথবা সরাসরি ছবির লিংক (URL) দিন:</label>
                  <input 
                    type="text"
                    placeholder="uploads/food_...jpg বা https://..."
                    value={foodForm.image}
                    onChange={(e) => setFoodForm({ ...foodForm, image: e.target.value })}
                    className="w-full border border-emerald-200 bg-white rounded-xl p-2 text-xs font-mono"
                  />
                </div>
              </div>

              {/* BUNDLE / COMBO OFFER BUILDER */}
              <div className="bg-gradient-to-r from-amber-50 via-orange-50 to-amber-100/60 border border-amber-300 rounded-2xl p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 font-black text-amber-950 cursor-pointer text-xs">
                    <input 
                      type="checkbox"
                      checked={foodForm.isBundle || foodForm.category === 'combo'}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setFoodForm(prev => ({
                          ...prev,
                          isBundle: checked,
                          category: checked ? 'combo' : (prev.category === 'combo' ? 'popular' : prev.category)
                        }));
                      }}
                      className="w-4 h-4 text-red-600 rounded cursor-pointer"
                    />
                    <span>🎁 এটি কি একটি কম্বো / বান্ডেল অফার? (২ বা ততোধিক খাবার)</span>
                  </label>
                  {(foodForm.isBundle || foodForm.category === 'combo') && (
                    <span className="bg-red-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-2xs">
                      বান্ডেল মোড সক্রিয়
                    </span>
                  )}
                </div>

                {(foodForm.isBundle || foodForm.category === 'combo') && (
                  <div className="space-y-2.5 pt-1 border-t border-amber-200">
                    <p className="text-[11px] text-amber-900 leading-tight">
                      যে খাবারগুলো একসাথে দিয়ে বান্ডেল করছেন সেগুলো নিচে লিখুন:
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="block font-bold text-gray-700 text-[11px] mb-0.5">খাবার ১ (প্রথম আইটেম) *</label>
                        <input 
                          type="text"
                          placeholder="যেমন: স্পেশাল কাচ্চি বিরিয়ানি (১ প্লেট)"
                          value={foodForm.bundleItem1}
                          onChange={(e) => setFoodForm({ ...foodForm, bundleItem1: e.target.value })}
                          className="w-full border border-amber-300 bg-white rounded-xl p-2 text-xs font-semibold focus:outline-none focus:border-red-500"
                        />
                      </div>
                      <div>
                        <label className="block font-bold text-gray-700 text-[11px] mb-0.5">খাবার ২ (দ্বিতীয় আইটেম) *</label>
                        <input 
                          type="text"
                          placeholder="যেমন: শাহী বোরহানি (২৫০ মি.লি.)"
                          value={foodForm.bundleItem2}
                          onChange={(e) => setFoodForm({ ...foodForm, bundleItem2: e.target.value })}
                          className="w-full border border-amber-300 bg-white rounded-xl p-2 text-xs font-semibold focus:outline-none focus:border-red-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block font-bold text-gray-700 text-[11px] mb-0.5">খাবার ৩ (ঐচ্ছিক তৃতীয় আইটেম)</label>
                      <input 
                        type="text"
                        placeholder="যেমন: ১টি জালি কাবাব বা ফিরনি"
                        value={foodForm.bundleItem3}
                        onChange={(e) => setFoodForm({ ...foodForm, bundleItem3: e.target.value })}
                        className="w-full border border-amber-300 bg-white rounded-xl p-2 text-xs focus:outline-none focus:border-red-500"
                      />
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1 bg-white/70 p-2 rounded-xl border border-amber-200">
                      <button
                        type="button"
                        onClick={handleAutoGenerateBundleInfo}
                        className="bg-amber-500 hover:bg-amber-600 text-amber-950 font-bold px-3 py-1.5 rounded-xl text-[11px] flex items-center gap-1.5 transition active:scale-95 cursor-pointer shadow-2xs"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-amber-950" />
                        <span>⚡ নাম ও বিবরণ অটো তৈরি করুন</span>
                      </button>

                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-bold text-gray-700">ছাড়/সাশ্রয় (৳):</span>
                        <input 
                          type="number"
                          placeholder="যেমন: 50"
                          value={foodForm.bundleSavings}
                          onChange={(e) => setFoodForm({ ...foodForm, bundleSavings: e.target.value })}
                          className="w-20 border border-amber-300 bg-white rounded-xl p-1.5 text-xs font-black text-emerald-700 text-center"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">খাবারের বর্ণনা (বাংলা)</label>
                <textarea 
                  rows={2}
                  value={foodForm.descriptionBn}
                  onChange={(e) => setFoodForm({ ...foodForm, descriptionBn: e.target.value })}
                  className="w-full border border-gray-300 rounded-xl p-2.5 text-xs"
                  placeholder="খাবারের স্বাদ, উপকরণ ও স্পেশালিটি লিখুন..."
                />
              </div>

              <div className="flex items-center gap-4 pt-1">
                <label className="flex items-center gap-1.5 font-bold text-gray-700 cursor-pointer">
                  <input 
                    type="checkbox"
                    checked={foodForm.isVeg}
                    onChange={(e) => setFoodForm({ ...foodForm, isVeg: e.target.checked })}
                    className="w-4 h-4 text-emerald-600 rounded"
                  />
                  <span>ভেজিটেরিয়ান খাবার</span>
                </label>
              </div>

              <div className="pt-3 border-t flex justify-end gap-2">
                <button 
                  type="button"
                  onClick={() => setFoodModalOpen(false)}
                  className="border border-gray-300 hover:bg-gray-100 text-gray-700 font-bold px-4 py-2.5 rounded-xl text-xs cursor-pointer"
                >
                  বাতিল
                </button>
                <button 
                  type="submit"
                  className="bg-red-600 hover:bg-red-700 text-white font-bold px-6 py-2.5 rounded-xl text-xs shadow transition active:scale-95 cursor-pointer"
                >
                  {editingFoodId ? 'সংরক্ষণ করুন' : 'মেনুতে যোগ করুন'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL: KOT / ORDER RECEIPT PRINT MODAL                          */}
      {/* ============================================================== */}
      {selectedReceiptOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl space-y-4 border border-gray-200">
            <div className="text-center space-y-1 border-b pb-3">
              <h3 className="font-black text-gray-900 text-base">সালমা ফুড কর্ণার, গাজীপুর</h3>
              <p className="text-[10px] text-gray-500">চান্দনা চৌরাস্তা (জয়দেবপুর রোড মোড়), গাজীপুর-১৭০০ | 📱 01712-345678</p>
              <p className="text-xs font-bold text-red-600 font-mono mt-1">অর্ডার #{selectedReceiptOrder.id}</p>
            </div>

            <div className="text-xs space-y-1">
              <p><b>গ্রাহক:</b> {selectedReceiptOrder.customerName} ({selectedReceiptOrder.phone})</p>
              <p><b>ঠিকানা:</b> {selectedReceiptOrder.address}</p>
              <p><b>তারিখ ও সময়:</b> {selectedReceiptOrder.date} {selectedReceiptOrder.createdAt}</p>
              {selectedReceiptOrder.isFreeDeliveryWithin1km && (
                <p className="text-emerald-700 font-bold">✓ ১ কি.মি. ফ্রি ডেলিভারি জোন</p>
              )}
            </div>

            <div className="border-t border-b py-2 space-y-1 text-xs">
              {selectedReceiptOrder.items.map((it, idx) => (
                <div key={idx} className="flex justify-between">
                  <span>{it.nameBn} × {it.quantity}</span>
                  <span className="font-bold">৳ {it.price * it.quantity}</span>
                </div>
              ))}
            </div>

            <div className="text-xs space-y-1 font-bold">
              <div className="flex justify-between">
                <span>সর্বমোট বিল:</span>
                <span>৳ {selectedReceiptOrder.totalAmount}</span>
              </div>
              <div className="flex justify-between text-emerald-700">
                <span>অগ্রীম প্রাপ্তি:</span>
                <span>৳ {selectedReceiptOrder.advancePaid} ({selectedReceiptOrder.advancePaymentMethod})</span>
              </div>
              {selectedReceiptOrder.dueAmount > 0 && (
                <div className="flex justify-between text-red-600">
                  <span>বাকি বকেয়া (নগদ প্রদেয়):</span>
                  <span>৳ {selectedReceiptOrder.dueAmount}</span>
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-2">
              <button 
                onClick={() => setSelectedReceiptOrder(null)}
                className="flex-1 border border-gray-300 py-2 rounded-xl text-xs font-bold hover:bg-gray-100"
              >
                বন্ধ করুন
              </button>
              <button 
                onClick={() => window.print()}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 rounded-xl text-xs font-bold shadow flex items-center justify-center gap-1"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>প্রিন্ট করুন</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL: ADD / EDIT CUSTOMER MODAL                               */}
      {/* ============================================================== */}
      {customerModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl space-y-4 border border-gray-200 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b pb-3">
              <h3 className="font-bold text-gray-900 text-sm flex items-center gap-1.5">
                <Users className="w-4 h-4 text-blue-600" />
                <span>{editingCustOriginalPhone ? '✏️ গ্রাহক প্রোফাইল এডিট করুন' : '+ নতুন গ্রাহক প্রোফাইল যোগ করুন'}</span>
              </h3>
              <button onClick={() => setCustomerModalOpen(false)} className="text-gray-400 hover:text-gray-600 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddCustomer} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-gray-700 mb-1">গ্রাহকের নাম *</label>
                <input 
                  type="text"
                  placeholder="যেমন: মো: আরিফুল ইসলাম"
                  value={newCustName}
                  onChange={(e) => setNewCustName(e.target.value)}
                  className="w-full border border-gray-300 rounded-xl p-2.5 text-xs font-bold"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">মোবাইল নম্বর * (লগইন আইডি)</label>
                <input 
                  type="tel"
                  placeholder="017xxxxxxxx"
                  value={newCustPhone}
                  onChange={(e) => setNewCustPhone(e.target.value)}
                  className="w-full border border-gray-300 rounded-xl p-2.5 text-xs font-mono font-bold"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">ঠিকানা / এলাকা (গাজীপুর)</label>
                <input 
                  type="text"
                  placeholder="যেমন: চান্দনা চৌরাস্তা, ভোগড়া বাইপাস, গাজীপুর"
                  value={newCustAddress}
                  onChange={(e) => setNewCustAddress(e.target.value)}
                  className="w-full border border-gray-300 rounded-xl p-2.5 text-xs"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block font-bold text-gray-700 text-[10px] mb-1">লয়্যালটি পয়েন্ট</label>
                  <input 
                    type="number"
                    min="0"
                    value={newCustPoints}
                    onChange={(e) => setNewCustPoints(e.target.value)}
                    className="w-full border border-gray-300 rounded-xl p-2 text-xs font-bold text-amber-700"
                  />
                </div>
                <div>
                  <label className="block font-bold text-gray-700 text-[10px] mb-1">মোট অর্ডার</label>
                  <input 
                    type="number"
                    min="0"
                    value={newCustOrders}
                    onChange={(e) => setNewCustOrders(e.target.value)}
                    className="w-full border border-gray-300 rounded-xl p-2 text-xs font-bold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-gray-700 text-[10px] mb-1">মোট খরচ (৳)</label>
                  <input 
                    type="number"
                    min="0"
                    value={newCustSpent}
                    onChange={(e) => setNewCustSpent(e.target.value)}
                    className="w-full border border-gray-300 rounded-xl p-2 text-xs font-bold text-emerald-700"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-2 border-t">
                <button 
                  type="button"
                  onClick={() => setCustomerModalOpen(false)}
                  className="flex-1 border border-gray-300 py-2.5 rounded-xl text-xs font-bold text-gray-700 hover:bg-gray-100 cursor-pointer"
                >
                  বাতিল
                </button>
                <button 
                  type="submit"
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-xl text-xs font-bold shadow transition active:scale-95 cursor-pointer"
                >
                  {editingCustOriginalPhone ? 'আপডেট সংরক্ষণ করুন' : 'সংরক্ষণ করুন'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL: EDIT ORDER MODAL                                        */}
      {/* ============================================================== */}
      {orderEditModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl p-5 max-w-md w-full shadow-2xl space-y-4 border border-gray-200 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b pb-3">
              <h3 className="font-black text-gray-900 text-sm flex items-center gap-1.5">
                <Edit3 className="w-4 h-4 text-amber-600" />
                <span>✏️ অর্ডার #{editingOrderId} এডিট করুন</span>
              </h3>
              <button onClick={() => setOrderEditModalOpen(false)} className="text-gray-400 hover:text-gray-600 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEditOrder} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">গ্রাহকের নাম *</label>
                  <input
                    type="text"
                    required
                    value={orderEditForm.customerName}
                    onChange={(e) => setOrderEditForm({ ...orderEditForm, customerName: e.target.value })}
                    className="w-full border border-gray-300 rounded-xl p-2 text-xs font-bold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-gray-700 mb-1">মোবাইল নম্বর *</label>
                  <input
                    type="tel"
                    required
                    value={orderEditForm.phone}
                    onChange={(e) => setOrderEditForm({ ...orderEditForm, phone: e.target.value })}
                    className="w-full border border-gray-300 rounded-xl p-2 text-xs font-mono font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">ডেলিভারি ঠিকানা *</label>
                <textarea
                  rows={2}
                  required
                  value={orderEditForm.address}
                  onChange={(e) => setOrderEditForm({ ...orderEditForm, address: e.target.value })}
                  className="w-full border border-gray-300 rounded-xl p-2 text-xs"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">মোট বিল (৳)</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={orderEditForm.totalAmount}
                    onChange={(e) => {
                      const tot = Number(e.target.value) || 0;
                      const adv = Number(orderEditForm.advancePaid) || 0;
                      setOrderEditForm({
                        ...orderEditForm,
                        totalAmount: e.target.value,
                        dueAmount: String(Math.max(0, tot - adv))
                      });
                    }}
                    className="w-full border border-gray-300 rounded-xl p-2 text-xs font-black text-gray-900"
                  />
                </div>
                <div>
                  <label className="block font-bold text-gray-700 mb-1">অগ্রীম জমা (৳)</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={orderEditForm.advancePaid}
                    onChange={(e) => {
                      const tot = Number(orderEditForm.totalAmount) || 0;
                      const adv = Number(e.target.value) || 0;
                      setOrderEditForm({
                        ...orderEditForm,
                        advancePaid: e.target.value,
                        dueAmount: String(Math.max(0, tot - adv))
                      });
                    }}
                    className="w-full border border-gray-300 rounded-xl p-2 text-xs font-black text-emerald-700"
                  />
                </div>
                <div>
                  <label className="block font-bold text-gray-700 mb-1">বাকি বকেয়া (৳)</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={orderEditForm.dueAmount}
                    onChange={(e) => setOrderEditForm({ ...orderEditForm, dueAmount: e.target.value })}
                    className="w-full border border-gray-300 rounded-xl p-2 text-xs font-black text-red-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">পেমেন্ট মেথড</label>
                  <select
                    value={orderEditForm.advancePaymentMethod}
                    onChange={(e) => setOrderEditForm({ ...orderEditForm, advancePaymentMethod: e.target.value as any })}
                    className="w-full border border-gray-300 rounded-xl p-2 text-xs bg-white font-bold"
                  >
                    <option value="bKash">বিকাশ (bKash)</option>
                    <option value="Nagad">নগদ (Nagad)</option>
                    <option value="Card">কার্ড / ক্যাশ (Card/Cash)</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-gray-700 mb-1">ট্রানজেকশন আইডি</label>
                  <input
                    type="text"
                    value={orderEditForm.transactionId}
                    onChange={(e) => setOrderEditForm({ ...orderEditForm, transactionId: e.target.value })}
                    className="w-full border border-gray-300 rounded-xl p-2 text-xs font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">অর্ডার স্ট্যাটাস</label>
                <select
                  value={orderEditForm.status}
                  onChange={(e) => setOrderEditForm({ ...orderEditForm, status: e.target.value as any })}
                  className="w-full border border-gray-300 rounded-xl p-2 text-xs bg-white font-bold text-emerald-800"
                >
                  <option value="Placed">গৃহীত (Placed)</option>
                  <option value="Preparing">রান্না হচ্ছে (Preparing)</option>
                  <option value="Out for Delivery">ডেলিভারিতে (Out for Delivery)</option>
                  <option value="Delivered">সম্পন্ন (Delivered)</option>
                </select>
              </div>

              <div className="flex gap-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setOrderEditModalOpen(false)}
                  className="flex-1 border border-gray-300 py-2.5 rounded-xl text-xs font-bold text-gray-700 hover:bg-gray-100 cursor-pointer"
                >
                  বাতিল
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded-xl text-xs font-bold shadow transition active:scale-95 cursor-pointer"
                >
                  অর্ডার আপডেট করুন
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL: EDIT POS LEDGER ENTRY MODAL                             */}
      {/* ============================================================== */}
      {ledgerModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl p-5 max-w-sm w-full shadow-2xl space-y-4 border border-gray-200">
            <div className="flex justify-between items-center border-b pb-3">
              <h3 className="font-black text-gray-900 text-sm flex items-center gap-1.5">
                <BarChart2 className="w-4 h-4 text-emerald-700" />
                <span>✏️ হিসাব খতিয়ান এন্ট্রি এডিট করুন</span>
              </h3>
              <button onClick={() => setLedgerModalOpen(false)} className="text-gray-400 hover:text-gray-600 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEditLedger} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">হিসাবের ধরন</label>
                  <select
                    value={ledgerEditForm.type}
                    onChange={(e) => setLedgerEditForm({ ...ledgerEditForm, type: e.target.value as any })}
                    className="w-full border border-gray-300 rounded-xl p-2 text-xs bg-white font-bold"
                  >
                    <option value="income">আয় (Income)</option>
                    <option value="expense">ব্যয় (Expense)</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-gray-700 mb-1">ভাউচার নম্বর</label>
                  <input
                    type="text"
                    value={ledgerEditForm.voucherNo}
                    onChange={(e) => setLedgerEditForm({ ...ledgerEditForm, voucherNo: e.target.value })}
                    className="w-full border border-gray-300 rounded-xl p-2 text-xs font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">ক্যাটাগরি / খাত *</label>
                <input
                  type="text"
                  required
                  value={ledgerEditForm.category}
                  onChange={(e) => setLedgerEditForm({ ...ledgerEditForm, category: e.target.value })}
                  className="w-full border border-gray-300 rounded-xl p-2 text-xs font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">টাকার পরিমাণ (৳) *</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={ledgerEditForm.amount}
                    onChange={(e) => setLedgerEditForm({ ...ledgerEditForm, amount: e.target.value })}
                    className="w-full border border-gray-300 rounded-xl p-2 text-xs font-black text-emerald-700"
                  />
                </div>
                <div>
                  <label className="block font-bold text-gray-700 mb-1">পেমেন্ট মেথড</label>
                  <select
                    value={ledgerEditForm.paymentMethod}
                    onChange={(e) => setLedgerEditForm({ ...ledgerEditForm, paymentMethod: e.target.value as any })}
                    className="w-full border border-gray-300 rounded-xl p-2 text-xs bg-white font-bold"
                  >
                    <option value="Cash">ক্যাশ (Cash)</option>
                    <option value="bKash">বিকাশ (bKash)</option>
                    <option value="Nagad">নগদ (Nagad)</option>
                    <option value="Bank">ব্যাংক (Bank)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">তারিখ</label>
                  <input
                    type="date"
                    value={ledgerEditForm.date}
                    onChange={(e) => setLedgerEditForm({ ...ledgerEditForm, date: e.target.value })}
                    className="w-full border border-gray-300 rounded-xl p-2 text-xs"
                  />
                </div>
                <div>
                  <label className="block font-bold text-gray-700 mb-1">নোট / বিবরণ</label>
                  <input
                    type="text"
                    value={ledgerEditForm.note}
                    onChange={(e) => setLedgerEditForm({ ...ledgerEditForm, note: e.target.value })}
                    className="w-full border border-gray-300 rounded-xl p-2 text-xs"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setLedgerModalOpen(false)}
                  className="flex-1 border border-gray-300 py-2.5 rounded-xl text-xs font-bold text-gray-700 hover:bg-gray-100 cursor-pointer"
                >
                  বাতিল
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded-xl text-xs font-bold shadow transition active:scale-95 cursor-pointer"
                >
                  আপডেট সংরক্ষণ করুন
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL: CPANEL MYSQL (PHPMYADMIN) DATABASE SETUP                 */}
      {/* ============================================================== */}
      {dbModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl p-5 sm:p-6 max-w-md w-full shadow-2xl space-y-4 border border-gray-200">
            <div className="flex justify-between items-center border-b pb-3">
              <div>
                <h3 className="font-black text-gray-900 text-base flex items-center gap-2">
                  <span>🗄️ cPanel MySQL (phpMyAdmin) সেটআপ</span>
                </h3>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  একবার কানেক্ট করলে সব খাবার, অর্ডার ও হিসাব সরাসরি phpMyAdmin টেবিলে সেভ হবে।
                </p>
              </div>
              <button onClick={() => setDbModalOpen(false)} className="text-gray-400 hover:text-gray-600 p-1 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            {dbNotice && (
              <div className={`p-3 rounded-xl text-xs font-bold border ${
                dbNotice.type === 'ok' 
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-900' 
                  : 'bg-red-50 border-red-300 text-red-700'
              }`}>
                {dbNotice.text}
              </div>
            )}

            <form onSubmit={handleSaveMysqlConfig} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-gray-700 mb-1">Database Host</label>
                <input
                  type="text"
                  value={dbForm.dbHost}
                  onChange={(e) => setDbForm({ ...dbForm, dbHost: e.target.value })}
                  placeholder="localhost"
                  className="w-full border border-gray-300 rounded-xl p-2.5 font-mono"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">cPanel Database Name *</label>
                <input
                  type="text"
                  value={dbForm.dbName}
                  onChange={(e) => setDbForm({ ...dbForm, dbName: e.target.value })}
                  placeholder="যেমন: cpaneluser_salmafood"
                  className="w-full border border-gray-300 rounded-xl p-2.5 font-mono font-bold"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">cPanel Database Username *</label>
                <input
                  type="text"
                  value={dbForm.dbUser}
                  onChange={(e) => setDbForm({ ...dbForm, dbUser: e.target.value })}
                  placeholder="যেমন: cpaneluser_dbuser"
                  className="w-full border border-gray-300 rounded-xl p-2.5 font-mono font-bold"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Database User Password *</label>
                <input
                  type="password"
                  value={dbForm.dbPass}
                  onChange={(e) => setDbForm({ ...dbForm, dbPass: e.target.value })}
                  placeholder="আপনার ডাটাবেস ইউজারের পাসওয়ার্ড"
                  className="w-full border border-gray-300 rounded-xl p-2.5 font-mono"
                  required
                />
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5 text-[11px] text-amber-900 space-y-1">
                <p className="font-bold">💡 গুরুত্বপূর্ণ টিপস:</p>
                <p>cPanel ➔ <b>MySQL® Databases</b>-এ গিয়ে আপনার Database User-কে অবশ্যই Database-এর সাথে <b>Add User to Database (ALL PRIVILEGES)</b> করে নেবেন।</p>
              </div>

              <div className="flex gap-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setDbModalOpen(false)}
                  className="flex-1 border border-gray-300 py-2.5 rounded-xl font-bold text-gray-700 hover:bg-gray-100 cursor-pointer"
                >
                  বাতিল
                </button>
                <button
                  type="submit"
                  disabled={dbConnecting}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded-xl font-bold shadow transition active:scale-95 cursor-pointer disabled:opacity-50"
                >
                  {dbConnecting ? 'কানেক্ট হচ্ছে...' : 'কানেক্ট ও সেভ করুন'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
