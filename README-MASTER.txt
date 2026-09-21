NADIA’S PERFUME CART — MASTER FINAL BUILD

This package replaces the previous website update packages.

UPLOAD TO THE NEW GITHUB REPOSITORY
Upload all website files to the repository root and replace files with the same names.
Keep your existing supabase-config.js: it contains the V2 public Supabase configuration and is intentionally NOT bundled here.

SUPABASE — RUN IN THIS ORDER
1. Existing/base V2 schema must already be installed.
2. Run SUPABASE_PRODUCTS_20.sql — inserts/updates the 20 verified Arabic/English perfume names only.
3. Run SUPABASE_CHECKOUT.sql — secure order RPC and order-management tables.
4. Run SUPABASE_EVENT_CART.sql — Bespoke Event Cart requests and admin follow-up.

IMPORTANT
- No service_role key or database password belongs in GitHub/browser code.
- Online payment is intentionally disabled.
- Product prices, sizes, stock, descriptions, fragrance notes/families, categories and photos were NOT invented.
- Add those real commercial details from Admin/Supabase.
- Shipping fees/times, returns policy and final legal business wording still require the store owner's approved real policy.
- Checkout totals are calculated from database product prices by the server-side database function, not trusted from the browser.
- Event requests do not automatically confirm a booking or price.

MASTER BUILD FEATURES
- Arabic/English storefront (RTL/LTR)
- 20 verified perfume names
- Search, availability filter, wishlist, cart
- Product detail pages and recently-viewed tracking
- Gift experience
- Nadia’s Bespoke Event Cart + booking/coordination form
- Secure order intake
- Admin: products, inventory, announcements, orders, event requests
- FAQ, Privacy, Terms, Returns placeholders
- robots.txt, sitemap.xml, manifest, Open Graph/meta foundations
- Mobile responsive luxury UI
