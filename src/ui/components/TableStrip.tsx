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

// The table's state as a ledger band: two facts on the top rule, then the
// running story underneath. No card, so the role card stays the only block.
export const TableStrip: React.FC<Props> = ({ cells, children }) => {
  const body = React.Children.toArray(children);

  return (
    <View style={styles.strip}>
      {cells.length > 0 ? (
        <View style={styles.cells}>
          {cells.map((cell, index) => (
            <View key={index} style={[styles.cell, index > 0 && styles.cellDivider]}>
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
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: theme.spacing.medium,
  },
  cells: {
    flexDirection: 'row',
  },
  cell: {
    flex: 1,
    paddingVertical: 12,
    paddingEnd: 12,
  },
  cellDivider: {
    borderStartWidth: 1,
    borderStartColor: theme.colors.border,
    paddingStart: 12,
  },
  value: {
    color: theme.colors.text,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
  },
  body: {
    gap: 4,
    paddingTop: 4,
    paddingBottom: 12,
  },
});
