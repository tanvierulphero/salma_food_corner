import React, { useState, useEffect } from 'react';
import { 
  BookOpen, Plus, Search, Filter, Phone, MessageSquare, CheckCircle2, 
  AlertCircle, Clock, Calendar, DollarSign, ArrowUpRight, Check, X, 
  Trash2, Edit3, Printer, Share2, UserCheck, RefreshCw, AlertTriangle,
  Receipt, ArrowDownRight, Wallet, ShoppingBag, Users, ChevronDown, ChevronUp, FileText, User, MapPin
} from 'lucide-react';
import { DueEntry, LedgerEntry, Order, CustomerProfile } from '../types';
import { playAddToCartSound, playOrderSuccessSound } from '../utils/audioFeedback';
import { saveToCpanelDb, normalizeBdPhone, getCustomerDueOrAdvanceBalance } from '../utils/sqlSync';

interface DueLedgerManagerProps {
  ledger: LedgerEntry[];
  setLedger: React.Dispatch<React.SetStateAction<LedgerEntry[]>>;
  orders: Order[];
  setOrders: React.Dispatch<React.SetStateAction<Order[]>>;
  customers: Record<string, CustomerProfile>;
  setCustomers?: React.Dispatch<React.SetStateAction<Record<string, CustomerProfile>>>;
  soundOn: boolean;
}

export interface CustomerLedgerGroup {
  customerKey: string;
  customerName: string;
  customerPhone: string;
  customerAddress?: string;
  dueEntries: DueEntry[];
  orders: Order[];
  totalBill: number;
  totalPaid: number;
  remainingDue: number;
  advanceDeposit: number;
  allPayments: Array<{
    id: string;
    voucherNo: string;
    dueId: string;
    date: string;
    time?: string;
    amount: number;
    paymentMethod: string;
    note?: string;
  }>;
}

const DEFAULT_DUE_DATA: DueEntry[] = [];


export default function DueLedgerManager({
  ledger,
  setLedger,
  orders,
  setOrders,
  customers,
  setCustomers,
  soundOn
}: DueLedgerManagerProps) {
  const todayStr = new Date().toISOString().split('T')[0];

  // 1. Due Entries State
  const [dueList, setDueList] = useState<DueEntry[]>(() => {
    const saved = localStorage.getItem('salma_due_ledger');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      } catch (e) {
        console.error(e);
      }
    }
    return DEFAULT_DUE_DATA;
  });

  // Listen to storage events so remote/cross-tab changes to salma_due_ledger sync immediately
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'salma_due_ledger' && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (Array.isArray(parsed)) {
            setDueList(parsed);
          }
        } catch {
          // ignore
        }
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  // Sync to localStorage
  useEffect(() => {
    localStorage.setItem('salma_due_ledger', JSON.stringify(dueList));
  }, [dueList]);

  // Build unified list of customers from customers DB, localStorage, dueList, and orders
  const allCustomersList: CustomerProfile[] = React.useMemo(() => {
    const map = new Map<string, CustomerProfile>();
    Object.values(customers || {}).forEach(c => {
      if (!c) return;
      const key = normalizeBdPhone(c.phone) || c.name.trim();
      if (key) map.set(key, { ...c, phone: normalizeBdPhone(c.phone) || c.phone });
    });
    try {
      const storedRaw = localStorage.getItem('salma_customers');
      if (storedRaw) {
        const storedMap = JSON.parse(storedRaw);
        if (storedMap && typeof storedMap === 'object') {
          Object.values(storedMap as Record<string, CustomerProfile>).forEach(c => {
            if (!c) return;
            const key = normalizeBdPhone(c.phone) || c.name.trim();
            if (key && !map.has(key)) {
              map.set(key, { ...c, phone: normalizeBdPhone(c.phone) || c.phone });
            }
          });
        }
      }
    } catch {
      // ignore
    }
    dueList.forEach(d => {
      const key = normalizeBdPhone(d.customerPhone) || d.customerName.trim();
      if (key && !map.has(key)) {
        map.set(key, {
          phone: normalizeBdPhone(d.customerPhone) || d.customerPhone,
          name: d.customerName,
          address: 'চান্দনা চৌরাস্তা, গাজীপুর',
          loyaltyPoints: 50,
          registeredAt: d.date || todayStr,
          totalOrders: 1,
          totalSpent: d.totalAmount || 0
        });
      }
    });
    orders.forEach(o => {
      const key = normalizeBdPhone(o.phone) || o.customerName.trim();
      if (key && !map.has(key)) {
        map.set(key, {
          phone: normalizeBdPhone(o.phone) || o.phone,
          name: o.customerName,
          address: o.address || 'চান্দনা চৌরাস্তা, গাজীপুর',
          loyaltyPoints: 50,
          registeredAt: o.date || todayStr,
          totalOrders: 1,
          totalSpent: o.totalAmount || 0
        });
      }
    });
    return Array.from(map.values());
  }, [customers, dueList, orders, todayStr]);

  // Selected Customer for Transaction Entry (কাস্টমারের নাম সিলেক্ট করার পর লেনদেন এন্ট্রি)
  const [selectedCustomerKey, setSelectedCustomerKey] = useState<string>('');
  const [customerTxMode, setCustomerTxMode] = useState<'new_due' | 'any_deposit'>('new_due');
  const [isNewCustomerInline, setIsNewCustomerInline] = useState<boolean>(false);
  const [inlineNewCustName, setInlineNewCustName] = useState<string>('');
  const [inlineNewCustPhone, setInlineNewCustPhone] = useState<string>('');
  const [inlineNewCustAddress, setInlineNewCustAddress] = useState<string>('');

  const selectedCustomerObj = React.useMemo(() => {
    if (!selectedCustomerKey) return null;
    return allCustomersList.find(
      c => (normalizeBdPhone(c.phone) || c.name.trim()) === selectedCustomerKey
    ) || null;
  }, [selectedCustomerKey, allCustomersList]);

  const selectedCustomerBalance = React.useMemo(() => {
    if (!selectedCustomerObj) return { totalBill: 0, totalPaid: 0, remainingDue: 0, advanceDeposit: 0 };
    return getCustomerDueOrAdvanceBalance(selectedCustomerObj.phone, selectedCustomerObj.name, dueList);
  }, [selectedCustomerObj, dueList]);

  // Helper to ensure customer is saved in salma_customers DB & parent state immediately
  const ensureCustomerInDb = (name: string, phone: string, address?: string) => {
    const cleanPhone = normalizeBdPhone(phone) || phone.trim();
    if (!cleanPhone || !name.trim()) return;
    try {
      const raw = localStorage.getItem('salma_customers');
      const currentMap: Record<string, CustomerProfile> = raw ? JSON.parse(raw) : { ...customers };
      const existing = currentMap[cleanPhone];
      currentMap[cleanPhone] = existing
        ? { ...existing, name: name.trim(), address: address || existing.address }
        : {
            phone: cleanPhone,
            name: name.trim(),
            address: address || 'চান্দনা চৌরাস্তা, গাজীপুর',
            loyaltyPoints: 50,
            registeredAt: todayStr,
            totalOrders: 0,
            totalSpent: 0
          };
      localStorage.setItem('salma_customers', JSON.stringify(currentMap));
      saveToCpanelDb('salma_customers', currentMap);
      if (setCustomers) {
        setCustomers(currentMap);
      }
    } catch {
      // ignore
    }
  };

  // Search & Filter
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'due' | 'unpaid' | 'partial' | 'paid' | 'orders'>('all');

  // Customer Groups Expansion State (Expanded by default; users can collapse if desired)
  const [collapsedCustomers, setCollapsedCustomers] = useState<Record<string, boolean>>({});

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingDueId, setEditingDueId] = useState<string | null>(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [selectedDue, setSelectedDue] = useState<DueEntry | null>(null);

  // Customer-level Statement & Deposit Modals
  const [isCustomerStatementOpen, setIsCustomerStatementOpen] = useState(false);
  const [statementCustomer, setStatementCustomer] = useState<any | null>(null);
  const [customerDepositModalGroup, setCustomerDepositModalGroup] = useState<any | null>(null);

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

  // Form State: Collect Payment (Any Amount Deposit)
  const [paymentData, setPaymentData] = useState({
    amount: '',
    paymentMethod: 'Cash' as 'Cash' | 'bKash' | 'Nagad' | 'Bank',
    addToPosLedger: true,
    note: ''
  });

  // When a customer is selected in the top selector, sync formData customerName & customerPhone
  const handleSelectCustomerFromDropdown = (key: string) => {
    if (key === '__NEW__') {
      setIsNewCustomerInline(true);
      setSelectedCustomerKey('');
      return;
    }
    setIsNewCustomerInline(false);
    // If clicking already selected customer, deselect so all customers can be viewed
    if (selectedCustomerKey === key) {
      setSelectedCustomerKey('');
      return;
    }
    setSelectedCustomerKey(key);
    const found = allCustomersList.find(c => (normalizeBdPhone(c.phone) || c.name.trim()) === key);
    if (found) {
      setFormData(prev => ({
        ...prev,
        customerName: found.name,
        customerPhone: found.phone
      }));
    }
  };

  const handleCreateAndSelectInlineCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPhone = normalizeBdPhone(inlineNewCustPhone);
    const cleanName = inlineNewCustName.trim();
    if (!cleanName || cleanPhone.length !== 11) {
      alert('অনুগ্রহ করে কাস্টমারের নাম এবং ১১ ডিজিটের মোবাইল নম্বর (01XXXXXXXXX) দিন।');
      return;
    }
    ensureCustomerInDb(cleanName, cleanPhone, inlineNewCustAddress.trim() || 'চান্দনা চৌরাস্তা, গাজীপুর');
    setSelectedCustomerKey(cleanPhone);
    setFormData(prev => ({
      ...prev,
      customerName: cleanName,
      customerPhone: cleanPhone
    }));
    setIsNewCustomerInline(false);
    setInlineNewCustName('');
    setInlineNewCustPhone('');
    setInlineNewCustAddress('');
    if (soundOn) playAddToCartSound();
  };

  // Handler: Direct Any-Amount Deposit for Selected Customer (যেকোনো পরিমাণ জমা / অগ্রীম জমা)
  const handleDirectCustomerDeposit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomerObj) {
      alert('প্রথমে কাস্টমারের নাম সিলেক্ট করুন!');
      return;
    }
    const payAmount = parseFloat(paymentData.amount);
    if (!payAmount || payAmount <= 0) {
      alert('সঠিক জমার পরিমাণ (৳) লিখুন!');
      return;
    }

    const custPhone = normalizeBdPhone(selectedCustomerObj.phone) || selectedCustomerObj.phone;
    const custName = selectedCustomerObj.name;
    ensureCustomerInDb(custName, custPhone, selectedCustomerObj.address);

    const newPaymentRecord = {
      id: `pay-${Date.now()}`,
      date: todayStr,
      time: new Date().toLocaleTimeString('bn-BD', { hour: '2-digit', minute: '2-digit' }),
      amount: payAmount,
      paymentMethod: paymentData.paymentMethod,
      note: paymentData.note.trim() || 'কাস্টমার জমা / অগ্রীম জমা'
    };

    let voucherUsed = `DEP-${Math.floor(100 + Math.random() * 900)}`;

    const custEntries = dueList.filter(
      d => (normalizeBdPhone(d.customerPhone) || d.customerName.trim()) === (custPhone || custName.trim())
    );

    let updatedDueList: DueEntry[];

    if (custEntries.length === 0) {
      const advEntry: DueEntry = {
        id: `due-${Date.now()}`,
        voucherNo: voucherUsed,
        customerName: custName,
        customerPhone: custPhone,
        totalAmount: 0,
        paidAmount: payAmount,
        dueAmount: 0,
        date: todayStr,
        itemsDescription: paymentData.note.trim() || 'অগ্রীম জমা (Advance Deposit)',
        status: 'paid',
        payments: [newPaymentRecord],
        note: paymentData.note.trim() || `অগ্রীম জমা ৳${payAmount}`
      };
      updatedDueList = [advEntry, ...dueList];
    } else {
      let remainingToAllocate = payAmount;
      const targetIdsOrder = [
        ...custEntries.filter(d => d.dueAmount > 0).map(d => d.id),
        ...custEntries.filter(d => d.dueAmount <= 0).map(d => d.id)
      ];
      const primaryTargetId = targetIdsOrder[0];
      voucherUsed = custEntries.find(d => d.id === primaryTargetId)?.voucherNo || voucherUsed;

      updatedDueList = dueList.map(item => {
        const isThisCust = (normalizeBdPhone(item.customerPhone) || item.customerName.trim()) === (custPhone || custName.trim());
        if (!isThisCust || remainingToAllocate <= 0) return item;

        const isLastTarget = item.id === targetIdsOrder[targetIdsOrder.length - 1];
        const currentDue = Math.max(0, item.totalAmount - item.paidAmount);

        let addHere = 0;
        if (targetIdsOrder.length === 1 || isLastTarget) {
          addHere = remainingToAllocate;
        } else if (currentDue > 0) {
          addHere = Math.min(remainingToAllocate, currentDue);
        }

        if (addHere <= 0) return item;
        remainingToAllocate -= addHere;

        const nextPaid = item.paidAmount + addHere;
        const nextDue = Math.max(0, item.totalAmount - nextPaid);
        const nextStatus: DueEntry['status'] = nextDue === 0 ? 'paid' : (nextPaid > 0 ? 'partial' : 'unpaid');

        return {
          ...item,
          paidAmount: nextPaid,
          dueAmount: nextDue,
          status: nextStatus,
          payments: [
            ...(item.payments || []),
            {
              ...newPaymentRecord,
              id: `pay-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
              amount: addHere
            }
          ]
        };
      });
    }

    saveToCpanelDb('salma_due_ledger', updatedDueList);
    setDueList(updatedDueList);

    if (paymentData.addToPosLedger) {
      const posEntry: LedgerEntry = {
        id: `pos-${Date.now()}`,
        voucherNo: `VCH-${voucherUsed}`,
        type: 'income',
        category: 'বাকি আদায় ও অগ্রীম জমা (Due/Advance Collection)',
        amount: payAmount,
        date: todayStr,
        paymentMethod: paymentData.paymentMethod,
        note: `${custName} (${custPhone}) থেকে জমা আদায় (${paymentData.note.trim() || voucherUsed})`
      };
      const updatedLedger = [posEntry, ...ledger];
      saveToCpanelDb('salma_ledger', updatedLedger);
      setLedger(updatedLedger);
    }

    if (soundOn) playOrderSuccessSound();
    setPaymentData({ amount: '', paymentMethod: 'Cash', addToPosLedger: true, note: '' });
    alert(`গ্রাহক "${custName}"-এর একাউন্টে ৳${payAmount} সফলভাবে জমা হয়েছে!`);
  };

  // KPI Calculations (Customer-level net balances)
  const activeDues = dueList.filter(d => d.dueAmount > 0);
  const totalOutstandingDue = allCustomersList.reduce((sum, c) => {
    const bal = getCustomerDueOrAdvanceBalance(c.phone, c.name, dueList);
    return sum + bal.remainingDue;
  }, 0);
  const totalAdvanceDeposit = allCustomersList.reduce((sum, c) => {
    const bal = getCustomerDueOrAdvanceBalance(c.phone, c.name, dueList);
    return sum + bal.advanceDeposit;
  }, 0);
  const totalCollectedAmount = dueList.reduce((sum, d) => sum + d.paidAmount, 0);
  const uniqueDueCustomers = allCustomersList.filter(
    c => getCustomerDueOrAdvanceBalance(c.phone, c.name, dueList).remainingDue > 0
  ).length;

  // Order Dues (from online orders that have remaining delivery due)
  const orderDuesList = orders.filter(o => o.dueAmount > 0 && o.status !== 'Delivered' && o.status !== 'Cancelled');
  const totalOrderDue = orderDuesList.reduce((sum, o) => sum + o.dueAmount, 0);

  // Customer-First Ledger Grouping (কাষ্টমার প্রোফাইলের ভিতরে সকল লেনদেন)
  const customerLedgerGroups: CustomerLedgerGroup[] = React.useMemo(() => {
    const groupMap = new Map<string, CustomerLedgerGroup>();

    // 1. Seed from allCustomersList
    allCustomersList.forEach(c => {
      const key = normalizeBdPhone(c.phone) || c.name.trim();
      if (!key) return;
      if (!groupMap.has(key)) {
        groupMap.set(key, {
          customerKey: key,
          customerName: c.name,
          customerPhone: normalizeBdPhone(c.phone) || c.phone,
          customerAddress: c.address || 'চান্দনা চৌরাস্তা, গাজীপুর',
          dueEntries: [],
          orders: [],
          totalBill: 0,
          totalPaid: 0,
          remainingDue: 0,
          advanceDeposit: 0,
          allPayments: []
        });
      }
    });

    // 2. Map every dueList entry to its respective customer profile
    dueList.forEach(d => {
      const key = normalizeBdPhone(d.customerPhone) || d.customerName.trim();
      let grp = groupMap.get(key);
      if (!grp) {
        grp = {
          customerKey: key,
          customerName: d.customerName || 'সম্মানিত গ্রাহক',
          customerPhone: normalizeBdPhone(d.customerPhone) || d.customerPhone,
          customerAddress: 'চান্দনা চৌরাস্তা, গাজীপুর',
          dueEntries: [],
          orders: [],
          totalBill: 0,
          totalPaid: 0,
          remainingDue: 0,
          advanceDeposit: 0,
          allPayments: []
        };
        groupMap.set(key, grp);
      }
      if (d.customerName && (!grp.customerName || grp.customerName === 'সাধারণ খদ্দের' || grp.customerName === 'সম্মানিত গ্রাহক')) {
        grp.customerName = d.customerName;
      }
      grp.dueEntries.push(d);
      grp.totalBill += Number(d.totalAmount) || 0;
      grp.totalPaid += Number(d.paidAmount) || 0;

      (d.payments || []).forEach(p => {
        grp!.allPayments.push({
          id: p.id,
          voucherNo: d.voucherNo,
          dueId: d.id,
          date: p.date,
          time: p.time,
          amount: Number(p.amount) || 0,
          paymentMethod: p.paymentMethod,
          note: p.note
        });
      });
    });

    // 3. Map online orders
    orders.forEach(o => {
      const key = normalizeBdPhone(o.phone) || o.customerName.trim();
      let grp = groupMap.get(key);
      if (!grp) {
        grp = {
          customerKey: key,
          customerName: o.customerName,
          customerPhone: normalizeBdPhone(o.phone) || o.phone,
          customerAddress: o.address || 'চান্দনা চৌরাস্তা, গাজীপুর',
          dueEntries: [],
          orders: [],
          totalBill: 0,
          totalPaid: 0,
          remainingDue: 0,
          advanceDeposit: 0,
          allPayments: []
        };
        groupMap.set(key, grp);
      }
      grp.orders.push(o);
    });

    // 4. Calculate net remainingDue & advanceDeposit
    const list = Array.from(groupMap.values()).map(g => {
      const diff = g.totalBill - g.totalPaid;
      return {
        ...g,
        remainingDue: diff > 0 ? diff : 0,
        advanceDeposit: diff < 0 ? Math.abs(diff) : 0
      };
    });

    // Sort by remaining due (highest due first), then advance deposit, then customer name
    list.sort((a, b) => {
      if (a.remainingDue !== b.remainingDue) return b.remainingDue - a.remainingDue;
      if (a.advanceDeposit !== b.advanceDeposit) return b.advanceDeposit - a.advanceDeposit;
      return a.customerName.localeCompare(b.customerName, 'bn');
    });

    return list;
  }, [allCustomersList, dueList, orders]);

  // Filter Logic across Customer Profiles
  const filteredCustomerGroups = customerLedgerGroups.filter(grp => {
    // CRITICAL: When a customer is selected at the top, ONLY show that customer's transactions!
    if (selectedCustomerKey) {
      if (grp.customerKey !== selectedCustomerKey) {
        return false;
      }
    }

    const hasTransactions = grp.dueEntries.length > 0 || grp.orders.length > 0;

    if (activeFilter === 'due' && grp.remainingDue <= 0) return false;
    if (activeFilter === 'unpaid' && (grp.remainingDue <= 0 || grp.totalPaid > 0)) return false;
    if (activeFilter === 'partial' && (grp.remainingDue <= 0 || grp.totalPaid === 0)) return false;
    if (activeFilter === 'paid' && grp.remainingDue > 0) return false;

    if (!searchTerm.trim()) return hasTransactions || grp.remainingDue > 0 || grp.advanceDeposit > 0;

    const q = searchTerm.toLowerCase().trim();
    const matchCustomer =
      grp.customerName.toLowerCase().includes(q) ||
      grp.customerPhone.includes(q) ||
      (grp.customerAddress && grp.customerAddress.toLowerCase().includes(q));
    if (matchCustomer) return true;

    const matchVoucher = grp.dueEntries.some(
      d =>
        d.voucherNo.toLowerCase().includes(q) ||
        d.itemsDescription.toLowerCase().includes(q) ||
        (d.note && d.note.toLowerCase().includes(q))
    );
    if (matchVoucher) return true;

    const matchOrder = grp.orders.some(
      o => o.id.toLowerCase().includes(q) || o.items.some(i => i.nameBn.toLowerCase().includes(q))
    );
    return matchOrder;
  });

  const isCustomerExpanded = (key: string) => {
    return collapsedCustomers[key] !== true; // Expanded by default!
  };

  const toggleCustomerExpanded = (key: string) => {
    setCollapsedCustomers(prev => ({ ...prev, [key]: !isCustomerExpanded(key) }));
  };

  const handleOpenAddDueForCustomer = (grp: CustomerLedgerGroup) => {
    setSelectedCustomerKey(grp.customerKey);
    setEditingDueId(null);
    setFormData({
      customerName: grp.customerName,
      customerPhone: grp.customerPhone,
      totalAmount: '',
      initialPaid: '',
      itemsDescription: '',
      dueDate: '',
      note: '',
      paymentMethod: 'Cash'
    });
    setIsAddModalOpen(true);
  };

  const handleOpenPaymentForCustomer = (grp: CustomerLedgerGroup) => {
    setCustomerDepositModalGroup(grp);
    setPaymentData({
      amount: grp.remainingDue > 0 ? String(grp.remainingDue) : '',
      paymentMethod: 'Cash',
      addToPosLedger: true,
      note: grp.remainingDue > 0 ? 'বাকি পরিশোধ' : 'অগ্রীম জমা'
    });
  };

  const handleSendCustomerSmsReminder = (customerName: string, phone: string, amount: number) => {
    const text = encodeURIComponent(
      `আসসালামু আলাইকুম ${customerName} সাহেব, সালমা ফুড কর্ণার (চান্দনা চৌরাস্তা, গাজীপুর) থেকে বিনীতভাবে জানানো যাচ্ছে যে আপনার মোট বকেয়া বাকি ৳${amount} টাকা পরিশোধের জন্য অনুরোধ করা হচ্ছে। ধন্যবাদ!`
    );
    window.open(`sms:${phone}?body=${text}`, '_blank');
  };

  const handleSendCustomerWhatsAppReminder = (customerName: string, phone: string, amount: number) => {
    const cleanPhone = phone.replace(/\D/g, '');
    const intlPhone = cleanPhone.startsWith('0') ? '88' + cleanPhone : cleanPhone;
    const text = encodeURIComponent(
      `আসসালামু আলাইকুম ${customerName} সাহেব, সালমা ফুড কর্ণার (চান্দনা চৌরাস্তা, গাজীপুর) থেকে বিনীতভাবে জানানো যাচ্ছে যে আপনার মোট বকেয়া বাকি ৳${amount} টাকা পরিশোধের জন্য অনুরোধ করা হচ্ছে। ধন্যবাদ!`
    );
    window.open(`https://wa.me/${intlPhone}?text=${text}`, '_blank');
  };

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

  // Handler: Add or Update Due (Allows any initialPaid amount; excess becomes Advance Deposit!)
  const handleAddNewDue = (e: React.FormEvent) => {
    e.preventDefault();
    const total = parseFloat(formData.totalAmount) || 0;
    const initialPaid = parseFloat(formData.initialPaid) || 0;
    if (total <= 0 && initialPaid <= 0) {
      alert('অনুগ্রহ করে বাকির পরিমাণ অথবা জমার পরিমাণ লিখুন');
      return;
    }

    const custName = formData.customerName.trim() || selectedCustomerObj?.name || 'সাধারণ খদ্দের';
    const custPhone = normalizeBdPhone(formData.customerPhone.trim() || selectedCustomerObj?.phone || '') || 'N/A';
    if (custPhone !== 'N/A') {
      ensureCustomerInDb(custName, custPhone);
    }

    const dueAmount = Math.max(0, total - initialPaid);
    const status: DueEntry['status'] = dueAmount === 0 ? 'paid' : (initialPaid > 0 ? 'partial' : 'unpaid');

    if (editingDueId) {
      const updated = dueList.map(item => {
        if (item.id === editingDueId) {
          return {
            ...item,
            customerName: custName,
            customerPhone: custPhone,
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
      setDueList(updated);
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
      customerName: custName,
      customerPhone: custPhone,
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
          note: initialPaid > total ? `প্রাথমিক জমা ও অগ্রীম জমা (+৳${initialPaid - total})` : 'বাকি খোলার সময় প্রাথমিক জমা'
        }
      ] : [],
      note: formData.note.trim()
    };

    const updatedDue = [newEntry, ...dueList];
    saveToCpanelDb('salma_due_ledger', updatedDue);
    setDueList(updatedDue);

    // If initial paid was given, record in POS Ledger as income
    if (initialPaid > 0) {
      const posEntry: LedgerEntry = {
        id: `pos-${Date.now()}`,
        voucherNo: `VCH-${newVoucher}`,
        type: 'income',
        category: 'বাকি আদায় ও জমা (Due Collection)',
        amount: initialPaid,
        date: todayStr,
        paymentMethod: formData.paymentMethod,
        note: `${custName} এর জমা (${newVoucher})`
      };
      const updatedLedger = [posEntry, ...ledger];
      saveToCpanelDb('salma_ledger', updatedLedger);
      setLedger(updatedLedger);
    }

    if (soundOn) playAddToCartSound();
    setIsAddModalOpen(false);
    setEditingDueId(null);
    setFormData(prev => ({
      ...prev,
      totalAmount: '',
      initialPaid: '',
      itemsDescription: '',
      dueDate: '',
      note: '',
      paymentMethod: 'Cash'
    }));
    alert(`নতুন বাকি এন্ট্রি #${newVoucher} (${custName}) সফলভাবে যুক্ত হয়েছে!`);
  };

  // Handler: Open Payment Modal
  const handleOpenPayment = (due: DueEntry) => {
    setSelectedDue(due);
    setPaymentData({
      amount: due.dueAmount > 0 ? due.dueAmount.toString() : '',
      paymentMethod: 'Cash',
      addToPosLedger: true,
      note: 'বাকি পরিশোধ / জমা'
    });
    setIsPaymentModalOpen(true);
  };

  // Handler: Submit Payment (Allows ANY deposit amount; excess becomes Advance Deposit!)
  const handleSubmitPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDue) return;

    const payAmount = parseFloat(paymentData.amount);
    if (!payAmount || payAmount <= 0) {
      alert('সঠিক জমার পরিমাণ দিন');
      return;
    }

    const newPaidAmount = selectedDue.paidAmount + payAmount;
    const newDueAmount = Math.max(0, selectedDue.totalAmount - newPaidAmount);
    const newStatus: DueEntry['status'] = newDueAmount <= 0 ? 'paid' : 'partial';

    const newPaymentRecord = {
      id: `pay-${Date.now()}`,
      date: todayStr,
      time: new Date().toLocaleTimeString('bn-BD', { hour: '2-digit', minute: '2-digit' }),
      amount: payAmount,
      paymentMethod: paymentData.paymentMethod,
      note: paymentData.note.trim() || (newPaidAmount > selectedDue.totalAmount ? 'বাকি পরিশোধ ও অগ্রীম জমা' : 'বাকি আদায়')
    };

    const updatedDue = dueList.map(item => {
      if (item.id === selectedDue.id) {
        return {
          ...item,
          paidAmount: newPaidAmount,
          dueAmount: newDueAmount,
          status: newStatus,
          payments: [...(item.payments || []), newPaymentRecord]
        };
      }
      return item;
    });
    saveToCpanelDb('salma_due_ledger', updatedDue);
    setDueList(updatedDue);

    // Add to POS ledger if checked
    if (paymentData.addToPosLedger) {
      const posEntry: LedgerEntry = {
        id: `pos-${Date.now()}`,
        voucherNo: `VCH-${selectedDue.voucherNo}`,
        type: 'income',
        category: 'বাকি আদায় ও অগ্রীম জমা (Due Collection)',
        amount: payAmount,
        date: todayStr,
        paymentMethod: paymentData.paymentMethod,
        note: `${selectedDue.customerName} থেকে জমা আদায় (${selectedDue.voucherNo})`
      };
      const updatedLedger = [posEntry, ...ledger];
      saveToCpanelDb('salma_ledger', updatedLedger);
      setLedger(updatedLedger);
    }

    if (soundOn) playOrderSuccessSound();
    setIsPaymentModalOpen(false);
    alert(`৳${payAmount} সফলভাবে জমা করা হয়েছে!`);
  };

  // Handler: Delete Due Entry
  const handleDeleteDue = (id: string, voucherNo: string) => {
    if (confirm(`আপনি কি সত্যিই বাকি রেকর্ড ${voucherNo} মুছে ফেলতে চান?`)) {
      const updated = dueList.filter(d => d.id !== id);
      saveToCpanelDb('salma_due_ledger', updated);
      setDueList(updated);
    }
  };

  // Handler: Delete Individual Payment Installment inside a Due Record
  const handleDeletePaymentInstallment = (dueId: string, paymentId: string, payAmount: number) => {
    if (confirm(`আপনি কি এই ৳${payAmount} জমার এন্ট্রিটি মুছে ফেলতে চান?`)) {
      const updated = dueList.map(d => {
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
      setDueList(updated);
    }
  };

  // Handler: Settle Online Order Delivery Due
  const handleSettleOrderDue = (order: Order) => {
    if (confirm(`অর্ডার #${order.id} এর অবশিষ্ট ডেলিভারি বাকি ৳${order.dueAmount} নগদ আদায় করে 'Delivered' হিসেবে চিহ্নিত করবেন?`)) {
      const collected = order.dueAmount;
      const updatedOrders = orders.map(o => {
        if (o.id === order.id) {
          return {
            ...o,
            dueAmount: 0,
            paymentStatus: 'Fully Paid (100%)' as const,
            status: 'Delivered' as const
          };
        }
        return o;
      });
      saveToCpanelDb('salma_orders', updatedOrders);
      setOrders(updatedOrders);

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
      const updatedLedger = [posEntry, ...ledger];
      saveToCpanelDb('salma_ledger', updatedLedger);
      setLedger(updatedLedger);

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

  // Handler: Customer-Level Deposit Submit (deposits to customer balance and settles dues)
  const handleCustomerDepositSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerDepositModalGroup) return;

    const depositAmount = parseFloat(paymentData.amount) || 0;
    if (depositAmount <= 0) {
      alert('অনুগ্রহ করে সঠিক জমার পরিমাণ লিখুন');
      return;
    }

    const grp = customerDepositModalGroup;
    let remainingToDistribute = depositAmount;
    const nowTimeStr = new Date().toLocaleTimeString('bn-BD', { hour: '2-digit', minute: '2-digit' });
    const noteText = paymentData.note.trim() || (grp.remainingDue > 0 ? 'গ্রাহক একাউন্টে জমা' : 'অগ্রীম জমা');

    let updatedDueList = [...dueList];

    // Find all vouchers for this customer
    const customerVouchers = updatedDueList.filter(d => {
      const key = normalizeBdPhone(d.customerPhone) || d.customerName.trim();
      return key === grp.customerKey;
    });

    if (customerVouchers.length > 0) {
      // Sort vouchers: unpaid/partial first (chronological), then paid
      customerVouchers.sort((a, b) => {
        if (a.dueAmount > 0 && b.dueAmount <= 0) return -1;
        if (a.dueAmount <= 0 && b.dueAmount > 0) return 1;
        return a.date.localeCompare(b.date);
      });

      // Distribute payment across vouchers
      for (const v of customerVouchers) {
        if (remainingToDistribute <= 0) break;

        const targetDue = updatedDueList.find(item => item.id === v.id);
        if (!targetDue) continue;

        let payForThis = 0;
        if (targetDue.dueAmount > 0) {
          payForThis = Math.min(remainingToDistribute, targetDue.dueAmount);
        } else if (v === customerVouchers[customerVouchers.length - 1] && remainingToDistribute > 0) {
          payForThis = remainingToDistribute;
        }

        if (payForThis > 0) {
          remainingToDistribute -= payForThis;
          const nextPaid = targetDue.paidAmount + payForThis;
          const nextDue = Math.max(0, targetDue.totalAmount - nextPaid);
          const nextStatus: DueEntry['status'] = nextDue === 0 ? 'paid' : 'partial';

          const newPaymentRecord = {
            id: `pay-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            date: todayStr,
            time: nowTimeStr,
            amount: payForThis,
            paymentMethod: paymentData.paymentMethod,
            note: noteText
          };

          updatedDueList = updatedDueList.map(item => {
            if (item.id === targetDue.id) {
              return {
                ...item,
                paidAmount: nextPaid,
                dueAmount: nextDue,
                status: nextStatus,
                payments: [...(item.payments || []), newPaymentRecord]
              };
            }
            return item;
          });
        }
      }

      // If any excess remaining, attach to the last voucher
      if (remainingToDistribute > 0 && customerVouchers.length > 0) {
        const lastVoucherId = customerVouchers[customerVouchers.length - 1].id;
        const targetDue = updatedDueList.find(item => item.id === lastVoucherId);
        if (targetDue) {
          const nextPaid = targetDue.paidAmount + remainingToDistribute;
          const newPaymentRecord = {
            id: `pay-${Date.now()}-adv`,
            date: todayStr,
            time: nowTimeStr,
            amount: remainingToDistribute,
            paymentMethod: paymentData.paymentMethod,
            note: 'অগ্রীম জমা (Advance Deposit)'
          };
          updatedDueList = updatedDueList.map(item => {
            if (item.id === targetDue.id) {
              return {
                ...item,
                paidAmount: nextPaid,
                payments: [...(item.payments || []), newPaymentRecord]
              };
            }
            return item;
          });
        }
      }
    } else {
      // Create new advance voucher for this customer
      const advanceVoucher: DueEntry = {
        id: `due-${Date.now()}`,
        voucherNo: `ADV-${Math.floor(100 + Math.random() * 900)}`,
        customerName: grp.customerName,
        customerPhone: grp.customerPhone,
        totalAmount: 0,
        paidAmount: depositAmount,
        dueAmount: 0,
        itemsDescription: 'অগ্রীম ব্যালেন্স জমা (Advance Credit Deposit)',
        date: todayStr,
        status: 'paid',
        note: noteText,
        payments: [
          {
            id: `pay-${Date.now()}`,
            date: todayStr,
            time: nowTimeStr,
            amount: depositAmount,
            paymentMethod: paymentData.paymentMethod,
            note: noteText
          }
        ]
      };
      updatedDueList = [advanceVoucher, ...updatedDueList];
    }

    saveToCpanelDb('salma_due_ledger', updatedDueList);
    setDueList(updatedDueList);

    // Add to POS ledger if checked
    if (paymentData.addToPosLedger) {
      const posEntry: LedgerEntry = {
        id: `pos-${Date.now()}`,
        voucherNo: `DEP-${Math.floor(100 + Math.random() * 900)}`,
        type: 'income',
        category: 'গ্রাহক জমা ও বকেয়া আদায়',
        amount: depositAmount,
        date: todayStr,
        paymentMethod: paymentData.paymentMethod,
        note: `${grp.customerName} (${grp.customerPhone}) থেকে জমা আদায়`
      };
      const updatedLedger = [posEntry, ...ledger];
      saveToCpanelDb('salma_ledger', updatedLedger);
      setLedger(updatedLedger);
    }

    if (soundOn) playOrderSuccessSound();
    setCustomerDepositModalGroup(null);
    alert(`${grp.customerName}-এর অনুকূলে ৳${depositAmount} সফলভাবে জমা এন্ট্রি হয়েছে!`);
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
              <p className="text-[11px] text-amber-100 font-medium">কাস্টমার সিলেক্ট করে নতুন বাকি ও যেকোনো পরিমাণ জমা এন্ট্রি</p>
            </div>
          </div>
          <button
            onClick={() => {
              setEditingDueId(null);
              setFormData({
                customerName: selectedCustomerObj?.name || '',
                customerPhone: selectedCustomerObj?.phone || '',
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
              <span>মোট অবশিষ্ট বাকি</span>
              <AlertCircle className="w-3.5 h-3.5 text-red-600" />
            </div>
            <p className="text-base font-black text-red-600">৳ {totalOutstandingDue}</p>
            <p className="text-[9px] text-gray-500 font-semibold">{uniqueDueCustomers} জন কাস্টমারের বকেয়া</p>
          </div>

          <div className="bg-white/95 backdrop-blur-xs p-2.5 rounded-2xl shadow-2xs border border-white/40">
            <div className="flex items-center justify-between text-[10px] text-emerald-700 font-bold mb-0.5">
              <span>মোট অগ্রীম জমা</span>
              <Wallet className="w-3.5 h-3.5 text-emerald-600" />
            </div>
            <p className="text-base font-black text-emerald-700">৳ {totalAdvanceDeposit}</p>
            <p className="text-[9px] text-gray-500 font-semibold">কাস্টমারদের অগ্রীম ব্যালেন্স</p>
          </div>

          <div className="bg-white/95 backdrop-blur-xs p-2.5 rounded-2xl shadow-2xs border border-white/40">
            <div className="flex items-center justify-between text-[10px] text-amber-800 font-bold mb-0.5">
              <span>মোট আদায়কৃত জমা</span>
              <CheckCircle2 className="w-3.5 h-3.5 text-amber-600" />
            </div>
            <p className="text-base font-black text-gray-900">৳ {totalCollectedAmount}</p>
            <p className="text-[9px] text-gray-500 font-semibold">সর্বমোট জমা</p>
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

      {/* ============================================================== */}
      {/* CUSTOMER SELECTION & TRANSACTION ENTRY PANEL                    */}
      {/* (কাস্টমারের নাম সিলেক্ট করার পর লেনদেন এন্ট্রি)                  */}
      {/* ============================================================== */}
      <div className="bg-white rounded-3xl border-2 border-amber-300 p-4 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-amber-100 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center font-bold">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-black text-gray-900">১. কাস্টমারের নাম সিলেক্ট করুন (লেনদেন এন্ট্রি)</h3>
              <p className="text-[11px] text-gray-500">কাস্টমার সিলেক্ট করার পর নতুন বাকি এন্ট্রি ও যেকোনো পরিমাণ জমা দেওয়া যাবে</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsNewCustomerInline(!isNewCustomerInline)}
            className="bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-bold px-3 py-1.5 rounded-xl flex items-center gap-1 self-start sm:self-auto cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{isNewCustomerInline ? 'তালিকা থেকে সিলেক্ট করুন' : '+ নতুন কাস্টমার যোগ করুন'}</span>
          </button>
        </div>

        {/* Inline Add New Customer Form */}
        {isNewCustomerInline ? (
          <form onSubmit={handleCreateAndSelectInlineCustomer} className="bg-blue-50/60 border border-blue-200 rounded-2xl p-3.5 space-y-3">
            <p className="text-xs font-bold text-blue-900">নতুন কাস্টমার তৈরি করে সরাসরি লেনদেন শুরু করুন:</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <input
                type="text"
                required
                placeholder="কাস্টমারের নাম *"
                value={inlineNewCustName}
                onChange={(e) => setInlineNewCustName(e.target.value)}
                className="bg-white border border-blue-200 rounded-xl px-3 py-2 text-xs font-bold"
              />
              <input
                type="tel"
                maxLength={11}
                required
                placeholder="মোবাইল নম্বর (01XXXXXXXXX) *"
                value={inlineNewCustPhone}
                onChange={(e) => setInlineNewCustPhone(normalizeBdPhone(e.target.value))}
                className="bg-white border border-blue-200 rounded-xl px-3 py-2 text-xs font-mono font-bold"
              />
              <input
                type="text"
                placeholder="ঠিকানা (যেমন: চান্দনা চৌরাস্তা)"
                value={inlineNewCustAddress}
                onChange={(e) => setInlineNewCustAddress(e.target.value)}
                className="bg-white border border-blue-200 rounded-xl px-3 py-2 text-xs"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsNewCustomerInline(false)}
                className="px-3 py-1.5 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100 cursor-pointer"
              >
                বাতিল
              </button>
              <button
                type="submit"
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-4 py-1.5 rounded-xl shadow-xs cursor-pointer"
              >
                সেভ ও সিলেক্ট করুন
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-2.5">
            <select
              value={selectedCustomerKey}
              onChange={(e) => handleSelectCustomerFromDropdown(e.target.value)}
              className="w-full bg-amber-50/60 border-2 border-amber-300 rounded-2xl px-3.5 py-2.5 text-xs font-bold text-gray-900 focus:outline-none focus:border-red-600 cursor-pointer"
            >
              <option value="">-- এখানে ক্লিক করে কাস্টমারের নাম সিলেক্ট করুন --</option>
              {allCustomersList.map(cust => {
                const key = normalizeBdPhone(cust.phone) || cust.name.trim();
                const bal = getCustomerDueOrAdvanceBalance(cust.phone, cust.name, dueList);
                const statusText =
                  bal.remainingDue > 0
                    ? `অবশিষ্ট বাকি: ৳${bal.remainingDue}`
                    : bal.advanceDeposit > 0
                    ? `অগ্রীম জমা: ৳${bal.advanceDeposit}`
                    : 'বাকি নেই (৳০)';
                return (
                  <option key={key} value={key}>
                    {cust.name} ({cust.phone}) — [{statusText}]
                  </option>
                );
              })}
              <option value="__NEW__">+ নতুন কাস্টমার যোগ করুন...</option>
            </select>

            {/* Quick Select Customer Pills with Balance Badges Next to Name */}
            {allCustomersList.length > 0 && (
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                <button
                  type="button"
                  onClick={() => setSelectedCustomerKey('')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap flex items-center gap-1.5 border transition cursor-pointer ${
                    !selectedCustomerKey
                      ? 'bg-gray-900 text-white border-gray-900 shadow-xs'
                      : 'bg-white hover:bg-gray-100 text-gray-700 border-gray-200'
                  }`}
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>সব গ্রাহক ({allCustomersList.length})</span>
                </button>
                {allCustomersList.map(cust => {
                  const key = normalizeBdPhone(cust.phone) || cust.name.trim();
                  const isSelected = selectedCustomerKey === key;
                  const bal = getCustomerDueOrAdvanceBalance(cust.phone, cust.name, dueList);
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => handleSelectCustomerFromDropdown(key)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap flex items-center gap-1.5 border transition cursor-pointer ${
                        isSelected
                          ? 'bg-red-700 text-white border-red-700 shadow-xs'
                          : 'bg-white hover:bg-amber-50 text-gray-800 border-gray-200'
                      }`}
                    >
                      <span>{cust.name}</span>
                      {bal.remainingDue > 0 ? (
                        <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-md ${
                          isSelected ? 'bg-white text-red-700' : 'bg-red-100 text-red-700'
                        }`}>
                          বাকি: ৳{bal.remainingDue}
                        </span>
                      ) : bal.advanceDeposit > 0 ? (
                        <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-md ${
                          isSelected ? 'bg-white text-emerald-800' : 'bg-emerald-100 text-emerald-800'
                        }`}>
                          অগ্রীম: ৳{bal.advanceDeposit}
                        </span>
                      ) : (
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                          isSelected ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600'
                        }`}>
                          ৳০
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* STEP 2: TRANSACTION ENTRY AFTER SELECTING CUSTOMER */}
        {selectedCustomerObj ? (
          <div className="bg-gradient-to-br from-amber-50/70 via-white to-emerald-50/40 border-2 border-emerald-300 rounded-2xl p-3.5 sm:p-4 space-y-3.5 animate-fadeIn">
            {/* Selected Customer Profile Banner with Remaining Due / Advance Deposit Next to Name */}
            <div className="bg-white p-3.5 rounded-2xl border border-gray-200 shadow-2xs space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-red-600 to-amber-500 text-white font-black text-sm flex items-center justify-center shrink-0 shadow-xs">
                    {selectedCustomerObj.name.charAt(0)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-black text-base text-gray-900 leading-none">{selectedCustomerObj.name}</h4>
                      {/* Badge right next to customer name */}
                      {selectedCustomerBalance.remainingDue > 0 ? (
                        <span className="bg-red-600 text-white text-[11px] font-black px-2.5 py-0.5 rounded-full shadow-2xs flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          <span>অবশিষ্ট বাকি: ৳ {selectedCustomerBalance.remainingDue}</span>
                        </span>
                      ) : selectedCustomerBalance.advanceDeposit > 0 ? (
                        <span className="bg-emerald-600 text-white text-[11px] font-black px-2.5 py-0.5 rounded-full shadow-2xs flex items-center gap-1">
                          <Wallet className="w-3 h-3" />
                          <span>অগ্রীম জমা: ৳ {selectedCustomerBalance.advanceDeposit}</span>
                        </span>
                      ) : (
                        <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 text-[11px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          <span>হিসাব পরিশোধিত (৳০)</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedCustomerKey('')}
                  className="text-xs font-bold text-gray-600 hover:text-red-600 bg-gray-50 hover:bg-red-50 border border-gray-200 hover:border-red-200 px-3 py-1.5 rounded-xl flex items-center gap-1 transition cursor-pointer"
                  title="সব গ্রাহকের তালিকা দেখতে সিলেকশন মুছুন"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>সব গ্রাহক দেখুন</span>
                </button>
              </div>

              <div className="flex items-center gap-3 text-xs text-gray-600 flex-wrap pt-2 border-t border-gray-100">
                <a
                  href={`tel:${selectedCustomerObj.phone}`}
                  className="font-mono font-bold text-gray-800 hover:text-blue-600 flex items-center gap-1"
                >
                  <Phone className="w-3.5 h-3.5 text-gray-400" />
                  <span>{selectedCustomerObj.phone}</span>
                </a>
                <span className="text-gray-300">•</span>
                <span className="text-gray-600 font-semibold">
                  মোট বিল: <b className="text-gray-900 font-black">৳ {selectedCustomerBalance.totalBill}</b>
                </span>
                <span className="text-gray-300">•</span>
                <span className="text-emerald-700 font-bold">
                  মোট জমা: <b className="text-emerald-800 font-black">৳ {selectedCustomerBalance.totalPaid}</b>
                </span>
              </div>
            </div>

            {/* Transaction Mode Switcher: New Due vs Any Amount Deposit */}
            <div className="grid grid-cols-2 gap-2 bg-gray-100 p-1.5 rounded-2xl">
              <button
                type="button"
                onClick={() => setCustomerTxMode('new_due')}
                className={`py-2 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition cursor-pointer ${
                  customerTxMode === 'new_due'
                    ? 'bg-red-600 text-white shadow-xs'
                    : 'text-gray-700 hover:bg-white/60'
                }`}
              >
                <Plus className="w-4 h-4" />
                <span>নতুন বাকি এন্ট্রি</span>
              </button>
              <button
                type="button"
                onClick={() => setCustomerTxMode('any_deposit')}
                className={`py-2 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition cursor-pointer ${
                  customerTxMode === 'any_deposit'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-gray-700 hover:bg-white/60'
                }`}
              >
                <Wallet className="w-4 h-4" />
                <span>যেকোনো পরিমাণ জমা / অগ্রীম</span>
              </button>
            </div>

            {/* MODE 1: NEW DUE ENTRY FOR SELECTED CUSTOMER */}
            {customerTxMode === 'new_due' ? (
              <form onSubmit={handleAddNewDue} className="bg-white p-4 rounded-2xl border border-red-200 space-y-3.5 shadow-2xs">
                <div className="flex items-center justify-between border-b pb-2 border-red-100">
                  <span className="text-xs font-black text-red-900 flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-red-600" />
                    <span>{selectedCustomerObj.name}-এর নামে নতুন বাকি যোগ করুন</span>
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      বাকির পরিমাণ / বিল (৳) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      min="0"
                      required
                      placeholder="যেমন: 500"
                      value={formData.totalAmount}
                      onChange={(e) => setFormData({
                        ...formData,
                        customerName: selectedCustomerObj.name,
                        customerPhone: selectedCustomerObj.phone,
                        totalAmount: e.target.value
                      })}
                      className="w-full bg-white border-2 border-red-300 rounded-xl px-3.5 py-2.5 text-sm font-black text-red-600 focus:outline-none focus:border-red-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      নগদ / অগ্রীম জমা <span className="text-gray-400 text-[11px] font-normal">(ঐচ্ছিক)</span>
                    </label>
                    <input
                      type="number"
                      min="0"
                      placeholder="৳ 0 (যদি কোনো টাকা দেয়)"
                      value={formData.initialPaid}
                      onChange={(e) => setFormData({
                        ...formData,
                        customerName: selectedCustomerObj.name,
                        customerPhone: selectedCustomerObj.phone,
                        initialPaid: e.target.value
                      })}
                      className="w-full bg-white border-2 border-emerald-300 rounded-xl px-3.5 py-2.5 text-sm font-black text-emerald-700 focus:outline-none focus:border-emerald-600"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">
                    খাবারের বিবরণ বা আইটেমসমূহ <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="যেমন: কাচ্চি বিরিয়ানি ও রোস্ট"
                    value={formData.itemsDescription}
                    onChange={(e) => setFormData({
                      ...formData,
                      customerName: selectedCustomerObj.name,
                      customerPhone: selectedCustomerObj.phone,
                      itemsDescription: e.target.value
                    })}
                    className="w-full bg-white border border-gray-300 rounded-xl px-3.5 py-2.5 text-xs font-medium text-gray-900 focus:outline-none focus:border-red-500"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">পেমেন্ট মেথড</label>
                    <select
                      value={formData.paymentMethod}
                      onChange={(e) => setFormData({ ...formData, paymentMethod: e.target.value as any })}
                      className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2.5 text-xs font-bold cursor-pointer"
                    >
                      <option value="Cash">ক্যাশ (Cash)</option>
                      <option value="bKash">বিকাশ (bKash)</option>
                      <option value="Nagad">নগদ (Nagad)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">পরিশোধের সম্ভাব্য তারিখ</label>
                    <input
                      type="date"
                      value={formData.dueDate}
                      onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                      className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">মন্তব্য / নোট</label>
                    <input
                      type="text"
                      placeholder="ঐচ্ছিক নোট"
                      value={formData.note}
                      onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                      className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2.5 text-xs"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full bg-red-600 hover:bg-red-700 text-white font-black text-xs sm:text-sm py-3 px-4 rounded-xl shadow-xs transition active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>{selectedCustomerObj.name}-এর নামে বাকি এন্ট্রি সেভ করুন</span>
                </button>
              </form>
            ) : (
              /* MODE 2: ANY AMOUNT DEPOSIT / ADVANCE DEPOSIT FOR SELECTED CUSTOMER */
              <form onSubmit={handleDirectCustomerDeposit} className="bg-white p-4 rounded-2xl border border-emerald-300 space-y-3.5 shadow-2xs">
                <div className="flex items-center justify-between flex-wrap gap-2 border-b pb-2 border-emerald-100">
                  <span className="text-xs font-black text-emerald-950 flex items-center gap-1.5">
                    <Wallet className="w-4 h-4 text-emerald-600" />
                    <span>{selectedCustomerObj.name}-এর একাউন্টে টাকা জমা দিন</span>
                  </span>
                  {selectedCustomerBalance.remainingDue > 0 && (
                    <button
                      type="button"
                      onClick={() => setPaymentData({ ...paymentData, amount: String(selectedCustomerBalance.remainingDue) })}
                      className="text-xs bg-emerald-100 text-emerald-800 font-bold px-2.5 py-1 rounded-xl hover:bg-emerald-200 cursor-pointer"
                    >
                      সম্পূর্ণ বকেয়া (৳{selectedCustomerBalance.remainingDue}) বসান
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">
                      জমার পরিমাণ (৳) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      min="1"
                      required
                      placeholder="যেমন: 200 বা 1000"
                      value={paymentData.amount}
                      onChange={(e) => setPaymentData({ ...paymentData, amount: e.target.value })}
                      className="w-full bg-white border-2 border-emerald-400 rounded-xl px-3.5 py-2.5 text-base font-black text-emerald-700 focus:outline-none focus:border-emerald-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">জমার মাধ্যম</label>
                    <select
                      value={paymentData.paymentMethod}
                      onChange={(e) => setPaymentData({ ...paymentData, paymentMethod: e.target.value as any })}
                      className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2.5 text-xs font-bold cursor-pointer"
                    >
                      <option value="Cash">নগদ ক্যাশ (Cash)</option>
                      <option value="bKash">বিকাশ (bKash)</option>
                      <option value="Nagad">নগদ (Nagad)</option>
                      <option value="Bank">ব্যাংক (Bank)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">নোট / বিবরণ</label>
                    <input
                      type="text"
                      placeholder="যেমন: বাকি পরিশোধ / অগ্রীম জমা"
                      value={paymentData.note}
                      onChange={(e) => setPaymentData({ ...paymentData, note: e.target.value })}
                      className="w-full bg-white border border-gray-300 rounded-xl px-3 py-2.5 text-xs"
                    />
                  </div>
                </div>

                {/* Live Preview of Resulting Balance after Deposit */}
                {Number(paymentData.amount) > 0 && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-xs flex items-center justify-between">
                    <span className="font-bold text-emerald-900">এই জমার পর নতুন ব্যালেন্স হবে:</span>
                    {selectedCustomerBalance.totalBill - (selectedCustomerBalance.totalPaid + Number(paymentData.amount)) > 0 ? (
                      <span className="font-black text-red-600">
                        অবশিষ্ট বাকি: ৳ {selectedCustomerBalance.totalBill - (selectedCustomerBalance.totalPaid + Number(paymentData.amount))}
                      </span>
                    ) : selectedCustomerBalance.totalPaid + Number(paymentData.amount) - selectedCustomerBalance.totalBill > 0 ? (
                      <span className="font-black text-emerald-700">
                        অগ্রীম জমা থাকবে: ৳ {selectedCustomerBalance.totalPaid + Number(paymentData.amount) - selectedCustomerBalance.totalBill}
                      </span>
                    ) : (
                      <span className="font-black text-emerald-700">সম্পূর্ণ পরিশোধিত (৳০)</span>
                    )}
                  </div>
                )}

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                  <label className="flex items-center gap-2 text-xs font-bold text-emerald-950 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={paymentData.addToPosLedger}
                      onChange={(e) => setPaymentData({ ...paymentData, addToPosLedger: e.target.checked })}
                      className="w-4 h-4 text-emerald-600 rounded"
                    />
                    <span>POS লেজারে আজকের আয়ে (Income) যুক্ত করুন</span>
                  </label>

                  <button
                    type="submit"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs sm:text-sm px-6 py-2.5 rounded-xl shadow-xs transition active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Check className="w-4 h-4" />
                    <span>জমা নিশ্চিত করুন</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        ) : (
          <div className="bg-amber-50/60 border border-dashed border-amber-300 rounded-2xl p-3.5 text-center text-xs text-amber-900 font-semibold">
            👆 নতুন বাকি এন্ট্রি করতে অথবা যেকোনো পরিমাণ টাকা জমা নিতে প্রথমে উপরের তালিকা থেকে <b>কাস্টমারের নাম সিলেক্ট করুন</b>।
          </div>
        )}
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
            { id: 'all', label: `সব গ্রাহক (${customerLedgerGroups.length})` },
            { id: 'due', label: `বকেয়া আছে (${customerLedgerGroups.filter(g => g.remainingDue > 0).length})` },
            { id: 'unpaid', label: `সম্পূর্ণ বাকি (${customerLedgerGroups.filter(g => g.remainingDue > 0 && g.totalPaid === 0).length})` },
            { id: 'partial', label: `আংশিক আদায় (${customerLedgerGroups.filter(g => g.remainingDue > 0 && g.totalPaid > 0).length})` },
            { id: 'paid', label: `পরিশোধিত / অগ্রীম (${customerLedgerGroups.filter(g => g.remainingDue === 0).length})` },
            { id: 'orders', label: `অনলাইন অর্ডার বাকি (${orderDuesList.length})` }
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

      {/* Selected Customer Scope Alert */}
      {selectedCustomerKey && selectedCustomerObj && (
        <div className="bg-amber-50 border border-amber-300 rounded-2xl p-3 flex items-center justify-between gap-2 text-xs text-amber-950 shadow-2xs animate-fadeIn">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse shrink-0" />
            <span>
              বর্তমানে শুধুমাত্র <b>{selectedCustomerObj.name}</b>-এর হিসাব ও লেনদেন দেখাচ্ছে।
            </span>
          </div>
          <button
            type="button"
            onClick={() => setSelectedCustomerKey('')}
            className="bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1 cursor-pointer transition shrink-0"
          >
            <Users className="w-3.5 h-3.5" />
            <span>সকল গ্রাহক দেখুন</span>
          </button>
        </div>
      )}

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
        /* SECTION: CUSTOMER-PROFILE CENTRIC DUE LEDGER                  */
        /* (গ্রাহক প্রোফাইলের ভেতরে সকল ভাউচার, লেনদেন ও জমার খতিয়ান)     */
        /* ============================================================== */
        <div className="space-y-3.5">
          {filteredCustomerGroups.length === 0 ? (
            <div className="bg-white rounded-3xl p-8 text-center text-gray-500 border border-gray-200 space-y-2">
              <BookOpen className="w-10 h-10 text-gray-300 mx-auto" />
              <p className="text-sm font-bold text-gray-800">কোনো গ্রাহকের হিসাব পাওয়া যায়নি</p>
              <p className="text-xs text-gray-500">উপরে কাস্টমারের নাম সিলেক্ট করে নতুন বাকি বা জমা এন্ট্রি করুন।</p>
            </div>
          ) : (
            filteredCustomerGroups.map(grp => {
              const hasDue = grp.remainingDue > 0;
              const hasAdvance = grp.advanceDeposit > 0;
              const isExpanded = isCustomerExpanded(grp.customerKey);
              const totalTransactions = grp.dueEntries.length + grp.orders.length;

              return (
                <div
                  key={grp.customerKey}
                  className={`bg-white rounded-3xl border shadow-2xs overflow-hidden transition ${
                    hasDue
                      ? 'border-red-200/90 ring-1 ring-red-100'
                      : hasAdvance
                      ? 'border-emerald-200/90 ring-1 ring-emerald-100'
                      : 'border-gray-200'
                  }`}
                >
                  {/* Customer Profile Header Card */}
                  <div className={`p-4 space-y-3 ${
                    hasDue
                      ? 'bg-gradient-to-r from-red-50/70 via-rose-50/40 to-white'
                      : hasAdvance
                      ? 'bg-gradient-to-r from-emerald-50/70 via-teal-50/40 to-white'
                      : 'bg-gradient-to-r from-gray-50 to-white'
                  }`}>
                    {/* Row 1: Left has Avatar + Name + Balance Badge; Right has Quick Call & Slip Print */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2.5">
                        <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-black text-sm shrink-0 shadow-2xs ${
                          hasDue
                            ? 'bg-red-600 text-white'
                            : hasAdvance
                            ? 'bg-emerald-600 text-white'
                            : 'bg-gray-200 text-gray-700'
                        }`}>
                          {grp.customerName.charAt(0) || 'ক'}
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-base font-black text-gray-900 tracking-tight leading-none">
                              {grp.customerName}
                            </h3>
                            {/* Profile Net Balance Badge Right Next to Name */}
                            {hasDue ? (
                              <span className="bg-red-600 text-white text-[10px] font-black px-2.5 py-0.5 rounded-full shadow-2xs flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" />
                                <span>অবশিষ্ট বাকি: ৳{grp.remainingDue}</span>
                              </span>
                            ) : hasAdvance ? (
                              <span className="bg-emerald-600 text-white text-[10px] font-black px-2.5 py-0.5 rounded-full shadow-2xs flex items-center gap-1">
                                <Wallet className="w-3 h-3" />
                                <span>অগ্রীম জমা: ৳{grp.advanceDeposit}</span>
                              </span>
                            ) : (
                              <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 text-[10px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                <span>হিসাব পরিশোধিত (৳০)</span>
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2 text-xs text-gray-500 font-medium flex-wrap pt-0.5">
                            <a
                              href={`tel:${grp.customerPhone}`}
                              className="font-mono font-bold text-gray-700 hover:text-blue-600 flex items-center gap-1"
                            >
                              <Phone className="w-3 h-3 text-gray-400" />
                              <span>{grp.customerPhone}</span>
                            </a>
                            <span className="text-gray-300">•</span>
                            <span className="text-[11px] text-gray-500 flex items-center gap-1">
                              <MapPin className="w-3 h-3 text-gray-400" />
                              <span className="truncate max-w-[170px] sm:max-w-none">{grp.customerAddress}</span>
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Right: Call & Statement Slip */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <a
                          href={`tel:${grp.customerPhone}`}
                          className="p-2 rounded-xl bg-white border border-gray-200 hover:bg-gray-100 text-gray-700 shadow-2xs transition"
                          title="কল দিন"
                        >
                          <Phone className="w-3.5 h-3.5" />
                        </a>
                        <button
                          onClick={() => {
                            setStatementCustomer(grp);
                            setIsCustomerStatementOpen(true);
                          }}
                          className="px-2.5 py-1.5 rounded-xl bg-white hover:bg-gray-100 text-gray-700 text-xs font-bold border border-gray-200 shadow-2xs flex items-center gap-1 transition cursor-pointer"
                          title="স্টেটমেন্ট স্লিপ"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">স্টেটমেন্ট স্লিপ</span>
                        </button>
                      </div>
                    </div>

                    {/* Row 2: 3 Full-Width KPI Summary Cards (Never cramped, clear bold numbers) */}
                    <div className="grid grid-cols-3 gap-2 w-full text-center pt-0.5">
                      <div className="bg-white/95 border border-gray-200/90 rounded-2xl p-2.5 shadow-2xs">
                        <span className="text-[10px] font-semibold text-gray-500 block leading-tight">মোট খাবার বিল</span>
                        <span className="text-sm font-black text-gray-900 block mt-0.5">৳ {grp.totalBill}</span>
                      </div>
                      <div className="bg-white/95 border border-emerald-200 rounded-2xl p-2.5 shadow-2xs">
                        <span className="text-[10px] font-semibold text-emerald-700 block leading-tight">মোট জমা</span>
                        <span className="text-sm font-black text-emerald-700 block mt-0.5">৳ {grp.totalPaid}</span>
                      </div>
                      <div className={`rounded-2xl p-2.5 shadow-2xs border ${
                        hasDue
                          ? 'bg-red-50 border-red-200 text-red-700'
                          : hasAdvance
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                          : 'bg-gray-50 border-gray-200 text-gray-700'
                      }`}>
                        <span className="text-[10px] font-bold block leading-tight">
                          {hasDue ? 'নিট বাকি' : hasAdvance ? 'অগ্রীম জমা' : 'ব্যালেন্স'}
                        </span>
                        <span className="text-sm font-black block mt-0.5">
                          ৳ {hasDue ? grp.remainingDue : hasAdvance ? grp.advanceDeposit : 0}
                        </span>
                      </div>
                    </div>

                    {/* Customer Action Bar */}
                    <div className="flex items-center justify-between gap-1.5 pt-3 mt-3 border-t border-gray-200/70 flex-wrap">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {/* Call */}
                        <a
                          href={`tel:${grp.customerPhone}`}
                          className="p-2 rounded-xl bg-white border border-gray-200 hover:bg-gray-100 text-gray-700 transition"
                          title="কল দিন"
                        >
                          <Phone className="w-3.5 h-3.5" />
                        </a>

                        {/* Reminders (if remainingDue > 0) */}
                        {hasDue && (
                          <>
                            <button
                              onClick={() => handleSendCustomerSmsReminder(grp.customerName, grp.customerPhone, grp.remainingDue)}
                              className="px-2.5 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 text-[11px] font-bold border border-blue-200 flex items-center gap-1 transition cursor-pointer"
                              title="গ্রাহকের সম্পূর্ণ বকেয়া বাকির SMS তাগাদা পাঠান"
                            >
                              <MessageSquare className="w-3.5 h-3.5" />
                              <span>SMS তাগাদা</span>
                            </button>
                            <button
                              onClick={() => handleSendCustomerWhatsAppReminder(grp.customerName, grp.customerPhone, grp.remainingDue)}
                              className="px-2.5 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[11px] font-bold border border-emerald-200 flex items-center gap-1 transition cursor-pointer"
                              title="হোয়াটসঅ্যাপে সম্পূর্ণ বকেয়া বাকির তাগাদা পাঠান"
                            >
                              <Share2 className="w-3.5 h-3.5" />
                              <span>হোয়াটসঅ্যাপ</span>
                            </button>
                          </>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 flex-wrap">
                        {/* + Add New Due for this customer */}
                        <button
                          onClick={() => handleOpenAddDueForCustomer(grp)}
                          className="bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 font-bold text-xs px-3 py-1.5 rounded-xl flex items-center gap-1 transition active:scale-95 cursor-pointer"
                          title="এই কাস্টমারের নতুন বাকি এন্ট্রি করুন"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>+ নতুন বাকি</span>
                        </button>

                        {/* + Deposit Money for this customer */}
                        <button
                          onClick={() => handleOpenPaymentForCustomer(grp)}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs px-3.5 py-1.5 rounded-xl flex items-center gap-1.5 shadow-xs transition active:scale-95 cursor-pointer"
                          title="এই কাস্টমারের একাউন্টে টাকা জমা নিন"
                        >
                          <Wallet className="w-3.5 h-3.5" />
                          <span>+ টাকা জমা</span>
                        </button>

                        {/* Expand / Collapse Toggle */}
                        <button
                          onClick={() => toggleCustomerExpanded(grp.customerKey)}
                          className="px-2.5 py-1.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-[11px] font-bold flex items-center gap-1 transition cursor-pointer"
                          title="লেনদেনের বিবরণ খুলুন বা বন্ধ করুন"
                        >
                          <span>{isExpanded ? 'লুকান' : `সকল লেনদেন (${totalTransactions})`}</span>
                          {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* ========================================================== */}
                  {/* NESTED: "কাষ্টমার প্রোফাইলের ভিতরে সকল লেনদেন"            */}
                  {/* ========================================================== */}
                  {isExpanded && (
                    <div className="p-4 bg-gray-50/60 border-t border-gray-100 space-y-3.5 animate-fadeIn">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-black text-gray-900 flex items-center gap-1.5">
                          <Receipt className="w-4 h-4 text-red-600" />
                          <span>{grp.customerName}-এর সকল লেনদেন ও বাকির বিস্তারিত খতিয়ান:</span>
                        </h4>
                        <span className="text-[10px] font-bold text-gray-500 bg-white border border-gray-200 px-2 py-0.5 rounded-full">
                          মোট {totalTransactions} টি ভাউচার/রেকর্ড
                        </span>
                      </div>

                      {/* SUB-SECTION 1: FOOD BILLS & DUE VOUCHERS */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-[11px] font-bold text-gray-700">
                          <span className="flex items-center gap-1">
                            <BookOpen className="w-3.5 h-3.5 text-amber-600" />
                            <span>১. খাবারের বিল ও বাকি ভাউচারসমূহ ({grp.dueEntries.length}টি)</span>
                          </span>
                        </div>

                        {grp.dueEntries.length === 0 ? (
                          <div className="bg-white p-3 rounded-2xl border border-dashed border-gray-300 text-center text-xs text-gray-400">
                            কোনো বাকি ভাউচার এন্ট্রি নেই
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {grp.dueEntries.map(due => {
                              const vPaid = due.status === 'paid';
                              const vPartial = due.status === 'partial';

                              return (
                                <div
                                  key={due.id}
                                  className={`bg-white rounded-2xl border p-3 shadow-2xs space-y-2 ${
                                    vPaid
                                      ? 'border-emerald-200 bg-emerald-50/15'
                                      : vPartial
                                      ? 'border-amber-200 bg-amber-50/15'
                                      : 'border-red-200 bg-red-50/10'
                                  }`}
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="space-y-0.5">
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <span className="font-mono text-[10px] font-bold bg-gray-100 text-gray-700 px-2 py-0.5 rounded-md">
                                          {due.voucherNo}
                                        </span>
                                        <span className="text-[10px] text-gray-400 font-mono">{due.date}</span>
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                          vPaid
                                            ? 'bg-emerald-100 text-emerald-800'
                                            : vPartial
                                            ? 'bg-amber-100 text-amber-800'
                                            : 'bg-red-100 text-red-800'
                                        }`}>
                                          {vPaid ? 'পরিশোধিত' : vPartial ? 'আংশিক বাকি' : 'বকেয়া রয়েছে'}
                                        </span>
                                      </div>
                                      <p className="text-xs font-semibold text-gray-800 pt-0.5">
                                        <span className="text-gray-500 font-normal">বিবরণ: </span>
                                        {due.itemsDescription}
                                      </p>
                                      {due.note && (
                                        <p className="text-[10px] text-gray-500 italic">নোট: {due.note}</p>
                                      )}
                                      {due.dueDate && !vPaid && (
                                        <p className="text-[10px] text-amber-800 font-bold flex items-center gap-1">
                                          <Calendar className="w-3 h-3 text-amber-600" />
                                          <span>পরিশোধের তারিখ: {due.dueDate}</span>
                                        </p>
                                      )}
                                    </div>

                                    {/* Amounts */}
                                    <div className="text-right shrink-0">
                                      <span className="text-[11px] text-gray-500 block">মোট বিল: ৳{due.totalAmount}</span>
                                      <span className="text-[11px] text-emerald-700 font-semibold block">জমা: ৳{due.paidAmount}</span>
                                      <span className={`text-xs font-black block ${vPaid ? 'text-emerald-700' : 'text-red-600'}`}>
                                        {vPaid ? 'পরিশোধিত' : `বাকি: ৳${due.dueAmount}`}
                                      </span>
                                    </div>
                                  </div>

                                  {/* Individual Voucher Actions */}
                                  <div className="flex items-center justify-end gap-1.5 pt-1.5 border-t border-gray-100">
                                    <button
                                      onClick={() => {
                                        setSelectedDue(due);
                                        setIsReceiptModalOpen(true);
                                      }}
                                      className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-100 text-gray-600 transition cursor-pointer"
                                      title="রসিদ স্লিপ দেখুন ও প্রিন্ট"
                                    >
                                      <Printer className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      onClick={() => handleOpenEditDue(due)}
                                      className="bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 px-2.5 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 transition cursor-pointer"
                                      title="ভাউচার এডিট করুন"
                                    >
                                      <Edit3 className="w-3 h-3" />
                                      <span>এডিট</span>
                                    </button>
                                    <button
                                      onClick={() => handleOpenPayment(due)}
                                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] px-2.5 py-1 rounded-lg flex items-center gap-1 shadow-xs transition active:scale-95 cursor-pointer"
                                      title="এই ভাউচারে টাকা জমা নিন"
                                    >
                                      <Wallet className="w-3 h-3" />
                                      <span>টাকা জমা</span>
                                    </button>
                                    <button
                                      onClick={() => handleDeleteDue(due.id, due.voucherNo)}
                                      className="bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 px-2 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 transition cursor-pointer"
                                      title="ভাউচার মুছে ফেলুন"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                      <span>ডিলেট</span>
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* SUB-SECTION 2: ALL PAYMENTS & DEPOSITS HISTORY */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-[11px] font-bold text-gray-700">
                          <span className="flex items-center gap-1 text-emerald-800">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            <span>২. আদায় ও জমার ইতিহাস ({grp.allPayments.length}টি কিস্তি)</span>
                          </span>
                          <span className="text-emerald-700 font-black">সর্বমোট আদায়: ৳{grp.totalPaid}</span>
                        </div>

                        {grp.allPayments.length === 0 ? (
                          <div className="bg-white p-3 rounded-2xl border border-dashed border-gray-300 text-center text-xs text-gray-400">
                            এখনো কোনো জমার রেকর্ড নেই
                          </div>
                        ) : (
                          <div className="bg-white rounded-2xl border border-emerald-100 divide-y divide-emerald-50 overflow-hidden shadow-2xs">
                            {grp.allPayments.map(p => (
                              <div key={p.id} className="p-2.5 flex items-center justify-between gap-2 text-xs hover:bg-emerald-50/30 transition">
                                <div className="space-y-0.5">
                                  <div className="flex items-center gap-2">
                                    <span className="font-black text-emerald-700 text-sm">৳{p.amount}</span>
                                    <span className="bg-emerald-100 text-emerald-900 text-[10px] font-bold px-1.5 py-0.2 rounded">
                                      {p.paymentMethod}
                                    </span>
                                    <span className="text-[10px] font-mono text-gray-500 bg-gray-100 px-1.5 py-0.2 rounded">
                                      {p.voucherNo}
                                    </span>
                                  </div>
                                  <div className="text-[10px] text-gray-500 font-mono">
                                    {p.date} • {p.time} {p.note ? `• ${p.note}` : ''}
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleDeletePaymentInstallment(p.dueId, p.id, p.amount)}
                                  className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50 cursor-pointer transition"
                                  title="এই জমার এন্ট্রিটি মুছে ফেলুন"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* SUB-SECTION 3: ONLINE ORDERS (DELIVERY DUES) */}
                      {grp.orders.length > 0 && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-[11px] font-bold text-blue-900">
                            <span className="flex items-center gap-1">
                              <ShoppingBag className="w-3.5 h-3.5 text-blue-700" />
                              <span>৩. অনলাইন অর্ডার ({grp.orders.length}টি)</span>
                            </span>
                          </div>

                          <div className="space-y-2">
                            {grp.orders.map(order => (
                              <div key={order.id} className="bg-white rounded-2xl border border-blue-200 p-3 shadow-2xs space-y-1.5">
                                <div className="flex items-center justify-between text-xs">
                                  <div className="flex items-center gap-1.5">
                                    <span className="bg-blue-100 text-blue-800 text-[10px] font-mono font-bold px-2 py-0.5 rounded">
                                      #{order.id}
                                    </span>
                                    <span className="text-gray-500 text-[10px] font-mono">{order.date}</span>
                                  </div>
                                  {order.dueAmount > 0 ? (
                                    <span className="text-xs font-black text-red-600">ডেলিভারি বাকি: ৳{order.dueAmount}</span>
                                  ) : (
                                    <span className="text-xs font-black text-emerald-700">পরিশোধিত</span>
                                  )}
                                </div>
                                <p className="text-[11px] text-gray-600 truncate">
                                  {order.items.map(i => `${i.nameBn} x${i.quantity}`).join(', ')}
                                </p>
                                <div className="flex items-center justify-between pt-1 text-[10px] text-gray-500">
                                  <span>মোট বিল: ৳{order.totalAmount} (অগ্রীম ৳{order.advancePaid})</span>
                                  {order.dueAmount > 0 && (
                                    <button
                                      onClick={() => handleSettleOrderDue(order)}
                                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-2.5 py-1 rounded-lg flex items-center gap-1 cursor-pointer"
                                    >
                                      <Check className="w-3 h-3" />
                                      <span>৳{order.dueAmount} আদায় সম্পন্ন</span>
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
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
                  <p className="text-[10px] text-gray-500">কাস্টমার সিলেক্ট করে বাকির তথ্য ও জমা যুক্ত করুন</p>
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
              {/* Quick Customer Select inside Modal */}
              {!editingDueId && allCustomersList.length > 0 && (
                <div>
                  <label className="block text-xs font-bold text-amber-900 mb-1">তালিকা থেকে কাস্টমার সিলেক্ট করুন</label>
                  <select
                    value={allCustomersList.find(c => c.phone === formData.customerPhone)?.phone || ''}
                    onChange={(e) => {
                      const found = allCustomersList.find(c => (normalizeBdPhone(c.phone) || c.name) === e.target.value);
                      if (found) {
                        setFormData({
                          ...formData,
                          customerName: found.name,
                          customerPhone: found.phone
                        });
                      }
                    }}
                    className="w-full bg-amber-50 border border-amber-300 rounded-xl px-3 py-2 text-xs font-bold text-gray-900"
                  >
                    <option value="">-- কাস্টমার সিলেক্ট করুন (অথবা নিচে লিখুন) --</option>
                    {allCustomersList.map(c => {
                      const key = normalizeBdPhone(c.phone) || c.name;
                      const bal = getCustomerDueOrAdvanceBalance(c.phone, c.name, dueList);
                      return (
                        <option key={key} value={key}>
                          {c.name} ({c.phone}) {bal.remainingDue > 0 ? `[বাকি: ৳${bal.remainingDue}]` : bal.advanceDeposit > 0 ? `[অগ্রীম: ৳${bal.advanceDeposit}]` : ''}
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}

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
                    min="0"
                    placeholder="৳ 0"
                    value={formData.totalAmount}
                    onChange={(e) => setFormData({ ...formData, totalAmount: e.target.value })}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-red-500 font-black text-red-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">জমা (যেকোনো পরিমাণ)</label>
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
      {/* MODAL 2: COLLECT DUE PAYMENT (যেকোনো পরিমাণ টাকা আদায় ও জমা)  */}
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
                  <h3 className="font-black text-sm text-gray-900">যেকোনো পরিমাণ জমা ও বাকি আদায়</h3>
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
              {selectedDue.dueAmount > 0 ? (
                <div className="flex justify-between items-center text-sm font-black pt-1 border-t border-gray-200 text-red-600">
                  <span>অবশিষ্ট বাকি:</span>
                  <span>৳ {selectedDue.dueAmount}</span>
                </div>
              ) : (
                <div className="flex justify-between items-center text-sm font-black pt-1 border-t border-gray-200 text-emerald-700">
                  <span>অগ্রীম জমা:</span>
                  <span>৳ {Math.max(0, selectedDue.paidAmount - selectedDue.totalAmount)}</span>
                </div>
              )}
            </div>

            <form onSubmit={handleSubmitPayment} className="space-y-3">
              {/* Payment Amount (No Max Restriction!) */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-bold text-gray-700">জমার পরিমাণ (৳) * (যেকোনো পরিমাণ)</label>
                  {selectedDue.dueAmount > 0 && (
                    <button
                      type="button"
                      onClick={() => setPaymentData({ ...paymentData, amount: selectedDue.dueAmount.toString() })}
                      className="text-[10px] text-emerald-700 font-bold hover:underline cursor-pointer"
                    >
                      সম্পূর্ণ বাকি (৳{selectedDue.dueAmount})
                    </button>
                  )}
                </div>
                <input
                  type="number"
                  required
                  min="1"
                  placeholder="যেকোনো পরিমাণ টাকা লিখুন"
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

      {/* ============================================================== */}
      {/* MODAL 4: CUSTOMER FULL LEDGER STATEMENT SLIP (গ্রাহক খতিয়ান স্লিপ)   */}
      {/* ============================================================== */}
      {isCustomerStatementOpen && statementCustomer && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-2xs flex items-center justify-center p-3 animate-fadeIn">
          <div className="bg-white w-full max-w-md rounded-3xl p-5 shadow-2xl border border-gray-100 space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-red-100 text-red-700 flex items-center justify-center font-bold">
                  <Printer className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-black text-sm text-gray-900">গ্রাহক খতিয়ান স্টেটমেন্ট</h3>
                  <p className="text-[10px] text-gray-500">সালমা ফুড কর্ণার • চান্দনা চৌরাস্তা, গাজীপুর</p>
                </div>
              </div>
              <button
                onClick={() => setIsCustomerStatementOpen(false)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Printable Statement Area */}
            <div id="customer-statement-print" className="bg-amber-50/40 p-4 rounded-2xl border border-amber-200/60 font-mono text-xs space-y-3">
              <div className="text-center border-b pb-2 space-y-0.5">
                <h2 className="text-base font-black tracking-tight text-gray-900 font-sans">সালমা ফুড কর্ণার</h2>
                <p className="text-[10px] text-gray-500">চান্দনা চৌরাস্তা, গাজীপুর সদর-১৭০০ | ০১৭১২-৩৪৫৬৭৮</p>
                <p className="text-[11px] font-black text-red-700 pt-0.5">গ্রাহক হিসাব ও লেনদেন বিবরণী (Ledger Statement)</p>
              </div>

              {/* Customer Info */}
              <div className="text-[11px] space-y-1 bg-white p-2.5 rounded-xl border border-gray-200/80">
                <div className="flex justify-between">
                  <span className="text-gray-500">গ্রাহকের নাম:</span>
                  <span className="font-bold text-gray-900">{statementCustomer.customerName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">মোবাইল নম্বর:</span>
                  <span className="font-bold">{statementCustomer.customerPhone}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">ঠিকানা:</span>
                  <span>{statementCustomer.customerAddress}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">স্টেটমেন্ট তারিখ:</span>
                  <span>{todayStr}</span>
                </div>
              </div>

              {/* Vouchers Table */}
              <div className="space-y-1">
                <p className="font-bold text-gray-800 text-[11px] font-sans">খাবারের বিল ও বাকি ভাউচার:</p>
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <table className="w-full text-[10px] text-left">
                    <thead className="bg-gray-100 text-gray-700 border-b">
                      <tr>
                        <th className="p-1.5">ভাউচার/তারিখ</th>
                        <th className="p-1.5">বিবরণ</th>
                        <th className="p-1.5 text-right">বিল</th>
                        <th className="p-1.5 text-right">বাকি</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {statementCustomer.dueEntries.map((d: any) => (
                        <tr key={d.id}>
                          <td className="p-1.5 font-bold">
                            <div>{d.voucherNo}</div>
                            <div className="text-[9px] text-gray-400 font-normal">{d.date}</div>
                          </td>
                          <td className="p-1.5 max-w-[120px] truncate">{d.itemsDescription}</td>
                          <td className="p-1.5 text-right font-bold">৳{d.totalAmount}</td>
                          <td className="p-1.5 text-right font-black text-red-600">৳{d.dueAmount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Payments Table */}
              {statementCustomer.allPayments.length > 0 && (
                <div className="space-y-1">
                  <p className="font-bold text-emerald-800 text-[11px] font-sans">জমা ও পরিশোধের ইতিহাস:</p>
                  <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <table className="w-full text-[10px] text-left">
                      <thead className="bg-emerald-50 text-emerald-900 border-b">
                        <tr>
                          <th className="p-1.5">তারিখ</th>
                          <th className="p-1.5">মাধ্যম</th>
                          <th className="p-1.5 text-right">জমার পরিমাণ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-emerald-50">
                        {statementCustomer.allPayments.map((p: any) => (
                          <tr key={p.id}>
                            <td className="p-1.5">{p.date}</td>
                            <td className="p-1.5">{p.paymentMethod}</td>
                            <td className="p-1.5 text-right font-bold text-emerald-700">৳{p.amount}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Financial Balance Summary */}
              <div className="bg-white p-3 rounded-xl border border-gray-200 space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-600">সর্বমোট খাবার বিল:</span>
                  <span className="font-bold">৳ {statementCustomer.totalBill}</span>
                </div>
                <div className="flex justify-between text-emerald-700">
                  <span>সর্বমোট আদায়কৃত জমা:</span>
                  <span className="font-bold">- ৳ {statementCustomer.totalPaid}</span>
                </div>
                <div className="border-t border-gray-300 pt-1.5 flex justify-between font-black text-sm">
                  <span>
                    {statementCustomer.remainingDue > 0
                      ? 'সর্বমোট অবশিষ্ট বাকি:'
                      : statementCustomer.advanceDeposit > 0
                      ? 'অগ্রীম জমা ব্যালেন্স:'
                      : 'ব্যালেন্স:'}
                  </span>
                  <span className={statementCustomer.remainingDue > 0 ? 'text-red-600' : 'text-emerald-700'}>
                    ৳ {statementCustomer.remainingDue > 0 ? statementCustomer.remainingDue : statementCustomer.advanceDeposit}
                  </span>
                </div>
              </div>

              <p className="text-[9px] text-center text-gray-400 pt-1">
                ধন্যবাদ, সালমা ফুড কর্নার সাথে থাকার জন্য!
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
                onClick={() => setIsCustomerStatementOpen(false)}
                className="px-4 py-2.5 rounded-xl border border-gray-300 text-xs font-bold text-gray-700 hover:bg-gray-100 cursor-pointer"
              >
                বন্ধ করুন
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL 5: CUSTOMER-LEVEL DIRECT DEPOSIT (গ্রাহক একাউন্টে টাকা জমা) */}
      {/* ============================================================== */}
      {customerDepositModalGroup && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-2xs flex items-center justify-center p-3 animate-fadeIn">
          <div className="bg-white w-full max-w-md rounded-3xl p-5 shadow-2xl border border-gray-100 space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                  <Wallet className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-sm text-gray-900">
                    {customerDepositModalGroup.remainingDue > 0 ? 'গ্রাহকের বাকি টাকা জমা' : 'অগ্রীম জমা এন্ট্রি'}
                  </h3>
                  <p className="text-[10px] text-gray-500">
                    গ্রাহক: {customerDepositModalGroup.customerName} ({customerDepositModalGroup.customerPhone})
                  </p>
                </div>
              </div>
              <button
                onClick={() => setCustomerDepositModalGroup(null)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Current Balance Overview */}
            <div className="bg-gray-50 p-3 rounded-2xl border border-gray-200 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-gray-600">মোট খাবার বিল:</span>
                <span className="font-bold">৳ {customerDepositModalGroup.totalBill}</span>
              </div>
              <div className="flex justify-between text-emerald-700">
                <span>পূর্বে জমা দেওয়া হয়েছে:</span>
                <span className="font-bold">৳ {customerDepositModalGroup.totalPaid}</span>
              </div>
              <div className="border-t pt-1 flex justify-between font-black text-sm">
                <span>
                  {customerDepositModalGroup.remainingDue > 0 ? 'বর্তমান অবশিষ্ট বাকি:' : 'বর্তমান অগ্রীম জমা:'}
                </span>
                <span className={customerDepositModalGroup.remainingDue > 0 ? 'text-red-600' : 'text-emerald-700'}>
                  ৳ {customerDepositModalGroup.remainingDue > 0 ? customerDepositModalGroup.remainingDue : customerDepositModalGroup.advanceDeposit}
                </span>
              </div>
            </div>

            <form onSubmit={handleCustomerDepositSubmit} className="space-y-3">
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-bold text-gray-700">জমার পরিমাণ (৳) * (যেকোনো পরিমাণ)</label>
                  {customerDepositModalGroup.remainingDue > 0 && (
                    <button
                      type="button"
                      onClick={() => setPaymentData({ ...paymentData, amount: String(customerDepositModalGroup.remainingDue) })}
                      className="text-[10px] text-emerald-700 font-bold hover:underline cursor-pointer"
                    >
                      সম্পূর্ণ বাকি (৳{customerDepositModalGroup.remainingDue})
                    </button>
                  )}
                </div>
                <input
                  type="number"
                  required
                  min="1"
                  placeholder="যেকোনো পরিমাণ টাকা লিখুন"
                  value={paymentData.amount}
                  onChange={(e) => setPaymentData({ ...paymentData, amount: e.target.value })}
                  className="w-full border-2 border-emerald-500 rounded-2xl px-3.5 py-2.5 text-base font-bold text-gray-900 focus:outline-none"
                />
              </div>

              {/* Live Preview */}
              {Number(paymentData.amount) > 0 && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-2.5 text-xs flex items-center justify-between">
                  <span className="font-bold text-emerald-900">এই জমার পর নতুন ব্যালেন্স:</span>
                  {customerDepositModalGroup.totalBill - (customerDepositModalGroup.totalPaid + Number(paymentData.amount)) > 0 ? (
                    <span className="font-black text-red-600">
                      অবশিষ্ট বাকি: ৳ {customerDepositModalGroup.totalBill - (customerDepositModalGroup.totalPaid + Number(paymentData.amount))}
                    </span>
                  ) : (customerDepositModalGroup.totalPaid + Number(paymentData.amount)) - customerDepositModalGroup.totalBill > 0 ? (
                    <span className="font-black text-emerald-700">
                      অগ্রীম জমা থাকবে: ৳ {(customerDepositModalGroup.totalPaid + Number(paymentData.amount)) - customerDepositModalGroup.totalBill}
                    </span>
                  ) : (
                    <span className="font-black text-emerald-700">সম্পূর্ণ পরিশোধিত (৳০)</span>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-1">পেমেন্ট মাধ্যম</label>
                  <select
                    value={paymentData.paymentMethod}
                    onChange={(e) => setPaymentData({ ...paymentData, paymentMethod: e.target.value as any })}
                    className="w-full border border-gray-300 rounded-xl px-2.5 py-2 text-xs"
                  >
                    <option value="Cash">নগদ (Cash)</option>
                    <option value="bKash">বিকাশ (bKash)</option>
                    <option value="Nagad">নগদ (Nagad)</option>
                    <option value="Bank">ব্যাংক (Bank)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-1">নোট / বিবরণ</label>
                  <input
                    type="text"
                    placeholder="যেমন: বাকি পরিশোধ"
                    value={paymentData.note}
                    onChange={(e) => setPaymentData({ ...paymentData, note: e.target.value })}
                    className="w-full border border-gray-300 rounded-xl px-2.5 py-2 text-xs"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs font-bold text-emerald-950 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={paymentData.addToPosLedger}
                  onChange={(e) => setPaymentData({ ...paymentData, addToPosLedger: e.target.checked })}
                  className="w-4 h-4 text-emerald-600 rounded"
                />
                <span>POS লেজারে আজকের আয়ে (Income) যুক্ত করুন</span>
              </label>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCustomerDepositModalGroup(null)}
                  className="w-1/3 border border-gray-300 text-xs font-bold text-gray-700 py-2.5 rounded-xl hover:bg-gray-100 cursor-pointer"
                >
                  বাতিল
                </button>
                <button
                  type="submit"
                  className="w-2/3 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs py-2.5 rounded-xl flex items-center justify-center gap-1.5 shadow-xs cursor-pointer active:scale-95 transition"
                >
                  <Check className="w-4 h-4" />
                  <span>জমা নিশ্চিত করুন</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
