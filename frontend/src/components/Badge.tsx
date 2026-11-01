import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AlertSeverity } from '../types';

interface BadgeProps {
  label: string;
  severity?: AlertSeverity | 'SUCCESS' | 'DEFAULT';
  size?: 'small' | 'medium';
}

export const Badge: React.FC<BadgeProps> = ({ label, severity = 'DEFAULT', size = 'medium' }) => {
  const getColorScheme = () => {
    switch (severity) {
      case 'HIGH':
        return {
          bg: '#fee2e2',
          border: '#fca5a5',
          text: '#b91c1c',
        };
      case 'MEDIUM':
        return {
          bg: '#ffedd5',
          border: '#fdba74',
          text: '#c2410c',
        };
      case 'LOW':
        return {
          bg: '#fef9c3',
          border: '#fde047',
          text: '#a16207',
        };
      case 'SUCCESS':
        return {
          bg: '#dcfce7',
          border: '#86efac',
          text: '#15803d',
        };
      case 'INFO':
      case 'DEFAULT':
      default:
        return {
          bg: '#f1f5f9',
          border: '#cbd5e1',
          text: '#475569',
        };
    }
  };

  const scheme = getColorScheme();
  const isSmall = size === 'small';

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: scheme.bg,
          borderColor: scheme.border,
          paddingVertical: isSmall ? 2 : 4,
          paddingHorizontal: isSmall ? 6 : 8,
        },
      ]}
    >
      <Text
        style={[
          styles.text,
          {
            color: scheme.text,
            fontSize: isSmall ? 10 : 12,
          },
        ]}
      >
        {label}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    borderRadius: 6,
    borderWidth: 1,
    alignSelf: 'flex-start',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontWeight: '700',
    textTransform: 'uppercase',
  },
});

