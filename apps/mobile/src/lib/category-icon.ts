import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

export type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

/** Map a category/subcategory name to a relevant icon (API provides no images). */
export function iconForCategory(name: string): IconName {
  const s = name.toLowerCase();
  // Personal care
  if (/\bhair\b|shampoo/.test(s)) return 'hair-dryer-outline';
  if (/skin|lotion|cream|moistur|face/.test(s)) return 'lotion-outline';
  if (/oral|tooth|dental/.test(s)) return 'toothbrush';
  if (/bath|spa|shower|soap|body\s*wash/.test(s)) return 'shower';
  if (/perfume|fragrance|\bdeo/.test(s)) return 'spray';
  if (/shav|razor|groom|beard/.test(s)) return 'razor-double-edge';
  if (/makeup|beaut|cosmet|lipstick/.test(s)) return 'lipstick';
  // Home care / household
  if (/laundry|deterg|washing|fabric/.test(s)) return 'washing-machine';
  if (/dish|utensil/.test(s)) return 'silverware-fork-knife';
  if (/freshener|air\s*fresh/.test(s)) return 'air-filter';
  if (/home\s*care|household|clean|floor|toilet|disinfect/.test(s)) return 'spray-bottle';
  // Grocery
  if (/atta|flour|rice|grain|staple/.test(s)) return 'rice';
  if (/oil|ghee/.test(s)) return 'bottle-tonic';
  if (/spice|masala/.test(s)) return 'shaker-outline';
  if (/snack|namkeen|chips/.test(s)) return 'food-croissant';
  if (/dairy|milk|curd|cheese|butter/.test(s)) return 'cup-water';
  if (/beverage|drink|juice|tea|coffee|water/.test(s)) return 'cup';
  if (/biscuit|cookie|chocolate|sweet|candy/.test(s)) return 'cookie';
  if (/veg|fruit|fresh/.test(s)) return 'food-apple-outline';
  if (/food|grocer/.test(s)) return 'basket-outline';
  // Baby
  if (/diaper/.test(s)) return 'baby-face-outline';
  if (/baby\s*food|formula/.test(s)) return 'baby-bottle-outline';
  if (/baby|infant/.test(s)) return 'baby-carriage';
  // Other top-level
  if (/fashion|cloth|apparel|wear|shirt|footwear|shoe/.test(s)) return 'tshirt-crew-outline';
  if (/mobile|phone|laptop|gadget|device|\btv\b|electro|appliance/.test(s)) return 'cellphone';
  if (/home|furnit|decor|living|kitchen/.test(s)) return 'sofa-outline';
  if (/book|station|office/.test(s)) return 'book-open-variant';
  if (/health|pharma|medic|wellness/.test(s)) return 'heart-pulse';
  if (/sport|fit|gym|outdoor/.test(s)) return 'dumbbell';
  if (/toy|game/.test(s)) return 'teddy-bear';
  if (/pet/.test(s)) return 'paw';
  return 'tag-outline';
}
