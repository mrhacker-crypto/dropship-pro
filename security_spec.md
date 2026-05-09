# Security Specification - DigiPesa Marketplace

## Data Invariants
1. A **User** document must exist for every authenticated user and match their `uid`.
2. **Orders** must have a `buyerId` matching the creator's `uid`.
3. **Products** can only be created/updated by admins or the respective seller.
4. **Chat** IDs for buyers must match their `uid`.
5. **Referral Earnings** can only be read by the referrer.
6. **Driver Penalties** can only be created/read by admins or the respective driver.
7. **Reviews** must have a `userId` matching the creator's `uid`.

## The "Dirty Dozen" Payloads

1. **Identity Spoofing (User Profile)**: A user tries to create another user's profile.
   - `path`: `/users/malicious_uid`
   - `payload`: `{ "uid": "malicious_uid", "email": "victim@example.com", "role": "admin" }`
   - `Expected`: PERMISSION_DENIED

2. **Privilege Escalation**: A buyer tries to update their role to 'admin'.
   - `path`: `/users/my_uid`
   - `payload`: `{ "role": "admin" }`
   - `Expected`: PERMISSION_DENIED

3. **Orphaned Order**: A user tries to create an order skipping `buyerId` or using a fake one.
   - `path`: `/orders/new_order`
   - `payload`: `{ "buyerId": "fake_uid", "total": 100, ... }`
   - `Expected`: PERMISSION_DENIED

4. **Shadow Update (Product)**: A user tries to verify their own product by adding a `isVerified` field.
   - `path`: `/products/my_product`
   - `payload`: `{ "isVerified": true }`
   - `Expected`: PERMISSION_DENIED (unless admin)

5. **Resource Exhaustion (ID Poisoning)**: A user tries to create a chat with a 2KB string as ID.
   - `path`: `/chats/very_long_junk_id_...`
   - `Expected`: PERMISSION_DENIED

6. **Unauthorized Read (Chat)**: A user tries to read someone else's chat.
   - `path`: `/chats/other_user_uid`
   - `Expected`: PERMISSION_DENIED

7. **Review Hijacking**: A user tries to create a review using another user's name/ID.
   - `path`: `/products/p1/reviews/r1`
   - `payload`: `{ "userId": "victim_uid", "userName": "Victim", ... }`
   - `Expected`: PERMISSION_DENIED

8. **Admin Impersonation**: A user tries to write to global settings.
   - `path`: `/settings/exchangeRates`
   - `Expected`: PERMISSION_DENIED

9. **Wallet Tampering**: A driver tries to increase their own `walletBalance`.
   - `path`: `/users/driver_uid`
   - `payload`: `{ "walletBalance": 999999 }`
   - `Expected`: PERMISSION_DENIED

10. **Referral Data Leak**: A user tries to list all users to find referral targets.
    - `path`: `/users` (list query)
    - `Expected`: PERMISSION_DENIED

11. **Earning Injection**: A user tries to create their own referral earning record.
    - `path`: `/referral_earnings/fake_earning`
    - `payload`: `{ "referrerId": "my_uid", "amount": 1000, ... }`
    - `Expected`: PERMISSION_DENIED

12. **Terminal State Bypass**: A seller tries to change an order status from 'delivered' back to 'paid'.
    - `path`: `/orders/order_id`
    - `payload`: `{ "status": "paid" }`
    - `Expected`: PERMISSION_DENIED
