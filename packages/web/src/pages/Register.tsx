import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { apiRequest } from '../api/client';

interface RegisterResponse {
  userId: string;
  storeId: string;
  email: string;
  message: string;
}

export function Register() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    storeName: '',
    storeLocation: '',
    name: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  function validate(): boolean {
    const newErrors: Record<string, string> = {};

    if (!formData.storeName.trim()) {
      newErrors.storeName = 'Store name is required';
    }
    if (!formData.storeLocation.trim()) {
      newErrors.storeLocation = 'Store location is required';
    }
    if (!formData.name.trim()) {
      newErrors.name = 'Owner name is required';
    }
    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Enter a valid email address';
    }
    if (formData.phone && !/^[\d\s\-+()]*$/.test(formData.phone)) {
      newErrors.phone = 'Enter a valid phone number';
    }
    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else if (formData.password.length < 8) {
      newErrors.password = 'Password must be at least 8 characters';
    }
    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setApiError('');

    if (!validate()) return;

    setIsLoading(true);
    try {
      const response = await apiRequest<RegisterResponse>('/api/auth/register', {
        method: 'POST',
        body: {
          storeName: formData.storeName,
          storeLocation: formData.storeLocation,
          storeCategory: 'grocery',
          name: formData.name,
          email: formData.email,
          phone: formData.phone || undefined,
          password: formData.password,
        },
      });

      // Store the storeId for onboarding and navigate to login
      localStorage.setItem('pending_store_id', response.storeId);
      navigate('/login', { state: { registered: true, email: response.email } });
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'message' in err) {
        setApiError((err as { message: string }).message);
      } else {
        setApiError('An unexpected error occurred. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: '' }));
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>Create Your Store Account</h1>
        <p style={styles.subtitle}>
          Get started with Grocery Inventory Intelligence
        </p>

        {apiError && <div style={styles.errorBanner}>{apiError}</div>}

        <form onSubmit={handleSubmit} style={styles.form}>
          <fieldset style={styles.fieldset}>
            <legend style={styles.legend}>Store Information</legend>

            <div style={styles.field}>
              <label htmlFor="storeName" style={styles.label}>Store Name *</label>
              <input
                id="storeName"
                name="storeName"
                type="text"
                value={formData.storeName}
                onChange={handleChange}
                style={errors.storeName ? { ...styles.input, ...styles.inputError } : styles.input}
                placeholder="e.g. Fresh Market Grocery"
                disabled={isLoading}
              />
              {errors.storeName && <span style={styles.fieldError}>{errors.storeName}</span>}
            </div>

            <div style={styles.field}>
              <label htmlFor="storeLocation" style={styles.label}>Store Location *</label>
              <input
                id="storeLocation"
                name="storeLocation"
                type="text"
                value={formData.storeLocation}
                onChange={handleChange}
                style={errors.storeLocation ? { ...styles.input, ...styles.inputError } : styles.input}
                placeholder="e.g. Dallas, TX"
                disabled={isLoading}
              />
              {errors.storeLocation && <span style={styles.fieldError}>{errors.storeLocation}</span>}
            </div>
          </fieldset>

          <fieldset style={styles.fieldset}>
            <legend style={styles.legend}>Owner Information</legend>

            <div style={styles.field}>
              <label htmlFor="name" style={styles.label}>Owner Name *</label>
              <input
                id="name"
                name="name"
                type="text"
                value={formData.name}
                onChange={handleChange}
                style={errors.name ? { ...styles.input, ...styles.inputError } : styles.input}
                placeholder="Your full name"
                disabled={isLoading}
              />
              {errors.name && <span style={styles.fieldError}>{errors.name}</span>}
            </div>

            <div style={styles.field}>
              <label htmlFor="email" style={styles.label}>Email *</label>
              <input
                id="email"
                name="email"
                type="email"
                value={formData.email}
                onChange={handleChange}
                style={errors.email ? { ...styles.input, ...styles.inputError } : styles.input}
                placeholder="you@example.com"
                disabled={isLoading}
              />
              {errors.email && <span style={styles.fieldError}>{errors.email}</span>}
            </div>

            <div style={styles.field}>
              <label htmlFor="phone" style={styles.label}>Phone</label>
              <input
                id="phone"
                name="phone"
                type="tel"
                value={formData.phone}
                onChange={handleChange}
                style={errors.phone ? { ...styles.input, ...styles.inputError } : styles.input}
                placeholder="(555) 123-4567"
                disabled={isLoading}
              />
              {errors.phone && <span style={styles.fieldError}>{errors.phone}</span>}
            </div>
          </fieldset>

          <fieldset style={styles.fieldset}>
            <legend style={styles.legend}>Security</legend>

            <div style={styles.field}>
              <label htmlFor="password" style={styles.label}>Password *</label>
              <input
                id="password"
                name="password"
                type="password"
                value={formData.password}
                onChange={handleChange}
                style={errors.password ? { ...styles.input, ...styles.inputError } : styles.input}
                placeholder="At least 8 characters"
                disabled={isLoading}
              />
              {errors.password && <span style={styles.fieldError}>{errors.password}</span>}
            </div>

            <div style={styles.field}>
              <label htmlFor="confirmPassword" style={styles.label}>Confirm Password *</label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                value={formData.confirmPassword}
                onChange={handleChange}
                style={errors.confirmPassword ? { ...styles.input, ...styles.inputError } : styles.input}
                placeholder="Re-enter your password"
                disabled={isLoading}
              />
              {errors.confirmPassword && <span style={styles.fieldError}>{errors.confirmPassword}</span>}
            </div>
          </fieldset>

          <button type="submit" style={styles.submitButton} disabled={isLoading}>
            {isLoading ? 'Creating Account...' : 'Create Account'}
          </button>
        </form>

        <p style={styles.footerText}>
          Already have an account? <Link to="/login" style={styles.link}>Log in</Link>
        </p>
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
    maxWidth: '500px',
    width: '100%',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
  },
  title: {
    fontSize: '1.5rem',
    fontWeight: 600,
    margin: '0 0 0.5rem 0',
    color: '#1a1a2e',
  },
  subtitle: {
    color: '#666',
    margin: '0 0 1.5rem 0',
    fontSize: '0.9rem',
  },
  errorBanner: {
    backgroundColor: '#fee',
    color: '#c00',
    padding: '0.75rem 1rem',
    borderRadius: '4px',
    marginBottom: '1rem',
    fontSize: '0.875rem',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  fieldset: {
    border: 'none',
    padding: 0,
    margin: 0,
  },
  legend: {
    fontWeight: 600,
    fontSize: '0.9rem',
    color: '#333',
    marginBottom: '0.75rem',
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    marginBottom: '0.75rem',
  },
  label: {
    fontSize: '0.8rem',
    fontWeight: 500,
    color: '#444',
    marginBottom: '0.25rem',
  },
  input: {
    padding: '0.6rem 0.75rem',
    border: '1px solid #ddd',
    borderRadius: '4px',
    fontSize: '0.9rem',
    outline: 'none',
    transition: 'border-color 0.2s',
  },
  inputError: {
    borderColor: '#e44',
  },
  fieldError: {
    color: '#e44',
    fontSize: '0.75rem',
    marginTop: '0.25rem',
  },
  submitButton: {
    padding: '0.75rem',
    backgroundColor: '#2d6a4f',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    fontSize: '1rem',
    fontWeight: 500,
    cursor: 'pointer',
    marginTop: '0.5rem',
  },
  footerText: {
    textAlign: 'center',
    marginTop: '1.5rem',
    fontSize: '0.875rem',
    color: '#666',
  },
  link: {
    color: '#2d6a4f',
    textDecoration: 'none',
    fontWeight: 500,
  },
};
