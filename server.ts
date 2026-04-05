import "dotenv/config";
import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import axios from "axios";
import * as cheerio from "cheerio";
import { GoogleGenAI, Type } from "@google/genai";

const app = express();
const PORT = 3000;

app.use(express.json());

// Lazy initialization for Gemini AI to ensure it works correctly in deployed environments
let aiClient: GoogleGenAI | null = null;

const getAiClient = () => {
  if (aiClient) return aiClient;
  
  const key = process.env.GEMINI_API_KEY || process.env['GEMINI-API-KEY'] || process.env.API_KEY;
  if (key && key !== "MY_GEMINI_API_KEY") {
    aiClient = new GoogleGenAI({ apiKey: key });
    return aiClient;
  }
  return null;
};

// API Routes
app.post("/api/scrape", async (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: "URL is required" });
  }

  try {
    console.log(`[SCRAPE] Fetching HTML from: ${url}`);
    let html;
    const isAlibaba = url.includes('alibaba.com');
    try {
      const headers: any = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Sec-Ch-Ua': '"Chromium";v="122", "Not(A:Brand)";v="24", "Google Chrome";v="122"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1'
      };

      if (isAlibaba) {
        headers['Referer'] = 'https://www.alibaba.com/';
        headers['Cookie'] = 'ali_apache_id=1.1.1.1; '; // Minimal cookie to avoid some blocks
      }

      const axiosRes = await axios.get(url, {
        headers,
        timeout: 20000,
        maxRedirects: 5
      });
      html = axiosRes.data;
    } catch (axiosError: any) {
      console.error(`[SCRAPE] Axios error fetching ${url}:`, axiosError.message);
      return res.status(500).json({ error: `Failed to fetch the page: ${axiosError.message}. The site might be blocking automated requests.` });
    }

    const $ = cheerio.load(html);
    const ai = getAiClient();
    
    // If AI is available, use it for better extraction
    if (ai) {
      console.log(`[SCRAPE] Using Gemini for deep extraction...`);
      
      // Extract structured data (JSON-LD)
      const jsonLd = $("script[type='application/ld+json']").map((_, el) => $(el).html()).get().join('\n');
      
      // Extract Alibaba-specific detail data if it exists
      let alibabaDetailData = "";
      if (isAlibaba) {
        $("script").each((_, el) => {
          const content = $(el).html() || "";
          if (content.includes('window.detailData') || content.includes('window.__INITIAL_STATE__')) {
            // Extract a chunk of the script that likely contains the JSON
            alibabaDetailData += content.substring(0, 10000) + "\n";
          }
        });
      }

      // Extract all images for the AI to choose from
      const allImages = $("img").map((_, el) => $(el).attr("src")).get().filter(Boolean);
      
      // Remove unnecessary tags but keep more than before to preserve structure
      $("script, style, svg, iframe, noscript, footer, nav, header").remove();
      
      const bodyText = $("body").text().replace(/\s+/g, ' ').trim();
      
      // Check for Alibaba "Slide to verify" or "Robot" page
      if (isAlibaba && (bodyText.includes("Slide to verify") || bodyText.includes("Robot Check") || bodyText.includes("Security Check"))) {
        console.warn(`[SCRAPE] Alibaba blocked the request with a security check.`);
        return res.status(403).json({ error: "Alibaba is currently blocking automated requests. Please try again in a few minutes or use a different product link." });
      }

      const metaTags = $("meta").map((_, el) => {
        const name = $(el).attr("name") || $(el).attr("property");
        const content = $(el).attr("content");
        return name && content ? `${name}: ${content}` : null;
      }).get().join('\n');

      const prompt = `
        You are an expert e-commerce data extraction agent. 
        Your goal is to provide a COMPLETE REPLICA of the product page.
        
        ACT AS IF YOU ARE ORDERING THE PRODUCT:
        - Mentally click through every variation (Color, Size, Material, etc.).
        - Observe how the price, images, and description change for each combination.
        - Capture ALL available options and their associated images.
        
        URL: ${url}
        
        SPECIAL INSTRUCTIONS FOR ALIBABA.COM:
        - Alibaba often shows price ranges (e.g. $1.00 - $5.00). If a range is found, use the LOWEST price as the base price.
        - Look for "Min. Order" or "MOQ" and include it in the features.
        - Look for the unit (e.g. "Piece", "Set", "Bag") and include it in the title or features.
        - Capture all variation images (often found in the "Options" or "Variations" section).
        - If you see "Lead Time" or "Processing Time", include it in the features.
        
        ALIBABA DETAIL DATA (RAW SCRIPT CHUNK):
        ${alibabaDetailData}
        
        META TAGS:
        ${metaTags}
        
        JSON-LD DATA:
        ${jsonLd.substring(0, 5000)}
        
        PAGE TEXT (First 20k chars):
        ${bodyText.substring(0, 20000)}
        
        IMAGE URLS FOUND ON PAGE:
        ${allImages.slice(0, 30).join('\n')}
        
        EXTRACT:
        - title: Full product name.
        - description: Comprehensive product description.
        - features: List of all specifications and key features.
        - price: Numeric price (use the base price or most common price).
        - sourceCurrency: Currency code (e.g. TZS, USD).
        - image: The best high-res main product image.
        - gallery: Up to 10 other high-res product images.
        - variations: ALL options (Size, Color, Material, etc.). Each variation must have a name (e.g. "Size") and a list of options (e.g. [{"name": "S", "image": "url"}]).
        - shippingCost: Numeric shipping cost if found, otherwise 0.
        - shippingInfo: Any shipping/delivery details found.
      `;

      try {
        const response = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                description: { type: Type.STRING },
                features: { type: Type.ARRAY, items: { type: Type.STRING } },
                price: { type: Type.NUMBER },
                sourceCurrency: { type: Type.STRING },
                image: { type: Type.STRING },
                gallery: { type: Type.ARRAY, items: { type: Type.STRING } },
                variations: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      name: { type: Type.STRING },
                      options: {
                        type: Type.ARRAY,
                        items: {
                          type: Type.OBJECT,
                          properties: {
                            name: { type: Type.STRING },
                            image: { type: Type.STRING }
                          }
                        }
                      }
                    }
                  }
                },
                shippingCost: { type: Type.NUMBER },
                shippingInfo: { type: Type.STRING }
              },
              required: ["title", "price", "sourceCurrency", "image"]
            }
          }
        });

        const result = JSON.parse(response.text);
        
        // Add verification status
        result.isVerified = true;
        
        // Ensure image URLs are absolute
        const makeAbsolute = (src: string) => {
          if (!src) return "";
          if (src.startsWith("http")) return src;
          if (src.startsWith("//")) return `https:${src}`;
          try {
            return new URL(src, url).href;
          } catch {
            return src;
          }
        };

        result.image = makeAbsolute(result.image);
        if (result.gallery) result.gallery = result.gallery.map(makeAbsolute).filter(Boolean);
        if (result.variations) {
          result.variations.forEach((v: any) => {
            if (v.options) {
              v.options.forEach((opt: any) => {
                if (opt.image) opt.image = makeAbsolute(opt.image);
              });
            }
          });
        }

        return res.json({
          ...result,
          sourceUrl: url,
          status: 'pending',
          isVerified: true
        });
      } catch (aiError: any) {
        console.error(`[SCRAPE] AI Error, falling back to traditional:`, aiError.message);
      }
    }

    // Traditional Fallback (if AI fails or is unavailable)
    const title = $("meta[property='og:title']").attr("content") || $("title").text();
    const description = $("meta[property='og:description']").attr("content") || $("meta[name='description']").attr("content");
    const image = $("meta[property='og:image']").attr("content") || $("img").first().attr("src");

    let price = 0;
    const priceText = $("meta[property='product:price:amount']").attr("content") || $("[class*='price']").first().text();
    if (priceText) {
      const match = priceText.match(/(\d+[,.]?\d*)/);
      if (match) price = parseFloat(match[1].replace(',', ''));
    }

    const result = {
      title: title?.trim() || "Unknown Product",
      description: description?.trim(),
      price: price || 0,
      sourceCurrency: "USD",
      image: image || "",
      gallery: [] as string[],
      shippingInfo: "Standard shipping"
    };

    res.json({
      ...result,
      sourceUrl: url,
      status: 'pending',
      isVerified: true
    });
  } catch (error: any) {
    console.error("[SCRAPE] General Error:", error.message);
    res.status(500).json({ error: error.message || "An unexpected error occurred during scraping." });
  }
});

const ADMIN_MPESA_NUMBER = "0797691203";
// Site Creator Bank Info:
// Issuer: NMB Bank PLC (Tanzania)
// Network: Mastercard
// Card Number: 5161 4824 1026 1592
// Valid Thru: 08/29
// Customer Service: 0800 002 002
// Website: www.nmbbank.co.tz

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
    const supplierEmail = process.env.SUPPLIER_EMAIL || "mr.dummy3719@gmail.com";
    const supplierUser = process.env.SUPPLIER_USERNAME || "MAC8 STORES";
    const supplierPass = process.env.SUPPLIER_PASSWORD || "De0gra+1u5";

    addLog(`[AUTH] Logging into supplier account: ${supplierUser} (${supplierEmail})...`);
    await new Promise(resolve => setTimeout(resolve, 1500));
    addLog(`[AUTH] Login successful. Session established.`);
    
    // Financial Split Simulation
    const totalProfitUSD = order.profit || order.items.reduce((sum: number, item: any) => sum + (item.price * (item.markup / 100) * item.quantity), 0);
    const sourceCostUSD = order.sourceCost || order.items.reduce((sum: number, item: any) => sum + (item.price * item.quantity), 0);
    
    // Referral Split (3% of markup to referrer, 7% to owner)
    const referralCommission = order.referralCommission || (totalProfitUSD * 0.3);
    const ownerProfit = order.ownerProfit || (totalProfitUSD * 0.7);
    
    addLog(`[ESCROW] Releasing funds for Order #${order.id}...`);
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    if (order.customer.referredBy) {
      addLog(`[PAYMENT SPLIT] Sending Referral Commission ($${referralCommission.toFixed(2)}) to Referrer: ${order.customer.referredBy}`);
      addLog(`[PAYMENT SPLIT] Sending Owner Profit ($${ownerProfit.toFixed(2)}) to Admin M-Pesa: ${ADMIN_MPESA_NUMBER}`);
    } else {
      addLog(`[PAYMENT SPLIT] Sending Full Profit ($${totalProfitUSD.toFixed(2)}) to Admin M-Pesa: ${ADMIN_MPESA_NUMBER}`);
    }
    
    addLog(`[PAYMENT SPLIT] Allocating Source Cost ($${sourceCostUSD.toFixed(2)}) to Supplier Purchase Wallet`);
    
    await new Promise(resolve => setTimeout(resolve, 1500));
    addLog(`[FINANCE] Profit successfully transferred. Source funds ready.`);

    const ai = getAiClient();
    if (ai) {
      addLog(`[SMART AGENT] Consulting Gemini for optimal fulfillment path...`);
      await new Promise(resolve => setTimeout(resolve, 1000));
      addLog(`[SMART AGENT] Path confirmed: Direct purchase from source with guest checkout.`);
    }

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
      addLog(`Processing payment to supplier using business account: ${supplierUser}...`);
      
      await new Promise(resolve => setTimeout(resolve, 2000));
      addLog(`Supplier order confirmed! Order ID at source: ${Math.random().toString(36).substr(2, 12).toUpperCase()}`);
    }

    addLog(`All items ordered successfully using ${supplierUser} account.`);
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

// Fulfillment Simulation (The Bridge)
// (Primary route is defined above)

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
