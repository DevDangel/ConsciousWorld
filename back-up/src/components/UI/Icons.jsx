import {
  Factory,
  Wind,
  Waves,
  Droplets,
  Leaf,
  Globe2,
  Skull,
  Sprout,
  Search,
  Building2,
  AlertTriangle,
  Sparkles,
  BarChart2,
  TrendingUp,
  ChevronLeft,
  ChevronRight,
  Fish,
  Bird,
  Trees,
  Mountain,
  Map as MapIcon,
  Tent,
  Bug,
} from 'lucide-react';

const ICONS = {
  // Layer Icons
  factory: Factory,
  wind: Wind,
  waves: Waves,
  droplets: Droplets,
  leaf: Leaf,
  city: Building2,
  
  // UI Icons
  globe: Globe2,
  skull: Skull,
  sprout: Sprout,
  search: Search,
  alert: AlertTriangle,
  sparkles: Sparkles,
  chart: BarChart2,
  trending: TrendingUp,
  chevronLeft: ChevronLeft,
  chevronRight: ChevronRight,

  // Biodiversity / Nature
  fish: Fish,
  bird: Bird,
  trees: Trees,
  mountain: Mountain,
  map: MapIcon,
  tent: Tent,
  bug: Bug,
};

export default function Icon({ name, size = 18, className = '', color = 'currentColor', ...props }) {
  const IconComponent = ICONS[name] || Globe2; // Default to globe if not found
  return <IconComponent size={size} className={className} color={color} {...props} />;
}
