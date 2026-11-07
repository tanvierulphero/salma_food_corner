export interface MenuCategory {
  id: string;
  nameBn: string;
  nameEn: string;
  icon?: string;
  description?: string;
}

export const DEFAULT_MENU_CATEGORIES: MenuCategory[] = [
  { id: 'combo', nameBn: 'কম্বো ও বান্ডেল', nameEn: 'Combo & Bundles', icon: '🎁' },
  { id: 'popular', nameBn: 'জনপ্রিয় খাবার', nameEn: 'Popular Items', icon: '🔥' },
  { id: 'biryani', nameBn: 'বিরিয়ানি ও পোলাও', nameEn: 'Biryani & Pulao', icon: '🍛' },
  { id: 'fastfood', nameBn: 'ফাস্ট ফুড', nameEn: 'Fast Food', icon: '🍔' },
  { id: 'curry', nameBn: 'মাংস ও কারি', nameEn: 'Curry & Meat', icon: '🥘' },
  { id: 'dessert', nameBn: 'ডেজার্ট ও ড্রিংকস', nameEn: 'Dessert & Drinks', icon: '🍮' }
];

export interface FoodItem {
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

export interface CartItem extends FoodItem {
  quantity: number;
}

export interface Order {
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

export interface LedgerEntry {
  id: string;
  voucherNo: string;
  type: 'income' | 'expense';
  category: string;
  amount: number;
  date: string; // YYYY-MM-DD
  paymentMethod: 'Cash' | 'bKash' | 'Nagad' | 'Bank' | 'Card';
  note: string;
}

export interface CustomerProfile {
  phone: string; // Unique primary key
  name: string;
  address: string;
  loyaltyPoints: number;
  registeredAt: string;
  totalOrders: number;
  totalSpent: number;
}

export interface DuePaymentHistory {
  id: string;
  date: string;
  time: string;
  amount: number;
  paymentMethod: 'Cash' | 'bKash' | 'Nagad' | 'Bank';
  receivedBy?: string;
  note?: string;
}

export interface DueEntry {
  id: string;
  voucherNo: string;
  customerName: string;
  customerPhone: string;
  orderId?: string; // Optional: linked to online order
  totalAmount: number; // মোট বাকির পরিমাণ
  paidAmount: number;  // এ পর্যন্ত আদায়কৃত
  dueAmount: number;   // অবশিষ্ট বাকি
  date: string;        // YYYY-MM-DD
  dueDate?: string;    // সম্ভাব্য পরিশোধের তারিখ
  itemsDescription: string; // বাকির বিবরণ বা খাবারের তালিকা
  status: 'unpaid' | 'partial' | 'paid';
  payments?: DuePaymentHistory[];
  note?: string;
}

export interface SmsCampaignLog {
  id: string;
  date: string;
  time: string;
  recipientCount: number;
  targetAudience: string;
  message: string;
  method: 'Mobile SIM' | 'SMS Gateway' | 'Test Mode';
  status: 'Sent' | 'Delivered' | 'Pending';
  costEstimate: number;
}

export interface SmsGatewayConfig {
  provider: 'sim' | 'greenweb' | 'bulksmsbd' | 'mimsms' | 'custom';
  apiKey: string;
  senderId: string;
  apiUrl?: string;
  isEnabled: boolean;
}

export interface ShopLocationConfig {
  name: string;
  address: string;
  lat: number;
  lng: number;
  freeRadiusKm: number;
  standardFee: number;
  phone?: string;
  landmark?: string;
  zoneName?: string;
  nearbyAreas?: string[];
}

export const DEFAULT_SHOP_LOCATION: ShopLocationConfig = {
  name: 'সালমা ফুড কর্ণার, গাজীপুর',
  address: 'চান্দনা চৌরাস্তা (জয়দেবপুর রোড মোড়), গাজীপুর সদর, গাজীপুর-১৭০০',
  lat: 23.9905,
  lng: 90.3875,
  freeRadiusKm: 1.0,
  standardFee: 60,
  phone: '01712-345678',
  landmark: 'চান্দনা চৌরাস্তা ও ভোগড়া বাইপাস সংলগ্ন',
  zoneName: 'গাজীপুর চৌরাস্তা',
  nearbyAreas: [
    'চান্দনা চৌরাস্তা', 'ভোগড়া', 'ভোগড়া বাইপাস', 'জয়দেবপুর', 'শিববাড়ি মোড়',
    'বাসন সড়ক', 'আউটপাড়া', 'ডুয়েট গেট', 'বোর্ড বাজার', 'টঙ্গী', 'কোনাবাড়ী'
  ]
};

export interface Review {
  id: string;
  customerName: string;
  rating: number;
  comment: string;
  date: string;
}

export const INITIAL_MENU_DATA: FoodItem[] = [];

