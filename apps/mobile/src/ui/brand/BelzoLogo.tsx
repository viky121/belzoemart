import { Image } from 'expo-image';

/** The official Belzo eMart logo (transparent PNG, cropped square so the ring is centred). */
const LOGO = require('../../../assets/brand/belzo-logo.png') as number;

export function BelzoLogo({ size = 96 }: { size?: number }) {
  return (
    <Image
      source={LOGO}
      style={{ width: size, height: size }}
      contentFit="contain"
      accessible
      accessibilityRole="image"
      accessibilityLabel="Belzo eMart"
    />
  );
}
