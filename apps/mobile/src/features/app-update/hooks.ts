import { useQuery } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { useCallback } from 'react';
import { Linking } from 'react-native';

import { env } from '@/config/env';
import { useToast } from '@/ui/Toast';

import { fetchAppVersion } from './api';
import { compareVersions, resolveDownloadUrl } from './version';

export const INSTALLED_VERSION = Constants.expoConfig?.version ?? '0.0.0';

export interface AppUpdateState {
  installed: string;
  latest: string | null;
  notes: string | null;
  /** A download link has been published. */
  canDownload: boolean;
  /** A newer version than the installed one has been published (with a download link). */
  updateAvailable: boolean;
  /** Opens the APK link in the browser/downloader. */
  download: () => void;
}

/** Checks the published app version and exposes a "download the new app" action. */
export function useAppUpdate(): AppUpdateState {
  const toast = useToast();
  const { data } = useQuery({
    queryKey: ['app-version'],
    queryFn: ({ signal }) => fetchAppVersion(signal),
    staleTime: 10 * 60_000,
    retry: false,
  });

  const apkUrl = data?.apkUrl ? resolveDownloadUrl(data.apkUrl, env.apiBaseUrl) : null;
  const newer = data ? compareVersions(data.version, INSTALLED_VERSION) > 0 : false;

  const download = useCallback(() => {
    if (!apkUrl) return;
    Linking.openURL(apkUrl).catch(() =>
      toast.show({ message: 'Could not open the download link.', tone: 'error' }),
    );
  }, [apkUrl, toast]);

  return {
    installed: INSTALLED_VERSION,
    latest: data?.version ?? null,
    notes: data?.notes ?? null,
    canDownload: apkUrl !== null,
    updateAvailable: newer && apkUrl !== null,
    download,
  };
}
