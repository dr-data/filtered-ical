// Adapted from https://github.com/m31coding/fuzzy-search
export function fuzzySearch(needle: string, haystack: string): boolean {
  const hLen = haystack.length;
  const nLen = needle.length;
  
  if (nLen > hLen) {
    return false;
  }
  if (nLen === hLen) {
    return needle === haystack;
  }
  
  let needleIdx = 0;
  let haystackIdx = 0;
  
  while (needleIdx < nLen && haystackIdx < hLen) {
    if (needle[needleIdx].toLowerCase() === haystack[haystackIdx].toLowerCase()) {
      needleIdx++;
    }
    haystackIdx++;
  }
  
  return needleIdx === nLen;
}