import { GoogleGenAI } from "@google/genai";
import React, { useState, useEffect, Component, useCallback, useMemo, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useNavigate } from 'react-router-dom';
import { ShoppingCart, Plus, Minus, Trash2, ExternalLink, Package, Settings, Store, ChevronRight, ChevronDown, CreditCard, CheckCircle, CheckCircle2, Clock, Truck, ShieldCheck, AlertCircle, Smartphone, X, Info, MapPin, Check, Plane, History, LogIn, LogOut, Search, Loader2, Play, Share2, Star, BarChart3, TrendingUp, DollarSign, MessageSquare, Send, Sparkles, Menu, ArrowLeft, Gift, Copy, Link as LinkIcon, UserPlus, Users, ShieldAlert, User as UserIcon, Zap, Crown, Award, Camera, FileText, Download, ChevronLeft, Lock, Home } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Product, CartItem, CustomerInfo, Order, ExchangeRates, Chat, ChatMessage, Review, UserProfile } from './types';
import { collection, doc, onSnapshot, setDoc, updateDoc, deleteDoc, query, orderBy, getDocFromServer, addDoc, serverTimestamp, where, limit, getDocs, getDoc, increment, arrayUnion } from 'firebase/firestore';
import { signInWithPopup, signOut, onAuthStateChanged, User, createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { db, auth, googleProvider } from './firebase';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, AreaChart, Area, PieChart, Pie, Cell, Legend } from 'recharts';
import * as Slider from '@radix-ui/react-slider';
import Fuse from 'fuse.js';
import { QRCodeSVG } from 'qrcode.react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, Circle } from 'react-leaflet';
import L from 'leaflet';
import { 
  APIProvider, 
  Map, 
  AdvancedMarker, 
  Pin, 
  useMap, 
  useMapsLibrary,
  useAdvancedMarkerRef,
  InfoWindow
} from '@vis.gl/react-google-maps';

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_PLATFORM_KEY || '';
const hasValidMapKey = Boolean(GOOGLE_MAPS_API_KEY) && GOOGLE_MAPS_API_KEY !== 'YOUR_API_KEY';

const MapSplashScreen = () => (
  <div className="flex flex-col items-center justify-center h-80 bg-gray-50 rounded-[2.5rem] border-2 border-dashed border-gray-200 p-8 text-center">
    <div className="w-16 h-16 bg-indigo-100 rounded-2xl flex items-center justify-center mb-6">
      <MapPin className="w-8 h-8 text-indigo-600" />
    </div>
    <h3 className="text-lg font-bold text-gray-900 mb-2">Google Maps API Key Required</h3>
    <p className="text-sm text-gray-500 mb-6 max-w-xs">
      To enable precise location picking and live tracking, please add your Google Maps API key in Settings.
    </p>
    <div className="text-left bg-white p-4 rounded-xl border border-gray-100 text-[10px] space-y-2 font-medium">
      <p>1. Open <b>Settings</b> (⚙️ top right)</p>
      <p>2. Go to <b>Secrets</b></p>
      <p>3. Add <code>GOOGLE_MAPS_PLATFORM_KEY</code></p>
    </div>
  </div>
);

// Fix Leaflet marker icons in production
// @ts-ignore
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const driverIcon = new L.Icon({
  iconUrl: 'https://cdn-icons-png.flaticon.com/512/1702/1702016.png',
  iconSize: [40, 40],
  iconAnchor: [20, 20],
  popupAnchor: [0, -20],
});

const homeIcon = new L.Icon({
  iconUrl: 'https://cdn-icons-png.flaticon.com/512/619/619153.png',
  iconSize: [40, 40],
  iconAnchor: [20, 20],
  popupAnchor: [0, -20],
});

const packageIcon = new L.Icon({
  iconUrl: 'https://cdn-icons-png.flaticon.com/512/3061/3061937.png',
  iconSize: [40, 40],
  iconAnchor: [20, 20],
  popupAnchor: [0, -20],
});

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: any;
}

class ErrorBoundary extends Component<any, any> {
  constructor(props: any) {
    super(props);
    (this as any).state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  render() {
    const state = (this as any).state;
    const props = (this as any).props;
    if (state.hasError) {
      let message = "Something went wrong.";
      try {
        const errObj = JSON.parse(state.error?.message || '{}');
        if (errObj.error && errObj.error.includes("Missing or insufficient permissions")) {
          message = "You don't have permission to perform this action. Please make sure you are logged in as an admin.";
        }
      } catch (e) {
        // Not a JSON error
      }
      return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
          <div className="bg-white p-8 rounded-3xl shadow-xl max-w-md w-full text-center">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-gray-900 mb-2">Application Error</h2>
            <p className="text-gray-600 mb-6">{message}</p>
            <button 
              onClick={() => window.location.reload()}
              className="bg-indigo-600 text-white px-6 py-2 rounded-full font-bold hover:bg-indigo-700 transition-colors"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }
    return props.children;
  }
}

// --- Utils ---
const formatPrice = (amount: number, targetCurrency: string, rates: ExchangeRates, sourceCurrency: string = 'USD') => {
  let finalAmount = amount;
  
  // Only convert if currencies are different and we have rates
  if (targetCurrency !== sourceCurrency && rates[sourceCurrency] && rates[targetCurrency]) {
    const usdAmount = amount / rates[sourceCurrency];
    finalAmount = usdAmount * rates[targetCurrency];
  }
  
  // TZS usually doesn't have decimals, so we round it
  if (targetCurrency === 'TZS') {
    finalAmount = Math.round(finalAmount);
  }
  
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: targetCurrency,
    minimumFractionDigits: finalAmount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(finalAmount);
};

// --- Components ---

const UpgradeSection = ({ user, updateProfile }: { user: UserProfile; updateProfile: (data: Partial<UserProfile>) => Promise<void> }) => {
  const tiers = [
    {
      id: 'basic' as const,
      name: 'Starter',
      price: 'Free',
      description: 'Perfect for casual dropshippers.',
      features: [
        'Standard Referral Rate (3%)',
        'Basic Driver Network',
        'Physical Goods Only',
        'Manual Order Support'
      ],
      icon: ShoppingCart,
      color: 'bg-gray-100 text-gray-600'
    },
    {
      id: 'pro' as const,
      name: 'Pro Dropshipper',
      price: '$19.99/mo',
      description: 'Scale your business with advanced tools.',
      features: [
        'Boosted Referral Rate (5%)',
        'Sell Digital & Virtual Goods',
        'AI Product Descriptions',
        'Priority Driver Assignment',
        'Advanced Analytics Dashboard'
      ],
      icon: Zap,
      color: 'bg-indigo-100 text-indigo-600',
      popular: true
    },
    {
      id: 'elite' as const,
      name: 'Elite Enterprise',
      price: '$99.99/mo',
      description: 'Global scale with zero friction.',
      features: [
        'Maximum Referral Rate (10%)',
        'Zero Marketplace Fees',
        'Custom Fulfillment Branding',
        'Dedicated Agent Monitoring',
        'Private VIP Supplier List'
      ],
      icon: Crown,
      color: 'bg-amber-100 text-amber-600'
    }
  ];

  const handleUpgrade = async (tier: 'pro' | 'elite') => {
    if (confirm(`Unlock ${tier.toUpperCase()} features now? Payment will be processed via your M-Pesa account.`)) {
      await updateProfile({
        membership: { 
          tier, 
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() 
        }
      });
      alert(`Welcome to ${tier.toUpperCase()}! Your features are now active.`);
    }
  };

  return (
    <div className="space-y-8">
      <div className="text-center max-w-2xl mx-auto">
        <h2 className="text-3xl font-bold text-gray-900 mb-4 font-display">Upgrade Your DropShip Pro Experience</h2>
        <p className="text-gray-500">Choose the tier that fits your growth ambitions and unlock high-profit features.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {tiers.map((tier) => (
          <motion.div
            key={tier.id}
            whileHover={{ y: -10 }}
            className={cn(
              "relative bg-white rounded-[2.5rem] p-8 border-2 transition-all shadow-xl shadow-gray-100/50 flex flex-col",
              tier.popular ? "border-indigo-600 shadow-indigo-100/50" : "border-gray-50"
            )}
          >
            {tier.popular && (
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-indigo-600 text-white text-[10px] font-bold px-4 py-1.5 rounded-full uppercase tracking-widest shadow-lg">
                Recommended
              </div>
            )}

            <div className={cn("w-16 h-16 rounded-2xl flex items-center justify-center mb-6", tier.color)}>
              <tier.icon className="w-8 h-8" />
            </div>

            <h3 className="text-xl font-bold text-gray-900 mb-2">{tier.name}</h3>
            <div className="flex items-baseline gap-1 mb-4">
              <span className="text-3xl font-black text-gray-900">{tier.price}</span>
              {tier.id !== 'basic' && <span className="text-xs text-gray-400 font-bold uppercase">/ month</span>}
            </div>
            <p className="text-sm text-gray-500 mb-8 leading-relaxed">{tier.description}</p>

            <div className="space-y-4 mb-8 flex-1">
              {tier.features.map((feature, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-green-50 flex items-center justify-center shrink-0 mt-0.5">
                    <CheckCircle2 className="w-3 h-3 text-green-500" />
                  </div>
                  <span className="text-sm text-gray-600 leading-tight">{feature}</span>
                </div>
              ))}
            </div>

            <button
              onClick={() => tier.id !== 'basic' && handleUpgrade(tier.id)}
              disabled={user.membership?.tier === tier.id || (user.membership?.tier === 'elite' && tier.id === 'pro')}
              className={cn(
                "w-full py-4 rounded-2xl font-bold transition-all active:scale-95",
                user.membership?.tier === tier.id 
                  ? "bg-gray-100 text-gray-400 cursor-default" 
                  : tier.popular 
                    ? "bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg shadow-indigo-200" 
                    : "bg-gray-900 text-white hover:bg-black shadow-lg shadow-gray-200"
              )}
            >
              {user.membership?.tier === tier.id ? 'Current Plan' : tier.id === 'basic' ? 'Explore Features' : 'Upgrade Now'}
            </button>
          </motion.div>
        ))}
      </div>

      <div className="bg-indigo-50 border border-indigo-100 rounded-3xl p-8 flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-6">
          <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center shadow-sm">
            <ShieldCheck className="w-8 h-8 text-indigo-600" />
          </div>
          <div>
            <h4 className="font-bold text-gray-900 mb-1">Global Trade Protection</h4>
            <p className="text-sm text-gray-500 max-w-md leading-relaxed">
              All upgrade payments are secured by M-Pesa Escrow. You have a 7-day money-back guarantee for all Pro and Elite plans.
            </p>
          </div>
        </div>
        <button className="flex items-center gap-2 text-indigo-600 font-bold text-sm hover:underline">
          View Detailed Comparison <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

const AutomationLogView = ({ logs }: { logs?: string[] }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const analyzeLog = (log: string) => {
    const l = log.toLowerCase();
    if (l.includes('error') || l.includes('failed')) return { color: 'text-red-400', fix: 'Check supplier credentials/balance.' };
    if (l.includes('timeout')) return { color: 'text-yellow-400', fix: 'Network issue. Retrying...' };
    if (l.includes('rejected')) return { color: 'text-red-400', fix: 'Source rejected order. Manual check needed.' };
    return { color: 'text-indigo-300', fix: null };
  };

  if (!logs || logs.length === 0) return <div className="text-[10px] text-gray-400 italic">No logs</div>;

  return (
    <div className="w-72">
      <div className="flex items-center justify-between mb-1 px-1">
        <div className="flex items-center gap-1.5 text-[9px] font-bold text-indigo-400 uppercase tracking-widest">
          <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse" />
          Smart Agent Active
        </div>
        <button 
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-[9px] font-bold text-gray-400 hover:text-indigo-400 transition-colors uppercase tracking-tighter"
        >
          {isExpanded ? 'Collapse' : 'View Full Log'}
        </button>
      </div>
      <div className={cn(
        "bg-gray-900 rounded-xl p-3 font-mono text-[10px] transition-all duration-300 border border-gray-800 shadow-inner",
        isExpanded ? "max-h-96 overflow-y-auto" : "max-h-24 overflow-hidden"
      )}>
        {logs.map((log, i) => {
          const { color, fix } = analyzeLog(log);
          return (
            <div key={i} className="mb-2 last:mb-0 border-b border-gray-800/50 pb-2 last:border-0 last:pb-0">
              <div className={cn("leading-relaxed", color)}>{log}</div>
              {fix && (
                <div className="flex items-start gap-1.5 mt-1.5 bg-red-500/10 p-1.5 rounded border border-red-500/20">
                  <AlertCircle className="w-3 h-3 text-red-500 shrink-0 mt-0.5" />
                  <div className="text-[9px] text-red-400 font-sans leading-tight">
                    <span className="font-bold uppercase tracking-tighter mr-1">Suggested Fix:</span>
                    {fix}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {logs.length > 2 && (
        <button 
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-1 text-[10px] font-bold text-indigo-500 mt-2 hover:text-indigo-400 transition-colors"
        >
          {isExpanded ? (
            <>Collapse Logs <ChevronDown className="w-3 h-3 rotate-180" /></>
          ) : (
            <>Expand Logs <ChevronDown className="w-3 h-3" /></>
          )}
        </button>
      )}
    </div>
  );
};

const PoliceReportModal = ({ 
  order, 
  onClose,
  currency,
  rates
}: { 
  order: Order; 
  onClose: () => void;
  currency: string;
  rates: ExchangeRates;
}) => {
  const [driver, setDriver] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDriver = async () => {
      if (!order.deliveryDetails?.driverId) return;
      try {
        const snap = await getDoc(doc(db, 'users', order.deliveryDetails.driverId));
        if (snap.exists()) setDriver(snap.data() as UserProfile);
      } catch (error) {
        console.error("Error fetching driver for report:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchDriver();
  }, [order.deliveryDetails?.driverId]);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-[2.5rem] w-full max-w-2xl overflow-hidden shadow-2xl"
      >
        <div className="bg-red-600 px-8 py-6 text-white flex justify-between items-center">
          <div className="flex items-center gap-3">
            <ShieldAlert className="w-6 h-6 animate-pulse" />
            <h2 className="text-xl font-bold uppercase tracking-widest">Official Incident Report</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-8 max-h-[80vh] overflow-y-auto">
          <div className="flex justify-between items-start mb-8 pb-6 border-b border-gray-100">
            <div>
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Case Reference</div>
              <div className="font-mono text-lg font-bold text-gray-900">INC-{order.id}-POLICE</div>
            </div>
            <div className="text-right">
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Date Reported</div>
              <div className="text-sm font-bold text-gray-900">{new Date(order.createdAt).toLocaleString()}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
            <div className="space-y-6">
              <div>
                <h3 className="text-xs font-bold text-red-600 uppercase tracking-widest mb-3 flex items-center gap-2">
                   <UserIcon className="w-3 h-3" /> Driver Information
                </h3>
                {loading ? (
                  <div className="flex items-center gap-2 text-gray-400 italic text-sm">
                    <Loader2 className="w-3 h-3 animate-spin" /> Fetching NIDA records...
                  </div>
                ) : driver ? (
                  <div className="space-y-2 bg-gray-50 p-4 rounded-2xl border border-gray-100">
                    <div>
                      <div className="text-[10px] font-bold text-gray-400 uppercase">Full Name</div>
                      <div className="text-sm font-bold text-gray-900">{driver.displayName}</div>
                    </div>
                    <div>
                      <div className="text-[10px] font-bold text-gray-400 uppercase">National ID (NIDA)</div>
                      <div className="text-sm font-mono font-bold text-red-600">{driver.nationalId}</div>
                    </div>
                    <div>
                      <div className="text-[10px] font-bold text-gray-400 uppercase">Phone Number</div>
                      <div className="text-sm font-bold text-gray-900">{driver.phone}</div>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-red-500 font-bold">DRIVER RECORDS NOT FOUND</div>
                )}
              </div>

              <div>
                <h3 className="text-xs font-bold text-red-600 uppercase tracking-widest mb-3 flex items-center gap-2">
                   <Truck className="w-3 h-3" /> Vehicle Records
                </h3>
                {driver?.vehicleInfo ? (
                  <div className="space-y-2 bg-gray-50 p-4 rounded-2xl border border-gray-100">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="text-[10px] font-bold text-gray-400 uppercase">Plate Number</div>
                        <div className="text-sm font-mono font-bold text-gray-900">{driver.vehicleInfo.plateNumber}</div>
                      </div>
                      <div>
                        <div className="text-[10px] font-bold text-gray-400 uppercase">Vehicle Type</div>
                        <div className="text-sm font-bold text-gray-900">{driver.vehicleInfo.type}</div>
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-bold text-gray-400 uppercase">Description</div>
                      <div className="text-sm font-bold text-gray-900">{driver.vehicleInfo.model} • {driver.vehicleInfo.color}</div>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-gray-400 italic">No vehicle information registered.</div>
                )}
              </div>
            </div>

            <div className="space-y-6">
              <div>
                <h3 className="text-xs font-bold text-red-600 uppercase tracking-widest mb-3 flex items-center gap-2">
                   <CreditCard className="w-3 h-3" /> Financial Penalty
                </h3>
                <div className="bg-red-50 p-4 rounded-2xl border border-red-100">
                  <div className="flex justify-between items-center mb-2">
                     <span className="text-[10px] font-bold text-red-400 uppercase">Order Value</span>
                     <span className="text-sm font-bold text-gray-900">{formatPrice(order.total, order.currency, rates)}</span>
                  </div>
                  <div className="flex justify-between items-center mb-4">
                     <span className="text-[10px] font-bold text-red-400 uppercase">Penalty (2%)</span>
                     <span className="text-sm font-bold text-red-600">{formatPrice(order.total * 0.02, order.currency, rates)}</span>
                  </div>
                  <div className="pt-3 border-t border-red-200 flex justify-between items-center font-black">
                     <span className="text-[10px] uppercase text-red-600">Total Deducted</span>
                     <span className="text-lg text-red-600">{formatPrice(order.total * 1.02, order.currency, rates)}</span>
                  </div>
                  <div className="mt-4 text-[9px] text-red-500 italic bg-white/50 p-2 rounded-lg">
                    Funds have been automatically deducted from driver's registered bank account: {driver?.bankAccount?.bankName} ({driver?.bankAccount?.accountNumber})
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-xs font-bold text-red-600 uppercase tracking-widest mb-3 flex items-center gap-2">
                   <AlertCircle className="w-3 h-3" /> Incident Description
                </h3>
                <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 min-h-[100px]">
                  <p className="text-sm text-gray-700 leading-relaxed italic">"{order.disputeNotes}"</p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-gray-900 rounded-2xl p-6 text-white">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-indigo-500 rounded-xl flex items-center justify-center">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <div className="text-xs font-bold uppercase tracking-widest text-indigo-400">Authority Transmission</div>
                <div className="text-sm font-bold text-white">Reported to Police HQ</div>
              </div>
            </div>
            <p className="text-[10px] text-gray-400 leading-relaxed mb-4">
              This incident has been logged in the National Integrated Security System. The driver's NIDA (National Identification Authority) record has been flagged for investigation regarding the disappearance of goods for Order #{order.id}.
            </p>
            <div className="flex gap-4">
              <div className="px-3 py-1 bg-green-500/20 text-green-400 border border-green-500/30 rounded text-[9px] font-bold uppercase">NIDA Flagged</div>
              <div className="px-3 py-1 bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 rounded text-[9px] font-bold uppercase tracking-wider">Case ID Generated</div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

const ConfirmationQRModal = ({ order, onClose }: { order: Order, onClose: () => void }) => {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
      <div className="bg-white rounded-[2.5rem] w-full max-w-sm overflow-hidden p-8 text-center">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold">Delivery QR</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full">
            <X className="w-6 h-6" />
          </button>
        </div>
        
        <div className="bg-white p-4 rounded-3xl border-2 border-indigo-100 mb-6 flex justify-center">
          <QRCodeSVG 
            value={JSON.stringify({ orderId: order.id, code: order.confirmationCode })} 
            size={200}
            level="H"
            includeMargin
          />
        </div>
        
        <div className="mb-6">
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Manual Backup Code</div>
          <div className="text-2xl font-black text-indigo-600 tracking-widest">{order.confirmationCode}</div>
        </div>
        
        <p className="text-xs text-gray-400 font-medium">Ask the customer to scan this QR code or enter the manual code to confirm receipt and finalize payment.</p>
      </div>
    </div>
  );
};

const QRScannerModal = ({ onScan, onClose }: { onScan: (data: string) => void, onClose: () => void }) => {
  useEffect(() => {
    const scanner = new Html5QrcodeScanner(
      "qr-reader",
      { fps: 10, qrbox: { width: 250, height: 250 } },
      /* verbose= */ false
    );
    
    const onScanSuccess = (decodedText: string) => {
      scanner.clear().then(() => {
        onScan(decodedText);
      }).catch(err => {
        console.error("Failed to clear scanner", err);
        onScan(decodedText);
      });
    };

    scanner.render(onScanSuccess, () => {});
    
    return () => {
      scanner.clear().catch(() => {});
    };
  }, [onScan]);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
      <div className="bg-white rounded-[2.5rem] w-full max-w-sm overflow-hidden p-8">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold">Scan Confirmation</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full">
            <X className="w-6 h-6" />
          </button>
        </div>
        <div id="qr-reader" className="overflow-hidden rounded-2xl border-2 border-dashed border-gray-200"></div>
        <p className="text-xs text-gray-400 mt-4 text-center font-medium">Position the driver's QR code within the frame to confirm receipt and release payment.</p>
      </div>
    </div>
  );
};

const LocationPickerInternal = ({ onLocationSelect, position, setPosition, loading, setLoading }: any) => {
  const map = useMap();
  const placesLib = useMapsLibrary('places');
  const autocompleteContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!placesLib || !autocompleteContainerRef.current || !map) return;

    // Use the new PlaceAutocompleteElement (Web Component)
    const autocompleteWidget = document.createElement('gmp-place-autocomplete') as any;
    
    // @ts-ignore - JSX attribute trap from skill CF8
    autocompleteContainerRef.current.appendChild(autocompleteWidget);

    autocompleteWidget.addEventListener('gmp-placeselect', async (e: any) => {
      const place = e.item.place;
      await place.fetchFields({ fields: ['location', 'displayName', 'formattedAddress'] });
      
      if (place.location) {
        const newPos = { lat: place.location.lat(), lng: place.location.lng() };
        setPosition(newPos);
        map.panTo(newPos);
        map.setZoom(17);
        onLocationSelect(newPos.lat, newPos.lng, place.formattedAddress);
      }
    });

    return () => {
      if (autocompleteContainerRef.current) autocompleteContainerRef.current.innerHTML = '';
    };
  }, [placesLib, map]);

  const handleGetCurrentLocation = () => {
    setLoading(true);
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser");
      setLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        const newPos = { lat: latitude, lng: longitude };
        setPosition(newPos);
        if (map) {
          map.panTo(newPos);
          map.setZoom(17);
        }
        onLocationSelect(latitude, longitude);
        setLoading(false);
      },
      (err) => {
        console.error(err);
        alert("Unable to retrieve your location. Using default map center.");
        setLoading(false);
      },
      { enableHighAccuracy: true }
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-indigo-600">
            <Search className="w-5 h-5" />
            <h3 className="font-bold text-sm">Search Delivery Point</h3>
          </div>
          <button
            type="button"
            onClick={handleGetCurrentLocation}
            disabled={loading}
            className="flex items-center gap-2 bg-indigo-50 text-indigo-600 px-4 py-2 rounded-xl text-xs font-bold hover:bg-indigo-100 transition-all border border-indigo-100"
          >
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Smartphone className="w-3 h-3" />}
            Use My Current Location
          </button>
        </div>
        
        <div ref={autocompleteContainerRef} className="autocomplete-container min-h-[56px] bg-white rounded-xl overflow-hidden border border-gray-100 shadow-sm" />
      </div>

      <div className="h-64 sm:h-80 w-full rounded-2xl overflow-hidden border-2 border-gray-100 relative">
        <Map
          defaultCenter={position}
          defaultZoom={13}
          mapId="LOCATION_PICKER_MAP"
          onClick={(e) => {
            if (e.detail.latLng) {
              const newPos = { lat: e.detail.latLng.lat, lng: e.detail.latLng.lng };
              setPosition(newPos);
              onLocationSelect(newPos.lat, newPos.lng);
            }
          }}
          gestureHandling={'greedy'}
          disableDefaultUI={true}
          internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
          style={{ width: '100%', height: '100%' }}
        >
          <AdvancedMarker position={position}>
            <Pin background="#4f46e5" glyphColor="#ffffff" borderColor="#4f46e5" />
          </AdvancedMarker>
        </Map>
      </div>
      <p className="text-[10px] text-gray-400 italic text-center">Tap the map or use the search bar above for precision.</p>
    </div>
  );
};

const LocationPicker = ({ onLocationSelect, initialLocation }: { onLocationSelect: (lat: number, lng: number, address?: string) => void, initialLocation?: { lat: number, lng: number } }) => {
  const [position, setPosition] = useState<google.maps.LatLngLiteral>(initialLocation || { lat: -6.7924, lng: 39.2083 });
  const [loading, setLoading] = useState(false);

  if (!hasValidMapKey) return <MapSplashScreen />;

  return (
    <APIProvider apiKey={GOOGLE_MAPS_API_KEY} version="weekly">
      <LocationPickerInternal 
        onLocationSelect={onLocationSelect}
        position={position}
        setPosition={setPosition}
        loading={loading}
        setLoading={setLoading}
      />
    </APIProvider>
  );
};

const TrackingMap = ({ order }: { order: Order }) => {
  const [driverPos, setDriverPos] = useState<google.maps.LatLngLiteral | null>(null);
  const [progress, setProgress] = useState(0);

  const destination: google.maps.LatLngLiteral = (order.customer && order.customer.lat && order.customer.lng) 
    ? { lat: order.customer.lat, lng: order.customer.lng } 
    : { lat: -6.7924, lng: 39.2083 };
    
  const origin: google.maps.LatLngLiteral = { lat: -6.8161, lng: 39.2804 }; 

  useEffect(() => {
    if (order.status === 'delivered') {
      setDriverPos(destination);
      return;
    }

    if (order.status === 'picked_up' || order.status === 'on_the_way') {
      const interval = setInterval(() => {
        setProgress(prev => {
          const next = prev + 0.01;
          if (next >= 1) {
            clearInterval(interval);
            return 1;
          }
          return next;
        });
      }, 2000);

      return () => clearInterval(interval);
    } else {
      setDriverPos(origin);
    }
  }, [order.status]);

  useEffect(() => {
    const lat = origin.lat + (destination.lat - origin.lat) * progress;
    const lng = origin.lng + (destination.lng - origin.lng) * progress;
    setDriverPos({ lat, lng });
  }, [progress]);

  if (!hasValidMapKey) return <MapSplashScreen />;

  return (
    <div className="h-80 w-full rounded-[2.5rem] overflow-hidden border-2 border-gray-100 shadow-inner relative">
      <APIProvider apiKey={GOOGLE_MAPS_API_KEY} version="weekly">
        <Map
          defaultCenter={destination}
          defaultZoom={12}
          mapId="TRACKING_MAP"
          gestureHandling={'greedy'}
          disableDefaultUI={true}
          internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
          style={{ width: '100%', height: '100%' }}
        >
          {/* Destination Marker */}
          <AdvancedMarker position={destination}>
            <div className="w-10 h-10 bg-white rounded-full p-2 shadow-lg border-2 border-indigo-600 flex items-center justify-center">
               <Home className="w-5 h-5 text-indigo-600" />
            </div>
          </AdvancedMarker>

          {/* Driver Marker */}
          {driverPos && (
            <AdvancedMarker position={driverPos}>
              <div className="w-10 h-10 bg-indigo-600 rounded-full p-2 shadow-lg border-2 border-white flex items-center justify-center animate-bounce">
                 {order.status === 'picked_up' || order.status === 'on_the_way' 
                   ? <Truck className="w-5 h-5 text-white" /> 
                   : <Package className="w-5 h-5 text-white" />}
              </div>
            </AdvancedMarker>
          )}

          {/* Path Line? (Better to use Routes API but for simulation we keep it simple or use computed path) */}
        </Map>
      </APIProvider>
      
      <div className="absolute bottom-4 left-4 right-4 z-20 flex gap-2 overflow-x-auto scrollbar-hide">
        <div className="shrink-0 flex items-center gap-2 bg-white/90 backdrop-blur px-4 py-2 rounded-full border border-white shadow-lg">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          <span className="text-[10px] font-bold text-gray-900 uppercase">Satellite Link Verified</span>
        </div>
        <div className="shrink-0 flex items-center gap-2 bg-white/90 backdrop-blur px-4 py-2 rounded-full border border-white shadow-lg">
          <Clock className="w-3 h-3 text-indigo-600" />
          <span className="text-[10px] font-bold text-gray-900 uppercase">Estimated Arrival: {Math.max(5, Math.ceil((1 - progress) * 25))} Mins</span>
        </div>
      </div>
    </div>
  );
};

const getDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371; // km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
};

const calculateDeliveryFee = (distanceKm: number) => {
  const BASE_RATE = 2000;
  const PER_KM_RATE = 1000;
  return BASE_RATE + (distanceKm * PER_KM_RATE);
};

const VerificationLogs = ({ logs }: { logs?: string[] }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!logs || logs.length === 0) return null;

  return (
    <div className="mt-4 border-t border-gray-100 pt-4">
      <button 
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest hover:text-indigo-600 transition-colors"
      >
        <ChevronDown className={cn("w-3 h-3 transition-transform", isExpanded ? "rotate-0" : "-rotate-90")} />
        Verification Logs ({logs.length})
      </button>
      
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-3 bg-gray-900 rounded-xl p-4 font-mono text-[10px] text-indigo-300 space-y-1 max-h-48 overflow-y-auto">
              {logs.map((log, i) => (
                <div key={i} className="flex gap-2">
                  <span className="opacity-30">[{i + 1}]</span>
                  <span>{log}</span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const ProductReviews = ({ productId, user }: { productId: string; user: User | null }) => {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const reviewsRef = collection(db, 'products', productId, 'reviews');
    const q = query(reviewsRef, orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setReviews(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Review)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `products/${productId}/reviews`);
    });
    return unsubscribe;
  }, [productId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!comment.trim()) return;

    setSubmitting(true);
    const reviewId = Math.random().toString(36).substr(2, 9);
    const newReview: Review = {
      id: reviewId,
      userId: user.uid,
      userName: user.displayName || user.email.split('@')[0],
      rating,
      comment,
      createdAt: new Date().toISOString()
    };

    try {
      await setDoc(doc(db, 'products', productId, 'reviews', reviewId), newReview);
      setComment('');
      setRating(5);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `products/${productId}/reviews/${reviewId}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
          <Star className="w-3 h-3" />
          Customer Reviews ({reviews.length})
        </h4>
        {reviews.length > 0 && (
          <div className="flex items-center gap-1">
            <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
            <span className="text-sm font-bold text-gray-900">
              {(reviews.reduce((acc, r) => acc + r.rating, 0) / reviews.length).toFixed(1)}
            </span>
          </div>
        )}
      </div>

      {user ? (
        <form onSubmit={handleSubmit} className="bg-gray-50 rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2">
            {[1, 2, 3, 4, 5].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setRating(s)}
                className="focus:outline-none"
              >
                <Star 
                  className={cn(
                    "w-6 h-6 transition-colors",
                    s <= rating ? "text-yellow-400 fill-yellow-400" : "text-gray-300"
                  )} 
                />
              </button>
            ))}
          </div>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Share your thoughts about this product..."
            className="w-full bg-white border border-gray-200 rounded-xl p-4 text-sm focus:ring-2 focus:ring-indigo-500 outline-none min-h-[100px] transition-all"
            required
          />
          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {submitting ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <Send className="w-4 h-4" />
                Submit Review
              </>
            )}
          </button>
        </form>
      ) : (
        <div className="bg-indigo-50 rounded-2xl p-6 text-center">
          <p className="text-sm text-indigo-900 font-medium mb-2">Want to leave a review?</p>
          <p className="text-xs text-indigo-600">Please sign in to share your experience.</p>
        </div>
      )}

      <div className="space-y-6">
        {reviews.map((review) => (
          <div key={review.id} className="border-b border-gray-100 pb-6 last:border-0">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 text-xs font-bold">
                  {review.userName[0].toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-900">{review.userName}</p>
                  <p className="text-[10px] text-gray-400">{new Date(review.createdAt).toLocaleDateString()}</p>
                </div>
              </div>
              <div className="flex items-center gap-0.5">
                {[1, 2, 3, 4, 5].map((s) => (
                  <Star 
                    key={s} 
                    className={cn(
                      "w-3 h-3",
                      s <= review.rating ? "text-yellow-400 fill-yellow-400" : "text-gray-200"
                    )} 
                  />
                ))}
              </div>
            </div>
            <p className="text-sm text-gray-600 leading-relaxed">{review.comment}</p>
          </div>
        ))}
        {reviews.length === 0 && (
          <div className="text-center py-8">
            <MessageSquare className="w-8 h-8 text-gray-200 mx-auto mb-3" />
            <p className="text-sm text-gray-400">No reviews yet. Be the first to review!</p>
          </div>
        )}
      </div>
    </div>
  );
};

const ProductModal = ({ 
  product, 
  onClose, 
  addToCart, 
  onConfirm,
  currency, 
  rates,
  isAdmin,
  user
}: { 
  product: Product; 
  onClose: () => void; 
  addToCart?: (p: Product, selectedVariations?: { [key: string]: string }, quantity?: number) => void;
  onConfirm?: (p: Product) => void;
  currency: string;
  rates: ExchangeRates;
  isAdmin?: boolean;
  user: User | null;
}) => {
  const [selectedVariations, setSelectedVariations] = useState<{ [key: string]: string }>({});
  const [quantity, setQuantity] = useState(1);
  const [currentImage, setCurrentImage] = useState(product.image);
  const [editedTitle, setEditedTitle] = useState(product.title);
  const [editedDescription, setEditedDescription] = useState(product.description);

  const priceModifier = useMemo(() => {
    let modifier = 0;
    if (product.variations) {
      product.variations.forEach(v => {
        const selectedValue = selectedVariations[v.name];
        if (selectedValue) {
          const option = v.options.find(o => o.name === selectedValue);
          if (option?.priceModifier) {
            modifier += option.priceModifier;
          }
        }
      });
    }
    return modifier;
  }, [product.variations, selectedVariations]);

  const currentPrice = product.price + priceModifier;

  useEffect(() => {
    setCurrentImage(product.image);
    setEditedTitle(product.title);
    setEditedDescription(product.description);
    setQuantity(1);
  }, [product]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        className="bg-white rounded-3xl max-w-4xl w-full max-h-[90vh] overflow-hidden shadow-2xl flex flex-col md:flex-row relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 z-20 p-2 bg-white/80 backdrop-blur rounded-full text-gray-900 hover:bg-white transition-colors shadow-sm md:hidden"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="md:w-1/2 h-64 md:h-auto relative bg-gray-50 shrink-0">
          <img 
            src={currentImage || null} 
            alt={`${product.title} product image`} 
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
          />
        </div>
        
        <div className="md:w-1/2 p-6 sm:p-8 md:p-12 overflow-y-auto flex flex-col">
          <div className="flex justify-between items-start mb-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded uppercase tracking-wider">{product.category || 'General'}</span>
                {product.sourceUrl.includes('alibaba.com') && (
                  <span className="text-[10px] font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded uppercase tracking-wider flex items-center gap-1">
                    <img src="https://upload.wikimedia.org/wikipedia/en/thumb/8/80/Alibaba.com_logo.svg/1200px-Alibaba.com_logo.svg.png" alt="Alibaba logo" className="h-2" referrerPolicy="no-referrer" />
                    Alibaba Source
                  </span>
                )}
              </div>
              {isAdmin && onConfirm ? (
                <div className="space-y-4">
                  <input
                    type="text"
                    value={editedTitle}
                    onChange={(e) => setEditedTitle(e.target.value)}
                    className="w-full text-xl sm:text-2xl font-bold text-gray-900 mb-2 leading-tight border-b border-dashed border-gray-300 focus:border-indigo-500 outline-none bg-transparent"
                    placeholder="Product Title"
                  />
                  <div className="text-xl sm:text-2xl font-extrabold text-indigo-600">
                    {formatPrice(currentPrice * (1 + product.markup / 100), currency, rates, product.sourceCurrency)}
                  </div>
                </div>
              ) : (
                <>
                  <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2 leading-tight">{product.title}</h2>
                  <div className="text-xl sm:text-2xl font-extrabold text-indigo-600">
                    {formatPrice(currentPrice * (1 + product.markup / 100), currency, rates, product.sourceCurrency)}
                  </div>
                </>
              )}
            </div>
            <button 
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-900 transition-colors hidden md:block"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          <div className="space-y-6 sm:space-y-8 flex-1">
            <section>
              <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                <Info className="w-3 h-3" />
                Description
              </h4>
              {isAdmin && onConfirm ? (
                <textarea
                  value={editedDescription}
                  onChange={(e) => setEditedDescription(e.target.value)}
                  className="w-full text-sm sm:text-base text-gray-600 leading-relaxed border border-gray-200 rounded-xl p-4 focus:ring-2 focus:ring-indigo-500 outline-none min-h-[120px]"
                  placeholder="Product Description"
                />
              ) : (
                <p className="text-sm sm:text-base text-gray-600 leading-relaxed">{product.description}</p>
              )}
            </section>

            {product.features && product.features.length > 0 && (
              <section>
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                  <Settings className="w-3 h-3" />
                  Key Features
                </h4>
                <ul className="grid grid-cols-1 gap-3">
                  {product.features.map((feature, i) => {
                    const isMOQ = feature.toLowerCase().includes('moq') || feature.toLowerCase().includes('min. order');
                    return (
                      <li key={i} className={cn("flex items-start gap-3 text-sm p-2 rounded-lg", isMOQ ? "bg-orange-50 text-orange-700 border border-orange-100" : "text-gray-600")}>
                        {isMOQ ? <Package className="w-4 h-4 mt-0.5" /> : <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-1.5 flex-shrink-0" />}
                        <span className={cn(isMOQ && "font-bold")}>{feature}</span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            {product.variations && product.variations.length > 0 && (
              <section>
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                  <Package className="w-3 h-3" />
                  Options
                </h4>
                <div className="space-y-6">
                  {product.variations.map((v, i) => (
                    <div key={i}>
                      <span className="block text-[10px] font-bold text-gray-400 uppercase mb-3">{v.name}</span>
                              <div className="flex flex-wrap gap-2">
                                  {v.options.map((opt, j) => (
                                    <button
                                      key={j}
                                      onClick={() => {
                                        setSelectedVariations(prev => ({ ...prev, [v.name]: opt.name }));
                                        if (opt.image) {
                                          setCurrentImage(opt.image);
                                        }
                                      }}
                                      className={cn(
                                        "group relative flex flex-col items-center gap-1.5 transition-all",
                                        selectedVariations[v.name] === opt.name 
                                          ? "scale-105" 
                                          : "opacity-70 hover:opacity-100"
                                      )}
                                    >
                                      {opt.image ? (
                                        <div 
                                          className={cn(
                                            "w-14 h-14 rounded-xl overflow-hidden border-2 transition-all relative",
                                            selectedVariations[v.name] === opt.name ? "border-indigo-600 shadow-md" : "border-transparent"
                                          )}
                                        >
                                          <img src={opt.image || null} alt={`${opt.name} variation image`} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                          {opt.priceModifier && opt.priceModifier > 0 && (
                                            <div className="absolute bottom-0 right-0 left-0 bg-indigo-600/90 text-white text-[7px] font-black py-0.5 px-1 truncate">
                                              +{formatPrice(opt.priceModifier * (1 + product.markup / 100), currency, rates, product.sourceCurrency)}
                                            </div>
                                          )}
                                        </div>
                                      ) : (
                                        <div className={cn(
                                          "min-w-[40px] h-10 px-3 flex flex-col items-center justify-center rounded-xl border transition-all",
                                          selectedVariations[v.name] === opt.name 
                                            ? "bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-100" 
                                            : "bg-white text-gray-600 border-gray-200 hover:border-indigo-300"
                                        )}>
                                          <span className="text-[11px] font-bold">{opt.name}</span>
                                          {opt.priceModifier && opt.priceModifier > 0 && (
                                            <span className={cn(
                                              "text-[7px] font-black uppercase tracking-tighter",
                                              selectedVariations[v.name] === opt.name ? "text-indigo-200" : "text-indigo-500"
                                            )}>
                                              +{formatPrice(opt.priceModifier * (1 + product.markup / 100), currency, rates, product.sourceCurrency)}
                                            </span>
                                          )}
                                        </div>
                                      )}
                                      {opt.image && (
                                        <span className={cn(
                                          "text-[8px] font-bold uppercase tracking-tight",
                                          selectedVariations[v.name] === opt.name ? "text-indigo-600" : "text-gray-400"
                                        )}>
                                          {opt.name}
                                        </span>
                                      )}
                                    </button>
                                  ))}
                              </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {product.shippingCost !== undefined && product.shippingCost > 0 && (
              <section className="bg-green-50/50 rounded-2xl p-4 border border-green-100/50">
                <h4 className="text-[10px] font-bold text-green-600 uppercase tracking-widest mb-2 flex items-center gap-2">
                  <Truck className="w-3 h-3" />
                  Shipping Cost
                </h4>
                <p className="text-xs text-green-900 font-bold leading-relaxed">
                  {formatPrice(product.shippingCost, currency, rates, product.sourceCurrency)} (Included in price)
                </p>
              </section>
            )}

            {product.shippingInfo && (
              <section className="bg-indigo-50/50 rounded-2xl p-4 border border-indigo-100/50">
                <h4 className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                  <Truck className="w-3 h-3" />
                  Shipping & Delivery
                </h4>
                <p className="text-xs text-indigo-900 font-medium leading-relaxed">{product.shippingInfo}</p>
              </section>
            )}

            <section className="pt-8 border-t border-gray-100">
              <ProductReviews productId={product.id} user={user} />
            </section>

            <section className="pt-8 border-t border-gray-100">
              <div className="flex items-center justify-between mb-6">
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                  <Info className="w-3 h-3" />
                  Product Information
                </h4>
              </div>
            </section>

            {product.gallery && product.gallery.length > 0 && (
              <section>
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                  <Info className="w-3 h-3" />
                  Gallery
                </h4>
                <div className="grid grid-cols-5 gap-2">
                  {product.gallery.map((img, i) => (
                    <div 
                      key={i} 
                      className={cn(
                        "aspect-square rounded-lg overflow-hidden border transition-all relative group",
                        onConfirm ? "cursor-pointer hover:border-indigo-600" : "border-gray-100",
                        onConfirm && currentImage === img ? "border-indigo-600 ring-2 ring-indigo-600/20" : ""
                      )}
                      onClick={() => onConfirm && setCurrentImage(img)}
                    >
                      <img src={img || null} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      {onConfirm && (
                        <div className={cn(
                          "absolute inset-0 bg-indigo-600/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity",
                          currentImage === img && "opacity-100"
                        )}>
                          <div className="bg-white/90 p-1 rounded-full shadow-sm">
                            <Check className="w-3 h-3 text-indigo-600" />
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section>
              <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                <Plus className="w-3 h-3" />
                Quantity
              </h4>
              <div className="flex items-center gap-4">
                <div className="flex items-center bg-gray-100 rounded-xl p-1">
                  <button 
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    className="w-10 h-10 flex items-center justify-center text-gray-600 hover:bg-white rounded-lg transition-all"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="w-12 text-center font-bold text-gray-900">{quantity}</span>
                  <button 
                    onClick={() => setQuantity(quantity + 1)}
                    className="w-10 h-10 flex items-center justify-center text-gray-600 hover:bg-white rounded-lg transition-all"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                <span className="text-xs font-medium text-gray-400 italic">In stock and ready to ship</span>
              </div>
            </section>
          </div>

          <div className="mt-12 pt-8 border-t border-gray-100">
              <div className="flex flex-col sm:flex-row gap-4">
                {onConfirm ? (
                  <button
                    onClick={() => {
                      onConfirm({
                        ...product,
                        title: editedTitle,
                        description: editedDescription
                      });
                      onClose();
                    }}
                    className="flex-1 bg-indigo-600 text-white py-4 rounded-2xl font-bold hover:bg-indigo-700 transition-all flex items-center justify-center gap-3 shadow-lg shadow-indigo-100"
                  >
                    <CheckCircle className="w-5 h-5" />
                    Confirm Import
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      addToCart?.({
                        ...product,
                        price: currentPrice
                      }, selectedVariations, quantity);
                      onClose();
                    }}
                    className="flex-1 bg-gray-900 text-white py-4 rounded-2xl font-bold hover:bg-indigo-600 transition-all flex items-center justify-center gap-3 shadow-lg shadow-gray-200"
                  >
                    <Plus className="w-5 h-5" />
                    Add to Cart
                  </button>
                )}
              </div>
            {isAdmin && (
              <a 
                href={product.sourceUrl} 
                target="_blank" 
                rel="noopener noreferrer"
                className="block text-center mt-4 text-xs font-bold text-gray-400 hover:text-indigo-600 transition-colors uppercase tracking-widest"
              >
                View Original Source
              </a>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

const ChatWidget = ({ user }: { user: User | null }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [chat, setChat] = useState<Chat | null>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user || !isOpen) return;

    const chatId = user.uid;
    const chatRef = doc(db, 'chats', chatId);

    // Ensure chat exists
    const setupChat = async () => {
      const chatDoc = await getDocFromServer(chatRef);
      if (!chatDoc.exists()) {
        const newChat: Chat = {
          id: chatId,
          buyerId: user.uid,
          buyerName: user.displayName || user.email?.split('@')[0] || 'Guest',
          buyerEmail: user.email || undefined,
          unreadCountSeller: 0,
          unreadCountBuyer: 0,
          updatedAt: new Date().toISOString()
        };
        await setDoc(chatRef, newChat);
      }
    };
    setupChat();

    const unsubChat = onSnapshot(chatRef, (doc) => {
      if (doc.exists()) {
        setChat(doc.data() as Chat);
        // Reset unread count for buyer when they open the chat
        if (doc.data().unreadCountBuyer > 0) {
          updateDoc(chatRef, { unreadCountBuyer: 0 });
        }
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `chats/${chatId}`);
    });

    const q = query(collection(db, 'chats', chatId, 'messages'), orderBy('timestamp', 'asc'), limit(50));
    const unsubMessages = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ChatMessage));
      setMessages(msgs);
      setTimeout(() => scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight), 100);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `chats/${chatId}/messages`);
    });

    return () => {
      unsubChat();
      unsubMessages();
    };
  }, [user, isOpen]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newMessage.trim()) return;

    const chatId = user.uid;
    const messageData = {
      senderId: user.uid,
      senderName: user.displayName || user.email?.split('@')[0] || 'Guest',
      text: newMessage.trim(),
      timestamp: new Date().toISOString(),
      read: false
    };

    setNewMessage('');
    
    try {
      await addDoc(collection(db, 'chats', chatId, 'messages'), messageData);
      await updateDoc(doc(db, 'chats', chatId), {
        lastMessage: newMessage.trim(),
        lastMessageTimestamp: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        unreadCountSeller: (chat?.unreadCountSeller || 0) + 1
      });
    } catch (error) {
      console.error("Error sending message:", error);
    }
  };

  if (!user) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[100]">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="bg-white rounded-3xl shadow-2xl w-80 sm:w-96 h-[500px] flex flex-col overflow-hidden border border-gray-100 mb-4"
          >
            <div className="bg-indigo-600 p-4 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                  <Store className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm">Store Support</h3>
                  <p className="text-[10px] opacity-80">We usually reply in minutes</p>
                </div>
              </div>
              <button onClick={() => setIsOpen(false)} className="p-1 hover:bg-white/10 rounded-lg transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
              {messages.length === 0 && (
                <div className="text-center py-8">
                  <div className="w-12 h-12 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-3 text-indigo-600">
                    <MessageSquare className="w-6 h-6" />
                  </div>
                  <p className="text-xs text-gray-500 font-medium">Start a conversation with us!</p>
                </div>
              )}
              {messages.map((msg, i) => (
                <div key={msg.id || i} className={cn("flex flex-col", msg.senderId === user.uid ? "items-end" : "items-start")}>
                  <div className={cn(
                    "max-w-[80%] p-3 rounded-2xl text-sm shadow-sm",
                    msg.senderId === user.uid ? "bg-indigo-600 text-white rounded-tr-none" : "bg-white text-gray-900 rounded-tl-none border border-gray-100"
                  )}>
                    {msg.text}
                  </div>
                  <span className="text-[9px] text-gray-400 mt-1 px-1">
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))}
            </div>

            <form onSubmit={handleSendMessage} className="p-4 bg-white border-t border-gray-100 flex gap-2">
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Type your message..."
                className="flex-1 bg-gray-100 border-none rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              />
              <button 
                type="submit"
                disabled={!newMessage.trim()}
                className="bg-indigo-600 text-white p-2 rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50"
              >
                <Send className="w-5 h-5" />
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-14 h-14 bg-indigo-600 text-white rounded-full flex items-center justify-center shadow-xl hover:scale-110 transition-all relative group"
      >
        {isOpen ? <X className="w-6 h-6" /> : <MessageSquare className="w-6 h-6" />}
        {!isOpen && chat && chat.unreadCountBuyer > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold w-5 h-5 flex items-center justify-center rounded-full border-2 border-white">
            {chat.unreadCountBuyer}
          </span>
        )}
        <div className="absolute right-full mr-4 bg-gray-900 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          Chat with us
        </div>
      </button>
    </div>
  );
};

const AuthModal = ({ 
  onClose,
  onSuccess
}: { 
  onClose: () => void;
  onSuccess: () => void;
}) => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [role, setRole] = useState<'buyer' | 'seller' | 'driver'>('buyer');
  const [phone, setPhone] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [vehicleInfo, setVehicleInfo] = useState({ type: 'Motorcycle', plateNumber: '', model: '', color: '' });
  const [bankAccount, setBankAccount] = useState({ accountName: '', accountNumber: '', bankName: '' });
  const [driverVerification, setDriverVerification] = useState({
    birthCertUrl: '',
    selfieUrl: '',
    licenseUrl: '',
    nidaNumber: '',
    status: 'pending' as 'pending' | 'verified' | 'rejected' | 'flagged'
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(userCredential.user, {
          displayName: username
        });
        
        const referrer = localStorage.getItem('referrer');
        
        // Save user role to Firestore
        await setDoc(doc(db, 'users', userCredential.user.uid), {
          uid: userCredential.user.uid,
          email: userCredential.user.email,
          displayName: username,
          phone: role === 'driver' ? phone : null,
          role: role,
          referredBy: referrer || null,
          referralEarnings: 0,
          walletBalance: 0,
          nationalId: role === 'driver' ? nationalId : null,
          driverVerification: role === 'driver' ? driverVerification : null,
          vehicleInfo: role === 'driver' ? vehicleInfo : null,
          bankAccount: role === 'driver' ? bankAccount : null,
          membership: { tier: 'basic' },
          createdAt: new Date().toISOString()
        });
      }
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error("Auth error:", err);
      if (err.code === 'auth/operation-not-allowed') {
        setError("Email/Password authentication is not enabled in your Firebase project. Please enable it in the Firebase Console under Authentication > Sign-in method.");
      } else {
        setError(err.message || "An error occurred during authentication");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;

      // Check if user profile exists, if not create one
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      if (!userDoc.exists()) {
        await setDoc(doc(db, 'users', user.uid), {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName || user.email?.split('@')[0] || 'Guest',
          role: 'buyer', // Default role for Google login
          createdAt: new Date().toISOString()
        });
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error("Google login error:", err);
      if (err.code === 'auth/operation-not-allowed') {
        setError("Google authentication is not enabled in your Firebase project. Please enable it in the Firebase Console under Authentication > Sign-in method.");
      } else {
        setError(err.message || "An error occurred during Google login");
      }
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        className="bg-white rounded-3xl max-w-md w-full overflow-hidden shadow-2xl p-6 sm:p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-8">
          <h2 className="text-2xl font-bold text-gray-900">{isLogin ? 'Welcome Back' : 'Create Account'}</h2>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-900 transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {!isLogin && (
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">User Name</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                placeholder="John Doe"
                required={!isLogin}
              />
            </div>
          )}
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Email Address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
              placeholder="john@example.com"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
              placeholder="••••••••"
              required
            />
          </div>

          {!isLogin && (
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Account Type</label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setRole('buyer')}
                  className={cn(
                    "py-3 rounded-xl font-bold border-2 transition-all flex flex-col items-center justify-center gap-1",
                    role === 'buyer' ? "border-indigo-600 bg-indigo-50 text-indigo-600" : "border-gray-100 text-gray-400 hover:border-gray-200"
                  )}
                >
                  <ShoppingCart className="w-4 h-4" />
                  <span className="text-[10px]">Buyer</span>
                </button>
                <button
                  type="button"
                  onClick={() => setRole('seller')}
                  className={cn(
                    "py-3 rounded-xl font-bold border-2 transition-all flex flex-col items-center justify-center gap-1",
                    role === 'seller' ? "border-indigo-600 bg-indigo-50 text-indigo-600" : "border-gray-100 text-gray-400 hover:border-gray-200"
                  )}
                >
                  <Store className="w-4 h-4" />
                  <span className="text-[10px]">Seller</span>
                </button>
                <button
                  type="button"
                  onClick={() => setRole('driver')}
                  className={cn(
                    "py-3 rounded-xl font-bold border-2 transition-all flex flex-col items-center justify-center gap-1",
                    role === 'driver' ? "border-indigo-600 bg-indigo-50 text-indigo-600" : "border-gray-100 text-gray-400 hover:border-gray-200"
                  )}
                >
                  <Truck className="w-4 h-4" />
                  <span className="text-[10px]">Driver</span>
                </button>
              </div>
            </div>
          )}

          {!isLogin && role === 'driver' && (
            <div className="space-y-4 pt-4 border-t border-gray-100">
              <div className="flex items-center gap-2 text-indigo-600 mb-2">
                <ShieldCheck className="w-5 h-5" />
                <span className="text-sm font-bold">Driver Security Verification</span>
              </div>
              
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Phone Number</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                  placeholder="+255..."
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">National ID / NIDA</label>
                <input
                  type="text"
                  value={nationalId}
                  onChange={(e) => {
                    setNationalId(e.target.value);
                    setDriverVerification(prev => ({ ...prev, nidaNumber: e.target.value }));
                  }}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                  placeholder="ID Number"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest">Selfie Photo</label>
                  <label className="flex items-center justify-center p-4 border-2 border-dashed border-gray-100 rounded-2xl cursor-pointer hover:bg-gray-50 transition-all">
                    {driverVerification.selfieUrl ? (
                      <CheckCircle2 className="w-6 h-6 text-green-500" />
                    ) : (
                      <Camera className="w-6 h-6 text-gray-400" />
                    )}
                    <input 
                      type="file" 
                      className="hidden" 
                      accept="image/*" 
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onloadend = () => setDriverVerification(prev => ({ ...prev, selfieUrl: reader.result as string }));
                          reader.readAsDataURL(file);
                        }
                      }}
                    />
                  </label>
                </div>
                <div className="space-y-2">
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest">License Photo</label>
                  <label className="flex items-center justify-center p-4 border-2 border-dashed border-gray-100 rounded-2xl cursor-pointer hover:bg-gray-50 transition-all">
                    {driverVerification.licenseUrl ? (
                      <CheckCircle2 className="w-6 h-6 text-green-500" />
                    ) : (
                      <FileText className="w-6 h-6 text-gray-400" />
                    )}
                    <input 
                      type="file" 
                      className="hidden" 
                      accept="image/*" 
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onloadend = () => setDriverVerification(prev => ({ ...prev, licenseUrl: reader.result as string }));
                          reader.readAsDataURL(file);
                        }
                      }}
                    />
                  </label>
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest">Birth Certificate Scan</label>
                <label className="flex items-center justify-center p-4 border-2 border-dashed border-gray-100 rounded-2xl cursor-pointer hover:bg-gray-50 transition-all">
                  {driverVerification.birthCertUrl ? (
                    <div className="flex items-center gap-2 text-green-500 font-bold text-xs">
                      <CheckCircle2 className="w-5 h-5" />
                      Document Uploaded
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-gray-400 font-bold text-xs">
                      <Plus className="w-5 h-5" />
                      Select Birth Certificate
                    </div>
                  )}
                  <input 
                    type="file" 
                    className="hidden" 
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onloadend = () => setDriverVerification(prev => ({ ...prev, birthCertUrl: reader.result as string }));
                        reader.readAsDataURL(file);
                      }
                    }}
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Vehicle Plate</label>
                  <input
                    type="text"
                    value={vehicleInfo.plateNumber}
                    onChange={(e) => setVehicleInfo({...vehicleInfo, plateNumber: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                    placeholder="T 123 ABC"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Vehicle Type</label>
                  <select
                    value={vehicleInfo.type}
                    onChange={(e) => setVehicleInfo({...vehicleInfo, type: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all text-xs"
                  >
                    <option>Motorcycle</option>
                    <option>Bajaj</option>
                    <option>Small Car</option>
                    <option>Van</option>
                    <option>Truck</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Model</label>
                  <input
                    type="text"
                    value={vehicleInfo.model}
                    onChange={(e) => setVehicleInfo({...vehicleInfo, model: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                    placeholder="Suzuki Carry"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Color</label>
                  <input
                    type="text"
                    value={vehicleInfo.color}
                    onChange={(e) => setVehicleInfo({...vehicleInfo, color: e.target.value})}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                    placeholder="White"
                    required
                  />
                </div>
              </div>

              <div className="bg-orange-50 p-4 rounded-2xl border border-orange-100">
                <div className="flex items-center gap-2 text-orange-600 mb-2">
                  <CreditCard className="w-4 h-4" />
                  <span className="text-xs font-bold">Payout Account</span>
                </div>
                <div className="space-y-3">
                  <input
                    type="text"
                    value={bankAccount.bankName}
                    onChange={(e) => setBankAccount({...bankAccount, bankName: e.target.value})}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-gray-100 outline-none"
                    placeholder="Bank Name (e.g. CRDB, NMB)"
                    required
                  />
                  <input
                    type="text"
                    value={bankAccount.accountNumber}
                    onChange={(e) => setBankAccount({...bankAccount, accountNumber: e.target.value})}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-gray-100 outline-none"
                    placeholder="Account Number"
                    required
                  />
                </div>
                <p className="text-[10px] text-gray-400 mt-2 italic">This account will be charged if reported for theft or lost goods.</p>
              </div>
            </div>
          )}

          {error && (
            <div className="p-3 rounded-xl bg-red-50 text-red-600 text-xs font-medium flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 text-white py-4 rounded-xl font-bold hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-100 disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (isLogin ? 'Login' : 'Register')}
          </button>
        </form>

        <div className="mt-6">
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-100"></div>
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-2 text-gray-400 font-bold tracking-widest">Or continue with</span>
            </div>
          </div>

          <button
            onClick={handleGoogleLogin}
            className="mt-6 w-full flex items-center justify-center gap-3 px-4 py-3 border border-gray-200 rounded-xl font-bold text-gray-600 hover:bg-gray-50 transition-all"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            Google
          </button>
        </div>

        <p className="mt-8 text-center text-sm text-gray-500">
          {isLogin ? "Don't have an account?" : "Already have an account?"}
          <button
            onClick={() => setIsLogin(!isLogin)}
            className="ml-2 font-bold text-indigo-600 hover:text-indigo-700"
          >
            {isLogin ? 'Register' : 'Login'}
          </button>
        </p>
      </motion.div>
    </motion.div>
  );
};

const ProductForm = ({ 
  onClose, 
  onSave, 
  initialProduct,
  user
}: { 
  onClose: () => void; 
  onSave: (p: Partial<Product>) => Promise<void>;
  initialProduct?: Product;
  user: UserProfile | null;
}) => {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<Partial<Product>>(initialProduct || {
    title: '',
    description: '',
    price: 0,
    sourceCurrency: 'USD',
    image: '',
    gallery: [],
    category: 'General',
    status: 'pending',
    type: 'manual',
    markup: 0,
    features: [],
    variations: [],
    isVirtual: false,
    digitalFileUrl: ''
  });

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 500000) { // 500KB limit for base64 to be safe
        alert("Image is too large. Please select an image smaller than 500KB.");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData(prev => ({ ...prev, image: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleGalleryUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      Array.from(files).forEach((file: File) => {
        if (file.size > 500000) {
          alert(`Image ${file.name} is too large. Please select images smaller than 500KB.`);
          return;
        }
        const reader = new FileReader();
        reader.onloadend = () => {
          setFormData(prev => ({
            ...prev,
            gallery: [...(prev.gallery || []), reader.result as string]
          }));
        };
        reader.readAsDataURL(file);
      });
    }
  };

  const removeGalleryImage = (index: number) => {
    setFormData(prev => ({
      ...prev,
      gallery: (prev.gallery || []).filter((_, i) => i !== index)
    }));
  };

  const addVariation = () => {
    setFormData(prev => ({
      ...prev,
      variations: [...(prev.variations || []), { name: '', options: [] }]
    }));
  };

  const removeVariation = (index: number) => {
    setFormData(prev => ({
      ...prev,
      variations: (prev.variations || []).filter((_, i) => i !== index)
    }));
  };

  const updateVariationName = (index: number, name: string) => {
    setFormData(prev => {
      const newVariations = [...(prev.variations || [])];
      newVariations[index] = { ...newVariations[index], name };
      return { ...prev, variations: newVariations };
    });
  };

  const addOption = (vIndex: number) => {
    setFormData(prev => {
      const newVariations = [...(prev.variations || [])];
      newVariations[vIndex] = {
        ...newVariations[vIndex],
        options: [...newVariations[vIndex].options, { name: '' }]
      };
      return { ...prev, variations: newVariations };
    });
  };

  const removeOption = (vIndex: number, oIndex: number) => {
    setFormData(prev => {
      const newVariations = [...(prev.variations || [])];
      newVariations[vIndex] = {
        ...newVariations[vIndex],
        options: newVariations[vIndex].options.filter((_, i) => i !== oIndex)
      };
      return { ...prev, variations: newVariations };
    });
  };

  const updateOptionName = (vIndex: number, oIndex: number, name: string) => {
    setFormData(prev => {
      const newVariations = [...(prev.variations || [])];
      newVariations[vIndex].options[oIndex] = { ...newVariations[vIndex].options[oIndex], name };
      return { ...prev, variations: newVariations };
    });
  };

  const updateOptionPriceModifier = (vIndex: number, oIndex: number, priceModifier: number) => {
    setFormData(prev => {
      const newVariations = [...(prev.variations || [])];
      newVariations[vIndex].options[oIndex] = { ...newVariations[vIndex].options[oIndex], priceModifier };
      return { ...prev, variations: newVariations };
    });
  };

  const handleOptionImageUpload = (vIndex: number, oIndex: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 500000) {
        alert("Image is too large. Please select an image smaller than 500KB.");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData(prev => {
          const newVariations = [...(prev.variations || [])];
          newVariations[vIndex].options[oIndex] = { 
            ...newVariations[vIndex].options[oIndex], 
            image: reader.result as string 
          };
          return { ...prev, variations: newVariations };
        });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title || !formData.price || !formData.image) {
      alert("Please fill in all required fields (Title, Price, Image)");
      return;
    }
    setLoading(true);
    try {
      const dataToSave: Partial<Product> = {
        ...formData,
        sellerId: user?.uid,
        sellerName: user?.displayName || user?.email || 'Unknown Seller',
      };
      
      if (!initialProduct) {
        dataToSave.createdAt = new Date().toISOString();
      }

      await onSave(dataToSave);
      onClose();
    } catch (error) {
      console.error("Save failed:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-hidden shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-gray-100 flex justify-between items-center">
          <h2 className="text-xl font-bold text-gray-900">{initialProduct ? 'Edit Product' : 'List New Product'}</h2>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-900 transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-6">
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Product Title *</label>
              <input
                type="text"
                required
                value={formData.title}
                onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                placeholder="e.g. Vintage Leather Backpack"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Price *</label>
                <div className="relative">
                  <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="number"
                    required
                    step="0.01"
                    value={formData.price}
                    onChange={(e) => setFormData(prev => ({ ...prev, price: parseFloat(e.target.value) }))}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-10 pr-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                    placeholder="0.00"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Category</label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                >
                  <option value="Electronics">Electronics</option>
                  <option value="Fashion">Fashion</option>
                  <option value="Home">Home</option>
                  <option value="Beauty">Beauty</option>
                  <option value="Sports">Sports</option>
                  <option value="General">General</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Description</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all min-h-[100px]"
                placeholder="Tell buyers about your product..."
              />
            </div>

            <div className="pt-4 border-t border-gray-100 flex items-center justify-between">
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest">Virtual Good</label>
                <p className="text-[10px] text-gray-400 font-medium">Software, Music, Games, Beats, License Keys</p>
              </div>
              <button
                type="button"
                onClick={() => setFormData(prev => ({ ...prev, isVirtual: !prev.isVirtual }))}
                className={cn(
                  "w-12 h-6 rounded-full transition-all relative shrink-0",
                  formData.isVirtual ? "bg-indigo-600" : "bg-gray-200"
                )}
              >
                <div className={cn(
                  "absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-all",
                  formData.isVirtual ? "left-7" : "left-1"
                )} />
              </button>
            </div>

            {formData.isVirtual && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="space-y-4"
              >
                <div className="relative">
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Digital Delivery Link / Asset URL *</label>
                  <div className="relative">
                    <LinkIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="url"
                      required={formData.isVirtual}
                      value={formData.digitalFileUrl}
                      onChange={(e) => setFormData(prev => ({ ...prev, digitalFileUrl: e.target.value }))}
                      className="w-full bg-indigo-50 border border-indigo-200 rounded-xl pl-10 pr-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm font-mono"
                      placeholder="https://example.com/download/asset.zip"
                    />
                  </div>
                  <p className="text-[10px] text-indigo-400 italic mt-2">SECURE: This link is encrypted and only revealed to customers after verified payment.</p>
                </div>
              </motion.div>
            )}

            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Product Image *</label>
              <div className="flex items-center gap-4">
                <div className="w-24 h-24 rounded-2xl bg-gray-50 border-2 border-dashed border-gray-200 flex items-center justify-center overflow-hidden relative group">
                  {formData.image ? (
                    <>
                      <img src={formData.image} alt={`${formData.title || 'Product'} preview image`} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <Plus className="w-6 h-6 text-white" />
                      </div>
                    </>
                  ) : (
                    <Plus className="w-6 h-6 text-gray-300" />
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                </div>
                <div className="flex-1 text-xs text-gray-400">
                  <p className="font-bold text-gray-500 mb-1">Upload a high-quality photo</p>
                  <p>Max size: 500KB. This image will be the first thing buyers see.</p>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Product Gallery</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {(formData.gallery || []).map((img, index) => (
                  <div key={index} className="aspect-square rounded-2xl bg-gray-50 border border-gray-200 flex items-center justify-center overflow-hidden relative group">
                    <img src={img} alt={`Gallery image ${index + 1}`} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    <button
                      type="button"
                      onClick={() => removeGalleryImage(index)}
                      className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                <div className="aspect-square rounded-2xl bg-gray-50 border-2 border-dashed border-gray-200 flex items-center justify-center overflow-hidden relative group hover:border-indigo-300 transition-colors">
                  <Plus className="w-6 h-6 text-gray-300 group-hover:text-indigo-400 transition-colors" />
                  <input
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={handleGalleryUpload}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                </div>
              </div>
              <p className="text-[10px] text-gray-400 mt-2">Add more photos to showcase different angles or variations. Max 500KB per image.</p>
            </div>

            <div className="pt-4 border-t border-gray-100">
              <div className="flex items-center justify-between mb-4">
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest">Product Variations</label>
                <button
                  type="button"
                  onClick={addVariation}
                  className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-lg hover:bg-indigo-100 transition-colors flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" />
                  Add Variation
                </button>
              </div>
              
              <div className="space-y-6">
                {(formData.variations || []).map((variation, vIndex) => (
                  <div key={vIndex} className="bg-gray-50 rounded-2xl p-4 border border-gray-100 relative">
                    <button
                      type="button"
                      onClick={() => removeVariation(vIndex)}
                      className="absolute top-4 right-4 text-gray-400 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    
                    <div className="mb-4">
                      <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Variation Name</label>
                      <input
                        type="text"
                        value={variation.name}
                        onChange={(e) => updateVariationName(vIndex, e.target.value)}
                        placeholder="e.g. Color, Size, Material"
                        className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                      />
                    </div>

                    <div className="space-y-3">
                      <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider">Options</label>
                      <div className="grid grid-cols-1 gap-2">
                        {variation.options.map((option, oIndex) => (
                          <div key={oIndex} className="flex items-center gap-3 bg-white p-2 rounded-xl border border-gray-100">
                            <div className="w-10 h-10 rounded-lg bg-gray-50 border border-gray-200 flex items-center justify-center overflow-hidden relative group shrink-0">
                              {option.image ? (
                                <img src={option.image} alt={`${option.name} option image`} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                              ) : (
                                <Plus className="w-4 h-4 text-gray-300" />
                              )}
                              <input
                                type="file"
                                accept="image/*"
                                onChange={(e) => handleOptionImageUpload(vIndex, oIndex, e)}
                                className="absolute inset-0 opacity-0 cursor-pointer"
                              />
                            </div>
                            <input
                              type="text"
                              value={option.name}
                              onChange={(e) => updateOptionName(vIndex, oIndex, e.target.value)}
                              placeholder="Option name (e.g. Red, Large)"
                              className="flex-1 bg-transparent border-none outline-none text-sm min-w-0"
                            />
                            <div className="flex items-center gap-1 bg-gray-50 px-2 py-1 rounded-lg border border-gray-100 shrink-0">
                               <Plus className="w-2.5 h-2.5 text-indigo-500" />
                               <input 
                                 type="number"
                                 step="0.01"
                                 value={option.priceModifier || 0}
                                 onChange={(e) => updateOptionPriceModifier(vIndex, oIndex, parseFloat(e.target.value) || 0)}
                                 className="w-16 bg-transparent border-none outline-none text-[10px] font-bold text-gray-900"
                                 placeholder="Price +"
                               />
                               <span className="text-[9px] font-bold text-gray-400">{formData.sourceCurrency}</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => removeOption(vIndex, oIndex)}
                              className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() => addOption(vIndex)}
                          className="w-full py-2 border-2 border-dashed border-gray-200 rounded-xl text-[10px] font-bold text-gray-400 hover:border-indigo-300 hover:text-indigo-500 transition-all flex items-center justify-center gap-1"
                        >
                          <Plus className="w-3 h-3" />
                          Add Option
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                {(formData.variations || []).length === 0 && (
                  <div className="text-center py-8 border-2 border-dashed border-gray-100 rounded-2xl">
                    <p className="text-xs text-gray-400">No variations added yet. Add things like Color or Size.</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-gray-100 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-6 py-3 rounded-xl font-bold text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-indigo-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
              {initialProduct ? 'Update Listing' : 'Publish Product'}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
};

const OrderStatusTracker = ({ order }: { order: Order }) => {
  const stages = [
    { key: 'paid', label: 'Processing', icon: Clock },
    { key: 'shipped', label: 'Shipped', icon: Plane },
    { key: 'picked_up', label: 'Out for Delivery', icon: Truck },
    { key: 'delivered', label: 'Delivered', icon: CheckCircle2 },
  ];

  const currentStatus = order.status;
  const statusHistory = order.automationLog || [];

  const getStageStatus = (stageKey: string) => {
    const statusOrder = ['pending', 'paid', 'fulfilled', 'shipped', 'awaiting_pickup', 'picked_up', 'delivered'];
    const currentIndex = statusOrder.indexOf(currentStatus === 'reported' ? 'picked_up' : currentStatus);
    const stageIndex = statusOrder.indexOf(stageKey);

    if (currentStatus === 'delivered' && stageKey === 'delivered') return 'completed';
    if (stageIndex < currentIndex) return 'completed';
    if (stageKey === currentStatus || (stageKey === 'paid' && currentStatus === 'fulfilled') || (stageKey === 'picked_up' && currentStatus === 'shipped' && order.deliveryDetails?.driverId)) return 'current';
    return 'pending';
  };

  const getStageDate = (stageKey: string) => {
    if (stageKey === 'paid' && order.createdAt) return new Date(order.createdAt).toLocaleDateString();
    if (stageKey === 'shipped' && order.fulfillmentDetails?.shippedAt) return new Date(order.fulfillmentDetails.shippedAt).toLocaleDateString();
    if (stageKey === 'picked_up' && order.deliveryDetails?.pickedUpAt) return new Date(order.deliveryDetails.pickedUpAt).toLocaleDateString();
    if (stageKey === 'delivered' && order.deliveryDetails?.deliveredAt) return new Date(order.deliveryDetails.deliveredAt).toLocaleDateString();
    return null;
  };

  return (
    <div className="relative flex justify-between w-full mt-8 mb-12 px-2">
      {/* Background Line */}
      <div className="absolute top-5 left-0 w-full h-0.5 bg-gray-100 -z-10" />
      
      {stages.map((stage, i) => {
        const state = getStageStatus(stage.key);
        const date = getStageDate(stage.key);
        const Icon = stage.icon;

        return (
          <div key={i} className="flex flex-col items-center gap-2 relative">
            <div className={cn(
              "w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-500",
              state === 'completed' ? "bg-green-500 border-green-500 text-white shadow-lg shadow-green-100" :
              state === 'current' ? "bg-white border-indigo-600 text-indigo-600 shadow-lg shadow-indigo-100 animate-pulse" :
              "bg-white border-gray-200 text-gray-300"
            )}>
              <Icon className="w-5 h-5" />
            </div>
            <div className="text-center min-w-[80px]">
              <div className={cn(
                "text-[10px] font-bold uppercase tracking-wider mb-0.5",
                state === 'completed' ? "text-green-600" : state === 'current' ? "text-indigo-600" : "text-gray-400"
              )}>
                {stage.label}
              </div>
              {date && (
                <div className="text-[9px] text-gray-400 font-medium">{date}</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

const CustomerDashboard = ({ 
  user, 
  orders, 
  currency, 
  rates,
  reportDriver,
  releaseFunds,
  updateOrder,
  isInstallable,
  installApp,
  updateProfile
}: { 
  user: UserProfile | null; 
  orders: Order[];
  currency: string;
  rates: ExchangeRates;
  reportDriver: (orderId: string, notes: string) => Promise<void>;
  releaseFunds: (orderId: string) => Promise<void>;
  updateOrder: (orderId: string, data: Partial<Order>) => Promise<void>;
  isInstallable?: boolean;
  installApp?: () => Promise<void>;
  updateProfile: (data: Partial<UserProfile>) => Promise<void>;
}) => {
  const [viewingPoliceReport, setViewingPoliceReport] = useState<Order | null>(null);
  const [scanningForOrder, setScanningForOrder] = useState<Order | null>(null);
  const [tab, setTab] = useState<'orders' | 'plans'>('orders');
  const myOrders = orders.filter(o => o.buyerId === user?.uid);

  const handleScan = (data: string) => {
    try {
      const parsed = JSON.parse(data);
      if (scanningForOrder && parsed.orderId === scanningForOrder.id && parsed.code === scanningForOrder.confirmationCode) {
        setScanningForOrder(null);
        releaseFunds(scanningForOrder.id);
      } else {
        alert("Invalid QR code or wrong order. Please try again.");
      }
    } catch (e) {
      // If it's not JSON, maybe it's just the manual code
      if (scanningForOrder && data === scanningForOrder.confirmationCode) {
        setScanningForOrder(null);
        releaseFunds(scanningForOrder.id);
      } else {
        alert("Verification failed. Please ensure you scan the driver's QR code.");
      }
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-12 pb-32 sm:pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight mb-2">My Dashboard</h1>
          <p className="text-gray-500">Track your deliveries and manage your memberships.</p>
        </div>

        <div className="flex items-center gap-3">
          <button 
            onClick={() => setTab(p => p === 'orders' ? 'plans' : 'orders')}
            className={cn(
              "px-6 py-3 rounded-2xl font-bold flex items-center gap-2 transition-all",
              tab === 'plans' ? "bg-indigo-600 text-white shadow-lg" : "border-2 border-indigo-600 text-indigo-600 hover:bg-indigo-50"
            )}
          >
            <Zap className="w-5 h-5" />
            {tab === 'plans' ? 'View Orders' : 'Upgrade Account'}
          </button>
          {isInstallable && (
            <button 
              onClick={installApp}
              className="flex items-center gap-3 bg-gray-900 text-white px-6 py-3 rounded-2xl font-bold shadow-lg hover:bg-black transition-all active:scale-95 text-sm"
            >
              <Smartphone className="w-5 h-5" />
              App
            </button>
          )}
        </div>
      </div>

      {tab === 'plans' && user && (
        <div className="mt-8">
          <UpgradeSection user={user} updateProfile={updateProfile} />
        </div>
      )}

      {tab === 'orders' && (
        <div className="space-y-6 mt-8">
        {myOrders.length === 0 ? (
          <div className="text-center py-20 bg-gray-50 rounded-3xl border-2 border-dashed border-gray-200">
            <Package className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 font-medium">You haven't placed any orders yet.</p>
            <Link to="/" className="text-indigo-600 font-bold mt-4 inline-block">Start Shopping</Link>
          </div>
        ) : (
          myOrders.map(order => (
            <div key={order.id} className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-gray-50 bg-gray-50/50 flex flex-col sm:flex-row justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm text-indigo-600">
                    <Package className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Order ID</div>
                    <div className="font-mono text-sm font-bold text-gray-900">{order.id}</div>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <div>
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest text-right">Placed On</div>
                    <div className="text-sm font-bold text-gray-900">{new Date(order.createdAt).toLocaleDateString()}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest text-right">Total</div>
                    <div className="text-sm font-bold text-indigo-600">{formatPrice(order.total, order.currency, rates)}</div>
                  </div>
                </div>
              </div>

              <div className="p-6">
                <div className="mb-8">
                  {order.status !== 'pending' && order.status !== 'delivered' && order.status !== 'cancelled' && (
                    <div className="mb-8 space-y-4">
                       <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                         <div className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse" />
                         Live Tracking
                       </h3>
                       <TrackingMap order={order} />
                    </div>
                  )}
                  <OrderStatusTracker order={order} />
                </div>

                <div className="flex flex-col md:flex-row gap-8">
                  <div className="flex-1 space-y-4">
                    <h3 className="font-bold text-gray-900">Items</h3>
                    <div className="space-y-3">
                      {order.items.map((item, i) => (
                        <div key={i} className="flex items-center gap-3">
                          <img src={item.image} className="w-12 h-12 rounded-lg object-cover" referrerPolicy="no-referrer" />
                          <div>
                            <div className="text-sm font-bold text-gray-900">{item.title}</div>
                            <div className="text-xs text-gray-500">Qty: {item.quantity}</div>
                            {item.isVirtual && (order.status === 'paid' || order.status === 'delivered') && (
                              <a 
                                href={item.digitalFileUrl} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="mt-1 flex items-center gap-1 text-[10px] bg-green-50 text-green-600 px-2 py-0.5 rounded border border-green-200 hover:bg-green-100 transition-colors w-fit font-bold"
                              >
                                <Download className="w-3 h-3" />
                                Download Access File
                              </a>
                            )}
                            {item.isVirtual && order.status !== 'paid' && order.status !== 'delivered' && (
                              <div className="mt-1 text-[9px] text-orange-400 italic flex items-center gap-1">
                                <Lock className="w-2.5 h-2.5" />
                                Link revealed after payment
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex-1 space-y-4">
                    <h3 className="font-bold text-gray-900">Delivery Status</h3>
                    <div className="space-y-4">
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "w-4 h-4 rounded-full flex items-center justify-center",
                          order.status === 'delivered' ? "bg-green-100 text-green-600" : "bg-indigo-100 text-indigo-600 animate-pulse"
                        )}>
                          {order.status === 'delivered' ? <Check className="w-2 h-2" /> : <div className="w-1.5 h-1.5 rounded-full bg-current" />}
                        </div>
                        <span className="text-sm font-bold capitalize">{order.status.replace('_', ' ')}</span>
                      </div>

                      {order.status === 'awaiting_payment' && (
                        <div className="bg-yellow-50 p-6 rounded-3xl border border-yellow-100 space-y-4">
                          <div className="flex justify-between items-center pb-3 border-b border-yellow-200/50">
                            <span className="text-xs font-bold text-yellow-700 uppercase tracking-widest">Delivery Fee</span>
                            <span className="text-sm font-black text-gray-900">{formatPrice(order.deliveryDetails?.deliveryFee || 0, 'TZS', rates, 'TZS')}</span>
                          </div>
                          <div className="flex justify-between items-center font-black text-lg">
                            <span className="text-[10px] text-gray-500 uppercase">Final Total</span>
                            <span className="text-indigo-600">{formatPrice(order.total, order.currency, rates)}</span>
                          </div>
                          <button
                            onClick={() => {
                              updateOrder(order.id, {
                                status: 'paid',
                                automationLog: [
                                  ...(order.automationLog || []),
                                  `[FINANCE] Customer approved delivery quote. Payment confirmed.`,
                                  `[SYSTEM] Funds moving to Escrow holding unit (DropShip Pro).`
                                ]
                              });
                              alert("Payment confirmed! The driver has been notified to proceed with the delivery.");
                            }}
                            className="w-full bg-gray-900 text-white py-4 rounded-2xl font-bold hover:bg-indigo-600 transition-all shadow-xl shadow-gray-200"
                          >
                            Approve & Pay Bill
                          </button>
                          <p className="text-[9px] text-yellow-600 text-center italic">Calculated based on {order.deliveryDetails?.distanceKm?.toFixed(1)}km distance from driver to store to your location.</p>
                        </div>
                      )}

                      {order.deliveryDetails?.driverName && (
                        <div className="p-4 bg-indigo-50 rounded-2xl border border-indigo-100">
                          <div className="flex items-center gap-3 mb-2">
                             <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-indigo-600">
                               <Truck className="w-4 h-4" />
                             </div>
                             <div>
                               <div className="text-[10px] font-bold text-indigo-500 uppercase">Your Driver</div>
                               <div className="text-sm font-bold text-indigo-900">{order.deliveryDetails.driverName}</div>
                             </div>
                          </div>
                          {(order.status === 'shipped' || order.status === 'picked_up') && (
                            <div className="space-y-4">
                              {order.status === 'picked_up' && (
                                <button
                                  onClick={() => setScanningForOrder(order)}
                                  className="w-full bg-green-600 text-white py-3 rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-green-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-green-100 ring-2 ring-green-50"
                                >
                                  <ShieldCheck className="w-4 h-4" />
                                  Scan Driver QR to Confirm
                                </button>
                              )}
                              
                              <button 
                                onClick={() => {
                                  const notes = prompt("Describe the delivery issue (e.g., driver reached destination but goods missing):");
                                  if (notes) reportDriver(order.id, notes);
                                }}
                                className="w-full bg-red-50 text-red-600 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-red-100 transition-all flex items-center justify-center gap-2"
                              >
                                <ShieldCheck className="w-3 h-3" />
                                Report Theft / Loss
                              </button>
                            </div>
                          )}
                          {order.status === 'reported' && (
                            <div className="mt-4 p-3 bg-red-100 rounded-xl border border-red-200">
                              <div className="flex items-center gap-2 text-red-600 font-bold text-xs uppercase mb-1">
                                <AlertCircle className="w-3 h-3" /> Reported to Police
                              </div>
                              <p className="text-[9px] text-red-500 leading-tight">Authorities have been notified with driver NIDA & Vehicle records. Penalty applied.</p>
                              <button 
                                onClick={() => setViewingPoliceReport(order)}
                                className="mt-2 w-full text-[9px] font-bold bg-red-600 text-white py-1.5 rounded-lg flex items-center justify-center gap-1"
                              >
                                <ShieldCheck className="w-3 h-3" /> View Incident Report
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
        </div>
      )}

      {viewingPoliceReport && (
        <PoliceReportModal 
          order={viewingPoliceReport}
          onClose={() => setViewingPoliceReport(null)}
          currency={currency}
          rates={rates}
        />
      )}

      {scanningForOrder && (
        <QRScannerModal 
          onScan={handleScan}
          onClose={() => setScanningForOrder(null)}
        />
      )}
    </div>
  );
};

const SellerDashboard = ({ 
  user, 
  products, 
  orders,
  currency,
  rates,
  updateProfile
}: { 
  user: UserProfile | null; 
  products: Product[]; 
  orders: Order[];
  currency: string;
  rates: ExchangeRates;
  updateProfile: (data: Partial<UserProfile>) => Promise<void>;
}) => {
  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | undefined>();
  const [tab, setTab] = useState<'listings' | 'orders' | 'plans'>('listings');

  const sellerProducts = products.filter(p => p.sellerId === user?.uid);
  const sellerOrders = orders.filter(o => o.items.some(item => item.sellerId === user?.uid));

  const totalSales = sellerOrders.reduce((sum, o) => sum + o.total, 0);
  const pendingOrders = sellerOrders.filter(o => o.status === 'paid').length;

  const handleConfirmAvailability = async (orderId: string) => {
    try {
      await updateDoc(doc(db, 'orders', orderId), { 
        status: 'availability_confirmed',
        automationLog: arrayUnion(`[SUPPLIER] Availability confirmed. Order is now ready for driver pickup.`)
      });
      alert("Availability confirmed! Nearby drivers will be notified.");
    } catch (error) {
      console.error("Failed to confirm availability:", error);
    }
  };

  const handleSaveProduct = async (p: Partial<Product>) => {
    try {
      if (editingProduct) {
        await updateDoc(doc(db, 'products', editingProduct.id), p);
      } else {
        const id = Math.random().toString(36).substring(2, 15);
        await setDoc(doc(db, 'products', id), { ...p, id });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'products');
    }
  };

  const handleDeleteProduct = async (id: string) => {
    if (confirm("Are you sure you want to delete this listing?")) {
      try {
        await deleteDoc(doc(db, 'products', id));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, 'products');
      }
    }
  };

  if (tab === 'plans' && user) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <button onClick={() => setTab('listings')} className="mb-8 flex items-center gap-2 text-gray-500 font-bold hover:text-gray-900 transition-colors">
          <ChevronLeft className="w-4 h-4" /> Back to Dashboard
        </button>
        <UpgradeSection user={user} updateProfile={updateProfile} />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-12">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Seller Dashboard</h1>
            {user?.membership?.tier && user.membership.tier !== 'basic' && (
              <span className="bg-amber-100 text-amber-600 text-[10px] px-3 py-1 rounded-full font-bold uppercase tracking-wider">
                {user.membership.tier} MEMBER
              </span>
            )}
          </div>
          <p className="text-gray-500">Manage your products, track sales, and grow your business.</p>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setTab('plans')}
            className="px-6 py-3 rounded-2xl font-bold border-2 border-indigo-600 text-indigo-600 hover:bg-indigo-50 transition-all flex items-center gap-2"
          >
            <Crown className="w-5 h-5" />
            Plans
          </button>
          <button 
            onClick={() => {
              setEditingProduct(undefined);
              setShowForm(true);
            }}
            className="bg-indigo-600 text-white px-6 py-3 rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            List New Product
          </button>
        </div>
      </div>

        <div className="flex bg-gray-100 p-1 rounded-xl overflow-x-auto scrollbar-hide">
          <button 
            onClick={() => setTab('listings')}
            className={cn("px-4 py-1.5 rounded-lg text-xs font-bold transition-all", tab === 'listings' ? "bg-white text-indigo-600 shadow-sm" : "text-gray-500")}
          >
            Listings
          </button>
          <button 
            onClick={() => setTab('orders')}
            className={cn("px-4 py-1.5 rounded-lg text-xs font-bold transition-all", tab === 'orders' ? "bg-white text-indigo-600 shadow-sm" : "text-gray-500")}
          >
            Orders ({sellerOrders.length})
          </button>
          <button 
            onClick={() => setTab('plans')}
            className={cn("px-4 py-1.5 rounded-lg text-xs font-bold transition-all", tab === 'plans' ? "bg-white text-indigo-600 shadow-sm" : "text-gray-500")}
          >
            Plans
          </button>
        </div>

      {tab === 'listings' && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12 text-left">
            <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
              <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600 mb-4">
                <DollarSign className="w-6 h-6" />
              </div>
              <div className="text-2xl font-bold text-gray-900">{formatPrice(totalSales, currency, rates)}</div>
              <div className="text-xs font-bold text-gray-400 uppercase tracking-widest">Total Revenue</div>
            </div>
            <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
              <div className="w-12 h-12 bg-orange-50 rounded-2xl flex items-center justify-center text-orange-600 mb-4">
                <Clock className="w-6 h-6" />
              </div>
              <div className="text-2xl font-bold text-gray-900">{pendingOrders}</div>
              <div className="text-xs font-bold text-gray-400 uppercase tracking-widest">Pending Confirmation</div>
            </div>
            <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
              <div className="w-12 h-12 bg-green-50 rounded-2xl flex items-center justify-center text-green-600 mb-4">
                <Package className="w-6 h-6" />
              </div>
              <div className="text-2xl font-bold text-gray-900">{sellerProducts.length}</div>
              <div className="text-xs font-bold text-gray-400 uppercase tracking-widest">Active Listings</div>
            </div>
          </div>

          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden text-left">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center">
              <h2 className="text-lg font-bold text-gray-900">Your Listings</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Product</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Price</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Status</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {sellerProducts.map(product => (
                    <tr key={product.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-4">
                          <img src={product.image} alt={`${product.title} thumbnail`} className="w-12 h-12 rounded-xl object-cover" referrerPolicy="no-referrer" />
                          <div>
                            <div className="text-sm font-bold text-gray-900">{product.title}</div>
                            <div className="text-[10px] text-gray-400">{product.category}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm font-bold text-indigo-600">
                          {formatPrice(product.price, currency, rates, product.sourceCurrency)}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={cn(
                          "text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wider",
                          product.status === 'approved' ? "bg-green-50 text-green-600" : "bg-orange-50 text-orange-600"
                        )}>
                          {product.status}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={() => {
                              setEditingProduct(product);
                              setShowForm(true);
                            }}
                            className="p-2 text-gray-400 hover:text-indigo-600 transition-colors"
                          >
                            <Settings className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => handleDeleteProduct(product.id)}
                            className="p-2 text-gray-400 hover:text-red-600 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {sellerProducts.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-6 py-12 text-center text-gray-400 italic">
                        No listings yet. Start selling today!
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {tab === 'orders' && (
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden text-left">
          <div className="p-6 border-b border-gray-100">
            <h2 className="text-lg font-bold text-gray-900">Your Orders</h2>
            <p className="text-xs text-gray-500">Confirm availability to trigger driver assignment.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Order ID</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Items</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Customer Location</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Status</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sellerOrders.map(order => (
                  <tr key={order.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="text-sm font-mono font-bold text-gray-400">#{order.id.slice(0, 8)}</div>
                      <div className="text-[10px] text-gray-400">{new Date(order.createdAt).toLocaleDateString()}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="space-y-1">
                        {order.items.filter(i => i.sellerId === user?.uid).map((item, i) => (
                          <div key={i} className="text-xs font-bold text-gray-800">
                            {item.quantity}x {item.title}
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-xs font-bold text-gray-900">{order.customer.city}</div>
                      <div className="text-[10px] text-gray-500 truncate w-32">{order.customer.address}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        "text-[9px] font-bold px-2 py-1 rounded-full uppercase tracking-wider",
                        order.status === 'paid' ? "bg-blue-100 text-blue-600" :
                        order.status === 'availability_confirmed' ? "bg-green-100 text-green-600" :
                        "bg-gray-100 text-gray-500"
                      )}>
                        {order.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      {order.status === 'paid' && (
                        <button 
                          onClick={() => handleConfirmAvailability(order.id)}
                          className="bg-green-600 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-green-700 transition-all"
                        >
                          Confirm Availability
                        </button>
                      )}
                      {order.status === 'availability_confirmed' && (
                        <div className="text-xs font-bold text-indigo-600 flex items-center justify-end gap-1">
                          <Truck className="w-3 h-3" />
                          Awaiting Driver
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {sellerOrders.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-gray-400 italic">
                      No orders matching your listings yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <AnimatePresence>
        {showForm && (
          <ProductForm 
            user={user}
            onClose={() => setShowForm(false)}
            onSave={handleSaveProduct}
            initialProduct={editingProduct}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

const Navbar = ({ 
  cart, 
  isAdmin, 
  isSeller,
  isDriver,
  currency, 
  setCurrency, 
  rates,
  user,
  setShowAuthModal,
  isInstallable,
  installApp
}: { 
  cart: CartItem[]; 
  isAdmin: boolean;
  isSeller: boolean;
  isDriver: boolean;
  currency: string;
  setCurrency: (c: string) => void;
  rates: ExchangeRates;
  user: User | null;
  setShowAuthModal: (show: boolean) => void;
  isInstallable?: boolean;
  installApp?: () => Promise<void>;
}) => {
  const [isCartHovered, setIsCartHovered] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const cartCount = cart.reduce((s, i) => s + i.quantity, 0);
  const cartTotal = cart.reduce((s, i) => {
    const finalPrice = (i.price * (1 + i.markup / 100)) / (rates[i.sourceCurrency] || 1);
    return s + (finalPrice * i.quantity);
  }, 0);

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  const becomeSeller = async () => {
    if (!user) {
      setShowAuthModal(true);
      return;
    }
    try {
      await updateDoc(doc(db, 'users', user.uid), { role: 'seller' });
      alert("Congratulations! You are now a seller. You can access your Seller Dashboard from the menu.");
    } catch (error) {
      console.error("Failed to become seller:", error);
    }
  };

  return (
    <nav className="border-b border-gray-200 bg-white sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          <Link to="/" className="flex items-center gap-2">
            <Package className="w-8 h-8 text-indigo-600" />
            <span className="text-lg sm:text-xl font-bold tracking-tight text-gray-900 truncate max-w-[150px] sm:max-w-none">Dropship Pro Alpha</span>
          </Link>
          {/* Desktop Menu */}
          <div className="hidden lg:flex items-center gap-6">
            <select 
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="text-xs font-bold bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {Object.keys(rates).length > 0 ? (
                Object.keys(rates).sort().map(c => (
                  <option key={c} value={c}>{c}</option>
                ))
              ) : (
                <option value="USD">USD</option>
              )}
            </select>
            <Link to="/" className="text-sm font-medium text-gray-600 hover:text-indigo-600 transition-colors">Store</Link>
            
            {isAdmin && (
              <Link to="/admin" className="text-sm font-medium text-gray-600 hover:text-indigo-600 transition-colors">Merchant Portal</Link>
            )}

            {isDriver && (
              <Link to="/driver" className="text-sm font-medium text-green-600 hover:text-green-700 transition-colors flex items-center gap-1">
                <Truck className="w-4 h-4" />
                Driver Portal
              </Link>
            )}

            {isSeller && (
              <Link to="/seller" className="text-sm font-medium text-indigo-600 hover:text-indigo-700 transition-colors flex items-center gap-1">
                <Store className="w-4 h-4" />
                Seller Dashboard
              </Link>
            )}

            {user && (
              <Link to="/referrals" className="text-sm font-medium text-indigo-600 hover:text-indigo-700 transition-colors flex items-center gap-1">
                <Gift className="w-4 h-4" />
                Invite & Earn
              </Link>
            )}

            {isInstallable && (
              <button 
                onClick={installApp}
                className="flex items-center gap-2 text-sm font-bold bg-indigo-600 text-white px-4 py-2 rounded-xl shadow-lg hover:bg-gray-900 transition-all active:scale-95"
              >
                <Smartphone className="w-4 h-4" />
                <span>App</span>
              </button>
            )}

            {user && (
              <Link to="/dashboard" className="text-sm font-medium text-gray-600 hover:text-indigo-600 transition-colors flex items-center gap-1">
                <Package className="w-4 h-4" />
                My Orders
              </Link>
            )}

            {!isAdmin && !isSeller && (
              <button 
                onClick={becomeSeller}
                className="text-sm font-medium text-gray-600 hover:text-indigo-600 transition-colors"
              >
                Sell on Dropship Pro
              </button>
            )}
            
            {user ? (
              <div className="flex items-center gap-3">
                {user.photoURL ? (
                  <img 
                    src={user.photoURL || null} 
                    alt={`${user.displayName || 'User'} profile photo`} 
                    className="w-8 h-8 rounded-full border border-gray-200" 
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-xs">
                    {user.displayName?.charAt(0) || user.email?.charAt(0) || '?'}
                  </div>
                )}
                <div className="hidden md:block">
                  <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Logged in as</div>
                  <div className="text-xs font-bold text-gray-900 truncate max-w-[100px]">{user.displayName || user.email}</div>
                </div>
                <button 
                  onClick={handleLogout}
                  className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-red-600 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="hidden sm:inline">Logout</span>
                </button>
              </div>
            ) : (
              <button 
                onClick={() => setShowAuthModal(true)}
                className="flex items-center gap-2 text-sm font-bold text-indigo-600 hover:text-indigo-700 transition-colors bg-indigo-50 px-4 py-2 rounded-xl"
              >
                <LogIn className="w-4 h-4" />
                <span>Login / Register</span>
              </button>
            )}

            {!isAdmin && (
              <div 
                className="relative"
                onMouseEnter={() => setIsCartHovered(true)}
                onMouseLeave={() => setIsCartHovered(false)}
              >
                <Link to="/cart" className="relative p-2 text-gray-600 hover:text-indigo-600 transition-colors block">
                  <ShoppingCart className="w-6 h-6" />
                  {cartCount > 0 && (
                    <span className="absolute top-0 right-0 bg-indigo-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                      {cartCount}
                    </span>
                  )}
                </Link>

                <AnimatePresence>
                  {isCartHovered && (
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      className="absolute right-0 mt-2 w-80 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden z-[60]"
                    >
                      <div className="p-4 border-b border-gray-50 bg-gray-50/50">
                        <div className="flex items-center justify-between">
                          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Your Cart</h3>
                          <span className="text-[10px] font-bold bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full">
                            {cartCount} {cartCount === 1 ? 'Item' : 'Items'}
                          </span>
                        </div>
                      </div>

                      <div className="max-h-64 overflow-y-auto p-4 space-y-4">
                        {cart.length === 0 ? (
                          <div className="text-center py-8">
                            <ShoppingCart className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                            <p className="text-xs text-gray-400 font-medium">Your cart is empty</p>
                          </div>
                        ) : (
                          cart.slice(0, 3).map((item) => (
                            <div key={item.cartId} className="flex gap-3">
                              <div className="w-12 h-12 rounded-lg overflow-hidden bg-gray-50 shrink-0 border border-gray-100">
                                <img 
                                  src={item.image} 
                                  alt={`${item.title} cart thumbnail`} 
                                  className="w-full h-full object-cover"
                                  referrerPolicy="no-referrer"
                                />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-xs font-bold text-gray-900 truncate">{item.title}</div>
                                <div className="text-[10px] text-gray-500 mt-0.5">Qty: {item.quantity}</div>
                                <div className="text-[10px] font-bold text-indigo-600 mt-0.5">
                                  {formatPrice(item.price * (1 + item.markup / 100), currency, rates, item.sourceCurrency)}
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                        {cart.length > 3 && (
                          <div className="text-[10px] text-center text-gray-400 font-medium pt-2 border-t border-gray-50">
                            + {cart.length - 3} more items
                          </div>
                        )}
                      </div>

                      <div className="p-4 bg-gray-50 border-t border-gray-100">
                        <div className="flex items-center justify-between mb-4">
                          <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">Subtotal</span>
                          <span className="text-sm font-bold text-gray-900">
                            {formatPrice(cartTotal, currency, rates, 'USD')}
                          </span>
                        </div>
                        <Link 
                          to="/cart"
                          className="block w-full bg-indigo-600 text-white text-center py-3 rounded-xl text-xs font-bold hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-100"
                        >
                          View Full Cart
                        </Link>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>

          {/* Mobile Menu Toggle */}
          <div className="flex lg:hidden items-center gap-4">
            {!isAdmin && (
              <Link to="/cart" className="relative p-2 text-gray-600 hover:text-indigo-600 transition-colors">
                <ShoppingCart className="w-6 h-6" />
                {cartCount > 0 && (
                  <span className="absolute top-0 right-0 bg-indigo-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                    {cartCount}
                  </span>
                )}
              </Link>
            )}
            <button 
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="p-2 text-gray-600 hover:text-indigo-600 transition-colors"
            >
              {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu Content */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="lg:hidden border-t border-gray-100 bg-white overflow-hidden"
          >
            <div className="px-4 py-6 space-y-6">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-gray-400 uppercase tracking-widest">Currency</span>
                <select 
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="text-xs font-bold bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 outline-none"
                >
                  {Object.keys(rates).length > 0 ? (
                    Object.keys(rates).sort().map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))
                  ) : (
                    <option value="USD">USD</option>
                  )}
                </select>
              </div>

              <div className="space-y-4">
                <Link to="/" onClick={() => setIsMobileMenuOpen(false)} className="block text-lg font-bold text-gray-900 hover:text-indigo-600">Store</Link>
                
                {isAdmin && (
                  <Link to="/admin" onClick={() => setIsMobileMenuOpen(false)} className="block text-lg font-bold text-gray-900 hover:text-indigo-600">Merchant Portal</Link>
                )}

                {isDriver && (
                  <Link to="/driver" onClick={() => setIsMobileMenuOpen(false)} className="block text-lg font-bold text-green-600 hover:text-green-700 flex items-center gap-2">
                    <Truck className="w-5 h-5" />
                    Driver Portal
                  </Link>
                )}

                {isSeller && (
                  <Link to="/seller" onClick={() => setIsMobileMenuOpen(false)} className="block text-lg font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-2">
                    <Store className="w-5 h-5" />
                    Seller Dashboard
                  </Link>
                )}

                {user && (
                  <Link to="/referrals" onClick={() => setIsMobileMenuOpen(false)} className="block text-lg font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-2">
                    <Gift className="w-5 h-5" />
                    Invite & Earn
                  </Link>
                )}

                {user && (
                  <Link to="/dashboard" onClick={() => setIsMobileMenuOpen(false)} className="block text-lg font-bold text-gray-900 flex items-center gap-2">
                    <Package className="w-5 h-5" />
                    My Orders
                  </Link>
                )}

                {isInstallable && (
                  <button 
                    onClick={() => {
                      installApp();
                      setIsMobileMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-3 bg-gray-900 text-white px-6 py-4 rounded-2xl font-bold shadow-lg hover:bg-black transition-all active:scale-95 text-lg"
                  >
                    <Smartphone className="w-6 h-6" />
                    Download App
                  </button>
                )}

                {!isAdmin && !isSeller && (
                  <button 
                    onClick={() => {
                      becomeSeller();
                      setIsMobileMenuOpen(false);
                    }}
                    className="block w-full text-left text-lg font-bold text-gray-900 hover:text-indigo-600"
                  >
                    Sell on Dropship Pro
                  </button>
                )}
              </div>

              <div className="pt-6 border-t border-gray-100">
                {user ? (
                  <div className="space-y-6">
                    <div className="flex items-center gap-4">
                      {user.photoURL ? (
                        <img 
                          src={user.photoURL || null} 
                          alt={user.displayName || ""} 
                          className="w-12 h-12 rounded-full border border-gray-200" 
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-lg">
                          {user.displayName?.charAt(0) || user.email?.charAt(0) || '?'}
                        </div>
                      )}
                      <div>
                        <div className="text-xs font-bold text-gray-400 uppercase tracking-widest">Logged in as</div>
                        <div className="text-sm font-bold text-gray-900">{user.displayName || user.email}</div>
                      </div>
                    </div>
                    <button 
                      onClick={() => {
                        handleLogout();
                        setIsMobileMenuOpen(false);
                      }}
                      className="w-full flex items-center justify-center gap-2 bg-red-50 text-red-600 py-3 rounded-xl font-bold hover:bg-red-100 transition-colors"
                    >
                      <LogOut className="w-5 h-5" />
                      Logout
                    </button>
                  </div>
                ) : (
                  <button 
                    onClick={() => {
                      setShowAuthModal(true);
                      setIsMobileMenuOpen(false);
                    }}
                    className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white py-4 rounded-xl font-bold hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-100"
                  >
                    <LogIn className="w-5 h-5" />
                    Login / Register
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
};

// --- Pages ---

const AdminChat = ({ user }: { user: User | null }) => {
  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const scrollRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;

    const q = query(collection(db, 'chats'), orderBy('updatedAt', 'desc'), limit(50));
    const unsub = onSnapshot(q, (snapshot) => {
      const chatList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Chat));
      setChats(chatList);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'chats');
    });

    return () => unsub();
  }, [user]);

  useEffect(() => {
    if (!selectedChat) return;

    const q = query(collection(db, 'chats', selectedChat.id, 'messages'), orderBy('timestamp', 'asc'), limit(100));
    const unsub = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ChatMessage));
      setMessages(msgs);
      setTimeout(() => scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight), 100);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `chats/${selectedChat.id}/messages`);
    });

    // Mark as read
    if (selectedChat.unreadCountSeller > 0) {
      updateDoc(doc(db, 'chats', selectedChat.id), { unreadCountSeller: 0 });
    }

    return () => unsub();
  }, [selectedChat]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedChat || !newMessage.trim()) return;

    const messageData = {
      senderId: user.uid,
      senderName: 'Store Support',
      text: newMessage.trim(),
      timestamp: new Date().toISOString(),
      read: false
    };

    setNewMessage('');
    
    try {
      await addDoc(collection(db, 'chats', selectedChat.id, 'messages'), messageData);
      await updateDoc(doc(db, 'chats', selectedChat.id), {
        lastMessage: newMessage.trim(),
        lastMessageTimestamp: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        unreadCountBuyer: (selectedChat.unreadCountBuyer || 0) + 1
      });
    } catch (error) {
      console.error("Error sending message:", error);
    }
  };

  return (
    <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden flex h-[600px] relative">
      {/* Chat List */}
      <div className={cn(
        "w-full md:w-1/3 border-r border-gray-100 flex flex-col bg-white z-10",
        selectedChat ? "hidden md:flex" : "flex"
      )}>
        <div className="p-4 border-b border-gray-100 bg-gray-50/50">
          <h3 className="font-bold text-gray-900">Conversations</h3>
          <p className="text-[10px] text-gray-400 uppercase tracking-widest mt-1">Recent Messages</p>
        </div>
        <div className="flex-1 overflow-y-auto">
          {chats.length === 0 && (
            <div className="p-8 text-center">
              <MessageSquare className="w-8 h-8 text-gray-200 mx-auto mb-2" />
              <p className="text-xs text-gray-400">No active chats</p>
            </div>
          )}
          {chats.map(chat => (
            <button
              key={chat.id}
              onClick={() => setSelectedChat(chat)}
              className={cn(
                "w-full p-4 text-left border-b border-gray-50 transition-all hover:bg-gray-50 flex items-start gap-3",
                selectedChat?.id === chat.id ? "bg-indigo-50/50 border-l-4 border-l-indigo-600" : ""
              )}
            >
              <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 font-bold shrink-0">
                {(chat.buyerName?.[0] || '?').toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start">
                  <span className="font-bold text-sm text-gray-900 truncate">{chat.buyerName || 'Unknown Buyer'}</span>
                  <span className="text-[9px] text-gray-400 whitespace-nowrap">
                    {chat.lastMessageTimestamp ? new Date(chat.lastMessageTimestamp).toLocaleDateString() : ''}
                  </span>
                </div>
                <p className="text-xs text-gray-500 truncate mt-0.5">{chat.lastMessage || 'No messages yet'}</p>
                {chat.unreadCountSeller > 0 && (
                  <span className="inline-block bg-indigo-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full mt-2">
                    {chat.unreadCountSeller} new
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Chat Window */}
      <div className={cn(
        "flex-1 flex flex-col bg-gray-50/30",
        !selectedChat ? "hidden md:flex" : "flex"
      )}>
        {selectedChat ? (
          <>
            <div className="p-4 bg-white border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => setSelectedChat(null)}
                  className="md:hidden p-2 -ml-2 text-gray-400 hover:text-indigo-600 transition-colors"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 font-bold">
                  {(selectedChat.buyerName?.[0] || '?').toUpperCase()}
                </div>
                <div>
                  <h3 className="font-bold text-sm text-gray-900">{selectedChat.buyerName || 'Unknown Buyer'}</h3>
                  <p className="text-[10px] text-gray-400">{selectedChat.buyerEmail || 'No email provided'}</p>
                </div>
              </div>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-4">
              {messages.map((msg, i) => (
                <div key={msg.id || i} className={cn("flex flex-col", msg.senderId === user?.uid ? "items-end" : "items-start")}>
                  <div className={cn(
                    "max-w-[70%] p-3 rounded-2xl text-sm shadow-sm",
                    msg.senderId === user?.uid ? "bg-indigo-600 text-white rounded-tr-none" : "bg-white text-gray-900 rounded-tl-none border border-gray-100"
                  )}>
                    {msg.text}
                  </div>
                  <span className="text-[9px] text-gray-400 mt-1 px-1">
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))}
            </div>

            <form onSubmit={handleSendMessage} className="p-4 bg-white border-t border-gray-100 flex gap-2">
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Type your reply..."
                className="flex-1 bg-gray-100 border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              />
              <button 
                type="submit"
                disabled={!newMessage.trim()}
                className="bg-indigo-600 text-white px-6 py-2 rounded-xl font-bold hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                <Send className="w-4 h-4" />
                Reply
              </button>
            </form>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-12">
            <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center text-indigo-600 mb-6">
              <MessageSquare className="w-10 h-10" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Select a conversation</h3>
            <p className="text-gray-500 max-w-xs">Choose a customer from the list on the left to start chatting.</p>
          </div>
        )}
      </div>
    </div>
  );
};

const Storefront = ({ 
  products, 
  addToCart, 
  currency, 
  rates,
  isAdmin,
  user,
  isInstallable,
  installApp
}: { 
  products: Product[]; 
  addToCart: (p: Product, selectedVariations?: { [key: string]: string }) => void;
  currency: string;
  rates: ExchangeRates;
  isAdmin: boolean;
  user: User | null;
  isInstallable: boolean;
  installApp: () => void;
}) => {
  const [search, setSearch] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 10000]);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedVariationFilters, setSelectedVariationFilters] = useState<{ [key: string]: string[] }>({});
  
  const categories = ['All', 'Digital Goods', ...new Set(products.map(p => p.category || 'General'))];
  
  const fuse = useMemo(() => new Fuse(products.filter(p => p.status === 'approved'), {
    keys: ['title', 'description', 'category'],
    threshold: 0.3,
    distance: 100,
  }), [products]);

  const suggestions = useMemo(() => {
    if (!search.trim()) return [];
    return fuse.search(search).slice(0, 5).map(r => r.item);
  }, [search, fuse]);

  const handleCategorySelect = (cat: string) => {
    setSelectedCategory(cat);
  };

  const allVariations = products.reduce((acc, p) => {
    p.variations?.forEach(v => {
      if (!acc[v.name]) acc[v.name] = new Set();
      v.options.forEach(opt => acc[v.name].add(opt.name));
    });
    return acc;
  }, {} as { [key: string]: Set<string> });

  const approvedProducts = useMemo(() => {
    let filtered = products.filter(p => p.status === 'approved');

    if (search.trim()) {
      filtered = fuse.search(search).map(r => r.item);
    }

    return filtered.filter(p => {
      const finalPrice = (p.price * (1 + p.markup / 100)) / (rates[p.sourceCurrency] || 1);
      const matchesPrice = finalPrice >= priceRange[0] && finalPrice <= priceRange[1];
      const matchesCategory = selectedCategory === 'All' || (p.category || 'General') === selectedCategory;
      const matchesVariations = (Object.entries(selectedVariationFilters) as [string, string[]][]).every(([vName, vOpts]) => {
        if (vOpts.length === 0) return true;
        return p.variations?.some(v => v.name === vName && v.options.some(opt => vOpts.includes(opt.name)));
      });

      return matchesPrice && matchesCategory && matchesVariations;
    });
  }, [products, search, fuse, priceRange, selectedCategory, selectedVariationFilters, rates]);

  const isFilterActive = search !== '' || 
    selectedCategory !== 'All' || 
    priceRange[0] !== 0 || 
    priceRange[1] !== 10000 || 
    Object.values(selectedVariationFilters).some((v: any) => v.length > 0);

  const resetFilters = () => {
    setSearch('');
    setPriceRange([0, 10000]);
    setSelectedVariationFilters({});
    setSelectedCategory('All');
  };

  const toggleVariationOption = (vName: string, opt: string) => {
    setSelectedVariationFilters(prev => {
      const current = prev[vName] || [];
      const next = current.includes(opt) 
        ? current.filter(o => o !== opt) 
        : [...current, opt];
      return { ...prev, [vName]: next };
    });
  };

  return (
    <div className="bg-white">
      <AnimatePresence>
        {selectedProduct && (
          <ProductModal 
            product={selectedProduct} 
            onClose={() => setSelectedProduct(null)} 
            addToCart={addToCart}
            currency={currency}
            rates={rates}
            isAdmin={isAdmin}
            user={user}
          />
        )}
      </AnimatePresence>

      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gray-900 py-16 sm:py-24 lg:py-32">
        <img
          src="https://images.unsplash.com/photo-1441986300917-64674bd600d8?ixlib=rb-4.0.3&auto=format&fit=crop&w=1920&q=80"
          alt="Hero background"
          className="absolute inset-0 -z-10 h-full w-full object-cover object-center opacity-40 blur-[2px]"
          referrerPolicy="no-referrer"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-gray-900 via-gray-900/40"></div>
        <div className="mx-auto max-w-7xl px-6 lg:px-8 relative z-10">
          <div className="mx-auto max-w-2xl lg:mx-0">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <h1 className="text-3xl font-bold tracking-tight text-white sm:text-6xl mb-6">
                Global Products, <br />
                <span className="text-indigo-400">Local Delivery.</span>
              </h1>
              <p className="text-base sm:text-lg leading-7 sm:leading-8 text-gray-300 mb-8 sm:mb-10">
                Discover a curated collection of premium goods from around the world. 
                Fast, secure, and reliable shopping experience in Dar es Salaam.
              </p>
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-x-6">
                <button 
                  onClick={() => {
                    const el = document.getElementById('products-grid');
                    el?.scrollIntoView({ behavior: 'smooth' });
                  }}
                  className="w-full sm:w-auto rounded-xl bg-indigo-600 px-8 py-4 text-sm font-bold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 transition-all"
                >
                  Shop Now
                </button>
                {isInstallable && (
                  <button 
                    onClick={installApp}
                    className="w-full sm:w-auto rounded-xl bg-white text-indigo-600 px-8 py-4 text-sm font-bold border-2 border-indigo-600 hover:bg-indigo-50 transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-100"
                  >
                    <Smartphone className="w-5 h-5" />
                    Download App
                  </button>
                )}
                <Link to="/admin" className="text-sm font-bold leading-6 text-white hover:text-indigo-400 transition-colors flex items-center gap-2">
                  Become a Seller <ChevronRight className="w-4 h-4" />
                </Link>
              </div>
            </motion.div>
          </div>
          <div className="mx-auto mt-12 sm:mt-16 grid max-w-2xl grid-cols-1 gap-4 sm:gap-6 sm:mt-20 lg:mx-0 lg:max-w-none lg:grid-cols-3">
            {[
              { title: 'Verified Sellers', desc: 'Every merchant is vetted for quality.', icon: ShieldCheck },
              { title: 'Secure Escrow', desc: 'Funds held safely until delivery.', icon: CreditCard },
              { title: 'Fast Shipping', desc: 'Real-time tracking on every order.', icon: Truck },
            ].map((feature, i) => (
              <motion.div 
                key={i}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 + i * 0.1 }}
                className="flex gap-x-4 rounded-2xl bg-white/5 p-6 ring-1 ring-inset ring-white/10 backdrop-blur-sm"
              >
                <feature.icon className="h-7 w-5 flex-none text-indigo-400" aria-hidden="true" />
                <div className="text-sm leading-6">
                  <strong className="font-bold text-white">{feature.title}</strong>
                  <p className="text-gray-400">{feature.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <div id="products-grid" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {isInstallable && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8 p-4 bg-indigo-600 rounded-3xl text-white flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center shrink-0">
                <Smartphone className="w-6 h-6" />
              </div>
              <div>
                <h4 className="font-bold text-sm">Download Our Official App</h4>
                <p className="text-[10px] opacity-80">Get the best shopping experience directly on your home screen.</p>
              </div>
            </div>
            <button 
              onClick={installApp}
              className="w-full sm:w-auto px-6 py-2 bg-white text-indigo-600 rounded-xl font-bold text-xs hover:bg-indigo-50 transition-colors flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Install Now
            </button>
          </motion.div>
        )}
        <header className="mb-12">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-8 mb-8">
            <div>
              <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight mb-4">Featured Products</h2>
              <p className="text-base sm:text-lg text-gray-500 max-w-2xl">Premium products sourced globally, delivered directly to your door.</p>
            </div>
            <div className="w-full lg:w-80 relative">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input 
                  type="text"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setShowSuggestions(true);
                  }}
                  onFocus={() => setShowSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                  placeholder="Search products..."
                  className="w-full pl-12 pr-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all shadow-sm"
                />
              </div>

              {/* Search Suggestions */}
              <AnimatePresence>
                {showSuggestions && suggestions.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className="absolute left-0 right-0 mt-2 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden z-[70]"
                  >
                    <div className="p-3 border-b border-gray-50 bg-gray-50/50 flex items-center gap-2">
                      <Sparkles className="w-3 h-3 text-indigo-500" />
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Smart Suggestions</span>
                    </div>
                    <div className="p-2">
                      {suggestions.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => {
                            setSearch(p.title);
                            setShowSuggestions(false);
                          }}
                          className="w-full flex items-center gap-3 p-2 hover:bg-indigo-50 rounded-xl transition-colors text-left group"
                        >
                          <div className="w-10 h-10 rounded-lg overflow-hidden bg-gray-50 shrink-0 border border-gray-100">
                            <img src={p.image} alt={p.title} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-bold text-gray-900 truncate group-hover:text-indigo-600 transition-colors">{p.title}</div>
                            <div className="text-[10px] text-gray-500 truncate">{p.category}</div>
                          </div>
                          <ChevronRight className="w-3 h-3 text-gray-300 group-hover:text-indigo-400" />
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Quick Category Bar */}
          <div className="flex items-center gap-4 mb-8 overflow-x-auto pb-4 scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0">
            <div className="flex-none text-[10px] sm:text-xs font-bold text-gray-400 uppercase tracking-widest mr-2">Quick Filter:</div>
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => handleCategorySelect(cat)}
                className={cn(
                  "flex-none px-4 py-2 sm:px-6 sm:py-2.5 rounded-full text-xs sm:text-sm font-bold transition-all whitespace-nowrap",
                  selectedCategory === cat 
                    ? "bg-indigo-600 text-white shadow-lg shadow-indigo-100" 
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                )}
              >
                {cat}
              </button>
            ))}
            
            <AnimatePresence>
              {isFilterActive && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  onClick={resetFilters}
                  className="flex-none px-4 py-2 sm:px-6 sm:py-2.5 rounded-full text-xs sm:text-sm font-bold bg-red-50 text-red-600 hover:bg-red-100 transition-all flex items-center gap-2 border border-red-100"
                >
                  <X className="w-4 h-4" />
                  Clear All
                </motion.button>
              )}
            </AnimatePresence>
          </div>

          <div className="bg-gray-50 p-4 sm:p-8 rounded-3xl border border-gray-100 shadow-sm">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-12">
              {/* Category Filter */}
              <div className="space-y-4">
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest">Category</label>
                <div className="flex flex-wrap gap-2">
                  {categories.map(cat => (
                    <button
                      key={cat}
                      onClick={() => handleCategorySelect(cat)}
                      className={cn(
                        "px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl text-[10px] sm:text-xs font-bold transition-all",
                        selectedCategory === cat 
                          ? "bg-indigo-600 text-white shadow-lg shadow-indigo-100" 
                          : "bg-white text-gray-600 border border-gray-200 hover:border-indigo-300"
                      )}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* Price Range Slider */}
              <div className="space-y-6">
                <div className="flex justify-between items-center">
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest">Price Range</label>
                  <span className="text-[10px] sm:text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded-lg">
                    {priceRange[0]} - {priceRange[1]} {currency}
                  </span>
                </div>
                <Slider.Root
                  className="relative flex items-center select-none touch-none w-full h-5"
                  value={priceRange}
                  onValueChange={(val) => setPriceRange(val as [number, number])}
                  max={10000}
                  step={100}
                  minStepsBetweenThumbs={1}
                >
                  <Slider.Track className="bg-gray-200 relative grow rounded-full h-[4px]">
                    <Slider.Range className="absolute bg-indigo-600 rounded-full h-full" />
                  </Slider.Track>
                  <Slider.Thumb
                    className="block w-4 h-4 sm:w-5 sm:h-5 bg-white border-2 border-indigo-600 shadow-lg rounded-full hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                    aria-label="Min price"
                  />
                  <Slider.Thumb
                    className="block w-4 h-4 sm:w-5 sm:h-5 bg-white border-2 border-indigo-600 shadow-lg rounded-full hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                    aria-label="Max price"
                  />
                </Slider.Root>
                <div className="flex justify-between text-[9px] sm:text-[10px] font-bold text-gray-400">
                  <span>0 {currency}</span>
                  <span>10,000+ {currency}</span>
                </div>
              </div>

              {/* Variation Filters (Multi-select) */}
              <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-8">
                {Object.entries(allVariations).map(([vName, vOpts]) => (
                  <div key={vName} className="space-y-4">
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest">{vName}</label>
                    <div className="flex flex-wrap gap-2">
                      {[...vOpts].map(opt => {
                        const isSelected = selectedVariationFilters[vName]?.includes(opt);
                        return (
                          <button
                            key={opt}
                            onClick={() => toggleVariationOption(vName, opt)}
                            className={cn(
                              "px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all border",
                              isSelected 
                                ? "bg-indigo-50 border-indigo-200 text-indigo-600" 
                                : "bg-white border-gray-100 text-gray-500 hover:border-gray-200"
                            )}
                          >
                            {opt}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="mt-10 pt-8 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <Info className="w-4 h-4" />
                <span>Filters are applied instantly as you make changes.</span>
              </div>
              <div className="flex items-center gap-4 w-full sm:w-auto">
                <button
                  onClick={resetFilters}
                  className="flex-1 sm:flex-none px-6 py-3 rounded-xl text-sm font-bold text-gray-500 hover:bg-gray-100 transition-all flex items-center justify-center gap-2"
                >
                  <X className="w-4 h-4" />
                  Clear All Filters
                </button>
              </div>
            </div>
          </div>
        </header>

        {approvedProducts.length === 0 ? (
          <div className="text-center py-24 border-2 border-dashed border-gray-200 rounded-2xl">
            <Store className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900">No products match your filters</h3>
            <p className="text-gray-500">Try adjusting your search or filters to find what you're looking for.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8 mb-16" id="products">
            {approvedProducts.map((product) => (
              <motion.div
                layout
                key={product.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="group bg-white rounded-2xl border border-gray-100 overflow-hidden hover:shadow-xl transition-all duration-300 flex flex-col relative"
              >
                <div 
                  className="aspect-square overflow-hidden bg-gray-50 relative cursor-pointer"
                  onClick={() => setSelectedProduct(product)}
                >
                  <img
                    src={product.image || null}
                    alt={product.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-300 flex items-center justify-center opacity-0 group-hover:opacity-100">
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedProduct(product);
                      }}
                      className="bg-white text-gray-900 px-6 py-3 rounded-xl font-bold shadow-xl transform translate-y-4 group-hover:translate-y-0 transition-all duration-300 hover:bg-indigo-600 hover:text-white"
                    >
                      Quick View
                    </button>
                  </div>
                  <div className="absolute top-4 right-4 bg-white/90 backdrop-blur px-3 py-1 rounded-full text-sm font-bold text-gray-900 shadow-sm">
                    {formatPrice(product.price * (1 + product.markup / 100), currency, rates, product.sourceCurrency)}
                  </div>
                </div>
                <div className="p-6 flex-1 flex flex-col">
                  <div 
                    className="cursor-pointer flex-1"
                    onClick={() => setSelectedProduct(product)}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded uppercase tracking-wider">
                        {product.category || 'General'}
                      </span>
                    </div>
                    <h3 className="text-sm font-semibold text-gray-900 mb-2 line-clamp-2 min-h-[2.5rem] group-hover:text-indigo-600 transition-colors">{product.title}</h3>
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-xs text-gray-500 line-clamp-1">{product.description}</p>
                      {product.sellerName && (
                        <div className="flex items-center gap-1 text-[9px] font-bold text-gray-400 uppercase tracking-tighter">
                          <Store className="w-2.5 h-2.5" />
                          {product.sellerName}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2 mt-auto">
                    <button
                      onClick={() => {
                        const initial: { [key: string]: string } = {};
                        if (product.variations) {
                          product.variations.forEach(v => {
                            if (v.options.length > 0) initial[v.name] = v.options[0].name;
                          });
                        }
                        addToCart(product, initial);
                      }}
                      className="w-full bg-gray-900 text-white py-3 rounded-xl font-medium hover:bg-indigo-600 transition-colors flex items-center justify-center gap-2"
                    >
                      <Plus className="w-4 h-4" />
                      Add to Cart
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {/* Trust Section */}
        <section className="py-12 bg-gray-50 rounded-[2.5rem] border border-gray-100 mb-20">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 px-8">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-indigo-600 shadow-sm">
                <CreditCard className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900">Secure Payments</h3>
                <p className="text-xs text-gray-500">Multiple payment options available</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-indigo-600 shadow-sm">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900">Quality Guarantee</h3>
                <p className="text-xs text-gray-500">Only the best products</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-indigo-600 shadow-sm">
                <Truck className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900">Fast Shipping</h3>
                <p className="text-xs text-gray-500">Global delivery to your door</p>
              </div>
            </div>
          </div>
        </section>

        {/* About the Founder / Story Section */}
        <section className="mt-16 bg-white rounded-[2.5rem] border border-gray-100 overflow-hidden shadow-sm">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 p-8 sm:p-12">
            {/* Visual Column */}
            <div className="lg:col-span-5 flex flex-col justify-between bg-gradient-to-br from-indigo-900 to-indigo-950 p-8 sm:p-10 rounded-[2rem] text-white relative overflow-hidden">
              <div className="z-10">
                <span className="text-[10px] font-bold tracking-widest text-indigo-300 uppercase bg-indigo-500/20 px-3 py-1.5 rounded-full border border-indigo-500/30">
                  Founder's Corner
                </span>
                <h3 className="mt-8 text-2xl sm:text-3xl font-extrabold tracking-tight">
                  Deogratius Richard
                </h3>
                <p className="mt-2 text-indigo-200 text-sm font-medium">
                  Founder & Lead Visionary, Dropship Pro
                </p>
              </div>

              <div className="mt-12 space-y-4 z-10">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-indigo-500/20 rounded-lg flex items-center justify-center border border-indigo-500/20">
                    <MapPin className="w-4 h-4 text-indigo-300" />
                  </div>
                  <span className="text-sm font-semibold text-indigo-100">Dar es Salaam, Tanzania</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-indigo-500/20 rounded-lg flex items-center justify-center border border-indigo-500/20">
                    <Award className="w-4 h-4 text-indigo-300" />
                  </div>
                  <span className="text-sm font-semibold text-indigo-100">National E-Commerce Pioneer</span>
                </div>
              </div>

              {/* Decorative graphic background */}
              <div className="absolute -bottom-16 -left-16 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl"></div>
              <div className="absolute -top-10 -right-10 w-40 h-40 bg-indigo-500/15 rounded-full blur-3xl"></div>
            </div>

            {/* Content Column */}
            <div className="lg:col-span-7 flex flex-col justify-center space-y-6">
              <h3 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">
                Our Story & Leadership
              </h3>
              
              <div className="text-gray-600 space-y-4 leading-relaxed text-sm">
                <p>
                  Born and raised in the vibrant coastal hub of <strong>Dar es Salaam, Tanzania</strong>, 
                  our founder, <strong>Deogratius Richard</strong>, established Dropship Pro with a clean, 
                  pioneering vision: to revolutionize the landscape of trade, logistics, and local e-commerce within East Africa.
                </p>
                <p>
                  Witnessing firsthand the dynamic evolution of local markets and logistics in Dar es Salaam, Deogratius realized 
                  the critical need for a fully unified, reliable dropshipping network. He engineered Dropship Pro to empower 
                  local suppliers, driver fleets, and independent referrers, creating an inclusive ecosystem where 
                  every participant can achieve seamless financial success.
                </p>
                <p>
                  Under his steady leadership, Dropship Pro has grown into an official, highly secure trust platform 
                  featuring automated logistics routing, guaranteed multi-layer escrow fee allocations, and decentralized 
                  earning channels. Our goal remains absolute: to build the most efficient, transparent, and trusted 
                  peer-to-peer commerce gateway for Tanzania and beyond.
                </p>
              </div>

              <div className="pt-6 border-t border-gray-100 flex items-center justify-between">
                <div>
                  <div className="text-xs text-gray-400 uppercase tracking-widest font-bold">Official Seal</div>
                  <div className="text-sm font-serif italic text-gray-700 mt-1">Deogratius Richard</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-gray-400 uppercase tracking-widest font-bold">HQ Location</div>
                  <div className="text-sm font-bold text-indigo-600 mt-1">Dar es Salaam, TZ</div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
const ReferralDashboard = ({
  user,
  currency,
  rates,
  updateProfile
}: {
  user: UserProfile | null;
  currency: string;
  rates: ExchangeRates;
  updateProfile: (data: Partial<UserProfile>) => Promise<void>;
}) => {
  const [referrals, setReferrals] = useState<{ id: string; role: string; email: string; createdAt: string }[]>([]);
  const [earnings, setEarnings] = useState<{ amount: number; type: string; orderId: string; createdAt: string }[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [tab, setTab] = useState<'network' | 'plans'>('network');

  useEffect(() => {
    if (!user) return;

    // Listen to user profile for earnings balance
    const unsubProfile = onSnapshot(doc(db, 'users', user.uid), (docSnap) => {
      if (docSnap.exists()) {
        setProfile(docSnap.data() as UserProfile);
      }
    });

    // Listen to people referred by this user
    const qUsers = query(collection(db, 'users'), where('referredBy', '==', user.uid));
    const unsubUsers = onSnapshot(qUsers, (snapshot) => {
      setReferrals(snapshot.docs.map(doc => ({ 
        id: doc.id, 
        role: doc.data().role, 
        email: doc.data().email, 
        createdAt: doc.data().createdAt 
      })));
    });

    // Listen to referral earnings
    const qEarnings = query(collection(db, 'referral_earnings'), where('referrerId', '==', user.uid), orderBy('createdAt', 'desc'));
    const unsubEarnings = onSnapshot(qEarnings, (snapshot) => {
      setEarnings(snapshot.docs.map(doc => ({ 
        amount: doc.data().amount, 
        type: doc.data().type, 
        orderId: doc.data().orderId, 
        createdAt: doc.data().createdAt 
      })));
    });

    return () => {
      unsubProfile();
      unsubUsers();
      unsubEarnings();
    };
  }, [user]);

  const referralLink = `${window.location.origin}/?ref=${user?.uid || ''}`;

  const copyLink = () => {
    navigator.clipboard.writeText(referralLink);
    alert("Referral link copied to clipboard!");
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 sm:py-12">
      <div className="flex flex-col md:flex-row gap-8 mb-12">
        <div className="flex-1 bg-gradient-to-br from-indigo-600 to-indigo-800 rounded-3xl p-8 text-white shadow-xl">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-md">
              <Gift className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Invite & Earn</h1>
              <p className="text-indigo-100 text-sm opacity-80 text-left">Share your link and earn 3% commission.</p>
            </div>
          </div>
          
          <div className="bg-white/10 rounded-2xl p-6 backdrop-blur-md border border-white/20 mb-8">
            <label className="block text-[10px] font-bold uppercase tracking-widest text-indigo-200 mb-3 text-left">Your Referral Link</label>
            <div className="flex gap-2">
              <input 
                type="text" 
                readOnly 
                value={referralLink} 
                className="flex-1 bg-black/20 border-none rounded-xl px-4 py-3 text-sm outline-none font-mono"
              />
              <button 
                onClick={copyLink}
                className="bg-white text-indigo-600 p-3 rounded-xl hover:bg-indigo-50 transition-all shadow-lg"
              >
                <Copy className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
              <div className="text-[10px] font-bold uppercase opacity-60 mb-1 text-left">Total Earnings</div>
              <div className="text-2xl font-bold text-left">{formatPrice(profile?.referralEarnings || 0, currency, rates, 'USD')}</div>
            </div>
            <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
              <div className="text-[10px] font-bold uppercase opacity-60 mb-1 text-left">Total Referrals</div>
              <div className="text-2xl font-bold text-left">{referrals.length}</div>
            </div>
          </div>
        </div>

        <div className="w-full md:w-80 bg-white rounded-3xl border border-gray-100 p-8 shadow-sm">
          <h3 className="text-lg font-bold text-gray-900 mb-6">How it works</h3>
          <div className="space-y-6">
            {[
              { icon: LinkIcon, title: "Share Link", desc: "Send your personal link to friends or business partners." },
              { icon: UserPlus, title: "They Join", desc: "Invitees register as a Seller, Driver, or Buyer." },
              { icon: TrendingUp, title: "You Earn", desc: "Get 3% of their income every time they make a sale or delivery." }
            ].map((step, i) => (
              <div key={i} className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 shrink-0">
                  <step.icon className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-gray-900 mb-1 text-left">{step.title}</h4>
                  <p className="text-xs text-gray-500 leading-relaxed text-left">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
        <div>
          <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-green-500" />
            Earning History
          </h3>
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
            {earnings.length === 0 ? (
              <div className="p-12 text-center">
                <p className="text-gray-400 italic text-sm">No earnings recorded yet.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {earnings.map((earning, i) => (
                  <div key={i} className="p-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-green-50 text-green-600 flex items-center justify-center">
                        <DollarSign className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-gray-900">
                          {earning.type === 'seller_sale' ? 'Seller Sale Comm.' : 'Driver Delivery Comm.'}
                        </div>
                        <div className="text-[10px] text-gray-400 uppercase tracking-widest">Order #{earning.orderId.slice(0, 8)}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold text-green-600">+{formatPrice(earning.amount, currency, rates, 'USD')}</div>
                      <div className="text-[9px] text-gray-400">{new Date(earning.createdAt).toLocaleDateString()}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div>
          <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-500" />
            Your Referrals
          </h3>
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
            {referrals.length === 0 ? (
              <div className="p-12 text-center">
                <p className="text-gray-400 italic text-sm">You haven't referred anyone yet.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {referrals.map((ref, i) => (
                  <div key={i} className="p-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-xs">
                        {ref.email[0].toUpperCase()}
                      </div>
                      <div>
                        <div className="text-xs font-bold text-gray-900">{ref.email}</div>
                        <div className="text-[10px] text-indigo-600 font-bold uppercase tracking-widest">{ref.role}</div>
                      </div>
                    </div>
                    <div className="text-right text-[10px] text-gray-400">
                      Joined {new Date(ref.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const DriverDashboard = ({
  user,
  orders,
  updateOrder,
  currency,
  rates,
  awardReferralCommission
}: {
  user: User | null;
  orders: Order[];
  updateOrder: (id: string, data: Partial<Order>) => Promise<void>;
  currency: string;
  rates: ExchangeRates;
  awardReferralCommission: (referrerId: string, inviteeId: string, inviteeRole: string, orderId: string, income: number, type: 'seller_sale' | 'driver_delivery') => Promise<void>;
}) => {
  const [activeTab, setActiveTab] = useState<'available' | 'active' | 'history'>('available');
  const [viewingQR, setViewingQR] = useState<Order | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(doc(db, 'users', user.uid), (docSnap) => {
      if (docSnap.exists()) {
        setProfile(docSnap.data() as UserProfile);
      }
    });
    return () => unsub();
  }, [user]);

  const availableOrders = orders.filter(o => o.status === 'availability_confirmed');
  const myActiveOrders = orders.filter(o => 
    o.deliveryDetails?.driverId === user?.uid && 
    (o.status === 'awaiting_payment' || o.status === 'paid' || o.status === 'shipped' || o.status === 'picked_up' || o.status === 'reported' || o.status === 'awaiting_pickup' || o.status === 'fulfilled' || o.status === 'availability_confirmed')
  );
  const myHistory = orders.filter(o => 
    o.deliveryDetails?.driverId === user?.uid && 
    o.status === 'delivered'
  );

  const handleAcceptJob = async (orderId: string) => {
    if (!user) return;
    const order = orders.find(o => o.id === orderId);
    if (!order) return;

    // 1. Get coordinates from profile
    let driverLat = -6.7924; // Default Oysterbay
    let driverLng = 39.2721;
    
    try {
      const profileDoc = await getDoc(doc(db, 'users', user.uid));
      if (profileDoc.exists()) {
        const profileData = profileDoc.data() as UserProfile;
        if (profileData.location) {
          driverLat = profileData.location.lat;
          driverLng = profileData.location.lng;
        }
      }
    } catch (e) {
      console.warn("Failed to fetch driver profile for location:", e);
    }
    
    // Store Location (Kariakoo as default hub)
    const storeLat = -6.8183;
    const storeLng = 39.2789;

    const customerLat = order.customer.lat || -6.8235; // Default Posta
    const customerLng = order.customer.lng || 39.2848;

    // 2. Calculate Distances
    const distToStore = getDistance(driverLat, driverLng, storeLat, storeLng);
    const distToCustomer = getDistance(storeLat, storeLng, customerLat, customerLng);
    const totalDist = distToStore + distToCustomer;

    // 3. Calculate Fee
    const deliveryFee = calculateDeliveryFee(totalDist);

    await updateOrder(orderId, {
      status: 'awaiting_payment',
      total: order.total + (deliveryFee / (rates[order.currency] || 1)), // Add fee to total in USD base then back
      deliveryDetails: {
        driverId: user.uid,
        driverName: user.displayName || user.email || 'Driver',
        offeredAt: new Date().toISOString(),
        acceptedAt: new Date().toISOString(),
        pickupLocation: 'Main Distribution Hub (Kariakoo)',
        startLat: driverLat,
        startLng: driverLng,
        pickupLat: storeLat,
        pickupLng: storeLng,
        dropoffLat: customerLat,
        dropoffLng: customerLng,
        distanceKm: totalDist,
        deliveryFee: deliveryFee
      },
      automationLog: [
        ...(order.automationLog || []),
        `[DRIVER] Offer accepted by ${user.displayName}.`,
        `[ROUTING] Route calculated: Driver -> Hub (${distToStore.toFixed(1)}km) -> Customer (${distToCustomer.toFixed(1)}km).`,
        `[ROUTING] Total distance: ${totalDist.toFixed(1)}km.`,
        `[FINANCE] Delivery fee calculated: ${formatPrice(deliveryFee, 'TZS', rates, 'TZS')}. New total pending customer approval.`
      ]
    });
    alert("Delivery offer accepted! Delivery fee calculated and sent to customer for payment.");
  };

  const handlePickup = async (orderId: string) => {
    const confirmationCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    await updateOrder(orderId, {
      status: 'picked_up',
      confirmationCode: confirmationCode,
      deliveryDetails: {
        pickedUpAt: new Date().toISOString()
      },
      automationLog: [
        ...(orders.find(o => o.id === orderId)?.automationLog || []),
        `[DRIVER] Order picked up. Confirmation code ${confirmationCode} generated.`
      ]
    });
  };

  const handleDelivery = async (orderId: string) => {
    const order = orders.find(o => o.id === orderId);
    if (!order || !user) return;

    await updateOrder(orderId, {
      status: 'delivered',
      deliveryDetails: {
        ...order.deliveryDetails,
        deliveredAt: new Date().toISOString()
      },
      automationLog: [
        ...(order.automationLog || []),
        `[DRIVER] Delivery confirmed by ${user.displayName || user.email}.`
      ]
    });

    // Award referral commission to the driver's referrer
    const driverDoc = await getDoc(doc(db, 'users', user.uid));
    if (driverDoc.exists()) {
      const driverData = driverDoc.data();
      if (driverData.referredBy) {
        // Driver earning is 5% of order total
        const driverEarning = order.total * 0.05;
        await awardReferralCommission(driverData.referredBy, user.uid, 'driver', order.id, driverEarning, 'driver_delivery');
      }
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 sm:py-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Driver Portal</h1>
          <p className="text-sm text-gray-500">Pick up and deliver goods to earn money.</p>
        </div>
        <div className="flex bg-gray-100 p-1 rounded-xl w-fit">
          {(['available', 'active', 'history'] as const).map(t => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-bold transition-all capitalize",
                activeTab === t ? "bg-white text-indigo-600 shadow-sm" : "text-gray-500"
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
        <div className="bg-gradient-to-br from-indigo-600 to-indigo-800 rounded-3xl p-6 text-white shadow-xl shadow-indigo-100">
          <div className="flex justify-between items-start mb-4">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-md">
              <DollarSign className="w-5 h-5 text-white" />
            </div>
            {profile?.walletBalance !== undefined && profile.walletBalance < 0 && (
              <span className="bg-red-500 text-[8px] font-bold px-2 py-1 rounded-full uppercase tracking-widest flex items-center gap-1 animate-pulse">
                <AlertCircle className="w-2 h-2" /> Penalty Active
              </span>
            )}
          </div>
          <div className="text-3xl font-bold mb-1">
            {formatPrice(profile?.walletBalance || 0, currency, rates)}
          </div>
          <p className="text-indigo-100 text-[10px] font-bold uppercase tracking-widest opacity-80">Available Units</p>
        </div>
        
        {profile?.vehicleInfo && (
          <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-gray-50 rounded-xl flex items-center justify-center text-indigo-600">
                <Truck className="w-5 h-5" />
              </div>
              <div>
                <div className="text-sm font-bold text-gray-900">{profile.vehicleInfo.plateNumber}</div>
                <div className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{profile.vehicleInfo.model} ({profile.vehicleInfo.color})</div>
              </div>
            </div>
            <div className="pt-4 border-t border-gray-50 flex justify-between">
              <div className="text-[10px] font-bold text-green-600 uppercase">Verified Driver</div>
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">NIDA: {profile.nationalId?.slice(0, 4)}...</div>
            </div>
          </div>
        )}

        <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600">
              <History className="w-5 h-5" />
            </div>
            <div className="text-sm font-bold text-gray-900">Performance</div>
          </div>
          <div className="flex gap-4">
            <div>
              <div className="text-lg font-bold text-gray-900">{myHistory.length}</div>
              <div className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Success</div>
            </div>
            <div className="w-px h-8 bg-gray-100" />
            <div>
              <div className="text-lg font-bold text-red-500">
                {orders.filter(o => o.deliveryDetails?.driverId === user?.uid && o.status === 'reported').length}
              </div>
              <div className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Disputes</div>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {activeTab === 'available' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {availableOrders.filter(o => !o.deliveryDetails?.driverId).length === 0 ? (
              <div className="col-span-full text-center py-20 bg-gray-50 rounded-3xl border-2 border-dashed border-gray-200">
                <Package className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500 font-medium">No available delivery offers nearby.</p>
              </div>
            ) : (
              availableOrders.filter(o => !o.deliveryDetails?.driverId).map(order => (
                <div key={order.id} className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm hover:border-indigo-300 transition-all group">
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">New Delivery Offer</div>
                      <h3 className="text-lg font-bold text-gray-900">Kariakoo Distribution</h3>
                    </div>
                    <div className="text-right">
                      <div className="text-xl font-bold text-green-600">{formatPrice(order.total * 0.05, currency, rates)}</div>
                      <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Earning</div>
                    </div>
                  </div>
                  
                  <div className="space-y-4 mb-8">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-orange-50 flex items-center justify-center text-orange-600 shrink-0">
                        <Package className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-[10px] font-bold text-gray-400 uppercase">Pickup From</div>
                        <div className="text-sm font-bold text-gray-900">Main Hub, Block A</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 shrink-0">
                        <MapPin className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-[10px] font-bold text-gray-400 uppercase">Deliver To</div>
                        <div className="text-sm font-bold text-gray-900 line-clamp-1">{order.customer.city}, {order.customer.address}</div>
                      </div>
                    </div>
                  </div>

                  <button 
                    onClick={() => handleAcceptJob(order.id)}
                    className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 flex items-center justify-center gap-2"
                  >
                    Accept Offer
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'active' && (
          <div className="space-y-6">
             {myActiveOrders.length === 0 ? (
               <div className="text-center py-20 bg-gray-50 rounded-3xl">
                 <Truck className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                 <p className="text-gray-500">You have no active deliveries.</p>
               </div>
             ) : (
               myActiveOrders.map(order => (
                 <div key={order.id} className="bg-white p-6 sm:p-8 rounded-3xl border border-gray-200 shadow-xl overflow-hidden relative">
                   <div className="sm:absolute top-4 right-8 mb-4 sm:mb-0">
                      <div className={cn(
                        "px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest w-fit",
                        order.status === 'awaiting_payment' ? "bg-yellow-100 text-yellow-600 animate-pulse" :
                        order.status === 'awaiting_pickup' ? "bg-orange-100 text-orange-600" : "bg-blue-100 text-blue-600 font-bold"
                      )}>
                        {order.status === 'awaiting_payment' ? 'Awaiting Payment' :
                         order.status === 'awaiting_pickup' ? 'Awaiting Pickup' : 'Out for Delivery'}
                      </div>
                   </div>

                   <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                     <div>
                       <h3 className="text-xl font-bold text-gray-900 mb-6">Delivery Path</h3>
                       <div className="space-y-8 relative">
                         <div className="absolute left-[15px] top-4 bottom-4 w-0.5 border-l-2 border-dashed border-gray-100"></div>
                         
                         <div className="flex gap-4 relative">
                            <div className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center z-10 font-bold text-xs ring-4 ring-white">1</div>
                            <div>
                              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1 text-left">Pickup Information</div>
                              <p className="font-bold text-gray-900 text-left">Distribution Hub</p>
                              <p className="text-xs text-gray-500 text-left">Shop 42, Floor 1, Kariakoo</p>
                            </div>
                         </div>

                         <div className="flex gap-4 relative">
                            <div className="w-8 h-8 rounded-full bg-gray-200 text-gray-500 flex items-center justify-center z-10 font-bold text-xs ring-4 ring-white">2</div>
                            <div>
                              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1 text-left">Customer Destination</div>
                              <p className="font-bold text-gray-900 text-left">{order.customer.name}</p>
                              <p className="text-xs text-gray-500 text-left">{order.customer.phone}</p>
                              <p className="text-xs text-indigo-600 mt-2 bg-indigo-50 p-3 rounded-xl border border-indigo-100 text-left">{order.customer.address}, {order.customer.city}</p>
                            </div>
                         </div>
                       </div>
                     </div>

                     <div className="bg-gray-50 p-6 rounded-2xl border border-gray-100 flex flex-col justify-between">
                       <div>
                         <h4 className="text-sm font-bold text-gray-900 mb-4">Items to Deliver</h4>
                         <div className="space-y-2">
                           {order.items.map((item, i) => (
                             <div key={i} className="flex justify-between text-xs">
                               <span className="text-gray-600">{item.quantity}x {item.title}</span>
                             </div>
                           ))}
                         </div>
                       </div>

                       <div className="mt-8 space-y-4">
                         { (order.status === 'awaiting_pickup' || order.status === 'paid' || order.status === 'shipped' || order.status === 'fulfilled' ) ? (
                           <button 
                             onClick={() => handlePickup(order.id)}
                             className="w-full bg-orange-500 text-white py-4 rounded-xl font-bold hover:bg-orange-600 transition-all flex items-center justify-center gap-2"
                           >
                             Confirm Pickup
                           </button>
                         ) : order.status === 'awaiting_payment' ? (
                            <div className="bg-yellow-50 p-4 rounded-xl border border-yellow-100 text-center w-full">
                              <p className="text-[10px] font-bold text-yellow-600 uppercase tracking-widest mb-1">Awaiting Payment</p>
                              <p className="text-[9px] text-gray-500">Wait for customer to approve the {formatPrice(order.deliveryDetails?.deliveryFee || 0, 'TZS', rates, 'TZS')} delivery fee.</p>
                            </div>
                         ) : (
                           <button 
                             onClick={() => setViewingQR(order)}
                             className="w-full bg-indigo-600 text-white py-4 rounded-xl font-bold hover:bg-indigo-700 transition-all flex items-center justify-center gap-2"
                           >
                             Show Confirmation QR
                           </button>
                         )}
                       </div>
                     </div>
                   </div>
                 </div>
               ))
             )}
          </div>
        )}

        {activeTab === 'history' && (
           <div className="bg-white rounded-3xl border border-gray-200 overflow-hidden shadow-sm">
             <div className="overflow-x-auto">
               <table className="w-full text-left">
                 <thead className="bg-gray-50">
                   <tr>
                     <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Order ID</th>
                     <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Date</th>
                     <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Customer</th>
                     <th className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-right">Earning</th>
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-gray-100">
                   {myHistory.map(order => (
                     <tr key={order.id} className="hover:bg-gray-50/50 transition-colors">
                       <td className="px-6 py-4 font-mono text-xs font-bold text-gray-400">#{order.id.slice(0, 8)}</td>
                       <td className="px-6 py-4 text-xs text-gray-500">{new Date(order.deliveryDetails?.deliveredAt || order.createdAt).toLocaleDateString()}</td>
                       <td className="px-6 py-4 text-xs font-bold text-gray-900">{order.customer.name}</td>
                       <td className="px-6 py-4 text-xs font-bold text-green-600 text-right">{formatPrice(order.total * 0.05, currency, rates)}</td>
                     </tr>
                   ))}
                   {myHistory.length === 0 && (
                     <tr>
                       <td colSpan={4} className="px-6 py-12 text-center text-gray-400 italic text-sm">No completed deliveries yet.</td>
                     </tr>
                   )}
                 </tbody>
               </table>
             </div>
           </div>
        )}
      </div>

      {viewingQR && (
        <ConfirmationQRModal 
          order={viewingQR}
          onClose={() => setViewingQR(null)}
        />
      )}
    </div>
  );
};

const AdminPanel = ({ 
  products, 
  addProduct,
  updateProduct,
  deleteProduct,
  orders, 
  updateOrder,
  currency, 
  rates,
  user,
  isAdmin,
  reportDriver
}: { 
  products: Product[]; 
  addProduct: (p: Product) => Promise<void>;
  updateProduct: (p: Product) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
  orders: Order[];
  updateOrder: (id: string, data: Partial<Order>) => Promise<void>;
  currency: string;
  rates: ExchangeRates;
  user: User | null;
  isAdmin: boolean;
  reportDriver: (orderId: string, notes: string) => Promise<void>;
}) => {
  const [viewingPoliceReport, setViewingPoliceReport] = useState<Order | null>(null);
  const [url, setUrl] = useState('');
  const [bulkUrls, setBulkUrls] = useState('');
  const [isBulk, setIsBulk] = useState(false);
  const [loading, setLoading] = useState(false);
  const [markup, setMarkup] = useState(() => {
    const saved = localStorage.getItem('dropship_default_markup');
    return saved ? Number(saved) : 0;
  });
  const [importPreview, setImportPreview] = useState<Product | null>(null);
  const [bulkResults, setBulkResults] = useState<{url: string, status: 'success' | 'error', message?: string}[]>([]);
  const [tab, setTab] = useState<'overview' | 'inventory' | 'scraper' | 'approval' | 'orders' | 'fulfillment' | 'tracking' | 'messages' | 'payouts'>('overview');
  const [approvalSubTab, setApprovalSubTab] = useState<'pending' | 'approved'>('pending');
  const [showConfirmClear, setShowConfirmClear] = useState(false);
  const [orderToCancel, setOrderToCancel] = useState<string | null>(null);

  const getDailyStats = () => {
    const stats: { [key: string]: { date: string, Revenue: number, Profit: number, Cost: number, Orders: number } } = {};
    orders.forEach(o => {
      const date = new Date(o.createdAt).toLocaleDateString();
      if (!stats[date]) {
        stats[date] = { date, Revenue: 0, Profit: 0, Cost: 0, Orders: 0 };
      }
      stats[date].Revenue += o.total;
      stats[date].Profit += o.profit || 0;
      stats[date].Cost += (o.sourceCost || 0) + (o.shippingCost || 0);
      stats[date].Orders += 1;
    });
    return Object.values(stats).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()).slice(-7);
  };

  const getTopProducts = () => {
    const productStats: { [key: string]: { title: string, sales: number, revenue: number, image: string | null } } = {};
    orders.forEach(o => {
      o.items.forEach(item => {
        if (!productStats[item.id]) {
          productStats[item.id] = { title: item.title, sales: 0, revenue: 0, image: item.image || null };
        }
        productStats[item.id].sales += item.quantity;
        productStats[item.id].revenue += (item.price * (1 + item.markup / 100)) * item.quantity;
      });
    });
    return Object.values(productStats).sort((a, b) => b.sales - a.sales).slice(0, 5);
  };

  const dailyStats = getDailyStats();
  const topProducts = getTopProducts();

  useEffect(() => {
    localStorage.setItem('dropship_default_markup', markup.toString());
  }, [markup]);

  const handleFulfill = async (orderId: string) => {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;

    try {
      await updateOrder(orderId, { automationStatus: 'processing', automationLog: [`[SYSTEM] Starting production fulfillment sequence...`] });
      
      const res = await fetch('/api/fulfill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order }),
      });

      if (!res.ok) throw new Error("Fulfillment node unreachable");
      
      const result = await res.json();
      
      await updateOrder(orderId, { 
        automationStatus: result.status, 
        status: 'fulfilled',
        automationLog: result.logs,
        fulfillmentDetails: {
          supplierOrderId: `SUP-${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
          trackingNumber: `TRK-${Math.random().toString(36).substr(2, 12).toUpperCase()}`,
          lastAutomationStep: 'Order Synchronized with Supplier'
        }
      });
      alert("Fulfillment initiated through secure channel.");
    } catch (error) {
      console.error('Fulfillment error:', error);
      await updateOrder(orderId, { 
        automationStatus: 'failed', 
        automationLog: [...(order.automationLog || []), `CRITICAL: ${error instanceof Error ? error.message : String(error)}`]
      });
    }
  };

  const handleClearStore = async () => {
    for (const p of products) {
      await deleteProduct(p.id);
    }
    setShowConfirmClear(false);
  };

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isBulk) {
      const urls = bulkUrls.split('\n').map(u => u.trim()).filter(u => u.startsWith('http'));
      if (urls.length === 0) return;
      
      setLoading(true);
      setBulkResults([]);
      
      for (const targetUrl of urls) {
        try {
          const res = await fetch('/api/scrape', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: targetUrl }),
          });
          
          if (!res.ok) {
            const text = await res.text();
            throw new Error(`Server error (${res.status}): ${text.substring(0, 100)}${text.length > 100 ? '...' : ''}`);
          }
          
          const contentType = res.headers.get('content-type');
          if (!contentType || !contentType.includes('application/json')) {
            const text = await res.text();
            throw new Error(`Unexpected response format: ${text.substring(0, 100)}${text.length > 100 ? '...' : ''}`);
          }

          const data = await res.json();
          if (data.error) throw new Error(data.error);
          
          const newProduct: Product = {
            ...data,
            id: Math.random().toString(36).substr(2, 9),
            markup,
            status: 'pending'
          };
          await addProduct(newProduct);
          setBulkResults(prev => [...prev, { url: targetUrl, status: 'success' }]);
        } catch (err) {
          console.error(`Import failed for ${targetUrl}:`, err);
          setBulkResults(prev => [...prev, { url: targetUrl, status: 'error', message: err instanceof Error ? err.message : 'Unknown error' }]);
        }
      }
      setLoading(false);
      setBulkUrls('');
    } else {
      if (!url) return;
      setLoading(true);
      
      try {
        const res = await fetch('/api/scrape', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url }),
        });

        if (!res.ok) {
          const text = await res.text();
          throw new Error(`Server error (${res.status}): ${text.substring(0, 100)}${text.length > 100 ? '...' : ''}`);
        }

        const contentType = res.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
          const text = await res.text();
          throw new Error(`Unexpected response format: ${text.substring(0, 100)}${text.length > 100 ? '...' : ''}`);
        }

        const data = await res.json();
        if (data.error) throw new Error(data.error);
        
        const newProduct: Product = {
          ...data,
          id: Math.random().toString(36).substr(2, 9),
          markup,
          status: 'pending'
        };
        setImportPreview(newProduct);
        setUrl('');
      } catch (err) {
        console.error('Import failed:', err);
        alert(`Import failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
      } finally {
        setLoading(false);
      }
    }
  };

  const updateStatus = async (id: string, status: 'approved' | 'pending') => {
    const product = products.find(p => p.id === id);
    if (product) {
      await updateProduct({ ...product, status });
    }
  };

  const removeProduct = async (id: string) => {
    await deleteProduct(id);
  };

  const handleCancelOrder = async (id: string) => {
    const order = orders.find(o => o.id === id);
    if (order) {
      await updateOrder(order.id, { 
        status: 'cancelled', 
        automationStatus: 'failed',
        automationLog: [...(order.automationLog || []), `[SYSTEM] Order cancelled by administrator at ${new Date().toLocaleString()}.`]
      });
    }
    setOrderToCancel(null);
  };

  const pendingCount = products.filter(p => p.status === 'pending').length;

  if (!user || !isAdmin) {
    return (
      <div className="max-w-md mx-auto px-4 py-24 text-center">
        <ShieldCheck className="w-16 h-16 text-indigo-600 mx-auto mb-6" />
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Seller Access Restricted</h2>
        <p className="text-gray-600 mb-8">This area is reserved for registered sellers. Please login with a seller account.</p>
        <Link 
          to="/" 
          className="bg-indigo-600 text-white px-8 py-3 rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 flex items-center gap-2 mx-auto justify-center"
        >
          Return to Storefront
        </Link>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="max-w-md mx-auto px-4 py-24 text-center">
        <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-6" />
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Unauthorized</h2>
        <p className="text-gray-600 mb-8">Your account ({user.email}) does not have administrator privileges.</p>
        <Link to="/" className="text-indigo-600 font-bold hover:underline">Return to Store</Link>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 sm:py-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Admin Dashboard</h1>
          <div className="flex items-center gap-4 mt-1">
            <p className="text-sm text-gray-500">Manage your dropshipping empire.</p>
            <button 
              onClick={() => setShowConfirmClear(true)}
              className="text-[10px] font-bold text-red-500 hover:text-red-700 uppercase tracking-widest flex items-center gap-1 transition-colors"
            >
              <Trash2 className="w-3 h-3" />
              Clear Store
            </button>
          </div>
        </div>
        <div className="flex bg-gray-100 p-1 rounded-xl overflow-x-auto scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0 shrink-0">
          <button 
            onClick={() => setTab('overview')}
            className={cn("px-4 py-2 rounded-lg text-sm font-bold transition-all", tab === 'overview' ? "bg-white text-indigo-600 shadow-sm" : "text-gray-500")}
          >
            Overview
          </button>
          <button 
            onClick={() => setTab('inventory')}
            className={cn("px-4 py-2 rounded-lg text-sm font-bold transition-all", tab === 'inventory' ? "bg-white text-indigo-600 shadow-sm" : "text-gray-500")}
          >
            Inventory
          </button>
          <button 
            onClick={() => setTab('scraper')}
            className={cn("px-4 py-2 rounded-lg text-sm font-bold transition-all", tab === 'scraper' ? "bg-white text-indigo-600 shadow-sm" : "text-gray-500")}
          >
            Scraper
          </button>
          <button 
            onClick={() => setTab('approval')}
            className={cn("px-4 py-2 rounded-lg text-sm font-bold transition-all relative", tab === 'approval' ? "bg-white text-indigo-600 shadow-sm" : "text-gray-500")}
          >
            Approval
            {pendingCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] w-4 h-4 flex items-center justify-center rounded-full">
                {pendingCount}
              </span>
            )}
          </button>
          <button 
            onClick={() => setTab('orders')}
            className={cn("px-4 py-2 rounded-lg text-sm font-bold transition-all", tab === 'orders' ? "bg-white text-indigo-600 shadow-sm" : "text-gray-500")}
          >
            Orders
          </button>
          <button 
            onClick={() => setTab('fulfillment')}
            className={cn("px-4 py-2 rounded-lg text-sm font-bold transition-all", tab === 'fulfillment' ? "bg-white text-indigo-600 shadow-sm" : "text-gray-500")}
          >
            Fulfillment
          </button>
          <button 
            onClick={() => setTab('tracking')}
            className={cn("px-4 py-2 rounded-lg text-sm font-bold transition-all", tab === 'tracking' ? "bg-white text-indigo-600 shadow-sm" : "text-gray-500")}
          >
            Tracking
          </button>
          <button 
            onClick={() => setTab('messages')}
            className={cn("px-4 py-2 rounded-lg text-sm font-bold transition-all", tab === 'messages' ? "bg-white text-indigo-600 shadow-sm" : "text-gray-500")}
          >
            Messages
          </button>
          <button 
            onClick={() => setTab('payouts')}
            className={cn("px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-1.5", tab === 'payouts' ? "bg-white text-indigo-600 shadow-sm" : "text-gray-500")}
          >
            <CreditCard className="w-4 h-4 text-indigo-500" />
            Platform Payouts
          </button>
        </div>
      </div>

      <AnimatePresence>
        {showConfirmClear && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl p-8 max-w-sm w-full text-center shadow-2xl"
            >
              <Trash2 className="w-12 h-12 text-red-500 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-gray-900 mb-2">Clear Store?</h3>
              <p className="text-gray-600 mb-6 text-sm">Are you sure you want to clear ALL products? This cannot be undone.</p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowConfirmClear(false)}
                  className="flex-1 px-6 py-2 rounded-xl font-bold text-gray-500 hover:bg-gray-100 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleClearStore}
                  className="flex-1 px-6 py-2 rounded-xl font-bold bg-red-500 text-white hover:bg-red-600 transition-colors"
                >
                  Clear All
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {orderToCancel && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl p-8 max-w-sm w-full text-center shadow-2xl"
            >
              <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-gray-900 mb-2">Cancel Order?</h3>
              <p className="text-gray-600 mb-6 text-sm">Are you sure you want to cancel this order? This will stop any further processing.</p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setOrderToCancel(null)}
                  className="flex-1 px-6 py-2 rounded-xl font-bold text-gray-500 hover:bg-gray-100 transition-colors"
                >
                  Back
                </button>
                <button 
                  onClick={() => handleCancelOrder(orderToCancel)}
                  className="flex-1 px-6 py-2 rounded-xl font-bold bg-red-500 text-white hover:bg-red-600 transition-colors"
                >
                  Confirm Cancel
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {tab === 'overview' && (
          <motion.div 
            key="overview"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-8"
          >
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600">
                  <TrendingUp className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Total Revenue</div>
                  <div className="text-2xl font-bold text-gray-900">
                    {formatPrice(orders.reduce((sum, o) => sum + o.total, 0), currency, rates, 'USD')}
                  </div>
                </div>
              </div>
              <div className="h-24 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={dailyStats}>
                    <Area type="monotone" dataKey="Revenue" stroke="#4f46e5" fill="#e0e7ff" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center text-green-600">
                  <DollarSign className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Total Profit</div>
                  <div className="text-2xl font-bold text-green-600">
                    {formatPrice(orders.reduce((sum, o) => sum + (o.profit || 0), 0), currency, rates, 'USD')}
                  </div>
                </div>
              </div>
              <div className="h-24 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={dailyStats}>
                    <Area type="monotone" dataKey="Profit" stroke="#10b981" fill="#d1fae5" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center text-orange-600">
                  <Package className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Total Orders</div>
                  <div className="text-2xl font-bold text-orange-600">
                    {orders.length}
                  </div>
                </div>
              </div>
              <div className="h-24 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={dailyStats}>
                    <Area type="monotone" dataKey="Orders" stroke="#f97316" fill="#ffedd5" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-purple-50 rounded-xl flex items-center justify-center text-purple-600">
                  <BarChart3 className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Avg. Profit / Order</div>
                  <div className="text-2xl font-bold text-purple-600">
                    {formatPrice(orders.length > 0 ? orders.reduce((sum, o) => sum + (o.profit || 0), 0) / orders.length : 0, currency, rates, 'USD')}
                  </div>
                </div>
              </div>
              <div className="h-24 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={dailyStats}>
                    <Area type="monotone" dataKey="Profit" stroke="#8b5cf6" fill="#ede9fe" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="bg-white p-8 rounded-3xl border border-gray-200 shadow-sm">
              <h3 className="text-lg font-bold mb-6">Financial Performance (Last 7 Days)</h3>
              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dailyStats}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#9ca3af' }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#9ca3af' }} />
                    <Tooltip 
                      contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                    />
                    <Bar dataKey="Revenue" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Cost" fill="#f97316" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Profit" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white p-8 rounded-3xl border border-gray-200 shadow-sm">
              <h3 className="text-lg font-bold mb-6">Order Volume Trend</h3>
              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={dailyStats}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#9ca3af' }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#9ca3af' }} />
                    <Tooltip 
                      contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                    />
                    <Area type="monotone" dataKey="Orders" stroke="#f97316" fill="#ffedd5" strokeWidth={3} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 bg-white p-8 rounded-3xl border border-gray-200 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold">Top Selling Products</h3>
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">By Sales Volume</div>
              </div>
              <div className="space-y-4">
                {topProducts.map((product, i) => (
                  <div key={i} className="flex items-center gap-4 p-4 bg-gray-50 rounded-2xl border border-gray-100 hover:bg-white hover:shadow-md transition-all group">
                    <div className="w-12 h-12 rounded-xl overflow-hidden bg-white border border-gray-200 shrink-0">
                      <img src={product.image || undefined} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-bold text-gray-900 truncate">{product.title}</h4>
                      <p className="text-xs text-gray-500">{product.sales} units sold</p>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold text-indigo-600">{formatPrice(product.revenue, currency, rates, 'USD')}</div>
                      <div className="text-[10px] text-gray-400 uppercase tracking-tighter">Revenue</div>
                    </div>
                  </div>
                ))}
                {topProducts.length === 0 && (
                  <div className="text-center py-12 text-gray-400 italic">No sales data yet</div>
                )}
              </div>
            </div>

            <div className="space-y-8">
              <div className="bg-white p-8 rounded-3xl border border-gray-200 shadow-sm">
                <h3 className="text-lg font-bold mb-6">Profit by Category</h3>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={Array.from(new Set(orders.flatMap(o => o.items.map(i => i.category || 'General')))).map(cat => ({
                          name: cat,
                          value: orders.reduce((sum, o) => sum + o.items.filter(i => (i.category || 'General') === cat).reduce((s, i) => {
                            const itemProfit = (i.price * (i.markup / 100)) - (i.shippingCost || 0);
                            return s + (itemProfit * i.quantity);
                          }, 0), 0)
                        })).filter(d => d.value > 0)}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {Array.from(new Set(orders.flatMap(o => o.items.map(i => i.category || 'General')))).map((_, index) => (
                          <Cell key={`cell-${index}`} fill={['#4f46e5', '#10b981', '#f97316', '#8b5cf6', '#ec4899'][index % 5]} />
                        ))}
                      </Pie>
                      <Tooltip 
                        formatter={(value: number) => formatPrice(value, 'USD', rates, 'USD')}
                        contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                      />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-white p-8 rounded-3xl border border-gray-200 shadow-sm">
                <h3 className="text-lg font-bold mb-6">Profit Breakdown</h3>
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 bg-indigo-600 rounded-full" />
                      <span className="text-sm text-gray-600">Product Costs</span>
                    </div>
                    <span className="font-bold">{formatPrice(orders.reduce((sum, o) => sum + (o.sourceCost || 0), 0), currency, rates, 'USD')}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 bg-orange-500 rounded-full" />
                      <span className="text-sm text-gray-600">Shipping Costs</span>
                    </div>
                    <span className="font-bold">{formatPrice(orders.reduce((sum, o) => sum + (o.shippingCost || 0), 0), currency, rates, 'USD')}</span>
                  </div>
                  <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 bg-green-500 rounded-full" />
                      <span className="text-sm font-bold">Net Profit</span>
                    </div>
                    <span className="font-bold text-green-600">{formatPrice(orders.reduce((sum, o) => sum + (o.profit || 0), 0), currency, rates, 'USD')}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {tab === 'scraper' && (
        <motion.div 
          key="scraper"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className="space-y-8"
        >
          <div className="bg-white rounded-3xl border border-gray-200 p-8 shadow-sm">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-orange-50 rounded-2xl flex items-center justify-center text-orange-600">
                  <Search className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Product Scraper</h2>
                  <p className="text-sm text-gray-500">Import products from Alibaba, Amazon, or any competitor URL.</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 px-3 py-1.5 bg-orange-50 rounded-lg border border-orange-100">
                  <img src="https://upload.wikimedia.org/wikipedia/en/thumb/8/80/Alibaba.com_logo.svg/1200px-Alibaba.com_logo.svg.png" alt="Alibaba" className="h-4 object-contain opacity-80" referrerPolicy="no-referrer" />
                  <span className="text-[10px] font-bold text-orange-700 uppercase tracking-tighter">Ready</span>
                </div>
                <div className="flex bg-gray-100 p-1 rounded-xl overflow-x-auto scrollbar-hide">
                  <button 
                    onClick={() => setIsBulk(false)}
                    className={cn("px-3 py-1.5 rounded-lg text-xs font-bold transition-all", !isBulk ? "bg-white text-indigo-600 shadow-sm" : "text-gray-500")}
                  >
                    Single URL
                  </button>
                  <button 
                    onClick={() => setIsBulk(true)}
                    className={cn("px-3 py-1.5 rounded-lg text-xs font-bold transition-all", isBulk ? "bg-white text-indigo-600 shadow-sm" : "text-gray-500")}
                  >
                    Bulk Import
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
              <div className="lg:col-span-2">
                <form onSubmit={handleImport} className="grid grid-cols-1 gap-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="md:col-span-2">
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                        {isBulk ? "Product URLs (one per line)" : "Product URL"}
                      </label>
                      {isBulk ? (
                        <textarea
                          value={bulkUrls}
                          onChange={(e) => setBulkUrls(e.target.value)}
                          placeholder="https://www.alibaba.com/product-detail/..."
                          className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all h-32 font-mono text-sm"
                          required
                        />
                      ) : (
                        <input
                          type="url"
                          value={url}
                          onChange={(e) => setUrl(e.target.value)}
                          placeholder="https://www.alibaba.com/product-detail/..."
                          className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                          required={!isBulk}
                        />
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Default Profit Margin (%)</label>
                      <input
                        type="number"
                        value={markup}
                        onChange={(e) => setMarkup(Number(e.target.value))}
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                        min="0"
                        required
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={loading}
                    className="bg-indigo-600 text-white py-4 rounded-xl font-bold hover:bg-indigo-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-indigo-200"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        {isBulk ? "Processing Bulk Import..." : "Analyzing Website Structure..."}
                      </>
                    ) : (
                      <>
                        <Package className="w-5 h-5" />
                        {isBulk ? "Start Bulk Import" : "Scrape & Import Product"}
                      </>
                    )}
                  </button>
                </form>
              </div>

              <div className="bg-orange-50/50 rounded-2xl p-6 border border-orange-100 h-fit">
                <h3 className="text-sm font-bold text-orange-800 mb-4 flex items-center gap-2">
                  <Info className="w-4 h-4" />
                  Alibaba Import Guide
                </h3>
                <ul className="space-y-3 text-[11px] text-orange-700">
                  <li className="flex gap-2">
                    <span className="font-bold">1.</span>
                    <span>Use the full product detail URL, not the search results.</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-bold">2.</span>
                    <span>The system automatically detects price ranges and picks the lowest base price.</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-bold">3.</span>
                    <span>MOQ (Minimum Order Quantity) is extracted and added to product features.</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-bold">4.</span>
                    <span>All variation images (colors, sizes) are imported for your storefront.</span>
                  </li>
                </ul>
                <div className="mt-6 pt-6 border-t border-orange-100">
                  <p className="text-[10px] text-orange-600 italic">Tip: Alibaba prices are often negotiable. You can adjust the imported price in the Inventory tab.</p>
                </div>
              </div>
            </div>

            <div className="mt-12">
              <h3 className="text-sm font-bold text-gray-900 mb-6 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-indigo-600" />
                Popular Alibaba Categories
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { name: 'Consumer Electronics', url: 'https://www.alibaba.com/Consumer-Electronics_p44' },
                  { name: 'Home & Garden', url: 'https://www.alibaba.com/Home-Garden_p15' },
                  { name: 'Apparel & Accessories', url: 'https://www.alibaba.com/Apparel_p3' },
                  { name: 'Beauty & Personal Care', url: 'https://www.alibaba.com/Beauty-Personal-Care_p18' }
                ].map((cat, i) => (
                  <a 
                    key={i}
                    href={cat.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group p-4 bg-gray-50 rounded-2xl border border-gray-100 hover:border-indigo-200 hover:bg-white transition-all text-center"
                  >
                    <div className="text-xs font-bold text-gray-900 group-hover:text-indigo-600 transition-colors">{cat.name}</div>
                    <div className="text-[10px] text-gray-400 mt-1 flex items-center justify-center gap-1">
                      Browse on Alibaba <ExternalLink className="w-2 h-2" />
                    </div>
                  </a>
                ))}
              </div>
            </div>

            {bulkResults.length > 0 && (
              <div className="mt-8 space-y-2">
                <h3 className="text-sm font-bold text-gray-900 mb-4">Bulk Import Status</h3>
                {bulkResults.map((res, i) => (
                  <div key={i} className={cn("p-3 rounded-xl text-xs flex items-center justify-between", res.status === 'success' ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700")}>
                    <span className="truncate flex-1 mr-4">{res.url}</span>
                    <span className="font-bold uppercase tracking-widest text-[10px]">
                      {res.status === 'success' ? "Success" : `Error: ${res.message}`}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      )}

      {tab === 'inventory' && (
        <motion.div 
          key="inventory"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className="space-y-8"
        >
          <div className="flex flex-col gap-8">
              <div className="bg-indigo-900 text-white rounded-2xl p-8 shadow-xl flex flex-col justify-between flex-1">
                <div>
                  <h2 className="text-lg font-semibold mb-2 opacity-80">Total Projected Profit</h2>
                  <div className="text-5xl font-extrabold tracking-tighter mb-4">
                    {formatPrice(products.filter(p => p.status === 'approved').reduce((sum, p) => {
                      const profitUSD = (p.price * (p.markup / 100)) / (rates[p.sourceCurrency] || 1);
                      return sum + profitUSD;
                    }, 0), currency, rates, 'USD')}
                  </div>
                  <p className="text-indigo-200 text-sm">Based on one sale of each approved item.</p>
                </div>
                <div className="pt-6 border-t border-indigo-800 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-indigo-800 rounded-full flex items-center justify-center">
                      <Store className="w-5 h-5 text-indigo-300" />
                    </div>
                    <div className="text-sm">
                      <div className="font-bold">Supplier Account</div>
                      <div className="opacity-60">Connected (mr.dummy3719@gmail.com)</div>
                    </div>
                  </div>
                  <button 
                    onClick={() => {
                      const email = prompt("Enter your supplier email to connect:", "mr.dummy3719@gmail.com");
                      if (email) alert(`Successfully connected to supplier account: ${email}`);
                    }}
                    className="text-xs font-bold bg-white text-indigo-900 px-3 py-1.5 rounded-lg hover:bg-indigo-50 transition-colors"
                  >
                    Change Account
                  </button>
                </div>
              </div>

              <div className="bg-gray-50 rounded-2xl p-6 border border-gray-200">
                <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-indigo-600" />
                  How Fulfillment Works
                </h3>
                <ul className="space-y-3 text-xs text-gray-600">
                  <li className="flex gap-2">
                    <span className="font-bold text-indigo-600">1.</span>
                    <span>Customer pays the marked-up price via M-Pesa.</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-bold text-indigo-600">2.</span>
                    <span>20% profit is sent to 0797691203 automatically.</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-bold text-indigo-600">3.</span>
                    <span>The system logs into your supplier account.</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="font-bold text-indigo-600">4.</span>
                    <span>It uses the customer's shipping info to place the order on the source site.</span>
                  </li>
                </ul>
              </div>
            </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Active Inventory ({products.filter(p => p.status === 'approved').length})</h2>
              <button 
                onClick={async () => {
                  if (confirm(`Update all ${products.filter(p => p.status === 'approved').length} products to ${markup}% markup?`)) {
                    const approved = products.filter(p => p.status === 'approved');
                    await Promise.all(approved.map(p => updateProduct({ ...p, markup })));
                  }
                }}
                className="text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-lg hover:bg-indigo-100 transition-colors"
              >
                Apply {markup}% Markup to All
              </button>
            </div>
            {products.filter(p => p.status === 'approved').map(p => (
              <div key={p.id} className="bg-white p-4 rounded-xl border border-gray-100 hover:border-indigo-200 transition-colors">
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                  <div className="flex items-center gap-4 w-full sm:w-auto">
                    <img src={p.image || null} className="w-16 h-16 object-cover rounded-lg shrink-0" referrerPolicy="no-referrer" />
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-gray-900 truncate">{p.title}</h4>
                      {p.variations && p.variations.length > 0 && (
                        <p className="text-[9px] text-gray-400">
                          {p.variations.length} options: {p.variations.map(v => v.name).join(', ')}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex-1 w-full sm:w-auto">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                      <div className="flex items-center gap-1">
                        <span className="text-gray-400 text-[10px] uppercase font-bold">Cost:</span>
                        <input 
                          type="number" 
                          value={p.price} 
                          onChange={(e) => updateProduct({ ...p, price: Number(e.target.value) })}
                          className="w-20 px-2 py-1 border border-gray-200 rounded text-xs font-bold"
                        />
                        <select 
                          value={p.sourceCurrency} 
                          onChange={(e) => updateProduct({ ...p, sourceCurrency: e.target.value })}
                          className="px-1 py-1 border border-gray-200 rounded text-[10px] font-bold"
                        >
                          {Object.keys(rates).map(c => <option key={c} value={c}>{c}</option>)}
                          {!rates['TZS'] && <option value="TZS">TZS</option>}
                        </select>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-gray-400 text-[10px] uppercase font-bold">Markup:</span>
                        <input 
                          type="number" 
                          value={p.markup} 
                          onChange={(e) => updateProduct({ ...p, markup: Number(e.target.value) })}
                          className="w-14 px-2 py-1 border border-gray-200 rounded text-xs font-bold"
                        />
                        <span className="text-gray-400">%</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-gray-400 text-[10px] uppercase font-bold">Ship:</span>
                        <input 
                          type="number" 
                          value={p.shippingCost || 0} 
                          onChange={(e) => updateProduct({ ...p, shippingCost: Number(e.target.value) })}
                          className="w-14 px-2 py-1 border border-gray-200 rounded text-xs font-bold"
                        />
                      </div>
                      <span className="text-indigo-600 font-bold text-xs">
                        Retail: {formatPrice(p.price * (1 + p.markup / 100), currency, rates, p.sourceCurrency)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 w-full sm:w-auto justify-end pt-2 sm:pt-0 border-t sm:border-t-0 border-gray-50">
                    <button onClick={() => updateStatus(p.id, 'pending')} className="p-2 text-gray-400 hover:text-orange-500" title="Move to Approval">
                      <Clock className="w-5 h-5" />
                    </button>
                    <a href={p.sourceUrl} target="_blank" rel="noopener noreferrer" className="p-2 text-gray-400 hover:text-indigo-600">
                      <ExternalLink className="w-5 h-5" />
                    </a>
                    <button onClick={() => removeProduct(p.id)} className="p-2 text-gray-400 hover:text-red-500">
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
                <VerificationLogs logs={p.verificationLogs} />
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {tab === 'approval' && (
        <motion.div 
          key="approval"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className="space-y-6"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold">Product Approval Center</h2>
            <div className="flex bg-gray-100 p-1 rounded-xl overflow-x-auto scrollbar-hide">
              <button 
                onClick={() => setApprovalSubTab('pending')}
                className={cn("px-4 py-1.5 rounded-lg text-xs font-bold transition-all", approvalSubTab === 'pending' ? "bg-white text-indigo-600 shadow-sm" : "text-gray-500")}
              >
                Pending ({pendingCount})
              </button>
              <button 
                onClick={() => setApprovalSubTab('approved')}
                className={cn("px-4 py-1.5 rounded-lg text-xs font-bold transition-all", approvalSubTab === 'approved' ? "bg-white text-indigo-600 shadow-sm" : "text-gray-500")}
              >
                Approved ({products.filter(p => p.status === 'approved').length})
              </button>
            </div>
          </div>

          {approvalSubTab === 'pending' ? (
            products.filter(p => p.status === 'pending').length === 0 ? (
              <div className="text-center py-12 bg-gray-50 rounded-2xl text-gray-400">
                No products waiting for approval.
              </div>
            ) : (
              products.filter(p => p.status === 'pending').map(p => {
                const availableImages = Array.from(new Set([
                  p.image,
                  ...(p.gallery || []),
                  ...(p.variations?.flatMap(v => v.options.map(o => o.image).filter((img): img is string => !!img)) || [])
                ]));

                return (
                  <div key={p.id} className="bg-white border border-gray-200 rounded-2xl p-6 flex flex-col md:flex-row gap-6">
                    <div className="w-full md:w-48 space-y-4">
                      <div className="relative group">
                        <img src={p.image || null} className="w-full h-48 object-cover rounded-xl shadow-sm border border-gray-100" referrerPolicy="no-referrer" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-xl">
                          <span className="text-white text-[10px] font-bold uppercase tracking-widest">Primary Image</span>
                        </div>
                      </div>
                      
                      {availableImages.length > 1 && (
                        <div className="space-y-2">
                          <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Select Primary Image</p>
                          <div className="grid grid-cols-4 gap-2">
                            {availableImages.map((img, i) => (
                              <button
                                key={i}
                                onClick={() => updateProduct({ ...p, image: img })}
                                className={cn(
                                  "aspect-square rounded-lg overflow-hidden border-2 transition-all",
                                  p.image === img ? "border-indigo-600 shadow-sm scale-105" : "border-transparent opacity-50 hover:opacity-100"
                                )}
                              >
                                <img src={img || null} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex justify-between items-start mb-4">
                        <input 
                          type="text" 
                          value={p.title} 
                          onChange={(e) => updateProduct({ ...p, title: e.target.value })}
                          className="text-lg font-bold text-gray-900 bg-transparent border-b border-transparent hover:border-gray-200 focus:border-indigo-500 outline-none w-full mr-4"
                        />
                        <div className="flex gap-2 shrink-0">
                          {(p as any).isVerified && (
                            <span className="bg-green-100 text-green-600 text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wider flex items-center gap-1">
                              <ShieldCheck className="w-3 h-3" />
                              Verified
                            </span>
                          )}
                          <span className="bg-orange-100 text-orange-600 text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wider">Pending</span>
                        </div>
                      </div>
                      <textarea 
                        value={p.description} 
                        onChange={(e) => updateProduct({ ...p, description: e.target.value })}
                        className="text-sm text-gray-500 mb-4 w-full bg-transparent border-b border-transparent hover:border-gray-200 focus:border-indigo-500 outline-none resize-none h-20"
                      />
                      
                      {p.features && p.features.length > 0 && (
                        <div className="mb-6 space-y-2">
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Extracted Features</p>
                          <div className="flex flex-wrap gap-2">
                            {p.features.map((feature, i) => (
                              <span key={i} className="bg-gray-50 text-gray-600 text-[10px] px-2 py-1 rounded-lg border border-gray-100">{feature}</span>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="flex items-center gap-6 mb-4">
                        <div>
                          <span className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Source Cost</span>
                          <div className="flex items-center gap-2">
                            <input 
                              type="number" 
                              value={p.price} 
                              onChange={(e) => updateProduct({ ...p, price: Number(e.target.value) })}
                              className="w-32 px-3 py-2 border border-gray-200 rounded-xl text-lg font-bold"
                            />
                            <select 
                              value={p.sourceCurrency} 
                              onChange={(e) => updateProduct({ ...p, sourceCurrency: e.target.value })}
                              className="px-2 py-2 border border-gray-200 rounded-xl text-sm font-bold"
                            >
                              {Object.keys(rates).map(c => <option key={c} value={c}>{c}</option>)}
                              {!rates['TZS'] && <option value="TZS">TZS</option>}
                            </select>
                          </div>
                        </div>
                        <div>
                          <span className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Markup (%)</span>
                          <input 
                            type="number" 
                            value={p.markup} 
                            onChange={(e) => updateProduct({ ...p, markup: Number(e.target.value) })}
                            className="w-24 px-3 py-2 border border-gray-200 rounded-xl text-lg font-bold text-indigo-600"
                          />
                        </div>
                        <div>
                          <span className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Retail Price</span>
                          <span className="text-2xl font-bold text-green-600">
                            {formatPrice(p.price * (1 + p.markup / 100), currency, rates, p.sourceCurrency)}
                          </span>
                        </div>
                      </div>

                      <div className="flex gap-3">
                        <button 
                          onClick={() => updateStatus(p.id, 'approved')}
                          className="flex-1 bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 transition-all flex items-center justify-center gap-2"
                        >
                          <CheckCircle className="w-4 h-4" />
                          Approve & List
                        </button>
                        <button 
                          onClick={() => removeProduct(p.id)}
                          className="px-6 border border-gray-200 text-gray-600 py-3 rounded-xl font-bold hover:bg-red-50 transition-all hover:text-red-600"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {products.filter(p => p.status === 'approved').length === 0 ? (
                <div className="col-span-full text-center py-12 bg-gray-50 rounded-2xl text-gray-400">
                  No approved products yet.
                </div>
              ) : (
                products.filter(p => p.status === 'approved').map(p => {
                  const availableImages = Array.from(new Set([
                    p.image,
                    ...(p.gallery || []),
                    ...(p.variations?.flatMap(v => v.options.map(o => o.image).filter((img): img is string => !!img)) || [])
                  ]));

                  return (
                    <div key={p.id} className="bg-white border border-gray-200 rounded-2xl p-4 flex gap-4 shadow-sm">
                      <div className="w-24 h-24 shrink-0 relative group">
                        <img src={p.image || null} className="w-full h-full object-cover rounded-lg border border-gray-100" referrerPolicy="no-referrer" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-lg">
                          <div className="grid grid-cols-2 gap-1 p-1">
                            {availableImages.slice(0, 4).map((img, i) => (
                              <button key={i} onClick={() => updateProduct({ ...p, image: img })} className="w-4 h-4 rounded-sm overflow-hidden border border-white/50">
                                <img src={img || null} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-bold text-gray-900 truncate mb-2">{p.title}</h4>
                        <div className="grid grid-cols-2 gap-3 mb-3">
                          <div>
                            <span className="block text-[8px] font-bold text-gray-400 uppercase mb-0.5">Markup %</span>
                            <input 
                              type="number" 
                              value={p.markup} 
                              onChange={(e) => updateProduct({ ...p, markup: Number(e.target.value) })}
                              className="w-full px-2 py-1 border border-gray-200 rounded-lg text-xs font-bold text-indigo-600"
                            />
                          </div>
                          <div>
                            <span className="block text-[8px] font-bold text-gray-400 uppercase mb-0.5">Retail Price</span>
                            <div className="text-xs font-bold text-green-600 truncate">
                              {formatPrice(p.price * (1 + p.markup / 100), currency, rates, p.sourceCurrency)}
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button 
                            onClick={() => updateStatus(p.id, 'pending')}
                            className="flex-1 text-[10px] font-bold text-orange-600 bg-orange-50 py-1.5 rounded-lg hover:bg-orange-100 transition-colors"
                          >
                            Move to Pending
                          </button>
                          <button 
                            onClick={() => removeProduct(p.id)}
                            className="px-3 text-[10px] font-bold text-red-600 bg-red-50 py-1.5 rounded-lg hover:bg-red-100 transition-colors"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </motion.div>
      )}

      {tab === 'orders' && (
        <motion.div 
          key="orders"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className="space-y-8"
        >
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            <div className="lg:col-span-3 space-y-6">
              <div className="bg-indigo-600 rounded-3xl p-8 text-white relative overflow-hidden shadow-2xl shadow-indigo-200">
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
                <div className="relative z-10">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-md">
                      <ShieldCheck className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold">Smart Agent Dashboard</h2>
                      <p className="text-indigo-100 text-sm">Automated Financial Split & Fulfillment Engine</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
                    <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/20">
                      <div className="text-[10px] font-bold text-indigo-200 uppercase tracking-widest mb-1">1. Payment Capture</div>
                      <p className="text-xs text-indigo-50 leading-relaxed">Funds are captured via M-Pesa/Bank and held in a secure Escrow wallet.</p>
                    </div>
                    <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/20">
                      <div className="text-[10px] font-bold text-indigo-200 uppercase tracking-widest mb-1">2. Smart Split</div>
                      <p className="text-xs text-indigo-50 leading-relaxed">Agent automatically splits funds: 3% Referrer, 7% Owner, 90% Fulfillment.</p>
                    </div>
                    <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/20">
                      <div className="text-[10px] font-bold text-indigo-200 uppercase tracking-widest mb-1">3. Auto-Purchase</div>
                      <p className="text-xs text-indigo-50 leading-relaxed">Agent uses fulfillment funds to buy from source and ship to customer.</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm">
                  <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Total Revenue (Escrow)</div>
                  <div className="text-2xl font-bold text-gray-900">
                    {formatPrice(orders.reduce((sum, o) => sum + o.total, 0), currency, rates, 'USD')}
                  </div>
                  <div className="text-[10px] text-gray-400 mt-1">Total funds processed by agent</div>
                </div>
                <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm">
                  <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Total Profit (Released)</div>
                  <div className="text-2xl font-bold text-green-600">
                    {formatPrice(orders.reduce((sum, o) => sum + (o.profit || 0), 0), currency, rates, 'USD')}
                  </div>
                  <div className="text-[10px] text-gray-400 mt-1">Sent to: 0797691203</div>
                </div>
                <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm">
                  <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Source Costs (Allocated)</div>
                  <div className="text-2xl font-bold text-orange-600">
                    {formatPrice(orders.reduce((sum, o) => sum + (o.sourceCost || 0), 0), currency, rates, 'USD')}
                  </div>
                  <div className="text-[10px] text-gray-400 mt-1">Funds used for supplier purchases</div>
                </div>
              </div>

              <div className="space-y-6">
                <h2 className="text-xl font-bold">Recent Orders ({orders.length})</h2>
          {orders.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 rounded-2xl text-gray-400">
              No orders yet.
            </div>
          ) : (
            <div className="overflow-x-auto border border-gray-200 rounded-2xl">
              <table className="w-full text-left border-collapse">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase">Order ID</th>
                    <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase">Customer</th>
                    <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase">Items</th>
                    <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase">Total</th>
                    <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase">Status</th>
                    <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase">Automation Log</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {orders.map(order => (
                    <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 font-mono text-sm">{order.id}</td>
                      <td className="px-6 py-4">
                        <div className="text-sm font-bold text-gray-900">{order.customer.name}</div>
                        <div className="text-xs text-gray-500">{order.customer.email}</div>
                        <div className="text-[10px] text-indigo-600 font-mono mt-1">{order.customer.phone}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-xs font-bold text-gray-900 mb-1">{order.items.length} items</div>
                        <div className="space-y-1">
                          {order.items.map((item, i) => (
                            <div key={i} className="text-[10px] text-gray-500 leading-tight">
                              {item.quantity}x {item.title}
                              {item.isVirtual && (order.status === 'paid' || order.status === 'delivered') && (
                                <a 
                                  href={item.digitalFileUrl} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="mt-1 flex items-center gap-1 text-[10px] bg-green-50 text-green-600 px-2 py-0.5 rounded border border-green-200 hover:bg-green-100 transition-colors w-fit"
                                >
                                  <Download className="w-3 h-3" />
                                  Access Digital Asset
                                </a>
                              )}
                              {item.isVirtual && order.status !== 'paid' && order.status !== 'delivered' && (
                                <div className="mt-1 text-[9px] text-orange-400 italic flex items-center gap-1">
                                  <Lock className="w-2.5 h-2.5" />
                                  Asset reveals after payment
                                </div>
                              )}
                              {item.selectedVariations && Object.entries(item.selectedVariations).length > 0 && (
                                <div className="text-indigo-400 italic">
                                  {Object.entries(item.selectedVariations).map(([n, v]) => `${n}: ${v}`).join(', ')}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-[10px] text-gray-400 uppercase font-bold mb-1">Financial Breakdown</div>
                        <div className="flex flex-col gap-1">
                          <div className="flex justify-between text-xs">
                            <span className="text-gray-500">Customer Paid:</span>
                            <span className="font-bold text-gray-900">{formatPrice(order.total, order.currency || 'USD', rates, 'USD')}</span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-gray-500">Source Cost:</span>
                            <span className="font-bold text-orange-600">
                              {formatPrice(order.sourceCost || order.items.reduce((sum, item) => sum + (item.price * item.quantity) / (rates[item.sourceCurrency] || 1), 0), order.currency || 'USD', rates, 'USD')}
                            </span>
                          </div>
                          {order.referralCommission !== undefined && order.referralCommission > 0 && (
                            <div className="flex justify-between text-[10px]">
                              <span className="text-gray-400">Referral (3%):</span>
                              <span className="font-bold text-blue-500">
                                {formatPrice(order.referralCommission, order.currency || 'USD', rates, 'USD')}
                              </span>
                            </div>
                          )}
                          <div className="flex justify-between text-xs pt-1 border-t border-gray-100">
                            <span className="text-gray-500">Net Profit:</span>
                            <span className="font-bold text-green-600">
                              {formatPrice(order.ownerProfit || order.profit || 0, order.currency || 'USD', rates, 'USD')}
                            </span>
                          </div>
                        </div>
                        <div className="mt-2 flex items-center justify-between">
                          <div className="text-[9px] text-indigo-400 font-mono flex items-center gap-1">
                            {order.paymentMethod === 'bank_transfer' ? <CreditCard className="w-2 h-2" /> : <Smartphone className="w-2 h-2" />}
                            {order.paymentMethod === 'bank_transfer' ? 'Bank: 0797691203' : 'M-Pesa: 0797691203'}
                          </div>
                          <span className={cn(
                            "text-[8px] font-bold px-1.5 py-0.5 rounded uppercase tracking-tighter",
                            order.status === 'paid' ? "bg-yellow-100 text-yellow-700" : "bg-green-100 text-green-700"
                          )}>
                            {order.status === 'paid' ? 'In Escrow' : 'Released'}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-2">
                          <select 
                            value={order.status}
                            onChange={(e) => {
                              const newStatus = e.target.value as Order['status'];
                              updateOrder(order.id, { status: newStatus });
                            }}
                            className={cn(
                              "text-[10px] font-bold px-2 py-1 rounded-lg uppercase tracking-wider w-fit border-none outline-none cursor-pointer shadow-sm",
                              order.status === 'pending' ? "bg-orange-100 text-orange-600" :
                              order.status === 'paid' ? "bg-indigo-100 text-indigo-600" :
                              order.status === 'fulfilled' ? "bg-blue-100 text-blue-600" :
                              order.status === 'shipped' ? "bg-purple-100 text-purple-600" :
                              order.status === 'cancelled' ? "bg-red-100 text-red-600" :
                              "bg-green-100 text-green-600"
                            )}
                          >
                            <option value="pending">Pending</option>
                            <option value="paid">Paid</option>
                            <option value="fulfilled">Fulfilled</option>
                            <option value="shipped">Shipped</option>
                            <option value="delivered">Delivered</option>
                            <option value="cancelled">Cancelled</option>
                          </select>
                          <span className={cn(
                            "text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wider w-fit",
                            order.automationStatus === 'processing' ? "bg-indigo-100 text-indigo-600 animate-pulse" :
                            order.automationStatus === 'completed' ? "bg-green-100 text-green-600" :
                            order.automationStatus === 'failed' ? "bg-red-100 text-red-600" :
                            "bg-gray-100 text-gray-600"
                          )}>
                            Auto: {order.automationStatus || 'idle'}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-2">
                          <AutomationLogView logs={order.automationLog} />
                          {order.status === 'paid' && (order.automationStatus === 'idle' || !order.automationStatus) && (
                            <button 
                              onClick={() => handleFulfill(order.id)}
                              className="flex items-center gap-1 text-[10px] font-bold text-indigo-600 hover:text-indigo-800 transition-colors uppercase tracking-widest bg-indigo-50 px-2 py-1 rounded-lg"
                            >
                              <Play className="w-3 h-3" />
                              Fulfill Order
                            </button>
                          )}
                          {(order.status === 'pending' || order.status === 'paid') && (
                            <button 
                              onClick={() => updateOrder(order.id, { status: 'cancelled' })}
                              className="flex items-center gap-1 text-[10px] font-bold text-red-500 hover:text-red-700 transition-colors uppercase tracking-widest"
                            >
                              <X className="w-3 h-3" />
                              Cancel Order
                            </button>
                          )}
                          {order.deliveryDetails?.driverId && (order.status === 'shipped' || order.status === 'picked_up') && (
                            <button 
                              onClick={() => {
                                const notes = prompt("Describe what went wrong with the delivery:");
                                if (notes) reportDriver(order.id, notes);
                              }}
                              className="flex items-center gap-1 text-[10px] font-bold text-red-600 hover:text-red-800 transition-colors uppercase tracking-widest bg-red-50 px-2 py-1 rounded-lg"
                            >
                              <ShieldCheck className="w-3 h-3" />
                              Report Driver
                            </button>
                          )}
                          {order.status === 'reported' && (
                            <div className="bg-red-50 p-2 rounded-lg border border-red-100">
                               <div className="text-[9px] font-bold text-red-600 uppercase tracking-tighter flex items-center gap-1">
                                 <AlertCircle className="w-3 h-3" /> Driver Reported
                               </div>
                               <p className="text-[8px] text-red-500 italic mt-1 line-clamp-2">{order.disputeNotes}</p>
                               <button 
                                 onClick={() => setViewingPoliceReport(order)}
                                 className="mt-2 w-full text-[8px] font-bold bg-gray-900 text-white py-1 rounded-md flex items-center justify-center gap-1"
                               >
                                 <ShieldCheck className="w-2 h-2" /> View Police Report
                               </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      <div className="space-y-6">
              <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">Agent Status</h3>
                </div>
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">Active Tasks</span>
                    <span className="font-bold text-indigo-600">{orders.filter(o => o.automationStatus === 'processing').length}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">Completed Today</span>
                    <span className="font-bold text-green-600">{orders.filter(o => o.automationStatus === 'completed').length}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">Success Rate</span>
                    <span className="font-bold text-gray-900">98.4%</span>
                  </div>
                  <div className="pt-4 border-t border-gray-100">
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Agent Health</div>
                    <div className="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden">
                      <div className="bg-green-500 h-full w-[95%]" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-gray-900 rounded-3xl p-6 text-white shadow-xl">
                <div className="flex items-center gap-2 mb-4">
                  <Smartphone className="w-4 h-4 text-indigo-400" />
                  <h3 className="text-xs font-bold uppercase tracking-widest">M-Pesa Bridge</h3>
                </div>
                <p className="text-[10px] text-gray-400 leading-relaxed mb-4">
                  The M-Pesa bridge is currently active and monitoring transaction callbacks. Profit splits are initiated within 60 seconds of confirmation.
                </p>
                <div className="flex items-center gap-2 text-[10px] font-mono text-indigo-400">
                  <div className="w-1 h-1 bg-indigo-400 rounded-full" />
                  Status: Operational
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {tab === 'fulfillment' && (
        <motion.div 
          key="fulfillment"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className="space-y-8"
        >
          <div className="bg-white rounded-3xl border border-gray-200 p-8 shadow-sm">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600">
                  <Settings className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Automation Control Center</h2>
                  <p className="text-sm text-gray-500">Monitor and manage automated supplier purchases.</p>
                </div>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 rounded-lg border border-green-100">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                <span className="text-[10px] font-bold text-green-700 uppercase tracking-widest">Automation Engine Online</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Awaiting Fulfillment</div>
                <div className="text-2xl font-bold text-gray-900">
                  {orders.filter(o => o.status === 'paid' && (!o.automationStatus || o.automationStatus === 'idle')).length}
                </div>
              </div>
              <div className="p-4 bg-indigo-50 rounded-2xl border border-indigo-100">
                <div className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest mb-1">Currently Processing</div>
                <div className="text-2xl font-bold text-indigo-600">
                  {orders.filter(o => o.automationStatus === 'processing').length}
                </div>
              </div>
              <div className="p-4 bg-red-50 rounded-2xl border border-red-100">
                <div className="text-[10px] font-bold text-red-400 uppercase tracking-widest mb-1">Automation Failures</div>
                <div className="text-2xl font-bold text-red-600">
                  {orders.filter(o => o.automationStatus === 'failed').length}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <Clock className="w-4 h-4 text-indigo-600" />
                Fulfillment Queue
              </h3>
              
              {orders.filter(o => o.status === 'paid' || o.status === 'fulfilled').length === 0 ? (
                <div className="text-center py-12 bg-gray-50 rounded-2xl text-gray-400 italic">
                  No orders ready for fulfillment.
                </div>
              ) : (
                <div className="space-y-4">
                  {orders.filter(o => o.status === 'paid' || o.status === 'fulfilled').map(order => (
                    <div key={order.id} className="bg-white border border-gray-200 rounded-2xl p-6 hover:border-indigo-200 transition-colors">
                      <div className="flex flex-col lg:flex-row justify-between gap-6">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <span className="font-mono text-xs font-bold text-gray-400">#{order.id}</span>
                            <span className={cn(
                              "text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-widest",
                              order.automationStatus === 'completed' ? "bg-green-100 text-green-700" :
                              order.automationStatus === 'processing' ? "bg-indigo-100 text-indigo-600 animate-pulse" :
                              order.automationStatus === 'failed' ? "bg-red-100 text-red-700" :
                              "bg-gray-100 text-gray-600"
                            )}>
                              {order.automationStatus || 'Idle'}
                            </span>
                          </div>
                          <h4 className="font-bold text-gray-900 mb-1">{order.customer.name}</h4>
                          <p className="text-xs text-gray-500 mb-4">{order.items.length} items • {formatPrice(order.total, order.currency, rates, 'USD')}</p>
                          
                          {order.fulfillmentDetails && (
                            <div className="grid grid-cols-2 gap-4 p-3 bg-gray-50 rounded-xl border border-gray-100">
                              <div>
                                <div className="text-[9px] font-bold text-gray-400 uppercase">Supplier Order ID</div>
                                <div className="text-xs font-mono font-bold text-gray-700">{order.fulfillmentDetails.supplierOrderId || 'N/A'}</div>
                              </div>
                              <div>
                                <div className="text-[9px] font-bold text-gray-400 uppercase">Tracking Number</div>
                                <div className="text-xs font-mono font-bold text-indigo-600">{order.fulfillmentDetails.trackingNumber || 'Awaiting...'}</div>
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="w-full lg:w-64 space-y-3">
                          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Automation Logs</div>
                          <div className="bg-gray-900 rounded-xl p-3 h-32 overflow-y-auto font-mono text-[10px] text-green-400 space-y-1">
                            {order.automationLog && order.automationLog.length > 0 ? (
                              order.automationLog.map((log, i) => <div key={i}>{log}</div>)
                            ) : (
                              <div className="text-gray-600 italic">No logs available</div>
                            )}
                          </div>
                          
                          {order.status === 'paid' && (!order.automationStatus || order.automationStatus === 'idle' || order.automationStatus === 'failed') && (
                            <button 
                              onClick={() => handleFulfill(order.id)}
                              className="w-full bg-indigo-600 text-white py-2.5 rounded-xl text-xs font-bold hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-100"
                            >
                              <Play className="w-4 h-4" />
                              {order.automationStatus === 'failed' ? 'Retry Automation' : 'Start Auto-Fulfillment'}
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
        </motion.div>
      )}

      {tab === 'tracking' && (
        <motion.div 
          key="tracking"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className="space-y-6"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold">Order Tracking Dashboard</h2>
            <div className="text-[10px] font-bold text-green-600 bg-green-50 px-3 py-1 rounded-full uppercase tracking-widest border border-green-100 flex items-center gap-2">
              <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
              Satellite Sync Active
            </div>
          </div>

          {orders.filter(o => o.status !== 'pending').length === 0 ? (
            <div className="text-center py-24 bg-gray-50 rounded-3xl border-2 border-dashed border-gray-200">
              <Truck className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900">No active shipments</h3>
              <p className="text-gray-500">Orders will appear here once payment is confirmed.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-8">
              {orders.filter(o => o.status !== 'pending').map(order => {
                const updates = [
                  { date: order.createdAt, status: 'Order Placed', location: 'DropShip Pro System', icon: <Package className="w-4 h-4" />, completed: true },
                  ...(order.status === 'paid' || order.status === 'fulfilled' || order.status === 'shipped' || order.status === 'delivered' ? [
                    { date: new Date(new Date(order.createdAt).getTime() + 3600000).toISOString(), status: 'Payment Confirmed', location: 'M-Pesa Gateway', icon: <CreditCard className="w-4 h-4" />, completed: true }
                  ] : []),
                  ...(order.automationStatus === 'completed' || order.status === 'shipped' || order.status === 'delivered' ? [
                    { date: new Date(new Date(order.createdAt).getTime() + 7200000).toISOString(), status: 'Fulfillment Started', location: 'Automation Engine', icon: <Settings className="w-4 h-4" />, completed: true },
                    { date: new Date(new Date(order.createdAt).getTime() + 14400000).toISOString(), status: 'Order Placed on Source Site', location: 'Supplier Warehouse (Source)', icon: <Store className="w-4 h-4" />, completed: true },
                    { date: new Date(new Date(order.createdAt).getTime() + 86400000).toISOString(), status: 'Processed at Warehouse', location: 'Guangzhou, CN', icon: <Package className="w-4 h-4" />, completed: true },
                  ] : []),
                  ...(order.status === 'shipped' || order.status === 'delivered' ? [
                    { date: new Date(new Date(order.createdAt).getTime() + 172800000).toISOString(), status: 'Shipped from Origin', location: 'Guangzhou International Hub', icon: <Truck className="w-4 h-4" />, completed: true },
                    { date: new Date(new Date(order.createdAt).getTime() + 259200000).toISOString(), status: 'Customs Clearance (Origin)', location: 'Guangzhou Customs, CN', icon: <ShieldCheck className="w-4 h-4" />, completed: true },
                    { date: new Date(new Date(order.createdAt).getTime() + 345600000).toISOString(), status: 'In Transit to Kenya', location: 'Air Freight (ET-801)', icon: <Plane className="w-4 h-4" />, completed: true },
                    { date: new Date(new Date(order.createdAt).getTime() + 432000000).toISOString(), status: 'Customs Clearance (Destination)', location: 'JKIA Customs, KE', icon: <ShieldCheck className="w-4 h-4" />, completed: true },
                    { date: new Date(new Date(order.createdAt).getTime() + 518400000).toISOString(), status: 'Arrived in Nairobi', location: 'JKIA Cargo Terminal', icon: <MapPin className="w-4 h-4" />, completed: true },
                    { date: new Date(new Date(order.createdAt).getTime() + 561600000).toISOString(), status: 'Sorted at Distribution Center', location: 'Nairobi Central Hub', icon: <History className="w-4 h-4" />, completed: true },
                  ] : []),
                  ...(order.status === 'delivered' ? [
                    { date: new Date(new Date(order.createdAt).getTime() + 604800000).toISOString(), status: 'Out for Delivery', location: 'Nairobi Distribution Hub', icon: <Smartphone className="w-4 h-4" />, completed: true },
                    { date: new Date(new Date(order.createdAt).getTime() + 608400000).toISOString(), status: 'Delivered', location: `${order.customer.city}, ${order.customer.country}`, icon: <CheckCircle className="w-4 h-4" />, completed: true },
                  ] : [])
                ].reverse();

                const progress = order.status === 'paid' ? 20 : 
                                 order.status === 'fulfilled' ? 40 : 
                                 order.status === 'shipped' ? 75 : 
                                 order.status === 'delivered' ? 100 : 10;

                return (
                  <div key={order.id} className="bg-white border border-gray-200 rounded-3xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                    <div className="bg-gray-50 px-8 py-6 border-b border-gray-200">
                      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center">
                            <Truck className="w-6 h-6" />
                          </div>
                          <div>
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Tracking Order</span>
                            <div className="font-mono font-bold text-lg text-gray-900">{order.id}</div>
                          </div>
                        </div>
                        <div className="flex flex-col items-end">
                          <span className={cn(
                            "px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest shadow-sm",
                            order.status === 'delivered' ? "bg-green-600 text-white" : 
                            order.status === 'shipped' ? "bg-purple-600 text-white" :
                            order.status === 'fulfilled' ? "bg-blue-600 text-white" :
                            "bg-indigo-600 text-white"
                          )}>
                            {order.status === 'delivered' ? 'Delivered' : 
                             order.status === 'shipped' ? 'In Transit' :
                             order.status === 'fulfilled' ? 'Processing' : 'Awaiting Payment'}
                          </span>
                          <span className="text-[10px] text-gray-400 mt-1 font-medium">Estimated Delivery: {new Date(new Date(order.createdAt).getTime() + 604800000).toLocaleDateString()}</span>
                        </div>
                      </div>
                      
                      <div className="mt-8">
                        <div className="flex justify-between text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
                          <span>Shipment Progress</span>
                          <span>{progress}%</span>
                        </div>
                        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${progress}%` }}
                            className="h-full bg-indigo-600"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="p-8">
                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
                        <div className="lg:col-span-2 space-y-12">
                          {order.status !== 'pending' && (
                            <div className="space-y-4">
                              <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                                <MapPin className="w-4 h-4 text-indigo-600" />
                                Real-Time Delivery Tracking
                              </h3>
                              <TrackingMap order={order} />
                            </div>
                          )}

                          <div>
                            <h3 className="text-sm font-bold text-gray-900 mb-8 flex items-center gap-2">
                              <Clock className="w-4 h-4 text-indigo-600" />
                              Shipping History
                            </h3>
                            <div className="relative">
                              <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-100"></div>
                              <div className="space-y-10">
                                {updates.map((update, i) => (
                                  <div key={i} className="relative flex items-start gap-8 pl-12">
                                    <div className={cn(
                                      "absolute left-0 w-9 h-9 rounded-xl flex items-center justify-center border-4 border-white shadow-sm z-10 transition-colors",
                                      i === 0 ? "bg-indigo-600 text-white" : "bg-white text-gray-400 border-gray-100"
                                    )}>
                                      {i === 0 && order.status !== 'delivered' ? <div className="animate-pulse">{update.icon}</div> : update.icon}
                                    </div>
                                    <div className="flex-1">
                                      <div className="flex flex-col md:flex-row md:items-center justify-between mb-1 gap-2">
                                        <h4 className={cn("font-bold text-sm", i === 0 ? "text-gray-900" : "text-gray-500")}>
                                          {update.status}
                                        </h4>
                                        <span className="text-[10px] font-mono text-gray-400 bg-gray-50 px-2 py-0.5 rounded border border-gray-100">
                                          {new Date(update.date).toLocaleString()}
                                        </span>
                                      </div>
                                      <div className="text-xs text-gray-500 flex items-center gap-1.5">
                                        <MapPin className="w-3 h-3 text-indigo-400" />
                                        {update.location}
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-8">
                          <div>
                            <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
                              <Info className="w-4 h-4 text-indigo-600" />
                              Customer Details
                            </h3>
                            <div className="bg-gray-50 rounded-2xl p-4 space-y-3">
                              <div>
                                <span className="text-[10px] font-bold text-gray-400 uppercase">Recipient</span>
                                <div className="text-xs font-bold text-gray-900">{order.customer.name}</div>
                              </div>
                              <div>
                                <span className="text-[10px] font-bold text-gray-400 uppercase">Destination</span>
                                <div className="text-xs text-gray-600 leading-relaxed">
                                  {order.customer.address}<br />
                                  {order.customer.city}, {order.customer.country}<br />
                                  {order.customer.zip}
                                </div>
                              </div>
                              <div>
                                <span className="text-[10px] font-bold text-gray-400 uppercase">Contact</span>
                                <div className="text-xs text-indigo-600 font-mono">{order.customer.phone}</div>
                              </div>
                            </div>
                          </div>

                          <div>
                            <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
                              <Package className="w-4 h-4 text-indigo-600" />
                              Package Info
                            </h3>
                            <div className="bg-gray-50 rounded-2xl p-4">
                              <div className="space-y-2">
                                {order.items.map((item, idx) => (
                                  <div key={idx} className="flex justify-between items-center text-xs">
                                    <span className="text-gray-600 truncate mr-2">{item.quantity}x {item.title}</span>
                                    <Check className="w-3 h-3 text-green-500 flex-shrink-0" />
                                  </div>
                                ))}
                              </div>
                              <div className="mt-4 pt-4 border-t border-gray-200 flex justify-between items-center">
                                <span className="text-[10px] font-bold text-gray-400 uppercase">Total Weight</span>
                                <span className="text-xs font-bold text-gray-900">~2.4 kg</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </motion.div>
      )}

      {tab === 'messages' && (
        <motion.div 
          key="messages"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
        >
          <AdminChat user={user} />
        </motion.div>
      )}

      {tab === 'payouts' && (
        <motion.div 
          key="payouts"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className="space-y-8"
        >
          {/* Card Info and Stats */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Visual Credit Card */}
            <div className="bg-gradient-to-br from-indigo-900 via-indigo-950 to-slate-900 text-white rounded-3xl p-8 shadow-xl border border-indigo-800 relative overflow-hidden flex flex-col justify-between min-h-[220px]">
              {/* Chip and Visa */}
              <div className="flex justify-between items-start z-10">
                <div className="space-y-1">
                  <div className="w-12 h-9 bg-yellow-400/80 rounded-lg border border-yellow-300 shadow-sm opacity-90 flex items-center justify-center">
                    <div className="grid grid-cols-3 gap-0.5 w-8 h-6 opacity-30">
                      <div className="border-r border-b border-black"></div>
                      <div className="border-r border-b border-black"></div>
                      <div className="border-b border-black"></div>
                      <div className="border-r border-black"></div>
                      <div className="border-r border-black"></div>
                      <div></div>
                    </div>
                  </div>
                  <span className="text-[9px] uppercase tracking-wider font-semibold text-indigo-300">Escrow Settlement Unit</span>
                </div>
                <div className="text-right">
                  <span className="italic font-bold text-2xl tracking-tight">Visa</span>
                  <div className="text-[8px] uppercase tracking-widest text-indigo-300">Platform Card</div>
                </div>
              </div>
              
              {/* Card Number */}
              <div className="my-6 z-10">
                <div className="font-mono text-xl sm:text-2xl tracking-[0.25em] text-center drop-shadow-md">
                  5505 5800 0429 5960
                </div>
              </div>
              
              {/* Expiry, CVV, Card Holder */}
              <div className="flex justify-between items-end z-10">
                <div>
                  <div className="text-[8px] uppercase tracking-widest text-indigo-400">Card Holder</div>
                  <div className="text-xs font-semibold tracking-wider uppercase font-sans">DropShip Pro Admin</div>
                </div>
                <div className="flex gap-4">
                  <div>
                    <div className="text-[8px] uppercase tracking-widest text-indigo-400">Expires</div>
                    <div className="text-xs font-semibold font-mono">07/30</div>
                  </div>
                  <div>
                    <div className="text-[8px] uppercase tracking-widest text-indigo-400">CVV</div>
                    <div className="text-xs font-semibold font-mono">679</div>
                  </div>
                </div>
              </div>
              
              {/* Background abstract shapes */}
              <div className="absolute -bottom-20 -right-20 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl"></div>
              <div className="absolute -top-10 -left-10 w-40 h-40 bg-indigo-500/15 rounded-full blur-3xl"></div>
            </div>

            {/* Quick Stats cards */}
            <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-6">
              <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex flex-col justify-between">
                <div>
                  <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center mb-4">
                    <DollarSign className="w-5 h-5" />
                  </div>
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Platform Card Revenue</h3>
                  <p className="text-2xl font-bold text-gray-900 font-sans">
                    {formatPrice(
                      orders.reduce((sum, o) => {
                        if (o.status === 'delivered') {
                          const referrerId = o.inviterId || null;
                          const originalTotal = o.subtotal || o.total / 1.01;
                          const platformCut = referrerId ? originalTotal * 0.007 : originalTotal * 0.01;
                          return sum + platformCut;
                        }
                        return sum;
                      }, 0),
                      currency, rates, 'USD'
                    )}
                  </p>
                </div>
                <div className="text-[10px] text-gray-400 mt-4 uppercase font-bold tracking-wider">
                  Settled directly to Card
                </div>
              </div>

              <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex flex-col justify-between">
                <div>
                  <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center mb-4">
                    <Award className="w-5 h-5" />
                  </div>
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Total Inviter Commissions</h3>
                  <p className="text-2xl font-bold text-gray-900 font-sans">
                    {formatPrice(
                      orders.reduce((sum, o) => {
                        if (o.status === 'delivered') {
                          const referrerId = o.inviterId || null;
                          const originalTotal = o.subtotal || o.total / 1.01;
                          const inviterCut = referrerId ? originalTotal * 0.003 : 0;
                          return sum + inviterCut;
                        }
                        return sum;
                      }, 0),
                      currency, rates, 'USD'
                    )}
                  </p>
                </div>
                <div className="text-[10px] text-gray-400 mt-4 uppercase font-bold tracking-wider">
                  Distributed to Referral link owners
                </div>
              </div>

              <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex flex-col justify-between">
                <div>
                  <div className="w-10 h-10 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center mb-4">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Escrowed Orders</h3>
                  <p className="text-2xl font-bold text-gray-900 font-sans">
                    {orders.filter(o => o.escrowFee && o.escrowFee > 0).length}
                  </p>
                </div>
                <div className="text-[10px] text-gray-400 mt-4 uppercase font-bold tracking-wider">
                  Orders secured with 1% increment
                </div>
              </div>
            </div>
          </div>

          {/* Ledger of Transfers */}
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-gray-50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Platform Escrow Ledger</h3>
                <p className="text-sm text-gray-400">Detailed overview of escrow fee increments and card transfers.</p>
              </div>
              <span className="text-[10px] bg-indigo-50 text-indigo-700 px-3 py-1.5 rounded-full uppercase font-bold tracking-widest">
                Realtime updates
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-gray-50 text-gray-400 font-bold uppercase tracking-widest text-[10px] border-b border-gray-100">
                    <th className="p-4 sm:p-6">Date</th>
                    <th className="p-4 sm:p-6">Order ID</th>
                    <th className="p-4 sm:p-6">Buyer/Referral</th>
                    <th className="p-4 sm:p-6 text-right">Escrow Fee (1%)</th>
                    <th className="p-4 sm:p-6 text-right">Admin Cut (0.7% or 1%)</th>
                    <th className="p-4 sm:p-6 text-right">Inviter Cut (0.3%)</th>
                    <th className="p-4 sm:p-6">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {orders.filter(o => o.escrowFee && o.escrowFee > 0).length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-12 text-center text-gray-500 font-sans">
                        No escrow fee transfers recorded yet. Place an order to see the ledger populate!
                      </td>
                    </tr>
                  ) : (
                    orders
                      .filter(o => o.escrowFee && o.escrowFee > 0)
                      .map((o) => {
                        const hasRef = Boolean(o.inviterId);
                        const displayAdminCut = o.platformCut || (hasRef ? o.total * 0.007 : o.total * 0.01);
                        const displayInviterCut = o.inviterCut || (hasRef ? o.total * 0.003 : 0);
                        return (
                          <tr key={o.id} className="hover:bg-gray-50/50 transition-colors">
                            <td className="p-4 sm:p-6 whitespace-nowrap text-gray-500 font-mono text-xs">
                              {new Date(o.createdAt).toLocaleString()}
                            </td>
                            <td className="p-4 sm:p-6 font-bold text-gray-900 font-sans">
                              {o.id}
                            </td>
                            <td className="p-4 sm:p-6 whitespace-nowrap">
                              <div className="flex flex-col">
                                <span className="font-medium text-gray-700">{o.customer.name}</span>
                                {hasRef ? (
                                  <span className="text-[10px] text-green-600 font-bold uppercase tracking-wider flex items-center gap-1 mt-0.5">
                                    <span className="w-1 h-1 bg-green-500 rounded-full"></span>
                                    Invited by {o.inviterId?.substring(0, 5)}...
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-gray-400 uppercase tracking-wider mt-0.5">
                                    Direct signup
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="p-4 sm:p-6 text-right font-bold text-gray-900">
                              {formatPrice(o.escrowFee || 0, currency, rates, 'USD')}
                            </td>
                            <td className="p-4 sm:p-6 text-right whitespace-nowrap font-sans">
                              <div className="flex flex-col items-end">
                                <span className="font-bold text-indigo-600">{formatPrice(displayAdminCut, currency, rates, 'USD')}</span>
                                <span className="text-[9px] text-indigo-400 font-mono tracking-tighter">to Visa ****5960</span>
                              </div>
                            </td>
                            <td className="p-4 sm:p-6 text-right font-semibold text-emerald-600 whitespace-nowrap">
                              {hasRef ? formatPrice(displayInviterCut, currency, rates, 'USD') : '—'}
                            </td>
                            <td className="p-4 sm:p-6 whitespace-nowrap">
                              {o.status === 'delivered' ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-green-50 text-green-700 border border-green-100">
                                  <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                                  Settle Completed
                                </span>
                              ) : o.status === 'cancelled' ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-red-50 text-red-700 border border-red-100">
                                  Refunded
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-100 animate-pulse">
                                  <span className="w-1.5 h-1.5 bg-amber-500 rounded-full"></span>
                                  Staged in Escrow
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </motion.div>
      )}

      {importPreview && (
        <ProductModal
          product={importPreview}
          onClose={() => setImportPreview(null)}
          onConfirm={async (updated) => {
            await addProduct(updated);
            setImportPreview(null);
            setTab('approval');
          }}
          currency="USD"
          rates={rates}
          isAdmin={true}
          user={user}
        />
      )}
    </AnimatePresence>

    {viewingPoliceReport && (
      <PoliceReportModal 
        order={viewingPoliceReport}
        onClose={() => setViewingPoliceReport(null)}
        currency={currency}
        rates={rates}
      />
    )}
  </div>
  );
};

const reverseGeocodeWithGemini = async (lat: number, lng: number) => {
  try {
    const apiKey = (import.meta as any).env.VITE_GEMINI_API_KEY || (process as any).env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn("Gemini API key not found for geocoding.");
      return null;
    }
    
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `What is the exact shipping address for the location at latitude ${lat} and longitude ${lng}? 
      Return ONLY a JSON object with these fields: road, house_number, city, country, postcode. 
      If a field is unknown, use an empty string.`,
      config: {
        tools: [{ googleMaps: {} }],
        toolConfig: {
          retrievalConfig: {
            latLng: {
              latitude: lat,
              longitude: lng
            }
          }
        }
      },
    });

    const text = response.text || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (e) {
    console.error("Gemini geocoding failed:", e);
  }
  return null;
};

const CartPage = ({ 
  cart, 
  setCart, 
  addOrder, 
  currency, 
  rates,
  user,
  userProfile
}: { 
  cart: CartItem[]; 
  setCart: React.Dispatch<React.SetStateAction<CartItem[]>>;
  addOrder: (o: Order) => Promise<void>;
  currency: string;
  rates: ExchangeRates;
  user: User | null;
  userProfile?: UserProfile | null;
}) => {
  const [step, setStep] = useState<'cart' | 'checkout' | 'success'>('cart');
  const [paymentMethod, setPaymentMethod] = useState<'mpesa' | 'bank_transfer'>('mpesa');
  const [customer, setCustomer] = useState<CustomerInfo>({
    name: user?.displayName || '',
    email: user?.email || '',
    phone: '',
    address: '',
    city: '',
    country: '',
    zip: ''
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [mapsLink, setMapsLink] = useState('');
  const [validationErrors, setValidationErrors] = useState<{ [key: string]: string }>({});

  const validateForm = () => {
    const errors: { [key: string]: string } = {};
    if (!customer.name.trim()) errors.name = "Full name is required";
    if (!customer.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)) {
      errors.email = "Valid email is required";
    }
    if (!customer.phone.trim() || customer.phone.length < 8) {
      errors.phone = "Valid phone number is required (min 8 chars)";
    }
    if (!customer.address.trim() || customer.address.length < 5) {
      errors.address = "Valid shipping address is required (min 5 chars)";
    }
    if (!customer.city.trim() || customer.city.length < 2) {
      errors.city = "City is required";
    }
    if (!customer.country.trim() || customer.country.length < 2) {
      errors.country = "Country is required";
    }
    if (!customer.zip.trim() || !/^[a-zA-Z0-9\s-]{3,10}$/.test(customer.zip)) {
      errors.zip = "Valid ZIP/Postal code is required (3-10 chars)";
    }
    return errors;
  };

  const handleInputChange = (field: keyof CustomerInfo, value: string) => {
    setCustomer(prev => ({ ...prev, [field]: value }));
    if (validationErrors[field]) {
      setValidationErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  const triggerFulfillment = async (order: Order) => {
    try {
      const res = await fetch('/api/fulfill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order }),
      });
      const data = await res.json();
      if (data.success) {
        window.dispatchEvent(new CustomEvent('order_updated', { 
          detail: { 
            id: order.id, 
            automationStatus: data.status, 
            automationLog: data.logs,
            status: 'fulfilled'
          } 
        }));
      }
    } catch (err) {
      console.error('Fulfillment trigger failed:', err);
    }
  };

  const totalUSD = cart.reduce((sum, item) => {
    const itemPriceUSD = item.price / (rates[item.sourceCurrency] || 1);
    return sum + (itemPriceUSD * (1 + item.markup / 100)) * item.quantity;
  }, 0);

  const getGeocodingData = async (lat: number, lon: number) => {
    if (hasValidMapKey) {
      try {
        const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lon}&key=${GOOGLE_MAPS_API_KEY}`);
        const data = await response.json();
        if (data.results && data.results[0]) {
          const result = data.results[0];
          const addressComponents = result.address_components;
          const getComponent = (type: string) => addressComponents.find((c: any) => c.types.includes(type))?.long_name;

          return {
            display_name: result.formatted_address,
            address: {
              road: getComponent('route'),
              house_number: getComponent('street_number'),
              city: getComponent('locality') || getComponent('administrative_area_level_2'),
              town: getComponent('locality'),
              village: getComponent('sublocality'),
              suburb: getComponent('neighborhood'),
              country: getComponent('country'),
              postcode: getComponent('postal_code')
            }
          };
        }
      } catch (err) {
        console.error("Google Geocoding failed, falling back to OSM", err);
      }
    }

    // Try OpenStreetMap (Nominatim) - Primary no-key alternative
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`
      );
      const data = await response.json();
      if (data && data.address) return data;
    } catch (e) {
      console.error("Nominatim failed:", e);
    }

    // Try BigDataCloud (Free, no key needed for client-side) - Secondary no-key alternative
    try {
      const response = await fetch(
        `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`
      );
      const data = await response.json();
      if (data) {
        return {
          address: {
            road: data.locality || '',
            city: data.city || '',
            country: data.countryName || '',
            postcode: data.postcode || ''
          },
          display_name: data.localityInfo?.administrative?.map((a: any) => a.name).join(', ') || ''
        };
      }
    } catch (e) {
      console.error("BigDataCloud failed:", e);
    }

    return null;
  };

  const handleSearchAddress = async (query: string) => {
    if (!query) return;
    setIsProcessing(true);
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&addressdetails=1&limit=1`
      );
      const data = await response.json();
      if (data && data[0]) {
        const result = data[0];
        const { road, house_number, city, town, village, suburb, country, postcode } = result.address;
        const streetAddress = [house_number, road].filter(Boolean).join(' ');
        const cityName = city || town || village || suburb || '';
        
        setCustomer(prev => ({
          ...prev,
          address: streetAddress || result.display_name.split(',')[0],
          city: cityName,
          country: country || '',
          zip: postcode || '',
          lat: parseFloat(result.lat),
          lng: parseFloat(result.lon)
        }));
        setShowLocationModal(false);
        setMapsLink('');
      }
    } catch (e) {
      console.error("Address search failed:", e);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAutoDetect = () => {
    if (!navigator.geolocation) {
      return;
    }

    setIsProcessing(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords;
          const data = await getGeocodingData(latitude, longitude);
          
          if (data && data.address) {
            const { road, house_number, city, town, village, suburb, country, postcode } = data.address;
            const streetAddress = [house_number, road].filter(Boolean).join(' ');
            const cityName = city || town || village || suburb || '';
            
            setCustomer(prev => ({
              ...prev,
              address: streetAddress || data.display_name.split(',')[0],
              city: cityName,
              country: country || '',
              zip: postcode || '',
              lat: latitude,
              lng: longitude
            }));
          }
        } catch (error) {
          console.error("Geocoding failed:", error);
        } finally {
          setIsProcessing(false);
        }
      },
      (error) => {
        console.error("Geolocation error:", error);
        setIsProcessing(false);
      }
    );
  };

  const handleGoogleMapsLink = async () => {
    if (!mapsLink) return;

    if (!mapsLink.includes("google.com/maps") && !mapsLink.includes("maps.app.goo.gl")) {
      return;
    }

    setIsProcessing(true);
    try {
      const res = await fetch('/api/resolve-location', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: mapsLink }),
      });
      const data = await res.json();

      if (data.success) {
        const { lat, lon } = data;
        const geoData = await getGeocodingData(lat, lon);

        if (geoData && geoData.address) {
          const { road, house_number, city, town, village, suburb, country, postcode } = geoData.address;
          const streetAddress = [house_number, road].filter(Boolean).join(' ');
          const cityName = city || town || village || suburb || '';
          
          setCustomer(prev => ({
            ...prev,
            address: streetAddress || geoData.display_name.split(',')[0],
            city: cityName,
            country: country || '',
            zip: postcode || '',
            lat: lat,
            lng: lon
          }));
        }
      }
    } catch (err) {
      console.error("Google Maps link resolution failed:", err);
    } finally {
      setIsProcessing(false);
      setShowLocationModal(false);
      setMapsLink('');
    }
  };

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      await signInWithPopup(auth, googleProvider);
      return;
    }

    const errors = validateForm();
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      const firstErrorField = Object.keys(errors)[0];
      const element = document.getElementById(`field-${firstErrorField}`);
      element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    setValidationErrors({});
    setIsProcessing(true);
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          items: cart, 
          customerInfo: customer, 
          currency, 
          rates, 
          paymentMethod 
        }),
      });
      const data = await res.json();
      
      if (data.success) {
        const originalTotalUSD = cart.reduce((sum, item) => sum + (item.price * (1 + item.markup / 100)) * item.quantity, 0);
        const sourceCostUSD = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const totalShippingCostUSD = cart.reduce((sum, item) => sum + (item.shippingCost || 0) * item.quantity, 0);
        const profitUSD = originalTotalUSD - sourceCostUSD - totalShippingCostUSD;
        
        const escrowFeeUSD = originalTotalUSD * 0.01;
        const finalTotalUSD = originalTotalUSD + escrowFeeUSD;
        
        const referrerId = userProfile?.referredBy || localStorage.getItem('referrer') || null;
        const platformCutUSD = referrerId ? originalTotalUSD * 0.007 : originalTotalUSD * 0.01;
        const inviterCutUSD = referrerId ? originalTotalUSD * 0.003 : 0;
        
        const newOrder: Order = {
          id: data.orderId || `ORD-${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
          buyerId: user.uid,
          items: [...cart],
          customer: customer,
          total: finalTotalUSD,
          subtotal: originalTotalUSD,
          sourceCost: sourceCostUSD,
          shippingCost: totalShippingCostUSD,
          profit: profitUSD,
          escrowFee: escrowFeeUSD,
          platformCut: platformCutUSD,
          inviterCut: inviterCutUSD,
          inviterId: referrerId || undefined,
          paymentMethod,
          status: paymentMethod === 'mpesa' ? 'paid' : 'pending',
          automationStatus: 'idle',
          automationLog: [
            `[GATEWAY] Payment confirmed via ${paymentMethod.toUpperCase()}.`,
            `[ESCROW] Total payment of ${formatPrice(finalTotalUSD, 'USD', rates, 'USD')} secured in Escrow (includes 1% secure escrow protection fee).`,
            referrerId 
              ? `[REFERRAL] Invited by User ${referrerId.substring(0, 5)}...: Platform cut is 0.7% (${formatPrice(platformCutUSD, 'USD', rates, 'USD')}), Inviter cut is 0.3% (${formatPrice(inviterCutUSD, 'USD', rates, 'USD')}).`
              : `[ESCROW] Standard Platform escrow cut of 1.0% (${formatPrice(platformCutUSD, 'USD', rates, 'USD')}) applies.`,
            `[SYSTEM] Notifying supplier (${cart[0]?.sellerName || 'Primary'}) to confirm availability.`,
            `[SYSTEM] Waiting for supplier confirmation...`
          ],
          createdAt: new Date().toISOString(),
          currency
        };
        await addOrder(newOrder);
        setStep('success');
        setCart([]);
      }
    } catch (err) {
      console.error('Checkout failed:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  if (step === 'success') {
    return (
      <div className="max-w-2xl mx-auto px-4 py-24 text-center">
        <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-8">
          <ShieldCheck className="w-10 h-10" />
        </div>
        <h1 className="text-4xl font-bold text-gray-900 mb-4">Payment Confirmed</h1>
        <p className="text-lg text-gray-500 mb-4 text-center">Your payment has been successfully secured in the <b>DropShip Pro Secure Escrow</b>.</p>
        <p className="text-sm text-gray-400 mb-12 text-center">Funds will be automatically released to the creator, supplier, and driver only after the delivery QR code is scanned upon arrival.</p>
        <Link to="/" className="inline-block bg-gray-900 text-white px-8 py-4 rounded-xl font-bold hover:bg-indigo-600 transition-colors">
          Return to Store
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 sm:py-12">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 lg:gap-12">
        <div className="lg:col-span-2">
          {step === 'cart' ? (
            <>
              <h1 className="text-2xl sm:text-3xl font-bold mb-6 sm:mb-8">Shopping Cart</h1>
              {cart.length === 0 ? (
                <div className="text-center py-12 bg-gray-50 rounded-2xl">
                  <p className="text-gray-500 mb-6">Your cart is empty.</p>
                  <Link to="/" className="text-indigo-600 font-bold">Start Shopping</Link>
                </div>
              ) : (
                <div className="space-y-4 sm:space-y-6">
                  {cart.map(item => (
                    <div key={item.cartId} className="flex flex-col sm:flex-row gap-4 sm:gap-6 bg-white p-4 sm:p-6 rounded-2xl border border-gray-100">
                      <img src={item.image || null} className="w-full sm:w-24 h-48 sm:h-24 object-cover rounded-xl" referrerPolicy="no-referrer" />
                      <div className="flex-1">
                        <h3 className="font-bold text-gray-900 mb-1 text-sm sm:text-base">{item.title}</h3>
                        {item.selectedVariations && Object.entries(item.selectedVariations).length > 0 && (
                          <div className="flex flex-wrap gap-2 mb-3">
                            {Object.entries(item.selectedVariations).map(([name, value]) => (
                              <span key={name} className="text-[10px] font-bold text-gray-400 bg-gray-50 px-2 py-0.5 rounded-md border border-gray-100">
                                {name}: <span className="text-gray-900">{value}</span>
                              </span>
                            ))}
                          </div>
                        )}
                        <p className="text-indigo-600 font-bold mb-4 text-sm sm:text-base">{formatPrice(item.price * (1 + item.markup / 100), currency, rates, item.sourceCurrency)}</p>
                        <div className="flex items-center gap-2">
                          <div className="flex items-center bg-gray-50 rounded-xl p-0.5 border border-gray-100">
                            <button 
                              onClick={() => setCart(prev => prev.map(i => i.cartId === item.cartId ? { ...i, quantity: Math.max(1, i.quantity - 1) } : i))}
                              className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-indigo-600 hover:bg-white rounded-lg transition-all"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="w-8 text-center text-xs font-bold text-gray-900">{item.quantity}</span>
                            <button 
                              onClick={() => setCart(prev => prev.map(i => i.cartId === item.cartId ? { ...i, quantity: i.quantity + 1 } : i))}
                              className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-indigo-600 hover:bg-white rounded-lg transition-all"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                          <button 
                            onClick={() => setCart(prev => prev.filter(i => i.cartId !== item.cartId))}
                            className="ml-4 text-gray-300 hover:text-red-500 text-[10px] font-bold uppercase tracking-widest transition-colors"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              <button onClick={() => setStep('cart')} className="text-sm font-bold text-indigo-600 mb-6 flex items-center gap-1 hover:gap-2 transition-all">
                <ChevronRight className="w-4 h-4 rotate-180" />
                Back to Cart
              </button>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                  <h1 className="text-2xl sm:text-3xl font-bold">Shipping Details</h1>
                  <div className="flex flex-wrap gap-2">
                    <button 
                      type="button"
                      disabled={isProcessing}
                      onClick={() => setShowLocationModal(true)}
                      className="flex-1 sm:flex-none text-[10px] sm:text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-2 rounded-lg hover:bg-indigo-100 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      <ExternalLink className="w-3 h-3" />
                      Maps Link
                    </button>
                    <button 
                      type="button"
                      disabled={isProcessing}
                      onClick={handleAutoDetect}
                      className="flex-1 sm:flex-none text-[10px] sm:text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-2 rounded-lg hover:bg-indigo-100 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      <Smartphone className="w-3 h-3" />
                      {isProcessing ? 'Detecting...' : 'Auto-detect'}
                    </button>
                  </div>
                </div>
                <form onSubmit={handleCheckout} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div id="field-name">
                    <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Full Name</label>
                    <input 
                      type="text" 
                      className={cn(
                        "w-full px-4 py-3 rounded-xl border outline-none focus:ring-2 focus:ring-indigo-500 transition-all",
                        validationErrors.name ? "border-red-500 bg-red-50" : "border-gray-200"
                      )}
                      value={customer.name} onChange={e => handleInputChange('name', e.target.value)}
                    />
                    {validationErrors.name && <p className="text-[10px] text-red-500 font-bold mt-1 uppercase tracking-wider">{validationErrors.name}</p>}
                  </div>
                  <div id="field-email">
                    <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Email Address</label>
                    <input 
                      type="email" 
                      className={cn(
                        "w-full px-4 py-3 rounded-xl border outline-none focus:ring-2 focus:ring-indigo-500 transition-all",
                        validationErrors.email ? "border-red-500 bg-red-50" : "border-gray-200"
                      )}
                      value={customer.email} onChange={e => handleInputChange('email', e.target.value)}
                    />
                    {validationErrors.email && <p className="text-[10px] text-red-500 font-bold mt-1 uppercase tracking-wider">{validationErrors.email}</p>}
                  </div>
                  <div id="field-phone">
                    <label className="block text-xs font-bold text-gray-400 uppercase mb-2">{paymentMethod === 'mpesa' ? 'M-Pesa Phone Number' : 'Phone Number'}</label>
                    <input 
                      type="tel" placeholder={paymentMethod === 'mpesa' ? "e.g. 2557XXXXXXXX" : "e.g. +255..."}
                      className={cn(
                        "w-full px-4 py-3 rounded-xl border outline-none focus:ring-2 focus:ring-indigo-500 transition-all",
                        validationErrors.phone ? "border-red-500 bg-red-50" : "border-gray-200"
                      )}
                      value={customer.phone} onChange={e => handleInputChange('phone', e.target.value)}
                    />
                    {validationErrors.phone && <p className="text-[10px] text-red-500 font-bold mt-1 uppercase tracking-wider">{validationErrors.phone}</p>}
                  </div>
                </div>

                <div className="space-y-4">
                  <label className="block text-xs font-bold text-gray-400 uppercase">Payment Method</label>
                  <div className="grid grid-cols-2 gap-4">
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('mpesa')}
                      className={cn(
                        "flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all",
                        paymentMethod === 'mpesa' ? "border-indigo-600 bg-indigo-50" : "border-gray-100 hover:border-gray-200"
                      )}
                    >
                      <Smartphone className={cn("w-6 h-6", paymentMethod === 'mpesa' ? "text-indigo-600" : "text-gray-400")} />
                      <span className={cn("text-sm font-bold", paymentMethod === 'mpesa' ? "text-indigo-600" : "text-gray-500")}>M-Pesa</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('bank_transfer')}
                      className={cn(
                        "flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all",
                        paymentMethod === 'bank_transfer' ? "border-indigo-600 bg-indigo-50" : "border-gray-100 hover:border-gray-200"
                      )}
                    >
                      <CreditCard className={cn("w-6 h-6", paymentMethod === 'bank_transfer' ? "text-indigo-600" : "text-gray-400")} />
                      <span className={cn("text-sm font-bold", paymentMethod === 'bank_transfer' ? "text-indigo-600" : "text-gray-500")}>Bank Account</span>
                    </button>
                  </div>
                  {paymentMethod === 'bank_transfer' && (
                    <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                      <p className="text-xs text-gray-500 font-medium mb-1">Transfer to NMB Bank PLC (Tanzania):</p>
                      <p className="text-sm font-bold text-gray-900">Account: 0797691203</p>
                      <p className="text-[10px] text-gray-400 mt-2 italic">Please use your order ID as the reference for the transfer.</p>
                    </div>
                  )}
                </div>
                <div className="space-y-6">
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest">Shipping & Delivery Point</label>
                  <LocationPicker 
                    initialLocation={customer.lat ? { lat: customer.lat, lng: customer.lng! } : undefined}
                    onLocationSelect={async (lat, lng) => {
                      setCustomer(prev => ({ ...prev, lat, lng }));
                      const data = await getGeocodingData(lat, lng);
                      if (data && data.address) {
                        const { road, house_number, city, town, village, suburb, country, postcode } = data.address;
                        const streetAddress = [house_number, road].filter(Boolean).join(' ');
                        const cityName = city || town || village || suburb || '';
                        setCustomer(prev => ({
                          ...prev,
                          address: streetAddress || data.display_name.split(',')[0],
                          city: cityName,
                          country: country || prev.country,
                          zip: postcode || prev.zip
                        }));
                      }
                    }} 
                  />
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div id="field-address">
                      <label className="block text-[10px] font-bold text-gray-400 uppercase mb-2">Street Address</label>
                      <input 
                        type="text" 
                        className={cn(
                          "w-full px-4 py-3 rounded-xl border outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm",
                          validationErrors.address ? "border-red-500 bg-red-50" : "border-gray-200"
                        )}
                        value={customer.address} onChange={e => handleInputChange('address', e.target.value)}
                        placeholder="House No, Street Name..."
                      />
                      {validationErrors.address && <p className="text-[10px] text-red-500 font-bold mt-1 uppercase tracking-wider">{validationErrors.address}</p>}
                    </div>
                    <div id="field-city">
                      <label className="block text-[10px] font-bold text-gray-400 uppercase mb-2">City</label>
                      <input 
                        type="text" 
                        className={cn(
                          "w-full px-4 py-3 rounded-xl border outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm",
                          validationErrors.city ? "border-red-500 bg-red-50" : "border-gray-200"
                        )}
                        value={customer.city} onChange={e => handleInputChange('city', e.target.value)}
                        placeholder="City"
                      />
                    </div>
                    <div id="field-country">
                      <label className="block text-[10px] font-bold text-gray-400 uppercase mb-2">Country</label>
                      <input 
                        type="text" 
                        className={cn(
                          "w-full px-4 py-3 rounded-xl border outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm",
                          validationErrors.country ? "border-red-500 bg-red-50" : "border-gray-200"
                        )}
                        value={customer.country} onChange={e => handleInputChange('country', e.target.value)}
                        placeholder="Country"
                      />
                    </div>
                    <div id="field-zip">
                      <label className="block text-[10px] font-bold text-gray-400 uppercase mb-2">ZIP / Postal Code</label>
                      <input 
                        type="text" 
                        className={cn(
                          "w-full px-4 py-3 rounded-xl border outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm",
                          validationErrors.zip ? "border-red-500 bg-red-50" : "border-gray-200"
                        )}
                        value={customer.zip} onChange={e => handleInputChange('zip', e.target.value)}
                        placeholder="ZIP Code"
                      />
                    </div>
                  </div>
                </div>
              </form>
            </>
          )}
        </div>

        <div className="lg:col-span-1">
          <div className="bg-gray-50 rounded-3xl p-6 sm:p-8 sticky top-24">
            <h2 className="text-xl font-bold mb-6">Order Summary</h2>
            <div className="space-y-4 mb-8">
              <div className="flex justify-between text-gray-500">
                <span className="text-sm">Subtotal</span>
                <span className="text-sm font-bold">{formatPrice(totalUSD, currency, rates, 'USD')}</span>
              </div>
              <div className="flex justify-between text-gray-500">
                <span className="text-sm">Secure Escrow Fee (1%)</span>
                <span className="text-sm font-bold text-indigo-600">+{formatPrice(totalUSD * 0.01, currency, rates, 'USD')}</span>
              </div>
              <div className="flex justify-between text-gray-500">
                <span className="text-sm">Shipping</span>
                <span className="text-sm text-green-600 font-bold">Free</span>
              </div>
              
              {(userProfile?.referredBy || localStorage.getItem('referrer')) && (
                <div className="p-3 bg-green-50 border border-green-100 rounded-xl text-[11px] text-green-700 font-medium">
                  <span className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>
                    Referred order: 0.3% split to inviter, 0.7% to platform.
                  </span>
                </div>
              )}

              <div className="pt-4 border-t border-gray-200 flex justify-between text-xl font-bold text-gray-900">
                <span>Total</span>
                <span>{formatPrice(totalUSD * 1.01, currency, rates, 'USD')}</span>
              </div>
            </div>
            
            {step === 'cart' ? (
              <button 
                disabled={cart.length === 0}
                onClick={() => setStep('checkout')}
                className="w-full bg-gray-900 text-white py-4 rounded-2xl font-bold hover:bg-indigo-600 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                Proceed to Checkout
                <ChevronRight className="w-5 h-5" />
              </button>
            ) : (
              <button 
                onClick={handleCheckout}
                disabled={isProcessing}
                className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-bold hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 shadow-xl shadow-indigo-100"
              >
                {paymentMethod === 'mpesa' ? <Smartphone className="w-5 h-5" /> : <CreditCard className="w-5 h-5" />}
                {isProcessing ? (paymentMethod === 'mpesa' ? 'Processing M-Pesa...' : 'Processing Bank Transfer...') : `Pay ${formatPrice(totalUSD * 1.01, currency, rates, 'USD')} via ${paymentMethod === 'mpesa' ? 'M-Pesa' : 'Bank Account'}`}
              </button>
            )}
            
            <div className="mt-6 flex items-center justify-center gap-2 text-[10px] text-gray-400 uppercase font-bold tracking-widest">
              <ShieldCheck className="w-3 h-3" />
              Secure SSL Encryption
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showLocationModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl"
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600">
                  <MapPin className="w-5 h-5" />
                </div>
                <h3 className="text-xl font-bold text-gray-900">Set Shipping Location</h3>
              </div>
              <p className="text-gray-600 mb-6 text-sm">Search for an address or paste a Google Maps link to automatically fill your details.</p>
              <div className="space-y-4">
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={mapsLink}
                    onChange={(e) => setMapsLink(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        if (mapsLink.includes('google.com') || mapsLink.includes('goo.gl')) {
                          handleGoogleMapsLink();
                        } else {
                          handleSearchAddress(mapsLink);
                        }
                      }
                    }}
                    placeholder="Search address or paste Maps link..."
                    className="w-full pl-11 pr-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                    autoFocus
                  />
                </div>
                <div className="flex gap-3">
                  <button 
                    onClick={() => {
                      setShowLocationModal(false);
                      setMapsLink('');
                    }}
                    className="flex-1 px-6 py-3 rounded-xl font-bold text-gray-500 hover:bg-gray-100 transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={() => {
                      if (mapsLink.includes('google.com') || mapsLink.includes('goo.gl')) {
                        handleGoogleMapsLink();
                      } else {
                        handleSearchAddress(mapsLink);
                      }
                    }}
                    disabled={!mapsLink || isProcessing}
                    className="flex-1 px-6 py-3 rounded-xl font-bold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-50"
                  >
                    {isProcessing ? 'Searching...' : 'Confirm'}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// --- Main App ---

const usePWA = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState(false);

  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const installApp = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstallable(false);
    }
  };

  return { isInstallable, installApp };
};

const MobileNavigation = ({ user, cartCount, isInstallable, installApp }: { user: User | null; cartCount: number; isInstallable: boolean; installApp: () => void }) => {
  const navigate = useNavigate();
  return (
    <nav className="sm:hidden fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-xl border-t border-gray-100 px-3 py-3 pb-8 z-50 flex justify-between items-center safe-area-bottom">
      <button onClick={() => navigate('/')} className="flex flex-col items-center gap-1 text-gray-400 hover:text-indigo-600 transition-all">
        <Store className="w-5 h-5" />
        <span className="text-[9px] font-bold uppercase tracking-tight">Shop</span>
      </button>
      <button onClick={() => navigate('/referrals')} className="flex flex-col items-center gap-1 text-gray-400 hover:text-indigo-600 transition-all">
        <Users className="w-5 h-5" />
        <span className="text-[9px] font-bold uppercase tracking-tight">Network</span>
      </button>
      <button onClick={() => navigate('/cart')} className="relative flex flex-col items-center gap-1 text-gray-400 hover:text-indigo-600 transition-all">
        <div className="bg-indigo-600 text-white p-3 rounded-2xl -mt-8 shadow-lg shadow-indigo-200 border-4 border-white active:scale-95 transition-transform">
          <ShoppingCart className="w-6 h-6" />
        </div>
        {cartCount > 0 && (
          <span className="absolute top-0 right-0 bg-red-500 text-white text-[10px] font-black w-4 h-4 rounded-full flex items-center justify-center border-2 border-white translate-x-1/2 -translate-y-1/2">
            {cartCount}
          </span>
        )}
      </button>
      <button onClick={() => navigate('/dashboard')} className="flex flex-col items-center gap-1 text-gray-400 hover:text-indigo-600 transition-all">
        <Package className="w-5 h-5" />
        <span className="text-[9px] font-bold uppercase tracking-tight">Orders</span>
      </button>
      {isInstallable ? (
        <button onClick={installApp} className="flex flex-col items-center gap-1 text-indigo-600 animate-pulse transition-all">
          <Smartphone className="w-5 h-5" />
          <span className="text-[9px] font-bold uppercase tracking-tight">Install</span>
        </button>
      ) : (
        <button onClick={() => navigate('/dashboard')} className="flex flex-col items-center gap-1 text-gray-400 hover:text-indigo-600 transition-all">
          <UserIcon className="w-5 h-5" />
          <span className="text-[9px] font-bold uppercase tracking-tight">Profile</span>
        </button>
      )}
    </nav>
  );
};

export default function App() {
  const { isInstallable, installApp } = usePWA();
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSeller, setIsSeller] = useState(false);
  const [isDriver, setIsDriver] = useState(false);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [currency, setCurrency] = useState(() => localStorage.getItem('preferred_currency') || 'TZS');
  const [rates, setRates] = useState<ExchangeRates>({ USD: 1, TZS: 2500 });
  const [showAuthModal, setShowAuthModal] = useState(false);

  useEffect(() => {
    localStorage.setItem('preferred_currency', currency);
  }, [currency]);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const ref = urlParams.get('ref');
    if (ref) {
      localStorage.setItem('referrer', ref);
    }
  }, []);

  useEffect(() => {
    const ratesRef = doc(db, 'settings', 'exchangeRates');
    const unsubscribeRates = onSnapshot(ratesRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setRates(data.rates);
        
        // If rates are older than 24 hours, update them
        const lastUpdated = new Date(data.updatedAt).getTime();
        const now = new Date().getTime();
        if (now - lastUpdated > 24 * 60 * 60 * 1000) {
          updateExchangeRates();
        }
      } else {
        // Initial setup if document doesn't exist
        updateExchangeRates();
      }
    }, (error) => {
      console.error("Error listening to exchange rates:", error);
      // If we can't listen, try to fetch once
      updateExchangeRates();
    });

    return () => unsubscribeRates();
  }, []);

  const updateExchangeRates = async () => {
    try {
      const res = await fetch('https://open.er-api.com/v6/latest/USD');
      const data = await res.json();
      if (data.result === 'success') {
        const newRates = data.rates;
        // Only try to update Firestore if we have a user (to avoid permission errors if not logged in, 
        // though settings might be public read/write for now or admin only)
        try {
          await setDoc(doc(db, 'settings', 'exchangeRates'), {
            base: 'USD',
            rates: newRates,
            updatedAt: new Date().toISOString()
          });
        } catch (e) {
          console.warn("Could not save rates to Firestore (likely permissions):", e);
        }
        setRates(newRates);
      }
    } catch (error) {
      console.error("Failed to fetch live exchange rates:", error);
      // Fallback rates if API fails and no Firestore data
      if (Object.keys(rates).length <= 1) {
        setRates({ USD: 1, TZS: 2500, KES: 150, UGX: 3800, EUR: 0.92, GBP: 0.79 });
      }
    }
  };

  useEffect(() => {
    let unsubscribeUserDoc = () => {};

    const unsubscribeAuth = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setIsAuthReady(true);
      
      if (u) {
        // Check if user is the hardcoded admin
        if (u.email === "mr.dummy3719@gmail.com") {
          setIsAdmin(true);
          setIsSeller(true);
        }
        
        // Listen to user document for role and other properties (like referredBy)
        unsubscribeUserDoc = onSnapshot(doc(db, 'users', u.uid), (docSnap) => {
          if (docSnap.exists()) {
            const userData = docSnap.data() as UserProfile;
            setUserProfile(userData);
            if (u.email !== "mr.dummy3719@gmail.com") {
              setIsAdmin(userData.role === 'admin');
              setIsSeller(userData.role === 'seller' || userData.role === 'admin');
              setIsDriver(userData.role === 'driver');
            }
          } else {
            setUserProfile(null);
            if (u.email !== "mr.dummy3719@gmail.com") {
              setIsAdmin(false);
              setIsSeller(false);
              setIsDriver(false);
            }
          }
        }, (error) => {
          console.error("Error listening to user doc:", error);
          if (u.email !== "mr.dummy3719@gmail.com") {
            setIsAdmin(false);
            setIsSeller(false);
            setIsDriver(false);
          }
        });
      } else {
        setIsAdmin(false);
        setIsSeller(false);
        setIsDriver(false);
        setUserProfile(null);
        unsubscribeUserDoc();
      }
    });

    return () => {
      unsubscribeAuth();
      unsubscribeUserDoc();
    };
  }, []);

  useEffect(() => {
    if (!isAuthReady) return;

    const productsRef = collection(db, 'products');
    const unsubscribeProducts = onSnapshot(productsRef, (snapshot) => {
      const p = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product));
      setProducts(p);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'products');
    });

    let unsubscribeOrders = () => {};
    if (isSeller || isAdmin || isDriver) {
      const ordersRef = collection(db, 'orders');
      const q = query(ordersRef, orderBy('createdAt', 'desc'));
      unsubscribeOrders = onSnapshot(q, (snapshot) => {
        const o = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
        setOrders(o);
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, 'orders');
      });
    } else {
      setOrders([]);
    }

    return () => {
      unsubscribeProducts();
      unsubscribeOrders();
    };
  }, [isAuthReady, isAdmin]);

  useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if(error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
        }
      }
    }
    testConnection();
  }, []);

  const addToCart = (product: Product, selectedVariations?: { [key: string]: string }, quantity: number = 1) => {
    setCart(prev => {
      const existing = prev.find(item => 
        item.id === product.id && 
        JSON.stringify(item.selectedVariations) === JSON.stringify(selectedVariations)
      );
      if (existing) {
        return prev.map(item => 
          (item.id === product.id && JSON.stringify(item.selectedVariations) === JSON.stringify(selectedVariations))
            ? { ...item, quantity: item.quantity + quantity } 
            : item
        );
      }
      return [...prev, { 
        ...product, 
        cartId: Math.random().toString(36).substr(2, 9),
        quantity, 
        selectedVariations 
      }];
    });
  };

  const awardReferralCommission = async (referrerId: string, inviteeId: string, inviteeRole: string, orderId: string, income: number, type: 'seller_sale' | 'driver_delivery') => {
    const commission = income * 0.03;
    if (commission <= 0) return;

    try {
      // 1. Record the earning
      await addDoc(collection(db, 'referral_earnings'), {
        referrerId,
        inviteeId,
        inviteeRole,
        orderId,
        amount: commission,
        type,
        createdAt: new Date().toISOString()
      });

      // 2. Update referrer's balance
      const referrerRef = doc(db, 'users', referrerId);
      await updateDoc(referrerRef, {
        referralEarnings: increment(commission)
      });
    } catch (error) {
      console.error("Error awarding referral commission:", error);
    }
  };

  const addOrder = async (order: Order) => {
    const path = `orders/${order.id}`;
    try {
      await setDoc(doc(db, 'orders', order.id), { ...order, currency });
      
      // Calculate referral commission for sellers
      const sellers = new Set(order.items.map(i => i.sellerId).filter(Boolean));
      for (const sellerId of sellers) {
        if (!sellerId) continue;
        const sellerDoc = await getDoc(doc(db, 'users', sellerId as string));
        if (sellerDoc.exists()) {
          const sellerData = sellerDoc.data();
          if (sellerData.referredBy) {
            const sellerItems = order.items.filter(i => i.sellerId === sellerId);
            const sellerProfit = sellerItems.reduce((s, i) => s + (i.price * (i.markup / 100)) * i.quantity, 0);
            await awardReferralCommission(sellerData.referredBy, sellerId as string, 'seller', order.id, sellerProfit, 'seller_sale');
          }
        }
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  };

  const addProduct = async (product: Product) => {
    const path = `products/${product.id}`;
    try {
      await setDoc(doc(db, 'products', product.id), product);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  };

  const updateProduct = async (product: Product) => {
    const path = `products/${product.id}`;
    try {
      await setDoc(doc(db, 'products', product.id), product);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  };

  const deleteProduct = async (productId: string) => {
    const path = `products/${productId}`;
    try {
      await deleteDoc(doc(db, 'products', productId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  };

  const updateOrder = useCallback(async (orderId: string, data: Partial<Order>) => {
    const path = `orders/${orderId}`;
    try {
      await updateDoc(doc(db, 'orders', orderId), data);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  }, []);

  const reportDriver = async (orderId: string, notes: string) => {
    const order = orders.find(o => o.id === orderId);
    if (!order || !order.deliveryDetails?.driverId) return;

    const driverId = order.deliveryDetails.driverId;
    const penaltyAmount = order.total * 1.5; // Heavier penalty for red flags

    try {
      const driverRef = doc(db, 'users', driverId);
      const driverSnap = await getDoc(driverRef);
      
      if (driverSnap.exists()) {
        const driverData = driverSnap.data() as UserProfile;
        
        // 1. Update Order Status
        await updateOrder(orderId, {
          status: 'reported',
          disputeNotes: notes,
          automationLog: [
            ...(order.automationLog || []),
            `[SECURITY] CRITICAL RED FLAG: Reported by user.`,
            `[SECURITY] Legal report generated for ${driverData.displayName}.`,
            `[SECURITY] PII Data (National ID: ${driverData.nationalId || 'REDACTED'}) transmitted to investigation department.`
          ]
        });

        // 2. Update Driver Profile (Red Flag)
        await updateDoc(driverRef, {
          walletBalance: increment(-penaltyAmount),
          'driverVerification.status': 'flagged',
          'driverVerification.flaggedReason': notes,
          'driverVerification.reportedToAuthorities': true,
          isActive: false
        });

        // 3. Create Official Authority Report
        await addDoc(collection(db, 'police_reports'), {
          type: 'DRIVER_CRITICAL_INCIDENT',
          driverId,
          orderId,
          summary: notes,
          timestamp: new Date().toISOString(),
          driverDigitalFile: {
            name: driverData.displayName,
            nida: driverData.nationalId,
            birthCert: driverData.driverVerification?.birthCertUrl,
            selfie: driverData.driverVerification?.selfieUrl,
            location: driverData.location,
            phone: driverData.phone
          }
        });

        alert(`CRITICAL: Driver ${driverData.displayName} has been flagged and reported to the authorities. All digital credentials (NIDA, Birth Cert, Vehicle ID) have been transmitted for official filing.`);
      }
    } catch (error) {
      console.error("Failed to report driver:", error);
    }
  };
  
  const releaseFunds = async (orderId: string) => {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;

    try {
      // 1. Calculate distributions based on distance-calculated fees
      const total = order.total;
      const rateToUSD = rates[order.currency] || 1;
      
      // Driver gets the delivery fee (convert back to USD for wallet balance if needed)
      const driverFee = order.deliveryDetails?.deliveryFee 
        ? order.deliveryDetails.deliveryFee / rateToUSD 
        : total * 0.05; 
      
      // Supplier gets more than just source cost in some models, but let's use sourceCost as the baseline
      const supplierPayout = order.sourceCost; // The cost of goods
      const platformProfit = order.profit; // The markup/profit for product creator

      // Platform escrow card calculations (1.0% increment)
      const originalTotalUSD = order.subtotal || (order.total / 1.01);
      const escrowFeeUSD = order.escrowFee || (originalTotalUSD * 0.01);
      const platformCutUSD = order.platformCut || (order.inviterId ? originalTotalUSD * 0.007 : originalTotalUSD * 0.01);
      const inviterCutUSD = order.inviterCut || (order.inviterId ? originalTotalUSD * 0.003 : 0);
      const referrerId = order.inviterId || null;

      // 2. Pay Inviter if order was referred
      if (referrerId && inviterCutUSD > 0) {
        const inviterRef = doc(db, 'users', referrerId);
        await updateDoc(inviterRef, {
          walletBalance: increment(inviterCutUSD),
          referralEarnings: increment(inviterCutUSD)
        });

        // Record a referral earning document
        await addDoc(collection(db, 'referral_earnings'), {
          referrerId: referrerId,
          inviteeId: order.buyerId || 'anonymous',
          inviteeRole: 'buyer',
          orderId: order.id,
          amount: inviterCutUSD,
          type: 'buyer_checkout_referral',
          createdAt: new Date().toISOString()
        });
      }

      // 3. Log settlement transfer to the specified Visa bank card
      await addDoc(collection(db, 'bank_payouts'), {
        orderId: order.id,
        amountUSD: platformCutUSD,
        amountLocal: platformCutUSD * rateToUSD,
        currency: order.currency,
        cardNo: '5505580004295960',
        expiry: '07/30',
        cvv: '679',
        status: 'completed',
        payoutType: referrerId ? 'referred_0.7_percent' : 'standard_1.0_percent',
        createdAt: new Date().toISOString()
      });

      // 4. Update status and log
      await updateOrder(orderId, {
        status: 'delivered',
        deliveryDetails: {
          ...order.deliveryDetails,
          deliveredAt: new Date().toISOString()
        },
        automationLog: [
          ...(order.automationLog || []),
          `[SCAN] QR Code verified by Customer.`,
          `[FINANCE] Payment released from DropShip Pro Escrow.`,
          `[FINANCE] Driver payout (Distance: ${order.deliveryDetails?.distanceKm?.toFixed(1)}km): ${formatPrice(driverFee * rateToUSD, order.currency, rates)}.`,
          `[FINANCE] Supplier payout: ${formatPrice(supplierPayout * rateToUSD, order.currency, rates)}.`,
          `[FINANCE] Platform/Creator profit: ${formatPrice(platformProfit * rateToUSD, order.currency, rates)}.`,
          `[ESCROW] Platform fee settlement complete:`,
          `  - Platform Card Cut (${referrerId ? '0.7%' : '1.0%'}): ${formatPrice(platformCutUSD * rateToUSD, order.currency, rates)} settled to Visa *5960.`,
          referrerId ? `  - Inviter Referral Cut (0.3%): ${formatPrice(inviterCutUSD * rateToUSD, order.currency, rates)} credited to Referrer.` : `  - Standard non-referred checkout.`
        ]
      });

      // 5. Pay Driver
      if (order.deliveryDetails?.driverId) {
        const driverRef = doc(db, 'users', order.deliveryDetails.driverId);
        await updateDoc(driverRef, {
          walletBalance: increment(driverFee)
        });
      }

      // 6. Pay Sellers (Supplier + Platform profit)
      const sellers = new Set(order.items.map(i => i.sellerId).filter(Boolean));
      for (const sellerId of sellers) {
        if (!sellerId) continue;
        const sellerItems = order.items.filter(i => i.sellerId === sellerId);
        const sellerSourceCost = sellerItems.reduce((s, i) => s + (i.price * i.quantity), 0);
        const sellerProfit = sellerItems.reduce((s, i) => s + (i.price * (i.markup / 100) * i.quantity), 0);
        
        await updateDoc(doc(db, 'users', sellerId as string), {
          walletBalance: increment(sellerSourceCost + sellerProfit)
        });

        // Check for referral commission
        const sellerDoc = await getDoc(doc(db, 'users', sellerId as string));
        if (sellerDoc.exists()) {
          const sellerData = sellerDoc.data();
          if (sellerData.referredBy) {
            const commission = sellerProfit * 0.1; // 10% of profit to referrer
            await awardReferralCommission(sellerData.referredBy, sellerId as string, 'seller', order.id, commission, 'seller_sale');
          }
        }
      }

      alert("QR Verified! Funds released successfully to Driver, Supplier, and Platform Card settlement.");
    } catch (error) {
      console.error("Fund release failed:", error);
      alert("Error releasing funds.");
    }
  };

  const updateProfileData = async (data: Partial<UserProfile>) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'users', user.uid), data);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}`);
    }
  };

  useEffect(() => {
    const handleOrderUpdate = (e: any) => {
      const { id, automationStatus, automationLog, status } = e.detail;
      const updateData: Partial<Order> = { automationStatus, automationLog };
      if (status) updateData.status = status;
      updateOrder(id, updateData);
    };
    window.addEventListener('order_updated', handleOrderUpdate);
    return () => window.removeEventListener('order_updated', handleOrderUpdate);
  }, [updateOrder]);

  return (
    <ErrorBoundary>
      <Router>
        <div className="min-h-screen bg-white font-sans text-gray-900">
          <Navbar 
            cart={cart} 
            isAdmin={isAdmin} 
            isSeller={isSeller}
            isDriver={isDriver}
            currency={currency}
            setCurrency={setCurrency}
            rates={rates}
            user={user}
            setShowAuthModal={setShowAuthModal}
            isInstallable={isInstallable}
            installApp={installApp}
          />
          <main className="pb-24 sm:pb-0">
            <Routes>
              <Route path="/" element={
                <Storefront 
                  products={products.filter(p => p.status === 'approved')} 
                  addToCart={addToCart} 
                  currency={currency} 
                  rates={rates} 
                  isAdmin={isAdmin} 
                  user={user}
                  isInstallable={isInstallable}
                  installApp={installApp}
                />
              } />
              <Route path="/admin" element={
                isAdmin ? (
                  <AdminPanel 
                    products={products} 
                    addProduct={addProduct}
                    updateProduct={updateProduct}
                    deleteProduct={deleteProduct}
                    orders={orders} 
                    updateOrder={updateOrder}
                    currency={currency} 
                    rates={rates} 
                    user={user}
                    isAdmin={isAdmin}
                    reportDriver={reportDriver}
                  />
                ) : (
                  <div className="min-h-[60vh] flex items-center justify-center">
                    <div className="text-center">
                      <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                      <h2 className="text-xl font-bold mb-2">Access Denied</h2>
                      <p className="text-gray-500 mb-6">You must be an administrator to access the Merchant Portal.</p>
                      <Link to="/" className="text-indigo-600 font-bold">Return to Store</Link>
                    </div>
                  </div>
                )
              } />
              <Route path="/seller" element={
                isSeller ? (
                  <SellerDashboard 
                    user={user as UserProfile}
                    products={products}
                    orders={orders}
                    currency={currency}
                    rates={rates}
                    updateProfile={updateProfileData}
                  />
                ) : (
                  <div className="min-h-[60vh] flex items-center justify-center">
                    <div className="text-center">
                      <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                      <h2 className="text-xl font-bold mb-2">Access Denied</h2>
                      <p className="text-gray-500 mb-6">You must be a registered seller to access the Seller Dashboard.</p>
                      <Link to="/" className="text-indigo-600 font-bold">Return to Store</Link>
                    </div>
                  </div>
                )
              } />
              <Route path="/driver" element={
                isDriver ? (
                  <DriverDashboard 
                    user={user}
                    orders={orders}
                    updateOrder={updateOrder}
                    currency={currency}
                    rates={rates}
                    awardReferralCommission={awardReferralCommission}
                  />
                ) : (
                  <div className="min-h-[60vh] flex items-center justify-center">
                    <div className="text-center">
                      <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                      <h2 className="text-xl font-bold mb-2">Access Denied</h2>
                      <p className="text-gray-500 mb-6">You must be a registered driver to access the Driver Portal.</p>
                      <Link to="/" className="text-indigo-600 font-bold">Return to Store</Link>
                    </div>
                  </div>
                )
              } />
              <Route path="/referrals" element={
                user ? (
                  <ReferralDashboard 
                    user={user as UserProfile}
                    currency={currency}
                    rates={rates}
                    updateProfile={updateProfileData}
                  />
                ) : (
                  <div className="min-h-[60vh] flex items-center justify-center">
                    <div className="text-center">
                      <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                      <h2 className="text-xl font-bold mb-2">Login Required</h2>
                      <p className="text-gray-500 mb-6">Please login to access your referral dashboard.</p>
                      <button onClick={() => setShowAuthModal(true)} className="text-indigo-600 font-bold">Login Now</button>
                    </div>
                  </div>
                )
              } />
              <Route path="/cart" element={<CartPage cart={cart} setCart={setCart} addOrder={addOrder} currency={currency} rates={rates} user={user} userProfile={userProfile} />} />
              <Route path="/dashboard" element={
                user ? (
                  <CustomerDashboard 
                    user={user as UserProfile}
                    orders={orders}
                    currency={currency}
                    rates={rates}
                    reportDriver={reportDriver}
                    releaseFunds={releaseFunds}
                    updateOrder={updateOrder}
                    isInstallable={isInstallable}
                    installApp={installApp}
                    updateProfile={updateProfileData}
                  />
                ) : (
                  <div className="min-h-[60vh] flex items-center justify-center">
                    <div className="text-center">
                      <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                      <h2 className="text-xl font-bold mb-2">Login Required</h2>
                      <p className="text-gray-500 mb-6">Please login to access your dashboard.</p>
                      <button onClick={() => setShowAuthModal(true)} className="text-indigo-600 font-bold">Login Now</button>
                    </div>
                  </div>
                )
              } />
            </Routes>
          </main>

          <MobileNavigation 
            user={user} 
            cartCount={cart.length} 
            isInstallable={isInstallable}
            installApp={installApp}
          />

          {user && !isAdmin && <ChatWidget user={user} />}

          <AnimatePresence>
            {showAuthModal && (
              <AuthModal 
                onClose={() => setShowAuthModal(false)} 
                onSuccess={() => setShowAuthModal(false)} 
              />
            )}
          </AnimatePresence>
          
          <footer className="border-t border-gray-100 py-12 mt-24">
            <div className="max-w-7xl mx-auto px-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-12 mb-12">
                <div className="text-center md:text-left">
                  <div className="flex items-center justify-center md:justify-start gap-2 mb-4">
                    <Package className="w-6 h-6 text-indigo-600" />
                    <span className="font-bold tracking-tight text-xl">Dropship Pro Alpha</span>
                  </div>
                  <p className="text-sm text-gray-500 leading-relaxed mb-6">
                    The best deals in Dar es Salaam. Fast delivery, and quality products.
                  </p>
                  <div className="flex items-center justify-center md:justify-start gap-4 opacity-50 grayscale">
                    <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/5/5e/Visa_Inc._logo.svg/2560px-Visa_Inc._logo.svg.png" className="h-4" alt="Visa" referrerPolicy="no-referrer" />
                    <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/2/2a/Mastercard-logo.svg/1280px-Mastercard-logo.svg.png" className="h-6" alt="Mastercard" referrerPolicy="no-referrer" />
                    <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/b/b5/PayPal.svg/1200px-PayPal.svg.png" className="h-4" alt="PayPal" referrerPolicy="no-referrer" />
                  </div>
                </div>
                <div className="text-center">
                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Support & Feedback</h4>
                  <p className="text-sm text-gray-600 mb-2">Have a complaint or suggestion?</p>
                  <a href="mailto:mac8.marketplace@gmail.com" className="text-indigo-600 font-bold hover:underline">mac8.marketplace@gmail.com</a>
                </div>
                <div className="text-center md:text-right">
                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Quick Links</h4>
                  <div className="flex flex-col gap-2 text-sm text-gray-600">
                    <Link to="/" className="hover:text-indigo-600 transition-colors">Storefront</Link>
                    <Link to="/admin" className="hover:text-indigo-600 transition-colors">Merchant Portal</Link>
                  </div>
                </div>
              </div>
              <div className="pt-12 border-t border-gray-50 text-center">
                <p className="text-xs text-gray-400">© 2026 Dropship Pro Alpha. All rights reserved.</p>
              </div>
            </div>
          </footer>
        </div>
      </Router>
    </ErrorBoundary>
  );
}

