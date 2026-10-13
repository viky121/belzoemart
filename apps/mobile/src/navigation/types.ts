import type { ProductSort } from '@belzo/shared';
import type { NavigatorScreenParams } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

/** Where to go after a successful sign-in (design §2.4). */
export type RedirectTarget = { name: keyof RootStackParamList; params?: object };

export type MainTabParamList = {
  HomeTab: undefined;
  CategoriesTab: undefined;
  CartTab: undefined;
  AccountTab: undefined;
};

export type OrderConfirmationNotice =
  | 'payment_unavailable'
  | 'payment_unavailable_cancel_failed'
  | 'payment_incomplete';

/** Root stack routes (design §2.1). [auth] screens are always registered, wrapped in RequireAuth. */
export type RootStackParamList = {
  Onboarding: undefined;
  Main: NavigatorScreenParams<MainTabParamList> | undefined;
  ProductList:
    | {
        categoryId?: string;
        categorySlug?: string;
        brandId?: string;
        sort?: ProductSort;
        title?: string;
      }
    | undefined;
  ProductDetail: { idOrSlug: string };
  Search: { q?: string; sort?: ProductSort } | undefined;
  Checkout: { addressId?: string } | undefined;
  OrderConfirmation: { orderId: string; provider: string; notice?: OrderConfirmationNotice };
  Orders: undefined;
  OrderDetail: { id: string };
  Wishlist: undefined;
  Addresses: { selectForCheckout?: boolean } | undefined;
  Notifications: undefined;
  ProfileEdit: undefined;
  PrivacyData: undefined;
  DataExportView: { requestId: string };
  Help: undefined;
  CmsPage: { slug: string };
  // presentation: 'modal'
  Login: { redirect?: RedirectTarget } | undefined;
  OtpVerify: {
    requestId: string;
    target: string;
    channel: 'phone' | 'email';
    expiresAt: string;
    devCode?: string;
    redirect?: RedirectTarget;
  };
  Register: { redirect?: RedirectTarget } | undefined;
  AddressForm: { addressId?: string; selectForCheckout?: boolean } | undefined;
  CancelOrder: { orderId: string };
  ReturnRequest: { orderId: string };
  // presentation: 'fullScreenModal'
  ImageViewer: { images: string[]; index: number };
};

export type RootRouteName = keyof RootStackParamList;

export type RootScreenProps<T extends RootRouteName> = NativeStackScreenProps<
  RootStackParamList,
  T
>;

/** Routes that require a signed-in customer (rendered through RequireAuth). */
export const AUTH_REQUIRED_ROUTES = [
  'Checkout',
  'OrderConfirmation',
  'Orders',
  'OrderDetail',
  'Wishlist',
  'Addresses',
  'Notifications',
  'ProfileEdit',
  'PrivacyData',
  'DataExportView',
  'AddressForm',
  'CancelOrder',
  'ReturnRequest',
] as const satisfies readonly RootRouteName[];

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReactNavigation {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface RootParamList extends RootStackParamList {}
  }
}
