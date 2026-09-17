/// <reference types="vite/client" />

/**
 * The environment the build injects.
 *
 * Declared explicitly rather than relying on the wildcard, so a typo in a variable name is a
 * compile error rather than an undefined at runtime. Firebase is identity only, so these three
 * are the whole of it, and VITE_DEV_AUTH must be absent or false anywhere the application is
 * actually deployed.
 */
interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_DEV_AUTH?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
