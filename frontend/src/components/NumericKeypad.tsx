import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface NumericKeypadProps {
  onKeyPress: (char: string) => void;
  onBackspace: () => void;
  onClear: () => void;
  onSubmit?: () => void;
  submitLabel?: string;
}

export const NumericKeypad: React.FC<NumericKeypadProps> = ({
  onKeyPress,
  onBackspace,
  onClear,
  onSubmit,
  submitLabel = 'Listo',
}) => {
  const keys = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['.', '0', '⌫'],
  ];

  return (
    <View style={styles.container}>
      {keys.map((row, rowIndex) => (
        <View key={`row-${rowIndex}`} style={styles.row}>
          {row.map((k) => {
            if (k === '⌫') {
              return (
                <TouchableOpacity
                  key="backspace"
                  style={[styles.key, styles.specialKey]}
                  onPress={onBackspace}
                  onLongPress={onClear}
                  activeOpacity={0.7}
                >
                  <Ionicons name="backspace-outline" size={24} color="#0f172a" />
                </TouchableOpacity>
              );
            }

            return (
              <TouchableOpacity
                key={k}
                style={styles.key}
                onPress={() => onKeyPress(k)}
                activeOpacity={0.7}
              >
                <Text style={styles.keyText}>{k}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ))}

      {onSubmit ? (
        <TouchableOpacity style={styles.submitBtn} onPress={onSubmit} activeOpacity={0.8}>
          <Text style={styles.submitBtnText}>{submitLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    paddingVertical: 6,
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  key: {
    flex: 1,
    height: 52,
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  specialKey: {
    backgroundColor: '#e2e8f0',
  },
  keyText: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0f172a',
  },
  submitBtn: {
    height: 48,
    backgroundColor: '#0284c7',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  submitBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
});

