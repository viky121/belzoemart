import { SvgXml } from 'react-native-svg';

import { BELZO_LOGO_XML } from './belzo-logo.generated';

/** The official Belzo brand logo (the web SVG verbatim). Square viewBox 520×520. */
export function BelzoLogo({ size = 96 }: { size?: number }) {
  return (
    <SvgXml
      xml={BELZO_LOGO_XML}
      width={size}
      height={size}
      accessible
      accessibilityRole="image"
      accessibilityLabel="Belzo eMart"
    />
  );
}
