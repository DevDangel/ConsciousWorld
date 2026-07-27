import { motion } from 'framer-motion';
import Icon from '../UI/Icons';
import styles from './IntroModal.module.css';

/**
 * Shown once the data has loaded and before the map is revealed. Deliberately
 * blocking: the whole point of the app is the message, so it gets a beat of
 * its own instead of being a dismissible corner toast.
 */
export default function IntroModal({ onAccept }) {
  return (
    <motion.div
      className={styles.backdrop}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.45 }}
    >
      <motion.div
        className={styles.card}
        role="dialog"
        aria-modal="true"
        aria-labelledby="intro-title"
        initial={{ opacity: 0, y: 24, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -16, scale: 0.98 }}
        transition={{ type: 'spring', damping: 24, stiffness: 260, delay: 0.12 }}
      >
        <div className={styles.globe}>
          <Icon name="globe" size={56} />
        </div>

        <h1 id="intro-title" className={styles.title}>
          El planeta Tierra es nuestro único hogar
        </h1>
        <p className={styles.subtitle}>Cuidémoslo</p>

        <div className={styles.divider} />

        <button className={styles.accept} onClick={onAccept} autoFocus>
          ACEPTO
        </button>
      </motion.div>
    </motion.div>
  );
}
