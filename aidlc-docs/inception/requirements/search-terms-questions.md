# Search Terms Report: Questions

Your request: save what customers type in the search bar (website and mobile app) and add a "Search Terms" section in Reports. It lists all keywords date wise and shows which product is searched the most.

What I found in the current system (checked in the code):

- Nothing is saved today. `GET /search` and `GET /search/autocomplete` just return results.
- The website search bar calls `/search` after every pause in typing (2 letters or more), so typing "sug", "suga", "sugar" would make 3 calls. If I saved every call, the report would be full of half-typed words. The real search is the moment the customer presses Enter / the search button, taps a suggestion, or opens the search results page.
- The mobile app does the same: results load while typing (400 ms pause), and the "real" search is Enter or tapping a suggestion or a recent search.
- Search is open to everyone (no login), so guests can search too.
- Reports already have one page with tabs, a date filter, summary cards, a chart, a table and CSV download. Search Terms will be one more tab built the same way.
- There is no "search" table in the database. A new table is needed (one small migration).

The questions below decide the scope. Fill the letter after each `[Answer]:` tag.

Shortcut: if you are fine with my recommended choice for everything, write `A sab` in Q7 and leave the rest empty.

## Question Q1

What counts as one search?

A) Only a real search: Enter / search button, a tapped suggestion or recent search, or opening the search results page. Half-typed words are not saved (recommended)
B) Every search call, including half-typed words while the customer is typing
X) Other (please describe after [Answer]: tag below)

[Answer]:

## Question Q2

"Which product is searched the most": how should that be worked out?

A) Top keywords: each keyword with how many times it was searched, and next to it the product it finds first (for example "sugar" searched 120 times, top result "Sugar 1 kg"). Also a "Most searched products" list that counts a product each time it appears as the first result of a search (recommended)
B) Top keywords only (no product list)
C) Everything in A, and also count the products customers actually open (tap) from the search results, so you see which product was clicked most after searching. This needs the website and app to send one more small message when a product is tapped from search
X) Other (please describe after [Answer]: tag below)

[Answer]:

## Question Q3

What is saved with each search?

A) The keyword (as typed, and a cleaned lowercase version used for counting), date and time, website or app, how many products were found, and the customer if logged in. Guests are saved without a customer (recommended)
B) The same, but never the customer (fully anonymous)
X) Other (please describe after [Answer]: tag below)

[Answer]:

## Question Q4

How should the "date wise" list look in the report?

A) One row per keyword per day: Date, Keyword, Times searched, Products found, Website / App split. Newest day first (recommended: a long list stays short)
B) One row for every single search with its exact time
C) Both: the default view is A, and a "Show every search" switch shows B
X) Other (please describe after [Answer]: tag below)

[Answer]:

## Question Q5

Searches that found nothing:

A) Show them clearly: a summary card "Searches with no result", a "No result" column, and a separate "Not found" list of keywords with no product so you know what to add to the shop (recommended)
B) No special treatment
X) Other (please describe after [Answer]: tag below)

[Answer]:

## Question Q6

How long should searches be kept?

A) 12 months, older ones are deleted automatically once a day (recommended: keeps the table small)
B) Forever
X) Other (please describe after [Answer]: tag below)

[Answer]:

## Question Q7

Who can open the Search Terms report?

A) Anyone who can open the other reports (`reports.view`), CSV download needs `reports.export` as for the other reports. The report does not show customer names or phone numbers (recommended)
B) Same, but the report also shows the customer name for logged-in searches
C) A new separate permission "Search terms" so the Super Admin can choose who sees it
X) Other (please describe after [Answer]: tag below)

[Answer]:
