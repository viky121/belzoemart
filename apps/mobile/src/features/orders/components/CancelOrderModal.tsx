import {
  CANCEL_REASONS,
  cancelReasonError,
  cancelReasonText,
  commentMaxChars,
  refundNote,
  type OrderDetail,
} from '@belzo/shared';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { userMessage } from '@/api/errors';
import { theme } from '@/theme';
import { Button } from '@/ui';
import { Sheet } from '@/ui/Sheet';

import { useCancelOrder } from '../hooks';

export interface CancelOrderModalProps {
  order: OrderDetail;
  visible: boolean;
  onClose: () => void;
  onDone: () => void;
}

/** Cancel order (design §11): reason radios, optional/required comment, refund note. */
export function CancelOrderModal({ order, visible, onClose, onDone }: CancelOrderModalProps) {
  const [code, setCode] = useState<string | null>(null);
  const [comments, setComments] = useState('');
  const cancel = useCancelOrder(order.id);

  const label = CANCEL_REASONS.find((r) => r.code === code)?.label ?? '';
  const validationError = cancelReasonError(code, comments);

  function submit() {
    if (!code || validationError) return;
    cancel.mutate(cancelReasonText(code, comments), { onSuccess: onDone });
  }

  return (
    <Sheet visible={visible} title="Cancel order" onClose={onClose}>
      <View style={styles.body}>
        {CANCEL_REASONS.map((r) => (
          <Pressable
            key={r.code}
            style={styles.radio}
            onPress={() => setCode(r.code)}
            accessibilityRole="radio"
            accessibilityState={{ selected: code === r.code }}
          >
            <View style={[styles.dot, code === r.code && styles.dotOn]} />
            <Text style={styles.radioLabel}>{r.label}</Text>
          </Pressable>
        ))}

        <TextInput
          value={comments}
          onChangeText={setComments}
          placeholder="Add a comment (optional)"
          placeholderTextColor={theme.colors.muted}
          maxLength={code ? commentMaxChars(label) : 300}
          multiline
          style={styles.input}
          accessibilityLabel="Cancellation comment"
        />

        <Text style={styles.refund}>{refundNote(order)}</Text>
        {validationError && code ? <Text style={styles.error}>{validationError}</Text> : null}
        {cancel.isError ? <Text style={styles.error}>{userMessage(cancel.error)}</Text> : null}

        <Button
          title="Cancel order"
          variant="danger"
          fullWidth
          loading={cancel.isPending}
          disabled={!code || validationError !== null}
          onPress={submit}
          testID="confirm-cancel-order"
        />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { paddingVertical: theme.spacing.md, gap: theme.spacing.sm },
  radio: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, minHeight: theme.touch.minTouch },
  dot: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: theme.colors.border },
  dotOn: { borderColor: theme.colors.primaryStrong, backgroundColor: theme.colors.primaryStrong },
  radioLabel: { ...theme.typography.body, color: theme.colors.ink, flex: 1 },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    minHeight: 72,
    textAlignVertical: 'top',
    color: theme.colors.ink,
    backgroundColor: theme.colors.surface,
    ...theme.typography.body,
  },
  refund: { ...theme.typography.caption, color: theme.colors.muted },
  error: { ...theme.typography.caption, color: theme.colors.danger },
});
