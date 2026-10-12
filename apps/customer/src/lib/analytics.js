// Single place analytics events go through. Console only for now; swap for a real provider later.
export function track(event, props = {}) {
  console.log('[track]', event, props);
}
