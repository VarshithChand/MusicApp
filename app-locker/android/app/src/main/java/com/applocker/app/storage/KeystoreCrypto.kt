package com.applocker.app.storage

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** AES-GCM with a non-exportable key held by the Android Keystore (hardware-backed where the phone has it). */
object KeystoreCrypto {
  private const val ALIAS = "applocker_master_key"
  private const val PROVIDER = "AndroidKeyStore"

  private fun key(): SecretKey {
    val ks = KeyStore.getInstance(PROVIDER).apply { load(null) }
    (ks.getKey(ALIAS, null) as? SecretKey)?.let { return it }
    val gen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, PROVIDER)
    gen.init(
      KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .setKeySize(256)
        .build(),
    )
    return gen.generateKey()
  }

  /** Returns the iv (12 bytes) followed by the ciphertext. */
  fun encrypt(plain: ByteArray): ByteArray {
    val c = Cipher.getInstance("AES/GCM/NoPadding")
    c.init(Cipher.ENCRYPT_MODE, key())
    return c.iv + c.doFinal(plain)
  }

  fun decrypt(blob: ByteArray): ByteArray {
    val c = Cipher.getInstance("AES/GCM/NoPadding")
    c.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, blob.copyOfRange(0, 12)))
    return c.doFinal(blob, 12, blob.size - 12)
  }
}
