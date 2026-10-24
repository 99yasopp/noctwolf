// The web build never serves the guest page — it IS the guest page.
// Metro resolves this file instead of guestPage.native.ts on web, which
// keeps the 3 MB string out of the browser bundle.
export const GUEST_PAGE_HTML = '';
