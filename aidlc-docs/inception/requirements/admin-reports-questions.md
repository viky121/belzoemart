# Admin Reports: Questions
Your request: build the Admin 11 Reports section in the admin panel (screenshot of the spec): Basic sales, Purchasing, Order, User, Product and P/L reports, plus the recommended Category, Brand, Best-seller and Payment reports.

What I found in the current system (checked in the code):
- The Reports page today has only three blocks: Sales by status, GST summary and a low-stock CSV. Reports are visible to `order_manager` and `marketing` (and `super_admin`).
- All money is stored in paise. Orders keep the item price, quantity and GST rate as they were at order time.
- **There is no purchasing data at all.** No supplier, no purchase bill, no stock-in entry. Nothing in the app records a purchase today.
- **Cost of goods is thin.** Each variant has an optional `costPrice`, but an order item does not keep the cost it was sold at. So P/L can only use today's cost price for old orders.
- There is no separate refund record. Refund amounts are only known through payment status and return requests.
- The CSV links on the page are plain links, which cannot carry the admin login. New exports will download through the logged-in session instead.

The questions below decide the scope. Fill the letter after each `[Answer]:` tag.
Shortcut: if you are fine with my recommended choice for everything, write `A sab` in Q6 and leave the rest empty.

## Question Q1
Purchasing report: where should the purchase data come from?
A) Add a small "Record purchase" form (supplier name, bill number, date, items with quantity and unit cost). Saving it adds the stock and updates the cost price. The Purchasing report reads from it (recommended: otherwise the report stays empty forever)
B) No new form. Report only the stock increases that already happen (admin stock edits and bulk sheets), valued at the current cost price. Less accurate
C) Skip the Purchasing report for now
X) Other (please describe after [Answer]: tag below)
[Answer]:C

## Question Q2
P/L report: which cost should be used for the items sold?
A) From now on, save the cost price on each order item when the order is placed, so future P/L is exact. Older orders use today's cost price and are marked "estimated". Items with no cost price are listed as "cost missing" (recommended)
B) Use only the current cost price for every order (nothing saved on the order). Old and new orders can show a wrong profit if the cost changed later
X) Other (please describe after [Answer]: tag below)
[Answer]:A

## Question Q3
P/L report: how far should it go?
A) Gross profit: sales (without GST) minus cost of goods minus refunds and discounts. No expenses, because the system has none (recommended)
B) Gross profit, plus an "Expenses" entry (rent, salary, packing, ads) so the report shows net profit
X) Other (please describe after [Answer]: tag below)
[Answer]:A

## Question Q4
Who can open the reports?
A) Sales, Order, User, Product, Category, Brand, Best-seller and Payment reports: `order_manager`, `marketing` and `super_admin` as today. Purchasing and P/L (they show cost and profit): `super_admin` only (recommended)
B) Everyone who can see Reports today sees all of them, including cost and profit
X) Other (please describe after [Answer]: tag below)
[Answer]:A

## Question Q5
How should the Reports page look and work?
A) One Reports page with a tab for each report, a shared date filter (Today, 7 days, 30 days, This month, Custom), a summary row with totals, a table, a bar or line chart where it helps, and a Download CSV button on every report (recommended)
B) Same as A, but tables only, no charts
X) Other (please describe after [Answer]: tag below)
[Answer]:A

## Question Q6
Shortcut for the whole file.
Write `A sab` to accept my recommended choice (A) for Q1 to Q5. Leave empty if you answered each one above.
[Answer]:
