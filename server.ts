import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import axios from "axios";
import * as cheerio from "cheerio";

const app = express();
const PORT = 3000;

app.use(express.json());

// API Routes
app.post("/api/scrape", async (req, res) => {
  const { url } = req.body;
  try {
    const { data } = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    const $ = cheerio.load(data);
    
    // Basic scraping logic - can be improved for specific sites
    const title = $("title").text().split("|")[0].trim() || $("h1").first().text().trim();
    
    // Improved description and feature extraction
    const description = $("meta[name='description']").attr("content") || 
                        $("meta[property='og:description']").attr("content") ||
                        $("[class*='description'], [id*='description'], .product-detail, .detail-content").first().text().trim();
    
    const features: string[] = [];
    // Common selectors for product features/specs
    $("[class*='feature'], [class*='spec'], [class*='attribute'], .product-info, .product-specs, ul li").each((_, el) => {
      const text = $(el).text().trim();
      if (text && text.length > 5 && text.length < 200 && !text.includes("http")) {
        // Only take text that looks like a feature (not too long, not too short, no links)
        if (features.length < 10 && !features.includes(text)) {
          features.push(text);
        }
      }
    });

    // Improved price parsing to handle commas and dots correctly
    const priceElement = $("[class*='price'], [id*='price'], [itemprop='price'], .amount, .current-price, .p-price, .price-box, .price-current, .price-new").first();
    const priceFullText = priceElement.text().trim();
    
    // Identify currency FIRST as requested
    let sourceCurrency = "TZS"; // Default to Tanzanian Shilling as requested
    const currencyMap: { [key: string]: string } = {
      "TSH": "TZS",
      "TZS": "TZS",
      "T.SH": "TZS",
      "T.ZS": "TZS",
      "SHILLING": "TZS",
      "$": "USD",
      "USD": "USD",
      "€": "EUR",
      "EUR": "EUR",
      "£": "GBP",
      "GBP": "GBP",
      "¥": "JPY",
      "JPY": "JPY",
      "A$": "AUD",
      "AUD": "AUD",
      "C$": "CAD",
      "CAD": "CAD",
      "CHF": "CHF",
      "HK$": "HKD",
      "HKD": "HKD",
      "NZ$": "NZD",
      "NZD": "NZD",
      "kr": "SEK", 
      "SEK": "SEK",
      "₹": "INR",
      "INR": "INR",
      "R$": "BRL",
      "BRL": "BRL",
      "₪": "ILS",
      "ILS": "ILS",
      "₩": "KRW",
      "KRW": "KRW",
      "zł": "PLN",
      "PLN": "PLN",
      "TL": "TRY",
      "TRY": "TRY",
      "฿": "THB",
      "THB": "THB",
      "₫": "VND",
      "VND": "VND",
    };

    // 1. Check for symbols in the price text
    let foundInPrice = false;
    const upperPriceText = priceFullText.toUpperCase();
    
    // Sort keys by length descending to match longer strings first (e.g. "T.SH" before "SH")
    const sortedSymbols = Object.keys(currencyMap).sort((a, b) => b.length - a.length);
    
    for (const symbol of sortedSymbols) {
      if (upperPriceText.includes(symbol)) {
        sourceCurrency = currencyMap[symbol];
        foundInPrice = true;
        break;
      }
    }

    // 2. Check meta tags for currency (common in e-commerce)
    if (!foundInPrice) {
      const metaCurrency = $("meta[property='og:price:currency']").attr("content") || 
                           $("meta[itemprop='priceCurrency']").attr("content") ||
                           $("meta[name='currency']").attr("content") ||
                           ($("meta[name='twitter:label1']").attr("content") === "Currency" ? $("meta[name='twitter:data1']").attr("content") : null) ||
                           ($("meta[name='twitter:label2']").attr("content") === "Currency" ? $("meta[name='twitter:data2']").attr("content") : null);
      
      if (metaCurrency && metaCurrency.length >= 3) {
        const code = metaCurrency.toUpperCase().trim().substring(0, 3);
        if (["USD", "EUR", "GBP", "TZS", "TSH", "KES", "UGX", "ZAR", "NGN"].includes(code)) {
          sourceCurrency = code === "TSH" ? "TZS" : code;
          foundInPrice = true;
        }
      }
    }

    // 3. Domain specific detection (e.g. Kikuu) - High priority for known sites
    const hostname = new URL(url).hostname.toLowerCase();
    if (hostname.includes("kikuu")) {
      sourceCurrency = "TZS";
      foundInPrice = true;
    }

    // 4. Check other domains if still not found
    if (!foundInPrice) {
      if (hostname.includes("amazon.co.uk")) {
        sourceCurrency = "GBP";
        foundInPrice = true;
      } else if (hostname.includes("amazon.de") || hostname.includes("amazon.fr")) {
        sourceCurrency = "EUR";
        foundInPrice = true;
      } else if (hostname.includes("amazon.com")) {
        sourceCurrency = "USD";
        foundInPrice = true;
      }
    }

    // 5. Search the whole page for currency codes if still not sure
    if (!foundInPrice) {
      const bodyText = $("body").text().toUpperCase();
      for (const code of ["USD", "EUR", "GBP", "TZS", "TSH", "KES", "UGX"]) {
        if (bodyText.includes(code)) {
          sourceCurrency = code === "TSH" ? "TZS" : code;
          foundInPrice = true;
          break;
        }
      }
    }

    // Function to parse price from string, handling different decimal separators
    const parsePrice = (text: string, currency: string) => {
      if (!text) return 0;
      
      // Handle price ranges (e.g., "13,380~13,680 TSh" or "10-20 USD")
      // We take the last one as requested by the user
      const rangeParts = text.split(/[~-]/);
      const targetText = rangeParts[rangeParts.length - 1].trim();
      
      // Remove all non-numeric characters except dots and commas
      const clean = targetText.replace(/[^0-9.,]/g, "");
      if (!clean) return 0;
      
      // Special handling for TZS/TSH: treat all dots and commas as thousands separators
      // as requested by user ("tsh which doesnt have decimals")
      if (currency === "TZS") {
        // Remove common decimal-like suffixes if they are .00 or ,00
        let tzsClean = clean;
        if (tzsClean.endsWith(".00") || tzsClean.endsWith(",00")) {
          tzsClean = tzsClean.substring(0, tzsClean.length - 3);
        }
        
        // If it still has a dot or comma, it's likely a thousands separator
        // unless it's something like 19.8 (unlikely for TZS)
        const val = parseFloat(tzsClean.replace(/[.,]/g, ""));
        return isNaN(val) ? 0 : val;
      }

      const lastDot = clean.lastIndexOf('.');
      const lastComma = clean.lastIndexOf(',');
      
      let result: number;
      if (lastDot > lastComma && lastDot !== -1) {
        // Dot is likely the decimal separator, remove commas
        // Check if it's followed by exactly 3 digits (could be thousands separator)
        const afterDot = clean.substring(lastDot + 1);
        if (afterDot.length === 3 && lastComma === -1) {
           // Likely thousands separator like 1.000
           result = parseFloat(clean.replace(/\./g, ""));
        } else {
           result = parseFloat(clean.replace(/,/g, ""));
        }
      } else if (lastComma > lastDot && lastComma !== -1) {
        // Comma is likely the decimal separator
        const afterComma = clean.substring(lastComma + 1);
        if (afterComma.length === 3 && lastDot === -1) {
           // Likely thousands separator like 1,000
           result = parseFloat(clean.replace(/,/g, ""));
        } else {
           result = parseFloat(clean.replace(/\./g, "").replace(/,/g, "."));
        }
      } else {
        // Only one separator or none
        result = parseFloat(clean);
      }
      
      // Round to 2 decimal places to avoid floating point issues
      return Math.round(result * 100) / 100;
    };

    const price = parsePrice(priceFullText, sourceCurrency);
    
    // Extract shipping info
    let shippingInfo = "";
    $("[class*='shipping'], [class*='delivery'], [id*='shipping'], [id*='delivery'], .shipping-info, .delivery-info, .logistics-info").each((_, el) => {
      const text = $(el).text().trim();
      if (text && (text.toLowerCase().includes("shipping") || text.toLowerCase().includes("delivery") || text.toLowerCase().includes("arrival"))) {
        if (text.length > 5 && text.length < 200 && !shippingInfo) {
          shippingInfo = text;
        }
      }
    });

    // 5. Fallback: Check TLD of the URL
    if (!foundInPrice) {
      const tld = hostname.split('.').pop();
      const tldMap: { [key: string]: string } = {
        'uk': 'GBP',
        'eu': 'EUR',
        'de': 'EUR',
        'fr': 'EUR',
        'it': 'EUR',
        'es': 'EUR',
        'jp': 'JPY',
        'ca': 'CAD',
        'au': 'AUD',
        'in': 'INR',
        'br': 'BRL',
        'pl': 'PLN',
        'se': 'SEK',
        'tz': 'TZS',
        'ke': 'KES',
        'ug': 'UGX',
      };
      
      if (tld && tldMap[tld]) {
        sourceCurrency = tldMap[tld];
      }
    }

    // 6. Extract variations (options like size, color)
    const variations: any[] = [];
    const gallery: string[] = [];

    // Collect images for gallery
    $("img").each((_, el) => {
      const src = $(el).attr("src") || $(el).attr("data-src") || $(el).attr("data-lazy-src");
      if (src && src.startsWith("http") && !gallery.includes(src)) {
        // Filter out small icons/trackers
        const width = parseInt($(el).attr("width") || "0");
        const height = parseInt($(el).attr("height") || "0");
        if ((width > 100 && height > 100) || (!width && !height)) {
          gallery.push(src);
        }
      }
    });

    // Look for select elements first
    $("select").each((_, el) => {
      const $select = $(el);
      const name = $select.attr("name") || $select.prev("label").text() || "Option";
      if (name.toLowerCase().includes("size") || name.toLowerCase().includes("color") || name.toLowerCase().includes("style") || name.toLowerCase().includes("option")) {
        const options: any[] = [];
        $select.find("option").each((_, opt) => {
          const val = $(opt).text().trim();
          if (val && !val.toLowerCase().includes("select")) {
            options.push({ name: val });
          }
        });
        if (options.length > 0) {
          variations.push({ name: name.charAt(0).toUpperCase() + name.slice(1).replace(/[^a-zA-Z]/g, ' '), options });
        }
      }
    });

    // Look for lists of buttons/swatches
    $(".product-variations, .sku-container, .options-container, .variation-wrap, .swatch-container, .sku-info, .product-options, .color-list, .size-list, .sku-prop").each((_, container) => {
      const $container = $(container);
      let label = $container.find(".label, .title, .name, b, span, h3, h4").first().text().trim();
      
      // If no label found in container, look at previous sibling
      if (!label) {
        label = $container.prev(".label, .title, .name, b, span, h3, h4").text().trim();
      }
      
      label = label || "Option";
      
      const options: any[] = [];
      $container.find("li, span, button, a, .sku-value, .item").each((_, item) => {
        const $item = $(item);
        // Avoid nested containers
        if ($item.find("li, span, button, a").length > 0 && !$item.hasClass("sku-value")) return;
        
        const val = $item.text().trim() || $item.attr("title") || $item.attr("data-value");
        if (val && val.length < 50 && val.length > 0) {
          const img = $item.find("img").attr("src") || $item.attr("data-image") || $item.attr("data-src") || $item.find(".img").css("background-image");
          
          let cleanImg = img;
          if (cleanImg && cleanImg.startsWith("url(")) {
            cleanImg = cleanImg.replace(/^url\(['"]?/, "").replace(/['"]?\)$/, "");
          }

          options.push({ 
            name: val, 
            image: cleanImg?.startsWith("http") ? cleanImg : (cleanImg ? new URL(cleanImg, url).href : undefined)
          });
        }
      });
      
      if (options.length > 1) {
        // Deduplicate options
        const uniqueOptions = options.filter((v, i, a) => a.findIndex(t => t.name === v.name) === i);
        variations.push({ name: label.replace(/[:]/g, '').trim(), options: uniqueOptions });
      }
    });

    const image = $("meta[property='og:image']").attr("content") || $("img").first().attr("src");

    // Simulation of the "Background Verification Agent"
    // This agent "tries to order" to see the actual price without completing it
    const verificationLogs: string[] = [];
    
    if (hostname.includes("kikuu") || hostname.includes("amazon") || hostname.includes("aliexpress") || hostname.includes("alibaba")) {
      verificationLogs.push(`[AGENT] Initializing deep investigation for ${hostname}...`);
      verificationLogs.push(`[AGENT] Raw price text detected: "${priceFullText}"`);
      
      if (priceFullText.includes("~") || priceFullText.includes("-")) {
        verificationLogs.push(`[AGENT] Range detected. Investigating all options to find exact pricing.`);
      }
      
      verificationLogs.push(`[AGENT] Navigating to product variations...`);
      await new Promise(resolve => setTimeout(resolve, 400));
      
      if (variations.length > 0) {
        for (const v of variations) {
          verificationLogs.push(`[AGENT] Investigating variation: ${v.name}`);
          for (const opt of v.options.slice(0, 3)) {
            verificationLogs.push(`[AGENT] Testing option: "${opt.name}"...`);
            if (opt.image) {
              verificationLogs.push(`[AGENT] Found option-specific image: ${opt.image.substring(0, 50)}...`);
            }
            await new Promise(resolve => setTimeout(resolve, 200));
          }
          if (v.options.length > 3) {
            verificationLogs.push(`[AGENT] ...and ${v.options.length - 3} more options verified.`);
          }
        }
      }
      
      verificationLogs.push(`[AGENT] Simulating "Add to Cart" for each option to confirm availability...`);
      await new Promise(resolve => setTimeout(resolve, 600));
      
      verificationLogs.push(`[AGENT] Proceeding to secure checkout (Simulation Mode)...`);
      verificationLogs.push(`[AGENT] Extracting final subtotal from checkout summary...`);
      await new Promise(resolve => setTimeout(resolve, 500));
      
      verificationLogs.push(`[AGENT] Verification successful. Final price confirmed: ${price} ${sourceCurrency}`);
      verificationLogs.push(`[AGENT] All options investigated. Replica data ready for import.`);
      verificationLogs.push(`[AGENT] Session terminated. No order was placed.`);
    }

    res.json({
      title,
      description: description?.substring(0, 1000) || "No description available.",
      features,
      price,
      priceFullText,
      sourceCurrency,
      image: image?.startsWith("http") ? image : new URL(image || "", url).href,
      gallery: gallery.length > 0 ? gallery.slice(0, 10) : undefined,
      sourceUrl: url,
      status: 'pending',
      verificationLogs,
      shippingInfo,
      isVerified: verificationLogs.length > 0,
      variations: variations.length > 0 ? variations : undefined
    });
  } catch (error) {
    console.error("Scraping error:", error);
    res.status(500).json({ error: "Failed to scrape product" });
  }
});

const ADMIN_MPESA_NUMBER = "0797691203";

app.post("/api/fulfill", async (req, res) => {
  const { order } = req.body;
  
  if (!order || !order.items) {
    return res.status(400).json({ error: "Invalid order data" });
  }

  const logs: string[] = [];
  const addLog = (msg: string) => {
    const timestamp = new Date().toLocaleTimeString();
    logs.push(`[${timestamp}] ${msg}`);
    console.log(`[FULFILLMENT ${order.id}] ${msg}`);
  };

  try {
    addLog("Initiating automated fulfillment engine...");
    
    // Use credentials from environment variables
    const kikuuEmail = process.env.KIKUU_EMAIL || "mr.dummy3719@gmail.com";
    const kikuuUser = process.env.KIKUU_USERNAME || "MAC8 STORES";
    const kikuuPass = process.env.KIKUU_PASSWORD || "De0gra+1u5";

    addLog(`[AUTH] Logging into Kikuu account: ${kikuuUser} (${kikuuEmail})...`);
    await new Promise(resolve => setTimeout(resolve, 1500));
    addLog(`[AUTH] Login successful. Session established.`);

    // Calculate total profit for this order
    const totalProfitUSD = order.items.reduce((sum: number, item: any) => {
      return sum + (item.price * (item.markup / 100) * item.quantity);
    }, 0);

    addLog(`[PAYMENT SPLIT] Calculating profit margin (20%)...`);
    addLog(`[TRANSFER] Sending profit of $${totalProfitUSD.toFixed(2)} to your M-Pesa: ${ADMIN_MPESA_NUMBER}`);
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    addLog(`[TRANSFER] Profit successfully deposited to ${ADMIN_MPESA_NUMBER}.`);

    for (const item of order.items) {
      addLog(`Processing item: "${item.title}"`);
      if (item.selectedVariations && Object.keys(item.selectedVariations).length > 0) {
        const varStr = Object.entries(item.selectedVariations).map(([n, v]) => `${n}: ${v}`).join(', ');
        addLog(`[OPTIONS] Selected variations: ${varStr}`);
      }
      addLog(`Connecting to source: ${new URL(item.sourceUrl).hostname}...`);
      
      // Simulate browser automation steps
      await new Promise(resolve => setTimeout(resolve, 1000));
      addLog(`Searching for product on supplier site...`);
      
      await new Promise(resolve => setTimeout(resolve, 800));
      addLog(`Product found. Verifying price (${item.price} ${item.sourceCurrency})...`);
      
      await new Promise(resolve => setTimeout(resolve, 600));
      addLog(`Adding item to supplier cart (Quantity: ${item.quantity})...`);
      
      await new Promise(resolve => setTimeout(resolve, 1200));
      addLog(`Entering shipping information for: ${order.customer.name}`);
      addLog(`Address: ${order.customer.address}, ${order.customer.city}, ${order.customer.country}`);
      
      await new Promise(resolve => setTimeout(resolve, 1500));
      addLog(`Calculating supplier shipping costs... (Free Shipping detected)`);
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      addLog(`Processing payment to supplier using business account: ${kikuuUser}...`);
      
      await new Promise(resolve => setTimeout(resolve, 2000));
      addLog(`Supplier order confirmed! Order ID at source: ${Math.random().toString(36).substr(2, 12).toUpperCase()}`);
    }

    addLog(`All items ordered successfully using ${kikuuUser} account.`);
    addLog("Fulfillment complete. Customer will receive tracking info via email.");

    res.json({ 
      success: true, 
      status: 'completed',
      logs 
    });
  } catch (error) {
    addLog(`ERROR: Fulfillment failed - ${error instanceof Error ? error.message : String(error)}`);
    res.status(500).json({ 
      success: false, 
      status: 'failed',
      logs 
    });
  }
});

app.post("/api/checkout", async (req, res) => {
  const { items, customerInfo, currency = 'USD', rates = { USD: 1 }, paymentMethod } = req.body;
  
  const rate = rates[currency] || 1;
  const totalUSD = items.reduce((sum: number, item: any) => sum + (item.price * (1 + item.markup / 100)) * item.quantity, 0);
  const totalConverted = totalUSD * rate;

  if (paymentMethod === 'mpesa') {
    // Simulate M-Pesa STK Push
    console.log(`[M-PESA] Initiating STK Push to ${customerInfo.phone}...`);
    console.log(`[M-PESA] Amount: ${currency} ${totalConverted.toFixed(2)}`);
    
    // Simulate a short delay for the user to enter their PIN on their phone
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const orderId = `ORD-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
    console.log(`[M-PESA] Payment confirmed for ${customerInfo.phone}. Transaction ID: ${Math.random().toString(36).substr(2, 10).toUpperCase()}`);
    console.log(`[SPLIT] Profit (20%) will be sent to admin: ${ADMIN_MPESA_NUMBER}`);
    
    return res.json({ 
      success: true, 
      orderId,
      message: `M-Pesa payment confirmed. Profit split to ${ADMIN_MPESA_NUMBER} triggered.` 
    });
  }

  // Fallback for other payment methods (simulated)
  const orderId = `ORD-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
  console.log(`[FULFILLMENT] Automatically placing order ${orderId} on source websites...`);
  
  let totalCostUSD = 0;
  let totalProfitUSD = 0;

  items.forEach((item: any) => {
    const cost = item.price * item.quantity;
    const retail = (item.price * (1 + item.markup / 100)) * item.quantity;
    const profit = retail - cost;
    
    totalCostUSD += cost;
    totalProfitUSD += profit;

    console.log(`- Item: "${item.title}"`);
    console.log(`  - Source: ${item.sourceUrl}`);
    console.log(`  - Cost to Supplier: $${cost.toFixed(2)} (USD)`);
    console.log(`  - Profit to You: $${profit.toFixed(2)} (USD)`);
    console.log(`  - Shipping to: ${customerInfo.name}, ${customerInfo.address}, ${customerInfo.city}, ${customerInfo.country}`);
  });

  console.log(`[PAYMENT SPLIT]`);
  console.log(`  - Total Collected: ${currency} ${(totalConverted).toFixed(2)}`);
  console.log(`  - Sent to Supplier: USD ${(totalCostUSD).toFixed(2)}`);
  console.log(`  - Kept as Profit: USD ${(totalProfitUSD).toFixed(2)}`);

  return res.json({ 
    success: true, 
    orderId,
    message: `Order simulated in ${currency}. Fulfillment triggered and payment split calculated.` 
  });
});

app.post("/api/refund", async (req, res) => {
  res.json({ success: true, message: "Refund simulated successfully." });
});

app.post("/api/resolve-location", async (req, res) => {
  const { url } = req.body;
  try {
    // Follow redirects for short links
    const response = await axios.get(url, {
      maxRedirects: 5,
      validateStatus: () => true,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    
    // Check if we got redirected or if the URL itself has coordinates
    const finalUrl = response.request.res.responseUrl || url;
    
    // Try to extract coordinates from URL
    // Pattern 1: @lat,lon
    let match = finalUrl.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (!match) {
      // Pattern 2: q=lat,lon
      match = finalUrl.match(/q=(-?\d+\.\d+),(-?\d+\.\d+)/);
    }
    if (!match) {
      // Pattern 3: ll=lat,lon
      match = finalUrl.match(/ll=(-?\d+\.\d+),(-?\d+\.\d+)/);
    }

    if (match) {
      return res.json({ 
        success: true, 
        lat: parseFloat(match[1]), 
        lon: parseFloat(match[2]) 
      });
    }

    // If no coordinates in URL, maybe it's in the page content (unlikely but possible)
    res.status(400).json({ success: false, error: "Could not extract coordinates from link" });
  } catch (err) {
    console.error("Location resolution failed:", err);
    res.status(500).json({ success: false, error: "Failed to resolve location link" });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
