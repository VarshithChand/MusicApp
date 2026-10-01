import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { BottomNav } from '../components/BottomNav';
import { AccountScreen } from '../screens/AccountScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { LibraryScreen } from '../screens/LibraryScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { NowPlayingScreen } from '../screens/NowPlayingScreen';
import { SearchScreen } from '../screens/SearchScreen';
import { SongListScreen } from '../screens/SongListScreen';
import { useAuth } from '../store/auth';
import { colors } from '../theme/theme';

const Stack = createNativeStackNavigator();
const Tabs = createBottomTabNavigator();

function MainTabs() {
  return (
    <Tabs.Navigator tabBar={(props) => <BottomNav {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="Home" component={HomeScreen} />
      <Tabs.Screen name="Search" component={SearchScreen} />
      <Tabs.Screen name="Library" component={LibraryScreen} />
    </Tabs.Navigator>
  );
}

export function AppNavigator() {
  const hydrated = useAuth((s) => s.hydrated);
  const signedIn = useAuth((s) => !!s.accessToken);

  if (!hydrated) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center' }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      {signedIn ? (
        <>
          <Stack.Screen name="Tabs" component={MainTabs} />
          <Stack.Screen name="SongList" component={SongListScreen} />
          <Stack.Screen name="Account" component={AccountScreen} />
          <Stack.Screen name="NowPlaying" component={NowPlayingScreen} options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        </>
      ) : (
        <Stack.Screen name="Login" component={LoginScreen} />
      )}
    </Stack.Navigator>
  );
}
