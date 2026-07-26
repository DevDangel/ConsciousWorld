import styles from './GlassCard.module.css';

export default function GlassCard({ children, compact = false, className = '', style = {}, onClick }) {
  return (
    <div
      className={`${compact ? styles.glassCardCompact : styles.glassCard} ${className}`}
      style={style}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {children}
    </div>
  );
}
