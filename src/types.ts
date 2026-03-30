export interface VariationOption {
  name: string;
  image?: string;
}

export interface Variation {
  name: string;
  options: VariationOption[];
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
  sourceUrl: string;
  markup: number;
  status: 'pending' | 'approved';
  variations?: Variation[];
  verificationLogs?: string[];
  shippingInfo?: string;
}

export interface CustomerInfo {
  name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  country: string;
  zip: string;
}

export interface Order {
  id: string;
  items: CartItem[];
  customer: CustomerInfo;
  total: number;
  currency: string;
  status: 'pending' | 'paid' | 'fulfilled' | 'shipped' | 'delivered' | 'cancelled';
  automationStatus?: 'idle' | 'processing' | 'completed' | 'failed';
  automationLog?: string[];
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
