/**
 * Reorder Dashboard Page
 *
 * Displays urgency-sorted reorder list showing product, current stock,
 * reorder point, suggested quantity, and estimated stockout date.
 * Allows configuring lead time, service level, and review period per product.
 *
 * Validates: Requirements 8.1, 8.3, 8.4, 8.5, 8.6
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../api/client';

type Urgency = 'critical' | 'high' | 'medium' | 'low';

interface ReorderItem {
  productId: string;
  productName: string;
  reorderPoint: number;
  safetyStock: number;
  suggestedOrderQty: number;
  leadTimeDays: number;
  serviceLevel: number;
  reviewPeriodDays: number;
  averageDailySales: number;
  currentStock: number;
  daysUntilStockout: number | null;
  urgency: Urgency;
}

interface ReorderResponse {
  storeId: string;
  items: ReorderItem[];
  summary: { total: number; critical: number; high: number; medium: number; low: number };
  generatedAt: string;
}

interface ConfigModal {
  productId: string;
  productName: string;
  leadTimeDays: number;
  serviceLevel: number;
  reviewPeriodDays: number;
}

function getUrgencyColor(u: Urgency): string {
  return u === 'critical' ? '#dc2626' : u === 'high' ? '#ea580c' : u === 'medium' ? '#ca8a04' : '#16a34a';
}
function getUrgencyBg(u: Urgency): string {
  return u === 'critical' ? '#fee2e2' : u === 'high' ? '#ffedd5' : u === 'medium' ? '#fef9c3' : '#dcfce7';
}

export function Reorder() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const storeId = user?.storeId;

  const [data, setData] = useState<ReorderResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [configModal, setConfigModal] = useState<ConfigModal | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchReorder = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<ReorderResponse>(`/api/stores/${storeId}/reorder`);
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load reorder data');
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => { fetchReorder(); }, [fetchReorder]);

  async function saveConfig() {
    if (!storeId || !configModal) return;
    setSaving(true);
    try {
      await apiRequest(`/api/stores/${storeId}/products/${configModal.productId}/reorder-config`, {
        method: 'PUT',
        body: { leadTimeDays: configModal.leadTimeDays, serviceLevel: configModal.serviceLevel, reviewPeriodDays: configModal.reviewPeriodDays },
      });
      setConfigModal(null);
      await fetchReorder();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save configuration');
    } finally {
      setSaving(false);
    }
  }

  if (loading && !data) {
    return <div style={{ minHeight: '100vh', backgroundColor: '#f5f7fa', padding: '3rem', textAlign: 'center', color: '#666' }}>Loading reorder data...</div>;
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f5f7fa' }}>
      <header style={{ backgroundColor: '#fff', padding: '1rem 2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #eee', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        <h1 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#1a1a2e', margin: 0 }}>Reorder Management</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button onClick={() => navigate('/dashboard')} style={{ padding: '0.4rem 0.75rem', backgroundColor: 'transparent', color: '#2d6a4f', border: '1px solid #2d6a4f', borderRadius: '4px', fontSize: '0.8rem', cursor: 'pointer' }}>Dashboard</button>
          <button onClick={() => navigate('/forecast')} style={{ padding: '0.4rem 0.75rem', backgroundColor: 'transparent', color: '#2d6a4f', border: '1px solid #2d6a4f', borderRadius: '4px', fontSize: '0.8rem', cursor: 'pointer' }}>Forecast</button>
          <button onClick={() => navigate('/inventory')} style={{ padding: '0.4rem 0.75rem', backgroundColor: 'transparent', color: '#2d6a4f', border: '1px solid #2d6a4f', borderRadius: '4px', fontSize: '0.8rem', cursor: 'pointer' }}>Inventory</button>
          <span style={{ fontSize: '0.85rem', color: '#555' }}>{user?.name}</span>
          <button onClick={() => { logout(); navigate('/login'); }} style={{ padding: '0.4rem 0.75rem', backgroundColor: 'transparent', color: '#666', border: '1px solid #ddd', borderRadius: '4px', fontSize: '0.8rem', cursor: 'pointer' }}>Log Out</button>
        </div>
      </header>

      <main style={{ maxWidth: '1100px', margin: '0 auto', padding: '1.5rem 2rem' }}>
        {error && <div style={{ padding: '0.75rem 1rem', backgroundColor: '#fee2e2', color: '#b91c1c', borderRadius: '6px', marginBottom: '1rem', fontSize: '0.85rem' }} role="alert">{error}</div>}

        {data && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
            {(['critical', 'high', 'medium', 'low'] as Urgency[]).map((u) => (
              <div key={u} style={{ backgroundColor: '#fff', borderRadius: '8px', padding: '1rem 1.25rem', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', borderLeft: `3px solid ${getUrgencyColor(u)}` }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1a1a2e' }}>{data.summary[u]}</div>
                <div style={{ fontSize: '0.75rem', color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{u}</div>
              </div>
            ))}
          </div>
        )}

        {data && data.items.length > 0 && (
          <div style={{ backgroundColor: '#fff', borderRadius: '8px', padding: '1.25rem', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 600, color: '#1a1a2e', margin: 0 }}>Reorder List (Urgency Sorted)</h3>
              <span style={{ fontSize: '0.75rem', color: '#888' }}>Updated: {new Date(data.generatedAt).toLocaleString()}</span>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem', borderBottom: '2px solid #eee', fontWeight: 600, color: '#555', fontSize: '0.75rem' }}>Urgency</th>
                  <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem', borderBottom: '2px solid #eee', fontWeight: 600, color: '#555', fontSize: '0.75rem' }}>Product</th>
                  <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem', borderBottom: '2px solid #eee', fontWeight: 600, color: '#555', fontSize: '0.75rem' }}>Stock</th>
                  <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem', borderBottom: '2px solid #eee', fontWeight: 600, color: '#555', fontSize: '0.75rem' }}>Reorder Pt</th>
                  <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem', borderBottom: '2px solid #eee', fontWeight: 600, color: '#555', fontSize: '0.75rem' }}>Order Qty</th>
                  <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem', borderBottom: '2px solid #eee', fontWeight: 600, color: '#555', fontSize: '0.75rem' }}>Stockout</th>
                  <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem', borderBottom: '2px solid #eee', fontWeight: 600, color: '#555', fontSize: '0.75rem' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item, idx) => (
                  <tr key={item.productId} style={idx % 2 === 0 ? { backgroundColor: '#fafafa' } : undefined}>
                    <td style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid #f0f0f0' }}>
                      <span style={{ display: 'inline-block', padding: '0.1rem 0.5rem', borderRadius: '3px', fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', backgroundColor: getUrgencyBg(item.urgency), color: getUrgencyColor(item.urgency) }}>{item.urgency}</span>
                    </td>
                    <td style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid #f0f0f0', fontWeight: 500 }}>{item.productName}</td>
                    <td style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid #f0f0f0' }}>{item.currentStock}</td>
                    <td style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid #f0f0f0' }}>{item.reorderPoint.toFixed(0)}</td>
                    <td style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid #f0f0f0', fontWeight: 600 }}>{item.suggestedOrderQty.toFixed(0)}</td>
                    <td style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid #f0f0f0' }}>{item.daysUntilStockout !== null ? `${item.daysUntilStockout.toFixed(1)}d` : '—'}</td>
                    <td style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid #f0f0f0' }}>
                      <button onClick={() => setConfigModal({ productId: item.productId, productName: item.productName, leadTimeDays: item.leadTimeDays, serviceLevel: item.serviceLevel, reviewPeriodDays: item.reviewPeriodDays })} style={{ padding: '0.2rem 0.5rem', backgroundColor: 'transparent', border: '1px solid #ddd', borderRadius: '4px', fontSize: '0.7rem', cursor: 'pointer' }} aria-label={`Configure ${item.productName}`}>⚙️</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data && data.items.length === 0 && (
          <div style={{ textAlign: 'center', padding: '3rem', backgroundColor: '#fff', borderRadius: '8px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✅</div>
            <p style={{ color: '#666', fontSize: '0.9rem' }}>All products are well-stocked. No reorder actions needed.</p>
          </div>
        )}

        {configModal && (
          <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setConfigModal(null)}>
            <div style={{ backgroundColor: '#fff', borderRadius: '8px', padding: '1.5rem', width: '400px', maxWidth: '90vw', boxShadow: '0 4px 20px rgba(0,0,0,0.15)' }} onClick={(e) => e.stopPropagation()}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#1a1a2e', margin: '0 0 1rem 0' }}>Configure: {configModal.productName}</h3>
              <div style={{ marginBottom: '0.75rem' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#555', display: 'block', marginBottom: '0.25rem' }} htmlFor="lt">Lead Time (days)</label>
                <input id="lt" type="number" min={1} max={90} value={configModal.leadTimeDays} onChange={(e) => setConfigModal({ ...configModal, leadTimeDays: parseInt(e.target.value, 10) || 1 })} style={{ width: '100%', padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px', fontSize: '0.85rem' }} />
              </div>
              <div style={{ marginBottom: '0.75rem' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#555', display: 'block', marginBottom: '0.25rem' }} htmlFor="sl">Service Level (0.5-0.99)</label>
                <input id="sl" type="number" min={0.5} max={0.99} step={0.01} value={configModal.serviceLevel} onChange={(e) => setConfigModal({ ...configModal, serviceLevel: parseFloat(e.target.value) || 0.95 })} style={{ width: '100%', padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px', fontSize: '0.85rem' }} />
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#555', display: 'block', marginBottom: '0.25rem' }} htmlFor="rp">Review Period (days)</label>
                <input id="rp" type="number" min={1} max={30} value={configModal.reviewPeriodDays} onChange={(e) => setConfigModal({ ...configModal, reviewPeriodDays: parseInt(e.target.value, 10) || 7 })} style={{ width: '100%', padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px', fontSize: '0.85rem' }} />
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                <button onClick={() => setConfigModal(null)} style={{ padding: '0.5rem 1rem', backgroundColor: 'transparent', border: '1px solid #ddd', borderRadius: '6px', fontSize: '0.8rem', cursor: 'pointer' }}>Cancel</button>
                <button onClick={saveConfig} disabled={saving} style={{ padding: '0.5rem 1rem', backgroundColor: saving ? '#9ca3af' : '#2d6a4f', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 500, cursor: saving ? 'not-allowed' : 'pointer' }}>{saving ? 'Saving...' : 'Save'}</button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
