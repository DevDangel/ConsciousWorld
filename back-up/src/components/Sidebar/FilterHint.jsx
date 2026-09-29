import { motion } from 'framer-motion';
import styles from './FilterHint.module.css';

/**
 * Comic speech bubble with real frosted glass + seamless laser-cut single border (no <|).
 */
export default function FilterHint({ mode }) {
  const isContamination = mode === 'contamination';

  return (
    <motion.div
      className={isContamination ? styles.hintGlassRed : styles.hintGlassCyan}
      initial={{ opacity: 0, scale: 0.85, x: -12 }}
      animate={{ opacity: 1, scale: 1, x: 0 }}
      exit={{ opacity: 0, scale: 0.8, x: -8, transition: { duration: 0.25 } }}
      role="status"
      aria-label="Usa los filtros para iniciar"
    >
      {/* Borde perimetral continuo de una sola pieza */}
      <svg
        className={styles.borderSvg}
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <polygon
          points="0,0.5 100,0.5 100,99.5 5,99.5 5,32 0,0.5"
          vectorEffect="non-scaling-stroke"
          className={isContamination ? styles.borderStrokeRed : styles.borderStrokeCyan}
          strokeWidth="1.2"
        />
      </svg>

      <div className={styles.innerContent}>
        <span className={styles.beaconDot} />
        <span className={styles.hintText}>Usa los filtros para iniciar</span>
      </div>
    </motion.div>
  );
}
