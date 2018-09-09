import {CaptureOpts} from './CaptureOpts';
import {WebContents, WebRequest} from 'electron';
import {CaptureResult} from './CaptureResult';
import {Logger} from '../logger/Logger';
import {Preconditions} from '../Preconditions';
import {PendingWebRequestsListener} from '../webrequests/PendingWebRequestsListener';
import {DebugWebRequestsListener} from '../webrequests/DebugWebRequestsListener';
import {WebRequestReactor} from '../webrequests/WebRequestReactor';
import {WebContentsDriver, WebContentsDriverFactory} from './drivers/WebContentsDriver';
import {BrowserProfile} from './BrowserProfile';
import {Strings} from '../util/Strings';
import {Optional} from '../util/ts/Optional';
import {IResult} from '../util/Result';
import {Results} from '../util/Results';
import {Functions} from '../util/Functions';
import {Filenames} from '../util/Filenames';
import {CapturedPHZWriter} from './CapturedPHZWriter';
import {FilePaths} from '../util/FilePaths';
import {Promises} from '../util/Promises';

const log = Logger.create();

/**
 * This is a hard coded delay to hold off capturing the content until the page
 * has finished executing all onLoad handlers. I need our own way to handle this
 * within the capture main process. Maybe I could add our own loader to the END
 * of the list and only run once our loader function finishes last.
 *
 * @type {number}
 */
const EXECUTE_CAPTURE_DELAY = 1500;

export class Capture {

    public url: string;
    public readonly browserProfile: BrowserProfile;
    public readonly stashDir: string;
    public readonly captureOpts: CaptureOpts;

    public readonly pendingWebRequestsListener: PendingWebRequestsListener;
    public readonly debugWebRequestsListener: DebugWebRequestsListener;

    public readonly webRequestReactors: WebRequestReactor[] = [];

    private webContents?: WebContents;

    private driver?: WebContentsDriver;

    /**
     * The resolve function to call when we have completed .
     */
    public resolve: CaptureResultCallback = () => {};

    constructor(url: string,
                browserProfile: BrowserProfile,
                stashDir: string,
                captureOpts: CaptureOpts = {amp: true}) {

        // FIXME: don't allow named anchors in the URL like #foo... strip them
        // and test this functionality.

        this.url = Preconditions.assertNotNull(url, "url");

        if(Strings.empty(this.url)) {
            throw new Error("URL may not be empty")
        }

        this.browserProfile = Preconditions.assertNotNull(browserProfile, "browser");
        this.stashDir = Preconditions.assertNotNull(stashDir, "stashDir");
        this.captureOpts = captureOpts;

        this.pendingWebRequestsListener = new PendingWebRequestsListener();
        this.debugWebRequestsListener = new DebugWebRequestsListener();

        if (captureOpts.pendingWebRequestsCallback) {
            this.pendingWebRequestsListener.addEventListener(captureOpts.pendingWebRequestsCallback);
        }

    }

    async start(): Promise<CaptureResult> {

        let driver = await WebContentsDriverFactory.create(this.browserProfile);

        this.driver = driver;

        this.webContents = await driver.getWebContents();

        this.driver!.addEventListener('close', () => {
            this.stop();
        });

        this.onWebRequest(this.webContents.session.webRequest);

        await this.loadURL(this.url);

        return new Promise<CaptureResult>(resolve => {
            this.resolve = resolve;
        });

    }

    private async loadURL(url: string) {

        // wait until the main URL loads.
        const loadURLPromise = this.driver!.loadURL(this.url);

        // wait a minimum amount of time for the page to load so that we can
        // make sure that all static content has executed.
        const minDelayPromise = Promises.waitFor(EXECUTE_CAPTURE_DELAY);

        await Promise.all([ loadURLPromise, minDelayPromise ]);

        // the page loaded now... capture the content.
        await this.handleLoad();

    }

    private async handleLoad() {

        // see if we first need to handle the page in any special manner.

        // FIXME: make this into some type of content handlers system
        // so that we can add one off extensions like reloading the a page
        // when AMP or other features are detected.  We could also do AMP
        // earlier I thin like on-dom-ready.
        //

        const ampURL = await this.getAmpURL();

        // TODO: if we end up handling multiple types of URLs in the future
        // we might want to build up a history to prevent endless loops or
        // just keep track of the redirect count.
        if(this.captureOpts.amp && ampURL && ampURL !== this.url) {

            log.info("Found AMP URL.  Redirecting then loading: " + ampURL);

            await this.loadURL(ampURL);
            return;

        }

        setTimeout(() => {

            // capture within timeout just for debug purposes.

            this.stop();

            this.capture()
                .catch(err => log.error(err));

        }, 1);

    }

    public stop() {

        this.webRequestReactors.forEach(webRequestReactor => {
            log.info("Stopping webRequestReactor...");
            webRequestReactor.stop();
            log.info("Stopping webRequestReactor...done");
        });

    }

    /**
     * Called when the onLoad handler is executed and we're ready to start the
     * capture.
     */
    public async capture() {

        this.executeContentCapture()
            .catch(err => log.error(err));

    }

    /**
     * See if the page has a rel=amphtml URL.
     *
     * @return {Promise<string>}
     */
    private async getAmpURL() {

        /** @RendererContext */
        function fetchAmpURL() {

            const link = <HTMLLinkElement> document.querySelector("link[rel='amphtml']");

            if (link) {
                return link.href;
            }

            return null;

        }

        return await this.webContents!.executeJavaScript(Functions.functionToScript(fetchAmpURL));

    }

    public async executeContentCapture() {

        // TODO: this function should be cleaned up a bit.. it has too many moving
        // parts now and should be moved into smaller functions.

        const webContents = this.webContents!;

        log.info("Capturing the HTML...");

        log.info("Retrieving HTML...");

        let captured;

        // TODO: I don't think executeJavascript actually handles exceptions
        // properly and they also suggest using the callback so we should test
        // this more aggressively.
        try {

            const result: IResult<any> = await webContents.executeJavaScript("ContentCapture.execute()");
            captured = Results.create<any>(result).get();

        } catch (e) {

            // TODO: this isn't actually called because executeJavascript doesn't
            // handle exceptions. You just block there forever. I need to wrap
            // this with a closure that is an 'either' err or content.

            log.error("Could not capture HTML: ", e);
            throw e;
        }

        log.info("Retrieving HTML...done");

        // record the browser that was used to render this page.
        captured.browser = this.browserProfile;

        const stashDir = this.stashDir;
        const filename = Filenames.sanitize(captured.title);

        const phzPath = FilePaths.join(stashDir, filename) + '.phz';

        log.info("Writing PHZ to: " + phzPath);

        const capturedPHZWriter = new CapturedPHZWriter(phzPath);
        await capturedPHZWriter.convert(captured);

        // write the captured HTML to /tmp for debug purposes.  We can enable this
        // as a command line switch later.

        // await Files.writeFileAsync(`/tmp/${filename}.json`, JSON.stringify(captured, null, "  "));

        log.info("Capturing the HTML...done");

        Optional.of(this.driver).when(driver => driver.destroy());

        this.resolve({
            path: phzPath
        });

    }

    /**
     * Called when we have a web request to listen to. Either the first one
     * or subsequent ones from iframes.
     *
     * @param webRequest
     */
    public onWebRequest(webRequest: WebRequest) {

        let webRequestReactor = new WebRequestReactor(webRequest);
        webRequestReactor.start();

        this.webRequestReactors.push(webRequestReactor);

        //this.debugWebRequestsListener.register(webRequestReactor);
        this.pendingWebRequestsListener.register(webRequestReactor);

    }

}

export interface CaptureResultCallback {
    (captureResult: CaptureResult): void;
}
