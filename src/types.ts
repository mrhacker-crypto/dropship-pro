export interface VariationOption {
  name: string;
  image?: string;
  priceModifier?: number;
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
  lat?: number;
  lng?: number;
  referredBy?: string;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: 'buyer' | 'seller' | 'driver' | 'admin';
  createdAt: string;
  phone?: string;
  referredBy?: string;
  referralEarnings?: number;
  nationalId?: string;
  vehicleInfo?: {
    type: string;
    plateNumber: string;
    model: string;
    color: string;
  };
  bankAccount?: {
    accountName: string;
    accountNumber: string;
    bankName: string;
  };
  walletBalance?: number;
  location?: {
    lat: number;
    lng: number;
    address?: string;
  };
  isActive?: boolean;
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
  status: 'pending' | 'paid' | 'fulfilled' | 'shipped' | 'delivered' | 'cancelled' | 'awaiting_pickup' | 'picked_up' | 'disputed' | 'reported' | 'awaiting_payment';
  automationStatus?: 'idle' | 'processing' | 'completed' | 'failed';
  automationLog?: string[];
  disputeNotes?: string;
  disputePenaltyApplied?: boolean;
  confirmationCode?: string;
  fulfillmentDetails?: {
    supplierOrderId?: string;
    trackingNumber?: string;
    supplierName?: string;
    shippedAt?: string;
    lastAutomationStep?: string;
    error?: string;
  };
  deliveryDetails?: {
    driverId?: string;
    driverName?: string;
    driverPhone?: string;
    offeredAt?: string;
    acceptedAt?: string;
    pickedUpAt?: string;
    deliveredAt?: string;
    pickupLocation?: string;
    dropoffLocation?: string;
    startLat?: number;
    startLng?: number;
    pickupLat?: number;
    pickupLng?: number;
    dropoffLat?: number;
    dropoffLng?: number;
    distanceKm?: number;
    deliveryFee?: number;
  };
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
