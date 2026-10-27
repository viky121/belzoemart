import { addressInputSchema, GST_STATES, type AddressInput } from '@belzo/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { userMessage } from '@/api/errors';
import type { RootScreenProps } from '@/navigation/types';
import { useSessionStore } from '@/store/session';
import { theme } from '@/theme';
import { Button, Chip, Screen, TextField } from '@/ui';
import { Sheet } from '@/ui/Sheet';

import { useAddresses, useResolvePincode, useSaveAddress } from '../hooks';
import { fetchPinServiceability, pinRefusal, pinVerdict } from '../pin-check';
import { toAddressInput } from './AddressesScreen';

const LABELS: AddressInput['label'][] = ['home', 'work', 'other'];

/**
 * Add / edit address (design §11): PIN autofill, state picker, select mode. When the address is being added
 * for checkout, the PIN is checked against the shop's delivery PIN codes right here, so a PIN we do not deliver
 * to is refused on the form and not found out later.
 */
export function AddressFormScreen({ navigation, route }: RootScreenProps<'AddressForm'>) {
  const addressId = route.params?.addressId;
  const selectForCheckout = route.params?.selectForCheckout === true;
  const { data: addresses } = useAddresses();
  const customer = useSessionStore((s) => s.customer);
  const existing = addressId ? addresses?.find((a) => a.id === addressId) : undefined;

  const prefillName = customer && customer.name !== 'Belzo Customer' ? customer.name : '';
  const defaults: AddressInput = existing
    ? toAddressInput(existing)
    : {
        label: 'home',
        fullName: prefillName,
        phone: customer?.phone ?? '',
        line1: '',
        line2: '',
        city: '',
        state: '',
        pincode: '',
      };

  const { control, handleSubmit, setValue, formState } = useForm<AddressInput>({
    resolver: zodResolver(addressInputSchema),
    defaultValues: defaults,
  });

  const save = useSaveAddress();
  const resolvePin = useResolvePincode();
  const [makeDefault, setMakeDefault] = useState(existing?.isDefault ?? false);
  const [statePicker, setStatePicker] = useState(false);

  const labelValue = useWatch({ control, name: 'label' });
  const stateValue = useWatch({ control, name: 'state' });
  const pincode = useWatch({ control, name: 'pincode' });
  const checkDelivery = selectForCheckout && !addressId;
  const validPin = /^[1-9]\d{5}$/.test(pincode ?? '');
  const delivery = useQuery({
    queryKey: ['pin-delivery', pincode],
    queryFn: () => fetchPinServiceability(pincode),
    enabled: checkDelivery && validPin,
    staleTime: 60_000,
  });
  const verdict = checkDelivery && validPin && delivery.isSuccess ? pinVerdict(delivery.data) : 'unknown';
  const [pinError, setPinError] = useState<string | null>(null);


  // Autofill city/state when a known PIN resolves (fired from the field's onChange).
  function onPincodeChange(value: string, onChange: (v: string) => void) {
    const digits = value.replace(/\D/g, '').slice(0, 6);
    onChange(digits);
    if (/^[1-9]\d{5}$/.test(digits)) {
      resolvePin.mutate(digits, {
        onSuccess: (r) => {
          if (r.city) setValue('city', r.city, { shouldValidate: true });
          if (r.state) setValue('state', r.state, { shouldValidate: true });
        },
      });
    }
  }

  async function submit(values: AddressInput) {
    setPinError(null);
    if (checkDelivery && pinVerdict(await fetchPinServiceability(values.pincode)) === 'bad') {
      setPinError(pinRefusal(values.pincode));
      return;
    }
    save.mutate(
      { id: addressId, body: values, makeDefault },
      {
        onSuccess: (created) => {
          if (!addressId && selectForCheckout) {
            navigation.popTo('Checkout', { addressId: created.id }, { merge: true });
          } else {
            navigation.goBack();
          }
        },
      },
    );
  }


  return (
    <Screen scroll padded>
      <Text style={styles.label}>Address type</Text>
      <View style={styles.chips}>
        {LABELS.map((l) => (
          <Chip
            key={l}
            label={l[0]!.toUpperCase() + l.slice(1)}
            selected={labelValue === l}
            onPress={() => setValue('label', l)}
          />
        ))}
      </View>

      <TextField control={control} name="fullName" label="Full name" error={formState.errors.fullName?.message} />
      <TextField control={control} name="phone" label="Phone" keyboardType="phone-pad" error={formState.errors.phone?.message} />

      <Controller
        control={control}
        name="pincode"
        render={({ field }) => (
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>PIN code</Text>
            <TextInput
              value={field.value}
              onChangeText={(t) => onPincodeChange(t, field.onChange)}
              onBlur={field.onBlur}
              keyboardType="number-pad"
              placeholder="6-digit PIN"
              placeholderTextColor={theme.colors.muted}
              accessibilityLabel="PIN code"
              style={[styles.input, formState.errors.pincode ? styles.inputError : null]}
            />
            {formState.errors.pincode ? <Text style={styles.err}>{formState.errors.pincode.message}</Text> : null}
            {!formState.errors.pincode && verdict === 'bad' ? (
              <Text style={styles.err} testID="pin-bad">{pinRefusal(pincode)}</Text>
            ) : null}
            {!formState.errors.pincode && verdict === 'ok' ? (
              <Text style={styles.ok} testID="pin-ok">We deliver to {pincode}</Text>
            ) : null}
          </View>
        )}
      />

      <TextField control={control} name="line1" label="Address line 1" error={formState.errors.line1?.message} />
      <TextField control={control} name="line2" label="Address line 2 (optional)" error={formState.errors.line2?.message} />
      <TextField control={control} name="city" label="City" error={formState.errors.city?.message} />

      <Text style={styles.label}>State</Text>
      <Pressable style={styles.statePicker} onPress={() => setStatePicker(true)} accessibilityRole="button">
        <Text style={stateValue ? styles.stateValue : styles.statePlaceholder}>
          {stateValue || 'Select state'}
        </Text>
      </Pressable>
      {formState.errors.state ? <Text style={styles.err}>{formState.errors.state.message}</Text> : null}

      <View style={styles.defaultRow}>
        <Text style={styles.defaultLabel}>Make this my default address</Text>
        <Switch value={makeDefault} onValueChange={setMakeDefault} />
      </View>

      {pinError ? <Text style={styles.err}>{pinError}</Text> : null}
      {save.isError ? <Text style={styles.err}>{userMessage(save.error)}</Text> : null}

      <Button
        title={addressId ? 'Save changes' : 'Save address'}
        fullWidth
        loading={save.isPending}
        disabled={verdict === 'bad'}
        onPress={handleSubmit(submit)}
        style={styles.submit}
        testID="address-save"
      />

      <Sheet visible={statePicker} title="Select state" onClose={() => setStatePicker(false)}>
        <ScrollView style={styles.stateList}>
          {GST_STATES.map((s) => (
            <Pressable
              key={s.code}
              style={styles.stateRow}
              onPress={() => {
                setValue('state', s.name, { shouldValidate: true });
                setStatePicker(false);
              }}
              accessibilityRole="button"
            >
              <Text style={styles.stateRowText}>{s.name}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: { ...theme.typography.body, color: theme.colors.ink, fontWeight: '500', marginBottom: theme.spacing.xs },
  field: { marginBottom: theme.spacing.md },
  fieldLabel: { ...theme.typography.body, color: theme.colors.ink, fontWeight: '500', marginBottom: theme.spacing.xs },
  input: {
    minHeight: theme.touch.minTouch,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    color: theme.colors.ink,
    ...theme.typography.bodyLg,
  },
  inputError: { borderColor: theme.colors.danger },
  chips: { flexDirection: 'row', gap: theme.spacing.sm, marginBottom: theme.spacing.md },
  statePicker: {
    minHeight: theme.touch.minTouch,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    marginBottom: theme.spacing.md,
  },
  stateValue: { ...theme.typography.bodyLg, color: theme.colors.ink },
  statePlaceholder: { ...theme.typography.bodyLg, color: theme.colors.muted },
  defaultRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: theme.spacing.md },
  defaultLabel: { ...theme.typography.body, color: theme.colors.ink },
  err: { ...theme.typography.caption, color: theme.colors.danger, marginBottom: theme.spacing.sm },
  ok: { ...theme.typography.caption, color: theme.colors.primaryStrong, marginBottom: theme.spacing.sm },
  submit: { marginTop: theme.spacing.md },
  stateList: { maxHeight: 400 },
  stateRow: { minHeight: theme.touch.minTouch, justifyContent: 'center', borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  stateRowText: { ...theme.typography.bodyLg, color: theme.colors.ink },
});
