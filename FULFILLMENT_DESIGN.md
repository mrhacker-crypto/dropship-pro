# Automated Order Fulfillment System Design

## Overview
The Fulfillment Orchestrator automates the process of placing orders on supplier websites once a customer purchase is confirmed on Dropship Pro.

## 1. System Architecture

### A. Order Sync Worker
- **Function**: Polls the Firestore `orders` collection for documents with `status: 'pending_fulfillment'`.
- **Data**: Retrieves customer shipping details and product source URLs.

### B. Data Transformation Layer
- **Input**: Dropship Pro Order Object.
- **Output**: Supplier-specific JSON payload (for APIs) or Navigation Script (for Automation).
- **Mapping**:
  - `customer.name` -> `shipping_first_name`, `shipping_last_name`
  - `customer.address` -> `address_line_1`, `city`, `zip_code`
  - `product.sourceUrl` -> Target page for purchase.

### C. Fulfillment Engine (The "Worker")
#### Option 1: Official API (Recommended)
- **Pros**: Stable, fast, supported by suppliers, secure.
- **Cons**: Requires developer account approval.
- **Workflow**: `POST /api/v1/orders` with customer data.

#### Option 2: Browser Automation (Selenium/Playwright)
- **Pros**: Works on any website without an API.
- **Cons**: Fragile (breaks if UI changes), slower, may trigger bot detection (WAF/CAPTCHA).
- **Workflow**:
  1. Launch headless browser.
  2. Navigate to product URL.
  3. Add to cart.
  4. Navigate to checkout.
  5. Fill shipping forms using `page.fill()`.
  6. **Manual Intervention Step**: For payment (CVV) or CAPTCHAs, the system should alert the merchant to complete the final step.

## 2. Security & Compliance
- **PII Protection**: Shipping details should be encrypted at rest and deleted from the fulfillment worker's memory immediately after the order is placed.
- **Terms of Service**: Ensure automation scripts respect the `robots.txt` and Terms of Service of the source website.
- **Payment Security**: Never store raw credit card details. Use virtual cards or supplier-side saved payment methods where possible.

## 3. Conceptual Implementation (Node.js/TypeScript)

```typescript
// Conceptual Fulfillment Service
interface FulfillmentRequest {
  orderId: string;
  supplierUrl: string;
  shippingAddress: any;
}

class FulfillmentService {
  async fulfillOrder(request: FulfillmentRequest) {
    console.log(`Starting fulfillment for Order: ${request.orderId}`);
    
    try {
      // 1. Check for API availability first
      if (this.hasSupplierAPI(request.supplierUrl)) {
        return await this.fulfillViaAPI(request);
      }
      
      // 2. Fallback to Automation (Conceptual)
      // Note: This would run in a server-side environment like a Cloud Function or dedicated worker
      return await this.fulfillViaAutomation(request);
    } catch (error) {
      await this.logFailure(request.orderId, error);
      throw error;
    }
  }

  private async fulfillViaAutomation(request: FulfillmentRequest) {
    // This logic would use a library like Playwright
    // const browser = await playwright.chromium.launch();
    // const page = await browser.newPage();
    // await page.goto(request.supplierUrl);
    // ... automation logic ...
  }
}
```
