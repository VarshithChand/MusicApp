package com.applocker.app.lock

import android.animation.ValueAnimator
import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.view.View
import android.view.animation.LinearInterpolator
import kotlin.math.min

/**
 * A drawn fingerprint with two gentle animations: a ring that pulses outwards and a scan line that sweeps up and down.
 * It is only decoration and a tap target; the actual fingerprint check is Android's own BiometricPrompt.
 * Animations run only while the view is attached and visible, so they cost nothing on a hidden lock screen.
 */
class FingerprintView(ctx: Context, private val main: Int, private val accent: Int) : View(ctx) {
  private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    style = Paint.Style.STROKE
    strokeCap = Paint.Cap.ROUND
  }
  private val rect = RectF()
  private val clip = Path()
  private var pulse = 0f
  private var scan = 0f

  private val pulseAnim = ValueAnimator.ofFloat(0f, 1f).apply {
    duration = 1700
    repeatCount = ValueAnimator.INFINITE
    interpolator = LinearInterpolator()
    addUpdateListener { pulse = it.animatedValue as Float; invalidate() }
  }
  private val scanAnim = ValueAnimator.ofFloat(0f, 1f).apply {
    duration = 1900
    repeatCount = ValueAnimator.INFINITE
    repeatMode = ValueAnimator.REVERSE
    addUpdateListener { scan = it.animatedValue as Float; invalidate() }
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    if (visibility == VISIBLE) start()
  }

  override fun onDetachedFromWindow() {
    stop()
    super.onDetachedFromWindow()
  }

  override fun onVisibilityChanged(changedView: View, visibility: Int) {
    super.onVisibilityChanged(changedView, visibility)
    if (visibility == VISIBLE && isAttachedToWindow) start() else stop()
  }

  private fun start() {
    if (!pulseAnim.isStarted) pulseAnim.start()
    if (!scanAnim.isStarted) scanAnim.start()
  }

  private fun stop() {
    pulseAnim.cancel()
    scanAnim.cancel()
  }

  override fun onDraw(canvas: Canvas) {
    val cx = width / 2f
    val cy = height / 2f
    val r = min(width, height) / 2f * 0.62f
    val unit = r / 6f

    // Expanding, fading ring.
    paint.color = accent
    paint.alpha = ((1f - pulse) * 150).toInt()
    paint.strokeWidth = unit * 0.35f
    canvas.drawCircle(cx, cy, r * (1.0f + 0.45f * pulse), paint)

    // Fingerprint ridges: concentric arcs with gaps, like a real print.
    paint.color = main
    paint.alpha = 255
    paint.strokeWidth = unit * 0.55f
    val arcs = arrayOf(
      floatArrayOf(1.0f, 205f, 250f), floatArrayOf(1.0f, 100f, 50f),
      floatArrayOf(2.0f, 195f, 270f), floatArrayOf(2.0f, 105f, 40f),
      floatArrayOf(3.0f, 190f, 285f), floatArrayOf(3.0f, 100f, 55f),
      floatArrayOf(4.0f, 185f, 150f), floatArrayOf(4.0f, 350f, 150f),
      floatArrayOf(5.0f, 200f, 120f), floatArrayOf(5.0f, 345f, 140f),
      floatArrayOf(6.0f, 215f, 95f), floatArrayOf(6.0f, 335f, 95f),
    )
    for (a in arcs) {
      val rad = unit * a[0]
      rect.set(cx - rad, cy - rad, cx + rad, cy + rad)
      canvas.drawArc(rect, a[1], a[2], false, paint)
    }

    // Scan line, clipped to the print's circle.
    clip.reset()
    clip.addCircle(cx, cy, r, Path.Direction.CW)
    canvas.save()
    canvas.clipPath(clip)
    val y = cy - r + 2f * r * scan
    paint.color = accent
    paint.alpha = 210
    paint.strokeWidth = unit * 0.45f
    canvas.drawLine(cx - r, y, cx + r, y, paint)
    canvas.restore()
  }
}
