package com.applocker.app.storage

import java.security.MessageDigest
import java.security.SecureRandom
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.PBEKeySpec

/** Salted, slow PIN hash (PBKDF2-HMAC-SHA256). Pure JVM so it is unit-tested. The result is further encrypted with the Keystore. */
object PinHasher {
  const val ITERATIONS = 100_000
  private const val KEY_BITS = 256

  fun newSalt(): ByteArray = ByteArray(16).also { SecureRandom().nextBytes(it) }

  fun hash(pin: CharArray, salt: ByteArray, iterations: Int = ITERATIONS): ByteArray {
    val spec = PBEKeySpec(pin, salt, iterations, KEY_BITS)
    try {
      return SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).encoded
    } finally {
      spec.clearPassword()
    }
  }

  /** Constant-time comparison. */
  fun matches(pin: CharArray, salt: ByteArray, iterations: Int, expected: ByteArray): Boolean {
    val actual = hash(pin, salt, iterations)
    try {
      return MessageDigest.isEqual(actual, expected)
    } finally {
      actual.fill(0)
    }
  }
}
