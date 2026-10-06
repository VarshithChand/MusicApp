package com.lifetracker.app.notify

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import org.json.JSONArray
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.ZoneId

/**
 * Schedules the reminders the app computed (EMI due, salary day) with Android's alarm service, and keeps the list in
 * private storage so it can be re-scheduled after a reboot or an app update. No internet is involved.
 *
 * The app sends the complete list each time something changes; this replaces the old list. Alarms use
 * setAndAllowWhileIdle, which needs no special permission; Android may deliver them a few minutes late in battery saver.
 */
object ReminderScheduler {
  const val ACTION = "com.lifetracker.app.REMINDER"
  private const val PREFS = "reminders"
  private const val KEY = "schedule"

  data class Item(val id: String, val date: String, val time: String, val title: String, val text: String, val channel: String = "money")

  fun parse(json: String): List<Item> {
    val arr = JSONArray(json)
    return (0 until arr.length()).map {
      val o = arr.getJSONObject(it)
      Item(o.getString("id"), o.getString("date"), o.getString("time"), o.getString("title"), o.getString("text"), o.optString("channel", "money"))
    }
  }

  private fun millisOf(i: Item): Long? = try {
    LocalDateTime.of(LocalDate.parse(i.date), LocalTime.parse(i.time)).atZone(ZoneId.systemDefault()).toInstant().toEpochMilli()
  } catch (_: Exception) {
    null
  }

  private fun stored(ctx: Context): List<Item> {
    val json = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, null) ?: return emptyList()
    return try { parse(json) } catch (_: Exception) { emptyList() }
  }

  private fun intent(ctx: Context, i: Item): PendingIntent =
    PendingIntent.getBroadcast(
      ctx,
      i.id.hashCode(),
      Intent(ctx, ReminderReceiver::class.java).setAction(ACTION).putExtra("id", i.id).putExtra("title", i.title).putExtra("text", i.text).putExtra("channel", i.channel),
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )

  /** Replaces the whole schedule. Returns how many reminders are set for the future. */
  fun replaceAll(ctx: Context, json: String): Int {
    parse(json) // fail early (before touching anything) if the list is malformed
    cancelAll(ctx)
    ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY, json).apply()
    return scheduleAll(ctx)
  }

  /** Sets an alarm for every stored reminder that is still in the future. */
  fun scheduleAll(ctx: Context): Int {
    val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    val now = System.currentTimeMillis()
    var count = 0
    for (i in stored(ctx)) {
      val at = millisOf(i) ?: continue
      if (at <= now) continue
      am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, intent(ctx, i))
      count++
    }
    return count
  }

  fun cancelAll(ctx: Context) {
    val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    for (i in stored(ctx)) am.cancel(intent(ctx, i))
  }
}
