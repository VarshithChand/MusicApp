/** Languages a listener can ask for. Keys match the server's list and YouTube's language codes. */
export const LANGUAGES: { key: string; label: string }[] = [
  { key: 'te', label: 'Telugu' },
  { key: 'hi', label: 'Hindi' },
  { key: 'ta', label: 'Tamil' },
  { key: 'kn', label: 'Kannada' },
  { key: 'ml', label: 'Malayalam' },
  { key: 'en', label: 'English' },
];

export const languageLabel = (key: string) => LANGUAGES.find((l) => l.key === key)?.label ?? key;
