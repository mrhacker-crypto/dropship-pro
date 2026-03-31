import React, { useState, useEffect, Component, useCallback } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useNavigate } from 'react-router-dom';
import { ShoppingCart, Plus, Minus, Trash2, ExternalLink, Package, Settings, Store, ChevronRight, ChevronDown, CreditCard, CheckCircle, Clock, Truck, ShieldCheck, AlertCircle, Smartphone, X, Info, MapPin, Check, Plane, History, LogIn, LogOut, Search, CheckCircle2, Loader2, Play } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Product, CartItem, CustomerInfo, Order, ExchangeRates } from './types';
import { collection, doc, onSnapshot, setDoc, updateDoc, deleteDoc, query, orderBy, getDocFromServer } from 'firebase/firestore';
import { signInWithPopup, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { db, auth, googleProvider } from './firebase';

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

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
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
      <div className={cn(
        "bg-gray-900 rounded-lg p-3 font-mono text-[10px] transition-all duration-300 border border-gray-800",
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

  useEffect(() => {
    setCurrentImage(product.image);
  }, [product.image]);

  useEffect(() => {
    if (product.variations) {
      const initial: { [key: string]: string } = {};
      product.variations.forEach(v => {
        if (v.options.length > 0) initial[v.name] = v.options[0].name;
      });
      setSelectedVariations(initial);
    }
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
            src={currentImage} 
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
            <div className="flex-1">
              <h2 className="text-2xl font-bold text-gray-900 mb-2 leading-tight">{product.title}</h2>
              <div className="text-2xl font-extrabold text-indigo-600">
                {formatPrice(product.price * (1 + product.markup / 100), currency, rates, product.sourceCurrency)}
              </div>
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
              <p className="text-gray-600 leading-relaxed">{product.description}</p>
            </section>

            {product.features && product.features.length > 0 && (
              <section>
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                  <Settings className="w-3 h-3" />
                  Key Features
                </h4>
                <ul className="grid grid-cols-1 gap-3">
                  {product.features.map((feature, i) => (
                    <li key={i} className="flex items-start gap-3 text-sm text-gray-600">
                      <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-1.5 flex-shrink-0" />
                      {feature}
                    </li>
                  ))}
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
                                        <img src={opt.image} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
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

            {product.shippingInfo && (
              <section className="bg-indigo-50/50 rounded-2xl p-4 border border-indigo-100/50">
                <h4 className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                  <Truck className="w-3 h-3" />
                  Shipping & Delivery
                </h4>
                <p className="text-xs text-indigo-900 font-medium leading-relaxed">{product.shippingInfo}</p>
              </section>
            )}

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
                      <img src={img} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
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
            {onConfirm ? (
              <button
                onClick={() => onConfirm({ ...product, image: currentImage })}
                className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 flex items-center justify-center gap-3"
              >
                <Check className="w-5 h-5" />
                Confirm Import
              </button>
            ) : (
              <button
                onClick={() => {
                  addToCart?.(product, selectedVariations, quantity);
                  onClose();
                }}
                className="w-full bg-gray-900 text-white py-4 rounded-2xl font-bold hover:bg-indigo-600 transition-all flex items-center justify-center gap-3 shadow-lg shadow-gray-200"
              >
                <Plus className="w-5 h-5" />
                Add to Cart
              </button>
            )}
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
  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Login failed:", error);
    }
  };

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
            <span className="text-xl font-bold tracking-tight text-gray-900">DropShip Pro</span>
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
            <Link to="/admin" className="text-sm font-medium text-gray-600 hover:text-indigo-600 transition-colors">Admin</Link>
            
            {user ? (
              <div className="flex items-center gap-3">
                {user.photoURL && (
                  <img src={user.photoURL} alt={user.displayName || ""} className="w-8 h-8 rounded-full border border-gray-200" />
                )}
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
                onClick={handleLogin}
                className="flex items-center gap-2 text-sm font-bold text-indigo-600 hover:text-indigo-700 transition-colors bg-indigo-50 px-4 py-2 rounded-xl"
              >
                <LogIn className="w-4 h-4" />
                <span>Login</span>
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
    </nav>
  );
};

// --- Pages ---

const Storefront = ({ 
  products, 
  addToCart, 
  currency, 
  rates,
  isAdmin
}: { 
  products: Product[]; 
  addToCart: (p: Product, selectedVariations?: { [key: string]: string }) => void;
  currency: string;
  rates: ExchangeRates;
  isAdmin: boolean;
}) => {
  const [search, setSearch] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const approvedProducts = products.filter(p => p.status === 'approved' && (
    p.title.toLowerCase().includes(search.toLowerCase()) ||
    p.description.toLowerCase().includes(search.toLowerCase())
  ));

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
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

      <header className="mb-12 flex flex-col md:flex-row md:items-end justify-between gap-8">
        <div>
          <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight mb-4">Curated Collection</h1>
          <p className="text-lg text-gray-500 max-w-2xl">Premium products sourced globally, delivered directly to your door.</p>
        </div>
        <div className="w-full md:w-80">
          <input 
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products..."
            className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
          />
        </div>
      </header>

      {approvedProducts.length === 0 ? (
        <div className="text-center py-24 border-2 border-dashed border-gray-200 rounded-2xl">
          <Store className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900">No products yet</h3>
          <p className="text-gray-500">Check back later or visit the admin panel to import items.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
          {approvedProducts.map((product) => (
            <motion.div
              layout
              key={product.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="group bg-white rounded-2xl border border-gray-100 overflow-hidden hover:shadow-xl transition-all duration-300 flex flex-col"
            >
              <div 
                className="aspect-square overflow-hidden bg-gray-50 relative cursor-pointer"
                onClick={() => setSelectedProduct(product)}
              >
                <img
                  src={product.image}
                  alt={product.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute top-4 right-4 bg-white/90 backdrop-blur px-3 py-1 rounded-full text-sm font-bold text-gray-900 shadow-sm">
                  {formatPrice(product.price * (1 + product.markup / 100), currency, rates, product.sourceCurrency)}
                </div>
              </div>
              <div className="p-6 flex-1 flex flex-col">
                <div 
                  className="cursor-pointer flex-1"
                  onClick={() => setSelectedProduct(product)}
                >
                  <h3 className="text-sm font-semibold text-gray-900 mb-2 line-clamp-2 min-h-[2.5rem] group-hover:text-indigo-600 transition-colors">{product.title}</h3>
                  <p className="text-xs text-gray-500 line-clamp-2 mb-3">{product.description}</p>
                  
                  {product.features && product.features.length > 0 && (
                    <div className="mb-4 space-y-1">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Key Features</p>
                      <ul className="text-[10px] text-gray-600 list-disc list-inside">
                        {product.features.slice(0, 3).map((feature, i) => (
                          <li key={i} className="truncate">{feature}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

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
                  className="w-full bg-gray-900 text-white py-3 rounded-xl font-medium hover:bg-indigo-600 transition-colors flex items-center justify-center gap-2 mt-auto"
                >
                  <Plus className="w-4 h-4" />
                  Add to Cart
                </button>
              </div>
            </motion.div>
          ))}
        </div>
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
  const [markup, setMarkup] = useState(() => {
    const saved = localStorage.getItem('dropship_default_markup');
    return saved ? Number(saved) : 0;
  });
  const [loading, setLoading] = useState(false);
  const [importPreview, setImportPreview] = useState<Product | null>(null);
  const [tab, setTab] = useState<'inventory' | 'approval' | 'orders' | 'tracking'>('inventory');
  const [showConfirmClear, setShowConfirmClear] = useState(false);
  const [orderToCancel, setOrderToCancel] = useState<string | null>(null);

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

  if (!user) {
    return (
      <div className="max-w-md mx-auto px-4 py-24 text-center">
        <ShieldCheck className="w-16 h-16 text-indigo-600 mx-auto mb-6" />
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Admin Access Restricted</h2>
        <p className="text-gray-600 mb-8">Please login with your administrator account to access the dashboard.</p>
        <button 
          onClick={() => signInWithPopup(auth, googleProvider)}
          className="bg-indigo-600 text-white px-8 py-3 rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 flex items-center gap-2 mx-auto"
        >
          <LogIn className="w-5 h-5" />
          Login with Google
        </button>
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
            onClick={() => setTab('inventory')}
            className={cn("px-4 py-2 rounded-lg text-sm font-bold transition-all", tab === 'inventory' ? "bg-white text-indigo-600 shadow-sm" : "text-gray-500")}
          >
            Inventory
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

      {tab === 'inventory' && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
            <div className="bg-white rounded-2xl border border-gray-200 p-8 shadow-sm">
              <h2 className="text-lg font-semibold mb-6">Import New Product</h2>
              <form onSubmit={handleImport} className="grid grid-cols-1 gap-6">
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Product URL</label>
                  <input
                    type="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://example.com/product/123"
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Profit Margin (%)</label>
                  <input
                    type="number"
                    value={markup}
                    onChange={(e) => setMarkup(Number(e.target.value))}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                    min="0"
                    required
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="bg-indigo-600 text-white py-4 rounded-xl font-bold hover:bg-indigo-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-indigo-200"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Importing...
                    </>
                  ) : (
                    <>
                      <Package className="w-5 h-5" />
                      Import Product
                    </>
                  )}
                </button>
              </form>
            </div>

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
                  <img src={p.image} className="w-16 h-16 object-cover rounded-lg" referrerPolicy="no-referrer" />
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
        </>
      )}

      {tab === 'approval' && (
        <div className="space-y-6">
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
                      <img src={p.image} className="w-full h-48 object-cover rounded-xl shadow-sm border border-gray-100" referrerPolicy="no-referrer" />
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
                              <img src={img} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex-1">
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="text-lg font-bold text-gray-900">{p.title}</h3>
                    <div className="flex gap-2">
                      {(p as any).isVerified && (
                        <span className="bg-green-100 text-green-600 text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wider flex items-center gap-1">
                          <ShieldCheck className="w-3 h-3" />
                          Verified
                        </span>
                      )}
                      <span className="bg-orange-100 text-orange-600 text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wider">Pending</span>
                    </div>
                  </div>
                  <p className="text-sm text-gray-500 mb-4 line-clamp-3">{p.description}</p>
                  
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
      </div>
    )}

      {tab === 'orders' && (
        <div className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm">
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Total Revenue (Escrow)</div>
              <div className="text-2xl font-bold text-gray-900">
                {formatPrice(orders.reduce((sum, o) => sum + o.total, 0), currency, rates, 'USD')}
              </div>
              <div className="text-[10px] text-gray-400 mt-1">Total funds processed by bridge</div>
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
                              {formatPrice(order.profit || order.items.reduce((sum, item) => {
                                const profitUSD = (item.price * (item.markup / 100) * item.quantity) / (rates[item.sourceCurrency] || 1);
                                return sum + profitUSD;
                              }, 0), order.currency || 'USD', rates, 'USD')}
                            </span>
                          </div>
                        </div>
                        <div className="mt-2 flex items-center justify-between">
                          <div className="text-[9px] text-indigo-400 font-mono flex items-center gap-1">
                            <Smartphone className="w-2 h-2" />
                            To: 0797691203
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
    )}

      {tab === 'tracking' && (
        <div className="space-y-6">
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
        </div>
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
    </div>
  );
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
  const [customer, setCustomer] = useState<CustomerInfo>({
    name: '', email: '', phone: '', address: '', city: '', country: '', zip: ''
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [mapsLink, setMapsLink] = useState('');

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

  const handleAutoDetect = () => {
    if (!navigator.geolocation) {
      return;
    }

    setIsProcessing(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords;
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`
          );
          const data = await response.json();
          
          if (data.address) {
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
        const geoRes = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`
        );
        const geoData = await geoRes.json();

        if (geoData.address) {
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
    setIsProcessing(true);
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: cart, customerInfo: customer, currency, rates, paymentMethod: 'mpesa' }),
      });
      const data = await res.json();
      
      if (data.success) {
        const totalUSD = cart.reduce((sum, item) => sum + (item.price * (1 + item.markup / 100)) * item.quantity, 0);
        const sourceCostUSD = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const profitUSD = totalUSD - sourceCostUSD;

        const newOrder: Order = {
          id: data.orderId || `ORD-${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
          items: [...cart],
          customer: { ...customer },
          total: totalUSD,
          sourceCost: sourceCostUSD,
          profit: profitUSD,
          status: 'paid',
          automationStatus: 'processing',
          automationLog: [`[SYSTEM] M-Pesa payment confirmed. Total: ${formatPrice(totalUSD, 'USD', rates, 'USD')}. Funds held in Escrow. Split: Profit to 0797691203, Source Cost to Fulfillment Bridge.`],
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
        <p className="text-lg text-gray-500 mb-4">Your M-Pesa payment has been confirmed. The 20% profit has been transferred to 0797691203, and your order has been automatically placed with our source partners.</p>
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
                      <img src={item.image} className="w-24 h-24 object-cover rounded-xl" referrerPolicy="no-referrer" />
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
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Full Name</label>
                    <input 
                      type="text" required 
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 outline-none focus:ring-2 focus:ring-indigo-500"
                      value={customer.name} onChange={e => setCustomer({...customer, name: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Email Address</label>
                    <input 
                      type="email" required 
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 outline-none focus:ring-2 focus:ring-indigo-500"
                      value={customer.email} onChange={e => setCustomer({...customer, email: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase mb-2">M-Pesa Phone Number</label>
                    <input 
                      type="tel" required placeholder="e.g. 2557XXXXXXXX"
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 outline-none focus:ring-2 focus:ring-indigo-500"
                      value={customer.phone} onChange={e => setCustomer({...customer, phone: e.target.value})}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Shipping Address</label>
                  <input 
                    type="text" required 
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 outline-none focus:ring-2 focus:ring-indigo-500"
                    value={customer.address} onChange={e => setCustomer({...customer, address: e.target.value})}
                  />
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase mb-2">City</label>
                    <input 
                      type="text" required 
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 outline-none focus:ring-2 focus:ring-indigo-500"
                      value={customer.city} onChange={e => setCustomer({...customer, city: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Country</label>
                    <input 
                      type="text" required 
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 outline-none focus:ring-2 focus:ring-indigo-500"
                      value={customer.country} onChange={e => setCustomer({...customer, country: e.target.value})}
                    />
                  </div>
                  <div className="col-span-2 md:col-span-1">
                    <label className="block text-xs font-bold text-gray-400 uppercase mb-2">ZIP / Postal Code</label>
                    <input 
                      type="text" required 
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 outline-none focus:ring-2 focus:ring-indigo-500"
                      value={customer.zip} onChange={e => setCustomer({...customer, zip: e.target.value})}
                    />
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
                <Smartphone className="w-5 h-5" />
                {isProcessing ? 'Processing M-Pesa...' : `Pay ${formatPrice(totalUSD, currency, rates, 'USD')} via M-Pesa`}
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
                <h3 className="text-xl font-bold text-gray-900">Paste Maps Link</h3>
              </div>
              <p className="text-gray-600 mb-6 text-sm">Paste your Google Maps location link (e.g., from WhatsApp) to automatically fill your shipping details.</p>
              <div className="space-y-4">
                <input
                  type="url"
                  value={mapsLink}
                  onChange={(e) => setMapsLink(e.target.value)}
                  placeholder="https://maps.app.goo.gl/..."
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  autoFocus
                />
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
                    onClick={handleGoogleMapsLink}
                    disabled={!mapsLink || isProcessing}
                    className="flex-1 px-6 py-3 rounded-xl font-bold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-50"
                  >
                    {isProcessing ? 'Resolving...' : 'Confirm'}
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
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsAuthReady(true);
      if (u) {
        setIsAdmin(u.email === "mr.dummy3719@gmail.com");
      } else {
        setIsAdmin(false);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!isAuthReady) return;

    const productsRef = collection(db, 'products');
    const unsubscribeProducts = onSnapshot(productsRef, (snapshot) => {
      const p = snapshot.docs.map(doc => doc.data() as Product);
      setProducts(p);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'products');
    });

    let unsubscribeOrders = () => {};
    if (isAdmin) {
      const ordersRef = collection(db, 'orders');
      const q = query(ordersRef, orderBy('createdAt', 'desc'));
      unsubscribeOrders = onSnapshot(q, (snapshot) => {
        const o = snapshot.docs.map(doc => doc.data() as Order);
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
            isAdmin={window.location.pathname === '/admin'} 
            currency={currency}
            setCurrency={setCurrency}
            rates={rates}
            user={user}
          />
          <main>
            <Routes>
              <Route path="/" element={<Storefront products={products.filter(p => p.status === 'approved')} addToCart={addToCart} currency={currency} rates={rates} isAdmin={isAdmin} />} />
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
          
          <footer className="border-t border-gray-100 py-12 mt-24">
            <div className="max-w-7xl mx-auto px-4 text-center">
              <div className="flex items-center justify-center gap-2 mb-4 opacity-50">
                <Package className="w-5 h-5" />
                <span className="font-bold tracking-tight">DropShip Pro</span>
              </div>
              <p className="text-sm text-gray-400">© 2026 DropShip Pro. All rights reserved. Powered by AI Studio.</p>
            </div>
          </footer>
        </div>
      </Router>
    </ErrorBoundary>
  );
}

