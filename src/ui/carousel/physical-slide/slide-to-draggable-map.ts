import { HorizontallyDraggable } from '../../draggable/horizontally-draggable';
import { DefaultMap } from '../../../map/default-map';
import { Draggable } from '../../draggable/draggable';
import { Carousel } from '../carousel';
import { Vector } from '../../../mathf/vector';
import { mathf } from '../../..';
import { Matrix } from './matrix';

function constrainPhysicalSlide(
    carousel: Carousel, draggable: Draggable, delta: Vector
): Vector {
  const slides = carousel.getSlides();
  const container = carousel.getContainer();

  // Allow for centering the last slide
  const halfContainerWidth = container.offsetWidth / 2;
  const widthOfAllSlides =
      mathf.sum(slides.map((s) => s.offsetWidth));
  const widthOfLastSlide = slides.slice(-1)[0].offsetWidth;
  const halfWidthOfLastSlide = widthOfLastSlide / 2;
  const halfWidthOfFirstSlide = slides[0].offsetWidth / 2;

  const min =
      halfContainerWidth - widthOfAllSlides + halfWidthOfLastSlide;
  const max = halfContainerWidth - halfWidthOfFirstSlide;
  const currentX =
      Matrix.fromElementTransform(draggable.getElement()).getTranslateX();
  const finalX = currentX + delta.x;
  const clampedFinalX = mathf.clamp(min, max, finalX);
  const deltaX = clampedFinalX - currentX;

  return new Vector(deltaX, delta.y);
}

export class SlideToDraggableMap extends DefaultMap<HTMLElement, Draggable> {
  constructor(carousel: Carousel) {
    const constraints =
        carousel.allowsLooping() ?
            [] :
            [(draggable: Draggable, delta: Vector) => {
              return constrainPhysicalSlide(carousel, draggable, delta);
            }];

    const options = { constraints };
    const defaultFn =
        (slide: HTMLElement) => new HorizontallyDraggable(slide, options);
    super([], defaultFn);
  }
}
