import type { AddressInput } from '@belzo/shared';
import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import type { Address } from '@/api/types';
import type { RootScreenProps } from '@/navigation/types';
import { theme } from '@/theme';
import { AddressCard, Button, ConfirmDialog, EmptyState, ErrorState, Screen } from '@/ui';
import { ListSkeleton } from '@/ui/Skeleton';

import { useAddresses, useDeleteAddress, useSaveAddress } from '../hooks';

export function toAddressInput(a: Address): AddressInput {
  return {
    label: a.label,
    fullName: a.fullName,
    phone: a.phone,
    line1: a.line1,
    line2: a.line2,
    city: a.city,
    state: a.state,
    pincode: a.pincode,
  };
}

/** Addresses (design §11): list, add/edit/delete/set-default, and a select mode for checkout. */
export function AddressesScreen({ navigation, route }: RootScreenProps<'Addresses'>) {
  const selectForCheckout = route.params?.selectForCheckout === true;
  const { data, isLoading, isError, error, refetch } = useAddresses();
  const save = useSaveAddress();
  const del = useDeleteAddress();
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const addresses = data ?? [];

  function onCardPress(a: Address) {
    if (selectForCheckout) {
      navigation.popTo('Checkout', { addressId: a.id }, { merge: true });
    } else {
      navigation.navigate('AddressForm', { addressId: a.id });
    }
  }

  if (isLoading) {
    return (
      <Screen>
        <ListSkeleton rows={3} />
      </Screen>
    );
  }
  if (isError) {
    return (
      <Screen>
        <ErrorState error={error} onRetry={() => void refetch()} />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.body}>
        {addresses.length === 0 ? (
          <EmptyState
            icon="map-marker-plus-outline"
            title="No saved addresses"
            body="Add a delivery address to continue."
          />
        ) : (
          addresses.map((a) => (
            <AddressCard
              key={a.id}
              address={a}
              onPress={() => onCardPress(a)}
              actions={
                <>
                  <Button title="Edit" variant="ghost" onPress={() => navigation.navigate('AddressForm', { addressId: a.id })} />
                  {!a.isDefault ? (
                    <Button
                      title="Set default"
                      variant="ghost"
                      loading={save.isPending}
                      onPress={() => save.mutate({ id: a.id, body: toAddressInput(a), makeDefault: true })}
                    />
                  ) : null}
                  <Button
                    title="Delete"
                    variant="ghost"
                    onPress={() => setConfirmId(a.id)}
                    testID={`address-delete-${a.id}`}
                  />
                </>
              }
            />
          ))
        )}

        <Button
          title="Add address"
          onPress={() => navigation.navigate('AddressForm', { selectForCheckout })}
          style={styles.add}
          testID="address-add"
        />
      </ScrollView>

      <ConfirmDialog
        visible={confirmId !== null}
        title="Delete address?"
        body="This address will be removed from your account."
        confirmLabel="Delete"
        destructive
        busy={del.isPending}
        onConfirm={() => {
          if (confirmId) del.mutate(confirmId, { onSettled: () => setConfirmId(null) });
        }}
        onCancel={() => setConfirmId(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { padding: theme.spacing.lg, gap: theme.spacing.md },
  add: { marginTop: theme.spacing.sm },
});
