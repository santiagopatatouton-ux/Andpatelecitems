/**
 * Generates a consistent, Firestore-safe document ID from a catalog path array.
 */
export function pathToDocId(pathArray: string[]): string {
  if (!pathArray || !pathArray.length) return '';
  return pathArray.join('__').replace(/[/\\.]/g, '_');
}
