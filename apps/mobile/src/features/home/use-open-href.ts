import { useNavigation, type NavigationProp } from '@react-navigation/native';
import * as WebBrowser from 'expo-web-browser';
import { useCallback } from 'react';

import { env } from '@/config/env';
import { hrefToRoute } from '@/navigation/href';
import type { RootStackParamList } from '@/navigation/types';

/** Opens a web href (banner/promo/CMS link) as an app route or an external browser tab (§2.7). */
export function useOpenHref(): (href: string | null | undefined) => void {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  return useCallback(
    (href) => {
      const target = hrefToRoute(href, env.apiBaseUrl);
      if (!target) return;
      if (target.kind === 'external') {
        void WebBrowser.openBrowserAsync(target.url);
        return;
      }
      (navigation.navigate as (name: string, params?: object) => void)(target.name, target.params);
    },
    [navigation],
  );
}
