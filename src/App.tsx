/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Utensils, ShoppingBag, Truck, Award, DollarSign, Settings, 
  MessageSquare, Search, Star, Plus, Minus, Trash2, CheckCircle2, 
  Clock, ShieldCheck, Phone, Send, X, AlertCircle, ChevronRight, 
  TrendingUp, BarChart2, Bell, Globe, Sparkles, ChefHat, Tag, 
  Check, Lock, Smartphone, RefreshCw, Printer, User, ShieldAlert, LogOut, Eye,
  Calendar, FileText, ArrowUpRight, ArrowDownRight, PieChart, Users,
  Receipt, Edit3, Save, MapPin, Hash, CreditCard, Navigation, Compass, Crosshair, Info,
  Volume2, VolumeX, Upload
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  playAddToCartSound, 
  playOrderSuccessSound, 
  playCartQuantitySound, 
  isSoundEnabled, 
  setSoundEnabled 
} from './utils/audioFeedback';
import SmsMarketingPanel from './components/SmsMarketingPanel';
import ShopLocationManager from './components/ShopLocationManager';
import { ShopLocationConfig, DEFAULT_SHOP_LOCATION, MenuCategory, DEFAULT_MENU_CATEGORIES } from './types';
import CategoryManagerModal from './components/CategoryManagerModal';
import { uploadFoodImageToCpanel, saveToCpanelDb, normalizeBdPhone, findCustomerByPhone, pullFromServer, getCustomerDueOrAdvanceBalance, getCustomerTransactions } from './utils/sqlSync';
import { formatDateDMY } from './utils/dateFormatter';

// Types
interface FoodItem {
  id: string;
  nameBn: string;
  nameEn: string;
  category: string;
  price: number;
  originalPrice?: number;
  image: string;
  rating: number;
  reviewsCount: number;
  descriptionBn: string;
  descriptionEn: string;
  spicyLevel?: number;
  isVeg?: boolean;
  isBundle?: boolean;
  bundleItems?: string[];
  bundleSavings?: number;
}

interface CartItem extends FoodItem {
  quantity: number;
}

interface Order {
  id: string;
  customerName: string;
  phone: string;
  address: string;
  items: CartItem[];
  totalAmount: number;
  discount: number;
  advancePaid: number; // কমপক্ষে ৫০% অগ্রীম
  dueAmount: number;   // বাকি টাকা (ডেলিভারির সময় প্রদেয়)
  paymentMethod: string;
  advancePaymentMethod: 'bKash' | 'Nagad' | 'Card';
  transactionId?: string;
  paymentStatus: '50% Advance Paid (Due on Delivery)' | 'Fully Paid (100%)';
  status: 'Placed' | 'Preparing' | 'Out for Delivery' | 'Delivered' | 'Cancelled';
  createdAt: string;
  date: string; // YYYY-MM-DD
  loyaltyPointsEarned: number;
  deliveryDistanceKm?: number;
  isFreeDeliveryWithin1km?: boolean;
  distanceVerificationMethod?: 'GPS' | 'Area' | 'Address' | 'Manual';
}

interface LedgerEntry {
  id: string;
  voucherNo: string;
  type: 'income' | 'expense';
  category: string;
  amount: number;
  date: string; // YYYY-MM-DD
  paymentMethod: 'Cash' | 'bKash' | 'Nagad' | 'Bank' | 'Card';
  note: string;
}

interface CustomerProfile {
  phone: string; // Unique primary key
  name: string;
  address: string;
  loyaltyPoints: number;
  registeredAt: string;
  totalOrders: number;
  totalSpent: number;
}

interface Review {
  id: string;
  customerName: string;
  rating: number;
  comment: string;
  date: string;
}

const INITIAL_MENU: FoodItem[] = [];


// Shop Location & 1 KM Free Delivery Zone Configuration (Gazipur)
export const SHOP_LOCATION = {
  name: 'সালমা ফুড কর্ণার, গাজীপুর',
  address: 'চান্দনা চৌরাস্তা (জয়দেবপুর রোড মোড়), গাজীপুর সদর, গাজীপুর-১৭০০',
  lat: 23.9905,
  lng: 90.3875,
  freeRadiusKm: 1.0,
  standardFee: 60
};

export const NEARBY_1KM_AREAS = [
  { name: 'চান্দনা চৌরাস্তা', distanceKm: 0.2, landmark: 'চৌরাস্তা ফ্লাইওভার ও শাপলা ম্যানশন মোড়' },
  { name: 'ভোগড়া বাইপাস', distanceKm: 0.5, landmark: 'ভোগড়া বাইপাস মোড় ও পেয়ারাবাগান' },
  { name: 'শিববাড়ি মোড় (জয়দেবপুর)', distanceKm: 0.6, landmark: 'জয়দেবপুর রোড ও রাজবাড়ী মাঠ সংলগ্ন' },
  { name: 'ডুয়েট গেট (DUET)', distanceKm: 0.7, landmark: 'শিমুলতলী রোড ও ডুয়েট ক্যাম্পাস' },
  { name: 'বাসন সড়ক ও আউটপাড়া', distanceKm: 0.8, landmark: 'বাসন থানা রোড ও দিঘীর চালা' },
  { name: 'বোর্ড বাজার', distanceKm: 0.9, landmark: 'জাতীয় বিশ্ববিদ্যালয় ও উন্মুক্ত বিশ্ববিদ্যালয় গেট' },
  { name: 'টঙ্গী ও কোনাবাড়ী জোন', distanceKm: 1.0, landmark: 'কলেজ গেট ও কোনাবাড়ী ফ্লাইওভার সংলগ্ন' }
];

// Haversine distance calculator in kilometers
export function calculateDistanceInKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Radius of Earth in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c;
  return Math.round(d * 10) / 10;
}

export const NEARBY_KEYWORDS = [
  'চান্দনা', 'চৌরাস্তা', 'chandona', 'chowrasta', 'জয়দেবপুর', 'joydebpur', 'joydevpur',
  'শিববাড়ি', 'shibbari', 'ভোগড়া', 'vogra', 'vogrs', 'বোর্ড বাজার', 'board bazar',
  'ডুয়েট', 'duet', 'শিমুলতলী', 'shimultoli', 'বাসন', 'bason', 'আউটপাড়া', 'outpara',
  'টঙ্গী', 'tongi', 'কোনাবাড়ী', 'konabari', 'গাজীপুর', 'gazipur', 'জাতীয় বিশ্ববিদ্যালয়'
];

export const SAMPLE_FOOD_PRESETS = [
  {
    nameBn: 'স্পেশাল বিফ কালা ভুনা',
    nameEn: 'Special Beef Kala Bhuna',
    category: 'curry' as const,
    price: 350,
    originalPrice: 380,
    image: 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=600&q=80',
    descriptionBn: 'ঐতিহ্যবাহী মশলায় তৈরি সুস্বাদু ও মশলাদার গরুর মাংসের কালা ভুনা।',
    descriptionEn: 'Traditional slow-cooked Chittagong style black beef roast.',
    spicyLevel: 3,
    isVeg: false
  },
  {
    nameBn: 'চিকেন দম বিরিয়ানি',
    nameEn: 'Chicken Dum Biryani',
    category: 'biryani' as const,
    price: 240,
    originalPrice: 260,
    image: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&w=600&q=80',
    descriptionBn: 'দম পোক্ত স্টাইলে রান্না করা বাসমতি চালের মুরগির বিরিয়ানি ও ডিম।',
    descriptionEn: 'Slow-cooked aromatic basmati rice chicken dum biryani served with boiled egg.',
    spicyLevel: 2,
    isVeg: false
  },
  {
    nameBn: 'মোরগ পোলাও স্পেশাল',
    nameEn: 'Special Morog Polao',
    category: 'biryani' as const,
    price: 260,
    originalPrice: 290,
    image: 'https://images.unsplash.com/photo-1633964913295-ceb43826e7c9?auto=format&fit=crop&w=600&q=80',
    descriptionBn: 'ঘিয়ে ভাজা দেশি মুরগি ও চিনিগুঁড়া চালের সুবাসিত ঢাকাই ঐতিহ্যবাহী মোরগ পোলাও।',
    descriptionEn: 'Aromatic chinigura rice polao served with succulent chicken roast in pure ghee.',
    spicyLevel: 1,
    isVeg: false
  },
  {
    nameBn: 'গ্রিল চিকেন ও বাটার নান',
    nameEn: 'Grilled Chicken & Butter Naan',
    category: 'fastfood' as const,
    price: 210,
    originalPrice: 230,
    image: 'https://images.unsplash.com/photo-1599488615731-7e5c2823ff28?auto=format&fit=crop&w=600&q=80',
    descriptionBn: 'কয়লার আগুনে গ্রিল করা সিকি মুরগি, গরম বাটার নান ও স্পেশাল গার্লিক সস।',
    descriptionEn: 'Charcoal grilled chicken quarter served with hot butter naan and garlic mayonnaise.',
    spicyLevel: 2,
    isVeg: false
  },
  {
    nameBn: 'স্পেশাল ফালুদা ও কুলফি',
    nameEn: 'Special Royal Falooda & Kulfi',
    category: 'dessert' as const,
    price: 160,
    originalPrice: 180,
    image: 'https://images.unsplash.com/photo-1572490122747-3968b75cc699?auto=format&fit=crop&w=600&q=80',
    descriptionBn: 'তাজা ফল, সাবুদানা, নুডুলস ও ভ্যানিলা আইসক্রিম টপিং সমৃদ্ধ ঠান্ডা শাহী ফালুদা।',
    descriptionEn: 'Chilled rich dessert made with fruits, noodles, sabudana, and creamy ice cream.',
    spicyLevel: 0,
    isVeg: true
  }
];

export default function App() {
  const [appMode, setAppMode] = useState<'public' | 'admin'>('public');
  const [adminPinInput, setAdminPinInput] = useState<string>('');
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState<boolean>(false);
  const [adminLoginModal, setAdminLoginModal] = useState<boolean>(false);

  const [lang, setLang] = useState<'bn' | 'en'>('bn');
  const [publicTab, setPublicTab] = useState<'menu' | 'tracker' | 'profile' | 'reviews'>('menu');
  const [adminTab, setAdminTab] = useState<'dashboard' | 'menu' | 'ledger' | 'reports' | 'orders' | 'customers' | 'marketing' | 'location'>('dashboard');
  const [soundOn, setSoundOn] = useState<boolean>(() => isSoundEnabled());

  const [shopLocation, setShopLocation] = useState<ShopLocationConfig>(() => {
    const saved = localStorage.getItem('salma_shop_location');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object' && !String(parsed.address || '').includes('ধানমন্ডি')) {
          return { ...DEFAULT_SHOP_LOCATION, ...parsed };
        }
      } catch (e) {
        console.error(e);
      }
    }
    return DEFAULT_SHOP_LOCATION;
  });

  const todayStr = new Date().toISOString().split('T')[0];

  // 1. Passwordless Customer Database State
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

  // Currently Logged-in Customer (Passwordless)
  const [currentCustomer, setCurrentCustomer] = useState<CustomerProfile | null>(() => {
    const saved = localStorage.getItem('salma_logged_customer');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.phone && parsed.name) return parsed;
      } catch (e) {
        console.error(e);
      }
    }
    return null;
  });

  // Passwordless Customer Login/Register Modal
  const [customerModalOpen, setCustomerModalOpen] = useState<boolean>(false);
  const [customerPhoneInput, setCustomerPhoneInput] = useState<string>('');
  const [customerNameInput, setCustomerNameInput] = useState<string>('');
  const [customerAddressInput, setCustomerAddressInput] = useState<string>('');
  const [customerIsNew, setCustomerIsNew] = useState<boolean>(false);

  // -------------------------------------------------------------
  // FOOD MENU STATE & MANAGEMENT (ADD, EDIT, DELETE)
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
    return INITIAL_MENU;
  });

  useEffect(() => {
    localStorage.setItem('salma_menu_items', JSON.stringify(menuItems));
  }, [menuItems]);

  const [menuCategories, setMenuCategories] = useState<MenuCategory[]>(() => {
    const saved = localStorage.getItem('salma_menu_categories');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch (e) {
        console.error(e);
      }
    }
    return DEFAULT_MENU_CATEGORIES;
  });

  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState<boolean>(false);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'salma_menu_categories' && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setMenuCategories(parsed);
          }
        } catch (err) {
          console.error(err);
        }
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const handleSaveCategories = (updatedCats: MenuCategory[], updatedMenu?: FoodItem[]) => {
    setMenuCategories(updatedCats);
    saveToCpanelDb('salma_menu_categories', updatedCats);

    if (updatedMenu) {
      setMenuItems(updatedMenu);
      saveToCpanelDb('salma_menu_items', updatedMenu);
    }
  };

  const [foodModalOpen, setFoodModalOpen] = useState<boolean>(false);
  const [editingFoodId, setEditingFoodId] = useState<string | null>(null);
  const [foodForm, setFoodForm] = useState({
    nameBn: '',
    nameEn: '',
    category: 'biryani' as FoodItem['category'],
    price: '',
    originalPrice: '',
    image: '',
    descriptionBn: '',
    descriptionEn: '',
    spicyLevel: 1,
    isVeg: false
  });
  const [adminFoodSearch, setAdminFoodSearch] = useState<string>('');
  const [adminFoodCategory, setAdminFoodCategory] = useState<string>('all');
  const [isUploadingAppFoodImg, setIsUploadingAppFoodImg] = useState<boolean>(false);

  const handleAppFoodImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingAppFoodImg(true);
    const res = await uploadFoodImageToCpanel(file);
    setIsUploadingAppFoodImg(false);
    if (res.ok && res.imageUrl) {
      setFoodForm(prev => ({ ...prev, image: res.imageUrl }));
    }
    e.target.value = '';
  };

  // Open modal for Adding new food item
  const handleOpenAddFoodModal = () => {
    setEditingFoodId(null);
    setFoodForm({
      nameBn: '',
      nameEn: '',
      category: 'biryani',
      price: '',
      originalPrice: '',
      image: 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=600&q=80',
      descriptionBn: '',
      descriptionEn: '',
      spicyLevel: 1,
      isVeg: false
    });
    setFoodModalOpen(true);
  };

  // Open modal for Editing existing food item
  const handleOpenEditFoodModal = (item: FoodItem) => {
    setEditingFoodId(item.id);
    setFoodForm({
      nameBn: item.nameBn,
      nameEn: item.nameEn,
      category: item.category,
      price: item.price.toString(),
      originalPrice: item.originalPrice ? item.originalPrice.toString() : '',
      image: item.image,
      descriptionBn: item.descriptionBn,
      descriptionEn: item.descriptionEn,
      spicyLevel: item.spicyLevel ?? 1,
      isVeg: item.isVeg ?? false
    });
    setFoodModalOpen(true);
  };

  // Save Food Item (Add or Update)
  const handleSaveFoodItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!foodForm.nameBn.trim()) {
      alert('অনুগ্রহ করে খাবারের বাংলা নাম লিখুন।');
      return;
    }
    const priceNum = Number(foodForm.price);
    if (!priceNum || priceNum <= 0) {
      alert('সঠিক মূল্য নির্ধারণ করুন।');
      return;
    }

    const originalPriceNum = foodForm.originalPrice ? Number(foodForm.originalPrice) : undefined;
    const fallbackImg = 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=600&q=80';

    if (editingFoodId) {
      // Edit mode
      const updated = menuItems.map(item => {
        if (item.id === editingFoodId) {
          return {
            ...item,
            nameBn: foodForm.nameBn.trim(),
            nameEn: foodForm.nameEn.trim() || foodForm.nameBn.trim(),
            category: foodForm.category,
            price: priceNum,
            originalPrice: originalPriceNum,
            image: foodForm.image.trim() || fallbackImg,
            descriptionBn: foodForm.descriptionBn.trim(),
            descriptionEn: foodForm.descriptionEn.trim(),
            spicyLevel: foodForm.spicyLevel,
            isVeg: foodForm.isVeg
          };
        }
        return item;
      });
      saveToCpanelDb('salma_menu_items', updated);
      setMenuItems(updated);
      setFoodModalOpen(false);
      alert(`খাবার '${foodForm.nameBn}' সফলভাবে এডিট/আপডেট করা হয়েছে!`);
    } else {
      // Add mode
      const newItem: FoodItem = {
        id: 'food-' + Date.now(),
        nameBn: foodForm.nameBn.trim(),
        nameEn: foodForm.nameEn.trim() || foodForm.nameBn.trim(),
        category: foodForm.category,
        price: priceNum,
        originalPrice: originalPriceNum,
        image: foodForm.image.trim() || fallbackImg,
        rating: 5.0,
        reviewsCount: 1,
        descriptionBn: foodForm.descriptionBn.trim() || 'সালমা ফুড কর্ণারের ঐতিহ্যবাহী স্পেশাল রেসিপিতে তৈরি।',
        descriptionEn: foodForm.descriptionEn.trim() || 'Prepared with special traditional recipe at Salma Food Corner.',
        spicyLevel: foodForm.spicyLevel,
        isVeg: foodForm.isVeg
      };
      const updated = [newItem, ...menuItems];
      saveToCpanelDb('salma_menu_items', updated);
      setMenuItems(updated);
      setFoodModalOpen(false);
      alert(`নতুন খাবার '${newItem.nameBn}' সফলভাবে মেনুতে সংযোজন করা হয়েছে!`);
    }
  };

  // Delete Food Item (বিয়োজন)
  const handleDeleteFoodItem = (id: string, nameBn: string) => {
    if (confirm(`আপনি কি সত্যিই '${nameBn}' মেনু থেকে মুছে (বিয়োজন) ফেলতে চান?`)) {
      const updated = menuItems.filter(item => item.id !== id);
      saveToCpanelDb('salma_menu_items', updated);
      setMenuItems(updated);
      // Also remove from cart if present
      setCart(prev => prev.filter(item => item.id !== id));
      alert(`'${nameBn}' সফলভাবে মেনু থেকে মুছে ফেলা হয়েছে।`);
    }
  };

  // Reset Menu to Initial Default
  const handleResetMenuToDefault = () => {
    if (confirm('আপনি কি খাবারের মেনুটি প্রাথমিক ডিফল্ট তালিকায় রিস্টোর করতে চান?')) {
      setMenuItems(INITIAL_MENU);
      alert('মেনু সফলভাবে প্রাথমিক তালিকায় রিস্টোর করা হয়েছে।');
    }
  };

  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState<boolean>(false);

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

  // 1 KM Free Delivery Zone States
  const [customerDistanceKm, setCustomerDistanceKm] = useState<number | null>(null);
  const [distanceVerifiedType, setDistanceVerifiedType] = useState<'gps' | 'area' | 'address' | 'manual' | null>(null);
  const [isLocatingGps, setIsLocatingGps] = useState<boolean>(false);
  const [gpsMessage, setGpsMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [showShopLocationModal, setShowShopLocationModal] = useState<boolean>(false);

  // POS Ledger / Accounting Entries
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

  // Quick POS Card Inputs
  const [quickIncomeInput, setQuickIncomeInput] = useState({ category: 'খাবার বিক্রয় (Food Sales)', amount: '', paymentMethod: 'Cash' as const, note: '' });
  const [quickExpenseInput, setQuickExpenseInput] = useState({ category: 'কাঁচামাল ও বাজার (Raw Materials)', amount: '', paymentMethod: 'Cash' as const, note: '' });

  // Reviews
  const [reviews, setReviews] = useState<Review[]>([]);

  const [activeOffer, setActiveOffer] = useState<string>('🎉 সুখবর! দোকানের ১ কি.মি. পরিধিতে ডেলিভারি চার্জ সম্পূর্ণ ফ্রি (৳০)! যেকোনো খাবারে ১০% ছাড়ে কোড: SALMA10');
  const [showOfferBanner, setShowOfferBanner] = useState<boolean>(true);

  // Checkout Form State (At least 50% advance required)
  const [checkoutForm, setCheckoutForm] = useState({
    name: currentCustomer ? currentCustomer.name : '',
    phone: currentCustomer ? currentCustomer.phone : '',
    address: currentCustomer ? currentCustomer.address : '',
    advanceOption: '50' as '50' | '100', // '50' = ৫০% অগ্রীম, '100' = ১০০% সম্পূর্ণ
    advancePaymentMethod: 'bKash' as 'bKash' | 'Nagad' | 'Card',
    transactionId: '',
    coupon: '',
    useLoyalty: false
  });
  const [discountApplied, setDiscountApplied] = useState<number>(0);
  const [orderSuccessModal, setOrderSuccessModal] = useState<Order | null>(null);
  const [deliveryToast, setDeliveryToast] = useState<Order | null>(null);
  const prevOrderStatusesRef = useRef<Record<string, Order['status']>>({});

  // Sync checkout form when currentCustomer changes
  useEffect(() => {
    if (currentCustomer) {
      setCheckoutForm(prev => ({
        ...prev,
        name: currentCustomer.name,
        phone: currentCustomer.phone,
        address: currentCustomer.address
      }));
      // Auto check address for 1km zone
      checkAddressKeywordFor1Km(currentCustomer.address);
    }
  }, [currentCustomer]);

  // Helper: Detect if typed address is within 1km
  const checkAddressKeywordFor1Km = (addr: string) => {
    if (!addr) return;
    const lower = addr.toLowerCase();
    const matched = NEARBY_KEYWORDS.some(kw => lower.includes(kw.toLowerCase()));
    if (matched) {
      setCustomerDistanceKm(0.4);
      setDistanceVerifiedType('address');
      setGpsMessage({ type: 'success', text: 'আপনার ঠিকানাটি দোকানের ১ কি.মি. ফ্রি ডেলিভারি জোনের অন্তর্ভুক্ত! (ডেলিভারি ফি: ৳০)' });
    }
  };

  // Helper: Live GPS Location Checker
  const handleCheckGpsLocation = () => {
    if (!navigator.geolocation) {
      setGpsMessage({ type: 'error', text: 'আপনার ব্রাউজারে GPS সক্রিয় নেই। নিচে থেকে নিকটস্থ এলাকা নির্বাচন করুন।' });
      return;
    }
    setIsLocatingGps(true);
    setGpsMessage({ type: 'info', text: 'আপনার লাইভ লোকেশন নির্ণয় করা হচ্ছে...' });

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const userLat = pos.coords.latitude;
        const userLng = pos.coords.longitude;
        const dist = calculateDistanceInKm(shopLocation.lat, shopLocation.lng, userLat, userLng);
        setCustomerDistanceKm(dist);
        setDistanceVerifiedType('gps');
        setIsLocatingGps(false);
        if (dist <= shopLocation.freeRadiusKm) {
          setGpsMessage({ 
            type: 'success', 
            text: `অভিনন্দন! আপনার দূরত্ব মাত্র ${dist} কি.মি. (${shopLocation.freeRadiusKm} কি.মি. ফ্রি ডেলিভারি জোনের ভিতরে)। ডেলিভারি চার্জ সম্পূর্ণ ফ্রি (৳০)!` 
          });
        } else {
          setGpsMessage({ 
            type: 'info', 
            text: `আপনার দূরত্ব ${dist} কি.মি. (${shopLocation.freeRadiusKm} কি.মি. ফ্রি জোনের বাইরে)। রেগুলার ডেলিভারি ফি ৳${shopLocation.standardFee} প্রযোজ্য।` 
          });
        }
      },
      (err) => {
        setIsLocatingGps(false);
        setGpsMessage({ 
          type: 'error', 
          text: 'GPS অনুমতি পাওয়া যায়নি। নিচে থেকে আপনার নিকটবর্তী এলাকা সহজে নির্বাচন করুন।' 
        });
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  // Helper: 1-Click Nearby Area Selection
  const handleSelectNearbyArea = (area: typeof NEARBY_1KM_AREAS[0]) => {
    setCustomerDistanceKm(area.distanceKm);
    setDistanceVerifiedType('area');
    setGpsMessage({
      type: 'success',
      text: `${area.name} সিলেক্ট করা হয়েছে (দূরত্ব: ${area.distanceKm} কি.মি.)। ডেলিভারি চার্জ সম্পূর্ণ ফ্রি (৳০)!`
    });
    // Append or fill address if needed
    setCheckoutForm(prev => {
      const current = prev.address.trim();
      if (!current) {
        return { ...prev, address: `${area.name}, ${area.landmark}` };
      } else if (!current.includes(area.name)) {
        return { ...prev, address: `${current}, ${area.name}` };
      }
      return prev;
    });
  };

  // Chatbot State
  const [isChatOpen, setIsChatOpen] = useState<boolean>(false);
  const [chatMessages, setChatMessages] = useState<Array<{ role: 'user' | 'model'; text: string }>>([
    { role: 'model', text: lang === 'bn' ? 'আসসালামু আলাইকুম! আমি সালমা ফুড অ্যাসিস্ট্যান্ট। কোনো পাসওয়ার্ড ছাড়াই আপনার মোবাইল নম্বর দিয়ে সহজে অর্ডার করুন। আপনাকে কী দিয়ে সাহায্য করতে পারি?' : 'Assalamu Alaikum! I am Salma Food Assistant. How can I help you today?' }
  ]);
  const [chatInput, setChatInput] = useState<string>('');
  const [chatLoading, setChatLoading] = useState<boolean>(false);

  // Offline status
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem('salma_customers', JSON.stringify(customers));
  }, [customers]);

  useEffect(() => {
    if (currentCustomer) {
      localStorage.setItem('salma_logged_customer', JSON.stringify(currentCustomer));
    } else {
      localStorage.removeItem('salma_logged_customer');
    }
  }, [currentCustomer]);

  useEffect(() => {
    // Detect transition from 'Preparing' to 'Out for Delivery'
    const prevMap = prevOrderStatusesRef.current;
    const isInitialMount = Object.keys(prevMap).length === 0;

    if (!isInitialMount) {
      for (const ord of orders) {
        if (prevMap[ord.id] === 'Preparing' && ord.status === 'Out for Delivery') {
          setDeliveryToast(ord);
          if (soundOn) playOrderSuccessSound();
          break;
        }
      }
    } else {
      // Check if AdminApp recently triggered a 'Preparing' -> 'Out for Delivery' toast
      const savedToast = localStorage.getItem('salma_delivery_toast');
      if (savedToast) {
        try {
          const parsedToast = JSON.parse(savedToast) as Order;
          if (parsedToast && parsedToast.id) {
            setDeliveryToast(parsedToast);
          }
        } catch (e) {
          console.error(e);
        }
        localStorage.removeItem('salma_delivery_toast');
      }
    }

    const nextMap: Record<string, Order['status']> = {};
    for (const ord of orders) {
      nextMap[ord.id] = ord.status;
    }
    prevOrderStatusesRef.current = nextMap;

    localStorage.setItem('salma_orders', JSON.stringify(orders));
  }, [orders, soundOn]);

  // Auto-dismiss delivery toast after 6 seconds
  useEffect(() => {
    if (!deliveryToast) return;
    const timer = setTimeout(() => {
      setDeliveryToast(null);
    }, 6000);
    return () => clearTimeout(timer);
  }, [deliveryToast]);

  // Listen for live updates from cPanel server / AdminApp (/admin.html)
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (!e.newValue) return;
      try {
        if (e.key === 'salma_orders') {
          const updatedOrders = JSON.parse(e.newValue);
          if (Array.isArray(updatedOrders)) setOrders(updatedOrders);
        } else if (e.key === 'salma_menu_items') {
          const updatedMenu = JSON.parse(e.newValue);
          if (Array.isArray(updatedMenu)) setMenuItems(updatedMenu);
        } else if (e.key === 'salma_customers') {
          const updatedCust = JSON.parse(e.newValue);
          if (updatedCust && typeof updatedCust === 'object') setCustomers(updatedCust);
        } else if (e.key === 'salma_ledger') {
          const updatedLedger = JSON.parse(e.newValue);
          if (Array.isArray(updatedLedger)) setLedger(updatedLedger);
        } else if (e.key === 'salma_shop_location') {
          const updatedLoc = JSON.parse(e.newValue);
          if (updatedLoc && typeof updatedLoc === 'object') {
            setShopLocation({ ...DEFAULT_SHOP_LOCATION, ...updatedLoc });
          }
        }
      } catch (err) {
        console.error(err);
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  useEffect(() => {
    localStorage.setItem('salma_ledger', JSON.stringify(ledger));
  }, [ledger]);

  // -------------------------------------------------------------
  // PASSWORDLESS CUSTOMER AUTHENTICATION HANDLERS (MOBILE-ONLY FOR REGISTERED CUSTOMERS)
  // -------------------------------------------------------------
  const handleCheckPhone = (phoneNum: string) => {
    const normalized = normalizeBdPhone(phoneNum);
    const existing = findCustomerByPhone(phoneNum, customers, orders);
    if (existing) {
      setCustomerIsNew(false);
      setCustomerNameInput(existing.name);
      setCustomerAddressInput(existing.address);
    } else if (normalized.length >= 10) {
      setCustomerIsNew(true);
      setCustomerNameInput('');
      setCustomerAddressInput('');
    } else {
      setCustomerIsNew(false);
    }
  };

  const handlePasswordlessLoginOrRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedPhone = normalizeBdPhone(customerPhoneInput);
    if (!normalizedPhone || normalizedPhone.length !== 11 || !normalizedPhone.startsWith('01')) {
      alert('সঠিক ১১ ডিজিটের মোবাইল নম্বর প্রদান করুন (+88 ছাড়া, যেমন: 01712345678)');
      return;
    }

    // 1. Check local/live memory store & order history first
    let existingProfile = findCustomerByPhone(normalizedPhone, customers, orders);

    // 2. If not found locally, pull latest from cPanel DB once in case customer registered on another device
    if (!existingProfile) {
      await pullFromServer();
      existingProfile = findCustomerByPhone(normalizedPhone, customers, orders);
    }

    if (existingProfile) {
      // Existing registered customer: instant login with ONLY mobile number!
      const canonicalProfile = { ...existingProfile, phone: normalizedPhone };
      const updatedCustomers = { ...customers, [normalizedPhone]: canonicalProfile };
      setCustomers(updatedCustomers);
      setCurrentCustomer(canonicalProfile);
      setCheckoutForm(prev => ({
        ...prev,
        phone: canonicalProfile.phone,
        name: canonicalProfile.name,
        address: canonicalProfile.address
      }));
      saveToCpanelDb('salma_customers', updatedCustomers);
      setCustomerModalOpen(false);
      alert(`স্বাগতম, ${canonicalProfile.name}! শুধুমাত্র মোবাইল নম্বর দিয়েই আপনার প্রোফাইল সফলভাবে লগইন হয়েছে।`);
      return;
    }

    // Truly first-time customer: show registration fields if not yet visible
    if (!customerIsNew) {
      setCustomerIsNew(true);
      return;
    }

    if (!customerNameInput.trim() || !customerAddressInput.trim()) {
      alert('প্রথমবার রেজিস্ট্রেশন সম্পন্ন করতে অনুগ্রহ করে আপনার নাম ও ডেলিভারি ঠিকানা পূরণ করুন। পরবর্তীতে শুধু মোবাইল নম্বর দিয়েই লগইন করতে পারবেন।');
      return;
    }

    const newProfile: CustomerProfile = {
      phone: normalizedPhone,
      name: customerNameInput.trim(),
      address: customerAddressInput.trim(),
      loyaltyPoints: 50, // Welcome gift 50 points
      registeredAt: todayStr,
      totalOrders: 0,
      totalSpent: 0
    };
    const updatedCustomers = { ...customers, [normalizedPhone]: newProfile };
    setCustomers(updatedCustomers);
    setCurrentCustomer(newProfile);
    setCheckoutForm(prev => ({
      ...prev,
      phone: newProfile.phone,
      name: newProfile.name,
      address: newProfile.address
    }));
    saveToCpanelDb('salma_customers', updatedCustomers);
    setCustomerModalOpen(false);
    alert(`ধন্যবাদ, ${newProfile.name}! আপনার রেজিস্ট্রেশন সম্পন্ন হয়েছে এবং ৫০ বোনাস পয়েন্ট যুক্ত হয়েছে। পরবর্তীতে শুধুমাত্র মোবাইল নম্বর (${normalizedPhone}) দিয়েই সরাসরি লগইন করতে পারবেন!`);
  };

  const handleCustomerLogout = () => {
    setCurrentCustomer(null);
    setCheckoutForm(prev => ({ ...prev, name: '', phone: '', address: '' }));
    alert('সফলভাবে লগআউট করা হয়েছে। পরবর্তীতে শুধুমাত্র আপনার মোবাইল নম্বর দিয়েই লগইন করতে পারবেন।');
  };

  const handleUpdateCustomerProfile = (name: string, address: string) => {
    if (!currentCustomer) return;
    const normalizedPhone = normalizeBdPhone(currentCustomer.phone);
    const updated = { ...currentCustomer, phone: normalizedPhone, name: name.trim(), address: address.trim() };
    setCurrentCustomer(updated);
    const updatedCustomers = { ...customers, [normalizedPhone]: updated };
    setCustomers(updatedCustomers);
    saveToCpanelDb('salma_customers', updatedCustomers);
    alert('আপনার প্রোফাইল তথ্য সফলভাবে আপডেট হয়েছে!');
  };

  // -------------------------------------------------------------
  // CART & CHECKOUT WITH AUTO PROFILE REGISTRATION
  // -------------------------------------------------------------
  const [cardQuantities, setCardQuantities] = useState<Record<string, number>>({});

  const getCardQuantity = (itemId: string) => {
    const inCart = cart.find(c => c.id === itemId);
    if (inCart) return inCart.quantity;
    return cardQuantities[itemId] || 1;
  };

  const handleCardStepper = (item: FoodItem, delta: number) => {
    const inCart = cart.find(c => c.id === item.id);
    if (inCart) {
      updateQuantity(item.id, delta);
      const nextQty = Math.max(1, inCart.quantity + delta);
      setCardQuantities(prev => ({ ...prev, [item.id]: nextQty }));
    } else {
      playCartQuantitySound();
      setCardQuantities(prev => {
        const current = prev[item.id] || 1;
        return { ...prev, [item.id]: Math.max(1, current + delta) };
      });
    }
  };

  const addToCart = (item: FoodItem, qtyToAdd?: number) => {
    playAddToCartSound();
    const amount = qtyToAdd ?? (cardQuantities[item.id] || 1);
    setCart(prev => {
      const existing = prev.find(i => i.id === item.id);
      if (existing) {
        return prev.map(i => i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, { ...item, quantity: amount }];
    });
  };

  const updateQuantity = (id: string, delta: number) => {
    playCartQuantitySound();
    setCart(prev => prev.map(i => {
      if (i.id === id) {
        const newQty = i.quantity + delta;
        return newQty > 0 ? { ...i, quantity: newQty } : null;
      }
      return i;
    }).filter(Boolean) as CartItem[]);
  };

  const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  // Free Delivery Zone Rule: Within configured freeRadiusKm or matching nearby address keywords = FREE (৳0)
  const isAddressInFreeZone = (shopLocation.nearbyAreas || []).some(area => 
    checkoutForm.address.toLowerCase().includes(area.toLowerCase())
  );
  const isWithinFreeRadius = (customerDistanceKm !== null && customerDistanceKm <= shopLocation.freeRadiusKm) || isAddressInFreeZone;
  const isWithin1Km = isWithinFreeRadius;
  const deliveryFee = isWithinFreeRadius ? 0 : shopLocation.standardFee;
  const couponDiscount = discountApplied;
  const availablePoints = currentCustomer ? currentCustomer.loyaltyPoints : 0;
  const loyaltyDiscount = checkoutForm.useLoyalty ? Math.min(availablePoints * 0.5, subtotal * 0.3) : 0;
  const finalTotal = Math.max(0, subtotal + deliveryFee - couponDiscount - loyaltyDiscount);

  // Advance Payment Calculation (Minimum 50% required by restaurant policy)
  const minAdvance = Math.ceil(finalTotal * 0.5);
  const advanceAmount = checkoutForm.advanceOption === '100' ? finalTotal : minAdvance;
  const dueAmount = finalTotal - advanceAmount;

  const handleApplyCoupon = () => {
    if (checkoutForm.coupon.toUpperCase() === 'SALMA10') {
      setDiscountApplied(Math.round(subtotal * 0.1));
      alert('১০% ডিসকাউন্ট কুপন সফলভাবে প্রয়োগ করা হয়েছে!');
    } else {
      alert('অকার্যকর কুপন কোড! (চেক করুন: SALMA10)');
    }
  };

  const handleCheckout = (e: React.FormEvent) => {
    e.preventDefault();
    const phone = normalizeBdPhone(checkoutForm.phone);
    const name = checkoutForm.name.trim();
    const address = checkoutForm.address.trim();

    if (!phone || !name || !address) {
      alert('দয়া করে আপনার মোবাইল নম্বর, নাম এবং ডেলিভারি ঠিকানা পূরণ করুন।');
      return;
    }
    if (cart.length === 0) return;

    const pointsEarned = Math.floor(finalTotal / 10);

    // AUTO PROFILE CREATION / UPDATE IN DATABASE (PASSWORDLESS)
    const existingCustomer = findCustomerByPhone(phone, customers, orders);
    let updatedProfile: CustomerProfile;
    if (existingCustomer) {
      updatedProfile = {
        ...existingCustomer,
        phone,
        name,
        address,
        loyaltyPoints: existingCustomer.loyaltyPoints + pointsEarned - (checkoutForm.useLoyalty ? Math.round(loyaltyDiscount * 2) : 0),
        totalOrders: existingCustomer.totalOrders + 1,
        totalSpent: existingCustomer.totalSpent + finalTotal
      };
    } else {
      // First-time ordering customer auto registered!
      updatedProfile = {
        phone,
        name,
        address,
        loyaltyPoints: pointsEarned + 50, // bonus welcome 50 points
        registeredAt: todayStr,
        totalOrders: 1,
        totalSpent: finalTotal
      };
    }

    const nextCustomers = { ...customers, [phone]: updatedProfile };
    setCustomers(nextCustomers);
    setCurrentCustomer(updatedProfile);
    saveToCpanelDb('salma_customers', nextCustomers);

    // Auto-generate or use Transaction ID
    const trxId = checkoutForm.transactionId.trim() || 
      (checkoutForm.advancePaymentMethod === 'bKash' ? 'BK-' : checkoutForm.advancePaymentMethod === 'Nagad' ? 'NG-' : 'CD-') + 
      Math.floor(100000 + Math.random() * 900000);

    // Create Order with Advance Payment, Due Amount, and 1km Free Delivery Data
    const newOrder: Order = {
      id: 'SF-' + Math.floor(1000 + Math.random() * 9000),
      customerName: name,
      phone: phone,
      address: address,
      items: [...cart],
      totalAmount: finalTotal,
      discount: couponDiscount + loyaltyDiscount,
      advancePaid: advanceAmount,
      dueAmount: dueAmount,
      paymentMethod: `${checkoutForm.advancePaymentMethod} (অগ্রীম ৳${advanceAmount}) + ${dueAmount > 0 ? 'ক্যাশ অন ডেলিভারি (বাকি ৳' + dueAmount + ')' : 'সম্পূর্ণ পরিশোধিত'}`,
      advancePaymentMethod: checkoutForm.advancePaymentMethod,
      transactionId: trxId,
      paymentStatus: dueAmount === 0 ? 'Fully Paid (100%)' : '50% Advance Paid (Due on Delivery)',
      status: 'Placed',
      createdAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      date: todayStr,
      loyaltyPointsEarned: pointsEarned,
      deliveryDistanceKm: customerDistanceKm ?? undefined,
      isFreeDeliveryWithin1km: isWithin1Km,
      distanceVerificationMethod: distanceVerifiedType === 'gps' ? 'GPS' : distanceVerifiedType === 'area' ? 'Area' : distanceVerifiedType === 'address' ? 'Address' : 'Manual'
    };

    const nextOrders = [newOrder, ...orders];
    setOrders(nextOrders);
    saveToCpanelDb('salma_orders', nextOrders);

    // Automatic entry to POS Ledger - records the actual advance payment received
    const autoLedgerEntry: LedgerEntry = {
      id: 'inc-' + Date.now(),
      voucherNo: 'ADV-' + newOrder.id,
      type: 'income',
      category: 'খাবার বিক্রয় (Food Sales)',
      amount: advanceAmount,
      date: todayStr,
      paymentMethod: checkoutForm.advancePaymentMethod,
      note: `অর্ডার ${newOrder.id} - ${name} (${checkoutForm.advanceOption === '100' ? '১০০% ফুল পেমেন্ট' : '৫০% অগ্রীম প্রাপ্তি ৳' + advanceAmount + ', বাকি বকেয়া ৳' + dueAmount}) (Trx: ${trxId})`
    };
    const nextLedger = [autoLedgerEntry, ...ledger];
    setLedger(nextLedger);
    saveToCpanelDb('salma_ledger', nextLedger);

    setOrderSuccessModal(newOrder);
    playOrderSuccessSound();
    setCart([]);
    setIsCartOpen(false);
  };

  // Quick Income Card Handler
  const handleAddQuickIncome = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickIncomeInput.amount || Number(quickIncomeInput.amount) <= 0) return;
    const entry: LedgerEntry = {
      id: 'inc-' + Date.now(),
      voucherNo: 'VCH-Q' + Math.floor(100 + Math.random() * 900),
      type: 'income',
      category: quickIncomeInput.category,
      amount: Number(quickIncomeInput.amount),
      date: todayStr,
      paymentMethod: quickIncomeInput.paymentMethod,
      note: quickIncomeInput.note || 'দৈনিক নগদ আয় এন্ট্রি'
    };
    const updated = [entry, ...ledger];
    setLedger(updated);
    saveToCpanelDb('salma_ledger', updated);
    setQuickIncomeInput({ category: 'খাবার বিক্রয় (Food Sales)', amount: '', paymentMethod: 'Cash', note: '' });
    alert('সফলভাবে আজকের আয় হিসাব যুক্ত হয়েছে!');
  };

  // Quick Expense Card Handler
  const handleAddQuickExpense = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickExpenseInput.amount || Number(quickExpenseInput.amount) <= 0) return;
    const entry: LedgerEntry = {
      id: 'exp-' + Date.now(),
      voucherNo: 'VCH-E' + Math.floor(100 + Math.random() * 900),
      type: 'expense',
      category: quickExpenseInput.category,
      amount: Number(quickExpenseInput.amount),
      date: todayStr,
      paymentMethod: quickExpenseInput.paymentMethod,
      note: quickExpenseInput.note || 'দৈনিক ব্যয় এন্ট্রি'
    };
    const updated = [entry, ...ledger];
    setLedger(updated);
    saveToCpanelDb('salma_ledger', updated);
    setQuickExpenseInput({ category: 'কাঁচামাল ও বাজার (Raw Materials)', amount: '', paymentMethod: 'Cash', note: '' });
    alert('সফলভাবে আজকের ব্যয় হিসাব যুক্ত হয়েছে!');
  };

  const handleDeleteLedgerEntry = (id: string) => {
    if (confirm('আপনি কি এই হিসাব এন্ট্রিটি মুছে ফেলতে চান?')) {
      const updated = ledger.filter(l => l.id !== id);
      setLedger(updated);
      saveToCpanelDb('salma_ledger', updated);
    }
  };

  const handleEditLedgerEntryInApp = (entry: LedgerEntry) => {
    const newAmountStr = prompt(`পরিমাণ (৳) পরিবর্তন করুন (${entry.category}):`, String(entry.amount));
    if (newAmountStr === null) return;
    const newNote = prompt('নোট / বিবরণ পরিবর্তন করুন:', entry.note);
    if (newNote === null) return;
    const updated = ledger.map(l => l.id === entry.id ? { ...l, amount: Math.max(0, Number(newAmountStr) || l.amount), note: newNote.trim() || l.note } : l);
    setLedger(updated);
    saveToCpanelDb('salma_ledger', updated);
  };

  const handleEditOrderInApp = (order: Order) => {
    const newName = prompt('গ্রাহকের নাম এডিট করুন:', order.customerName);
    if (newName === null) return;
    const newAddr = prompt('ডেলিভারি ঠিকানা এডিট করুন:', order.address);
    if (newAddr === null) return;
    const newTotalStr = prompt('মোট বিল (৳) এডিট করুন:', String(order.totalAmount));
    if (newTotalStr === null) return;
    const updated = orders.map(o => o.id === order.id ? {
      ...o,
      customerName: newName.trim() || o.customerName,
      address: newAddr.trim() || o.address,
      totalAmount: Math.max(0, Number(newTotalStr) || o.totalAmount)
    } : o);
    setOrders(updated);
    saveToCpanelDb('salma_orders', updated);
  };

  const ensureCustomerSavedFromOrder = (order: Order) => {
    const cleanPhone = normalizeBdPhone(order.phone) || order.phone.trim();
    if (!cleanPhone) return;
    const existing = findCustomerByPhone(cleanPhone, customers, orders);
    const preservedProfile: CustomerProfile = existing
      ? {
          ...existing,
          phone: cleanPhone,
          name: existing.name || order.customerName,
          address: existing.address || order.address
        }
      : {
          phone: cleanPhone,
          name: order.customerName || 'সম্মানিত গ্রাহক',
          address: order.address || 'চান্দনা চৌরাস্তা, গাজীপুর',
          loyaltyPoints: 50,
          registeredAt: order.date || todayStr,
          totalOrders: 1,
          totalSpent: order.totalAmount || 0
        };
    const updatedCustomers = { ...customers, [cleanPhone]: preservedProfile };
    setCustomers(updatedCustomers);
    if (currentCustomer && normalizeBdPhone(currentCustomer.phone) === cleanPhone) {
      setCurrentCustomer(preservedProfile);
    }
    saveToCpanelDb('salma_customers', updatedCustomers);
  };

  const handleCancelOrder = (order: Order) => {
    if (order.status === 'Cancelled') return;
    if (confirm(`আপনি কি নিশ্চিতভাবে অর্ডার #${order.id} ক্যান্সেল (বাতিল) করতে চান? (আপনার কাস্টমার প্রোফাইল ও অ্যাকাউন্ট সংরক্ষিত থাকবে)`)) {
      ensureCustomerSavedFromOrder(order);
      const updatedOrders: Order[] = orders.map(o =>
        o.id === order.id ? { ...o, status: 'Cancelled' } : o
      );
      setOrders(updatedOrders);
      saveToCpanelDb('salma_orders', updatedOrders);
      alert(`অর্ডার #${order.id} সফলভাবে ক্যান্সেল (বাতিল) করা হয়েছে এবং আপনার কাস্টমার তথ্য ডাটাবেসে সংরক্ষিত রয়েছে।`);
    }
  };

  const handleDeleteOrderInApp = (orderId: string) => {
    const targetOrder = orders.find(o => o.id === orderId);
    if (confirm(`আপনি কি নিশ্চিতভাবে অর্ডার #${orderId} মুছে ফেলতে চান? (কাস্টমারের প্রোফাইল সংরক্ষিত থাকবে)`)) {
      if (targetOrder) {
        ensureCustomerSavedFromOrder(targetOrder);
      }
      const updated = orders.filter(o => o.id !== orderId);
      setOrders(updated);
      saveToCpanelDb('salma_orders', updated);
    }
  };

  const handleEditCustomerInApp = (cust: CustomerProfile) => {
    const newName = prompt('গ্রাহকের নাম এডিট করুন:', cust.name);
    if (newName === null) return;
    const newAddr = prompt('ডেলিভারি ঠিকানা এডিট করুন:', cust.address);
    if (newAddr === null) return;
    const newPtsStr = prompt('লয়্যালটি পয়েন্ট এডিট করুন:', String(cust.loyaltyPoints));
    if (newPtsStr === null) return;
    const updatedCust: CustomerProfile = {
      ...cust,
      name: newName.trim() || cust.name,
      address: newAddr.trim() || cust.address,
      loyaltyPoints: Math.max(0, Number(newPtsStr) || 0)
    };
    const updatedMap = { ...customers, [cust.phone]: updatedCust };
    setCustomers(updatedMap);
    saveToCpanelDb('salma_customers', updatedMap);
  };

  const handleDeleteCustomerInApp = (phone: string, name: string) => {
    if (confirm(`আপনি কি নিশ্চিতভাবে গ্রাহক "${name}" (${phone})-এর প্রোফাইল মুছে ফেলতে চান?`)) {
      const updatedMap = { ...customers };
      delete updatedMap[phone];
      setCustomers(updatedMap);
      saveToCpanelDb('salma_customers', updatedMap);
    }
  };

  // Chatbot Handler
  const handleSendMessage = async () => {
    if (!chatInput.trim() || chatLoading) return;
    const userMsg = chatInput;
    setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setChatLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMsg,
          history: chatMessages.map(m => ({ role: m.role, text: m.text }))
        })
      });
      const data = await response.json();
      if (data.reply) {
        setChatMessages(prev => [...prev, { role: 'model', text: data.reply }]);
      } else {
        setChatMessages(prev => [...prev, { role: 'model', text: 'দুঃখিত, এই মুহূর্তে উত্তর দেওয়া সম্ভব হচ্ছে না।' }]);
      }
    } catch {
      setChatMessages(prev => [...prev, { role: 'model', text: 'সার্ভার সংযোগ সমস্যা। ইন্টারনেট সংযোগ নিশ্চিত করুন।' }]);
    } finally {
      setChatLoading(false);
    }
  };

  // Calculations for Reports
  const totalIncome = ledger.filter(l => l.type === 'income').reduce((sum, l) => sum + l.amount, 0);
  const totalExpense = ledger.filter(l => l.type === 'expense').reduce((sum, l) => sum + l.amount, 0);

  const todayIncome = ledger.filter(l => l.type === 'income' && l.date === todayStr).reduce((sum, l) => sum + l.amount, 0);
  const todayExpense = ledger.filter(l => l.type === 'expense' && l.date === todayStr).reduce((sum, l) => sum + l.amount, 0);

  const currentMonthPrefix = todayStr.substring(0, 7);
  const monthlyIncome = ledger.filter(l => l.type === 'income' && l.date.startsWith(currentMonthPrefix)).reduce((sum, l) => sum + l.amount, 0);
  const monthlyExpense = ledger.filter(l => l.type === 'expense' && l.date.startsWith(currentMonthPrefix)).reduce((sum, l) => sum + l.amount, 0);

  const currentYearPrefix = todayStr.substring(0, 4);
  const yearlyIncome = ledger.filter(l => l.type === 'income' && l.date.startsWith(currentYearPrefix)).reduce((sum, l) => sum + l.amount, 0);
  const yearlyExpense = ledger.filter(l => l.type === 'expense' && l.date.startsWith(currentYearPrefix)).reduce((sum, l) => sum + l.amount, 0);

  const filteredMenu = menuItems.filter(item => {
    const matchesCategory = categoryFilter === 'all' || item.category === categoryFilter;
    const matchesSearch = item.nameBn.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          item.nameEn.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const adminFilteredMenu = menuItems.filter(item => {
    const matchesCategory = adminFoodCategory === 'all' || item.category === adminFoodCategory;
    const matchesSearch = item.nameBn.toLowerCase().includes(adminFoodSearch.toLowerCase()) || 
                          item.nameEn.toLowerCase().includes(adminFoodSearch.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  // Customer's own orders if logged in
  const customerOrders = currentCustomer 
    ? orders.filter(o => o.phone === currentCustomer.phone)
    : orders;

  return (
    <div className="max-w-[430px] w-full mx-auto min-h-screen bg-[#fffdf9] flex flex-col font-sans text-gray-800 pb-28 shadow-[0_0_60px_rgba(0,0,0,0.55)] relative border-x border-amber-200/70 overflow-x-hidden">
      
      {/* Visual Toast Notification: 'Preparing' -> 'Out for Delivery' */}
      <AnimatePresence>
        {deliveryToast && (
          <motion.div
            initial={{ opacity: 0, y: -40, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -30, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 320, damping: 25 }}
            className="fixed top-12 left-1/2 -translate-x-1/2 z-50 w-[92%] max-w-[400px] bg-gradient-to-r from-emerald-700 via-emerald-600 to-teal-700 text-white rounded-2xl p-3.5 shadow-2xl border-2 border-amber-300/90 flex items-start gap-3"
            role="status"
            aria-live="polite"
          >
            <div className="w-10 h-10 rounded-xl bg-amber-400 text-emerald-950 flex items-center justify-center shrink-0 shadow-md animate-bounce">
              <Truck className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="bg-amber-300 text-emerald-950 text-[10px] font-black px-2 py-0.5 rounded-full">
                  {deliveryToast.id}
                </span>
                <span className="text-xs font-extrabold text-amber-200 truncate">
                  অর্ডার ডেলিভারির পথে! 🛵
                </span>
              </div>
              <p className="text-xs font-semibold text-white mt-1 leading-snug">
                প্রিয় {deliveryToast.customerName}, আপনার খাবার রান্না শেষ হয়ে এখন ডেলিভারির জন্য রওনা হয়েছে (Out for Delivery)!
              </p>
              <div className="mt-2 flex items-center gap-2">
                <button
                  onClick={() => {
                    setPublicTab('tracker');
                    setDeliveryToast(null);
                  }}
                  className="bg-white text-emerald-800 hover:bg-amber-100 text-[11px] font-extrabold px-2.5 py-1 rounded-lg shadow-2xs transition cursor-pointer"
                >
                  লাইভ ট্র্যাক করুন →
                </button>
              </div>
            </div>
            <button
              onClick={() => setDeliveryToast(null)}
              className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-black/10 transition cursor-pointer shrink-0"
              aria-label="Close notification"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top Notification Bar */}
      {showOfferBanner && (
        <div className="bg-gradient-to-r from-red-600 via-amber-500 to-emerald-600 text-white text-[11px] py-1.5 px-3 text-center font-bold flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-1.5 mx-auto truncate">
            <Sparkles className="w-3.5 h-3.5 shrink-0 animate-spin" />
            <span className="truncate">{activeOffer}</span>
          </div>
          <button onClick={() => setShowOfferBanner(false)} className="hover:bg-black/10 p-0.5 rounded shrink-0 ml-1">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Offline Status */}
      {!isOnline && (
        <div className="bg-red-500 text-white text-[11px] py-1 px-3 text-center flex items-center justify-center gap-1.5">
          <AlertCircle className="w-3.5 h-3.5" />
          <span>অফলাইন মোড সক্রিয় (লোকাল ডাটা সংরক্ষিত হচ্ছে)</span>
        </div>
      )}

      {/* Compact Sticky Mobile App Header */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md shadow-xs border-b border-amber-200/80 px-3 py-2.5 space-y-2">
        <div className="flex items-center justify-between gap-2">
          
          {/* Logo & Brand */}
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-red-600 via-amber-500 to-emerald-600 flex items-center justify-center text-white shadow-sm shrink-0">
              <ChefHat className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-black bg-gradient-to-r from-red-700 to-emerald-800 bg-clip-text text-transparent truncate leading-tight">
                সালমা ফুড কর্ণার, গাজীপুর
              </h1>
              <button 
                onClick={() => setShowShopLocationModal(true)}
                className="text-[10px] text-emerald-700 font-bold flex items-center gap-0.5 hover:underline truncate"
              >
                <MapPin className="w-2.5 h-2.5 text-red-600 shrink-0" />
                <span className="truncate">{shopLocation.zoneName || 'চান্দনা চৌরাস্তা, গাজীপুর'} • {shopLocation.freeRadiusKm} কি.মি. ফ্রি</span>
              </button>
            </div>
          </div>

          {/* Right Area: Sound + Login/Cart */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Audio Toggle */}
            <button 
              onClick={() => {
                const next = !soundOn;
                setSoundOn(next);
                setSoundEnabled(next);
                if (next) playAddToCartSound();
              }}
              className={`p-1.5 rounded-full border transition flex items-center justify-center cursor-pointer ${
                soundOn 
                  ? 'bg-amber-50 border-amber-300 text-amber-700' 
                  : 'bg-gray-100 border-gray-300 text-gray-400'
              }`}
              title={soundOn ? 'সাউন্ড সক্রিয়' : 'সাউন্ড বন্ধ'}
            >
              {soundOn ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
            </button>

            {appMode === 'public' && (
              <>
                {currentCustomer ? (
                  <button
                    onClick={() => setPublicTab('profile')}
                    className="flex items-center gap-1 bg-emerald-50 border border-emerald-300 px-2 py-1 rounded-full text-[10px] font-bold text-emerald-900 cursor-pointer"
                  >
                    <span className="w-4 h-4 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[9px] font-black">
                      {currentCustomer.name.charAt(0)}
                    </span>
                    <span>{currentCustomer.loyaltyPoints}★</span>
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      setCustomerPhoneInput('');
                      setCustomerNameInput('');
                      setCustomerAddressInput('');
                      setCustomerIsNew(false);
                      setCustomerModalOpen(true);
                    }}
                    className="bg-amber-500 hover:bg-amber-600 text-white px-2.5 py-1 rounded-full text-[10px] font-bold flex items-center gap-1 shadow-2xs transition cursor-pointer"
                  >
                    <Smartphone className="w-3 h-3" />
                    <span>লগইন</span>
                  </button>
                )}
              </>
            )}

            {appMode === 'admin' && isAdminAuthenticated && (
              <button 
                onClick={() => {
                  setIsAdminAuthenticated(false);
                  setAppMode('public');
                }}
                className="bg-red-50 border border-red-200 text-red-700 p-1.5 rounded-full text-xs font-bold"
                title="লগআউট"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ================= PASSWORDLESS CUSTOMER AUTH MODAL (Mobile Bottom Sheet) ================= */}
      {customerModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-t-3xl p-5 max-w-[430px] w-full shadow-2xl space-y-4 border-t border-amber-200 animate-in slide-in-from-bottom">
            <div className="w-12 h-1.5 bg-gray-300 rounded-full mx-auto mb-1" />
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 bg-amber-100 text-amber-700 rounded-2xl flex items-center justify-center shadow-inner">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900">শুধুমাত্র মোবাইল নম্বর দিয়ে লগইন</h3>
                  <p className="text-[11px] text-gray-500">একবার রেজিস্ট্রেশন করলে পরবর্তীতে শুধু মোবাইল নম্বর দিয়েই লগইন হবে</p>
                </div>
              </div>
              <button onClick={() => setCustomerModalOpen(false)} className="text-gray-400 hover:text-gray-600 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handlePasswordlessLoginOrRegister} className="space-y-3 pt-1">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">আপনার ১১ ডিজিট মোবাইল নম্বর (+88 ছাড়া)</label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
                  <input 
                    type="tel"
                    maxLength={11}
                    placeholder="01712345678"
                    value={customerPhoneInput}
                    onChange={(e) => {
                      const cleanVal = normalizeBdPhone(e.target.value);
                      setCustomerPhoneInput(cleanVal);
                      handleCheckPhone(cleanVal);
                    }}
                    className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-xl text-sm font-mono font-semibold focus:outline-none focus:ring-2 focus:ring-amber-500"
                    required
                  />
                </div>
                {normalizeBdPhone(customerPhoneInput).length >= 10 && !customerIsNew && customerNameInput && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-2.5 mt-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <div>
                        <p className="text-xs text-emerald-800 font-bold">রেজিস্টার্ড গ্রাহক: {customerNameInput}</p>
                        <p className="text-[10px] text-emerald-600">📍 {customerAddressInput}</p>
                      </div>
                    </div>
                    <span className="bg-emerald-600 text-white text-[9px] font-bold px-2 py-0.5 rounded-full">ওয়ান-ক্লিক লগইন</span>
                  </div>
                )}
                {normalizeBdPhone(customerPhoneInput).length >= 10 && customerIsNew && (
                  <p className="text-xs text-amber-700 font-bold mt-1.5 flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5 shrink-0" />
                    <span>প্রথমবার রেজিস্ট্রেশন! নিচের নাম ও ঠিকানা দিন (পরবর্তীতে শুধু নম্বর দিয়েই লগইন হবে)</span>
                  </p>
                )}
              </div>

              {customerIsNew && (
                <div className="space-y-2.5 bg-amber-50 p-3.5 rounded-2xl border border-amber-200">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">আপনার নাম (শুধুমাত্র ১ম বারের জন্য)</label>
                    <input 
                      type="text"
                      placeholder="যেমন: সায়মা বেগম"
                      value={customerNameInput}
                      onChange={(e) => setCustomerNameInput(e.target.value)}
                      className="w-full p-2.5 border border-amber-300 rounded-xl text-xs bg-white focus:outline-none"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">ডেলিভারি ঠিকানা (শুধুমাত্র ১ম বারের জন্য)</label>
                    <textarea 
                      placeholder="বাড়ি নং, রোড নং, চান্দনা চৌরাস্তা / জয়দেবপুর, গাজীপুর"
                      value={customerAddressInput}
                      onChange={(e) => setCustomerAddressInput(e.target.value)}
                      rows={2}
                      className="w-full p-2.5 border border-amber-300 rounded-xl text-xs bg-white focus:outline-none"
                      required
                    />
                  </div>
                </div>
              )}

              <button 
                type="submit"
                className="w-full bg-gradient-to-r from-red-600 to-emerald-600 text-white font-bold py-3 rounded-xl text-sm shadow-md transition active:scale-95 cursor-pointer"
              >
                {customerIsNew ? '১ম বার রেজিস্ট্রেশন ও লগইন করুন' : 'শুধু মোবাইল নম্বর দিয়ে লগইন করুন'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ================= ADMIN LOGIN MODAL (Mobile Bottom Sheet) ================= */}
      {adminLoginModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-t-3xl p-6 max-w-[430px] w-full shadow-2xl space-y-4 border-t border-red-200">
            <div className="w-12 h-1.5 bg-gray-300 rounded-full mx-auto mb-1" />
            <div className="w-14 h-14 bg-red-100 text-red-600 rounded-2xl flex items-center justify-center mx-auto shadow-inner">
              <ShieldAlert className="w-7 h-7" />
            </div>
            <h3 className="text-base font-bold text-gray-900 text-center">এডমিন প্যানেল সিকিউরিটি</h3>
            <p className="text-xs text-gray-500 text-center">এডমিন পিন দিন (ডিফল্ট পাসওয়ার্ড: 1234)</p>
            <input 
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={adminPinInput}
              onChange={(e) => setAdminPinInput(e.target.value)}
              placeholder="••••"
              className="w-full text-center tracking-widest text-lg border border-gray-300 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-red-500"
            />
            <div className="flex gap-2 pt-1">
              <button onClick={() => setAdminLoginModal(false)} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-2.5 rounded-xl text-xs font-bold">বাতিল</button>
              <button 
                onClick={() => {
                  if (adminPinInput === '1234' || adminPinInput === 'salma123') {
                    setIsAdminAuthenticated(true);
                    setAppMode('admin');
                    setAdminLoginModal(false);
                    setAdminPinInput('');
                  } else {
                    alert('ভুল পিন কোড! সঠিক পিন: 1234');
                  }
                }}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2.5 rounded-xl text-xs font-bold shadow"
              >
                লগইন
              </button>
            </div>

            <div className="pt-2 border-t text-center">
              <a 
                href="/admin.html" 
                className="text-xs font-bold text-emerald-700 hover:text-emerald-900 flex items-center justify-center gap-1.5 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 transition"
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span>📱 স্বতন্ত্র এডমিন মোবাইল অ্যাপ (admin.html) খুলুন</span>
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Main Mobile Screen Body */}
      <main className="flex-1 w-full px-3.5 py-3.5">
        
        {/* ========================================================= */}
        {/*                      PUBLIC PORTAL                        */}
        {/* ========================================================= */}
        {appMode === 'public' && (
          <div className="space-y-4">
            

            {/* TAB 1: MENU & ORDER */}
            {publicTab === 'menu' && (
              <div className="space-y-4">
                {/* Compact Mobile Hero Card (Gazipur SEO Optimized) */}
                <div className="bg-gradient-to-br from-red-700 via-amber-600 to-emerald-700 rounded-2xl p-4 text-white shadow-md relative overflow-hidden space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="bg-white/20 backdrop-blur text-[10px] uppercase px-2.5 py-0.5 rounded-full font-bold">
                      ⭐ গাজীপুরের সেরা রেস্টুরেন্ট
                    </span>
                    <button 
                      onClick={() => setShowShopLocationModal(true)}
                      className="bg-emerald-500 text-white text-[10px] font-black px-2.5 py-0.5 rounded-full flex items-center gap-1 shadow-2xs cursor-pointer"
                    >
                      <Truck className="w-3 h-3" />
                      <span>গাজীপুরে {shopLocation.freeRadiusKm} কি.মি. ফ্রি ডেলিভারি</span>
                    </button>
                  </div>

                  <h2 className="text-lg font-black leading-snug">
                    গাজীপুরে খাঁটি স্বাদে গরম গরম বিরিয়ানি, কাচ্চি ও বাংলা খাবার অর্ডার করুন মুহূর্তেই
                  </h2>
                  <p className="text-[11px] text-amber-100 leading-relaxed">
                    📍 চান্দনা চৌরাস্তা, জয়দেবপুর, শিববাড়ি, ভোগড়া বাইপাস, ডুয়েট (DUET), বোর্ড বাজার, টঙ্গী ও কোনাবাড়ী এলাকায় দ্রুততম হোম ডেলিভারি।
                  </p>
                  
                  {/* Mobile Search Input */}
                  <div className="relative">
                    <Search className="absolute left-3.5 top-2.5 w-4 h-4 text-gray-400" />
                    <input 
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="গাজীপুর স্পেশাল কাচ্চি, তেহারি, ভাত, কারি খুঁজুন..."
                      className="w-full bg-white text-gray-800 placeholder-gray-400 pl-9 pr-3 py-2 rounded-xl shadow-sm focus:outline-none text-xs font-medium"
                    />
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-amber-100 pt-0.5">
                    <span className="flex items-center gap-1 font-semibold">
                      <ShieldCheck className="w-3.5 h-3.5 text-amber-300" />
                      <span>৫০% অগ্রীম পেমেন্ট পলিসি</span>
                    </span>
                    <button 
                      onClick={() => setShowShopLocationModal(true)}
                      className="underline font-bold text-white cursor-pointer"
                    >
                      গাজীপুর ফ্রি ডেলিভারি ম্যাপ দেখুন ›
                    </button>
                  </div>
                </div>

                {/* Horizontal Touch Category Pills */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                  <button
                    onClick={() => setCategoryFilter('all')}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition shadow-2xs cursor-pointer ${
                      categoryFilter === 'all' 
                        ? 'bg-red-600 text-white shadow-sm' 
                        : 'bg-white text-gray-700 border border-amber-200/80'
                    }`}
                  >
                    সব খাবার
                  </button>
                  {menuCategories.map(cat => (
                    <button
                      key={cat.id}
                      onClick={() => setCategoryFilter(cat.id)}
                      className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition shadow-2xs cursor-pointer flex items-center gap-1 ${
                        categoryFilter === cat.id 
                          ? 'bg-red-600 text-white shadow-sm' 
                          : 'bg-white text-gray-700 border border-amber-200/80'
                      }`}
                    >
                      {cat.icon && <span>{cat.icon}</span>}
                      <span>{cat.nameBn}</span>
                    </button>
                  ))}
                </div>

                {/* Mobile App Food List Cards (Image on Top, Name & Info Below) */}
                {filteredMenu.length === 0 ? (
                  <div className="bg-white rounded-2xl border border-dashed border-amber-300 p-8 text-center space-y-2.5 shadow-xs">
                    <div className="w-14 h-14 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mx-auto shadow-inner">
                      <Utensils className="w-7 h-7" />
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900 text-base">মেনুতে কোনো খাবার নেই</h3>
                      <p className="text-xs text-gray-500 max-w-xs mx-auto mt-1">
                        বর্তমানে কোনো খাবার তালিকাভুক্ত নেই। শীঘ্রই সুস্বাদু খাবারের নতুন তালিকা যুক্ত করা হবে।
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4">
                    {filteredMenu.map(item => {
                      const inCartItem = cart.find(c => c.id === item.id);
                      const qty = getCardQuantity(item.id);
                      return (
                        <div 
                          key={item.id} 
                          className={`bg-white rounded-2xl p-3.5 shadow-xs hover:shadow-md transition border flex flex-col gap-3 ${
                            inCartItem ? 'border-emerald-400 bg-emerald-50/10' : 'border-amber-100'
                          }`}
                        >
                          {/* Top Food Image */}
                          <div className="relative w-full h-44 rounded-xl overflow-hidden bg-amber-50">
                            <img 
                              src={item.image} 
                              alt={item.nameBn} 
                              className="w-full h-full object-cover" 
                            />
                            <div className="absolute top-2.5 left-2.5 bg-black/75 backdrop-blur-xs text-white px-2 py-0.5 rounded-lg text-[11px] font-bold flex items-center gap-1 shadow-xs">
                              <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                              <span>{item.rating}</span>
                            </div>
                            {inCartItem && (
                              <span className="absolute top-2.5 right-2.5 bg-emerald-600 text-white text-[10px] font-black px-2.5 py-0.5 rounded-lg shadow-xs">
                                কার্টে {inCartItem.quantity}টি
                              </span>
                            )}
                            {/* Bundle / Combo Badge */}
                            {(item.isBundle || item.category === 'combo') && (
                              <span className="absolute top-2.5 right-2.5 bg-gradient-to-r from-red-600 to-amber-600 text-white text-[10px] font-black px-2 py-0.5 rounded-lg shadow-xs flex items-center gap-1">
                                <span>🎁 কম্বো বান্ডেল</span>
                              </span>
                            )}
                            {item.originalPrice && item.originalPrice > item.price && (
                              <span className="absolute bottom-2.5 left-2.5 bg-red-600 text-white text-[10px] font-black px-2 py-0.5 rounded-md shadow-xs">
                                ৳{item.originalPrice - item.price} ছাড়
                              </span>
                            )}
                          </div>

                          {/* Bottom Food Name, Description & Action Controls */}
                          <div className="flex flex-col justify-between gap-2">
                            <div>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <h3 className="font-bold text-base text-gray-900 leading-snug">{item.nameBn}</h3>
                                {(item.isBundle || item.category === 'combo') && (
                                  <span className="bg-amber-100 text-amber-900 text-[10px] font-black px-2 py-0.2 rounded-md">
                                    কম্বো অফার
                                  </span>
                                )}
                              </div>
                              
                              {/* Bundle Contents Box */}
                              {item.bundleItems && item.bundleItems.length > 0 && (
                                <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200/90 rounded-xl p-2 my-1.5 space-y-1">
                                  <div className="flex items-center justify-between text-[11px] font-bold text-amber-900">
                                    <span>📦 প্যাকেজে রয়েছে ({item.bundleItems.length}টি আইটেম):</span>
                                    {item.bundleSavings && (
                                      <span className="bg-emerald-600 text-white text-[9px] px-1.5 py-0.2 rounded font-black">
                                        ৳{item.bundleSavings} সাশ্রয়
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                                    {item.bundleItems.map((bItem, bIdx) => (
                                      <span key={bIdx} className="bg-white/90 border border-amber-300 text-gray-800 text-[10px] font-semibold px-2 py-0.5 rounded-md flex items-center gap-1">
                                        <span className="text-emerald-600 font-black">✓</span>
                                        <span>{bItem}</span>
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}

                              <p className="text-xs text-gray-500 line-clamp-2 mt-1 leading-relaxed">
                                {item.descriptionBn}
                              </p>
                            </div>

                            <div className="flex items-center justify-between gap-2 pt-2.5 mt-1 border-t border-gray-100">
                              <div className="flex items-baseline gap-1.5">
                                <span className="text-base font-black text-red-600">৳{item.price}</span>
                                {item.originalPrice && (
                                  <span className="text-xs text-gray-400 line-through">৳{item.originalPrice}</span>
                                )}
                              </div>

                              <div className="flex items-center gap-2">
                                {/* Direct - 1 + Quantity Stepper Button */}
                                <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-300 text-gray-900 rounded-full px-2.5 py-1 shadow-2xs">
                                  <button 
                                    type="button"
                                    onClick={() => handleCardStepper(item, -1)}
                                    className="p-0.5 hover:bg-amber-200/60 active:scale-90 rounded-full text-red-600 cursor-pointer"
                                  >
                                    <Minus className="w-3.5 h-3.5" />
                                  </button>
                                  <span className="text-xs font-black min-w-[18px] text-center select-none">{qty}</span>
                                  <button 
                                    type="button"
                                    onClick={() => handleCardStepper(item, 1)}
                                    className="p-0.5 hover:bg-amber-200/60 active:scale-90 rounded-full text-emerald-700 cursor-pointer"
                                  >
                                    <Plus className="w-3.5 h-3.5" />
                                  </button>
                                </div>

                                {/* Direct + কার্টে যোগ Button */}
                                <button
                                  type="button"
                                  onClick={() => addToCart(item, qty)}
                                  className="bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white px-3.5 py-1.5 rounded-full text-xs font-bold flex items-center gap-1 shadow-xs transition cursor-pointer shrink-0"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                  <span>কার্টে যোগ</span>
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Local Gazipur SEO & Delivery Coverage Section */}
                <section aria-label="গাজীপুর ফুড ডেলিভারি ও রেস্টুরেন্ট তথ্য" className="bg-white rounded-2xl border border-amber-200 p-4 space-y-2 shadow-2xs text-xs">
                  <div className="flex items-center gap-1.5 font-extrabold text-emerald-900 text-sm">
                    <MapPin className="w-4 h-4 text-red-600 shrink-0" />
                    <h2>সালমা ফুড কর্ণার গাজীপুর — অনলাইন খাবার অর্ডার ও হোম ডেলিভারি</h2>
                  </div>
                  <p className="text-[11px] text-gray-600 leading-relaxed">
                    গাজীপুর সিটি কর্পোরেশন ও আশেপাশের এলাকার খাদ্যপ্রেমীদের জন্য <strong>সালমা ফুড কর্ণার (Salma Food Corner Gazipur)</strong> নিয়ে এসেছে ঘরোয়া স্বাদের ভাত, গরুর কালা ভুনা, খাসির কাচ্চি বিরিয়ানি, চিকেন দম বিরিয়ানি ও ফাস্ট ফুড। আমাদের প্রধান শাখা <strong>চান্দনা চৌরাস্তা (জয়দেবপুর রোড মোড়), গাজীপুর সদর</strong> থেকে ১ কিলোমিটারের মধ্যে সম্পূর্ণ ফ্রি হোম ডেলিভারি দেওয়া হয়।
                  </p>
                  <div className="flex flex-wrap gap-1 pt-1">
                    {[
                      'চান্দনা চৌরাস্তা, গাজীপুর',
                      'জয়দেবপুর ও শিববাড়ি মোড়',
                      'ভোগড়া বাইপাস, গাজীপুর',
                      'ডুয়েট (DUET) ও শিমুলতলী',
                      'বোর্ড বাজার ও জাতীয় বিশ্ববিদ্যালয়',
                      'টঙ্গী কলেজ গেট ও স্টেশন রোড',
                      'কোনাবাড়ী ও কাশিমপুর'
                    ].map(zone => (
                      <span key={zone} className="bg-amber-50 border border-amber-200 text-amber-900 px-2 py-0.5 rounded-lg text-[10px] font-bold">
                        📍 {zone}
                      </span>
                    ))}
                  </div>
                </section>
              </div>
            )}

            {/* TAB 2: DELIVERY TRACKER & MY ORDERS */}
            {publicTab === 'tracker' && (
              <div className="max-w-3xl mx-auto space-y-6">
                <div className="bg-white rounded-2xl p-6 shadow-md border border-amber-200">
                  <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                      <Truck className="w-6 h-6 text-amber-600" />
                      <span>{currentCustomer ? `${currentCustomer.name} এর অর্ডার ট্র্যাকিং` : 'লাইভ ডেলিভারি ট্র্যাকিং'}</span>
                    </h2>
                    {currentCustomer && (
                      <span className="text-xs text-gray-500 font-medium">
                        মোট অর্ডার: {customerOrders.length} টি
                      </span>
                    )}
                  </div>

                  {customerOrders.length === 0 ? (
                    <div className="text-center py-12 text-gray-400">
                      <ShoppingBag className="w-12 h-12 mx-auto mb-2 opacity-30" />
                      <p>কোনো অর্ডার পাওয়া যায়নি। মেনু থেকে খাবার অর্ডার করুন!</p>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {customerOrders.map(order => (
                        <div key={order.id} className="border border-amber-200 rounded-xl p-5 bg-amber-50/40 space-y-4">
                          <div className="flex justify-between items-center border-b border-amber-200 pb-3">
                            <div>
                              <span className="bg-red-100 text-red-700 font-bold text-xs px-2.5 py-1 rounded-md">{order.id}</span>
                              <h3 className="font-bold text-gray-800 mt-1">{order.customerName} ({order.phone})</h3>
                              <p className="text-xs text-gray-500">{order.address}</p>
                              {order.isFreeDeliveryWithin1km && (
                                <div className="mt-1 flex items-center gap-1">
                                  <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1 border border-emerald-300">
                                    <Truck className="w-3 h-3 text-emerald-600" />
                                    <span>১ কি.মি. ফ্রি ডেলিভারি জোন ({order.deliveryDistanceKm ? `${order.deliveryDistanceKm} কি.মি.` : 'লোকাল'} • ডেলিভারি ফি: ৳০)</span>
                                  </span>
                                </div>
                              )}
                            </div>
                            <div className="text-right space-y-0.5">
                              <span className="text-base sm:text-lg font-extrabold text-gray-900">৳ {order.totalAmount}</span>
                              <div className="text-[11px] font-bold text-emerald-700">
                                অগ্রীম পরিশোধ: ৳ {order.advancePaid} ({order.advancePaymentMethod || 'bKash'}) ✓
                              </div>
                              {order.dueAmount > 0 ? (
                                <div className="text-[11px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded border border-red-200">
                                  ডেলিভারিতে প্রদেয়: ৳ {order.dueAmount}
                                </div>
                              ) : (
                                <div className="text-[10px] text-emerald-600 font-semibold">
                                  ✓ সম্পূর্ণ পরিশোধিত
                                </div>
                              )}
                              <p className="text-[10px] text-gray-400">তারিখ: <span className="font-mono">{formatDateDMY(order.date)}</span> • {order.createdAt}</p>
                            </div>
                          </div>

                          {/* Read-Only Progress Steps for Customer (Cannot be clicked/modified by user) */}
                          <div className="space-y-3 pt-1">
                            <div className="grid grid-cols-4 gap-2 text-center text-xs font-semibold py-2 select-none">
                              {[
                                { key: 'Placed', label: 'গৃহীত' },
                                { key: 'Preparing', label: 'রান্না হচ্ছে' },
                                { key: 'Out for Delivery', label: 'ডেলিভারিতে' },
                                { key: 'Delivered', label: 'সম্পন্ন' }
                              ].map((st, idx) => {
                                const stepsOrder = ['Placed', 'Preparing', 'Out for Delivery', 'Delivered'];
                                const currentIndex = stepsOrder.indexOf(order.status);
                                const isCompleted = idx <= currentIndex;
                                const isCurrent = order.status === st.key;

                                return (
                                  <div
                                    key={st.key}
                                    className="flex flex-col items-center gap-1 cursor-default"
                                  >
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${isCompleted ? 'bg-emerald-600 text-white' : 'bg-gray-200 text-gray-500'} ${isCurrent ? 'ring-4 ring-emerald-200 animate-pulse' : ''}`}>
                                      {idx + 1}
                                    </div>
                                    <span className={`text-[10px] sm:text-xs ${isCurrent ? 'text-emerald-700 font-bold' : 'text-gray-600'}`}>{st.label}</span>
                                  </div>
                                );
                              })}
                            </div>

                            {/* Status Badge Bar & Customer Order Cancel Action */}
                            <div className="bg-white/90 border border-amber-200 rounded-xl p-2.5 flex flex-wrap items-center justify-between gap-2">
                              <div className="flex flex-wrap items-center gap-1.5 select-none">
                                <span className="text-xs font-bold text-gray-700">বর্তমান স্ট্যাটাস:</span>
                                {order.status === 'Cancelled' ? (
                                  <span className="text-[11px] px-3 py-1 rounded-lg font-bold bg-red-600 text-white shadow-xs">
                                    ✗ অর্ডার বাতিলকৃত (Cancelled)
                                  </span>
                                ) : (
                                  (['Placed', 'Preparing', 'Out for Delivery', 'Delivered'] as const).map(st => {
                                    const isActive = order.status === st;
                                    return (
                                      <span
                                        key={st}
                                        className={`text-[11px] px-2.5 py-1 rounded-lg font-bold ${
                                          isActive
                                            ? 'bg-emerald-600 text-white shadow-xs'
                                            : 'bg-gray-100 text-gray-400'
                                        }`}
                                      >
                                        {st === 'Placed' ? 'গৃহীত' : st === 'Preparing' ? 'রান্না হচ্ছে' : st === 'Out for Delivery' ? 'ডেলিভারিতে' : 'সম্পন্ন'}
                                      </span>
                                    );
                                  })
                                )}
                              </div>

                              {order.status !== 'Delivered' && order.status !== 'Cancelled' && (
                                <button
                                  type="button"
                                  onClick={() => handleCancelOrder(order)}
                                  className="bg-red-50 hover:bg-red-600 hover:text-white text-red-600 border border-red-200 text-[11px] font-bold px-3 py-1 rounded-lg flex items-center gap-1 transition cursor-pointer shadow-2xs"
                                >
                                  <X className="w-3.5 h-3.5" />
                                  <span>অর্ডার ক্যান্সেল করুন</span>
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 3: CUSTOMER PROFILE & LOYALTY (PASSWORDLESS) */}
            {publicTab === 'profile' && (
              <div className="max-w-2xl mx-auto space-y-6">
                {currentCustomer ? (() => {
                  const custDueBal = getCustomerDueOrAdvanceBalance(currentCustomer.phone, currentCustomer.name);
                  return (
                  <div className="bg-white rounded-2xl p-6 sm:p-8 shadow-md border border-amber-200 space-y-6">
                    <div className="flex justify-between items-center border-b pb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-600 to-amber-500 text-white flex items-center justify-center font-extrabold text-xl shadow shrink-0">
                          {currentCustomer.name.charAt(0)}
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h2 className="text-xl font-bold text-gray-900">{currentCustomer.name}</h2>
                            {custDueBal.remainingDue > 0 ? (
                              <span className="bg-red-100 text-red-700 border border-red-300 text-xs font-black px-2.5 py-0.5 rounded-full">
                                অবশিষ্ট বাকি: ৳ {custDueBal.remainingDue}
                              </span>
                            ) : custDueBal.advanceDeposit > 0 ? (
                              <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 text-xs font-black px-2.5 py-0.5 rounded-full">
                                অগ্রীম জমা: ৳ {custDueBal.advanceDeposit}
                              </span>
                            ) : (
                              <span className="bg-gray-100 text-gray-700 border border-gray-300 text-xs font-bold px-2.5 py-0.5 rounded-full">
                                অবশিষ্ট বাকি: ৳ ০
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 font-mono mt-0.5">📱 {currentCustomer.phone} (পাসওয়ার্ড ছাড়া সুরক্ষিত প্রোফাইল)</p>
                        </div>
                      </div>
                      <button 
                        onClick={handleCustomerLogout}
                        className="text-xs font-bold text-red-600 hover:bg-red-50 p-2 rounded-xl flex items-center gap-1"
                      >
                        <LogOut className="w-4 h-4" />
                        <span>লগআউট</span>
                      </button>
                    </div>

                    {/* Loyalty Points Card */}
                    <div className="bg-gradient-to-r from-amber-500 via-orange-500 to-red-500 text-white p-6 rounded-2xl shadow-lg flex justify-between items-center">
                      <div>
                        <p className="text-xs uppercase font-semibold opacity-90">আপনার মোট লয়্যালটি পয়েন্ট</p>
                        <p className="text-4xl font-extrabold mt-1">{currentCustomer.loyaltyPoints} Pts</p>
                        <p className="text-[11px] text-amber-100 mt-2">১০০ পয়েন্ট = ৫০ টাকা ছাড় হিসেবে রিডিম করা যায়!</p>
                      </div>
                      <Award className="w-16 h-16 opacity-30" />
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-amber-50 p-3.5 rounded-xl border border-amber-200 text-center">
                        <p className="text-[11px] text-gray-500">মোট অর্ডার</p>
                        <p className="text-lg font-extrabold text-gray-900">{currentCustomer.totalOrders} টি</p>
                      </div>
                      <div className="bg-emerald-50 p-3.5 rounded-xl border border-emerald-200 text-center">
                        <p className="text-[11px] text-gray-500">মোট ব্যয়</p>
                        <p className="text-lg font-extrabold text-emerald-700">৳ {currentCustomer.totalSpent}</p>
                      </div>
                      {custDueBal.advanceDeposit > 0 ? (
                        <div className="bg-emerald-50 p-3.5 rounded-xl border border-emerald-300 text-center">
                          <p className="text-[11px] text-emerald-800 font-bold">অগ্রীম জমা</p>
                          <p className="text-lg font-extrabold text-emerald-700">৳ {custDueBal.advanceDeposit}</p>
                        </div>
                      ) : (
                        <div className="bg-red-50 p-3.5 rounded-xl border border-red-200 text-center">
                          <p className="text-[11px] text-red-700 font-bold">অবশিষ্ট বাকি</p>
                          <p className="text-lg font-extrabold text-red-600">৳ {custDueBal.remainingDue}</p>
                        </div>
                      )}
                    </div>

                    {/* Edit Profile Form (No Password Needed!) */}
                    <form onSubmit={(e) => {
                      e.preventDefault();
                      const form = e.currentTarget;
                      const name = (form.elements.namedItem('custName') as HTMLInputElement).value;
                      const address = (form.elements.namedItem('custAddress') as HTMLTextAreaElement).value;
                      handleUpdateCustomerProfile(name, address);
                    }} className="space-y-4 pt-2">
                      <h4 className="font-bold text-sm text-gray-800 flex items-center gap-1.5">
                        <Edit3 className="w-4 h-4 text-emerald-600" />
                        <span>নাম ও ঠিকানা আপডেট করুন (পাসওয়ার্ড ছাড়াই)</span>
                      </h4>
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">আপনার নাম</label>
                        <input 
                          name="custName"
                          defaultValue={currentCustomer.name}
                          className="w-full border rounded-xl p-2.5 text-xs font-semibold"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">ডেলিভারি ঠিকানা</label>
                        <textarea 
                          name="custAddress"
                          defaultValue={currentCustomer.address}
                          rows={2}
                          className="w-full border rounded-xl p-2.5 text-xs font-semibold"
                          required
                        />
                      </div>
                      <button 
                        type="submit"
                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 rounded-xl text-xs shadow cursor-pointer"
                      >
                        প্রোফাইল সংরক্ষণ করুন
                      </button>
                    </form>

                    {/* Customer Ledger & All Transactions Section */}
                    {(() => {
                      const { vouchers, payments } = getCustomerTransactions(currentCustomer.phone, currentCustomer.name);
                      if (vouchers.length === 0 && payments.length === 0) return null;

                      return (
                        <div className="border-t border-gray-100 pt-5 space-y-4">
                          <div className="flex items-center justify-between">
                            <h4 className="font-bold text-sm text-gray-900 flex items-center gap-1.5">
                              <Receipt className="w-4 h-4 text-red-600" />
                              <span>আপনার সকল বাকি ও লেনদেনের ইতিহাস</span>
                            </h4>
                            <span className="text-[10px] font-bold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                              মোট {vouchers.length}টি ভাউচার
                            </span>
                          </div>

                          {/* Vouchers List */}
                          <div className="space-y-2">
                            {vouchers.map(v => (
                              <div key={v.id} className="bg-amber-50/40 border border-amber-200/70 rounded-xl p-3 text-xs space-y-1">
                                <div className="flex justify-between items-center">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-mono font-bold bg-white px-1.5 py-0.5 rounded border border-gray-200 text-[10px]">
                                      {v.voucherNo}
                                    </span>
                                    <span className="text-gray-500 text-[10px] font-mono">{formatDateDMY(v.date)}</span>
                                  </div>
                                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                    v.status === 'paid' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-700'
                                  }`}>
                                    {v.status === 'paid' ? 'পরিশোধিত' : `বাকি: ৳${v.dueAmount}`}
                                  </span>
                                </div>
                                <p className="text-gray-700 text-[11px] pt-0.5">বিবরণ: {v.itemsDescription}</p>
                                <div className="flex justify-between pt-1 border-t border-amber-200/50 text-[10px] text-gray-600 font-semibold">
                                  <span>মোট বিল: ৳{v.totalAmount}</span>
                                  <span className="text-emerald-700">জমা: ৳{v.paidAmount}</span>
                                </div>
                              </div>
                            ))}
                          </div>

                          {/* Payments List */}
                          {payments.length > 0 && (
                            <div className="space-y-2 pt-1">
                              <p className="text-xs font-bold text-emerald-900 flex items-center gap-1">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                <span>আদায় ও জমার ইতিহাস ({payments.length}টি কিস্তি):</span>
                              </p>
                              <div className="bg-emerald-50/50 rounded-xl border border-emerald-100 divide-y divide-emerald-100/70 overflow-hidden text-xs">
                                {payments.map((p: any) => (
                                  <div key={p.id} className="p-2 flex items-center justify-between">
                                    <div>
                                      <span className="font-bold text-emerald-800">৳{p.amount}</span>
                                      <span className="text-[10px] text-gray-500 ml-1.5 font-mono">({p.paymentMethod}) • {formatDateDMY(p.date)}</span>
                                    </div>
                                    <span className="text-[10px] text-gray-500 font-mono">{p.voucherNo}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                  );
                })() : (
                  <div className="bg-white rounded-2xl p-8 shadow-md border border-amber-200 text-center space-y-4">
                    <User className="w-16 h-16 text-amber-500 mx-auto" />
                    <h3 className="text-lg font-bold">লগইন করা নেই</h3>
                    <p className="text-xs text-gray-500 max-w-sm mx-auto">
                      কোনো পাসওয়ার্ড প্রয়োজন নেই! শুধুমাত্র আপনার মোবাইল নম্বর দিয়ে প্রোফাইল খুলুন ও অর্ডার হিস্ট্রি দেখুন।
                    </p>
                    <button 
                      onClick={() => setCustomerModalOpen(true)}
                      className="bg-amber-500 hover:bg-amber-600 text-white font-bold px-6 py-2.5 rounded-xl text-xs shadow"
                    >
                      মোবাইল নম্বর দিয়ে লগইন করুন
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* TAB 4: REVIEWS */}
            {publicTab === 'reviews' && (
              <div className="max-w-3xl mx-auto bg-white rounded-2xl p-6 shadow-md border border-amber-200 space-y-6">
                <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                  <MessageSquare className="w-6 h-6 text-emerald-600" />
                  <span>সম্মানিত গ্রাহকদের রিভিউ</span>
                </h2>
                <div className="space-y-4">
                  {reviews.map(rev => (
                    <div key={rev.id} className="border border-amber-200 rounded-xl p-4 bg-amber-50/30 space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-gray-800 text-sm">{rev.customerName}</span>
                        <span className="text-xs text-gray-400 font-mono">{formatDateDMY(rev.date)}</span>
                      </div>
                      <div className="flex text-amber-500">
                        {[...Array(rev.rating)].map((_, i) => <Star key={i} className="w-3.5 h-3.5 fill-amber-500" />)}
                      </div>
                      <p className="text-sm text-gray-600">{rev.comment}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        )}

        {/* ========================================================= */}
        {/*                      ADMIN PORTAL                         */}
        {/* ========================================================= */}
        {appMode === 'admin' && isAdminAuthenticated && (
          <div className="space-y-6">
            
            <div className="bg-gradient-to-r from-red-700 via-amber-700 to-emerald-800 text-white p-4 rounded-2xl shadow-md flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div className="flex items-center gap-3">
                <ShieldAlert className="w-7 h-7 text-amber-300" />
                <div>
                  <h2 className="text-lg font-bold">সালমা ফুড রেস্টুরেন্ট এডমিন প্যানেল</h2>
                  <p className="text-xs opacity-90">মেনু ব্যবস্থাপনা (খাবার যোগ/এডিট/বিয়োজন), POS লেজার ও আর্থিক রিপোর্ট</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setAdminTab('menu');
                  handleOpenAddFoodModal();
                }}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-4 py-2 rounded-xl flex items-center gap-1.5 shadow transition cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>+ নতুন খাবার যোগ করুন</span>
              </button>
            </div>

            {/* Admin Sub-Navigation */}
            <div className="flex items-center gap-2 overflow-x-auto bg-white p-2 rounded-2xl shadow-sm border border-amber-200 scrollbar-none">
              {[
                { id: 'dashboard', label: 'ড্যাশবোর্ড', icon: TrendingUp },
                { id: 'menu', label: 'মেনু ব্যবস্থাপনা', icon: Utensils },
                { id: 'ledger', label: 'POS লেজার খতিয়ান', icon: BarChart2 },
                { id: 'reports', label: 'আর্থিক রিপোর্টস', icon: FileText },
                { id: 'orders', label: 'অর্ডার তালিকা', icon: Truck },
                { id: 'customers', label: 'গ্রাহক ডাটাবেজ', icon: Users },
                { id: 'marketing', label: 'বাল্ক এসএমএস', icon: Smartphone },
                { id: 'location', label: 'দোকানের অবস্থান', icon: MapPin }
              ].map(tab => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setAdminTab(tab.id as any)}
                    className={`flex items-center gap-2 py-2 px-4 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                      adminTab === tab.id ? 'bg-red-600 text-white shadow' : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {/* ================= ADMIN TAB 1: DASHBOARD OVERVIEW & 2 FUNCTIONAL POS CARDS ================= */}
            {adminTab === 'dashboard' && (
              <div className="space-y-6">
                
                {/* 3 Metric Cards */}
                <div className="grid grid-cols-1 gap-3">
                  <div className="bg-white p-4 rounded-2xl shadow-xs border border-amber-200 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold">
                        <TrendingUp className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">মোট বিক্রয় ও আয় (Total Sales)</p>
                        <p className="text-xl font-extrabold text-gray-900">৳ {totalIncome}</p>
                      </div>
                    </div>
                    <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-xl">আজ: ৳{todayIncome}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white p-4 rounded-2xl shadow-xs border border-amber-200 flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-red-100 text-red-600 flex items-center justify-center font-bold shrink-0">
                        <ShoppingBag className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-[11px] text-gray-500">মোট অর্ডার</p>
                        <p className="text-lg font-extrabold text-gray-900">{orders.length} টি</p>
                      </div>
                    </div>
                    <div className="bg-white p-4 rounded-2xl shadow-xs border border-amber-200 flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center font-bold shrink-0">
                        <DollarSign className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-[11px] text-gray-500">নিট প্রফিট</p>
                        <p className={`text-lg font-extrabold ${totalIncome - totalExpense >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                          ৳ {totalIncome - totalExpense}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* THE 2 FUNCTIONAL POS LEDGER CARDS (Stacked for Mobile) */}
                <div className="grid grid-cols-1 gap-4">
                  
                  {/* Card 1: Daily Income Functional Card */}
                  <div className="bg-gradient-to-br from-emerald-50 to-emerald-100/60 rounded-2xl p-4 shadow-sm border border-emerald-300 space-y-3">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold shadow">
                          <ArrowUpRight className="w-5 h-5" />
                        </div>
                        <div>
                          <h4 className="font-bold text-gray-900 text-sm">দৈনিক আয় হিসাব (Today's Income)</h4>
                          <p className="text-[11px] text-emerald-700 font-semibold font-mono">{formatDateDMY(todayStr)}</p>
                        </div>
                      </div>
                      <span className="text-xl font-extrabold text-emerald-700">৳ {todayIncome}</span>
                    </div>

                    <form onSubmit={handleAddQuickIncome} className="space-y-2.5 bg-white/90 p-3.5 rounded-xl border border-emerald-200">
                      <h5 className="font-bold text-xs text-emerald-900 flex items-center gap-1">
                        <Plus className="w-3.5 h-3.5" />
                        <span>তাত্ক্ষণিক আয় এন্ট্রি করুন</span>
                      </h5>
                      <div className="grid grid-cols-2 gap-2">
                        <select
                          value={quickIncomeInput.category}
                          onChange={(e) => setQuickIncomeInput({ ...quickIncomeInput, category: e.target.value })}
                          className="border border-emerald-300 rounded-lg p-2 text-xs bg-white"
                        >
                          <option value="খাবার বিক্রয় (Food Sales)">খাবার বিক্রয়</option>
                          <option value="ক্যাটারিং সার্ভিস (Catering)">ক্যাটারিং সার্ভিস</option>
                          <option value="হোম ডেলিভারি ফি (Delivery)">হোম ডেলিভারি ফি</option>
                          <option value="অন্যান্য আয় (Other)">অন্যান্য আয়</option>
                        </select>
                        <input 
                          type="number" 
                          placeholder="পরিমাণ (৳)"
                          value={quickIncomeInput.amount}
                          onChange={(e) => setQuickIncomeInput({ ...quickIncomeInput, amount: e.target.value })}
                          className="border border-emerald-300 rounded-lg p-2 text-xs bg-white font-bold"
                          required
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <select
                          value={quickIncomeInput.paymentMethod}
                          onChange={(e) => setQuickIncomeInput({ ...quickIncomeInput, paymentMethod: e.target.value as any })}
                          className="border border-emerald-300 rounded-lg p-2 text-xs bg-white"
                        >
                          <option value="Cash">নগদ ক্যাশ (Cash)</option>
                          <option value="bKash">বিকাশ (bKash)</option>
                          <option value="Nagad">নগদ (Nagad)</option>
                        </select>
                        <input 
                          type="text" 
                          placeholder="নোট (ঐচ্ছিক)"
                          value={quickIncomeInput.note}
                          onChange={(e) => setQuickIncomeInput({ ...quickIncomeInput, note: e.target.value })}
                          className="border border-emerald-300 rounded-lg p-2 text-xs bg-white"
                        />
                      </div>
                      <button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 rounded-lg text-xs shadow transition">
                        + আজকের আয় যুক্ত করুন
                      </button>
                    </form>
                  </div>

                  {/* Card 2: Daily Expense Functional Card */}
                  <div className="bg-gradient-to-br from-red-50 to-red-100/60 rounded-2xl p-4 shadow-sm border border-red-300 space-y-3">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <div className="w-9 h-9 rounded-xl bg-red-600 text-white flex items-center justify-center font-bold shadow">
                          <ArrowDownRight className="w-5 h-5" />
                        </div>
                        <div>
                          <h4 className="font-bold text-gray-900 text-sm">দৈনিক ব্যয় হিসাব (Today's Expense)</h4>
                          <p className="text-[11px] text-red-700 font-semibold font-mono">{formatDateDMY(todayStr)}</p>
                        </div>
                      </div>
                      <span className="text-xl font-extrabold text-red-700">৳ {todayExpense}</span>
                    </div>

                    <form onSubmit={handleAddQuickExpense} className="space-y-2.5 bg-white/90 p-3.5 rounded-xl border border-red-200">
                      <h5 className="font-bold text-xs text-red-900 flex items-center gap-1">
                        <Minus className="w-3.5 h-3.5" />
                        <span>তাত্ক্ষণিক ব্যয় এন্ট্রি করুন</span>
                      </h5>
                      <div className="grid grid-cols-2 gap-2">
                        <select
                          value={quickExpenseInput.category}
                          onChange={(e) => setQuickExpenseInput({ ...quickExpenseInput, category: e.target.value })}
                          className="border border-red-300 rounded-lg p-2 text-xs bg-white"
                        >
                          <option value="কাঁচামাল ও বাজার (Raw Materials)">কাঁচামাল ও বাজার</option>
                          <option value="মাংস ও মাছ ক্রয় (Meat & Fish)">মাংস ও মাছ ক্রয়</option>
                          <option value="গ্যাস ও বিদ্যুৎ বিল (Utilities)">গ্যাস ও বিদ্যুৎ বিল</option>
                          <option value="কর্মচারীর বেতন (Salary)">কর্মচারীর বেতন</option>
                          <option value="প্যাকেজিং খরচ (Packaging)">প্যাকেজিং খরচ</option>
                        </select>
                        <input 
                          type="number" 
                          placeholder="পরিমাণ (৳)"
                          value={quickExpenseInput.amount}
                          onChange={(e) => setQuickExpenseInput({ ...quickExpenseInput, amount: e.target.value })}
                          className="border border-red-300 rounded-lg p-2 text-xs bg-white font-bold"
                          required
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <select
                          value={quickExpenseInput.paymentMethod}
                          onChange={(e) => setQuickExpenseInput({ ...quickExpenseInput, paymentMethod: e.target.value as any })}
                          className="border border-red-300 rounded-lg p-2 text-xs bg-white"
                        >
                          <option value="Cash">নগদ ক্যাশ (Cash)</option>
                          <option value="bKash">বিকাশ (bKash)</option>
                          <option value="Nagad">নগদ (Nagad)</option>
                        </select>
                        <input 
                          type="text" 
                          placeholder="নোট (ঐচ্ছিক)"
                          value={quickExpenseInput.note}
                          onChange={(e) => setQuickExpenseInput({ ...quickExpenseInput, note: e.target.value })}
                          className="border border-red-300 rounded-lg p-2 text-xs bg-white"
                        />
                      </div>
                      <button type="submit" className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2 rounded-lg text-xs shadow transition">
                        - আজকের ব্যয় যুক্ত করুন
                      </button>
                    </form>
                  </div>

                </div>
              </div>
            )}

            {/* ================= ADMIN TAB 2: MENU MANAGEMENT (ADD, EDIT, DELETE) ================= */}
            {adminTab === 'menu' && (
              <div className="space-y-4">
                
                {/* Header with Add & Restore Buttons */}
                <div className="bg-white rounded-2xl p-4 shadow-xs border border-amber-200 space-y-3">
                  <div>
                    <h3 className="font-bold text-base text-gray-900 flex items-center gap-2">
                      <Utensils className="w-5 h-5 text-red-600" />
                      <span>খাবারের মেনু ব্যবস্থাপনা ({menuItems.length} টি)</span>
                    </h3>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      মেনুতে নতুন খাবার সংযোজন, তথ্য এডিট এবং বিয়োজন করুন।
                    </p>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={() => setIsCategoryModalOpen(true)}
                      className="bg-amber-600 hover:bg-amber-700 text-white py-2 px-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1 transition cursor-pointer"
                      title="ক্যাটাগরি ম্যানেজমেন্ট"
                    >
                      <Settings className="w-3.5 h-3.5 text-amber-200" />
                      <span>ক্যাটাগরি</span>
                    </button>
                    <button
                      onClick={handleResetMenuToDefault}
                      className="bg-gray-100 hover:bg-gray-200 text-gray-700 py-2 px-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1 transition cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5 text-gray-600" />
                      <span>রিস্টোর</span>
                    </button>
                    <button
                      onClick={handleOpenAddFoodModal}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white py-2 px-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1 shadow-xs transition cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>+ নতুন খাবার</span>
                    </button>
                  </div>
                </div>

                {/* Filter and Search Bar */}
                <div className="bg-white p-3.5 rounded-2xl shadow-xs border border-amber-200 space-y-2.5">
                  <div className="relative">
                    <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                    <input 
                      type="text"
                      placeholder="খাবারের নাম দিয়ে খুঁজুন..."
                      value={adminFoodSearch}
                      onChange={(e) => setAdminFoodSearch(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 border rounded-xl text-xs bg-amber-50/30 focus:outline-none"
                    />
                  </div>
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                    <button
                      onClick={() => setAdminFoodCategory('all')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                        adminFoodCategory === 'all' 
                          ? 'bg-red-600 text-white shadow-xs' 
                          : 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      সব ({menuItems.length})
                    </button>
                    {menuCategories.map(cat => {
                      const count = menuItems.filter(item => item.category === cat.id).length;
                      return (
                        <button
                          key={cat.id}
                          onClick={() => setAdminFoodCategory(cat.id)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap cursor-pointer flex items-center gap-1 ${
                            adminFoodCategory === cat.id 
                              ? 'bg-red-600 text-white shadow-xs' 
                              : 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {cat.icon && <span>{cat.icon}</span>}
                          <span>{cat.nameBn}</span>
                          <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
                            adminFoodCategory === cat.id ? 'bg-white/25 text-white' : 'bg-gray-200 text-gray-600'
                          }`}>
                            {count}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Food Cards Mobile List */}
                <div className="grid grid-cols-1 gap-3">
                  {adminFilteredMenu.map(item => (
                    <div 
                      key={item.id} 
                      className="bg-white rounded-2xl p-3 shadow-xs border border-amber-200 flex gap-3 items-center"
                    >
                      <div className="relative w-20 h-20 rounded-xl overflow-hidden bg-amber-50 shrink-0">
                        <img src={item.image} alt={item.nameBn} className="w-full h-full object-cover" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start gap-1">
                          <h4 className="font-bold text-sm text-gray-900 truncate">{item.nameBn}</h4>
                          <span className="text-sm font-extrabold text-red-600 shrink-0">৳{item.price}</span>
                        </div>
                        <p className="text-[11px] text-gray-500 truncate">{item.nameEn}</p>
                        <div className="flex items-center justify-between pt-2 mt-1 border-t border-amber-100">
                          <span className="text-[10px] text-gray-500">⭐ {item.rating}</span>
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => handleOpenEditFoodModal(item)}
                              className="bg-amber-100 text-amber-900 px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                            >
                              <Edit3 className="w-3 h-3" />
                              <span>এডিট</span>
                            </button>
                            <button
                              onClick={() => handleDeleteFoodItem(item.id, item.nameBn)}
                              className="bg-red-50 text-red-700 p-1.5 rounded-lg text-xs font-bold cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ================= ADMIN TAB: POS LEDGER MOBILE LIST ================= */}
            {adminTab === 'ledger' && (
              <div className="bg-white rounded-2xl p-4 shadow-xs border border-amber-200 space-y-3">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="font-bold text-sm text-gray-900">হিসাব-নিকাশ লেজার খতিয়ান</h3>
                    <p className="text-[11px] text-gray-500">মোট {ledger.length} টি লেনদেন</p>
                  </div>
                  <button 
                    onClick={() => setAdminTab('dashboard')}
                    className="bg-amber-500 text-white font-bold px-2.5 py-1.5 rounded-xl text-[11px] flex items-center gap-1 shadow-2xs"
                  >
                    <Plus className="w-3 h-3" />
                    <span>নতুন এন্ট্রি</span>
                  </button>
                </div>

                <div className="divide-y divide-gray-100">
                  {ledger.map(entry => (
                    <div key={entry.id} className="py-2.5 flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className={`px-1.5 py-0.2 rounded font-bold text-[9px] ${entry.type === 'income' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                            {entry.type === 'income' ? 'আয়' : 'ব্যয়'}
                          </span>
                          <span className="font-mono text-[10px] font-bold text-gray-600">{entry.voucherNo}</span>
                          <span className="text-[10px] text-gray-400">{entry.paymentMethod}</span>
                        </div>
                        <p className="text-xs font-bold text-gray-800 truncate mt-0.5">{entry.category}</p>
                        <p className="text-[10px] text-gray-500 truncate">{entry.note}</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className={`text-xs font-extrabold ${entry.type === 'income' ? 'text-emerald-700' : 'text-red-600'}`}>
                          {entry.type === 'income' ? '+' : '-'}৳{entry.amount}
                        </span>
                        <button 
                          onClick={() => handleEditLedgerEntryInApp(entry)}
                          className="text-blue-600 hover:text-blue-800 p-1 cursor-pointer"
                          title="এডিট"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button 
                          onClick={() => handleDeleteLedgerEntry(entry.id)}
                          className="text-gray-400 hover:text-red-600 p-1 cursor-pointer"
                          title="ডিলেট"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ================= ADMIN TAB 4: REPORTS ================= */}
            {adminTab === 'reports' && (
              <div className="bg-white rounded-2xl p-4 shadow-xs border border-amber-200 space-y-4">
                <h3 className="font-bold text-sm text-gray-900 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-red-600" />
                  <span>রেস্টুরেন্ট আর্থিক রিপোর্ট (দৈনিক, মাসিক ও বাৎসরিক)</span>
                </h3>

                <div className="grid grid-cols-1 gap-3">
                  {/* Daily Report */}
                  <div className="bg-amber-50/70 border border-amber-200 rounded-2xl p-4 space-y-2">
                    <div className="flex items-center justify-between border-b pb-2">
                      <h4 className="font-bold text-xs text-gray-900 flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-amber-600" />
                        <span>দৈনিক রিপোর্ট (Today)</span>
                      </h4>
                      <span className="text-[10px] text-gray-500 font-mono">{formatDateDMY(todayStr)}</span>
                    </div>
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between">
                        <span className="text-gray-600">মোট আয়:</span>
                        <span className="font-bold text-emerald-700">৳ {todayIncome}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">মোট ব্যয়:</span>
                        <span className="font-bold text-red-600">৳ {todayExpense}</span>
                      </div>
                      <div className="flex justify-between pt-1.5 border-t font-extrabold text-sm">
                        <span>নিট লাভ:</span>
                        <span className={todayIncome - todayExpense >= 0 ? 'text-emerald-700' : 'text-red-600'}>
                          ৳ {todayIncome - todayExpense}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Monthly Report */}
                  <div className="bg-amber-50/70 border border-amber-200 rounded-2xl p-4 space-y-2">
                    <div className="flex items-center justify-between border-b pb-2">
                      <h4 className="font-bold text-xs text-gray-900 flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-emerald-600" />
                        <span>মাসিক রিপোর্ট (This Month)</span>
                      </h4>
                      <span className="text-[10px] text-gray-500 font-mono">{currentMonthPrefix}</span>
                    </div>
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between">
                        <span className="text-gray-600">মোট আয়:</span>
                        <span className="font-bold text-emerald-700">৳ {monthlyIncome}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">মোট ব্যয়:</span>
                        <span className="font-bold text-red-600">৳ {monthlyExpense}</span>
                      </div>
                      <div className="flex justify-between pt-1.5 border-t font-extrabold text-sm">
                        <span>নিট লাভ:</span>
                        <span className={monthlyIncome - monthlyExpense >= 0 ? 'text-emerald-700' : 'text-red-600'}>
                          ৳ {monthlyIncome - monthlyExpense}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Yearly Report */}
                  <div className="bg-amber-50/70 border border-amber-200 rounded-2xl p-4 space-y-2">
                    <div className="flex items-center justify-between border-b pb-2">
                      <h4 className="font-bold text-xs text-gray-900 flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-red-600" />
                        <span>বাৎসরিক রিপোর্ট (This Year)</span>
                      </h4>
                      <span className="text-[10px] text-gray-500 font-mono">{currentYearPrefix}</span>
                    </div>
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between">
                        <span className="text-gray-600">মোট আয়:</span>
                        <span className="font-bold text-emerald-700">৳ {yearlyIncome}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">মোট ব্যয়:</span>
                        <span className="font-bold text-red-600">৳ {yearlyExpense}</span>
                      </div>
                      <div className="flex justify-between pt-1.5 border-t font-extrabold text-sm">
                        <span>নিট লাভ:</span>
                        <span className={yearlyIncome - yearlyExpense >= 0 ? 'text-emerald-700' : 'text-red-600'}>
                          ৳ {yearlyIncome - yearlyExpense}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ================= ADMIN TAB 5: ORDERS ================= */}
            {adminTab === 'orders' && (
              <div className="bg-white rounded-2xl p-4 shadow-xs border border-amber-200 space-y-3">
                <h3 className="font-bold text-sm text-gray-900">সকল গ্রাহক অর্ডার তালিকা ({orders.length} টি)</h3>
                <div className="space-y-3">
                  {orders.map(order => (
                    <div key={order.id} className="border border-amber-200 rounded-2xl p-3.5 space-y-2.5 bg-amber-50/40">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="bg-red-600 text-white text-[10px] font-bold px-2 py-0.5 rounded font-mono">{order.id}</span>
                            <span className="text-[10px] text-gray-500 font-mono">{formatDateDMY(order.date)}</span>
                          </div>
                          <h4 className="font-bold text-xs text-gray-800 mt-1">{order.customerName} ({order.phone})</h4>
                          <p className="text-[11px] text-gray-600">📍 {order.address}</p>
                        </div>
                        <div className="text-right space-y-1">
                          <span className="text-sm font-black text-gray-900 block">৳{order.totalAmount}</span>
                          <div className="flex items-center gap-1 justify-end flex-wrap">
                            {order.status !== 'Cancelled' && (
                              <button
                                onClick={() => handleCancelOrder(order)}
                                className="bg-amber-50 text-amber-800 border border-amber-300 px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                              >
                                <X className="w-2.5 h-2.5" /> ক্যান্সেল
                              </button>
                            )}
                            <button
                              onClick={() => handleEditOrderInApp(order)}
                              className="bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                            >
                              <Edit3 className="w-2.5 h-2.5" /> এডিট
                            </button>
                            <button
                              onClick={() => handleDeleteOrderInApp(order.id)}
                              className="bg-red-50 text-red-600 border border-red-200 px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                            >
                              <Trash2 className="w-2.5 h-2.5" /> ডিলেট
                            </button>
                          </div>
                        </div>
                      </div>
                      <div className="text-[11px] space-y-0.5">
                        <p className="text-emerald-700 font-bold">অগ্রীম প্রাপ্ত: ৳{order.advancePaid} ({order.advancePaymentMethod || 'bKash'}) ✓</p>
                        {order.dueAmount > 0 && <p className="text-red-600 font-bold">বাকি প্রদেয়: ৳{order.dueAmount} (নগদ)</p>}
                      </div>
                      <div className="pt-1 border-t border-amber-200/60 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-1.5 select-none">
                          <span className="text-[11px] font-bold text-gray-700">অর্ডার স্ট্যাটাস:</span>
                          {['Placed', 'Preparing', 'Out for Delivery', 'Delivered'].map(st => (
                            <span
                              key={st}
                              className={`px-2 py-1 rounded-lg text-[10px] font-bold ${order.status === st ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-400'}`}
                            >
                              {st === 'Placed' ? 'গৃহীত' : st === 'Preparing' ? 'রান্না হচ্ছে' : st === 'Out for Delivery' ? 'ডেলিভারিতে' : 'সম্পন্ন'}
                            </span>
                          ))}
                        </div>
                        <a
                          href="/admin.html"
                          className="inline-flex items-center gap-1 text-[10px] font-bold text-red-700 hover:underline"
                        >
                          <Lock className="w-3 h-3" />
                          <span>স্ট্যাটাস পরিবর্তন করতে এডমিন অ্যাপ (admin.html) ব্যবহার করুন →</span>
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ================= ADMIN TAB 6: CUSTOMERS DATABASE ================= */}
            {adminTab === 'customers' && (
              <div className="bg-white rounded-2xl p-4 shadow-xs border border-amber-200 space-y-3">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="font-bold text-sm text-gray-900 flex items-center gap-1.5">
                      <Users className="w-4 h-4 text-emerald-600" />
                      <span>গ্রাহক ডাটাবেজ</span>
                    </h3>
                    <p className="text-[10px] text-gray-500">পাসওয়ার্ডহীন অটোমেটিক প্রোফাইল (এডিট ও ডিলেট সুবিধা)</p>
                  </div>
                  <span className="bg-emerald-100 text-emerald-800 font-bold text-[10px] px-2.5 py-1 rounded-full">
                    মোট {Object.keys(customers).length} জন
                  </span>
                </div>

                <div className="space-y-2.5">
                  {Object.values(customers).map(cust => {
                    const dueBal = getCustomerDueOrAdvanceBalance(cust.phone, cust.name);
                    return (
                    <div key={cust.phone} className="p-3 rounded-xl border border-amber-100 bg-amber-50/30 flex items-center justify-between gap-2 text-xs">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="font-bold text-emerald-900 truncate">{cust.name}</p>
                          {dueBal.remainingDue > 0 ? (
                            <span className="bg-red-100 text-red-700 border border-red-200 text-[9px] font-black px-1.5 py-0.5 rounded-full">
                              অবশিষ্ট বাকি: ৳{dueBal.remainingDue}
                            </span>
                          ) : dueBal.advanceDeposit > 0 ? (
                            <span className="bg-emerald-100 text-emerald-800 border border-emerald-200 text-[9px] font-black px-1.5 py-0.5 rounded-full">
                              অগ্রীম জমা: ৳{dueBal.advanceDeposit}
                            </span>
                          ) : (
                            <span className="bg-gray-100 text-gray-600 text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                              বাকি: ৳০
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] font-mono text-gray-600">📱 {cust.phone}</p>
                        <p className="text-[10px] text-gray-500 truncate">📍 {cust.address}</p>
                      </div>
                      <div className="text-right shrink-0 space-y-1">
                        <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-full block">
                          🎁 {cust.loyaltyPoints} Pts • ৳{cust.totalSpent}
                        </span>
                        <div className="flex items-center gap-1 justify-end">
                          <button
                            onClick={() => handleEditCustomerInApp(cust)}
                            className="bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <Edit3 className="w-2.5 h-2.5" /> এডিট
                          </button>
                          <button
                            onClick={() => handleDeleteCustomerInApp(cust.phone, cust.name)}
                            className="bg-red-50 text-red-600 border border-red-200 px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <Trash2 className="w-2.5 h-2.5" /> ডিলেট
                          </button>
                        </div>
                      </div>
                    </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ================= ADMIN TAB 7: MARKETING ================= */}
            {adminTab === 'marketing' && (
              <SmsMarketingPanel 
                customers={customers}
                soundOn={isSoundEnabled()}
                activeOffer={activeOffer}
                onOfferUpdate={setActiveOffer}
              />
            )}

            {/* ================= ADMIN TAB 8: SHOP LOCATION ================= */}
            {adminTab === 'location' && (
              <ShopLocationManager 
                soundOn={isSoundEnabled()}
                onLocationUpdate={(newLoc: ShopLocationConfig) => setShopLocation(newLoc)}
              />
            )}

          </div>
        )}

      </main>

      {/* ================= CART MOBILE BOTTOM SHEET DRAWER ================= */}
      <AnimatePresence>
        {isCartOpen && (
          <div className="fixed inset-0 z-50 flex items-end justify-center overflow-hidden">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-xs" onClick={() => setIsCartOpen(false)} />
            <motion.div 
              initial={{ y: '100%' }} 
              animate={{ y: 0 }} 
              exit={{ y: '100%' }} 
              transition={{ type: 'spring', damping: 26, stiffness: 260 }}
              className="relative z-10 w-full max-w-[430px] max-h-[90vh] bg-white rounded-t-3xl shadow-2xl flex flex-col overflow-hidden"
            >
              <div className="p-3.5 bg-gradient-to-r from-red-600 to-amber-500 text-white flex items-center justify-between">
                <h2 className="font-bold text-base flex items-center gap-2"><ShoppingBag className="w-5 h-5" /><span>আপনার শপিং কার্ট</span></h2>
                <button onClick={() => setIsCartOpen(false)} className="hover:bg-black/10 p-1 rounded-full cursor-pointer"><X className="w-5 h-5" /></button>
              </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {cart.length === 0 ? (
                    <div className="text-center py-16 text-gray-400"><ShoppingBag className="w-16 h-16 mx-auto mb-3 opacity-30" /><p>কার্ট খালি রয়েছে</p></div>
                  ) : (
                    cart.map(item => (
                      <div key={item.id} className="flex items-center justify-between gap-3 border-b pb-3">
                        <img src={item.image} alt={item.nameBn} className="w-14 h-14 rounded-xl object-cover" />
                        <div className="flex-1"><h4 className="font-bold text-sm">{item.nameBn}</h4><span className="text-xs text-red-600 font-bold">৳ {item.price}</span></div>
                        <div className="flex items-center gap-2 bg-amber-50 border rounded-lg p-1">
                          <button onClick={() => updateQuantity(item.id, -1)} className="p-1"><Minus className="w-3 h-3" /></button>
                          <span className="text-xs font-bold w-5 text-center">{item.quantity}</span>
                          <button onClick={() => updateQuantity(item.id, 1)} className="p-1"><Plus className="w-3 h-3" /></button>
                        </div>
                      </div>
                    ))
                  )}

                  {/* Coupon & Loyalty */}
                  {cart.length > 0 && (
                    <div className="space-y-3 pt-3 border-t">
                      <div className="flex gap-2">
                        <input 
                          type="text" 
                          placeholder="কুপন কোড (SALMA10)"
                          value={checkoutForm.coupon}
                          onChange={(e) => setCheckoutForm({ ...checkoutForm, coupon: e.target.value })}
                          className="flex-1 border rounded-lg p-2 text-xs"
                        />
                        <button onClick={handleApplyCoupon} className="bg-amber-500 text-white font-bold px-3 rounded-lg text-xs">প্রয়োগ</button>
                      </div>

                      {currentCustomer && currentCustomer.loyaltyPoints > 0 && (
                        <label className="flex items-center gap-2 text-xs font-semibold bg-amber-50 p-2.5 rounded-xl border border-amber-200 cursor-pointer">
                          <input 
                            type="checkbox" 
                            checked={checkoutForm.useLoyalty}
                            onChange={(e) => setCheckoutForm({ ...checkoutForm, useLoyalty: e.target.checked })}
                          />
                          <span>লয়্যালটি পয়েন্ট ব্যবহার করুন (জমা: {currentCustomer.loyaltyPoints} Pts)</span>
                        </label>
                      )}
                    </div>
                  )}

                  {/* Customer Information (Auto Profile Creation) */}
                  {cart.length > 0 && (
                    <form onSubmit={handleCheckout} className="space-y-3 pt-4 border-t">
                      <div className="flex justify-between items-center">
                        <h4 className="font-bold text-sm text-gray-800">গ্রাহকের তথ্য (অটো প্রোফাইল সেভ)</h4>
                        {currentCustomer && (
                          <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded">
                            অটো-ফিল্ড
                          </span>
                        )}
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-gray-600 mb-0.5">মোবাইল নম্বর (১১ ডিজিট, +88 ছাড়া — রেজিস্টার্ড নম্বরে অটো-ফিল হবে)</label>
                        <input 
                          type="tel" 
                          maxLength={11}
                          placeholder="01712345678" 
                          value={checkoutForm.phone} 
                          onChange={(e) => {
                            const val = normalizeBdPhone(e.target.value);
                            setCheckoutForm({ ...checkoutForm, phone: val });
                            const matched = findCustomerByPhone(val, customers, orders);
                            if (matched) {
                              setCurrentCustomer(matched);
                              setCheckoutForm(prev => ({
                                ...prev,
                                phone: val,
                                name: matched.name,
                                address: matched.address
                              }));
                            }
                          }} 
                          className="w-full border rounded-lg p-2.5 text-xs font-mono font-bold" 
                          required 
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-gray-600 mb-0.5">আপনার নাম</label>
                        <input 
                          type="text" 
                          placeholder="আপনার নাম" 
                          value={checkoutForm.name} 
                          onChange={(e) => setCheckoutForm({ ...checkoutForm, name: e.target.value })} 
                          className="w-full border rounded-lg p-2.5 text-xs" 
                          required 
                        />
                      </div>

                      {/* 1 KM Free Delivery Zone System in Checkout */}
                      <div className="bg-gradient-to-br from-emerald-50 via-teal-50 to-amber-50 border border-emerald-300 rounded-2xl p-3.5 space-y-3 shadow-xs">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 font-bold text-xs text-emerald-900">
                            <Truck className="w-4 h-4 text-emerald-600" />
                            <span>১ কি.মি. ফ্রি ডেলিভারি জোন সুবিধা</span>
                          </div>
                          <button 
                            type="button" 
                            onClick={() => setShowShopLocationModal(true)}
                            className="text-[10px] font-bold text-emerald-700 hover:text-emerald-900 underline flex items-center gap-0.5"
                          >
                            <Info className="w-3 h-3" />
                            <span>ম্যাপ ও কভারেজ</span>
                          </button>
                        </div>

                        {/* Live Delivery Status Indicator */}
                        {isWithin1Km ? (
                          <div className="bg-emerald-100/90 border border-emerald-400 rounded-xl p-2.5 flex items-start gap-2 text-xs text-emerald-900 shadow-xs">
                            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                            <div>
                              <p className="font-extrabold flex items-center gap-1">
                                <span>🎉 ফ্রি ডেলিভারি আনলকড!</span>
                                <span className="bg-emerald-700 text-white text-[9px] px-2 py-0.5 rounded-full font-bold">ডেলিভারি ফি: ৳০</span>
                              </p>
                              <p className="text-[11px] text-emerald-800 mt-0.5 leading-snug">
                                আপনার দূরত্ব দোকান থেকে মাত্র <b>{customerDistanceKm} কি.মি.</b> (১ কি.মি. ফ্রি জোনের মধ্যে)!
                              </p>
                            </div>
                          </div>
                        ) : customerDistanceKm !== null ? (
                          <div className="bg-amber-100/90 border border-amber-300 rounded-xl p-2.5 flex items-start gap-2 text-xs text-amber-900">
                            <MapPin className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                            <div>
                              <p className="font-bold">দূরত্ব: {customerDistanceKm} কি.মি. (১ কি.মি. এর বেশি)</p>
                              <p className="text-[11px] text-amber-800 mt-0.5">
                                রেগুলার ডেলিভারি ফি ৳৬০ প্রযোজ্য। ১ কি.মি. এর মধ্যে থাকলে নিচের এলাকা বেছে নিন।
                              </p>
                            </div>
                          </div>
                        ) : (
                          <div className="bg-white/90 border border-amber-200 rounded-xl p-2 text-xs text-gray-700">
                            দোকানের চারপাশে ১ কি.মি. এর মধ্যে ডেলিভারি চার্জ সম্পূর্ণ ফ্রি (৳০)!
                          </div>
                        )}

                        {/* Interactive Verification Tools */}
                        <div className="space-y-2">
                          <button
                            type="button"
                            onClick={handleCheckGpsLocation}
                            disabled={isLocatingGps}
                            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-xs transition active:scale-98 cursor-pointer"
                          >
                            <Navigation className={`w-3.5 h-3.5 ${isLocatingGps ? 'animate-spin' : ''}`} />
                            <span>{isLocatingGps ? 'GPS অবস্থান পরিমাপ করা হচ্ছে...' : '📡 লাইভ GPS দিয়ে অবস্থান ও দূরত্ব মাপুন'}</span>
                          </button>

                          {gpsMessage && (
                            <p className={`text-[10px] p-2 rounded-xl font-medium border ${
                              gpsMessage.type === 'success' ? 'bg-emerald-100/80 text-emerald-800 border-emerald-300' :
                              gpsMessage.type === 'error' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-blue-50 text-blue-700 border-blue-200'
                            }`}>
                              {gpsMessage.text}
                            </p>
                          )}

                          <div>
                            <span className="block text-[10px] font-bold text-gray-700 mb-1">
                              বা ১-ক্লিকে নিকটবর্তী ১ কি.মি. এলাকা বেছে নিন:
                            </span>
                            <div className="flex flex-wrap gap-1.5">
                              {NEARBY_1KM_AREAS.map(area => {
                                const isSelected = customerDistanceKm === area.distanceKm && distanceVerifiedType === 'area';
                                return (
                                  <button
                                    key={area.name}
                                    type="button"
                                    onClick={() => handleSelectNearbyArea(area)}
                                    className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition cursor-pointer ${
                                      isSelected 
                                        ? 'bg-emerald-700 text-white border-emerald-700 shadow-xs ring-2 ring-emerald-300' 
                                        : 'bg-white text-gray-700 hover:bg-amber-100 border-amber-300'
                                    }`}
                                  >
                                    {area.name} ({area.distanceKm} কি.মি.)
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-gray-600 mb-0.5">
                          ডেলিভারি ঠিকানা (স্বয়ংক্রিয় ১ কি.মি. যাচাই সহ)
                        </label>
                        <textarea 
                          placeholder="বাসা নং, রোড, এলাকা (যেমন: চান্দনা চৌরাস্তা, জয়দেবপুর, ভোগড়া বাইপাস, গাজীপুর...)" 
                          value={checkoutForm.address} 
                          onChange={(e) => {
                            const val = e.target.value;
                            setCheckoutForm({ ...checkoutForm, address: val });
                            checkAddressKeywordFor1Km(val);
                          }} 
                          rows={2} 
                          className="w-full border rounded-lg p-2.5 text-xs" 
                          required 
                        />
                        <p className="text-[10px] text-gray-500 mt-0.5">
                          💡 ঠিকানায় চান্দনা চৌরাস্তা, জয়দেবপুর, শিববাড়ি, ভোগড়া বাইপাস, ডুয়েট, বোর্ড বাজার ইত্যাদি লিখলে স্বয়ংক্রিয়ভাবে গাজীপুর ১ কি.মি. ফ্রি ডেলিভারি যুক্ত হবে।
                        </p>
                      </div>
                      
                      {/* 50% Advance Payment Policy Notice */}
                      <div className="bg-gradient-to-r from-red-50 to-amber-50 border border-red-300 rounded-xl p-3 space-y-1">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-red-700">
                          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                          <span>অগ্রীম পেমেন্ট পলিসি (কমপক্ষে ৫০% আবশ্যক)</span>
                        </div>
                        <p className="text-[11px] text-gray-700 leading-relaxed">
                          সালমা ফুড কর্ণারে অর্ডার কনফার্ম করতে <b>কমপক্ষে ৫০% টাকা অগ্রীম পেমেন্ট</b> করতে হবে। অবশিষ্ট টাকা খাবার ডেলিভারির সময় নগদ প্রদেয়।
                        </p>
                      </div>

                      {/* Advance Amount Option (50% vs 100%) */}
                      <div className="space-y-1.5">
                        <label className="block text-[11px] font-bold text-gray-700">অগ্রীম পরিশোধের পরিমাণ নির্বাচন করুন</label>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setCheckoutForm(prev => ({ ...prev, advanceOption: '50' }))}
                            className={`p-2.5 rounded-xl border text-left text-xs transition ${checkoutForm.advanceOption === '50' ? 'border-red-600 bg-red-50 text-red-800 ring-2 ring-red-300 font-bold' : 'border-gray-200 bg-white text-gray-600'}`}
                          >
                            <div className="flex justify-between items-center">
                              <span>৫০% অগ্রীম</span>
                              <span className="font-extrabold text-red-600">৳ {minAdvance}</span>
                            </div>
                            <p className="text-[10px] text-gray-500 mt-0.5">বাকি ৳ {finalTotal - minAdvance} ডেলিভারিতে</p>
                          </button>
                          
                          <button
                            type="button"
                            onClick={() => setCheckoutForm(prev => ({ ...prev, advanceOption: '100' }))}
                            className={`p-2.5 rounded-xl border text-left text-xs transition ${checkoutForm.advanceOption === '100' ? 'border-emerald-600 bg-emerald-50 text-emerald-800 ring-2 ring-emerald-300 font-bold' : 'border-gray-200 bg-white text-gray-600'}`}
                          >
                            <div className="flex justify-between items-center">
                              <span>১০০% ফুল পেমেন্ট</span>
                              <span className="font-extrabold text-emerald-700">৳ {finalTotal}</span>
                            </div>
                            <p className="text-[10px] text-gray-500 mt-0.5">বাকি থাকবে ৳ ০</p>
                          </button>
                        </div>
                      </div>
                      
                      {/* Advance Payment Method Selection */}
                      <div className="space-y-1.5">
                        <label className="block text-[11px] font-bold text-gray-700">অগ্রীম পেমেন্ট মেথড</label>
                        <div className="grid grid-cols-3 gap-2">
                          {[
                            { id: 'bKash', label: 'বিকাশ (bKash)', color: 'border-pink-500 text-pink-700 bg-pink-50' },
                            { id: 'Nagad', label: 'নগদ (Nagad)', color: 'border-orange-500 text-orange-700 bg-orange-50' },
                            { id: 'Card', label: 'কার্ড (Card)', color: 'border-blue-500 text-blue-700 bg-blue-50' }
                          ].map(pm => (
                            <button
                              key={pm.id}
                              type="button"
                              onClick={() => setCheckoutForm(prev => ({ ...prev, advancePaymentMethod: pm.id as any }))}
                              className={`p-2 rounded-xl border text-center text-xs font-bold transition ${checkoutForm.advancePaymentMethod === pm.id ? `${pm.color} ring-2 ring-amber-300` : 'border-gray-200 bg-white text-gray-600'}`}
                            >
                              {pm.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Payment Number & TrxID Input */}
                      <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-3 space-y-2">
                        <div className="flex justify-between items-center text-xs">
                          <span className="font-semibold text-gray-700">সালমা ফুড {checkoutForm.advancePaymentMethod} নম্বর:</span>
                          <span className="font-mono font-bold text-red-600 bg-white px-2 py-0.5 rounded border border-amber-300">01712-345678</span>
                        </div>
                        <p className="text-[10px] text-gray-500">
                          নম্বরে <b>৳ {advanceAmount}</b> সেন্ড মানি বা পেমেন্ট করে TrxID দিন অথবা নিচের বাটনে টেস্ট ভেরিফাই করুন।
                        </p>
                        <div className="flex gap-2">
                          <input 
                            type="text" 
                            placeholder="ট্রানজেকশন আইডি (যেমন: 9J4K2L)" 
                            value={checkoutForm.transactionId}
                            onChange={(e) => setCheckoutForm({ ...checkoutForm, transactionId: e.target.value })}
                            className="flex-1 border rounded-lg p-2 text-xs font-mono uppercase bg-white"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const prefix = checkoutForm.advancePaymentMethod === 'bKash' ? 'BK' : checkoutForm.advancePaymentMethod === 'Nagad' ? 'NG' : 'CD';
                              const gen = prefix + Math.floor(100000 + Math.random() * 900000);
                              setCheckoutForm(prev => ({ ...prev, transactionId: gen }));
                            }}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1.5 rounded-lg text-[10px] font-bold shadow-xs shrink-0"
                          >
                            ⚡ অটো পে
                          </button>
                        </div>
                      </div>

                    </form>
                  )}
                </div>

                {cart.length > 0 && (
                  <div className="p-4 bg-gray-50 border-t space-y-3">
                    <div className="space-y-1.5 text-xs">
                      <div className="flex justify-between text-gray-600">
                        <span>ডেলিভারি ফি:</span>
                        {isWithin1Km ? (
                          <span className="text-emerald-700 font-bold flex items-center gap-1.5">
                            <span className="line-through text-gray-400 font-normal">৳৬০</span>
                            <span className="bg-emerald-100 text-emerald-800 text-[10px] px-2 py-0.5 rounded font-extrabold flex items-center gap-1 border border-emerald-300">
                              <Truck className="w-3 h-3 text-emerald-600" />
                              ১ কি.মি. ফ্রি (৳০)
                            </span>
                          </span>
                        ) : (
                          <span>{deliveryFee === 0 ? 'ফ্রি' : `৳ ${deliveryFee}`}</span>
                        )}
                      </div>
                      {(discountApplied > 0 || loyaltyDiscount > 0) && (
                        <div className="flex justify-between text-emerald-600 font-bold">
                          <span>ডিসকাউন্ট:</span>
                          <span>-৳ {discountApplied + loyaltyDiscount}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-sm font-extrabold border-t pt-1.5">
                        <span>সর্বমোট বিল:</span>
                        <span className="text-gray-900">৳ {finalTotal}</span>
                      </div>
                      <div className="flex justify-between text-xs font-bold text-red-600 bg-red-50 p-2 rounded-lg border border-red-200">
                        <span>এখন অগ্রীম প্রদেয় ({checkoutForm.advanceOption === '100' ? '১০০%' : '৫০%'}):</span>
                        <span className="text-sm font-extrabold">৳ {advanceAmount}</span>
                      </div>
                      {dueAmount > 0 && (
                        <div className="flex justify-between text-xs font-medium text-gray-600 px-1">
                          <span>বাকি থাকবে (ডেলিভারিতে প্রদেয়):</span>
                          <span className="font-bold text-amber-800">৳ {dueAmount}</span>
                        </div>
                      )}
                    </div>
                    <button 
                      onClick={handleCheckout} 
                      className="w-full bg-gradient-to-r from-red-600 to-emerald-600 hover:opacity-95 text-white font-bold py-3 rounded-xl text-sm shadow-lg transition active:scale-95 cursor-pointer"
                    >
                      ৳ {advanceAmount} অগ্রীম দিয়ে অর্ডার কনফার্ম করুন
                    </button>
                  </div>
                )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ================= ORDER SUCCESS MODAL (Mobile Bottom Sheet) ================= */}
      {orderSuccessModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-t-3xl p-6 max-w-[430px] w-full shadow-2xl text-center space-y-4 border-t border-emerald-200 max-h-[92vh] overflow-y-auto">
            <div className="w-12 h-1.5 bg-gray-300 rounded-full mx-auto mb-1" />
            <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-9 h-9" />
            </div>
            <h3 className="text-lg font-extrabold text-gray-900">অর্ডার ও অগ্রীম পেমেন্ট সফল!</h3>
            <p className="text-xs text-gray-600">
              অর্ডার আইডি: <span className="font-bold text-red-600">{orderSuccessModal.id}</span>
            </p>

            {/* Advance and Due Breakdown Box */}
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-xs space-y-2 text-left">
              <div className="flex justify-between text-gray-700">
                <span>সর্বমোট বিল:</span>
                <span className="font-extrabold text-sm">৳ {orderSuccessModal.totalAmount}</span>
              </div>
              <div className="flex justify-between text-emerald-800 font-bold bg-white p-2 rounded-lg border border-emerald-200">
                <span>অগ্রীম পরিশোধিত:</span>
                <span>✓ ৳ {orderSuccessModal.advancePaid} ({orderSuccessModal.advancePaymentMethod})</span>
              </div>
              {orderSuccessModal.dueAmount > 0 ? (
                <div className="flex justify-between text-red-700 font-bold bg-red-50 p-2 rounded-lg border border-red-200">
                  <span>ডেলিভারির সময় প্রদেয় (বাকি):</span>
                  <span>৳ {orderSuccessModal.dueAmount} (নগদ)</span>
                </div>
              ) : (
                <div className="text-center text-emerald-700 font-bold text-[11px] py-1">
                  ✓ সম্পূর্ণ বিল অগ্রীম পরিশোধিত
                </div>
              )}
              {orderSuccessModal.transactionId && (
                <p className="text-[10px] text-gray-500 font-mono text-center">
                  TrxID: {orderSuccessModal.transactionId}
                </p>
              )}
            </div>

            {orderSuccessModal.isFreeDeliveryWithin1km && (
              <div className="bg-emerald-100 text-emerald-800 p-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border border-emerald-300">
                <Truck className="w-4 h-4 text-emerald-700 shrink-0" />
                <span>১ কি.মি. ফ্রি ডেলিভারি সুবিধা কার্যকর (ডেলিভারি ফি: ৳০ সম্পূর্ণ ফ্রি!)</span>
              </div>
            )}

            <div className="bg-amber-50 p-2.5 rounded-xl text-xs text-amber-800 font-medium">
              🎁 আপনার প্রোফাইলে <span className="font-bold text-emerald-700">+{orderSuccessModal.loyaltyPointsEarned} লয়্যালটি পয়েন্ট</span> যুক্ত হয়েছে!
            </div>

            {/* Audio Feedback Indicator */}
            <div className="flex items-center justify-center gap-2 text-[11px] text-emerald-800 bg-emerald-50/80 px-3 py-1.5 rounded-full border border-emerald-200">
              <Volume2 className="w-3.5 h-3.5 text-emerald-600 animate-bounce" />
              <span>সাউন্ড ফিডব্যাক: অর্ডার সফল সাউন্ড বেজে উঠেছে</span>
              <button 
                type="button"
                onClick={() => playOrderSuccessSound()}
                className="text-[10px] font-bold text-emerald-700 hover:text-emerald-900 underline ml-1 cursor-pointer"
              >
                আবার শুনুন
              </button>
            </div>
            <p className="text-[11px] text-gray-500">
              পরবর্তীতে শুধুমাত্র <b>{orderSuccessModal.phone}</b> নম্বর দিয়ে লগইন করলেই আপনার সব তথ্য পেয়ে যাবেন (কোনো পাসওয়ার্ড লাগবে না)।
            </p>
            <button 
              onClick={() => {
                setOrderSuccessModal(null);
                setActiveOffer('আপনার অর্ডারটি সফলভাবে গ্রহণ করা হয়েছে ও রান্না চলছে!');
              }} 
              className="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold py-3 rounded-xl text-sm shadow"
            >
              ট্র্যাকিং দেখুন
            </button>
          </div>
        </div>
      )}

      {/* ================= SHOP LOCATION & 1 KM FREE DELIVERY MODAL (Mobile Bottom Sheet) ================= */}
      {showShopLocationModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-t-3xl max-w-[430px] w-full shadow-2xl border-t border-amber-200 overflow-hidden flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="bg-gradient-to-r from-red-600 via-amber-500 to-emerald-600 text-white p-5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center">
                  <Truck className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base sm:text-lg">১ কি.মি. ফ্রি ডেলিভারি জোন (গাজীপুর)</h3>
                  <p className="text-[11px] text-amber-100">সালমা ফুড কর্ণার, চান্দনা চৌরাস্তা, গাজীপুর</p>
                </div>
              </div>
              <button 
                onClick={() => setShowShopLocationModal(false)}
                className="hover:bg-white/20 p-1.5 rounded-full text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 sm:p-6 space-y-4 overflow-y-auto text-xs">
              {/* Shop Central Info */}
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-2">
                <div className="flex items-center gap-2 text-sm font-bold text-gray-900">
                  <MapPin className="w-4 h-4 text-red-600" />
                  <span>দোকানের অবস্থান (কেন্দ্রীয় পয়েন্ট)</span>
                </div>
                <p className="text-gray-700 font-semibold">{SHOP_LOCATION.address}</p>
                <div className="flex flex-wrap gap-2 pt-1 text-[11px]">
                  <span className="bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full border border-emerald-300">
                    ফ্রি ডেলিভারি ব্যাসার্ধ: ১.০ কিলোমিটার
                  </span>
                  <span className="bg-red-100 text-red-800 font-bold px-2 py-0.5 rounded-full border border-red-200">
                    ডেলিভারি ফি: ৳ ০ (সম্পূর্ণ ফ্রি)
                  </span>
                </div>
              </div>

              {/* Visual Simulated Coverage Radar */}
              <div className="bg-gray-900 text-white rounded-2xl p-5 relative overflow-hidden border border-gray-800 text-center space-y-3">
                <div className="relative w-48 h-48 mx-auto flex items-center justify-center">
                  {/* Outer circle: 1 km radius */}
                  <div className="absolute inset-0 rounded-full border-2 border-dashed border-emerald-500/60 animate-pulse bg-emerald-500/10 flex items-center justify-center">
                    <span className="absolute top-1 text-[9px] text-emerald-400 font-bold bg-gray-900/80 px-2 py-0.5 rounded-full">
                      ১ কি.মি. ফ্রি ডেলিভারি বাউন্ডারি
                    </span>
                  </div>
                  {/* Inner 0.5km ring */}
                  <div className="absolute inset-6 rounded-full border border-emerald-500/30 flex items-center justify-center">
                    <span className="absolute bottom-1 text-[8px] text-gray-400">০.৫ কি.মি.</span>
                  </div>
                  {/* Center Shop Pin */}
                  <div className="relative z-10 flex flex-col items-center">
                    <div className="w-10 h-10 rounded-full bg-red-600 text-white flex items-center justify-center shadow-lg ring-4 ring-red-400/50">
                      <ChefHat className="w-5 h-5" />
                    </div>
                    <span className="text-[10px] font-extrabold text-white mt-1 bg-black/60 px-2 py-0.5 rounded-full">
                      সালমা ফুড
                    </span>
                  </div>
                </div>

                <p className="text-[11px] text-gray-300">
                  দোকানের কেন্দ্র থেকে চারপাশে ১ কি.মি. দূরত্বের মধ্যে সকল অর্ডার স্বয়ংক্রিয়ভাবে ফ্রি ডেলিভারির আওতায় আসবে।
                </p>
              </div>

              {/* Covered Landmarks List */}
              <div className="space-y-2">
                <h4 className="font-bold text-gray-900 text-xs flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>১ কিলোমিটার পরিধির অন্তর্ভুক্ত প্রধান এলাকা সমূহ:</span>
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {NEARBY_1KM_AREAS.map(area => (
                    <div 
                      key={area.name} 
                      className="p-2.5 bg-emerald-50/70 border border-emerald-200 rounded-xl flex items-center justify-between"
                    >
                      <div>
                        <p className="font-bold text-gray-900">{area.name}</p>
                        <p className="text-[10px] text-gray-500">{area.landmark}</p>
                      </div>
                      <span className="text-[11px] font-extrabold text-emerald-700 bg-white px-2 py-0.5 rounded-full border border-emerald-300">
                        {area.distanceKm} কি.মি.
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* GPS Live Distance Test within Modal */}
              <div className="bg-gradient-to-r from-emerald-50 to-amber-50 border border-emerald-300 rounded-2xl p-4 space-y-3">
                <div className="flex justify-between items-center">
                  <h4 className="font-bold text-gray-900 flex items-center gap-1.5">
                    <Crosshair className="w-4 h-4 text-emerald-600" />
                    <span>আপনার বর্তমান অবস্থান ও দূরত্ব পরীক্ষা করুন</span>
                  </h4>
                </div>
                <button
                  type="button"
                  onClick={handleCheckGpsLocation}
                  disabled={isLocatingGps}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-2 shadow transition active:scale-98 cursor-pointer"
                >
                  <Navigation className={`w-4 h-4 ${isLocatingGps ? 'animate-spin' : ''}`} />
                  <span>{isLocatingGps ? 'লোকেশন নির্ণয় হচ্ছে...' : '📡 লাইভ GPS দিয়ে দূরত্ব যাচাই করুন'}</span>
                </button>

                {customerDistanceKm !== null && (
                  <div className={`p-3 rounded-xl border text-center font-bold ${
                    isWithin1Km 
                      ? 'bg-emerald-100 text-emerald-800 border-emerald-300' 
                      : 'bg-amber-100 text-amber-900 border-amber-300'
                  }`}>
                    {isWithin1Km 
                      ? `✓ আপনার দূরত্ব: ${customerDistanceKm} কি.মি. (অভিনন্দন! আপনি ১ কি.মি. ফ্রি জোনে আছেন - ডেলিভারি ফি ৳০)` 
                      : `📍 আপনার দূরত্ব: ${customerDistanceKm} কি.মি. (১ কি.মি. এর চেয়ে বেশি দূরত্ব)`}
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 bg-gray-50 border-t flex justify-between gap-3">
              <button
                type="button"
                onClick={() => setShowShopLocationModal(false)}
                className="w-full bg-gray-800 hover:bg-gray-900 text-white font-bold py-2.5 rounded-xl text-xs shadow cursor-pointer"
              >
                বন্ধ করুন ও অর্ডারে ফিরুন
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= FOOD ADD / EDIT MODAL (Mobile Bottom Sheet) ================= */}
      {foodModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-t-3xl max-w-[430px] w-full shadow-2xl border-t border-amber-200 overflow-hidden flex flex-col max-h-[92vh]">
            
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-red-600 via-amber-500 to-emerald-600 text-white p-5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center">
                  <Utensils className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base sm:text-lg">
                    {editingFoodId ? '✏️ খাবারের তথ্য এডিট / পরিবর্তন করুন' : '➕ নতুন খাবার মেনুতে সংযোজন করুন'}
                  </h3>
                  <p className="text-[11px] text-amber-100">সালমা ফুড কর্ণার ডিজিটাল মেনু ম্যানেজার</p>
                </div>
              </div>
              <button 
                onClick={() => setFoodModalOpen(false)}
                className="hover:bg-white/20 p-1.5 rounded-full text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveFoodItem} className="p-5 sm:p-6 space-y-4 overflow-y-auto text-xs">
              
              {/* Quick Preset Buttons (especially convenient when adding new item) */}
              {!editingFoodId && (
                <div className="bg-amber-50/80 p-3 rounded-2xl border border-amber-200 space-y-1.5">
                  <span className="block text-[11px] font-bold text-gray-700">
                    ⚡ দ্রুত ১-ক্লিকে নমুনা খাবার নির্বাচন করুন:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {SAMPLE_FOOD_PRESETS.map(preset => (
                      <button
                        key={preset.nameBn}
                        type="button"
                        onClick={() => {
                          setFoodForm({
                            nameBn: preset.nameBn,
                            nameEn: preset.nameEn,
                            category: preset.category,
                            price: preset.price.toString(),
                            originalPrice: preset.originalPrice ? preset.originalPrice.toString() : '',
                            image: preset.image,
                            descriptionBn: preset.descriptionBn,
                            descriptionEn: preset.descriptionEn,
                            spicyLevel: preset.spicyLevel,
                            isVeg: preset.isVeg
                          });
                        }}
                        className="bg-white hover:bg-amber-100 text-gray-800 border border-amber-300 px-2.5 py-1 rounded-lg text-[10px] font-bold transition shadow-2xs cursor-pointer"
                      >
                        + {preset.nameBn}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Name Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-1">
                    খাবারের নাম (বাংলা) <span className="text-red-600">*</span>
                  </label>
                  <input 
                    type="text" 
                    placeholder="যেমন: স্পেশাল খাসির কাচ্চি" 
                    value={foodForm.nameBn}
                    onChange={(e) => setFoodForm({ ...foodForm, nameBn: e.target.value })}
                    className="w-full border rounded-xl p-2.5 text-xs font-semibold focus:ring-2 focus:ring-red-400 focus:outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-1">খাবারের নাম (ইংরেজি)</label>
                  <input 
                    type="text" 
                    placeholder="e.g. Special Mutton Kacchi" 
                    value={foodForm.nameEn}
                    onChange={(e) => setFoodForm({ ...foodForm, nameEn: e.target.value })}
                    className="w-full border rounded-xl p-2.5 text-xs focus:ring-2 focus:ring-red-400 focus:outline-none"
                  />
                </div>
              </div>

              {/* Category & Pricing */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-1">ক্যাটাগরি</label>
                  <select
                    value={foodForm.category}
                    onChange={(e) => setFoodForm({ ...foodForm, category: e.target.value })}
                    className="w-full border rounded-xl p-2.5 text-xs bg-white font-semibold focus:ring-2 focus:ring-red-400 focus:outline-none"
                  >
                    {menuCategories.map(cat => (
                      <option key={cat.id} value={cat.id}>
                        {cat.icon ? `${cat.icon} ` : ''}{cat.nameBn} ({cat.nameEn})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-1">
                    বিক্রয় মূল্য (টাকা ৳) <span className="text-red-600">*</span>
                  </label>
                  <input 
                    type="number" 
                    placeholder="যেমন: ৩২০" 
                    value={foodForm.price}
                    onChange={(e) => setFoodForm({ ...foodForm, price: e.target.value })}
                    className="w-full border rounded-xl p-2.5 text-xs font-extrabold text-red-600 focus:ring-2 focus:ring-red-400 focus:outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-1">পূর্বের মূল্য (ডিসকাউন্ট)</label>
                  <input 
                    type="number" 
                    placeholder="যেমন: ৩৬০" 
                    value={foodForm.originalPrice}
                    onChange={(e) => setFoodForm({ ...foodForm, originalPrice: e.target.value })}
                    className="w-full border rounded-xl p-2.5 text-xs text-gray-500 focus:ring-2 focus:ring-red-400 focus:outline-none"
                  />
                </div>
              </div>

              {/* Image Upload & Live Preview (cPanel Storage) */}
              <div className="bg-emerald-50/70 border border-emerald-200 rounded-2xl p-3 space-y-2">
                <label className="block text-[11px] font-bold text-emerald-950">
                  খাবারের ছবি আপলোড (cPanel সার্ভারে সেভ হবে)
                </label>
                <div className="flex items-center gap-2.5">
                  {foodForm.image && (
                    <div className="w-14 h-14 rounded-xl overflow-hidden border border-emerald-300 shrink-0 bg-white">
                      <img src={foodForm.image} alt="Preview" className="w-full h-full object-cover" />
                    </div>
                  )}
                  <label className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-xs transition cursor-pointer">
                    <Upload className="w-4 h-4" />
                    <span>{isUploadingAppFoodImg ? 'আপলোড হচ্ছে...' : '📤 গ্যালারি / ফোন থেকে ছবি আপলোড করুন'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleAppFoodImageUpload}
                      className="hidden"
                      disabled={isUploadingAppFoodImg}
                    />
                  </label>
                </div>
                <input 
                  type="text" 
                  placeholder="অথবা ছবির URL দিন (uploads/food_...jpg বা https://...)" 
                  value={foodForm.image}
                  onChange={(e) => setFoodForm({ ...foodForm, image: e.target.value })}
                  className="w-full border border-emerald-200 bg-white rounded-xl p-2 text-xs focus:ring-2 focus:ring-red-400 focus:outline-none font-mono"
                />
              </div>

              {/* Descriptions */}
              <div>
                <label className="block text-[11px] font-bold text-gray-700 mb-1">খাবারের বিবরণ (বাংলা)</label>
                <textarea 
                  rows={2}
                  placeholder="খাবারের স্বাদ, প্রস্তুত প্রণালী ও বৈশিষ্ট্য..." 
                  value={foodForm.descriptionBn}
                  onChange={(e) => setFoodForm({ ...foodForm, descriptionBn: e.target.value })}
                  className="w-full border rounded-xl p-2.5 text-xs focus:ring-2 focus:ring-red-400 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-gray-700 mb-1">খাবারের বিবরণ (ইংরেজি)</label>
                <textarea 
                  rows={2}
                  placeholder="English description of the dish..." 
                  value={foodForm.descriptionEn}
                  onChange={(e) => setFoodForm({ ...foodForm, descriptionEn: e.target.value })}
                  className="w-full border rounded-xl p-2.5 text-xs focus:ring-2 focus:ring-red-400 focus:outline-none"
                />
              </div>

              {/* Spicy level and Veg/Non-veg */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-1">ঝাল মাত্রা (Spicy Level)</label>
                  <select
                    value={foodForm.spicyLevel}
                    onChange={(e) => setFoodForm({ ...foodForm, spicyLevel: Number(e.target.value) })}
                    className="w-full border rounded-xl p-2 text-xs bg-white focus:ring-2 focus:ring-red-400 focus:outline-none"
                  >
                    <option value={0}>ঝাল নেই (০) — মিষ্টি / সাধারণ</option>
                    <option value={1}>হালকা ঝাল (১) 🌶️</option>
                    <option value={2}>মাঝারি ঝাল (২) 🌶️🌶️</option>
                    <option value={3}>তীব্র ঝাল (৩) 🌶️🌶️🌶️</option>
                  </select>
                </div>
                <div className="flex items-center pt-5">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-gray-700">
                    <input 
                      type="checkbox" 
                      checked={foodForm.isVeg}
                      onChange={(e) => setFoodForm({ ...foodForm, isVeg: e.target.checked })}
                      className="w-4 h-4 rounded text-emerald-600 cursor-pointer"
                    />
                    <span>🌱 এটি নিরামিষ বা ভেজিটেরিয়ান আইটেম</span>
                  </label>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setFoodModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-gray-300 text-gray-700 font-bold hover:bg-gray-100 transition cursor-pointer"
                >
                  বাতিল
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-red-600 to-emerald-600 hover:opacity-95 text-white font-bold shadow-md transition cursor-pointer"
                >
                  {editingFoodId ? '✓ পরিবর্তন সংরক্ষণ করুন' : '+ মেনুতে খাবার যোগ করুন'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* ================= CATEGORY MANAGER MODAL ================= */}
      <CategoryManagerModal
        isOpen={isCategoryModalOpen}
        onClose={() => setIsCategoryModalOpen(false)}
        categories={menuCategories}
        menuItems={menuItems}
        onSaveCategories={handleSaveCategories}
      />

      {/* ================= SUPPORT CHAT MOBILE BOTTOM SHEET ================= */}
      {isChatOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-t-3xl shadow-2xl max-w-[430px] w-full border-t border-amber-200 flex flex-col h-[75vh] overflow-hidden">
            <div className="bg-gradient-to-r from-red-600 to-amber-500 text-white p-3.5 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4" />
                <span className="font-bold text-sm">সালমা ফুড সাপোর্ট চ্যাট</span>
              </div>
              <button onClick={() => setIsChatOpen(false)} className="p-1 hover:bg-black/10 rounded-full cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-amber-50/30 text-xs">
              {chatMessages.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`p-3 rounded-2xl max-w-[82%] ${m.role === 'user' ? 'bg-red-600 text-white' : 'bg-white border border-amber-200'}`}>{m.text}</div>
                </div>
              ))}
              {chatLoading && <div className="text-gray-400 text-xs animate-pulse">টাইপ করছে...</div>}
            </div>
            <div className="p-3 bg-white border-t flex gap-2">
              <input 
                type="text" 
                value={chatInput} 
                onChange={(e) => setChatInput(e.target.value)} 
                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                placeholder="খাবার বা ডেলিভারি নিয়ে প্রশ্ন করুন..." 
                className="flex-1 border rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-red-500" 
              />
              <button onClick={handleSendMessage} className="bg-emerald-600 text-white px-3.5 py-2 rounded-xl cursor-pointer">
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= FLOATING VIEW CART BAR (When items in cart) ================= */}
      {appMode === 'public' && cart.length > 0 && !isCartOpen && (
        <div className="fixed bottom-[62px] left-0 right-0 max-w-[430px] mx-auto px-3 z-40">
          <button
            onClick={() => setIsCartOpen(true)}
            className="w-full bg-gradient-to-r from-red-600 via-rose-600 to-emerald-700 text-white p-3 rounded-2xl shadow-xl flex items-center justify-between border border-white/20 cursor-pointer active:scale-98 transition"
          >
            <div className="flex items-center gap-2.5">
              <div className="bg-white/20 px-2.5 py-1 rounded-xl font-black text-xs">
                {cart.reduce((sum, i) => sum + i.quantity, 0)} টি পদ
              </div>
              <div className="text-left">
                <p className="text-xs font-black">সর্বমোট: ৳ {subtotal}</p>
                <p className="text-[10px] text-amber-200">৫০% অগ্রীমে অর্ডার কনফার্ম করুন</p>
              </div>
            </div>
            <div className="flex items-center gap-1 bg-white text-red-700 font-black text-xs px-3 py-1.5 rounded-xl shadow-xs">
              <ShoppingBag className="w-3.5 h-3.5" />
              <span>কার্ট দেখুন ›</span>
            </div>
          </button>
        </div>
      )}

      {/* ================= PERSISTENT NATIVE MOBILE BOTTOM NAVIGATION BAR ================= */}
      {appMode === 'public' ? (
        <nav className="fixed bottom-0 left-0 right-0 max-w-[430px] mx-auto bg-white/95 backdrop-blur-md border-t border-amber-200/80 z-40 px-2 py-1.5 flex justify-around items-center shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
          {[
            { id: 'menu', label: 'মেনু', icon: Utensils, action: () => setPublicTab('menu'), active: publicTab === 'menu' && !isCartOpen && !isChatOpen },
            { id: 'tracker', label: 'ট্র্যাকিং', icon: Truck, badge: customerOrders.filter(o => o.status !== 'Delivered').length, action: () => setPublicTab('tracker'), active: publicTab === 'tracker' && !isCartOpen },
            { id: 'cart', label: 'কার্ট', icon: ShoppingBag, badge: cart.reduce((s, i) => s + i.quantity, 0), action: () => setIsCartOpen(true), active: isCartOpen },
            { id: 'profile', label: 'প্রোফাইল', icon: User, action: () => setPublicTab('profile'), active: publicTab === 'profile' && !isCartOpen },
            { id: 'reviews', label: 'রিভিউ', icon: Star, action: () => setPublicTab('reviews'), active: publicTab === 'reviews' && !isCartOpen }
          ].map(nav => {
            const Icon = nav.icon;
            return (
              <button
                key={nav.id}
                onClick={nav.action}
                className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition cursor-pointer relative ${
                  nav.active ? 'text-red-600 font-black bg-red-50/90' : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[10px] mt-0.5">{nav.label}</span>
                {nav.badge !== undefined && nav.badge > 0 && (
                  <span className="absolute -top-0.5 right-1 bg-emerald-600 text-white text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center border border-white">
                    {nav.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      ) : (
        <nav className="fixed bottom-0 left-0 right-0 max-w-[430px] mx-auto bg-white/95 backdrop-blur-md border-t border-gray-200 z-40 px-2 py-1.5 flex justify-around items-center shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
          {[
            { id: 'dashboard', label: 'হোম', icon: TrendingUp },
            { id: 'menu', label: 'মেনু', icon: Utensils },
            { id: 'orders', label: 'অর্ডার', icon: Truck, badge: orders.filter(o => o.status !== 'Delivered').length },
            { id: 'ledger', label: 'POS হিসাব', icon: BarChart2 },
            { id: 'location', label: 'লোকেশন', icon: MapPin }
          ].map(item => {
            const Icon = item.icon;
            const isActive = adminTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setAdminTab(item.id as any)}
                className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition cursor-pointer relative ${
                  isActive ? 'text-red-700 font-black bg-red-50' : 'text-gray-500 hover:text-gray-800'
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
      )}

    </div>
  );
}
