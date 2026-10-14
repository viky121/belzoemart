import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { tokenManager } from '@/api/token-manager';
import type { DataRequest } from '@/api/types';
import { theme } from '@/theme';
import { Button, Screen } from '@/ui';
import { Sheet } from '@/ui/Sheet';
import { useToast } from '@/ui/Toast';

import { decodeExport } from '../export-decode';
import { useDataRequests, useRequestDeletion, useRequestExport } from '../hooks';

function ExportView({ request }: { request: DataRequest }) {
  const toast = useToast();
  if (!request.resultUrl) return null;
  const decoded = decodeExport(request.resultUrl);
  if (!decoded.ok) return <Text style={styles.muted}>Export format not supported.</Text>;
  let pretty = decoded.json;
  try {
    pretty = JSON.stringify(JSON.parse(decoded.json), null, 2);
  } catch {
    return <Text style={styles.muted}>Export format not supported.</Text>;
  }
  return (
    <View style={styles.exportBox}>
      <Button
        title="Copy export"
        variant="ghost"
        onPress={() => {
          void Clipboard.setStringAsync(pretty);
          toast.show({ message: 'Export copied' });
        }}
      />
      <Text style={styles.exportJson} selectable>
        {pretty}
      </Text>
    </View>
  );
}

/** Privacy & data (design §11): DPDP export (poll) + account deletion (typed DELETE). */
export function PrivacyDataScreen() {
  const toast = useToast();
  const requests = useDataRequests();
  const requestExport = useRequestExport();
  const requestDeletion = useRequestDeletion();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  const list = requests.data ?? [];
  const latestExport = list.find((r) => r.type === 'export' && r.status === 'completed');

  function confirmDelete() {
    requestDeletion.mutate(undefined, {
      onSuccess: () => {
        toast.show({ message: 'Account deletion requested. You have been signed out.', tone: 'info' });
        void tokenManager.logout();
      },
    });
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.heading}>Download my data</Text>
        <Text style={styles.muted}>Request a copy of the personal data we hold about you.</Text>
        <Button
          title="Request data export"
          variant="secondary"
          loading={requestExport.isPending}
          onPress={() => requestExport.mutate()}
          testID="request-export"
        />

        {list.length > 0 ? (
          <View style={styles.requests}>
            {list.map((r) => (
              <View key={r.id} style={styles.requestRow}>
                <Text style={styles.requestType}>
                  {r.type === 'export' ? 'Data export' : 'Account deletion'}
                </Text>
                <Text style={styles.requestStatus}>{r.status}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {latestExport ? <ExportView request={latestExport} /> : null}

        <View style={styles.divider} />

        <Text style={styles.heading}>Delete my account</Text>
        <Text style={styles.muted}>
          Your orders and invoices are kept as legally required; your personal data is anonymised and you are
          signed out on all devices. This cannot be undone.
        </Text>
        <Button title="Delete my account" variant="danger" onPress={() => setDeleteOpen(true)} testID="delete-account" />
      </ScrollView>

      <Sheet visible={deleteOpen} title="Delete account" onClose={() => setDeleteOpen(false)}>
        <View style={styles.sheet}>
          <Text style={styles.muted}>Type DELETE to confirm.</Text>
          <TextInput
            value={confirmText}
            onChangeText={setConfirmText}
            autoCapitalize="characters"
            placeholder="DELETE"
            placeholderTextColor={theme.colors.muted}
            style={styles.input}
            accessibilityLabel="Type DELETE to confirm"
          />
          <Button
            title="Permanently delete"
            variant="danger"
            fullWidth
            disabled={confirmText.trim() !== 'DELETE'}
            loading={requestDeletion.isPending}
            onPress={confirmDelete}
            testID="confirm-delete-account"
          />
        </View>
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { padding: theme.spacing.lg, gap: theme.spacing.sm },
  heading: { ...theme.typography.title, color: theme.colors.inkStrong, marginTop: theme.spacing.sm },
  muted: { ...theme.typography.body, color: theme.colors.muted },
  requests: { marginTop: theme.spacing.sm, gap: theme.spacing.xs },
  requestRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: theme.spacing.xs, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  requestType: { ...theme.typography.body, color: theme.colors.ink },
  requestStatus: { ...theme.typography.body, color: theme.colors.primaryStrong, textTransform: 'capitalize' },
  exportBox: { marginTop: theme.spacing.sm, backgroundColor: theme.colors.surface2, borderRadius: theme.radius.md, padding: theme.spacing.md },
  exportJson: { ...theme.typography.caption, color: theme.colors.ink, fontFamily: 'monospace' },
  divider: { height: 1, backgroundColor: theme.colors.border, marginVertical: theme.spacing.lg },
  sheet: { paddingVertical: theme.spacing.md, gap: theme.spacing.md },
  input: {
    minHeight: theme.touch.minTouch,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    color: theme.colors.ink,
    backgroundColor: theme.colors.surface,
    ...theme.typography.bodyLg,
  },
});
