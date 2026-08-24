export const f32 = Math.fround;

export function f32Add(left: number, right: number): number {
  return f32(f32(left) + f32(right));
}

export function f32Mul(left: number, right: number): number {
  return f32(f32(left) * f32(right));
}

export function f32Div(left: number, right: number): number {
  if (right === 0) throw new RangeError('division by zero');
  return f32(f32(left) / f32(right));
}

export function clamp(value: number, minimum: number, maximum: number): number {
  if (minimum > maximum) throw new RangeError('minimum exceeds maximum');
  return Math.min(maximum, Math.max(minimum, value));
}

export function floorDamage(value: number): number {
  return Math.max(0, Math.floor(value));
}
