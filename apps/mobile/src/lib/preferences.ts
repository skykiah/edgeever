import AsyncStorage from "@react-native-async-storage/async-storage";

const MEMO_LIST_DENSITY_KEY = "edgeever.mobile.memoListDensity";
const IMAGE_COMPRESSION_KEY = "edgeever.mobile.imageCompressionEnabled";
const LOCALE_PREFERENCE_KEY = "edgeever.mobile.localePreference";
const THEME_PREFERENCE_KEY = "edgeever.mobile.themePreference";
const UPDATE_TOAST_DISMISSED_VERSION_KEY = "edgeever.mobile.updateToastDismissedVersion";

export type MobileMemoListDensity = "preview" | "compact";
export type MobileLocalePreference = "system" | "zh-CN" | "en-US";
export type MobileThemePreference = "system" | "light" | "dark";

export const readMobileMemoListDensity = async (): Promise<MobileMemoListDensity> => {
  const value = await AsyncStorage.getItem(MEMO_LIST_DENSITY_KEY);
  return value === "compact" ? "compact" : "preview";
};

export const writeMobileMemoListDensity = (density: MobileMemoListDensity) => AsyncStorage.setItem(MEMO_LIST_DENSITY_KEY, density);

export const readMobileImageCompressionEnabled = async () => {
  const value = await AsyncStorage.getItem(IMAGE_COMPRESSION_KEY);
  return value !== "false";
};

export const writeMobileImageCompressionEnabled = (enabled: boolean) => AsyncStorage.setItem(IMAGE_COMPRESSION_KEY, enabled ? "true" : "false");

export const readMobileLocalePreference = async (): Promise<MobileLocalePreference> => {
  const value = await AsyncStorage.getItem(LOCALE_PREFERENCE_KEY);
  return isMobileLocalePreference(value) ? value : "system";
};

export const writeMobileLocalePreference = (locale: MobileLocalePreference) => AsyncStorage.setItem(LOCALE_PREFERENCE_KEY, locale);

export const readMobileThemePreference = async (): Promise<MobileThemePreference> => {
  const value = await AsyncStorage.getItem(THEME_PREFERENCE_KEY);
  return value === "light" || value === "dark" || value === "system" ? value : "system";
};

export const writeMobileThemePreference = (theme: MobileThemePreference) => AsyncStorage.setItem(THEME_PREFERENCE_KEY, theme);

/** Installed app version for which the update toast was already shown (until the user upgrades). */
export const readMobileUpdateToastDismissedVersion = async () => AsyncStorage.getItem(UPDATE_TOAST_DISMISSED_VERSION_KEY);

export const writeMobileUpdateToastDismissedVersion = (installedVersion: string) =>
  AsyncStorage.setItem(UPDATE_TOAST_DISMISSED_VERSION_KEY, installedVersion);

/** Show the toast only once per installed version while a newer package is available. */
export const shouldShowMobileUpdateToastForVersion = (
  installedVersion: string | null | undefined,
  dismissedForVersion: string | null | undefined
) => Boolean(installedVersion) && dismissedForVersion !== installedVersion;

const isMobileLocalePreference = (value: unknown): value is MobileLocalePreference => value === "system" || value === "zh-CN" || value === "en-US";
