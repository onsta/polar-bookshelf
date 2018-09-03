import {ILogger} from './ILogger';

import { init, captureException } from '@sentry/electron';

// This configures the Electron CrashReporter for native app crashes and
// captures any uncaught JavaScript exceptions using the JavaScript SDKs under
// the hood. Be sure to call this function as early as possible in the main
// process and all renderer processes to also catch errors during startup.

init({
     dsn: 'https://2e8b8ca6e6bf4bf58d735f2a405ecb20@sentry.io/1273707',
     // more options...
 });

export class SentryLogger implements ILogger {

    readonly name: string = 'sentry-logger';

    warn(msg: string, ...args: any[]) {
    }

    error(msg: string, ...args: any[]) {

        args.forEach(arg => {

            if( arg instanceof Error) {

                // This captures 'handles' exceptions as Sentry wouldn't actually
                // capture these as they aren't surfaced to Electron.
                captureException(arg);
            }

        });

    }

    info(msg: string, ...args: any[]) {
    }

    verbose(msg: string, ...args: any[]) {
    }

    debug(msg: string, ...args: any[]) {
    }

}
