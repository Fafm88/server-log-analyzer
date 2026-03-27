// Storage is no longer used — all log parsing happens client-side.
// This file is kept as a minimal stub for template compatibility.

export interface IStorage {}

export class MemStorage implements IStorage {}

export const storage = new MemStorage();
