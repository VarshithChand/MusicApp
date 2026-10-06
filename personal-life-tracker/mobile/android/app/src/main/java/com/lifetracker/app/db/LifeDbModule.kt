package com.lifetracker.app.db

import android.content.Context
import android.database.Cursor
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableType
import com.facebook.react.bridge.WritableArray
import java.util.concurrent.Executors

/**
 * The phone's own SQLite database (the Android built-in one) for the offline app. No third-party library: the module
 * only runs parameterised SQL that the JavaScript layer sends and returns rows as plain values. All work happens on
 * one background thread, so statements run in order and the UI never blocks.
 *
 * Encryption at rest (SQLCipher) is planned for the hardening phase (ADR-008); until then the database is protected by
 * Android's app sandbox and the phone's own storage encryption.
 */
class LifeDbModule(private val ctx: ReactApplicationContext) : ReactContextBaseJavaModule(ctx) {
  private val worker = Executors.newSingleThreadExecutor()

  private class Helper(c: Context) : SQLiteOpenHelper(c, "life_tracker.db", null, 1) {
    override fun onCreate(db: SQLiteDatabase) {}
    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {}
    override fun onConfigure(db: SQLiteDatabase) {
      db.setForeignKeyConstraintsEnabled(true)
    }
  }

  private val helper by lazy { Helper(ctx.applicationContext) }

  override fun getName() = "LifeDb"

  /** Runs one statement that changes data. Resolves with the number of rows changed (or the new row id for an INSERT). */
  @ReactMethod
  fun execute(sql: String, params: ReadableArray, promise: Promise) {
    worker.execute {
      try {
        val db = helper.writableDatabase
        val args = toArgs(params)
        val trimmed = sql.trimStart()
        if (trimmed.startsWith("INSERT", ignoreCase = true)) {
          val stmt = db.compileStatement(sql)
          bind(stmt, args)
          promise.resolve(stmt.executeInsert().toDouble())
        } else {
          val stmt = db.compileStatement(sql)
          bind(stmt, args)
          promise.resolve(stmt.executeUpdateDelete().toDouble())
        }
      } catch (e: Exception) {
        promise.reject("DB_EXECUTE", e.message, e)
      }
    }
  }

  /** Runs a script of several statements (used for migrations) inside one transaction. */
  @ReactMethod
  fun executeScript(statements: ReadableArray, promise: Promise) {
    worker.execute {
      val db = helper.writableDatabase
      try {
        db.beginTransaction()
        for (i in 0 until statements.size()) db.execSQL(statements.getString(i))
        db.setTransactionSuccessful()
        promise.resolve(true)
      } catch (e: Exception) {
        promise.reject("DB_SCRIPT", e.message, e)
      } finally {
        if (db.inTransaction()) db.endTransaction()
      }
    }
  }

  /** Runs a SELECT and resolves with an array of rows, each a map of column name to value. */
  @ReactMethod
  fun query(sql: String, params: ReadableArray, promise: Promise) {
    worker.execute {
      var c: Cursor? = null
      try {
        c = helper.readableDatabase.rawQuery(sql, toArgs(params).map { it?.toString() }.toTypedArray())
        val out: WritableArray = Arguments.createArray()
        val names = c.columnNames
        while (c.moveToNext()) {
          val row = Arguments.createMap()
          for (i in names.indices) {
            when (c.getType(i)) {
              Cursor.FIELD_TYPE_NULL -> row.putNull(names[i])
              Cursor.FIELD_TYPE_INTEGER -> row.putDouble(names[i], c.getLong(i).toDouble())
              Cursor.FIELD_TYPE_FLOAT -> row.putDouble(names[i], c.getDouble(i))
              else -> row.putString(names[i], c.getString(i))
            }
          }
          out.pushMap(row)
        }
        promise.resolve(out)
      } catch (e: Exception) {
        promise.reject("DB_QUERY", e.message, e)
      } finally {
        c?.close()
      }
    }
  }

  private fun toArgs(params: ReadableArray): List<Any?> = (0 until params.size()).map { i ->
    when (params.getType(i)) {
      ReadableType.Null -> null
      ReadableType.Boolean -> if (params.getBoolean(i)) 1L else 0L
      ReadableType.Number -> {
        val d = params.getDouble(i)
        if (d == Math.rint(d) && Math.abs(d) < 9.0e15) d.toLong() else d
      }
      ReadableType.String -> params.getString(i)
      else -> throw IllegalArgumentException("Unsupported parameter type at position $i")
    }
  }

  private fun bind(stmt: android.database.sqlite.SQLiteStatement, args: List<Any?>) {
    args.forEachIndexed { idx, a ->
      val pos = idx + 1
      when (a) {
        null -> stmt.bindNull(pos)
        is Long -> stmt.bindLong(pos, a)
        is Double -> stmt.bindDouble(pos, a)
        else -> stmt.bindString(pos, a.toString())
      }
    }
  }


  override fun invalidate() {
    worker.shutdown()
    super.invalidate()
  }
}
