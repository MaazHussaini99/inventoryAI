/**
 * Sales Analytics Dashboard Page
 *
 * Displays:
 * - Sales summary cards (revenue, units, avg transaction, unique SKUs) with date range selector
 * - Top products table with toggle between revenue and units ranking
 * - Dead stock list with last sale date column
 * - Daily sales trend chart (revenue + units overlay) with day-of-week highlighting
 * - SKU detail modal with daily history, velocity, revenue, and estimated stock
 *
 * Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../api/client';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface SalesSummary {
  totalRevenue: number;
  totalUnits: number;
  averageTransactionValue: number;
  uniqueSkus: number;
  dateRange: { startDate: string; endDate: string };
  daysWithData: number;
}

interface TopProduct {
  productId: string;
  productName: string;
  totalRevenue: number;
  totalUnitsSold: number;
  rank: number;
}

interface DeadStockItem {
  productId: string;
  productName: string;
  lastSaleDate: string | null;
  estimatedStock: number;
  daysSinceLastSale: number;
}

interface DailyTrend {
  date: string;
  dayOfWeek: number;
  revenue: number;
  unitsSold: number;
}

interface ProductDetail {
  product: {
    id: string;
    name: string;
    skuIdentifier: string | null;
    category: string | null;
    supplierName: string | null;
    isActive: boolean;
    estimatedStock: number;
    lastSaleDate: string | null;
  };
  analytics: {
    dailyHistory: { date: string; unitsSold: number; revenue: number }[];
    totalUnitsSold: number;
    totalRevenue: number;
    averageDailyVelocity: number;
    dateRange: { startDate: string; endDate: string };
  };
}

type DateRangeFilter = 'today' | '7d' | '30d';
type SortMode = 'revenue' | 'units';

// ─── Helper ────────────────────────────────────────────────────────────────────

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function Analytics() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const storeId = user?.storeId;

  // State
  const [dateRange, setDateRange] = useState<DateRangeFilter>('30d');
  const [sortMode, setSortMode] = useState<SortMode>('revenue');
  const [summary, setSummary] = useState<SalesSummary | null>(null);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [deadStock, setDeadStock] = useState<DeadStockItem[]>([]);
  const [trends, setTrends] = useState<DailyTrend[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<ProductDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch all analytics data
  const fetchAnalytics = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    setError(null);

    try {
      const [summaryRes, topRes, deadStockRes, trendsRes] = await Promise.all([
        apiRequest<{ summary: SalesSummary }>(
          `/api/stores/${storeId}/analytics/summary?range=${dateRange}`
        ),
        apiRequest<{ topProducts: TopProduct[] }>(
          `/api/stores/${storeId}/analytics/top-products?sort=${sortMode}`
        ),
        apiRequest<{ deadStock: DeadStockItem[] }>(
          `/api/stores/${storeId}/analytics/dead-stock`
        ),
        apiRequest<{ trends: DailyTrend[] }>(
          `/api/stores/${storeId}/analytics/trends`
        ),
      ]);

      setSummary(summaryRes.summary);
      setTopProducts(topRes.topProducts);
      setDeadStock(deadStockRes.deadStock);
      setTrends(trendsRes.trends);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, [storeId, dateRange, sortMode]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  // Auto-refresh every 60 seconds for real-time updates when new data is imported
  useEffect(() => {
    const interval = setInterval(fetchAnalytics, 60_000);
    return () => clearInterval(interval);
  }, [fetchAnalytics]);

  // Fetch SKU detail
  async function openProductDetail(productId: string) {
    if (!storeId) return;
    try {
      const res = await apiRequest<ProductDetail>(
        `/api/stores/${storeId}/products/${productId}`
      );
      setSelectedProduct(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load product detail');
    }
  }

  function handleLogout() {
    logout();
    navigate('/login');
  }

  if (loading && !summary) {
    return (
      <div style={styles.container}>
        <div style={styles.loadingMessage}>Loading analytics...</div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <header style={styles.header}>
        <h1 style={styles.headerTitle}>Sales Analytics</h1>
        <div style={styles.headerRight}>
          <button onClick={() => navigate('/dashboard')} style={styles.navButton}>
            Dashboard
          </button>
          <span style={styles.userName}>{user?.name}</span>
          <button onClick={handleLogout} style={styles.logoutButton}>
            Log Out
          </button>
        </div>
      </header>

      <main style={styles.main}>
        {error && <div style={styles.error}>{error}</div>}

        {/* Date Range Selector */}
        <section style={styles.dateRangeSection}>
          <span style={styles.dateRangeLabel}>Date Range:</span>
          <div style={styles.dateRangeButtons}>
            {(['today', '7d', '30d'] as DateRangeFilter[]).map((r) => (
              <button
                key={r}
                onClick={() => setDateRange(r)}
                style={r === dateRange ? styles.dateRangeActive : styles.dateRangeBtn}
                aria-pressed={r === dateRange}
              >
                {r === 'today' ? 'Today' : r === '7d' ? '7 Days' : '30 Days'}
              </button>
            ))}
          </div>
        </section>

        {/* Summary Cards */}
        {summary && (
          <section style={styles.summaryCards} aria-label="Sales summary">
            <div style={styles.summaryCard}>
              <div style={styles.summaryValue}>{formatCurrency(summary.totalRevenue)}</div>
              <div style={styles.summaryLabel}>Total Revenue</div>
            </div>
            <div style={styles.summaryCard}>
              <div style={styles.summaryValue}>{formatNumber(summary.totalUnits)}</div>
              <div style={styles.summaryLabel}>Units Sold</div>
            </div>
            <div style={styles.summaryCard}>
              <div style={styles.summaryValue}>{formatCurrency(summary.averageTransactionValue)}</div>
              <div style={styles.summaryLabel}>Avg Transaction</div>
            </div>
            <div style={styles.summaryCard}>
              <div style={styles.summaryValue}>{formatNumber(summary.uniqueSkus)}</div>
              <div style={styles.summaryLabel}>Unique SKUs</div>
            </div>
          </section>
        )}

        {/* Daily Trends Chart */}
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>Daily Sales Trends</h2>
          {trends.length > 0 ? (
            <div style={styles.chartContainer} role="table" aria-label="Daily sales trends">
              <div style={styles.chartHeader} role="row">
                <span style={styles.chartHeaderCell} role="columnheader">Date</span>
                <span style={styles.chartHeaderCell} role="columnheader">Day</span>
                <span style={styles.chartHeaderCell} role="columnheader">Revenue</span>
                <span style={styles.chartHeaderCell} role="columnheader">Units</span>
                <span style={{ ...styles.chartHeaderCell, flex: 2 }} role="columnheader">Revenue Bar</span>
              </div>
              {trends.map((trend) => {
                const maxRevenue = Math.max(...trends.map((t) => t.revenue), 1);
                const barWidth = (trend.revenue / maxRevenue) * 100;
                const isWeekend = trend.dayOfWeek === 0 || trend.dayOfWeek === 6;

                return (
                  <div
                    key={trend.date}
                    style={{
                      ...styles.chartRow,
                      backgroundColor: isWeekend ? '#f0f9f4' : 'transparent',
                    }}
                    role="row"
                  >
                    <span style={styles.chartCell} role="cell">{trend.date}</span>
                    <span
                      style={{
                        ...styles.chartCell,
                        fontWeight: isWeekend ? 600 : 400,
                        color: isWeekend ? '#2d6a4f' : '#666',
                      }}
                      role="cell"
                    >
                      {DAY_NAMES[trend.dayOfWeek]}
                    </span>
                    <span style={styles.chartCell} role="cell">{formatCurrency(trend.revenue)}</span>
                    <span style={styles.chartCell} role="cell">{trend.unitsSold}</span>
                    <span style={{ ...styles.chartCell, flex: 2 }} role="cell">
                      <div style={styles.barContainer}>
                        <div
                          style={{
                            ...styles.bar,
                            width: `${barWidth}%`,
                            backgroundColor: isWeekend ? '#2d6a4f' : '#74c69d',
                          }}
                        />
                      </div>
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p style={styles.emptyState}>No trend data available for this period.</p>
          )}
        </section>

        {/* Top Products Table */}
        <section style={styles.section}>
          <div style={styles.sectionHeader}>
            <h2 style={styles.sectionTitle}>Top Products</h2>
            <div style={styles.toggleGroup}>
              <button
                onClick={() => setSortMode('revenue')}
                style={sortMode === 'revenue' ? styles.toggleActive : styles.toggleBtn}
                aria-pressed={sortMode === 'revenue'}
              >
                By Revenue
              </button>
              <button
                onClick={() => setSortMode('units')}
                style={sortMode === 'units' ? styles.toggleActive : styles.toggleBtn}
                aria-pressed={sortMode === 'units'}
              >
                By Units
              </button>
            </div>
          </div>
          {topProducts.length > 0 ? (
            <table style={styles.table} aria-label="Top products">
              <thead>
                <tr>
                  <th style={styles.th}>Rank</th>
                  <th style={styles.th}>Product</th>
                  <th style={styles.th}>Revenue</th>
                  <th style={styles.th}>Units Sold</th>
                </tr>
              </thead>
              <tbody>
                {topProducts.map((product) => (
                  <tr
                    key={product.productId}
                    style={styles.tableRow}
                    onClick={() => openProductDetail(product.productId)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        openProductDetail(product.productId);
                      }
                    }}
                  >
                    <td style={styles.td}>{product.rank}</td>
                    <td style={{ ...styles.td, fontWeight: 500 }}>{product.productName}</td>
                    <td style={styles.td}>{formatCurrency(product.totalRevenue)}</td>
                    <td style={styles.td}>{formatNumber(product.totalUnitsSold)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p style={styles.emptyState}>No product data available.</p>
          )}
        </section>

        {/* Dead Stock */}
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>Dead Stock (No Sales in 30 Days)</h2>
          {deadStock.length > 0 ? (
            <table style={styles.table} aria-label="Dead stock items">
              <thead>
                <tr>
                  <th style={styles.th}>Product</th>
                  <th style={styles.th}>Last Sale Date</th>
                  <th style={styles.th}>Days Since Last Sale</th>
                  <th style={styles.th}>Est. Stock</th>
                </tr>
              </thead>
              <tbody>
                {deadStock.map((item) => (
                  <tr
                    key={item.productId}
                    style={styles.tableRow}
                    onClick={() => openProductDetail(item.productId)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        openProductDetail(item.productId);
                      }
                    }}
                  >
                    <td style={{ ...styles.td, fontWeight: 500 }}>{item.productName}</td>
                    <td style={styles.td}>{item.lastSaleDate ?? 'Never'}</td>
                    <td style={styles.td}>{item.daysSinceLastSale}</td>
                    <td style={styles.td}>{item.estimatedStock}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p style={styles.emptyState}>No dead stock items found. All products have recent sales!</p>
          )}
        </section>
      </main>

      {/* SKU Detail Modal */}
      {selectedProduct && (
        <div style={styles.modalOverlay} onClick={() => setSelectedProduct(null)} role="dialog" aria-label="Product detail">
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h2 style={styles.modalTitle}>{selectedProduct.product.name}</h2>
              <button
                onClick={() => setSelectedProduct(null)}
                style={styles.modalClose}
                aria-label="Close modal"
              >
                ✕
              </button>
            </div>

            <div style={styles.modalBody}>
              {/* Product Info */}
              <div style={styles.modalInfoGrid}>
                <div>
                  <span style={styles.modalLabel}>SKU:</span>
                  <span style={styles.modalValue}>
                    {selectedProduct.product.skuIdentifier ?? 'N/A'}
                  </span>
                </div>
                <div>
                  <span style={styles.modalLabel}>Category:</span>
                  <span style={styles.modalValue}>
                    {selectedProduct.product.category ?? 'N/A'}
                  </span>
                </div>
                <div>
                  <span style={styles.modalLabel}>Supplier:</span>
                  <span style={styles.modalValue}>
                    {selectedProduct.product.supplierName ?? 'N/A'}
                  </span>
                </div>
                <div>
                  <span style={styles.modalLabel}>Est. Stock:</span>
                  <span style={styles.modalValue}>
                    {selectedProduct.product.estimatedStock}
                  </span>
                </div>
              </div>

              {/* Summary stats */}
              <div style={styles.modalStats}>
                <div style={styles.modalStat}>
                  <div style={styles.modalStatValue}>
                    {formatCurrency(selectedProduct.analytics.totalRevenue)}
                  </div>
                  <div style={styles.modalStatLabel}>Total Revenue (30d)</div>
                </div>
                <div style={styles.modalStat}>
                  <div style={styles.modalStatValue}>
                    {formatNumber(selectedProduct.analytics.totalUnitsSold)}
                  </div>
                  <div style={styles.modalStatLabel}>Units Sold (30d)</div>
                </div>
                <div style={styles.modalStat}>
                  <div style={styles.modalStatValue}>
                    {selectedProduct.analytics.averageDailyVelocity}
                  </div>
                  <div style={styles.modalStatLabel}>Avg Daily Velocity</div>
                </div>
              </div>

              {/* Daily History */}
              <h3 style={styles.modalSubtitle}>Daily Sales History</h3>
              {selectedProduct.analytics.dailyHistory.length > 0 ? (
                <div style={styles.historyTable}>
                  <div style={styles.historyHeader}>
                    <span style={styles.historyCell}>Date</span>
                    <span style={styles.historyCell}>Units</span>
                    <span style={styles.historyCell}>Revenue</span>
                  </div>
                  {selectedProduct.analytics.dailyHistory.map((day) => (
                    <div key={day.date} style={styles.historyRow}>
                      <span style={styles.historyCell}>{day.date}</span>
                      <span style={styles.historyCell}>{day.unitsSold}</span>
                      <span style={styles.historyCell}>{formatCurrency(day.revenue)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={styles.emptyState}>No sales data in the last 30 days.</p>
              )}
            </div>
          </div>
        </div>
      )}
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
    gap: '1rem',
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
    maxWidth: '1000px',
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

  // Date Range
  dateRangeSection: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    marginBottom: '1.5rem',
  },
  dateRangeLabel: {
    fontSize: '0.85rem',
    color: '#555',
    fontWeight: 500,
  },
  dateRangeButtons: {
    display: 'flex',
    gap: '0.25rem',
  },
  dateRangeBtn: {
    padding: '0.35rem 0.75rem',
    backgroundColor: '#fff',
    color: '#555',
    border: '1px solid #ddd',
    borderRadius: '4px',
    fontSize: '0.8rem',
    cursor: 'pointer',
  },
  dateRangeActive: {
    padding: '0.35rem 0.75rem',
    backgroundColor: '#2d6a4f',
    color: '#fff',
    border: '1px solid #2d6a4f',
    borderRadius: '4px',
    fontSize: '0.8rem',
    cursor: 'pointer',
  },

  // Summary Cards
  summaryCards: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '1rem',
    marginBottom: '2rem',
  },
  summaryCard: {
    backgroundColor: '#fff',
    borderRadius: '8px',
    padding: '1.25rem',
    textAlign: 'center',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  },
  summaryValue: {
    fontSize: '1.3rem',
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

  // Sections
  section: {
    backgroundColor: '#fff',
    borderRadius: '8px',
    padding: '1.25rem',
    marginBottom: '1.5rem',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '1rem',
  },
  sectionTitle: {
    fontSize: '1rem',
    fontWeight: 600,
    color: '#333',
    margin: '0 0 1rem 0',
  },

  // Toggle buttons
  toggleGroup: {
    display: 'flex',
    gap: '0.25rem',
  },
  toggleBtn: {
    padding: '0.3rem 0.6rem',
    backgroundColor: '#f5f5f5',
    color: '#555',
    border: '1px solid #ddd',
    borderRadius: '4px',
    fontSize: '0.75rem',
    cursor: 'pointer',
  },
  toggleActive: {
    padding: '0.3rem 0.6rem',
    backgroundColor: '#2d6a4f',
    color: '#fff',
    border: '1px solid #2d6a4f',
    borderRadius: '4px',
    fontSize: '0.75rem',
    cursor: 'pointer',
  },

  // Chart (bar visualization)
  chartContainer: {
    fontSize: '0.8rem',
    overflowX: 'auto',
  },
  chartHeader: {
    display: 'flex',
    borderBottom: '2px solid #eee',
    padding: '0.4rem 0',
    fontWeight: 600,
    color: '#555',
  },
  chartHeaderCell: {
    flex: 1,
    padding: '0 0.25rem',
  },
  chartRow: {
    display: 'flex',
    padding: '0.35rem 0',
    borderBottom: '1px solid #f5f5f5',
    alignItems: 'center',
  },
  chartCell: {
    flex: 1,
    padding: '0 0.25rem',
    color: '#444',
  },
  barContainer: {
    height: '14px',
    backgroundColor: '#f0f0f0',
    borderRadius: '3px',
    overflow: 'hidden',
  },
  bar: {
    height: '100%',
    borderRadius: '3px',
    transition: 'width 0.2s ease',
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
    cursor: 'pointer',
    transition: 'background-color 0.15s',
  },
  emptyState: {
    color: '#888',
    fontSize: '0.85rem',
    textAlign: 'center',
    padding: '1.5rem',
  },

  // Modal
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '2rem',
  },
  modal: {
    backgroundColor: '#fff',
    borderRadius: '12px',
    maxWidth: '600px',
    width: '100%',
    maxHeight: '80vh',
    overflow: 'auto',
    boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '1.25rem 1.5rem',
    borderBottom: '1px solid #eee',
  },
  modalTitle: {
    fontSize: '1.1rem',
    fontWeight: 600,
    margin: 0,
    color: '#1a1a2e',
  },
  modalClose: {
    backgroundColor: 'transparent',
    border: 'none',
    fontSize: '1.2rem',
    cursor: 'pointer',
    color: '#888',
    padding: '0.25rem',
  },
  modalBody: {
    padding: '1.5rem',
  },
  modalInfoGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '0.75rem',
    marginBottom: '1.5rem',
  },
  modalLabel: {
    fontSize: '0.75rem',
    color: '#888',
    marginRight: '0.4rem',
  },
  modalValue: {
    fontSize: '0.85rem',
    color: '#333',
    fontWeight: 500,
  },
  modalStats: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '0.75rem',
    marginBottom: '1.5rem',
  },
  modalStat: {
    textAlign: 'center',
    padding: '0.75rem',
    backgroundColor: '#f9fafb',
    borderRadius: '6px',
  },
  modalStatValue: {
    fontSize: '1.1rem',
    fontWeight: 700,
    color: '#2d6a4f',
  },
  modalStatLabel: {
    fontSize: '0.7rem',
    color: '#888',
    marginTop: '0.2rem',
  },
  modalSubtitle: {
    fontSize: '0.9rem',
    fontWeight: 600,
    color: '#333',
    margin: '0 0 0.75rem 0',
  },

  // History table in modal
  historyTable: {
    fontSize: '0.8rem',
    maxHeight: '200px',
    overflowY: 'auto',
  },
  historyHeader: {
    display: 'flex',
    borderBottom: '2px solid #eee',
    padding: '0.4rem 0',
    fontWeight: 600,
    color: '#555',
  },
  historyRow: {
    display: 'flex',
    padding: '0.3rem 0',
    borderBottom: '1px solid #f5f5f5',
  },
  historyCell: {
    flex: 1,
    padding: '0 0.25rem',
    color: '#444',
  },
};
