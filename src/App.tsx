/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Utensils, ShoppingBag, Truck, Award, DollarSign, Settings, 
  MessageSquare, Search, Star, Plus, Minus, Trash2, CheckCircle2, 
  Clock, ShieldCheck, Phone, Send, X, AlertCircle, ChevronRight, 
  TrendingUp, BarChart2, Bell, Globe, Sparkles, ChefHat, Tag, 
  Check, Lock, Smartphone, RefreshCw, Printer, User, ShieldAlert, LogOut, Eye,
  Calendar, FileText, ArrowUpRight, ArrowDownRight, PieChart, Users,
  Receipt, Edit3, Save, MapPin, Hash, CreditCard
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// Types
interface FoodItem {
  id: string;
  nameBn: string;
  nameEn: string;
  category: 'popular' | 'biryani' | 'fastfood' | 'curry' | 'dessert';
  price: number;
  originalPrice?: number;
  image: string;
  rating: number;
  reviewsCount: number;
  descriptionBn: string;
  descriptionEn: string;
  spicyLevel?: number;
  isVeg?: boolean;
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
  status: 'Placed' | 'Preparing' | 'Out for Delivery' | 'Delivered';
  createdAt: string;
  date: string; // YYYY-MM-DD
  loyaltyPointsEarned: number;
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

const INITIAL_MENU: FoodItem[] = [
  {
    id: '1',
    nameBn: 'স্পেশাল খাসির কাচ্চি বিরিয়ানি',
    nameEn: 'Special Mutton Kacchi Biryani',
    category: 'biryani',
    price: 320,
    originalPrice: 360,
    image: 'https://images.unsplash.com/photo-1633964913295-ceb43826e7c9?auto=format&fit=crop&w=600&q=80',
    rating: 4.9,
    reviewsCount: 142,
    descriptionBn: 'সুগন্ধি বাসমতি চাল, খাসির সুস্বাদু মাংস ও খাঁটি ঘিয়ে রান্না করা ঐতিহ্যবাহী কাচ্চি।',
    descriptionEn: 'Traditional kacchi cooked with aromatic basmati rice, tender mutton, and pure ghee.',
    spicyLevel: 2
  },
  {
    id: '2',
    nameBn: 'মুরগির তেহারি স্পেশাল',
    nameEn: 'Special Chicken Tehari',
    category: 'biryani',
    price: 180,
    originalPrice: 200,
    image: 'https://images.unsplash.com/photo-1633964913295-ceb43826e7c9?auto=format&fit=crop&w=600&q=80',
    rating: 4.7,
    reviewsCount: 98,
    descriptionBn: 'ছোট টুকরো মুরগির মাংস ও সর্ষের তেলে ফোঁড়ন দেওয়া সুস্বাদু তেহারি।',
    descriptionEn: 'Mouthwatering tehari cooked with chicken pieces and aromatic mustard oil.',
    spicyLevel: 2
  },
  {
    id: '3',
    nameBn: 'ক্রিস্পি চিকেন ফ্রাই (২ পিস)',
    nameEn: 'Crispy Chicken Fry (2 Pcs)',
    category: 'fastfood',
    price: 220,
    image: 'https://images.unsplash.com/photo-1626645738196-c2a7c87a8f58?auto=format&fit=crop&w=600&q=80',
    rating: 4.8,
    reviewsCount: 215,
    descriptionBn: 'বাইরে মুচমুচে ও ভেতরে জুসি স্পেশাল ম্যারিনেটেড চিকেন ফ্রাই।',
    descriptionEn: 'Crispy outside and juicy inside, specially marinated chicken fry.',
    spicyLevel: 1
  },
  {
    id: '4',
    nameBn: 'বিফ ভুনা খিচুড়ি',
    nameEn: 'Beef Bhuna Khichuri',
    category: 'popular',
    price: 280,
    originalPrice: 310,
    image: 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=600&q=80',
    rating: 4.9,
    reviewsCount: 180,
    descriptionBn: 'পোলাও চাল ও মুগ ডালের ভুনা খিচুড়ির সাথে স্পেশাল গরুর মাংস ভুনা।',
    descriptionEn: 'Rich bhuna khichuri served with slow-cooked spicy beef bhuna.',
    spicyLevel: 3
  },
  {
    id: '5',
    nameBn: 'সালমা স্পেশাল চিকেন বার্গার',
    nameEn: 'Salma Special Chicken Burger',
    category: 'fastfood',
    price: 250,
    image: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=600&q=80',
    rating: 4.6,
    reviewsCount: 88,
    descriptionBn: 'ডাবল চিকেন প্যাটি, স্পেশাল চিজ এবং সিগরেট সসে ভরপুর বার্গার।',
    descriptionEn: 'Double chicken patty burger loaded with melted cheese and signature sauce.',
    spicyLevel: 1
  },
  {
    id: '6',
    nameBn: 'শাহী জিলাপি ও বোরহানি কম্বো',
    nameEn: 'Shahi Jilapi & Borhani Combo',
    category: 'dessert',
    price: 150,
    image: 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=600&q=80',
    rating: 4.9,
    reviewsCount: 310,
    descriptionBn: 'গরম গরম ক্রিস্পি শাহী জিলাপি এবং রিফ্রেশিং ঠাণ্ডা বোরহানি।',
    descriptionEn: 'Crispy hot shahi jilapi paired with refreshing cool borhani.',
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
  const [adminTab, setAdminTab] = useState<'dashboard' | 'ledger' | 'reports' | 'orders' | 'customers' | 'marketing'>('dashboard');

  const todayStr = new Date().toISOString().split('T')[0];

  // 1. Passwordless Customer Database State
  const [customers, setCustomers] = useState<Record<string, CustomerProfile>>(() => {
    const saved = localStorage.getItem('salma_customers');
    if (saved) return JSON.parse(saved);
    return {
      '01712345678': {
        phone: '01712345678',
        name: 'রহিম উদ্দিন',
        address: 'ধানমন্ডি ৩২, ঢাকা',
        loyaltyPoints: 150,
        registeredAt: '2026-10-15',
        totalOrders: 3,
        totalSpent: 960
      },
      '01811223344': {
        phone: '01811223344',
        name: 'তানিয়া আক্তার',
        address: 'গুলশান ২, ঢাকা',
        loyaltyPoints: 80,
        registeredAt: '2026-10-22',
        totalOrders: 1,
        totalSpent: 440
      }
    };
  });

  // Currently Logged-in Customer (Passwordless)
  const [currentCustomer, setCurrentCustomer] = useState<CustomerProfile | null>(() => {
    const saved = localStorage.getItem('salma_logged_customer');
    return saved ? JSON.parse(saved) : null;
  });

  // Passwordless Customer Login/Register Modal
  const [customerModalOpen, setCustomerModalOpen] = useState<boolean>(false);
  const [customerPhoneInput, setCustomerPhoneInput] = useState<string>('');
  const [customerNameInput, setCustomerNameInput] = useState<string>('');
  const [customerAddressInput, setCustomerAddressInput] = useState<string>('');
  const [customerIsNew, setCustomerIsNew] = useState<boolean>(false);

  // Menu, Cart, Orders
  const [menuItems] = useState<FoodItem[]>(INITIAL_MENU);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState<boolean>(false);

  const [orders, setOrders] = useState<Order[]>(() => {
    const saved = localStorage.getItem('salma_orders');
    return saved ? JSON.parse(saved) : [
      {
        id: 'SF-1042',
        customerName: 'রহিম উদ্দিন',
        phone: '01712345678',
        address: 'ধানমন্ডি ৩২, ঢাকা',
        items: [INITIAL_MENU[0]],
        totalAmount: 320,
        discount: 0,
        advancePaid: 160,
        dueAmount: 160,
        paymentMethod: 'bKash',
        advancePaymentMethod: 'bKash',
        transactionId: 'BK-948271',
        paymentStatus: '50% Advance Paid (Due on Delivery)',
        status: 'Out for Delivery',
        createdAt: '10:30 AM',
        date: todayStr,
        loyaltyPointsEarned: 32
      }
    ];
  });

  // POS Ledger / Accounting Entries
  const [ledger, setLedger] = useState<LedgerEntry[]>(() => {
    const saved = localStorage.getItem('salma_ledger');
    return saved ? JSON.parse(saved) : [
      { id: 'l1', voucherNo: 'VCH-1001', type: 'income', category: 'খাবার বিক্রয় (Food Sales)', amount: 3200, date: todayStr, paymentMethod: 'Cash', note: 'সকালের বিক্রয় রসিদ' },
      { id: 'l2', voucherNo: 'VCH-1002', type: 'expense', category: 'কাঁচামাল ও বাজার (Raw Materials)', amount: 1200, date: todayStr, paymentMethod: 'Cash', note: 'খাসির মাংস ও চাল ক্রয়' },
      { id: 'l3', voucherNo: 'VCH-1003', type: 'expense', category: 'গ্যাস ও বিদ্যুৎ বিল (Utilities)', amount: 300, date: todayStr, paymentMethod: 'bKash', note: 'সিলিন্ডার গ্যাস রিফিল' }
    ];
  });

  // Quick POS Card Inputs
  const [quickIncomeInput, setQuickIncomeInput] = useState({ category: 'খাবার বিক্রয় (Food Sales)', amount: '', paymentMethod: 'Cash' as const, note: '' });
  const [quickExpenseInput, setQuickExpenseInput] = useState({ category: 'কাঁচামাল ও বাজার (Raw Materials)', amount: '', paymentMethod: 'Cash' as const, note: '' });

  // Reviews
  const [reviews, setReviews] = useState<Review[]>([
    { id: 'r1', customerName: 'নাজমুল ইসলাম', rating: 5, comment: 'কাচ্চি বিরিয়ানির স্বাদ অতুলনীয়! খুবই দ্রুত ডেলিভারি পেয়েছি।', date: 'আজ, সকাল ১০:৩০' },
    { id: 'r2', customerName: 'তানিয়া আক্তার', rating: 5, comment: 'চিকেন ফ্রাই এবং বোরহানি দারুণ ছিল। হাইলি রেকমেন্ডেড!', date: 'গতকাল' }
  ]);

  const [activeOffer, setActiveOffer] = useState<string>('আজকের বিশেষ অফার: যেকোনো অর্ডারে ১০% ছাড়! কোড: SALMA10');
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

  // Sync checkout form when currentCustomer changes
  useEffect(() => {
    if (currentCustomer) {
      setCheckoutForm(prev => ({
        ...prev,
        name: currentCustomer.name,
        phone: currentCustomer.phone,
        address: currentCustomer.address
      }));
    }
  }, [currentCustomer]);

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
    localStorage.setItem('salma_orders', JSON.stringify(orders));
  }, [orders]);

  useEffect(() => {
    localStorage.setItem('salma_ledger', JSON.stringify(ledger));
  }, [ledger]);

  // -------------------------------------------------------------
  // PASSWORDLESS CUSTOMER AUTHENTICATION HANDLERS
  // -------------------------------------------------------------
  const handleCheckPhone = (phoneNum: string) => {
    const cleaned = phoneNum.trim();
    if (customers[cleaned]) {
      setCustomerIsNew(false);
      setCustomerNameInput(customers[cleaned].name);
      setCustomerAddressInput(customers[cleaned].address);
    } else {
      setCustomerIsNew(true);
      setCustomerNameInput('');
      setCustomerAddressInput('');
    }
  };

  const handlePasswordlessLoginOrRegister = (e: React.FormEvent) => {
    e.preventDefault();
    const phone = customerPhoneInput.trim();
    if (!phone || phone.length < 8) {
      alert('সঠিক মোবাইল নম্বর প্রদান করুন (যেমন: 01712345678)');
      return;
    }

    if (customers[phone]) {
      // Existing customer: instant login without password
      const profile = customers[phone];
      setCurrentCustomer(profile);
      setCustomerModalOpen(false);
      alert(`স্বাগতম, ${profile.name}! আপনার প্রোফাইল সফলভাবে লোড হয়েছে।`);
    } else {
      // New customer: requires name & address to complete profile
      if (!customerNameInput.trim() || !customerAddressInput.trim()) {
        alert('নতুন প্রোফাইল তৈরি করতে অনুগ্রহ করে আপনার নাম ও ডেলিভারি ঠিকানা পূরণ করুন।');
        return;
      }
      const newProfile: CustomerProfile = {
        phone,
        name: customerNameInput.trim(),
        address: customerAddressInput.trim(),
        loyaltyPoints: 50, // Welcome gift 50 points
        registeredAt: todayStr,
        totalOrders: 0,
        totalSpent: 0
      };
      setCustomers(prev => ({ ...prev, [phone]: newProfile }));
      setCurrentCustomer(newProfile);
      setCustomerModalOpen(false);
      alert(`ধন্যবাদ, ${newProfile.name}! সালমা ফুড কর্ণারে আপনার প্রোফাইল তৈরি হয়েছে এবং ৫০ বোনাস লয়্যালটি পয়েন্ট যুক্ত হয়েছে।`);
    }
  };

  const handleCustomerLogout = () => {
    setCurrentCustomer(null);
    setCheckoutForm(prev => ({ ...prev, name: '', phone: '', address: '' }));
    alert('সফলভাবে লগআউট করা হয়েছে।');
  };

  const handleUpdateCustomerProfile = (name: string, address: string) => {
    if (!currentCustomer) return;
    const updated = { ...currentCustomer, name, address };
    setCurrentCustomer(updated);
    setCustomers(prev => ({ ...prev, [updated.phone]: updated }));
    alert('আপনার প্রোফাইল তথ্য সফলভাবে আপডেট হয়েছে!');
  };

  // -------------------------------------------------------------
  // CART & CHECKOUT WITH AUTO PROFILE REGISTRATION
  // -------------------------------------------------------------
  const addToCart = (item: FoodItem) => {
    setCart(prev => {
      const existing = prev.find(i => i.id === item.id);
      if (existing) {
        return prev.map(i => i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, { ...item, quantity: 1 }];
    });
    setIsCartOpen(true);
  };

  const updateQuantity = (id: string, delta: number) => {
    setCart(prev => prev.map(i => {
      if (i.id === id) {
        const newQty = i.quantity + delta;
        return newQty > 0 ? { ...i, quantity: newQty } : null;
      }
      return i;
    }).filter(Boolean) as CartItem[]);
  };

  const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const deliveryFee = subtotal > 500 ? 0 : 60;
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
    const phone = checkoutForm.phone.trim();
    const name = checkoutForm.name.trim();
    const address = checkoutForm.address.trim();

    if (!phone || !name || !address) {
      alert('দয়া করে আপনার মোবাইল নম্বর, নাম এবং ডেলিভারি ঠিকানা পূরণ করুন।');
      return;
    }
    if (cart.length === 0) return;

    const pointsEarned = Math.floor(finalTotal / 10);

    // AUTO PROFILE CREATION / UPDATE IN DATABASE (PASSWORDLESS)
    let updatedProfile: CustomerProfile;
    if (customers[phone]) {
      const existing = customers[phone];
      updatedProfile = {
        ...existing,
        name,
        address,
        loyaltyPoints: existing.loyaltyPoints + pointsEarned - (checkoutForm.useLoyalty ? Math.round(loyaltyDiscount * 2) : 0),
        totalOrders: existing.totalOrders + 1,
        totalSpent: existing.totalSpent + finalTotal
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

    setCustomers(prev => ({ ...prev, [phone]: updatedProfile }));
    setCurrentCustomer(updatedProfile);

    // Auto-generate or use Transaction ID
    const trxId = checkoutForm.transactionId.trim() || 
      (checkoutForm.advancePaymentMethod === 'bKash' ? 'BK-' : checkoutForm.advancePaymentMethod === 'Nagad' ? 'NG-' : 'CD-') + 
      Math.floor(100000 + Math.random() * 900000);

    // Create Order with Advance Payment and Due Amount
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
      loyaltyPointsEarned: pointsEarned
    };

    setOrders(prev => [newOrder, ...prev]);

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
    setLedger(prev => [autoLedgerEntry, ...prev]);

    setOrderSuccessModal(newOrder);
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
    setLedger(prev => [entry, ...prev]);
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
    setLedger(prev => [entry, ...prev]);
    setQuickExpenseInput({ category: 'কাঁচামাল ও বাজার (Raw Materials)', amount: '', paymentMethod: 'Cash', note: '' });
    alert('সফলভাবে আজকের ব্যয় হিসাব যুক্ত হয়েছে!');
  };

  const handleDeleteLedgerEntry = (id: string) => {
    if (confirm('আপনি কি এই হিসাব এন্ট্রিটি মুছে ফেলতে চান?')) {
      setLedger(prev => prev.filter(l => l.id !== id));
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

  // Customer's own orders if logged in
  const customerOrders = currentCustomer 
    ? orders.filter(o => o.phone === currentCustomer.phone)
    : orders;

  return (
    <div className="min-h-screen bg-amber-50/50 flex flex-col font-sans text-gray-800">
      
      {/* Top Notification Bar */}
      {showOfferBanner && (
        <div className="bg-gradient-to-r from-red-600 via-amber-500 to-emerald-600 text-white text-xs sm:text-sm py-2 px-4 text-center font-medium flex items-center justify-between shadow-md">
          <div className="flex items-center gap-2 mx-auto">
            <Sparkles className="w-4 h-4 animate-spin" />
            <span>{activeOffer}</span>
          </div>
          <button onClick={() => setShowOfferBanner(false)} className="hover:bg-black/10 p-1 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Offline Status */}
      {!isOnline && (
        <div className="bg-red-500 text-white text-xs py-1 px-4 text-center flex items-center justify-center gap-2">
          <AlertCircle className="w-3.5 h-3.5" />
          <span>অফলাইন মোড সক্রিয় (লোকাল ডাটাবেজে ডাটা সংরক্ষিত হচ্ছে)</span>
        </div>
      )}

      {/* Main Header */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur shadow-sm border-b border-amber-200">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-2">
          
          {/* Logo & Brand */}
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full bg-gradient-to-tr from-red-500 via-amber-500 to-emerald-500 flex items-center justify-center text-white shadow-md">
              <ChefHat className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-bold bg-gradient-to-r from-red-600 to-emerald-700 bg-clip-text text-transparent">
                সালমা ফুড কর্ণার
              </h1>
              <p className="text-[11px] text-gray-500 hidden sm:block">সুস্বাদু ও ঐতিহ্যবাহী খাবারের বিশ্বস্ত ঠিকানা</p>
            </div>
          </div>

          {/* Portal Switcher (Public vs Admin) */}
          <div className="flex items-center bg-amber-100/70 p-1 rounded-full border border-amber-300">
            <button
              onClick={() => setAppMode('public')}
              className={`px-3 sm:px-4 py-1.5 rounded-full text-xs sm:text-sm font-bold transition flex items-center gap-1.5 ${
                appMode === 'public' ? 'bg-emerald-600 text-white shadow' : 'text-gray-700 hover:text-emerald-700'
              }`}
            >
              <User className="w-3.5 h-3.5" />
              <span>গ্রাহক (Public)</span>
            </button>
            <button
              onClick={() => {
                if (!isAdminAuthenticated) {
                  setAdminLoginModal(true);
                } else {
                  setAppMode('admin');
                }
              }}
              className={`px-3 sm:px-4 py-1.5 rounded-full text-xs sm:text-sm font-bold transition flex items-center gap-1.5 ${
                appMode === 'admin' ? 'bg-red-600 text-white shadow' : 'text-gray-700 hover:text-red-700'
              }`}
            >
              <Lock className="w-3.5 h-3.5" />
              <span>এডমিন (Admin)</span>
            </button>
          </div>

          {/* Right Area: Passwordless Customer Login Button & Cart */}
          <div className="flex items-center gap-2 sm:gap-3">
            {appMode === 'public' && (
              <>
                {currentCustomer ? (
                  <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-300 px-3 py-1.5 rounded-full">
                    <div className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center text-xs font-bold">
                      {currentCustomer.name.charAt(0)}
                    </div>
                    <div className="hidden sm:block text-left text-xs">
                      <p className="font-bold text-gray-800 leading-tight">{currentCustomer.name}</p>
                      <p className="text-[10px] text-emerald-700 font-semibold">🎁 {currentCustomer.loyaltyPoints} Pts</p>
                    </div>
                    <button 
                      onClick={handleCustomerLogout}
                      className="text-gray-400 hover:text-red-600 p-1"
                      title="লগআউট"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      setCustomerPhoneInput('');
                      setCustomerNameInput('');
                      setCustomerAddressInput('');
                      setCustomerIsNew(false);
                      setCustomerModalOpen(true);
                    }}
                    className="bg-amber-500 hover:bg-amber-600 text-white px-3 sm:px-4 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 shadow transition"
                  >
                    <Smartphone className="w-3.5 h-3.5" />
                    <span>লগইন / রেজিস্টার</span>
                  </button>
                )}

                <button 
                  onClick={() => setIsCartOpen(true)}
                  className="relative bg-red-600 hover:bg-red-700 text-white p-2.5 rounded-full shadow-md transition flex items-center justify-center"
                >
                  <ShoppingBag className="w-5 h-5" />
                  {cart.length > 0 && (
                    <span className="absolute -top-1 -right-1 bg-emerald-600 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center border-2 border-white">
                      {cart.reduce((sum, i) => sum + i.quantity, 0)}
                    </span>
                  )}
                </button>
              </>
            )}

            {appMode === 'admin' && isAdminAuthenticated && (
              <button 
                onClick={() => {
                  setIsAdminAuthenticated(false);
                  setAppMode('public');
                }}
                className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1"
              >
                <LogOut className="w-3.5 h-3.5 text-red-600" />
                <span>লগআউট</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ================= PASSWORDLESS CUSTOMER AUTH MODAL ================= */}
      {customerModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl space-y-4 border border-amber-200">
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-amber-100 text-amber-700 rounded-2xl flex items-center justify-center shadow-inner">
                  <Smartphone className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">পাসওয়ার্ড ছাড়া কাস্টমার লগইন</h3>
                  <p className="text-xs text-gray-500">শুধুমাত্র মোবাইল নম্বর দিয়ে তৎক্ষণাৎ লগইন করুন</p>
                </div>
              </div>
              <button onClick={() => setCustomerModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handlePasswordlessLoginOrRegister} className="space-y-4 pt-2">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">আপনার মোবাইল নম্বর (Mobile Number)</label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
                  <input 
                    type="tel"
                    placeholder="01712345678"
                    value={customerPhoneInput}
                    onChange={(e) => {
                      setCustomerPhoneInput(e.target.value);
                      handleCheckPhone(e.target.value);
                    }}
                    className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-amber-500"
                    required
                  />
                </div>
                {customerPhoneInput.length >= 8 && !customerIsNew && (
                  <p className="text-xs text-emerald-600 font-bold mt-1 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>রেজিস্টার্ড গ্রাহক পাওয়া গেছে: {customerNameInput}</span>
                  </p>
                )}
                {customerPhoneInput.length >= 8 && customerIsNew && (
                  <p className="text-xs text-amber-600 font-bold mt-1 flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>নতুন গ্রাহক! নিচের নাম ও ঠিকানা দিয়ে প্রোফাইল সম্পূর্ণ করুন (বোনাস ৫০ পয়েন্ট পাবেন)</span>
                  </p>
                )}
              </div>

              {/* Show Name and Address if new customer */}
              {customerIsNew && (
                <div className="space-y-3 bg-amber-50 p-4 rounded-2xl border border-amber-200">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">আপনার নাম (Full Name)</label>
                    <input 
                      type="text"
                      placeholder="যেমন: সায়মা বেগম"
                      value={customerNameInput}
                      onChange={(e) => setCustomerNameInput(e.target.value)}
                      className="w-full p-2.5 border border-amber-300 rounded-xl text-xs bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">ডেলিভারি ঠিকানা (Delivery Address)</label>
                    <textarea 
                      placeholder="বাড়ি নং, রোড নং, এলাকা, ঢাকা"
                      value={customerAddressInput}
                      onChange={(e) => setCustomerAddressInput(e.target.value)}
                      rows={2}
                      className="w-full p-2.5 border border-amber-300 rounded-xl text-xs bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                      required
                    />
                  </div>
                </div>
              )}

              <button 
                type="submit"
                className="w-full bg-gradient-to-r from-red-600 to-emerald-600 text-white font-bold py-3 rounded-xl text-sm shadow-md transition active:scale-95"
              >
                {customerIsNew ? 'রেজিস্টার ও লগইন করুন' : 'লগইন করুন (পাসওয়ার্ড ছাড়া)'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ================= ADMIN LOGIN MODAL ================= */}
      {adminLoginModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-sm w-full shadow-2xl space-y-4 border border-red-200">
            <div className="w-14 h-14 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
              <ShieldAlert className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 text-center">এডমিন প্যানেল সিকিউরিটি</h3>
            <p className="text-xs text-gray-500 text-center">এডমিন পিন দিন (ডিফল্ট পাসওয়ার্ড: 1234)</p>
            <input 
              type="password"
              maxLength={6}
              value={adminPinInput}
              onChange={(e) => setAdminPinInput(e.target.value)}
              placeholder="••••"
              className="w-full text-center tracking-widest text-lg border border-gray-300 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-red-500"
            />
            <div className="flex gap-2 pt-2">
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
          </div>
        </div>
      )}

      {/* Main Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6">
        
        {/* ========================================================= */}
        {/*                      PUBLIC PORTAL                        */}
        {/* ========================================================= */}
        {appMode === 'public' && (
          <div className="space-y-6">
            
            {/* Customer Status Bar Banner */}
            {currentCustomer ? (
              <div className="bg-gradient-to-r from-emerald-600 via-teal-600 to-amber-600 text-white rounded-2xl p-4 shadow-md flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur flex items-center justify-center font-bold text-sm">
                    {currentCustomer.name.charAt(0)}
                  </div>
                  <div>
                    <h3 className="font-bold text-sm sm:text-base">স্বাগতম, {currentCustomer.name}!</h3>
                    <p className="text-xs text-amber-100 flex items-center gap-2">
                      <span>📱 {currentCustomer.phone}</span>
                      <span>•</span>
                      <span>📍 {currentCustomer.address}</span>
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
                  <div className="bg-white/20 backdrop-blur px-3 py-1.5 rounded-xl text-xs font-bold">
                    🎁 লয়্যালটি পয়েন্ট: <span className="text-amber-200 font-extrabold">{currentCustomer.loyaltyPoints}</span>
                  </div>
                  <button 
                    onClick={() => setPublicTab('profile')}
                    className="bg-white text-emerald-800 hover:bg-amber-100 px-3 py-1.5 rounded-xl text-xs font-bold transition shadow-xs"
                  >
                    আমার প্রোফাইল
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-gradient-to-r from-amber-500 to-red-500 text-white rounded-2xl p-3 px-4 shadow-sm flex justify-between items-center text-xs">
                <span>💡 কোনো পাসওয়ার্ড লাগবে না! শুধু মোবাইল নম্বর দিয়েই অর্ডার ও প্রোফাইল নিয়ন্ত্রণ করুন।</span>
                <button 
                  onClick={() => setCustomerModalOpen(true)}
                  className="bg-white text-red-600 font-bold px-3 py-1 rounded-full shadow-xs hover:bg-amber-50"
                >
                  লগইন করুন
                </button>
              </div>
            )}

            {/* Public Navigation */}
            <div className="flex items-center justify-center gap-2 bg-amber-100/60 p-1.5 rounded-2xl border border-amber-200 max-w-xl mx-auto">
              {[
                { id: 'menu', label: 'মেনু ও অর্ডার', icon: Utensils },
                { id: 'tracker', label: 'ডেলিভারি ট্র্যাকিং', icon: Truck },
                { id: 'profile', label: 'আমার প্রোফাইল', icon: User },
                { id: 'reviews', label: 'গ্রাহক রিভিউ', icon: MessageSquare }
              ].map(tab => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setPublicTab(tab.id as any)}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs sm:text-sm font-bold transition ${
                      publicTab === tab.id ? 'bg-red-600 text-white shadow' : 'text-gray-700 hover:bg-amber-200/60'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {/* TAB 1: MENU & ORDER */}
            {publicTab === 'menu' && (
              <div className="space-y-6">
                <div className="bg-gradient-to-r from-red-600 via-amber-500 to-emerald-600 rounded-2xl p-6 md:p-10 text-white shadow-xl relative overflow-hidden">
                  <div className="max-w-xl relative z-10 space-y-3">
                    <span className="bg-white/20 backdrop-blur text-xs uppercase px-3 py-1 rounded-full font-semibold">
                      ⭐ সালমা ফুড কর্ণার স্পেশাল
                    </span>
                    <h2 className="text-2xl sm:text-4xl font-extrabold leading-tight">
                      খাঁটি স্বাদে গরম গরম খাবার অর্ডার করুন মুহূর্তেই
                    </h2>
                    
                    <div className="relative mt-4">
                      <Search className="absolute left-4 top-3.5 w-5 h-5 text-gray-400" />
                      <input 
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="কাচ্চি, তেহারি, চিকেন ফ্রাই বা বার্গার খুঁজুন..."
                        className="w-full bg-white text-gray-800 placeholder-gray-400 pl-12 pr-4 py-3 rounded-xl shadow-lg focus:outline-none text-sm"
                      />
                    </div>
                  </div>
                </div>

                {/* Categories */}
                <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
                  {[
                    { id: 'all', label: 'সব খাবার' },
                    { id: 'popular', label: 'জনপ্রিয়' },
                    { id: 'biryani', label: 'বিরিয়ানি ও পোলাও' },
                    { id: 'fastfood', label: 'ফাস্ট ফুড' },
                    { id: 'curry', label: 'মাংস ও কারি' },
                    { id: 'dessert', label: 'ডেজার্ট ও ড্রিংকস' }
                  ].map(cat => (
                    <button
                      key={cat.id}
                      onClick={() => setCategoryFilter(cat.id)}
                      className={`px-4 py-2 rounded-full text-xs sm:text-sm font-medium whitespace-nowrap transition shadow-xs ${
                        categoryFilter === cat.id ? 'bg-amber-500 text-white shadow-md font-bold' : 'bg-white text-gray-700 hover:bg-amber-100 border border-amber-200'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>

                {/* Food Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredMenu.map(item => (
                    <div key={item.id} className="bg-white rounded-2xl overflow-hidden shadow-md hover:shadow-xl transition border border-amber-100 flex flex-col justify-between">
                      <div>
                        <div className="relative h-48 overflow-hidden bg-amber-50">
                          <img src={item.image} alt={item.nameBn} className="w-full h-full object-cover hover:scale-105 transition duration-300" />
                          <div className="absolute top-3 right-3 bg-white/90 px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1 shadow">
                            <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                            <span>{item.rating} ({item.reviewsCount})</span>
                          </div>
                        </div>
                        <div className="p-4 space-y-2">
                          <h3 className="font-bold text-base sm:text-lg text-gray-900">{item.nameBn}</h3>
                          <p className="text-xs text-gray-600 line-clamp-2">{item.descriptionBn}</p>
                        </div>
                      </div>
                      <div className="p-4 pt-0 flex items-center justify-between border-t border-gray-100 mt-2">
                        <span className="text-lg font-extrabold text-red-600">৳ {item.price}</span>
                        <button
                          onClick={() => addToCart(item)}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-1.5 shadow"
                        >
                          <Plus className="w-4 h-4" />
                          <span>কার্টে যোগ করুন</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
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
                              <p className="text-[10px] text-gray-400">তারিখ: {order.date} • {order.createdAt}</p>
                            </div>
                          </div>

                          {/* Progress steps */}
                          <div className="grid grid-cols-4 gap-2 text-center text-xs font-semibold py-2">
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
                                <div key={st.key} className="flex flex-col items-center gap-1">
                                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${isCompleted ? 'bg-emerald-600 text-white' : 'bg-gray-200 text-gray-500'} ${isCurrent ? 'ring-4 ring-emerald-200 animate-pulse' : ''}`}>
                                    {idx + 1}
                                  </div>
                                  <span className={`text-[10px] sm:text-xs ${isCurrent ? 'text-emerald-700 font-bold' : 'text-gray-600'}`}>{st.label}</span>
                                </div>
                              );
                            })}
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
                {currentCustomer ? (
                  <div className="bg-white rounded-2xl p-6 sm:p-8 shadow-md border border-amber-200 space-y-6">
                    <div className="flex justify-between items-center border-b pb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-600 to-amber-500 text-white flex items-center justify-center font-extrabold text-xl shadow">
                          {currentCustomer.name.charAt(0)}
                        </div>
                        <div>
                          <h2 className="text-xl font-bold text-gray-900">{currentCustomer.name}</h2>
                          <p className="text-xs text-gray-500 font-mono">📱 {currentCustomer.phone} (পাসওয়ার্ড ছাড়া সুরক্ষিত প্রোফাইল)</p>
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
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-amber-50 p-4 rounded-xl border border-amber-200 text-center">
                        <p className="text-xs text-gray-500">মোট অর্ডার সংখ্যা</p>
                        <p className="text-xl font-extrabold text-gray-900">{currentCustomer.totalOrders} টি</p>
                      </div>
                      <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-200 text-center">
                        <p className="text-xs text-gray-500">মোট ব্যয়</p>
                        <p className="text-xl font-extrabold text-emerald-700">৳ {currentCustomer.totalSpent}</p>
                      </div>
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
                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 rounded-xl text-xs shadow"
                      >
                        প্রোফাইল সংরক্ষণ করুন
                      </button>
                    </form>
                  </div>
                ) : (
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
                        <span className="text-xs text-gray-400">{rev.date}</span>
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
            
            <div className="bg-gradient-to-r from-red-700 via-amber-700 to-emerald-800 text-white p-4 rounded-2xl shadow-md flex justify-between items-center">
              <div className="flex items-center gap-3">
                <ShieldAlert className="w-7 h-7 text-amber-300" />
                <div>
                  <h2 className="text-lg font-bold">সালমা ফুড রেস্টুরেন্ট এডমিন প্যানেল</h2>
                  <p className="text-xs opacity-90">POS লেজার, আর্থিক রিপোর্ট এবং গ্রাহক ডাটাবেজ</p>
                </div>
              </div>
            </div>

            {/* Admin Sub-Navigation */}
            <div className="flex items-center gap-2 overflow-x-auto bg-white p-2 rounded-2xl shadow-sm border border-amber-200 scrollbar-none">
              {[
                { id: 'dashboard', label: 'ড্যাশবোর্ড', icon: TrendingUp },
                { id: 'ledger', label: 'POS লেজার খতিয়ান', icon: BarChart2 },
                { id: 'reports', label: 'আর্থিক রিপোর্টস', icon: FileText },
                { id: 'orders', label: 'অর্ডার তালিকা', icon: Truck },
                { id: 'customers', label: 'গ্রাহক ডাটাবেজ', icon: Users },
                { id: 'marketing', label: 'বাল্ক এসএমএস', icon: Smartphone }
              ].map(tab => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setAdminTab(tab.id as any)}
                    className={`flex items-center gap-2 py-2 px-4 rounded-xl text-xs font-bold transition whitespace-nowrap ${
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
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                  <div className="bg-white p-6 rounded-2xl shadow-md border border-amber-200 flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold">
                      <TrendingUp className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">মোট বিক্রয় ও আয় (Total Sales)</p>
                      <p className="text-2xl font-extrabold text-gray-900">৳ {totalIncome}</p>
                    </div>
                  </div>
                  <div className="bg-white p-6 rounded-2xl shadow-md border border-amber-200 flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-red-100 text-red-600 flex items-center justify-center font-bold">
                      <ShoppingBag className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">মোট অর্ডার (Total Orders)</p>
                      <p className="text-2xl font-extrabold text-gray-900">{orders.length} টি</p>
                    </div>
                  </div>
                  <div className="bg-white p-6 rounded-2xl shadow-md border border-amber-200 flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center font-bold">
                      <DollarSign className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">নিট প্রফিট (Net Balance)</p>
                      <p className={`text-2xl font-extrabold ${totalIncome - totalExpense >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                        ৳ {totalIncome - totalExpense}
                      </p>
                    </div>
                  </div>
                </div>

                {/* THE 2 FUNCTIONAL POS LEDGER CARDS */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  
                  {/* Card 1: Daily Income Functional Card */}
                  <div className="bg-gradient-to-br from-emerald-50 to-emerald-100/60 rounded-2xl p-6 shadow-md border border-emerald-300 space-y-4">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold shadow">
                          <ArrowUpRight className="w-5 h-5" />
                        </div>
                        <div>
                          <h4 className="font-bold text-gray-900 text-base">দৈনিক আয় হিসাব (Today's Income)</h4>
                          <p className="text-xs text-emerald-700 font-semibold">{todayStr}</p>
                        </div>
                      </div>
                      <span className="text-2xl font-extrabold text-emerald-700">৳ {todayIncome}</span>
                    </div>

                    <form onSubmit={handleAddQuickIncome} className="space-y-3 bg-white/90 p-4 rounded-xl border border-emerald-200">
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
                  <div className="bg-gradient-to-br from-red-50 to-red-100/60 rounded-2xl p-6 shadow-md border border-red-300 space-y-4">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <div className="w-10 h-10 rounded-xl bg-red-600 text-white flex items-center justify-center font-bold shadow">
                          <ArrowDownRight className="w-5 h-5" />
                        </div>
                        <div>
                          <h4 className="font-bold text-gray-900 text-base">দৈনিক ব্যয় হিসাব (Today's Expense)</h4>
                          <p className="text-xs text-red-700 font-semibold">{todayStr}</p>
                        </div>
                      </div>
                      <span className="text-2xl font-extrabold text-red-700">৳ {todayExpense}</span>
                    </div>

                    <form onSubmit={handleAddQuickExpense} className="space-y-3 bg-white/90 p-4 rounded-xl border border-red-200">
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

            {/* ================= ADMIN TAB: POS LEDGER TABLE ================= */}
            {adminTab === 'ledger' && (
              <div className="bg-white rounded-2xl p-6 shadow-md border border-amber-200 space-y-4">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                  <div>
                    <h3 className="font-bold text-lg text-gray-900">হিসাব-নিকাশ লেজার খতিয়ান (POS Ledger)</h3>
                    <p className="text-xs text-gray-500">মোট {ledger.length} টি লেনদেন সংরক্ষিত আছে</p>
                  </div>
                  <button 
                    onClick={() => setAdminTab('dashboard')}
                    className="bg-amber-500 hover:bg-amber-600 text-white font-bold px-3 py-1.5 rounded-xl text-xs flex items-center gap-1 shadow"
                  >
                    <ArrowUpRight className="w-3.5 h-3.5" />
                    <span>ড্যাশবোর্ড এন্ট্রি কার্ড</span>
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-amber-100 text-gray-700 border-b border-amber-200">
                        <th className="p-3">তারিখ</th>
                        <th className="p-3">ভাউচার নং</th>
                        <th className="p-3">টাইপ</th>
                        <th className="p-3">খাত</th>
                        <th className="p-3">মাধ্যম</th>
                        <th className="p-3">বিবরণ</th>
                        <th className="p-3 text-right">পরিমাণ</th>
                        <th className="p-3 text-center">অ্যাকশন</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ledger.map(entry => (
                        <tr key={entry.id} className="border-b border-gray-100 hover:bg-amber-50/40">
                          <td className="p-3 text-gray-500 font-mono">{entry.date}</td>
                          <td className="p-3 font-mono font-bold text-gray-700">{entry.voucherNo}</td>
                          <td className="p-3">
                            <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${entry.type === 'income' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                              {entry.type === 'income' ? 'আয়' : 'ব্যয়'}
                            </span>
                          </td>
                          <td className="p-3 font-semibold text-gray-800">{entry.category}</td>
                          <td className="p-3 font-medium text-gray-600">{entry.paymentMethod}</td>
                          <td className="p-3 text-gray-600">{entry.note}</td>
                          <td className={`p-3 text-right font-extrabold ${entry.type === 'income' ? 'text-emerald-700' : 'text-red-600'}`}>
                            {entry.type === 'income' ? '+' : '-'}৳ {entry.amount}
                          </td>
                          <td className="p-3 text-center">
                            <button 
                              onClick={() => handleDeleteLedgerEntry(entry.id)}
                              className="text-gray-400 hover:text-red-600 p-1"
                              title="মুছে ফেলুন"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ================= ADMIN TAB 4: REPORTS ================= */}
            {adminTab === 'reports' && (
              <div className="bg-white rounded-2xl p-6 shadow-md border border-amber-200 space-y-6">
                <h3 className="font-bold text-lg text-gray-900 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-red-600" />
                  <span>রেস্টুরেন্ট আর্থিক রিপোর্ট (দৈনিক, মাসিক ও বাৎসরিক)</span>
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Daily Report */}
                  <div className="bg-amber-50/70 border border-amber-200 rounded-2xl p-5 space-y-4">
                    <div className="flex items-center justify-between border-b pb-3">
                      <h4 className="font-bold text-gray-900 flex items-center gap-1.5">
                        <Calendar className="w-4 h-4 text-amber-600" />
                        <span>দৈনিক রিপোর্ট (Today)</span>
                      </h4>
                      <span className="text-xs text-gray-500 font-mono">{todayStr}</span>
                    </div>
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-gray-600">মোট আয়:</span>
                        <span className="font-bold text-emerald-700">৳ {todayIncome}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">মোট ব্যয়:</span>
                        <span className="font-bold text-red-600">৳ {todayExpense}</span>
                      </div>
                      <div className="flex justify-between pt-2 border-t font-extrabold text-sm">
                        <span>নিট লাভ:</span>
                        <span className={todayIncome - todayExpense >= 0 ? 'text-emerald-700' : 'text-red-600'}>
                          ৳ {todayIncome - todayExpense}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Monthly Report */}
                  <div className="bg-amber-50/70 border border-amber-200 rounded-2xl p-5 space-y-4">
                    <div className="flex items-center justify-between border-b pb-3">
                      <h4 className="font-bold text-gray-900 flex items-center gap-1.5">
                        <Calendar className="w-4 h-4 text-emerald-600" />
                        <span>মাসিক রিপোর্ট (This Month)</span>
                      </h4>
                      <span className="text-xs text-gray-500 font-mono">{currentMonthPrefix}</span>
                    </div>
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-gray-600">মোট আয়:</span>
                        <span className="font-bold text-emerald-700">৳ {monthlyIncome}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">মোট ব্যয়:</span>
                        <span className="font-bold text-red-600">৳ {monthlyExpense}</span>
                      </div>
                      <div className="flex justify-between pt-2 border-t font-extrabold text-sm">
                        <span>নিট লাভ:</span>
                        <span className={monthlyIncome - monthlyExpense >= 0 ? 'text-emerald-700' : 'text-red-600'}>
                          ৳ {monthlyIncome - monthlyExpense}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Yearly Report */}
                  <div className="bg-amber-50/70 border border-amber-200 rounded-2xl p-5 space-y-4">
                    <div className="flex items-center justify-between border-b pb-3">
                      <h4 className="font-bold text-gray-900 flex items-center gap-1.5">
                        <Calendar className="w-4 h-4 text-red-600" />
                        <span>বাৎসরিক রিপোর্ট (This Year)</span>
                      </h4>
                      <span className="text-xs text-gray-500 font-mono">{currentYearPrefix}</span>
                    </div>
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-gray-600">মোট আয়:</span>
                        <span className="font-bold text-emerald-700">৳ {yearlyIncome}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">মোট ব্যয়:</span>
                        <span className="font-bold text-red-600">৳ {yearlyExpense}</span>
                      </div>
                      <div className="flex justify-between pt-2 border-t font-extrabold text-sm">
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
              <div className="bg-white rounded-2xl p-6 shadow-md border border-amber-200 space-y-4">
                <h3 className="font-bold text-lg text-gray-900">সকল গ্রাহক অর্ডার তালিকা</h3>
                <div className="space-y-4">
                  {orders.map(order => (
                    <div key={order.id} className="border border-amber-200 rounded-xl p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-amber-50/40">
                      <div>
                        <span className="bg-red-600 text-white text-xs font-bold px-2 py-0.5 rounded">{order.id}</span>
                        <h4 className="font-bold text-gray-800 mt-1">{order.customerName} ({order.phone})</h4>
                        <p className="text-xs font-semibold text-gray-800 mt-1">
                          সর্বমোট বিল: <span className="font-extrabold text-gray-900">৳ {order.totalAmount}</span> • 
                          <span className="text-emerald-700 font-bold ml-1">অগ্রীম প্রাপ্ত: ৳ {order.advancePaid} ({order.advancePaymentMethod || 'bKash'}) ✓</span>
                          {order.dueAmount > 0 ? (
                            <span className="text-red-600 font-bold ml-1">• বাকি প্রদেয়: ৳ {order.dueAmount} (নগদ)</span>
                          ) : (
                            <span className="text-emerald-600 font-bold ml-1">• সম্পূর্ণ পরিশোধিত</span>
                          )}
                        </p>
                        {order.transactionId && (
                          <p className="text-[10px] font-mono text-gray-500">
                            TrxID: <span className="font-bold text-gray-700">{order.transactionId}</span>
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {['Placed', 'Preparing', 'Out for Delivery', 'Delivered'].map(st => (
                          <button
                            key={st}
                            onClick={() => {
                              setOrders(prev => prev.map(o => o.id === order.id ? { ...o, status: st as any } : o));
                            }}
                            className={`px-2.5 py-1 rounded text-xs font-semibold ${order.status === st ? 'bg-amber-500 text-white' : 'bg-white border text-gray-700'}`}
                          >
                            {st}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ================= ADMIN TAB 6: CUSTOMERS DATABASE ================= */}
            {adminTab === 'customers' && (
              <div className="bg-white rounded-2xl p-6 shadow-md border border-amber-200 space-y-4">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="font-bold text-lg text-gray-900 flex items-center gap-2">
                      <Users className="w-5 h-5 text-emerald-600" />
                      <span>সংরক্ষিত গ্রাহক প্রোফাইল ডাটাবেজ (Customer Database)</span>
                    </h3>
                    <p className="text-xs text-gray-500">গ্রাহকদের মোবাইল নম্বর ভিত্তিক পাসওয়ার্ডহীন অটোমেটিক প্রোফাইল</p>
                  </div>
                  <span className="bg-emerald-100 text-emerald-800 font-bold text-xs px-3 py-1 rounded-full">
                    মোট {Object.keys(customers).length} জন গ্রাহক
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-amber-100 text-gray-700 border-b border-amber-200">
                        <th className="p-3">মোবাইল নম্বর</th>
                        <th className="p-3">গ্রাহকের নাম</th>
                        <th className="p-3">ডেলিভারি ঠিকানা</th>
                        <th className="p-3 text-center">লয়্যালটি পয়েন্ট</th>
                        <th className="p-3 text-center">মোট অর্ডার</th>
                        <th className="p-3 text-right">মোট ক্রয়</th>
                        <th className="p-3">রেজিস্ট্রেশন তারিখ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.values(customers).map(cust => (
                        <tr key={cust.phone} className="border-b border-gray-100 hover:bg-amber-50/40">
                          <td className="p-3 font-mono font-bold text-gray-900">{cust.phone}</td>
                          <td className="p-3 font-semibold text-emerald-800">{cust.name}</td>
                          <td className="p-3 text-gray-600">{cust.address}</td>
                          <td className="p-3 text-center font-bold text-amber-600">🎁 {cust.loyaltyPoints}</td>
                          <td className="p-3 text-center font-bold text-gray-700">{cust.totalOrders} টি</td>
                          <td className="p-3 text-right font-extrabold text-emerald-700">৳ {cust.totalSpent}</td>
                          <td className="p-3 text-gray-400 font-mono">{cust.registeredAt}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ================= ADMIN TAB 7: MARKETING ================= */}
            {adminTab === 'marketing' && (
              <div className="bg-white rounded-2xl p-6 shadow-md border border-amber-200 space-y-6">
                <h3 className="font-bold text-lg text-gray-900">বাল্ক এসএমএস মার্কেটিং ও অফার</h3>
                <div className="space-y-3">
                  <label className="block text-xs font-semibold">বিজ্ঞাপন ব্যানার অফার টেক্সট</label>
                  <input 
                    type="text" 
                    value={activeOffer} 
                    onChange={(e) => setActiveOffer(e.target.value)}
                    className="w-full border rounded-xl p-3 text-xs"
                  />
                  <button onClick={() => alert('অফার আপডেট সফল!')} className="bg-amber-500 text-white font-bold py-2 px-4 rounded-xl text-xs">আপডেট করুন</button>
                </div>
              </div>
            )}

          </div>
        )}

      </main>

      {/* ================= CART DRAWER ================= */}
      <AnimatePresence>
        {isCartOpen && (
          <div className="fixed inset-0 z-50 overflow-hidden">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-xs" onClick={() => setIsCartOpen(false)} />
            <div className="absolute inset-y-0 right-0 max-w-full flex pl-10">
              <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} className="w-screen max-w-md bg-white shadow-2xl flex flex-col">
                <div className="p-4 bg-gradient-to-r from-red-600 to-amber-500 text-white flex items-center justify-between">
                  <h2 className="font-bold text-lg flex items-center gap-2"><ShoppingBag className="w-5 h-5" /><span>আপনার শপিং কার্ট</span></h2>
                  <button onClick={() => setIsCartOpen(false)} className="hover:bg-black/10 p-1.5 rounded-full"><X className="w-5 h-5" /></button>
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
                        <label className="block text-[11px] font-bold text-gray-600 mb-0.5">মোবাইল নম্বর (লগইন আইডি)</label>
                        <input 
                          type="tel" 
                          placeholder="017xxxxxxxx" 
                          value={checkoutForm.phone} 
                          onChange={(e) => {
                            const val = e.target.value;
                            setCheckoutForm({ ...checkoutForm, phone: val });
                            if (customers[val.trim()]) {
                              setCheckoutForm(prev => ({
                                ...prev,
                                phone: val,
                                name: customers[val.trim()].name,
                                address: customers[val.trim()].address
                              }));
                            }
                          }} 
                          className="w-full border rounded-lg p-2.5 text-xs font-bold" 
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

                      <div>
                        <label className="block text-[11px] font-bold text-gray-600 mb-0.5">ডেলিভারি ঠিকানা</label>
                        <textarea 
                          placeholder="বাসা নং, রোড, এলাকা" 
                          value={checkoutForm.address} 
                          onChange={(e) => setCheckoutForm({ ...checkoutForm, address: e.target.value })} 
                          rows={2} 
                          className="w-full border rounded-lg p-2.5 text-xs" 
                          required 
                        />
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
                      <div className="flex justify-between text-gray-600"><span>মোট খাবার মূল্য:</span><span>৳ {subtotal}</span></div>
                      <div className="flex justify-between text-gray-600"><span>ডেলিভারি ফি:</span><span>{deliveryFee === 0 ? 'ফ্রি' : `৳ ${deliveryFee}`}</span></div>
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
                      className="w-full bg-gradient-to-r from-red-600 to-emerald-600 hover:opacity-95 text-white font-bold py-3 rounded-xl text-sm shadow-lg transition active:scale-95"
                    >
                      ৳ {advanceAmount} অগ্রীম দিয়ে অর্ডার কনফার্ম করুন
                    </button>
                  </div>
                )}
              </motion.div>
            </div>
          </div>
        )}
      </AnimatePresence>

      {/* ================= ORDER SUCCESS MODAL ================= */}
      {orderSuccessModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl text-center space-y-4 border border-emerald-200">
            <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <h3 className="text-xl font-extrabold text-gray-900">অর্ডার ও অগ্রীম পেমেন্ট সফল!</h3>
            <p className="text-xs sm:text-sm text-gray-600">
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

            <div className="bg-amber-50 p-2.5 rounded-xl text-xs text-amber-800 font-medium">
              🎁 আপনার প্রোফাইলে <span className="font-bold text-emerald-700">+{orderSuccessModal.loyaltyPointsEarned} লয়্যালটি পয়েন্ট</span> যুক্ত হয়েছে!
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

      {/* ================= FLOATING CHATBOT WIDGET ================= */}
      {appMode === 'public' && (
        <div className="fixed bottom-5 right-5 z-40">
          {!isChatOpen ? (
            <button onClick={() => setIsChatOpen(true)} className="bg-gradient-to-r from-red-600 to-emerald-600 text-white p-4 rounded-full shadow-2xl flex items-center gap-2">
              <MessageSquare className="w-6 h-6" />
              <span className="hidden sm:inline font-bold text-xs">সাপোর্ট চ্যাট</span>
            </button>
          ) : (
            <div className="bg-white rounded-2xl shadow-2xl w-80 sm:w-96 border border-amber-200 flex flex-col h-[480px]">
              <div className="bg-gradient-to-r from-red-600 to-amber-500 text-white p-3 flex justify-between items-center">
                <span className="font-bold text-sm">সালমা ফুড সাপোর্ট চ্যাটবট</span>
                <button onClick={() => setIsChatOpen(false)}><X className="w-4 h-4" /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-amber-50/30 text-xs">
                {chatMessages.map((m, i) => (
                  <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`p-3 rounded-2xl max-w-[80%] ${m.role === 'user' ? 'bg-red-600 text-white' : 'bg-white border'}`}>{m.text}</div>
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
                  placeholder="প্রশ্ন করুন..." 
                  className="flex-1 border rounded-xl px-3 py-2 text-xs" 
                />
                <button onClick={handleSendMessage} className="bg-emerald-600 text-white px-3 py-2 rounded-xl"><Send className="w-4 h-4" /></button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-6 text-center text-xs mt-12 border-t border-gray-800">
        <p>© 2026 সালমা ফুড কর্ণার (Salma Food Corner). পাসওয়ার্ডহীন কাস্টমার লগইন ও হিসাব এন্ট্রি সম্পন্ন।</p>
      </footer>

    </div>
  );
}
