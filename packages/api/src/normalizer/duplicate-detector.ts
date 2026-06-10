/**
 * Fuzzy duplicate detection for product names.
 * Uses Jaro-Winkler similarity algorithm to identify potential duplicate products.
 *
 * Validates: Requirements 3.1, 3.2
 */

/**
 * A pair of products identified as potential duplicates.
 */
export interface DuplicatePair {
  productAId: string;
  productBId: string;
  similarityScore: number;
}

/**
 * Minimal product representation for duplicate detection.
 */
export interface ProductInput {
  id: string;
  name: string;
}

/**
 * Calculate the Jaro similarity between two strings.
 * Returns a value between 0 (no match) and 1 (exact match).
 */
function jaroSimilarity(s1: string, s2: string): number {
  if (s1 === s2) return 1.0;
  if (s1.length === 0 || s2.length === 0) return 0.0;

  const matchDistance = Math.floor(Math.max(s1.length, s2.length) / 2) - 1;
  if (matchDistance < 0) {
    // Both strings have length 1 but are different
    return 0.0;
  }

  const s1Matches = new Array<boolean>(s1.length).fill(false);
  const s2Matches = new Array<boolean>(s2.length).fill(false);

  let matches = 0;
  let transpositions = 0;

  // Find matching characters
  for (let i = 0; i < s1.length; i++) {
    const start = Math.max(0, i - matchDistance);
    const end = Math.min(i + matchDistance + 1, s2.length);

    for (let j = start; j < end; j++) {
      if (s2Matches[j] || s1[i] !== s2[j]) continue;
      s1Matches[i] = true;
      s2Matches[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0.0;

  // Count transpositions
  let k = 0;
  for (let i = 0; i < s1.length; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }

  return (
    (matches / s1.length + matches / s2.length + (matches - transpositions / 2) / matches) / 3
  );
}

/**
 * Calculate the Jaro-Winkler similarity between two strings.
 * Applies a prefix bonus (up to 4 characters) to the Jaro score.
 * Returns a value between 0 (no match) and 1 (exact match).
 *
 * @param a - First string
 * @param b - Second string
 * @param prefixScale - Scaling factor for prefix bonus (default 0.1, max 0.25)
 */
export function calculateSimilarity(a: string, b: string, prefixScale = 0.1): number {
  // Normalize: lowercase and trim
  const s1 = a.toLowerCase().trim();
  const s2 = b.toLowerCase().trim();

  if (s1 === s2) return 1.0;
  if (s1.length === 0 || s2.length === 0) return 0.0;

  const jaroScore = jaroSimilarity(s1, s2);

  // Calculate common prefix length (up to 4 characters)
  let prefixLength = 0;
  const maxPrefix = Math.min(4, Math.min(s1.length, s2.length));
  for (let i = 0; i < maxPrefix; i++) {
    if (s1[i] === s2[i]) {
      prefixLength++;
    } else {
      break;
    }
  }

  // Clamp prefix scale
  const p = Math.min(prefixScale, 0.25);

  // Jaro-Winkler formula
  return jaroScore + prefixLength * p * (1 - jaroScore);
}

/**
 * Detect potential duplicate products based on name similarity.
 * Compares all pairs of products and returns those above the threshold.
 *
 * @param products - Array of products to compare
 * @param threshold - Minimum similarity score to consider as duplicate (0-1, default 0.85)
 * @returns Array of duplicate pairs with similarity scores, sorted by score descending
 */
export function detectDuplicates(
  products: ProductInput[],
  threshold = 0.85
): DuplicatePair[] {
  const duplicates: DuplicatePair[] = [];

  for (let i = 0; i < products.length; i++) {
    for (let j = i + 1; j < products.length; j++) {
      const score = calculateSimilarity(products[i].name, products[j].name);
      if (score >= threshold) {
        duplicates.push({
          productAId: products[i].id,
          productBId: products[j].id,
          similarityScore: score,
        });
      }
    }
  }

  // Sort by similarity score descending (most similar first)
  duplicates.sort((a, b) => b.similarityScore - a.similarityScore);

  return duplicates;
}
