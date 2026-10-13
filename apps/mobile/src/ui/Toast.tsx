import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AccessibilityInfo, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { theme } from '@/theme';

export type ToastTone = 'info' | 'success' | 'error';

export interface ToastOptions {
  message: string;
  tone?: ToastTone;
}

interface ToastApi {
  show: (opts: ToastOptions) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const DURATION_MS = 3_000;

const TONE_BG: Record<ToastTone, string> = {
  info: theme.colors.navy,
  success: theme.colors.brandStrong,
  error: theme.colors.danger,
};

/** Imperative bridge so non-React code (e.g. the session-expired listener) can show a toast. */
let globalShow: ((opts: ToastOptions) => void) | null = null;
export function showToast(opts: ToastOptions): void {
  globalShow?.(opts);
}

/** Bottom snackbar, 3 s, announced to screen readers (design §3.4). */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<(ToastOptions & { id: number }) | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();

  const show = useCallback((opts: ToastOptions) => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ ...opts, id: Date.now() });
    AccessibilityInfo.announceForAccessibility(opts.message);
    timer.current = setTimeout(() => setToast(null), DURATION_MS);
  }, []);

  useEffect(() => {
    globalShow = show;
    return () => {
      if (globalShow === show) globalShow = null;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [show]);

  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {toast ? (
        <View
          pointerEvents="none"
          style={[
            styles.toast,
            {
              bottom: insets.bottom + theme.spacing.xl,
              backgroundColor: TONE_BG[toast.tone ?? 'info'],
            },
          ]}
          accessibilityLiveRegion="polite"
          testID="toast"
        >
          <Text style={styles.text}>{toast.message}</Text>
        </View>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    left: theme.spacing.lg,
    right: theme.spacing.lg,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    boxShadow: theme.shadows.lg,
  },
  text: { ...theme.typography.body, color: theme.colors.white },
});
