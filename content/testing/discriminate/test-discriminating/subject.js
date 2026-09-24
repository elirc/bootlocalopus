/**
 * Turns a title into a URL slug: "Café au lait, s'il vous plaît!" -> "cafe-au-lait-s-il-vous-plait".
 */
export function slugify(title, { maxLength = 60 } = {}) {
  const slug = title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // é -> e + a combining accent; drop the accent
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')     // every run of other characters becomes one dash
    .replace(/^-+|-+$/g, '');         // no dash at either end

  if (slug.length <= maxLength) return slug;

  // Cut at the last word boundary that fits. A dash exactly at maxLength means
  // the first maxLength characters end on a whole word.
  const lastDash = slug.slice(0, maxLength + 1).lastIndexOf('-');
  return lastDash > 0 ? slug.slice(0, lastDash) : slug.slice(0, maxLength);
}
