import { GoogleGenAI } from "@google/genai";
import React, { useState, useEffect, Component, useCallback } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useNavigate } from 'react-router-dom';
import { ShoppingCart, Plus, Minus, Trash2, ExternalLink, Package, Settings, Store, ChevronRight, ChevronDown, CreditCard, CheckCircle, CheckCircle2, Clock, Truck, ShieldCheck, AlertCircle, Smartphone, X, Info, MapPin, Check, Plane, History, LogIn, LogOut, Search, Loader2, Play, Share2, Star, BarChart3, TrendingUp, DollarSign, MessageSquare, Send } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Product, CartItem, CustomerInfo, Order, ExchangeRates, Chat, ChatMessage } from './types';
import { collection, doc, onSnapshot, setDoc, updateDoc, deleteDoc, query, orderBy, getDocFromServer, addDoc, serverTimestamp, where, limit, getDocs, getDoc } from 'firebase/firestore';
import { signInWithPopup, signOut, onAuthStateChanged, User, createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { db, auth, googleProvider } from './firebase';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, AreaChart, Area, PieChart, Pie, Cell, Legend } from 'recharts';
import * as Slider from '@radix-ui/react-slider';

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

const ProductModal = ({ 
  product, 
  onClose, 
  addToCart, 
  onConfirm,
  currency, 
  rates,
  isAdmin
}: { 
  product: Product; 
  onClose: () => void; 
  addToCart?: (p: Product, selectedVariations?: { [key: string]: string }, quantity?: number) => void;
  onConfirm?: (p: Product) => void;
  currency: string;
  rates: ExchangeRates;
  isAdmin?: boolean;
}) => {
  const [selectedVariations, setSelectedVariations] = useState<{ [key: string]: string }>({});
  const [quantity, setQuantity] = useState(1);
  const [currentImage, setCurrentImage] = useState(product.image);
  const [editedTitle, setEditedTitle] = useState(product.title);
  const [editedDescription, setEditedDescription] = useState(product.description);

  useEffect(() => {
    setCurrentImage(product.image);
    setEditedTitle(product.title);
    setEditedDescription(product.description);
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
        className="bg-white rounded-3xl max-w-4xl w-full max-h-[90vh] overflow-hidden shadow-2xl flex flex-col md:flex-row"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="md:w-1/2 h-64 md:h-auto relative bg-gray-50">
          <img 
            src={currentImage || null} 
            alt={product.title} 
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
          />
          <button 
            onClick={onClose}
            className="absolute top-4 left-4 p-2 bg-white/80 backdrop-blur rounded-full text-gray-900 hover:bg-white transition-colors shadow-sm md:hidden"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="md:w-1/2 p-8 md:p-12 overflow-y-auto flex flex-col">
          <div className="flex justify-between items-start mb-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded uppercase tracking-wider">{product.category || 'General'}</span>
                {product.sourceUrl.includes('alibaba.com') && (
                  <span className="text-[10px] font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded uppercase tracking-wider flex items-center gap-1">
                    <img src="https://upload.wikimedia.org/wikipedia/en/thumb/8/80/Alibaba.com_logo.svg/1200px-Alibaba.com_logo.svg.png" alt={null} className="h-2" referrerPolicy="no-referrer" />
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
                    className="w-full text-2xl font-bold text-gray-900 mb-2 leading-tight border-b border-dashed border-gray-300 focus:border-indigo-500 outline-none bg-transparent"
                    placeholder="Product Title"
                  />
                  <div className="text-2xl font-extrabold text-indigo-600">
                    {formatPrice(product.price * (1 + product.markup / 100), currency, rates, product.sourceCurrency)}
                  </div>
                </div>
              ) : (
                <>
                  <h2 className="text-2xl font-bold text-gray-900 mb-2 leading-tight">{product.title}</h2>
                  <div className="text-2xl font-extrabold text-indigo-600">
                    {formatPrice(product.price * (1 + product.markup / 100), currency, rates, product.sourceCurrency)}
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

          <div className="space-y-8 flex-1">
            <section>
              <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                <Info className="w-3 h-3" />
                Description
              </h4>
              {isAdmin && onConfirm ? (
                <textarea
                  value={editedDescription}
                  onChange={(e) => setEditedDescription(e.target.value)}
                  className="w-full text-gray-600 leading-relaxed border border-gray-200 rounded-xl p-4 focus:ring-2 focus:ring-indigo-500 outline-none min-h-[150px]"
                  placeholder="Product Description"
                />
              ) : (
                <p className="text-gray-600 leading-relaxed">{product.description}</p>
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
                                    onClick={() => setSelectedVariations(prev => ({ ...prev, [v.name]: opt.name }))}
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
                                          "w-14 h-14 rounded-xl overflow-hidden border-2 transition-all",
                                          onConfirm ? "cursor-pointer hover:border-indigo-600" : "border-transparent",
                                          onConfirm && currentImage === opt.image ? "border-indigo-600 shadow-md" : "border-transparent",
                                          selectedVariations[v.name] === opt.name && !onConfirm ? "border-indigo-600 shadow-md" : ""
                                        )}
                                        onClick={(e) => {
                                          if (onConfirm) {
                                            e.stopPropagation();
                                            setCurrentImage(opt.image!);
                                          } else {
                                            setSelectedVariations(prev => ({ ...prev, [v.name]: opt.name }));
                                          }
                                        }}
                                      >
                                        <img src={opt.image || null} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                      </div>
                                    ) : (
                                      <div className={cn(
                                        "min-w-[40px] h-10 px-3 flex items-center justify-center rounded-xl text-[11px] font-bold border transition-all",
                                        selectedVariations[v.name] === opt.name 
                                          ? "bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-100" 
                                          : "bg-white text-gray-600 border-gray-200 hover:border-indigo-300"
                                      )}>
                                        {opt.name}
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
                      addToCart?.(product, selectedVariations, quantity);
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
  const [role, setRole] = useState<'buyer' | 'seller'>('buyer');
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
        
        // Save user role to Firestore
        await setDoc(doc(db, 'users', userCredential.user.uid), {
          uid: userCredential.user.uid,
          email: userCredential.user.email,
          displayName: username,
          role: role,
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
        className="bg-white rounded-3xl max-w-md w-full overflow-hidden shadow-2xl p-8"
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
              <div className="grid grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => setRole('buyer')}
                  className={cn(
                    "py-3 rounded-xl font-bold border-2 transition-all flex items-center justify-center gap-2",
                    role === 'buyer' ? "border-indigo-600 bg-indigo-50 text-indigo-600" : "border-gray-100 text-gray-400 hover:border-gray-200"
                  )}
                >
                  <ShoppingCart className="w-4 h-4" />
                  Buyer
                </button>
                <button
                  type="button"
                  onClick={() => setRole('seller')}
                  className={cn(
                    "py-3 rounded-xl font-bold border-2 transition-all flex items-center justify-center gap-2",
                    role === 'seller' ? "border-indigo-600 bg-indigo-50 text-indigo-600" : "border-gray-100 text-gray-400 hover:border-gray-200"
                  )}
                >
                  <Store className="w-4 h-4" />
                  Seller
                </button>
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

const Navbar = ({ 
  cartCount, 
  isAdmin, 
  currency, 
  setCurrency, 
  rates,
  user
}: { 
  cartCount: number; 
  isAdmin: boolean;
  currency: string;
  setCurrency: (c: string) => void;
  rates: ExchangeRates;
  user: User | null;
}) => {
  const [showAuthModal, setShowAuthModal] = useState(false);

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  return (
    <nav className="border-b border-gray-200 bg-white sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          <Link to="/" className="flex items-center gap-2">
            <Package className="w-8 h-8 text-indigo-600" />
            <span className="text-xl font-bold tracking-tight text-gray-900">MAC8 Marketplace</span>
          </Link>
          <div className="flex items-center gap-6">
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
            {isAdmin ? (
              <Link to="/admin" className="text-sm font-medium text-gray-600 hover:text-indigo-600 transition-colors">Merchant Portal</Link>
            ) : (
              <Link to="/admin" className="text-sm font-medium text-gray-600 hover:text-indigo-600 transition-colors">Sell on MAC8</Link>
            )}
            
            {user ? (
              <div className="flex items-center gap-3">
                {user.photoURL ? (
                  <img 
                    src={user.photoURL || null} 
                    alt={user.displayName || ""} 
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
              <Link to="/cart" className="relative p-2 text-gray-600 hover:text-indigo-600 transition-colors">
                <ShoppingCart className="w-6 h-6" />
                {cartCount > 0 && (
                  <span className="absolute top-0 right-0 bg-indigo-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                    {cartCount}
                  </span>
                )}
              </Link>
            )}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showAuthModal && (
          <AuthModal 
            onClose={() => setShowAuthModal(false)} 
            onSuccess={() => setShowAuthModal(false)} 
          />
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
    <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden flex h-[600px]">
      {/* Chat List */}
      <div className="w-1/3 border-r border-gray-100 flex flex-col">
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
      <div className="flex-1 flex flex-col bg-gray-50/30">
        {selectedChat ? (
          <>
            <div className="p-4 bg-white border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
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
  user
}: { 
  products: Product[]; 
  addToCart: (p: Product, selectedVariations?: { [key: string]: string }) => void;
  currency: string;
  rates: ExchangeRates;
  isAdmin: boolean;
  user: User | null;
}) => {
  const [search, setSearch] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 10000]);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedVariationFilters, setSelectedVariationFilters] = useState<{ [key: string]: string[] }>({});
  
  // Temporary state for filters before applying
  const [pendingPriceRange, setPendingPriceRange] = useState<[number, number]>([0, 10000]);
  const [pendingVariationFilters, setPendingVariationFilters] = useState<{ [key: string]: string[] }>({});
  const [pendingCategory, setPendingCategory] = useState<string>('All');

  const categories = ['All', ...new Set(products.map(p => p.category || 'General'))];
  const allVariations = products.reduce((acc, p) => {
    p.variations?.forEach(v => {
      if (!acc[v.name]) acc[v.name] = new Set();
      v.options.forEach(opt => acc[v.name].add(opt.name));
    });
    return acc;
  }, {} as { [key: string]: Set<string> });

  const approvedProducts = products.filter(p => {
    const matchesSearch = p.title.toLowerCase().includes(search.toLowerCase()) ||
      p.description.toLowerCase().includes(search.toLowerCase());
    const finalPrice = (p.price * (1 + p.markup / 100)) / (rates[p.sourceCurrency] || 1);
    const matchesPrice = finalPrice >= priceRange[0] && finalPrice <= priceRange[1];
    const matchesCategory = selectedCategory === 'All' || (p.category || 'General') === selectedCategory;
    const matchesVariations = (Object.entries(selectedVariationFilters) as [string, string[]][]).every(([vName, vOpts]) => {
      if (vOpts.length === 0) return true;
      return p.variations?.some(v => v.name === vName && v.options.some(opt => vOpts.includes(opt.name)));
    });

    return p.status === 'approved' && matchesSearch && matchesPrice && matchesCategory && matchesVariations;
  });

  const applyFilters = () => {
    setPriceRange(pendingPriceRange);
    setSelectedVariationFilters(pendingVariationFilters);
    setSelectedCategory(pendingCategory);
  };

  const resetFilters = () => {
    setPendingPriceRange([0, 10000]);
    setPendingVariationFilters({});
    setPendingCategory('All');
    setSearch('');
    
    setPriceRange([0, 10000]);
    setSelectedVariationFilters({});
    setSelectedCategory('All');
  };

  const toggleVariationOption = (vName: string, opt: string) => {
    setPendingVariationFilters(prev => {
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
          />
        )}
      </AnimatePresence>

      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gray-900 py-24 sm:py-32">
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
              <h1 className="text-4xl font-bold tracking-tight text-white sm:text-6xl mb-6">
                Global Products, <br />
                <span className="text-indigo-400">Local Delivery.</span>
              </h1>
              <p className="text-lg leading-8 text-gray-300 mb-10">
                Discover a curated collection of premium goods from around the world. 
                Fast, secure, and reliable shopping experience in Dar es Salaam.
              </p>
              <div className="flex items-center gap-x-6">
                <button 
                  onClick={() => {
                    const el = document.getElementById('products-grid');
                    el?.scrollIntoView({ behavior: 'smooth' });
                  }}
                  className="rounded-xl bg-indigo-600 px-8 py-4 text-sm font-bold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 transition-all"
                >
                  Shop Now
                </button>
                <Link to="/admin" className="text-sm font-bold leading-6 text-white hover:text-indigo-400 transition-colors flex items-center gap-2">
                  Become a Seller <ChevronRight className="w-4 h-4" />
                </Link>
              </div>
            </motion.div>
          </div>
          <div className="mx-auto mt-16 grid max-w-2xl grid-cols-1 gap-6 sm:mt-20 lg:mx-0 lg:max-w-none lg:grid-cols-3">
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
        <header className="mb-12">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 mb-8">
            <div>
              <h2 className="text-4xl font-extrabold text-gray-900 tracking-tight mb-4">Featured Products</h2>
              <p className="text-lg text-gray-500 max-w-2xl">Premium products sourced globally, delivered directly to your door.</p>
            </div>
            <div className="w-full md:w-80">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input 
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search products..."
                  className="w-full pl-12 pr-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all shadow-sm"
                />
              </div>
            </div>
          </div>

          <div className="bg-gray-50 p-8 rounded-3xl border border-gray-100 shadow-sm">
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-12">
              {/* Category Filter */}
              <div className="space-y-4">
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest">Category</label>
                <div className="flex flex-wrap gap-2">
                  {categories.map(cat => (
                    <button
                      key={cat}
                      onClick={() => setPendingCategory(cat)}
                      className={cn(
                        "px-4 py-2 rounded-xl text-xs font-bold transition-all",
                        pendingCategory === cat 
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
                  <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded-lg">
                    {pendingPriceRange[0]} - {pendingPriceRange[1]} {currency}
                  </span>
                </div>
                <Slider.Root
                  className="relative flex items-center select-none touch-none w-full h-5"
                  value={pendingPriceRange}
                  onValueChange={(val) => setPendingPriceRange(val as [number, number])}
                  max={10000}
                  step={100}
                  minStepsBetweenThumbs={1}
                >
                  <Slider.Track className="bg-gray-200 relative grow rounded-full h-[4px]">
                    <Slider.Range className="absolute bg-indigo-600 rounded-full h-full" />
                  </Slider.Track>
                  <Slider.Thumb
                    className="block w-5 h-5 bg-white border-2 border-indigo-600 shadow-lg rounded-full hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                    aria-label="Min price"
                  />
                  <Slider.Thumb
                    className="block w-5 h-5 bg-white border-2 border-indigo-600 shadow-lg rounded-full hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                    aria-label="Max price"
                  />
                </Slider.Root>
                <div className="flex justify-between text-[10px] font-bold text-gray-400">
                  <span>0 {currency}</span>
                  <span>10,000+ {currency}</span>
                </div>
              </div>

              {/* Variation Filters (Multi-select) */}
              <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-8">
                {Object.entries(allVariations).map(([vName, vOpts]) => (
                  <div key={vName} className="space-y-4">
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest">{vName}</label>
                    <div className="flex flex-wrap gap-2">
                      {[...vOpts].map(opt => {
                        const isSelected = pendingVariationFilters[vName]?.includes(opt);
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
                <span>Adjust filters and click apply to update the results.</span>
              </div>
              <div className="flex items-center gap-4 w-full sm:w-auto">
                <button
                  onClick={resetFilters}
                  className="flex-1 sm:flex-none px-6 py-3 rounded-xl text-sm font-bold text-gray-500 hover:bg-gray-100 transition-all flex items-center justify-center gap-2"
                >
                  <X className="w-4 h-4" />
                  Reset
                </button>
                <button
                  onClick={applyFilters}
                  className="flex-1 sm:flex-none px-8 py-3 rounded-xl text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 flex items-center justify-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  Apply Filters
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
                    <p className="text-xs text-gray-500 line-clamp-2 mb-3">{product.description}</p>
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
      </div>
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
  isAdmin
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
}) => {
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
  const [tab, setTab] = useState<'overview' | 'inventory' | 'scraper' | 'approval' | 'orders' | 'tracking' | 'messages'>('overview');
  const [showConfirmClear, setShowConfirmClear] = useState(false);
  const [orderToCancel, setOrderToCancel] = useState<string | null>(null);

  const getDailyStats = () => {
    const stats: { [key: string]: { date: string, Revenue: number, Profit: number, Cost: number } } = {};
    orders.forEach(o => {
      const date = new Date(o.createdAt).toLocaleDateString();
      if (!stats[date]) {
        stats[date] = { date, Revenue: 0, Profit: 0, Cost: 0 };
      }
      stats[date].Revenue += o.total;
      stats[date].Profit += o.profit || 0;
      stats[date].Cost += (o.sourceCost || 0) + (o.shippingCost || 0);
    });
    return Object.values(stats).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()).slice(-7);
  };

  const dailyStats = getDailyStats();

  useEffect(() => {
    localStorage.setItem('dropship_default_markup', markup.toString());
  }, [markup]);

  const handleFulfill = async (orderId: string) => {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;

    try {
      // Update status to processing
      await updateOrder(orderId, { automationStatus: 'processing', automationLog: ['Starting fulfillment simulation...'] });

      const response = await fetch('/api/fulfill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: order.id,
          customer: order.customer,
          items: order.items
        })
      });

      const result = await response.json();

      if (response.ok) {
        await updateOrder(orderId, { 
          automationStatus: 'completed', 
          automationLog: result.logs,
          status: 'fulfilled'
        });
      } else {
        await updateOrder(orderId, { 
          automationStatus: 'failed', 
          automationLog: [...(order.automationLog || []), `Error: ${result.error}`]
        });
      }
    } catch (error) {
      console.error('Fulfillment error:', error);
      await updateOrder(orderId, { 
        automationStatus: 'failed', 
        automationLog: [...(order.automationLog || []), `Critical Error: ${error instanceof Error ? error.message : String(error)}`]
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
    <div className="max-w-5xl mx-auto px-4 py-12">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
          <div className="flex items-center gap-4 mt-1">
            <p className="text-gray-500">Manage your dropshipping empire.</p>
            <button 
              onClick={() => setShowConfirmClear(true)}
              className="text-[10px] font-bold text-red-500 hover:text-red-700 uppercase tracking-widest flex items-center gap-1 transition-colors"
            >
              <Trash2 className="w-3 h-3" />
              Clear Store
            </button>
          </div>
        </div>
        <div className="flex bg-gray-100 p-1 rounded-xl">
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
                  <BarChart3 className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Avg. Profit / Order</div>
                  <div className="text-2xl font-bold text-orange-600">
                    {formatPrice(orders.length > 0 ? orders.reduce((sum, o) => sum + (o.profit || 0), 0) / orders.length : 0, currency, rates, 'USD')}
                  </div>
                </div>
              </div>
              <div className="h-24 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={dailyStats}>
                    <Area type="monotone" dataKey="Profit" stroke="#f97316" fill="#ffedd5" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

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

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
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
              <h3 className="text-lg font-bold mb-6">Top Selling Categories</h3>
              <div className="space-y-4">
                {Array.from(new Set(orders.flatMap(o => o.items.map(i => i.category || 'General')))).map(cat => {
                  const count = orders.reduce((sum, o) => sum + o.items.filter(i => (i.category || 'General') === cat).length, 0);
                  const total = orders.reduce((sum, o) => sum + o.items.length, 0);
                  const percent = (count / total) * 100;
                  return (
                    <div key={cat}>
                      <div className="flex justify-between text-xs font-bold mb-2">
                        <span>{cat}</span>
                        <span>{count} Sales ({percent.toFixed(1)}%)</span>
                      </div>
                      <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                        <div className="bg-indigo-600 h-full" style={{ width: `${percent}%` }} />
                      </div>
                    </div>
                  );
                })}
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
                <div className="flex bg-gray-100 p-1 rounded-xl">
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
                <div className="flex items-center gap-4">
                  <img src={p.image || null} className="w-16 h-16 object-cover rounded-lg" referrerPolicy="no-referrer" />
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-gray-900 truncate">{p.title}</h4>
                    {p.variations && p.variations.length > 0 && (
                      <p className="text-[9px] text-gray-400">
                        {p.variations.length} options: {p.variations.map(v => v.name).join(', ')}
                      </p>
                    )}
                    <div className="flex items-center gap-4 text-sm">
                      <div className="flex items-center gap-1">
                        <span className="text-gray-400">Cost:</span>
                        <input 
                          type="number" 
                          value={p.price} 
                          onChange={(e) => updateProduct({ ...p, price: Number(e.target.value) })}
                          className="w-24 px-2 py-1 border border-gray-200 rounded text-xs font-bold"
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
                        <span className="text-gray-400">Markup:</span>
                        <input 
                          type="number" 
                          value={p.markup} 
                          onChange={(e) => updateProduct({ ...p, markup: Number(e.target.value) })}
                          className="w-16 px-2 py-1 border border-gray-200 rounded text-xs font-bold"
                        />
                        <span className="text-gray-400">%</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-gray-400">Ship:</span>
                        <input 
                          type="number" 
                          value={p.shippingCost || 0} 
                          onChange={(e) => updateProduct({ ...p, shippingCost: Number(e.target.value) })}
                          className="w-16 px-2 py-1 border border-gray-200 rounded text-xs font-bold"
                        />
                      </div>
                      <span className="text-indigo-600 font-bold ml-2">
                        Retail: {formatPrice(p.price * (1 + p.markup / 100), currency, rates, p.sourceCurrency)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
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
          <h2 className="text-xl font-bold">Pending Approval ({pendingCount})</h2>
          {products.filter(p => p.status === 'pending').length === 0 ? (
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

                  {p.variations && p.variations.length > 0 && (
                    <div className="mb-6 space-y-2">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Scraped Variations</p>
                      <div className="space-y-3">
                        {p.variations.map((v, i) => (
                          <div key={i} className="flex items-start gap-2">
                            <span className="text-[10px] font-bold text-gray-500 bg-gray-100 px-2 py-0.5 rounded uppercase mt-0.5">{v.name}:</span>
                            <div className="flex flex-wrap gap-1">
                              {v.options.map((opt, j) => (
                                <span key={j} className="text-[9px] text-gray-600 bg-white border border-gray-100 px-1.5 py-0.5 rounded">{opt.name}</span>
                              ))}
                            </div>
                          </div>
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
                      {(p as any).priceFullText && (
                        <p className="text-[9px] text-gray-400 mt-1 italic">Scraped: "{(p as any).priceFullText}"</p>
                      )}
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

                  <VerificationLogs logs={p.verificationLogs} />

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
            <div className="overflow-hidden border border-gray-200 rounded-2xl">
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
                          <div className="flex justify-between text-xs pt-1 border-t border-gray-100">
                            <span className="text-gray-500">Your Profit:</span>
                            <span className="font-bold text-green-600">
                              {formatPrice(order.profit || 0, order.currency || 'USD', rates, 'USD')}
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
                          {order.status === 'paid' && order.automationStatus !== 'processing' && (
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
            <div className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full uppercase tracking-widest">
              Live Simulation Mode
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
                        <div className="lg:col-span-2">
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
        />
      )}
    </AnimatePresence>
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
  user
}: { 
  cart: CartItem[]; 
  setCart: React.Dispatch<React.SetStateAction<CartItem[]>>;
  addOrder: (o: Order) => Promise<void>;
  currency: string;
  rates: ExchangeRates;
  user: User | null;
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
          zip: postcode || ''
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
              zip: postcode || ''
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
            zip: postcode || ''
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

    // Validation
    const errors: { [key: string]: string } = {};
    if (!customer.name.trim()) errors.name = "Full name is required";
    if (!customer.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)) errors.email = "Valid email is required";
    if (!customer.phone.trim() || customer.phone.length < 8) errors.phone = "Valid phone number is required (min 8 chars)";
    if (!customer.address.trim() || customer.address.length < 5) errors.address = "Valid shipping address is required (min 5 chars)";
    if (!customer.city.trim() || customer.city.length < 2) errors.city = "City is required";
    if (!customer.country.trim() || customer.country.length < 2) errors.country = "Country is required";
    if (!customer.zip.trim() || !/^[a-zA-Z0-9\s-]{3,10}$/.test(customer.zip)) errors.zip = "Valid ZIP/Postal code is required (3-10 chars)";

    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      // Scroll to first error
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
        const totalUSD = cart.reduce((sum, item) => sum + (item.price * (1 + item.markup / 100)) * item.quantity, 0);
        const sourceCostUSD = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const totalShippingCostUSD = cart.reduce((sum, item) => sum + (item.shippingCost || 0) * item.quantity, 0);
        const profitUSD = totalUSD - sourceCostUSD - totalShippingCostUSD;
        
        const newOrder: Order = {
          id: data.orderId || `ORD-${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
          buyerId: user.uid,
          items: [...cart],
          customer: customer,
          total: totalUSD,
          sourceCost: sourceCostUSD,
          shippingCost: totalShippingCostUSD,
          profit: profitUSD,
          paymentMethod,
          status: 'paid',
          automationStatus: 'processing',
          automationLog: [
            `[SYSTEM] ${paymentMethod === 'mpesa' ? 'M-Pesa' : 'Bank Transfer'} payment confirmed. Total: ${formatPrice(totalUSD, 'USD', rates, 'USD')}. Funds held in Escrow.`,
            `[SYSTEM] Split: Full Profit to Owner ($${profitUSD.toFixed(2)}).`,
            `[SYSTEM] Source Cost ($${sourceCostUSD.toFixed(2)}) allocated to Fulfillment Bridge.`
          ],
          createdAt: new Date().toISOString(),
          currency
        };
        await addOrder(newOrder);
        setStep('success');
        setCart([]);
        triggerFulfillment(newOrder);
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
        <h1 className="text-4xl font-bold text-gray-900 mb-4">Payment Successful!</h1>
        <p className="text-lg text-gray-500 mb-4">Your payment has been confirmed. The profit has been transferred to your NMB Bank PLC account (0797691203), and your order has been automatically placed with our source partners.</p>
        <p className="text-sm text-gray-400 mb-12">You will receive an email with tracking information shortly.</p>
        <Link to="/" className="inline-block bg-gray-900 text-white px-8 py-4 rounded-xl font-bold hover:bg-indigo-600 transition-colors">
          Return to Store
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-12">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
        <div className="lg:col-span-2">
          {step === 'cart' ? (
            <>
              <h1 className="text-3xl font-bold mb-8">Shopping Cart</h1>
              {cart.length === 0 ? (
                <div className="text-center py-12 bg-gray-50 rounded-2xl">
                  <p className="text-gray-500 mb-6">Your cart is empty.</p>
                  <Link to="/" className="text-indigo-600 font-bold">Start Shopping</Link>
                </div>
              ) : (
                <div className="space-y-6">
                  {cart.map(item => (
                    <div key={item.cartId} className="flex gap-6 bg-white p-6 rounded-2xl border border-gray-100">
                      <img src={item.image || null} className="w-24 h-24 object-cover rounded-xl" referrerPolicy="no-referrer" />
                      <div className="flex-1">
                        <h3 className="font-bold text-gray-900 mb-1">{item.title}</h3>
                        {item.selectedVariations && Object.entries(item.selectedVariations).length > 0 && (
                          <div className="flex flex-wrap gap-2 mb-3">
                            {Object.entries(item.selectedVariations).map(([name, value]) => (
                              <span key={name} className="text-[10px] font-bold text-gray-400 bg-gray-50 px-2 py-0.5 rounded-md border border-gray-100">
                                {name}: <span className="text-gray-900">{value}</span>
                              </span>
                            ))}
                          </div>
                        )}
                        <p className="text-indigo-600 font-bold mb-4">{formatPrice(item.price * (1 + item.markup / 100), currency, rates, item.sourceCurrency)}</p>
                        <div className="flex items-center gap-4">
                          <select 
                            value={item.quantity}
                            onChange={(e) => {
                              const q = Number(e.target.value);
                              setCart(prev => prev.map(i => i.cartId === item.cartId ? { ...i, quantity: q } : i));
                            }}
                            className="bg-gray-50 border-none rounded-lg px-3 py-1 text-sm outline-none"
                          >
                            {[1,2,3,4,5].map(n => <option key={n} value={n}>{n}</option>)}
                          </select>
                          <button 
                            onClick={() => setCart(prev => prev.filter(i => i.cartId !== item.cartId))}
                            className="text-gray-400 hover:text-red-500 text-sm font-medium"
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
              <button onClick={() => setStep('cart')} className="text-sm font-bold text-indigo-600 mb-6 flex items-center gap-1">
                Back to Cart
              </button>
                <div className="flex justify-between items-center mb-8">
                  <h1 className="text-3xl font-bold">Shipping Details</h1>
                  <div className="flex gap-2">
                    <button 
                      type="button"
                      disabled={isProcessing}
                      onClick={() => setShowLocationModal(true)}
                      className="text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-lg hover:bg-indigo-100 transition-colors disabled:opacity-50 flex items-center gap-2"
                    >
                      <ExternalLink className="w-3 h-3" />
                      Paste Google Maps Link
                    </button>
                    <button 
                      type="button"
                      disabled={isProcessing}
                      onClick={handleAutoDetect}
                      className="text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-lg hover:bg-indigo-100 transition-colors disabled:opacity-50 flex items-center gap-2"
                    >
                      <Smartphone className="w-3 h-3" />
                      {isProcessing ? 'Detecting...' : 'Auto-detect Location'}
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
                      value={customer.name} onChange={e => setCustomer({...customer, name: e.target.value})}
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
                      value={customer.email} onChange={e => setCustomer({...customer, email: e.target.value})}
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
                      value={customer.phone} onChange={e => setCustomer({...customer, phone: e.target.value})}
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
                <div id="field-address">
                  <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Shipping Address</label>
                  <input 
                    type="text" 
                    className={cn(
                      "w-full px-4 py-3 rounded-xl border outline-none focus:ring-2 focus:ring-indigo-500 transition-all",
                      validationErrors.address ? "border-red-500 bg-red-50" : "border-gray-200"
                    )}
                    value={customer.address} onChange={e => setCustomer({...customer, address: e.target.value})}
                  />
                  {validationErrors.address && <p className="text-[10px] text-red-500 font-bold mt-1 uppercase tracking-wider">{validationErrors.address}</p>}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                  <div id="field-city">
                    <label className="block text-xs font-bold text-gray-400 uppercase mb-2">City</label>
                    <input 
                      type="text" 
                      className={cn(
                        "w-full px-4 py-3 rounded-xl border outline-none focus:ring-2 focus:ring-indigo-500 transition-all",
                        validationErrors.city ? "border-red-500 bg-red-50" : "border-gray-200"
                      )}
                      value={customer.city} onChange={e => setCustomer({...customer, city: e.target.value})}
                    />
                    {validationErrors.city && <p className="text-[10px] text-red-500 font-bold mt-1 uppercase tracking-wider">{validationErrors.city}</p>}
                  </div>
                  <div id="field-country">
                    <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Country</label>
                    <input 
                      type="text" 
                      className={cn(
                        "w-full px-4 py-3 rounded-xl border outline-none focus:ring-2 focus:ring-indigo-500 transition-all",
                        validationErrors.country ? "border-red-500 bg-red-50" : "border-gray-200"
                      )}
                      value={customer.country} onChange={e => setCustomer({...customer, country: e.target.value})}
                    />
                    {validationErrors.country && <p className="text-[10px] text-red-500 font-bold mt-1 uppercase tracking-wider">{validationErrors.country}</p>}
                  </div>
                  <div id="field-zip" className="col-span-2 md:col-span-1">
                    <label className="block text-xs font-bold text-gray-400 uppercase mb-2">ZIP / Postal Code</label>
                    <input 
                      type="text" 
                      className={cn(
                        "w-full px-4 py-3 rounded-xl border outline-none focus:ring-2 focus:ring-indigo-500 transition-all",
                        validationErrors.zip ? "border-red-500 bg-red-50" : "border-gray-200"
                      )}
                      value={customer.zip} onChange={e => setCustomer({...customer, zip: e.target.value})}
                    />
                    {validationErrors.zip && <p className="text-[10px] text-red-500 font-bold mt-1 uppercase tracking-wider">{validationErrors.zip}</p>}
                  </div>
                </div>
              </form>
            </>
          )}
        </div>

        <div className="lg:col-span-1">
          <div className="bg-gray-50 rounded-3xl p-8 sticky top-24">
            <h2 className="text-xl font-bold mb-6">Order Summary</h2>
            <div className="space-y-4 mb-8">
              <div className="flex justify-between text-gray-500">
                <span>Subtotal</span>
                <span>{formatPrice(totalUSD, currency, rates, 'USD')}</span>
              </div>
              <div className="flex justify-between text-gray-500">
                <span>Shipping</span>
                <span className="text-green-600 font-medium">Free</span>
              </div>
              <div className="pt-4 border-t border-gray-200 flex justify-between text-xl font-bold text-gray-900">
                <span>Total</span>
                <span>{formatPrice(totalUSD, currency, rates, 'USD')}</span>
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
                {isProcessing ? (paymentMethod === 'mpesa' ? 'Processing M-Pesa...' : 'Processing Bank Transfer...') : `Pay ${formatPrice(totalUSD, currency, rates, 'USD')} via ${paymentMethod === 'mpesa' ? 'M-Pesa' : 'Bank Account'}`}
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

export default function App() {
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [currency, setCurrency] = useState('TZS');
  const [rates, setRates] = useState<ExchangeRates>({ USD: 1 });

  useEffect(() => {
    let unsubscribeUserDoc = () => {};

    const unsubscribeAuth = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setIsAuthReady(true);
      
      if (u) {
        // Check if user is the hardcoded admin
        if (u.email === "mr.dummy3719@gmail.com") {
          setIsAdmin(true);
        } else {
          // Listen to user document for role changes (e.g., after registration)
          unsubscribeUserDoc = onSnapshot(doc(db, 'users', u.uid), (docSnap) => {
            if (docSnap.exists()) {
              const userData = docSnap.data();
              setIsAdmin(userData.role === 'seller');
            } else {
              setIsAdmin(false);
            }
          }, (error) => {
            console.error("Error listening to user role:", error);
            setIsAdmin(false);
          });
        }
      } else {
        setIsAdmin(false);
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
    if (isAdmin) {
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

  const addOrder = async (order: Order) => {
    const path = `orders/${order.id}`;
    try {
      await setDoc(doc(db, 'orders', order.id), { ...order, currency });
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
            cartCount={cart.reduce((s, i) => s + i.quantity, 0)} 
            isAdmin={isAdmin} 
            currency={currency}
            setCurrency={setCurrency}
            rates={rates}
            user={user}
          />
          <main>
            <Routes>
              <Route path="/" element={
                <Storefront 
                  products={products.filter(p => p.status === 'approved')} 
                  addToCart={addToCart} 
                  currency={currency} 
                  rates={rates} 
                  isAdmin={isAdmin} 
                  user={user}
                />
              } />
              <Route path="/admin" element={
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
                />
              } />
              <Route path="/cart" element={<CartPage cart={cart} setCart={setCart} addOrder={addOrder} currency={currency} rates={rates} user={user} />} />
            </Routes>
          </main>

          {user && !isAdmin && <ChatWidget user={user} />}
          
          <footer className="border-t border-gray-100 py-12 mt-24">
            <div className="max-w-7xl mx-auto px-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-12 mb-12">
                <div className="text-center md:text-left">
                  <div className="flex items-center justify-center md:justify-start gap-2 mb-4">
                    <Package className="w-6 h-6 text-indigo-600" />
                    <span className="font-bold tracking-tight text-xl">MAC8 Marketplace</span>
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
                <p className="text-xs text-gray-400">© 2026 MAC8 Marketplace. All rights reserved.</p>
              </div>
            </div>
          </footer>
        </div>
      </Router>
    </ErrorBoundary>
  );
}

