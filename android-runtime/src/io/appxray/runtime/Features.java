package io.appxray.runtime;

/** Maps feature screen names used by APPXRAY navigation actions to runtime activities. */
final class Features {
    private Features() {}

    static Class<?> activityFor(String name) {
        if ("LoginActivity".equals(name)) return LoginActivity.class;
        if ("WebActivity".equals(name)) return WebActivity.class;
        if ("SettingsActivity".equals(name)) return SettingsActivity.class;
        if ("ItemsActivity".equals(name)) return ItemsActivity.class;
        return null;
    }
}
