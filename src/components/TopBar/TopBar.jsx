import { useState, useMemo, useRef, useEffect } from 'react';
import { MODES } from '../../data/constants';
import styles from './TopBar.module.css';
import Icon from '../UI/Icons';

export default function TopBar({ mode, onModeChange, data, onSearchSelect }) {
  const [query, setQuery] = useState('');
  const [showResults, setShowResults] = useState(false);
  const searchRef = useRef(null);

  // Close search dropdown on outside click
  useEffect(() => {
    function handleClick(e) {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setShowResults(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Build searchable items from data
  const searchableItems = useMemo(() => {
    if (!data) return [];
    const items = [];

    if (data.co2) {
      data.co2.forEach(d => {
        items.push({ name: d.name, type: 'Emisiones CO₂', icon: 'factory', lat: d.lat, lng: d.lng, data: d, mode: MODES.CONTAMINATION });
      });
    }
    if (data.airQuality) {
      data.airQuality.forEach(d => {
        items.push({ name: d.name, type: 'Calidad del Aire', icon: 'wind', lat: d.lat, lng: d.lng, data: d, mode: MODES.CONTAMINATION });
        if (d.cities) {
          d.cities.forEach(c => {
            items.push({ name: c.name, type: `Ciudad — ${d.name}`, icon: 'city', lat: c.lat, lng: c.lng, data: c, mode: MODES.CONTAMINATION });
          });
        }
      });
    }
    if (data.oceanPlastic) {
      data.oceanPlastic.forEach(d => {
        items.push({ name: d.name, type: 'Plástico Oceánico', icon: 'waves', lat: d.lat, lng: d.lng, data: d, mode: MODES.CONTAMINATION });
      });
    }
    if (data.rivers) {
      data.rivers.forEach(d => {
        items.push({ name: d.name, type: 'Río/Fuente Hídrica', icon: 'droplets', lat: d.lat, lng: d.lng, data: d, mode: MODES.LIFE });
      });
    }
    if (data.protectedAreas) {
      data.protectedAreas.forEach(d => {
        items.push({ name: d.name, type: d.type, icon: d.icon || 'leaf', lat: d.lat, lng: d.lng, data: d, mode: MODES.LIFE });
      });
    }

    return items;
  }, [data]);

  // Filter results
  const filteredResults = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return searchableItems
      .filter(item => item.name.toLowerCase().includes(q))
      .slice(0, 8);
  }, [query, searchableItems]);

  function handleResultClick(item) {
    setQuery('');
    setShowResults(false);
    if (onSearchSelect) {
      onSearchSelect(item);
    }
  }

  const isContamination = mode === MODES.CONTAMINATION;

  return (
    <header className={styles.topBar}>
      {/* Logo */}
      <div className={styles.logo}>
        <div className={styles.logoIcon}><Icon name="globe" size={24} /></div>
        <span className={styles.logoText}>
          Conscious <span className={styles.logoAccent}>World</span>
        </span>
      </div>

      {/* Mode Toggle */}
      <div className={styles.center}>
        <div className={styles.modeToggle}>
          <button
            className={`${styles.modeBtn} ${isContamination ? styles.modeBtnContamination : ''}`}
            onClick={() => onModeChange(MODES.CONTAMINATION)}
          >
            <span className={styles.modeIcon}><Icon name="skull" size={16} /></span>
            Contaminación
          </button>
          <button
            className={`${styles.modeBtn} ${!isContamination ? styles.modeBtnLife : ''}`}
            onClick={() => onModeChange(MODES.LIFE)}
          >
            <span className={styles.modeIcon}><Icon name="sprout" size={16} /></span>
            Vida
          </button>
        </div>
      </div>

      {/* Right: Search + Stats */}
      <div className={styles.right}>
        <div className={styles.searchContainer} ref={searchRef}>
          <span className={styles.searchIcon}><Icon name="search" size={16} /></span>
          <input
            className={styles.searchInput}
            type="text"
            placeholder="Buscar país, río, área..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setShowResults(true);
            }}
            onFocus={() => setShowResults(true)}
          />
          {showResults && filteredResults.length > 0 && (
            <div className={styles.searchResults}>
              {filteredResults.map((item, i) => (
                <div
                  key={i}
                  className={styles.searchResult}
                  onClick={() => handleResultClick(item)}
                >
                  <span className={styles.searchResultIcon}><Icon name={item.icon} size={16} /></span>
                  <div className={styles.searchResultInfo}>
                    <span className={styles.searchResultName}>{item.name}</span>
                    <span className={styles.searchResultType}>{item.type}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className={styles.statsTag}>
          <span
            className={styles.statsTagDot}
            style={{ background: isContamination ? 'var(--red-primary)' : 'var(--cyan-vital)' }}
          />
          Datos 2023
        </div>
      </div>
    </header>
  );
}
