import {
  Binoculars,
  Castle,
  Church,
  Coffee,
  FerrisWheel,
  IceCreamCone,
  Landmark,
  Palette,
  PawPrint,
  TreePalm,
  Trees,
  Utensils,
  Wine,
  type LucideProps,
} from 'lucide-react'
import type { ActivityCategory } from '../../api/activities'

const icons: Record<ActivityCategory, typeof Landmark> = {
  Sight: Landmark,
  Museum: Palette,
  Viewpoint: Binoculars,
  Castle,
  Religious: Church,
  Nature: Trees,
  Beach: TreePalm,
  Zoo: PawPrint,
  ThemePark: FerrisWheel,
  Restaurant: Utensils,
  Cafe: Coffee,
  Bar: Wine,
  IceCream: IceCreamCone,
}

export function CategoryIcon({ category, ...props }: { category: ActivityCategory } & LucideProps) {
  const Icon = icons[category]
  return <Icon aria-hidden="true" {...props} />
}
