# Poultry360 · Design brief (current UI/UX, every page and flow)

A complete description of how Poultry360 looks and works today, written to hand to a designer or a design tool for a redesign.
It covers the product, who uses it, the current design system, the rules a redesign must keep, every screen in every app,
the main flows, and the weak spots we already know about. State as of November 2026.

---

## 1. The product

Poultry360 is a marketplace and farm-management app for the poultry trade in Nigeria, launching in **Port Harcourt, Rivers State**.
Buyers order eggs, chicken, turkey, live birds, feed, drugs and equipment from verified farms and stores. **Poultry360 delivers**:
its own riders collect from the seller and bring the order to the buyer. Around the marketplace sit tools for farms
(flock records, inventory, credit book, vet booking) and for stores (agents who resell their products).

- **Currency:** Naira (₦). Phone numbers +234. Prices are whole naira (₦11,000).
- **Market reality:** Android first, often mid- or low-end phones, patchy mobile data, bright outdoor light, many users new to
  apps. Farmers may use the app at the farm with gloves and poor signal. Plain English, short words.
- **Money is simulated today** (Paystack stand-in): test cards and a wallet. The design should still look like real money.

### Who uses it (roles; one account can hold several)

| Role | Who | What they do |
|---|---|---|
| **Buyer** | Households, restaurants, caterers, hotels, resellers | Browse, order, pay (card or wallet), track delivery, rate, pay later with farms that allow it |
| **Farm** (`vendor`) | Poultry farms | List birds/eggs, accept and prepare orders, Farm Hub (flocks, feed, mortality, output, costs, vaccinations, inventory), Farm Book (credit sales), vet care, sell waste, raise investment |
| **Store** (`supplier`) | Feed, drug and equipment sellers | List farm supplies only (never birds/eggs), orders, Store Book (credit), agents |
| **Agent** | People who resell a store's products near them | Own shop with the store's products: buy stock from the store, sell in the app or offline, earn a quarterly rebate on what they buy |
| **Vet** | Licensed vets | Weekly hours, video consults, on-site visits, write consult summaries, get paid |
| **Investor** (test only) | Members of the public | Fund verified farms or pools and track returns (behind a flag; legal sign-off pending) |
| **Rider** | Poultry360's delivery riders (separate app) | Go available, accept offers, collect, quality-check, deliver with photo proof, get paid |
| **Ops** | Poultry360 staff (web dashboard) | Verify farms/stores and vets, manage riders, manage investments |

### The four surfaces

1. **Customer app** (Android, Expo/React Native): buyer, farm, store, agent, vet and investor in one app with a role switch.
2. **Website** https://poultry360-web.vercel.app: the **same code** rendered in the browser (react-native-web). Signed out it is a
   marketing landing page plus a public shop; signed in it is the full app with a website layout at 900 px and wider.
3. **Rider app** (Android, separate small app).
4. **Ops dashboard** https://poultry360-ops.vercel.app (Vite + React web app).

---

## 2. The current design system

The look was refreshed in October 2026 because the founder felt the first version (cream background, yellow buttons,
uppercase monospace labels) "looked AI-generated". Today it is a clean white + green fintech-style look.

### Colour (tokens; names are historical)

| Token | Light | Dark | Used for |
|---|---|---|---|
| `bg` | #F5F7F5 off-white | #0C0D0D near-black | Page background |
| `sf` / `sf2` | #FFFFFF / #ECF0ED | #161818 / #222525 | Cards / sunken fills, table headers, placeholders |
| `ink` / `mute` | #0E1512 / #66706A | #F4F5F3 / #9AA09C | Text / secondary text |
| `line` / `line2` | 8% / 16% ink | #262929 / #3A3E3E | Hairline borders |
| `yolk` (primary) | **#0F8A5F green**, white text | **#2DCB8C bright green**, dark text | Primary buttons, active states |
| `ember` (highlight) | #14A06E | #2DCB8C | Focus rings, selected day, live dot, badges |
| `acc` | #0B7550 | #5FD6A6 | Links, icons, verified tick |
| `navact` / `navactink` | #E1F4EB / #0B7550 | green 16% / #5FD6A6 | Selected tab/chip tint, icon circles |
| `hc` (Hearth card) | #0A2219 dark green | #15322D teal | Money and live-status cards only |
| Status | ok #0F8A5F on #E1F4EB · warn #8F5B00 on #FFF0D2 · err #C8372D on #FCE8E5 | lighter equivalents | Pills, banners |
| Tile tints `t1`–`t4` | green, peach, blue, butter (+ matching icon colours) | dark equivalents | Category tiles, quick-action tiles |
| `logobg` | white | white | The logo artwork only works on white |

### Type

One family: **Hanken Grotesk** (400–800). A custom ₦ glyph font matches it (Hanken has no ₦).
- `display` 32/37 ExtraBold (page titles) · `h1` 24/29 ExtraBold · `h2` 18/23 Bold (section titles)
- `body` 15/22 Regular · `strong` 15 SemiBold · `bold` 15 Bold · `small` 13/18 Medium, muted · `label` 13 SemiBold, muted, **sentence case**
- `mono` 15 Bold tabular figures (money, codes, timers) · `monoLg` 34/40 ExtraBold tabular (big money)
- Font scaling is capped at 1.3× for large-text settings.

### Shape, spacing, components

- Radius: 12 / 16 / 22 (cards) / 28 / pill. Spacing on a 4 px grid; screens use 20 px side padding on phones.
- **Card**: white, 22 radius, hairline border, 16 padding. **Hearth**: dark green card with two soft glow circles, for money and live status.
- **Button**: pill, 56 px tall primary in green; variants dark, hearth, outline, ghost, danger; small = 44 px.
- **Chip / ChipRow**, **Segmented** control (pill track with white thumb), **Pill** (status), **Banner** (ok/warn/err/info with action),
  **Row / Group** (iOS-style list inside one card), **Input** (label above, hint below, error in red), **Sheet** (bottom sheet on phones,
  centred 440 px dialog on the website), **DateInput** (calendar in a sheet), **Steps** (vertical progress), **Stat** tile, **Skeleton**,
  **Empty** (icon circle + title + body + action), **Fab** (floating add button), **OtpBoxes**, **Toggle**, **Stars**, **PhotoBox**.
- Icons: Material Community Icons (outline style mostly).
- **Logo**: chicken + turkey in a green leaf circle, wordmark "Poultry360" with an orange "360". Native splash is white with the mark;
  an intro animation lifts the mark, slides in the wordmark and slides away (about 1.7 s, phone only).
- Tap targets ≥ 44 px. Copy is short and plain; no filler sentences under headings.

### Layout

- **Phone (and browser under 900 px):** single column, bottom tab bar (white, icon over label, green pill behind the active icon).
- **Website (900 px and wider):** left **sidebar** (248 px: logo, the role's sections, then Dark mode and Profile at the bottom) beside
  every signed-in page; content centred up to 1080 px; product grids 4 across (2 on phones); product page shows photo and details side by side;
  the main list action floats bottom-right of the content column; a small "← Back" pill instead of the phone's round back arrow.
  The website opens in light mode; the app follows the phone's setting. Browser back works page by page.
- Signed-out website pages have a top nav bar (logo, section links, dark-mode toggle, Sign in, Get started).

---

## 3. Rules a redesign must keep

**Founder's preferences**
- No cream background, no yellow primary, no uppercase monospace labels, nothing that "looks AI-generated". Green primary in both modes.
- Terse copy. No explanatory filler. Plain words (a farmer reading in the sun).
- The website must feel like a **website**, not a phone screen in a browser: sidebar, header bars with actions on the right,
  figure rows, tables with column headings, two-column bodies. (A narrow phone column on a laptop was rejected twice.)
- A store never sees farm wording ("farm gate", "Farm Book"): it is "store", "Store Book".
- Vets only set weekly hours (days + start/end + consult length). Don't bring back per-slot lists.
- The vaccine/feed chart stays terse: what, when, how. No brand lists.

**Product rules that affect the UI**
- **Hidden seller on search:** buyers browsing categories or search see "Verified farm near you" instead of the seller's name until after checkout.
- **Symptom checker** results always say "preliminary triage, not a diagnosis".
- **Investment estimates** always show the "this is an estimate" line directly under every projected number (never in a tooltip).
- Money and live status use the Hearth card. Every ₦ amount uses the matching ₦ glyph.
- Every role-switch screen needs a visible way back to the previous role.
- Photos: camera or gallery on phones, one "Upload photo" on the website.

**Technical constraints**
- One React Native codebase for phone and web (react-native-web). Prefer designs built from Views, text, images and SVG; no heavy native modules.
- Fonts must be loadable on Android (one family name per weight). Icons from Material Community Icons unless we add an SVG set.
- Light and dark mode for every screen.

---

## 4. Navigation by role

| Mode | Phone bottom tabs (website sidebar uses the same list) |
|---|---|
| Buyer | Home · Market · Orders · (Invest, for investors) · Wallet |
| Farm | Home · Listings · Orders · Farm Hub · Wallet |
| Store (approved) | Home · Products · Orders · Agents · Wallet |
| Store (in review) | Home · Products |
| Agent | Phone: one page, the agent desk (no tabs). Website: Dashboard · Orders · Wallet |
| Vet | One page, the vet desk (Bookings · My hours · Profile segments) |

Profile (top-right avatar on phones, bottom of the sidebar on the website) lists the account's roles and switches between them.

---

## 5. Every screen

### 5.1 Sign-in and onboarding (customer app and website)
- **Intro animation** (phone only), then:
- **Sign in**: email + password, "Create account", "Forgot password".
- **Email**: enter email → "Send code" (rate-limited: "Too many code requests").
- **Code**: 6 boxes, "Sent to …", Resend, Verify. Three wrong tries pause sign-in for 15 minutes.
- **Create / change password**: 8+ characters with a letter and a number. Shown instead of the app until done.
- **How will you use Poultry360?** (Role screen): name field, then option cards (Buy, Sell as a farm, Supply farms, Work as a vet,
  Sell for a store, Invest). Buy reveals "Myself / A business" (+ business name). Continue always tappable; it says what's missing.
- **About your farm / business** (Business form, step 2 of 2): business name, what you sell (farm chips: Eggs, Broilers, Turkey…;
  store chips: Feed, Drugs & vaccines, Equipment, Packaging), location, "Pin my location", ID photo (camera/gallery), Submit for review.
- **Review status** (Pending): "We're reviewing …" with steps; farms get a Farm Hub card meanwhile; stores get "While you wait" options;
  rejected shows the reason and "Retake ID photo"; approved says "You're verified" → "Add your first listing".
- **Register as a vet**: name, specialty, years, fee, bio, "I also do farm visits", licence photo → Submit for review.
- **Open your shop** (agent): store card ("Selling for …"), store code (hidden if it came from an invite link), your name, shop address,
  "Pin my location" → Open my shop. A new account that arrived from an invite link lands here directly.
- **Join … as an agent** (invite link landing): logo, "Join <store> as an agent", Create an account / I have an account / Not now.
- **Explore**: tiles for roles not yet held (Shop the marketplace, Add a farm, Work as a vet, Sell for a store, Invest).

### 5.2 Website, signed out
- **Landing page**: nav bar; hero ("Fresh poultry from verified farms…", poultry-house photo with floating "Verified farm" and order cards,
  Get started / Browse products); **What do you need today?** (six category photo tiles); **Fresh today / On the market now** (sideways row of
  real listings, only when at least 4 have photos); **How it works** (farm to door in a day); **Who it's for** (photo cards);
  **Stores & agents** (with a sample "Top agents" card); **Questions** (FAQ accordion); closing call to action; footer. Stock photos from Pexels.
- **Public shop**: Market, Listings, Product, Store, Cart, and agent shop pages work signed out; checkout asks to sign in.

### 5.3 Buyer
- **Home**: "Deliver to <area>" (opens addresses), Sell button (if the account also sells), cart, avatar; "What's on the table today, <name>?";
  out-of-area warning; live order Hearth card (status + Track); search bar; four category tiles; Invest card (non-investors);
  **Fresh today** list (nearest first, with "2.9 km · ₦1,100 delivery").
- **Market**: title + cart; search; category tiles (Eggs, Chicken, Turkey, Live birds, Feed & supplies, Drugs & vaccines, Equipment, Vet care,
  Waste & manure); "Verified farms" sideways cards (initials, name, rating).
- **Listings** (category or search): product grid (photo, title, "Verified farm near you", price/unit, distance + delivery fee);
  "Use my location to see the nearest sellers" when location is unknown; Filters sheet (min/max price, sort: Nearest, Newest, Lowest price);
  empty states with other-category chips.
- **Product**: photo carousel (phone) / photo + thumbnails beside details (web); seller line or "Sourced from a verified farm near you";
  title, price/unit; delivery card ("Delivered by Poultry360 today, 2–6 PM · Delivery ₦1,100 · 2.9 km away"); stock pill; description;
  quantity stepper + "Add · ₦…" (sticky footer on phone).
- **Store page**: initials tile, name + verified tick, location (or "Agent for <store>"), rating and listing-count tiles, product grid.
- **Agent's shop page** (/a/CODE): initial circle, "<Name>'s shop", "Agent for <store> · 2.9 km from you", product grid.
- **Cart**: grouped by seller ("Verified farm near you" or name), photo, price, quantity stepper/remove, unavailable items struck through;
  footer Subtotal + Checkout (or "Sign in to check out").
- **Checkout** step 1 **Deliver to**: address cards (in/out of delivery area), "Add a new address" form (Home/Work/Restaurant/Other,
  street, area chips incl. "Elsewhere in Port Harcourt" / "Outside Port Harcourt", "Pin my current location").
- **Checkout** step 2 **Review order**: address card; per-seller order blocks with their own delivery fee; totals; "Pay later" option when a
  farm allows credit; Pay with: Wallet / test cards; "Pay ₦…" button. Processing screen; "Payment didn't go through" screen with retry/wallet.
- **Order placed**: tick, code and amount, which seller each part comes from, Track order / Keep shopping.
- **Orders**: Active / Past segments; order cards with status.
- **Tracking**: status steps (Order placed → Confirmed by farm → Ready for pickup → Picked up, quality checked → On the way → Delivered),
  map with the rider ("Last known location · updating"), rider card (Call), "Running late" note, proof-of-delivery photo, Rate, "Something wrong?".
- **Rate your order**: product and delivery stars + comment. **Report an issue**: what went wrong, photos (camera or gallery), submit → "Report received".
- **Pay later** (My credit): credit with each farm, what you owe, pay from wallet.

### 5.4 Wallet (all roles that hold money)
- **Wallet**: Hearth "Available balance", Add funds / Withdraw; sales summary for sellers (gross, platform commission, net); recent activity
  list; Export (CSV).
- **Add funds**: amount, test cards → "₦… added", new balance.
- **Withdraw**: amount (Withdraw all), confirm with a code ("Confirm it's you"; test mode shows the code) → "Your payout is on its way"
  with steps (Initiated → Processing → Arrived). Needs a payout account first.
- **Payout account**: bank + 10-digit account → Verify and save.
- **Transaction detail**: type, status, amounts.

### 5.5 Farm (and store) selling
- **Seller home**: business name + verified tick, greeting, Buy/Sell switch; verification banner; "Pin your farm's location" card;
  Hearth "Available payout"; **Needs your action** (orders with 24-hour countdown); "Run your farm / store" tiles (Farm Hub, Vet care,
  Sell waste, Agents, Raise funds / Products, Agents, Credit sales, Orders). A store in review sees only "Get ready" and "While you wait".
- **Listings / Products**: Live · Drafts · Sold out segments; rows with photo, price, stock, status pill, ⋮ menu (Edit, Publish/Unpublish, Delete);
  "Add listing" floating button.
- **New / edit listing**: up to 4 photos (+ tile asks camera or gallery), category chips, title (with category-specific example), price,
  quantity, sold-per unit chips, agent rebate %, description; Save draft / Preview → **Preview** ("This is how buyers will see it") → Publish.
- **Orders**: New · Active · Past; cards with code, countdown ("19:59:59 LEFT"), items, buyer + area, total.
- **Order detail**: placed → Hearth countdown, items, buyer, money breakdown (gross, 10% commission, you receive), Accept / Decline (reason sheet);
  confirmed → "Prepare … for pickup" checklist (count, remove damaged, pack by the gate/counter) → Mark ready (choose: add to a rider already
  coming, or request a new rider); later → rider card (Call), status, "₦… added to your wallet".
- **Sell waste** (Waste & manure): manure/litter/feathers listings.

### 5.6 Farm Hub (farm records, works offline)
- **Farm Hub home**: sync bar (offline / syncing / errors with Retry); running flocks; shortcuts to Dashboard, Farm Book, Inventory;
  "Start a new flock"; Past flocks.
- **New flock**: type chips (Layers, Broilers, Turkey), breed chips (e.g. Isa Brown, Ross 308, Bronze), batch size, start date.
- **Flock page**: summary (birds, losses, feed, output, total costs), tabs Health · Feed · Output · Costs with bar charts over the flock's life;
  log buttons (Output, Feed, Loss, vet/other cost); Health records; Vaccine chart; Close out (sold/finished) / Reopen.
- **Log entry**: Feed (pick a priced feed from inventory, kg; cost worked out), Mortality, Output, Cost.
- **Vaccinations**: schedule list, "Mark administered" (only from its date), Schedule a vaccination, reminders status, link to the chart.
- **Vaccine & feed chart**: Vaccines · Feed · Output views by age for broilers and layers; "Add N vaccinations to schedule"; "Confirm with your vet".
- **Dashboard**: 30 days / 90 days / 12 months / All time; revenue, costs, by-flock breakdown.
- **Flock history**: closed flocks with lifetime records.
- **Inventory**: Vaccines · Feeds · Farm assets tabs; items with quantity, unit, alerts (expired, expiring, out of stock, running low, no price);
  used/added adjustments; shop links; **Inventory form** (feed requires bag price).

### 5.7 Farm Book / Store Book (selling on credit)
- **Book home**: Hearth "Customers owe you" + overdue; Pending · Paid · Customers segments; app buyers' credit eligibility (progress to ₦50k / ₦300k).
- **Log a credit sale**: customer (individual/business), items from listings or typed, quantities, discount %, due date → subtotal, amount owed.
- **Credit sale**: status, items, receipt upload (photo) → Mark payment completed; commission note for app orders; remove mistaken entry.
- **Customer**: owes you, limit, block from new credit, history. **Allow pay later**: set a limit for an eligible buyer.

### 5.8 Agents (store side)
- **Agents** page: Hearth with Rebates owed / This quarter / Sold to agents; stock orders to hand over (Decline / Handed over);
  invite card (code, New code, Share invite link); Top agents leaderboard (30 / 90 days / All time, ranked by what they bought); note on rebates.
- **One agent**: Hearth rebate owed; Give stock / Record payout; pickup address; stock they bought; sales they logged; payouts; Remove agent.
- **Give stock**: pick products + quantities, note → "Record handover · ₦…".

### 5.9 Agent (their own shop)
- **Agent desk, phone**: avatar + "<Name>'s shop", "Agent for <store>"; address/pin banner; Hearth rebate owed with quarter progress;
  Wallet / In stock / This month tiles; four action tiles (Buy stock, Log a sale, Share shop, Orders with badge); Needs your action
  (paid stock with Paid → Handover → In your stock tracker; orders with countdown); My stock cards; Restock list with rebate %;
  Recent activity; shop link; pickup address; Leave this store.
- **Agent desk, website**: sidebar (Dashboard, Orders, Wallet); header bar (Switch to buying, Share shop, Log a sale, Buy stock);
  four figures in a row; two columns: Needs your action, My stock **table**, Recent activity **table** | shop link, pickup address, Restock.
- **Buy stock**: store products as chips → quantities → total, rebate, wallet; "Pay ₦… from wallet" or "Top up ₦…".
- **Log a sale**: own stock as chips → quantities, buyer name/phone → Save sale.

### 5.10 Vet care (farmer side)
- **Vet care home**: "Birds looking unwell?" → Check symptoms; tiles Find a vet, On-site visit, Drugs & vaccines (opens the farm's inventory),
  Health records; Upcoming consults and visit requests.
- **Verified vets** list → **Vet profile**: bio, fee, rating; choose a time (from weekly hours); pay with wallet/card; or "Request an on-site visit".
- **Consultation**: vet, time, "Join video call" (Jitsi), 30 minutes; summary after.
- **Symptom checker**: flock, signs, photos → **Triage note** ("This is not a diagnosis", what you reported, worth asking a vet about,
  "Speak to a vet today" / Book a vet).
- **Health records**: per flock, add record.
- **On-site visit request**: date, location, notes.

### 5.11 Vet desk (vet side)
- Review status while the licence is checked (steps; what to fix + resubmit if rejected).
- **Bookings · My hours · Profile** segments: wallet balance + Withdraw; upcoming bookings; weekly availability (days on/off, start/end per day,
  consult length); fee, bio, farm visits toggle.
- **Booking**: farmer, flock, notes, Join video call, write summary and complete; on-site requests: propose a time, decline.

### 5.12 Invest (test only) and Raise funds
- **Invest home**: Hearth totals (invested, current value, returns), open opportunities (offering cards), pools, ROI calculator.
- **Offering / Pool**: farm(s), target and progress, use of funds, payout schedule, estimate copy; Invest now (blocked states: paused, funded, closed, own offering).
- **Invest amount** → wallet → **Success**; **Portfolio** (Active · Matured · Refunded, projected vs actual); **Investment detail**.
- **Verify your identity** (KYC): ID + proof of address, review steps, fix and resubmit.
- **Raise funds** (farm): investment badge application (documents, status), My offerings, **Offering form** (target, minimum, term, ROI,
  use of funds, payout schedule; save draft / submit).

### 5.13 Profile
- Name, email; Your roles (switch, status pills, Vet desk, Agent shop, Agents, Investor, Explore, Add a role); Buying (individual/business,
  Pay later); Appearance (System / Light / Night); Settings (payout account, change password, two-factor, help); Sign out.

### 5.14 Rider app (separate)
- **Sign in** (email + code + password; only emails ops added). **Home**: Go available / Go offline (needs location), earned today;
  a **new delivery offer** on an always-dark screen with a 90-second countdown (Accept delivery / Decline; "Accept all" for a multi-order trip).
- **Trip**: pickup (navigate, call), "I'm at the farm", per-order **quality check** (pass → picked up; or flag and leave with reasons),
  "I can't carry all of these", deliveries per order ("I've arrived"), **proof of delivery** photo → Mark delivered.
- **History**; **Profile** (wallet, this week / all time, rating, recent activity, withdraw, payout account, password).

### 5.15 Ops dashboard (web)
- Sign in / get a code / set password; "Not an ops account" screen.
- **Farm and store verification**: pending / approved / rejected, detail with ID document and map, approve / reject with reason / revoke.
- **Riders**: list, add/edit, deactivate, deliveries, copy sign-in instructions.
- **Vets**: licence review, approve / reject / remove.
- **Investments**: KYC, badges, offerings, start a funded term, pay out returns, create pools.

---

## 6. Main flows

1. **First order (buyer):** sign up (email → code → password) → role (Buy) → Home → category or search → product → Add → Cart →
   Checkout: address (pin location) → review (per-seller delivery fees) → pay → Order placed → Tracking → Delivered → Rate.
2. **Farm onboarding:** sign up → "Sell as a farm" → business details + ID + pin → In review (Farm Hub open meanwhile) → approved by ops →
   first listing (photos, details, preview, publish).
3. **Fulfilling an order:** new order (24 h countdown) → Accept → checklist → Mark ready (join a coming rider or request one) →
   rider collects (quality check) → delivered → 90% of goods to the farm wallet.
4. **Rider delivery:** Go available → offer (90 s) → Accept → at the farm → QC → deliver → photo proof → paid 80% of the delivery fee.
5. **Agent:** store shares invite link → new person signs up and lands on "Open your shop" → buys stock (wallet, store confirms; or the store
   records a cash handover) → shares shop link → customer orders from the agent's shop (nearest first, cheaper delivery) → agent prepares,
   rider collects → rebate adds up per quarter → store records the payout.
6. **Farm records:** start a flock → log feed (from priced inventory), mortality, output, costs → schedule vaccinations (reminders) →
   dashboard → close the flock.
7. **Credit:** a buyer who has bought enough from a farm becomes eligible → farm allows pay later with a limit → buyer chooses Pay later at
   checkout (pays delivery now) → pays later in the app, or the farm uploads a receipt.
8. **Vet consult:** symptom checker → triage note → book a vet → pay → join video call → vet writes summary → health record.

**Delivery fee:** ₦800 + ₦100 per km from seller to buyer (rounded up, max ₦3,000); ₦1,250 when either location isn't pinned.
Nearest sellers are listed first.

---

## 7. Known weak spots (what we'd like the redesign to fix)

- **Phone layout reused on the website.** Only the landing page and the agent desk have a true website layout; most signed-in pages
  (buyer home, wallet, orders, seller home, Farm Hub, Farm Book, vet desk, invest) are a phone column inside the sidebar.
- **Card stacks everywhere.** Most screens are a vertical list of similar white cards with little hierarchy; few images, charts or illustrations.
- **Product photos** are often missing; placeholders are a grey box with an icon. Seller identity (logo/avatar) is just initials.
- **Empty and first-run states** are mostly an icon in a circle and a sentence; little guidance or delight.
- **Dashboards** (Farm Hub, wallet, seller home) show few visual summaries: simple bars only, no trends or comparisons.
- **Tracking** is functional but plain; no ETA prominence or rider photo.
- **Navigation depth**: many features hide behind tiles and Profile (Farm Book, Inventory, Agents, Vet care, Explore); role switching is
  spread across Profile, a Buy/Sell switch and desk buttons.
- **Forms** are long single columns (business form, listing form, vet registration, KYC) with little grouping or progress.
- **Brand presence** is light: the logo appears small; there is no illustration style, photography style or tone guide inside the app.
- **Accessibility**: colour-only status in places, small 12–13 px secondary text, and some low-contrast muted text on tinted tiles.

## 8. What we want from a redesign

- A stronger, more distinctive brand look that still feels trustworthy for money (not generic, not "AI-looking"), in light and dark.
- A true website layout for every signed-in page at 900 px+, and a polished phone layout below that.
- Better information hierarchy on home screens and dashboards (what needs attention first, then figures, then lists).
- Richer product presentation (photos, seller identity, distance/delivery cost, trust signals).
- Clearer role switching and navigation for multi-role accounts.
- Designed empty states, first-run onboarding and success moments.
- Components and tokens that map onto the current kit (section 2), so the redesign can be built in React Native without new native modules.
