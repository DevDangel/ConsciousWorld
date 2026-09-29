import { useState, useEffect, useRef } from 'react';

export default function AnimatedCounter({ value, suffix = '', prefix = '', duration = 1500 }) {
  const [displayValue, setDisplayValue] = useState(0);
  const startTimeRef = useRef(null);
  const rafRef = useRef(null);
  const numericValue = parseFloat(value) || 0;

  useEffect(() => {
    startTimeRef.current = performance.now();

    function animate(currentTime) {
      const elapsed = currentTime - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(numericValue * eased);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      }
    }

    rafRef.current = requestAnimationFrame(animate);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [numericValue, duration]);

  const formatted = numericValue % 1 !== 0
    ? displayValue.toFixed(1)
    : Math.round(displayValue).toLocaleString('es-ES');

  return (
    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
      {prefix}{formatted}{suffix}
    </span>
  );
}
