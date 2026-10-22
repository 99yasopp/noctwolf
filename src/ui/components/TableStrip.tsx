import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '../text';
import { theme } from '../theme/colors';

export interface TableCell {
  value: string;
  tone?: string;
}

interface Props {
  cells: TableCell[];
  children?: React.ReactNode;
}

// The table's state as a quiet instrument panel: facts as chips, then the
// running story underneath.
export const TableStrip: React.FC<Props> = ({ cells, children }) => {
  const body = React.Children.toArray(children);

  return (
    <View style={styles.strip}>
      {cells.length > 0 ? (
        <View style={styles.cells}>
          {cells.map((cell, index) => (
            <View key={index} style={styles.cell}>
              <Text style={[styles.value, cell.tone ? { color: cell.tone } : null]}>
                {cell.value}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
      {body.length > 0 ? <View style={styles.body}>{body}</View> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  strip: {
    borderRadius: theme.radius.card,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 12,
    marginBottom: theme.spacing.medium,
    gap: 8,
  },
  cells: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  cell: {
    maxWidth: '100%',
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.raised,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  value: {
    color: theme.colors.text,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
  },
  body: {
    gap: 5,
  },
});
