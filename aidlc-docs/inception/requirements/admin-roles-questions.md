# Admin Roles and Access: Questions
Your request: an admin module where you can add staff types (Manager, Accountant, Admin, and others) and choose exactly what each type may open and do.

What I found in the code (checked, not guessed):
- Today there are 5 fixed roles in the code: `super_admin`, `catalogue_manager`, `order_manager`, `marketing`, `support`. Every admin API route is locked to one of those names. You cannot add a new type without a code change.
- The database already has tables for roles and permissions, but nothing uses them for access.
- There is **no screen at all** to see or manage staff users. A staff user can only be created through the API.
- The admin sidebar shows every menu item to everyone, and the top bar always says "Admin". The page does not know who is logged in or what they may do.
- A staff member's role is read when they log in and then copied into a 15 minute token. Disabling a staff member is only checked at login, not afterwards.
- Some pages call APIs that belong to another role (for example the customers page calls a report API), so a narrow role would see errors today.

What I plan to do, no question needed:
- A permission list for the whole admin panel (see the table below), stored in the database.
- Roles = a name plus a ticked list of permissions. You make a role on a new "Staff and roles" screen and tick what it can do.
- Every admin API route checks the permission on the server. Hiding a menu item is only for looks; the server is what refuses.
- A "who am I" call, so the sidebar can hide what a person cannot use and the top bar shows their name and role.
- A test that fails if any admin route is added without a permission.
- Super Admin always has everything and can never be locked out or deleted by mistake.
- Delivery partners (the delivery staff with their own login) are a separate system and are not part of this.

Proposed permission list (each line is something you can tick):
| Area | Permissions |
|---|---|
| Dashboard | View |
| Products | View, Edit (add, change, delete), Bulk upload and bulk edit |
| Categories and Brands | View, Edit |
| Stock | Adjust stock |
| Orders | View, Manage (change status, cancel, make shipment, invoice) |
| Returns | View, Manage |
| Payments | View |
| Customers | View, Block or unblock |
| Reviews | Moderate |
| Coupons | View, Edit |
| Banners and Pages | Edit |
| Mobile app and Home page design | Edit |
| Media library | Upload, browse |
| Reports | View sales, orders, users, products, categories, brands, best sellers, payments; Download CSV |
| Profit and loss report | View (shows cost and profit) |
| Delivery | Partners and zones; Assign and follow jobs; Delivery settings |
| Serviceability (PIN codes) | Edit |
| Store settings | Edit |
| Payment gateway keys, SMS gateway | Edit (very sensitive) |
| Audit log | View |
| Staff and roles | Manage (create staff, make roles) |

The questions below decide the rest. Fill the letter after each `[Answer]:` tag.
Shortcut: if you are fine with my recommended choice for everything, write `A sab` in Q8 and leave the rest empty.

## Question Q1
How detailed should the access choices be?
A) Per area, with the levels in the table above (for example Products: View / Edit / Bulk). This is what the table shows (recommended)
B) Simpler: one tick per area (can open it or not)
C) More detailed: every single button gets its own tick
X) Other (please describe after [Answer]: tag below)
[Answer]:A

## Question Q2
What should happen to the 5 existing roles?
A) Keep them as ready-made types that work exactly as they do today, and add three new starters you asked for: Admin, Manager, Accountant. You can edit any of them except Super Admin, and add your own types (recommended)
B) Remove the old 5 and start with an empty list; I make everything from scratch
C) Keep the old 5 locked as they are; new types are separate
X) Other (please describe after [Answer]: tag below)
[Answer]:A

## Question Q3
Can a staff type be allowed to manage other staff and roles (create staff, make roles)?
A) No. Only Super Admin can (recommended: otherwise someone could give themselves more access). "Admin" gets everything except staff and roles, payment gateway keys, SMS gateway keys and the audit log
B) Yes, it is one more tick that Super Admin can give to a type
X) Other (please describe after [Answer]: tag below)
[Answer]:A

## Question Q4
How many types can one staff member have?
A) One type per person. Simple to understand (recommended)
B) Several types per person; they add up
X) Other (please describe after [Answer]: tag below)
[Answer]:A

## Question Q5
Should I also build the screen to manage the staff themselves? (Today there is none.)
A) Yes: list staff, add a staff member with a password and a type, change their type, switch them off or on, reset their password, turn on two-step login (recommended: roles are no use without it)
B) No, only the roles screen; I will add staff through the API
X) Other (please describe after [Answer]: tag below)
[Answer]:A

## Question Q6
When you change a type's access, or switch a staff member off, when should it apply?
A) Straight away, on their next click. The server checks the current access each time (recommended)
B) At their next login or within 15 minutes
X) Other (please describe after [Answer]: tag below)
[Answer]:A

## Question Q7
What should a staff member see in the admin panel?
A) The menu shows only what they can use, the top bar shows their real name and type, and a page they may not open says "You do not have access" instead of an error or a login screen (recommended)
B) Everyone sees the full menu; the server just refuses what they cannot do
X) Other (please describe after [Answer]: tag below)
[Answer]:A

## Question Q8
Shortcut for the whole file.
Write `A sab` to accept my recommended choice (A) for Q1 to Q7. Leave empty if you answered each one above.
[Answer]:
