export interface VariationOption {
  name: string;
  image?: string;
}

export interface Variation {
  name: string;
  options: VariationOption[];
}

export interface Review {
  id: string;
  userId: string;
  userName: string;
  rating: number;
  comment: string;
  createdAt: string;
}

export interface Product {
  id: string;
  title: string;
  description: string;
  features?: string[];
  price: number;
  sourceCurrency: string;
  image: string;
  gallery?: string[];
  sourceUrl?: string;
  markup: number;
  shippingCost?: number;
  status: 'pending' | 'approved';
  variations?: Variation[];
  verificationLogs?: string[];
  shippingInfo?: string;
  category: string;
  sellerId?: string;
  sellerName?: string;
  type: 'dropship' | 'manual';
  createdAt?: string;
}

export interface CustomerInfo {
  name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  country: string;
  zip: string;
  referredBy?: string;
}

export interface Order {
  id: string;
  buyerId?: string;
  items: CartItem[];
  customer: CustomerInfo;
  total: number;
  sourceCost: number;
  shippingCost?: number;
  profit: number;
  currency: string;
  paymentMethod?: 'mpesa' | 'bank_transfer';
  status: 'pending' | 'paid' | 'fulfilled' | 'shipped' | 'delivered' | 'cancelled';
  automationStatus?: 'idle' | 'processing' | 'completed' | 'failed';
  automationLog?: string[];
  referralCommission?: number;
  ownerProfit?: number;
  createdAt: string;
  stripeSessionId?: string;
}

export interface ExchangeRates {
  [key: string]: number;
}

export interface CartItem extends Product {
  cartId: string;
  quantity: number;
  selectedVariations?: { [key: string]: string };
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: string;
  read: boolean;
}

export interface Chat {
  id: string;
  buyerId: string;
  buyerName: string;
  buyerEmail?: string;
  lastMessage?: string;
  lastMessageTimestamp?: string;
  unreadCountSeller: number;
  unreadCountBuyer: number;
  updatedAt: string;
}
