import { pincodeSchema } from '@belzo/shared';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { apiRequest } from '@/api/client';
import { qk, STALE } from '@/api/query-keys';
import { usePincodeStore } from '@/store/pincode';
import { theme } from '@/theme';
import { Button } from '@/ui';

interface Serviceability {
  serviceable: boolean;
  configured: boolean;
}

/** PIN delivery check on the PDP (design §11 ProductDetail / §4.2 serviceability). */
export function DeliveryCheck() {
  const storePin = usePincodeStore((s) => s.pincode);
  const setPincode = usePincodeStore((s) => s.setPincode);
  const [input, setInput] = useState(storePin ?? '');
  const valid = pincodeSchema.safeParse(input).success;

  const query = useQuery<Serviceability>({
    queryKey: qk.serviceability(input),
    queryFn: () => apiRequest<Serviceability>('/settings/serviceability', { query: { pincode: input } }),
    enabled: valid,
    staleTime: STALE.settings,
  });

  const deliverable = query.isSuccess && (!query.data.configured || query.data.serviceable);

  let status = '';
  let tone: string = theme.colors.muted;
  if (valid && query.isSuccess) {
    if (!query.data.configured) {
      status = 'Delivery available everywhere';
      tone = theme.colors.brandStrong;
    } else if (query.data.serviceable) {
      status = `Delivers to ${input}`;
      tone = theme.colors.brandStrong;
    } else {
      status = `Not deliverable to ${input} yet`;
      tone = theme.colors.danger;
    }
  } else if (valid && query.isError) {
    status = "Couldn't check delivery. Try again.";
    tone = theme.colors.danger;
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.heading}>Delivery</Text>
      <View style={styles.row}>
        <TextInput
          value={input}
          onChangeText={(t) => setInput(t.replace(/\D/g, '').slice(0, 6))}
          keyboardType="number-pad"
          placeholder="Enter PIN code"
          placeholderTextColor={theme.colors.muted}
          style={styles.input}
          accessibilityLabel="Delivery PIN code"
        />
        <Button
          title="Save"
          variant="secondary"
          // Only a PIN we deliver to can become the shopper's delivery PIN.
          disabled={!valid || !deliverable || input === storePin}
          onPress={() => setPincode(input)}
          testID="delivery-check"
        />
      </View>
      {status ? <Text style={[styles.status, { color: tone }]}>{status}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: theme.spacing.xs },
  heading: { ...theme.typography.body, color: theme.colors.inkStrong, fontWeight: '700' },
  row: { flexDirection: 'row', gap: theme.spacing.sm, alignItems: 'center' },
  input: {
    flex: 1,
    minHeight: theme.touch.minTouch,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    color: theme.colors.ink,
    backgroundColor: theme.colors.surface,
    ...theme.typography.bodyLg,
  },
  status: { ...theme.typography.caption },
});
