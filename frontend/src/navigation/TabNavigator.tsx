import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { alertsApi } from '../api';
import { AlertsListScreen } from '../screens/Alerts/AlertsListScreen';
import { BatchReceiveScreen } from '../screens/Inventory/BatchReceiveScreen';
import { StockListScreen } from '../screens/Inventory/StockListScreen';
import { POSScreen } from '../screens/POS/POSScreen';
import { ReportsScreen } from '../screens/Reports/ReportsScreen';
import { useAuthStore } from '../store/useAuthStore';

export type RootTabParamList = {
  POSTab: undefined;
  InventoryTab: undefined;
  AlertsTab: undefined;
  ReportsTab: undefined;
};

const Tab = createBottomTabNavigator<RootTabParamList>();

// Componente para la pestaña de inventario con sub-navegación simple entre lista y recepción
const InventoryStackScreen = () => {
  const [currentView, setCurrentView] = useState<'LIST' | 'RECEIVE'>('LIST');

  if (currentView === 'RECEIVE') {
    return <BatchReceiveScreen onBack={() => setCurrentView('LIST')} />;
  }

  return <StockListScreen onNavigateToReceive={() => setCurrentView('RECEIVE')} />;
};

export const TabNavigator: React.FC = () => {
  const selectedBranch = useAuthStore((state) => state.selectedBranch);

  // Consulta de conteo de alertas para el badge dinámico del tab
  const { data: alertCounts } = useQuery({
    queryKey: ['alerts-count', selectedBranch?.id],
    queryFn: () => alertsApi.count(selectedBranch?.id),
    enabled: !!selectedBranch,
    refetchInterval: 30000,
  });

  const pendingAlerts = alertCounts?.total || 0;

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#0284c7',
        tabBarInactiveTintColor: '#64748b',
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabLabel,
      }}
    >
      <Tab.Screen
        name="POSTab"
        component={POSScreen}
        options={{
          tabBarLabel: 'POS Venta',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'cart' : 'cart-outline'} size={size} color={color} />
          ),
        }}
      />

      <Tab.Screen
        name="InventoryTab"
        component={InventoryStackScreen}
        options={{
          tabBarLabel: 'Inventario',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'cube' : 'cube-outline'} size={size} color={color} />
          ),
        }}
      />

      <Tab.Screen
        name="AlertsTab"
        component={AlertsListScreen}
        options={{
          tabBarLabel: 'Alertas',
          tabBarBadge: pendingAlerts > 0 ? pendingAlerts : undefined,
          tabBarBadgeStyle: {
            backgroundColor: alertCounts?.high && alertCounts.high > 0 ? '#ef4444' : '#f59e0b',
            color: '#ffffff',
            fontSize: 10,
            fontWeight: '800',
          },
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'notifications' : 'notifications-outline'}
              size={size}
              color={color}
            />
          ),
        }}
      />

      <Tab.Screen
        name="ReportsTab"
        component={ReportsScreen}
        options={{
          tabBarLabel: 'Reportes',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'bar-chart' : 'bar-chart-outline'} size={size} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  );
};

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    height: 60,
    paddingBottom: 6,
    paddingTop: 6,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '700',
  },
});

