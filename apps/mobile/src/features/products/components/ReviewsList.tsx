import { formatDate } from '@belzo/shared';
import { StyleSheet, Text, View } from 'react-native';

import type { Review } from '@/api/types';
import { theme } from '@/theme';
import { Rating } from '@/ui/Rating';
import { RemoteImage } from '@/ui/RemoteImage';
import { SectionHeader } from '@/ui/SectionHeader';

export interface ReviewsListProps {
  reviews: Review[];
}

function thumbnails(imagesJson: unknown): string[] {
  if (!Array.isArray(imagesJson)) return [];
  return imagesJson.filter((x): x is string => typeof x === 'string').slice(0, 3);
}

/** Product reviews (design §11 / §4.2): customerId is never shown — "Verified buyer" or "Customer". */
export function ReviewsList({ reviews }: ReviewsListProps) {
  if (reviews.length === 0) return null;
  return (
    <View style={styles.wrap}>
      <SectionHeader title={`Reviews (${reviews.length})`} />
      {reviews.slice(0, 10).map((r) => {
        const thumbs = thumbnails(r.imagesJson);
        return (
          <View key={r.id} style={styles.review}>
            <View style={styles.head}>
              <Rating value={r.rating} />
              <Text style={styles.who}>{r.verifiedPurchase ? 'Verified buyer' : 'Customer'}</Text>
            </View>
            {r.title ? <Text style={styles.title}>{r.title}</Text> : null}
            {r.body ? <Text style={styles.body}>{r.body}</Text> : null}
            {thumbs.length > 0 ? (
              <View style={styles.thumbs}>
                {thumbs.map((uri, i) => (
                  <RemoteImage key={i} uri={uri} width={56} height={56} radius={theme.radius.sm} />
                ))}
              </View>
            ) : null}
            <Text style={styles.date}>{formatDate(r.createdAt) ?? ''}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: theme.spacing.md },
  review: {
    paddingVertical: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.lg,
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  who: { ...theme.typography.caption, color: theme.colors.brandStrong, fontWeight: '700' },
  title: { ...theme.typography.body, color: theme.colors.inkStrong, fontWeight: '600' },
  body: { ...theme.typography.body, color: theme.colors.ink },
  thumbs: { flexDirection: 'row', gap: theme.spacing.sm, marginTop: theme.spacing.xs },
  date: { ...theme.typography.caption, color: theme.colors.muted },
});
