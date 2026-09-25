// A first attempt: preload everything critical, and hope.
export function planResourceHints(pageOrigin, resources) {
  return resources
    .filter((resource) => resource.critical)
    .map((resource) => ({ rel: 'preload', as: resource.type, href: resource.url }));
}
