# Poultry360 · New design (implementation brief)

This is the approved redesign direction, written so it can be built in the existing Expo / React Native + react-native-web codebase.
It replaces the visual and layout parts of the old design brief. Product rules, flows and copy rules from the old brief still apply.

- **Reference mockups:** the `newdesign-mockup/` folder next to this file holds the HTML source of every mocked screen
  (`Main` = website buyer + farm, `Phone` = phone buyer + farm, `Roles` = website store/agent/vet, `Rider`, `Onboard`, `Ops`, `Art` = placeholder art).
  They are prototype files, not app code. Read them for exact sizes, spacing, colours and copy; do not port their structure.
- **All names, prices and figures in the mockups are sample data.**
- **Status:** founder approved the direction, asked for softer bold weights on the phone app (done, see section 2).

---

## 1. What changed and why

| Problem in the old UI | Change |
|---|---|
| Every screen is a stack of identical white cards | Three surface levels: Hearth (money / live status), unboxed sections on the page, cards only for real objects |
| Website is a phone column inside a sidebar | Four website page templates used by every signed-in page (section 5) |
| Features hidden behind tiles; role switching in three places | One role switcher; Farm Book, Inventory and Vet care become tabs inside Farm Hub |
| Grey photo boxes, initials for sellers, plain bars | Tinted placeholder art per category, figure strips with trend notes, charts with a headline number, ETA-first tracking |
| Generic green-on-white | Logo orange used as a sparing accent; dark-green Hearth carries more of the brand |
| Long single-column forms | Grouped steps with a progress bar; the action button always says what is missing |
| Colour-only status, small low-contrast text | Every status has text and usually an icon; 13 px minimum; darker muted text |

---

## 2. Tokens

Keep the existing token names. Only the values below change or are added.

### Colour

| Token | Light | Dark | Notes |
|---|---|---|---|
| `bg` | #F4F6F3 | #0C0F0E | |
| `sf` / `sf2` | #FFFFFF / #EAEFEA | #151918 / #1F2423 | `sf2` = table headers, segmented track, sunken fills |
| `ink` / `mute` | #0E1512 / **#55605A** | #F2F5F3 / #A3ACA7 | `mute` darkened for contrast |
| `line` / `line2` | ink 10% / ink 20% | white 10% / white 20% | |
| `yolk` (primary) | **#0B7A53**, white text | #2DCB8C, text #06281B | Darkened from #0F8A5F so white text passes 4.5:1 |
| `acc` | #0A6B49 | #5FD6A6 | Links, verified tick |
| `navact` / `navactink` | #DFF3E9 / #0A6B49 | green 16% / #5FD6A6 | |
| `bar` (new) | #9FD8C0 | #1F6B4E | Chart bars other than the latest one |
| `hc` (Hearth) | #0A2219 | #12302A | Text on it: #F2F7F4, secondary #B4CDC2, hairline white 14% |
| Hearth button | #2DCB8C, text #06281B | same | Primary button on a Hearth card, both modes |
| `orange` (new) | #F08A24, text on it #1F1000 | same | Accent only, see below |
| `obg` / `oink` (new) | #FFEBD6 / #8A4206 | #3A2610 / #FFB870 | Orange pill |
| ok | #0A6B49 on #DFF3E9 | #5FD6A6 on green 16% | |
| warn | #754A00 on #FFF0D2 | #FFD27A on #3A2E10 | |
| err | #A8261E on #FCE8E5 | #FF9C94 on #3A1614 | |
| `t1`–`t4` | #DFF3E9, #FFE6D6, #E1E9FB, #FFF1CC | #14302A, #3A2418, #1A2540, #3A3014 | |

**Orange accent rules.** Orange is never a button colour and never a background for a whole card. Use it only for:
the live dot on a Hearth card, the current step in a progress bar or step list, count badges ("Needs your action · 3", nav badges),
"Laid today" style freshness badges on products, low-stock bars, and rank 1 in a leaderboard.

### Type (Hanken Grotesk, unchanged family)

| Style | Website (≥ 900 px) | Phone (< 900 px), softer |
|---|---|---|
| `display` page title | 32/37, 800, tracking −0.5 | 28/33, **700**, tracking −0.4 |
| `h1` | 24/29, 800 | 24/29, **700** |
| `h2` section title | 18/23, 700 | 18/23, **600** |
| `body` | 15/22, 400 | same |
| `strong` / `bold` | 600 / 700 | **600** for both |
| `label` | 13, 600, muted | 13, **500**, muted |
| `mono` money in rows | 15, 800, tabular | 15, **700**, tabular |
| `monoLg` big money | 44/50, 800, tracking −1 | 38–46, **700**, tracking −1 |
| Buttons | 800 primary, 700 secondary | **700** primary, **600** secondary |

Rule of thumb for the phone: one weight step lighter than the website everywhere (800→700, 700→600, 600→500). Nothing on the phone uses 800.
The rider app uses a 16 px body and larger buttons (64 px primary) because it is used on a bike.

### Shape and spacing (unchanged unless listed)

- Radius: 12 small tiles and thumbnails · 16 inputs · 20 cards and tables · 24 Hearth and large panels · 28 product hero · pill for buttons and chips.
- Card padding 16–20; Hearth padding 20–24. Section gap 28 on website, 20 on phone.
- Tap targets ≥ 44 px. Primary buttons 56 px; compact buttons 44 px; table row actions 40 px.

---

## 3. Core patterns

### 3.1 Three surface levels

1. **Hearth** (dark green card): money and live status only. One per screen, two at most. Contains a small label, one very large number or time, one line of context, and at most two buttons.
2. **Unboxed section**: an `h2` on the page background followed by rows separated by hairlines, or by a table. No card around it.
3. **Card** (white, hairline border): only for a real object: a product, an order, an address, a vet, a table.

Never put a card inside a card. Do not wrap a whole screen section in a card just to group it.

### 3.2 Home-screen order

Every role's home follows the same order: **1. what needs action → 2. figures → 3. lists.**
The buyer's "needs action" slot is the live order Hearth; the farm's and store's is the "Needs your action" list.

### 3.3 Components (new or changed; all buildable from Views, Text and SVG)

| Component | Spec |
|---|---|
| **RoleSwitcher** | Website: card-like button at the top of the sidebar (36 px dark square with initials, small label "Buying as" / "Selling as" / "Agent shop" / "Vet desk", name, up-down chevron). Opens an inline list of the account's roles with a tick on the current one and "Add a role". Phone: the same content as a pill in the top-left of the header; opens a bottom sheet "Switch role". This is the only place roles switch. Remove the Buy/Sell switch and desk buttons. |
| **FigureStrip** | One bordered, rounded container split into equal cells by 1 px lines (4 across on website, 2 × 2 on phone). Each cell: label, big tabular number, one short note in ok / warn / mute colour ("Up 15% on last week"). Optional 80 × 28 sparkline on website. |
| **ActionList** ("Needs your action") | `h2` plus an orange count badge. Rows: 44 px icon or avatar circle, title, one-line detail, status pill (countdown in warn colours), amount, one button. On phone each row becomes a small card with the button bottom-right. |
| **DataTable** | Website only. Rounded container, header row on `sf2` with 13 px bold muted column names, rows separated by hairlines, numbers right-aligned and tabular, optional 40 px action button in the last column. Wrap in a horizontal scroll box. On phone the same data is a plain hairline list. |
| **Segmented** | Unchanged, but labels may carry counts ("Live · 3"). |
| **SelectCard** | Used for addresses, payment methods, role options. 2 px border; selected = primary border plus a tick icon on the right (never colour alone). |
| **StepList** | Vertical steps. Done = filled primary dot with a tick; current = orange dot, bold label; upcoming = hollow dot, muted label. Time on the right. |
| **ProgressSegments** | Row of 6 px rounded bars. Done = green, current = orange, upcoming = hairline. Used on the live-order Hearth, onboarding and the rider trip. |
| **BarChart** | Headline first (label, big number, one note), then bars. Bars start at zero. Latest bar in primary with its value above; the rest in `bar`. One line under the chart says what is plotted. |
| **PlaceholderArt** | Shown when a listing has no photo. Tinted ground (`t1`–`t4`) plus a line drawing: ink outline 2.5 px, white fill, one orange detail. Four drawings: eggs in a tray, bird, feed bag, vial. SVG paths are in `newdesign-mockup/Art.dc.html`. Also used small in category tiles, cart rows, listing rows, empty states and role options. Real photos replace it when present. |
| **EmptyState** | Dashed-border rounded box, PlaceholderArt, one bold line, one muted line, one button. Copy is specific ("Eggs laid today are 2.9 km away"), not generic. |
| **SuccessMoment** | 88–96 px primary circle with a white tick and a 12 px `navact` ring, title, key number, then what happens next. Used for Order placed, rider payout and onboarding done. |
| **Toast** | ok-coloured banner at the top of the content column with a tick, a message and Dismiss. |
| **Toggle** | 52 × 32 track, 26 px white thumb; on = primary. |

### 3.4 Status must never be colour only

Every pill has words. Verified, Delivered, Done and Selected also carry a tick icon; Overdue and Running low carry a warning triangle.

---

## 4. Navigation

| Role | Tabs / sidebar | Notes |
|---|---|---|
| Buyer | Home · Market · Orders · Wallet | Cart is a button in the header showing the item count |
| Farm | Home · Listings · Orders · Farm Hub · Wallet | **Farm Hub has four tabs: Flocks · Farm Book · Inventory · Vet care** |
| Store | Home · Products · Orders · Agents · Wallet | Store wording only ("Store Book", "pack by the counter") |
| Agent | Dashboard · Orders · Wallet | Buy stock opens from the dashboard header |
| Vet | Vet desk (segments: Bookings · My hours · Profile) | Weekly hours only, no per-slot lists |

- **Website sidebar** (248 px, white): logo, RoleSwitcher, the role's nav with orange count badges, then Dark mode and Profile pinned to the bottom. Active item = `navact` fill, `navactink` text.
- **Phone tab bar:** unchanged shape (icon over label, green pill behind the active icon). Hide it on focused flows: product, cart, checkout.
- **Phone header:** RoleSwitcher pill on the left; dark-mode and cart buttons on the right. Focused flows show a round back button and the screen title instead.

---

## 5. Website page templates (≥ 900 px)

Every signed-in page uses one of these four. Content column max 1080 px, 32 px side padding.

1. **Dashboard:** header bar (title left, actions right) → attention row (Hearth 2/3 + side card 1/3, or an ActionList) → FigureStrip → two-column body (main 60%, side 40%).
   Used by: buyer Home, farm Home, store Home, agent Dashboard, Wallet, Farm Hub flock page, vet Bookings.
2. **List:** header bar with Segmented and a primary action → DataTable.
   Used by: Listings / Products, Farm Book credit sales, Inventory, ops Riders.
3. **List + detail:** header with Segmented → list column (about 35%) of selectable cards or rows → detail panel (about 65%).
   Used by: buyer Orders (detail = tracking), farm / store Orders, ops Verification.
4. **Two-column flow:** left column of numbered or grouped sections, right column a summary (a Hearth when it carries the pay button).
   Used by: Product (art left, details right), Cart, Checkout, agent Buy stock.

Below 900 px each template collapses to one column in the same order, the DataTable becomes a hairline list, and the summary's button moves to a sticky footer.

---

## 6. Screens

W = website layout, P = phone differences.

### 6.1 Buyer

**Home.** W: title "Good afternoon, <name>", "Deliver to <area>" and "Cart · n" buttons on the right. Live-order Hearth: orange dot + "Order <code> · on the way", label "Arriving", time at 44 px, one line ("Emeka is 2.1 km away with 5 crates of eggs"), Track order button, six ProgressSegments. Side card: wallet balance, pay-later amount and due date, Open wallet. Then a full-width search button, "Shop by category" tiles (tint + PlaceholderArt + label), and "Fresh today, nearest first" product grid (4 across).
P: greeting stays "What's on the table today, <name>?" with "Deliver to" above it; Hearth; search; category tiles in a sideways row; product grid 2 across.

**Product card.** Tinted ground with photo or PlaceholderArt (156 px tall on W, 104 on P); optional orange freshness badge top-left; title; "Verified farm near you" in `acc` with a tick; "2.9 km · ₦1,100 delivery" muted; price large with "/ unit" muted. W adds a round 44 px add button.

**Market.** Title, search field, cart. Category chips (selected chip = ink fill). A row with "n listings near <area>" and a Nearest / Lowest price Segmented. Product grid. EmptyState when a category has nothing.

**Product.** W: back pill "← Market". Left: 420 px tall tinted panel with photo or art. Right: title, price at 34 px, stock pill with tick, **delivery Hearth** ("Delivered by Poultry360 · Today, 2 to 6 PM" with Delivery fee and Distance), quantity stepper + "Add · ₦total", then three trust rows with icons: "Sourced from a verified farm near you" (the hidden-seller line, kept), "Quality checked at pickup", "Farm is paid after delivery". Below: "More near you" compact cards.
P: same order in one column; stepper and Add button in a sticky footer.

**Cart.** Lines grouped by seller. Group header on `sf2`: tick + "Verified farm near you" (or "Verified store near you") and "2.9 km · delivery ₦1,100". Rows: thumbnail, title, unit price, stepper, line total, Remove. Summary: Subtotal, "Delivery · n sellers", Total, Checkout, and one line explaining per-seller delivery fees. EmptyState when empty.

**Checkout.** One page, three numbered sections: **1 Deliver to** (address SelectCards with "In delivery area · location pinned", plus a dashed "Add a new address" button), **2 Your order** (one row per seller, seller still hidden), **3 Pay with** (Wallet with balance, Card, Pay later). Summary Hearth: Subtotal, Delivery, amount due at 40 px, "Pay ₦…" button, "The seller is paid only after delivery."
When Pay later is chosen the Hearth switches to "Pay now, delivery only", shows only the delivery total, and notes how much goes on pay later and when it is due.
P: Deliver to, Pay with, totals Hearth; sticky footer "To pay ₦… · Pay ₦…".

**Order placed.** SuccessMoment, order code, total, "arriving today, 2 to 6 PM". Then a "Coming from" table that **reveals seller names for the first time** (initials tile, name, verified tick, items). Buttons: Track order, Keep shopping.

**Orders + tracking.** W template 3. List: Active (selected card has a 2 px primary border) and Past cards with code, status pill, items, total. Detail: **ETA Hearth** (orange dot + "On the way", arrival time at 44 px, "About 12 minutes · 2.1 km away") with the rider on the right (avatar, name, rating, plate, Call) and the map directly under it inside the same card. Below: Progress StepList with times, and the order summary (items, delivery, total, source farm, "Something wrong?").
P: Hearth with map, rider card with a primary Call button, StepList.

**Wallet.** Hearth: "Available balance", amount at 44 px, Add funds / Withdraw. Beside it a card with three figures and a small weekly bar chart. Then Activity as a DataTable (Date, Details, Type pill, Amount) with an All / Money in / Money out Segmented and Export CSV in the header. P: Hearth, then a hairline activity list.

### 6.2 Farm (and store, with store wording)

**Home.** Header: business name + Verified pill, date and area; "Log today's records" and "Add listing". **ActionList**: new orders with a countdown pill and Accept, plus operational alerts such as "Layer mash is running low" with Restock. Accepting an order changes its pill to "Accepted · pack by the gate" and the button to "Mark ready". FigureStrip: Available payout, Sales this week, Eggs today, Birds alive. Body: "Running flocks" table (Flock, Birds, Mortality pill, Today) on the left; Farm Book summary Hearth ("Customers owe you", overdue line with warning icon) with the next two debts on the right.

**Listings / Products.** Template 2. Segmented "Live · n / Drafts · n / Sold out · n", Add listing. Columns: Listing (thumbnail + title), Price, Stock ("4 left · low" in warn), Status pill, action (Unpublish / Publish / Add stock).

**Orders.** Template 3. Segmented New / Active / Past with counts. Detail panel: Hearth with code and buyer, then by stage:
- **New:** countdown at 36 px, "Left to accept", Accept and Decline (Decline opens the reason sheet).
- **Accepted:** "Prepare for pickup". A card with a three-item checklist (Count the items · Remove damaged ones · Pack by the gate/counter). The two rider buttons ("Add to <rider>'s trip · here in 14 min" and "Request a new rider") stay disabled until all three are ticked.
- **Ready:** rider card with Call; note "₦… reaches your wallet on delivery".
- **Past:** "Delivered", date, amount added to wallet.
A Money block is always visible: item line, "Commission, 10%", "You receive".
P: orders as ActionList cards with Accept; past orders as a list.

**Farm Hub.** Title + sync pill ("Synced 2 min ago"). Underlined tabs: **Flocks · Farm Book · Inventory · Vet care**.
- **Flocks (flock page).** Flock header with art tile, name, week and start date; log buttons on the right (Log eggs is primary; Feed, Loss, Cost are outline). FigureStrip of five: Birds alive, Mortality (with "Within the 5% guide"), Eggs today (lay rate), Feed per bird (with guide range), Cost so far (per bird). BarChart card with Output / Feed / Health / Costs Segmented. Side column: Vaccinations (the due one as a warn-coloured card with "Mark administered", enabled only from its date; later ones as rows) and "Feed in store" with a stock bar and "Running low". Then "Recent entries" DataTable.
- **Farm Book.** Hearth "Customers owe you" with the overdue line and "Log a credit sale". Card "Close to pay later" with progress bars toward ₦50,000 per app buyer. "Credit sales" DataTable: Customer, Items, Status pill (Overdue in err colours, due dates neutral, Paid in ok), Amount, Mark paid.
- **Inventory.** Segmented Vaccines / Feeds / Farm assets; Add item. DataTable: Item, In store, Alert pill (OK / Running low / Out of stock / Expires <date>), Price, Restock when not OK.
- **Vet care.** Tinted card "Birds looking unwell?" with **"Preliminary triage, not a diagnosis."** directly under it and Check symptoms. Hearth "Next consult" with Join video call. "Verified vets" cards: avatar, name + tick, speciality, Fee / Rating / Next free, Book.

### 6.3 Store

**Home.** Header with Verified store pill and Add product. FigureStrip: Available payout, Sales this week, Sold to agents (quarter), Rebates owed. "Stock to hand over" ActionList (agent avatar, order, "Paid · waiting" pill, amount, Handed over). "Top agents" DataTable with a 30 days / 90 days / All time Segmented: Rank (rank 1 in orange), Agent, Bought, Sales logged, Rebate owed. Footnote: ranked by what each agent bought; rebates paid at quarter end.

**Agents.** Hearth: Rebates owed (big), quarter end date, Bought this quarter, number of agents. Invite card: code in large spaced letters, Share invite link, New code. Then the same hand-over list and leaderboard.

Products, Orders and Wallet reuse the farm's Listings, Orders and Wallet layouts with store wording.

### 6.4 Agent

**Dashboard.** Header "<Name>'s shop", "Agent for <store> · <area>", with Share shop, Log a sale, Buy stock (primary). Hearth "Rebate owed to you" with a quarter progress bar and days to payout. FigureStrip: Wallet, In stock, Sold this month. Left column: "Needs your action" (stock orders show a Paid → Handover → In your stock tracker with word labels; customer orders show a countdown) and "My stock" DataTable. Right column: shop-link card with Copy link, and a Restock list with a rebate % pill per product.

**Buy stock.** Template 4. Product rows with stepper and "₦price · n% rebate". Summary Hearth: Total, "Rebate you earn" in green, Wallet, "Pay ₦… from wallet" (disabled at zero), "The store hands over after it confirms."

### 6.5 Vet desk

Header: name, "Licence verified" pill, speciality and rating, Segmented Bookings / My hours / Profile.
- **Bookings.** Hearth "Next consult" with time, farm, flock, length and Join video call; wallet card with Withdraw. "Upcoming" list: day and time, farm, note, pill (Paid, or "Needs a time" for on-site requests), button (Open, or Propose a time).
- **My hours.** One row per weekday: Toggle, day name, hours or "Off". Consult-length chips (15 / 30 / 45 min). A tinted card showing how many slots farmers can book each week, recalculated live. No per-slot list.
- **Profile.** Fee, experience, "I also do farm visits" Toggle, bio.

### 6.6 Sign-up and onboarding (phone)

Top bar from step 1 on: back button, four ProgressSegments, "2 of 4".
1. **Sign in.** Hearth-coloured brand panel (logo, "Fresh poultry from verified farms.", art), Email, Password, Sign in, Create account, Forgot password.
2. **Code.** "Enter the code", "Sent to …", six boxes (active box has a primary border), resend timer, Verify.
3. **Role.** "How will you use Poultry360?" as SelectCards with art: Buy · Sell as a farm · Supply farms · Work as a vet · Sell for a store. Continue is always tappable; with nothing picked it shows "Pick one to continue" in warn colours above the button.
4. **About your farm / store.** Name field, "What you sell" chips (farm: Eggs, Broilers, Layers, Turkey, Live birds; store: Feed, Drugs & vaccines, Equipment, Packaging), then one grouped card with two rows: "Pin my location" and "Photo of your ID". Each row shows Needed or Done and turns green with a tick when complete. Submit for review says exactly what is still missing.
5. **In review.** Hearth "We're checking your details" with an orange dot; StepList (Details received → ID check → Location check → Verified); tinted card "Farm Hub is open while you wait" (store: "Add products while you wait").
Buyers, vets and agents skip step 4 and land on a SuccessMoment with their next step.

### 6.7 Rider app (separate app, light mode, larger type)

- **Home.** Rider header with an Available / Offline pill. Hearth "Earned today" with the delivery count. Offline: This week and Wallet figures plus a hint. Available: a "Looking for deliveries" state. One full-width 64 px button: Go available / Go offline.
- **Offer (always dark, `hc` background).** Orange dot + "New delivery", countdown ring top-right, "You earn" with the amount at 64 px, total distance and time, a pickup → drop-off card (green dot, orange square, connecting line), Accept delivery (68 px, bright green) and Decline.
- **Trip.** Four ProgressSegments and "Step n of 4". Steps: **Pickup** (map, Navigate, Call farm, "I'm at the farm") → **Quality check** (three large tick rows: Count is right · Good condition · Packed well; the button is disabled until all are ticked; a red text button "Something is wrong: flag and leave") → **Delivery** (map, Navigate, Call buyer, "I've arrived") → **Proof** (large dashed photo box; "Mark delivered" disabled until a photo is taken) → **Done** (SuccessMoment with the payout and "80% of the ₦1,100 delivery fee").

### 6.8 Ops dashboard (web)

Dark-green sidebar (`hc`): wordmark, "Ops", nav (Verification with an orange pending count, Riders, Vets, Investments).
- **Verification.** Template 3. Segmented Pending / Approved / Rejected with counts. List columns: Business, Type, Submitted; the selected row has a primary left bar. Detail: name, type, owner, what they sell, status pill; ID document panel and pinned-location map side by side; Approve and Reject. Reject opens an err-tinted panel with reason chips; "Confirm reject" is disabled until a reason is picked. After a decision the next pending business is selected. Decided items show the outcome and "Move back to pending".
- **Riders.** Template 2: Rider (name, plate), Status pill, Deliveries, Rating, Deactivate / Reactivate; Add rider.
- Vets reuses the Verification layout with the licence photo. Investments reuses it for KYC, badges and offerings.

---

## 7. Rules carried over (unchanged)

- Green primary in both modes. No cream background, no yellow primary, no uppercase monospace labels.
- Terse, plain copy. No filler sentences under headings.
- Hidden seller on search, category, cart and checkout: "Verified farm near you" / "Verified store near you". The name appears only after checkout.
- A store never sees farm wording.
- Symptom checker always says "preliminary triage, not a diagnosis".
- Investment estimates show the "this is an estimate" line directly under every projected number.
- Money and live status use the Hearth card. Every ₦ amount uses the matching ₦ glyph and tabular figures.
- Vets set weekly hours only.
- "Mark administered" is available only from the vaccination's date.
- Light and dark mode for every customer-app screen. One codebase for phone and web; no new native modules.

---

## 8. Not designed yet

- Invest and Raise funds (behind a flag).
- Phone layouts for store, agent and vet (follow the phone rules in sections 4 and 5).
- Phone versions of Farm Book, Inventory, Vet care, and the order checklist / rider step.
- Sheets and forms opened by: Add listing / Add product, Log a credit sale, Log a sale, Add a new address, Check symptoms, book a vet, Decline reason, Add rider, Add funds, Withdraw.
- Dark mode for onboarding, rider and ops (the tokens in section 2 apply).
- Signed-out landing page (not changed in this round).
- The real logo artwork: the mockups use a stand-in mark.

## 9. Suggested build order

1. Tokens and type scale (section 2), including the softer phone weights.
2. Shared components (section 3.3): RoleSwitcher, FigureStrip, ActionList, DataTable, SelectCard, StepList, ProgressSegments, BarChart, PlaceholderArt, EmptyState, SuccessMoment.
3. Navigation: single role switcher, Farm Hub tabs, website sidebar with badges.
4. The four website templates, then buyer screens (Home → Market → Product → Cart → Checkout → Order placed → Orders → Wallet).
5. Farm screens (Home → Orders → Listings → Farm Hub tabs), then store, agent and vet.
6. Onboarding, then the rider app, then ops.
