import type { LinkingOptions } from '@react-navigation/native';
import * as Linking from 'expo-linking';

import type { RootStackParamList } from './types';

/**
 * Deep links (design §2.6). Schemes come from app.config.ts: `belzoemart://` (production) and
 * `belzoemart-dev://` (development). https App Links are out of scope until HTTPS exists.
 */
export const linkingConfig: LinkingOptions<RootStackParamList>['config'] = {
  screens: {
    Main: {
      screens: { HomeTab: '', CategoriesTab: 'categories', OffersTab: 'offers', AccountTab: 'account' },
    },
    Cart: 'cart',
    ProductDetail: 'product/:idOrSlug',
    ProductList: 'category/:categorySlug',
    Search: 'search', // ?q=&sort=
    Orders: 'orders',
    OrderDetail: 'orders/:id',
    Wishlist: 'wishlist',
    Notifications: 'notifications',
    CmsPage: 'page/:slug',
  },
};

export function createLinking(): LinkingOptions<RootStackParamList> {
  return { prefixes: [Linking.createURL('/')], config: linkingConfig };
}
