import { pickupDayOfSlot, shopAddressLine, type FulfilmentMethod, type PickupInfo } from '@belzo/shared';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/theme';
import { Chip, RadioRow } from '@/ui';

interface Props {
  info: PickupInfo;
  fulfilment: FulfilmentMethod;
  onFulfilment: (f: FulfilmentMethod) => void;
  /** Start (ISO) of the chosen slot, or '' for none. */
  slotStart: string;
  onSlot: (startIso: string) => void;
  /** Right-hand price of home delivery ("Free", "₹40"), '' while unknown. */
  deliveryPrice: string;
}

/**
 * Checkout: Home delivery or Self pickup. With Self pickup it shows the shop address and the shop's note, then
 * the days and time slots to choose from. Home delivery stays the normal choice and shows nothing extra.
 */
export function PickupSelector({ info, fulfilment, onFulfilment, slotStart, onSlot, deliveryPrice }: Props) {
  const [pickedDay, setPickedDay] = useState<string | null>(null);
  const pickup = fulfilment === 'pickup';
  const activeDate = pickedDay && info.days.some((d) => d.date === pickedDay) ? pickedDay : pickupDayOfSlot(info.days, slotStart);
  const day = info.days.find((d) => d.date === activeDate);
  const addressLine = shopAddressLine(info.shop);

  return (
    <View testID="delivery-method">
      <View style={[styles.card, styles.methods]}>
        <RadioRow
          label="Home delivery"
          description={`Delivery in 3–5 days${deliveryPrice ? ` · ${deliveryPrice}` : ''}`}
          selected={!pickup}
          onPress={() => onFulfilment('delivery')}
        />
        <RadioRow
          label="Self pickup"
          description="Collect your order from our shop. No delivery charge."
          selected={pickup}
          onPress={() => onFulfilment('pickup')}
        />
      </View>

      {pickup ? (
        <View style={styles.card} testID="pickup-details">
          <Text style={styles.shopName}>{info.shop.name}</Text>
          {addressLine ? <Text style={styles.line}>{addressLine}</Text> : null}
          {info.shop.phone ? <Text style={styles.line}>Phone: {info.shop.phone}</Text> : null}
          {info.note ? <Text style={styles.note}>{info.note}</Text> : null}

          <Text style={styles.label}>Choose pickup day</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {info.days.map((d) => (
              <Chip
                key={d.date}
                label={d.label}
                selected={d.date === activeDate}
                onPress={() => {
                  setPickedDay(d.date);
                  // The slot belongs to the old day: ask again.
                  if (!d.slots.some((s) => s.start === slotStart)) onSlot('');
                }}
              />
            ))}
          </ScrollView>

          <Text style={styles.label}>Choose pickup time</Text>
          <View style={styles.wrap}>
            {(day?.slots ?? []).map((s) => (
              <Chip key={s.start} label={s.label} selected={s.start === slotStart} onPress={() => onSlot(s.start)} />
            ))}
          </View>
          {!slotStart ? (
            <Text style={styles.hint} testID="pickup-slot-hint">
              Please choose a pickup time to place the order.
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    marginTop: theme.spacing.sm,
    shadowColor: '#0f172a',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  methods: { paddingVertical: theme.spacing.xs },
  shopName: { ...theme.typography.body, color: theme.colors.inkStrong, fontWeight: '800' },
  line: { ...theme.typography.caption, color: theme.colors.muted },
  note: { ...theme.typography.caption, color: theme.colors.ink, marginTop: theme.spacing.xs },
  label: { ...theme.typography.body, color: theme.colors.inkStrong, fontWeight: '700', marginTop: theme.spacing.md, marginBottom: theme.spacing.xs },
  chips: { flexDirection: 'row', gap: theme.spacing.sm },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
  hint: { ...theme.typography.caption, color: theme.colors.warnText, marginTop: theme.spacing.sm },
});
