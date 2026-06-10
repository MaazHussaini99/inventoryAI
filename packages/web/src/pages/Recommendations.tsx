/**
 * AI Recommendations Dashboard Page
 *
 * Displays three recommendation categories:
 * - "Restock Now" (up to 10 items)
 * - "Reduce or Remove" (up to 10 items)
 * - "Promote This Week" (up to 5 items)
 *
 * Each recommendation shows confidence badge and explanation text.
 * Shows "insufficient data" message when store has < 14 days of history.
 *
 * Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5, 6.6
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../api/client';

// ─── Types ─────────────────────────────────────────────────────────────────────

type ConfidenceLevel = 'low' | 'medium' | 'high';

interface Recommendation {
  productId: string;
  productName: string;
  type: 'restock' | 'reduce' | 'promote';
  confidence: ConfidenceLevel;
  explanation: string;
  supportingMetrics: Record<string, number>;
}

interface RecommendationsData {
  restockNow: Recommendation[];
  reduceOrRemove: Recommendation[];
  promoteThisWeek: Recommendation[];
  generatedAt: string;
}

interface RecommendationsResponse {
  insufficientData: boolean;
  message?: string;
  progress?: number;
  recommendations: RecommendationsData | null;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function getConfidenceColor(confidence: ConfidenceLevel): string {
  switch (confidence) {
    case 'high':
      return '#16a34a';
    case 'medium':
      return '#ca8a04';
    case 'low':
      return '#9ca3af';
  }
}

function getConfidenceBg(confidence: ConfidenceLevel): string {
  switch (confidence) {
    case 'high':
      return '#dcfce7';
    case 'medium':
      return '#fef9c3';
    case 'low':
      return '#f3f4f6';
  }
}

function getCategoryIcon(type: 'restock' | 'reduce' | 'promote'): string {
  switch (type) {
    case 'restock':
      return '📦';
    case 'reduce':
      return '📉';
    case 'promote':
      return '⭐';
  }
}

function getCategoryTitle(type: 'restock' | 'reduce' | 'promote'): string {
  switch (type) {
    case 'restock':
      return 'Restock Now';
    case 'reduce':
      return 'Reduce or Remove';
    case 'promote':
      return 'Promote This Week';
  }
}

function getCategoryBorder(type: 'restock' | 'reduce' | 'promote'): string {
  switch (type) {
    case 'restock':
      return '#dc2626';
    case 'reduce':
      return '#ca8a04';
    case 'promote':
      return '#16a34a';
  }
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function Recommendations() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const storeId = user?.storeId;

  const [data, setData] = useState<RecommendationsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRecommendations = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    setError(null);

    try {
      const res = await apiRequest<RecommendationsResponse>(
        `/api/stores/${storeId}/recommendations`
      );
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load recommendations');
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    fetchRecommendations();
  }, [fetchRecommendations]);

  async function handleGenerate() {
    if (!storeId) return;
    setGenerating(true);
    setError(null);

    try {
      const res = await apiRequest<RecommendationsResponse>(
        `/api/stores/${storeId}/recommendations/generate`,
        { method: 'POST' }
      );
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate recommendations');
    } finally {
      setGenerating(false);
    }
  }

  function handleLogout() {
    logout();
    navigate('/login');
  }

  if (loading && !data) {
    return (
      <div style={styles.container}>
        <div style={styles.loadingMessage}>Loading recommendations...</div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <header style={styles.header}>
        <h1 style={styles.headerTitle}>AI Recommendations</h1>
        <div style={styles.headerRight}>
          <button onClick={() => navigate('/dashboard')} style={styles.navButton}>
            Dashboard
          </button>
          <button onClick={() => navigate('/analytics')} style={styles.navButton}>
            Analytics
          </button>
          <button onClick={() => navigate('/inventory')} style={styles.navButton}>
            Inventory
          </button>
          <span style={styles.userName}>{user?.name}</span>
          <button onClick={handleLogout} style={styles.logoutButton}>
            Log Out
          </button>
        </div>
      </header>

      <main style={styles.main}>
        {error && <div style={styles.error}>{error}</div>}

        {/* Insufficient Data Message */}
        {data?.insufficientData && (
          <div style={styles.insufficientData} role="alert">
            <div style={styles.insufficientIcon}>📊</div>
            <h2 style={styles.insufficientTitle}>Insufficient Data</h2>
            <p style={styles.insufficientText}>{data.message}</p>
            {data.progress !== undefined && (
              <div style={styles.progressContainer}>
                <div style={styles.progressBar}>
                  <div
                    style={{
                      ...styles.progressFill,
                      width: `${Math.min(data.progress, 100)}%`,
                    }}
                  />
                </div>
                <span style={styles.progressLabel}>{data.progress}% toward minimum data</span>
              </div>
            )}
          </div>
        )}

        {/* Recommendations Content */}
        {data && !data.insufficientData && data.recommendations && (
          <>
            {/* Generate Button */}
            <div style={styles.actionBar}>
              <button
                onClick={handleGenerate}
                disabled={generating}
                style={generating ? styles.generateBtnDisabled : styles.generateBtn}
              >
                {generating ? 'Generating...' : '🔄 Refresh Recommendations'}
              </button>
              {data.recommendations.generatedAt && (
                <span style={styles.generatedAt}>
                  Last generated: {new Date(data.recommendations.generatedAt).toLocaleString()}
                </span>
              )}
            </div>

            {/* Category Cards */}
            <div style={styles.categoriesGrid}>
              <CategoryCard
                type="restock"
                recommendations={data.recommendations.restockNow}
              />
              <CategoryCard
                type="reduce"
                recommendations={data.recommendations.reduceOrRemove}
              />
              <CategoryCard
                type="promote"
                recommendations={data.recommendations.promoteThisWeek}
              />
            </div>
          </>
        )}
      </main>
    </div>
  );
}

// ─── Category Card Component ───────────────────────────────────────────────────

interface CategoryCardProps {
  type: 'restock' | 'reduce' | 'promote';
  recommendations: Recommendation[];
}

function CategoryCard({ type, recommendations }: CategoryCardProps) {
  const maxItems = type === 'promote' ? 5 : 10;

  return (
    <div
      style={{ ...styles.categoryCard, borderTop: `3px solid ${getCategoryBorder(type)}` }}
      aria-label={`${getCategoryTitle(type)} recommendations`}
    >
      <div style={styles.categoryHeader}>
        <span style={styles.categoryIcon}>{getCategoryIcon(type)}</span>
        <h3 style={styles.categoryTitle}>{getCategoryTitle(type)}</h3>
        <span style={styles.categoryCount}>
          {recommendations.length} / {maxItems}
        </span>
      </div>

      {recommendations.length === 0 ? (
        <p style={styles.emptyCategory}>No recommendations in this category.</p>
      ) : (
        <ul style={styles.recList}>
          {recommendations.map((rec) => (
            <li key={rec.productId} style={styles.recItem}>
              <div style={styles.recHeader}>
                <span style={styles.recName}>{rec.productName}</span>
                <span
                  style={{
                    ...styles.confidenceBadge,
                    backgroundColor: getConfidenceBg(rec.confidence),
                    color: getConfidenceColor(rec.confidence),
                  }}
                >
                  {rec.confidence}
                </span>
              </div>
              <p style={styles.recExplanation}>{rec.explanation}</p>
            </li>
          ))}
        </ul>
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

  // Insufficient Data
  insufficientData: {
    backgroundColor: '#fff',
    borderRadius: '8px',
    padding: '3rem 2rem',
    textAlign: 'center',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  },
  insufficientIcon: {
    fontSize: '3rem',
    marginBottom: '1rem',
  },
  insufficientTitle: {
    fontSize: '1.25rem',
    fontWeight: 600,
    color: '#1a1a2e',
    marginBottom: '0.5rem',
  },
  insufficientText: {
    color: '#666',
    fontSize: '0.9rem',
    maxWidth: '500px',
    margin: '0 auto 1.5rem',
  },
  progressContainer: {
    maxWidth: '300px',
    margin: '0 auto',
  },
  progressBar: {
    width: '100%',
    height: '8px',
    backgroundColor: '#e5e7eb',
    borderRadius: '4px',
    overflow: 'hidden',
    marginBottom: '0.5rem',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#2d6a4f',
    borderRadius: '4px',
    transition: 'width 0.3s ease',
  },
  progressLabel: {
    fontSize: '0.75rem',
    color: '#888',
  },

  // Action Bar
  actionBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '1.5rem',
  },
  generateBtn: {
    padding: '0.5rem 1rem',
    backgroundColor: '#2d6a4f',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    fontSize: '0.85rem',
    fontWeight: 500,
    cursor: 'pointer',
  },
  generateBtnDisabled: {
    padding: '0.5rem 1rem',
    backgroundColor: '#9ca3af',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    fontSize: '0.85rem',
    fontWeight: 500,
    cursor: 'not-allowed',
  },
  generatedAt: {
    fontSize: '0.8rem',
    color: '#888',
  },

  // Categories Grid
  categoriesGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr',
    gap: '1.25rem',
  },

  // Category Card
  categoryCard: {
    backgroundColor: '#fff',
    borderRadius: '8px',
    padding: '1.25rem',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  },
  categoryHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    marginBottom: '1rem',
    paddingBottom: '0.75rem',
    borderBottom: '1px solid #f0f0f0',
  },
  categoryIcon: {
    fontSize: '1.25rem',
  },
  categoryTitle: {
    fontSize: '0.9rem',
    fontWeight: 600,
    color: '#1a1a2e',
    margin: 0,
    flex: 1,
  },
  categoryCount: {
    fontSize: '0.7rem',
    color: '#888',
    backgroundColor: '#f3f4f6',
    padding: '0.15rem 0.4rem',
    borderRadius: '3px',
  },
  emptyCategory: {
    color: '#999',
    fontSize: '0.8rem',
    textAlign: 'center',
    padding: '1.5rem 0',
    fontStyle: 'italic',
  },

  // Recommendation List
  recList: {
    listStyle: 'none',
    padding: 0,
    margin: 0,
  },
  recItem: {
    padding: '0.75rem 0',
    borderBottom: '1px solid #f8f8f8',
  },
  recHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '0.25rem',
  },
  recName: {
    fontSize: '0.8rem',
    fontWeight: 500,
    color: '#333',
  },
  confidenceBadge: {
    display: 'inline-block',
    padding: '0.1rem 0.4rem',
    borderRadius: '3px',
    fontSize: '0.65rem',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.3px',
  },
  recExplanation: {
    fontSize: '0.75rem',
    color: '#666',
    margin: 0,
    lineHeight: 1.4,
  },
};
