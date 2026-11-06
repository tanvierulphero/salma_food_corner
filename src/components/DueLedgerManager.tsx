import React, { useState, useEffect } from 'react';
import { 
  BookOpen, Plus, Search, Filter, Phone, MessageSquare, CheckCircle2, 
  AlertCircle, Clock, Calendar, DollarSign, ArrowUpRight, Check, X, 
  Trash2, Edit3, Printer, Share2, UserCheck, RefreshCw, AlertTriangle,
  Receipt, ArrowDownRight, Wallet, ShoppingBag
} from 'lucide-react';
import { DueEntry, LedgerEntry, Order, CustomerProfile } from '../types';
import { playAddToCartSound, playOrderSuccessSound } from '../utils/audioFeedback';
import { saveToCpanelDb, normalizeBdPhone } from '../utils/sqlSync';

interface DueLedgerManagerProps {
  ledger: LedgerEntry[];
  setLedger: React.Dispatch<React.SetStateAction<LedgerEntry[]>>;
  orders: Order[];
  setOrders: React.Dispatch<React.SetStateAction<Order[]>>;
  customers: Record<string, CustomerProfile>;
  soundOn: boolean;
}

const DEFAULT_DUE_DATA: DueEntry[] = [];


export default function DueLedgerManager({
  ledger,
  setLedger,
  orders,
  setOrders,
  customers,
  soundOn
}: DueLedgerManagerProps) {
  const todayStr = new Date().toISOString().split('T')[0];

  // 1. Due Entries State
  const [dueList, setDueList] = useState<DueEntry[]>(() => {
    const saved = localStorage.getItem('salma_due_ledger');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch (e) {
        console.error(e);
      }
    }
    return DEFAULT_DUE_DATA;
  });

  // Sync to localStorage
  useEffect(() => {
    localStorage.setItem('salma_due_ledger', JSON.stringify(dueList));
  }, [dueList]);

  // Search & Filter
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'due' | 'unpaid' | 'partial' | 'paid' | 'orders'>('all');

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingDueId, setEditingDueId] = useState<string | null>(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [selectedDue, setSelectedDue] = useState<DueEntry | null>(null);

  // Form State: Add / Edit Due
  const [formData, setFormData] = useState({
    customerName: '',
    customerPhone: '',
    totalAmount: '',
    initialPaid: '',
    itemsDescription: '',
    dueDate: '',
    note: '',
    paymentMethod: 'Cash' as 'Cash' | 'bKash' | 'Nagad'
  });

  // Form State: Collect Payment
  const [paymentData, setPaymentData] = useState({
    amount: '',
    paymentMethod: 'Cash' as 'Cash' | 'bKash' | 'Nagad' | 'Bank',
    addToPosLedger: true,
    note: ''
  });

  // KPI Calculations
  const activeDues = dueList.filter(d => d.status !== 'paid');
  const totalOutstandingDue = activeDues.reduce((sum, d) => sum + d.dueAmount, 0);
  const totalCollectedAmount = dueList.reduce((sum, d) => sum + d.paidAmount, 0);
  const uniqueDueCustomers = new Set(activeDues.map(d => d.customerPhone)).size;

  // Order Dues (from online orders that have remaining delivery due)
  const orderDuesList = orders.filter(o => o.dueAmount > 0 && o.status !== 'Delivered' && o.status !== 'Cancelled');
  const totalOrderDue = orderDuesList.reduce((sum, o) => sum + o.dueAmount, 0);

  // Filter Logic
  const filteredDueList = dueList.filter(entry => {
    const matchSearch = 
      entry.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      entry.customerPhone.includes(searchTerm) ||
      entry.voucherNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
      entry.itemsDescription.toLowerCase().includes(searchTerm.toLowerCase());

    if (!matchSearch) return false;

    if (activeFilter === 'all') return true;
    if (activeFilter === 'due') return entry.status === 'unpaid' || entry.status === 'partial';
    if (activeFilter === 'unpaid') return entry.status === 'unpaid';
    if (activeFilter === 'partial') return entry.status === 'partial';
    if (activeFilter === 'paid') return entry.status === 'paid';
    return true;
  });

  // Handler: Open Edit Due Modal
  const handleOpenEditDue = (due: DueEntry) => {
    setEditingDueId(due.id);
    setFormData({
      customerName: due.customerName,
      customerPhone: due.customerPhone,
      totalAmount: due.totalAmount.toString(),
      initialPaid: due.paidAmount.toString(),
      itemsDescription: due.itemsDescription,
      dueDate: due.dueDate || '',
      note: due.note || '',
      paymentMethod: 'Cash'
    });
    setIsAddModalOpen(true);
  };

  // Handler: Add or Update Due
  const handleAddNewDue = (e: React.FormEvent) => {
    e.preventDefault();
    const total = parseFloat(formData.totalAmount);
    if (!total || total <= 0) {
      alert('সঠিক মোট টাকার পরিমাণ দিন');
      return;
    }
    const initialPaid = parseFloat(formData.initialPaid) || 0;
    if (initialPaid > total) {
      alert('জমা টাকা মোট টাকার চেয়ে বেশি হতে পারে না');
      return;
    }
    const dueAmount = Math.max(0, total - initialPaid);
    const status: DueEntry['status'] = dueAmount === 0 ? 'paid' : (initialPaid > 0 ? 'partial' : 'unpaid');

    if (editingDueId) {
      setDueList(prev => {
        const updated = prev.map(item => {
          if (item.id === editingDueId) {
            return {
              ...item,
              customerName: formData.customerName.trim() || 'সাধারণ খদ্দের',
              customerPhone: formData.customerPhone.trim() || 'N/A',
              totalAmount: total,
              paidAmount: initialPaid,
              dueAmount,
              dueDate: formData.dueDate || undefined,
              itemsDescription: formData.itemsDescription.trim() || 'খাবারের বিল',
              status,
              note: formData.note.trim()
            };
          }
          return item;
        });
        saveToCpanelDb('salma_due_ledger', updated);
        return updated;
      });
      if (soundOn) playAddToCartSound();
      setIsAddModalOpen(false);
      setEditingDueId(null);
      alert('বাকি হিসাবের তথ্য সফলভাবে আপডেট করা হয়েছে!');
      return;
    }

    const newVoucher = `DUE-${Math.floor(100 + Math.random() * 900)}`;
    const newEntry: DueEntry = {
      id: `due-${Date.now()}`,
      voucherNo: newVoucher,
      customerName: formData.customerName.trim() || 'সাধারণ খদ্দের',
      customerPhone: formData.customerPhone.trim() || 'N/A',
      totalAmount: total,
      paidAmount: initialPaid,
      dueAmount: dueAmount,
      date: todayStr,
      dueDate: formData.dueDate || undefined,
      itemsDescription: formData.itemsDescription.trim() || 'খাবারের বিল',
      status: status,
      payments: initialPaid > 0 ? [
        {
          id: `pay-${Date.now()}`,
          date: todayStr,
          time: new Date().toLocaleTimeString('bn-BD', { hour: '2-digit', minute: '2-digit' }),
          amount: initialPaid,
          paymentMethod: formData.paymentMethod,
          note: 'বাকি খোলার সময় প্রাথমিক জমা'
        }
      ] : [],
      note: formData.note.trim()
    };

    setDueList(prev => {
      const updated = [newEntry, ...prev];
      saveToCpanelDb('salma_due_ledger', updated);
      return updated;
    });

    // If initial paid was given, optionally record in POS Ledger as income
    if (initialPaid > 0) {
      const posEntry: LedgerEntry = {
        id: `pos-${Date.now()}`,
        voucherNo: `VCH-${newVoucher}`,
        type: 'income',
        category: 'বাকি আদায় ও জমা (Due Collection)',
        amount: initialPaid,
        date: todayStr,
        paymentMethod: formData.paymentMethod,
        note: `${formData.customerName} এর প্রাথমিক জমা (${newVoucher})`
      };
      setLedger(prev => {
        const updatedLedger = [posEntry, ...prev];
        saveToCpanelDb('salma_ledger', updatedLedger);
        return updatedLedger;
      });
    }

    if (soundOn) playAddToCartSound();
    setIsAddModalOpen(false);
    setEditingDueId(null);
    setFormData({
      customerName: '',
      customerPhone: '',
      totalAmount: '',
      initialPaid: '',
      itemsDescription: '',
      dueDate: '',
      note: '',
      paymentMethod: 'Cash'
    });
    alert(`নতুন বাকি এন্ট্রি #${newVoucher} সফলভাবে যুক্ত হয়েছে!`);
  };

  // Handler: Open Payment Modal
  const handleOpenPayment = (due: DueEntry) => {
    setSelectedDue(due);
    setPaymentData({
      amount: due.dueAmount.toString(),
      paymentMethod: 'Cash',
      addToPosLedger: true,
      note: 'বাকি পরিশোধ'
    });
    setIsPaymentModalOpen(true);
  };

  // Handler: Submit Payment
  const handleSubmitPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDue) return;

    const payAmount = parseFloat(paymentData.amount);
    if (!payAmount || payAmount <= 0) {
      alert('সঠিক জমার পরিমাণ দিন');
      return;
    }

    if (payAmount > selectedDue.dueAmount) {
      alert(`জমা টাকা অবশিষ্ট বাকি ৳${selectedDue.dueAmount} এর চেয়ে বেশি হতে পারে না!`);
      return;
    }

    const newPaidAmount = selectedDue.paidAmount + payAmount;
    const newDueAmount = selectedDue.totalAmount - newPaidAmount;
    const newStatus: DueEntry['status'] = newDueAmount <= 0 ? 'paid' : 'partial';

    const newPaymentRecord = {
      id: `pay-${Date.now()}`,
      date: todayStr,
      time: new Date().toLocaleTimeString('bn-BD', { hour: '2-digit', minute: '2-digit' }),
      amount: payAmount,
      paymentMethod: paymentData.paymentMethod,
      note: paymentData.note.trim() || 'বাকি আদায়'
    };

    setDueList(prev => {
      const updated = prev.map(item => {
        if (item.id === selectedDue.id) {
          return {
            ...item,
            paidAmount: newPaidAmount,
            dueAmount: Math.max(0, newDueAmount),
            status: newStatus,
            payments: [...(item.payments || []), newPaymentRecord]
          };
        }
        return item;
      });
      saveToCpanelDb('salma_due_ledger', updated);
      return updated;
    });

    // Add to POS ledger if checked
    if (paymentData.addToPosLedger) {
      const posEntry: LedgerEntry = {
        id: `pos-${Date.now()}`,
        voucherNo: `VCH-${selectedDue.voucherNo}`,
        type: 'income',
        category: 'বাকি আদায় (Due Collection)',
        amount: payAmount,
        date: todayStr,
        paymentMethod: paymentData.paymentMethod,
        note: `${selectedDue.customerName} থেকে বাকি আদায় (${selectedDue.voucherNo})`
      };
      setLedger(prev => {
        const updatedLedger = [posEntry, ...prev];
        saveToCpanelDb('salma_ledger', updatedLedger);
        return updatedLedger;
      });
    }

    if (soundOn) playOrderSuccessSound();
    setIsPaymentModalOpen(false);
    alert(`৳${payAmount} বাকি সফলভাবে আদায় ও জমা করা হয়েছে!`);
  };

  // Handler: Delete Due Entry
  const handleDeleteDue = (id: string, voucherNo: string) => {
    if (confirm(`আপনি কি সত্যিই বাকি রেকর্ড ${voucherNo} মুছে ফেলতে চান?`)) {
      setDueList(prev => {
        const updated = prev.filter(d => d.id !== id);
        saveToCpanelDb('salma_due_ledger', updated);
        return updated;
      });
    }
  };

  // Handler: Delete Individual Payment Installment inside a Due Record
  const handleDeletePaymentInstallment = (dueId: string, paymentId: string, payAmount: number) => {
    if (confirm(`আপনি কি এই ৳${payAmount} জমার এন্ট্রিটি মুছে ফেলতে চান?`)) {
      setDueList(prev => {
        const updated = prev.map(d => {
          if (d.id !== dueId) return d;
          const nextPayments = (d.payments || []).filter(p => p.id !== paymentId);
          const nextPaid = Math.max(0, d.paidAmount - payAmount);
          const nextDue = Math.max(0, d.totalAmount - nextPaid);
          const nextStatus: DueEntry['status'] = nextDue === 0 ? 'paid' : (nextPaid > 0 ? 'partial' : 'unpaid');
          return {
            ...d,
            paidAmount: nextPaid,
            dueAmount: nextDue,
            status: nextStatus,
            payments: nextPayments
          };
        });
        saveToCpanelDb('salma_due_ledger', updated);
        return updated;
      });
    }
  };

  // Handler: Settle Online Order Delivery Due
  const handleSettleOrderDue = (order: Order) => {
    if (confirm(`অর্ডার #${order.id} এর অবশিষ্ট ডেলিভারি বাকি ৳${order.dueAmount} নগদ আদায় করে 'Delivered' হিসেবে চিহ্নিত করবেন?`)) {
      const collected = order.dueAmount;
      setOrders(prev => prev.map(o => {
        if (o.id === order.id) {
          return {
            ...o,
            dueAmount: 0,
            paymentStatus: 'Fully Paid (100%)',
            status: 'Delivered'
          };
        }
        return o;
      }));

      // Add to POS Ledger
      const posEntry: LedgerEntry = {
        id: `pos-${Date.now()}`,
        voucherNo: `ORD-${order.id.slice(-4)}`,
        type: 'income',
        category: 'ডেলিভারি ক্যাশ আদায় (Order Due)',
        amount: collected,
        date: todayStr,
        paymentMethod: 'Cash',
        note: `অর্ডার #${order.id} ডেলিভারি বাকি আদায় (${order.customerName})`
      };
      setLedger(prev => [posEntry, ...prev]);

      if (soundOn) playOrderSuccessSound();
      alert(`অর্ডার #${order.id} এর ৳${collected} বাকি সফলভাবে আদায় হয়েছে!`);
    }
  };

  // Quick WhatsApp / SMS Reminder Builder
  const getReminderText = (due: DueEntry) => {
    return `আসসালামু আলাইকুম ${due.customerName} সাহেব, সালমা ফুড কর্ণার (চান্দনা চৌরাস্তা, গাজীপুর) থেকে বিনীতভাবে জানানো যাচ্ছে যে আপনার ${due.itemsDescription}-এর বকেয়া বাকি ৳${due.dueAmount} টাকা পরিশোধের জন্য অনুরোধ করা হচ্ছে। ধন্যবাদ!`;
  };

  const handleSendSmsReminder = (due: DueEntry) => {
    const text = encodeURIComponent(getReminderText(due));
    window.open(`sms:${due.customerPhone}?body=${text}`, '_blank');
  };

  const handleSendWhatsAppReminder = (due: DueEntry) => {
    const cleanPhone = due.customerPhone.replace(/\D/g, '');
    const intlPhone = cleanPhone.startsWith('0') ? '88' + cleanPhone : cleanPhone;
    const text = encodeURIComponent(getReminderText(due));
    window.open(`https://wa.me/${intlPhone}?text=${text}`, '_blank');
  };

  return (
    <div className="space-y-4">
      {/* Top Header Card */}
      <div className="bg-gradient-to-r from-red-700 via-rose-700 to-amber-700 text-white p-4 rounded-3xl shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-xs flex items-center justify-center font-bold shadow-xs">
              <BookOpen className="w-5 h-5 text-amber-200" />
            </div>
            <div>
              <h2 className="text-base font-black tracking-tight">বাকি খাতা (Due Ledger)</h2>
              <p className="text-[11px] text-amber-100 font-medium">কাস্টমার বাকি ট্র্যাকিং, দেনা-পাওনা ও আদায় খতিয়ান</p>
            </div>
          </div>
          <button
            onClick={() => {
              setEditingDueId(null);
              setFormData({
                customerName: '',
                customerPhone: '',
                totalAmount: '',
                initialPaid: '',
                itemsDescription: '',
                dueDate: '',
                note: '',
                paymentMethod: 'Cash'
              });
              setIsAddModalOpen(true);
            }}
            className="bg-amber-400 hover:bg-amber-300 text-red-950 font-black text-xs px-3.5 py-2 rounded-2xl shadow-sm transition active:scale-95 flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>নতুন বাকি</span>
          </button>
        </div>

        {/* 4 Mini Stat Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-gray-900">
          <div className="bg-white/95 backdrop-blur-xs p-2.5 rounded-2xl shadow-2xs border border-white/40">
            <div className="flex items-center justify-between text-[10px] text-red-700 font-bold mb-0.5">
              <span>মোট বকেয়া বাকি</span>
              <AlertCircle className="w-3.5 h-3.5 text-red-600" />
            </div>
            <p className="text-base font-black text-red-600">৳ {totalOutstandingDue}</p>
            <p className="text-[9px] text-gray-500 font-semibold">{activeDues.length} টি বকেয়া এন্ট্রি</p>
          </div>

          <div className="bg-white/95 backdrop-blur-xs p-2.5 rounded-2xl shadow-2xs border border-white/40">
            <div className="flex items-center justify-between text-[10px] text-emerald-700 font-bold mb-0.5">
              <span>মোট আদায়কৃত</span>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            </div>
            <p className="text-base font-black text-emerald-700">৳ {totalCollectedAmount}</p>
            <p className="text-[9px] text-gray-500 font-semibold">আদায় সম্পন্ন</p>
          </div>

          <div className="bg-white/95 backdrop-blur-xs p-2.5 rounded-2xl shadow-2xs border border-white/40">
            <div className="flex items-center justify-between text-[10px] text-amber-800 font-bold mb-0.5">
              <span>বাকিদার খদ্দের</span>
              <UserCheck className="w-3.5 h-3.5 text-amber-600" />
            </div>
            <p className="text-base font-black text-gray-900">{uniqueDueCustomers} জন</p>
            <p className="text-[9px] text-gray-500 font-semibold">সক্রিয় বাকি রয়েছে</p>
          </div>

          <div className="bg-white/95 backdrop-blur-xs p-2.5 rounded-2xl shadow-2xs border border-white/40">
            <div className="flex items-center justify-between text-[10px] text-blue-700 font-bold mb-0.5">
              <span>অনলাইন অর্ডার বাকি</span>
              <ShoppingBag className="w-3.5 h-3.5 text-blue-600" />
            </div>
            <p className="text-base font-black text-blue-700">৳ {totalOrderDue}</p>
            <p className="text-[9px] text-gray-500 font-semibold">{orderDuesList.length} টি অর্ডার পেন্ডিং</p>
          </div>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="space-y-2">
        <div className="relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
          <input
            type="text"
            placeholder="গ্রাহকের নাম, মোবাইল বা ভাউচার নম্বর দিয়ে খুঁজুন..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-white border border-gray-200 rounded-2xl pl-9 pr-4 py-2.5 text-xs text-gray-900 focus:outline-none focus:border-red-500 shadow-2xs font-medium"
          />
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-[11px] font-bold">
          {[
            { id: 'all', label: `সব বাকি (${dueList.length})` },
            { id: 'due', label: `বকেয়া আছে (${activeDues.length})` },
            { id: 'unpaid', label: `সম্পূর্ণ বাকি (${dueList.filter(d => d.status === 'unpaid').length})` },
            { id: 'partial', label: `আংশিক আদায় (${dueList.filter(d => d.status === 'partial').length})` },
            { id: 'paid', label: `পরিশোধিত (${dueList.filter(d => d.status === 'paid').length})` },
            { id: 'orders', label: `অর্ডার বকেয়া (${orderDuesList.length})` }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveFilter(tab.id as any)}
              className={`px-3 py-1.5 rounded-xl whitespace-nowrap transition cursor-pointer ${
                activeFilter === tab.id
                  ? 'bg-red-700 text-white shadow-2xs'
                  : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ============================================================== */}
      {/* SECTION: ONLINE ORDERS DUE DELIVERY SECTION                   */}
      {/* ============================================================== */}
      {activeFilter === 'orders' ? (
        <div className="space-y-3">
          <div className="bg-blue-50 border border-blue-200 p-3.5 rounded-2xl text-xs text-blue-900 flex items-center justify-between">
            <div>
              <p className="font-bold flex items-center gap-1.5">
                <ShoppingBag className="w-4 h-4 text-blue-700" />
                <span>অনলাইন অর্ডারের বাকি তালিকা (Delivery Cash Due)</span>
              </p>
              <p className="text-[11px] text-blue-700 mt-0.5">
                গ্রাহক ৫০% অগ্রীম পরিশোধ করেছেন, খাবার ডেলিভারির পর বাকি ৫০% টাকা আদায় করুন।
              </p>
            </div>
            <span className="font-black text-sm text-blue-800 bg-white px-2.5 py-1 rounded-xl border border-blue-200">
              ৳ {totalOrderDue}
            </span>
          </div>

          {orderDuesList.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 text-center text-gray-500 border border-gray-200">
              <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
              <p className="text-sm font-bold text-gray-800">কোনো অর্ডারের ডেলিভারি বাকি পেন্ডিং নেই!</p>
              <p className="text-xs text-gray-500">সব অর্ডারের বকেয়া আদায় ও ডেলিভারি সম্পন্ন হয়েছে।</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2.5">
              {orderDuesList.map(order => (
                <div key={order.id} className="bg-white rounded-2xl border border-blue-200 p-3.5 shadow-2xs space-y-2.5">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="bg-blue-100 text-blue-800 text-[10px] font-mono font-bold px-2 py-0.5 rounded-md">
                          #{order.id}
                        </span>
                        <span className="text-xs font-bold text-gray-900">{order.customerName}</span>
                      </div>
                      <p className="text-[11px] text-gray-500 font-mono mt-0.5">{order.phone} • {order.address}</p>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-gray-400 block">{order.date}</span>
                      <span className="text-sm font-black text-red-600">বাকি: ৳{order.dueAmount}</span>
                    </div>
                  </div>

                  <div className="bg-gray-50 p-2 rounded-xl text-[11px] text-gray-700 border border-gray-100">
                    <p className="font-semibold text-gray-800">খাবারসমূহ:</p>
                    <p className="truncate text-gray-600">
                      {order.items.map(i => `${i.nameBn} x${i.quantity}`).join(', ')}
                    </p>
                    <div className="flex justify-between mt-1 pt-1 border-t border-gray-200 text-[10px]">
                      <span>মোট বিল: ৳{order.totalAmount}</span>
                      <span className="text-emerald-700 font-bold">অগ্রীম পরিশোধিত: ৳{order.advancePaid} ({order.advancePaymentMethod})</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <a 
                      href={`tel:${order.phone}`}
                      className="text-xs text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      <span>কল দিন</span>
                    </a>
                    <button
                      onClick={() => handleSettleOrderDue(order)}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3.5 py-1.5 rounded-xl flex items-center gap-1.5 shadow-xs transition active:scale-95 cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>৳{order.dueAmount} বাকি আদায় সম্পন্ন</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* ============================================================== */
        /* SECTION: REGULAR CUSTOMER DUE LEDGER CARDS                    */
        /* ============================================================== */
        <div className="space-y-3">
          {filteredDueList.length === 0 ? (
            <div className="bg-white rounded-3xl p-8 text-center text-gray-500 border border-gray-200 space-y-2">
              <BookOpen className="w-10 h-10 text-gray-300 mx-auto" />
              <p className="text-sm font-bold text-gray-800">কোনো বাকি হিসাব পাওয়া যায়নি</p>
              <p className="text-xs text-gray-500">নতুন বাকি এন্ট্রি করতে উপরের 'নতুন বাকি' বাটনে চাপ দিন।</p>
              <button
                onClick={() => setIsAddModalOpen(true)}
                className="mt-2 bg-red-600 text-white text-xs font-bold px-4 py-2 rounded-xl inline-flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>+ নতুন বাকি রেকর্ড করুন</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {filteredDueList.map(due => {
                const isPaid = due.status === 'paid';
                const isPartial = due.status === 'partial';

                return (
                  <div 
                    key={due.id} 
                    className={`bg-white rounded-3xl border p-4 shadow-2xs space-y-3 transition ${
                      isPaid 
                        ? 'border-emerald-200 bg-gradient-to-br from-emerald-50/20 to-white' 
                        : isPartial
                        ? 'border-amber-200 bg-gradient-to-br from-amber-50/20 to-white'
                        : 'border-red-200 bg-gradient-to-br from-red-50/15 to-white'
                    }`}
                  >
                    {/* Header Row */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-mono text-[10px] font-bold bg-gray-100 text-gray-700 px-2 py-0.5 rounded-md">
                            {due.voucherNo}
                          </span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                            isPaid 
                              ? 'bg-emerald-100 text-emerald-800' 
                              : isPartial 
                              ? 'bg-amber-100 text-amber-800' 
                              : 'bg-red-100 text-red-800'
                          }`}>
                            {isPaid ? (
                              <>
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                <span>সম্পূর্ণ পরিশোধিত</span>
                              </>
                            ) : isPartial ? (
                              <>
                                <Clock className="w-3 h-3 text-amber-600" />
                                <span>আংশিক বাকি</span>
                              </>
                            ) : (
                              <>
                                <AlertTriangle className="w-3 h-3 text-red-600" />
                                <span>বকেয়া রয়েছে</span>
                              </>
                            )}
                          </span>
                        </div>
                        <h3 className="text-sm font-black text-gray-900 mt-1">{due.customerName}</h3>
                        <p className="text-xs text-gray-600 font-mono flex items-center gap-1">
                          <Phone className="w-3 h-3 text-gray-400" />
                          <span>{due.customerPhone}</span>
                        </p>
                      </div>

                      {/* Amounts Badge */}
                      <div className="text-right shrink-0">
                        <span className="text-[10px] text-gray-400 block font-mono">{due.date}</span>
                        <div className="mt-0.5">
                          <span className="text-xs text-gray-500 block">মোট: ৳{due.totalAmount}</span>
                          <span className={`text-base font-black ${isPaid ? 'text-emerald-700' : 'text-red-600'}`}>
                            {isPaid ? 'পরিশোধিত' : `বাকি: ৳${due.dueAmount}`}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Description Box */}
                    <div className="bg-gray-50/80 p-2.5 rounded-2xl border border-gray-100 space-y-1">
                      <p className="text-xs font-semibold text-gray-800 flex items-center gap-1">
                        <Receipt className="w-3.5 h-3.5 text-gray-500" />
                        <span>খাবার বা বাকির বিবরণ:</span>
                      </p>
                      <p className="text-xs text-gray-700 pl-4">{due.itemsDescription}</p>

                      {due.note && (
                        <p className="text-[11px] text-gray-500 italic pl-4 border-t border-gray-200/60 pt-1 mt-1">
                          নোট: {due.note}
                        </p>
                      )}

                      {due.dueDate && !isPaid && (
                        <p className="text-[11px] text-amber-800 font-bold pl-4 flex items-center gap-1 mt-1">
                          <Calendar className="w-3 h-3 text-amber-600" />
                          <span>সম্ভাব্য পরিশোধের তারিখ: {due.dueDate}</span>
                        </p>
                      )}
                    </div>

                    {/* Payment History (if any) */}
                    {due.payments && due.payments.length > 0 && (
                      <div className="bg-emerald-50/60 p-2.5 rounded-2xl border border-emerald-100 text-[11px] space-y-1">
                        <p className="font-bold text-emerald-950 flex items-center justify-between">
                          <span>আদায় ও জমার ইতিহাস:</span>
                          <span className="text-emerald-700">মোট জমা: ৳{due.paidAmount}</span>
                        </p>
                        <div className="divide-y divide-emerald-100">
                          {due.payments.map(p => (
                            <div key={p.id} className="py-1 flex items-center justify-between text-emerald-900 gap-2">
                              <div>
                                <span className="font-semibold">৳{p.amount}</span> ({p.paymentMethod})
                                <span className="text-[10px] text-gray-500 ml-1.5">{p.date} {p.time}</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                {p.note && <span className="text-[10px] text-gray-500 truncate max-w-[110px]">{p.note}</span>}
                                <button
                                  type="button"
                                  onClick={() => handleDeletePaymentInstallment(due.id, p.id, p.amount)}
                                  className="text-red-500 hover:text-red-700 p-0.5 rounded hover:bg-red-50 cursor-pointer"
                                  title="এই জমাটি মুছে ফেলুন"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Action Bar */}
                    <div className="flex items-center justify-between gap-1.5 pt-1 border-t border-gray-100">
                      {/* Left: Communication */}
                      <div className="flex items-center gap-1">
                        <a
                          href={`tel:${due.customerPhone}`}
                          className="p-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 transition"
                          title="কল দিন"
                        >
                          <Phone className="w-3.5 h-3.5" />
                        </a>
                        {!isPaid && (
                          <>
                            <button
                              onClick={() => handleSendSmsReminder(due)}
                              className="px-2 py-1 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 text-[10px] font-bold border border-blue-200 flex items-center gap-1 transition cursor-pointer"
                              title="এসএমএস তাগাদা"
                            >
                              <MessageSquare className="w-3 h-3" />
                              <span>SMS তাগাদা</span>
                            </button>
                            <button
                              onClick={() => handleSendWhatsAppReminder(due)}
                              className="px-2 py-1 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[10px] font-bold border border-emerald-200 flex items-center gap-1 transition cursor-pointer"
                              title="WhatsApp তাগাদা"
                            >
                              <Share2 className="w-3 h-3" />
                              <span>হোয়াটসঅ্যাপ</span>
                            </button>
                          </>
                        )}
                      </div>

                      {/* Right: Edit, Payment Collection & Delete */}
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => {
                            setSelectedDue(due);
                            setIsReceiptModalOpen(true);
                          }}
                          className="p-1.5 rounded-xl border border-gray-200 hover:bg-gray-100 text-gray-600 transition cursor-pointer"
                          title="রসিদ স্লিপ দেখুন ও প্রিন্ট"
                        >
                          <Printer className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => handleOpenEditDue(due)}
                          className="bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 px-2.5 py-1.5 rounded-xl text-[11px] font-bold flex items-center gap-1 transition cursor-pointer"
                          title="বাকি হিসাব এডিট করুন"
                        >
                          <Edit3 className="w-3 h-3" />
                          <span>এডিট</span>
                        </button>

                        {!isPaid && (
                          <button
                            onClick={() => handleOpenPayment(due)}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3 py-1.5 rounded-xl flex items-center gap-1 shadow-xs transition active:scale-95 cursor-pointer"
                          >
                            <Wallet className="w-3.5 h-3.5" />
                            <span>টাকা আদায়</span>
                          </button>
                        )}

                        <button
                          onClick={() => handleDeleteDue(due.id, due.voucherNo)}
                          className="bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 px-2 py-1.5 rounded-xl text-[11px] font-bold flex items-center gap-1 transition cursor-pointer"
                          title="মুছে ফেলুন"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>ডিলেট</span>
                        </button>
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
      {/* MODAL 1: ADD NEW DUE ENTRY (+ বাকি এন্ট্রি)                     */}
      {/* ============================================================== */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-2xs flex items-center justify-center p-3 animate-fadeIn">
          <div className="bg-white w-full max-w-md rounded-3xl p-5 shadow-2xl border border-gray-100 space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-red-100 text-red-700 flex items-center justify-center font-bold">
                  <BookOpen className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-sm text-gray-900">
                    {editingDueId ? '✏️ বাকি হিসাবের তথ্য এডিট করুন' : 'নতুন বাকি এন্ট্রি করুন'}
                  </h3>
                  <p className="text-[10px] text-gray-500">গ্রাহকের বাকির তথ্য ও হিসাব যুক্ত বা পরিবর্তন করুন</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setIsAddModalOpen(false);
                  setEditingDueId(null);
                }}
                className="p-1.5 rounded-full hover:bg-gray-100 text-gray-400 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddNewDue} className="space-y-3">
              {/* Customer Name */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">গ্রাহকের নাম *</label>
                <input
                  type="text"
                  required
                  placeholder="যেমন: কবির হোসেন / কামাল সাহেব"
                  value={formData.customerName}
                  onChange={(e) => setFormData({ ...formData, customerName: e.target.value })}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-red-500 font-medium"
                />
              </div>

              {/* Customer Phone */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">মোবাইল নম্বর * (১১ ডিজিট, +88 ছাড়া)</label>
                <input
                  type="tel"
                  maxLength={11}
                  required
                  placeholder="যেমন: 01712345678"
                  value={formData.customerPhone}
                  onChange={(e) => setFormData({ ...formData, customerPhone: normalizeBdPhone(e.target.value) })}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-red-500 font-mono"
                />
              </div>

              {/* Total Amount & Initial Paid */}
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">মোট বাকির পরিমাণ (৳) *</label>
                  <input
                    type="number"
                    required
                    min="1"
                    placeholder="৳ 0"
                    value={formData.totalAmount}
                    onChange={(e) => setFormData({ ...formData, totalAmount: e.target.value })}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-red-500 font-black text-red-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">প্রাথমিক জমা (ঐচ্ছিক)</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="৳ 0"
                    value={formData.initialPaid}
                    onChange={(e) => setFormData({ ...formData, initialPaid: e.target.value })}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-emerald-500 font-bold text-emerald-700"
                  />
                </div>
              </div>

              {/* Items Description */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">খাবার বা পণ্যের বিবরণ *</label>
                <input
                  type="text"
                  required
                  placeholder="যেমন: খাসির কাচ্চি ২ প্যাকেট ও বোরহানি"
                  value={formData.itemsDescription}
                  onChange={(e) => setFormData({ ...formData, itemsDescription: e.target.value })}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-red-500"
                />
              </div>

              {/* Due Date (Promise date) */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">পরিশোধের সম্ভাব্য তারিখ (Promise Date)</label>
                <input
                  type="date"
                  value={formData.dueDate}
                  onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-red-500"
                />
              </div>

              {/* Payment Method for Initial Deposit */}
              {parseFloat(formData.initialPaid) > 0 && (
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">প্রাথমিক জমা মাধ্যম</label>
                  <select
                    value={formData.paymentMethod}
                    onChange={(e) => setFormData({ ...formData, paymentMethod: e.target.value as any })}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-red-500"
                  >
                    <option value="Cash">ক্যাশ (Cash)</option>
                    <option value="bKash">বিকাশ (bKash)</option>
                    <option value="Nagad">নগদ (Nagad)</option>
                  </select>
                </div>
              )}

              {/* Note */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">মন্তব্য / নোট (ঐচ্ছিক)</label>
                <input
                  type="text"
                  placeholder="যেমন: শুক্রবার এসে বাকি দিয়ে যাবেন"
                  value={formData.note}
                  onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-red-500"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100 cursor-pointer"
                >
                  বাতিল
                </button>
                <button
                  type="submit"
                  className="bg-red-600 hover:bg-red-700 text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow transition active:scale-95 cursor-pointer flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>বাকি সংরক্ষণ করুন</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL 2: COLLECT DUE PAYMENT (টাকা আদায় ও জমা)                 */}
      {/* ============================================================== */}
      {isPaymentModalOpen && selectedDue && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-2xs flex items-center justify-center p-3 animate-fadeIn">
          <div className="bg-white w-full max-w-md rounded-3xl p-5 shadow-2xl border border-gray-100 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                  <Wallet className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-sm text-gray-900">বাকি টাকা আদায় ও জমা</h3>
                  <p className="text-[10px] text-gray-500">ভাউচার: {selectedDue.voucherNo}</p>
                </div>
              </div>
              <button
                onClick={() => setIsPaymentModalOpen(false)}
                className="p-1.5 rounded-full hover:bg-gray-100 text-gray-400 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Customer Details Snapshot */}
            <div className="bg-gray-50 p-3 rounded-2xl border border-gray-200 text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="font-bold text-gray-900">{selectedDue.customerName}</span>
                <span className="font-mono text-gray-600">{selectedDue.customerPhone}</span>
              </div>
              <div className="flex justify-between text-gray-600 text-[11px] pt-1 border-t border-gray-200">
                <span>মোট বিল: ৳{selectedDue.totalAmount}</span>
                <span>এ পর্যন্ত জমা: ৳{selectedDue.paidAmount}</span>
              </div>
              <div className="flex justify-between items-center text-sm font-black pt-1 border-t border-gray-200 text-red-600">
                <span>অবশিষ্ট বাকি:</span>
                <span>৳ {selectedDue.dueAmount}</span>
              </div>
            </div>

            <form onSubmit={handleSubmitPayment} className="space-y-3">
              {/* Payment Amount */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-bold text-gray-700">জমার পরিমাণ (৳) *</label>
                  <button
                    type="button"
                    onClick={() => setPaymentData({ ...paymentData, amount: selectedDue.dueAmount.toString() })}
                    className="text-[10px] text-emerald-700 font-bold hover:underline cursor-pointer"
                  >
                    সম্পূর্ণ টাকা (৳{selectedDue.dueAmount})
                  </button>
                </div>
                <input
                  type="number"
                  required
                  min="1"
                  max={selectedDue.dueAmount}
                  value={paymentData.amount}
                  onChange={(e) => setPaymentData({ ...paymentData, amount: e.target.value })}
                  className="w-full border border-emerald-300 rounded-xl px-3 py-2 text-sm font-black text-emerald-700 focus:outline-none focus:border-emerald-600"
                />
              </div>

              {/* Payment Method */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">অর্থগ্রহণের মাধ্যম</label>
                <select
                  value={paymentData.paymentMethod}
                  onChange={(e) => setPaymentData({ ...paymentData, paymentMethod: e.target.value as any })}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-red-500 font-medium"
                >
                  <option value="Cash">নগদ ক্যাশ (Cash)</option>
                  <option value="bKash">বিকাশ (bKash)</option>
                  <option value="Nagad">নগদ (Nagad)</option>
                  <option value="Bank">ব্যাংক (Bank)</option>
                </select>
              </div>

              {/* Note */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">নোট / বিবরণ</label>
                <input
                  type="text"
                  placeholder="যেমন: বিকাশে বাকি টাকা শোধ করেছেন"
                  value={paymentData.note}
                  onChange={(e) => setPaymentData({ ...paymentData, note: e.target.value })}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-red-500"
                />
              </div>

              {/* Sync with POS Ledger Checkbox */}
              <label className="flex items-center gap-2 p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={paymentData.addToPosLedger}
                  onChange={(e) => setPaymentData({ ...paymentData, addToPosLedger: e.target.checked })}
                  className="w-4 h-4 text-emerald-600 rounded"
                />
                <span className="text-[11px] font-bold text-emerald-950">
                  এই টাকা POS লেজারে আজকের আয়ে (Income) যুক্ত করুন
                </span>
              </label>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsPaymentModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100 cursor-pointer"
                >
                  বাতিল
                </button>
                <button
                  type="submit"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow transition active:scale-95 cursor-pointer flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>জমা নিশ্চিত করুন</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL 3: DUE RECEIPT / SLIP MODAL (প্রিন্ট ও স্লিপ ভিউ)        */}
      {/* ============================================================== */}
      {isReceiptModalOpen && selectedDue && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-2xs flex items-center justify-center p-3 animate-fadeIn">
          <div className="bg-white w-full max-w-sm rounded-3xl p-5 shadow-2xl border border-gray-200 space-y-4">
            <div className="flex justify-between items-center border-b pb-2">
              <span className="text-xs font-bold text-gray-500">বাকি মেমো স্লিপ</span>
              <button 
                onClick={() => setIsReceiptModalOpen(false)}
                className="p-1 rounded-full hover:bg-gray-100 text-gray-400 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Printable Slip Content */}
            <div className="border border-dashed border-gray-300 p-4 rounded-2xl font-mono text-xs space-y-3 bg-amber-50/20">
              <div className="text-center space-y-0.5 border-b pb-2">
                <h4 className="font-black text-sm text-gray-900 font-sans">সালমা ফুড কর্ণার, গাজীপুর</h4>
                <p className="text-[10px] text-gray-500">চান্দনা চৌরাস্তা, গাজীপুর সদর-১৭০০ | ০১৭১২-৩৪৫৬৭৮</p>
                <p className="text-[10px] font-bold text-red-700 pt-0.5">বাকি মেমো ও খতিয়ান স্লিপ</p>
              </div>

              <div className="text-[11px] space-y-1">
                <div className="flex justify-between">
                  <span>ভাউচার নং:</span>
                  <span className="font-bold">{selectedDue.voucherNo}</span>
                </div>
                <div className="flex justify-between">
                  <span>তারিখ:</span>
                  <span>{selectedDue.date}</span>
                </div>
                <div className="flex justify-between">
                  <span>গ্রাহক:</span>
                  <span className="font-bold">{selectedDue.customerName}</span>
                </div>
                <div className="flex justify-between">
                  <span>মোবাইল:</span>
                  <span>{selectedDue.customerPhone}</span>
                </div>
              </div>

              <div className="border-t border-b py-2 space-y-1 text-[11px]">
                <p className="font-semibold text-gray-700">বিবরণ: {selectedDue.itemsDescription}</p>
                <div className="flex justify-between font-bold pt-1">
                  <span>মোট বিল:</span>
                  <span>৳{selectedDue.totalAmount}</span>
                </div>
                <div className="flex justify-between text-emerald-700">
                  <span>জমা পরিশোধ:</span>
                  <span>- ৳{selectedDue.paidAmount}</span>
                </div>
                <div className="flex justify-between font-black text-sm text-red-600 border-t pt-1">
                  <span>অবশিষ্ট বাকি:</span>
                  <span>৳{selectedDue.dueAmount}</span>
                </div>
              </div>

              {selectedDue.note && (
                <p className="text-[10px] text-gray-500 italic">নোট: {selectedDue.note}</p>
              )}

              <p className="text-[9px] text-center text-gray-400 pt-1">
                ধন্যবাদ, আবার আসবেন!
              </p>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => window.print()}
                className="flex-1 bg-gray-900 hover:bg-black text-white font-bold text-xs py-2.5 rounded-xl flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Printer className="w-4 h-4" />
                <span>প্রিন্ট করুন</span>
              </button>
              <button
                onClick={() => setIsReceiptModalOpen(false)}
                className="px-4 py-2.5 rounded-xl border border-gray-300 text-xs font-bold text-gray-700 hover:bg-gray-100 cursor-pointer"
              >
                বন্ধ করুন
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
