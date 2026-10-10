/**
 * Admin-only entry to the shared bulk-sheet module (AC-15).
 *
 * Web code must import bulk-sheet VALUES from here, not from '@belzo/shared'.
 * webpack tracks used exports globally (one client runtime), so a value used
 * by an admin page through the '@belzo/shared' index re-export activates that
 * `export *` edge for every chunk holding the index, including the shared
 * storefront chunk (measured: +3 kB First Load JS on `/` and `/product/[slug]`).
 * Importing the module file directly keeps those index exports unused, so
 * bulk-sheet (side-effect free, see its header) stays in admin chunks only.
 * Type-only imports from '@belzo/shared' are erased and are fine.
 */
export * from '../../../../packages/shared/src/bulk-sheet';
