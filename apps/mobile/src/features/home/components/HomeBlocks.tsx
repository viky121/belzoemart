import type { HomeBlock } from '@belzo/shared';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '@/theme';
import { Button } from '@/ui';
import { RemoteImage } from '@/ui/RemoteImage';
import { SectionHeader } from '@/ui/SectionHeader';

export interface HomeBlocksProps {
  blocks: HomeBlock[];
  onOpenHref: (href: string | null | undefined) => void;
}

/** Admin-added detail blocks: 'banner' and 'cards'; disabled blocks are skipped (design §11). */
export function HomeBlocks({ blocks, onOpenHref }: HomeBlocksProps) {
  const visible = blocks.filter((b) => b.enabled !== false);
  if (visible.length === 0) return null;
  return (
    <View>
      {visible.map((block) =>
        block.type === 'banner' ? (
          <View key={block.id} style={styles.banner}>
            {block.imageUrl ? (
              <RemoteImage uri={block.imageUrl} width="100%" height={140} radius={theme.radius.md} />
            ) : null}
            {block.title ? <Text style={styles.bannerTitle}>{block.title}</Text> : null}
            {block.text ? <Text style={styles.bannerText}>{block.text}</Text> : null}
            {block.ctaText ? (
              <Button
                title={block.ctaText}
                variant="secondary"
                onPress={() => onOpenHref(block.ctaHref)}
                style={styles.cta}
              />
            ) : null}
          </View>
        ) : (
          <View key={block.id} style={styles.cardsBlock}>
            {block.title ? <SectionHeader title={block.title} /> : null}
            <View style={styles.cards}>
              {block.cards.map((c, i) => (
                <Pressable
                  key={`${block.id}-${i}`}
                  onPress={() => onOpenHref(c.href)}
                  accessibilityRole="button"
                  accessibilityLabel={c.title}
                  style={styles.card}
                >
                  {c.icon ? <Text style={styles.cardIcon}>{c.icon}</Text> : null}
                  <Text style={styles.cardTitle}>{c.title}</Text>
                  {c.subtitle ? <Text style={styles.cardSub}>{c.subtitle}</Text> : null}
                </Pressable>
              ))}
            </View>
          </View>
        ),
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    margin: theme.spacing.lg,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border2,
  },
  bannerTitle: { ...theme.typography.title, color: theme.colors.inkStrong },
  bannerText: { ...theme.typography.body, color: theme.colors.muted },
  cta: { alignSelf: 'flex-start' },
  cardsBlock: { marginVertical: theme.spacing.md },
  cards: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm, paddingHorizontal: theme.spacing.lg },
  card: {
    flexGrow: 1,
    flexBasis: '47%',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border2,
    padding: theme.spacing.md,
    gap: 2,
  },
  cardIcon: { fontSize: 22 },
  cardTitle: { ...theme.typography.body, color: theme.colors.inkStrong, fontWeight: '700' },
  cardSub: { ...theme.typography.caption, color: theme.colors.muted },
});
