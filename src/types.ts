export interface FoodItem {
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
  status: 'Placed' | 'Preparing' | 'Out for Delivery' | 'Delivered';
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
  name: 'সালমা ফুড কর্ণার',
  address: 'বাড়ি #১২, ধানমন্ডি ৩২ (রাসেল স্কয়ার মোড়), ঢাকা-১২০৯',
  lat: 23.7512,
  lng: 90.3770,
  freeRadiusKm: 1.0,
  standardFee: 60,
  phone: '01712-345678',
  landmark: 'রাসেল স্কয়ার ও ৩২ নম্বর ব্রিজ মোড়',
  zoneName: 'ধানমন্ডি ৩২',
  nearbyAreas: [
    'ধানমন্ডি ৩২', 'রাসেল স্কয়ার', 'সোবহানবাগ', 'শুক্রাবাদ', 'কলাবাগান', 
    'ধানমন্ডি লেক পার্ক', 'পান্থপথ পশ্চিম', '৩২ নম্বর ব্রিজ'
  ]
};

export interface Review {
  id: string;
  customerName: string;
  rating: number;
  comment: string;
  date: string;
}

export const INITIAL_MENU_DATA: FoodItem[] = [
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
