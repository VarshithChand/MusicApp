import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { BottomNav } from '../components/BottomNav';
import { AccountScreen } from '../screens/AccountScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { LibraryScreen } from '../screens/LibraryScreen';
import { LocalMediaScreen } from '../screens/LocalMediaScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { MovieDetailScreen } from '../screens/MovieDetailScreen';
import { NowPlayingScreen } from '../screens/NowPlayingScreen';
import { SearchScreen } from '../screens/SearchScreen';
import { AdminScreen } from '../screens/AdminScreen';
import { AdminVideoImportScreen } from '../screens/AdminVideoImportScreen';
import { AppearanceScreen } from '../screens/AppearanceScreen';
import { VolumeBoostScreen } from '../screens/VolumeBoostScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { SongListScreen } from '../screens/SongListScreen';
import { YouTubeScreen } from '../screens/YouTubeScreen';
import { useAuth } from '../store/auth';
import { colors } from '../theme/theme';

const Stack = createNativeStackNavigator();
const Tabs = createBottomTabNavigator();

function MainTabs() {
  return (
    <Tabs.Navigator tabBar={(props) => <BottomNav {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="Home" component={HomeScreen} />
      <Tabs.Screen name="YouTube" component={YouTubeScreen} />
      <Tabs.Screen name="Library" component={LibraryScreen} />
      <Tabs.Screen name="LocalMedia" component={LocalMediaScreen} />
      <Tabs.Screen name="Settings" component={SettingsScreen} />
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
          <Stack.Screen name="Search" component={SearchScreen} />
          <Stack.Screen name="Admin" component={AdminScreen} />
          <Stack.Screen name="VideoImport" component={AdminVideoImportScreen} />
          <Stack.Screen name="Appearance" component={AppearanceScreen} />
          <Stack.Screen name="VolumeBoost" component={VolumeBoostScreen} />
          <Stack.Screen name="SongList" component={SongListScreen} />
          <Stack.Screen name="MovieDetail" component={MovieDetailScreen} />
          <Stack.Screen name="Account" component={AccountScreen} />
          <Stack.Screen name="NowPlaying" component={NowPlayingScreen} options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        </>
      ) : (
        <Stack.Screen name="Login" component={LoginScreen} />
      )}
    </Stack.Navigator>
  );
}
