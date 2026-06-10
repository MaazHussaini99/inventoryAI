import React, { useState } from 'react';

interface TutorialStep {
  title: string;
  description: string;
}

const TUTORIAL_STEPS: TutorialStep[] = [
  {
    title: 'Welcome to your Dashboard!',
    description:
      'This is your command center for inventory intelligence. Here you can view sales analytics, track inventory, and get AI-powered recommendations.',
  },
  {
    title: 'Upload Your Data',
    description:
      'Start by uploading a CSV or Excel file with your sales data. We support product names, quantities, prices, and dates.',
  },
  {
    title: 'Sales Analytics',
    description:
      'Once data is imported, you\'ll see revenue trends, top-selling products, and dead stock items here.',
  },
  {
    title: 'AI Recommendations',
    description:
      'After 14 days of data, our AI will suggest what to restock, what to promote, and what to reduce. Look for the Recommendations section.',
  },
];

interface TutorialOverlayProps {
  onDismiss: () => void;
}

export function TutorialOverlay({ onDismiss }: TutorialOverlayProps) {
  const [currentStep, setCurrentStep] = useState(0);

  function handleNext() {
    if (currentStep < TUTORIAL_STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onDismiss();
    }
  }

  function handleSkip() {
    onDismiss();
  }

  const step = TUTORIAL_STEPS[currentStep];

  return (
    <div style={styles.overlay} role="dialog" aria-modal="true" aria-label="Welcome tutorial">
      <div style={styles.backdrop} onClick={handleSkip} />
      <div style={styles.modal}>
        <div style={styles.stepIndicator}>
          {TUTORIAL_STEPS.map((_, i) => (
            <div
              key={i}
              style={{
                ...styles.dot,
                backgroundColor: i === currentStep ? '#2d6a4f' : '#ddd',
              }}
            />
          ))}
        </div>

        <h2 style={styles.title}>{step.title}</h2>
        <p style={styles.description}>{step.description}</p>

        <div style={styles.actions}>
          <button onClick={handleSkip} style={styles.skipButton}>
            Skip Tutorial
          </button>
          <button onClick={handleNext} style={styles.nextButton}>
            {currentStep < TUTORIAL_STEPS.length - 1 ? 'Next' : 'Get Started'}
          </button>
        </div>

        <p style={styles.counter}>
          {currentStep + 1} of {TUTORIAL_STEPS.length}
        </p>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modal: {
    position: 'relative',
    backgroundColor: '#fff',
    borderRadius: '12px',
    padding: '2rem',
    maxWidth: '420px',
    width: '90%',
    textAlign: 'center',
    boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
  },
  stepIndicator: {
    display: 'flex',
    justifyContent: 'center',
    gap: '6px',
    marginBottom: '1.5rem',
  },
  dot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
  },
  title: {
    fontSize: '1.25rem',
    fontWeight: 600,
    margin: '0 0 0.75rem 0',
    color: '#1a1a2e',
  },
  description: {
    color: '#555',
    fontSize: '0.9rem',
    lineHeight: '1.5',
    margin: '0 0 1.5rem 0',
  },
  actions: {
    display: 'flex',
    justifyContent: 'center',
    gap: '0.75rem',
  },
  skipButton: {
    padding: '0.5rem 1rem',
    backgroundColor: 'transparent',
    color: '#888',
    border: '1px solid #ddd',
    borderRadius: '4px',
    fontSize: '0.85rem',
    cursor: 'pointer',
  },
  nextButton: {
    padding: '0.5rem 1.25rem',
    backgroundColor: '#2d6a4f',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    fontSize: '0.85rem',
    fontWeight: 500,
    cursor: 'pointer',
  },
  counter: {
    color: '#aaa',
    fontSize: '0.75rem',
    marginTop: '1rem',
    marginBottom: 0,
  },
};
