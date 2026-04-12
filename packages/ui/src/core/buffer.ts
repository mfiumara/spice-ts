export class GrowableBuffer {
  private data: Float64Array;
  private _length = 0;

  constructor(initialCapacity = 1024) {
    this.data = new Float64Array(initialCapacity);
  }

  get length(): number { return this._length; }
  get capacity(): number { return this.data.length; }

  push(value: number): void {
    if (this._length >= this.data.length) {
      const newData = new Float64Array(this.data.length * 2);
      newData.set(this.data);
      this.data = newData;
    }
    this.data[this._length++] = value;
  }

  get(index: number): number { return this.data[index]; }

  toArray(): Float64Array { return this.data.slice(0, this._length); }

  slice(start: number, end: number): number[] {
    return Array.from(this.data.subarray(start, end));
  }

  clear(): void { this._length = 0; }
}
