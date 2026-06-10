/**
 * Inventory Status Dashboard Page
 *
 * Displays:
 * - Table showing product name, estimated stock, status (color-coded badge), reorder point
 * - Filter by status (all, in_stock, low_stock, out_of_stock)
 * - Reorder alert badges for SKUs at or below reorder point
 * - Data discrepancy warning for negative inventory
 *
 * Validates: Requirements 5.2, 5.3, 5.4, 5.5
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../api/client';

// ─── Types ─────────────────────────────────────────────────────────────────────

type InventoryStatus = 'in_stock' | 'low_stock' | 'out_of_stock';

interface InventoryItem {
  productId: string;
  productName: string;
  skuIdentifier: string | null;
  category: string | null;
  estimatedStock: number;
  reorderPoint: number;
  status: InventoryStatus;
  hasDiscrepancy: boolean;
}

interface InventorySummary {
  inStock: number;
  lowStock: number;
  outOfStock: number;
  discrepancies: number;
  total: number;
}

interface Pagination {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

interface InventoryResponse {
  items: InventoryItem[];
  pagination: Pagination;
  summary: InventorySummary;
}

type StatusFilter = 'all' | InventoryStatus;

// ─── Helpers ───────────────────────────────────────────────────────────────────

function getStatusColor(status: InventoryStatus): string {
  switch (status) {
    case 'in_stock':
      return '#16a34a'; // green
    case 'low_stock':
      return '#ca8a04'; // yellow/amber
    case 'out_of_stock':
      return '#dc2626'; // red
  }
}

function getStatusBg(status: InventoryStatus): string {
  switch (status) {
    case 'in_stock':
      return '#dcfce7';
    case 'low_stock':
      return '#fef9c3';
    case 'out_of_stock':
      return '#fee2e2';
  }
}

function getStatusLabel(status: InventoryStatus): string {
  switch (status) {
    case 'in_stock':
      return 'In Stock';
    case 'low_stock':
      return 'Low Stock';
    case 'out_of_stock':
      return 'Out of Stock';
  }
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function Inventory() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const storeId = user?.storeId;

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [summary, setSummary] = useState<InventorySummary | null>(null);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchInventory = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      params.set('page', String(page));
      params.set('pageSize', '50');

      const res = await apiRequest<InventoryResponse>(
        `/api/stores/${storeId}/inventory?${params.toString()}`
      );

      setItems(res.items);
      setSummary(res.summary);
      setPagination(res.pagination);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load inventory');
    } finally {
      setLoading(false);
    }
  }, [storeId, statusFilter, page]);

  useEffect(() => {
    fetchInventory();
  }, [fetchInventory]);

  // Auto-refresh every 60 seconds
  useEffect(() => {
    const interval = setInterval(fetchInventory, 60_000);
    return () => clearInterval(interval);
  }, [fetchInventory]);

  function handleFilterChange(filter: StatusFilter) {
    setStatusFilter(filter);
    setPage(1);
  }

  function handleLogout() {
    logout();
    navigate('/login');
  }

  if (loading && !summary) {
    return (
      <div style={styles.container}>
        <div style={styles.loadingMessage}>Loading inventory...</div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <header style={styles.header}>
        <h1 style={styles.headerTitle}>Inventory Status</h1>
        <div style={styles.headerRight}>
          <button onClick={() => navigate('/dashboard')} style={styles.navButton}>
            Dashboard
          </button>
          <button onClick={() => navigate('/analytics')} style={styles.navButton}>
            Analytics
          </button>
          <span style={styles.userName}>{user?.name}</span>
          <button onClick={handleLogout} style={styles.logoutButton}>
            Log Out
          </button>
        </div>
      </header>

      <main style={styles.main}>
        {error && <div style={styles.error}>{error}</div>}

        {/* Summary Cards */}
        {summary && (
          <section style={styles.summaryCards} aria-label="Inventory summary">
            <div style={{ ...styles.summaryCard, borderTop: '3px solid #16a34a' }}>
              <div style={styles.summaryValue}>{summary.inStock}</div>
              <div style={styles.summaryLabel}>In Stock</div>
            </div>
            <div style={{ ...styles.summaryCard, borderTop: '3px solid #ca8a04' }}>
              <div style={styles.summaryValue}>{summary.lowStock}</div>
              <div style={styles.summaryLabel}>Low Stock</div>
            </div>
            <div style={{ ...styles.summaryCard, borderTop: '3px solid #dc2626' }}>
              <div style={styles.summaryValue}>{summary.outOfStock}</div>
              <div style={styles.summaryLabel}>Out of Stock</div>
            </div>
            <div style={{ ...styles.summaryCard, borderTop: '3px solid #7c3aed' }}>
              <div style={styles.summaryValue}>{summary.total}</div>
              <div style={styles.summaryLabel}>Total Products</div>
            </div>
          </section>
        )}

        {/* Discrepancy Alert */}
        {summary && summary.discrepancies > 0 && (
          <div style={styles.discrepancyAlert} role="alert">
            ⚠️ <strong>{summary.discrepancies} product(s)</strong> have negative inventory.
            This indicates a data discrepancy — please verify actual stock levels.
          </div>
        )}

        {/* Filter Section */}
        <section style={styles.filterSection}>
          <span style={styles.filterLabel}>Filter by status:</span>
          <div style={styles.filterButtons}>
            {(['all', 'in_stock', 'low_stock', 'out_of_stock'] as StatusFilter[]).map((f) => (
              <button
                key={f}
                onClick={() => handleFilterChange(f)}
                style={f === statusFilter ? styles.filterActive : styles.filterBtn}
                aria-pressed={f === statusFilter}
              >
                {f === 'all' ? 'All' : getStatusLabel(f as InventoryStatus)}
              </button>
            ))}
          </div>
        </section>

        {/* Inventory Table */}
        <section style={styles.section}>
          {items.length > 0 ? (
            <table style={styles.table} aria-label="Inventory items">
              <thead>
                <tr>
                  <th style={styles.th}>Product</th>
                  <th style={styles.th}>SKU</th>
                  <th style={styles.th}>Category</th>
                  <th style={styles.th}>Est. Stock</th>
                  <th style={styles.th}>Reorder Point</th>
                  <th style={styles.th}>Status</th>
                  <th style={styles.th}>Alerts</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.productId} style={styles.tableRow}>
                    <td style={{ ...styles.td, fontWeight: 500 }}>{item.productName}</td>
                    <td style={styles.td}>{item.skuIdentifier ?? '—'}</td>
                    <td style={styles.td}>{item.category ?? '—'}</td>
                    <td style={{
                      ...styles.td,
                      color: item.hasDiscrepancy ? '#dc2626' : '#333',
                      fontWeight: item.hasDiscrepancy ? 600 : 400,
                    }}>
                      {item.estimatedStock}
                    </td>
                    <td style={styles.td}>{item.reorderPoint}</td>
                    <td style={styles.td}>
                      <span style={{
                        ...styles.statusBadge,
                        backgroundColor: getStatusBg(item.status),
                        color: getStatusColor(item.status),
                      }}>
                        {getStatusLabel(item.status)}
                      </span>
                    </td>
                    <td style={styles.td}>
                      {item.estimatedStock <= item.reorderPoint && item.estimatedStock > 0 && (
                        <span style={styles.reorderBadge} title="Reorder recommended">
                          🔄 Reorder
                        </span>
                      )}
                      {item.hasDiscrepancy && (
                        <span style={styles.discrepancyBadge} title="Negative inventory — verify stock">
                          ⚠️ Discrepancy
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p style={styles.emptyState}>
              {statusFilter === 'all'
                ? 'No products found. Upload inventory data to get started.'
                : `No products with "${getStatusLabel(statusFilter as InventoryStatus)}" status.`}
            </p>
          )}

          {/* Pagination */}
          {pagination && pagination.totalPages > 1 && (
            <div style={styles.pagination}>
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                style={page <= 1 ? styles.paginationDisabled : styles.paginationBtn}
              >
                ← Previous
              </button>
              <span style={styles.paginationInfo}>
                Page {pagination.page} of {pagination.totalPages} ({pagination.totalItems} items)
              </span>
              <button
                onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                disabled={page >= pagination.totalPages}
                style={page >= pagination.totalPages ? styles.paginationDisabled : styles.paginationBtn}
              >
                Next →
              </button>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    backgroundColor: '#f5f7fa',
  },
  loadingMessage: {
    padding: '3rem',
    textAlign: 'center',
    color: '#666',
    fontSize: '1rem',
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
    gap: '0.75rem',
  },
  navButton: {
    padding: '0.4rem 0.75rem',
    backgroundColor: 'transparent',
    color: '#2d6a4f',
    border: '1px solid #2d6a4f',
    borderRadius: '4px',
    fontSize: '0.8rem',
    cursor: 'pointer',
  },
  userName: {
    fontSize: '0.85rem',
    color: '#555',
  },
  logoutButton: {
    padding: '0.4rem 0.75rem',
    backgroundColor: 'transparent',
    color: '#666',
    border: '1px solid #ddd',
    borderRadius: '4px',
    fontSize: '0.8rem',
    cursor: 'pointer',
  },
  main: {
    maxWidth: '1100px',
    margin: '0 auto',
    padding: '1.5rem 2rem',
  },
  error: {
    padding: '0.75rem 1rem',
    backgroundColor: '#fee2e2',
    color: '#b91c1c',
    borderRadius: '6px',
    marginBottom: '1rem',
    fontSize: '0.85rem',
  },

  // Summary Cards
  summaryCards: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '1rem',
    marginBottom: '1.5rem',
  },
  summaryCard: {
    backgroundColor: '#fff',
    borderRadius: '8px',
    padding: '1.25rem',
    textAlign: 'center',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  },
  summaryValue: {
    fontSize: '1.5rem',
    fontWeight: 700,
    color: '#1a1a2e',
    marginBottom: '0.25rem',
  },
  summaryLabel: {
    fontSize: '0.75rem',
    color: '#888',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },

  // Discrepancy Alert
  discrepancyAlert: {
    padding: '0.75rem 1rem',
    backgroundColor: '#fef3c7',
    color: '#92400e',
    borderRadius: '6px',
    marginBottom: '1.5rem',
    fontSize: '0.85rem',
    border: '1px solid #fde68a',
  },

  // Filter Section
  filterSection: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    marginBottom: '1rem',
  },
  filterLabel: {
    fontSize: '0.85rem',
    color: '#555',
    fontWeight: 500,
  },
  filterButtons: {
    display: 'flex',
    gap: '0.25rem',
  },
  filterBtn: {
    padding: '0.35rem 0.75rem',
    backgroundColor: '#fff',
    color: '#555',
    border: '1px solid #ddd',
    borderRadius: '4px',
    fontSize: '0.8rem',
    cursor: 'pointer',
  },
  filterActive: {
    padding: '0.35rem 0.75rem',
    backgroundColor: '#2d6a4f',
    color: '#fff',
    border: '1px solid #2d6a4f',
    borderRadius: '4px',
    fontSize: '0.8rem',
    cursor: 'pointer',
  },

  // Section
  section: {
    backgroundColor: '#fff',
    borderRadius: '8px',
    padding: '1.25rem',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  },

  // Table
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '0.85rem',
  },
  th: {
    textAlign: 'left',
    padding: '0.6rem 0.75rem',
    borderBottom: '2px solid #eee',
    color: '#555',
    fontSize: '0.75rem',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.3px',
  },
  td: {
    padding: '0.6rem 0.75rem',
    borderBottom: '1px solid #f5f5f5',
    color: '#444',
  },
  tableRow: {
    transition: 'background-color 0.15s',
  },

  // Status Badge
  statusBadge: {
    display: 'inline-block',
    padding: '0.2rem 0.5rem',
    borderRadius: '4px',
    fontSize: '0.75rem',
    fontWeight: 600,
  },

  // Reorder Badge
  reorderBadge: {
    display: 'inline-block',
    padding: '0.15rem 0.4rem',
    backgroundColor: '#dbeafe',
    color: '#1d4ed8',
    borderRadius: '3px',
    fontSize: '0.7rem',
    fontWeight: 500,
    marginRight: '0.25rem',
  },

  // Discrepancy Badge
  discrepancyBadge: {
    display: 'inline-block',
    padding: '0.15rem 0.4rem',
    backgroundColor: '#fee2e2',
    color: '#dc2626',
    borderRadius: '3px',
    fontSize: '0.7rem',
    fontWeight: 500,
  },

  // Pagination
  pagination: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: '1rem',
    marginTop: '1rem',
    paddingTop: '1rem',
    borderTop: '1px solid #eee',
  },
  paginationBtn: {
    padding: '0.35rem 0.75rem',
    backgroundColor: '#fff',
    color: '#2d6a4f',
    border: '1px solid #2d6a4f',
    borderRadius: '4px',
    fontSize: '0.8rem',
    cursor: 'pointer',
  },
  paginationDisabled: {
    padding: '0.35rem 0.75rem',
    backgroundColor: '#f5f5f5',
    color: '#aaa',
    border: '1px solid #ddd',
    borderRadius: '4px',
    fontSize: '0.8rem',
    cursor: 'not-allowed',
  },
  paginationInfo: {
    fontSize: '0.8rem',
    color: '#666',
  },

  // Empty State
  emptyState: {
    color: '#888',
    fontSize: '0.85rem',
    textAlign: 'center',
    padding: '2rem',
  },
};
