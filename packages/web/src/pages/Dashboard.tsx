import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { TutorialOverlay } from '../components/TutorialOverlay';

export function Dashboard() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const isFirstTime = (location.state as { firstTime?: boolean })?.firstTime ?? false;
  const [showTutorial, setShowTutorial] = useState(isFirstTime);

  function handleDismissTutorial() {
    setShowTutorial(false);
    // Clear the location state so refreshing doesn't re-show tutorial
    navigate('/dashboard', { replace: true });
  }

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <div style={styles.container}>
      {showTutorial && <TutorialOverlay onDismiss={handleDismissTutorial} />}

      <header style={styles.header}>
        <h1 style={styles.headerTitle}>Grocery Inventory Intelligence</h1>
        <div style={styles.headerRight}>
          <span style={styles.userName}>{user?.name}</span>
          <button onClick={handleLogout} style={styles.logoutButton}>
            Log Out
          </button>
        </div>
      </header>

      <main style={styles.main}>
        <section style={styles.welcomeSection}>
          <h2 style={styles.welcomeTitle}>Welcome{user?.name ? `, ${user.name}` : ''}!</h2>
          <p style={styles.welcomeText}>
            Your dashboard is ready. Upload sales data to start seeing analytics,
            forecasts, and AI recommendations.
          </p>
        </section>

        <div style={styles.cards}>
          <div style={styles.card}>
            <h3 style={styles.cardTitle}>📊 Sales Analytics</h3>
            <p style={styles.cardText}>
              Upload data to see revenue trends, top products, and dead stock.
            </p>
            <button
              style={{ ...styles.uploadButton, marginTop: '0.5rem', fontSize: '0.8rem', padding: '0.4rem 0.75rem' }}
              onClick={() => navigate('/analytics')}
            >
              View Analytics
            </button>
          </div>
          <div style={styles.card}>
            <h3 style={styles.cardTitle}>📦 Inventory Status</h3>
            <p style={styles.cardText}>
              Track stock levels with color-coded indicators and reorder alerts.
            </p>
            <button
              style={{ ...styles.uploadButton, marginTop: '0.5rem', fontSize: '0.8rem', padding: '0.4rem 0.75rem' }}
              onClick={() => navigate('/inventory')}
            >
              View Inventory
            </button>
          </div>
          <div style={styles.card}>
            <h3 style={styles.cardTitle}>🤖 AI Recommendations</h3>
            <p style={styles.cardText}>
              After 14 days of data, get suggestions on what to buy, promote, or reduce.
            </p>
          </div>
          <div style={styles.card}>
            <h3 style={styles.cardTitle}>📈 Demand Forecasting</h3>
            <p style={styles.cardText}>
              7-day and 14-day demand predictions to help you plan purchases.
            </p>
          </div>
          <div style={styles.card}>
            <h3 style={styles.cardTitle}>🧹 Data Quality</h3>
            <p style={styles.cardText}>
              Review duplicates, quality scores, and fix flagged data issues.
            </p>
          </div>
        </div>

        <section style={styles.uploadSection}>
          <h3 style={styles.uploadTitle}>Get Started</h3>
          <p style={styles.uploadText}>
            Upload a CSV or Excel file with your sales data to begin.
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
            <button style={styles.uploadButton} onClick={() => navigate('/upload')}>
              Upload Data
            </button>
            <button style={styles.dataQualityButton} onClick={() => navigate('/data-quality')}>
              Data Quality
            </button>
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
  welcomeSection: {
    marginBottom: '2rem',
  },
  welcomeTitle: {
    fontSize: '1.5rem',
    fontWeight: 600,
    color: '#1a1a2e',
    margin: '0 0 0.5rem 0',
  },
  welcomeText: {
    color: '#666',
    fontSize: '0.9rem',
    margin: 0,
  },
  cards: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '1rem',
    marginBottom: '2rem',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: '8px',
    padding: '1.25rem',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  },
  cardTitle: {
    fontSize: '0.95rem',
    fontWeight: 600,
    margin: '0 0 0.5rem 0',
    color: '#333',
  },
  cardText: {
    fontSize: '0.8rem',
    color: '#666',
    margin: 0,
    lineHeight: '1.4',
  },
  uploadSection: {
    backgroundColor: '#fff',
    borderRadius: '8px',
    padding: '1.5rem',
    textAlign: 'center',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  },
  uploadTitle: {
    fontSize: '1.1rem',
    fontWeight: 600,
    color: '#333',
    margin: '0 0 0.5rem 0',
  },
  uploadText: {
    color: '#666',
    fontSize: '0.85rem',
    margin: '0 0 1rem 0',
  },
  uploadButton: {
    padding: '0.6rem 1.25rem',
    backgroundColor: '#2d6a4f',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    fontSize: '0.9rem',
    fontWeight: 500,
    cursor: 'pointer',
  },
  dataQualityButton: {
    padding: '0.6rem 1.25rem',
    backgroundColor: 'transparent',
    color: '#2d6a4f',
    border: '1px solid #2d6a4f',
    borderRadius: '4px',
    fontSize: '0.9rem',
    fontWeight: 500,
    cursor: 'pointer',
  },
};
