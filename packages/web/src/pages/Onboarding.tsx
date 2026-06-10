import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiRequest } from '../api/client';
import { useAuth } from '../context/AuthContext';

type StoreCategory = 'grocery' | 'specialty' | 'general';

interface OnboardingData {
  category: StoreCategory;
  approximateSkuCount: string;
  primarySuppliers: string;
  posSystem: string;
}

const STEPS = [
  { title: 'Store Category', description: 'What type of store do you run?' },
  { title: 'Inventory Size', description: 'Help us understand your inventory scope.' },
  { title: 'Suppliers & POS', description: 'Tell us about your supply chain.' },
];

export function Onboarding() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [step, setStep] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState<OnboardingData>({
    category: 'grocery',
    approximateSkuCount: '',
    primarySuppliers: '',
    posSystem: '',
  });

  async function handleComplete() {
    if (!user) return;

    setIsLoading(true);
    setError('');

    try {
      // Update store metadata
      await apiRequest(`/api/stores/${user.storeId}`, {
        method: 'PUT',
        body: {
          category: data.category,
          approximate_sku_count: data.approximateSkuCount ? parseInt(data.approximateSkuCount, 10) : 0,
          primary_suppliers: data.primarySuppliers
            ? data.primarySuppliers.split(',').map((s) => s.trim()).filter(Boolean)
            : [],
          pos_system: data.posSystem || null,
        },
      });

      // Complete onboarding (activates default plugins)
      await apiRequest(`/api/stores/${user.storeId}/complete-onboarding`, {
        method: 'POST',
      });

      navigate('/dashboard', { state: { firstTime: true } });
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'message' in err) {
        setError((err as { message: string }).message);
      } else {
        setError('Something went wrong. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  }

  function handleNext() {
    if (step < STEPS.length - 1) {
      setStep(step + 1);
    } else {
      handleComplete();
    }
  }

  function handleBack() {
    if (step > 0) {
      setStep(step - 1);
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>Configure Your Store</h1>

        {/* Progress indicator */}
        <div style={styles.progress}>
          {STEPS.map((s, i) => (
            <div key={s.title} style={styles.progressStep}>
              <div
                style={{
                  ...styles.progressDot,
                  backgroundColor: i <= step ? '#2d6a4f' : '#ddd',
                }}
              >
                {i + 1}
              </div>
              <span style={{
                ...styles.progressLabel,
                color: i <= step ? '#2d6a4f' : '#999',
              }}>
                {s.title}
              </span>
            </div>
          ))}
        </div>

        <div style={styles.stepContent}>
          <h2 style={styles.stepTitle}>{STEPS[step].title}</h2>
          <p style={styles.stepDescription}>{STEPS[step].description}</p>

          {error && <div style={styles.errorBanner}>{error}</div>}

          {step === 0 && (
            <div style={styles.fieldGroup}>
              <label style={styles.label}>Store Category</label>
              <div style={styles.radioGroup}>
                {([
                  { value: 'grocery', label: 'Grocery', desc: 'General grocery and supermarket' },
                  { value: 'specialty', label: 'Specialty', desc: 'Ethnic, organic, or niche market' },
                  { value: 'general', label: 'General', desc: 'Convenience or general store' },
                ] as { value: StoreCategory; label: string; desc: string }[]).map((option) => (
                  <label
                    key={option.value}
                    style={{
                      ...styles.radioOption,
                      borderColor: data.category === option.value ? '#2d6a4f' : '#ddd',
                      backgroundColor: data.category === option.value ? '#f0f7f4' : '#fff',
                    }}
                  >
                    <input
                      type="radio"
                      name="category"
                      value={option.value}
                      checked={data.category === option.value}
                      onChange={(e) => setData({ ...data, category: e.target.value as StoreCategory })}
                      style={styles.radioInput}
                    />
                    <div>
                      <div style={styles.radioLabel}>{option.label}</div>
                      <div style={styles.radioDesc}>{option.desc}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {step === 1 && (
            <div style={styles.fieldGroup}>
              <label htmlFor="skuCount" style={styles.label}>
                Approximate number of SKUs
              </label>
              <input
                id="skuCount"
                type="number"
                min="0"
                value={data.approximateSkuCount}
                onChange={(e) => setData({ ...data, approximateSkuCount: e.target.value })}
                style={styles.input}
                placeholder="e.g. 500"
              />
              <p style={styles.hint}>
                An estimate is fine. This helps us optimize your dashboard.
              </p>
            </div>
          )}

          {step === 2 && (
            <div style={styles.fieldGroup}>
              <div style={styles.field}>
                <label htmlFor="suppliers" style={styles.label}>
                  Primary Suppliers
                </label>
                <input
                  id="suppliers"
                  type="text"
                  value={data.primarySuppliers}
                  onChange={(e) => setData({ ...data, primarySuppliers: e.target.value })}
                  style={styles.input}
                  placeholder="e.g. Sysco, US Foods, Local Farms"
                />
                <p style={styles.hint}>Separate multiple suppliers with commas.</p>
              </div>

              <div style={styles.field}>
                <label htmlFor="posSystem" style={styles.label}>
                  Current POS System
                </label>
                <select
                  id="posSystem"
                  value={data.posSystem}
                  onChange={(e) => setData({ ...data, posSystem: e.target.value })}
                  style={styles.input}
                >
                  <option value="">None / Manual</option>
                  <option value="square">Square</option>
                  <option value="clover">Clover</option>
                  <option value="toast">Toast</option>
                  <option value="lightspeed">Lightspeed</option>
                  <option value="other">Other</option>
                </select>
                <p style={styles.hint}>
                  POS integrations coming soon. For now, you can upload CSV/Excel exports.
                </p>
              </div>
            </div>
          )}
        </div>

        <div style={styles.actions}>
          {step > 0 && (
            <button onClick={handleBack} style={styles.backButton} disabled={isLoading}>
              Back
            </button>
          )}
          <button onClick={handleNext} style={styles.nextButton} disabled={isLoading}>
            {isLoading
              ? 'Finishing...'
              : step < STEPS.length - 1
                ? 'Next'
                : 'Complete Setup'}
          </button>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f5f7fa',
    padding: '2rem',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: '8px',
    padding: '2rem',
    maxWidth: '550px',
    width: '100%',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
  },
  title: {
    fontSize: '1.5rem',
    fontWeight: 600,
    margin: '0 0 1.5rem 0',
    color: '#1a1a2e',
    textAlign: 'center',
  },
  progress: {
    display: 'flex',
    justifyContent: 'center',
    gap: '2rem',
    marginBottom: '2rem',
  },
  progressStep: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.35rem',
  },
  progressDot: {
    width: '28px',
    height: '28px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#fff',
    fontSize: '0.75rem',
    fontWeight: 600,
  },
  progressLabel: {
    fontSize: '0.7rem',
    fontWeight: 500,
  },
  stepContent: {
    marginBottom: '1.5rem',
  },
  stepTitle: {
    fontSize: '1.1rem',
    fontWeight: 600,
    margin: '0 0 0.25rem 0',
    color: '#333',
  },
  stepDescription: {
    color: '#666',
    fontSize: '0.85rem',
    margin: '0 0 1.25rem 0',
  },
  errorBanner: {
    backgroundColor: '#fee',
    color: '#c00',
    padding: '0.75rem 1rem',
    borderRadius: '4px',
    marginBottom: '1rem',
    fontSize: '0.875rem',
  },
  fieldGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    marginBottom: '0.5rem',
  },
  label: {
    fontSize: '0.8rem',
    fontWeight: 500,
    color: '#444',
    marginBottom: '0.5rem',
  },
  input: {
    padding: '0.6rem 0.75rem',
    border: '1px solid #ddd',
    borderRadius: '4px',
    fontSize: '0.9rem',
    outline: 'none',
  },
  hint: {
    color: '#888',
    fontSize: '0.75rem',
    margin: '0.35rem 0 0 0',
  },
  radioGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  radioOption: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '0.75rem 1rem',
    border: '1px solid #ddd',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  radioInput: {
    accentColor: '#2d6a4f',
  },
  radioLabel: {
    fontWeight: 500,
    fontSize: '0.9rem',
    color: '#333',
  },
  radioDesc: {
    fontSize: '0.75rem',
    color: '#666',
  },
  actions: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '1rem',
  },
  backButton: {
    padding: '0.6rem 1.25rem',
    backgroundColor: '#fff',
    color: '#333',
    border: '1px solid #ddd',
    borderRadius: '4px',
    fontSize: '0.9rem',
    cursor: 'pointer',
  },
  nextButton: {
    padding: '0.6rem 1.25rem',
    backgroundColor: '#2d6a4f',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    fontSize: '0.9rem',
    fontWeight: 500,
    cursor: 'pointer',
    marginLeft: 'auto',
  },
};
