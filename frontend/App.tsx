import React from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { ToastBanner } from './src/components/ToastBanner';
import { AppNavigator } from './src/navigation/AppNavigator';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 1000 * 10, // 10 segundos
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: false,
    },
  },
});

export default function App() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <View style={styles.root}>
          <StatusBar style="auto" />
          <AppNavigator />
          <ToastBanner />
        </View>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
});

