/** Always the newest Android build that passed the automated launch test (published by GitHub Actions). */
export const APK_URL = "https://github.com/VarshithChand/MusicApp/releases/latest/download/music.apk";

export const isAndroid = () => /Android/i.test(navigator.userAgent);
