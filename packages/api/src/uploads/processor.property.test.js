/**
 * Feature: grocery-inventory-intelligence
 * Property 2: Row Validation Partitioning
 *
 * For any set of imported data rows, the row validation process should produce a partition where:
 * (a) imported_count + skipped_count = total_count,
 * (b) every imported row contains all required fields (product_name, quantity_sold),
 * (c) every skipped row is missing at least one required field.
 *
 * **Validates: Requirements 2.5, 2.6**
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { validateRow, applyMapping } from './processor.js';
// ─── Arbitraries ───────────────────────────────────────────────────────────────
const STANDARD_FIELDS = [
    'product_name',
    'sku_id',
    'quantity_sold',
    'sale_price',
    'sale_date',
    'category',
    'supplier_name',
];
/** Generates a non-empty product name */
const productNameArb = fc.stringOf(fc.char().filter((c) => c.trim().length > 0), { minLength: 1, maxLength: 50 });
/** Generates a valid positive quantity_sold value as a string */
const quantitySoldArb = fc
    .integer({ min: 1, max: 10000 })
    .map((n) => n.toString());
/** Generates an optional field value (could be empty or have content) */
const optionalFieldArb = fc.oneof(fc.constant(''), fc.stringOf(fc.char().filter((c) => c.trim().length > 0), { minLength: 1, maxLength: 30 }));
/** Generates a row that has ALL required fields (should be imported) */
const validRowArb = fc.record({
    product_name: productNameArb,
    quantity_sold: quantitySoldArb,
    sku_id: optionalFieldArb,
    sale_price: optionalFieldArb,
    sale_date: optionalFieldArb,
    category: optionalFieldArb,
    supplier_name: optionalFieldArb,
});
/** Generates a row that is MISSING at least one required field (should be skipped) */
const invalidRowArb = fc.oneof(
// Missing product_name (empty or whitespace-only)
fc.record({
    product_name: fc.constantFrom('', '   ', '\t'),
    quantity_sold: quantitySoldArb,
    sku_id: optionalFieldArb,
    sale_price: optionalFieldArb,
}), 
// Missing quantity_sold (empty or whitespace-only)
fc.record({
    product_name: productNameArb,
    quantity_sold: fc.constantFrom('', '   ', '\t'),
    sku_id: optionalFieldArb,
    sale_price: optionalFieldArb,
}), 
// quantity_sold is invalid (non-numeric, zero, or negative)
fc.record({
    product_name: productNameArb,
    quantity_sold: fc.constantFrom('abc', '0', '-5', 'NaN', 'Infinity', '-1'),
    sku_id: optionalFieldArb,
    sale_price: optionalFieldArb,
}), 
// Missing both required fields
fc.record({
    product_name: fc.constantFrom('', '   '),
    quantity_sold: fc.constantFrom('', '   '),
    sku_id: optionalFieldArb,
    sale_price: optionalFieldArb,
}));
/** Generates a mixed set of rows (some valid, some invalid) */
const mixedRowsArb = fc
    .array(fc.oneof(validRowArb.map((row) => ({ row, valid: true })), invalidRowArb.map((row) => ({ row, valid: false }))), { minLength: 1, maxLength: 50 })
    .map((items) => ({
    rows: items.map((i) => i.row),
    expectedValid: items.map((i) => i.valid),
}));
/**
 * Generates raw rows with source column names and a corresponding mapping config.
 * This tests the full applyMapping + validateRow pipeline.
 */
const rawRowWithMappingArb = fc
    .record({
    hasProductName: fc.boolean(),
    hasQuantitySold: fc.boolean(),
    productName: productNameArb,
    quantitySold: quantitySoldArb,
    extraField: optionalFieldArb,
})
    .map(({ hasProductName, hasQuantitySold, productName, quantitySold, extraField }) => {
    const rawRow = {};
    const mappings = [];
    // Always include a source column for product_name
    if (hasProductName) {
        rawRow['Item Name'] = productName;
        mappings.push({ source_column: 'Item Name', target_field: 'product_name', confidence: 0.9 });
    }
    else {
        rawRow['Item Name'] = '';
        mappings.push({ source_column: 'Item Name', target_field: 'product_name', confidence: 0.9 });
    }
    // Always include a source column for quantity_sold
    if (hasQuantitySold) {
        rawRow['Qty'] = quantitySold;
        mappings.push({ source_column: 'Qty', target_field: 'quantity_sold', confidence: 0.85 });
    }
    else {
        rawRow['Qty'] = '';
        mappings.push({ source_column: 'Qty', target_field: 'quantity_sold', confidence: 0.85 });
    }
    // Add an optional extra column
    rawRow['Notes'] = extraField;
    mappings.push({ source_column: 'Notes', target_field: 'category', confidence: 0.5 });
    return {
        rawRow,
        mappings,
        hasRequiredFields: hasProductName && hasQuantitySold,
    };
});
// ─── Property Tests ────────────────────────────────────────────────────────────
describe('Property 2: Row Validation Partitioning', () => {
    it('imported_count + skipped_count = total_count for any set of rows', () => {
        fc.assert(fc.property(mixedRowsArb, ({ rows }) => {
            let importedCount = 0;
            let skippedCount = 0;
            for (const row of rows) {
                const error = validateRow(row);
                if (error === null) {
                    importedCount++;
                }
                else {
                    skippedCount++;
                }
            }
            // Property (a): partition is exhaustive
            expect(importedCount + skippedCount).toBe(rows.length);
        }), { numRuns: 100 });
    });
    it('every imported row contains all required fields (product_name, quantity_sold)', () => {
        fc.assert(fc.property(mixedRowsArb, ({ rows }) => {
            for (const row of rows) {
                const error = validateRow(row);
                if (error === null) {
                    // Property (b): imported rows have non-empty required fields
                    const productName = (row['product_name'] ?? '').trim();
                    const quantitySold = (row['quantity_sold'] ?? '').trim();
                    expect(productName.length).toBeGreaterThan(0);
                    expect(quantitySold.length).toBeGreaterThan(0);
                    // quantity_sold must be a valid positive number
                    const qty = Number(quantitySold);
                    expect(qty).toBeGreaterThan(0);
                    expect(Number.isFinite(qty)).toBe(true);
                }
            }
        }), { numRuns: 100 });
    });
    it('every skipped row is missing at least one required field or has invalid quantity', () => {
        fc.assert(fc.property(mixedRowsArb, ({ rows }) => {
            for (const row of rows) {
                const error = validateRow(row);
                if (error !== null) {
                    // Property (c): skipped rows are missing at least one required field
                    const productName = (row['product_name'] ?? '').trim();
                    const quantitySold = (row['quantity_sold'] ?? '').trim();
                    const productNameMissing = productName.length === 0;
                    const quantitySoldMissing = quantitySold.length === 0;
                    const quantitySoldInvalid = !quantitySoldMissing &&
                        (isNaN(Number(quantitySold)) || Number(quantitySold) <= 0 || !Number.isFinite(Number(quantitySold)));
                    // At least one required field must be missing or invalid
                    expect(productNameMissing || quantitySoldMissing || quantitySoldInvalid).toBe(true);
                }
            }
        }), { numRuns: 100 });
    });
    it('applyMapping + validateRow pipeline produces correct partitioning', () => {
        fc.assert(fc.property(fc.array(rawRowWithMappingArb, { minLength: 1, maxLength: 30 }), (items) => {
            let importedCount = 0;
            let skippedCount = 0;
            for (const { rawRow, mappings, hasRequiredFields } of items) {
                const mapped = applyMapping(rawRow, mappings);
                const error = validateRow(mapped);
                if (error === null) {
                    importedCount++;
                    // Verify it actually has valid required fields
                    expect((mapped['product_name'] ?? '').trim().length).toBeGreaterThan(0);
                    const qty = Number((mapped['quantity_sold'] ?? '').trim());
                    expect(qty).toBeGreaterThan(0);
                }
                else {
                    skippedCount++;
                }
            }
            // Partition is exhaustive
            expect(importedCount + skippedCount).toBe(items.length);
        }), { numRuns: 100 });
    });
    it('valid rows are always imported and invalid rows are always skipped', () => {
        fc.assert(fc.property(validRowArb, (row) => {
            const error = validateRow(row);
            // Valid rows (with non-empty product_name and positive quantity_sold) should pass
            expect(error).toBeNull();
        }), { numRuns: 100 });
        fc.assert(fc.property(invalidRowArb, (row) => {
            const error = validateRow(row);
            // Invalid rows should fail validation
            expect(error).not.toBeNull();
            expect(typeof error).toBe('string');
            expect(error.length).toBeGreaterThan(0);
        }), { numRuns: 100 });
    });
});
//# sourceMappingURL=processor.property.test.js.map