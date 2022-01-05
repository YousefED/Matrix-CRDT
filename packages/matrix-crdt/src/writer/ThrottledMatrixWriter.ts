import * as _ from "lodash";
import { MatrixClient } from "matrix-js-sdk";
import { event, lifecycle } from "vscode-lib";
import * as Y from "yjs";
import { MatrixCRDTEventTranslator } from "../MatrixCRDTEventTranslator";

const DEFAULT_OPTIONS = {
  // throttle flushing write events to matrix by 500ms
  flushInterval: process.env.NODE_ENV === "test" ? 100 : 100 * 5,
  // if writing to the room fails, wait 30 seconds before retrying
  retryIfForbiddenInterval: 1000 * 30,
};

export type ThrottledMatrixWriterOptions = Partial<typeof DEFAULT_OPTIONS>;

/**
 * A class that writes updates in the form of Uint8Array to Matrix.
 */
export class ThrottledMatrixWriter extends lifecycle.Disposable {
  private pendingUpdates: Uint8Array[] = [];
  private isSendingUpdates = false;
  private _canWrite = true;
  private retryTimeoutHandler: any;
  private roomId: string | undefined;

  private readonly _onCanWriteChanged: event.Emitter<void> = this._register(
    new event.Emitter<void>()
  );

  public readonly onCanWriteChanged: event.Event<void> =
    this._onCanWriteChanged.event;

  private readonly _onSentAllEvents: event.Emitter<void> = this._register(
    new event.Emitter<void>()
  );

  private readonly onSentAllEvents: event.Event<void> =
    this._onSentAllEvents.event;

  private readonly throttledFlushUpdatesToMatrix: _.DebouncedFunc<
    () => Promise<void>
  >;

  private readonly opts: typeof DEFAULT_OPTIONS;

  constructor(
    private readonly matrixClient: MatrixClient,
    private readonly translator: MatrixCRDTEventTranslator,
    opts: ThrottledMatrixWriterOptions = {}
  ) {
    super();
    this.opts = { ...DEFAULT_OPTIONS, ...opts };
    this.throttledFlushUpdatesToMatrix = _.throttle(
      this.flushUpdatesToMatrix,
      this.canWrite
        ? this.opts.flushInterval
        : this.opts.retryIfForbiddenInterval
    );
  }

  private setCanWrite(value: boolean) {
    if (this._canWrite !== value) {
      this._canWrite = value;
      this._onCanWriteChanged.fire();
    }
  }

  private flushUpdatesToMatrix = async () => {
    if (this.isSendingUpdates || !this.pendingUpdates.length) {
      return;
    }

    if (!this.roomId) {
      // we're still initializing. We'll flush updates again once we're initialized
      return;
    }
    this.isSendingUpdates = true;
    const merged = Y.mergeUpdates(this.pendingUpdates);
    this.pendingUpdates = [];

    let retryImmediately = false;
    try {
      console.log("Sending updates");
      await this.translator.sendUpdate(this.matrixClient, this.roomId, merged);
      this.setCanWrite(true);
      console.log("sent updates");
    } catch (e: any) {
      if (e.errcode === "M_FORBIDDEN") {
        console.warn("not allowed to edit document", e);
        this.setCanWrite(false);

        try {
          // make sure we're in the room, so we can send updates
          // guests can't / won't join, so MatrixProvider won't send updates for this room
          await this.matrixClient.joinRoom(this.roomId);
          console.log("joined room", this.roomId);
          retryImmediately = true;
        } catch (e) {
          console.warn("failed to join room", e);
        }
      } else {
        console.error("error sending updates", e);
      }
      this.pendingUpdates.unshift(merged);
    } finally {
      this.isSendingUpdates = false;
    }

    if (this.pendingUpdates.length) {
      // if new events have been added in the meantime (or we need to retry)
      this.retryTimeoutHandler = setTimeout(
        () => {
          this.throttledFlushUpdatesToMatrix();
        },
        retryImmediately
          ? 0
          : this.canWrite
          ? this.opts.flushInterval
          : this.opts.retryIfForbiddenInterval
      );
    } else {
      console.log("_onSentAllEvents");
      this._onSentAllEvents.fire();
    }
  };

  public async initialize(roomId: string) {
    this.roomId = roomId;
    this.throttledFlushUpdatesToMatrix();
  }

  public get canWrite() {
    return this._canWrite;
  }

  public writeUpdate(update: Uint8Array) {
    this.pendingUpdates.push(update);
    this.throttledFlushUpdatesToMatrix();
  }

  // Helper method that's mainly used in unit tests
  public async waitForFlush() {
    if (!this.pendingUpdates.length && !this.isSendingUpdates) {
      return;
    }
    await event.Event.toPromise(this.onSentAllEvents);
  }

  public dispose() {
    super.dispose();
    clearTimeout(this.retryTimeoutHandler);
    this.throttledFlushUpdatesToMatrix.cancel();
  }
}
