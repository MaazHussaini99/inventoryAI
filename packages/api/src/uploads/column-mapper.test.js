/**
 * Unit tests for the column mapping auto-suggest logic.
 */
import { describe, it, expect } from 'vitest';
import { suggestColumnMappings } from './column-mapper.js';
describe('suggestColumnMappings', () => {
    it('should map exact standard field names with high confidence', () => {
        const headers = ['product_name', 'sku_id', 'quantity_sold', 'sale_price', 'sale_date', 'category', 'supplier_name'];
        const mappings = suggestColumnMappings(headers);
        expect(mappings).toHaveLength(7);
        const byTarget = Object.fromEntries(mappings.map((m) => [m.target_field, m]));
        expect(byTarget.product_name.source_column).toBe('product_name');
        expect(byTarget.product_name.confidence).toBe(1.0);
        expect(byTarget.sku_id.source_column).toBe('sku_id');
        expect(byTarget.quantity_sold.source_column).toBe('quantity_sold');
        expect(byTarget.sale_price.source_column).toBe('sale_price');
        expect(byTarget.sale_date.source_column).toBe('sale_date');
        expect(byTarget.category.source_column).toBe('category');
        expect(byTarget.supplier_name.source_column).toBe('supplier_name');
    });
    it('should map common keyword variations', () => {
        const headers = ['Item Name', 'UPC Code', 'Qty Sold', 'Unit Price', 'Transaction Date', 'Department', 'Vendor'];
        const mappings = suggestColumnMappings(headers);
        const byTarget = Object.fromEntries(mappings.map((m) => [m.target_field, m]));
        expect(byTarget.product_name).toBeDefined();
        expect(byTarget.sku_id).toBeDefined();
        expect(byTarget.quantity_sold).toBeDefined();
        expect(byTarget.sale_price).toBeDefined();
        expect(byTarget.sale_date).toBeDefined();
        expect(byTarget.category).toBeDefined();
        expect(byTarget.supplier_name).toBeDefined();
    });
    it('should handle case-insensitive matching', () => {
        const headers = ['PRODUCT', 'SKU', 'QUANTITY', 'PRICE', 'DATE', 'CATEGORY', 'SUPPLIER'];
        const mappings = suggestColumnMappings(headers);
        expect(mappings.length).toBeGreaterThanOrEqual(7);
        const targetFields = mappings.map((m) => m.target_field);
        expect(targetFields).toContain('product_name');
        expect(targetFields).toContain('sku_id');
        expect(targetFields).toContain('quantity_sold');
        expect(targetFields).toContain('sale_price');
        expect(targetFields).toContain('sale_date');
        expect(targetFields).toContain('category');
        expect(targetFields).toContain('supplier_name');
    });
    it('should handle headers with underscores and dashes', () => {
        const headers = ['product-name', 'sku_code', 'units-sold', 'sale_price'];
        const mappings = suggestColumnMappings(headers);
        const byTarget = Object.fromEntries(mappings.map((m) => [m.target_field, m]));
        expect(byTarget.product_name).toBeDefined();
        expect(byTarget.sku_id).toBeDefined();
        expect(byTarget.quantity_sold).toBeDefined();
        expect(byTarget.sale_price).toBeDefined();
    });
    it('should assign each header to at most one target field', () => {
        const headers = ['Product Name', 'SKU', 'Qty', 'Price', 'Date'];
        const mappings = suggestColumnMappings(headers);
        const sourceColumns = mappings.map((m) => m.source_column);
        const uniqueSources = new Set(sourceColumns);
        expect(uniqueSources.size).toBe(sourceColumns.length);
    });
    it('should assign each target field at most once', () => {
        const headers = ['Product', 'Item Name', 'Description'];
        const mappings = suggestColumnMappings(headers);
        const targetFields = mappings.map((m) => m.target_field);
        const uniqueTargets = new Set(targetFields);
        expect(uniqueTargets.size).toBe(targetFields.length);
    });
    it('should return empty array for headers with no match', () => {
        const headers = ['foo', 'bar', 'baz', 'xyz'];
        const mappings = suggestColumnMappings(headers);
        expect(mappings).toHaveLength(0);
    });
    it('should handle empty headers array', () => {
        const mappings = suggestColumnMappings([]);
        expect(mappings).toHaveLength(0);
    });
    it('should assign higher confidence to exact matches over partial matches', () => {
        const headers = ['product_name', 'product description'];
        const mappings = suggestColumnMappings(headers);
        const productMapping = mappings.find((m) => m.target_field === 'product_name');
        expect(productMapping).toBeDefined();
        expect(productMapping.source_column).toBe('product_name');
        expect(productMapping.confidence).toBe(1.0);
    });
    it('should map barcode to sku_id', () => {
        const headers = ['Item', 'Barcode', 'Amount'];
        const mappings = suggestColumnMappings(headers);
        const skuMapping = mappings.find((m) => m.target_field === 'sku_id');
        expect(skuMapping).toBeDefined();
        expect(skuMapping.source_column).toBe('Barcode');
    });
    it('should map vendor to supplier_name', () => {
        const headers = ['Product', 'Vendor', 'Cost'];
        const mappings = suggestColumnMappings(headers);
        const supplierMapping = mappings.find((m) => m.target_field === 'supplier_name');
        expect(supplierMapping).toBeDefined();
        expect(supplierMapping.source_column).toBe('Vendor');
    });
    it('should handle real-world messy headers', () => {
        const headers = ['Item Description', 'QTY', 'Total Amount', 'Sale Date', 'Dept'];
        const mappings = suggestColumnMappings(headers);
        const targetFields = mappings.map((m) => m.target_field);
        expect(targetFields).toContain('quantity_sold');
        expect(targetFields).toContain('sale_date');
        expect(targetFields).toContain('category');
    });
});
//# sourceMappingURL=column-mapper.test.js.map