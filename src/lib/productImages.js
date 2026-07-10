// Given the ProductImage rows currently stored for a product and the set of
// image ids the editor still keeps (existing rows kept + rows just created),
// return the ids of rows that must be deleted. Without this reconciliation a
// photo removed in the admin grid is never deleted server-side, so it reappears
// on reload and keeps showing on the storefront.
export function imagesToDelete(dbImages, keptIds) {
  const kept = keptIds instanceof Set ? keptIds : new Set(keptIds || []);
  return (dbImages || [])
    .filter((img) => img && img.id != null && !kept.has(img.id))
    .map((img) => img.id);
}
