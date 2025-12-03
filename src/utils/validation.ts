/**
 * Runtime Validation Utilities
 * Type-safe validation without external dependencies
 */

// ===========================================
// Validation Result Types
// ===========================================

export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

// ===========================================
// Validator Types
// ===========================================

export type Validator<T> = (value: unknown) => ValidationResult<T>;

// ===========================================
// Primitive Validators
// ===========================================

export const isString: Validator<string> = (value) => {
  if (typeof value === "string") {
    return { success: true, data: value };
  }
  return { success: false, error: "Expected string" };
};

export const isNumber: Validator<number> = (value) => {
  if (typeof value === "number" && !isNaN(value)) {
    return { success: true, data: value };
  }
  return { success: false, error: "Expected number" };
};

export const isBoolean: Validator<boolean> = (value) => {
  if (typeof value === "boolean") {
    return { success: true, data: value };
  }
  return { success: false, error: "Expected boolean" };
};

export const isNull: Validator<null> = (value) => {
  if (value === null) {
    return { success: true, data: null };
  }
  return { success: false, error: "Expected null" };
};

export const isUndefined: Validator<undefined> = (value) => {
  if (value === undefined) {
    return { success: true, data: undefined };
  }
  return { success: false, error: "Expected undefined" };
};

// ===========================================
// Combinator Validators
// ===========================================

/**
 * Makes a validator optional (allows undefined)
 */
export function optional<T>(validator: Validator<T>): Validator<T | undefined> {
  return (value) => {
    if (value === undefined) {
      return { success: true, data: undefined };
    }
    return validator(value);
  };
}

/**
 * Makes a validator nullable (allows null)
 */
export function nullable<T>(validator: Validator<T>): Validator<T | null> {
  return (value) => {
    if (value === null) {
      return { success: true, data: null };
    }
    return validator(value);
  };
}

/**
 * Validates an array of items
 */
export function array<T>(itemValidator: Validator<T>): Validator<T[]> {
  return (value) => {
    if (!Array.isArray(value)) {
      return { success: false, error: "Expected array" };
    }

    const result: T[] = [];
    for (let i = 0; i < value.length; i++) {
      const itemResult = itemValidator(value[i]);
      if (!itemResult.success) {
        return {
          success: false,
          error: `Array item ${i}: ${itemResult.error}`,
        };
      }
      result.push(itemResult.data);
    }

    return { success: true, data: result };
  };
}

/**
 * Validates a literal value
 */
export function literal<T extends string | number | boolean>(
  expected: T,
): Validator<T> {
  return (value) => {
    if (value === expected) {
      return { success: true, data: expected };
    }
    return { success: false, error: `Expected ${JSON.stringify(expected)}` };
  };
}

/**
 * Validates one of several literal values
 */
export function union<T extends readonly (string | number | boolean)[]>(
  ...values: T
): Validator<T[number]> {
  return (value) => {
    if (values.includes(value as T[number])) {
      return { success: true, data: value as T[number] };
    }
    return { success: false, error: `Expected one of: ${values.join(", ")}` };
  };
}

// ===========================================
// Object Validator
// ===========================================

type ObjectShape = Record<string, Validator<unknown>>;

type InferObject<T extends ObjectShape> = {
  [K in keyof T]: T[K] extends Validator<infer U> ? U : never;
};

/**
 * Validates an object against a shape
 */
export function object<T extends ObjectShape>(
  shape: T,
): Validator<InferObject<T>> {
  return (value) => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return { success: false, error: "Expected object" };
    }

    const result: Record<string, unknown> = {};
    const obj = value as Record<string, unknown>;

    for (const [key, validator] of Object.entries(shape)) {
      const fieldResult = validator(obj[key]);
      if (!fieldResult.success) {
        return {
          success: false,
          error: `Field "${key}": ${fieldResult.error}`,
        };
      }
      result[key] = fieldResult.data;
    }

    return { success: true, data: result as InferObject<T> };
  };
}

// ===========================================
// API Response Validators
// ===========================================

/**
 * LLM Chat Response validator
 */
export const llmChatResponseValidator = object({
  content: isString,
  provider: isString,
  model: isString,
  usage: optional(
    object({
      prompt_tokens: optional(isNumber),
      completion_tokens: optional(isNumber),
      total_tokens: optional(isNumber),
    }),
  ),
});

/**
 * LLM Has Key Response validator
 */
export const llmHasKeyResponseValidator = object({
  hasKey: isBoolean,
});

/**
 * File Read Response validator
 */
export const fsReadResponseValidator = object({
  content: isString,
});

/**
 * File List Response validator
 */
export const fsListResponseValidator = object({
  files: array(
    object({
      name: isString,
      isDirectory: isBoolean,
      path: isString,
    }),
  ),
});

/**
 * Command Execution Response validator
 */
export const executeCommandResponseValidator = object({
  output: isString,
  exitCode: isNumber,
  newCwd: optional(isString),
});

// ===========================================
// Validation Helper
// ===========================================

/**
 * Validate and parse JSON response
 */
export async function validateResponse<T>(
  response: Response,
  validator: Validator<T>,
): Promise<T> {
  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Request failed: ${response.status} - ${errorBody}`);
  }

  const json = await response.json();
  const result = validator(json);

  if (!result.success) {
    throw new Error(`Validation failed: ${result.error}`);
  }

  return result.data;
}

/**
 * Type-safe parse function
 */
export function parse<T>(validator: Validator<T>, value: unknown): T {
  const result = validator(value);
  if (!result.success) {
    throw new Error(`Validation failed: ${result.error}`);
  }
  return result.data;
}

/**
 * Safe parse function (returns result instead of throwing)
 */
export function safeParse<T>(
  validator: Validator<T>,
  value: unknown,
): ValidationResult<T> {
  return validator(value);
}
