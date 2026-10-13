# CLAUDE.md · Poultry360 MVP

Context file for an AI coding assistant working in this repo. Read it fully before making changes.

## What this is
Poultry360 is an Android-first marketplace and farm-management app for Nigeria (launching in **Port Harcourt, Rivers State**). Buyers order poultry products from verified farms. **Poultry360 owns delivery**: its own riders pick up from farms and deliver. Farms also get Farm Hub (offline flock records), vet booking and a waste/manure marketplace.

- Currency is NGN (₦), phone numbers are +234, timezone is Africa/Lagos (the IANA name for all of Nigeria/WAT; keep it even though the launch city is Port Harcourt). Delivery areas, examples and the map default are Port Harcourt.
- Stack: **Expo (React Native, JavaScript, no TypeScript)**, **Supabase** (Postgres, email code + password auth, realtime, storage), **react-native-maps** (Google).
- Payments are **simulated** (Paystack stand-in). There is no real money movement.

## Repo layout (npm workspaces)
```
poultry360-mobile/
├─ package.json              # workspaces: apps/*, packages/*  · scripts: customer, rider, fix-deps
├─ supabase/
│  ├─ schema.sql             # FULL backend: tables, RLS, triggers, RPCs, realtime, storage, seed
│  ├─ reset.sql              # drops everything Poultry360 created (use before re-running schema.sql)
│  └─ migrations/            # standalone snippets for existing projects (001 email sign-in, 002 ops admin, 003 admin riders, 004 PH + trips + rider wallet, 005 flock start date, 006 investment, 007 personas + farm book, 008 commission rules, 009 farm inventory, 010 vet weekly availability, 011 vet hours per day)
├─ packages/shared/src/      # imported as '@p360/shared' by both apps
│  ├─ config.js              # Supabase URL + anon key (fallback when .env isn't loaded)
│  ├─ supabase.js            # client, rpc(), uploadImage(), publicUrl(), friendlyError()
│  ├─ theme.js               # palettes.light / palettes.dark, fonts, radius
│  ├─ ThemeProvider.js       # useTheme() → { c, f, mode, pref, setPref, toggle }
│  ├─ ui.js                  # UI kit (see below)
│  ├─ auth.js                # SignInScreen, EmailScreen, OtpScreen (3-strike 15-min lockout), PasswordScreen, usePasswordGate()
│  ├─ format.js              # naira(), countdown(), timeAgo(), normalizeNgPhone(), normalizeEmail(), STATUS_LABEL…
│  └─ fonts.js               # useP360Fonts()
├─ apps/customer/            # Buyer + Vendor/Farm + Supplier app (role switch inside)
│  ├─ App.js, app.config.js, .env.example
│  └─ src/
│     ├─ navigation/index.js # auth flow → role onboarding → tabs (buyer tabs OR vendor tabs) + stack
│     ├─ context/AuthContext.js   # session, profile, vendor, wallet, setActiveRole, isVendorMode
│     ├─ context/CartContext.js   # cart persisted in AsyncStorage, validate() re-checks stock
│     ├─ lib/catalog.js      # categories, fetchListings(), deliveryContext(), DELIVERY_FEE=1250
│     ├─ lib/payments.js     # SIMULATED cards: ok / insufficient / declined / timeout
│     ├─ lib/offlineQueue.js # Farm Hub offline-first store (AsyncStorage queue + NetInfo sync)
│     ├─ lib/triage.js       # rule-based symptom triage (NOT a diagnosis)
│     └─ screens/            # onboarding, buyer, checkout, orders, wallet, vendor, farm, vet, waste, profile
├─ apps/rider/App.js         # Rider app (single file): availability, 90s offer, QC, nav, proof of delivery
└─ apps/admin/               # Ops web dashboard (Vite + React, JSX): farm verification, riders, vets, investments. Own .env with VITE_SUPABASE_*
```

## Running locally (Windows, PowerShell)
```powershell
cd "...\poultry360-mobile"
npm install
npm run fix-deps                      # aligns all packages to the installed Expo SDK
cd apps\customer
npx expo start -c --tunnel            # -c clears cache; --tunnel works across networks
```
- **Always start Expo from `apps\customer` or `apps\rider`**, never from the repo root. The first log line must say `Starting project at ...\apps\customer`.
- Scan the QR code with **Expo Go** on Android.
- Maps need `GOOGLE_MAPS_API_KEY` and a dev build (`npx expo run:android`) for production. In Expo Go they mostly work without a key.

### Building an installable APK (local, no Expo account)
The repo path and the SDK path (`C:\Users\Oputa David\…`) contain spaces, which break the native C++ build. So the build runs from a space-free copy and a junctioned SDK:
```powershell
# one-time: cmd /c mklink /J C:\AndroidSdk "C:\Users\Oputa David\AppData\Local\Android\Sdk"
robocopy "<repo>" C:\p360 /MIR /XD .git .expo "<repo>\apps\customer\android"   # sync code + node_modules
cd C:\p360\apps\customer; $env:ANDROID_HOME="C:\AndroidSdk"; npx expo prebuild -p android --no-install
Set-Content android\local.properties 'sdk.dir=C:/AndroidSdk' -Encoding ascii   # forward slashes: backslashes get mangled by shells and fail with "volume label syntax is incorrect"
cd android; .\gradlew.bat assembleRelease -PreactNativeArchitectures=arm64-v8a
# → C:\p360\apps\customer\android\app\build\outputs\apk\release\app-release.apk
```
- Don't use `subst` for the repo: autolinking then sees both `P:\` and `C:\` paths and codegen fails ("different roots").
- Root `package.json` `overrides` pin `react`, `react-native`, `react-native-screens`, `react-native-safe-area-context`. Without them npm hoists newer peer versions to the root and the native link fails (`ld.lld: undefined symbol: operator delete`).
- **The build copy has its own copy of the shared package**: in `C:\p360`, `node_modules\@p360\shared` is a plain folder, not a link. After changing anything in `packages/shared`, copy it to **both** `C:\p360\packages\shared` and `C:\p360\node_modules\@p360\shared` (or re-run the full robocopy), otherwise the APK is built with the old theme / UI kit / auth screens. Gradle also does **not** notice changes outside the app folder: if only `packages/shared` changed, `:app:createBundleReleaseJsAndAssets` reports `UP-TO-DATE` and ships the old bundle. Delete `android\app\build\generated\assets\createBundleReleaseJsAndAssets` (and the matching `res` folder) first to force it. Verify by unzipping the APK and searching `assets/index.android.bundle` for a string you changed.
- Re-run `expo prebuild` in `C:\p360\apps\<app>` whenever `app.config.js`, the icons or a config plugin change, then rewrite `android\local.properties`. Plain JS changes and new autolinked modules only need the Gradle build.
- The APK is signed with the debug keystore: fine for sideloading, not for the Play Store (needs an upload keystore or EAS Build).
- Maps in the APK need a real `GOOGLE_MAPS_API_KEY` in `apps/customer/.env` (Maps SDK for Android enabled); Expo Go uses its own key.

### Supabase keys
The app reads, in order: `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` from `apps/<app>/.env`, then falls back to `packages/shared/src/config.js`.
- Find them in the Supabase dashboard: **Connect** button (top bar) → App/Mobile Frameworks. Or **Project Settings (gear) → Data API** for the URL and **API Keys** for the anon/publishable key.
- Use **only** the anon / publishable key (`eyJ…` or `sb_publishable_…`). **Never** use the service_role/secret key.
- `.env` format: no quotes, no spaces around `=`. On Windows, make sure it isn't saved as `.env.txt`.

## Supabase setup
1. **SQL Editor → New query** → paste the *contents* of `supabase/schema.sql` → Run. (Pasting the path `supabase/schema.sql` gives `syntax error at or near "supabase"`.)
2. If you get `relation "profiles" already exists`, run `supabase/reset.sql` first, then `schema.sql` again. reset.sql **deletes all Poultry360 data**.
3. **Sign-in: email code + password** (phone/SMS auth is no longer used). New account: email → 6-digit code → create a password. Returning: email + password. Forgot: email → code → new password. The code proves the email; the password is what they sign in with afterwards. `usePasswordGate(session)` (in `auth.js`) returns `'create'` while `user_metadata.has_password` is missing (so accounts made before passwords existed are asked for one on next open) or `'change'` after a reset / Profile → Change password; both apps then render `PasswordScreen` **instead of** the navigator. Password rules live in `passwordProblem()`: 8+ characters with a letter and a number. Settings needed:
   - **Authentication → Sign In / Providers → Email**: enabled (this also enables password sign-in). **Email OTP Length = 6** (the app's code boxes are 6). Keep **Minimum password length** at 8 or lower, and leave **Secure password change** off (the app sets the password straight after the code).
   - **Authentication → Emails → Templates**: in both **Magic Link** and **Confirm signup**, put the code in the body, e.g. `<p>Your Poultry360 code is <strong>{{ .Token }}</strong></p>`. Without `{{ .Token }}` users get a link instead of a code.
   - Supabase's built-in mailer is for testing only: it sends just a few emails per hour and only to addresses of your Supabase **team members**. For real users, set **Authentication → Emails → SMTP Settings** to a free SMTP provider (e.g. Resend or Brevo free tier).
   - Existing project that ran the old phone-based schema: run `supabase/migrations/001_email_auth.sql`.
4. **pg_cron** (SLA refunds + rider reassignment): Database → Extensions → enable `pg_cron`, then run:
   ```sql
   select cron.schedule('p360-expire', '* * * * *', $$select public.expire_overdue()$$);
   select jobname, schedule from cron.job;   -- verify
   ```
5. **Create a rider** from the ops dashboard (**Riders → Add rider**). Riders can't sign up themselves. They sign in to the rider app with `email`; `phone` is an optional contact number. SQL equivalent (phone digits only, country code, no leading 0):
   ```sql
   insert into public.riders (email, phone, name, vehicle, plate, zone)
   values ('tunde@example.com', '2348030000003', 'Tunde A.', 'Bike', 'PHC 482 KJ', 'GRA & D-Line');
   ```
   Signing into the rider app with that email calls `rider_claim()`, which links `auth.uid()` to the row (case-insensitive match).
6. **Ops admin** (web dashboard): existing project → run `supabase/migrations/002_admin.sql`, then `003_admin_riders.sql`, then `004_ph_trips_rider_wallet.sql`, `005_flock_start_date.sql`, `006_investment.sql`, `007_personas_farm_book.sql`, `008_commission_rules.sql`, `009_farm_inventory.sql`, `010_vet_weekly_availability.sql` and `011_vet_hours_per_day.sql`. Then make yourself an admin (sign up in the app first so the auth user exists):
   ```sql
   insert into public.admins (user_id) select id from auth.users where email = 'you@example.com' on conflict do nothing;
   ```
   `public.admins` has RLS on and no policies, so it can only be changed from the SQL editor. Admin RPCs (`admin_vendors`, `admin_set_verification`, `admin_riders`, `admin_save_rider`, `admin_set_rider_active`) check `is_admin()`.

## Ops dashboard (`apps/admin`)
```powershell
npm run admin                         # from the repo root → http://localhost:5173
```
- Sign in with an admin's email and password (the same account and password as the app). "Forgot password, or never set one?" emails a 6-digit code, then `SetPassword` (in `SignIn.jsx`) asks for a new password; admins with no password yet are asked to create one; the **Password** button in the top bar changes it. Non-admins see a "Not an ops account" screen.
- **Riders**: add / edit / deactivate riders. The email entered is the rider's login for the rider app (email code); `admin_save_rider` links an existing account immediately, otherwise `rider_claim()` links it at first sign-in. Changing a rider's email unlinks the old login. "Copy instructions" gives a message to send the rider.
- **Vets**: review vet registrations and licences; approve, reject with a reason, or remove from the vet list.
- **Invest**: review KYC and farm badges (documents open via signed URLs), approve/reject offerings, start a funded term (releases money to the farm wallet), pay out returns (optionally final, returning principal), create pools from badge-approved farms.
- Farm verification: pending / approved / rejected tabs, ID document (signed URL from the private `id-docs` bucket), approve, reject with reason (shown to the farm in the app), revoke approval. Updates live via realtime.
- **Live: https://poultry360-ops.vercel.app** (Vercel project `poultry360-ops`, account davidlred). Redeploy: `npm --workspace apps/admin run build`, copy `apps/admin/dist` to a folder named `poultry360-ops`, then `npx vercel deploy --prod --yes` inside it. The Supabase URL/key are baked in at build time from `apps/admin/.env`.
- Other hosts: `npm --workspace apps/admin run build` → host `apps/admin/dist` on any static host (Netlify, Vercel, Cloudflare Pages). Set `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` in the host's environment settings.
- `apps/admin` uses `resolve.dedupe` for React because the Expo apps hoist a different React version into the root `node_modules`.

## Troubleshooting log (issues already hit)
| Symptom | Cause | Fix |
|---|---|---|
| `fetch failed … Failed to connect to localhost/127.0.0.1:80` on Send code | Supabase keys not loaded, so the client falls back to localhost | Start from `apps\customer`; check `.env` name and location; or paste keys into `packages/shared/src/config.js`; restart with `npx expo start -c` |
| `WARN Poultry360: set EXPO_PUBLIC_SUPABASE_URL…` / `Supabase keys missing` | Same as above | Same as above |
| Same warning even though `.env` exists | Keys copied from Supabase's **Next.js** tab (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`); Expo only inlines `EXPO_PUBLIC_*` | Rename to `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` (see `.env.example`), restart with `-c` |
| `Error sending confirmation OTP to provider … Twilio 20003` | Old phone/SMS sign-in with placeholder Twilio creds | Sign-in is now by email code; this error should no longer occur |
| Email arrives with a link, not a code | Email template has no `{{ .Token }}` | Add `{{ .Token }}` to the Magic Link and Confirm signup templates |
| No email arrives / `Email address not authorized` / rate limit | Built-in mailer only sends to team members, a few per hour | Use a team member's email for testing, or configure custom SMTP |
| `Cannot connect to Expo CLI` on phone | Phone and PC on different networks, or firewall | Same Wi-Fi + allow Node.js through Windows Firewall, or use `--tunnel` |
| `CommandError: Install @expo/ngrok@^4.1.0 and try again` | Fresh global install not on PATH yet | Open a new terminal; or `npm install @expo/ngrok@^4.1.0 --save-dev` in apps/customer |
| Farm Hub entries (flocks, feed, output, cost, mortality) not reaching Supabase | Old sync queue: stuck "offline" after one failed request, dropped entries saved mid-sync, and `health_records` rejected for unknown columns | Fixed in `lib/offlineQueue.js`; install the rebuilt APK (queued entries on the phone are kept and uploaded) |
| After choosing a role (or finishing the business form) the app stays on the same screen and seems to ask for another role | `Role`, `Business` and `VetApply` are registered in both the onboarding group and the main group; React Navigation keeps the current route when its name still exists, so it never moved to `Tabs` | `Stack.Navigator` in `navigation/index.js` has `key={needsRole ? 'onboarding' : 'app'}` so the main group starts fresh at `Tabs`. Keep that key |
| App closes when switching role (e.g. Profile → Vet desk), then opens in the new role | `navigate('Tabs')` pushed a second `Tabs` (React Navigation 7 pushes), so two vet desks mounted and both called `supabase.channel('vet-desk')`; supabase-js returns the existing channel for a repeated name and throws `cannot add postgres_changes callbacks … after subscribe()`, which closes a release build | Use `navigation.popTo('Tabs')` to go home and `liveChannel(name)` for every realtime channel. An `ErrorBoundary` now wraps both apps |
| SQL `syntax error at or near "supabase"` | Pasted the file path instead of its contents | Paste the file contents |
| SQL `relation "profiles" already exists` | Partial previous run | Run reset.sql, then schema.sql |

## Architecture rules (keep these)
- **All business rules live in Postgres RPCs** (`security definer`). Clients never update money, status or stock directly. Key RPCs:
  - Onboarding: `set_roles`, `set_active_role`, `submit_vendor_application`, `dev_set_verification` (DEV ONLY)
  - Wallet: `wallet_topup` (simulated), `add_bank`, `request_withdrawal_code` (returns code in dev), `wallet_withdraw`
  - Orders: `place_order(address_id, items jsonb, method, ref)` splits the cart into **one sub_order per vendor**, checks coverage + stock with row locks, debits the wallet, and sets a 24h SLA
  - Vendor: `vendor_respond(sub, accept, reason)` (decline → refund), `vendor_mark_ready` → `assign_rider`
  - Rider: `rider_claim`, `rider_set_status`, `rider_ping`, `rider_respond`, `rider_advance(assignment, step)` with steps `arrived_farm → qc_pass|qc_fail → arrived_buyer → delivered` (proof required; pays vendor 90%)
  - Read models: `order_detail`, `buyer_orders`, `vendor_orders`, `rider_current`, `rider_history`
  - Vet: `book_consultation` (wallet or card), `request_onsite`
  - Cron: `expire_overdue` refunds unconfirmed orders after 24h, expires rider offers after 90s, re-dispatches
- Errors are raised as codes (`raise exception 'OUT_OF_COVERAGE'`) and mapped to copy in `friendlyError()` in `shared/src/supabase.js`. Add new codes there.
- **One live assignment per sub-order** is enforced by a partial unique index (`one_active_assignment`).
- **Commission** is 10%, applied at payout. **Delivery fee** is ₦1,250 per vendor/pickup; the **rider earns 80%** of it (₦1,000) into their wallet on each delivered order (`earning` transaction). Riders and vets withdraw like farms (`add_bank` / `wallet_withdraw` work for all three; `my_payout_account()` returns whichever the user has).
- **Trips**: a rider can carry up to **4 orders from the same farm**. When marking an order ready, the farm chooses "Add to <rider>'s pickup" (`vendor_mark_ready(p_sub, p_rider)`, only for riders heading to / at that farm, from `vendor_pickup_riders()`) or "Request a new rider". `arrived_farm` moves the whole trip to the farm; QC is per order; the rider may `release` an added order; deliveries are per order with their own proof. `rider_current()` returns `{ pickup, orders[] }`.
- **Instant dispatch**: when a rider finishes (delivered / QC fail / release) or goes available, `rider_after_job` → `dispatch_waiting()` offers waiting ready orders immediately (cron is only a backstop). Farm order screens subscribe to `delivery_assignments` so the rider appears live.
- **Via-search orders**: buyers browsing categories/search see "Verified farm near you" instead of the farm name until after checkout (`via_search` flag). Keep the farm identity hidden on those surfaces.
- **Farm Hub is offline-first**: write through `save(table, row)` in `lib/offlineQueue.js`. Never call supabase directly for flocks/farm_logs/vaccinations/health_records/farm_inventory. IDs are client-generated UUIDs; the server resolves conflicts last-write-wins on `updated_at`; the mortality > flock size guard is a trigger. Sync rules in `offlineQueue.js` (keep them): one `sync()` at a time (push queue, then pull); entries saved during a sync stay queued; flocks upload before their logs; network/JWT errors are retried every 15s and never mark the app offline (only NetInfo `isConnected === false` does); rejected entries keep an `error` and are retried on next launch or via Retry; queue + cache are stored per user id; `updated_at`/`updated_by` are only sent to tables that have them (not `health_records`); `useFarm().data` hands out **fresh arrays on every change** (screens memoise on them, so reusing the same arrays hides new entries until the screen remounts); a table that fails to load does not block the others.
- **Flock history**: closing a flock only sets `status = 'inactive'`; its logs are never deleted, and **every Farm Hub screen must keep showing closed flocks**. `lib/flockHistory.js` (pure, tested) has `flockSummary()` (lifetime record: birds, losses, feed, output, costs), `series()` (chart bars over any span) and `farmTotals()` (dashboard totals for a period or all time). Farm Hub home lists "Past flocks" and never falls back to the first-flock empty state once any flock exists; `FlockHistoryScreen` lists all closed flocks; a closed flock's page is read-only, charts its whole life and can be reopened; the dashboard has 30 days / 90 days / 12 months / All time and opens on All time when nothing is running. A closed flock's end date is its `updated_at` (or its last entry, if later). The sync queue pages through whole tables (1,000 rows a page) so long histories are not truncated.
- **Vaccination reminders** (`lib/reminders.js`, `expo-notifications`): **local** notifications scheduled on the phone, so they fire with no signal. Each pending vaccination gets one at 9am two days before and one at 7am on the day (`planReminders()` is pure and tested). `VaccinationReminders` in `navigation/index.js` re-syncs whenever the schedule changes (farm accounts only), cancels them on sign-out, and opens the Vaccinations screen when one is tapped. Permission is requested when the farmer schedules a vaccination, never at app start. These are not push notifications: nothing is sent from a server.
- Vet care's **Drugs & vaccines** tile opens the farm's own inventory on that tab (`Inventory` with `{ tab: 'health' }`), which has a "Shop for drugs & vaccines" button to the marketplace.
- **Farm inventory** (`screens/inventory.js`, table `farm_inventory`, synced through the same queue): feed, drugs, vaccines, equipment and other stock with quantity, unit, optional low-stock level and expiry date. `itemAlert()` flags expired / expiring in 30 days / out of stock / running low. Items are soft-removed (`status = removed`) because the queue only upserts. Logging feed used on a flock does **not** deduct from inventory yet.
- **Vaccine & feed chart** (`screens/careguide.js`, data in `lib/careGuide.js`, pure and Node-testable): for **broilers (meat) and layers (eggs) only**, three views: vaccines and routine drugs by age, feed by age (with rough amounts for the flock's bird count), and expected output (weekly weights for broilers, laying curve for layers). Opened from Inventory (Drugs & vaccines and Feed tabs) and from Vaccinations. Ages are days since `start_date` (day 0), the same count Farm Hub shows. With a flock picked, rows show real dates and status, and "Add N vaccinations to schedule" writes the missing future ones through `save('vaccinations', …)` (hatchery vaccines and drugs are not scheduled), so the existing reminders fire. The vaccine view must show `GUIDE_COPY` (confirm with your vet), and the chart must not recommend routine antibiotics. **Keep the wording terse**: what to give, when and how. No background text such as where vaccines or feeds are made or sold, and no brand lists (the founder asked for these to be removed).
- **Symptom checker** output must always be framed as "preliminary triage, not a diagnosis".
- RLS is on for every table. If a query returns empty unexpectedly, check policies before changing client code.
- Storage buckets: `listing-photos` (public), `proofs` (public), `id-docs` (private), `symptom-photos` (private). Paths must start with `<auth.uid()>/`.

## Sign-up personas
- **RoleScreen never disables Continue silently**: it stays tappable and states what is missing (no option ticked, no name, no business name) and marks the field. Buyer-only is a complete registration.
- **Roles** in `profiles.roles`: `buyer`, `vendor` (farm), `supplier`, `vet`, `investor`. RoleScreen offers all five; `vet` and the seller roles are set up one at a time (each has its own verification form).
- **Buyer type**: `profiles.buyer_type` is `individual` or `business` (+ `buyer_business_name`), set with `set_buyer_type`. Missing means individual. It decides the credit threshold below.
- **Supplier type**: `vendor_profiles.supplier_type` is `feed`, `equipment` or `medicine`, passed as `p_supplier_type` to `submit_vendor_application`.
- **Vets** register with `submit_vet_application` (profile + licence photo in `id-docs`). The row in `vets` gets `user_id`, `status = pending`, `verified = false`; farmers only see `verified` vets. Ops approve in the dashboard (**Vets** section, `admin_set_vet`). The `vet` role is added on submit. An account that already has another role stays in that role after applying (the desk is under Profile → Vet desk); only a vet-only account lands on the desk. `active_role = 'vet'` swaps the tabs for `VetDeskScreen`, which is then the root screen, so it handles Android back itself (`homeRole()` in AuthContext gives the role to return to) and shows a "Back to …" button. Never leave a role-switch screen without a way back. `VetDeskScreen` (`screens/vetdesk.js`): bookings, time slots (`vet_add_slot` / `vet_remove_slot`), on-site requests (`vet_respond_onsite` proposes a time, the farmer confirms), completing a consult with a summary (`vet_complete` writes it to the flock's `health_records`), and fee/bio edits (`vet_update_profile`). `vet_desk()` is the read model. **Vet pay**: Poultry360 keeps 10% of the consult fee; the vet gets 90% into their wallet when they complete the consult (`payout` transaction, label `Consult fee · …`). On-site visits have no in-app fee, so they pay nothing through the app. Vets withdraw from the vet desk using the shared Withdraw/Bank screens.

- **Vet weekly availability** (migrations 010–011): the app calls `vet_set_weekly(p_windows, p_slot_minutes)` with `[{ weekday, start, end }]`, so **each day has its own hours** (the consult length is shared). `vet_desk().availability` is `{ slot_minutes, windows: [{ weekday, start, end }] }` or null. The older `vet_set_availability(p_days, p_start, p_end, p_slot_minutes)` (same hours every day) still exists but is unused. Both store one window per weekday in `vet_availability` (weekday 0 = Sunday, like Postgres `dow` and JS `getDay()`; times are Nigerian time) and opens bookable `vet_slots` (`source = 'schedule'`) for the next 28 days. `vet_refresh_slots(p_vet)` tops them up; it is called when the vet opens the desk and when a farmer opens that vet's page, so no cron is needed. Changing or clearing the schedule replaces only unbooked schedule slots: booked slots and one-off (`manual`) slots are never touched. Removing one schedule slot records it in `vet_slot_exceptions` so the top-up doesn't reopen it. An empty `p_days` turns the schedule off.

## Farm Book (selling on credit)
Screens in `screens/farmbook.js`; entry from Farm Hub. Tables `credit_customers` and `credit_entries`; all writes through RPCs.
- **Who can get credit**: an app buyer qualifies with a farm after **delivered** purchases from *that same farm* of ₦50,000 (individual) or ₦300,000 (business): `credit_threshold()`, enforced in `farm_book_allow_buyer(p_buyer, p_limit)`. The farm chooses who to allow and sets a limit; it can change the limit or block (`farm_book_update_customer`).
- **Pay later at checkout** (`place_order` with `p_method = 'credit'`): one farm per order (`CREDIT_ONE_FARM`), goods total must fit the remaining limit (`CREDIT_LIMIT`). The buyer pays **only the delivery fee now** from the wallet (it pays the rider and the platform); the goods amount becomes a `pending` entry linked to the sub-order (`sub_orders.on_credit`, due in 14 days). The farm is **not** paid at delivery for a credit order. A refunded/declined credit order returns only the delivery fee and cancels the entry.
- **Settling**: the buyer pays in the app (`credit_pay`: buyer wallet debited, farm gets 90% for order entries, the usual commission), or the farm uploads a receipt (`farm_book_settle`, receipt required, stored in `id-docs`). **Commission rule: for a sale made in the app, the 10% is collected only when the money is paid back, by either route.** Paid in the app: it comes out of what the farm receives. Paid by receipt: it is debited from the farm wallet at that moment (`COMMISSION_FUNDS` if the wallet is short; the entry stays pending and the farm tops up).
- **People not on the app**: `farm_book_log_credit` writes the sale down (name, phone, what they took, amount, optional due date) as payment pending; uploading the receipt completes it, with **no commission** (the sale did not happen in the app); `farm_book_cancel` removes a hand-written mistake.
- **Read models**: `farm_book()` (totals, customers, entries, eligible buyers with progress), `my_credit()` and `credit_available(p_vendor)` for buyers (`MyCreditScreen`, checkout).
- The farm carries the credit risk; Poultry360 does not guarantee credit sales. This is trade credit between a farm and its customer, not lending by the platform.

## Investment module (PRD §12, Phase 4): TEST-ONLY
> **Legal:** raising money from the public is regulated in Nigeria (SEC crowdfunding rules). Everything here is simulated money behind `INVEST_ENABLED` in `apps/customer/src/lib/roi.js`. Do not connect real payments before product and legal sign off. Excluded by the PRD: lending, credit scoring, BNPL.

- **Roles and gates**: `investor` is a role (added from RoleScreen or on KYC submit). **Approved KYC is a hard gate** before the first investment (server `KYC_REQUIRED` plus a client redirect; never a dismissible warning). A farm needs marketplace `verification_status = approved` **and** `investment_badge = approved` to raise. The `vendor_guard_columns` trigger stops app users changing their own verification or badge (a column-level REVOKE does nothing while the table-level UPDATE grant exists).
- **Lifecycle**: offering/pool `draft → pending_review → open → funded → active → matured`; side exits `open → refunded` (missed target at `closes_at`) and `→ suspended` (farm loses verification or badge). Investment: `active → matured | refunded`.
- **Return definition (keep consistent everywhere)**: `projected_roi_pct` is the **total projected return over the whole term**, as a % of principal. Annualised is secondary text only. Every projected number shows `ESTIMATE_COPY` directly under it, never hidden or in a tooltip.
- **Money flow** (existing `wallets` / `transactions`): `invest` debits the investor (`investment`) → ops activates a funded raise and the farm wallet is credited (`investment_funding`; pools split by `allocation_pct`) → ops distributes: farm wallet debited, investors credited pro rata (`investment_return`; the final payout also returns principal and matures the investment) → a missed target refunds everyone (`investment_refund`). The farm wallet must hold the payout or it fails with `FARM_INSUFFICIENT` and moves nothing.
- **RPCs**: `submit_kyc`, `apply_investment_badge`, `save_offering`, `submit_offering`, `invest`, `investor_count`, `my_portfolio` (totals and items come from one CTE so they always reconcile; never recompute totals on the client). Internal, revoked from clients: `activate_investment`, `distribute_returns`, `refund_investments`, `investment_housekeeping`, `snapshot_roi`, `snapshot_roi_for`. Ops (all check `is_admin()`): `admin_invest_overview`, `admin_set_kyc`, `admin_set_badge`, `admin_review_offering`, `admin_activate_investment`, `admin_distribute_returns`, `admin_create_pool`. DEV ONLY: `dev_set_kyc`, `dev_set_badge`, `dev_review_offering`.
- **Client**: `screens/invest.js` (InvestHome, Kyc, Offering, Pools, Pool, RoiCalc, InvestAmount, InvestSuccess, Portfolio, InvestmentDetail, TxDetail), `screens/raise.js` (RaiseHome, Badge, OfferingForm), `lib/roi.js` (pure maths + the flag), `lib/exportCsv.js` (wallet CSV through the share sheet), `lib/analytics.js` (`track()`, console only). Buyer tabs gain **Invest** for investors; everyone else sees an entry card on Home; vendor Home has a **Raise funds** tile. TopUp accepts `amount` and `returnTo`, so the invest flow keeps its amount.
- **Approvals on real phones** happen in the ops dashboard (Invest section). The `__DEV__` Approve buttons only exist in Expo Go, not in release APKs.
- **Storage**: KYC and badge documents go to private `id-docs`; offering photos go to public `listing-photos`.
- **Cron** (optional, needs pg_cron): schedule `investment_housekeeping()` every 15 minutes (job `p360-invest-close`) and `snapshot_roi()` monthly (job `p360-roi-monthly`). The exact `cron.schedule` lines are at the bottom of `006_investment.sql`.
- **MVP defaults that are still open questions** (product + legal): a missed target is a full refund; farm underperformance is not automated (ops pays less and projected vs actual is shown honestly); investors are not notified on suspension; there is no platform fee on investments.
- **Before launch**: drop the three `dev_*` functions and their `__DEV__` buttons; integrate a real KYC provider (BVN/NIN) and keep references, not raw numbers; legal review and licence; a risk disclosure screen at first invest; push notifications for KYC decisions, funding reached, distributions and suspensions.
- **Tested with**: the PRD test plan run against the full `schema.sql` in an in-process Postgres (PGlite): gates, limits, pro-rata payouts, refunds, suspension, pools, and wallet totals balancing at every step.

## Design system (refreshed Oct 2026; replaces the old cream / yolk "Sunrise / Ember" boards)
The founder asked for the old look to go because it read as AI-generated. Do not bring back: the cream background, yellow primary, uppercase monospace labels, or a separate display / mono typeface.
- **Light**: off-white bg `#F5F7F5`, white surfaces with a hairline border, near-black ink `#0E1512`, **green primary `#0F8A5F` with white text**, soft green tint `#E1F4EB` for selected states.
- **Dark**: near-black bg `#0C0D0D`, surfaces `#161818`, **bright green primary `#2DCB8C` with dark text** (the founder asked for green, not orange, in dark mode too), teal money cards `#15322D`.
- Token names are historical (`theme.js`): `yolk` = primary action colour, `ember` = highlight (focus ring, selected day, live dot), `onyolk` / `onember` = text on those fills, `navact` / `navactink` = tinted selected state, `seg` = segmented-control thumb. Inside a `Hearth` card use `hink`, `hmute`, `hacc` (accent) and `herr`; the normal accents are too dark there.
- Use `useTheme().c` tokens and **never hard-code colours** in screens (except the rider offer screen, which is intentionally always dark and uses the dark palette's values).
- **One typeface: Hanken Grotesk.** `fonts.display` is the 800 weight for headings; `fonts.mono` is the bold weight used for money, codes and timers (the `mono` / `monoLg` text variants add tabular figures). The `label` variant is small, semibold, sentence case: never uppercase. Android needs a separate family name per weight; use `fonts.*` from theme.js.
- "Hearth" cards (dark green in light mode, teal in dark, soft glow) are reserved for money and live status.
- Copy is short and plain. No explanatory filler under headings.
- Tap targets ≥ 44dp. Primary CTA is pill-shaped, 56dp, in the primary colour.
- **Large text**: every text component caps font scaling at `MAX_FONT_SCALE` (1.3) from `ui.js`; pass it to any raw `<Text>`/`<TextInput>` you add. Tile grids use `flexBasis: '45%'` + `flexGrow: 1` + `minHeight` (never a fixed % width with a pixel gap, or a fixed height), so two tiles always fit per row and grow with the text.
- UI kit exports from `ui.js`: `Screen, AppBar, Txt (variants: display,h1,h2,body,strong,bold,small,label,mono,monoLg), Button (primary,dark,hearth,outline,ghost,danger), Card, Hearth, Chip, ChipRow, Input, Banner (ok,warn,err,info), Pill, Segmented, Row, Group, Empty, Steps, OtpBoxes, Toggle, Stars, Sheet, DateInput, Skeleton, Loading, Stat, PhotoBox, Icon (MaterialCommunityIcons), useTick`.
- Icons: `@expo/vector-icons` MaterialCommunityIcons names.
- **App icons**: `node scripts/make-icons.js` draws the egg mark into `apps/<app>/assets/icon.png` and `adaptive-icon.png` (customer: white egg on green; rider: green egg on near-black). After changing them, re-run `npx expo prebuild -p android --no-install` in the build copy so the launcher icons are regenerated.
- **Dates**: every date field uses `DateInput` from `ui.js` (a calendar in a Sheet, pure JS, no native module). `value` / `onChange` are `'YYYY-MM-DD'` strings in local time; `min` / `max` grey out days; `clearable` adds "No date" for optional fields. Tapping the month title opens a year list. Never add a typed date text field.

## Simulated or dev-only (must change before launch)
- `lib/payments.js` and `wallet_topup`: replace with the Paystack SDK plus a **webhook Edge Function** that credits wallets server-side.
- `request_withdrawal_code` returns the OTP and the apps show it as "Test mode · code …" (also in release APKs): send it by email/SMS from an Edge Function, return null, and remove the banner.
- `add_bank` accepts any 10-digit NUBAN: call Paystack Resolve Account and match the name.
- `dev_set_verification` plus the Approve/Reject buttons on PendingScreen (`__DEV__` only): **drop before launch**; approve vendors from the ops dashboard (`apps/admin`).
- `lib/triage.js` is rule-based; any ML replacement must stay "triage, not diagnosis".
- Video consults open a Jitsi URL. There is no vet-side app yet.

## Not built yet (backlog)
1. Ops web console (`apps/admin`): vendor approval and rider management are built; manual dispatch and dispute resolution are not
2. Push notifications (server-sent) for new orders, rider offers and status changes. Vaccination reminders are already done as local notifications
3. Background rider location (expo-task-manager); currently foreground only
4. Biometric/PIN login for returning users
5. Re-routing a sub-order to another farm after a QC fail or decline (currently refunds)
6. Investment module: real KYC provider, notifications, legal sign-off (see Investment module section)
6b. Linking listings to flocks so Farm Hub margins can be calculated per flock
7. Refunding the farmer if a vet never completes a paid consult (the fee is held until completion)

## Manual end-to-end test
0. Use three different email addresses you can receive mail at (with the built-in mailer they must belong to Supabase team members; otherwise configure custom SMTP).
1. Vendor (email 2): choose *Sell as a farm* → business details + ID → on Pending tap **Approve** (dev) → add and publish a listing.
2. Buyer (email 1): browse → add to cart → checkout with a **GRA** (Port Harcourt) address → pay with the *Verve 4081* test card (other cards simulate failures).
3. Vendor: Orders → Accept → tick the checklist → **Mark ready**.
4. Rider (email 3, rider row created with that email): rider app → **Go available** → accept within 90s → *I'm at the farm* → pass QC → *I've arrived* → photo → **Mark delivered**.
5. Buyer: tracking updates live → rate the product + delivery. The vendor wallet shows 90% of the item total.

## Conventions
- **Realtime**: always `liveChannel('name')` from `@p360/shared`, never `supabase.channel('name')`. Channel names must be unique per subscriber or the second screen throws and the app closes.
- **Navigation (React Navigation 7)**: `navigate('X')` **pushes** a new `X` even if one is already in the stack. To return to a screen that is already below (home, `Tabs`, the rider's `Home`), use `navigation.popTo('X')` (it accepts params too).
- Both apps are wrapped in `ErrorBoundary` (from `ui.js`), which shows a "Something went wrong · Try again" screen instead of the app closing. It is a safety net, not a substitute for handling errors.
- JavaScript only, functional components, hooks. No TypeScript, no Redux.
- Keep screens grouped by domain in `src/screens/*.js`. Shared primitives go in `packages/shared`.
- Never put the service_role key in the app or the repo. `.env` is gitignored.
- When adding a DB change, edit `schema.sql` **and** give a standalone migration snippet so an existing project can apply it without a reset.
