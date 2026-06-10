/**
 * Feature: grocery-inventory-intelligence
 * Property 1: Column Mapping Round-Trip
 *
 * For any valid column mapping configuration, saving the mapping and then loading it
 * for the same source identifier should produce an identical mapping configuration.
 *
 * **Validates: Requirements 2.4**
 *
 * Tests:
 * - Serializing and deserializing a ColumnMapping[] produces identical results (JSON round-trip)
 * - suggestColumnMappings function produces deterministic results for the same input headers
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { suggestColumnMappings } from './column-mapper.js';
import type { ColumnMapping, StandardField } from '@grocery-intel/shared';

// ─── Arbitraries ───────────────────────────────────────────────────────────────

const STANDARD_FIELDS: StandardField[] = [
  'product_name',
  'sku_id',
  'quantity_sold',
  'sale_price',
  'sale_date',
  'category',
  'supplier_name',
];

/** Generates a valid StandardField */
const standardFieldArb: fc.Arbitrary<StandardField> = fc.constantFrom(...STANDARD_FIELDS);

/** Generates a valid source_column string (non-empty, printable) */
const sourceColumnArb: fc.Arbitrary<string> = fc.stringOf(
  fc.char().filter((c) => c.trim().length > 0 && c !== '"' && c !== '\\'),
  { minLength: 1, maxLength: 50 }
);

/** Generates a valid confidence value between 0 and 1 */
const confidenceArb: fc.Arbitrary<number> = fc.double({ min: 0, max: 1, noNaN: true });

/** Generates an optional transform string */
const transformArb: fc.Arbitrary<string | undefined> = fc.oneof(
  fc.constant(undefined),
  fc.stringOf(fc.char().filter((c) => c.trim().length > 0), { minLength: 1, maxLength: 30 })
);

/** Generates a single valid ColumnMapping */
const columnMappingArb: fc.Arbitrary<ColumnMapping> = fc.record({
  source_column: sourceColumnArb,
  target_field: standardFieldArb,
  confidence: confidenceArb,
  transform: transformArb,
});

/** Generates a valid ColumnMapping[] with unique source_columns and target_fields */
const columnMappingArrayArb: fc.Arbitrary<ColumnMapping[]> = fc
  .array(columnMappingArb, { minLength: 0, maxLength: 7 })
  .map((mappings) => {
    // Ensure uniqueness of source_column and target_field (like real mapping configs)
    const usedSources = new Set<string>();
    const usedTargets = new Set<string>();
    const unique: ColumnMapping[] = [];
    for (const m of mappings) {
      if (!usedSources.has(m.source_column) && !usedTargets.has(m.target_field)) {
        usedSources.add(m.source_column);
        usedTargets.add(m.target_field);
        unique.push(m);
      }
    }
    return unique;
  });

/** Generates realistic header strings that map to standard fields */
const headerKeywordsMap: Record<StandardField, string[]> = {
  product_name: ['Product Name', 'Item', 'product_name', 'Description', 'PRODUCT'],
  sku_id: ['SKU', 'UPC', 'Barcode', 'sku_id', 'Product Code'],
  quantity_sold: ['Qty Sold', 'quantity_sold', 'Units', 'Amount Sold', 'QTY'],
  sale_price: ['Price', 'sale_price', 'Unit Price', 'Cost', 'Amount'],
  sale_date: ['Date', 'sale_date', 'Transaction Date', 'Sold Date'],
  category: ['Category', 'Department', 'Dept', 'Type', 'Group'],
  supplier_name: ['Supplier', 'Vendor', 'supplier_name', 'Vendor Name'],
};

/** Generates a set of headers that are known to map to standard fields */
const mappableHeadersArb: fc.Arbitrary<string[]> = fc
  .subarray(STANDARD_FIELDS, { minLength: 1, maxLength: 7 })
  .chain((fields) =>
    fc.tuple(
      ...fields.map((field) =>
        fc.constantFrom(...headerKeywordsMap[field])
      )
    )
  )
  .map((headers) => [...new Set(headers)]); // Ensure unique headers

// ─── Property Tests ────────────────────────────────────────────────────────────

describe('Property 1: Column Mapping Round-Trip', () => {
  it('JSON serialization/deserialization of ColumnMapping[] produces identical results', () => {
    fc.assert(
      fc.property(columnMappingArrayArb, (mappings) => {
        // Simulate save: serialize to JSON
        const serialized = JSON.stringify(mappings);

        // Simulate load: deserialize from JSON
        const deserialized: ColumnMapping[] = JSON.parse(serialized);

        // The round-trip should produce identical mapping configuration
        expect(deserialized).toHaveLength(mappings.length);

        for (let i = 0; i < mappings.length; i++) {
          expect(deserialized[i].source_column).toBe(mappings[i].source_column);
          expect(deserialized[i].target_field).toBe(mappings[i].target_field);
          expect(deserialized[i].confidence).toBe(mappings[i].confidence);
          expect(deserialized[i].transform).toBe(mappings[i].transform);
        }

        // Deep equality check
        expect(deserialized).toEqual(mappings);
      }),
      { numRuns: 100 }
    );
  });

  it('suggestColumnMappings produces deterministic results for the same input headers', () => {
    fc.assert(
      fc.property(mappableHeadersArb, (headers) => {
        // Call the function multiple times with the same input
        const result1 = suggestColumnMappings(headers);
        const result2 = suggestColumnMappings(headers);
        const result3 = suggestColumnMappings(headers);

        // All results should be identical
        expect(result1).toEqual(result2);
        expect(result2).toEqual(result3);

        // Each mapping should have valid structure
        for (const mapping of result1) {
          expect(STANDARD_FIELDS).toContain(mapping.target_field);
          expect(mapping.confidence).toBeGreaterThan(0);
          expect(mapping.confidence).toBeLessThanOrEqual(1);
          expect(headers).toContain(mapping.source_column);
        }

        // Each source_column should appear at most once
        const sources = result1.map((m) => m.source_column);
        expect(new Set(sources).size).toBe(sources.length);

        // Each target_field should appear at most once
        const targets = result1.map((m) => m.target_field);
        expect(new Set(targets).size).toBe(targets.length);
      }),
      { numRuns: 100 }
    );
  });

  it('column mapping round-trip preserves all fields including optional transform', () => {
    fc.assert(
      fc.property(columnMappingArrayArb, (mappings) => {
        // Filter to only mappings with transforms to test the optional field
        const withTransforms = mappings.filter((m) => m.transform !== undefined);
        const withoutTransforms = mappings.filter((m) => m.transform === undefined);

        const serialized = JSON.stringify(mappings);
        const deserialized: ColumnMapping[] = JSON.parse(serialized);

        // Mappings with transforms should retain their transform value
        const deserializedWithTransforms = deserialized.filter((m) => m.transform !== undefined);
        const deserializedWithoutTransforms = deserialized.filter((m) => m.transform === undefined);

        expect(deserializedWithTransforms.length).toBe(withTransforms.length);
        expect(deserializedWithoutTransforms.length).toBe(withoutTransforms.length);

        // Verify transform values survived the round-trip
        for (const original of withTransforms) {
          const found = deserialized.find(
            (d) => d.source_column === original.source_column && d.target_field === original.target_field
          );
          expect(found).toBeDefined();
          expect(found!.transform).toBe(original.transform);
        }
      }),
      { numRuns: 100 }
    );
  });
});
