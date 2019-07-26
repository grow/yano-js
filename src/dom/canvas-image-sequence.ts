
import { func } from '../func/func';
import { Defer } from '../func/defer';
import { ImageLoader } from '../loader/image-loader';
import { mathf } from '../mathf/mathf';
import { DomWatcher } from '../dom/dom-watcher';
import { MultiInterpolate, rangedProgress } from '../interpolate/multi-interpolate';
import { RafTimer } from '../raf/raf-timer';


/**
 * A class that allows you to play through an image sequence (sprite) based on
 * progress.
 *
 *
 * Usage:
 *
 * HTML / SASS
 * ```
 * <div class="my-element"></div>
 *
 *
 * .my-element
 *   width: 100vw
 *   height: 100vh
 * ```
 *
 * Then in your JS:
 *
 * ```ts
 *
 * let myImages = [
 *   'image-1.jpg',
 *   'image-2.jpg',
 *   'image-3.jpg',
 *   'image-4.jpg',
 *    ...
 *   'image-100.jpg',
 * ]
 *
 * let canvasImageSequence = new CanvasImageSequence(
 *   document.querySelector('.my-element')
 * );
 * // Load
 * canvasImageSequence.load();
 *
 * // At a later time.  If images aren't loaded yet, render will get ignored.
 *  canvasImageSequence.renderByProgress(0);  // Renders frame at progress 0.
 *  canvasImageSequence.renderByProgress(0.5);  // Renders frame at progress 0.5
 *  canvasImageSequence.renderByProgress(1);  // Renders frame at progress 1
 *
 * // When done.
 * canvasImageSequence.dispose();
 *
 * ```
 * The above would add a canvas to myElement.  The image that gets rendered
 * in the canvas, will be fitted would an algo similar to background:contain
 * so that the image is fully visible.  If the image different aspect ratio
 * than the contain, the image will be both vertically and horizontally centered
 * with contain (maximizing the scale without bleeding out).
 *
 *
 * You can also listen load completion.  Typically, loading frames takes a
 * while so you may want to add a loading indicator and on load completion,
 * render teh canvasImageSequence to the current frame.
 * ```ts
 *
 * // Use image load promise to ensure images are ready.
 * canvasImageSequence.load().then(()=> {
 *    // On load complete render the frame that maps to the current progress.
 *    canvasImageSequence.renderByProgress(myCurrentProgress);
 * })
 *
 *
 * ```
 *
 *
 * ## MultiInterpolate capabilities.
 * Canvas Image Sequence has multiinterpolation built in to make it easier to
 * manage more complex sequences.
 * Normally, you may want to map an image sequence to just play from start to
 * end.  But what if you wanted more flexiblity?  You can do things like:
 *
 *
 * ```ts
 *
 * let progressPoints = [
 *       {
 *         from: 0, to: 0.5, start: 0, end: 1,
 *       },
 *       {
 *         from: 0.5, to: 1, start: 1, end: 0,
 *       },
 * ];
 * canvasImageSequence.setMultiInterpolation(progressPoints);
 * canvasImageSequence.load();
 *
 * ```
 * In the above, now the image sequence will play from start to end and back to
 * the start.  You can define your own progress points to have full control over
 * how you want your image sequence sprite to play out.
 *
 *
 * ## Playback capability
 * You can also play your canvas image sequence with a timer.
 * The playback also provides a completion promise.
 *
 * ```ts
 * // Create a complicated playback.
 * let progressPoints = [
 *       {
 *         from: 0, to: 0.5, start: 0, end: 1,
 *       },
 *       {
 *         from: 0.5, to: 1, start: 1, end: 0,
 *       },
 * ];
 * canvasImageSequence.setMultiInterpolation(progressPoints);
 * // Now load the images.
 * canvasImageSequence.load().then(()=> {
 *    // Now play the image sequence from progress 0 - 1 over a span of 3000 ms.
 *    canvasImageSequence.play(0, 1, 3000).then(()=> {
 *       console.log('done');
 *    })
 * })
 *
 *
 * ```
 *
 *
 * @see https://github.com/uxder/yano-js/blob/master/examples/canvas-image-sequence.js
 * @see https://github.com/uxder/yano-js/blob/master/examples/canvas-image-sequence2.js
 * @unstable
 */
export class CanvasImageSequence {
    /**
     * The main element to add canvas to.
     */
    private element: HTMLElement;

    /**
     * A list of image URLS to load.
     */
    private sources: Array<string>;

    /**
     * Internal instance of ImageLoader.
     */
    private imageLoader: ImageLoader;

    /**
     * A deferred promised that completes when all images have been loaded.
     */
    private readyPromise: Defer;
    private domWatcher: DomWatcher;
    private images: Object;
    private targetFrame: number;
    /**
     * Allows you to lerp the frame updates.  This defaults to 1 where by
     * update to the frames are immediate.
     */
    public lerp: number;
    private rafTimer: RafTimer | null;

    private canvasElement: HTMLCanvasElement;
    private context: CanvasRenderingContext2D;
    private dpr: number;
    private width: number;
    private height: number;

    private lastRenderSource: string | null;
    private multiInterpolate: MultiInterpolate | null;

    constructor(element: HTMLElement, sources: Array<string>) {
        this.element = element;
        this.sources = sources;


        // Sets the default lerp amount for target frame updates.
        // This defaults to 1 so that there normally isn't any lerping.
        this.lerp = 1;

        // Create canvas.
        this.canvasElement = document.createElement('canvas');
        this.context = this.canvasElement.getContext('2d')!;
        this.dpr = window.devicePixelRatio || 1;
        this.width = 0;
        this.height = 0;
        this.targetFrame = 0;

        this.rafTimer = null;
        this.multiInterpolate = null;

        this.domWatcher = new DomWatcher();
        this.domWatcher.add({
            element: window,
            on: 'smartResize',
            callback: () => {
                this.resize();
                // Rerender the last known image.
                this.draw(''); // Make a empty call to clear the memoize cache.
                this.lastRenderSource && this.draw(this.lastRenderSource);
            },
            id: 'resize',
            eventOptions: { passive: true }
        });
        this.resize();
        this.domWatcher.run('resize');


        this.element.appendChild(this.canvasElement);

        this.readyPromise = new Defer();
        this.imageLoader = new ImageLoader(sources);
        this.imageLoader.decodeAfterFetch = true;
        // The loaded images.
        this.images = [];
        this.lastRenderSource = null;

        // Cull unncessary update
        this.draw =
            func.runOnceOnChange(this.draw.bind(this));
    }


    /**
     * Sets an optional multiinterpolations.  This allows you to define
     * more complex play sequences on your image sequence.
     *
     * Here is an example of playing the image sequence from start to end
     * and back to end.
     *
     * ```ts
     * let progressPoints = [
     *       {
     *         from: 0, to: 0.5, start: 0, end: 1,
     *       },
     *       {
     *         from: 0.5, to: 1, start: 1, end: 0,
     *       },
     * ];
     * canvasImageSequence.setMultiInterpolation(progressPoints);
     *
     * ```
     */
    setMultiInterpolation(interpolations: Array<rangedProgress>) {
        this.multiInterpolate = new MultiInterpolate({
            interpolations: [
                {
                    id: 'sequence',
                    progress: interpolations
                }
            ]
        })

    }

    resize() {
        this.dpr = window.devicePixelRatio || 1;
        this.canvasElement.width = this.element.offsetWidth;
        this.canvasElement.height = this.element.offsetHeight;
        this.width = this.element.offsetWidth * this.dpr;
        this.height = this.element.offsetHeight * this.dpr;
    }

    /**
     * Starts loading the images.
     */
    load(): Promise<any> {
        this.imageLoader.load().then((results) => {
            this.images = results;
            this.readyPromise.resolve(results);
        })
        return this.readyPromise.getPromise();
    }

    /**
     * Renders by progress.  0 would mean the very first frame and the 1 would
     * mean the last.
     */
    renderByProgress(n: number) {
        let total = this.sources.length;
        let progress = mathf.clamp01(n);

        // If the optional multiinterpolate is set, then use multiInterpolate
        // to figure out what the correct frame should be.
        if (this.multiInterpolate) {
            let interpolateMap = this.multiInterpolate.calculate(progress);
            progress = mathf.clamp01(interpolateMap['sequence']);
        }


        let targetFrame = Math.ceil(
            mathf.lerp(0, total, progress));
        this.renderFrame(targetFrame);
    }

    /**
     * Renders a given frame on to the html element.
     * @param i
     */
    private renderFrame(i: number) {
        // If images aren't loaded yet, skip drawing.
        if (!this.readyPromise.complete) {
            return;
        }

        // We apply a lerp to the target frame.
        // The lerp is normally set to 1 - where by there really is no
        // lerping and the target frame would immediately update.
        // However, this provides the option, if necessary to lerp the
        // target frame value.
        this.targetFrame = Math.ceil(
            mathf.lerp(this.targetFrame, i, this.lerp));

        let imageSource = this.sources[this.targetFrame];
        this.draw(imageSource)
    }

    clear() {
        this.context.clearRect(0, 0, this.width, this.height);
    }

    draw(imageSource: string): void {
        // Prevent invalid draws
        if (!imageSource) {
            return;
        }


        this.clear();

        let image = this.images[imageSource];
        let imageBox = {
            width: image.naturalWidth,
            height: image.naturalHeight
        }
        let containerBox = {
            width: this.canvasElement.offsetWidth,
            height: this.canvasElement.offsetHeight,
        }

        let containScale =
            mathf.calculateBackgroundContain(containerBox, imageBox);

        let diffX = containerBox.width - (imageBox.width * containScale);
        let diffY = containerBox.height - (imageBox.height * containScale);
        this.context.drawImage(
            image,
            diffX / 2, diffY / 2,
            imageBox.width * containScale,
            imageBox.height * containScale,
        );


        this.lastRenderSource = imageSource;
    }


    /**
     * Plays the canvas image sequence with a timer.
     * @param from A number between 0 - 1
     * @param to A number between 0 - 1
     * @param duration The duration in ms.
     * @return Promise A promise that completes when done.
     */
    play(from: number, to: number, duration: number): Promise<void> {
        this.rafTimer = new RafTimer((progress: number) => {
            let interpolatedProgress = mathf.interpolateRange(
                progress, 0, 1,
                from, to
            );
            this.renderByProgress(interpolatedProgress);
        })
        this.rafTimer.setDuration(duration);
        let defer = new Defer();
        this.rafTimer.onComplete(() => {
            defer.resolve();
            this.rafTimer!.dispose();
        });
        this.rafTimer.play();
        return defer.getPromise();
    }

    dispose() {
        this.domWatcher.dispose();
        this.rafTimer && this.rafTimer.dispose();
    }

}