package com.applocker.app.lock

import android.content.Context
import android.content.res.Configuration
import android.graphics.Color

enum class ThemeMode { SYSTEM, LIGHT, DARK }

/** Colours for the native lock screen. The React Native screens use the same values (src/theme.ts) so the app looks the same everywhere. */
class LockPalette(
  val dark: Boolean,
  val bg: Int,
  val text: Int,
  val muted: Int,
  val key: Int,
  val keyText: Int,
  val accent: Int,
  val error: Int,
) {
  companion object {
    fun isDark(ctx: Context, mode: ThemeMode): Boolean = when (mode) {
      ThemeMode.DARK -> true
      ThemeMode.LIGHT -> false
      ThemeMode.SYSTEM -> (ctx.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES
    }

    fun of(ctx: Context, mode: ThemeMode): LockPalette =
      if (isDark(ctx, mode)) {
        LockPalette(true, Color.parseColor("#0B0B0D"), Color.parseColor("#F2F3F5"), Color.parseColor("#9AA0AA"),
          Color.parseColor("#22242A"), Color.parseColor("#F2F3F5"), Color.parseColor("#4C8DFF"), Color.parseColor("#FF8A80"))
      } else {
        LockPalette(false, Color.parseColor("#F6F7F9"), Color.parseColor("#14161A"), Color.parseColor("#5D6573"),
          Color.parseColor("#E6E9EF"), Color.parseColor("#14161A"), Color.parseColor("#2563EB"), Color.parseColor("#C62828"))
      }
  }
}
