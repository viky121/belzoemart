# Search Terms Report: Requirements

Answers (search-terms-questions.md): Q1 to Q7 all A ("A sab", the recommended choice).

## What will be built

1. **Search log.** Every real search is saved: Enter or the search button, a tapped suggestion or recent search, a product picked from the website search drop-down, or opening the search results page with a keyword. Half-typed words are not saved (Q1 A).
2. **What is saved** (Q3 A): the keyword as typed, a cleaned lowercase version (extra spaces removed) used for counting, date and time, website or app, how many products were found, the product found first, and the customer if logged in (guests are saved without a customer).
3. **Report "Search terms"** (new tab in Reports, same page, date filter, cards, chart, table and CSV as the other reports):
   - Cards: searches, different keywords, searches with no result, website searches, app searches.
   - Chart: the 10 most searched keywords.
   - Table "Top keywords" (Q2 A): keyword, times searched, website, app, products found, and the product it finds first.
   - Table "Most searched products" (Q2 A): a product counts each time it is the first result of a search.
   - Table "Not found" (Q5 A): keywords that found no product, with the number of searches and the last time.
   - Main table, date wise (Q4 A): one row per keyword per India day, newest day first: date, keyword, times searched, website, app, products found, no-result searches. Paged, 50 rows a page. CSV download gives this table.
4. **Keeping data** (Q6 A): searches older than 12 months are deleted automatically, at most once a day.
5. **Access** (Q7 A): `reports.view` to open, `reports.export` for CSV. No customer name or phone appears in the report.

## Rules

- A keyword needs at least 2 characters and is cut at 100 characters. The same person searching the same words from the same place within 30 seconds is saved once (page reload, back button).
- Saving a search never slows or breaks the search itself: the website and app send it as a separate small request after the customer searches, and a failure is ignored.
- The log endpoint is public (guests search too). It is limited to 30 requests per minute per address, accepts only a keyword and "web" or "app", and never returns data.
- Days are India days (IST), as in the other reports.

## Not included

- Counting which product the customer taps after searching (Q2 option C was not chosen).
- Showing who searched (Q7 option B was not chosen).
