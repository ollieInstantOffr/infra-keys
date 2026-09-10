/**
 * The PRF extension (WebAuthn L3) is shipped by Chrome and Safari but is not
 * in TypeScript's DOM lib yet. Declaring it here keeps the call sites honest
 * instead of casting them to `any`.
 */
interface AuthenticationExtensionsPRFValues {
  first: BufferSource;
  second?: BufferSource;
}

interface AuthenticationExtensionsPRFInputs {
  eval?: AuthenticationExtensionsPRFValues;
  evalByCredential?: Record<string, AuthenticationExtensionsPRFValues>;
}

interface AuthenticationExtensionsPRFOutputs {
  enabled?: boolean;
  results?: { first: ArrayBuffer; second?: ArrayBuffer };
}

interface AuthenticationExtensionsClientInputs {
  prf?: AuthenticationExtensionsPRFInputs;
}

interface AuthenticationExtensionsClientOutputs {
  prf?: AuthenticationExtensionsPRFOutputs;
}

/**
 * SimpleWebAuthn ships its own module-scoped copy of the DOM types, so the
 * global merge above does not reach its `extensions` fields. This is the
 * shape we hand to those APIs.
 */
declare type PrfExtensionInput = {
  prf?: AuthenticationExtensionsPRFInputs;
};
