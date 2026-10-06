import React from 'react';
import { ActivityIndicator, StatusBar, Text, View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { DarkTheme, DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DataProvider } from './src/data';
import { FoodScreen } from './src/screens/FoodScreen';
import { MoreScreen } from './src/screens/MoreScreen';
import { PlanScreen } from './src/screens/PlanScreen';
import { SpendScreen } from './src/screens/SpendScreen';
import { TodayScreen } from './src/screens/TodayScreen';
import { WaterScreen } from './src/screens/WaterScreen';
import { useColors } from './src/theme';

const Tab = createBottomTabNavigator();

const icon = (glyph: string) => ({ color }: { color: string }) => <Text style={{ color, fontSize: 18 }}>{glyph}</Text>;

function Tabs() {
  const c = useColors();
  const base = c.dark ? DarkTheme : DefaultTheme;
  const theme = { ...base, colors: { ...base.colors, background: c.bg, card: c.card, text: c.text, border: c.border, primary: c.accent } };
  return (
    <NavigationContainer theme={theme}>
      <Tab.Navigator screenOptions={{ headerShown: false, tabBarActiveTintColor: c.accent, tabBarInactiveTintColor: c.muted }}>
        <Tab.Screen name="Today" component={TodayScreen} options={{ tabBarIcon: icon('◉') }} />
        <Tab.Screen name="Spend" component={SpendScreen} options={{ tabBarIcon: icon('₹') }} />
        <Tab.Screen name="Food" component={FoodScreen} options={{ tabBarIcon: icon('🍽') }} />
        <Tab.Screen name="Water" component={WaterScreen} options={{ tabBarIcon: icon('💧') }} />
        <Tab.Screen name="Plan" component={PlanScreen} options={{ tabBarIcon: icon('📅') }} />
        <Tab.Screen name="More" component={MoreScreen} options={{ tabBarIcon: icon('…') }} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  const c = useColors();
  return (
    <SafeAreaProvider>
      <StatusBar barStyle={c.dark ? 'light-content' : 'dark-content'} />
      <DataProvider
        fallback={
          <View style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={c.accent} />
          </View>
        }
        failed={(m) => (
          <View style={{ flex: 1, backgroundColor: c.bg, padding: 24, justifyContent: 'center', gap: 8 }}>
            <Text style={{ color: c.danger, fontSize: 18, fontWeight: '700' }}>The database could not be opened</Text>
            <Text style={{ color: c.text }}>{m}</Text>
            <Text style={{ color: c.muted }}>Nothing was changed. Close the app and open it again; if this repeats, tell the developer.</Text>
          </View>
        )}
      >
        <Tabs />
      </DataProvider>
    </SafeAreaProvider>
  );
}
