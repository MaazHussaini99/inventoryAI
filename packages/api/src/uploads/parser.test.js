/**
 * Unit tests for the file parser module.
 * Tests CSV parsing (Papa Parse) and Excel parsing (ExcelJS).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import ExcelJS from 'exceljs';
import { parseFile } from './parser.js';
const TEST_DIR = resolve('./uploads/__test_parser__');
beforeAll(async () => {
    await mkdir(TEST_DIR, { recursive: true });
});
afterAll(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
});
describe('parseFile - CSV', () => {
    it('should parse a simple CSV file with headers and rows', async () => {
        const csvContent = `Product,Quantity,Price,Date
Apples,10,2.50,2024-01-15
Bananas,20,1.25,2024-01-16
Oranges,15,3.00,2024-01-17`;
        const filePath = resolve(TEST_DIR, 'simple.csv');
        await writeFile(filePath, csvContent);
        const result = await parseFile(filePath, 'csv');
        expect(result.headers).toEqual(['Product', 'Quantity', 'Price', 'Date']);
        expect(result.totalRows).toBe(3);
        expect(result.sampleRows).toHaveLength(3);
        expect(result.sampleRows[0]).toEqual({
            Product: 'Apples',
            Quantity: '10',
            Price: '2.50',
            Date: '2024-01-15',
        });
    });
    it('should return only first 10 sample rows for large files', async () => {
        const lines = ['Name,Qty'];
        for (let i = 1; i <= 25; i++) {
            lines.push(`Item${i},${i}`);
        }
        const filePath = resolve(TEST_DIR, 'large.csv');
        await writeFile(filePath, lines.join('\n'));
        const result = await parseFile(filePath, 'csv');
        expect(result.headers).toEqual(['Name', 'Qty']);
        expect(result.totalRows).toBe(25);
        expect(result.sampleRows).toHaveLength(10);
        expect(result.sampleRows[0]).toEqual({ Name: 'Item1', Qty: '1' });
        expect(result.sampleRows[9]).toEqual({ Name: 'Item10', Qty: '10' });
    });
    it('should handle CSV with empty rows by skipping them', async () => {
        const csvContent = `Product,Qty
Apples,10

Bananas,20
`;
        const filePath = resolve(TEST_DIR, 'empty_rows.csv');
        await writeFile(filePath, csvContent);
        const result = await parseFile(filePath, 'csv');
        expect(result.headers).toEqual(['Product', 'Qty']);
        expect(result.totalRows).toBe(2);
        expect(result.sampleRows).toHaveLength(2);
    });
    it('should handle CSV with special characters in values', async () => {
        const csvContent = `Product,Price
"Apples, Red",2.50
"Ben & Jerry's",5.99`;
        const filePath = resolve(TEST_DIR, 'special_chars.csv');
        await writeFile(filePath, csvContent);
        const result = await parseFile(filePath, 'csv');
        expect(result.sampleRows[0]).toEqual({ Product: 'Apples, Red', Price: '2.50' });
        expect(result.sampleRows[1]).toEqual({ Product: "Ben & Jerry's", Price: '5.99' });
    });
    it('should handle an empty CSV file (only headers)', async () => {
        const csvContent = `Product,Qty,Price`;
        const filePath = resolve(TEST_DIR, 'headers_only.csv');
        await writeFile(filePath, csvContent);
        const result = await parseFile(filePath, 'csv');
        expect(result.headers).toEqual(['Product', 'Qty', 'Price']);
        expect(result.totalRows).toBe(0);
        expect(result.sampleRows).toHaveLength(0);
    });
});
describe('parseFile - Excel', () => {
    it('should parse an XLSX file with headers and rows', async () => {
        const filePath = resolve(TEST_DIR, 'test.xlsx');
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Sales');
        sheet.addRow(['Product', 'Quantity', 'Price']);
        sheet.addRow(['Apples', 10, 2.5]);
        sheet.addRow(['Bananas', 20, 1.25]);
        sheet.addRow(['Oranges', 15, 3.0]);
        await workbook.xlsx.writeFile(filePath);
        const result = await parseFile(filePath, 'xlsx');
        expect(result.headers).toEqual(['Product', 'Quantity', 'Price']);
        expect(result.totalRows).toBe(3);
        expect(result.sampleRows).toHaveLength(3);
        expect(result.sampleRows[0]).toEqual({
            Product: 'Apples',
            Quantity: '10',
            Price: '2.5',
        });
    });
    it('should return only first 10 sample rows for large Excel files', async () => {
        const filePath = resolve(TEST_DIR, 'large.xlsx');
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Data');
        sheet.addRow(['Name', 'Value']);
        for (let i = 1; i <= 30; i++) {
            sheet.addRow([`Item${i}`, i]);
        }
        await workbook.xlsx.writeFile(filePath);
        const result = await parseFile(filePath, 'xlsx');
        expect(result.headers).toEqual(['Name', 'Value']);
        expect(result.totalRows).toBe(30);
        expect(result.sampleRows).toHaveLength(10);
        expect(result.sampleRows[0]).toEqual({ Name: 'Item1', Value: '1' });
    });
    it('should handle an empty Excel worksheet', async () => {
        const filePath = resolve(TEST_DIR, 'empty.xlsx');
        const workbook = new ExcelJS.Workbook();
        workbook.addWorksheet('Empty');
        await workbook.xlsx.writeFile(filePath);
        const result = await parseFile(filePath, 'xlsx');
        expect(result.headers).toEqual([]);
        expect(result.totalRows).toBe(0);
        expect(result.sampleRows).toHaveLength(0);
    });
});
//# sourceMappingURL=parser.test.js.map