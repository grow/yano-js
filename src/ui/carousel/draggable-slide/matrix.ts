import { Vector } from '../../../mathf/vector';
import { dom } from '../../..';

const STYLE_STRING_PREFIX = 'matrix(';
const STYLE_STRING_PREFIX_LENGTH = STYLE_STRING_PREFIX.length;

/**
 * Tracks information on an element's transform.
 */
export class Matrix {
  static parseFromString(str: string): Matrix {
    if (!str.length || str === 'none') {
      return new Matrix();
    }
    return new Matrix(
        ...str.slice(STYLE_STRING_PREFIX_LENGTH, -1)
            .split(',')
            .map(parseFloat));
  }

  static fromElementTransform(element: Element): Matrix {
    return Matrix.parseFromString(
      dom.getComputedStyle(<HTMLElement>element).transform);
  }
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly d: number;
  readonly tx: number;
  readonly ty: number;

  constructor(
    a: number = 1,
    b: number = 0,
    c: number = 0,
    d: number = 1,
    tx: number = 0,
    ty: number = 0
  ) {
    this.a = a;
    this.b = b;
    this.c = c;
    this.d = d;
    this.tx = tx;
    this.ty = ty;
  }

  getTranslateX(): number {
    return this.tx;
  }

  getTranslateY(): number {
    return this.ty;
  }

  getTranslation(): Vector {
    return new Vector(this.tx, this.ty);
  }

  translate(x: number, y: number): Matrix {
    const newX = this.tx + x;
    const newY = this.ty + y;
    return new Matrix(this.a, this.b, this.c, this.d, newX, newY);
  }

  setPosition(x: number, y: number): Matrix {
    return new Matrix(this.a, this.b, this.c, this.d, x, y);
  }

  toCSSString(): string {
    const values = [this.a, this.b, this.c, this.d, this.tx, this.ty];
    return `matrix(${values.join(',')})`;
  }

  applyToElementTransform(element: HTMLElement): void {
    element.style.transform = this.toCSSString();
  }
}