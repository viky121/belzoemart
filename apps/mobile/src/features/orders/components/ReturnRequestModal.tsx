import {
  buildReturnPayload,
  MAX_RETURN_IMAGES,
  RETURN_REASONS,
  RETURN_STEPS,
  resolutionOptions,
  returnEligibility,
  returnStepError,
  type OrderDetail,
  type ReturnDraft,
  type ReturnReasonCode,
  type ReturnResolution,
} from '@belzo/shared';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { userMessage } from '@/api/errors';
import { theme } from '@/theme';
import { Button, QuantitySelector } from '@/ui';
import { IconButton } from '@/ui/IconButton';

import { useSubmitReturn } from '../hooks';
import { ReturnPhotoPicker } from './ReturnPhotoPicker';

export interface ReturnRequestModalProps {
  order: OrderDetail;
  visible: boolean;
  onClose: () => void;
  onDone: () => void;
}

const EMPTY_DRAFT: ReturnDraft = { quantities: {}, reasonCode: null, resolution: null, images: [], comments: '' };

/** Return request wizard (design §11): 5 steps gated by shared returnStepError. */
export function ReturnRequestModal({ order, visible, onClose, onDone }: ReturnRequestModalProps) {
  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState<ReturnDraft>(EMPTY_DRAFT);
  const [wasVisible, setWasVisible] = useState(visible);
  const submit = useSubmitReturn(order.id);

  // Reset the wizard each time it opens (render-time, not an effect).
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setStep(1);
      setDraft(EMPTY_DRAFT);
    }
  }

  const elig = returnEligibility(order);
  const stepError = returnStepError(order, draft, step);
  const resolutions = resolutionOptions(order, draft.reasonCode);

  function patch(p: Partial<ReturnDraft>) {
    setDraft((d) => ({ ...d, ...p }));
  }

  function next() {
    if (stepError) return;
    if (step < RETURN_STEPS) setStep(step + 1);
    else submit.mutate(buildReturnPayload(order, draft), { onSuccess: onDone });
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet">
      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Text style={styles.title}>Request a return</Text>
          <IconButton icon="close" label="Close" onPress={onClose} />
        </View>
        <Text style={styles.stepLabel}>Step {step} of {RETURN_STEPS}</Text>

        <ScrollView style={styles.scroll} contentContainerStyle={styles.body}>
          {step === 1 ? (
            <View style={styles.section}>
              <Text style={styles.heading}>Which items?</Text>
              {order.items.map((item) => {
                const e = elig.items.find((x) => x.id === item.id);
                const max = e?.maxQty ?? 0;
                const qty = draft.quantities[item.id] ?? 0;
                return (
                  <View key={item.id} style={styles.itemRow}>
                    <Pressable
                      style={styles.check}
                      disabled={max === 0}
                      onPress={() => patch({ quantities: { ...draft.quantities, [item.id]: qty > 0 ? 0 : 1 } })}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: qty > 0, disabled: max === 0 }}
                    >
                      <View style={[styles.box, qty > 0 && styles.boxOn, max === 0 && styles.boxDisabled]} />
                      <Text style={[styles.itemTitle, max === 0 && styles.muted]} numberOfLines={2}>
                        {item.title}
                        {max === 0 ? ` (${e?.blockedReason ?? 'not returnable'})` : ''}
                      </Text>
                    </Pressable>
                    {qty > 0 && max > 0 ? (
                      <QuantitySelector
                        value={qty}
                        min={1}
                        max={max}
                        onChange={(v) => patch({ quantities: { ...draft.quantities, [item.id]: v } })}
                        label={item.title}
                      />
                    ) : null}
                  </View>
                );
              })}
            </View>
          ) : null}

          {step === 2 ? (
            <View style={styles.section}>
              <Text style={styles.heading}>Reason</Text>
              {RETURN_REASONS.map((r) => (
                <Pressable
                  key={r.code}
                  style={styles.radio}
                  onPress={() => patch({ reasonCode: r.code as ReturnReasonCode })}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: draft.reasonCode === r.code }}
                >
                  <View style={[styles.dot, draft.reasonCode === r.code && styles.dotOn]} />
                  <Text style={styles.radioLabel}>
                    {r.label}
                    {r.photoRequired ? ' · photo required' : ''}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          {step === 3 ? (
            <View style={styles.section}>
              <Text style={styles.heading}>How should we resolve it?</Text>
              {resolutions.map((o) => (
                <Pressable
                  key={o.value}
                  style={styles.radio}
                  onPress={() => patch({ resolution: o.value as ReturnResolution })}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: draft.resolution === o.value }}
                >
                  <View style={[styles.dot, draft.resolution === o.value && styles.dotOn]} />
                  <View style={styles.flex}>
                    <Text style={styles.radioLabel}>{o.label}</Text>
                    <Text style={styles.radioDesc}>{o.description}</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          ) : null}

          {step === 4 ? (
            <View style={styles.section}>
              <Text style={styles.heading}>Photos &amp; comments</Text>
              <ReturnPhotoPicker images={draft.images} max={MAX_RETURN_IMAGES} onChange={(images) => patch({ images })} />
              <TextInput
                value={draft.comments}
                onChangeText={(comments) => patch({ comments })}
                placeholder="Describe the issue (optional unless required)"
                placeholderTextColor={theme.colors.muted}
                multiline
                maxLength={300}
                style={styles.input}
                accessibilityLabel="Return comments"
              />
            </View>
          ) : null}

          {step === 5 ? (
            <View style={styles.section}>
              <Text style={styles.heading}>Review</Text>
              {order.items
                .filter((i) => (draft.quantities[i.id] ?? 0) > 0)
                .map((i) => (
                  <Text key={i.id} style={styles.reviewLine}>
                    {i.title} × {draft.quantities[i.id]}
                  </Text>
                ))}
              <Text style={styles.reviewMeta}>Reason: {RETURN_REASONS.find((r) => r.code === draft.reasonCode)?.label}</Text>
              <Text style={styles.reviewMeta}>Resolution: {resolutions.find((o) => o.value === draft.resolution)?.label}</Text>
              {draft.images.length > 0 ? <Text style={styles.reviewMeta}>{draft.images.length} photo(s)</Text> : null}
              {draft.comments ? <Text style={styles.reviewMeta}>“{draft.comments}”</Text> : null}
            </View>
          ) : null}

          {stepError ? <Text style={styles.error}>{stepError}</Text> : null}
          {submit.isError ? <Text style={styles.error}>{userMessage(submit.error)}</Text> : null}
        </ScrollView>

        <View style={styles.footer}>
          {step > 1 ? <Button title="Back" variant="ghost" onPress={() => setStep(step - 1)} /> : <View style={styles.flex} />}
          <Button
            title={step < RETURN_STEPS ? 'Next' : 'Submit return request'}
            onPress={next}
            disabled={stepError !== null || submit.isPending}
            loading={submit.isPending}
            testID="return-next"
          />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.sm },
  title: { ...theme.typography.title, color: theme.colors.inkStrong },
  stepLabel: { ...theme.typography.caption, color: theme.colors.muted, paddingHorizontal: theme.spacing.lg },
  scroll: { flex: 1 },
  body: { padding: theme.spacing.lg, gap: theme.spacing.md },
  section: { gap: theme.spacing.sm },
  heading: { ...theme.typography.title, color: theme.colors.inkStrong },
  itemRow: { gap: theme.spacing.xs, borderBottomWidth: 1, borderBottomColor: theme.colors.border, paddingBottom: theme.spacing.sm },
  check: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  box: { width: 20, height: 20, borderRadius: theme.radius.sm, borderWidth: 2, borderColor: theme.colors.border },
  boxOn: { backgroundColor: theme.colors.primaryStrong, borderColor: theme.colors.primaryStrong },
  boxDisabled: { borderColor: theme.colors.mutedSoft },
  itemTitle: { ...theme.typography.body, color: theme.colors.ink, flex: 1 },
  muted: { color: theme.colors.muted },
  radio: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.sm, minHeight: theme.touch.minTouch, paddingVertical: theme.spacing.xs },
  dot: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: theme.colors.border, marginTop: 2 },
  dotOn: { backgroundColor: theme.colors.primaryStrong, borderColor: theme.colors.primaryStrong },
  radioLabel: { ...theme.typography.body, color: theme.colors.ink },
  radioDesc: { ...theme.typography.caption, color: theme.colors.muted },
  flex: { flex: 1 },
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
  reviewLine: { ...theme.typography.body, color: theme.colors.ink },
  reviewMeta: { ...theme.typography.caption, color: theme.colors.muted },
  error: { ...theme.typography.body, color: theme.colors.danger },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: theme.spacing.lg, borderTopWidth: 1, borderTopColor: theme.colors.border, gap: theme.spacing.sm },
});
