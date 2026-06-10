import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../api/client';

interface DuplicateCandidate {
  id: string;
  storeId: string;
  productAId: string;
  productBId: string;
  productAName: string;
  productBName: string;
  similarityScore: number;
  status: string;
  detectedAt: string;
  resolvedAt: string | null;
}

interface DuplicatesResponse {
  duplicates: DuplicateCandidate[];
}

interface ResolveResponse {
  message: string;
  duplicateId: string;
  action: string;
}

export function DataQuality() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  // Duplicate review state
  const [duplicates, setDuplicates] = useState<DuplicateCandidate[]>([]);
  const [duplicatesLoading, setDuplicatesLoading] = useState(true);
  const [duplicatesError, setDuplicatesError] = useState<string | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  // Quality score state (placeholder - would come from a backend endpoint)
  const [qualityScore] = useState({
    overall: 78,
    completeness: 85,
    consistency: 72,
    validity: 77,
    issues: [
      'Some product names have inconsistent capitalization',
      '3 rows flagged with dates in the future',
      '12 rows missing optional category field',
    ],
  });

  const fetchDuplicates = useCallback(async () => {
    if (!user?.storeId) return;
    setDuplicatesLoading(true);
    setDuplicatesError(null);
    try {
      const response = await apiRequest<DuplicatesResponse>(
        `/api/stores/${user.storeId}/duplicates`
      );
      setDuplicates(response.duplicates);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load duplicates';
      setDuplicatesError(message);
    } finally {
      setDuplicatesLoading(false);
    }
  }, [user?.storeId]);

  useEffect(() => {
    fetchDuplicates();
  }, [fetchDuplicates]);

  async function handleResolve(duplicateId: string, action: 'merge' | 'reject') {
    if (!user?.storeId) return;
    setResolvingId(duplicateId);
    try {
      await apiRequest<ResolveResponse>(
        `/api/stores/${user.storeId}/duplicates/${duplicateId}/resolve`,
        { method: 'POST', body: { action } }
      );
      setDuplicates((prev) => prev.filter((d) => d.id !== duplicateId));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to resolve duplicate';
      alert(message);
    } finally {
      setResolvingId(null);
    }
  }

  function handleLogout() {
    logout();
    navigate('/login');
  }

  function getScoreColor(score: number): string {
    if (score >= 80) return '#2d6a4f';
    if (score >= 60) return '#e6a817';
    return '#d62828';
  }

  function getSimilarityBadgeColor(score: number): string {
    if (score >= 0.95) return '#d62828';
    if (score >= 0.9) return '#e6a817';
    return '#2d6a4f';
  }

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.headerTitle}>Grocery Inventory Intelligence</h1>
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
        <h2 style={styles.pageTitle}>Data Quality</h2>
        <p style={styles.pageDescription}>
          Review data quality metrics, resolve duplicate products, and correct flagged entries.
        </p>

        {/* Quality Score Display */}
        <section style={styles.section}>
          <h3 style={styles.sectionTitle}>📊 Quality Score</h3>
          <div style={styles.scoreContainer}>
            <div style={styles.overallScoreBox}>
              <span
                style={{
                  ...styles.overallScoreNumber,
                  color: getScoreColor(qualityScore.overall),
                }}
              >
                {qualityScore.overall}
              </span>
              <span style={styles.overallScoreLabel}>Overall Score</span>
            </div>
            <div style={styles.subScores}>
              <div style={styles.subScoreItem}>
                <div style={styles.subScoreHeader}>
                  <span style={styles.subScoreLabel}>Completeness</span>
                  <span style={styles.subScoreValue}>{qualityScore.completeness}%</span>
                </div>
                <div style={styles.progressBar}>
                  <div
                    style={{
                      ...styles.progressFill,
                      width: `${qualityScore.completeness}%`,
                      backgroundColor: getScoreColor(qualityScore.completeness),
                    }}
                  />
                </div>
              </div>
              <div style={styles.subScoreItem}>
                <div style={styles.subScoreHeader}>
                  <span style={styles.subScoreLabel}>Consistency</span>
                  <span style={styles.subScoreValue}>{qualityScore.consistency}%</span>
                </div>
                <div style={styles.progressBar}>
                  <div
                    style={{
                      ...styles.progressFill,
                      width: `${qualityScore.consistency}%`,
                      backgroundColor: getScoreColor(qualityScore.consistency),
                    }}
                  />
                </div>
              </div>
              <div style={styles.subScoreItem}>
                <div style={styles.subScoreHeader}>
                  <span style={styles.subScoreLabel}>Validity</span>
                  <span style={styles.subScoreValue}>{qualityScore.validity}%</span>
                </div>
                <div style={styles.progressBar}>
                  <div
                    style={{
                      ...styles.progressFill,
                      width: `${qualityScore.validity}%`,
                      backgroundColor: getScoreColor(qualityScore.validity),
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
          {qualityScore.issues.length > 0 && (
            <div style={styles.issuesList}>
              <h4 style={styles.issuesTitle}>Issues Detected</h4>
              <ul style={styles.issuesUl}>
                {qualityScore.issues.map((issue, idx) => (
                  <li key={idx} style={styles.issueItem}>
                    {issue}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* Duplicate Review */}
        <section style={styles.section}>
          <h3 style={styles.sectionTitle}>🔍 Duplicate Review</h3>
          {duplicatesLoading && <p style={styles.loadingText}>Loading duplicates...</p>}
          {duplicatesError && <p style={styles.errorText}>{duplicatesError}</p>}
          {!duplicatesLoading && !duplicatesError && duplicates.length === 0 && (
            <p style={styles.emptyText}>No pending duplicate candidates. Your data looks clean!</p>
          )}
          {!duplicatesLoading && !duplicatesError && duplicates.length > 0 && (
            <div style={styles.duplicatesList}>
              {duplicates.map((dup) => (
                <div key={dup.id} style={styles.duplicateCard}>
                  <div style={styles.duplicatePair}>
                    <div style={styles.productName}>{dup.productAName}</div>
                    <span style={styles.vsLabel}>vs</span>
                    <div style={styles.productName}>{dup.productBName}</div>
                  </div>
                  <div style={styles.duplicateActions}>
                    <span
                      style={{
                        ...styles.similarityBadge,
                        backgroundColor: getSimilarityBadgeColor(dup.similarityScore),
                      }}
                    >
                      {Math.round(dup.similarityScore * 100)}% match
                    </span>
                    <button
                      style={styles.mergeButton}
                      disabled={resolvingId === dup.id}
                      onClick={() => handleResolve(dup.id, 'merge')}
                    >
                      {resolvingId === dup.id ? '...' : 'Merge'}
                    </button>
                    <button
                      style={styles.rejectButton}
                      disabled={resolvingId === dup.id}
                      onClick={() => handleResolve(dup.id, 'reject')}
                    >
                      {resolvingId === dup.id ? '...' : 'Reject'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Flagged Dates */}
        <section style={styles.section}>
          <h3 style={styles.sectionTitle}>📅 Flagged Dates</h3>
          <div style={styles.placeholderBox}>
            <p style={styles.placeholderText}>
              Rows with dates in the future or more than 5 years in the past will appear here
              for manual correction. This feature is coming soon.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}

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
  navButton: {
    padding: '0.4rem 0.75rem',
    backgroundColor: 'transparent',
    color: '#2d6a4f',
    border: '1px solid #2d6a4f',
    borderRadius: '4px',
    fontSize: '0.8rem',
    cursor: 'pointer',
    fontWeight: 500,
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
    maxWidth: '900px',
    margin: '0 auto',
    padding: '2rem',
  },
  pageTitle: {
    fontSize: '1.5rem',
    fontWeight: 600,
    color: '#1a1a2e',
    margin: '0 0 0.5rem 0',
  },
  pageDescription: {
    color: '#666',
    fontSize: '0.9rem',
    margin: '0 0 2rem 0',
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: '8px',
    padding: '1.5rem',
    marginBottom: '1.5rem',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  },
  sectionTitle: {
    fontSize: '1.1rem',
    fontWeight: 600,
    color: '#333',
    margin: '0 0 1rem 0',
  },
  scoreContainer: {
    display: 'flex',
    gap: '2rem',
    alignItems: 'flex-start',
    flexWrap: 'wrap' as const,
  },
  overallScoreBox: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    minWidth: '120px',
  },
  overallScoreNumber: {
    fontSize: '3rem',
    fontWeight: 700,
    lineHeight: 1,
  },
  overallScoreLabel: {
    fontSize: '0.8rem',
    color: '#666',
    marginTop: '0.25rem',
  },
  subScores: {
    flex: 1,
    minWidth: '200px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.75rem',
  },
  subScoreItem: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.25rem',
  },
  subScoreHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  subScoreLabel: {
    fontSize: '0.85rem',
    color: '#555',
  },
  subScoreValue: {
    fontSize: '0.85rem',
    fontWeight: 600,
    color: '#333',
  },
  progressBar: {
    height: '8px',
    backgroundColor: '#e9ecef',
    borderRadius: '4px',
    overflow: 'hidden' as const,
  },
  progressFill: {
    height: '100%',
    borderRadius: '4px',
    transition: 'width 0.3s ease',
  },
  issuesList: {
    marginTop: '1rem',
    borderTop: '1px solid #eee',
    paddingTop: '1rem',
  },
  issuesTitle: {
    fontSize: '0.9rem',
    fontWeight: 600,
    color: '#555',
    margin: '0 0 0.5rem 0',
  },
  issuesUl: {
    margin: 0,
    paddingLeft: '1.25rem',
  },
  issueItem: {
    fontSize: '0.8rem',
    color: '#666',
    marginBottom: '0.25rem',
    lineHeight: '1.4',
  },
  loadingText: {
    color: '#666',
    fontSize: '0.85rem',
  },
  errorText: {
    color: '#d62828',
    fontSize: '0.85rem',
  },
  emptyText: {
    color: '#666',
    fontSize: '0.85rem',
    fontStyle: 'italic',
  },
  duplicatesList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.75rem',
  },
  duplicateCard: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '1rem',
    border: '1px solid #e9ecef',
    borderRadius: '6px',
    flexWrap: 'wrap' as const,
    gap: '0.75rem',
  },
  duplicatePair: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    flexWrap: 'wrap' as const,
  },
  productName: {
    fontSize: '0.9rem',
    fontWeight: 500,
    color: '#333',
    padding: '0.25rem 0.5rem',
    backgroundColor: '#f8f9fa',
    borderRadius: '4px',
  },
  vsLabel: {
    fontSize: '0.75rem',
    color: '#999',
    fontStyle: 'italic',
  },
  duplicateActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  similarityBadge: {
    fontSize: '0.75rem',
    color: '#fff',
    padding: '0.2rem 0.5rem',
    borderRadius: '12px',
    fontWeight: 600,
  },
  mergeButton: {
    padding: '0.35rem 0.75rem',
    backgroundColor: '#2d6a4f',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    fontSize: '0.8rem',
    fontWeight: 500,
    cursor: 'pointer',
  },
  rejectButton: {
    padding: '0.35rem 0.75rem',
    backgroundColor: 'transparent',
    color: '#d62828',
    border: '1px solid #d62828',
    borderRadius: '4px',
    fontSize: '0.8rem',
    fontWeight: 500,
    cursor: 'pointer',
  },
  placeholderBox: {
    padding: '1.5rem',
    backgroundColor: '#f8f9fa',
    borderRadius: '6px',
    border: '1px dashed #ccc',
    textAlign: 'center' as const,
  },
  placeholderText: {
    color: '#666',
    fontSize: '0.85rem',
    margin: 0,
  },
};
