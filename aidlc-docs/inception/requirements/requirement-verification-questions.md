# Requirements Clarification Questions — E-Commerce Portal

Your master build prompt is comprehensive but Section 0 (Project Variables) was left with placeholders,
and the full scope (web storefront + Android native app + admin panel + seller panel + full logistics/
payment/ERP integrations + Play Store release) is a multi-month, multi-team effort. Before I generate the
requirements document, I need you to fill in the placeholders and make some scope/priority decisions so
the plan I build is realistic and actually shippable.

Please fill every [Answer]: tag below. Pick the closest letter option, or use "Other" to describe your own
answer.

## Question 1
Business / Brand name?

A) I'll provide it below (type it in Other)

X) Other (please describe after [Answer]: tag below)

[Answer]: Belzo eMart

## Question 2
Business type?

A) B2C (single brand selling directly to consumers)

B) D2C (direct-to-consumer, own manufacturing/private label)

C) B2B (business buyers, bulk pricing/credit terms)

D) Multi-vendor marketplace (many sellers on one platform)

X) Other (please describe after [Answer]: tag below)

[Answer]:A

## Question 3
Product category?

A) Apparel / fashion

B) Grocery / FMCG

C) Electronics

D) Handicraft / home decor

X) Other (please describe after [Answer]: tag below)

[Answer]: A,B,C,D All 

## Question 4
Target geography?

A) Pan-India

B) Specific states/region only (name them in Other)

C) India + international shipping

X) Other (please describe after [Answer]: tag below)

[Answer]:A

## Question 5
Languages required at launch?

A) English only

B) English + Hindi

C) English + Hindi + other regional language(s) (name them in Other)

X) Other (please describe after [Answer]: tag below)

[Answer]:B

## Question 6
Currency?

A) INR only

X) Other (please describe after [Answer]: tag below)

[Answer]:A

## Question 7
Tech stack preference for web + backend?

A) Next.js (React) + Node.js (Express/NestJS) + PostgreSQL — modern JS full stack, good for custom builds

B) Laravel (PHP) + MySQL — fast to build, huge ecosystem, matches XAMPP/PHP environments

C) Magento 2 (PHP) — commerce-specific platform, heavier but batteries-included for catalogue/checkout

D) MERN (React + Node + MongoDB) — document DB, flexible schema

X) Other (please describe after [Answer]: tag below)

[Answer]:A

## Question 8
Mobile app approach?

A) Android native (Kotlin) — best performance/Play Store fit, but separate codebase from web

B) React Native — shares logic/patterns with a React web stack, single JS codebase for future iOS too

C) Flutter — single codebase, strong performance, Dart language

D) Skip native app for now — ship a PWA (installable, works like an app, no separate codebase)

X) Other (please describe after [Answer]: tag below)

[Answer]:C

## Question 9
Payment gateway?

A) Razorpay — most common for Indian D2C/B2C, strong docs, supports UPI/cards/wallets/EMI

B) PayU

C) CCAvenue

D) PhonePe PG

X) Other (please describe after [Answer]: tag below)

[Answer]: A

## Question 10
Logistics / shipping partner?

A) ShipRocket (aggregator — routes to Delhivery/BlueDart/etc., single integration for multiple couriers)

B) Delhivery direct

C) Blue Dart direct

D) Self-delivery / no courier API integration for MVP (manual dispatch)

X) Other (please describe after [Answer]: tag below)

[Answer]:A

## Question 11
Hosting environment?

A) AWS

B) Azure

C) GCP

D) Local/shared hosting for MVP (e.g. current XAMPP setup), cloud migration later

X) Other (please describe after [Answer]: tag below)

[Answer]:A

## Question 12
Budget & timeline constraints (affects how much scope is realistic)?

A) Tight budget / short timeline — MVP only, single most critical flow first

B) Moderate — phased delivery over several sprints is acceptable

C) No hard constraint communicated — build the most complete version reasonable in this environment

X) Other (please describe after [Answer]: tag below)

[Answer]:A

## Question 13
The full master prompt describes web storefront + Android app + admin panel + seller/vendor panel +
courier/SMS/WhatsApp/ERP integrations + Play Store release — this is a large multi-month build. How do
you want to phase it?

A) Phase 1 = Web storefront + Admin panel only (core catalogue, cart, checkout, orders, COD/one payment
gateway). Mobile app and multi-vendor seller panel come in later phases.

B) Phase 1 = Web storefront + Admin panel + Android app (customer-facing), no seller panel yet.

C) Build everything in scope now, including multi-vendor seller panel, in one continuous build (accept
longer timeline and reduced depth per module).

D) I only need the web storefront + admin panel, no mobile app at all (drop Android requirement).

X) Other (please describe after [Answer]: tag below)

[Answer]:A

## Question 14
Is this single-vendor or multi-vendor? (Determines whether Seller/Vendor Panel section 4 applies)

A) Single vendor / single seller (Section 4 Seller Panel not needed)

B) Multi-vendor marketplace (Section 4 Seller Panel required)

X) Other (please describe after [Answer]: tag below)

[Answer]:A

## Question 15
For third-party integrations (SMS/WhatsApp Business API/courier APIs/ERP sync) — do you already have
accounts/API keys, or should the build use mock/stub integrations for now that can be swapped for real
credentials later?

A) I have accounts and will provide API keys/credentials when we reach that stage

B) No accounts yet — build against mock/stub services with clear integration points for later

C) Skip these integrations entirely for now (no SMS/WhatsApp/ERP)

X) Other (please describe after [Answer]: tag below)

[Answer]:A

## Question: Security Extensions
Should security extension rules be enforced for this project?

A) Yes — enforce all SECURITY rules as blocking constraints (recommended for production-grade
applications; relevant given this handles payments and PII)

B) No — skip all SECURITY rules (suitable for PoCs, prototypes, and experimental projects)

X) Other (please describe after [Answer]: tag below)

[Answer]:A

## Question: Resiliency Extensions
Should the resiliency baseline be applied to this project?

**What this extension is.** Enabling it applies a set of directional, design-time best practices for
building resilient systems, derived from the AWS Well-Architected Framework (Reliability Pillar) and
resilience-review guidance. It steers requirements, design, and code toward fault tolerance, high
availability, observability, and recoverability.

**What this extension is NOT.** Enabling it does not make your workload production-ready, nor does it
certify or guarantee any availability, RTO, or RPO target. It is a starting point, not a substitute for a
formal AWS Well-Architected Review.

A) Yes — apply the resiliency baseline as directional best practices (recommended given order/payment
critical paths)

B) No — skip the resiliency baseline (suitable for MVP/prototype pace)

X) Other (please describe after [Answer]: tag below)

[Answer]:A

## Question: Property-Based Testing Extension
Should property-based testing (PBT) rules be enforced for this project?

A) Yes — enforce all PBT rules as blocking constraints (recommended given business logic like pricing,
tax, coupon, and inventory calculations)

B) Partial — enforce PBT rules only for pure functions and serialization round-trips (e.g. price/tax
calculators)

C) No — skip all PBT rules (rely on standard unit/integration tests only)

X) Other (please describe after [Answer]: tag below)

[Answer]:A
