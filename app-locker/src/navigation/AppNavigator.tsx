import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { DarkTheme, DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AboutScreen } from '../screens/AboutScreen';
import { AppLockScreen } from '../screens/AppLockScreen';
import { GateScreen } from '../screens/GateScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { LockSettingsScreen } from '../screens/LockSettingsScreen';
import { OnboardingScreen } from '../screens/OnboardingScreen';
import { PermissionsScreen } from '../screens/PermissionsScreen';
import { PinSetupScreen } from '../screens/PinSetupScreen';
import { SecurityScreen } from '../screens/SecurityScreen';
import { useApp } from '../store/useApp';
import { useColors } from '../theme';
import { RootParamList } from './types';

const Stack = createNativeStackNavigator<RootParamList>();

/**
 * Which screens exist depends on state, so a locked-out user cannot navigate to the settings:
 * no PIN yet -> onboarding; PIN but not unlocked -> gate; otherwise the app.
 */
export function AppNavigator() {
  const colors = useColors();
  const theme = {
    ...(colors.dark ? DarkTheme : DefaultTheme),
    colors: {
      ...(colors.dark ? DarkTheme : DefaultTheme).colors,
      background: colors.bg,
      card: colors.bg,
      text: colors.text,
      border: colors.border,
      primary: colors.accent,
    },
  };
  const settings = useApp((s) => s.settings);
  const unlocked = useApp((s) => s.unlocked);

  if (!settings) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <NavigationContainer theme={theme}>
      <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade', contentStyle: { backgroundColor: colors.bg } }}>
        {!settings.pinConfigured ? (
          <Stack.Screen name="onboarding" component={OnboardingScreen} />
        ) : !unlocked ? (
          <Stack.Screen name="gate" component={GateScreen} />
        ) : (
          <>
            <Stack.Screen name="home" component={HomeScreen} />
            <Stack.Screen name="app-lock" component={AppLockScreen} />
            <Stack.Screen name="security" component={SecurityScreen} />
            <Stack.Screen name="permissions" component={PermissionsScreen} />
            <Stack.Screen name="lock-settings" component={LockSettingsScreen} />
            <Stack.Screen name="about" component={AboutScreen} />
            <Stack.Screen name="pin-setup" component={PinSetupScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
