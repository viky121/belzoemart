import { registerRootComponent } from 'expo';
import * as SplashScreen from 'expo-splash-screen';

import App from './src/app/App';

// Keep the native splash up until boot settles (design §2.5).
void SplashScreen.preventAutoHideAsync();

registerRootComponent(App);
