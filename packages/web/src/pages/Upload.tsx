import React, { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { uploadFile, apiRequest, ApiClientError } from '../api/client';

// --- Types ---

interface UploadResponse {
  upload: {
    id: string;
    fileName: string;
    fileFormat: string;
    fileSizeBytes: number;
    status: string;
  };
}

interface SuggestedMapping {
  sourceColumn: string;
  targetField: string;
  confidence: number;
}

interface PreviewResponse {
  headers: string[];
  sampleRows: Record<string, string>[];
  suggestedMappings: SuggestedMapping[];
  totalRows: number;
}

interface MappingPayload {
  mappings: { sourceColumn: string; targetField: string }[];
}

interface ProcessResponse {
  summary: {
    totalRows: number;
    importedRows: number;
    skippedRows: number;
    dateRange: { start: string; end: string } | null;
  };
}

const ACCEPTED_FORMATS = ['.csv', '.xlsx', '.xls'];
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

const TARGET_FIELDS = [
  { value: '', label: '— Skip —' },
  { value: 'product_name', label: 'Product Name' },
  { value: 'sku_id', label: 'SKU Identifier' },
  { value: 'quantity_sold', label: 'Quantity Sold' },
  { value: 'sale_price', label: 'Sale Price' },
  { value: 'sale_date', label: 'Sale Date' },
  { value: 'category', label: 'Category' },
  { value: 'supplier_name', label: 'Supplier Name' },
];

// --- Component ---

export function Upload() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Step tracking
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1: File upload state
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadId, setUploadId] = useState<string | null>(null);

  // Step 2: Column mapping state
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [mappings, setMappings] = useState<Record<string, string>>({});
  const [mappingLoading, setMappingLoading] = useState(false);
  const [mappingError, setMappingError] = useState<string | null>(null);

  // Step 3: Import summary state
  const [summary, setSummary] = useState<ProcessResponse['summary'] | null>(null);
  const [processing, setProcessing] = useState(false);
  const [processError, setProcessError] = useState<string | null>(null);

  // --- Step 1: File Selection & Upload ---

  const validateFile = useCallback((file: File): string | null => {
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!ACCEPTED_FORMATS.includes(ext)) {
      return `Unsupported file format "${ext}". Accepted formats: CSV (.csv), Excel (.xlsx, .xls)`;
    }
    if (file.size > MAX_FILE_SIZE) {
      return `File is too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum size is 50MB.`;
    }
    if (file.size === 0) {
      return 'File appears to be empty or corrupt.';
    }
    return null;
  }, []);

  const handleFileSelect = useCallback((file: File) => {
    setUploadError(null);
    const error = validateFile(file);
    if (error) {
      setUploadError(error);
      setSelectedFile(null);
      return;
    }
    setSelectedFile(file);
  }, [validateFile]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  const handleBrowseClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);

  const handleUpload = useCallback(async () => {
    if (!selectedFile) return;
    setUploading(true);
    setUploadError(null);
    setUploadProgress(0);

    try {
      const result = await uploadFile<UploadResponse>(
        '/api/uploads',
        selectedFile,
        (percent) => setUploadProgress(percent)
      );

      setUploadId(result.upload.id);

      // Fetch preview for column mapping
      const previewData = await apiRequest<PreviewResponse>(
        `/api/uploads/${result.upload.id}/preview`
      );

      setPreview(previewData);

      // Initialize mappings from suggestions
      const initialMappings: Record<string, string> = {};
      previewData.suggestedMappings.forEach((m) => {
        initialMappings[m.sourceColumn] = m.targetField;
      });
      setMappings(initialMappings);

      setStep(2);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setUploadError(err.message);
      } else {
        setUploadError('An unexpected error occurred during upload.');
      }
    } finally {
      setUploading(false);
    }
  }, [selectedFile]);

  // --- Step 2: Column Mapping ---

  const handleMappingChange = useCallback((sourceColumn: string, targetField: string) => {
    setMappings((prev) => ({ ...prev, [sourceColumn]: targetField }));
  }, []);

  const handleConfirmMapping = useCallback(async () => {
    if (!uploadId) return;
    setMappingLoading(true);
    setMappingError(null);

    try {
      const payload: MappingPayload = {
        mappings: Object.entries(mappings)
          .filter(([, target]) => target !== '')
          .map(([source, target]) => ({ sourceColumn: source, targetField: target })),
      };

      await apiRequest(`/api/uploads/${uploadId}/mapping`, {
        method: 'POST',
        body: payload,
      });

      // Trigger processing
      setProcessing(true);
      setStep(3);

      const result = await apiRequest<ProcessResponse>(
        `/api/uploads/${uploadId}/process`,
        { method: 'POST' }
      );

      setSummary(result.summary);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setMappingError(err.message);
      } else {
        setMappingError('An unexpected error occurred.');
      }
      // If we already moved to step 3, show error there
      if (step === 3) {
        setProcessError(err instanceof ApiClientError ? err.message : 'Processing failed.');
      }
    } finally {
      setMappingLoading(false);
      setProcessing(false);
    }
  }, [uploadId, mappings, step]);

  // --- Render ---

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.headerTitle}>Grocery Inventory Intelligence</h1>
        <div style={styles.headerRight}>
          <span style={styles.userName}>{user?.name}</span>
          <button onClick={() => navigate('/dashboard')} style={styles.backButton}>
            ← Dashboard
          </button>
        </div>
      </header>

      <main style={styles.main}>
        <h2 style={styles.pageTitle}>Upload Sales Data</h2>

        {/* Stepper */}
        <div style={styles.stepper}>
          <StepIndicator num={1} label="Select File" active={step === 1} completed={step > 1} />
          <div style={styles.stepLine} />
          <StepIndicator num={2} label="Map Columns" active={step === 2} completed={step > 2} />
          <div style={styles.stepLine} />
          <StepIndicator num={3} label="Import Summary" active={step === 3} completed={false} />
        </div>

        {/* Step 1: File Upload */}
        {step === 1 && (
          <div style={styles.stepContent}>
            <div
              style={{
                ...styles.dropZone,
                ...(dragOver ? styles.dropZoneActive : {}),
              }}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={handleBrowseClick}
              role="button"
              tabIndex={0}
              aria-label="Drop file here or click to browse"
            >
              <div style={styles.dropIcon}>📁</div>
              <p style={styles.dropText}>
                Drag & drop your file here, or <span style={styles.browseLink}>browse</span>
              </p>
              <p style={styles.dropHint}>Supported: CSV, Excel (.xlsx, .xls) — Max 50MB</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleInputChange}
                style={{ display: 'none' }}
                aria-hidden="true"
              />
            </div>

            {selectedFile && !uploadError && (
              <div style={styles.fileInfo}>
                <span style={styles.fileName}>📄 {selectedFile.name}</span>
                <span style={styles.fileSize}>
                  ({(selectedFile.size / 1024).toFixed(1)} KB)
                </span>
              </div>
            )}

            {uploadError && (
              <div style={styles.errorBox} role="alert">
                <strong>Error:</strong> {uploadError}
              </div>
            )}

            {uploading && (
              <div style={styles.progressContainer}>
                <div style={styles.progressBar}>
                  <div
                    style={{ ...styles.progressFill, width: `${uploadProgress}%` }}
                  />
                </div>
                <span style={styles.progressText}>{uploadProgress}%</span>
              </div>
            )}

            <button
              style={{
                ...styles.primaryButton,
                ...((!selectedFile || uploading) ? styles.primaryButtonDisabled : {}),
              }}
              onClick={handleUpload}
              disabled={!selectedFile || uploading}
            >
              {uploading ? 'Uploading...' : 'Upload File'}
            </button>
          </div>
        )}

        {/* Step 2: Column Mapping */}
        {step === 2 && preview && (
          <div style={styles.stepContent}>
            <p style={styles.infoText}>
              We detected <strong>{preview.totalRows}</strong> rows. Map your columns to our standard fields below.
            </p>

            <div style={styles.mappingTable}>
              <div style={styles.mappingHeader}>
                <span style={styles.mappingColLeft}>Your Column</span>
                <span style={styles.mappingColRight}>Maps To</span>
              </div>
              {preview.headers.map((header) => (
                <div key={header} style={styles.mappingRow}>
                  <span style={styles.mappingColLeft}>{header}</span>
                  <select
                    style={styles.mappingSelect}
                    value={mappings[header] || ''}
                    onChange={(e) => handleMappingChange(header, e.target.value)}
                    aria-label={`Mapping for ${header}`}
                  >
                    {TARGET_FIELDS.map((f) => (
                      <option key={f.value} value={f.value}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            {/* Sample data preview */}
            {preview.sampleRows.length > 0 && (
              <details style={styles.sampleDetails}>
                <summary style={styles.sampleSummary}>Preview sample rows ({preview.sampleRows.length})</summary>
                <div style={styles.sampleTable}>
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        {preview.headers.map((h) => (
                          <th key={h} style={styles.th}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.sampleRows.map((row, i) => (
                        <tr key={i}>
                          {preview.headers.map((h) => (
                            <td key={h} style={styles.td}>{row[h] ?? ''}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}

            {mappingError && (
              <div style={styles.errorBox} role="alert">
                <strong>Error:</strong> {mappingError}
              </div>
            )}

            <button
              style={{
                ...styles.primaryButton,
                ...(mappingLoading ? styles.primaryButtonDisabled : {}),
              }}
              onClick={handleConfirmMapping}
              disabled={mappingLoading}
            >
              {mappingLoading ? 'Processing...' : 'Confirm & Import'}
            </button>
          </div>
        )}

        {/* Step 3: Import Summary */}
        {step === 3 && (
          <div style={styles.stepContent}>
            {processing && !summary && !processError && (
              <div style={styles.processingBox}>
                <div style={styles.spinner} />
                <p>Processing your data...</p>
              </div>
            )}

            {processError && (
              <div style={styles.errorBox} role="alert">
                <strong>Error:</strong> {processError}
              </div>
            )}

            {summary && (
              <div style={styles.summaryBox}>
                <h3 style={styles.summaryTitle}>✅ Import Complete</h3>

                <div style={styles.summaryGrid}>
                  <div style={styles.summaryCard}>
                    <span style={styles.summaryLabel}>Total Rows</span>
                    <span style={styles.summaryValue}>{summary.totalRows}</span>
                  </div>
                  <div style={styles.summaryCard}>
                    <span style={styles.summaryLabel}>Imported</span>
                    <span style={{ ...styles.summaryValue, color: '#2d6a4f' }}>
                      {summary.importedRows}
                    </span>
                  </div>
                  <div style={styles.summaryCard}>
                    <span style={styles.summaryLabel}>Skipped</span>
                    <span style={{ ...styles.summaryValue, color: summary.skippedRows > 0 ? '#d4380d' : '#333' }}>
                      {summary.skippedRows}
                    </span>
                  </div>
                  <div style={styles.summaryCard}>
                    <span style={styles.summaryLabel}>Date Range</span>
                    <span style={styles.summaryValue}>
                      {summary.dateRange
                        ? `${summary.dateRange.start} — ${summary.dateRange.end}`
                        : 'N/A'}
                    </span>
                  </div>
                </div>

                {summary.skippedRows > 0 && uploadId && (
                  <div style={styles.errorDownload}>
                    <p style={styles.errorDownloadText}>
                      {summary.skippedRows} rows were skipped due to missing required fields.
                    </p>
                    <a
                      href={`${getBaseUrl()}/api/uploads/${uploadId}/errors`}
                      download
                      style={styles.downloadLink}
                    >
                      📥 Download Error Details
                    </a>
                  </div>
                )}

                <button
                  style={styles.primaryButton}
                  onClick={() => navigate('/dashboard')}
                >
                  Go to Dashboard
                </button>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

// --- Helper Components ---

function StepIndicator({ num, label, active, completed }: {
  num: number;
  label: string;
  active: boolean;
  completed: boolean;
}) {
  const circleStyle: React.CSSProperties = {
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 600,
    fontSize: '0.85rem',
    backgroundColor: completed ? '#2d6a4f' : active ? '#2d6a4f' : '#e0e0e0',
    color: completed || active ? '#fff' : '#666',
    transition: 'all 0.2s',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
      <div style={circleStyle}>{completed ? '✓' : num}</div>
      <span style={{ fontSize: '0.75rem', color: active ? '#2d6a4f' : '#666' }}>{label}</span>
    </div>
  );
}

function getBaseUrl(): string {
  return import.meta.env.VITE_API_URL ?? '';
}

// --- Styles ---

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    backgroundColor: '#f5f7fa',
  },
  header: {
    backgroundColor: '#fff',
    padding: '1rem 2rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottom: '1px solid #eee',
    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
  },
  headerTitle: {
    fontSize: '1.1rem',
    fontWeight: 600,
    color: '#1a1a2e',
    margin: 0,
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
  },
  userName: {
    fontSize: '0.85rem',
    color: '#555',
  },
  backButton: {
    padding: '0.4rem 0.75rem',
    backgroundColor: 'transparent',
    color: '#666',
    border: '1px solid #ddd',
    borderRadius: '4px',
    fontSize: '0.8rem',
    cursor: 'pointer',
  },
  main: {
    maxWidth: '700px',
    margin: '0 auto',
    padding: '2rem',
  },
  pageTitle: {
    fontSize: '1.4rem',
    fontWeight: 600,
    color: '#1a1a2e',
    margin: '0 0 1.5rem 0',
  },
  stepper: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    marginBottom: '2rem',
  },
  stepLine: {
    height: '2px',
    width: '60px',
    backgroundColor: '#ddd',
  },
  stepContent: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '1rem',
  },
  dropZone: {
    border: '2px dashed #ccc',
    borderRadius: '8px',
    padding: '3rem 2rem',
    textAlign: 'center' as const,
    cursor: 'pointer',
    transition: 'border-color 0.2s, background-color 0.2s',
    backgroundColor: '#fafafa',
  },
  dropZoneActive: {
    borderColor: '#2d6a4f',
    backgroundColor: '#f0fdf4',
  },
  dropIcon: {
    fontSize: '2.5rem',
    marginBottom: '0.5rem',
  },
  dropText: {
    fontSize: '0.95rem',
    color: '#333',
    margin: '0 0 0.25rem 0',
  },
  browseLink: {
    color: '#2d6a4f',
    fontWeight: 600,
    textDecoration: 'underline',
  },
  dropHint: {
    fontSize: '0.8rem',
    color: '#888',
    margin: 0,
  },
  fileInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.75rem 1rem',
    backgroundColor: '#f0fdf4',
    borderRadius: '6px',
    border: '1px solid #bbf7d0',
  },
  fileName: {
    fontWeight: 500,
    fontSize: '0.9rem',
    color: '#333',
  },
  fileSize: {
    fontSize: '0.8rem',
    color: '#666',
  },
  errorBox: {
    padding: '0.75rem 1rem',
    backgroundColor: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: '6px',
    color: '#991b1b',
    fontSize: '0.85rem',
  },
  progressContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
  },
  progressBar: {
    flex: 1,
    height: '8px',
    backgroundColor: '#e5e7eb',
    borderRadius: '4px',
    overflow: 'hidden' as const,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#2d6a4f',
    borderRadius: '4px',
    transition: 'width 0.3s ease',
  },
  progressText: {
    fontSize: '0.8rem',
    color: '#555',
    fontWeight: 500,
    minWidth: '35px',
  },
  primaryButton: {
    padding: '0.7rem 1.5rem',
    backgroundColor: '#2d6a4f',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    fontSize: '0.9rem',
    fontWeight: 500,
    cursor: 'pointer',
    alignSelf: 'flex-start' as const,
    marginTop: '0.5rem',
  },
  primaryButtonDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  infoText: {
    fontSize: '0.9rem',
    color: '#555',
    margin: '0',
  },
  mappingTable: {
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    overflow: 'hidden' as const,
  },
  mappingHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '0.75rem 1rem',
    backgroundColor: '#f9fafb',
    borderBottom: '1px solid #e5e7eb',
    fontWeight: 600,
    fontSize: '0.8rem',
    color: '#555',
    textTransform: 'uppercase' as const,
  },
  mappingRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0.6rem 1rem',
    borderBottom: '1px solid #f3f4f6',
  },
  mappingColLeft: {
    flex: 1,
    fontSize: '0.85rem',
    color: '#333',
    fontWeight: 500,
  },
  mappingColRight: {
    flex: 1,
    textAlign: 'right' as const,
    fontSize: '0.85rem',
  },
  mappingSelect: {
    padding: '0.4rem 0.6rem',
    border: '1px solid #d1d5db',
    borderRadius: '4px',
    fontSize: '0.85rem',
    minWidth: '160px',
    color: '#333',
    backgroundColor: '#fff',
  },
  sampleDetails: {
    marginTop: '0.5rem',
  },
  sampleSummary: {
    cursor: 'pointer',
    fontSize: '0.85rem',
    color: '#2d6a4f',
    fontWeight: 500,
  },
  sampleTable: {
    overflowX: 'auto' as const,
    marginTop: '0.5rem',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: '0.8rem',
  },
  th: {
    textAlign: 'left' as const,
    padding: '0.5rem',
    backgroundColor: '#f9fafb',
    borderBottom: '1px solid #e5e7eb',
    fontWeight: 600,
    color: '#555',
    whiteSpace: 'nowrap' as const,
  },
  td: {
    padding: '0.5rem',
    borderBottom: '1px solid #f3f4f6',
    color: '#333',
    maxWidth: '150px',
    overflow: 'hidden' as const,
    textOverflow: 'ellipsis' as const,
    whiteSpace: 'nowrap' as const,
  },
  processingBox: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '1rem',
    padding: '2rem',
    color: '#555',
  },
  spinner: {
    width: '32px',
    height: '32px',
    border: '3px solid #e5e7eb',
    borderTop: '3px solid #2d6a4f',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  summaryBox: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '1.25rem',
  },
  summaryTitle: {
    fontSize: '1.2rem',
    fontWeight: 600,
    color: '#2d6a4f',
    margin: 0,
  },
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
    gap: '0.75rem',
  },
  summaryCard: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.25rem',
    padding: '1rem',
    backgroundColor: '#fff',
    borderRadius: '8px',
    border: '1px solid #e5e7eb',
  },
  summaryLabel: {
    fontSize: '0.75rem',
    color: '#888',
    textTransform: 'uppercase' as const,
    fontWeight: 500,
  },
  summaryValue: {
    fontSize: '1.1rem',
    fontWeight: 600,
    color: '#333',
  },
  errorDownload: {
    padding: '1rem',
    backgroundColor: '#fef9c3',
    borderRadius: '6px',
    border: '1px solid #fde047',
  },
  errorDownloadText: {
    fontSize: '0.85rem',
    color: '#713f12',
    margin: '0 0 0.5rem 0',
  },
  downloadLink: {
    fontSize: '0.85rem',
    color: '#2d6a4f',
    fontWeight: 500,
    textDecoration: 'none',
  },
};
