import React, { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { LoginScreen } from '../screens/Auth/LoginScreen';
import { useAuthStore } from '../store/useAuthStore';
import { TabNavigator } from './TabNavigator';

const Stack = createNativeStackNavigator();

export const AppNavigator: React.FC = () => {
  const { isAuthenticated, isHydrated, hydrate } = useAuthStore();

  useEffect(() => {
    hydrate();
  }, []);

  if (!isHydrated) {
    return (
      <View style={styles.splashContainer}>
        <ActivityIndicator size="large" color="#38bdf8" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
        {isAuthenticated ? (
          <Stack.Screen name="MainTabs" component={TabNavigator} />
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};

const styles = StyleSheet.create({
  splashContainer: {
    flex: 1,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

