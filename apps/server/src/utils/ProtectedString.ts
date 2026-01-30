/**
 * Prevents a string from accidental disclosure. The value should be retrieved
 *   using the `getSecretValue` method at the exact location it's needed in plain text.
 */
export class ProtectedString<S extends string = string> extends String {
  constructor(secretValue: S) {
    super(secretValue);
    // Hide the value in a non-enumerable property
    Object.defineProperty(this, "__secretValue", {
      value: secretValue,
      enumerable: false,
      writable: false,
      configurable: false,
    });
  }

  toString() {
    return "[ProtectedString]";
  }

  toJSON() {
    return "[ProtectedString]";
  }

  getSecretValue(): S {
    // @ts-expect-error
    return this.__secretValue;
  }

  [Symbol.for("nodejs.util.inspect.custom")]() {
    return "[ProtectedString]";
  }
}
